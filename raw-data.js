const rawDataTableHead = document.getElementById("rawDataHead");
const rawDataTableBody = document.getElementById("rawDataBody");
const rawDataColgroup = document.getElementById("rawDataColgroup");
const rawDataMsg = document.getElementById("rawDataMsg");
const rawDataSaveState = document.getElementById("rawDataSaveState");
const toggleAddRawRecordBtn = document.getElementById("toggleAddRawRecord");
const togglePasteFromExcelBtn = document.getElementById("togglePasteFromExcel");
const deleteSelectedRowsBtn = document.getElementById("deleteSelectedRows");
const cleanupEmptyRowsBtn = document.getElementById("cleanupEmptyRows");
const saveRawSheetBtn = document.getElementById("saveRawSheet");
const rawDataAddPanel = document.getElementById("rawDataAddPanel");
const rawDataAddFields = document.getElementById("rawDataAddFields");
const submitRawRecordBtn = document.getElementById("submitRawRecord");
const cancelRawRecordBtn = document.getElementById("cancelRawRecord");
const rawDataPastePanel = document.getElementById("rawDataPastePanel");
const excelPasteInput = document.getElementById("excelPasteInput");
const excelPasteValidationMsg = document.getElementById("excelPasteValidationMsg");
const excelPastePreview = document.getElementById("excelPastePreview");
const previewExcelPasteBtn = document.getElementById("previewExcelPaste");
const importExcelPasteBtn = document.getElementById("importExcelPaste");
const cancelExcelPasteBtn = document.getElementById("cancelExcelPaste");

let isDirty = false;
let excelPastePreviewRows = [];

const RAW_DATA_API_BASE_URL = "http://localhost:3000";
const RAW_DATA_API_PATHS = {
  workbook: "/api/raw-data/workbook",
  dataRows: "/api/raw-data/data-rows",
  dataRow: "/api/raw-data/data-row",
  cleanup: "/api/raw-data/cleanup-empty-rows",
};

const RAW_DATA_COLUMNS = [
  "Date Entry",
  "Employee 1",
  "Employee 2",
  "Duty Type",
  "OT",
  "Mileage",
  "Outward Duty",
  "Outward Commenced",
  "Outward Terminated",
  "Inward Duty",
  "Inward Commenced",
  "Inward Terminated",
  "Remarks",
];

function getRawDataApiUrl(pathname) {
  return `${RAW_DATA_API_BASE_URL}${pathname}`;
}

let workbookData = {
  sheetName: "RawData",
  maxColumns: 0,
  headerRows: 2,
  rows: [],
  rowMeta: [],
};
let headerRowCount = 2;
let allRows = [];
let allRowMeta = [];
let detectedColumnCount = 0;
const dateColumnIndex = 0;
const otColumnIndex = 4;
const timeColumns = new Set([7, 8, 10, 11]);

function normalizeCellValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function isCompletelyBlankCells(cells) {
  return !Array.isArray(cells) || cells.every((cell) => normalizeCellValue(cell).trim() === "");
}

function setDirtyState(nextState) {
  isDirty = nextState;
  rawDataSaveState.textContent = isDirty
    ? "Unsaved changes - click Save Sheet before moving to another page."
    : "No unsaved changes.";
  rawDataSaveState.classList.toggle("is-dirty", isDirty);
}

function isEmptyRawDataRow(row) {
  if (!Array.isArray(row)) {
    return true;
  }

  for (let columnIndex = 0; columnIndex < RAW_DATA_COLUMNS.length; columnIndex += 1) {
    if (normalizeCellValue(row[columnIndex]).trim() !== "") {
      return false;
    }
  }

  return true;
}

function getVisibleColumnCount(rows) {
  let lastUsedColumn = 0;

  rows.forEach((row) => {
    row.forEach((value, columnIndex) => {
      if (normalizeCellValue(value).trim() !== "") {
        lastUsedColumn = Math.max(lastUsedColumn, columnIndex + 1);
      }
    });
  });

  return Math.max(RAW_DATA_COLUMNS.length, lastUsedColumn || detectedColumnCount || RAW_DATA_COLUMNS.length);
}

function formatDateDdMmmYy(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let dateValue;

  if (value instanceof Date) {
    dateValue = value;
  } else if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return normalizeCellValue(value);
    }
    dateValue = parsed;
  } else {
    return normalizeCellValue(value);
  }

  const dd = String(dateValue.getDate()).padStart(2, "0");
  const mmm = monthNames[dateValue.getMonth()];
  const yy = String(dateValue.getFullYear()).slice(-2);
  return `${dd}-${mmm}-${yy}`;
}

