const groupMasterStorageKey = "GroupMasterData";

const groupMasterTable = document.getElementById("groupMasterTable");
const groupMasterColgroup = document.getElementById("groupMasterColgroup");
const groupMasterHead = document.getElementById("groupMasterHead");
const groupMasterBody = document.getElementById("groupMasterBody");
const groupMasterMsg = document.getElementById("groupMasterMsg");
const addGroupRowBtn = document.getElementById("addGroupRow");
const saveGroupSheetBtn = document.getElementById("saveGroupSheet");
const groupSaveState = document.getElementById("groupSaveState");

const workbookData = window.groupMasterWorkbookData || {};
const headerRowsCount = Number(workbookData.headerRows || 1);
const workbookRows = Array.isArray(workbookData.rows) ? workbookData.rows : [];
const workbookHeaderRows = workbookRows.slice(0, headerRowsCount);
const workbookBodyRows = workbookRows.slice(headerRowsCount);

let rows = [];
let isDirty = false;

function isRowEmpty(row) {
  if (!Array.isArray(row)) {
    return true;
  }

  return row.every((cell) => String(cell || "").trim() === "");
}

function removeEmptyRows(dataRows) {
  if (!Array.isArray(dataRows)) {
    return [];
  }

  return dataRows.filter((row) => !isRowEmpty(row));
}

function getColumnCount() {
  if (workbookHeaderRows[0]?.length) {
    return workbookHeaderRows[0].length;
  }
  return rows[0]?.length || 0;
}

function setDirtyState(next) {
  isDirty = next;
  if (isDirty) {
    groupSaveState.textContent = "Unsaved changes.";
    groupSaveState.classList.add("is-dirty");
    return;
  }

  groupSaveState.textContent = "No unsaved changes.";
  groupSaveState.classList.remove("is-dirty");
}

function getSavedRows() {
  try {
    const parsed = JSON.parse(localStorage.getItem(groupMasterStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setSavedRows(nextRows) {
  localStorage.setItem(groupMasterStorageKey, JSON.stringify(nextRows, null, 2));
}

function safeValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function buildColgroup() {
  const columnWidths = Array.isArray(workbookData.columnWidths) ? workbookData.columnWidths : [];
  const columnCount = getColumnCount();
  groupMasterColgroup.innerHTML = "";

  for (let i = 0; i < columnCount; i += 1) {
    const col = document.createElement("col");
    const width = Number(columnWidths[i] || 150);
    col.style.width = `${width}px`;
    groupMasterColgroup.appendChild(col);
  }
}

function renderHead() {
  groupMasterHead.innerHTML = "";

  workbookHeaderRows.forEach((headerRow) => {
    const tr = document.createElement("tr");
    headerRow.forEach((value, index) => {
      const th = document.createElement("th");
      th.textContent = safeValue(value);
      th.classList.add("header-row-1");
      if (index === 0) {
        th.classList.add("sticky-first-col");
      }
      tr.appendChild(th);
    });
    groupMasterHead.appendChild(tr);
  });
}

function renderBody() {
  groupMasterBody.innerHTML = "";

  rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");

    row.forEach((value, colIndex) => {
      const td = document.createElement("td");
      td.textContent = safeValue(value);
      td.contentEditable = "true";
      td.dataset.row = String(rowIndex);
      td.dataset.col = String(colIndex);
      if (colIndex === 0) {
        td.classList.add("sticky-first-col");
      }
      tr.appendChild(td);
    });

    groupMasterBody.appendChild(tr);
  });
}

function saveGroupSheet() {
  rows = removeEmptyRows(rows);
  renderBody();
  setSavedRows(rows);
  setDirtyState(false);
  groupMasterMsg.textContent = `Saved ${rows.length} rows to local storage.`;
}

function addGroupRow() {
  const columnCount = getColumnCount();
  if (!columnCount) {
    return;
  }

  const row = new Array(columnCount).fill("");
  rows.push(row);
  renderBody();
  setDirtyState(true);
  groupMasterMsg.textContent = "New row added.";
}

function initializeRows() {
  const saved = getSavedRows();
  if (saved.length > 0) {
    rows = removeEmptyRows(saved.map((row) => (Array.isArray(row) ? row.map((v) => safeValue(v)) : [])));
    return;
  }

  rows = removeEmptyRows(workbookBodyRows.map((row) => row.map((v) => safeValue(v))));
}

function padRowsToColumnCount() {
  const columnCount = getColumnCount();
  rows = rows.map((row) => {
    const next = Array.isArray(row) ? row.slice(0, columnCount) : [];
    while (next.length < columnCount) {
      next.push("");
    }
    return next;
  });
}

groupMasterBody.addEventListener("input", (event) => {
  const cell = event.target;
  if (!(cell instanceof HTMLElement) || cell.tagName !== "TD") {
    return;
  }

  const rowIndex = Number(cell.dataset.row);
  const colIndex = Number(cell.dataset.col);
  if (!Number.isInteger(rowIndex) || !Number.isInteger(colIndex)) {
    return;
  }

  if (!rows[rowIndex]) {
    return;
  }

  rows[rowIndex][colIndex] = cell.textContent || "";
  setDirtyState(true);
});

addGroupRowBtn.addEventListener("click", addGroupRow);
saveGroupSheetBtn.addEventListener("click", saveGroupSheet);

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

    saveGroupSheet();
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

initializeRows();
padRowsToColumnCount();
buildColgroup();
renderHead();
renderBody();
setDirtyState(false);
groupMasterMsg.textContent = `Loaded ${rows.length} rows from Group_Master sheet.`;
