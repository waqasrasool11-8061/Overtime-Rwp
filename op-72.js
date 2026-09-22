const op72StorageKey = "OP72EditableCells";

const op72Head = document.getElementById("op72Head");
const op72Body = document.getElementById("op72Body");
const op72Table = document.getElementById("op72Table");
const op72Colgroup = document.getElementById("op72Colgroup");
const op72Msg = document.getElementById("op72Msg");
const op72SaveState = document.getElementById("op72SaveState");
const saveOp72SheetBtn = document.getElementById("saveOp72Sheet");
const clearOp72SheetBtn = document.getElementById("clearOp72Sheet");
const op72GroupSelect = document.getElementById("op72GroupSelect");
const op72MonthPicker = document.getElementById("op72MonthPicker");
const op72ZoomOutBtn = document.getElementById("op72ZoomOut");
const op72ZoomInBtn = document.getElementById("op72ZoomIn");
const op72ZoomResetBtn = document.getElementById("op72ZoomReset");
const op72ZoomValue = document.getElementById("op72ZoomValue");
const op72PageSizeSelect = document.getElementById("op72PageSize");
const op72PrintBtn = document.getElementById("op72PrintBtn");
const op72PrintArea = document.getElementById("op72PrintArea");
const op72PrintHeader = document.getElementById("op72PrintHeader");
const op72PrintGroup = document.getElementById("op72PrintGroup");
const op72PrintMonth = document.getElementById("op72PrintMonth");

const employeeCount = 10;
const dailyFields = ["Duty", "OT", "Mileage"];
const summaryRows = [
  "OT (hh:mm)",
  "Total OT",
  "Mileage (M)",
  "Mileage (P)",
  "Mileage (OP/G)",
  "Sunday",
  "Gazetted",
  "Operating (Mail)",
  "Operating (Shunt)",
  "Operating (Pass)",
  "Operating (Gds)",
];
const maxDisplayDays = 31;
const fixedBottomEmptyRowsCount = 4;
const op72MonthStorageKey = "OP72SelectedMonth";
const op72GroupStorageKey = "OP72SelectedGroup";

let isDirty = false;
let op72Zoom = 1;
let seedDate = new Date(2026, 5, 1);
let groupLookup = new Map();
const op72MinZoom = 0.40;
const op72MaxZoom = 1.5;
const op72ZoomStep = 0.1;

function setDirtyState(next) {
  isDirty = next;
  if (isDirty) {
    op72SaveState.textContent = "Unsaved changes.";
    op72SaveState.classList.add("is-dirty");
    return;
  }

  op72SaveState.textContent = "No unsaved changes.";
  op72SaveState.classList.remove("is-dirty");
}

function buildColgroup() {
  if (!op72Colgroup) {
    return;
  }

  op72Colgroup.innerHTML = "";

  const dateCol = document.createElement("col");
  dateCol.style.width = "40px";
  op72Colgroup.appendChild(dateCol);

  for (let employee = 1; employee <= employeeCount; employee += 1) {
    const dutyCol = document.createElement("col");
    dutyCol.style.width = "38px";
    op72Colgroup.appendChild(dutyCol);

    const otCol = document.createElement("col");
    otCol.style.width = "25px";
    op72Colgroup.appendChild(otCol);

    const mileageCol = document.createElement("col");
    mileageCol.style.width = "22px";
    op72Colgroup.appendChild(mileageCol);
  }
}

function applyZoom(nextZoom) {
  const clampedZoom = Math.max(op72MinZoom, Math.min(op72MaxZoom, nextZoom));
  op72Zoom = Number(clampedZoom.toFixed(2));

  op72Table.style.zoom = String(op72Zoom);

  if (op72ZoomValue) {
    op72ZoomValue.textContent = `${Math.round(op72Zoom * 100)}%`;
  }

  if (op72ZoomInBtn) {
    op72ZoomInBtn.disabled = op72Zoom >= op72MaxZoom;
  }

  if (op72ZoomOutBtn) {
    op72ZoomOutBtn.disabled = op72Zoom <= op72MinZoom;
  }
}

function handleWheelZoom(event) {
  if (!event.ctrlKey) {
    return;
  }

  event.preventDefault();
  const zoomDelta = event.deltaY < 0 ? op72ZoomStep : -op72ZoomStep;
  applyZoom(op72Zoom + zoomDelta);
}

function daysInMonth(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth() + 1, 0).getDate();
}

function formatDateCellValue(dateValue) {
  const monthShort = dateValue.toLocaleString("en-US", { month: "short" });
  return `${dateValue.getDate()}-${monthShort}-${String(dateValue.getFullYear()).slice(-2)}`;
}

function formatMonthInputValue(dateValue) {
  const yyyy = String(dateValue.getFullYear());
  const mm = String(dateValue.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function toFirstOfMonth(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), 1);
}

function parseSeedMonthValue(rawValue) {
  const raw = String(rawValue || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const yyyy = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isInteger(yyyy) || !Number.isInteger(mm) || mm < 1 || mm > 12) {
    return null;
  }

  return new Date(yyyy, mm - 1, 1);
}

function parseSeedDateInput(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return null;
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const yyyy = Number(isoMatch[1]);
    const mm = Number(isoMatch[2]);
    const dd = Number(isoMatch[3]);
    const parsed = new Date(yyyy, mm - 1, dd);
    if (parsed.getFullYear() === yyyy && parsed.getMonth() === mm - 1 && parsed.getDate() === dd) {
      return parsed;
    }
  }

  const numericMatch = raw.match(/^(\d{1,2})[-/\s](\d{1,2})[-/\s](\d{2,4})$/);
  if (numericMatch) {
    const dd = Number(numericMatch[1]);
    const mm = Number(numericMatch[2]);
    let yyyy = Number(numericMatch[3]);
    if (yyyy < 100) {
      yyyy += 2000;
    }
    const parsed = new Date(yyyy, mm - 1, dd);
    if (parsed.getFullYear() === yyyy && parsed.getMonth() === mm - 1 && parsed.getDate() === dd) {
      return parsed;
    }
  }

  const nameMatch = raw.match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2,4})$/);
  if (nameMatch) {
    const dd = Number(nameMatch[1]);
    const mon = monthMap[nameMatch[2].toLowerCase()];
    let yyyy = Number(nameMatch[3]);
    if (yyyy < 100) {
      yyyy += 2000;
    }
    if (mon === undefined) {
      return null;
    }
    const parsed = new Date(yyyy, mon, dd);
    if (parsed.getFullYear() === yyyy && parsed.getMonth() === mon && parsed.getDate() === dd) {
      return parsed;
    }
  }

  return null;
}

function refreshDateColumnFromSeed() {
  if (op72MonthPicker) {
    op72MonthPicker.value = formatMonthInputValue(seedDate);
  }

  const dayCount = daysInMonth(seedDate);
  const dailyRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="daily-date"]'));

  dailyRows.forEach((row, index) => {
    const dateCell = row.querySelector("td.op72-date-cell");
    if (!dateCell) {
      return;
    }

    const dayNumber = index + 1;
    dateCell.classList.remove("op72-date-blue", "op72-date-orange");

    if (dayNumber <= dayCount) {
      const current = new Date(seedDate.getFullYear(), seedDate.getMonth(), dayNumber);
      dateCell.textContent = formatDateCellValue(current);
      row.dataset.monthActive = "true";

      if (current.getDay() === 0) {
        dateCell.classList.add("op72-date-blue");
      }
      return;
    }

    dateCell.textContent = "";
    row.dataset.monthActive = "false";
  });

  syncFixedRowsAppearance();
}

function syncFixedRowsAppearance() {
  const firstDailyRow = op72Body.querySelector('tr[data-row-type="daily-date"]');
  const fixedRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="fixed-empty"]'));
  if (!firstDailyRow || !fixedRows.length) {
    return;
  }

  const firstHeight = Math.ceil(firstDailyRow.getBoundingClientRect().height);
  if (!firstHeight) {
    return;
  }

  fixedRows.forEach((row) => {
    row.style.height = `${firstHeight}px`;
    row.querySelectorAll("td").forEach((cell) => {
      cell.style.height = `${firstHeight}px`;
      cell.style.minHeight = `${firstHeight}px`;
    });
  });
}

function applySeedMonthFromInput(monthInput) {
  const parsed = parseSeedMonthValue(monthInput.value);
  if (!parsed) {
    monthInput.value = formatMonthInputValue(seedDate);
    op72Msg.textContent = "Please select a valid month.";
    return false;
  }

  seedDate = toFirstOfMonth(parsed);
  refreshDateColumnFromSeed();
  return true;
}

function getGroupSourceRows() {
  try {
    const savedRows = JSON.parse(localStorage.getItem("GroupMasterData") || "[]");
    if (Array.isArray(savedRows) && savedRows.length > 0) {
      return savedRows;
    }
  } catch {
    // ignore invalid local storage
  }

  const workbookRows = window.groupMasterWorkbookData?.rows;
  const workbookHeaderRows = Number(window.groupMasterWorkbookData?.headerRows || 1);
  if (Array.isArray(workbookRows) && workbookRows.length > workbookHeaderRows) {
    return workbookRows.slice(workbookHeaderRows);
  }

  return [];
}

function rebuildGroupLookup() {
  groupLookup = new Map();

  getGroupSourceRows().forEach((row) => {
    if (!Array.isArray(row)) {
      return;
    }

    const groupName = String(row[0] || "").trim();
    if (!groupName) {
      return;
    }

    const employees = [];
    for (let i = 1; i <= employeeCount; i += 1) {
      employees.push(String(row[i] || "").trim());
    }

    groupLookup.set(groupName, employees);
  });
}

function setEmployeeHeaderNames(names) {
  const safeNames = Array.isArray(names) ? names : [];

  for (let i = 1; i <= employeeCount; i += 1) {
    const value = String(safeNames[i - 1] || "").trim();
    const mainHeader = op72Head.querySelector(`th[data-role="employee-main-header"][data-employee-index="${i}"]`);
    if (mainHeader) {
      mainHeader.textContent = value;
    }

    const summaryHeader = op72Body.querySelector(`td[data-role="employee-summary-header"][data-employee-index="${i}"]`);
    if (summaryHeader) {
      summaryHeader.textContent = value;
    }
  }
}

function applyGroupToSheet(groupName) {
  const selected = String(groupName || "").trim();
  if (!selected || !groupLookup.has(selected)) {
    setEmployeeHeaderNames(new Array(employeeCount).fill(""));
    return;
  }

  setEmployeeHeaderNames(groupLookup.get(selected));
}

function populateGroupSelector() {
  if (!op72GroupSelect) {
    return;
  }

  rebuildGroupLookup();
  op72GroupSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select Group";
  op72GroupSelect.appendChild(placeholder);

  Array.from(groupLookup.keys()).forEach((groupName) => {
    const option = document.createElement("option");
    option.value = groupName;
    option.textContent = groupName;
    op72GroupSelect.appendChild(option);
  });

  const savedGroup = String(localStorage.getItem(op72GroupStorageKey) || "").trim();
  if (savedGroup && groupLookup.has(savedGroup)) {
    op72GroupSelect.value = savedGroup;
    applyGroupToSheet(savedGroup);
    return;
  }

  applyGroupToSheet("");
}

function buildHead() {
  op72Head.innerHTML = "";

  const headerRow1 = document.createElement("tr");
  const headerRow2 = document.createElement("tr");

  const dateHead = document.createElement("th");
  dateHead.textContent = "Date";
  dateHead.rowSpan = 2;
  dateHead.className = "op72-main-head op72-date-head sticky-first-col";
  headerRow1.appendChild(dateHead);

  for (let employee = 1; employee <= employeeCount; employee += 1) {
    const empHead = document.createElement("th");
    empHead.textContent = "";
    empHead.colSpan = dailyFields.length;
    empHead.className = "op72-main-head";
    empHead.dataset.role = "employee-main-header";
    empHead.dataset.employeeIndex = String(employee);
    headerRow1.appendChild(empHead);

    dailyFields.forEach((field) => {
      const subHead = document.createElement("th");
      subHead.textContent = field;
      subHead.className = "op72-sub-head";
      headerRow2.appendChild(subHead);
    });
  }

  op72Head.appendChild(headerRow1);
  op72Head.appendChild(headerRow2);
}

function createEditableCell(text, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  td.contentEditable = "false";
  if (className) {
    td.className = className;
  }
  return td;
}

function markEditable(element) {
  element.contentEditable = "false";
}

function createLockedCell(text, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  td.contentEditable = "false";
  if (className) {
    td.className = className;
  }
  return td;
}

function buildDailyRows() {
  for (let day = 1; day <= maxDisplayDays; day += 1) {
    const tr = document.createElement("tr");

    tr.dataset.rowType = "daily-date";
    const dateCell = document.createElement("td");
    dateCell.className = "op72-date-cell sticky-first-col";
    tr.appendChild(dateCell);

    for (let employee = 1; employee <= employeeCount; employee += 1) {
      dailyFields.forEach(() => {
        tr.appendChild(createLockedCell("", "op72-edit-cell op72-locked-cell"));
      });
    }

    op72Body.appendChild(tr);
  }

  // Keep 4 fixed empty rows below day-31 that never change with month selection.
  const dailyRowTemplate = op72Body.querySelector('tr[data-row-type="daily-date"]');
  for (let i = 0; i < fixedBottomEmptyRowsCount; i += 1) {
    const tr = dailyRowTemplate ? dailyRowTemplate.cloneNode(true) : document.createElement("tr");
    tr.dataset.rowType = "fixed-empty";
    tr.classList.add("op72-fixed-empty-row");
    tr.querySelectorAll("td").forEach((cell) => {
      cell.textContent = "";
      cell.classList.remove("op72-date-blue", "op72-date-orange");
    });
    op72Body.appendChild(tr);
  }

  refreshDateColumnFromSeed();
}

function buildSummarySection() {
  const summarySpacer = document.createElement("tr");
  const spacerCell = document.createElement("td");
  spacerCell.className = "op72-summary-gap sticky-first-col";
  summarySpacer.appendChild(spacerCell);

  for (let employee = 1; employee <= employeeCount; employee += 1) {
    const labelGap = document.createElement("td");
    labelGap.className = "op72-summary-gap";
    labelGap.colSpan = 2;
    summarySpacer.appendChild(labelGap);

    const valueGap = document.createElement("td");
    valueGap.className = "op72-summary-gap";
    summarySpacer.appendChild(valueGap);
  }
  op72Body.appendChild(summarySpacer);

  const summaryHeader = document.createElement("tr");
  const summaryTitle = document.createElement("td");
  summaryTitle.textContent = "SUMMARY OF OVERTIME";
  summaryTitle.rowSpan = 1 + summaryRows.length + 5; // updated dynamically after load
  summaryTitle.className = "op72-summary-title sticky-first-col";
  summaryTitle.id = "op72SummaryTitle";
  summaryHeader.appendChild(summaryTitle);

  for (let employee = 1; employee <= employeeCount; employee += 1) {
    const empHead = document.createElement("td");
    empHead.textContent = "";
    empHead.colSpan = 3;
    empHead.className = "op72-summary-head";
    empHead.dataset.role = "employee-summary-header";
    empHead.dataset.employeeIndex = String(employee);
    summaryHeader.appendChild(empHead);
  }
  op72Body.appendChild(summaryHeader);

  summaryRows.forEach((summaryLabel) => {
    const tr = document.createElement("tr");

    for (let employee = 1; employee <= employeeCount; employee += 1) {
      const labelCell = document.createElement("td");
      labelCell.textContent = summaryLabel;
      labelCell.colSpan = 2;
      labelCell.className = "op72-summary-label";
      // Fixed tag: OT (hh:mm) down to Operating (Gds) - never editable / removable
      tr.appendChild(labelCell);

      const defaultValue = summaryLabel === "OT (hh:mm)" ? "0:00" : "0";
      tr.appendChild(createEditableCell(defaultValue, "op72-summary-value"));
    }

    op72Body.appendChild(tr);
  });

  // Tail rows for other duty types — start with 5, dynamically expanded later
  for (let i = 0; i < 5; i += 1) {
    const tr = document.createElement("tr");
    tr.dataset.rowType = "summary-tail";
    tr.dataset.tailIndex = String(i);
    for (let employee = 1; employee <= employeeCount; employee += 1) {
      const labelPad = document.createElement("td");
      labelPad.colSpan = 2;
      labelPad.className = "op72-summary-tail";
      markEditable(labelPad);
      tr.appendChild(labelPad);

      const valuePad = createEditableCell("", "op72-summary-tail-value");
      tr.appendChild(valuePad);
    }
    op72Body.appendChild(tr);
  }
}

