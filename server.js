const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");

// ── Holidays persistence ────────────────────────────────────────────────────
const HOLIDAYS_FILE_PATH = path.join(__dirname, "data", "holidays.json");

function loadHolidaysFromDisk() {
  try {
    if (fs.existsSync(HOLIDAYS_FILE_PATH)) {
      const raw    = fs.readFileSync(HOLIDAYS_FILE_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Backward compat: old format was ["YYYY-MM-DD"], new is [{date,name}]
      return parsed.map((item) =>
        typeof item === "string"
          ? { date: item, name: "" }
          : { date: String(item.date || ""), name: String(item.name || "") }
      ).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date));
    }
  } catch { /* ignore corrupt file */ }
  return [];
}

function saveHolidaysToDisk(list) {
  fs.writeFileSync(HOLIDAYS_FILE_PATH, JSON.stringify(list, null, 2), "utf8");
}

// In-memory holidays list — array of {date:"YYYY-MM-DD", name:"string"}
let holidaysList = loadHolidaysFromDisk();
// ────────────────────────────────────────────────────────────────────────────

const { getDb } = require("./backend/db");
const { migrateRawDataIfNeeded } = require("./backend/rawDataMigration");
const { createOp72Database, getOp72Db, OP72_WORKBOOK_CODE } = require("./backend/op72Db");
const {
  appendDataRows,
  batchUpdateDataRowsById,
  cleanupEmptyDataRows,
  deleteDataRowsByIndices,
  getDataRowsByIds,
  WORKBOOK_CODE,
  getWorkbookByCode,
  getWorkbookRows,
  getWorkbookRowsWithMeta,
  replaceDataRows,
  searchRawDataByEmployeeAndMonth,
  updateWorkbookMaxColumns,
} = require("./backend/rawDataRepository");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const allowedOrigins = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:3000",
]);

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const RAW_DATA_SEARCH_COLUMNS = [
  "dateEntry",
  "employee1",
  "employee2",
  "dutyType",
  "ot",
  "mileage",
  "outwardDuty",
  "outwardCommenced",
  "outwardTerminated",
  "inwardDuty",
  "inwardCommenced",
  "inwardTerminated",
  "remarks",
];
const EMPLOYEE_MASTER_JSON_PATH = path.join(__dirname, "Employee_Master.json");

let employeeNameCache = null;
const AUTH_COOKIE_NAME = "OvertimeSession";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();
const PERMISSIONS = Object.freeze([
  "dataEntry",
  "rawDataSearch",
  "rawDataEdit",
  "general164",
  "loco18",
  "employeeMaster",
  "op72RawData",
  "op72",
  "amountSummary",
  "groupMaster",
  "holidays",
  "userManagement",
]);
const FULL_ADMIN_PERMISSIONS = Object.freeze([...PERMISSIONS]);
const ADMIN_ACCOUNTS = Object.freeze([
  { userId: "Vicky Ch", password: "Suit@1002", role: "admin", permissions: FULL_ADMIN_PERMISSIONS },
  {
    userId: "Vicky Raja",
    password: "Suit@1002",
    role: "restricted-admin",
    permissions: ["dataEntry", "rawDataSearch", "rawDataEdit", "general164", "loco18", "employeeMaster"],
  },
]);

