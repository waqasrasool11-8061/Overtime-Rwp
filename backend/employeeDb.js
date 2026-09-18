const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { isTursoConfigured, getTursoClient } = require("./tursoClient");

const EMPLOYEE_DB_FILE_PATH = path.join(__dirname, "..", "data", "employee-master.sqlite");
const EMPLOYEE_WORKBOOK_CODE = "employee-master";
const EMPLOYEE_SHEET_NAME = "Employee_Master";

let employeeDbPromise = null;
let employeeTursoInitialized = false;

async function initializeEmployeeSchema(db) {
  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS employee_master_workbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      sheet_name TEXT NOT NULL,
      header_row_count INTEGER NOT NULL DEFAULT 4,
      max_columns INTEGER NOT NULL DEFAULT 22,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employee_master_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workbook_id INTEGER NOT NULL,
      row_index INTEGER NOT NULL,
      row_kind TEXT NOT NULL CHECK (row_kind IN ('header', 'data')),
      sap_id TEXT,
      employee_name TEXT,
      designation TEXT,
      basic_pay REAL,
      category TEXT,
      row_values_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (workbook_id) REFERENCES employee_master_workbooks(id) ON DELETE CASCADE,
      UNIQUE (workbook_id, row_index)
    );

    CREATE INDEX IF NOT EXISTS idx_emp_master_rows_workbook_kind_index
      ON employee_master_rows (workbook_id, row_kind, row_index);

    CREATE INDEX IF NOT EXISTS idx_emp_master_rows_sap
      ON employee_master_rows (sap_id);

    CREATE INDEX IF NOT EXISTS idx_emp_master_rows_name
      ON employee_master_rows (employee_name);

    CREATE TABLE IF NOT EXISTS employee_pay_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_key TEXT NOT NULL,
      sap_id TEXT,
      employee_name TEXT,
      effective_month TEXT NOT NULL,
      basic_pay REAL NOT NULL,
      designation TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (emp_key, effective_month)
    );

    CREATE INDEX IF NOT EXISTS idx_emp_pay_revisions_key_month
      ON employee_pay_revisions (emp_key, effective_month);

    CREATE TABLE IF NOT EXISTS employee_posting_station_edits (
      emp_key TEXT PRIMARY KEY,
      sap_id TEXT,
      employee_name TEXT,
      posting_station TEXT NOT NULL,
      modified_at TEXT NOT NULL DEFAULT (datetime('now')),
      edit_count INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS designation_operating_rates (
      designation_key TEXT PRIMARY KEY,
      designation_name TEXT NOT NULL,
      ml_rate REAL NOT NULL DEFAULT 0,
      shnt_rate REAL NOT NULL DEFAULT 0,
      pass_rate REAL NOT NULL DEFAULT 0,
      gds_rate REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.run(
    `INSERT OR IGNORE INTO designation_operating_rates (designation_key, designation_name, ml_rate, shnt_rate, pass_rate, gds_rate)
     VALUES
      ('DRIVER', 'Driver', 200, 0, 150, 120),
      ('DY_DRIVER', 'Dy Driver', 0, 120, 0, 0),
      ('ASSISTANT_DRIVER', 'Assistant Driver', 100, 120, 75, 50)`
  );

  await db.run(
    `INSERT OR IGNORE INTO employee_master_workbooks (code, sheet_name, header_row_count, max_columns)
     VALUES (?, ?, 4, 22)`,
    EMPLOYEE_WORKBOOK_CODE,
    EMPLOYEE_SHEET_NAME
  );
}

async function getEmployeeDb() {
  if (isTursoConfigured()) {
    const db = getTursoClient();
    if (!employeeTursoInitialized) {
      await initializeEmployeeSchema(db);
      employeeTursoInitialized = true;
    }
    return db;
  }

  if (!employeeDbPromise) {
    employeeDbPromise = open({
      filename: EMPLOYEE_DB_FILE_PATH,
      driver: sqlite3.Database,
    }).then(async (db) => {
      await initializeEmployeeSchema(db);
      return db;
    });
  }

  return employeeDbPromise;
}

module.exports = {
  EMPLOYEE_DB_FILE_PATH,
  EMPLOYEE_WORKBOOK_CODE,
  EMPLOYEE_SHEET_NAME,
  getEmployeeDb,
  initializeEmployeeSchema,
};
