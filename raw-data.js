const rawDataTableHead = document.getElementById("rawDataHead");
const rawDataTableBody = document.getElementById("rawDataBody");
const rawDataColgroup = document.getElementById("rawDataColgroup");
const rawDataMsg = document.getElementById("rawDataMsg");
const rawDataSaveState = document.getElementById("rawDataSaveState");
const toggleAddRawRecordBtn = document.getElementById("toggleAddRawRecord");
const togglePasteFromExcelBtn = document.getElementById("togglePasteFromExcel");
const copySelectedRawRowsBtn = document.getElementById("copySelectedRawRows");
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

// Month Accordion & Control Bar Elements
const rawDataControlBar = document.getElementById("rawDataControlBar");
const rawDataMonthJump = document.getElementById("rawDataMonthJump");
const rawDataExpandAll = document.getElementById("rawDataExpandAll");
const rawDataCollapseAll = document.getElementById("rawDataCollapseAll");
const rawDataTotalStats = document.getElementById("rawDataTotalStats");
const rawDataContainer = document.getElementById("rawDataContainer");
const rawDataLegacyWrap = document.getElementById("rawDataLegacyWrap");
const excelPasteMonthSummary = document.getElementById("excelPasteMonthSummary");

let isDirty = false;
let excelPastePreviewRows = [];

const RAW_DATA_API_BASE_URL = window.location.port === "5500"
  ? `http://${window.location.hostname}:3000`
  : "";
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

