const employeeKey = "EmployeeMasterData";
const employeeTableHead = document.getElementById("employeeTableHead");
const employeeTableBody = document.getElementById("employeeTableBody");
const employeeTableColgroup = document.getElementById("employeeTableColgroup");
const sheetWrap = document.querySelector(".sheet-wrap");
const saveMsg = document.getElementById("saveMsg");
const saveStateTag = document.getElementById("saveStateTag");
const workbookData = window.employeeMasterWorkbookData || { headerRows: 0, rows: [] };
const headerRowCount = workbookData.headerRows || 0;
const defaultRows = Array.isArray(workbookData.rows) ? workbookData.rows : [];
const detectedColumnCount = Number(workbookData.maxColumns || (defaultRows[0] ? defaultRows[0].length : 0));
const editableColumns = new Set([0, 1, 2, 3, 4]);
const currencyFormatter = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 2,
});
const formulaColumns = new Set([5, 6, 7, 8, 9, 10, 15, 16]);
const currencyColumns = new Set([3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
let isDirty = false;

function normalizeCellValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function isBlankRow(row) {
  return !Array.isArray(row) || !row.some((value) => normalizeCellValue(value).trim() !== "");
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

  return Math.max(1, lastUsedColumn || detectedColumnCount || 1);
}

function parseNumericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = normalizeCellValue(value).replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateFormulaCells(rowValues) {
  const row = [...rowValues];
  if (!normalizeCellValue(row[3]).trim()) {
    row[5] = "";
    row[6] = "";
    row[7] = "";
    row[8] = "";
    row[9] = "";
    row[10] = "";
    row[15] = "";
    row[16] = "";
    return row;
  }

  const basePay = parseNumericValue(row[3]);
  const fValue = basePay / 30;

  row[5] = fValue;
  row[6] = fValue * 30 / 100;
  row[7] = fValue * 25 / 100;
  row[8] = fValue * 20 / 100;
  row[9] = fValue * 20 / 100;
  row[10] = basePay / 30;
  row[15] = fValue * 55 / 100;
  row[16] = fValue * 55 / 100;

  return row;
}

function setDirtyState(nextState) {
  isDirty = nextState;
  saveStateTag.textContent = isDirty ? "Unsaved changes - click Save Sheet before moving to another page." : "No unsaved changes.";
  saveStateTag.classList.toggle("is-dirty", isDirty);
}

function calculateColumnWidths(rows, columnCount) {
  const widths = Array.from({ length: columnCount }, () => 12);

  rows.forEach((row) => {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const value = formatWorkbookValue(row[columnIndex], columnIndex);
      const textLength = normalizeCellValue(value).replace(/\s+/g, " ").length;
      widths[columnIndex] = Math.max(widths[columnIndex], Math.min(34, Math.max(12, textLength + 2)));
    }
  });

  return widths.map((width, columnIndex) => {
    if (columnIndex === 0) {
      return Math.max(width, 10);
    }

    return Math.min(width, 28);
  });
}

function applyColumnWidths(widths) {
  employeeTableColgroup.innerHTML = "";

  widths.forEach((width, columnIndex) => {
    const col = document.createElement("col");
    col.style.width = `${width}ch`;
    if (columnIndex === 0) {
      col.className = "sticky-first-col";
    }
    employeeTableColgroup.appendChild(col);
  });
}

function syncTopScrollWidth() {
}

function syncHeaderOffsets() {
  const headerRows = Array.from(employeeTableHead.querySelectorAll("tr"));
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

function formatWorkbookValue(value, columnIndex) {
  if (columnIndex === 0) {
    return normalizeCellValue(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return currencyFormatter.format(value);
  }

  return normalizeCellValue(value);
}

function isFormulaColumn(columnIndex) {
  return formulaColumns.has(columnIndex);
}

function createCell(tagName, value, className, columnIndex = 0) {
  const cell = document.createElement(tagName);
  cell.textContent = formatWorkbookValue(value, columnIndex);
  if (className) {
    cell.className = className;
  }
  if (columnIndex === 0) {
    cell.classList.add("sticky-first-col");
  }
  return cell;
}

function renderTable(rows) {
  employeeTableHead.innerHTML = "";
  employeeTableBody.innerHTML = "";

  const visibleColumnCount = getVisibleColumnCount(rows);
  const trimmedRows = rows.map((row) => row.slice(0, visibleColumnCount));
  const headerRows = trimmedRows.slice(0, headerRowCount);
  const dataRows = trimmedRows.slice(headerRowCount).map((row) => calculateFormulaCells(row));
  const rowsForSizing = headerRows.concat(dataRows);

  applyColumnWidths(calculateColumnWidths(rowsForSizing, visibleColumnCount));

  headerRows
    .filter((row) => !isBlankRow(row))
    .forEach((row, rowIndex) => {
      const headerRow = document.createElement("tr");
      row.forEach((value, columnIndex) => {
        headerRow.appendChild(createCell("th", value, `header-row header-row-${rowIndex + 1}`, columnIndex));
      });
      employeeTableHead.appendChild(headerRow);
  });

  dataRows.forEach((row) => addRow(row, visibleColumnCount));

  window.requestAnimationFrame(() => {
    syncTopScrollWidth();
    syncHeaderOffsets();
  });
}

function loadSheet() {
  try {
    const storedRows = JSON.parse(localStorage.getItem(employeeKey) || "[]");
    const visibleColumnCount = getVisibleColumnCount(defaultRows);
    if (Array.isArray(storedRows) && storedRows.length && storedRows[0]?.length === visibleColumnCount) {
      renderTable(defaultRows.slice(0, headerRowCount).concat(storedRows));
      saveMsg.textContent = "Saved employee sheet loaded.";
      return;
    }

    renderTable(defaultRows);
    saveMsg.textContent = "Excel sheet loaded.";
  } catch {
    renderTable(defaultRows);
    saveMsg.textContent = "Could not load saved sheet data.";
  }
}

function addRow(values = [], columnCount = getVisibleColumnCount(defaultRows)) {
  const row = document.createElement("tr");
  for (let i = 0; i < columnCount; i += 1) {
    const cell = document.createElement("td");
    cell.textContent = formatWorkbookValue(values[i], i);
    if (i === 0) {
      cell.classList.add("sticky-first-col");
    }
    if (currencyColumns.has(i) || isFormulaColumn(i)) {
      cell.classList.add("formula-cell");
    }
    if (editableColumns.has(i)) {
      cell.contentEditable = "true";
      cell.classList.add("editable-cell");
    } else {
      cell.contentEditable = "false";
    }
    row.appendChild(cell);
  }
  employeeTableBody.appendChild(row);
  setDirtyState(true);
}

function updateFormulaRow(rowElement) {
  const cells = Array.from(rowElement.querySelectorAll("td"));
  const values = cells.map((cell) => cell.textContent.trim());
  const calculated = calculateFormulaCells(values);

  calculated.forEach((value, columnIndex) => {
    if (!isFormulaColumn(columnIndex)) {
      return;
    }

    const cell = cells[columnIndex];
    if (cell) {
      cell.textContent = formatWorkbookValue(value, columnIndex);
    }
  });
}

function saveSheet() {
  const rows = Array.from(employeeTableBody.querySelectorAll("tr")).map((tr) => {
    const values = Array.from(tr.querySelectorAll("td")).map((td, columnIndex) => {
      if (isFormulaColumn(columnIndex)) {
        return parseNumericValue(td.textContent);
      }

      return td.textContent.trim();
    });

    return calculateFormulaCells(values);
  });

  localStorage.setItem(employeeKey, JSON.stringify(rows, null, 2));
  saveMsg.textContent = "Sheet saved successfully.";
  setDirtyState(false);
  return rows;
}

document.getElementById("addRow").addEventListener("click", () => addRow());
document.getElementById("saveSheet").addEventListener("click", saveSheet);

employeeTableBody.addEventListener("input", (event) => {
  const cell = event.target.closest("td");
  if (!cell) {
    return;
  }

  const row = cell.parentElement;
  if (row) {
    updateFormulaRow(row);
    setDirtyState(true);
  }
});

document.querySelectorAll(".nav-bar a").forEach((link) => {
  link.addEventListener("click", (event) => {
    if (!isDirty) {
      return;
    }

    event.preventDefault();
    const shouldSave = window.confirm("Unsaved changes found. OK click karein to save ho kar next page khule, Cancel se yahin rahain.");
    if (!shouldSave) {
      return;
    }

    saveSheet();
    window.location.href = link.getAttribute("href") || "index.html";
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
  window.requestAnimationFrame(() => {
    syncTopScrollWidth();
    syncHeaderOffsets();
  });
});

loadSheet();
setDirtyState(false);