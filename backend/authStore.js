const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { isTursoConfigured, getTursoClient } = require("./tursoClient");

const USER_CREDENTIALS_JSON_PATH = path.join(__dirname, "user_credentials.json");
const AUTH_STORE_SQLITE_PATH = path.join(__dirname, "..", "data", "auth-store.sqlite");

let cachedCredentials = null;
let authDbPromise = null;
let isInitialized = false;

// Default admin template if file or DB is completely empty
const DEFAULT_INITIAL_CREDENTIALS = {
  admins: {
    "vicky ch": {
      userId: "Vicky Ch",
      password: "$2b$10$cnCsrReCwRDPwZz1iIXoF.zyTIslQVChVdxY4MUDUjJFo4Crm24la", // Suit@1002
      role: "admin",
      allowedPages: ["*"],
    },
    "vicky raja": {
      userId: "Vicky Raja",
      password: "$2b$10$Bbd/gtCOnsC/jLJwFwsyOOJvcWwpThTdUxg8PW63C1B7WjDRnbatW", // Waqas@1002
      role: "restricted-admin",
      allowedPages: ["index.html", "genl-164.html", "loco-18.html", "raw-data.html", "raw-data-search.html", "video.html"],
    },
    "ehtisham": {
      userId: "EHTISHAM",
      password: "$2b$10$U0K1KYZ9y/LaN/mGg9qGIe/KrUHHMxW4xPZx6ig.XvbFw0b5SYHg6", // MKWSHED
      role: "sub-admin",
      allowedPages: ["index.html", "video.html"],
      permissions: ["dataEntry"],
    },
    "arsalan shah": {
      userId: "ARSALAN SHAH",
      password: "$2b$10$nKOqfp7XEBBluEp8WJyrr.ludTg8sdYfzu7PhZY5C2BRsXDnfu0Oa", // LLMSHED
      role: "sub-admin",
      allowedPages: ["index.html", "video.html"],
      permissions: ["dataEntry"],
    },
    "guest": {
      userId: "GUEST",
      password: "$2b$10$jRrK4iPPbXVlWlBS3W6NO.MVX3b1pKaVNOhYen.Ar7zQ8IbdqqH8C", // 1234
      role: "guest",
      allowedPages: ["*"],
      permissions: ["guestView"],
    },
  },
  employees: {},
};

