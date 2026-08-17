const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const OP72_DB_FILE_PATH = path.join(__dirname, "..", "data", "op72-raw-data.sqlite");
const OP72_WORKBOOK_CODE = "op72";
const OP72_SHEET_NAME = "OP72";
let op72DbPromise = null;

async function initializeOp72Schema(db) {
  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS raw_data_workbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      sheet_name TEXT NOT NULL,
      header_row_count INTEGER NOT NULL DEFAULT 2,
      max_columns INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS raw_data_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workbook_id INTEGER NOT NULL,
      row_index INTEGER NOT NULL,
      row_kind TEXT NOT NULL CHECK (row_kind IN ('header', 'data')),
      row_values_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (workbook_id) REFERENCES raw_data_workbooks(id) ON DELETE CASCADE,
      UNIQUE (workbook_id, row_index)
    );

    CREATE INDEX IF NOT EXISTS idx_raw_data_rows_workbook_kind_index
      ON raw_data_rows (workbook_id, row_kind, row_index);
  `);

  await db.run(
    `INSERT OR IGNORE INTO raw_data_workbooks (code, sheet_name, header_row_count, max_columns)
     VALUES (?, ?, 2, 13)`,
    OP72_WORKBOOK_CODE,
    OP72_SHEET_NAME
  );
}

async function createOp72Database() {
  const db = await open({
    filename: OP72_DB_FILE_PATH,
    driver: sqlite3.Database,
  });

  await initializeOp72Schema(db);
  await db.close();
}

async function getOp72Db() {
  if (!op72DbPromise) {
    op72DbPromise = open({
      filename: OP72_DB_FILE_PATH,
      driver: sqlite3.Database,
    }).then(async (db) => {
      await initializeOp72Schema(db);
      return db;
    });
  }

  return op72DbPromise;
}

module.exports = {
  OP72_DB_FILE_PATH,
  OP72_SHEET_NAME,
  OP72_WORKBOOK_CODE,
  createOp72Database,
  getOp72Db,
  initializeOp72Schema,
};