function formatTimeHhMm(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.abs(totalMinutes % 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const raw = normalizeCellValue(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  }

  return raw;
}

function formatCellValue(value, columnIndex, isDataRow) {
  if (!isDataRow) {
    return normalizeCellValue(value);
  }

  if (columnIndex === dateColumnIndex) {
    return formatDateDdMmmYy(value);
  }

  if (columnIndex === otColumnIndex || timeColumns.has(columnIndex)) {
    return formatTimeHhMm(value);
  }

  return normalizeCellValue(value);
}

function calculateColumnWidths(rows, columnCount) {
  const widths = Array.from({ length: columnCount + 1 }, (_, index) => (index === 0 ? 8 : 12));

  rows.forEach(({ row, isDataRow }) => {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const value = formatCellValue(row[columnIndex], columnIndex, isDataRow);
      const textLength = normalizeCellValue(value).replace(/\s+/g, " ").length;
      widths[columnIndex + 1] = Math.max(widths[columnIndex + 1], Math.min(34, Math.max(10, textLength + 2)));
    }
  });

  return widths;
}

function applyColumnWidths(widths) {
  rawDataColgroup.innerHTML = "";
  widths.forEach((width, index) => {
    const col = document.createElement("col");
    col.style.width = `${width}ch`;
    if (index === 1) {
      col.className = "sticky-first-col";
    }
    rawDataColgroup.appendChild(col);
  });
}

function createCell(tagName, value, className, columnIndex, isDataRow) {
  const cell = document.createElement(tagName);
  cell.textContent = formatCellValue(value, columnIndex, isDataRow);
  if (className) {
    cell.className = className;
  }
  if (tagName === "td") {
    cell.tabIndex = 0;
    cell.contentEditable = "true";
  }
  if (columnIndex === 0) {
    cell.classList.add("sticky-first-col");
  }
  return cell;
}

function syncHeaderOffsets() {
  const headerRows = Array.from(rawDataTableHead.querySelectorAll("tr"));
  let runningTop = 0;

  headerRows.forEach((row, rowIndex) => {
    const rowHeight = row.getBoundingClientRect().height;
    Array.from(row.querySelectorAll("th")).forEach((cell) => {
      cell.style.top = `${runningTop}px`;
      cell.style.zIndex = String(20 - rowIndex);
    });
    runningTop += rowHeight;
  });
}

function renderMergedHeader(headerRows, visibleColumnCount) {
  const topRow = headerRows[0] || [];
  const secondRow = headerRows[1] || [];

  const tr1 = document.createElement("tr");
  const tr2 = document.createElement("tr");

  const selectAllHeaderCell = document.createElement("th");
  selectAllHeaderCell.className = "header-row header-row-1";
  selectAllHeaderCell.rowSpan = 2;

  const selectAllCheckbox = document.createElement("input");
  selectAllCheckbox.type = "checkbox";
  selectAllCheckbox.id = "selectAllDataRows";
  selectAllCheckbox.title = "Select all data rows";
  selectAllHeaderCell.appendChild(selectAllCheckbox);
  tr1.appendChild(selectAllHeaderCell);

  for (let columnIndex = 0; columnIndex < visibleColumnCount; columnIndex += 1) {
    if (columnIndex === 6) {
      const outward = createCell("th", topRow[columnIndex], "header-row header-row-1", columnIndex, false);
      outward.colSpan = 3;
      tr1.appendChild(outward);
      continue;
    }

    if (columnIndex === 9) {
      const inward = createCell("th", topRow[columnIndex], "header-row header-row-1", columnIndex, false);
      inward.colSpan = 3;
      tr1.appendChild(inward);
      continue;
    }

    if ([7, 8, 10, 11].includes(columnIndex)) {
      continue;
    }

    const th = createCell("th", topRow[columnIndex], "header-row header-row-1", columnIndex, false);
    th.rowSpan = 2;
    tr1.appendChild(th);
  }

  const spacer = document.createElement("th");
  spacer.className = "header-row header-row-2";
  spacer.style.display = "none";
  tr2.appendChild(spacer);

  [6, 7, 8, 9, 10, 11]
    .filter((columnIndex) => columnIndex < visibleColumnCount)
    .forEach((columnIndex) => {
      tr2.appendChild(createCell("th", secondRow[columnIndex], "header-row header-row-2", columnIndex, false));
    });

  rawDataTableHead.appendChild(tr1);
  rawDataTableHead.appendChild(tr2);

  const selectAllControl = document.getElementById("selectAllDataRows");
  if (selectAllControl) {
    selectAllControl.addEventListener("change", () => {
      const rowCheckboxes = rawDataTableBody.querySelectorAll("input[type='checkbox'][data-row-select='1']");
      rowCheckboxes.forEach((checkbox) => {
        checkbox.checked = selectAllControl.checked;
      });
    });
  }
}