async function getAuthDb() {
  if (isTursoConfigured()) {
    return getTursoClient();
  }

  if (!authDbPromise) {
    const dataDir = path.dirname(AUTH_STORE_SQLITE_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    authDbPromise = open({
      filename: AUTH_STORE_SQLITE_PATH,
      driver: sqlite3.Database,
    });
  }
  return authDbPromise;
}

function readDiskFallback() {
  try {
    if (fs.existsSync(USER_CREDENTIALS_JSON_PATH)) {
      const raw = fs.readFileSync(USER_CREDENTIALS_JSON_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed.admins) parsed.admins = {};
      if (!parsed.employees) parsed.employees = {};
      return parsed;
    }
  } catch (err) {
    console.warn("[authStore] readDiskFallback error:", err.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_INITIAL_CREDENTIALS));
}

function writeDiskFallback(data) {
  try {
    const dir = path.dirname(USER_CREDENTIALS_JSON_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USER_CREDENTIALS_JSON_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[authStore] writeDiskFallback error:", err.message);
  }
}

async function initAuthStore() {
  if (isInitialized && cachedCredentials) {
    return cachedCredentials;
  }

  // Start with disk fallback
  cachedCredentials = readDiskFallback();

  try {
    const db = await getAuthDb();

    // Create cloud table for credentials
    await db.exec(`
      CREATE TABLE IF NOT EXISTS app_credentials (
        id TEXT PRIMARY KEY,
        account_type TEXT NOT NULL,
        user_id TEXT NOT NULL,
        sap_id TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        allowed_pages TEXT,
        permissions TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_app_cred_type ON app_credentials (account_type);
      CREATE INDEX IF NOT EXISTS idx_app_cred_sap ON app_credentials (sap_id);
    `);

    // Check count of rows in cloud table
    const countRow = await db.get("SELECT COUNT(*) AS count FROM app_credentials");
    const count = Number(countRow?.count ?? countRow?.[0] ?? 0);

    if (count === 0) {
      // Seed from existing user_credentials.json into Turso
      console.log("[authStore] Cloud credentials table empty. Seeding initial accounts into Turso...");
      for (const [key, admin] of Object.entries(cachedCredentials.admins || {})) {
        if (!admin) continue;
        await db.run(
          `INSERT OR REPLACE INTO app_credentials (id, account_type, user_id, sap_id, password_hash, role, allowed_pages, permissions, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          `admin:${key.toLowerCase()}`,
          "admin",
          admin.userId || key,
          null,
          admin.password || "",
          admin.role || "sub-admin",
          JSON.stringify(admin.allowedPages || []),
          JSON.stringify(admin.permissions || [])
        );
      }

      for (const [sapId, emp] of Object.entries(cachedCredentials.employees || {})) {
        if (!emp) continue;
        await db.run(
          `INSERT OR REPLACE INTO app_credentials (id, account_type, user_id, sap_id, password_hash, role, allowed_pages, permissions, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          `employee:${sapId}`,
          "employee",
          emp.name || sapId,
          sapId,
          emp.password || "",
          "employee",
          "[]",
          "[]",
          emp.updatedAt || new Date().toISOString()
        );
      }
      console.log("[authStore] Seeded cloud credentials successfully.");
    } else {
      // Load all records from Turso Cloud into memory
      console.log(`[authStore] Loading ${count} credential record(s) from Turso Cloud...`);
      const rows = await db.all("SELECT * FROM app_credentials");
      
      const loaded = {
        admins: {},
        employees: {},
      };

      for (const r of rows) {
        let allowedPages = [];
        let permissions = [];
        try {
          if (r.allowed_pages) allowedPages = JSON.parse(r.allowed_pages);
        } catch {}
        try {
          if (r.permissions) permissions = JSON.parse(r.permissions);
        } catch {}

        if (r.account_type === "admin") {
          const key = (r.user_id || "").toLowerCase();
          loaded.admins[key] = {
            userId: r.user_id,
            password: r.password_hash,
            role: r.role,
            allowedPages,
            permissions,
          };
        } else if (r.account_type === "employee" && r.sap_id) {
          loaded.employees[r.sap_id] = {
            sapId: r.sap_id,
            name: r.user_id,
            password: r.password_hash,
            updatedAt: r.updated_at,
          };
        }
      }

      // Ensure default super admin exists if somehow missing
      if (!loaded.admins["vicky ch"]) {
        loaded.admins["vicky ch"] = DEFAULT_INITIAL_CREDENTIALS.admins["vicky ch"];
        await db.run(
          `INSERT OR REPLACE INTO app_credentials (id, account_type, user_id, sap_id, password_hash, role, allowed_pages, permissions, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          "admin:vicky ch",
          "admin",
          "Vicky Ch",
          null,
          DEFAULT_INITIAL_CREDENTIALS.admins["vicky ch"].password,
          "admin",
          '["*"]',
          "[]"
        );
      }

      // If local disk had employee records that were missing in DB, back-merge them
      for (const [sapId, emp] of Object.entries(cachedCredentials.employees || {})) {
        if (!loaded.employees[sapId] && emp && emp.password) {
          loaded.employees[sapId] = emp;
          await db.run(
            `INSERT OR REPLACE INTO app_credentials (id, account_type, user_id, sap_id, password_hash, role, allowed_pages, permissions, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            `employee:${sapId}`,
            "employee",
            emp.name || sapId,
            sapId,
            emp.password,
            "employee",
            "[]",
            "[]",
            emp.updatedAt || new Date().toISOString()
          );
        }
      }

      cachedCredentials = loaded;
      // Sync fresh credentials from Cloud to disk fallback
      writeDiskFallback(cachedCredentials);
      console.log(`[authStore] Credentials synced: ${Object.keys(cachedCredentials.admins).length} admin(s), ${Object.keys(cachedCredentials.employees).length} employee custom password(s).`);
    }

    isInitialized = true;
  } catch (err) {
    console.error("[authStore] Initialization warning (using disk fallback):", err.message);
  }

  return cachedCredentials;
}

function getCredentialsSync() {
  if (!cachedCredentials) {
    cachedCredentials = readDiskFallback();
  }
  return cachedCredentials;
}

async function saveCredentials(data) {
  if (!data || typeof data !== "object") return;

  // 1. Immediately update in-memory cache
  cachedCredentials = JSON.parse(JSON.stringify(data));

  // 2. Synchronous disk write fallback
  writeDiskFallback(cachedCredentials);

  // 3. Asynchronously persist to Turso Cloud SQLite
  try {
    const db = await getAuthDb();

    // Save Admins
    for (const [key, admin] of Object.entries(cachedCredentials.admins || {})) {
      if (!admin) continue;
      const cleanKey = key.toLowerCase();
      await db.run(
        `INSERT OR REPLACE INTO app_credentials (id, account_type, user_id, sap_id, password_hash, role, allowed_pages, permissions, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        `admin:${cleanKey}`,
        "admin",
        admin.userId || key,
        null,
        admin.password || "",
        admin.role || "sub-admin",
        JSON.stringify(admin.allowedPages || []),
        JSON.stringify(admin.permissions || [])
      );
    }

    // Save Employees
    for (const [sapId, emp] of Object.entries(cachedCredentials.employees || {})) {
      if (!emp || !sapId) continue;
      await db.run(
        `INSERT OR REPLACE INTO app_credentials (id, account_type, user_id, sap_id, password_hash, role, allowed_pages, permissions, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `employee:${sapId}`,
        "employee",
        emp.name || sapId,
        sapId,
        emp.password || "",
        "employee",
        "[]",
        "[]",
        emp.updatedAt || new Date().toISOString()
      );
    }

    // Clean up deleted admins in DB
    const cloudAdmins = await db.all("SELECT id FROM app_credentials WHERE account_type = 'admin'");
    for (const ca of cloudAdmins) {
      const key = (ca.id || "").replace(/^admin:/, "").toLowerCase();
      if (!cachedCredentials.admins[key]) {
        await db.run("DELETE FROM app_credentials WHERE id = ?", ca.id);
      }
    }

    // Clean up deleted employees in DB (e.g. when reset to default)
    const cloudEmployees = await db.all("SELECT id, sap_id FROM app_credentials WHERE account_type = 'employee'");
    for (const ce of cloudEmployees) {
      const sap = ce.sap_id || (ce.id || "").replace(/^employee:/, "");
      if (!cachedCredentials.employees[sap]) {
        await db.run("DELETE FROM app_credentials WHERE id = ?", ce.id);
      }
    }
  } catch (err) {
    console.error("[authStore] Failed to persist credentials to Cloud DB:", err.message);
  }
}

async function saveEmployeePassword(sapId, name, passwordHash) {
  const creds = getCredentialsSync();
  const cleanSap = String(sapId).trim();
  creds.employees[cleanSap] = {
    sapId: cleanSap,
    name: name || cleanSap,
    password: passwordHash,
    updatedAt: new Date().toISOString(),
  };
  await saveCredentials(creds);
}

module.exports = {
  initAuthStore,
  getCredentialsSync,
  saveCredentials,
  saveEmployeePassword,
};
