const employeeKey = "EmployeeMasterData";
const employeeTableHead = document.getElementById("employeeTableHead");
const employeeTableBody = document.getElementById("employeeTableBody");
const employeeTableColgroup = document.getElementById("employeeTableColgroup");
const sheetWrap = document.querySelector(".sheet-wrap");
const saveMsg = document.getElementById("saveMsg");
const workbookData = window.employeeMasterWorkbookData || { headerRows: 4, rows: [] };
const headerRowCount = workbookData.headerRows || 4;
const defaultRows = Array.isArray(workbookData.rows) ? workbookData.rows : [];
const detectedColumnCount = Number(workbookData.maxColumns || (defaultRows[0] ? defaultRows[0].length : 17));
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

  let normalized = normalizeCellValue(value).replace(/(?:PKR|RS\.?|₨|\$)/gi, "").trim();
  normalized = normalized.replace(/,/g, "");
  normalized = normalized.replace(/[^0-9.-]/g, "").trim();
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

function addRow(values = [], columnCount = getVisibleColumnCount(defaultRows)) {
  const row = document.createElement("tr");
  const sap = values[0] ? String(values[0]).trim() : "";
  const name = values[1] ? String(values[1]).trim() : "";
  row.dataset.sap = sap;
  row.dataset.name = name;
  row.title = "Click row to edit details or pay revision in management modal";

  for (let i = 0; i < columnCount; i += 1) {
    const cell = document.createElement("td");
    cell.textContent = formatWorkbookValue(values[i], i);
    if (i === 0) {
      cell.classList.add("sticky-first-col");
    }
    if (currencyColumns.has(i) || isFormulaColumn(i)) {
      cell.classList.add("formula-cell");
    }
    // 🔒 100% Locked — non-editable
    cell.contentEditable = "false";
    row.appendChild(cell);
  }

  // Row click opens the employee in the central management modal
  row.addEventListener("click", () => {
    openEmployeeModal(sap || name);
  });

  employeeTableBody.appendChild(row);
}

function getEmployeeApiBaseUrl() {
  if (typeof window !== "undefined" && window.location && window.location.port === "5500") {
    return `http://${window.location.hostname}:3000`;
  }
  return "";
}

async function fetchEmployeeMasterFromBackend() {
  try {
    const baseUrl = getEmployeeApiBaseUrl();
    const [wbRes, revRes] = await Promise.all([
      fetch(`${baseUrl}/api/employee-master/workbook`, { headers: { Accept: "application/json" }, credentials: "include" }),
      fetch(`${baseUrl}/api/employee-master/pay-revisions`, { headers: { Accept: "application/json" }, credentials: "include" })
    ]);

    if (revRes && revRes.ok) {
      const revData = await revRes.json();
      if (revData && revData.revisions && typeof setAllPayRevisions === "function") {
        setAllPayRevisions(revData.revisions);
      }
    }

    if (wbRes && wbRes.ok) {
      const wbData = await wbRes.json();
      if (Array.isArray(wbData.rows) && wbData.rows.length > 0) {
        const hCount = Number(wbData.workbook?.header_row_count || headerRowCount || 4);
        const dataRows = wbData.rows.slice(hCount);
        localStorage.setItem(employeeKey, JSON.stringify(dataRows, null, 2));
        renderTable(wbData.rows);
        populateEmpDropdowns();
        if (saveMsg) saveMsg.textContent = "Employee sheet synchronized with SQLite database.";
      }
    }
  } catch (err) {
    console.warn("fetchEmployeeMasterFromBackend warning:", err.message);
  }
}

function loadSheet() {
  try {
    const storedRows = JSON.parse(localStorage.getItem(employeeKey) || "[]");
    const visibleColumnCount = getVisibleColumnCount(defaultRows);

    if (Array.isArray(storedRows) && storedRows.length > 0 && Array.isArray(storedRows[0])) {
      const paddedRows = storedRows.map((r) => {
        const row = [...r];
        while (row.length < visibleColumnCount) row.push("");
        return row;
      });
      renderTable(defaultRows.slice(0, headerRowCount).concat(paddedRows));
      if (saveMsg) saveMsg.textContent = "Employee sheet loaded & locked. All additions & modifications are managed via modal.";
      return;
    }

    renderTable(defaultRows);
    if (saveMsg) saveMsg.textContent = "Default sheet loaded. Table is locked & protected.";
  } catch {
    renderTable(defaultRows);
    if (saveMsg) saveMsg.textContent = "Could not load saved data. Loaded defaults.";
  }
}

