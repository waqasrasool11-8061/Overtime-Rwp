const fs = require("fs");
const path = require("path");
const { EMPLOYEE_WORKBOOK_CODE } = require("./employeeDb");

const EMPLOYEE_MASTER_JSON_PATH = path.join(__dirname, "..", "Employee_Master.json");
const EMPLOYEE_MASTER_DATA_JS_PATH = path.join(__dirname, "..", "Employee_Master.data.js");

function normEmpId(str) {
  return String(str || "").replace(/[\s\.\-_]+/g, " ").trim().toUpperCase();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseNumeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  let normalized = normalizeText(value).replace(/(?:PKR|RS\.?|₨|\$)/gi, "").replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateEmployeeRates(rowValues) {
  const row = [...rowValues];
  while (row.length < 22) row.push(null);

  const basePay = parseNumeric(row[3]);
  if (basePay <= 0) {
    row[5] = "";
    row[6] = "";
    row[7] = "";
    row[8] = "";
    row[9] = "";
    row[10] = "";
    row[15] = "";
    row[16] = "";
    return row;
  }

  const fValue = basePay / 30;
  row[3] = basePay;
  row[5] = fValue;
  row[6] = fValue * 30 / 100;
  row[7] = fValue * 25 / 100;
  row[8] = fValue * 20 / 100;
  row[9] = fValue * 20 / 100;
  row[10] = basePay / 30;

  // Fixed allowances if not set
  if (row[11] === null || row[11] === undefined || row[11] === "") row[11] = 100;
  if (row[12] === null || row[12] === undefined || row[12] === "") row[12] = 120;
  if (row[13] === null || row[13] === undefined || row[13] === "") row[13] = 75;
  if (row[14] === null || row[14] === undefined || row[14] === "") row[14] = 50;

  row[15] = fValue * 55 / 100;
  row[16] = fValue * 55 / 100;

  return row;
}

function syncEmployeeMasterToDisk(rows, headerRowCount = 4, maxColumns = 22) {
  try {
    const payload = {
      sheetName: "Employee_Master",
      maxColumns: maxColumns || 22,
      headerRows: headerRowCount || 4,
      rows: rows,
    };

    fs.writeFileSync(EMPLOYEE_MASTER_JSON_PATH, JSON.stringify(payload, null, 2), "utf8");
    const jsContent = `window.employeeMasterWorkbookData = ${JSON.stringify(payload, null, 2)};\n`;
    fs.writeFileSync(EMPLOYEE_MASTER_DATA_JS_PATH, jsContent, "utf8");
  } catch (err) {
    console.error("Failed to sync Employee_Master to disk files:", err.message);
  }
}

async function getWorkbookMeta(db) {
  return db.get(
    `SELECT id, code, sheet_name, header_row_count, max_columns, created_at, updated_at
     FROM employee_master_workbooks
     WHERE code = ?`,
    EMPLOYEE_WORKBOOK_CODE
  );
}

async function getEmployeeMasterWorkbook(db) {
  const workbook = await getWorkbookMeta(db);
  if (!workbook) return null;

  const records = await db.all(
    `SELECT id, workbook_id, row_index, row_kind, sap_id, employee_name, designation, basic_pay, category, row_values_json
     FROM employee_master_rows
     WHERE workbook_id = ?
     ORDER BY row_index ASC`,
    workbook.id
  );

  const rows = records.map((r) => {
    try {
      return JSON.parse(r.row_values_json || "[]");
    } catch {
      return [];
    }
  });

  const rowMeta = records.map((r) => ({
    id: r.id,
    rowIndex: r.row_index,
    rowKind: r.row_kind,
    sapId: r.sap_id,
    employeeName: r.employee_name,
    designation: r.designation,
    basicPay: r.basic_pay,
    category: r.category,
  }));

  return { workbook, rows, rowMeta };
}

async function getAllPayRevisions(db) {
  const records = await db.all(
    `SELECT emp_key, sap_id, employee_name, effective_month, basic_pay, designation, note, updated_at
     FROM employee_pay_revisions
     ORDER BY effective_month ASC`
  );

  const dict = {};
  for (const r of records) {
    const key = normEmpId(r.emp_key);
    if (!dict[key]) {
      dict[key] = [];
    }
    dict[key].push({
      effectiveMonth: r.effective_month,
      basicPay: Number(r.basic_pay),
      designation: r.designation || "",
      note: r.note || "",
      updatedAt: r.updated_at,
    });
  }

  return dict;
}

async function saveEmployeeAndRevision(db, data) {
  const sap = normalizeText(data.sap);
  const name = normalizeText(data.name).toUpperCase();
  const desg = normalizeText(data.designation).toUpperCase() || "ASSISTANT DRIVER";
  const cat = normalizeText(data.postingStation || data.category).toUpperCase() || "RAWALPINDI";
  const month = normalizeText(data.effectiveMonth) || "2026-07";
  const basicPay = parseNumeric(data.basicPay);
  const note = normalizeText(data.note) || (data.isNew ? "Initial Record" : "Pay Revision");

  if (!name || basicPay <= 0 || !month) {
    throw new Error("Employee Name, positive Basic Pay, and Effective Month are required.");
  }

  const primaryKey = normEmpId(sap || name);
  const workbook = await getWorkbookMeta(db);
  if (!workbook) throw new Error("Employee master workbook record not found in SQLite.");

  await db.exec("BEGIN TRANSACTION");
  try {
    // 1. Check if employee already exists in employee_master_rows
    let existingRecord = null;
    if (sap) {
      existingRecord = await db.get(
        `SELECT * FROM employee_master_rows
         WHERE workbook_id = ? AND row_kind = 'data' AND (UPPER(TRIM(sap_id)) = ? OR UPPER(TRIM(employee_name)) = ?)`,
        workbook.id,
        sap.toUpperCase(),
        name
      );
    } else {
      existingRecord = await db.get(
        `SELECT * FROM employee_master_rows
         WHERE workbook_id = ? AND row_kind = 'data' AND UPPER(TRIM(employee_name)) = ?`,
        workbook.id,
        name
      );
    }

    let targetRow = Array(22).fill("");
    let rowIndex = -1;

    if (existingRecord) {
      rowIndex = existingRecord.row_index;
      try {
        const parsed = JSON.parse(existingRecord.row_values_json || "[]");
        if (Array.isArray(parsed)) targetRow = parsed;
      } catch {}
    } else {
      const maxRowIndexRes = await db.get(
        `SELECT MAX(row_index) as max_idx FROM employee_master_rows WHERE workbook_id = ?`,
        workbook.id
      );
      rowIndex = Math.max((workbook.header_row_count || 4) - 1, Number(maxRowIndexRes?.max_idx || 3)) + 1;
      targetRow[11] = 100;
      targetRow[12] = 120;
      targetRow[13] = 75;
      targetRow[14] = 50;
    }

    while (targetRow.length < 22) targetRow.push("");
    targetRow[0] = sap;
    targetRow[1] = name;
    targetRow[2] = desg;
    targetRow[3] = basicPay;
    targetRow[4] = cat;

    const calculatedRow = calculateEmployeeRates(targetRow);
    const calculatedJson = JSON.stringify(calculatedRow);

    if (existingRecord) {
      await db.run(
        `UPDATE employee_master_rows
         SET sap_id = ?, employee_name = ?, designation = ?, basic_pay = ?, category = ?,
             row_values_json = ?, updated_at = datetime('now')
         WHERE id = ?`,
        sap,
        name,
        desg,
        basicPay,
        cat,
        calculatedJson,
        existingRecord.id
      );
    } else {
      await db.run(
        `INSERT INTO employee_master_rows
         (workbook_id, row_index, row_kind, sap_id, employee_name, designation, basic_pay, category, row_values_json, created_at, updated_at)
         VALUES (?, ?, 'data', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        workbook.id,
        rowIndex,
        sap,
        name,
        desg,
        basicPay,
        cat,
        calculatedJson
      );
    }

    // 2. Insert or update pay revision history
    await db.run(
      `INSERT INTO employee_pay_revisions (emp_key, sap_id, employee_name, effective_month, basic_pay, designation, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(emp_key, effective_month) DO UPDATE SET
         basic_pay = excluded.basic_pay,
         designation = excluded.designation,
         note = excluded.note,
         sap_id = excluded.sap_id,
         employee_name = excluded.employee_name,
         updated_at = datetime('now')`,
      primaryKey,
      sap,
      name,
      month,
      basicPay,
      desg,
      note
    );

    await db.run(
      `UPDATE employee_master_workbooks SET updated_at = datetime('now') WHERE id = ?`,
      workbook.id
    );

    // Fetch full updated rows to sync with disk files
    const allRecords = await db.all(
      `SELECT row_values_json FROM employee_master_rows WHERE workbook_id = ? ORDER BY row_index ASC`,
      workbook.id
    );
    const diskRows = allRecords.map((r) => {
      try {
        return JSON.parse(r.row_values_json);
      } catch {
        return [];
      }
    });
    syncEmployeeMasterToDisk(diskRows, workbook.header_row_count, workbook.max_columns);

    await db.exec("COMMIT");

    return {
      success: true,
      rowIndex,
      employee: calculatedRow,
      revision: {
        empKey: primaryKey,
        effectiveMonth: month,
        basicPay,
        designation: desg,
        note,
      },
    };
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function deletePayRevision(db, empKey, effectiveMonth) {
  const normKey = normEmpId(empKey);
  const normMonth = normalizeText(effectiveMonth);

  if (!normKey || !normMonth) {
    throw new Error("empKey and effectiveMonth are required.");
  }

  const workbook = await getWorkbookMeta(db);
  if (!workbook) throw new Error("Employee master workbook record not found in SQLite.");

  await db.exec("BEGIN TRANSACTION");
  try {
    await db.run(
      `DELETE FROM employee_pay_revisions WHERE emp_key = ? AND effective_month = ?`,
      normKey,
      normMonth
    );

    // Find remaining revisions for this employee, ordered latest first
    const remaining = await db.all(
      `SELECT * FROM employee_pay_revisions WHERE emp_key = ? ORDER BY effective_month DESC`,
      normKey
    );

    // If revisions remain, update the employee record in employee_master_rows to latest revision's basic pay
    const empRecord = await db.get(
      `SELECT * FROM employee_master_rows
       WHERE workbook_id = ? AND row_kind = 'data' AND (UPPER(TRIM(sap_id)) = ? OR UPPER(TRIM(employee_name)) = ?)`,
      workbook.id,
      normKey,
      normKey
    );

    if (empRecord && remaining.length > 0) {
      const latest = remaining[0];
      let row = [];
      try {
        row = JSON.parse(empRecord.row_values_json);
      } catch {}
      if (Array.isArray(row)) {
        row[3] = Number(latest.basic_pay);
        if (latest.designation) row[2] = latest.designation;
        const recalculated = calculateEmployeeRates(row);
        await db.run(
          `UPDATE employee_master_rows
           SET basic_pay = ?, designation = ?, row_values_json = ?, updated_at = datetime('now')
           WHERE id = ?`,
          Number(latest.basic_pay),
          latest.designation || empRecord.designation,
          JSON.stringify(recalculated),
          empRecord.id
        );
      }
    }

    // Sync disk files
    const allRecords = await db.all(
      `SELECT row_values_json FROM employee_master_rows WHERE workbook_id = ? ORDER BY row_index ASC`,
      workbook.id
    );
    const diskRows = allRecords.map((r) => {
      try {
        return JSON.parse(r.row_values_json);
      } catch {
        return [];
      }
    });
    syncEmployeeMasterToDisk(diskRows, workbook.header_row_count, workbook.max_columns);

    await db.exec("COMMIT");
    return { success: true, remainingCount: remaining.length };
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function replaceEmployeeMasterRows(db, rows) {
  if (!Array.isArray(rows)) {
    throw new Error("rows array is required.");
  }

  const workbook = await getWorkbookMeta(db);
  if (!workbook) throw new Error("Employee master workbook not found.");

  const headerRowCount = workbook.header_row_count || 4;

  await db.exec("BEGIN TRANSACTION");
  try {
    // Delete existing data rows
    await db.run(
      `DELETE FROM employee_master_rows WHERE workbook_id = ? AND row_kind = 'data'`,
      workbook.id
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const calculated = calculateEmployeeRates(row);
      const sap = normalizeText(calculated[0]);
      const name = normalizeText(calculated[1]).toUpperCase();
      const desg = normalizeText(calculated[2]).toUpperCase();
      const basic = parseNumeric(calculated[3]);
      const cat = normalizeText(calculated[4]).toUpperCase();

      await db.run(
        `INSERT INTO employee_master_rows
         (workbook_id, row_index, row_kind, sap_id, employee_name, designation, basic_pay, category, row_values_json, created_at, updated_at)
         VALUES (?, ?, 'data', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        workbook.id,
        headerRowCount + i,
        sap,
        name,
        desg,
        basic,
        cat,
        JSON.stringify(calculated)
      );
    }

    const allRecords = await db.all(
      `SELECT row_values_json FROM employee_master_rows WHERE workbook_id = ? ORDER BY row_index ASC`,
      workbook.id
    );
    const diskRows = allRecords.map((r) => {
      try {
        return JSON.parse(r.row_values_json);
      } catch {
        return [];
      }
    });
    syncEmployeeMasterToDisk(diskRows, headerRowCount, workbook.max_columns);

    await db.exec("COMMIT");
    return { success: true, savedRowCount: rows.length };
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function getEmployeePostingStationStatus(db, identifier) {
  const normKey = normEmpId(identifier);
  if (!normKey) return { found: false };

  const workbook = await getWorkbookMeta(db);
  if (!workbook) return { found: false };

  const record = await db.get(
    `SELECT * FROM employee_master_rows
     WHERE workbook_id = ? AND row_kind = 'data' AND (UPPER(TRIM(sap_id)) = ? OR UPPER(TRIM(employee_name)) = ?)`,
    workbook.id,
    normKey,
    normKey
  );

  if (!record) return { found: false };

  let rowValues = [];
  try {
    rowValues = JSON.parse(record.row_values_json || "[]");
  } catch {}

  const rawStation = normalizeText(rowValues[4] || record.category || "");
  const placeholderKeywords = ["DRIVER", "DY DRIVER", "ASSISTANT DRIVER", "RUNNING STAFF"];
  const isPlaceholder = placeholderKeywords.includes(rawStation.toUpperCase());
  const effectiveStation = isPlaceholder ? "" : rawStation;

  const editLog = await db.get(
    `SELECT * FROM employee_posting_station_edits WHERE emp_key = ?`,
    normKey
  );

  return {
    found: true,
    sapId: record.sap_id,
    employeeName: record.employee_name,
    designation: record.designation,
    postingStation: effectiveStation || rawStation,
    rawStation: rawStation,
    isModified: Boolean(editLog),
    modifiedAt: editLog?.modified_at || null,
    editCount: editLog?.edit_count || 0,
    canEdit: !editLog,
  };
}

async function updateEmployeePostingStation(db, identifier, newStation, isEmployeeSelfEdit = false) {
  const normKey = normEmpId(identifier);
  const cleanStation = normalizeText(newStation).toUpperCase();

  if (!normKey) throw new Error("Employee identifier is required.");
  if (!cleanStation) throw new Error("Posting station name cannot be empty.");

  const workbook = await getWorkbookMeta(db);
  if (!workbook) throw new Error("Employee master workbook not found.");

  const record = await db.get(
    `SELECT * FROM employee_master_rows
     WHERE workbook_id = ? AND row_kind = 'data' AND (UPPER(TRIM(sap_id)) = ? OR UPPER(TRIM(employee_name)) = ?)`,
    workbook.id,
    normKey,
    normKey
  );

  if (!record) throw new Error(`Employee '${identifier}' not found in Employee Master.`);

  // Check 1-time edit restriction for employee self-service
  const existingLog = await db.get(
    `SELECT * FROM employee_posting_station_edits WHERE emp_key = ?`,
    normKey
  );

  if (isEmployeeSelfEdit && existingLog) {
    throw new Error("Posting station has already been modified once and is permanently locked. Please contact Admin if a transfer/correction is needed.");
  }

  await db.exec("BEGIN TRANSACTION");
  try {
    let rowValues = [];
    try {
      rowValues = JSON.parse(record.row_values_json || "[]");
    } catch {}
    while (rowValues.length < 22) rowValues.push("");
    rowValues[4] = cleanStation;

    await db.run(
      `UPDATE employee_master_rows
       SET category = ?, row_values_json = ?, updated_at = datetime('now')
       WHERE id = ?`,
      cleanStation,
      JSON.stringify(rowValues),
      record.id
    );

    await db.run(
      `INSERT INTO employee_posting_station_edits (emp_key, sap_id, employee_name, posting_station, modified_at, edit_count)
       VALUES (?, ?, ?, ?, datetime('now'), 1)
       ON CONFLICT(emp_key) DO UPDATE SET
         posting_station = excluded.posting_station,
         modified_at = datetime('now'),
         edit_count = edit_count + 1`,
      normKey,
      record.sap_id,
      record.employee_name,
      cleanStation
    );

    // Sync disk files
    const allRecords = await db.all(
      `SELECT row_values_json FROM employee_master_rows WHERE workbook_id = ? ORDER BY row_index ASC`,
      workbook.id
    );
    const diskRows = allRecords.map((r) => {
      try {
        return JSON.parse(r.row_values_json);
      } catch {
        return [];
      }
    });
    syncEmployeeMasterToDisk(diskRows, workbook.header_row_count, workbook.max_columns);

    await db.exec("COMMIT");
    return {
      success: true,
      sapId: record.sap_id,
      employeeName: record.employee_name,
      postingStation: cleanStation,
      isModified: true,
    };
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function resetPostingStationLock(db, identifier) {
  const normKey = normEmpId(identifier);
  if (!normKey) throw new Error("Employee identifier is required.");

  await db.run(
    `DELETE FROM employee_posting_station_edits WHERE emp_key = ?`,
    normKey
  );
  return { success: true, message: `Posting station edit lock reset for ${identifier}.` };
}

module.exports = {
  normEmpId,
  calculateEmployeeRates,
  getEmployeeMasterWorkbook,
  getAllPayRevisions,
  saveEmployeeAndRevision,
  deletePayRevision,
  replaceEmployeeMasterRows,
  syncEmployeeMasterToDisk,
  getEmployeePostingStationStatus,
  updateEmployeePostingStation,
  resetPostingStationLock,
};