function addDataRow(row, visibleColumnCount, rowMeta) {
  const tr = document.createElement("tr");
  tr.dataset.rowIndex = String(Number(rowMeta?.rowIndex || -1));

  const selectTd = document.createElement("td");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.rowSelect = "1";
  selectTd.appendChild(checkbox);
  tr.appendChild(selectTd);

  for (let columnIndex = 0; columnIndex < visibleColumnCount; columnIndex += 1) {
    tr.appendChild(createCell("td", row[columnIndex], "", columnIndex, true));
  }
  rawDataTableBody.appendChild(tr);
}

function getCurrentSheetRows() {
  return Array.from(rawDataTableBody.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td"))
      .slice(1)
      .map((td) => td.textContent.trim())
  );
}

function getSelectedRowIndices() {
  return Array.from(rawDataTableBody.querySelectorAll("tr"))
    .filter((tr) => {
      const checkbox = tr.querySelector("input[type='checkbox'][data-row-select='1']");
      return Boolean(checkbox?.checked);
    })
    .map((tr) => Number(tr.dataset.rowIndex))
    .filter((value) => Number.isInteger(value) && value >= 0);
}

function setWorkbookState(nextWorkbookData) {
  workbookData = {
    sheetName: String(nextWorkbookData?.sheetName || "RawData"),
    maxColumns: Number(nextWorkbookData?.maxColumns || 0),
    headerRows: Number(nextWorkbookData?.headerRows || 2),
    rows: Array.isArray(nextWorkbookData?.rows) ? nextWorkbookData.rows : [],
    rowMeta: Array.isArray(nextWorkbookData?.rowMeta) ? nextWorkbookData.rowMeta : [],
  };

  headerRowCount = Math.max(1, workbookData.headerRows || 2);
  allRows = workbookData.rows;
  allRowMeta = workbookData.rowMeta;
  detectedColumnCount = Number(workbookData.maxColumns || (allRows[0] ? allRows[0].length : 0));
}

async function loadRawDataWorkbook() {
  const response = await fetch(getRawDataApiUrl(RAW_DATA_API_PATHS.workbook), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  setWorkbookState(payload);
}

async function saveRawDataSheet() {
  const rows = getCurrentSheetRows();
  const response = await fetch(getRawDataApiUrl(RAW_DATA_API_PATHS.dataRows), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ rows }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload?.message || `HTTP ${response.status}`);
  }

  await loadRawDataWorkbook();
  renderRawDataTable();
  rawDataMsg.textContent = "Sheet saved successfully.";
  setDirtyState(false);
}

async function addSingleRawDataRecord(rowValues) {
  const response = await fetch(getRawDataApiUrl(RAW_DATA_API_PATHS.dataRow), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ row: rowValues }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload?.message || `HTTP ${response.status}`);
  }
}

async function appendRawDataRows(rowValuesBatch) {
  const response = await fetch(getRawDataApiUrl(RAW_DATA_API_PATHS.dataRows), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ rows: rowValuesBatch }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload?.message || `HTTP ${response.status}`);
  }

  return response.json().catch(() => ({}));
}

async function deleteRawDataRecords(rowIndices) {
  const response = await fetch(getRawDataApiUrl(RAW_DATA_API_PATHS.dataRows), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ rowIndices }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload?.message || `HTTP ${response.status}`);
  }

  return response.json().catch(() => ({}));
}

async function cleanupEmptyRows() {
  const response = await fetch(getRawDataApiUrl(RAW_DATA_API_PATHS.cleanup), {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload?.message || `HTTP ${response.status}`);
  }

  return response.json().catch(() => ({}));
}