// ── Centralized Employee & Pay Revision Modal Elements ────────────────────────
const openPayRevisionsBtn = document.getElementById("openPayRevisionsBtn");
const openAddEmpBtn = document.getElementById("openAddEmpBtn");
const closePayRevisionsDialog = document.getElementById("closePayRevisionsDialog");
const payRevisionsDialog = document.getElementById("payRevisionsDialog");

const revEmpSelect = document.getElementById("revEmpSelect");
const btnSwitchToAddNew = document.getElementById("btnSwitchToAddNew");
const revSapInput = document.getElementById("revSapInput");
const revNameInput = document.getElementById("revNameInput");
const revDesgInput = document.getElementById("revDesgInput");
const revCatInput = document.getElementById("revCatInput");
const btnAdminResetStationLock = document.getElementById("btnAdminResetStationLock");
const revMonthInput = document.getElementById("revMonthInput");
const revBasicInput = document.getElementById("revBasicInput");
const revNoteInput = document.getElementById("revNoteInput");
const clearRevFormBtn = document.getElementById("clearRevFormBtn");
const saveRevBtn = document.getElementById("saveRevBtn");
const formHeaderTitle = document.getElementById("formHeaderTitle");

const revFilterSelect = document.getElementById("revFilterSelect");
const payRevTableBody = document.getElementById("payRevTableBody");
const revStatusMsg = document.getElementById("revStatusMsg");

// Rate preview elements
const prevOtVal = document.getElementById("prevOtVal");
const prevMailVal = document.getElementById("prevMailVal");
const prevPassVal = document.getElementById("prevPassVal");
const prevShntVal = document.getElementById("prevShntVal");
const prevSdGhVal = document.getElementById("prevSdGhVal");
const prevLeaveVal = document.getElementById("prevLeaveVal");

function updateRatePreview(basicVal) {
  const bp = parseFloat(basicVal) || 0;
  if (bp <= 0) {
    if (prevOtVal) prevOtVal.textContent = "Rs. 0.00";
    if (prevMailVal) prevMailVal.textContent = "Rs. 0.00";
    if (prevPassVal) prevPassVal.textContent = "Rs. 0.00";
    if (prevShntVal) prevShntVal.textContent = "Rs. 0.00";
    if (prevSdGhVal) prevSdGhVal.textContent = "Rs. 0.00";
    if (prevLeaveVal) prevLeaveVal.textContent = "Rs. 0.00";
    return;
  }
  const fVal = bp / 30;
  const ot = fVal;
  const mail = fVal * 0.3;
  const pass = fVal * 0.25;
  const shnt = fVal * 0.2;
  const sdgh = bp / 30;
  const leave55 = fVal * 0.55;

  if (prevOtVal) prevOtVal.textContent = `Rs. ${ot.toFixed(2)}`;
  if (prevMailVal) prevMailVal.textContent = `Rs. ${mail.toFixed(2)}`;
  if (prevPassVal) prevPassVal.textContent = `Rs. ${pass.toFixed(2)}`;
  if (prevShntVal) prevShntVal.textContent = `Rs. ${shnt.toFixed(2)}`;
  if (prevSdGhVal) prevSdGhVal.textContent = `Rs. ${sdgh.toFixed(2)}`;
  if (prevLeaveVal) prevLeaveVal.textContent = `Rs. ${leave55.toFixed(2)}`;
}

if (revBasicInput) {
  revBasicInput.addEventListener("input", () => {
    updateRatePreview(revBasicInput.value);
  });
}