function buildOp72Layout() {
  buildColgroup();
  buildHead();
  op72Body.innerHTML = "";
  buildDailyRows();
  buildSummarySection();
}

function getAllSheetCells() {
  const result = [];

  // 1. Employee header names (indices 0..9)
  for (let i = 1; i <= employeeCount; i += 1) {
    const th = op72Head.querySelector(`th[data-role="employee-main-header"][data-employee-index="${i}"]`);
    result.push(th ? String(th.textContent || "").trim() : "");
  }

  // 2. 31 Daily rows + 4 Fixed empty rows = 35 rows (30 cells each: [Duty, OT, Mileage] * 10)
  const dailyRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="daily-date"], tr[data-row-type="fixed-empty"]'));
  dailyRows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    // index 0 is date cell, take indices 1 to 30
    for (let c = 1; c <= employeeCount * dailyFields.length; c += 1) {
      result.push(cells[c] ? String(cells[c].textContent || "").trim() : "");
    }
  });

  // 3. Summary section rows (11 fixed summary rows + tail rows)
  const summaryTrs = Array.from(op72Body.querySelectorAll("tr")).filter((tr) =>
    tr.querySelector("td.op72-summary-label") || tr.querySelector("td.op72-summary-tail")
  );
  summaryTrs.forEach((tr) => {
    const labels = Array.from(tr.querySelectorAll("td.op72-summary-label, td.op72-summary-tail"));
    const values = Array.from(tr.querySelectorAll("td.op72-summary-value, td.op72-summary-tail-value"));
    for (let e = 0; e < employeeCount; e += 1) {
      result.push(labels[e] ? String(labels[e].textContent || "").trim() : "");
      result.push(values[e] ? String(values[e].textContent || "").trim() : "");
    }
  });

  return result;
}

function saveSheetData() {
  const cellArray = getAllSheetCells();
  localStorage.setItem(op72StorageKey, JSON.stringify(cellArray));
  localStorage.setItem(op72MonthStorageKey, formatMonthInputValue(seedDate));
  localStorage.setItem(op72GroupStorageKey, String(op72GroupSelect?.value || ""));

  // Also save late entries map for click-date feature
  if (_lateEntriesByEmployee && _lateEntriesByEmployee.size) {
    const serializableLate = [];
    _lateEntriesByEmployee.forEach((entries, emp) => {
      serializableLate.push([emp, entries.map(e => ({
        dateObjStr: e.dateObj ? e.dateObj.toISOString() : "",
        dutyType: e.dutyType || "",
        otMins: e.otMins || 0,
        mileage: e.mileage || 0,
      }))]);
    });
    localStorage.setItem("OP72LateEntriesData", JSON.stringify(serializableLate));
  } else {
    localStorage.removeItem("OP72LateEntriesData");
  }

  // Save row styles & date texts of daily & fixed rows
  const rowStyles = [];
  const allDailyRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="daily-date"], tr[data-row-type="fixed-empty"]'));
  allDailyRows.forEach((tr) => {
    const dateCell = tr.querySelector("td.op72-date-cell");
    const cellBgs = Array.from(tr.querySelectorAll("td")).map(td => td.style.backgroundColor || "");
    const dateClasses = dateCell ? Array.from(dateCell.classList).filter(c => c.startsWith("op72-date-")) : [];
    rowStyles.push({
      dateText: dateCell ? dateCell.textContent : "",
      dateClasses,
      cellBgs
    });
  });
  localStorage.setItem("OP72RowStylesData", JSON.stringify(rowStyles));

  setDirtyState(false);
}

function restoreFixedSummaryLabels() {
  const summaryTrs = Array.from(op72Body.querySelectorAll("tr")).filter((tr) =>
    tr.querySelector("td.op72-summary-label")
  );
  summaryTrs.forEach((tr, rowIdx) => {
    const tag = summaryRows[rowIdx];
    if (tag) {
      tr.querySelectorAll("td.op72-summary-label").forEach((cell) => {
        cell.textContent = tag;
      });
    }
  });
}

function loadSheetData() {
  try {
    // 1. Restore Month
    const savedMonth = String(localStorage.getItem(op72MonthStorageKey) || "").trim();
    if (op72MonthPicker && /^\d{4}-\d{2}$/.test(savedMonth)) {
      op72MonthPicker.value = savedMonth;
      applySeedMonthFromInput(op72MonthPicker);
    } else {
      refreshDateColumnFromSeed();
    }

    // 2. Restore Group & Employee Headers
    const savedGroup = String(localStorage.getItem(op72GroupStorageKey) || "").trim();
    if (savedGroup && op72GroupSelect) {
      op72GroupSelect.value = savedGroup;
      applyGroupToSheet(savedGroup);
    }

    // 3. Restore Cell Contents
    const rawCells = localStorage.getItem(op72StorageKey);
    if (!rawCells) {
      restoreFixedSummaryLabels();
      return;
    }
    const cellArray = JSON.parse(rawCells);
    if (!Array.isArray(cellArray) || !cellArray.length) {
      restoreFixedSummaryLabels();
      return;
    }

    // Fill Daily & Fixed Empty rows (35 rows × 30 cells = indices 10..1059)
    const allDailyRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="daily-date"], tr[data-row-type="fixed-empty"]'));
    allDailyRows.forEach((tr, rowIdx) => {
      const cells = Array.from(tr.querySelectorAll("td"));
      for (let c = 1; c <= employeeCount * dailyFields.length; c += 1) {
        const idx = 10 + rowIdx * 30 + (c - 1);
        if (idx < cellArray.length && cells[c]) {
          cells[c].textContent = cellArray[idx] || "";
          cells[c].contentEditable = "false";
          cells[c].classList.remove("op72-locked-cell");
        }
      }
    });

    // Fill Summary rows (11 fixed + tail rows)
    const summaryTrs = Array.from(op72Body.querySelectorAll("tr")).filter((tr) =>
      tr.querySelector("td.op72-summary-label") || tr.querySelector("td.op72-summary-tail")
    );
    const summaryStart = 10 + 35 * 30; // 1060
    summaryTrs.forEach((tr, trIdx) => {
      const labels = Array.from(tr.querySelectorAll("td.op72-summary-label, td.op72-summary-tail"));
      const values = Array.from(tr.querySelectorAll("td.op72-summary-value, td.op72-summary-tail-value"));
      for (let e = 0; e < employeeCount; e++) {
        const lblIdx = summaryStart + trIdx * 20 + e * 2;
        const valIdx = lblIdx + 1;
        if (lblIdx < cellArray.length && labels[e]) {
          labels[e].textContent = cellArray[lblIdx] || "";
        }
        if (valIdx < cellArray.length && values[e]) {
          values[e].textContent = cellArray[valIdx] || "";
        }
      }
    });

    // Restore Late entries map if saved
    const rawLate = localStorage.getItem("OP72LateEntriesData");
    if (rawLate) {
      try {
        const parsedLate = JSON.parse(rawLate);
        _lateEntriesByEmployee = new Map();
        parsedLate.forEach(([emp, entries]) => {
          _lateEntriesByEmployee.set(emp, entries.map(e => ({
            ...e,
            dateObj: e.dateObjStr ? new Date(e.dateObjStr) : null
          })));
        });
      } catch {}
    }

    // Restore row styles (backgrounds, dateClasses, date text)
    const rawStyles = localStorage.getItem("OP72RowStylesData");
    if (rawStyles) {
      try {
        const parsedStyles = JSON.parse(rawStyles);
        allDailyRows.forEach((tr, rIdx) => {
          const styleObj = parsedStyles[rIdx];
          if (!styleObj) return;
          const tds = Array.from(tr.querySelectorAll("td"));
          if (styleObj.cellBgs && Array.isArray(styleObj.cellBgs)) {
            tds.forEach((td, cIdx) => {
              const bg = styleObj.cellBgs[cIdx];
              if (bg) {
                td.style.backgroundColor = bg;
                if (bg === "rgb(162, 226, 220)" || bg.includes("162, 226, 220")) {
                  td.dataset.multiEntry = "true";
                  td.title = "Multiple raw data entries resolved for this date";
                }
              }
            });
          }
          const dateCell = tds[0];
          if (dateCell && styleObj.dateClasses) {
            dateCell.classList.remove("op72-date-blue", "op72-date-orange");
            styleObj.dateClasses.forEach(cls => dateCell.classList.add(cls));
            if (tr.dataset.rowType === "fixed-empty" && styleObj.dateText) {
              dateCell.textContent = styleObj.dateText;
            }
          }
        });
      } catch {}
    }

    restoreFixedSummaryLabels();
    setDirtyState(false);
    if (op72Msg) {
      op72Msg.textContent = savedGroup ? `Loaded saved OP-72 data for ${savedGroup}.` : "Loaded saved OP-72 data.";
    }
  } catch (err) {
    console.error("loadSheetData error:", err);
    restoreFixedSummaryLabels();
  }
}

function clearSavedData() {
  localStorage.removeItem(op72StorageKey);
  localStorage.removeItem(op72MonthStorageKey);
  localStorage.removeItem(op72GroupStorageKey);
  localStorage.removeItem("OP72LateEntriesData");
  localStorage.removeItem("OP72RowStylesData");
  buildOp72Layout();
  seedDate = new Date(2026, 5, 1);
  if (op72GroupSelect) {
    op72GroupSelect.value = "";
  }
  applyGroupToSheet("");
  refreshDateColumnFromSeed();
  setDirtyState(false);
  op72Msg.textContent = "Saved OP-72 data cleared. Default layout restored.";
}

function clearSheetCellsOnly() {
  // 1. Daily rows: Clear Duty, OT, Mileage cells & inline highlights
  const dailyRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="daily-date"], tr[data-row-type="fixed-empty"]'));
  dailyRows.forEach((row) => {
    row.querySelectorAll("td").forEach((cell, idx) => {
      if (idx > 0) cell.textContent = "";
      cell.style.backgroundColor = "";
      delete cell.dataset.multiEntry;
      if (cell.title === "Multiple raw data entries resolved for this date" || cell.title === "Multiple raw data entries on this date") {
        cell.removeAttribute("title");
      }
      cell.classList.remove("op72-date-blue", "op72-date-orange");
    });
    if (row.dataset.rowType === "fixed-empty") {
      const dateCell = row.querySelector("td.op72-date-cell");
      if (dateCell) dateCell.textContent = "";
      delete row.dataset.lateSymbol;
      delete row.dataset.lateRowIndex;
    }
  });

  // 2. Reset summary value cells (OT to Operating Gds) to default 0:00 / 0
  summaryRows.forEach((summaryLabel) => {
    const defaultVal = summaryLabel === "OT (hh:mm)" ? "0:00" : "0";
    for (let empIdx = 1; empIdx <= employeeCount; empIdx += 1) {
      writeSummaryValue(empIdx, summaryLabel, defaultVal);
    }
  });

  // 3. Clear tail rows
  const tailRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="summary-tail"]'));
  tailRows.forEach((tr) => {
    tr.querySelectorAll("td").forEach((cell) => {
      cell.textContent = "";
    });
  });

  _lateEntriesByEmployee = new Map();
  localStorage.removeItem(op72StorageKey);
  localStorage.removeItem("OP72LateEntriesData");
  localStorage.removeItem("OP72RowStylesData");

  restoreFixedSummaryLabels();
  refreshDateColumnFromSeed();
  setDirtyState(false);
  op72Msg.textContent = "Sheet cells cleared. Summary tags and group selection retained.";
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD ALL EMPLOYEES — OP72 Raw Data se data fetch karke sheet mein fill karo
// ═══════════════════════════════════════════════════════════════════════════════

const OP72_API_BASE = window.location.port === "5500"
  ? `http://${window.location.hostname}:3000`
  : "";
const HOLIDAYS_API_BASE = OP72_API_BASE;

const MONTH_LABELS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

// OT string "H:MM" ya numeric minutes ko total minutes mein convert karo
function parseOtToMinutes(val) {
  const s = String(val || "").trim();
  if (!s) return 0;
  const hhmm = s.match(/^(\d+):(\d{2})$/);
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);
  const num = parseFloat(s);
  if (!Number.isFinite(num)) return 0;
  // Agar < 24 ho to hours, warna minutes treat karo
  return num < 24 ? Math.round(num * 60) : Math.round(num);
}