function scrollToLatestValidRecord() {
  const dataRows = Array.from(rawDataTableBody.querySelectorAll("tr"));
  if (!dataRows.length) {
    return;
  }

  let latestValidRow = null;
  for (let i = dataRows.length - 1; i >= 0; i -= 1) {
    const tr = dataRows[i];
    const values = Array.from(tr.querySelectorAll("td"))
      .slice(1)
      .map((td) => td.textContent.trim());

    if (!isEmptyRawDataRow(values)) {
      latestValidRow = tr;
      break;
    }
  }

  if (!latestValidRow) {
    return;
  }

  latestValidRow.scrollIntoView({ behavior: "auto", block: "center" });
}

function renderRawDataTable() {
  rawDataTableHead.innerHTML = "";
  rawDataTableBody.innerHTML = "";

  if (!allRows.length) {
    rawDataMsg.textContent = "Database connected - No Raw Data available.";
    return;
  }

  const visibleColumnCount = getVisibleColumnCount(allRows);
  const trimmedRows = allRows.map((row) => row.slice(0, visibleColumnCount));
  const headerRows = trimmedRows.slice(0, headerRowCount);
  const dataRows = trimmedRows.slice(headerRowCount);
  const dataRowsMeta = allRowMeta.slice(headerRowCount);

  const rowsForSizing = [
    ...headerRows.map((row) => ({ row, isDataRow: false })),
    ...dataRows.map((row) => ({ row, isDataRow: true })),
  ];

  applyColumnWidths(calculateColumnWidths(rowsForSizing, visibleColumnCount));

  renderMergedHeader(headerRows, visibleColumnCount);

  dataRows.forEach((row, rowNumber) => addDataRow(row, visibleColumnCount, dataRowsMeta[rowNumber]));

  if (!dataRows.length) {
    rawDataMsg.textContent = "Database connected - No Raw Data available.";
  } else {
    rawDataMsg.textContent = `Database connected - Loaded ${dataRows.length} data rows from SQLite.`;
  }

  window.requestAnimationFrame(() => {
    syncHeaderOffsets();
    scrollToLatestValidRecord();
  });
}

function renderAddRecordPanel() {
  rawDataAddFields.innerHTML = "";

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  RAW_DATA_COLUMNS.forEach((label, index) => {
    const tr = document.createElement("tr");

    const labelTd = document.createElement("td");
    labelTd.textContent = `${String.fromCharCode(65 + index)} - ${label}`;
    labelTd.style.padding = "6px";
    labelTd.style.fontWeight = "600";

    const inputTd = document.createElement("td");
    inputTd.style.padding = "6px";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "field-input";
    input.dataset.rawColumnIndex = String(index);
    input.placeholder = `Enter ${label}`;
    input.style.width = "100%";

    inputTd.appendChild(input);
    tr.appendChild(labelTd);
    tr.appendChild(inputTd);
    table.appendChild(tr);
  });

  rawDataAddFields.appendChild(table);
}

function resetExcelPasteState() {
  excelPastePreviewRows = [];
  excelPasteValidationMsg.textContent = "";
  excelPasteValidationMsg.style.color = "";
  excelPastePreview.innerHTML = "";
  excelPastePreview.style.display = "none";
  importExcelPasteBtn.disabled = true;
}

function closeExcelPastePanel(clearInput) {
  rawDataPastePanel.style.display = "none";
  if (clearInput) {
    excelPasteInput.value = "";
  }
  resetExcelPasteState();
}

function parseExcelClipboardText(rawText) {
  const text = normalizeCellValue(rawText);
  const lines = text.replace(/\r/g, "").split("\n");
  const importedRows = [];
  const detectedColumnSet = new Set();
  const skippedRows = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const columns = line.split("\t");

    if (isCompletelyBlankCells(columns)) {
      continue;
    }

    detectedColumnSet.add(columns.length);

    // Reject rows that have MORE than 13 columns — that's a structural mismatch
    if (columns.length > RAW_DATA_COLUMNS.length) {
      skippedRows.push(i + 1);
      continue;
    }

    // Rows with FEWER than 13 columns are fine — pad missing trailing columns with ""
    const paddedRow = Array.from({ length: RAW_DATA_COLUMNS.length }, (_, colIdx) =>
      normalizeCellValue(columns[colIdx] ?? "")
    );

    importedRows.push(paddedRow);
  }

  if (!importedRows.length) {
    return {
      ok: false,
      message: "No importable non-empty rows found in pasted data.",
      detectedColumns: Array.from(detectedColumnSet).sort((a, b) => a - b),
    };
  }

  const warningNote = skippedRows.length
    ? ` (${skippedRows.length} row(s) skipped — had more than 13 columns)`
    : "";

  return {
    ok: true,
    rows: importedRows,
    rowCount: importedRows.length,
    detectedColumns: Array.from(detectedColumnSet).sort((a, b) => a - b),
    warningNote,
  };
}