function getSheetEmployees() {
  const rows = Array.from(employeeTableBody.querySelectorAll("tr"));
  const emps = [];
  rows.forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll("td"));
    const sap = cells[0] ? cells[0].textContent.trim() : "";
    const name = cells[1] ? cells[1].textContent.trim() : "";
    const desg = cells[2] ? cells[2].textContent.trim() : "";
    const basic = cells[3] ? parseNumericValue(cells[3].textContent) : 0;
    const cat = cells[4] ? cells[4].textContent.trim() : "RUNNING STAFF";
    if (name || sap) {
      emps.push({ sap, name, desg, basic, cat });
    }
  });
  return emps;
}

function populateEmpDropdowns() {
  const emps = getSheetEmployees();
  const currentSelected = revEmpSelect ? revEmpSelect.value : "";
  const currentFilter = revFilterSelect ? revFilterSelect.value : "";

  if (revEmpSelect) {
    revEmpSelect.innerHTML = '<option value="__NEW__">➕ [Add New Employee]</option>';
    emps.forEach((emp) => {
      const key = emp.sap || emp.name;
      const label = `${emp.name} ${emp.sap ? `(SAP: ${emp.sap})` : ""} — ${emp.desg || ""}`;

      const opt = document.createElement("option");
      opt.value = key;
      opt.dataset.name = emp.name;
      opt.dataset.sap = emp.sap;
      opt.dataset.desg = emp.desg;
      opt.dataset.basic = emp.basic;
      opt.dataset.cat = emp.cat;
      opt.textContent = label;
      revEmpSelect.appendChild(opt);
    });

    if (currentSelected && (currentSelected === "__NEW__" || emps.some((e) => (e.sap || e.name) === currentSelected))) {
      revEmpSelect.value = currentSelected;
    }
  }

  if (revFilterSelect) {
    revFilterSelect.innerHTML = '<option value="">-- All Employees --</option>';
    emps.forEach((emp) => {
      const key = emp.sap || emp.name;
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${emp.name} ${emp.sap ? `(${emp.sap})` : ""}`;
      revFilterSelect.appendChild(opt);
    });

    if (currentFilter) {
      revFilterSelect.value = currentFilter;
    }
  }
}

function switchToAddNewMode() {
  if (revEmpSelect) revEmpSelect.value = "__NEW__";
  if (formHeaderTitle) {
    formHeaderTitle.innerHTML = `<span>➕</span> Register New Employee`;
  }
  if (revSapInput) revSapInput.value = "";
  if (revNameInput) revNameInput.value = "";
  if (revDesgInput) revDesgInput.value = "ASSISTANT DRIVER";
  if (revCatInput) revCatInput.value = "RAWALPINDI";
  if (btnAdminResetStationLock) btnAdminResetStationLock.style.display = "none";
  if (revBasicInput) revBasicInput.value = "";
  if (revNoteInput) revNoteInput.value = "Initial Record";
  updateRatePreview(0);

  if (revMonthInput) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    revMonthInput.value = `${yyyy}-${mm}`;
  }

  if (revSapInput) revSapInput.focus();
}

function selectEmployeeInModal(empKey) {
  if (!empKey || empKey === "__NEW__") {
    switchToAddNewMode();
    return;
  }

  const emps = getSheetEmployees();
  const normKey = String(empKey).trim().toUpperCase();
  const emp = emps.find(
    (e) => (e.sap && e.sap.toUpperCase() === normKey) || (e.name && e.name.toUpperCase() === normKey)
  );

  if (!emp) {
    switchToAddNewMode();
    return;
  }

  const optKey = emp.sap || emp.name;
  if (revEmpSelect) revEmpSelect.value = optKey;

  if (formHeaderTitle) {
    formHeaderTitle.innerHTML = `<span>✏️</span> Edit: <strong>${emp.name}</strong> ${emp.sap ? `(SAP: ${emp.sap})` : ""}`;
  }

  if (revSapInput) revSapInput.value = emp.sap || "";
  if (revNameInput) revNameInput.value = emp.name || "";
  if (revDesgInput) revDesgInput.value = emp.desg || "ASSISTANT DRIVER";
  const placeholderKeywords = ["DRIVER", "DY DRIVER", "ASSISTANT DRIVER", "RUNNING STAFF"];
  let stationVal = emp.cat || "";
  if (placeholderKeywords.includes(stationVal.toUpperCase())) {
    stationVal = "RAWALPINDI";
  }
  if (revCatInput) revCatInput.value = stationVal;

  if (btnAdminResetStationLock) {
    btnAdminResetStationLock.style.display = "none";
    btnAdminResetStationLock.dataset.emp = optKey;
    const baseUrl = getEmployeeApiBaseUrl();
    fetch(`${baseUrl}/api/employee/posting-station?employee=${encodeURIComponent(optKey)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((st) => {
        if (st && st.isModified) {
          btnAdminResetStationLock.style.display = "inline-block";
          btnAdminResetStationLock.title = `Station set on ${st.modifiedAt || 'earlier date'}. Click to allow employee to edit again.`;
          if (revCatInput && st.postingStation) revCatInput.value = st.postingStation;
        }
      })
      .catch(() => {});
  }

  if (revBasicInput) {
    revBasicInput.value = emp.basic > 0 ? emp.basic : "";
    updateRatePreview(emp.basic);
  }

  // Check latest recorded revision
  const revs = typeof getPayRevisionsForEmployee === "function" ? getPayRevisionsForEmployee(optKey) : [];
  if (revs.length > 0) {
    const latest = revs[revs.length - 1];
    // If current revision is July-2025 or earlier, suggest July-2026 for new budget revision
    if (latest.effectiveMonth === "2025-07" || latest.effectiveMonth <= "2026-06") {
      if (revMonthInput) revMonthInput.value = "2026-07";
      if (revNoteInput) revNoteInput.value = "Pay Revision (July-2026 Budget)";
    } else {
      if (revMonthInput) revMonthInput.value = latest.effectiveMonth || "2026-07";
      if (revNoteInput) revNoteInput.value = latest.note || "Pay Revision";
    }
    if (latest.basicPay && revBasicInput) {
      revBasicInput.value = latest.basicPay;
      updateRatePreview(latest.basicPay);
    }
  } else {
    if (revMonthInput) revMonthInput.value = "2026-07";
    if (revNoteInput) revNoteInput.value = "Pay Revision (July-2026 Budget)";
  }

  if (revFilterSelect) {
    revFilterSelect.value = optKey;
  }
  renderPayRevisionsTable(optKey);
}

if (revEmpSelect) {
  revEmpSelect.addEventListener("change", () => {
    if (revEmpSelect.value === "__NEW__") {
      switchToAddNewMode();
    } else {
      selectEmployeeInModal(revEmpSelect.value);
    }
  });
}

if (btnSwitchToAddNew) {
  btnSwitchToAddNew.addEventListener("click", () => {
    switchToAddNewMode();
  });
}

if (clearRevFormBtn) {
  clearRevFormBtn.addEventListener("click", () => {
    switchToAddNewMode();
  });
}

if (revFilterSelect) {
  revFilterSelect.addEventListener("change", () => {
    renderPayRevisionsTable(revFilterSelect.value);
  });
}

const btnShowAllRevs = document.getElementById("btnShowAllRevs");
if (btnShowAllRevs) {
  btnShowAllRevs.addEventListener("click", () => {
    if (revFilterSelect) revFilterSelect.value = "";
    renderPayRevisionsTable("");
  });
}

if (btnAdminResetStationLock) {
  btnAdminResetStationLock.addEventListener("click", async () => {
    const emp = btnAdminResetStationLock.dataset.emp;
    if (!emp) return;
    if (!confirm(`Reset 1-time posting station lock for ${emp}?\n\nThis will allow the employee to modify their posting station one time again from their portal.`)) return;

    try {
      const baseUrl = getEmployeeApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/admin/reset-posting-station-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ employee: emp })
      });
      if (res.ok) {
        btnAdminResetStationLock.style.display = "none";
        alert(`Posting station lock reset for ${emp}. The employee can now edit their posting station again from their portal.`);
      } else {
        const err = await res.json();
        alert(`Error: ${err.message}`);
      }
    } catch (e) {
      alert(`Network error: ${e.message}`);
    }
  });
}