function minutesToOtString(mins) {
  const m = Math.max(0, Math.round(mins));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

function parseMileage(val) {
  const n = parseFloat(String(val || "").trim());
  return Number.isFinite(n) ? n : 0;
}

// Server record row se individual fields aur details extract karo
function extractRecordValues(r) {
  const duty    = String(r[3] || "").trim();
  const ot      = String(r[4] || "").trim();
  const mileage = String(r[5] || "").trim();

  // Outward / Inward / Remarks summary
  const details = [];
  if (r[6]) details.push(`Out: ${r[6]} (${r[7] || ""} - ${r[8] || ""})`);
  if (r[9]) details.push(`In: ${r[9]} (${r[10] || ""} - ${r[11] || ""})`);
  if (r[12]) details.push(`Remarks: ${r[12]}`);
  const detailsText = details.join(" | ") || "—";

  return { duty, ot, mileage, detailsText };
}

// Ek date par multiple records ko combine karo (VBA Option C logic)
function combineRecords(records) {
  const duties = records.map((r) => String(r[3] || "").trim()).filter(Boolean);
  const uniqueDuties = [...new Set(duties)];
  const combinedDuty = uniqueDuties.join(" / ");

  const totalOtMins = records.reduce((sum, r) => sum + parseOtToMinutes(r[4]), 0);
  const combinedOt  = minutesToOtString(totalOtMins);

  const totalMileage = records.reduce((sum, r) => sum + parseMileage(r[5]), 0);
  const combinedMileage = totalMileage > 0 ? String(totalMileage.toFixed(2)) : "";

  return { duty: combinedDuty, ot: combinedOt, mileage: combinedMileage };
}

// Ek employee ke liye ek date pe multiple raw records ko resolve karo
function resolveRecords(records) {
  if (records.length === 1) {
    const s = extractRecordValues(records[0]);
    return { duty: s.duty, ot: s.ot, mileage: s.mileage };
  }
  return combineRecords(records);
}

// Multi-Entry Resolution Dialog Controller (Matches Excel VBA prompts)
function promptMultiEntryResolution(empName, dateLabel, records) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("op72MultiEntryDialog");
    if (!dialog || typeof dialog.showModal !== "function") {
      resolve({ ...combineRecords(records), combineAll: false });
      return;
    }

    const empNameEl     = document.getElementById("op72MultiEmpName");
    const dateEl        = document.getElementById("op72MultiDate");
    const badgeEl       = document.getElementById("op72MultiEntryCountBadge");
    const tableBody     = document.getElementById("op72MultiTableBody");
    const previewText   = document.getElementById("multiCombinePreviewText");

    const optSingle     = document.getElementById("multiChoiceSingle");
    const optCombine    = document.getElementById("multiChoiceCombine");
    const optManual     = document.getElementById("multiChoiceManual");

    const manualBox     = document.getElementById("op72MultiManualInputs");
    const manualDuty    = document.getElementById("manualDuty");
    const manualOt      = document.getElementById("manualOt");
    const manualMileage = document.getElementById("manualMileage");

    const applyBtn      = document.getElementById("op72MultiApplyBtn");
    const combineAllBtn = document.getElementById("op72MultiCombineAllBtn");

    if (empNameEl) empNameEl.textContent = empName;
    if (dateEl)    dateEl.textContent    = dateLabel;
    if (badgeEl)   badgeEl.textContent   = `${records.length} Entries Found`;

    const parsedRecords = records.map(extractRecordValues);
    const combined      = combineRecords(records);

    if (previewText) {
      previewText.textContent = `Duty: ${combined.duty || "None"}, OT: ${combined.ot || "00:00"}, Mileage: ${combined.mileage || "0.00"}`;
    }

    // Populate Table
    if (tableBody) {
      tableBody.innerHTML = "";
      parsedRecords.forEach((rec, idx) => {
        const tr = document.createElement("tr");
        if (idx === 0) tr.classList.add("is-selected");

        tr.innerHTML = `
          <td style="text-align: center;">
            <input type="radio" name="multiRecordRowPick" value="${idx}" ${idx === 0 ? "checked" : ""}>
          </td>
          <td><strong>#${idx + 1}</strong></td>
          <td><span style="font-weight: 700; color: #93c5fd;">${rec.duty || "—"}</span></td>
          <td>${rec.ot || "—"}</td>
          <td>${rec.mileage || "—"}</td>
          <td style="font-size: 0.78rem; color: rgba(255,255,255,0.7);">${rec.detailsText}</td>
        `;

        tr.addEventListener("click", (e) => {
          if (e.target.tagName !== "INPUT") {
            const r = tr.querySelector('input[type="radio"]');
            if (r) r.checked = true;
          }
          tableBody.querySelectorAll("tr").forEach((row) => row.classList.remove("is-selected"));
          tr.classList.add("is-selected");
          if (optSingle) optSingle.checked = true;
          syncChoiceUI();
        });

        tableBody.appendChild(tr);
      });
    }

    // Default choice is Single (First record selected)
    if (optSingle) optSingle.checked = true;

    // Prefill manual inputs with combined data
    if (manualDuty)    manualDuty.value    = combined.duty;
    if (manualOt)      manualOt.value      = combined.ot;
    if (manualMileage) manualMileage.value = combined.mileage;

    function syncChoiceUI() {
      if (optManual && optManual.checked) {
        if (manualBox) manualBox.style.display = "grid";
      } else {
        if (manualBox) manualBox.style.display = "none";
      }
    }

    function onChoiceChange() {
      syncChoiceUI();
    }

    [optSingle, optCombine, optManual].forEach((rb) => {
      if (rb) rb.addEventListener("change", onChoiceChange);
    });
    syncChoiceUI();

    function cleanup() {
      if (applyBtn)      applyBtn.removeEventListener("click", onApply);
      if (combineAllBtn) combineAllBtn.removeEventListener("click", onCombineAll);
      dialog.removeEventListener("cancel", onCancel);
      [optSingle, optCombine, optManual].forEach((rb) => {
        if (rb) rb.removeEventListener("change", onChoiceChange);
      });
      if (dialog.open) dialog.close();
    }

    function getSelectedRowRecord() {
      const picked = tableBody ? tableBody.querySelector('input[name="multiRecordRowPick"]:checked') : null;
      const idx = picked ? Number(picked.value) : 0;
      return parsedRecords[idx] || parsedRecords[0];
    }

    function onApply() {
      let result;
      if (optManual && optManual.checked) {
        result = {
          duty: manualDuty ? manualDuty.value.trim() : combined.duty,
          ot: manualOt ? manualOt.value.trim() : combined.ot,
          mileage: manualMileage ? manualMileage.value.trim() : combined.mileage,
          combineAll: false,
        };
      } else if (optCombine && optCombine.checked) {
        result = { ...combined, combineAll: false };
      } else {
        const picked = getSelectedRowRecord();
        result = { duty: picked.duty, ot: picked.ot, mileage: picked.mileage, combineAll: false };
      }
      cleanup();
      resolve(result);
    }

    function onCombineAll() {
      cleanup();
      resolve({ ...combined, combineAll: true });
    }

    function onCancel(e) {
      e.preventDefault();
      cleanup();
      resolve({ ...combined, combineAll: false });
    }

    if (applyBtn)      applyBtn.addEventListener("click", onApply);
    if (combineAllBtn) combineAllBtn.addEventListener("click", onCombineAll);
    dialog.addEventListener("cancel", onCancel);

    dialog.showModal();
  });
}

