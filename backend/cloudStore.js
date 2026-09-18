const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { isTursoConfigured, getTursoClient } = require("./tursoClient");

const CLOUD_STORE_FILE_PATH = path.join(__dirname, "..", "data", "cloud-store.sqlite");
const CHAT_STORAGE_PATH = path.join(__dirname, "chat_messages.json");
const HOLIDAYS_FILE_PATH = path.join(__dirname, "..", "data", "holidays.json");

let cloudStorePromise = null;
let cloudStoreInitialized = false;

async function getCloudStoreDb() {
  if (isTursoConfigured()) {
    const db = getTursoClient();
    if (!cloudStoreInitialized) {
      await initCloudStore(db);
      cloudStoreInitialized = true;
    }
    return db;
  }

  if (!cloudStorePromise) {
    cloudStorePromise = open({
      filename: CLOUD_STORE_FILE_PATH,
      driver: sqlite3.Database,
    }).then(async (db) => {
      await initCloudStore(db);
      return db;
    });
  }

  return cloudStorePromise;
}

async function initCloudStore(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      sender TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      receiver TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages (timestamp);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages (sender);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver ON chat_messages (receiver);

    CREATE TABLE IF NOT EXISTS official_holidays (
      holiday_date TEXT PRIMARY KEY,
      holiday_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed chat_messages if table is empty and JSON exists
  try {
    const chatCountRow = await db.get("SELECT COUNT(*) AS count FROM chat_messages");
    const chatCount = Number(chatCountRow?.count || 0);
    if (chatCount === 0 && fs.existsSync(CHAT_STORAGE_PATH)) {
      const raw = fs.readFileSync(CHAT_STORAGE_PATH, "utf8");
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        console.log(`[cloudStore] Seeding ${list.length} chat message(s) into database...`);
        for (const m of list) {
          const isRead = m.read !== false && m.senderRole !== "employee" ? 1 : (m.read ? 1 : 0);
          await db.run(
            `INSERT OR IGNORE INTO chat_messages (id, sender, sender_role, receiver, text, timestamp, is_read)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            m.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            m.sender || "System",
            m.senderRole || "admin",
            m.receiver || "ALL",
            m.text || "",
            m.timestamp || new Date().toISOString(),
            isRead
          );
        }
      }
    }
  } catch (err) {
    console.warn("[cloudStore] Chat seed check warning:", err.message);
  }

  // Seed official_holidays if table is empty and JSON exists
  try {
    const holCountRow = await db.get("SELECT COUNT(*) AS count FROM official_holidays");
    const holCount = Number(holCountRow?.count || 0);
    if (holCount === 0 && fs.existsSync(HOLIDAYS_FILE_PATH)) {
      const raw = fs.readFileSync(HOLIDAYS_FILE_PATH, "utf8");
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        console.log(`[cloudStore] Seeding ${list.length} holiday(s) into database...`);
        for (const h of list) {
          const date = typeof h === "string" ? h : String(h.date || "");
          const name = typeof h === "object" ? String(h.name || "") : "";
          if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            await db.run(
              `INSERT OR IGNORE INTO official_holidays (holiday_date, holiday_name) VALUES (?, ?)`,
              date,
              name
            );
          }
        }
      }
    }
  } catch (err) {
    console.warn("[cloudStore] Holidays seed check warning:", err.message);
  }
}

// ── Chat Operations ─────────────────────────────────────────────────────────

async function getChatMessages(employeeFilter = "") {
  try {
    const db = await getCloudStoreDb();
    const rows = await db.all("SELECT id, sender, sender_role AS senderRole, receiver, text, timestamp, is_read FROM chat_messages ORDER BY timestamp ASC");
    const list = rows.map((r) => ({
      id: r.id,
      sender: r.sender,
      senderRole: r.senderRole,
      receiver: r.receiver,
      text: r.text,
      timestamp: r.timestamp,
      read: Boolean(r.is_read),
    }));

    if (employeeFilter) {
      const filter = employeeFilter.trim().toLowerCase();
      return list.filter(
        (m) =>
          m.receiver === "ALL" ||
          String(m.sender || "").toLowerCase() === filter ||
          String(m.receiver || "").toLowerCase() === filter
      );
    }
    return list;
  } catch (err) {
    console.error("[cloudStore] getChatMessages error:", err.message);
    // Fallback to local json if DB error
    try {
      if (fs.existsSync(CHAT_STORAGE_PATH)) {
        return JSON.parse(fs.readFileSync(CHAT_STORAGE_PATH, "utf8"));
      }
    } catch {}
    return [];
  }
}

async function saveChatMessage(msg) {
  const messageObj = {
    id: msg?.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sender: msg?.sender || "Unknown",
    senderRole: msg?.senderRole || "employee",
    receiver: msg?.receiver || "ALL",
    text: msg?.text || "",
    timestamp: msg?.timestamp || new Date().toISOString(),
    read: Boolean(msg?.read),
  };

  try {
    const db = await getCloudStoreDb();
    const isRead = messageObj.read ? 1 : 0;
    await db.run(
      `INSERT OR REPLACE INTO chat_messages (id, sender, sender_role, receiver, text, timestamp, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      messageObj.id,
      messageObj.sender,
      messageObj.senderRole,
      messageObj.receiver,
      messageObj.text,
      messageObj.timestamp,
      isRead
    );
  } catch (err) {
    console.error("[cloudStore] saveChatMessage error:", err.message);
  }

  // Disk fallback sync
  try {
    let list = [];
    if (fs.existsSync(CHAT_STORAGE_PATH)) {
      list = JSON.parse(fs.readFileSync(CHAT_STORAGE_PATH, "utf8"));
    }
    const idx = list.findIndex((m) => m.id === messageObj.id);
    if (idx >= 0) list[idx] = messageObj;
    else list.push(messageObj);
    fs.writeFileSync(CHAT_STORAGE_PATH, JSON.stringify(list, null, 2), "utf8");
  } catch {}

  return messageObj;
}

async function markChatRead(employeeName) {
  if (!employeeName) return { success: true, employee: "", updatedCount: 0 };
  const filter = employeeName.trim().toLowerCase();
  let updatedCount = 0;
  try {
    const db = await getCloudStoreDb();
    const res = await db.run(
      "UPDATE chat_messages SET is_read = 1 WHERE LOWER(sender) = ? AND sender_role = 'employee' AND is_read = 0",
      filter
    );
    updatedCount = res?.changes || 0;
  } catch (err) {
    console.error("[cloudStore] markChatRead error:", err.message);
  }

  // Disk fallback sync
  try {
    if (fs.existsSync(CHAT_STORAGE_PATH)) {
      const list = JSON.parse(fs.readFileSync(CHAT_STORAGE_PATH, "utf8"));
      let changed = false;
      for (const m of list) {
        if (String(m.sender || "").toLowerCase() === filter && m.senderRole === "employee" && !m.read) {
          m.read = true;
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(CHAT_STORAGE_PATH, JSON.stringify(list, null, 2), "utf8");
      }
    }
  } catch {}

  return { success: true, employee: employeeName, updatedCount };
}

async function getUnreadChatCount() {
  try {
    const db = await getCloudStoreDb();
    const row = await db.get("SELECT COUNT(*) AS count FROM chat_messages WHERE sender_role = 'employee' AND is_read = 0");
    return Number(row?.count || 0);
  } catch (err) {
    console.error("[cloudStore] getUnreadChatCount error:", err.message);
    return 0;
  }
}

async function getChatThreads(empLookup) {
  const all = await getChatMessages();
  const threadMap = new Map();

  for (const m of all) {
    if (m.receiver === "ALL" && m.senderRole !== "employee") continue;

    let empName = "";
    if (m.senderRole === "employee") {
      empName = String(m.sender || "").trim();
    } else if (m.receiver && m.receiver !== "ALL") {
      empName = String(m.receiver || "").trim();
    }
    if (!empName) continue;

    const key = empName.toLowerCase();
    if (!threadMap.has(key)) {
      const info = (empLookup && empLookup.get(key)) || { sapId: "", name: empName, designation: "Staff", station: "RWP" };
      threadMap.set(key, {
        employeeName: info.name || empName,
        sapId: info.sapId || "",
        designation: info.designation || "Staff",
        station: info.station || "RWP",
        lastMessage: "",
        lastTimestamp: "",
        unreadCount: 0,
        totalMessages: 0,
      });
    }

    const thread = threadMap.get(key);
    thread.totalMessages++;
    if (!thread.lastTimestamp || new Date(m.timestamp) >= new Date(thread.lastTimestamp)) {
      thread.lastMessage = m.text;
      thread.lastTimestamp = m.timestamp;
    }
    if (m.senderRole === "employee" && !m.read) {
      thread.unreadCount++;
    }
  }

  const threads = Array.from(threadMap.values()).sort((a, b) => {
    if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
    if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
    return new Date(b.lastTimestamp || 0).getTime() - new Date(a.lastTimestamp || 0).getTime();
  });

  const totalUnread = threads.reduce((acc, t) => acc + (t.unreadCount || 0), 0);
  return { threads, totalUnread };
}

// ── Holidays Operations ─────────────────────────────────────────────────────

async function getHolidays(monthFilter = "") {
  try {
    const db = await getCloudStoreDb();
    let rows = [];
    if (monthFilter && /^\d{4}-\d{2}$/.test(monthFilter)) {
      rows = await db.all(
        "SELECT holiday_date AS date, holiday_name AS name FROM official_holidays WHERE holiday_date LIKE ? ORDER BY holiday_date ASC",
        `${monthFilter}%`
      );
    } else {
      rows = await db.all(
        "SELECT holiday_date AS date, holiday_name AS name FROM official_holidays ORDER BY holiday_date ASC"
      );
    }
    return rows.map((r) => ({ date: r.date, name: r.name || "" }));
  } catch (err) {
    console.error("[cloudStore] getHolidays error:", err.message);
    try {
      if (fs.existsSync(HOLIDAYS_FILE_PATH)) {
        const raw = fs.readFileSync(HOLIDAYS_FILE_PATH, "utf8");
        const list = JSON.parse(raw);
        if (monthFilter) return list.filter((h) => h.date.startsWith(monthFilter));
        return list;
      }
    } catch {}
    return [];
  }
}

async function addOrUpdateHolidays(dates, names = {}) {
  const normalized = [];
  if (Array.isArray(dates)) {
    for (const item of dates) {
      if (typeof item === "string") {
        const d = item.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          normalized.push({ date: d, name: String(names[d] || "").trim() });
        }
      } else if (item && typeof item === "object") {
        const d = String(item.date || item.holiday_date || "").trim();
        const n = String(item.name || item.holiday_name || names[d] || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          normalized.push({ date: d, name: n });
        }
      }
    }
  }

  if (!normalized.length) return [];

  try {
    const db = await getCloudStoreDb();
    for (const item of normalized) {
      await db.run(
        `INSERT OR REPLACE INTO official_holidays (holiday_date, holiday_name) VALUES (?, ?)`,
        item.date,
        item.name
      );
    }
  } catch (err) {
    console.error("[cloudStore] addOrUpdateHolidays error:", err.message);
  }

  // Update disk backup
  try {
    const all = await getHolidays();
    fs.writeFileSync(HOLIDAYS_FILE_PATH, JSON.stringify(all, null, 2), "utf8");
  } catch {}

  return normalized.map((item) => item.date);
}

async function deleteHolidays(dates) {
  const toRemove = (Array.isArray(dates) ? dates : [])
    .map((d) => String(d).trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

  if (!toRemove.length) return 0;

  try {
    const db = await getCloudStoreDb();
    for (const d of toRemove) {
      await db.run("DELETE FROM official_holidays WHERE holiday_date = ?", d);
    }
  } catch (err) {
    console.error("[cloudStore] deleteHolidays error:", err.message);
  }

  // Update disk backup
  try {
    const all = await getHolidays();
    fs.writeFileSync(HOLIDAYS_FILE_PATH, JSON.stringify(all, null, 2), "utf8");
  } catch {}

  return toRemove.length;
}

module.exports = {
  getCloudStoreDb,
  initCloudStore,
  getChatMessages,
  saveChatMessage,
  markChatRead,
  getUnreadChatCount,
  getChatThreads,
  getHolidays,
  addOrUpdateHolidays,
  deleteHolidays,
};