function renderPayRevisionsTable(filterKey = "") {
  if (!payRevTableBody) return;
  payRevTableBody.innerHTML = "";
  if (typeof getAllPayRevisions !== "function") return;

  const all = getAllPayRevisions();
  const emps = getSheetEmployees();
  const rowsToDisplay = [];

  const normFilter = filterKey ? String(filterKey).trim().toUpperCase() : "";

  // Pre-determine latest revision for each employee to display active/previous status badges
  const latestMonthByKey = {};
  Object.keys(all).forEach((key) => {
    const list = Array.isArray(all[key]) ? all[key] : [];
    if (list.length > 0) {
      const sorted = [...list].sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth));
      latestMonthByKey[key] = sorted[0].effectiveMonth;
    }
  });

  Object.keys(all).forEach((key) => {
    if (normFilter && String(key).trim().toUpperCase() !== normFilter) {
      return;
    }

    const list = Array.isArray(all[key]) ? all[key] : [];
    const matchedEmp = emps.find(
      (e) => (e.sap && e.sap.toUpperCase() === key.toUpperCase()) || e.name.toUpperCase() === key.toUpperCase()
    );
    const empName = matchedEmp ? matchedEmp.name : key;
    const empSap = matchedEmp ? matchedEmp.sap : (key.match(/^\d+$/) ? key : "—");
    const latestMonth = latestMonthByKey[key] || "";

    list.forEach((rev) => {
      rowsToDisplay.push({
        key,
        empName,
        empSap,
        effectiveMonth: rev.effectiveMonth,
        basicPay: rev.basicPay,
        note: rev.note || "—",
        designation: rev.designation || (matchedEmp ? matchedEmp.desg : "—"),
        isActive: rev.effectiveMonth === latestMonth,
      });
    });
  });

  rowsToDisplay.sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth) || a.empName.localeCompare(b.empName));

  if (rowsToDisplay.length === 0) {
    payRevTableBody.innerHTML =
      '<tr><td colspan="9" style="text-align: center; color: #64748b; padding: 16px;">No pay revisions recorded yet. Add an effective revision above.</td></tr>';
    return;
  }

  rowsToDisplay.forEach((item) => {
    const tr = document.createElement("tr");
    const otRate = item.basicPay / 30;
    const mailRate = otRate * 0.3;

    let statusBadge = "";
    if (item.isActive) {
      statusBadge = '<span style="background: #dcfce7; color: #166534; font-size: 0.72rem; font-weight: 700; padding: 2px 7px; border-radius: 4px; border: 1px solid #86efac; display: inline-block;">🟢 Active</span>';
    } else {
      statusBadge = `<span style="background: #f1f5f9; color: #475569; font-size: 0.72rem; font-weight: 600; padding: 2px 7px; border-radius: 4px; border: 1px solid #cbd5e1; display: inline-block;">📜 Previous (${item.effectiveMonth})</span>`;
    }

    tr.innerHTML = `
      <td style="font-weight: 600;">${item.empName}</td>
      <td>${item.empSap}</td>
      <td style="font-weight: 700; color: #0969da;">${item.effectiveMonth}</td>
      <td style="font-weight: 700; color: #b91c1c;">Rs. ${Number(item.basicPay).toLocaleString("en-IN")}</td>
      <td>Rs. ${otRate.toFixed(2)}</td>
      <td>Rs. ${mailRate.toFixed(2)}</td>
      <td>${statusBadge}</td>
      <td style="color: #475569; font-size: 0.8rem;">${item.note}</td>
      <td>
        <button type="button" class="btn-delete-rev" data-key="${item.key}" data-month="${item.effectiveMonth}">Delete</button>
      </td>
    `;

    const delBtn = tr.querySelector(".btn-delete-rev");
    delBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (confirm(`Delete revision for ${item.empName} (${item.effectiveMonth})?`)) {
        if (typeof deletePayRevisionFromBackend === "function") {
          deletePayRevisionFromBackend(item.key, item.effectiveMonth)
            .then(() => fetchEmployeeMasterFromBackend())
            .catch((err) => console.error("SQLite delete error:", err));
        } else if (typeof deletePayRevision === "function") {
          deletePayRevision(item.key, item.effectiveMonth);
        }
        syncMasterAfterRevisionDelete(item.key, item.empSap, item.empName);
        renderPayRevisionsTable(revFilterSelect ? revFilterSelect.value : "");
        if (revStatusMsg) {
          revStatusMsg.textContent = `Deleted revision for ${item.empName} (${item.effectiveMonth}). Table updated.`;
          revStatusMsg.style.color = "#b42318";
        }
      }
    });

    payRevTableBody.appendChild(tr);
  });
}