// ISO date string "YYYY-MM-DD" banao
function toIsoDate(y, m1based, d) {
  return `${y}-${String(m1based).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Daily row ke liye correct column index nikalo (1-based employee index)
// Each employee has 3 cells: Duty(0), OT(1), Mileage(2)
// Row cells order: [dateCell, emp1_duty, emp1_ot, emp1_mileage, emp2_duty, ...]
function getDataCellsForEmployee(dailyRow, empIndex1based) {
  // dateCell is index 0, then per-employee triplets
  const allCells = Array.from(dailyRow.querySelectorAll("td"));
  const base = 1 + (empIndex1based - 1) * 3; // skip date cell
  return {
    dutyCell:    allCells[base],
    otCell:      allCells[base + 1],
    mileageCell: allCells[base + 2],
  };
}

// ── VBA-matched duty types that qualify for highlighting ──────────────────────
const VALID_HIGHLIGHT_DUTIES = new Set(["M", "P", "OP", "G"]);

// Check if a duty string contains at least one valid VBA duty type (M/P/OP/G)
// Handles combined duties like "M / P", "2M", "OP/G" etc.
function hasValidDuty(dutyText) {
  if (!dutyText) return false;
  const parts = String(dutyText).toUpperCase().split("/");
  return parts.some((part) => {
    const trimmed = part.trim();
    // Strip leading numeric prefix e.g. "2M" -> "M"
    const stripped = trimmed.replace(/^\d+/, "").trim();
    return VALID_HIGHLIGHT_DUTIES.has(stripped) || VALID_HIGHLIGHT_DUTIES.has(trimmed);
  });
}

// Holiday + Sunday coloring — VBA-matched behaviour:
// Applies color to EACH EMPLOYEE's 3-cell block (Duty+OT+Mileage) on that row
// Sunday = light blue RGB(173,216,230), Gazetted = light orange RGB(255,192,128)
// Sunday wins over Gazetted (same as VBA). Only rows with valid duty get colored.
// Date cell also gets colored for visual reference.
function applyHolidayColors(holidaySet) {
  const dailyRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="daily-date"]'));
  dailyRows.forEach((row, idx) => {
    const allCells = Array.from(row.querySelectorAll("td"));
    const dateCell = allCells[0]; // first cell = date
    if (!dateCell || row.dataset.monthActive !== "true") return;

    const day     = idx + 1;
    const isoDate = toIsoDate(seedDate.getFullYear(), seedDate.getMonth() + 1, day);
    const dow     = new Date(seedDate.getFullYear(), seedDate.getMonth(), day).getDay();
    const isSun   = dow === 0;
    const isGaz   = holidaySet.has(isoDate);

    // Reset date cell classes
    dateCell.classList.remove("op72-date-blue", "op72-date-orange");

    // Color date cell (always, regardless of duty — for reference)
    if (isSun) {
      dateCell.classList.add("op72-date-blue");
    } else if (isGaz) {
      dateCell.classList.add("op72-date-orange");
    }

    // Color each employee's 3-cell block — VBA: only if valid duty (M/P/OP/G)
    for (let empIdx = 1; empIdx <= employeeCount; empIdx += 1) {
      const base = 1 + (empIdx - 1) * 3; // skip date cell
      const dutyCell    = allCells[base];
      const otCell      = allCells[base + 1];
      const mileageCell = allCells[base + 2];
      if (!dutyCell) continue;

      // Multi-entry check: agar is date pe multi-entry resolve hui thi, to lite seagreen barkarar rahe
      if (dutyCell.dataset.multiEntry === "true") {
        [dutyCell, otCell, mileageCell].forEach((cell) => {
          if (cell) {
            cell.style.backgroundColor = "rgb(162, 226, 220)";
            cell.title = "Multiple raw data entries on this date";
          }
        });
        continue;
      }

      // Clear previous highlight inline styles
      [dutyCell, otCell, mileageCell].forEach((cell) => {
        if (cell) cell.style.backgroundColor = "";
      });

      const dutyText = (dutyCell.textContent || "").trim();
      if (!hasValidDuty(dutyText)) continue; // VBA: skip if not M/P/OP/G

      let bgColor = "";
      if (isSun) {
        bgColor = "rgb(173,216,230)"; // light blue — Sunday (wins over Gazetted)
      } else if (isGaz) {
        bgColor = "rgb(255,192,128)"; // light orange — Gazetted
      }

      if (bgColor) {
        [dutyCell, otCell, mileageCell].forEach((cell) => {
          if (cell) cell.style.backgroundColor = bgColor;
        });
      }
    }
  });
}

// ── Summary auto-calculation — VBA-matched ───────────────────────────────────
// Called after loadAllEmployees fills the daily rows.
// Calculates per-employee: OT total, Mileage(M/P/OP/G), Sunday count,
// Gazetted count, and other duty type counts — matching VBA logic.
function calculateAndFillSummary(holidaySet, employees = []) {
  const dailyRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="daily-date"]'));

  // Collect all other-duty maps across employees for tail row rendering
  const allOtherDutyMaps = []; // index = empIdx-1

  // For each employee accumulate totals
  for (let empIdx = 1; empIdx <= employeeCount; empIdx += 1) {
    let totalOtMins   = 0;
    let mileageM      = 0;
    let mileageP      = 0;
    let mileageOpG    = 0;
    let sundayCount   = 0;
    let gazettedCount = 0;
    const otherDutyMap = new Map(); // duty -> count (non M/P/OP/G)

    dailyRows.forEach((row, idx) => {
      if (row.dataset.monthActive !== "true") return;

      const allCells = Array.from(row.querySelectorAll("td"));
      const base = 1 + (empIdx - 1) * 3;
      const dutyCell    = allCells[base];
      const otCell      = allCells[base + 1];
      const mileageCell = allCells[base + 2];
      if (!dutyCell) return;

      const dutyRaw     = (dutyCell.textContent    || "").trim();
      const otRaw       = (otCell?.textContent      || "").trim();
      const mileageRaw  = (mileageCell?.textContent || "").trim();

      if (!dutyRaw) return; // empty row — skip

      // OT accumulate
      totalOtMins += parseOtToMinutes(otRaw);

      // Date info for Sunday/Gazetted
      const day     = idx + 1;
      const isoDate = toIsoDate(seedDate.getFullYear(), seedDate.getMonth() + 1, day);
      const dow     = new Date(seedDate.getFullYear(), seedDate.getMonth(), day).getDay();
      const isSun   = dow === 0;
      const isGaz   = holidaySet.has(isoDate);

      // Parse duty parts (handles "M / P", "2M", "OP/G" etc.) — VBA CountDutyType logic
      const parts = dutyRaw.toUpperCase().split("/");
      parts.forEach((part) => {
        const trimmed = part.trim();
        let qty    = 1;
        let symbol = trimmed;
        const numMatch = trimmed.match(/^(\d+)(.+)$/);
        if (numMatch) {
          qty    = Number(numMatch[1]);
          symbol = numMatch[2].trim();
        }

        const mileageVal = parseMileage(mileageRaw);

        if (symbol === "M") {
          mileageM += mileageVal * qty;
        } else if (symbol === "P") {
          mileageP += mileageVal * qty;
        } else if (symbol === "OP" || symbol === "G") {
          mileageOpG += mileageVal * qty;
        } else if (symbol === "S") {
          // Shunting — already counted in Operating (Shunt) summary row
        } else if (symbol) {
          // Other duty type (e.g. LR, RR, SL, CL, SPL) — count it per employee
          otherDutyMap.set(symbol, (otherDutyMap.get(symbol) || 0) + qty);
        }
      });

      // Sunday / Gazetted count — VBA: only if has valid duty
      if (hasValidDuty(dutyRaw)) {
        if (isSun)  sundayCount   += 1;
        if (isGaz)  gazettedCount += 1;
      }
    });

    // Write to summary rows
    // OT (hh:mm) → formatted string e.g. "87:30"
    writeSummaryValue(empIdx, "OT (hh:mm)",         minutesToOtString(totalOtMins));
    // Total OT → decimal days: totalMins ÷ 60 ÷ 8  (e.g. 87:30 → 87.5h ÷ 8 = 10.94)
    const totalOtDecimal = totalOtMins > 0 ? (totalOtMins / 60 / 8).toFixed(2) : "0";
    writeSummaryValue(empIdx, "Total OT",            totalOtDecimal);
    // Mileage stored as integer × 100 in DB, divide by 100 for display
    writeSummaryValue(empIdx, "Mileage (M)",         mileageM  > 0 ? (mileageM  / 100).toFixed(2) : "0");
    writeSummaryValue(empIdx, "Mileage (P)",         mileageP  > 0 ? (mileageP  / 100).toFixed(2) : "0");
    writeSummaryValue(empIdx, "Mileage (OP/G)",      mileageOpG > 0 ? (mileageOpG / 100).toFixed(2) : "0");
    writeSummaryValue(empIdx, "Sunday",              String(sundayCount));
    writeSummaryValue(empIdx, "Gazetted",            String(gazettedCount));

    // Operating counts — VBA: CountDutyType for M/Shunt/Pass/Gds
    writeSummaryValue(empIdx, "Operating (Mail)",    String(countDutyType(dailyRows, empIdx, "M")));
    writeSummaryValue(empIdx, "Operating (Shunt)",   String(countDutyType(dailyRows, empIdx, "S")));
    writeSummaryValue(empIdx, "Operating (Pass)",    String(countDutyType(dailyRows, empIdx, "P")));
    writeSummaryValue(empIdx, "Operating (Gds)",     String(countDutyType(dailyRows, empIdx, "G")));

    // ── Add late entry rows (fixed-empty) to totals ──────────────────────────
    // No highlighting for late rows — but OT, Mileage, Sunday, Gazetted all counted
    const empNameU = (employees[empIdx - 1] || "").toUpperCase();
    const lateEntries = _lateEntriesByEmployee.get(empNameU) || [];

    lateEntries.forEach((entry) => {
      // OT
      totalOtMins += entry.otMins;

      // Mileage by duty type
      const rawDuty = entry.dutyType || "";
      rawDuty.toUpperCase().split("/").forEach((part) => {
        const trimmed = part.trim();
        let qty = 1;
        let sym = trimmed;
        const nm = trimmed.match(/^(\d+)(.+)$/);
        if (nm) { qty = Number(nm[1]); sym = nm[2].trim(); }
        if (sym === "M")            mileageM   += entry.mileage * qty;
        else if (sym === "P")       mileageP   += entry.mileage * qty;
        else if (sym === "OP" || sym === "G") mileageOpG += entry.mileage * qty;
        else if (sym && sym !== "S") {
          otherDutyMap.set(sym, (otherDutyMap.get(sym) || 0) + qty);
        }
      });

      // Sunday / Gazetted — check date, count in summary even for late rows
      if (hasValidDuty(rawDuty) && entry.dateObj) {
        const dow  = entry.dateObj.getDay();
        const isoD = toIsoDate(
          entry.dateObj.getFullYear(),
          entry.dateObj.getMonth() + 1,
          entry.dateObj.getDate()
        );
        if (dow === 0)             sundayCount   += 1;
        if (holidaySet.has(isoD)) gazettedCount += 1;
      }
    });

    // ── Operating counts include late rows too ──
    const operatingM = countDutyType(dailyRows, empIdx, "M") +
                       lateEntries.reduce((s, e) => s + countSymInDuty(e.dutyType, "M"), 0);
    const operatingS = countDutyType(dailyRows, empIdx, "S") +
                       lateEntries.reduce((s, e) => s + countSymInDuty(e.dutyType, "S"), 0);
    const operatingP = countDutyType(dailyRows, empIdx, "P") +
                       lateEntries.reduce((s, e) => s + countSymInDuty(e.dutyType, "P"), 0);
    const operatingG = countDutyType(dailyRows, empIdx, "G") +
                       lateEntries.reduce((s, e) => s + countSymInDuty(e.dutyType, "G"), 0);

    writeSummaryValue(empIdx, "Operating (Mail)",  String(operatingM));
    writeSummaryValue(empIdx, "Operating (Shunt)", String(operatingS));
    writeSummaryValue(empIdx, "Operating (Pass)",  String(operatingP));
    writeSummaryValue(empIdx, "Operating (Gds)",   String(operatingG));

    // ── Re-write totals now that late entries are added ──
    const empNameNorm = (employees[empIdx - 1] || "").replace(/[\s\.\-_]+/g, " ").trim().toUpperCase();
    const isArshadEmp = empNameNorm.includes("ARSHAD MEHMOOD");
    const isAmjadEmp  = empNameNorm.includes("AMJAD PERVAIZ");
    const isSpecialDIEmp = isArshadEmp || isAmjadEmp;

    if (isSpecialDIEmp) {
      let diDays = 0;
      if (otherDutyMap.has("DI")) {
        diDays = otherDutyMap.get("DI") || 0;
        otherDutyMap.delete("DI");
      }
      const activeDays = dailyRows.filter((r) => r.dataset.monthActive === "true").length || 30;
      if (diDays === 0) diDays = activeDays;
      const diRatio = activeDays > 0 ? Math.min(1, Math.max(0, diDays / activeDays)) : 1;

      let finalOt = totalOtMins / 60 / 8;
      let finalMileOpG = mileageOpG / 100;
      let finalMileM = mileageM / 100;

      if (isArshadEmp) {
        const diFixedOt = diRatio * 30;
        const diFixedMileOPG = diRatio * 28;
        finalOt = Number((diFixedOt + finalOt).toFixed(2));
        finalMileOpG = Number((diFixedMileOPG + finalMileOpG).toFixed(2));
        writeSummaryValue(empIdx, "Mileage (OP/G)", finalMileOpG.toFixed(2));
        writeSummaryValue(empIdx, "Mileage (M)", mileageM > 0 ? (mileageM / 100).toFixed(2) : "0");
      } else if (isAmjadEmp) {
        const diFixedOt = diRatio * 10;
        const diFixedMileM = diRatio * 42;
        finalOt = Number((diFixedOt + finalOt).toFixed(2));
        finalMileM = Number((diFixedMileM + finalMileM).toFixed(2));
        writeSummaryValue(empIdx, "Mileage (M)", finalMileM.toFixed(2));
        writeSummaryValue(empIdx, "Mileage (OP/G)", mileageOpG > 0 ? (mileageOpG / 100).toFixed(2) : "0");
      }

      const totalOtHours = finalOt * 8;
      writeSummaryValue(empIdx, "OT (hh:mm)", minutesToOtString(Math.round(totalOtHours * 60)));
      writeSummaryValue(empIdx, "Total OT", finalOt.toFixed(2));
      writeSummaryValue(empIdx, "Mileage (P)", mileageP > 0 ? (mileageP / 100).toFixed(2) : "0");
      writeSummaryValue(empIdx, "Sunday", String(sundayCount));
      writeSummaryValue(empIdx, "Gazetted", String(gazettedCount));
    } else {
      writeSummaryValue(empIdx, "OT (hh:mm)",    minutesToOtString(totalOtMins));
      writeSummaryValue(empIdx, "Total OT",      totalOtMins > 0 ? (totalOtMins / 60 / 8).toFixed(2) : "0");
      writeSummaryValue(empIdx, "Mileage (M)",   mileageM   > 0 ? (mileageM   / 100).toFixed(2) : "0");
      writeSummaryValue(empIdx, "Mileage (P)",   mileageP   > 0 ? (mileageP   / 100).toFixed(2) : "0");
      writeSummaryValue(empIdx, "Mileage (OP/G)",mileageOpG > 0 ? (mileageOpG / 100).toFixed(2) : "0");
      writeSummaryValue(empIdx, "Sunday",   String(sundayCount));
      writeSummaryValue(empIdx, "Gazetted", String(gazettedCount));
    }

    // Save map for tail row rendering after all employees processed
    allOtherDutyMaps.push(otherDutyMap);
  }

  // ── Determine how many tail rows are needed ──
  // Maximum number of distinct other duties any single employee has (minimum 5)
  const maxOtherDuties = Math.max(5, ...allOtherDutyMaps.map((map) => map.size));

  // ── Ensure enough tail rows exist (add more if needed) ──
  const existingTailRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="summary-tail"]'));
  while (existingTailRows.length < maxOtherDuties) {
    const newIdx = existingTailRows.length;
    const tr = document.createElement("tr");
    tr.dataset.rowType = "summary-tail";
    tr.dataset.tailIndex = String(newIdx);
    for (let employee = 1; employee <= employeeCount; employee += 1) {
      const labelPad = document.createElement("td");
      labelPad.colSpan = 2;
      labelPad.className = "op72-summary-tail";
      markEditable(labelPad);
      tr.appendChild(labelPad);

      const valuePad = createEditableCell("", "op72-summary-tail-value");
      tr.appendChild(valuePad);
    }
    op72Body.appendChild(tr);
    existingTailRows.push(tr);
  }

  // ── Update summaryTitle rowSpan ──
  const summaryTitleEl = document.getElementById("op72SummaryTitle");
  if (summaryTitleEl) {
    summaryTitleEl.rowSpan = 1 + summaryRows.length + maxOtherDuties;
  }

  // ── Fill tail rows: per employee individual duty code + count (only from their own month record) ──
  const tailRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="summary-tail"]'));
  tailRows.forEach((tr, rowIdx) => {
    const tds = Array.from(tr.querySelectorAll("td"));
    for (let empIdx = 1; empIdx <= employeeCount; empIdx += 1) {
      const labelCell = tds[(empIdx - 1) * 2];
      const valueCell = tds[(empIdx - 1) * 2 + 1];
      if (!labelCell || !valueCell) continue;

      const empDutyList = Array.from(allOtherDutyMaps[empIdx - 1].entries())
        .filter(([_, count]) => count > 0)
        .sort((a, b) => a[0].localeCompare(b[0]));

      if (rowIdx < empDutyList.length) {
        const [sym, count] = empDutyList[rowIdx];
        labelCell.textContent = sym;
        valueCell.textContent = String(count);
      } else {
        labelCell.textContent = "";
        valueCell.textContent = "";
      }
    }
  });
}

// Count how many times a specific duty symbol appears for an employee
// Matches VBA CountDutyType: splits by "/", strips numeric prefix
function countDutyType(dailyRows, empIdx1based, symbol) {
  const target = symbol.toUpperCase();
  let count = 0;
  dailyRows.forEach((row) => {
    if (row.dataset.monthActive !== "true") return;
    const allCells = Array.from(row.querySelectorAll("td"));
    const base = 1 + (empIdx1based - 1) * 3;
    const dutyCell = allCells[base];
    if (!dutyCell) return;
    const raw = (dutyCell.textContent || "").toUpperCase();
    if (!raw) return;
    raw.split("/").forEach((part) => {
      const trimmed = part.trim();
      let qty = 1;
      let sym = trimmed;
      const m = trimmed.match(/^(\d+)(.+)$/);
      if (m) { qty = Number(m[1]); sym = m[2].trim(); }
      if (sym === target) count += qty;
    });
  });
  return count;
}

// Count occurrences of a duty symbol inside a raw duty string (e.g. "2M/G" has 2 M, 1 G)
function countSymInDuty(dutyRaw, symbol) {
  if (!dutyRaw) return 0;
  const target = symbol.toUpperCase();
  let count = 0;
  dutyRaw.toUpperCase().split("/").forEach((part) => {
    const trimmed = part.trim();
    let qty = 1;
    let sym = trimmed;
    const m = trimmed.match(/^(\d+)(.+)$/);
    if (m) { qty = Number(m[1]); sym = m[2].trim(); }
    if (sym === target) count += qty;
  });
  return count;
}

// Write a value into the summary value cell for a given employee + label
function writeSummaryValue(empIdx1based, label, value) {
  const summaryValueCells = Array.from(
    op72Body.querySelectorAll("td.op72-summary-value")
  );
  // Summary value cells order: for each summaryRow there are employeeCount cells
  const labelIndex = summaryRows.indexOf(label);
  if (labelIndex < 0) return;
  const cellIndex = labelIndex * employeeCount + (empIdx1based - 1);
  const cell = summaryValueCells[cellIndex];
  if (cell) cell.textContent = value;
}
function writeEmployeeDayData(dailyRow, empIndex1based, duty, ot, mileage, isMulti = false) {
  const { dutyCell, otCell, mileageCell } = getDataCellsForEmployee(dailyRow, empIndex1based);
  if (!dutyCell) return;

  [dutyCell, otCell, mileageCell].forEach((cell) => {
    if (!cell) return;
    cell.classList.remove("op72-locked-cell");
    cell.contentEditable = "false";
  });

  dutyCell.textContent    = duty;
  otCell.textContent      = ot;
  mileageCell.textContent = mileage;

  if (isMulti) {
    [dutyCell, otCell, mileageCell].forEach((cell) => {
      if (!cell) return;
      cell.dataset.multiEntry = "true";
      cell.style.backgroundColor = "rgb(162, 226, 220)"; // lite seagreen
      cell.title = "Multiple raw data entries resolved for this date";
    });
  } else {
    [dutyCell, otCell, mileageCell].forEach((cell) => {
      if (!cell) return;
      delete cell.dataset.multiEntry;
      if (cell.style.backgroundColor === "rgb(162, 226, 220)") {
        cell.style.backgroundColor = "";
      }
      if (cell.title === "Multiple raw data entries resolved for this date") {
        cell.removeAttribute("title");
      }
    });
  }
}

// Fetch search results from /api/op72/search
async function fetchOp72Data(employeeName, monthLabel, year) {
  const url = `${OP72_API_BASE}/api/op72/search?employee=${encodeURIComponent(employeeName)}&month=${monthLabel}&year=${year}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data.records) ? data.records : [];
}

