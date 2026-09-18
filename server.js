require("dotenv").config();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");

// ── Password Hashing Helpers ────────────────────────────────────────────────
function isBcryptHash(str) {
  return typeof str === "string" && (str.startsWith("$2a$") || str.startsWith("$2b$") || str.startsWith("$2y$"));
}

function verifyPassword(inputPassword, storedPassword) {
  if (!storedPassword || !inputPassword) return false;
  const cleanInput = String(inputPassword).trim();
  const cleanStored = String(storedPassword).trim();
  if (isBcryptHash(cleanStored)) {
    try {
      return bcrypt.compareSync(cleanInput, cleanStored);
    } catch {
      return false;
    }
  }
  return cleanInput === cleanStored;
}

function hashPassword(plainTextPassword) {
  return bcrypt.hashSync(String(plainTextPassword).trim(), 10);
}

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
const { getEmployeeDb } = require("./backend/employeeDb");
const { migrateEmployeeMasterIfNeeded } = require("./backend/employeeMigration");
const {
  getEmployeeMasterWorkbook,
  getAllPayRevisions,
  saveEmployeeAndRevision,
  deletePayRevision,
  replaceEmployeeMasterRows,
  getEmployeePostingStationStatus,
  updateEmployeePostingStation,
  resetPostingStationLock,
  getDesignationOperatingRates,
  saveDesignationOperatingRates,
} = require("./backend/employeeRepository");
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
const envOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:3000",
  ...envOrigins,
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
const USER_CREDENTIALS_JSON_PATH = path.join(__dirname, "backend", "user_credentials.json");

const PAGE_PERMISSION_MAP = Object.freeze({
  "index.html": ["dataEntry"],
  "employee-master.html": ["employeeMaster"],
  "genl-164.html": ["general164"],
  "loco-18.html": ["loco18"],
  "raw-data.html": ["rawDataSearch", "rawDataEdit"],
  "raw-data-search.html": ["rawDataSearch"],
  "op72-raw-data.html": ["op72RawData"],
  "op-72.html": ["op72"],
  "amount-summary.html": ["amountSummary"],
  "group-master.html": ["groupMaster"],
  "holidays.html": ["holidays"],
  "user-management.html": ["userManagement"],
  "employee-home.html": [],
  "video.html": [],
});

const ALL_APP_PAGES = Object.freeze([
  "index.html",
  "employee-master.html",
  "group-master.html",
  "holidays.html",
  "op-72.html",
  "op72-raw-data.html",
  "genl-164.html",
  "loco-18.html",
  "amount-summary.html",
  "raw-data.html",
  "raw-data-search.html",
  "employee-home.html",
  "video.html",
  "user-management.html"
]);