function buildPreviewRows(rows) {
  if (rows.length <= 6) {
    return rows.map((row) => ({ row, kind: "data" }));
  }

  return [
    ...rows.slice(0, 3).map((row) => ({ row, kind: "data" })),
    { kind: "ellipsis" },
    ...rows.slice(-3).map((row) => ({ row, kind: "data" })),
  ];
}

function renderExcelPreview(rows, detectedColumns) {
  excelPastePreview.innerHTML = "";

  const summary = document.createElement("p");
  summary.className = "helper-text";
  summary.textContent = `Rows detected: ${rows.length}. Columns detected: ${detectedColumns.join(", ") || "N/A"}. Expected: 13 (A:M).`;
  excelPastePreview.appendChild(summary);

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  RAW_DATA_COLUMNS.forEach((label, index) => {
    const th = document.createElement("th");
    th.textContent = `${String.fromCharCode(65 + index)} ${label}`;
    th.className = "header-row header-row-1";
    headRow.appendChild(th);
  });
  head.appendChild(headRow);
  table.appendChild(head);

  const body = document.createElement("tbody");
  const previewRows = buildPreviewRows(rows);
  previewRows.forEach((entry) => {
    const tr = document.createElement("tr");
    if (entry.kind === "ellipsis") {
      const td = document.createElement("td");
      td.colSpan = RAW_DATA_COLUMNS.length;
      td.textContent = "...";
      td.style.textAlign = "center";
      tr.appendChild(td);
    } else {
      entry.row.forEach((value) => {
        const td = document.createElement("td");
        td.textContent = normalizeCellValue(value);
        tr.appendChild(td);
      });
    }
    body.appendChild(tr);
  });
  table.appendChild(body);

  excelPastePreview.appendChild(table);
  excelPastePreview.style.display = "block";
}

function handleExcelPreview() {
  resetExcelPasteState();
  const parsed = parseExcelClipboardText(excelPasteInput.value);

  if (!parsed.ok) {
    excelPasteValidationMsg.textContent = parsed.message;
    excelPasteValidationMsg.style.color = "#b42318";
    return;
  }

  excelPastePreviewRows = parsed.rows;
  renderExcelPreview(parsed.rows, parsed.detectedColumns);
  const baseMsg = "Preview ready. Click Import to append all rows transactionally.";
  excelPasteValidationMsg.textContent = parsed.warningNote
    ? `${baseMsg} ${parsed.warningNote}`
    : baseMsg;
  excelPasteValidationMsg.style.color = parsed.warningNote ? "#7a4b00" : "#146c43";
  importExcelPasteBtn.disabled = false;
}

function resetAddRecordPanel() {
  rawDataAddFields.querySelectorAll("input[data-raw-column-index]").forEach((input) => {
    input.value = "";
  });
}

rawDataTableBody.addEventListener("input", () => {
  setDirtyState(true);
});

document.querySelectorAll(".nav-bar a").forEach((link) => {
  link.addEventListener("click", async (event) => {
    if (!isDirty) {
      return;
    }

    event.preventDefault();
    const shouldSave = window.confirm("Unsaved changes found. OK click karein to save ho kar next page khule, Cancel se yahin rahain.");
    if (!shouldSave) {
      return;
    }

    try {
      await saveRawDataSheet();
      window.location.href = link.getAttribute("href") || "index.html";
    } catch (error) {
      rawDataMsg.textContent = `Save failed: ${error.message}`;
    }
  });
});

