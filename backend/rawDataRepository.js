const WORKBOOK_CODE = "raw-data";
const RAW_DATA_COLUMN_COUNT = 13;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function toJson(value) {
  return JSON.stringify(value ?? []);
}

function fromJson(text) {
  try {
    const parsed = JSON.parse(String(text || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isRowEmptyForRawData(row) {
  if (!Array.isArray(row)) {
    return true;
  }

  for (let i = 0; i < RAW_DATA_COLUMN_COUNT; i += 1) {
    const value = row[i];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return false;
    }
  }

  return true;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const asDate = new Date(excelEpoch.getTime() + Math.round(value * 86400000));
    if (!Number.isNaN(asDate.getTime())) {
      return asDate;
    }
  }

  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const dmyShort = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (dmyShort) {
    const day = Number(dmyShort[1]);
    const monthLabel = dmyShort[2].toUpperCase();
    const monthIndex = MONTHS.indexOf(monthLabel);
    const year = 2000 + Number(dmyShort[3]);
    if (monthIndex >= 0 && day >= 1 && day <= 31) {
      const parsed = new Date(year, monthIndex, day);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  const dmyLong = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmyLong) {
    const day = Number(dmyLong[1]);
    const month = Number(dmyLong[2]);
    const year = Number(dmyLong[3]);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

function monthLabelFromDateValue(value) {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return "";
  }

  return MONTHS[parsed.getMonth()] || "";
}

function normalizeMonthLabel(value) {
  const monthLabel = normalizeText(value).toUpperCase();
  if (!MONTHS.includes(monthLabel)) {
    return "";
  }
  return monthLabel;
}

async function getWorkbookByCode(db, code = WORKBOOK_CODE) {
  return db.get(
    `SELECT id, code, sheet_name AS sheetName, header_row_count AS headerRowCount, max_columns AS maxColumns
     FROM raw_data_workbooks
     WHERE code = ?`,
    [code]
  );
}

async function upsertWorkbook(db, { code = WORKBOOK_CODE, sheetName, headerRowCount, maxColumns }) {
  await db.run(
    `INSERT INTO raw_data_workbooks (code, sheet_name, header_row_count, max_columns)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       sheet_name = excluded.sheet_name,
       header_row_count = excluded.header_row_count,
       max_columns = excluded.max_columns,
       updated_at = datetime('now')`,
    [code, sheetName, headerRowCount, maxColumns]
  );

  return getWorkbookByCode(db, code);
}

async function countWorkbookRows(db, workbookId) {
  const row = await db.get(
    `SELECT COUNT(*) AS count
     FROM raw_data_rows
     WHERE workbook_id = ?`,
    [workbookId]
  );
  return Number(row?.count || 0);
}

async function insertWorkbookRows(db, workbookId, rows, headerRowCount) {
  const stmt = await db.prepare(
    `INSERT INTO raw_data_rows (workbook_id, row_index, row_kind, row_values_json)
     VALUES (?, ?, ?, ?)`
  );

  try {
    for (let i = 0; i < rows.length; i += 1) {
      const row = Array.isArray(rows[i]) ? rows[i] : [];
      await stmt.run(workbookId, i, i < headerRowCount ? "header" : "data", toJson(row));
    }
  } finally {
    await stmt.finalize();
  }
}

async function getWorkbookRows(db, workbookId) {
  const rows = await db.all(
    `SELECT row_values_json AS rowValues
     FROM raw_data_rows
     WHERE workbook_id = ?
     ORDER BY row_index ASC`,
    [workbookId]
  );

  return rows.map((row) => fromJson(row.rowValues));
}

async function getWorkbookRowsWithMeta(db, workbookId) {
  const rows = await db.all(
    `SELECT id AS rowId, row_index AS rowIndex, row_kind AS rowKind, row_values_json AS rowValues
     FROM raw_data_rows
     WHERE workbook_id = ?
     ORDER BY row_index ASC`,
    [workbookId]
  );

  return rows.map((row) => ({
    rowId: Number(row.rowId),
    rowIndex: Number(row.rowIndex),
    rowKind: String(row.rowKind),
    rowValues: fromJson(row.rowValues),
  }));
}

async function getLastDataRowIndex(db, workbookId, headerRowCount) {
  const row = await db.get(
    `SELECT MAX(row_index) AS maxRowIndex
     FROM raw_data_rows
     WHERE workbook_id = ? AND row_kind = 'data'`,
    [workbookId]
  );

  if (row?.maxRowIndex === null || row?.maxRowIndex === undefined) {
    return Math.max(0, Number(headerRowCount || 0) - 1);
  }

  return Number(row.maxRowIndex);
}

async function appendDataRows(db, workbookId, headerRowCount, dataRows) {
  const sanitizedRows = Array.isArray(dataRows)
    ? dataRows.map((row) => (Array.isArray(row) ? row : []))
    : [];

  if (!sanitizedRows.length) {
    return 0;
  }

  let rowIndex = await getLastDataRowIndex(db, workbookId, headerRowCount);
  const insertStmt = await db.prepare(
    `INSERT INTO raw_data_rows (workbook_id, row_index, row_kind, row_values_json)
     VALUES (?, ?, 'data', ?)`
  );

  try {
    for (const row of sanitizedRows) {
      rowIndex += 1;
      await insertStmt.run(workbookId, rowIndex, toJson(row));
    }
  } finally {
    await insertStmt.finalize();
  }

  return {
    savedRowCount: sanitizedRows.length,
    lastInsertedRowIndex: rowIndex,
  };
}

async function replaceDataRows(db, workbookId, headerRowCount, dataRows) {
  const sanitizedRows = Array.isArray(dataRows)
    ? dataRows.map((row) => (Array.isArray(row) ? row : []))
    : [];

  await db.run(
    `DELETE FROM raw_data_rows
     WHERE workbook_id = ? AND row_kind = 'data'`,
    [workbookId]
  );

  const insertStmt = await db.prepare(
    `INSERT INTO raw_data_rows (workbook_id, row_index, row_kind, row_values_json)
     VALUES (?, ?, 'data', ?)`
  );

  try {
    for (let i = 0; i < sanitizedRows.length; i += 1) {
      await insertStmt.run(workbookId, headerRowCount + i, toJson(sanitizedRows[i]));
    }
  } finally {
    await insertStmt.finalize();
  }

  return sanitizedRows.length;
}

async function updateWorkbookMaxColumns(db, workbookId, maxColumns) {
  await db.run(
    `UPDATE raw_data_workbooks
     SET max_columns = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [maxColumns, workbookId]
  );
}

async function searchRawDataByEmployeeAndMonth(db, workbookId, employeeName, monthLabel, yearValue) {
  const targetEmployee = normalizeText(employeeName).toUpperCase();
  const targetMonth = normalizeMonthLabel(monthLabel);
  const targetYear = Number(yearValue);

  if (!targetEmployee) {
    throw new Error("Employee name is required.");
  }
  if (!targetMonth) {
    throw new Error("Valid month is required (JAN-DEC).");
  }
  if (!Number.isInteger(targetYear) || targetYear <= 0) {
    throw new Error("Valid year is required.");
  }

  const rows = await db.all(
    `SELECT id AS rowId, row_index AS rowIndex, row_values_json AS rowValues
     FROM raw_data_rows
     WHERE workbook_id = ?
       AND row_kind = 'data'
     ORDER BY row_index ASC`,
    [workbookId]
  );

  const matches = [];

  for (const row of rows) {
    const values = fromJson(row.rowValues);
    const employee1 = normalizeText(values[1]).toUpperCase();
    const employee2 = normalizeText(values[2]).toUpperCase();

    if (employee1 !== targetEmployee && employee2 !== targetEmployee) {
      continue;
    }

    const parsedDate = parseDateValue(values[0]);
    if (!parsedDate) {
      continue;
    }

    const rowMonth = MONTHS[parsedDate.getMonth()] || "";
    const rowYear = parsedDate.getFullYear();
    if (rowMonth !== targetMonth || rowYear !== targetYear) {
      continue;
    }

    matches.push({
      id: Number(row.rowId),
      rowIndex: Number(row.rowIndex),
      rowValues: values,
    });
  }

  return matches;
}

async function getDataRowsByIds(db, workbookId, rowIds) {
  const ids = Array.isArray(rowIds)
    ? rowIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : [];

  if (!ids.length) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.all(
    `SELECT id AS rowId, row_index AS rowIndex, row_values_json AS rowValues
     FROM raw_data_rows
     WHERE workbook_id = ?
       AND row_kind = 'data'
       AND id IN (${placeholders})`,
    [workbookId, ...ids]
  );

  return rows.map((row) => ({
    id: Number(row.rowId),
    rowIndex: Number(row.rowIndex),
    rowValues: fromJson(row.rowValues),
  }));
}

async function batchUpdateDataRowsById(db, workbookId, updates) {
  const safeUpdates = Array.isArray(updates)
    ? updates.filter((item) => Number.isInteger(Number(item?.id)) && Number(item.id) > 0 && Array.isArray(item?.rowValues))
    : [];

  if (!safeUpdates.length) {
    return 0;
  }

  const requestedIds = Array.from(new Set(safeUpdates.map((item) => Number(item.id))));
  const existingRows = await getDataRowsByIds(db, workbookId, requestedIds);
  if (existingRows.length !== requestedIds.length) {
    throw new Error("One or more records were not found.");
  }

  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const updateStmt = await db.prepare(
    `UPDATE raw_data_rows
     SET row_values_json = ?,
         updated_at = datetime('now')
     WHERE workbook_id = ?
       AND row_kind = 'data'
       AND id = ?`
  );

  try {
    for (const update of safeUpdates) {
      const id = Number(update.id);
      const existing = existingById.get(id);
      if (!existing) {
        throw new Error(`Record not found for id ${id}.`);
      }

      const nextValues = Array.from({ length: RAW_DATA_COLUMN_COUNT }, (_, index) => {
        const incoming = update.rowValues[index];
        return incoming === undefined ? normalizeText(existing.rowValues[index]) : normalizeText(incoming);
      });

      await updateStmt.run(toJson(nextValues), workbookId, id);
    }
  } finally {
    await updateStmt.finalize();
  }

  return safeUpdates.length;
}

async function deleteDataRowsByIndices(db, workbookId, rowIndices) {
  const uniqueIndices = Array.from(
    new Set(
      (Array.isArray(rowIndices) ? rowIndices : [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value))
    )
  );

  if (!uniqueIndices.length) {
    return 0;
  }

  const placeholders = uniqueIndices.map(() => "?").join(",");
  const params = [workbookId, ...uniqueIndices];

  const countRow = await db.get(
    `SELECT COUNT(*) AS count
     FROM raw_data_rows
     WHERE workbook_id = ?
       AND row_kind = 'data'
       AND row_index IN (${placeholders})`,
    params
  );

  const deletableCount = Number(countRow?.count || 0);
  if (deletableCount !== uniqueIndices.length) {
    throw new Error("One or more selected rows are invalid or protected.");
  }

  const deleteResult = await db.run(
    `DELETE FROM raw_data_rows
     WHERE workbook_id = ?
       AND row_kind = 'data'
       AND row_index IN (${placeholders})`,
    params
  );

  return Number(deleteResult?.changes || 0);
}

async function cleanupEmptyDataRows(db, workbookId) {
  const dataRows = await db.all(
    `SELECT id AS rowId, row_values_json AS rowValues
     FROM raw_data_rows
     WHERE workbook_id = ?
       AND row_kind = 'data'`,
    [workbookId]
  );

  const emptyRowIds = dataRows
    .filter((row) => isRowEmptyForRawData(fromJson(row.rowValues)))
    .map((row) => Number(row.rowId));

  if (!emptyRowIds.length) {
    return 0;
  }

  const placeholders = emptyRowIds.map(() => "?").join(",");
  const deleteResult = await db.run(
    `DELETE FROM raw_data_rows
     WHERE workbook_id = ?
       AND row_kind = 'data'
       AND id IN (${placeholders})`,
    [workbookId, ...emptyRowIds]
  );

  return Number(deleteResult?.changes || 0);
}

module.exports = {
  appendDataRows,
  batchUpdateDataRowsById,
  cleanupEmptyDataRows,
  deleteDataRowsByIndices,
  WORKBOOK_CODE,
  countWorkbookRows,
  getLastDataRowIndex,
  getDataRowsByIds,
  getWorkbookByCode,
  getWorkbookRows,
  getWorkbookRowsWithMeta,
  insertWorkbookRows,
  replaceDataRows,
  searchRawDataByEmployeeAndMonth,
  upsertWorkbook,
  updateWorkbookMaxColumns,
};