function readUserCredentials() {
  try {
    if (!fs.existsSync(USER_CREDENTIALS_JSON_PATH)) {
      const initial = {
        admins: {
          "vicky ch": { userId: "Vicky Ch", password: "Suit@1002", role: "admin", allowedPages: ["*"] },
          "vicky raja": {
            userId: "Vicky Raja",
            password: "Waqas@1002",
            role: "restricted-admin",
            allowedPages: ["index.html", "genl-164.html", "loco-18.html", "raw-data.html", "raw-data-search.html", "video.html"],
          },
          "ehtisham": {
            userId: "EHTISHAM",
            password: hashPassword("MKWSHED"),
            role: "sub-admin",
            allowedPages: ["index.html", "video.html"],
            permissions: ["dataEntry"],
          },
          "arsalan shah": {
            userId: "ARSALAN SHAH",
            password: hashPassword("LLMSHED"),
            role: "sub-admin",
            allowedPages: ["index.html", "video.html"],
            permissions: ["dataEntry"],
          },
        },
        employees: {},
      };
      fs.writeFileSync(USER_CREDENTIALS_JSON_PATH, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    const raw = fs.readFileSync(USER_CREDENTIALS_JSON_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.admins) parsed.admins = {};
    if (!parsed.employees) parsed.employees = {};
    if (!parsed.admins["vicky ch"]) {
      parsed.admins["vicky ch"] = { userId: "Vicky Ch", password: "Suit@1002", role: "admin", allowedPages: ["*"] };
    }
    if (!parsed.admins["vicky raja"]) {
      parsed.admins["vicky raja"] = {
        userId: "Vicky Raja",
        password: "Waqas@1002",
        role: "restricted-admin",
        allowedPages: ["index.html", "genl-164.html", "loco-18.html", "raw-data.html", "raw-data-search.html", "video.html"],
      };
    }
    if (!parsed.admins["ehtisham"]) {
      parsed.admins["ehtisham"] = {
        userId: "EHTISHAM",
        password: hashPassword("MKWSHED"),
        role: "sub-admin",
        allowedPages: ["index.html", "video.html"],
        permissions: ["dataEntry"],
      };
    }
    if (!parsed.admins["arsalan shah"]) {
      parsed.admins["arsalan shah"] = {
        userId: "ARSALAN SHAH",
        password: hashPassword("LLMSHED"),
        role: "sub-admin",
        allowedPages: ["index.html", "video.html"],
        permissions: ["dataEntry"],
      };
    }
    return parsed;
  } catch (err) {
    console.error("Failed to read user credentials:", err);
    return {
      admins: {
        "vicky ch": { userId: "Vicky Ch", password: "Suit@1002", role: "admin", allowedPages: ["*"] },
        "vicky raja": {
          userId: "Vicky Raja",
          password: "Waqas@1002",
          role: "restricted-admin",
          allowedPages: ["index.html", "genl-164.html", "loco-18.html", "raw-data.html", "raw-data-search.html", "video.html"],
        },
        "ehtisham": {
          userId: "EHTISHAM",
          password: hashPassword("MKWSHED"),
          role: "sub-admin",
          allowedPages: ["index.html", "video.html"],
          permissions: ["dataEntry"],
        },
        "arsalan shah": {
          userId: "ARSALAN SHAH",
          password: hashPassword("LLMSHED"),
          role: "sub-admin",
          allowedPages: ["index.html", "video.html"],
          permissions: ["dataEntry"],
        },
      },
      employees: {},
    };
  }
}

function saveUserCredentials(data) {
  try {
    fs.writeFileSync(USER_CREDENTIALS_JSON_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save user credentials:", err);
  }
}

function getAdminAccounts() {
  const creds = readUserCredentials();
  const accounts = [];

  for (const [key, admin] of Object.entries(creds.admins || {})) {
    if (!admin || typeof admin !== "object") continue;
    const userId = admin.userId || key;
    const role = admin.role || "sub-admin";
    let allowedPages = Array.isArray(admin.allowedPages) ? [...admin.allowedPages] : [];
    let permissions = Array.isArray(admin.permissions) ? [...admin.permissions] : [];

    if (role === "admin") {
      permissions = FULL_ADMIN_PERMISSIONS;
      allowedPages = allowedPages.length ? allowedPages : ["*"];
    } else if (role === "restricted-admin") {
      permissions = permissions.length
        ? permissions
        : ["dataEntry", "rawDataSearch", "rawDataEdit", "general164", "loco18"];
      allowedPages = allowedPages.length
        ? allowedPages
        : ["index.html", "genl-164.html", "loco-18.html", "raw-data.html", "raw-data-search.html", "video.html"];
    } else {
      // Sub-admin / Clerk
      allowedPages = allowedPages.length ? allowedPages : ["index.html", "video.html"];
      if (!permissions.length) {
        const perms = new Set();
        allowedPages.forEach((p) => {
          (PAGE_PERMISSION_MAP[p] || []).forEach((perm) => perms.add(perm));
        });
        permissions = Array.from(perms);
      }
    }

    accounts.push({
      userId,
      password: admin.password,
      role,
      permissions: [...permissions],
      allowedPages: [...allowedPages],
    });
  }

  return accounts;
}

function getCookieValue(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  const match = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function publicUser(user) {
  return {
    userId: user.userId,
    sapId: user.sapId || "",
    role: user.role,
    permissions: [...(user.permissions || [])],
    allowedPages: Array.isArray(user.allowedPages) ? [...user.allowedPages] : [],
  };
}

function findEmployeeAccount(userId, password) {
  const normalizedId = normalizeText(userId).toLowerCase();
  const normalizedPassword = normalizeText(password);
  const sourceText = fs.readFileSync(EMPLOYEE_MASTER_JSON_PATH, "utf8");
  const parsed = JSON.parse(sourceText);
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const headerRows = Number(parsed?.headerRows || 4);
  const creds = readUserCredentials();

  for (const row of rows.slice(headerRows)) {
    if (!Array.isArray(row)) continue;
    const sapId = normalizeText(row[0]);
    const employeeName = normalizeText(row[1]);
    if (!sapId || !employeeName) continue;

    if (employeeName.toLowerCase() === normalizedId || sapId.toLowerCase() === normalizedId) {
      const customCred = creds.employees[sapId] || creds.employees[employeeName.toLowerCase()];
      const storedPassword = customCred?.password ? String(customCred.password).trim() : sapId;

      if (verifyPassword(normalizedPassword, storedPassword)) {
        // If password was plaintext, automatically upgrade to bcrypt hash
        if (!isBcryptHash(storedPassword)) {
          creds.employees[sapId] = {
            sapId,
            name: employeeName,
            password: hashPassword(normalizedPassword),
            updatedAt: new Date().toISOString(),
          };
          saveUserCredentials(creds);
        }
        return { userId: employeeName, sapId, password: storedPassword, role: "employee", permissions: [] };
      }
    }
  }

  return null;
}

function authenticateAccount(userId, password) {
  const normalizedId = normalizeText(userId).toLowerCase();
  const normalizedPassword = normalizeText(password);
  const admins = getAdminAccounts();
  const admin = admins.find(
    (account) => account.userId.toLowerCase() === normalizedId && verifyPassword(normalizedPassword, account.password)
  );
  if (admin) {
    // If admin password was plaintext, upgrade to bcrypt hash in credentials file
    if (!isBcryptHash(admin.password)) {
      const creds = readUserCredentials();
      const adminKey = Object.keys(creds.admins).find((k) => k.toLowerCase() === normalizedId);
      if (adminKey && creds.admins[adminKey]) {
        creds.admins[adminKey].password = hashPassword(normalizedPassword);
        saveUserCredentials(creds);
      }
    }
    return admin;
  }
  return findEmployeeAccount(userId, password);
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
  if (url.startsWith("/api/chat")) return null;
  if (url === "/api/employee/posting-station") return null;
  if (url === "/api/admin/reset-posting-station-lock") return "employeeMaster";
  if (url === "/api/op72/search") return null;
  if (url.startsWith("/api/holidays")) return null;
  if (url.startsWith("/api/admin/users")) return "userManagement";
  if (url.startsWith("/api/op72/")) return "op72RawData";
  if (url.startsWith("/api/employee-master/")) {
    if (req.method === "GET") return null;
    return "employeeMaster";
  }
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

  const dmyShort = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (dmyShort) {
    const day = Number(dmyShort[1]);
    const monthIndex = MONTHS.indexOf(dmyShort[2].toUpperCase());
    const year = dmyShort[3].length === 2 ? 2000 + Number(dmyShort[3]) : Number(dmyShort[3]);
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

  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const parsed = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
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

const FULL_MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

function normalizeMonthTo3(value) {
  const v = toUpper(value);
  if (MONTHS.includes(v)) return v;
  const idx = FULL_MONTHS.indexOf(v);
  if (idx >= 0) return MONTHS[idx];
  const shortIdx = MONTHS.findIndex((m) => v.startsWith(m));
  if (shortIdx >= 0) return MONTHS[shortIdx];
  return "";
}

function isValidMonthLabel(value) {
  return Boolean(normalizeMonthTo3(value));
}

function isValidClockTime(value) {
  const text = normalizeText(value);
  if (!text) {
    return true;
  }
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return false;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] !== undefined ? Number(match[3]) : 0;
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59;
}

function normalizeClockTimeToHhMm(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const text = normalizeText(value);
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  return text;
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

function normalizeOtValueToHhMm(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const num = typeof value === "number" ? value : (typeof value === "string" && /^\d*\.\d+$/.test(value.trim()) ? parseFloat(value.trim()) : NaN);
  if (Number.isFinite(num) && num > 0 && num <= 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.abs(totalMinutes % 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  const text = normalizeText(value);
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  return text;
}

function normalizeDataRowValues(row) {
  if (!Array.isArray(row)) return row;
  const newRow = [...row];
  if (newRow.length > 4) {
    newRow[4] = normalizeOtValueToHhMm(newRow[4]);
  }
  return newRow;
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
    ot: normalizeOtValueToHhMm(values[4]),
    mileage: normalizeText(values[5]),
    outwardDuty: normalizeText(values[6]),
    outwardCommenced: normalizeClockTimeToHhMm(values[7]),
    outwardTerminated: normalizeClockTimeToHhMm(values[8]),
    inwardDuty: normalizeText(values[9]),
    inwardCommenced: normalizeClockTimeToHhMm(values[10]),
    inwardTerminated: normalizeClockTimeToHhMm(values[11]),
    remarks: normalizeText(values[12]),
  };
}

function searchRecordToRowValues(record) {
  return RAW_DATA_SEARCH_COLUMNS.map((key) => {
    if (key === "ot") {
      return normalizeOtValueToHhMm(record?.[key]);
    }
    if (["outwardCommenced", "outwardTerminated", "inwardCommenced", "inwardTerminated"].includes(key)) {
      return normalizeClockTimeToHhMm(record?.[key]);
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
  if (employee1 && !employeeNameSet.has(employee1)) {
    return "Employee 1 must be a valid employee name.";
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

app.use(express.json({ limit: "150mb" }));
app.use(express.urlencoded({ limit: "150mb", extended: true }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isLocal = origin && (
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:") ||
    allowedOrigins.has(origin)
  );

  if (origin && (isLocal || allowedOrigins.has(origin))) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Vary", "Origin");
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Accept,Authorization");

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
    sapId: user.sapId || "",
    role: user.role,
    permissions: [...user.permissions],
    allowedPages: Array.isArray(user.allowedPages) ? [...user.allowedPages] : [],
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  const isProd = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; Path=/; HttpOnly; SameSite=Lax${isProd ? "; Secure" : ""}`
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

app.post("/api/auth/change-password", (req, res) => {
  const session = currentSession(req);
  if (!session) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const currentPassword = String(req.body?.currentPassword || "").trim();
  const newPassword = String(req.body?.newPassword || "").trim();

  if (!currentPassword) {
    return res.status(400).json({ message: "Current password is required." });
  }
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ message: "New password must be at least 4 characters long." });
  }

  // Check if session user is admin or sub-admin
  if (session.role === "admin" || session.role === "restricted-admin" || session.role === "sub-admin") {
    const creds = readUserCredentials();
    const key = session.userId.toLowerCase();
    const admin = creds.admins[key];
    if (!admin || !verifyPassword(currentPassword, admin.password)) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }
    admin.password = hashPassword(newPassword);
    saveUserCredentials(creds);
    return res.json({ message: "Password changed successfully." });
  }

  // Session user is employee
  const sourceText = fs.readFileSync(EMPLOYEE_MASTER_JSON_PATH, "utf8");
  const parsed = JSON.parse(sourceText);
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const headerRows = Number(parsed?.headerRows || 4);
  const normalizedUser = session.userId.toLowerCase();
  const row = rows.slice(headerRows).find((r) => normalizeText(r?.[1]).toLowerCase() === normalizedUser);

  if (!row) {
    return res.status(404).json({ message: "Employee record not found." });
  }

  const sapId = normalizeText(row[0]);
  const employeeName = normalizeText(row[1]);
  const creds = readUserCredentials();
  const customCred = creds.employees[sapId];
  const effectivePassword = customCred?.password ? String(customCred.password).trim() : sapId;

  if (!verifyPassword(currentPassword, effectivePassword)) {
    return res.status(400).json({ message: "Current password is incorrect." });
  }

  creds.employees[sapId] = {
    sapId,
    name: employeeName,
    password: hashPassword(newPassword),
    updatedAt: new Date().toISOString(),
  };
  saveUserCredentials(creds);
  return res.json({ message: "Your password has been changed successfully." });
});

// ── Chat Messages Storage & Endpoints ─────────────────────────────────────────
const CHAT_STORAGE_PATH = path.join(__dirname, "backend", "chat_messages.json");

function readChatMessages() {
  try {
    if (!fs.existsSync(CHAT_STORAGE_PATH)) {
      const initial = [
        {
          id: "msg_welcome",
          sender: "Vicky Ch",
          senderRole: "admin",
          receiver: "ALL",
          text: "Welcome to Employee Portal! If you notice any overtime calculation discrepancy, wrong duty type, or leave error, please send a message here.",
          timestamp: new Date().toISOString(),
        }
      ];
      fs.writeFileSync(CHAT_STORAGE_PATH, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    const raw = fs.readFileSync(CHAT_STORAGE_PATH, "utf8");
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveChatMessages(messages) {
  try {
    fs.writeFileSync(CHAT_STORAGE_PATH, JSON.stringify(messages, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save chat messages:", err);
  }
}

app.get("/api/chat/messages", (req, res) => {
  const session = currentSession(req);
  if (!session) return res.status(401).json({ message: "Authentication required." });

  const all = readChatMessages();
  const employeeFilter = req.query.employee ? normalizeText(req.query.employee).toLowerCase() : "";

  if (session.role === "employee") {
    const empName = session.userId.toLowerCase();
    const userMsgs = all.filter((m) => 
      m.receiver === "ALL" || 
      String(m.sender || "").toLowerCase() === empName || 
      String(m.receiver || "").toLowerCase() === empName
    );
    return res.json({ messages: userMsgs });
  }

  // Admin view
  if (employeeFilter) {
    const threadMsgs = all.filter((m) => 
      m.receiver === "ALL" ||
      String(m.sender || "").toLowerCase() === employeeFilter || 
      String(m.receiver || "").toLowerCase() === employeeFilter
    );
    return res.json({ messages: threadMsgs });
  }

  return res.json({ messages: all });
});

app.post("/api/chat/messages", (req, res) => {
  const session = currentSession(req);
  if (!session) return res.status(401).json({ message: "Authentication required." });

  const text = normalizeText(req.body?.text);
  if (!text) return res.status(400).json({ message: "Message text is required." });

  const receiver = normalizeText(req.body?.receiver) || (session.role === "employee" ? "Vicky Ch" : "ALL");

  const newMsg = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sender: session.userId,
    senderRole: session.role,
    receiver: receiver,
    text: text,
    timestamp: new Date().toISOString(),
  };

  const all = readChatMessages();
  all.push(newMsg);
  saveChatMessages(all);

  return res.status(201).json({ message: newMsg });
});

app.use("/api", requireApiPermission);
app.use(express.static(path.join(__dirname)));

// Serve Trainz HTML page folder from sibling directory "TRS DEP PAK"
const trsDepPakPath = path.resolve(__dirname, "..", "TRS DEP PAK");
if (fs.existsSync(trsDepPakPath)) {
  app.use("/trs-dep-pak", express.static(trsDepPakPath, { index: ["Pak-Trainz.html", "index.html"] }));
}

// ── Admin User & Password Management Endpoints (Requires 'userManagement') ─────
app.get("/api/admin/users", (req, res) => {
  try {
    const creds = readUserCredentials();
    const admins = getAdminAccounts().map((a) => ({
      userId: a.userId,
      role: a.role,
      password: isBcryptHash(a.password) ? "[Encrypted]" : a.password,
      permissions: a.permissions,
      allowedPages: a.allowedPages,
    }));

    const sourceText = fs.readFileSync(EMPLOYEE_MASTER_JSON_PATH, "utf8");
    const parsed = JSON.parse(sourceText);
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    const headerRows = Number(parsed?.headerRows || 4);

    const employees = [];
    for (const row of rows.slice(headerRows)) {
      if (!Array.isArray(row)) continue;
      const sapId = normalizeText(row[0]);
      const name = normalizeText(row[1]);
      const designation = normalizeText(row[2]);
      if (!sapId || !name) continue;

      const customCred = creds.employees[sapId] || creds.employees[name.toLowerCase()];
      const isCustom = Boolean(customCred?.password);
      const rawPassword = isCustom ? String(customCred.password) : sapId;
      const password = isBcryptHash(rawPassword) ? "[Encrypted]" : rawPassword;

      employees.push({
        sapId,
        name,
        designation: designation || "Running Staff",
        password,
        isCustomPassword: isCustom,
      });
    }

    return res.json({ admins, employees });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch users.", detail: error.message });
  }
});

app.post("/api/admin/users", (req, res) => {
  try {
    const { userId, password, role, allowedPages } = req.body || {};
    const cleanUserId = normalizeText(userId);
    const cleanPassword = normalizeText(password);
    const cleanRole = normalizeText(role) || "sub-admin";

    if (!cleanUserId) {
      return res.status(400).json({ message: "User ID is required." });
    }
    if (!cleanPassword || cleanPassword.length < 4) {
      return res.status(400).json({ message: "Password must be at least 4 characters long." });
    }

    const creds = readUserCredentials();
    const key = cleanUserId.toLowerCase();

    if (creds.admins[key]) {
      return res.status(409).json({ message: `User '${cleanUserId}' already exists.` });
    }

    let pages = Array.isArray(allowedPages) && allowedPages.length > 0 ? allowedPages : ["index.html", "video.html"];
    if (cleanRole === "admin") {
      pages = ["*"];
    }

    const perms = new Set();
    pages.forEach((p) => {
      (PAGE_PERMISSION_MAP[p] || []).forEach((perm) => perms.add(perm));
    });
    if (cleanRole === "admin") {
      FULL_ADMIN_PERMISSIONS.forEach((p) => perms.add(p));
    }

    creds.admins[key] = {
      userId: cleanUserId,
      password: hashPassword(cleanPassword),
      role: cleanRole,
      allowedPages: pages,
      permissions: Array.from(perms),
      createdAt: new Date().toISOString(),
    };

    saveUserCredentials(creds);
    return res.status(201).json({
      message: `User '${cleanUserId}' created successfully.`,
      user: {
        userId: cleanUserId,
        role: cleanRole,
        allowedPages: pages,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create user.", detail: error.message });
  }
});

app.put("/api/admin/users/access", (req, res) => {
  try {
    const { userId, role, allowedPages } = req.body || {};
    const cleanUserId = normalizeText(userId);
    if (!cleanUserId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    const creds = readUserCredentials();
    const key = cleanUserId.toLowerCase();
    if (!creds.admins[key]) {
      return res.status(404).json({ message: `User '${cleanUserId}' not found.` });
    }

    if (key === "vicky ch") {
      return res.status(400).json({ message: "Main administrator permissions cannot be modified here." });
    }

    const cleanRole = normalizeText(role) || creds.admins[key].role || "sub-admin";
    let pages = Array.isArray(allowedPages) ? allowedPages : creds.admins[key].allowedPages || ["index.html", "video.html"];
    if (cleanRole === "admin") {
      pages = ["*"];
    }

    const perms = new Set();
    pages.forEach((p) => {
      (PAGE_PERMISSION_MAP[p] || []).forEach((perm) => perms.add(perm));
    });
    if (cleanRole === "admin") {
      FULL_ADMIN_PERMISSIONS.forEach((p) => perms.add(p));
    }

    creds.admins[key].role = cleanRole;
    creds.admins[key].allowedPages = pages;
    creds.admins[key].permissions = Array.from(perms);
    creds.admins[key].updatedAt = new Date().toISOString();

    saveUserCredentials(creds);
    return res.json({ message: `Access permissions for '${cleanUserId}' updated successfully.` });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update user access.", detail: error.message });
  }
});

app.delete("/api/admin/users/:userId", (req, res) => {
  try {
    const userId = normalizeText(req.params.userId);
    const key = userId.toLowerCase();
    if (key === "vicky ch" || key === "vicky raja") {
      return res.status(400).json({ message: `Cannot delete primary administrator '${userId}'.` });
    }

    const creds = readUserCredentials();
    if (!creds.admins[key]) {
      return res.status(404).json({ message: `User '${userId}' not found.` });
    }

    delete creds.admins[key];
    saveUserCredentials(creds);
    return res.json({ message: `User '${userId}' deleted successfully.` });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete user.", detail: error.message });
  }
});

app.put("/api/admin/users/password", (req, res) => {
  try {
    const { type, id, newPassword } = req.body || {};
    const cleanedPassword = String(newPassword || "").trim();
    if (!cleanedPassword) {
      return res.status(400).json({ message: "Password cannot be empty." });
    }

    const creds = readUserCredentials();

    if (type === "admin") {
      const key = normalizeText(id).toLowerCase();
      if (!creds.admins[key]) {
        return res.status(404).json({ message: `Admin user '${id}' not found.` });
      }
      creds.admins[key].password = hashPassword(cleanedPassword);
      saveUserCredentials(creds);
      return res.json({ message: `Password for admin '${creds.admins[key].userId}' updated successfully.` });
    }

    if (type === "employee") {
      const sapId = normalizeText(id);
      if (!sapId) {
        return res.status(400).json({ message: "Employee SAP ID is required." });
      }
      const sourceText = fs.readFileSync(EMPLOYEE_MASTER_JSON_PATH, "utf8");
      const parsed = JSON.parse(sourceText);
      const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
      const headerRows = Number(parsed?.headerRows || 4);
      const row = rows.slice(headerRows).find((r) => normalizeText(r?.[0]) === sapId);
      const employeeName = row ? normalizeText(row[1]) : "";

      creds.employees[sapId] = {
        sapId,
        name: employeeName,
        password: hashPassword(cleanedPassword),
        updatedAt: new Date().toISOString(),
      };
      saveUserCredentials(creds);
      return res.json({ message: `Password for employee '${employeeName || sapId}' updated successfully.` });
    }

    return res.status(400).json({ message: "Invalid user type. Must be 'admin' or 'employee'." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update password.", detail: error.message });
  }
});

app.post("/api/admin/users/reset-default", (req, res) => {
  try {
    const sapId = normalizeText(req.body?.sapId);
    if (!sapId) {
      return res.status(400).json({ message: "Employee SAP ID is required." });
    }

    const creds = readUserCredentials();
    delete creds.employees[sapId];
    saveUserCredentials(creds);

    return res.json({ message: `Password for employee SAP ID ${sapId} reset to default (SAP ID).` });
  } catch (error) {
    return res.status(500).json({ message: "Failed to reset password.", detail: error.message });
  }
});

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
  const normalizedRows = submittedRows.map(normalizeDataRowValues);

  try {
    const db = await getDb();
    const workbook = await getWorkbookByCode(db, WORKBOOK_CODE);

    if (!workbook) {
      return res.status(404).json({ message: "RawData workbook not found." });
    }

    await db.exec("BEGIN TRANSACTION");
    try {
      const savedRowCount = await replaceDataRows(db, workbook.id, workbook.headerRowCount, normalizedRows);
      const maxColumns = Math.max(
        workbook.maxColumns,
        ...normalizedRows.map((row) => (Array.isArray(row) ? row.length : 0))
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
  const normalizedRows = submittedRows.map(normalizeDataRowValues);

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
      const appendResult = await appendDataRows(db, workbook.id, workbook.headerRowCount, normalizedRows);
      await appendDataRows(op72Db, op72Workbook.id, op72Workbook.headerRowCount, normalizedRows);
      const maxColumns = Math.max(
        workbook.maxColumns,
        ...normalizedRows.map((row) => (Array.isArray(row) ? row.length : 0))
      );
      await updateWorkbookMaxColumns(db, workbook.id, Math.max(1, maxColumns));
      const op72MaxColumns = Math.max(
        op72Workbook.maxColumns,
        ...normalizedRows.map((row) => (Array.isArray(row) ? row.length : 0))
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
  const normalizedRow = normalizeDataRowValues(submittedRow);

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
      const appendResult = await appendDataRows(db, workbook.id, workbook.headerRowCount, [normalizedRow]);
      await cleanupEmptyDataRows(db, workbook.id);
      await appendDataRows(op72Db, op72Workbook.id, op72Workbook.headerRowCount, [normalizedRow]);
      await cleanupEmptyDataRows(op72Db, op72Workbook.id);

      const maxColumns = Math.max(workbook.maxColumns, normalizedRow.length || 0);
      await updateWorkbookMaxColumns(db, workbook.id, Math.max(1, maxColumns));
      await updateWorkbookMaxColumns(
        op72Db,
        op72Workbook.id,
        Math.max(op72Workbook.maxColumns, normalizedRow.length || 0)
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
  const normalizedRows = submittedRows.map(normalizeDataRowValues);

  try {
    const db = await getOp72Db();
    const workbook = await getWorkbookByCode(db, OP72_WORKBOOK_CODE);
    if (!workbook) {
      return res.status(404).json({ message: "OP72 Raw Data workbook not found." });
    }

    await db.exec("BEGIN TRANSACTION");
    try {
      const savedRowCount = await replaceDataRows(db, workbook.id, workbook.headerRowCount, normalizedRows);
      const maxColumns = Math.max(
        workbook.maxColumns,
        ...normalizedRows.map((row) => (Array.isArray(row) ? row.length : 0))
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
  const normalizedRow = normalizeDataRowValues(submittedRow);

  try {
    const db = await getOp72Db();
    const workbook = await getWorkbookByCode(db, OP72_WORKBOOK_CODE);
    if (!workbook) {
      return res.status(404).json({ message: "OP72 Raw Data workbook not found." });
    }

    await db.exec("BEGIN TRANSACTION");
    try {
      const appendResult = await appendDataRows(db, workbook.id, workbook.headerRowCount, [normalizedRow]);
      await cleanupEmptyDataRows(db, workbook.id);
      await updateWorkbookMaxColumns(db, workbook.id, Math.max(workbook.maxColumns, normalizedRow.length || 0));
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
  const month = normalizeMonthTo3(req.query?.month);
  const year = Number(req.query?.year);

  if (!employee) {
    return res.status(400).json({ message: "employee is required." });
  }
  if (!month) {
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
  const month = normalizeMonthTo3(req.query?.month);
  const year = Number(req.query?.year);

  if (!employee) {
    return res.status(400).json({ message: "employee is required." });
  }
  if (!month) {
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

// ── Employee Master & Pay Revisions API (SQLite backed) ─────────────────────
app.get("/api/employee-master/workbook", async (req, res) => {
  try {
    const db = await getEmployeeDb();
    const result = await getEmployeeMasterWorkbook(db);
    if (!result) {
      return res.status(404).json({ message: "Employee Master workbook not found." });
    }
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load Employee Master workbook.", detail: error.message });
  }
});

app.get("/api/employee-master/pay-revisions", async (req, res) => {
  try {
    const db = await getEmployeeDb();
    const revisions = await getAllPayRevisions(db);
    return res.json({ revisions });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load pay revisions.", detail: error.message });
  }
});

app.post("/api/employee-master/employee", async (req, res) => {
  try {
    const db = await getEmployeeDb();
    const result = await saveEmployeeAndRevision(db, req.body || {});
    return res.json({ message: "Employee and pay revision saved successfully.", ...result });
  } catch (error) {
    return res.status(500).json({ message: "Failed to save employee record.", detail: error.message });
  }
});

app.delete("/api/employee-master/pay-revision", async (req, res) => {
  try {
    const { empKey, effectiveMonth } = req.body || {};
    if (!empKey || !effectiveMonth) {
      return res.status(400).json({ message: "empKey and effectiveMonth are required." });
    }
    const db = await getEmployeeDb();
    const result = await deletePayRevision(db, empKey, effectiveMonth);
    return res.json({ message: "Pay revision deleted successfully.", ...result });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete pay revision.", detail: error.message });
  }
});

app.get("/api/employee-master/operating-rates", async (req, res) => {
  try {
    const db = await getEmployeeDb();
    const rates = await getDesignationOperatingRates(db);
    return res.json({ rates });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load designation operating rates.", detail: error.message });
  }
});

app.post("/api/employee-master/operating-rates", async (req, res) => {
  try {
    const submittedRates = req.body?.rates;
    if (!submittedRates || typeof submittedRates !== "object") {
      return res.status(400).json({ message: "rates object is required." });
    }
    const db = await getEmployeeDb();
    const result = await saveDesignationOperatingRates(db, submittedRates);
    return res.json({ message: "Designation operating rates saved successfully.", ...result });
  } catch (error) {
    return res.status(500).json({ message: "Failed to save designation operating rates.", detail: error.message });
  }
});

app.put("/api/employee-master/data-rows", async (req, res) => {
  const submittedRows = req.body?.rows;
  if (!Array.isArray(submittedRows)) {
    return res.status(400).json({ message: "rows array is required." });
  }
  try {
    const db = await getEmployeeDb();
    const result = await replaceEmployeeMasterRows(db, submittedRows);
    return res.json({ message: "Employee Master data rows saved.", ...result });
  } catch (error) {
    return res.status(500).json({ message: "Failed to save Employee Master data rows.", detail: error.message });
  }
});

// ── Employee Posting Station (1-Time Modification) Endpoints ───────────────
app.get("/api/employee/posting-station", async (req, res) => {
  const session = currentSession(req);
  if (!session) return res.status(401).json({ message: "Authentication required." });

  const queryEmp = req.query.employee || session.sapId || session.userId;
  try {
    const db = await getEmployeeDb();
    const status = await getEmployeePostingStationStatus(db, queryEmp);
    if (!status.found) {
      return res.status(404).json({ message: `Employee '${queryEmp}' not found.` });
    }
    return res.json(status);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch posting station.", detail: error.message });
  }
});

app.post("/api/employee/posting-station", async (req, res) => {
  const session = currentSession(req);
  if (!session) return res.status(401).json({ message: "Authentication required." });

  const isEmployee = session.role === "employee";
  // If employee role, they can only edit their own station
  const targetEmp = isEmployee ? (session.sapId || session.userId) : (req.body?.employee || session.userId);
  const postingStation = String(req.body?.postingStation || "").trim();

  if (!postingStation) {
    return res.status(400).json({ message: "Posting station is required." });
  }

  try {
    const db = await getEmployeeDb();
    const result = await updateEmployeePostingStation(db, targetEmp, postingStation, isEmployee);
    return res.json({
      message: "Posting station updated successfully.",
      ...result
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.post("/api/admin/reset-posting-station-lock", async (req, res) => {
  const session = currentSession(req);
  if (!session || session.role === "employee") {
    return res.status(403).json({ message: "Administrator permission required." });
  }

  const targetEmp = req.body?.employee;
  if (!targetEmp) {
    return res.status(400).json({ message: "employee parameter is required." });
  }

  try {
    const db = await getEmployeeDb();
    const result = await resetPostingStationLock(db, targetEmp);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: "Failed to reset posting station lock.", detail: error.message });
  }
});
// ─────────────────────────────────────────────────────────────────────────────

// Root route serves index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ message: "Not found." });
  }
  return res.status(404).sendFile(path.join(__dirname, "index.html"));
});

(async () => {
  try {
    const migrationResult = await migrateRawDataIfNeeded();
    await createOp72Database();
    const empMigrationResult = await migrateEmployeeMasterIfNeeded();
    console.log(
      `[raw-data] migration status: ${migrationResult.imported ? "imported" : "already-initialized"}, source rows=${migrationResult.rowCountInSource}`
    );
    console.log(
      `[employee-master] migration status: ${empMigrationResult.imported ? "imported" : "already-initialized"}, source rows=${empMigrationResult.existingRows}`
    );
    app.listen(PORT, () => {
      console.log(`[server] MileageOverTimeRWPShed running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("[server] startup failed", error);
    process.exit(1);
  }
})();
