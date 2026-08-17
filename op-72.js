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
  summaryTitle.rowSpan = 1 + summaryRows.length + 3; // updated dynamically after load
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

  // Tail rows for other duty types — start with 3, dynamically expanded later
  for (let i = 0; i < 3; i += 1) {
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

function getEditableCells() {
  return Array.from(op72Table.querySelectorAll('[data-editable="true"]'));
}

function readEditableValue(element) {
  if (element instanceof HTMLInputElement) {
    return element.value;
  }
  return element.textContent || "";
}

function writeEditableValue(element, value) {
  if (element instanceof HTMLInputElement) {
    const next = String(value || "");
    if (element.type === "month" && /^\d{4}-\d{2}$/.test(next)) {
      element.value = next;
      return;
    }
    element.value = formatMonthInputValue(seedDate);
    return;
  }

  element.textContent = String(value ?? "");
}

function saveSheetData() {
  const editableValues = getEditableCells().map((cell) => readEditableValue(cell));
  localStorage.setItem(op72StorageKey, JSON.stringify(editableValues));
  localStorage.setItem(op72MonthStorageKey, formatMonthInputValue(seedDate));
  localStorage.setItem(op72GroupStorageKey, String(op72GroupSelect?.value || ""));
  setDirtyState(false);
  op72Msg.textContent = `Saved ${editableValues.length} editable cells.`;
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
    const parsed = JSON.parse(localStorage.getItem(op72StorageKey) || "[]");
    if (!Array.isArray(parsed) || !parsed.length) {
      restoreFixedSummaryLabels();
      return;
    }

    const cells = getEditableCells();
    if (parsed.length > cells.length) {
      op72Msg.textContent = "Old OP-72 saved format detected. Use Clear Saved Data once and save again.";
      restoreFixedSummaryLabels();
      return;
    }

    const count = Math.min(cells.length, parsed.length);
    for (let i = 0; i < count; i += 1) {
      writeEditableValue(cells[i], parsed[i]);
    }

    const savedMonth = String(localStorage.getItem(op72MonthStorageKey) || "").trim();
    if (op72MonthPicker && /^\d{4}-\d{2}$/.test(savedMonth)) {
      op72MonthPicker.value = savedMonth;
      applySeedMonthFromInput(op72MonthPicker);
    } else {
      refreshDateColumnFromSeed();
    }

    const selectedGroup = String(op72GroupSelect?.value || localStorage.getItem(op72GroupStorageKey) || "").trim();
    applyGroupToSheet(selectedGroup);
    restoreFixedSummaryLabels();
    op72Msg.textContent = "Loaded saved OP-72 data.";
  } catch {
    restoreFixedSummaryLabels();
    op72Msg.textContent = "Saved OP-72 data could not be loaded.";
  }
}

function clearSavedData() {
  localStorage.removeItem(op72StorageKey);
  localStorage.removeItem(op72MonthStorageKey);
  localStorage.removeItem(op72GroupStorageKey);
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
  const dailyRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="daily-date"]'));
  dailyRows.forEach((row) => {
    row.querySelectorAll("td.op72-edit-cell").forEach((cell) => {
      cell.textContent = "";
      cell.style.backgroundColor = "";
    });
  });

  // 2. Reset summary value cells (OT to Operating Gds) to default 0:00 / 0
  summaryRows.forEach((summaryLabel) => {
    const defaultVal = summaryLabel === "OT (hh:mm)" ? "0:00" : "0";
    for (let empIdx = 1; empIdx <= employeeCount; empIdx += 1) {
      writeSummaryValue(empIdx, summaryLabel, defaultVal);
    }
  });

  // 3. Ensure fixed summary tags (OT (hh:mm) to Operating (Gds)) are intact and never blanked
  restoreFixedSummaryLabels();

  // 4. Clear tail rows below Operating (Gds)
  const tailRows = Array.from(op72Body.querySelectorAll('tr[data-row-type="summary-tail"]'));
  tailRows.forEach((tr) => {
    tr.querySelectorAll("td").forEach((cell) => {
      cell.textContent = "";
    });
  });

  // 5. Restore date column
  refreshDateColumnFromSeed();

  setDirtyState(true);
  op72Msg.textContent = "Sheet cells cleared. Summary tags and group selection retained.";
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD ALL EMPLOYEES — OP72 Raw Data se data fetch karke sheet mein fill karo
// ═══════════════════════════════════════════════════════════════════════════════