// Fetch holidays — pass monthYYYYMM for specific month, or yearPrefix "YYYY" for full year
async function fetchHolidays(monthYYYYMM, yearPrefix) {
  let url = `${HOLIDAYS_API_BASE}/api/holidays`;
  if (monthYYYYMM) url += `?month=${monthYYYYMM}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json();
  let list = Array.isArray(data.holidays) ? data.holidays : [];
  // Normalize: server returns [{date,name}] — extract just the date strings
  list = list.map((h) => (typeof h === "string" ? h : String(h.date || "")))
             .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  // If yearPrefix given (and no month filter), filter to that year only
  if (yearPrefix && !monthYYYYMM) {
    list = list.filter((d) => d.startsWith(yearPrefix));
  }
  return list;
}

// Server response record ko rowValues array mein convert karo
// Server returns flat objects: { dateEntry, employee1, employee2, dutyType, ot, mileage, ... }
function recordToRowValues(rec) {
  if (Array.isArray(rec.rowValues)) return rec.rowValues;
  // Flat object format (from rowValuesToSearchRecord)
  return [
    rec.dateEntry  || "",
    rec.employee1  || "",
    rec.employee2  || "",
    rec.dutyType   || "",
    rec.ot         || "",
    rec.mileage    || "",
    rec.outwardDuty       || "",
    rec.outwardCommenced  || "",
    rec.outwardTerminated || "",
    rec.inwardDuty        || "",
    rec.inwardCommenced   || "",
    rec.inwardTerminated  || "",
    rec.remarks    || "",
  ];
}

// Group records by day-of-month
function groupByDay(records, year, month0based) {
  const byDay = new Map(); // day (1-31) => array of rowValues
  records.forEach((rec) => {
    const rv = recordToRowValues(rec);
    const dateStr = String(rv[0] || "").trim();
    if (!dateStr) return;

    // Try to parse date
    let dt = null;
    // Format "d-Mon-YY" e.g. "5-Jun-26"
    const dmyShort = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
    if (dmyShort) {
      const d  = Number(dmyShort[1]);
      const mIdx = MONTH_LABELS.indexOf(dmyShort[2].toUpperCase());
      let y = Number(dmyShort[3]);
      if (y < 100) y += 2000;
      if (mIdx >= 0) dt = new Date(y, mIdx, d);
    }
    // ISO format
    if (!dt) {
      const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (iso) dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }
    // dd/mm/yyyy
    if (!dt) {
      const dmy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmy) dt = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    }

    if (!dt || dt.getFullYear() !== year || dt.getMonth() !== month0based) return;

    const d = dt.getDate();
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(rv);
  });
  return byDay;
}

const op72LoadAllBtn = document.getElementById("op72LoadAllBtn");

async function loadAllEmployees() {
  // 1. Group selected check
  const selectedGroup = String(op72GroupSelect?.value || "").trim();
  if (!selectedGroup || !groupLookup.has(selectedGroup)) {
    op72Msg.textContent = "Pehle koi group select karein (Load Group).";
    return;
  }

  // 2. Month check
  const monthYYYYMM = formatMonthInputValue(seedDate); // "YYYY-MM"
  const year        = seedDate.getFullYear();
  const month0      = seedDate.getMonth();             // 0-based
  const monthLabel  = MONTH_LABELS[month0];            // "JAN".."DEC"

  const employees = groupLookup.get(selectedGroup).filter(Boolean);
  if (!employees.length) {
    op72Msg.textContent = "Selected group mein koi employee nahi hai.";
    return;
  }

  // Disable button during load
  if (op72LoadAllBtn) op72LoadAllBtn.disabled = true;
  op72Msg.textContent = `Loading ${employees.length} employees for ${monthLabel} ${year}…`;

  try {
    // 3. Holidays fetch — fetch ALL holidays for the year so late entries also get checked
    const yearPrefix     = String(seedDate.getFullYear());
    const holidayDates   = await fetchHolidays(null, yearPrefix); // all holidays this year
    const holidaySet     = new Set(holidayDates);

    // 4. Per-employee data fetch & write
    const dailyRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="daily-date"]'));

    let loadedCount = 0;
    let combineAllRemaining = false;

    for (let empIdx = 0; empIdx < employees.length; empIdx += 1) {
      const empName = employees[empIdx];
      if (!empName) continue;

      let records = [];
      try {
        records = await fetchOp72Data(empName, monthLabel, year);
      } catch (fetchErr) {
        op72Msg.textContent = `${empName}: data load nahi hua — ${fetchErr.message}`;
        continue;
      }

      // Group records by day
      const byDay = groupByDay(records, year, month0);

      // Write into table rows (async aware for multi-entry prompt)
      for (const [day, dayRecords] of byDay.entries()) {
        const rowIndex = day - 1; // 0-based index into dailyRows
        if (rowIndex < 0 || rowIndex >= dailyRows.length) continue;
        const row = dailyRows[rowIndex];
        if (row.dataset.monthActive !== "true") continue;

        let duty = "", ot = "", mileage = "";
        let isMulti = false;
        if (dayRecords.length === 1) {
          const s = extractRecordValues(dayRecords[0]);
          duty    = s.duty;
          ot      = s.ot;
          mileage = s.mileage;
          isMulti = false;
        } else if (dayRecords.length > 1) {
          isMulti = true;
          if (combineAllRemaining) {
            const c = combineRecords(dayRecords);
            duty    = c.duty;
            ot      = c.ot;
            mileage = c.mileage;
          } else {
            const dateStr = `${String(day).padStart(2, "0")}-${monthLabel}-${year}`;
            const resolved = await promptMultiEntryResolution(empName, dateStr, dayRecords);
            if (resolved.combineAll) {
              combineAllRemaining = true;
            }
            duty    = resolved.duty;
            ot      = resolved.ot;
            mileage = resolved.mileage;
          }
        }

        writeEmployeeDayData(row, empIdx + 1, duty, ot, mileage, isMulti);
      }

      // If Driver Instructor (Arshad Mehmood or Amjad Pervaiz), default days without explicit records to DI
      const normEmp = String(empName || "").replace(/[\s\.\-_]+/g, " ").trim().toUpperCase();
      if (normEmp.includes("ARSHAD MEHMOOD") || normEmp.includes("AMJAD PERVAIZ")) {
        const daysInMonth = new Date(year, month0 + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          if (!byDay.has(day)) {
            const rowIndex = day - 1;
            if (rowIndex >= 0 && rowIndex < dailyRows.length) {
              const row = dailyRows[rowIndex];
              if (row && row.dataset.monthActive === "true") {
                writeEmployeeDayData(row, empIdx + 1, "DI", "", "", false);
              }
            }
          }
        }
      }

      loadedCount += 1;
    }

    // 5. Apply holiday colors (VBA-matched: employee 3-cell blocks)
    applyHolidayColors(holidaySet);

    // 6. Fetch & fill late entry rows (previous month entries with remarks=current month)
    const lateRemarks = currentMonthRemarksLabel();
    const lateEntriesByEmployee = await fetchLateEntries(employees, lateRemarks);
    fillLateEntryRows(lateEntriesByEmployee, employees, holidaySet);

    // 7. Auto-calculate summary — includes late entries via _lateEntriesByEmployee cache
    calculateAndFillSummary(holidaySet, employees);

    // 8. Auto-save sheet data to localStorage immediately
    saveSheetData();
    setDirtyState(false);
    const lateCount = Array.from(lateEntriesByEmployee.values()).reduce((s, v) => s + v.length, 0);
    op72Msg.textContent = `${loadedCount}/${employees.length} employees loaded for ${monthLabel} ${year}. Holidays: ${holidaySet.size}. Late entries: ${lateCount}. Sheet data saved.`;

  } catch (err) {
    op72Msg.textContent = `Load failed: ${err.message}`;
  } finally {
    if (op72LoadAllBtn) op72LoadAllBtn.disabled = false;
  }
}

if (op72LoadAllBtn) {
  op72LoadAllBtn.addEventListener("click", loadAllEmployees);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LATE ENTRY ROWS — Previous month entries with remarks = current month name
// ═══════════════════════════════════════════════════════════════════════════════

// Module-level cache for late entry data (set after loadAllEmployees)
// Structure: Map<empIdx1based, Array<{dateEntry, dutyType, otMins, mileage, dateObj}>>
let _lateEntriesByEmployee = new Map();

// Month name format used in remarks: "June 2026", "May 2026" etc.
function currentMonthRemarksLabel() {
  const FULL_MONTHS = ["January","February","March","April","May","June",
                       "July","August","September","October","November","December"];
  return `${FULL_MONTHS[seedDate.getMonth()]} ${seedDate.getFullYear()}`;
}

// Parse a date string from OP72 Raw Data into a JS Date (or null)
function parseLateEntryDate(dateStr) {
  const s = String(dateStr || "").trim();
  if (!s) return null;
  // "d-Mon-YY" e.g. "5-May-26"
  const dmy = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const mIdx = MONTH_LABELS.indexOf(dmy[2].toUpperCase());
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    if (mIdx >= 0) return new Date(y, mIdx, d);
  }
  // ISO "YYYY-MM-DD"
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  // dd/mm/yyyy
  const dmy2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy2) return new Date(Number(dmy2[3]), Number(dmy2[2]) - 1, Number(dmy2[1]));
  return null;
}

// Fetch ALL op72 workbook rows, then filter for late entries:
// - dateEntry month < current selected month (same year)
// - remarks === current month name (e.g. "June 2026")
// Returns Map<empName.toUpperCase(), Array<rowValues>>
async function fetchLateEntries(employees, currentMonthLabel) {
  const result = new Map(); // empName.upper => [{dateObj, dutyType, otMins, mileage}]

  let allRows = [];
  try {
    const payload = await fetch(`${OP72_API_BASE}/api/op72/workbook`, {
      headers: { Accept: "application/json" },
    }).then((r) => r.json());
    allRows = Array.isArray(payload.rows) ? payload.rows : [];
    // Skip header rows (first 2)
    if (Array.isArray(payload.rowMeta)) {
      allRows = allRows.filter((_, i) => {
        const meta = payload.rowMeta[i];
        return !meta || meta.rowKind === "data";
      });
    }
  } catch {
    return result;
  }

  const empSet = new Set(employees.map((n) => n.toUpperCase()));
  const targetYear = seedDate.getFullYear();
  const targetMonth0 = seedDate.getMonth(); // 0-based current month

  for (const row of allRows) {
    // remarks (col 12) must match currentMonthLabel
    const remarks = String(row[12] || "").trim();
    if (remarks.toLowerCase() !== currentMonthLabel.toLowerCase()) continue;

    // employee1 (col 1) or employee2 (col 2) must be in our group
    const emp1 = String(row[1] || "").trim().toUpperCase();
    const emp2 = String(row[2] || "").trim().toUpperCase();
    const matchedEmp = empSet.has(emp1) ? emp1 : (empSet.has(emp2) ? emp2 : null);
    if (!matchedEmp) continue;

    // date must be < current month (same year)
    const dateObj = parseLateEntryDate(String(row[0] || "").trim());
    if (!dateObj) continue;
    if (dateObj.getFullYear() !== targetYear) continue;
    if (dateObj.getMonth() >= targetMonth0) continue; // must be strictly before current month

    if (!result.has(matchedEmp)) result.set(matchedEmp, []);
    result.get(matchedEmp).push({
      dateObj,
      dutyType: String(row[3] || "").trim().toUpperCase(),
      otMins:   parseOtToMinutes(row[4]),
      mileage:  parseMileage(row[5]),
    });
  }

  return result;
}

// Group late entries per employee by duty type symbol (e.g. M, G, P, OP)
// Returns Map<dutySymbol, {count, otMins, mileage, dates: [dateObj, ...]}>
function groupLateEntriesByDuty(entries) {
  const grouped = new Map();

  for (const entry of entries) {
    const rawDuty = entry.dutyType || "";
    if (!rawDuty) continue;

    // Parse duty parts: "2M" → qty=2, sym="M"; "M/G" → two entries
    const parts = rawDuty.toUpperCase().split("/");
    parts.forEach((part) => {
      const trimmed = part.trim();
      let qty = 1;
      let sym = trimmed;
      const nm = trimmed.match(/^(\d+)(.+)$/);
      if (nm) { qty = Number(nm[1]); sym = nm[2].trim(); }
      if (!sym) return;

      if (!grouped.has(sym)) {
        grouped.set(sym, { count: 0, otMins: 0, mileage: 0, dates: [] });
      }
      const g = grouped.get(sym);
      g.count   += qty;
      g.otMins  += entry.otMins;
      g.mileage += entry.mileage;
      if (!g.dates.some((d) => d.getTime() === entry.dateObj.getTime())) {
        g.dates.push(entry.dateObj);
      }
    });
  }

  // Sort dates within each group
  grouped.forEach((g) => g.dates.sort((a, b) => a - b));
  return grouped;
}

// Fill the 4 fixed-empty rows with late entry grouped data.
// Each row = one duty-type group (2M, 3G etc.) summed across all employees.
// Date cell stays blank — it's updated on employee click.
function fillLateEntryRows(lateEntriesByEmployee, employees, holidaySet) {
  const fixedRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="fixed-empty"]'));
  if (!fixedRows.length) return;

  // Build combined duty groups across all employees
  // Map<sym, Map<empIdx0, {count,otMins,mileage,dates[]}>>
  const combinedBySymbol = new Map();

  employees.forEach((empName, empIdx0) => {
    const empNameU = empName.toUpperCase();
    const entries  = lateEntriesByEmployee.get(empNameU) || [];
    const grouped  = groupLateEntriesByDuty(entries);

    grouped.forEach((g, sym) => {
      if (!combinedBySymbol.has(sym)) combinedBySymbol.set(sym, new Map());
      combinedBySymbol.get(sym).set(empIdx0, g);
    });
  });

  // Sort symbols alphabetically
  const symbols = Array.from(combinedBySymbol.keys()).sort();

  // Clear all fixed rows first
  fixedRows.forEach((row) => {
    row.querySelectorAll("td").forEach((cell) => {
      cell.textContent = "";
      cell.style.backgroundColor = "";
      cell.classList.remove("op72-date-blue", "op72-date-orange");
    });
    // Store metadata on the row for click-date feature
    delete row.dataset.lateSymbol;
    delete row.dataset.lateRowIndex;
  });

  // Fill rows — one symbol per row, up to 4 rows
  symbols.forEach((sym, rowIdx) => {
    if (rowIdx >= fixedRows.length) return; // max 4 rows
    const row = fixedRows[rowIdx];
    row.dataset.lateSymbol   = sym;
    row.dataset.lateRowIndex = String(rowIdx);
    const allCells = Array.from(row.querySelectorAll("td"));
    // Date cell (index 0) — blank initially
    const dateCell = allCells[0];
    if (dateCell) dateCell.textContent = "";

    // Per-employee: fill duty, OT, mileage
    const empDataMap = combinedBySymbol.get(sym);
    for (let empIdx0 = 0; empIdx0 < employees.length; empIdx0 += 1) {
      const base     = 1 + empIdx0 * 3;
      const dutyCell = allCells[base];
      const otCell   = allCells[base + 1];
      const milCell  = allCells[base + 2];
      if (!dutyCell) continue;

      const g = empDataMap.get(empIdx0);
      if (!g || g.count === 0) {
        dutyCell.textContent = "";
        if (otCell)  otCell.textContent  = "";
        if (milCell) milCell.textContent = "";
        continue;
      }

      dutyCell.textContent = `${g.count}${sym}`;
      if (otCell)  otCell.textContent  = g.otMins  > 0 ? minutesToOtString(g.otMins)              : "";
      if (milCell) milCell.textContent = g.mileage > 0 ? (g.mileage / 100).toFixed(2) : "";

      // Lock cells (non-editable)
      [dutyCell, otCell, milCell].forEach((cell) => {
        if (!cell) return;
        cell.classList.remove("op72-locked-cell");
        cell.contentEditable = "false";
      });
    }
  });

  // Save late entries map for click-date feature
  _lateEntriesByEmployee = lateEntriesByEmployee;
}

// On click of any cell in an employee column → update date cells of late-entry rows
function attachLateEntryDateClickHandler(employees) {
  op72Table.addEventListener("click", (event) => {
    const td = event.target.closest("td");
    if (!td) return;

    // Find which employee column was clicked (1-based)
    const row = td.closest("tr");
    if (!row) return;

    // Determine empIdx from td position within the row
    const allCells = Array.from(row.querySelectorAll("td"));
    const tdIdx    = allCells.indexOf(td);
    if (tdIdx <= 0) return; // date column or not found
    const empIdx0  = Math.floor((tdIdx - 1) / 3); // 0-based
    if (empIdx0 < 0 || empIdx0 >= employees.length) return;

    const empName = employees[empIdx0];
    if (!empName) return;
    const empNameU = empName.toUpperCase();
    const entries  = _lateEntriesByEmployee.get(empNameU) || [];
    if (!entries.length) {
      // No late entries — clear date cells
      updateLateRowDateCells([]);
      return;
    }

    // Group by duty to know which dates go in which row
    const grouped = groupLateEntriesByDuty(entries);
    const symbols  = Array.from(grouped.keys()).sort();

    const fixedRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="fixed-empty"]'));
    fixedRows.forEach((fixedRow, rowIdx) => {
      const dateCell = fixedRow.querySelector("td.op72-date-cell");
      if (!dateCell) return;
      const sym = symbols[rowIdx];
      if (!sym) { dateCell.textContent = ""; return; }
      const g = grouped.get(sym);
      if (!g || !g.dates.length) { dateCell.textContent = ""; return; }
      // Show day + short month name: "3-May,7-May,10-May"
      const MON_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      dateCell.textContent = g.dates
        .map((d) => `${d.getDate()}-${MON_SHORT[d.getMonth()]}`)
        .join(",");
    });
  });
}

function updateLateRowDateCells(dateObjs) {
  const fixedRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="fixed-empty"]'));
  fixedRows.forEach((row) => {
    const dateCell = row.querySelector("td.op72-date-cell");
    if (dateCell) dateCell.textContent = "";
  });
}

op72Table.addEventListener("input", () => {
  setDirtyState(true);
});

if (op72MonthPicker) {
  op72MonthPicker.value = formatMonthInputValue(seedDate);
  op72MonthPicker.addEventListener("change", () => {
    if (applySeedMonthFromInput(op72MonthPicker)) {
      setDirtyState(true);
      op72Msg.textContent = "Date column updated for selected month.";
    }
  });
}

if (op72GroupSelect) {
  op72GroupSelect.addEventListener("change", () => {
    const selectedGroup = String(op72GroupSelect.value || "").trim();
    applyGroupToSheet(selectedGroup);
    localStorage.setItem(op72GroupStorageKey, selectedGroup);
    setDirtyState(true);
    op72Msg.textContent = selectedGroup
      ? `Group loaded: ${selectedGroup}`
      : "Group selection cleared.";
  });
}

if (saveOp72SheetBtn) {
  saveOp72SheetBtn.addEventListener("click", saveSheetData);
}
clearOp72SheetBtn.addEventListener("click", clearSheetCellsOnly);

if (op72ZoomInBtn) {
  op72ZoomInBtn.addEventListener("click", () => applyZoom(op72Zoom + op72ZoomStep));
}

if (op72ZoomOutBtn) {
  op72ZoomOutBtn.addEventListener("click", () => applyZoom(op72Zoom - op72ZoomStep));
}

if (op72ZoomResetBtn) {
  op72ZoomResetBtn.addEventListener("click", () => applyZoom(1));
}

const op72ScrollContainer = op72Table.closest(".sheet-wrap");
if (op72ScrollContainer) {
  op72ScrollContainer.addEventListener("wheel", handleWheelZoom, { passive: false });
}



window.addEventListener("resize", () => {
  window.requestAnimationFrame(syncFixedRowsAppearance);
});

buildOp72Layout();
populateGroupSelector();
loadSheetData();
setDirtyState(false);
applyZoom(1);

// Attach late-entry date click handler once (employees passed dynamically via closure)
op72Table.addEventListener("click", (event) => {
  const td = event.target.closest("td");
  if (!td) return;
  const row = td.closest("tr");
  if (!row) return;
  if (!_lateEntriesByEmployee.size) return; // nothing loaded yet

  const allCells = Array.from(row.querySelectorAll("td"));
  const tdIdx    = allCells.indexOf(td);
  if (tdIdx <= 0) return;
  const empIdx0  = Math.floor((tdIdx - 1) / 3);
  if (empIdx0 < 0 || empIdx0 >= employeeCount) return;

  // Get current group's employees
  const selectedGroup = String(op72GroupSelect?.value || "").trim();
  const empList = groupLookup.has(selectedGroup) ? groupLookup.get(selectedGroup).filter(Boolean) : [];
  const empName = empList[empIdx0];
  if (!empName) return;
  const empNameU = empName.toUpperCase();
  const entries  = _lateEntriesByEmployee.get(empNameU) || [];

  const fixedRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="fixed-empty"]'));
  if (!entries.length) {
    fixedRows.forEach((r) => { const dc = r.querySelector("td.op72-date-cell"); if (dc) dc.textContent = ""; });
    return;
  }

  const grouped = groupLateEntriesByDuty(entries);
  const symbols  = Array.from(grouped.keys()).sort();
  const MON_SHORT_LATE = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  fixedRows.forEach((fixedRow, rowIdx) => {
    const dateCell = fixedRow.querySelector("td.op72-date-cell");
    if (!dateCell) return;
    const sym = symbols[rowIdx];
    if (!sym) { dateCell.textContent = ""; return; }
    const g = grouped.get(sym);
    dateCell.textContent = (g && g.dates.length)
      ? g.dates.map((d) => `${d.getDate()}-${MON_SHORT_LATE[d.getMonth()]}`).join(",")
      : "";
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OP-72 Preview & Quick Save (jsPDF & html2canvas) — matching GENL-164 pattern
// ─────────────────────────────────────────────────────────────────────────────
function buildOp72PdfFilename(group, selectedMonth) {
  const groupName = String(group || "SHEET").replace(/[\\/:*?"<>|]/g, "").trim().toUpperCase();
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(selectedMonth).toUpperCase();
  const yearValue = selectedMonth.getFullYear();
  const safeGroup = groupName || "SHEET";
  return `OP-72 ${safeGroup} ${monthName}-${yearValue}.pdf`;
}

function getPrintClass(pageSize) {
  const map = {
    A4: "op72-print-a4",
    A3: "op72-print-a3",
    Legal: "op72-print-legal",
  };
  return map[pageSize] || "op72-print-legal";
}

function applyPrintSize(pageSize) {
  document.body.classList.remove("op72-print-a4", "op72-print-a3", "op72-print-legal");
  document.body.classList.add(getPrintClass(pageSize));
}

let _savedDirHandle = null;

function buildDuplicateDialog(filename) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:fixed;inset:0;z-index:9999",
      "background:rgba(10,25,42,0.55);backdrop-filter:blur(4px)",
      "display:flex;align-items:center;justify-content:center",
    ].join(";");

    const card = document.createElement("div");
    card.style.cssText = [
      "background:#fff;border-radius:16px;padding:24px 28px 20px",
      "box-shadow:0 20px 60px rgba(8,24,45,0.32)",
      "max-width:420px;width:90vw;font-family:Segoe UI,sans-serif",
    ].join(";");

    card.innerHTML = `
      <p style="margin:0 0 6px;font-size:1rem;font-weight:700;color:#0a233b">File already exists</p>
      <p style="margin:0 0 18px;font-size:0.88rem;color:#355a7f;word-break:break-all">
        <strong>${filename}</strong> already exists in the selected folder.
      </p>
      <p style="margin:0 0 14px;font-size:0.86rem;color:#183a5c;font-weight:600">
        What would you like to do?
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button id="dupUpdate" style="flex:1;padding:9px 14px;border-radius:10px;border:none;
          background:linear-gradient(125deg,#e0631d,#b64207);color:#fff;
          font:700 0.9rem Segoe UI,sans-serif;cursor:pointer">
          Update (Overwrite)
        </button>
        <button id="dupNew" style="flex:1;padding:9px 14px;border-radius:10px;
          border:1px solid #7ea6cd;background:#fff;color:#0a233b;
          font:700 0.9rem Segoe UI,sans-serif;cursor:pointer">
          Save as New Copy
        </button>
        <button id="dupCancel" style="width:100%;padding:7px 14px;border-radius:10px;
          border:1px solid #ccc;background:#f4f7fa;color:#355a7f;
          font:600 0.85rem Segoe UI,sans-serif;cursor:pointer;margin-top:2px">
          Cancel
        </button>
      </div>`;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function cleanup(result) {
      document.body.removeChild(overlay);
      resolve(result);
    }

    card.querySelector("#dupUpdate").addEventListener("click", () => cleanup("update"));
    card.querySelector("#dupNew").addEventListener("click",    () => cleanup("new"));
    card.querySelector("#dupCancel").addEventListener("click", () => cleanup("cancel"));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup("cancel"); });
  });
}

function makeUniqueName(name) {
  const dot = name.lastIndexOf(".");
  const base = dot > -1 ? name.slice(0, dot) : name;
  const ext  = dot > -1 ? name.slice(dot) : "";
  const match = base.match(/^(.*) \((\d+)\)$/);
  if (match) {
    return `${match[1]} (${Number(match[2]) + 1})${ext}`;
  }
  return `${base} (2)${ext}`;
}

async function savePdfBlob(pdfBlob, suggestedName) {
  // ── Path A: File System Access API (Chrome / Edge) ──────────────────────
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: "PDF Document", accept: { "application/pdf": [".pdf"] } }],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(pdfBlob);
      await writable.close();
      if (op72Msg) op72Msg.textContent = `Saved: "${fileHandle.name}"`;
      return;
    } catch (err) {
      if (err.name === "AbortError") {
        if (op72Msg) op72Msg.textContent = "Save cancelled.";
        return;
      }
    }
  }

  // ── Path B: Directory picker — remember last folder, check for duplicates ─
  if (typeof window.showDirectoryPicker === "function") {
    try {
      let dirHandle = _savedDirHandle;
      if (!dirHandle) {
        dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        _savedDirHandle = dirHandle;
      }

      let finalName = suggestedName;
      let exists = false;
      try {
        await dirHandle.getFileHandle(suggestedName, { create: false });
        exists = true;
      } catch {
        exists = false;
      }

      if (exists) {
        const choice = await buildDuplicateDialog(suggestedName);
        if (choice === "cancel") {
          if (op72Msg) op72Msg.textContent = "Save cancelled.";
          return;
        }
        if (choice === "new") {
          finalName = makeUniqueName(suggestedName);
        }
      }

      const fileHandle = await dirHandle.getFileHandle(finalName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(pdfBlob);
      await writable.close();
      if (op72Msg) op72Msg.textContent = `Saved: "${finalName}"`;
      return;
    } catch (err) {
      if (err.name === "AbortError") {
        _savedDirHandle = null;
        if (op72Msg) op72Msg.textContent = "Save cancelled.";
        return;
      }
    }
  }

  // ── Path C: Plain <a> download fallback (Firefox / Safari) ──────────────
  const url = URL.createObjectURL(pdfBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  if (op72Msg) op72Msg.textContent = `Downloaded: "${suggestedName}"`;
}

function captureAndSave(filename) {
  const printArea = op72PrintArea || document.getElementById("op72PrintArea") || op72Table.closest(".sheet-wrap");
  if (!printArea) {
    if (op72Msg) op72Msg.textContent = "Print area not found.";
    return;
  }

  if (op72Msg) op72Msg.textContent = "Generating PDF, please wait...";
  if (op72PrintBtn) op72PrintBtn.disabled = true;

  // Update print header metadata
  const selectedGroup = String(op72GroupSelect?.value || "").trim() || "ALL";
  const monthStr = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(seedDate).toUpperCase();
  if (op72PrintGroup) op72PrintGroup.textContent = selectedGroup;
  if (op72PrintMonth) op72PrintMonth.textContent = monthStr;
  if (op72PrintHeader) op72PrintHeader.style.display = "block";

  // Temporarily reset CSS zoom on op72Table so html2canvas computes coordinates accurately
  const prevZoom = op72Table.style.zoom;
  op72Table.style.zoom = "1";

  // Hide non-print elements
  const hideSelectors = [
    ".site-header",
    ".nav-bar",
    ".bg-shape",
    ".op72-heading-row",
    "#op72Toolbar",
    "#op72SaveState",
    "#op72Msg"
  ];
  const hiddenEls = [];
  hideSelectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      if (el.style.display !== "none") {
        hiddenEls.push({ el, origDisplay: el.style.display });
        el.style.display = "none";
      }
    });
  });

  // Remove overflow from scrollable parents so full content is rendered
  const overflowEls = [];
  const checkEls = [printArea, printArea.parentElement, ...Array.from(printArea.querySelectorAll("*"))];
  checkEls.forEach((el) => {
    if (!el || !el.style) return;
    const computed = window.getComputedStyle(el);
    const ox = computed.overflowX;
    const oy = computed.overflowY;
    if (ox === "auto" || ox === "hidden" || ox === "scroll" ||
        oy === "auto" || oy === "hidden" || oy === "scroll") {
      overflowEls.push({ el, ox: el.style.overflowX, oy: el.style.overflowY });
      el.style.overflowX = "visible";
      el.style.overflowY = "visible";
    }
  });

  const pageSizes = {
    A4:    { w: 297,   h: 210   },
    A3:    { w: 420,   h: 297   },
    Legal: { w: 355.6, h: 215.9 },
  };
  const selectedSizeKey = op72PageSizeSelect ? op72PageSizeSelect.value : "Legal";
  const pageSize = pageSizes[selectedSizeKey] || pageSizes.Legal;
  const pxPerMm  = 3.7795275591;
  const baseW    = Math.round(pageSize.w * pxPerMm);
  const targetW  = Math.max(baseW, op72Table.scrollWidth, printArea.scrollWidth);
  const targetH  = Math.max(printArea.scrollHeight, printArea.offsetHeight);

  const origWidth = printArea.style.width;
  printArea.style.width = targetW + "px";

  const restoreAll = () => {
    printArea.style.width = origWidth;
    op72Table.style.zoom = prevZoom || "1";
    if (op72PrintHeader) op72PrintHeader.style.display = "none";
    hiddenEls.forEach(({ el, origDisplay }) => { el.style.display = origDisplay; });
    overflowEls.forEach(({ el, ox, oy }) => {
      el.style.overflowX = ox;
      el.style.overflowY = oy;
    });
    if (op72PrintBtn) op72PrintBtn.disabled = false;
  };

  const realSummaryTitle = document.getElementById("op72SummaryTitle");
  const summaryTitleH = realSummaryTitle ? (realSummaryTitle.offsetHeight || realSummaryTitle.clientHeight || 320) : 320;
  const summaryTitleW = realSummaryTitle ? (realSummaryTitle.offsetWidth || realSummaryTitle.clientWidth || 34) : 34;

  html2canvas(printArea, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    width: targetW,
    height: targetH,
    windowWidth: targetW,
    windowHeight: targetH,
    scrollX: 0,
    scrollY: 0,
    logging: false,
    onclone: (clonedDoc) => {
      const summaryTitle = clonedDoc.getElementById("op72SummaryTitle");
      if (summaryTitle) {
        const h = summaryTitleH;
        const w = summaryTitleW;
        summaryTitle.style.writingMode = "horizontal-tb";
        summaryTitle.style.transform = "none";
        summaryTitle.style.padding = "0";
        summaryTitle.style.textAlign = "center";
        summaryTitle.style.verticalAlign = "middle";
        summaryTitle.innerHTML = `
          <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:auto;">
            <text x="-${h / 2}" y="${w / 2 + 4}" transform="rotate(-90)" text-anchor="middle" font-weight="700" font-size="12px" font-family="'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" letter-spacing="1px" fill="#000000">SUMMARY OF OVERTIME</text>
          </svg>
        `;
      }
    },
  }).then(async (canvas) => {
    restoreAll();

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const { jsPDF } = window.jspdf;

    const marginX = 8; // mm left & right margin
    const marginY = 8; // mm top & bottom margin
    const availW  = pageSize.w - (marginX * 2);
    const availH  = pageSize.h - (marginY * 2);

    const canvasRatio = canvas.width / canvas.height;
    let imgW = availW;
    let imgH = imgW / canvasRatio;

    // If imgH exceeds available page height, scale down proportionally so the whole sheet fits on the page
    if (imgH > availH) {
      imgH = availH;
      imgW = imgH * canvasRatio;
    }

    const pdfH = pageSize.h;
    const pdf  = new jsPDF({ orientation: "landscape", unit: "mm", format: [pageSize.w, pdfH] });

    // Center horizontally and vertically on the page
    const offsetX = Math.max(0, (pageSize.w - imgW) / 2);
    const offsetY = Math.max(0, (pdfH - imgH) / 2);
    pdf.addImage(imgData, "JPEG", offsetX, offsetY, imgW, imgH);

    const pdfBlob = pdf.output("blob");
    await savePdfBlob(pdfBlob, filename);
  }).catch((err) => {
    restoreAll();
    if (op72Msg) op72Msg.textContent = "PDF generation failed: " + (err.message || err);
  });
}

function handlePrintPreview() {
  const selectedGroup = String(op72GroupSelect?.value || "").trim();
  const filename = buildOp72PdfFilename(selectedGroup, seedDate);

  // Fallback to window.print() if jsPDF or html2canvas not loaded
  if (typeof window.jspdf === "undefined" || typeof window.html2canvas === "undefined") {
    const previousTitle = document.title;
    document.title = filename;
    applyPrintSize(op72PageSizeSelect ? op72PageSizeSelect.value : "Legal");
    if (op72Msg) op72Msg.textContent = "Saving... Use 'Save as PDF' in the print dialog.";
    window.print();
    setTimeout(() => { document.title = previousTitle; }, 2000);
    return;
  }

  captureAndSave(filename);
}

if (op72PrintBtn) {
  op72PrintBtn.addEventListener("click", handlePrintPreview);
}

if (op72PageSizeSelect) {
  op72PageSizeSelect.addEventListener("change", () => {
    applyPrintSize(op72PageSizeSelect.value);
  });
  applyPrintSize(op72PageSizeSelect.value);
}

// ─────────────────────────────────────────────────────────────────────────────
// OP-72 "Check Empty Dates" Dialog Logic (Main Admin Feature)
// ─────────────────────────────────────────────────────────────────────────────
const op72CheckEmptyDatesBtn = document.getElementById("op72CheckEmptyDatesBtn");
const op72EmptyDatesDialog = document.getElementById("op72EmptyDatesDialog");
const closeEmptyDatesBtn = document.getElementById("closeEmptyDatesBtn");
const closeEmptyDatesFooterBtn = document.getElementById("closeEmptyDatesFooterBtn");
const refreshEmptyDatesBtn = document.getElementById("refreshEmptyDatesBtn");
const op72EmptyMeta = document.getElementById("op72EmptyMeta");
const op72EmptySummaryText = document.getElementById("op72EmptySummaryText");
const op72EmptyList = document.getElementById("op72EmptyList");

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function scanGroupEmptyDates() {
  const selectedGroup = String(op72GroupSelect?.value || "").trim();
  const monthStr = op72MonthPicker ? op72MonthPicker.value : formatMonthInputValue(seedDate);
  const dayCount = daysInMonth(seedDate);

  if (!op72EmptyList) return;
  op72EmptyList.innerHTML = "";

  if (op72EmptyMeta) {
    op72EmptyMeta.textContent = `Group: ${selectedGroup || "None"} | Month: ${monthStr || "Current"}`;
  }

  if (!selectedGroup) {
    if (op72EmptySummaryText) op72EmptySummaryText.textContent = "No group loaded";
    op72EmptyList.innerHTML = `
      <div style="text-align: center; padding: 36px 16px; color: #64748b;">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">⚠️</div>
        <strong style="color: #0f172a; font-size: 1rem;">Koi Group Load Nahi Hai</strong>
        <p style="font-size: 0.85rem; margin-top: 6px; line-height: 1.4;">
          Empty dates check karne ke liye pehle toolbar se <b>'Load Group'</b> me koi group select karein.
        </p>
      </div>
    `;
    return;
  }

  const empList = groupLookup.has(selectedGroup) ? groupLookup.get(selectedGroup) : [];
  const dailyRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="daily-date"]'));

  let totalEmptyAcrossGroup = 0;
  let activeEmployeesCount = 0;

  for (let empIndex = 1; empIndex <= employeeCount; empIndex++) {
    const rawName = (empList && empList[empIndex - 1]) ? String(empList[empIndex - 1]).trim() : "";
    const mainHeader = op72Head.querySelector(`th[data-role="employee-main-header"][data-employee-index="${empIndex}"]`);
    const empName = rawName || (mainHeader ? mainHeader.textContent.trim() : "");

    const isVacant = !empName;
    const emptyDays = [];

    if (!isVacant) {
      activeEmployeesCount++;
      for (let dayNum = 1; dayNum <= dayCount; dayNum++) {
        const row = dailyRows[dayNum - 1];
        if (!row || row.dataset.monthActive === "false") continue;

        const cells = row.querySelectorAll("td");
        const dutyCell = cells[1 + (empIndex - 1) * 3];
        const otCell = cells[1 + (empIndex - 1) * 3 + 1];
        const mileageCell = cells[1 + (empIndex - 1) * 3 + 2];

        const dutyVal = dutyCell ? dutyCell.textContent.trim() : "";
        const otVal = otCell ? otCell.textContent.trim() : "";
        const mileageVal = mileageCell ? mileageCell.textContent.trim() : "";

        // Completely empty date: no Duty, no OT, no Mileage entered
        const isDutyEmpty = !dutyVal || dutyVal === "-" || dutyVal === "0";
        const isOtEmpty = !otVal || otVal === "-" || otVal === "0" || otVal === "00:00" || otVal === "0:00";
        const isMileageEmpty = !mileageVal || mileageVal === "-" || mileageVal === "0" || mileageVal === "0.00";

        if (isDutyEmpty && isOtEmpty && isMileageEmpty) {
          emptyDays.push({
            dayNumber: dayNum,
            dutyCell,
            row,
          });
        }
      }
      totalEmptyAcrossGroup += emptyDays.length;
    }

    const card = document.createElement("div");
    card.className = "emp-empty-card";

    if (isVacant) {
      card.classList.add("is-vacant");
      card.innerHTML = `
        <div class="emp-empty-header">
          <span class="emp-empty-name" style="color: #94a3b8; font-style: italic;">Slot #${empIndex}: (Vacant Slot)</span>
          <span class="emp-empty-badge badge-vacant">Vacant</span>
        </div>
      `;
    } else if (emptyDays.length === 0) {
      card.classList.add("is-complete");
      card.innerHTML = `
        <div class="emp-empty-header">
          <span class="emp-empty-name">#${empIndex}. ${escapeHtml(empName)}</span>
          <span class="emp-empty-badge badge-complete">🟢 All ${dayCount} Days Filled</span>
        </div>
        <div style="font-size: 0.78rem; color: #166534; font-weight: 600; margin-top: 4px;">
          ✓ Is employee ki is month ki koi empty date nahi hai.
        </div>
      `;
    } else if (emptyDays.length === dayCount) {
      card.classList.add("is-all-empty");
      const chipsHtml = emptyDays
        .map((d) => `<button type="button" class="date-chip" data-day="${d.dayNumber}" data-emp="${empIndex}" data-emp-name="${escapeHtml(empName)}" title="Click to fill data for Day ${d.dayNumber}">${String(d.dayNumber).padStart(2, "0")} <span style="font-size:0.75rem; opacity:0.8;">✏️</span></button>`)
        .join("");
      card.innerHTML = `
        <div class="emp-empty-header">
          <span class="emp-empty-name">#${empIndex}. ${escapeHtml(empName)}</span>
          <span class="emp-empty-badge badge-all-empty">🔴 All ${dayCount} Days Empty</span>
        </div>
        <div class="emp-empty-chips-wrap">
          ${chipsHtml}
        </div>
      `;
    } else {
      card.classList.add("is-partial");
      const chipsHtml = emptyDays
        .map((d) => `<button type="button" class="date-chip" data-day="${d.dayNumber}" data-emp="${empIndex}" data-emp-name="${escapeHtml(empName)}" title="Click to fill data for Day ${d.dayNumber}">${String(d.dayNumber).padStart(2, "0")} <span style="font-size:0.75rem; opacity:0.8;">✏️</span></button>`)
        .join("");

      card.innerHTML = `
        <div class="emp-empty-header">
          <span class="emp-empty-name">#${empIndex}. ${escapeHtml(empName)}</span>
          <span class="emp-empty-badge badge-partial">🟠 ${emptyDays.length} Empty Dates (${dayCount - emptyDays.length}/${dayCount} Filled)</span>
        </div>
        <div class="emp-empty-chips-wrap">
          ${chipsHtml}
        </div>
      `;
    }

    op72EmptyList.appendChild(card);
  }

  if (op72EmptySummaryText) {
    op72EmptySummaryText.textContent = `${activeEmployeesCount} Employees | Total Empty Dates: ${totalEmptyAcrossGroup}`;
  }
}

function openEmptyDatesDialog() {
  scanGroupEmptyDates();
  if (op72EmptyDatesDialog) {
    if (typeof op72EmptyDatesDialog.show === "function") {
      op72EmptyDatesDialog.show();
    } else {
      op72EmptyDatesDialog.setAttribute("open", "");
    }
  }
}

function closeEmptyDatesDialog() {
  if (op72EmptyDatesDialog) {
    if (typeof op72EmptyDatesDialog.close === "function") {
      op72EmptyDatesDialog.close();
    } else {
      op72EmptyDatesDialog.removeAttribute("open");
    }
  }
}

if (op72CheckEmptyDatesBtn) {
  op72CheckEmptyDatesBtn.addEventListener("click", openEmptyDatesDialog);
}

if (closeEmptyDatesBtn) {
  closeEmptyDatesBtn.addEventListener("click", closeEmptyDatesDialog);
}

if (closeEmptyDatesFooterBtn) {
  closeEmptyDatesFooterBtn.addEventListener("click", closeEmptyDatesDialog);
}

if (refreshEmptyDatesBtn) {
  refreshEmptyDatesBtn.addEventListener("click", scanGroupEmptyDates);
}

// ─────────────────────────────────────────────────────────────────────────────
// OP-72 Quick Data Entry for Empty Dates
// ─────────────────────────────────────────────────────────────────────────────
const op72QuickEntryDialog = document.getElementById("op72QuickEntryDialog");
const closeQuickEntryBtn = document.getElementById("closeQuickEntryBtn");
const closeQuickEntryFooterBtn = document.getElementById("closeQuickEntryFooterBtn");
const op72QuickEntryForm = document.getElementById("op72QuickEntryForm");
const op72QuickMeta = document.getElementById("op72QuickMeta");
const op72QuickNotice = document.getElementById("op72QuickNotice");

const quickStartDate = document.getElementById("quickStartDate");
const quickEndDate = document.getElementById("quickEndDate");
const quickEmployee1 = document.getElementById("quickEmployee1");
const quickEmployee2 = document.getElementById("quickEmployee2");
const quickDutyType = document.getElementById("quickDutyType");
const quickOt = document.getElementById("quickOt");
const quickMileage = document.getElementById("quickMileage");
const quickOutwardDuty = document.getElementById("quickOutwardDuty");
const quickOutwardCommenced = document.getElementById("quickOutwardCommenced");
const quickOutwardDuration = document.getElementById("quickOutwardDuration");
const quickOutwardTerminated = document.getElementById("quickOutwardTerminated");
const quickInwardDuty = document.getElementById("quickInwardDuty");
const quickInwardCommenced = document.getElementById("quickInwardCommenced");
const quickInwardDuration = document.getElementById("quickInwardDuration");
const quickInwardTerminated = document.getElementById("quickInwardTerminated");
const quickRemarks = document.getElementById("quickRemarks");
const op72QuickSubmitBtn = document.getElementById("op72QuickSubmitBtn");
const quickEmployee1Dropdown = document.getElementById("quickEmployee1Dropdown");
const quickEmployee2Dropdown = document.getElementById("quickEmployee2Dropdown");
const quickEmployee1ToggleBtn = document.getElementById("quickEmployee1ToggleBtn");
const quickEmployee2ToggleBtn = document.getElementById("quickEmployee2ToggleBtn");

let quickTargetDay = null;
let quickTargetEmpIndex = null;
let quickEmp1Auto = null;
let quickEmp2Auto = null;

function collectQuickEmployeeNames() {
  const names = new Set();

  try {
    const savedRows = JSON.parse(localStorage.getItem("EmployeeMasterData") || "[]");
    if (Array.isArray(savedRows)) {
      savedRows.forEach((row) => {
        const name = Array.isArray(row) ? String(row[1] || "").trim() : "";
        if (name) names.add(name);
      });
    }
  } catch {}

  const workbookRows = window.employeeMasterWorkbookData?.rows;
  const workbookHeaderRows = Number(window.employeeMasterWorkbookData?.headerRows || 0);
  if (Array.isArray(workbookRows)) {
    workbookRows.slice(workbookHeaderRows).forEach((row) => {
      const name = Array.isArray(row) ? String(row[1] || "").trim() : "";
      if (name) names.add(name);
    });
  }

  if (Array.isArray(groupEmployees)) {
    groupEmployees.forEach((emp) => {
      const name = String(emp.name || "").trim();
      if (name) names.add(name);
    });
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

async function loadEmployeeMasterDataForQuickEntry() {
  try {
    const res = await fetch(`${OP72_API_BASE}/api/employee-master/workbook`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (res.ok) {
      window.employeeMasterWorkbookData = await res.json();
    }
  } catch {}
}

function setupQuickEmployeeAutocomplete(inputElement, dropdownElement, toggleBtn) {
  if (!inputElement || !dropdownElement) return null;

  let currentItems = [];
  let selectedIndex = -1;

  function closeDropdown() {
    dropdownElement.hidden = true;
    dropdownElement.innerHTML = "";
    currentItems = [];
    selectedIndex = -1;
  }

  function setHighlight(index) {
    if (!currentItems.length) {
      selectedIndex = -1;
      return;
    }
    const total = currentItems.length;
    selectedIndex = (index + total) % total;

    const children = dropdownElement.children;
    for (let i = 0; i < children.length; i++) {
      if (i === selectedIndex) {
        children[i].classList.add("is-selected");
        children[i].scrollIntoView({ block: "nearest" });
      } else {
        children[i].classList.remove("is-selected");
      }
    }
  }

  function selectName(name) {
    inputElement.value = name;
    inputElement.setCustomValidity("");
    closeDropdown();
    inputElement.dispatchEvent(new Event("input", { bubbles: true }));
    inputElement.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function renderList(matchedNames, defaultSelectIdx = -1) {
    dropdownElement.innerHTML = "";
    currentItems = matchedNames;

    if (!matchedNames.length) {
      const emptyLi = document.createElement("li");
      emptyLi.className = "employee-dropdown-empty";
      emptyLi.textContent = "No matching employee found";
      dropdownElement.appendChild(emptyLi);
      dropdownElement.hidden = false;
      selectedIndex = -1;
      return;
    }

    matchedNames.forEach((name, idx) => {
      const li = document.createElement("li");
      li.className = "employee-dropdown-item";
      li.setAttribute("role", "option");
      li.textContent = name;
      if (idx === defaultSelectIdx) {
        li.classList.add("is-selected");
      }

      li.addEventListener("mouseenter", () => {
        selectedIndex = idx;
        const siblings = dropdownElement.children;
        for (let j = 0; j < siblings.length; j++) {
          siblings[j].classList.toggle("is-selected", j === idx);
        }
      });

      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectName(name);
      });

      dropdownElement.appendChild(li);
    });

    selectedIndex = defaultSelectIdx;
    dropdownElement.hidden = false;
    if (defaultSelectIdx >= 0 && dropdownElement.children[defaultSelectIdx]) {
      dropdownElement.children[defaultSelectIdx].scrollIntoView({ block: "nearest" });
    }
  }

  function openDropdown() {
    const allNames = collectQuickEmployeeNames();
    const query = inputElement.value.trim().toLowerCase();
    let matched = allNames;
    let initialHighlight = -1;

    if (query) {
      matched = allNames.filter((n) => n.toLowerCase().includes(query));
      const exactIdx = matched.findIndex((n) => n.toLowerCase() === query);
      initialHighlight = exactIdx >= 0 ? exactIdx : (matched.length > 0 ? 0 : -1);
    } else {
      initialHighlight = -1;
    }

    renderList(matched, initialHighlight);
  }

  inputElement.addEventListener("focus", () => {
    openDropdown();
  });

  inputElement.addEventListener("click", () => {
    if (dropdownElement.hidden) {
      openDropdown();
    }
  });

  inputElement.addEventListener("input", () => {
    inputElement.setCustomValidity("");
    openDropdown();
  });

  if (toggleBtn) {
    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropdownElement.hidden) {
        inputElement.focus();
        openDropdown();
      } else {
        closeDropdown();
      }
    });
  }

  inputElement.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (dropdownElement.hidden) {
        openDropdown();
        if (currentItems.length) setHighlight(0);
      } else {
        setHighlight(selectedIndex + 1);
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (dropdownElement.hidden) {
        openDropdown();
        if (currentItems.length) setHighlight(currentItems.length - 1);
      } else {
        setHighlight(selectedIndex - 1);
      }
    } else if (event.key === "Enter") {
      if (!dropdownElement.hidden && selectedIndex >= 0 && selectedIndex < currentItems.length) {
        event.preventDefault();
        event.stopPropagation();
        selectName(currentItems[selectedIndex]);
      } else if (!dropdownElement.hidden) {
        closeDropdown();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
    } else if (event.key === "Tab") {
      closeDropdown();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (
      !inputElement.contains(event.target) &&
      !dropdownElement.contains(event.target) &&
      (!toggleBtn || !toggleBtn.contains(event.target))
    ) {
      closeDropdown();
    }
  });

  return { closeDropdown, openDropdown };
}

function formatEntryDate(dateValue) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(dateValue.getDate()).padStart(2, "0");
  const mmm = monthNames[dateValue.getMonth()];
  const yyyy = dateValue.getFullYear();
  return `${dd}-${mmm}-${yyyy}`;
}

function parseDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const dmyMatch = raw.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const mNames = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const mIdx = mNames.indexOf(dmyMatch[2].toUpperCase());
    const yr = dmyMatch[3].length === 2 ? 2000 + Number(dmyMatch[3]) : Number(dmyMatch[3]);
    if (day >= 1 && day <= 31 && mIdx >= 0) {
      const d = new Date(yr, mIdx, day);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const std = new Date(raw);
  return Number.isNaN(std.getTime()) ? null : std;
}

function parseClockToMinutes(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function toHhMm(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return raw;
}

function getJourneyTerminationOffset(startMinutes, endMinutes, durationDays) {
  if (endMinutes === null) return null;
  if (durationDays > 0) return durationDays;
  if (startMinutes !== null && endMinutes < startMinutes) return 1;
  return 0;
}

function parseRemarksParts(rawRemarks) {
  const raw = String(rawRemarks || "").trim();
  if (!raw) return [];
  const parts = raw.split(",").map((item) => item.trim());
  if (parts.some((item) => item === "")) {
    throw new Error("Remarks contains empty parts. Please remove extra commas.");
  }
  return parts;
}

function buildRawDataRowsFromEntry(entry) {
  const startDate = parseDateInput(entry.startDate);
  const endDate = parseDateInput(entry.endDate);

  if (!startDate || !endDate) {
    throw new Error("Invalid Start Date or End Date.");
  }

  const startOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  if (endOnly < startOnly) {
    throw new Error("End Date must be after Start Date.");
  }

  const baseRowCount = Math.round((endOnly.getTime() - startOnly.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  const outStartMinutes = parseClockToMinutes(entry.outwardDutyCommenced);
  const outEndMinutes = parseClockToMinutes(entry.outwardDutyTerminated);
  const inStartMinutes = parseClockToMinutes(entry.inwardDutyCommenced);
  const inEndMinutes = parseClockToMinutes(entry.inwardDutyTerminated);

  const outDurationDays = Number(entry.outwardDuration || 0);
  const inDurationDays = Number(entry.inwardDuration || 0);

  const outTermOffset = getJourneyTerminationOffset(outStartMinutes, outEndMinutes, outDurationDays);
  const outAnchorOffset = outTermOffset === null ? outDurationDays : outTermOffset;

  let inCommOffset = null;
  if (entry.inwardDuty || entry.inwardDutyCommenced || entry.inwardDutyTerminated) {
    if (inStartMinutes === null) {
      inCommOffset = outAnchorOffset;
    } else if (outEndMinutes === null || inStartMinutes >= outEndMinutes) {
      inCommOffset = outAnchorOffset;
    } else {
      inCommOffset = outAnchorOffset + 1;
    }
  }

  let inTermOffset = null;
  if (inEndMinutes !== null) {
    const inTermRelativeOffset = getJourneyTerminationOffset(inStartMinutes, inEndMinutes, inDurationDays);
    inTermOffset = (inCommOffset === null ? 0 : inCommOffset) + (inTermRelativeOffset || 0);
  }

  const candidateRowCounts = [baseRowCount];
  if (outTermOffset !== null) candidateRowCounts.push(outTermOffset + 1);
  if (inCommOffset !== null) candidateRowCounts.push(inCommOffset + 1);
  if (inTermOffset !== null) candidateRowCounts.push(inTermOffset + 1);
  const totalRowCount = Math.max(...candidateRowCounts);

  const remarksParts = parseRemarksParts(entry.remarks);

  const rows = Array.from({ length: totalRowCount }, (_, index) => {
    const rowDate = new Date(startOnly.getFullYear(), startOnly.getMonth(), startOnly.getDate() + index);
    const row = new Array(13).fill("");
    row[0] = formatEntryDate(rowDate);

    row[1] = entry.employee1Name || "";
    row[2] = entry.employee2Name || "";
    row[3] = entry.dutyType || "";

    return row;
  });

  if (totalRowCount > baseRowCount) {
    const finalDate = new Date(startOnly.getFullYear(), startOnly.getMonth(), startOnly.getDate() + totalRowCount - 1);
    entry.endDate = formatEntryDate(finalDate);
  }

  rows[0][4] = entry.overTimeOt ? toHhMm(entry.overTimeOt) : "";
  rows[0][5] = entry.mileageKm === 0 ? 0 : (entry.mileageKm || "");

  if (entry.outwardDuty) rows[0][6] = entry.outwardDuty;
  if (entry.outwardDutyCommenced) rows[0][7] = toHhMm(entry.outwardDutyCommenced);
  if (entry.outwardDutyTerminated && outTermOffset !== null) {
    rows[outTermOffset][8] = toHhMm(entry.outwardDutyTerminated);
  }

  if (entry.inwardDuty && inCommOffset !== null) rows[inCommOffset][9] = entry.inwardDuty;
  if (entry.inwardDutyCommenced && inCommOffset !== null) {
    rows[inCommOffset][10] = toHhMm(entry.inwardDutyCommenced);
  }
  if (entry.inwardDutyTerminated && inTermOffset !== null) {
    rows[inTermOffset][11] = toHhMm(entry.inwardDutyTerminated);
  }

  if (remarksParts.length === 1) {
    rows.forEach((row) => { row[12] = remarksParts[0]; });
  } else if (remarksParts.length > 1) {
    remarksParts.forEach((part, index) => {
      if (index < rows.length) rows[index][12] = part;
    });
  }

  return rows;
}

function syncQuickEndDate() {
  const startRaw = quickStartDate.value.trim();
  if (!startRaw) return;
  const parsedStart = parseDateInput(startRaw);
  if (!parsedStart) return;

  const outStart = parseClockToMinutes(quickOutwardCommenced.value);
  const outEnd = parseClockToMinutes(quickOutwardTerminated.value);
  const inStart = parseClockToMinutes(quickInwardCommenced.value);
  const inEnd = parseClockToMinutes(quickInwardTerminated.value);
  const outDur = Number(quickOutwardDuration.value || 0);
  const inDur = Number(quickInwardDuration.value || 0);

  const outTermOffset = getJourneyTerminationOffset(outStart, outEnd, outDur);
  const outAnchor = outTermOffset === null ? outDur : outTermOffset;

  let inCommOffset = null;
  const inDuty = (quickInwardDuty.value || "").trim() || quickInwardCommenced.value.trim() || quickInwardTerminated.value.trim();
  if (inDuty || inStart !== null || inEnd !== null) {
    if (inStart === null) inCommOffset = outAnchor;
    else if (outEnd === null || inStart >= outEnd) inCommOffset = outAnchor;
    else inCommOffset = outAnchor + 1;
  }

  let inTermOffset = null;
  if (inEnd !== null) {
    const inTermRelative = getJourneyTerminationOffset(inStart, inEnd, inDur);
    inTermOffset = (inCommOffset === null ? 0 : inCommOffset) + (inTermRelative || 0);
  }

  const offsets = [0];
  if (outTermOffset !== null) offsets.push(outTermOffset);
  if (inCommOffset !== null) offsets.push(inCommOffset);
  if (inTermOffset !== null) offsets.push(inTermOffset);

  const maxOffset = Math.max(...offsets);
  const targetDate = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), parsedStart.getDate() + maxOffset);
  const targetFormatted = formatEntryDate(targetDate);

  const currentEnd = parseDateInput(quickEndDate.value.trim());
  if (!currentEnd || currentEnd < targetDate || maxOffset > 0) {
    quickEndDate.value = targetFormatted;
  }
}

function openQuickEntryDialog(dayNum, empIndex, empName) {
  quickTargetDay = dayNum;
  quickTargetEmpIndex = empIndex;

  const year = seedDate.getFullYear();
  const month0 = seedDate.getMonth();
  const dObj = new Date(year, month0, dayNum);
  const dateStr = formatEntryDate(dObj);

  quickStartDate.value = dateStr;
  quickEndDate.value = dateStr;
  quickEmployee1.value = empName || "";
  quickEmployee2.value = "";
  quickDutyType.value = "";
  quickOt.value = "";
  quickMileage.value = "";
  quickOutwardDuty.value = "";
  quickOutwardCommenced.value = "";
  quickOutwardDuration.value = "0";
  quickOutwardTerminated.value = "";
  quickInwardDuty.value = "";
  quickInwardCommenced.value = "";
  quickInwardDuration.value = "0";
  quickInwardTerminated.value = "";
  quickRemarks.value = "";

  if (quickEmp1Auto) quickEmp1Auto.closeDropdown();
  if (quickEmp2Auto) quickEmp2Auto.closeDropdown();

  if (op72QuickNotice) {
    op72QuickNotice.style.display = "none";
    op72QuickNotice.textContent = "";
  }

  if (op72QuickMeta) {
    op72QuickMeta.textContent = `Slot #${empIndex}: ${empName} | Date: ${dateStr}`;
  }

  if (op72QuickEntryDialog) {
    if (typeof op72QuickEntryDialog.showModal === "function") {
      op72QuickEntryDialog.showModal();
    } else {
      op72QuickEntryDialog.setAttribute("open", "");
    }
  }

  setTimeout(() => {
    if (quickDutyType) quickDutyType.focus();
  }, 100);
}