function getCookieValue(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  const match = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function publicUser(user) {
  return { userId: user.userId, role: user.role, permissions: [...user.permissions] };
}

function findEmployeeAccount(userId, password) {
  const normalizedId = normalizeText(userId).toLowerCase();
  const normalizedPassword = normalizeText(password);
  const sourceText = fs.readFileSync(EMPLOYEE_MASTER_JSON_PATH, "utf8");
  const parsed = JSON.parse(sourceText);
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const headerRows = Number(parsed?.headerRows || 4);

  for (const row of rows.slice(headerRows)) {
    if (!Array.isArray(row)) continue;
    const employeeId = normalizeText(row[1]);
    const employeePassword = normalizeText(row[0]);
    if (employeeId.toLowerCase() === normalizedId && employeePassword === normalizedPassword) {
      return { userId: employeeId, password: employeePassword, role: "employee", permissions: [] };
    }
  }

  return null;
}

function authenticateAccount(userId, password) {
  const normalizedId = normalizeText(userId).toLowerCase();
  const normalizedPassword = normalizeText(password);
  const admin = ADMIN_ACCOUNTS.find(
    (account) => account.userId.toLowerCase() === normalizedId && account.password === normalizedPassword
  );
  return admin || findEmployeeAccount(userId, password);
}

function currentSession(req) {
  const token = getCookieValue(req, AUTH_COOKIE_NAME);
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function permissionForRequest(req) {
  const url = String(req.originalUrl || req.path).split("?")[0];
  if (url.startsWith("/api/auth/")) return null;
  if (url.startsWith("/api/holidays")) return "holidays";
  if (url.startsWith("/api/op72/")) return "op72RawData";
  if (url === "/api/raw-data/search") return "rawDataSearch";
  if (url === "/api/raw-data/search-updates") return "rawDataEdit";
  if (url === "/api/raw-data/workbook") return ["rawDataSearch", "rawDataEdit", "general164"];
  if (url === "/api/raw-data/data-row") return ["dataEntry", "rawDataEdit"];
  if (url === "/api/raw-data/data-rows" && req.method === "POST") return ["dataEntry", "rawDataEdit"];
  if (url === "/api/raw-data/data-rows") return "rawDataEdit";
  if (url === "/api/raw-data/cleanup-empty-rows") return "rawDataEdit";
  return null;
}

function requireApiPermission(req, res, next) {
  const required = permissionForRequest(req);
  if (!required) return next();

  const session = currentSession(req);
  if (!session) return res.status(401).json({ message: "Authentication required." });
  const requiredPermissions = Array.isArray(required) ? required : [required];
  if (!requiredPermissions.some((permission) => session.permissions.includes(permission))) {
    return res.status(403).json({ message: "You do not have permission for this operation." });
  }
  req.authUser = session;
  return next();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function toUpper(value) {
  return normalizeText(value).toUpperCase();
}

function parseDateValue(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const dmyShort = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (dmyShort) {
    const day = Number(dmyShort[1]);
    const monthIndex = MONTHS.indexOf(dmyShort[2].toUpperCase());
    const year = 2000 + Number(dmyShort[3]);
    if (day >= 1 && day <= 31 && monthIndex >= 0) {
      const parsed = new Date(year, monthIndex, day);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  const dmyLong = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmyLong) {
    const parsed = new Date(Number(dmyLong[3]), Number(dmyLong[2]) - 1, Number(dmyLong[1]));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

function isValidMonthLabel(value) {
  return MONTHS.includes(toUpper(value));
}

function isValidClockTime(value) {
  const text = normalizeText(value);
  if (!text) {
    return true;
  }
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return false;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function isValidDurationLike(value) {
  const text = normalizeText(value);
  if (!text) {
    return true;
  }

  const hhmm = text.match(/^(\d+):(\d{2})$/);
  if (hhmm) {
    return Number(hhmm[2]) >= 0 && Number(hhmm[2]) <= 59;
  }

  const asNumber = Number(text);
  return Number.isFinite(asNumber) && asNumber >= 0;
}

function isValidNumeric(value) {
  const text = normalizeText(value);
  if (!text) {
    return true;
  }
  const asNumber = Number(text);
  return Number.isFinite(asNumber);
}

function getEmployeeNameSet() {
  if (employeeNameCache) {
    return employeeNameCache;
  }

  const sourceText = fs.readFileSync(EMPLOYEE_MASTER_JSON_PATH, "utf8");
  const parsed = JSON.parse(sourceText);
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const headerRows = Number(parsed?.headerRows || 4);
  const names = new Set();

  rows.slice(headerRows).forEach((row) => {
    const employeeName = normalizeText(Array.isArray(row) ? row[1] : "");
    if (employeeName) {
      names.add(employeeName.toUpperCase());
    }
  });

  employeeNameCache = names;
  return names;
}

function rowValuesToSearchRecord(id, rowIndex, rowValues) {
  const values = Array.isArray(rowValues) ? rowValues : [];
  return {
    id: Number(id),
    rowRef: Number(rowIndex) + 1,
    rowIndex: Number(rowIndex),
    dateEntry: normalizeText(values[0]),
    employee1: normalizeText(values[1]),
    employee2: normalizeText(values[2]),
    dutyType: normalizeText(values[3]),
    ot: normalizeText(values[4]),
    mileage: normalizeText(values[5]),
    outwardDuty: normalizeText(values[6]),
    outwardCommenced: normalizeText(values[7]),
    outwardTerminated: normalizeText(values[8]),
    inwardDuty: normalizeText(values[9]),
    inwardCommenced: normalizeText(values[10]),
    inwardTerminated: normalizeText(values[11]),
    remarks: normalizeText(values[12]),
  };
}

function searchRecordToRowValues(record) {
  return RAW_DATA_SEARCH_COLUMNS.map((key) => {
    if (key === "remarks") {
      return "M";
    }
    return normalizeText(record?.[key]);
  });
}

function validateSearchRecord(record, employeeNameSet) {
  const dateEntry = normalizeText(record?.dateEntry);
  if (!parseDateValue(dateEntry)) {
    return "Date Entry must be a valid date.";
  }

  const employee1 = toUpper(record?.employee1);
  const employee2 = toUpper(record?.employee2);
  if (employee1 && !employeeNameSet.has(employee1)) {
    return "Employee 1 must be a valid employee name.";
  }
  if (employee2 && !employeeNameSet.has(employee2)) {
    return "Employee 2 must be a valid employee name.";
  }

  if (!isValidDurationLike(record?.ot)) {
    return "OT must be a valid duration (e.g. 5:30, 27:15, or numeric).";
  }
  if (!isValidNumeric(record?.mileage)) {
    return "Mileage must be numeric.";
  }

  if (!isValidClockTime(record?.outwardCommenced)) {
    return "Outward Commenced must be a valid time (HH:MM).";
  }
  if (!isValidClockTime(record?.outwardTerminated)) {
    return "Outward Terminated must be a valid time (HH:MM).";
  }
  if (!isValidClockTime(record?.inwardCommenced)) {
    return "Inward Commenced must be a valid time (HH:MM).";
  }
  if (!isValidClockTime(record?.inwardTerminated)) {
    return "Inward Terminated must be a valid time (HH:MM).";
  }

  return "";
}

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Vary", "Origin");
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Accept");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});
app.post("/api/auth/login", (req, res) => {
  const user = authenticateAccount(req.body?.userId, req.body?.password);
  if (!user) {
    return res.status(401).json({ message: "Invalid user or password." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    userId: user.userId,
    role: user.role,
    permissions: [...user.permissions],
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; Path=/; HttpOnly; SameSite=Lax`
  );
  return res.json({ user: publicUser(user) });
});

app.get("/api/auth/session", (req, res) => {
  const session = currentSession(req);
  if (!session) return res.status(401).json({ message: "Not authenticated." });
  return res.json({ user: publicUser(session) });
});

app.post("/api/auth/logout", (req, res) => {
  const token = getCookieValue(req, AUTH_COOKIE_NAME);
  sessions.delete(token);
  res.setHeader("Set-Cookie", `${AUTH_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
  return res.status(204).end();
});

app.use("/api", requireApiPermission);
app.use(express.static(path.join(__dirname)));

app.get("/api/raw-data/workbook", async (req, res) => {
  try {
    const db = await getDb();
    const workbook = await getWorkbookByCode(db, WORKBOOK_CODE);

    if (!workbook) {
      return res.status(404).json({ message: "RawData workbook not found." });
    }

    await db.exec("BEGIN TRANSACTION");
    try {
      await cleanupEmptyDataRows(db, workbook.id);
      await db.exec("COMMIT");
    } catch (innerError) {
      await db.exec("ROLLBACK");
      throw innerError;
    }

    const rowMeta = await getWorkbookRowsWithMeta(db, workbook.id);
    const rows = rowMeta.map((row) => row.rowValues);
    return res.json({
      sheetName: workbook.sheetName,
      maxColumns: workbook.maxColumns,
      headerRows: workbook.headerRowCount,
      rows,
      rowMeta: rowMeta.map((row) => ({
        rowId: row.rowId,
        rowIndex: row.rowIndex,
        rowKind: row.rowKind,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load RawData workbook.", detail: error.message });
  }
});

app.put("/api/raw-data/data-rows", async (req, res) => {
  const submittedRows = req.body?.rows;
  if (!Array.isArray(submittedRows)) {
    return res.status(400).json({ message: "rows array is required." });
  }

  try {
    const db = await getDb();
    const workbook = await getWorkbookByCode(db, WORKBOOK_CODE);

    if (!workbook) {
      return res.status(404).json({ message: "RawData workbook not found." });
    }

    await db.exec("BEGIN TRANSACTION");
    try {
      const savedRowCount = await replaceDataRows(db, workbook.id, workbook.headerRowCount, submittedRows);
      const maxColumns = Math.max(
        workbook.maxColumns,
        ...submittedRows.map((row) => (Array.isArray(row) ? row.length : 0))
      );
      await updateWorkbookMaxColumns(db, workbook.id, Math.max(1, maxColumns));
      await db.exec("COMMIT");
      return res.json({ message: "RawData rows saved.", savedRowCount });
    } catch (innerError) {
      await db.exec("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    return res.status(500).json({ message: "Failed to save RawData rows.", detail: error.message });
  }
});

app.post("/api/raw-data/data-rows", async (req, res) => {
  const submittedRows = req.body?.rows;
  if (!Array.isArray(submittedRows) || !submittedRows.length) {
    return res.status(400).json({ message: "rows array is required." });
  }

  try {
    const db = await getDb();
    const workbook = await getWorkbookByCode(db, WORKBOOK_CODE);

    if (!workbook) {
      return res.status(404).json({ message: "RawData workbook not found." });
    }

    const op72Db = await getOp72Db();
    const op72Workbook = await getWorkbookByCode(op72Db, OP72_WORKBOOK_CODE);
    if (!op72Workbook) {
      return res.status(500).json({ message: "OP72 Raw Data workbook not found." });
    }

    await db.exec("BEGIN TRANSACTION");
    await op72Db.exec("BEGIN TRANSACTION");
    try {
      const appendResult = await appendDataRows(db, workbook.id, workbook.headerRowCount, submittedRows);
      await appendDataRows(op72Db, op72Workbook.id, op72Workbook.headerRowCount, submittedRows);
      const maxColumns = Math.max(
        workbook.maxColumns,
        ...submittedRows.map((row) => (Array.isArray(row) ? row.length : 0))
      );
      await updateWorkbookMaxColumns(db, workbook.id, Math.max(1, maxColumns));
      const op72MaxColumns = Math.max(
        op72Workbook.maxColumns,
        ...submittedRows.map((row) => (Array.isArray(row) ? row.length : 0))
      );
      await updateWorkbookMaxColumns(op72Db, op72Workbook.id, Math.max(1, op72MaxColumns));
      await db.exec("COMMIT");
      await op72Db.exec("COMMIT");
      return res.status(201).json({ message: "RawData rows appended.", savedRowCount: appendResult.savedRowCount });
    } catch (innerError) {
      await op72Db.exec("ROLLBACK");
      await db.exec("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    return res.status(500).json({ message: "Failed to append RawData rows.", detail: error.message });
  }
});

app.post("/api/raw-data/data-row", async (req, res) => {
  const submittedRow = req.body?.row;
  if (!Array.isArray(submittedRow)) {
    return res.status(400).json({ message: "row array is required." });
  }

  try {
    const db = await getDb();
    const workbook = await getWorkbookByCode(db, WORKBOOK_CODE);

    if (!workbook) {
      return res.status(404).json({ message: "RawData workbook not found." });
    }

    const op72Db = await getOp72Db();
    const op72Workbook = await getWorkbookByCode(op72Db, OP72_WORKBOOK_CODE);
    if (!op72Workbook) {
      return res.status(500).json({ message: "OP72 Raw Data workbook not found." });
    }

    await db.exec("BEGIN TRANSACTION");
    await op72Db.exec("BEGIN TRANSACTION");
    try {
      const appendResult = await appendDataRows(db, workbook.id, workbook.headerRowCount, [submittedRow]);
      await cleanupEmptyDataRows(db, workbook.id);
      await appendDataRows(op72Db, op72Workbook.id, op72Workbook.headerRowCount, [submittedRow]);
      await cleanupEmptyDataRows(op72Db, op72Workbook.id);

      const maxColumns = Math.max(workbook.maxColumns, submittedRow.length || 0);
      await updateWorkbookMaxColumns(db, workbook.id, Math.max(1, maxColumns));
      await updateWorkbookMaxColumns(
        op72Db,
        op72Workbook.id,
        Math.max(op72Workbook.maxColumns, submittedRow.length || 0)
      );
      await op72Db.exec("COMMIT");
      await db.exec("COMMIT");

      return res.status(201).json({
        message: "RawData record added.",
        savedRowCount: appendResult.savedRowCount,
      });
    } catch (innerError) {
      await op72Db.exec("ROLLBACK");
      await db.exec("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    return res.status(500).json({ message: "Failed to add RawData record.", detail: error.message });
  }
});

app.get("/api/op72/workbook", async (req, res) => {
  try {
    const db = await getOp72Db();
    const workbook = await getWorkbookByCode(db, OP72_WORKBOOK_CODE);
    if (!workbook) {
      return res.status(404).json({ message: "OP72 Raw Data workbook not found." });
    }

    const rows = await getWorkbookRows(db, workbook.id);
    const rowMeta = await getWorkbookRowsWithMeta(db, workbook.id);
    return res.json({ workbook, rows, rowMeta });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load OP72 Raw Data workbook.", detail: error.message });
  }
});

app.put("/api/op72/data-rows", async (req, res) => {
  const submittedRows = req.body?.rows;
  if (!Array.isArray(submittedRows)) {
    return res.status(400).json({ message: "rows array is required." });
  }

  try {
    const db = await getOp72Db();
    const workbook = await getWorkbookByCode(db, OP72_WORKBOOK_CODE);
    if (!workbook) {
      return res.status(404).json({ message: "OP72 Raw Data workbook not found." });
    }

    await db.exec("BEGIN TRANSACTION");
    try {
      const savedRowCount = await replaceDataRows(db, workbook.id, workbook.headerRowCount, submittedRows);
      const maxColumns = Math.max(
        workbook.maxColumns,
        ...submittedRows.map((row) => (Array.isArray(row) ? row.length : 0))
      );
      await updateWorkbookMaxColumns(db, workbook.id, Math.max(1, maxColumns));
      await db.exec("COMMIT");
      return res.json({ message: "OP72 Raw Data rows saved.", savedRowCount });
    } catch (innerError) {
      await db.exec("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    return res.status(500).json({ message: "Failed to save OP72 Raw Data rows.", detail: error.message });
  }
});

app.post("/api/op72/data-row", async (req, res) => {
  const submittedRow = req.body?.row;
  if (!Array.isArray(submittedRow)) {
    return res.status(400).json({ message: "row array is required." });
  }

  try {
    const db = await getOp72Db();
    const workbook = await getWorkbookByCode(db, OP72_WORKBOOK_CODE);
    if (!workbook) {
      return res.status(404).json({ message: "OP72 Raw Data workbook not found." });
    }

    await db.exec("BEGIN TRANSACTION");
    try {
      const appendResult = await appendDataRows(db, workbook.id, workbook.headerRowCount, [submittedRow]);
      await cleanupEmptyDataRows(db, workbook.id);
      await updateWorkbookMaxColumns(db, workbook.id, Math.max(workbook.maxColumns, submittedRow.length || 0));
      await db.exec("COMMIT");
      return res.status(201).json({ message: "OP72 Raw Data record added.", savedRowCount: appendResult.savedRowCount });
    } catch (innerError) {
      await db.exec("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    return res.status(500).json({ message: "Failed to add OP72 Raw Data record.", detail: error.message });
  }
});

app.delete("/api/op72/data-rows", async (req, res) => {
  const rowIndices = Array.isArray(req.body?.rowIndices) ? req.body.rowIndices : [];
  const uniqueIndices = Array.from(new Set(rowIndices.map((value) => Number(value)).filter(Number.isInteger)));
  if (!uniqueIndices.length) {
    return res.status(400).json({ message: "rowIndices array is required." });
  }

  try {
    const db = await getOp72Db();
    const workbook = await getWorkbookByCode(db, OP72_WORKBOOK_CODE);
    if (!workbook) {
      return res.status(404).json({ message: "OP72 Raw Data workbook not found." });
    }
    if (uniqueIndices.some((rowIndex) => rowIndex < workbook.headerRowCount)) {
      return res.status(400).json({ message: "Header rows are protected and cannot be deleted." });
    }

    await db.exec("BEGIN TRANSACTION");
    try {
      const deletedCount = await deleteDataRowsByIndices(db, workbook.id, uniqueIndices);
      await db.exec("COMMIT");
      return res.json({ message: "OP72 Raw Data records deleted.", deletedCount });
    } catch (innerError) {
      await db.exec("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete OP72 Raw Data records.", detail: error.message });
  }
});

app.post("/api/op72/cleanup-empty-rows", async (req, res) => {
  try {
    const db = await getOp72Db();
    const workbook = await getWorkbookByCode(db, OP72_WORKBOOK_CODE);
    if (!workbook) {
      return res.status(404).json({ message: "OP72 Raw Data workbook not found." });
    }

    await db.exec("BEGIN TRANSACTION");
    try {
      const cleanedEmptyCount = await cleanupEmptyDataRows(db, workbook.id);
      await db.exec("COMMIT");
      return res.json({ message: "Empty OP72 Raw Data rows cleaned.", cleanedEmptyCount });
    } catch (innerError) {
      await db.exec("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    return res.status(500).json({ message: "Failed to cleanup OP72 Raw Data rows.", detail: error.message });
  }
});

app.delete("/api/raw-data/data-rows", async (req, res) => {
  const submittedRowIndices = req.body?.rowIndices;
  if (!Array.isArray(submittedRowIndices) || !submittedRowIndices.length) {
    return res.status(400).json({ message: "rowIndices array is required." });
  }

  const uniqueIndices = Array.from(
    new Set(submittedRowIndices.map((value) => Number(value)).filter((value) => Number.isInteger(value)))
  );

  if (!uniqueIndices.length) {
    return res.status(400).json({ message: "rowIndices must contain at least one integer index." });
  }

  try {
    const db = await getDb();
    const workbook = await getWorkbookByCode(db, WORKBOOK_CODE);

    if (!workbook) {
      return res.status(404).json({ message: "RawData workbook not found." });
    }

    const protectedHeaderTouched = uniqueIndices.some((rowIndex) => rowIndex < workbook.headerRowCount);
    if (protectedHeaderTouched) {
      return res.status(400).json({ message: "Header rows are protected and cannot be deleted." });
    }

    await db.exec("BEGIN TRANSACTION");
    try {
      const deletedCount = await deleteDataRowsByIndices(db, workbook.id, uniqueIndices);
      const cleanedEmptyCount = await cleanupEmptyDataRows(db, workbook.id);
      await db.exec("COMMIT");
      return res.json({
        message: "RawData records deleted.",
        deletedCount,
        cleanedEmptyCount,
      });
    } catch (innerError) {
      await db.exec("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete RawData records.", detail: error.message });
  }
});

app.post("/api/raw-data/cleanup-empty-rows", async (req, res) => {
  try {
    const db = await getDb();
    const workbook = await getWorkbookByCode(db, WORKBOOK_CODE);

    if (!workbook) {
      return res.status(404).json({ message: "RawData workbook not found." });
    }

    await db.exec("BEGIN TRANSACTION");
    try {
      const cleanedEmptyCount = await cleanupEmptyDataRows(db, workbook.id);
      await db.exec("COMMIT");
      return res.json({
        message: "Empty RawData rows cleaned.",
        cleanedEmptyCount,
      });
    } catch (innerError) {
      await db.exec("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    return res.status(500).json({ message: "Failed to cleanup empty rows.", detail: error.message });
  }
});

app.get("/api/raw-data/search", async (req, res) => {
  const employee = normalizeText(req.query?.employee);
  const month = toUpper(req.query?.month);
  const year = Number(req.query?.year);

  if (!employee) {
    return res.status(400).json({ message: "employee is required." });
  }
  if (!isValidMonthLabel(month)) {
    return res.status(400).json({ message: "month is required and must be JAN-DEC." });
  }
  if (!Number.isInteger(year) || year <= 0) {
    return res.status(400).json({ message: "year is required and must be a valid integer." });
  }

  try {
    const db = await getDb();
    const workbook = await getWorkbookByCode(db, WORKBOOK_CODE);

    if (!workbook) {
      return res.status(404).json({ message: "RawData workbook not found." });
    }

    const matches = await searchRawDataByEmployeeAndMonth(db, workbook.id, employee, month, year);
    const records = matches.map((row) => rowValuesToSearchRecord(row.id, row.rowIndex, row.rowValues));
    return res.json({
      employee,
      month,
      year,
      count: records.length,
      records,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to run raw data search.", detail: error.message });
  }
});

app.put("/api/raw-data/search-updates", async (req, res) => {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  if (!updates.length) {
    return res.status(400).json({ message: "updates array is required." });
  }

  const updateIds = updates.map((item) => Number(item?.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (updateIds.length !== updates.length) {
    return res.status(400).json({ message: "Each update must include a valid integer id." });
  }

  if (new Set(updateIds).size !== updateIds.length) {
    return res.status(400).json({ message: "Duplicate ids are not allowed in one save batch." });
  }

  try {
    const db = await getDb();
    const workbook = await getWorkbookByCode(db, WORKBOOK_CODE);

    if (!workbook) {
      return res.status(404).json({ message: "RawData workbook not found." });
    }

    const existingRows = await getDataRowsByIds(db, workbook.id, updateIds);
    if (existingRows.length !== updateIds.length) {
      return res.status(404).json({ message: "One or more records no longer exist." });
    }

    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const employeeNameSet = getEmployeeNameSet();

    const preparedUpdates = updates.map((item) => {
      const id = Number(item.id);
      const existing = existingById.get(id);
      const mergedRecord = {
        ...rowValuesToSearchRecord(id, existing.rowIndex, existing.rowValues),
      };

      for (const key of RAW_DATA_SEARCH_COLUMNS) {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
          mergedRecord[key] = normalizeText(item[key]);
        }
      }

      mergedRecord.remarks = "M";

      const validationError = validateSearchRecord(mergedRecord, employeeNameSet);
      if (validationError) {
        throw new Error(`Record ${mergedRecord.rowRef}: ${validationError}`);
      }

      return {
        id,
        rowValues: searchRecordToRowValues(mergedRecord),
      };
    });

    await db.exec("BEGIN TRANSACTION");
    try {
      const savedCount = await batchUpdateDataRowsById(db, workbook.id, preparedUpdates);
      await db.exec("COMMIT");
      return res.json({
        message: "Raw Data Search updates saved.",
        savedCount,
      });
    } catch (innerError) {
      await db.exec("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    return res.status(400).json({ message: "Failed to save Raw Data Search changes.", detail: error.message });
  }
});

app.get("/api/op72/search", async (req, res) => {
  const employee = normalizeText(req.query?.employee);
  const month = toUpper(req.query?.month);
  const year = Number(req.query?.year);

  if (!employee) {
    return res.status(400).json({ message: "employee is required." });
  }
  if (!isValidMonthLabel(month)) {
    return res.status(400).json({ message: "month is required and must be JAN-DEC." });
  }
  if (!Number.isInteger(year) || year <= 0) {
    return res.status(400).json({ message: "year is required and must be a valid integer." });
  }

  try {
    const db = await getOp72Db();
    const workbook = await getWorkbookByCode(db, OP72_WORKBOOK_CODE);
    if (!workbook) {
      return res.status(404).json({ message: "OP72 Raw Data workbook not found." });
    }

    const matches = await searchRawDataByEmployeeAndMonth(db, workbook.id, employee, month, year);
    const records = matches.map((row) => rowValuesToSearchRecord(row.id, row.rowIndex, row.rowValues));
    return res.json({ employee, month, year, count: records.length, records });
  } catch (error) {
    return res.status(500).json({ message: "Failed to run OP72 Raw Data search.", detail: error.message });
  }
});

app.put("/api/op72/search-updates", async (req, res) => {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  if (!updates.length) {
    return res.status(400).json({ message: "updates array is required." });
  }

  const updateIds = updates.map((item) => Number(item?.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (updateIds.length !== updates.length || new Set(updateIds).size !== updateIds.length) {
    return res.status(400).json({ message: "Updates must contain unique valid integer ids." });
  }

  try {
    const db = await getOp72Db();
    const workbook = await getWorkbookByCode(db, OP72_WORKBOOK_CODE);
    if (!workbook) {
      return res.status(404).json({ message: "OP72 Raw Data workbook not found." });
    }

    const existingRows = await getDataRowsByIds(db, workbook.id, updateIds);
    if (existingRows.length !== updateIds.length) {
      return res.status(404).json({ message: "One or more OP72 records no longer exist." });
    }

    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const employeeNameSet = getEmployeeNameSet();
    const preparedUpdates = updates.map((item) => {
      const id = Number(item.id);
      const existing = existingById.get(id);
      const mergedRecord = { ...rowValuesToSearchRecord(id, existing.rowIndex, existing.rowValues) };

      for (const key of RAW_DATA_SEARCH_COLUMNS) {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
          mergedRecord[key] = normalizeText(item[key]);
        }
      }

      mergedRecord.remarks = "M";
      const validationError = validateSearchRecord(mergedRecord, employeeNameSet);
      if (validationError) {
        throw new Error(`Record ${mergedRecord.rowRef}: ${validationError}`);
      }

      return { id, rowValues: searchRecordToRowValues(mergedRecord) };
    });

    await db.exec("BEGIN TRANSACTION");
    try {
      const savedCount = await batchUpdateDataRowsById(db, workbook.id, preparedUpdates);
      await db.exec("COMMIT");
      return res.json({ message: "OP72 Raw Data Search updates saved.", savedCount });
    } catch (innerError) {
      await db.exec("ROLLBACK");
      throw innerError;
    }
  } catch (error) {
    return res.status(400).json({ message: "Failed to save OP72 Raw Data Search changes.", detail: error.message });
  }
});

// ── Holidays API ─────────────────────────────────────────────────────────────

// GET /api/holidays?month=YYYY-MM  — returns all holidays, optionally filtered by month
// Response: { holidays: [{date, name}, ...] }
app.get("/api/holidays", (req, res) => {
  const monthFilter = String(req.query?.month || "").trim();
  if (monthFilter && /^\d{4}-\d{2}$/.test(monthFilter)) {
    const filtered = holidaysList.filter((h) => h.date.startsWith(monthFilter));
    return res.json({ holidays: filtered });
  }
  return res.json({ holidays: holidaysList });
});

// POST /api/holidays — add one or more holiday dates with optional names
// body: { dates: ["YYYY-MM-DD", ...], names: {"YYYY-MM-DD": "Holiday Name", ...} }
app.post("/api/holidays", (req, res) => {
  const submitted = Array.isArray(req.body?.dates) ? req.body.dates : [];
  const names     = req.body?.names && typeof req.body.names === "object" ? req.body.names : {};

  const valid = submitted
    .map((d) => String(d).trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

  if (!valid.length) {
    return res.status(400).json({ message: "dates array with YYYY-MM-DD values is required." });
  }

  const added = [];
  valid.forEach((d) => {
    const existing = holidaysList.find((h) => h.date === d);
    const holName  = String(names[d] || "").trim();
    if (existing) {
      // Update name if provided
      if (holName) existing.name = holName;
    } else {
      holidaysList.push({ date: d, name: holName });
      added.push(d);
    }
  });
  holidaysList.sort((a, b) => a.date.localeCompare(b.date));
  saveHolidaysToDisk(holidaysList);
  return res.status(201).json({ message: `${added.length} holiday(s) added.`, added, total: holidaysList.length });
});

// DELETE /api/holidays — remove one or more holiday dates
// body: { dates: ["YYYY-MM-DD", ...] }
app.delete("/api/holidays", (req, res) => {
  const submitted = Array.isArray(req.body?.dates) ? req.body.dates : [];
  const toRemove  = new Set(
    submitted.map((d) => String(d).trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  );

  if (!toRemove.size) {
    return res.status(400).json({ message: "dates array with YYYY-MM-DD values is required." });
  }

  const before   = holidaysList.length;
  holidaysList   = holidaysList.filter((h) => !toRemove.has(h.date));
  saveHolidaysToDisk(holidaysList);
  return res.json({ message: `${before - holidaysList.length} holiday(s) removed.`, total: holidaysList.length });
});

// ─────────────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ message: "Not found." });
});

(async () => {
  try {
    const migrationResult = await migrateRawDataIfNeeded();
    await createOp72Database();
    console.log(
      `[raw-data] migration status: ${migrationResult.imported ? "imported" : "already-initialized"}, source rows=${migrationResult.rowCountInSource}`
    );
    app.listen(PORT, () => {
      console.log(`[server] MileageOverTimeRWPShed running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("[server] startup failed", error);
    process.exit(1);
  }
})();
