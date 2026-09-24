const OP72_API_BASE_URL = window.location.port === "5500"
  ? `http://${window.location.hostname}:3000`
  : "";
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

// Month Accordion & Control Bar Elements
const op72ControlBar = document.getElementById("op72ControlBar");
const op72MonthJump = document.getElementById("op72MonthJump");
const op72ExpandAll = document.getElementById("op72ExpandAll");
const op72CollapseAll = document.getElementById("op72CollapseAll");
const op72TotalStats = document.getElementById("op72TotalStats");
const op72Container = document.getElementById("op72Container");
const op72LegacyWrap = document.getElementById("op72LegacyWrap");
const op72PasteMonthSummary = document.getElementById("op72PasteMonthSummary");

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

function buildOp72HeaderElement(monthKey) {
  const thead = document.createElement("thead");
  const firstRow = document.createElement("tr");
  const secondRow = document.createElement("tr");

  const selectCell = document.createElement("th");
  selectCell.className = "header-row header-row-1";
  selectCell.rowSpan = 2;

  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  selectAll.title = "Select all OP72 data rows in this month";
  selectAll.dataset.monthSelectHeader = monthKey || "";
  selectCell.appendChild(selectAll);
  firstRow.appendChild(selectCell);

  OP72_COLUMNS.forEach((column, index) => {
    if (index === 6 || index === 9) {
      const groupCell = document.createElement("th");
      groupCell.className = "header-row header-row-1";
      groupCell.textContent = index === 6 ? "Outward" : "Inward";
      groupCell.colSpan = 3;
      firstRow.appendChild(groupCell);
    } else if (![7, 8, 10, 11].includes(index)) {
      const cell = document.createElement("th");
      cell.className = "header-row header-row-1";
      cell.textContent = column;
      cell.rowSpan = 2;
      firstRow.appendChild(cell);
    }
  });

  [6, 7, 8, 9, 10, 11].forEach((index) => {
    const cell = document.createElement("th");
    cell.className = "header-row header-row-2";
    cell.textContent = OP72_COLUMNS[index];
    secondRow.appendChild(cell);
  });

  thead.appendChild(firstRow);
  thead.appendChild(secondRow);

  selectAll.addEventListener("change", () => {
    const table = selectAll.closest("table");
    if (!table) return;
    const cbs = table.querySelectorAll("input[type='checkbox'][data-row-select='1']");
    cbs.forEach((cb) => { cb.checked = selectAll.checked; });
    const block = selectAll.closest(".month-accordion-block");
    if (block) {
      const headerCb = block.querySelector("input[data-select-month]");
      if (headerCb) headerCb.checked = selectAll.checked;
    }
  });

  return thead;
}

function buildOp72ColgroupElement() {
  const colgroupElem = document.createElement("colgroup");
  for (let index = 0; index < 14; index += 1) {
    const col = document.createElement("col");
    col.style.width = `${index === 0 ? 8 : 12}ch`;
    if (index === 1) {
      col.className = "sticky-first-col";
    }
    colgroupElem.appendChild(col);
  }
  return colgroupElem;
}

function renderHeader() {
  const thead = buildOp72HeaderElement("");
  tableHead.replaceChildren(...Array.from(thead.children));
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

function normalizeAdminCreator(rawCreator) {
  if (!rawCreator) return "unassigned";
  const str = String(rawCreator).trim().toLowerCase();
  if (str === "vicky ch" || str === "vicky-ch" || str.includes("vicky ch")) return "vicky-ch";
  if (str === "vicky raja" || str === "vicky-raja" || str.includes("vicky raja") || str.includes("raja")) return "vicky-raja";
  if (str === "ehtisham") return "ehtisham";
  if (str === "arsalan shah" || str === "arsalan-shah" || str.includes("arsalan")) return "arsalan-shah";
  return "unassigned";
}

function addOp72RowToTable(targetBody, row, meta) {
  const tr = document.createElement("tr");
  tr.dataset.rowIndex = String(meta?.rowIndex ?? -1);

  const creatorRaw = String(row[13] || meta?.createdBy || "").trim();
  const adminKey = normalizeAdminCreator(creatorRaw);
  if (adminKey !== "unassigned") {
    tr.classList.add("admin-row", `admin-row-${adminKey}`);
    tr.dataset.creatorAdmin = adminKey;
    tr.title = `Entry Creator: ${creatorRaw}`;
  } else {
    tr.dataset.creatorAdmin = "unassigned";
  }
  if (creatorRaw) {
    tr.dataset.creatorRaw = creatorRaw;
  }

  const selectCell = document.createElement("td");
  const isData = meta?.rowKind !== "header";

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
    if (isData) {
      cell.addEventListener("input", () => setDirtyState(true));
    }
    if (columnIndex === 0) {
      cell.classList.add("sticky-first-col");
    }
    tr.appendChild(cell);
  });

  targetBody.appendChild(tr);
}