function closeQuickEntryDialog() {
  if (quickEmp1Auto) quickEmp1Auto.closeDropdown();
  if (quickEmp2Auto) quickEmp2Auto.closeDropdown();
  if (op72QuickEntryDialog) {
    if (typeof op72QuickEntryDialog.close === "function") {
      op72QuickEntryDialog.close();
    } else {
      op72QuickEntryDialog.removeAttribute("open");
    }
  }
}

if (closeQuickEntryBtn) {
  closeQuickEntryBtn.addEventListener("click", closeQuickEntryDialog);
}
if (closeQuickEntryFooterBtn) {
  closeQuickEntryFooterBtn.addEventListener("click", closeQuickEntryDialog);
}

[quickOutwardCommenced, quickOutwardTerminated, quickInwardCommenced, quickInwardTerminated, quickOutwardDuration, quickInwardDuration].forEach((el) => {
  if (el) el.addEventListener("blur", syncQuickEndDate);
});

quickEmp1Auto = setupQuickEmployeeAutocomplete(quickEmployee1, quickEmployee1Dropdown, quickEmployee1ToggleBtn);
quickEmp2Auto = setupQuickEmployeeAutocomplete(quickEmployee2, quickEmployee2Dropdown, quickEmployee2ToggleBtn);
loadEmployeeMasterDataForQuickEntry();

