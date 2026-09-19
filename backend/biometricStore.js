const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { isTursoConfigured, getTursoClient } = require("./tursoClient");

const BIOMETRIC_SQLITE_PATH = path.join(__dirname, "..", "data", "biometrics.sqlite");

let biometricDbPromise = null;
let isInitialized = false;

async function getBiometricDb() {
  if (isTursoConfigured()) {
    return getTursoClient();
  }

  if (!biometricDbPromise) {
    const dataDir = path.dirname(BIOMETRIC_SQLITE_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    biometricDbPromise = open({
      filename: BIOMETRIC_SQLITE_PATH,
      driver: sqlite3.Database,
    });
  }
  return biometricDbPromise;
}

async function initBiometricStore() {
  if (isInitialized) return true;

  try {
    const db = await getBiometricDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_biometrics (
        credential_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        sap_id TEXT,
        public_key TEXT NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        device_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_biometrics_user ON user_biometrics (user_id);
      CREATE INDEX IF NOT EXISTS idx_biometrics_sap ON user_biometrics (sap_id);
    `);
    console.log("[biometricStore] Initialized user_biometrics table in Turso Cloud SQLite.");
    isInitialized = true;
    return true;
  } catch (err) {
    console.error("[biometricStore] Initialization error:", err.message);
    return false;
  }
}

async function saveBiometricCredential({ credentialId, userId, sapId, publicKey, deviceName }) {
  if (!credentialId || !userId) {
    throw new Error("credentialId and userId are required");
  }

  const db = await getBiometricDb();
  await db.run(
    `INSERT OR REPLACE INTO user_biometrics (credential_id, user_id, sap_id, public_key, counter, device_name, created_at)
     VALUES (?, ?, ?, ?, 0, ?, datetime('now'))`,
    credentialId,
    String(userId).trim(),
    sapId ? String(sapId).trim() : null,
    publicKey || "",
    deviceName || "Biometric Authenticator"
  );
  console.log(`[biometricStore] Saved biometric credential for ${userId} (${sapId || "Admin"})`);
}

async function getBiometricCredential(credentialId) {
  if (!credentialId) return null;
  const db = await getBiometricDb();
  const row = await db.get("SELECT * FROM user_biometrics WHERE credential_id = ?", credentialId);
  return row || null;
}

async function getUserBiometrics(userId, sapId) {
  const db = await getBiometricDb();
  if (sapId) {
    return await db.all("SELECT * FROM user_biometrics WHERE sap_id = ? OR user_id = ?", String(sapId).trim(), String(userId).trim());
  }
  return await db.all("SELECT * FROM user_biometrics WHERE user_id = ?", String(userId).trim());
}

async function deleteBiometricCredential(credentialId, userId) {
  const db = await getBiometricDb();
  if (userId) {
    await db.run("DELETE FROM user_biometrics WHERE credential_id = ? AND user_id = ?", credentialId, String(userId).trim());
  } else {
    await db.run("DELETE FROM user_biometrics WHERE credential_id = ?", credentialId);
  }
}

async function deleteUserBiometrics(userId, sapId) {
  const db = await getBiometricDb();
  if (sapId) {
    await db.run("DELETE FROM user_biometrics WHERE sap_id = ? OR user_id = ?", String(sapId).trim(), String(userId).trim());
  } else {
    await db.run("DELETE FROM user_biometrics WHERE user_id = ?", String(userId).trim());
  }
}

module.exports = {
  initBiometricStore,
  saveBiometricCredential,
  getBiometricCredential,
  getUserBiometrics,
  deleteBiometricCredential,
  deleteUserBiometrics,
};
