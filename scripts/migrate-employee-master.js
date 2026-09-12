const { migrateEmployeeMasterIfNeeded } = require("../backend/employeeMigration");

(async () => {
  try {
    const result = await migrateEmployeeMasterIfNeeded();
    console.log("Employee Master SQLite migration result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Employee Master migration failed:", error.message);
    process.exit(1);
  }
})();