// ── Auto-Sync when a Revision is Deleted ──────────────────────────────────────
function syncMasterAfterRevisionDelete(key, sap, name) {
  let masterRows = [];
  try {
    const s = JSON.parse(localStorage.getItem(employeeKey) || "[]");
    if (Array.isArray(s) && s.length) masterRows = s;
  } catch {}

  if (!masterRows.length && defaultRows.length > headerRowCount) {
    masterRows = defaultRows.slice(headerRowCount);
  }

  let foundIdx = -1;
  for (let i = 0; i < masterRows.length; i++) {
    const r = masterRows[i];
    if (!Array.isArray(r)) continue;
    const rSap = String(r[0] || "").trim().toUpperCase();
    const rName = String(r[1] || "").trim().toUpperCase();
    if (
      (sap && rSap === sap.toUpperCase()) ||
      (name && rName === name.toUpperCase()) ||
      (key && (rSap === key.toUpperCase() || rName === key.toUpperCase()))
    ) {
      foundIdx = i;
      break;
    }
  }

  if (foundIdx < 0) return;

  // Find remaining revisions for this employee
  const revs = typeof getPayRevisionsForEmployee === "function" ? getPayRevisionsForEmployee(key) : [];
  if (revs.length > 0) {
    const latest = revs[revs.length - 1];
    masterRows[foundIdx][3] = latest.basicPay;
    if (latest.designation) masterRows[foundIdx][2] = latest.designation;
  }

  masterRows[foundIdx] = calculateFormulaCells(masterRows[foundIdx]);
  localStorage.setItem(employeeKey, JSON.stringify(masterRows, null, 2));

  const headerRows = defaultRows.slice(0, headerRowCount);
  renderTable(headerRows.concat(masterRows));
  populateEmpDropdowns();
}

