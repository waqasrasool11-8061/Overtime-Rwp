const OP72_API_BASE_URL = "http://localhost:3000";
const OP72_API_PATHS = {
  workbook: "/api/op72/workbook",
  dataRows: "/api/op72/data-rows",
  dataRow: "/api/op72/data-row",
  cleanup: "/api/op72/cleanup-empty-rows",
};

const OP72_COLUMNS = [
  "Date Entry", "Employee 1", "Employee 2", "Duty Type", "OT", "Mileage",
  "Outward Duty", "Outward Commenced", "Outward Terminated", "Inward Duty",
  "Inward Commenced", "Inward Terminated", "Remarks",
];

const tableHead = document.getElementById("op72Head");
const tableBody = document.getElementById("op72Body");
const colgroup = document.getElementById("op72Colgroup");
const message = document.getElementById("op72Message");
const saveState = document.getElementById("op72SaveState");
const entryPanel = document.getElementById("op72EntryPanel");
const entryFields = document.getElementById("op72EntryFields");
const pastePanel = document.getElementById("op72PastePanel");
const pasteInput = document.getElementById("op72PasteInput");
const pasteValidation = document.getElementById("op72PasteValidationMsg");
const pastePreview = document.getElementById("op72PastePreview");
const importPasteButton = document.getElementById("importOp72Paste");
const copySelectedOp72RowsBtn = document.getElementById("copySelectedOp72Rows");

let rows = [];
let rowMeta = [];
let isDirty = false;
let pasteRows = [];

function apiUrl(pathname) {
  return `${OP72_API_BASE_URL}${pathname}`;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#b42318" : "";
}

function setDirtyState(nextState) {
  isDirty = nextState;
  saveState.textContent = isDirty
    ? "Unsaved changes - click Save Sheet before moving to another page."
    : "No unsaved changes.";
  saveState.classList.toggle("is-dirty", isDirty);
}

async function request(pathname, options = {}) {
  const response = await fetch(apiUrl(pathname), {
    ...options,
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `HTTP ${response.status}`);
  }
  return response.json();
}

function renderEntryFields() {
  const table = document.createElement("table");
  table.innerHTML = `<tbody>${OP72_COLUMNS.map((column, index) => `
    <tr><th>${column}</th><td><input class="field-input" data-column-index="${index}" type="text"></td></tr>
  `).join("")}</tbody>`;
  entryFields.replaceChildren(table);
}

function renderHeader() {
  const firstRow = document.createElement("tr");
  const secondRow = document.createElement("tr");
  const selectCell = document.createElement("th");
  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  selectAll.title = "Select all OP72 data rows";
  selectCell.rowSpan = 2;
  selectCell.appendChild(selectAll);
  firstRow.appendChild(selectCell);

  OP72_COLUMNS.forEach((column, index) => {
    if (index === 6 || index === 9) {
      const groupCell = document.createElement("th");
      groupCell.textContent = index === 6 ? "Outward" : "Inward";
      groupCell.colSpan = 3;
      firstRow.appendChild(groupCell);
    } else if (![7, 8, 10, 11].includes(index)) {
      const cell = document.createElement("th");
      cell.textContent = column;
      cell.rowSpan = 2;
      firstRow.appendChild(cell);
    }
  });

  [6, 7, 8, 9, 10, 11].forEach((index) => {
    const cell = document.createElement("th");
    cell.textContent = OP72_COLUMNS[index];
    secondRow.appendChild(cell);
  });
  tableHead.replaceChildren(firstRow, secondRow);
  selectAll.addEventListener("change", () => {
    tableBody.querySelectorAll("input[data-row-select]").forEach((input) => { input.checked = selectAll.checked; });
  });
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

  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }

  return raw;
}

function formatCellValue(value, columnIndex, isDataRow) {
  if (!isDataRow) {
    return String(value ?? "");
  }

  if (columnIndex === 4 || columnIndex === 7 || columnIndex === 8 || columnIndex === 10 || columnIndex === 11) {
    return formatTimeHhMm(value);
  }

  return String(value ?? "");
}

function renderTable() {
  renderHeader();
  colgroup.replaceChildren(...Array.from({ length: 14 }, (_, index) => {
    const col = document.createElement("col");
    col.style.width = `${index === 0 ? 8 : 12}ch`;
    return col;
  }));
  tableBody.replaceChildren();
  rows.forEach((row, index) => {
    const meta = rowMeta[index] || { rowIndex: index, rowKind: "data" };
    const tr = document.createElement("tr");
    tr.dataset.rowIndex = String(meta.rowIndex);
    const selectCell = document.createElement("td");
    const isData = meta.rowKind === "data";
    if (isData) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.rowSelect = "1";
      selectCell.appendChild(checkbox);
    }
    tr.appendChild(selectCell);
    OP72_COLUMNS.forEach((_, columnIndex) => {
      const cell = document.createElement("td");
      cell.textContent = formatCellValue(row[columnIndex], columnIndex, isData);
      cell.contentEditable = isData ? "true" : "false";
      if (isData) cell.addEventListener("input", () => setDirtyState(true));
      tr.appendChild(cell);
    });
    tableBody.appendChild(tr);
  });
}

