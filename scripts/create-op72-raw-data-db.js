const { createOp72Database, OP72_DB_FILE_PATH } = require("../backend/op72Db");

(async () => {
  try {
    await createOp72Database();
    console.log(`OP72 Raw Data database ready at ${OP72_DB_FILE_PATH}`);
  } catch (error) {
    console.error("OP72 Raw Data database creation failed:", error.message);
    process.exit(1);
  }
})();
