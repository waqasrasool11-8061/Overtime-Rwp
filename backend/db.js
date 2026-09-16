const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { isTursoConfigured, getTursoClient } = require("./tursoClient");

const DB_FILE_PATH = path.join(__dirname, "..", "data", "raw-data.sqlite");
let dbPromise = null;
let tursoInitialized = false;

async function initializeSchema(db) {
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
}

async function getDb() {
  if (isTursoConfigured()) {
    const db = getTursoClient();
    if (!tursoInitialized) {
      await initializeSchema(db);
      tursoInitialized = true;
    }
    return db;
  }

  if (!dbPromise) {
    dbPromise = open({
      filename: DB_FILE_PATH,
      driver: sqlite3.Database,
    }).then(async (db) => {
      await initializeSchema(db);
      return db;
    });
  }

  return dbPromise;
}

module.exports = {
  DB_FILE_PATH,
  getDb,
};
