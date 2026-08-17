const { migrateRawDataIfNeeded } = require("../backend/rawDataMigration");

(async () => {
  try {
    const result = await migrateRawDataIfNeeded();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("RawData migration failed:", error.message);
    process.exit(1);
  }
})();