window.addEventListener("beforeunload", (event) => {
  if (!isDirty) {
    return;
  }

  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("resize", () => {
  window.requestAnimationFrame(syncHeaderOffsets);
});

toggleAddRawRecordBtn.addEventListener("click", () => {
  const opening = rawDataAddPanel.style.display === "none";
  if (opening) {
    closeExcelPastePanel(false);
  }
  rawDataAddPanel.style.display = opening ? "block" : "none";
  if (opening) {
    renderAddRecordPanel();
  }
});

togglePasteFromExcelBtn.addEventListener("click", () => {
  const opening = rawDataPastePanel.style.display === "none";
  if (opening) {
    rawDataAddPanel.style.display = "none";
    rawDataPastePanel.style.display = "block";
    excelPasteInput.focus();
  } else {
    closeExcelPastePanel(false);
  }
});

cancelRawRecordBtn.addEventListener("click", () => {
  resetAddRecordPanel();
  rawDataAddPanel.style.display = "none";
});

previewExcelPasteBtn.addEventListener("click", () => {
  handleExcelPreview();
});

excelPasteInput.addEventListener("paste", () => {
  window.setTimeout(() => {
    handleExcelPreview();
  }, 0);
});

cancelExcelPasteBtn.addEventListener("click", () => {
  closeExcelPastePanel(true);
});

importExcelPasteBtn.addEventListener("click", async () => {
  if (!excelPastePreviewRows.length) {
    excelPasteValidationMsg.textContent = "Please preview valid Excel data before importing.";
    excelPasteValidationMsg.style.color = "#b42318";
    return;
  }

  importExcelPasteBtn.disabled = true;
  try {
    const result = await appendRawDataRows(excelPastePreviewRows);
    await loadRawDataWorkbook();
    renderRawDataTable();
    setDirtyState(false);
    rawDataMsg.textContent = `Successfully imported ${Number(result?.savedRowCount || excelPastePreviewRows.length)} rows from Excel.`;
    closeExcelPastePanel(true);
  } catch (error) {
    excelPasteValidationMsg.textContent = `Import failed: ${error.message}`;
    excelPasteValidationMsg.style.color = "#b42318";
    importExcelPasteBtn.disabled = false;
  }
});

submitRawRecordBtn.addEventListener("click", async () => {
  const rowValues = Array.from(rawDataAddFields.querySelectorAll("input[data-raw-column-index]"))
    .sort((a, b) => Number(a.dataset.rawColumnIndex) - Number(b.dataset.rawColumnIndex))
    .map((input) => input.value.trim());

  try {
    await addSingleRawDataRecord(rowValues);
    rawDataMsg.textContent = "RawData record added successfully.";
    rawDataAddPanel.style.display = "none";
    resetAddRecordPanel();
    await loadRawDataWorkbook();
    renderRawDataTable();
    setDirtyState(false);
  } catch (error) {
    rawDataMsg.textContent = `Add failed: ${error.message}`;
  }
});

deleteSelectedRowsBtn.addEventListener("click", async () => {
  const selectedRowIndices = getSelectedRowIndices();
  if (!selectedRowIndices.length) {
    rawDataMsg.textContent = "No data rows selected for deletion.";
    return;
  }

  const confirmationMessage = selectedRowIndices.length === 1
    ? "Are you sure you want to delete this Raw Data record?"
    : `Are you sure you want to delete ${selectedRowIndices.length} selected Raw Data records?`;

  const confirmed = window.confirm(confirmationMessage);
  if (!confirmed) {
    rawDataMsg.textContent = "Delete cancelled. No records were removed.";
    return;
  }

  try {
    const result = await deleteRawDataRecords(selectedRowIndices);
    await loadRawDataWorkbook();
    renderRawDataTable();
    setDirtyState(false);
    rawDataMsg.textContent = `Deleted ${Number(result?.deletedCount || 0)} records successfully.`;
  } catch (error) {
    rawDataMsg.textContent = `Delete failed: ${error.message}`;
  }
});

cleanupEmptyRowsBtn.addEventListener("click", async () => {
  try {
    const result = await cleanupEmptyRows();
    await loadRawDataWorkbook();
    renderRawDataTable();
    setDirtyState(false);
    rawDataMsg.textContent = `Empty row cleanup completed. Removed ${Number(result?.cleanedEmptyCount || 0)} empty rows.`;
  } catch (error) {
    rawDataMsg.textContent = `Cleanup failed: ${error.message}`;
  }
});

saveRawSheetBtn.addEventListener("click", async () => {
  try {
    await saveRawDataSheet();
  } catch (error) {
    rawDataMsg.textContent = `Save failed: ${error.message}`;
  }
});

async function initializeRawDataPage() {
  rawDataMsg.textContent = "Loading RawData sheet from database...";
  try {
    await loadRawDataWorkbook();
    renderRawDataTable();
    setDirtyState(false);
  } catch (error) {
    rawDataMsg.textContent = `Unable to load RawData from database: ${error.message}`;
  }
}

initializeRawDataPage();
