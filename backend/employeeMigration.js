const fs = require("fs");
const path = require("path");
const { getEmployeeDb, EMPLOYEE_WORKBOOK_CODE } = require("./employeeDb");
const { normEmpId, calculateEmployeeRates } = require("./employeeRepository");

const SOURCE_PATH = path.join(__dirname, "..", "Employee_Master.json");

async function migrateEmployeeMasterIfNeeded() {
  const db = await getEmployeeDb();

  const workbook = await db.get(
    `SELECT id, header_row_count, max_columns FROM employee_master_workbooks WHERE code = ?`,
    EMPLOYEE_WORKBOOK_CODE
  );

  if (!workbook) {
    throw new Error("Employee master workbook not registered in SQLite.");
  }

  const rowCountRes = await db.get(
    `SELECT COUNT(*) as cnt FROM employee_master_rows WHERE workbook_id = ?`,
    workbook.id
  );

  const existingRowCount = Number(rowCountRes?.cnt || 0);
  if (existingRowCount > 0) {
    return {
      workbookId: workbook.id,
      imported: false,
      existingRows: existingRowCount,
    };
  }

  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Employee Master source file not found at ${SOURCE_PATH}`);
  }

  const raw = fs.readFileSync(SOURCE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const headerRowCount = Number(parsed?.headerRows || 4);

  await db.exec("BEGIN TRANSACTION");
  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const isHeader = i < headerRowCount;
      const rowKind = isHeader ? "header" : "data";

      let sap = "";
      let name = "";
      let desg = "";
      let basic = 0;
      let cat = "";
      let calculatedRow = row;

      if (!isHeader && Array.isArray(row)) {
        calculatedRow = calculateEmployeeRates(row);
        sap = String(calculatedRow[0] || "").trim();
        name = String(calculatedRow[1] || "").trim().toUpperCase();
        desg = String(calculatedRow[2] || "").trim().toUpperCase();
        basic = parseFloat(calculatedRow[3]) || 0;
        cat = String(calculatedRow[4] || "").trim().toUpperCase();
      }

      await db.run(
        `INSERT INTO employee_master_rows
         (workbook_id, row_index, row_kind, sap_id, employee_name, designation, basic_pay, category, row_values_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        workbook.id,
        i,
        rowKind,
        sap,
        name,
        desg,
        basic,
        cat,
        JSON.stringify(calculatedRow)
      );

      // Seed initial pay revision for data rows if basic pay is present
      if (!isHeader && (sap || name) && basic > 0) {
        const empKey = normEmpId(sap || name);
        await db.run(
          `INSERT OR IGNORE INTO employee_pay_revisions
           (emp_key, sap_id, employee_name, effective_month, basic_pay, designation, note, created_at, updated_at)
           VALUES (?, ?, ?, '2025-07', ?, ?, 'Base Master Record (July-2025)', datetime('now'), datetime('now'))`,
          empKey,
          sap,
          name,
          basic,
          desg
        );
      }
    }

    await db.run(
      `UPDATE employee_master_workbooks
       SET header_row_count = ?, max_columns = ?, updated_at = datetime('now')
       WHERE id = ?`,
      headerRowCount,
      Number(parsed?.maxColumns || 22),
      workbook.id
    );

    await db.exec("COMMIT");

    return {
      workbookId: workbook.id,
      imported: true,
      existingRows: rows.length,
    };
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

module.exports = {
  migrateEmployeeMasterIfNeeded,
};
