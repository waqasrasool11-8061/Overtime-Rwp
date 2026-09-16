const { createClient } = require("@libsql/client");

let tursoAdapterInstance = null;

function isTursoConfigured() {
  return Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL.trim());
}

function sanitizeArgs(params) {
  let args = [];
  if (params.length === 1 && Array.isArray(params[0])) {
    args = params[0];
  } else if (params.length > 0) {
    args = params;
  }
  return args.map((v) => (v === undefined ? null : v));
}

function isTxCommand(sql) {
  const trimmed = String(sql || "").trim().replace(/;$/, "").toUpperCase();
  return (
    trimmed === "BEGIN" ||
    trimmed === "BEGIN TRANSACTION" ||
    trimmed === "COMMIT" ||
    trimmed === "ROLLBACK" ||
    trimmed === "END" ||
    trimmed === "END TRANSACTION"
  );
}

function createTursoAdapter() {
  const url = process.env.TURSO_DATABASE_URL.trim();
  const authToken = (process.env.TURSO_AUTH_TOKEN || "").trim() || undefined;

  console.log(`[turso] Initializing Turso Cloud SQLite connection (${url})`);

  const client = createClient({
    url,
    authToken,
  });

  const adapter = {
    isTurso: true,
    client,

    async get(sql, ...params) {
      if (isTxCommand(sql)) return undefined;
      const args = sanitizeArgs(params);
      const res = await client.execute({ sql, args });
      return res.rows[0];
    },

    async all(sql, ...params) {
      if (isTxCommand(sql)) return [];
      const args = sanitizeArgs(params);
      const res = await client.execute({ sql, args });
      return res.rows;
    },

    async run(sql, ...params) {
      if (isTxCommand(sql)) {
        return { lastID: undefined, changes: 0 };
      }
      const args = sanitizeArgs(params);
      const res = await client.execute({ sql, args });
      return {
        lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined,
        changes: res.rowsAffected || 0,
      };
    },

    async exec(sql) {
      if (isTxCommand(sql)) {
        return;
      }
      await client.executeMultiple(sql);
    },

    async prepare(sql) {
      let buffer = [];
      const BATCH_SIZE = 250;

      async function flushBuffer() {
        if (buffer.length === 0) return;
        const currentBatch = buffer;
        buffer = [];
        await client.batch(currentBatch, "write");
      }

      return {
        async run(...params) {
          const args = sanitizeArgs(params);
          buffer.push({ sql, args });
          if (buffer.length >= BATCH_SIZE) {
            await flushBuffer();
          }
          return { lastID: undefined, changes: 1 };
        },

        async get(...params) {
          await flushBuffer();
          return adapter.get(sql, ...params);
        },

        async all(...params) {
          await flushBuffer();
          return adapter.all(sql, ...params);
        },

        async finalize() {
          await flushBuffer();
        },
      };
    },

    async close() {
      // Safe no-op on HTTP client
    },
  };

  return adapter;
}

function getTursoClient() {
  if (!isTursoConfigured()) {
    return null;
  }
  if (!tursoAdapterInstance) {
    tursoAdapterInstance = createTursoAdapter();
  }
  return tursoAdapterInstance;
}

module.exports = {
  isTursoConfigured,
  getTursoClient,
};