function renderTable() {
  if (op72Container) op72Container.innerHTML = "";
  if (tableHead) tableHead.innerHTML = "";
  if (tableBody) tableBody.innerHTML = "";

  if (!rows.length) {
    if (op72ControlBar) op72ControlBar.style.display = "none";
    if (op72LegacyWrap) op72LegacyWrap.style.display = "none";
    setMessage("Database connected - No OP72 Raw Data available.");
    return;
  }

  const dataRowItems = [];
  rows.forEach((row, index) => {
    const meta = rowMeta[index] || { rowIndex: index, rowKind: "data" };
    dataRowItems.push({ row, meta });
  });

  if (!dataRowItems.length) {
    if (op72ControlBar) op72ControlBar.style.display = "none";
    if (op72LegacyWrap) op72LegacyWrap.style.display = "none";
    setMessage("Database connected - No OP72 Raw Data available.");
    return;
  }

  // Group data rows by month
  const monthGroups = new Map();
  let lastMonth = null;

  dataRowItems.forEach(({ row, meta }) => {
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
  if (op72ControlBar) {
    op72ControlBar.style.display = "flex";
    if (op72TotalStats) {
      op72TotalStats.textContent = `${dataRowItems.length} Records (${monthGroups.size} Months)`;
    }
    if (op72MonthJump) {
      op72MonthJump.innerHTML = `<option value="ALL">All Months (${dataRowItems.length} Records)</option>`;
      sortedKeys.forEach((key) => {
        const group = monthGroups.get(key);
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = `${group.label} (${group.items.length} records)`;
        op72MonthJump.appendChild(opt);
      });
    }
  }

  if (op72LegacyWrap) op72LegacyWrap.style.display = "none";

  if (op72Container) {
    op72Container.style.display = "flex";

    sortedKeys.forEach((key, index) => {
      const group = monthGroups.get(key);
      const isFirst = index === 0; // Newest month open by default

      const block = document.createElement("div");
      block.className = "month-accordion-block";
      block.id = `op72MonthBlock_${key}`;
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
          <select class="month-admin-filter" data-month-filter="${key}" title="Filter this month by Admin / Color" onclick="event.stopPropagation()">
            <option value="all">🎨 All Admins / Colors</option>
            <option value="vicky-ch">🔵 Vicky Ch (Main Admin)</option>
            <option value="vicky-raja">🟢 Vicky Raja (Restricted Admin)</option>
            <option value="ehtisham">🟡 EHTISHAM (Sub Admin)</option>
            <option value="arsalan-shah">🟣 ARSALAN SHAH (Sub Admin)</option>
            <option value="unassigned">⚪ Legacy / Other</option>
          </select>
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
      body.id = `op72MonthBody_${key}`;

      const sheetWrap = document.createElement("div");
      sheetWrap.className = "sheet-wrap";

      const table = document.createElement("table");
      table.dataset.monthTable = key;
      table.appendChild(buildOp72ColgroupElement());
      table.appendChild(buildOp72HeaderElement(key));

      const tbody = document.createElement("tbody");
      group.items.forEach(({ row, meta }) => {
        addOp72RowToTable(tbody, row, meta);
      });
      table.appendChild(tbody);
      sheetWrap.appendChild(table);
      body.appendChild(sheetWrap);

      block.appendChild(header);
      block.appendChild(body);
      op72Container.appendChild(block);
    });
  }

  setMessage(`OP72 Raw Data loaded (${dataRowItems.length} records across ${monthGroups.size} months).`);
}

function currentRows() {
  if (op72Container && op72Container.children.length > 0) {
    const blocks = Array.from(op72Container.querySelectorAll(".month-accordion-block"));
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

    return allTrs.map((tr) => {
      const rowVals = Array.from(tr.querySelectorAll("td"))
        .slice(1)
        .map((cell) => cell.textContent.trim());
      if (tr.dataset.creatorRaw) {
        rowVals[13] = tr.dataset.creatorRaw;
      }
      return rowVals;
    });
  }

  return Array.from(tableBody.querySelectorAll("tr"), (tr) => {
    const rowVals = Array.from(tr.querySelectorAll("td")).slice(1).map((cell) => cell.textContent.trim());
    if (tr.dataset.creatorRaw) {
      rowVals[13] = tr.dataset.creatorRaw;
    }
    return rowVals;
  });
}

function selectedRowIndices() {
  const container = op72Container && op72Container.children.length > 0 ? op72Container : tableBody;
  return Array.from(container.querySelectorAll("tbody tr input[data-row-select='1']:checked"))
    .map((input) => Number(input.closest("tr")?.dataset.rowIndex))
    .filter((value) => Number.isInteger(value) && value >= 0);
}

function getSelectedOp72RowsData() {
  const container = op72Container && op72Container.children.length > 0 ? op72Container : tableBody;
  const checkedTrs = Array.from(container.querySelectorAll("tbody tr"))
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
  const block = document.getElementById(`op72MonthBlock_${monthKey}`);
  if (!block) return;
  const trs = Array.from(block.querySelectorAll("tbody tr"));
  if (!trs.length) {
    setMessage("No data rows to copy in this month.", true);
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
    setMessage(`Copied ${rowsData.length} rows for this month to clipboard (Excel ready).`);
  } else {
    setMessage("Failed to copy to clipboard.", true);
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
  let activeAdminUser = "";
  try {
    const auth = JSON.parse(localStorage.getItem("HomeAuthSession") || "{}");
    activeAdminUser = auth?.userId || "";
  } catch (_) {}
  if (activeAdminUser) {
    row[13] = activeAdminUser;
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
document.getElementById("cancelOp72Paste").addEventListener("click", () => {
  pastePanel.style.display = "none";
  pasteInput.value = "";
  pasteRows = [];
  if (op72PasteMonthSummary) {
    op72PasteMonthSummary.innerHTML = "";
    op72PasteMonthSummary.style.display = "none";
  }
  pastePreview.style.display = "none";
  pasteValidation.textContent = "";
  importPasteButton.disabled = true;
});
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
    if (op72PasteMonthSummary) {
      op72PasteMonthSummary.innerHTML = "";
      op72PasteMonthSummary.style.display = "none";
    }
    return;
  }

  // Multi-month summary
  const monthCounts = new Map();
  let lastMonth = null;
  pasteRows.forEach((r) => {
    let m = parseDateToYyyyMm(r[0]);
    if (!m && lastMonth) m = lastMonth;
    else if (!m) m = "UNKNOWN";
    else lastMonth = m;
    monthCounts.set(m, (monthCounts.get(m) || 0) + 1);
  });

  if (op72PasteMonthSummary) {
    const sortedMonthKeys = Array.from(monthCounts.keys()).sort();
    const chipsHtml = sortedMonthKeys.map((key) => {
      const lbl = formatMonthLabel(key);
      const cnt = monthCounts.get(key);
      return `<span class="paste-month-chip">📅 <strong>${lbl}</strong>: ${cnt} row${cnt === 1 ? "" : "s"}</span>`;
    }).join(" ");
    op72PasteMonthSummary.innerHTML = `
      <strong>📅 Multi-Month Distribution (${pasteRows.length} rows across ${monthCounts.size} month${monthCounts.size === 1 ? "" : "s"}):</strong>
      <div class="paste-month-summary-chips">${chipsHtml}</div>
    `;
    op72PasteMonthSummary.style.display = "block";
  }

  const warningNote = skippedRows.length
    ? ` (${skippedRows.length} row(s) skipped — had more than ${OP72_COLUMNS.length} columns)`
    : "";

  const baseMsg = `${pasteRows.length} valid row(s) ready to import across ${monthCounts.size} month(s).`;
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
    if (op72PasteMonthSummary) {
      op72PasteMonthSummary.innerHTML = "";
      op72PasteMonthSummary.style.display = "none";
    }
    importPasteButton.disabled = true;
    pastePanel.style.display = "none";
    await loadWorkbook();
    setMessage("OP72 Raw Data rows imported successfully.");
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

if (op72Container) {
  op72Container.addEventListener("input", () => {
    setDirtyState(true);
  });

  op72Container.addEventListener("click", (e) => {
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
      const block = document.getElementById(`op72MonthBlock_${monthKey}`);
      if (block) {
        const rowCbs = block.querySelectorAll("tbody tr input[data-row-select='1']");
        rowCbs.forEach((cb) => { cb.checked = selectMonthCb.checked; });
        const headerCb = block.querySelector("input[data-month-select-header]");
        if (headerCb) headerCb.checked = selectMonthCb.checked;
      }
      return;
    }

    // 3. Header Click (Accordion toggle)
    const header = e.target.closest(".month-accordion-header");
    if (header && !e.target.closest(".btn-month-copy") && !e.target.closest(".month-select-label") && !e.target.closest(".month-admin-filter")) {
      const monthKey = header.dataset.toggleMonth;
      const body = document.getElementById(`op72MonthBody_${monthKey}`);
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

  // Handle month admin / color filter change
  op72Container.addEventListener("change", (e) => {
    const filterSelect = e.target.closest("select.month-admin-filter");
    if (filterSelect) {
      e.stopPropagation();
      const monthKey = filterSelect.dataset.monthFilter;
      const selectedAdmin = filterSelect.value;
      applyOp72MonthAdminFilter(monthKey, selectedAdmin);
      return;
    }
  });
}

function applyOp72MonthAdminFilter(monthKey, selectedAdmin) {
  const block = document.getElementById(`op72MonthBlock_${monthKey}`);
  if (!block) return;
  const trs = Array.from(block.querySelectorAll("tbody tr"));
  let visibleCount = 0;
  trs.forEach((tr) => {
    let show = false;
    if (selectedAdmin === "all") {
      show = true;
    } else if (selectedAdmin === "unassigned") {
      show = (!tr.dataset.creatorAdmin || tr.dataset.creatorAdmin === "unassigned");
    } else {
      show = (tr.dataset.creatorAdmin === selectedAdmin);
    }
    tr.style.display = show ? "" : "none";
    if (show) visibleCount += 1;
  });

  const badge = block.querySelector(".month-row-badge");
  if (badge) {
    if (selectedAdmin === "all") {
      badge.textContent = `${trs.length} ${trs.length === 1 ? "Record" : "Records"}`;
    } else {
      badge.textContent = `${visibleCount}/${trs.length} Records`;
    }
  }

  // If filtered to a specific admin and block is collapsed, expand it
  const header = block.querySelector(".month-accordion-header");
  const body = block.querySelector(".month-accordion-body");
  if (header && body && selectedAdmin !== "all" && body.classList.contains("is-collapsed")) {
    header.classList.add("is-open");
    body.classList.remove("is-collapsed");
    const chevron = header.querySelector(".month-chevron");
    if (chevron) chevron.textContent = "▼";
  }
}

if (op72MonthJump) {
  op72MonthJump.addEventListener("change", () => {
    const val = op72MonthJump.value;
    if (!val || val === "ALL") {
      if (op72Container) op72Container.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      const block = document.getElementById(`op72MonthBlock_${val}`);
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

if (op72ExpandAll) {
  op72ExpandAll.addEventListener("click", () => {
    if (!op72Container) return;
    op72Container.querySelectorAll(".month-accordion-header").forEach((h) => h.classList.add("is-open"));
    op72Container.querySelectorAll(".month-accordion-body").forEach((b) => b.classList.remove("is-collapsed"));
    op72Container.querySelectorAll(".month-chevron").forEach((c) => { c.textContent = "▼"; });
  });
}

if (op72CollapseAll) {
  op72CollapseAll.addEventListener("click", () => {
    if (!op72Container) return;
    op72Container.querySelectorAll(".month-accordion-header").forEach((h) => h.classList.remove("is-open"));
    op72Container.querySelectorAll(".month-accordion-body").forEach((b) => b.classList.add("is-collapsed"));
    op72Container.querySelectorAll(".month-chevron").forEach((c) => { c.textContent = "▶"; });
  });
}

renderEntryFields();
loadWorkbook().catch((error) => setMessage(`Load failed: ${error.message}`, true));