// ── Submit: Save to Employee Master & Record Revision ─────────────────────────
if (payRevForm) {
  payRevForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const isNewMode = revEmpSelect && revEmpSelect.value === "__NEW__";
    const sap = revSapInput ? revSapInput.value.trim() : "";
    const name = revNameInput ? revNameInput.value.trim().toUpperCase() : "";
    const desg = revDesgInput ? revDesgInput.value.trim().toUpperCase() : "ASSISTANT DRIVER";
    const cat = revCatInput ? (revCatInput.value.trim() || "RUNNING STAFF").toUpperCase() : "RUNNING STAFF";
    const month = revMonthInput ? revMonthInput.value.trim() : "2026-07";
    const basic = revBasicInput ? parseFloat(revBasicInput.value) || 0 : 0;
    const note = revNoteInput ? revNoteInput.value.trim() : "";

    if (!name || !basic || basic <= 0 || !month) {
      alert("Please enter a valid Employee Name, Effective Month, and positive Basic Pay.");
      return;
    }

    const primaryKey = sap || name;

    // 1. Record Revision in EmployeePayRevisions & persist to SQLite database
    if (typeof savePayRevisionToBackend === "function") {
      savePayRevisionToBackend(primaryKey, {
        sap,
        name,
        designation: desg,
        category: cat,
        effectiveMonth: month,
        basicPay: basic,
        note: note || (isNewMode ? "Initial Record" : "Pay Revision"),
        isNew: isNewMode,
      }).then(() => {
        fetchEmployeeMasterFromBackend();
      }).catch((err) => {
        console.error("SQLite save error:", err);
      });
    } else if (typeof savePayRevision === "function") {
      savePayRevision(primaryKey, {
        effectiveMonth: month,
        basicPay: basic,
        designation: desg,
        note: note || (isNewMode ? "Initial Record" : "Pay Revision"),
      });
    }

    // 2. Sync to EmployeeMasterData in localStorage
    let masterRows = [];
    try {
      const s = JSON.parse(localStorage.getItem(employeeKey) || "[]");
      if (Array.isArray(s) && s.length) masterRows = s;
    } catch {}

    if (!masterRows.length && defaultRows.length > headerRowCount) {
      masterRows = defaultRows.slice(headerRowCount);
    }

    let foundIdx = -1;
    for (let i = 0; i < masterRows.length; i++) {
      const r = masterRows[i];
      if (!Array.isArray(r)) continue;
      const rSap = String(r[0] || "").trim().toUpperCase();
      const rName = String(r[1] || "").trim().toUpperCase();
      if ((sap && rSap === sap.toUpperCase()) || rName === name) {
        foundIdx = i;
        break;
      }
    }

    const visibleColumnCount = getVisibleColumnCount(defaultRows);
    const colCount = Math.max(17, visibleColumnCount);
    let targetRow = Array(colCount).fill("");

    if (foundIdx >= 0) {
      targetRow = [...masterRows[foundIdx]];
      while (targetRow.length < colCount) targetRow.push("");
    } else {
      // Defaults for fixed rate allowances
      targetRow[11] = 100; // M ML
      targetRow[12] = 120; // OP
      targetRow[13] = 75;  // P
      targetRow[14] = 50;  // G
    }

    targetRow[0] = sap;
    targetRow[1] = name;
    targetRow[2] = desg;
    targetRow[3] = basic;
    targetRow[4] = cat;

    const calculatedRow = calculateFormulaCells(targetRow);

    if (foundIdx >= 0) {
      masterRows[foundIdx] = calculatedRow;
    } else {
      masterRows.push(calculatedRow);
    }

    // Persist synchronously to localStorage
    localStorage.setItem(employeeKey, JSON.stringify(masterRows, null, 2));

    // Re-render live table immediately
    const headerRows = defaultRows.slice(0, headerRowCount);
    renderTable(headerRows.concat(masterRows));

    // Refresh dropdowns & history view
    populateEmpDropdowns();
    if (revEmpSelect) revEmpSelect.value = primaryKey;
    if (revFilterSelect) revFilterSelect.value = primaryKey;
    renderPayRevisionsTable(primaryKey);

    if (revStatusMsg) {
      revStatusMsg.textContent = `✅ Successfully saved ${name} (Basic: Rs. ${basic.toLocaleString("en-IN")}, Effective: ${month}) to Employee Master & Revision History!`;
      revStatusMsg.style.color = "#15803d";
    }
  });
}

