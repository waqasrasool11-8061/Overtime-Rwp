/**
 * Sync from Turso Cloud SQLite to Local Project Files
 * Downloads all fresh production data from Turso into data/*.sqlite,
 * data/holidays.json, backend/user_credentials.json, and backend/chat_messages.json.
 */

const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const ROOT_DIR = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT_DIR, ".env") });

const { isTursoConfigured, getTursoClient } = require(path.join(ROOT_DIR, "backend", "tursoClient"));

// ── Back up current local files before sync ──────────────────────────────────
function createPreSyncBackup() {
  const BACKUP_ROOT = path.join(ROOT_DIR, "backups");
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const targetFolder = path.join(BACKUP_ROOT, `pre-turso-sync-${timestamp}`);

  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  const filesToBackup = [
    path.join(ROOT_DIR, "data", "raw-data.sqlite"),
    path.join(ROOT_DIR, "data", "op72-raw-data.sqlite"),
    path.join(ROOT_DIR, "data", "employee-master.sqlite"),
    path.join(ROOT_DIR, "data", "auth-store.sqlite"),
    path.join(ROOT_DIR, "data", "biometrics.sqlite"),
    path.join(ROOT_DIR, "data", "cloud-store.sqlite"),
    path.join(ROOT_DIR, "data", "holidays.json"),
    path.join(ROOT_DIR, "backend", "user_credentials.json"),
    path.join(ROOT_DIR, "backend", "chat_messages.json"),
  ];

  let copied = 0;
  for (const file of filesToBackup) {
    if (fs.existsSync(file)) {
      const filename = path.basename(file);
      const dest = path.join(targetFolder, filename);
      fs.copyFileSync(file, dest);
      copied++;
    }
  }
  console.log(`[backup] Pre-sync backup saved (${copied} files) in:\n  ${targetFolder}`);
}

/**
 * Recreate and sync an entire table schema + rows from Turso to local SQLite
 */
async function syncTableFromTurso(turso, localDb, tableName) {
  const tableDdlRow = await turso.get(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?",
    tableName
  );
  if (!tableDdlRow || !tableDdlRow.sql) {
    console.warn(`[sync] Table ${tableName} not found in Turso.`);
    return 0;
  }

  const colsInfo = await turso.all(`PRAGMA table_info(${tableName})`);
  const colNames = colsInfo.map((c) => c.name);

  // Drop and re-create table with exact Turso DDL
  await localDb.exec(`DROP TABLE IF EXISTS ${tableName}`);
  await localDb.exec(tableDdlRow.sql);

  // Sync index definitions from Turso
  const indexRows = await turso.all(
    "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name = ? AND sql IS NOT NULL",
    tableName
  );
  for (const idx of indexRows) {
    try {
      await localDb.exec(idx.sql);
    } catch {}
  }

  // Fetch rows from Turso
  const rows = await turso.all(`SELECT ${colNames.join(", ")} FROM ${tableName}`);
  if (rows && rows.length > 0) {
    const placeholders = colNames.map(() => "?").join(", ");
    const stmt = await localDb.prepare(
      `INSERT INTO ${tableName} (${colNames.join(", ")}) VALUES (${placeholders})`
    );
    for (const r of rows) {
      const vals = colNames.map((c) => (r[c] === undefined ? null : r[c]));
      await stmt.run(...vals);
    }
    await stmt.finalize();
  }
  return rows ? rows.length : 0;
}