if (op72QuickEntryForm) {
  op72QuickEntryForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const emp1 = quickEmployee1.value.trim().toUpperCase();
    const duty = quickDutyType.value.trim().toUpperCase();
    const sDate = quickStartDate.value.trim();
    const eDate = quickEndDate.value.trim();

    if (!emp1) {
      alert("Employee 1 Name is required.");
      return;
    }
    if (!duty) {
      alert("Please select Duty Type.");
      return;
    }

    const entry = {
      startDate: sDate,
      endDate: eDate,
      employee1Name: emp1,
      employee2Name: quickEmployee2.value.trim().toUpperCase(),
      dutyType: duty,
      mileageKm: Number(quickMileage.value || 0),
      overTimeOt: quickOt.value.trim(),
      outwardDuty: quickOutwardDuty.value.trim().toUpperCase(),
      outwardDutyCommenced: quickOutwardCommenced.value.trim(),
      outwardDuration: Number(quickOutwardDuration.value || 0),
      outwardDutyTerminated: quickOutwardTerminated.value.trim(),
      inwardDuty: quickInwardDuty.value.trim().toUpperCase(),
      inwardDutyCommenced: quickInwardCommenced.value.trim(),
      inwardDuration: Number(quickInwardDuration.value || 0),
      inwardDutyTerminated: quickInwardTerminated.value.trim(),
      remarks: quickRemarks.value.trim().toUpperCase(),
    };

    if (op72QuickSubmitBtn) op72QuickSubmitBtn.disabled = true;
    if (op72QuickNotice) {
      op72QuickNotice.className = "op72-quick-notice";
      op72QuickNotice.style.display = "block";
      op72QuickNotice.textContent = "Saving to RawData & OP72 RawData...";
    }

    try {
      const rows = buildRawDataRowsFromEntry(entry);
      const res = await fetch(`${OP72_API_BASE}/api/raw-data/data-rows`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ rows }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.message || `HTTP ${res.status}`);
      }

      closeQuickEntryDialog();

      // Show temporary notification on OP-72 sheet
      if (op72Msg) {
        op72Msg.textContent = `✓ Data saved for ${emp1} on ${sDate}! Reloading sheet...`;
      }

      // Reload sheet and recalculate all totals
      await loadAllEmployees();

      // Refresh empty dates dialog so filled date disappears
      scanGroupEmptyDates();

      // Highlight the updated cell on sheet with success green
      if (quickTargetDay && quickTargetEmpIndex) {
        const dailyRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="daily-date"]'));
        const targetRow = dailyRows[quickTargetDay - 1];
        if (targetRow) {
          const cells = targetRow.querySelectorAll("td");
          const dutyCell = cells[1 + (quickTargetEmpIndex - 1) * 3];
          if (dutyCell) {
            dutyCell.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
            dutyCell.classList.add("op72-cell-success-highlight");
            setTimeout(() => dutyCell.classList.remove("op72-cell-success-highlight"), 2500);
          }
        }
      }
    } catch (err) {
      if (op72QuickNotice) {
        op72QuickNotice.className = "op72-quick-notice error";
        op72QuickNotice.textContent = `Error: ${err.message}`;
      } else {
        alert(`Error saving entry: ${err.message}`);
      }
    } finally {
      if (op72QuickSubmitBtn) op72QuickSubmitBtn.disabled = false;
    }
  });
}