function parseDateToYyyyMm(value) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const monthMap = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };

  // 1. DD-MMM-YYYY or DD-MMM-YY (e.g. 01-Jan-2026 or 01-Jan-26 or 01-JAN-26)
  const dMmmYRegex = /^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})$/;
  const m1 = raw.match(dMmmYRegex);
  if (m1) {
    const mmm = m1[2].toLowerCase();
    const mm = monthMap[mmm];
    if (mm) {
      let yyyy = m1[3];
      if (yyyy.length === 2) {
        const yNum = Number(yyyy);
        yyyy = yNum >= 50 ? String(1900 + yNum) : String(2000 + yNum);
      }
      return `${yyyy}-${mm}`;
    }
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD
  const ymdRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
  const m2 = raw.match(ymdRegex);
  if (m2) {
    const yyyy = m2[1];
    const mm = String(m2[2]).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  // 3. DD-MM-YYYY or DD/MM/YYYY
  const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
  const m3 = raw.match(dmyRegex);
  if (m3) {
    const yyyy = m3[3];
    const mm = String(m3[2]).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  // 4. Try native Date parse
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  return null;
}

function formatMonthLabel(yyyyMm) {
  if (!yyyyMm || yyyyMm === "UNKNOWN") return "Other / Unspecified Date";
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const parts = yyyyMm.split("-");
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const monthName = monthNames[monthIdx] || parts[1];
  return `${monthName} - ${year}`;
}

function formatTimeHhMm(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const num = typeof value === "number" ? value : (typeof value === "string" && /^\d*\.\d+$/.test(value.trim()) ? parseFloat(value.trim()) : NaN);
  if (Number.isFinite(num) && num > 0 && num <= 1) {
    const totalMinutes = Math.round(num * 24 * 60);
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

function buildMergedHeaderElement(headerRows, visibleColumnCount, monthKey) {
  const topRow = headerRows[0] || [];
  const secondRow = headerRows[1] || [];

  const thead = document.createElement("thead");
  const tr1 = document.createElement("tr");
  const tr2 = document.createElement("tr");

  const selectAllHeaderCell = document.createElement("th");
  selectAllHeaderCell.className = "header-row header-row-1";
  selectAllHeaderCell.rowSpan = 2;

  const selectAllCheckbox = document.createElement("input");
  selectAllCheckbox.type = "checkbox";
  selectAllCheckbox.title = "Select all data rows in this month";
  selectAllCheckbox.dataset.monthSelectHeader = monthKey || "";
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

  thead.appendChild(tr1);
  thead.appendChild(tr2);

  selectAllCheckbox.addEventListener("change", () => {
    const table = selectAllCheckbox.closest("table");
    if (!table) return;
    const cbs = table.querySelectorAll("input[type='checkbox'][data-row-select='1']");
    cbs.forEach(cb => cb.checked = selectAllCheckbox.checked);
    const block = selectAllCheckbox.closest(".month-accordion-block");
    if (block) {
      const headerCb = block.querySelector("input[data-select-month]");
      if (headerCb) headerCb.checked = selectAllCheckbox.checked;
    }
  });

  return thead;
}

function buildColgroupElement(widths) {
  const colgroup = document.createElement("colgroup");
  widths.forEach((width, index) => {
    const col = document.createElement("col");
    col.style.width = `${width}ch`;
    if (index === 1) {
      col.className = "sticky-first-col";
    }
    colgroup.appendChild(col);
  });
  return colgroup;
}

function renderMergedHeader(headerRows, visibleColumnCount) {
  rawDataTableHead.innerHTML = "";
  const thead = buildMergedHeaderElement(headerRows, visibleColumnCount, "");
  while (thead.firstChild) {
    rawDataTableHead.appendChild(thead.firstChild);
  }
}

function addDataRow(row, visibleColumnCount, rowMeta) {
  addDataRowToTable(rawDataTableBody, row, visibleColumnCount, rowMeta);
}

function addDataRowToTable(targetBody, row, visibleColumnCount, rowMeta) {
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
  targetBody.appendChild(tr);
}

function getCurrentSheetRows() {
  if (rawDataContainer && rawDataContainer.children.length > 0) {
    const blocks = Array.from(rawDataContainer.querySelectorAll(".month-accordion-block"));
    // Sort blocks by monthKey ascending (earliest to latest) so stored data is chronologically consistent
    blocks.sort((a, b) => {
      const kA = a.dataset.monthKey || "";
      const kB = b.dataset.monthKey || "";
      if (kA === "UNKNOWN") return 1;
      if (kB === "UNKNOWN") return -1;
      return kA.localeCompare(kB);
    });

    const allTrs = [];
    blocks.forEach((b) => {
      const trs = Array.from(b.querySelectorAll("tbody tr"));
      allTrs.push(...trs);
    });

    return allTrs.map((tr) =>
      Array.from(tr.querySelectorAll("td"))
        .slice(1)
        .map((td) => td.textContent.trim())
    );
  }

  return Array.from(rawDataTableBody.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td"))
      .slice(1)
      .map((td) => td.textContent.trim())
  );
}

function getSelectedRowIndices() {
  const container = rawDataContainer && rawDataContainer.children.length > 0 ? rawDataContainer : rawDataTableBody;
  return Array.from(container.querySelectorAll("tbody tr"))
    .filter((tr) => {
      const checkbox = tr.querySelector("input[type='checkbox'][data-row-select='1']");
      return Boolean(checkbox?.checked);
    })
    .map((tr) => Number(tr.dataset.rowIndex))
    .filter((value) => Number.isInteger(value) && value >= 0);
}

function getSelectedRowsData() {
  const container = rawDataContainer && rawDataContainer.children.length > 0 ? rawDataContainer : rawDataTableBody;
  const checkedTrs = Array.from(container.querySelectorAll("tbody tr"))
    .filter((tr) => {
      const checkbox = tr.querySelector("input[type='checkbox'][data-row-select='1']");
      return Boolean(checkbox?.checked);
    });

  if (checkedTrs.length > 0) {
    return checkedTrs.map((tr) =>
      Array.from(tr.querySelectorAll("td"))
        .slice(1)
        .map((td) => td.textContent.trim())
    );
  }

  const activeTr = document.activeElement ? document.activeElement.closest("tr") : null;
  if (activeTr && container.contains(activeTr)) {
    return [
      Array.from(activeTr.querySelectorAll("td"))
        .slice(1)
        .map((td) => td.textContent.trim())
    ];
  }

  return [];
}

async function copyMonthDataToClipboard(monthKey, btn) {
  const block = document.getElementById(`monthBlock_${monthKey}`);
  if (!block) return;
  const trs = Array.from(block.querySelectorAll("tbody tr"));
  if (!trs.length) {
    rawDataMsg.textContent = "No data rows to copy in this month.";
    return;
  }

  const rowsData = trs.map((tr) =>
    Array.from(tr.querySelectorAll("td")).slice(1).map((td) => td.textContent.trim())
  );

  const tsv = rowsData.map((row) => row.join("\t")).join("\n");
  const success = await copyTextToClipboard(tsv);
  if (success) {
    const origHtml = btn.innerHTML;
    btn.innerHTML = "✅ Copied!";
    btn.style.background = "#16a34a";
    btn.style.borderColor = "#16a34a";
    btn.style.color = "#ffffff";
    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.style.background = "";
      btn.style.borderColor = "";
      btn.style.color = "";
    }, 1600);
    rawDataMsg.textContent = `Copied ${rowsData.length} rows for this month to clipboard (Excel ready).`;
  } else {
    rawDataMsg.textContent = "Failed to copy to clipboard.";
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("navigator.clipboard error, falling back:", err);
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    document.body.removeChild(textArea);
    return false;
  }
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
  if (rawDataContainer) rawDataContainer.innerHTML = "";
  if (rawDataTableHead) rawDataTableHead.innerHTML = "";
  if (rawDataTableBody) rawDataTableBody.innerHTML = "";

  if (!allRows.length) {
    if (rawDataControlBar) rawDataControlBar.style.display = "none";
    if (rawDataLegacyWrap) rawDataLegacyWrap.style.display = "none";
    rawDataMsg.textContent = "Database connected - No Raw Data available.";
    return;
  }

  const visibleColumnCount = getVisibleColumnCount(allRows);
  const trimmedRows = allRows.map((row) => row.slice(0, visibleColumnCount));
  const headerRows = trimmedRows.slice(0, headerRowCount);
  const dataRows = trimmedRows.slice(headerRowCount);
  const dataRowsMeta = allRowMeta.slice(headerRowCount);

  if (!dataRows.length) {
    if (rawDataControlBar) rawDataControlBar.style.display = "none";
    if (rawDataLegacyWrap) rawDataLegacyWrap.style.display = "none";
    rawDataMsg.textContent = "Database connected - No Raw Data available.";
    return;
  }

  const rowsForSizing = [
    ...headerRows.map((row) => ({ row, isDataRow: false })),
    ...dataRows.map((row) => ({ row, isDataRow: true })),
  ];

  const calculatedWidths = calculateColumnWidths(rowsForSizing, visibleColumnCount);

  // Group data rows by month
  const monthGroups = new Map();
  let lastMonth = null;

  dataRows.forEach((row, idx) => {
    const meta = dataRowsMeta[idx];
    let monthKey = parseDateToYyyyMm(row[0]);
    if (!monthKey && lastMonth) {
      monthKey = lastMonth;
    } else if (!monthKey) {
      monthKey = "UNKNOWN";
    } else {
      lastMonth = monthKey;
    }

    if (!monthGroups.has(monthKey)) {
      monthGroups.set(monthKey, {
        key: monthKey,
        label: formatMonthLabel(monthKey),
        items: [],
      });
    }
    monthGroups.get(monthKey).items.push({ row, meta });
  });

  // Sort months reverse chronologically (newest month first)
  const sortedKeys = Array.from(monthGroups.keys()).sort((a, b) => {
    if (a === "UNKNOWN") return 1;
    if (b === "UNKNOWN") return -1;
    return b.localeCompare(a);
  });

  // Setup Quick Control Bar
  if (rawDataControlBar) {
    rawDataControlBar.style.display = "flex";
    if (rawDataTotalStats) {
      rawDataTotalStats.textContent = `${dataRows.length} Records (${monthGroups.size} Months)`;
    }
    if (rawDataMonthJump) {
      rawDataMonthJump.innerHTML = `<option value="ALL">All Months (${dataRows.length} Records)</option>`;
      sortedKeys.forEach((key) => {
        const group = monthGroups.get(key);
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = `${group.label} (${group.items.length} records)`;
        rawDataMonthJump.appendChild(opt);
      });
    }
  }

  if (rawDataLegacyWrap) rawDataLegacyWrap.style.display = "none";

  if (rawDataContainer) {
    rawDataContainer.style.display = "flex";

    sortedKeys.forEach((key, index) => {
      const group = monthGroups.get(key);
      const isFirst = index === 0; // Newest month open by default

      const block = document.createElement("div");
      block.className = "month-accordion-block";
      block.id = `monthBlock_${key}`;
      block.dataset.monthKey = key;

      const header = document.createElement("div");
      header.className = `month-accordion-header ${isFirst ? "is-open" : ""}`;
      header.dataset.toggleMonth = key;
      header.innerHTML = `
        <div class="month-header-title-group">
          <span class="month-chevron">${isFirst ? "▼" : "▶"}</span>
          <span class="month-title-text">📅 ${group.label}</span>
          <span class="month-row-badge">${group.items.length} ${group.items.length === 1 ? "Record" : "Records"}</span>
        </div>
        <div class="month-header-actions">
          <button type="button" class="btn-month-copy" data-copy-month="${key}" title="Copy ${group.label} records to clipboard (Excel ready)">
            📋 Copy Month
          </button>
          <label class="month-select-label" title="Select/Deselect all records in ${group.label}">
            <input type="checkbox" data-select-month="${key}"> Select All
          </label>
        </div>
      `;

      const body = document.createElement("div");
      body.className = `month-accordion-body ${isFirst ? "" : "is-collapsed"}`;
      body.id = `monthBody_${key}`;

      const sheetWrap = document.createElement("div");
      sheetWrap.className = "sheet-wrap";

      const table = document.createElement("table");
      table.dataset.monthTable = key;
      table.appendChild(buildColgroupElement(calculatedWidths));
      table.appendChild(buildMergedHeaderElement(headerRows, visibleColumnCount, key));

      const tbody = document.createElement("tbody");
      group.items.forEach(({ row, meta }) => {
        addDataRowToTable(tbody, row, visibleColumnCount, meta);
      });
      table.appendChild(tbody);
      sheetWrap.appendChild(table);
      body.appendChild(sheetWrap);

      block.appendChild(header);
      block.appendChild(body);
      rawDataContainer.appendChild(block);
    });
  }

  rawDataMsg.textContent = `Database connected - Loaded ${dataRows.length} data rows across ${monthGroups.size} month blocks from SQLite.`;
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
  if (excelPasteMonthSummary) {
    excelPasteMonthSummary.innerHTML = "";
    excelPasteMonthSummary.style.display = "none";
  }
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

  // Calculate month breakdown for multi-month imports
  const monthCounts = new Map();
  parsed.rows.forEach((row) => {
    if (Array.isArray(row)) {
      const monthKey = parseDateToYyyyMm(row[0]) || "UNKNOWN";
      monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
    }
  });

  if (excelPasteMonthSummary && monthCounts.size > 0) {
    const chipsHtml = Array.from(monthCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mKey, count]) => `<span class="paste-month-chip">📅 ${formatMonthLabel(mKey)}: ${count} row${count === 1 ? "" : "s"}</span>`)
      .join(" ");
    excelPasteMonthSummary.innerHTML = `
      <strong>📅 Multi-Month Distribution (${parsed.rows.length} rows across ${monthCounts.size} month${monthCounts.size === 1 ? "" : "s"}):</strong>
      <div class="paste-month-summary-chips">${chipsHtml}</div>
    `;
    excelPasteMonthSummary.style.display = "block";
  }

  const baseMsg = `Preview ready (${parsed.rows.length} rows across ${monthCounts.size} month(s)). Click Import to append all rows transactionally.`;
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

if (rawDataTableBody) {
  rawDataTableBody.addEventListener("input", () => {
    setDirtyState(true);
  });
}

if (rawDataContainer) {
  // Track dirty state for any cell edit inside any month block
  rawDataContainer.addEventListener("input", () => {
    setDirtyState(true);
  });

  // Handle month accordion toggles, copy month, and select month
  rawDataContainer.addEventListener("click", (e) => {
    // 1. Copy Month Button
    const copyBtn = e.target.closest("button[data-copy-month]");
    if (copyBtn) {
      e.stopPropagation();
      const monthKey = copyBtn.dataset.copyMonth;
      copyMonthDataToClipboard(monthKey, copyBtn);
      return;
    }

    // 2. Select All Month Checkbox
    const selectMonthCb = e.target.closest("input[data-select-month]");
    if (selectMonthCb) {
      e.stopPropagation();
      const monthKey = selectMonthCb.dataset.selectMonth;
      const block = document.getElementById(`monthBlock_${monthKey}`);
      if (block) {
        const rowCbs = block.querySelectorAll("input[type='checkbox'][data-row-select='1']");
        rowCbs.forEach((cb) => { cb.checked = selectMonthCb.checked; });
        const headerCb = block.querySelector("input[data-month-select-header]");
        if (headerCb) headerCb.checked = selectMonthCb.checked;
      }
      return;
    }

    // 3. Header Click (Accordion toggle)
    const header = e.target.closest(".month-accordion-header");
    if (header && !e.target.closest(".btn-month-copy") && !e.target.closest(".month-select-label")) {
      const monthKey = header.dataset.toggleMonth;
      const body = document.getElementById(`monthBody_${monthKey}`);
      const chevron = header.querySelector(".month-chevron");
      const isOpen = header.classList.contains("is-open");

      if (isOpen) {
        header.classList.remove("is-open");
        if (body) body.classList.add("is-collapsed");
        if (chevron) chevron.textContent = "▶";
      } else {
        header.classList.add("is-open");
        if (body) body.classList.remove("is-collapsed");
        if (chevron) chevron.textContent = "▼";
      }
    }
  });
}

if (rawDataMonthJump) {
  rawDataMonthJump.addEventListener("change", () => {
    const val = rawDataMonthJump.value;
    if (!val || val === "ALL") {
      if (rawDataContainer) rawDataContainer.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      const block = document.getElementById(`monthBlock_${val}`);
      if (block) {
        const header = block.querySelector(".month-accordion-header");
        const body = block.querySelector(".month-accordion-body");
        const chevron = block.querySelector(".month-chevron");
        if (header) header.classList.add("is-open");
        if (body) body.classList.remove("is-collapsed");
        if (chevron) chevron.textContent = "▼";
        block.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });
}

if (rawDataExpandAll) {
  rawDataExpandAll.addEventListener("click", () => {
    if (!rawDataContainer) return;
    rawDataContainer.querySelectorAll(".month-accordion-header").forEach((h) => h.classList.add("is-open"));
    rawDataContainer.querySelectorAll(".month-accordion-body").forEach((b) => b.classList.remove("is-collapsed"));
    rawDataContainer.querySelectorAll(".month-chevron").forEach((c) => { c.textContent = "▼"; });
  });
}

if (rawDataCollapseAll) {
  rawDataCollapseAll.addEventListener("click", () => {
    if (!rawDataContainer) return;
    rawDataContainer.querySelectorAll(".month-accordion-header").forEach((h) => h.classList.remove("is-open"));
    rawDataContainer.querySelectorAll(".month-accordion-body").forEach((b) => b.classList.add("is-collapsed"));
    rawDataContainer.querySelectorAll(".month-chevron").forEach((c) => { c.textContent = "▶"; });
  });
}

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

if (copySelectedRawRowsBtn) {
  copySelectedRawRowsBtn.addEventListener("click", async () => {
    const selectedRows = getSelectedRowsData();
    if (!selectedRows.length) {
      rawDataMsg.textContent = "Please select at least one row using the checkbox (or click inside a row) to copy.";
      rawDataMsg.style.color = "#b42318";
      return;
    }

    // Convert rows to Tab-Separated Values (TSV) for seamless column-wise pasting into Excel
    const tsvData = selectedRows.map((row) => row.join("\t")).join("\r\n");
    const copied = await copyTextToClipboard(tsvData);

    if (copied) {
      rawDataMsg.textContent = `✓ Copied ${selectedRows.length} row(s) to clipboard. You can now paste (Ctrl+V) directly into Excel column-wise.`;
      rawDataMsg.style.color = "#146c43";

      const originalText = copySelectedRawRowsBtn.textContent;
      copySelectedRawRowsBtn.textContent = "✓ Copied!";
      copySelectedRawRowsBtn.style.borderColor = "#146c43";
      copySelectedRawRowsBtn.style.color = "#146c43";
      setTimeout(() => {
        copySelectedRawRowsBtn.textContent = originalText;
        copySelectedRawRowsBtn.style.borderColor = "";
        copySelectedRawRowsBtn.style.color = "";
      }, 2000);
    } else {
      rawDataMsg.textContent = "Failed to copy to clipboard. Please allow clipboard permissions.";
      rawDataMsg.style.color = "#b42318";
    }
  });
}

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