async function syncTursoToLocal() {
  if (!isTursoConfigured()) {
    console.error("[sync] TURSO_DATABASE_URL is not set in .env. Cannot sync from Turso.");
    process.exit(1);
  }

  const turso = getTursoClient();
  console.log("[sync] Connecting to Turso Cloud database...");

  try {
    const testRow = await turso.get("SELECT 1 as connected");
    if (!testRow) throw new Error("No response from Turso");
    console.log("[sync] Connected to Turso successfully.");
  } catch (err) {
    console.error("[sync] Failed to connect to Turso:", err.message);
    process.exit(1);
  }

  // 1. Create Pre-Sync Backup
  createPreSyncBackup();

  const dataDir = path.join(ROOT_DIR, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Sync raw-data.sqlite (RawData workbook id=1 in Turso)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[sync] Syncing raw-data.sqlite...");
  const rawDataLocalPath = path.join(dataDir, "raw-data.sqlite");
  const rawDataDb = await open({ filename: rawDataLocalPath, driver: sqlite3.Database });

  await rawDataDb.exec(`
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

  const tursoRawWb = await turso.get("SELECT * FROM raw_data_workbooks WHERE code = 'raw-data'");
  if (tursoRawWb) {
    await rawDataDb.run(
      `INSERT INTO raw_data_workbooks (id, code, sheet_name, header_row_count, max_columns, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         sheet_name = excluded.sheet_name,
         header_row_count = excluded.header_row_count,
         max_columns = excluded.max_columns,
         updated_at = excluded.updated_at`,
      tursoRawWb.id,
      tursoRawWb.code,
      tursoRawWb.sheet_name,
      tursoRawWb.header_row_count,
      tursoRawWb.max_columns,
      tursoRawWb.created_at,
      tursoRawWb.updated_at
    );

    const localWb = await rawDataDb.get("SELECT id FROM raw_data_workbooks WHERE code = 'raw-data'");
    const localWbId = localWb.id;

    const BATCH_SIZE = 2500;
    let offset = 0;
    let totalSyncedRaw = 0;

    await rawDataDb.run("BEGIN TRANSACTION");
    try {
      await rawDataDb.run("DELETE FROM raw_data_rows WHERE workbook_id = ?", localWbId);

      while (true) {
        const rows = await turso.all(
          `SELECT row_index, row_kind, row_values_json, created_at, updated_at
           FROM raw_data_rows
           WHERE workbook_id = ?
           ORDER BY row_index
           LIMIT ? OFFSET ?`,
          tursoRawWb.id,
          BATCH_SIZE,
          offset
        );
        if (!rows || rows.length === 0) break;

        const stmt = await rawDataDb.prepare(
          `INSERT INTO raw_data_rows (workbook_id, row_index, row_kind, row_values_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const r of rows) {
          await stmt.run(localWbId, r.row_index, r.row_kind, r.row_values_json, r.created_at, r.updated_at);
        }
        await stmt.finalize();

        totalSyncedRaw += rows.length;
        offset += rows.length;
      }
      await rawDataDb.run("COMMIT");
      console.log(`[sync] raw-data.sqlite updated: ${totalSyncedRaw} rows synced.`);
    } catch (e) {
      await rawDataDb.run("ROLLBACK");
      throw e;
    }
  }
  await rawDataDb.close();

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Sync op72-raw-data.sqlite (OP72 workbook in Turso)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[sync] Syncing op72-raw-data.sqlite...");
  const op72LocalPath = path.join(dataDir, "op72-raw-data.sqlite");
  const op72Db = await open({ filename: op72LocalPath, driver: sqlite3.Database });

  await op72Db.exec(`
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

  const tursoOp72Wb = await turso.get("SELECT * FROM raw_data_workbooks WHERE code = 'op72'");
  if (tursoOp72Wb) {
    await op72Db.run(
      `INSERT INTO raw_data_workbooks (code, sheet_name, header_row_count, max_columns)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         sheet_name = excluded.sheet_name,
         header_row_count = excluded.header_row_count,
         max_columns = excluded.max_columns`,
      tursoOp72Wb.code,
      tursoOp72Wb.sheet_name,
      tursoOp72Wb.header_row_count,
      tursoOp72Wb.max_columns
    );

    const localOp72Wb = await op72Db.get("SELECT id FROM raw_data_workbooks WHERE code = 'op72'");
    const localOp72WbId = localOp72Wb.id;

    const BATCH_SIZE = 2500;
    let offset = 0;
    let totalSyncedOp72 = 0;

    await op72Db.run("BEGIN TRANSACTION");
    try {
      await op72Db.run("DELETE FROM raw_data_rows WHERE workbook_id = ?", localOp72WbId);

      while (true) {
        const rows = await turso.all(
          `SELECT row_index, row_kind, row_values_json, created_at, updated_at
           FROM raw_data_rows
           WHERE workbook_id = ?
           ORDER BY row_index
           LIMIT ? OFFSET ?`,
          tursoOp72Wb.id,
          BATCH_SIZE,
          offset
        );
        if (!rows || rows.length === 0) break;

        const stmt = await op72Db.prepare(
          `INSERT INTO raw_data_rows (workbook_id, row_index, row_kind, row_values_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const r of rows) {
          await stmt.run(localOp72WbId, r.row_index, r.row_kind, r.row_values_json, r.created_at, r.updated_at);
        }
        await stmt.finalize();

        totalSyncedOp72 += rows.length;
        offset += rows.length;
      }
      await op72Db.run("COMMIT");
      console.log(`[sync] op72-raw-data.sqlite updated: ${totalSyncedOp72} rows synced.`);
    } catch (e) {
      await op72Db.run("ROLLBACK");
      throw e;
    }
  }
  await op72Db.close();

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Sync employee-master.sqlite
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[sync] Syncing employee-master.sqlite...");
  const empLocalPath = path.join(dataDir, "employee-master.sqlite");
  const empDb = await open({ filename: empLocalPath, driver: sqlite3.Database });

  await empDb.run("BEGIN TRANSACTION");
  try {
    const cntWb = await syncTableFromTurso(turso, empDb, "employee_master_workbooks");
    const cntRows = await syncTableFromTurso(turso, empDb, "employee_master_rows");
    const cntPay = await syncTableFromTurso(turso, empDb, "employee_pay_revisions");
    const cntPost = await syncTableFromTurso(turso, empDb, "employee_posting_station_edits");
    const cntRates = await syncTableFromTurso(turso, empDb, "designation_operating_rates");
    await empDb.run("COMMIT");
    console.log(`[sync] employee-master.sqlite updated: ${cntRows} rows, ${cntPay} revisions, ${cntPost} stations, ${cntRates} rates.`);
  } catch (e) {
    await empDb.run("ROLLBACK");
    throw e;
  }
  await empDb.close();

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Sync auth-store.sqlite & user_credentials.json
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[sync] Syncing auth-store.sqlite & user_credentials.json...");
  const authLocalPath = path.join(dataDir, "auth-store.sqlite");
  const authDb = await open({ filename: authLocalPath, driver: sqlite3.Database });

  await authDb.run("BEGIN TRANSACTION");
  try {
    const cntCreds = await syncTableFromTurso(turso, authDb, "app_credentials");
    await authDb.run("COMMIT");

    const allCreds = await authDb.all("SELECT * FROM app_credentials");
    const diskCredentials = { admins: {}, employees: {} };
    for (const c of allCreds) {
      const normKey = String(c.user_id || "").trim().toLowerCase();
      let allowedPages = ["*"];
      try {
        if (c.allowed_pages) allowedPages = JSON.parse(c.allowed_pages);
      } catch {}

      let permissions = [];
      try {
        if (c.permissions) permissions = JSON.parse(c.permissions);
      } catch {}

      if (c.account_type === "admin") {
        diskCredentials.admins[normKey] = {
          userId: c.user_id,
          password: c.password_hash,
          role: c.role || "admin",
          allowedPages,
          permissions,
        };
      } else {
        diskCredentials.employees[normKey] = {
          userId: c.user_id,
          sapId: c.sap_id || "",
          password: c.password_hash,
          role: c.role || "employee",
        };
      }
    }

    const credJsonPath = path.join(ROOT_DIR, "backend", "user_credentials.json");
    fs.writeFileSync(credJsonPath, JSON.stringify(diskCredentials, null, 2), "utf8");
    console.log(`[sync] auth-store.sqlite & user_credentials.json updated: ${cntCreds} credentials synced.`);
  } catch (e) {
    await authDb.run("ROLLBACK");
    throw e;
  }
  await authDb.close();

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Sync biometrics.sqlite
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[sync] Syncing biometrics.sqlite...");
  const bioLocalPath = path.join(dataDir, "biometrics.sqlite");
  const bioDb = await open({ filename: bioLocalPath, driver: sqlite3.Database });

  await bioDb.run("BEGIN TRANSACTION");
  try {
    const cntBio = await syncTableFromTurso(turso, bioDb, "user_biometrics");
    await bioDb.run("COMMIT");
    console.log(`[sync] biometrics.sqlite updated: ${cntBio} biometrics synced.`);
  } catch (e) {
    await bioDb.run("ROLLBACK");
    throw e;
  }
  await bioDb.close();

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Sync cloud-store.sqlite, holidays.json & chat_messages.json
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[sync] Syncing cloud-store.sqlite, holidays.json & chat_messages.json...");
  const cloudLocalPath = path.join(dataDir, "cloud-store.sqlite");
  const cloudDb = await open({ filename: cloudLocalPath, driver: sqlite3.Database });

  await cloudDb.run("BEGIN TRANSACTION");
  try {
    const cntHol = await syncTableFromTurso(turso, cloudDb, "official_holidays");
    const cntChats = await syncTableFromTurso(turso, cloudDb, "chat_messages");
    await cloudDb.run("COMMIT");

    const tursoHols = await cloudDb.all("SELECT * FROM official_holidays ORDER BY holiday_date");
    const tursoChats = await cloudDb.all("SELECT * FROM chat_messages ORDER BY timestamp");

    // Save to holidays.json & chat_messages.json
    const jsonHolidays = tursoHols.map((h) => ({ date: h.holiday_date, name: h.holiday_name }));
    const holidaysJsonPath = path.join(dataDir, "holidays.json");
    fs.writeFileSync(holidaysJsonPath, JSON.stringify(jsonHolidays, null, 2), "utf8");

    const chatsJsonPath = path.join(ROOT_DIR, "backend", "chat_messages.json");
    fs.writeFileSync(chatsJsonPath, JSON.stringify(tursoChats, null, 2), "utf8");

    console.log(`[sync] cloud-store.sqlite, holidays.json (${cntHol}) & chat_messages.json (${cntChats}) updated.`);
  } catch (e) {
    await cloudDb.run("ROLLBACK");
    throw e;
  }
  await cloudDb.close();

  console.log("\n=======================================================");
  console.log("✅ SUCCESS: Turso Cloud SQLite fully synced to local project folder!");
  console.log("=======================================================\n");
}

if (require.main === module) {
  syncTursoToLocal().catch((err) => {
    console.error("[sync] Fatal error during Turso sync:", err);
    process.exit(1);
  });
}

module.exports = { syncTursoToLocal };
