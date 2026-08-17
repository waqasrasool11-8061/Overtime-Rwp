const fs = require("fs");
const path = require("path");

const { getDb } = require("./db");
const {
  WORKBOOK_CODE,
  countWorkbookRows,
  getWorkbookByCode,
  insertWorkbookRows,
  upsertWorkbook,
} = require("./rawDataRepository");

const LEGACY_SOURCE_PATH = path.join(__dirname, "..", "RawData.data.js");

function parseWorkbookFromLegacySource() {
  const sourceText = fs.readFileSync(LEGACY_SOURCE_PATH, "utf8");
  const match = sourceText.match(/window\.rawDataWorkbookData\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);

  if (!match) {
    throw new Error("Unable to parse legacy RawData source file.");
  }

  const workbook = JSON.parse(match[1]);
  if (!Array.isArray(workbook.rows)) {
    throw new Error("Legacy RawData source does not contain rows array.");
  }

  return workbook;
}

function calculateMaxColumns(rows, fallback) {
  const maxDetected = rows.reduce((maxCount, row) => {
    if (!Array.isArray(row)) {
      return maxCount;
    }
    return Math.max(maxCount, row.length);
  }, 0);

  return Math.max(1, Number(fallback || 0), maxDetected);
}

async function migrateRawDataIfNeeded() {
  const db = await getDb();
  const workbook = parseWorkbookFromLegacySource();
  const rows = workbook.rows;
  const headerRowCount = 2;
  const maxColumns = calculateMaxColumns(rows, workbook.maxColumns);

  await db.exec("BEGIN TRANSACTION");
  try {
    const upserted = await upsertWorkbook(db, {
      code: WORKBOOK_CODE,
      sheetName: workbook.sheetName || "RawData",
      headerRowCount,
      maxColumns,
    });

    const existingRows = await countWorkbookRows(db, upserted.id);
    if (existingRows === 0) {
      await insertWorkbookRows(db, upserted.id, rows, headerRowCount);
    }

    await db.exec("COMMIT");

    return {
      workbookId: upserted.id,
      rowCountInSource: rows.length,
      imported: existingRows === 0,
      existingRows,
      sourcePath: LEGACY_SOURCE_PATH,
    };
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = {
  migrateRawDataIfNeeded,
};