const OP72_API_BASE = "http://localhost:3000";
const HOLIDAYS_API_BASE = "http://localhost:3000";

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

// Ek employee ke liye ek date pe multiple raw records ko resolve karo
// Returns { duty, ot, mileage } — strings
function resolveRecords(records) {
  if (records.length === 1) {
    const r = records[0];
    const duty    = String(r[3] || "").trim();   // col index 3 = dutyType
    const ot      = String(r[4] || "").trim();   // col index 4 = ot
    const mileage = String(r[5] || "").trim();   // col index 5 = mileage
    return { duty, ot, mileage };
  }

  // ── Duplicate resolution — VBA logic ki tarah ──────────────────────────────
  // Duty: combine karo (val1 / val2 / ...) — agar same ho to deduplicate
  const duties = records.map((r) => String(r[3] || "").trim()).filter(Boolean);
  const uniqueDuties = [...new Set(duties)];
  const combinedDuty = uniqueDuties.join(" / ");

  // OT: sab add karo
  const totalOtMins = records.reduce((sum, r) => sum + parseOtToMinutes(r[4]), 0);
  const combinedOt  = minutesToOtString(totalOtMins);

  // Mileage: sab add karo
  const totalMileage = records.reduce((sum, r) => sum + parseMileage(r[5]), 0);
  const combinedMileage = totalMileage > 0 ? String(totalMileage.toFixed(2)) : "";

  return { duty: combinedDuty, ot: combinedOt, mileage: combinedMileage };
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
    writeSummaryValue(empIdx, "OT (hh:mm)",    minutesToOtString(totalOtMins));
    writeSummaryValue(empIdx, "Total OT",      totalOtMins > 0 ? (totalOtMins / 60 / 8).toFixed(2) : "0");
    writeSummaryValue(empIdx, "Mileage (M)",   mileageM   > 0 ? (mileageM   / 100).toFixed(2) : "0");
    writeSummaryValue(empIdx, "Mileage (P)",   mileageP   > 0 ? (mileageP   / 100).toFixed(2) : "0");
    writeSummaryValue(empIdx, "Mileage (OP/G)",mileageOpG > 0 ? (mileageOpG / 100).toFixed(2) : "0");
    writeSummaryValue(empIdx, "Sunday",   String(sundayCount));
    writeSummaryValue(empIdx, "Gazetted", String(gazettedCount));

    // Save map for tail row rendering after all employees processed
    allOtherDutyMaps.push(otherDutyMap);
  }

  // ── Determine how many tail rows are needed ──
  // Maximum number of distinct other duties any single employee has (minimum 3)
  const maxOtherDuties = Math.max(3, ...allOtherDutyMaps.map((map) => map.size));

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
function writeEmployeeDayData(dailyRow, empIndex1based, duty, ot, mileage) {
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

      // Write into table rows
      byDay.forEach((dayRecords, day) => {
        const rowIndex = day - 1; // 0-based index into dailyRows
        if (rowIndex < 0 || rowIndex >= dailyRows.length) return;
        const row = dailyRows[rowIndex];
        if (row.dataset.monthActive !== "true") return;

        const { duty, ot, mileage } = resolveRecords(dayRecords);
        writeEmployeeDayData(row, empIdx + 1, duty, ot, mileage);
      });

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

    // 8. Mark dirty so user knows to save
    setDirtyState(true);
    const lateCount = Array.from(lateEntriesByEmployee.values()).reduce((s, v) => s + v.length, 0);
    op72Msg.textContent = `${loadedCount}/${employees.length} employees loaded for ${monthLabel} ${year}. Holidays: ${holidaySet.size}. Late entries: ${lateCount}. Save Sheet to persist.`;

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