if (op72EmptyList) {
  op72EmptyList.addEventListener("click", (e) => {
    const chip = e.target.closest(".date-chip");
    if (!chip) return;
    const dayNum = Number(chip.dataset.day);
    const empIndex = Number(chip.dataset.emp);
    const empName = chip.dataset.empName || "";
    if (!dayNum || !empIndex) return;

    const dailyRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="daily-date"]'));
    const row = dailyRows[dayNum - 1];

    if (row) {
      const cells = row.querySelectorAll("td");
      const dutyCell = cells[1 + (empIndex - 1) * 3];

      if (dutyCell) {
        dutyCell.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        dutyCell.classList.add("op72-cell-highlight");
        setTimeout(() => {
          dutyCell.classList.remove("op72-cell-highlight");
        }, 1800);
      }
    }

    // Open the Quick Data Entry Dialog for this empty date!
    openQuickEntryDialog(dayNum, empIndex, empName);
  });
}

// Check role permission for Check Empty Dates button
try {
  const sessionRaw = sessionStorage.getItem("HomeAuthSession") || localStorage.getItem("HomeAuthSession");
  if (sessionRaw) {
    const session = JSON.parse(sessionRaw);
    if (session && (session.role === "employee" || session.role === "guest")) {
      if (op72CheckEmptyDatesBtn) {
        op72CheckEmptyDatesBtn.style.display = "none";
      }
    }
  }
} catch {}