function openEmployeeModal(targetEmpKey = "", isAddNew = false) {
  populateEmpDropdowns();
  if (revStatusMsg) revStatusMsg.textContent = "";

  if (isAddNew || targetEmpKey === "__NEW__") {
    switchToAddNewMode();
    if (revFilterSelect) revFilterSelect.value = "";
    renderPayRevisionsTable("");
  } else if (targetEmpKey) {
    selectEmployeeInModal(targetEmpKey);
  } else {
    // When opened from main toolbar button, load first employee in edit inputs,
    // but show all history in table so user can scroll down through all employees' previous basics!
    if (revEmpSelect && revEmpSelect.options.length > 1) {
      selectEmployeeInModal(revEmpSelect.options[1].value);
    } else {
      switchToAddNewMode();
    }
    if (revFilterSelect) revFilterSelect.value = "";
    renderPayRevisionsTable("");
  }

  if (payRevisionsDialog) {
    if (typeof payRevisionsDialog.showModal === "function") {
      payRevisionsDialog.showModal();
    } else {
      payRevisionsDialog.style.display = "block";
    }
  }
}

if (openPayRevisionsBtn && payRevisionsDialog) {
  openPayRevisionsBtn.addEventListener("click", () => {
    openEmployeeModal();
  });
}

if (openAddEmpBtn && payRevisionsDialog) {
  openAddEmpBtn.addEventListener("click", () => {
    openEmployeeModal("__NEW__", true);
  });
}

if (closePayRevisionsDialog && payRevisionsDialog) {
  closePayRevisionsDialog.addEventListener("click", () => {
    payRevisionsDialog.close();
  });
}

window.addEventListener("resize", () => {
  window.requestAnimationFrame(() => {
    syncHeaderOffsets();
  });
});

// Initial load
loadSheet();
fetchEmployeeMasterFromBackend();