function currentRows() {
  return Array.from(tableBody.querySelectorAll("tr"), (tr) =>
    Array.from(tr.querySelectorAll("td")).slice(1).map((cell) => cell.textContent.trim())
  );
}

function selectedRowIndices() {
  return Array.from(tableBody.querySelectorAll("input[data-row-select]:checked"))
    .map((input) => Number(input.closest("tr")?.dataset.rowIndex))
    .filter(Number.isInteger);
}

function getSelectedOp72RowsData() {
  const checkedTrs = Array.from(tableBody.querySelectorAll("tr"))
    .filter((tr) => {
      const checkbox = tr.querySelector("input[data-row-select='1']");
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
  if (activeTr && tableBody.contains(activeTr)) {
    return [
      Array.from(activeTr.querySelectorAll("td"))
        .slice(1)
        .map((td) => td.textContent.trim())
    ];
  }

  return [];
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

async function loadWorkbook() {
  const payload = await request(OP72_API_PATHS.workbook);
  rows = Array.isArray(payload.rows) ? payload.rows : [];
  rowMeta = Array.isArray(payload.rowMeta) ? payload.rowMeta : [];
  renderTable();
  setDirtyState(false);
  setMessage("OP72 Raw Data sheet loaded.");
  // Scroll to last non-empty data row
  window.requestAnimationFrame(() => {
    const dataRows = Array.from(tableBody.querySelectorAll("tr"));
    let lastRow = null;
    for (let i = dataRows.length - 1; i >= 0; i -= 1) {
      const cells = Array.from(dataRows[i].querySelectorAll("td")).slice(1);
      const hasData = cells.some((td) => td.textContent.trim() !== "");
      if (hasData) { lastRow = dataRows[i]; break; }
    }
    if (lastRow) lastRow.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

async function saveSheet() {
  await request(OP72_API_PATHS.dataRows, { method: "PUT", body: JSON.stringify({ rows: currentRows() }) });
  await loadWorkbook();
  setMessage("OP72 Raw Data sheet saved.");
}

function parsePasteRows() {
  const text = pasteInput.value ?? "";
  const lines = text.replace(/\r/g, "").split("\n");
  const importedRows = [];
  const skippedRows = [];

  for (let i = 0; i < lines.length; i += 1) {
    const columns = lines[i].split("\t");

    // Skip completely blank lines
    if (columns.every((cell) => cell.trim() === "")) {
      continue;
    }

    // Reject rows that have MORE than expected columns — structural mismatch
    if (columns.length > OP72_COLUMNS.length) {
      skippedRows.push(i + 1);
      continue;
    }

    // Rows with FEWER columns are fine — pad missing trailing columns with ""
    const paddedRow = Array.from({ length: OP72_COLUMNS.length }, (_, colIdx) =>
      String(columns[colIdx] ?? "").trim()
    );

    importedRows.push(paddedRow);
  }

  return { rows: importedRows, skippedRows };
}

document.getElementById("toggleAddOp72Record").addEventListener("click", () => {
  entryPanel.style.display = entryPanel.style.display === "none" ? "block" : "none";
  pastePanel.style.display = "none";
});
document.getElementById("cancelOp72Record").addEventListener("click", () => { entryPanel.style.display = "none"; });
document.getElementById("submitOp72Record").addEventListener("click", async () => {
  const row = Array.from(entryFields.querySelectorAll("input"), (input) => input.value.trim());
  if (row.length > 4) {
    row[4] = formatTimeHhMm(row[4]);
  }
  try {
    await request(OP72_API_PATHS.dataRow, { method: "POST", body: JSON.stringify({ row }) });
    entryFields.querySelectorAll("input").forEach((input) => { input.value = ""; });
    entryPanel.style.display = "none";
    await loadWorkbook();
    setMessage("OP72 Raw Data record added.");
  } catch (error) { setMessage(`Add failed: ${error.message}`, true); }
});
document.getElementById("togglePasteOp72Records").addEventListener("click", () => {
  pastePanel.style.display = pastePanel.style.display === "none" ? "block" : "none";
  entryPanel.style.display = "none";
});
document.getElementById("cancelOp72Paste").addEventListener("click", () => { pastePanel.style.display = "none"; });
pasteInput.addEventListener("paste", () => {
  window.setTimeout(() => {
    document.getElementById("previewOp72Paste").click();
  }, 0);
});
document.getElementById("previewOp72Paste").addEventListener("click", () => {
  const parsed = parsePasteRows();
  pasteRows = parsed.rows;
  const skippedRows = parsed.skippedRows;

  if (pasteRows.length === 0) {
    pasteValidation.textContent = "No data found. Please paste rows from Excel first.";
    pasteValidation.style.color = "#b42318";
    importPasteButton.disabled = true;
    pastePreview.style.display = "none";
    return;
  }

  const warningNote = skippedRows.length
    ? ` (${skippedRows.length} row(s) skipped — had more than ${OP72_COLUMNS.length} columns)`
    : "";

  const baseMsg = `${pasteRows.length} valid row(s) ready to import.`;
  pasteValidation.textContent = warningNote ? `${baseMsg}${warningNote}` : baseMsg;
  pasteValidation.style.color = skippedRows.length ? "#7a4b00" : "#0d7a4b";
  importPasteButton.disabled = false;
  pastePreview.style.display = "block";

  // Show a small preview table
  const previewTable = document.createElement("table");
  previewTable.style.cssText = "width:100%;border-collapse:collapse;font-size:0.8rem;";
  const headRow = document.createElement("tr");
  OP72_COLUMNS.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    th.style.cssText = "border:1px solid #c5d7ea;padding:3px 5px;background:#e9f2fb;white-space:nowrap;font-size:0.75rem;";
    headRow.appendChild(th);
  });
  previewTable.appendChild(headRow);
  pasteRows.slice(0, 5).forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      td.style.cssText = "border:1px solid #c5d7ea;padding:3px 5px;";
      tr.appendChild(td);
    });
    previewTable.appendChild(tr);
  });
  if (pasteRows.length > 5) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = OP72_COLUMNS.length;
    td.textContent = `… and ${pasteRows.length - 5} more row(s)`;
    td.style.cssText = "padding:4px 6px;color:#355a7f;font-style:italic;";
    tr.appendChild(td);
    previewTable.appendChild(tr);
  }
  pastePreview.replaceChildren(previewTable);
});
document.getElementById("importOp72Paste").addEventListener("click", async () => {
  try {
    const normalizedPasteRows = pasteRows.map((r) => {
      const copy = [...r];
      if (copy.length > 4) copy[4] = formatTimeHhMm(copy[4]);
      return copy;
    });
    await request(OP72_API_PATHS.dataRows, { method: "PUT", body: JSON.stringify({ rows: currentRows().concat(normalizedPasteRows) }) });
    pasteInput.value = "";
    pasteRows = [];
    importPasteButton.disabled = true;
    pastePanel.style.display = "none";
    await loadWorkbook();
    setMessage("OP72 Raw Data rows imported.");
  } catch (error) { setMessage(`Import failed: ${error.message}`, true); }
});
if (copySelectedOp72RowsBtn) {
  copySelectedOp72RowsBtn.addEventListener("click", async () => {
    const selectedRows = getSelectedOp72RowsData();
    if (!selectedRows.length) {
      setMessage("Please select at least one OP72 row using the checkbox (or click inside a row) to copy.", true);
      return;
    }

    // Convert rows to Tab-Separated Values (TSV) for seamless column-wise pasting into Excel
    const tsvData = selectedRows.map((row) => row.join("\t")).join("\r\n");
    const copied = await copyTextToClipboard(tsvData);

    if (copied) {
      setMessage(`✓ Copied ${selectedRows.length} OP72 row(s) to clipboard. You can now paste (Ctrl+V) directly into Excel column-wise.`);

      const originalText = copySelectedOp72RowsBtn.textContent;
      copySelectedOp72RowsBtn.textContent = "✓ Copied!";
      copySelectedOp72RowsBtn.style.borderColor = "#146c43";
      copySelectedOp72RowsBtn.style.color = "#146c43";
      setTimeout(() => {
        copySelectedOp72RowsBtn.textContent = originalText;
        copySelectedOp72RowsBtn.style.borderColor = "";
        copySelectedOp72RowsBtn.style.color = "";
      }, 2000);
    } else {
      setMessage("Failed to copy to clipboard. Please allow clipboard permissions.", true);
    }
  });
}

document.getElementById("deleteOp72Rows").addEventListener("click", async () => {
  const rowIndices = selectedRowIndices();
  if (!rowIndices.length) { setMessage("Select at least one OP72 data row.", true); return; }
  try {
    await request(OP72_API_PATHS.dataRows, { method: "DELETE", body: JSON.stringify({ rowIndices }) });
    await loadWorkbook();
    setMessage("Selected OP72 rows deleted.");
  } catch (error) { setMessage(`Delete failed: ${error.message}`, true); }
});
document.getElementById("cleanupOp72Rows").addEventListener("click", async () => {
  try {
    await request(OP72_API_PATHS.cleanup, { method: "POST", body: "{}" });
    await loadWorkbook();
    setMessage("Empty OP72 rows cleaned.");
  } catch (error) { setMessage(`Cleanup failed: ${error.message}`, true); }
});
document.getElementById("saveOp72Sheet").addEventListener("click", () => saveSheet().catch((error) => setMessage(`Save failed: ${error.message}`, true)));
window.addEventListener("beforeunload", (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

renderEntryFields();
loadWorkbook().catch((error) => setMessage(`Load failed: ${error.message}`, true));
