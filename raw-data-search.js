(() => {
  const MONTHS = new Set(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]);
  const EDITABLE_COLUMNS = [
    "dateEntry",
    "employee1",
    "employee2",
    "dutyType",
    "ot",
    "mileage",
    "outwardDuty",
    "outwardCommenced",
    "outwardTerminated",
    "inwardDuty",
    "inwardCommenced",
    "inwardTerminated",
    "remarks",
  ];

  const state = {
    records: [],
    originalById: new Map(),
    dirtyById: new Map(),
    employees: [],
    isSaving: false,
  };

  const API_BASE_URL = window.location.port === "5500" ? `http://${window.location.hostname}:3000` : "";

  const searchEmployeeInput = document.getElementById("searchEmployee");
  const searchDataSourceSelect = document.getElementById("searchDataSource");
  const searchMonthSelect = document.getElementById("searchMonth");
  const searchYearSelect = document.getElementById("searchYear");
  const runSearchBtn = document.getElementById("runSearch");
  const clearSearchBtn = document.getElementById("clearSearch");
  const saveSearchChangesBtn = document.getElementById("saveSearchChanges");
  const searchStateTag = document.getElementById("searchState");
  const searchMessage = document.getElementById("searchMessage");
  const resultsBody = document.getElementById("searchResultsBody");

  const saveConfirmDialog = document.getElementById("saveConfirmDialog");
  const confirmSaveBtn = document.getElementById("confirmSaveBtn");
  const cancelSaveBtn = document.getElementById("cancelSaveBtn");
  const saveConfirmText = document.getElementById("saveConfirmText");

  const SOURCE_API = {
    "raw-data": {
      workbook: "/api/raw-data/workbook",
      search: "/api/raw-data/search",
      updates: "/api/raw-data/search-updates",
    },
    op72: {
      workbook: "/api/op72/workbook",
      search: "/api/op72/search",
      updates: "/api/op72/search-updates",
    },
  };

  function selectedSource() {
    return SOURCE_API[searchDataSourceSelect.value] || SOURCE_API["raw-data"];
  }

  function setMessage(text, isError = false) {
    searchMessage.textContent = text;
    searchMessage.style.color = isError ? "#8b1f2e" : "#26424f";
  }

  function apiUrl(path) {
    return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
  }

  async function fetchApi(path, options) {
    const response = await fetch(apiUrl(path), { ...options, credentials: "include" });
    const contentType = response.headers.get("content-type") || "";
    let payload = {};

    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = text ? { message: text } : {};
    }

    return { response, payload };
  }

  function normalize(value) {
    return String(value ?? "").trim();
  }

  function upper(value) {
    return normalize(value).toUpperCase();
  }

  function setSearchState(text, dirty = false) {
    searchStateTag.textContent = text;
    searchStateTag.classList.toggle("mutated", dirty);
    saveSearchChangesBtn.disabled = !dirty || state.isSaving;
  }

  function isValidDateEntry(value) {
    const text = normalize(value);
    if (!text) {
      return false;
    }

    const dmyShort = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
    if (dmyShort) {
      const day = Number(dmyShort[1]);
      const month = upper(dmyShort[2]);
      return day >= 1 && day <= 31 && MONTHS.has(month);
    }

    const dmyLong = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmyLong) {
      const dt = new Date(Number(dmyLong[3]), Number(dmyLong[2]) - 1, Number(dmyLong[1]));
      return !Number.isNaN(dt.getTime());
    }

    const parsed = new Date(text);
    return !Number.isNaN(parsed.getTime());
  }

  function getDateEntryYear(value) {
    const text = normalize(value);
    if (!text) {
      return null;
    }

    const dmyShort = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
    if (dmyShort) {
      return 2000 + Number(dmyShort[3]);
    }

    const dmyLong = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmyLong) {
      return Number(dmyLong[3]);
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getFullYear();
    }

    return null;
  }

  function setYearOptions(yearValues) {
    const nowYear = new Date().getFullYear();
    const availableYears = Array.from(
      new Set(yearValues.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 2025))
    );
    const maxYear = Math.max(2026, nowYear, ...(availableYears.length ? availableYears : [2025]));
    const years = [];
    for (let year = 2025; year <= maxYear; year += 1) {
      years.push(year);
    }

    searchYearSelect.innerHTML = '<option value="">Select Year</option>';
    years.forEach((year) => {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = String(year);
      searchYearSelect.appendChild(option);
    });

    searchYearSelect.value = "2026";
  }

  function isValidClockTime(value) {
    const text = normalize(value);
    if (!text) {
      return true;
    }
    const match = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      return false;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }

  function isValidDurationLike(value) {
    const text = normalize(value);
    if (!text) {
      return true;
    }

    const hhmm = text.match(/^(\d+):(\d{2})$/);
    if (hhmm) {
      return Number(hhmm[2]) >= 0 && Number(hhmm[2]) <= 59;
    }

    const asNumber = Number(text);
    return Number.isFinite(asNumber) && asNumber >= 0;
  }

  function isValidNumeric(value) {
    const text = normalize(value);
    if (!text) {
      return true;
    }
    const asNumber = Number(text);
    return Number.isFinite(asNumber);
  }

  function validateRecord(record) {
    if (!isValidDateEntry(record.dateEntry)) {
      return "Date Entry is invalid.";
    }

    const employeeSet = new Set(state.employees.map((name) => upper(name)));
    const employee1 = upper(record.employee1);
    const employee2 = upper(record.employee2);
    if (employee1 && !employeeSet.has(employee1)) {
      return "Employee 1 must exist in Employee Master.";
    }
    if (employee2 && !employeeSet.has(employee2)) {
      return "Employee 2 must exist in Employee Master.";
    }

    if (!isValidDurationLike(record.ot)) {
      return "OT must be numeric or HH:MM.";
    }
    if (!isValidNumeric(record.mileage)) {
      return "Mileage must be numeric.";
    }

    if (!isValidClockTime(record.outwardCommenced)) {
      return "Outward Commenced must be HH:MM.";
    }
    if (!isValidClockTime(record.outwardTerminated)) {
      return "Outward Terminated must be HH:MM.";
    }
    if (!isValidClockTime(record.inwardCommenced)) {
      return "Inward Commenced must be HH:MM.";
    }
    if (!isValidClockTime(record.inwardTerminated)) {
      return "Inward Terminated must be HH:MM.";
    }

    return "";
  }

  function sameRecord(a, b) {
    return EDITABLE_COLUMNS.every((key) => normalize(a?.[key]) === normalize(b?.[key]));
  }

  function markDirty(id, rowData) {
    const original = state.originalById.get(id);
    if (!original) {
      return;
    }

    if (sameRecord(original, rowData)) {
      state.dirtyById.delete(id);
    } else {
      state.dirtyById.set(id, { ...rowData, id });
    }

    setSearchState(`Rows loaded: ${state.records.length} | Changes: ${state.dirtyById.size}`, state.dirtyById.size > 0);
  }

  function createCellInput(value, id, key, onChange, readOnly = false) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = normalize(value);
    input.dataset.id = String(id);
    input.dataset.key = key;
    input.readOnly = readOnly;
    if (readOnly) {
      input.classList.add("row-index-cell");
    } else {
      input.addEventListener("input", onChange);
    }
    return input;
  }

  function renderTable(records) {
    resultsBody.innerHTML = "";

    if (!records.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 14;
      td.textContent = "No records found for this employee and month.";
      tr.appendChild(td);
      resultsBody.appendChild(tr);
      return;
    }

    const handleInputChange = (event) => {
      const id = Number(event.target.dataset.id);
      const key = event.target.dataset.key;
      const target = state.records.find((row) => row.id === id);
      if (!target || !key) {
        return;
      }

      target[key] = event.target.value;
      const error = validateRecord(target);
      const tr = event.target.closest("tr");
      if (tr) {
        tr.dataset.invalid = error ? "1" : "0";
      }

      markDirty(id, target);
      if (error) {
        setMessage(`Row Ref ${target.rowRef}: ${error}`, true);
      } else {
        setMessage("Ready.");
      }
    };

    records.forEach((record) => {
      const tr = document.createElement("tr");
      tr.dataset.id = String(record.id);

      const refCell = document.createElement("td");
      refCell.appendChild(createCellInput(String(record.rowRef), record.id, "rowRef", handleInputChange, true));
      tr.appendChild(refCell);

      EDITABLE_COLUMNS.forEach((key) => {
        const td = document.createElement("td");
        const isRemarks = key === "remarks";
        const inputValue = isRemarks ? "M" : record[key];
        td.appendChild(createCellInput(inputValue, record.id, key, handleInputChange, isRemarks));
        tr.appendChild(td);
      });

      resultsBody.appendChild(tr);
    });
  }

  function setRecords(records) {
    state.records = records.map((item) => ({ ...item }));
    state.originalById.clear();
    state.dirtyById.clear();

    state.records.forEach((record) => {
      state.originalById.set(record.id, { ...record });
    });

    renderTable(state.records);
    setSearchState(`Rows loaded: ${state.records.length} | Changes: 0`, false);
  }

  async function loadEmployees() {
    try {
      const names = [];

      const workbookRows = Array.isArray(window.employeeMasterWorkbookData?.rows)
        ? window.employeeMasterWorkbookData.rows
        : [];
      const workbookHeaderRows = Number(window.employeeMasterWorkbookData?.headerRows || 4);
      workbookRows.slice(workbookHeaderRows).forEach((row) => {
        if (!Array.isArray(row)) {
          return;
        }
        const name = normalize(row[1]);
        if (name) {
          names.push(name);
        }
      });

      try {
        const savedRows = JSON.parse(localStorage.getItem("EmployeeMasterData") || "[]");
        if (Array.isArray(savedRows)) {
          savedRows.forEach((row) => {
            if (!Array.isArray(row)) {
              return;
            }
            const name = normalize(row[1]);
            if (name) {
              names.push(name);
            }
          });
        }
      } catch {
        // ignore invalid local storage payload
      }

      if (!names.length) {
        throw new Error("Employee Master names not found.");
      }

      state.employees = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
      searchEmployeeInput.innerHTML = '<option value="">Select Employee</option>';
      state.employees.forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        searchEmployeeInput.appendChild(option);
      });
    } catch (error) {
      state.employees = [];
      searchEmployeeInput.innerHTML = '<option value="">Select Employee</option>';
      setMessage(`Unable to load employee names: ${error.message}`, true);
    }
  }

  async function applySourcePermissions() {
    try {
      const response = await fetch(apiUrl("/api/auth/session"), { credentials: "include" });
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload.user?.permissions?.includes("op72RawData")) {
        searchDataSourceSelect.querySelector('option[value="op72"]')?.remove();
        if (searchDataSourceSelect.value === "op72") searchDataSourceSelect.value = "raw-data";
      }
    } catch {
      searchDataSourceSelect.querySelector('option[value="op72"]')?.remove();
      searchDataSourceSelect.value = "raw-data";
    }
  }

  async function loadYears() {
    try {
      const { response, payload } = await fetchApi(selectedSource().workbook);
      if (!response.ok) {
        throw new Error(`Year load failed (${response.status}).`);
      }

      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      const headerRows = Number(payload?.headerRows || 4);
      const years = [];

      rows.slice(headerRows).forEach((row) => {
        if (!Array.isArray(row)) {
          return;
        }

        const year = getDateEntryYear(row[0]);
        if (year) {
          years.push(year);
        }
      });

      if (!years.length) {
        years.push(new Date().getFullYear());
      }

      setYearOptions(years);
    } catch (error) {
      setYearOptions([new Date().getFullYear()]);
      setMessage(`Unable to load years: ${error.message}`, true);
    }
  }

  async function runSearch() {
    const employee = normalize(searchEmployeeInput.value);
    const month = upper(searchMonthSelect.value);
    const year = Number(searchYearSelect.value);

    if (!employee) {
      setMessage("Employee Name is required.", true);
      searchEmployeeInput.focus();
      return;
    }
    if (!MONTHS.has(month)) {
      setMessage("Month is required.", true);
      searchMonthSelect.focus();
      return;
    }
    if (!Number.isInteger(year) || year <= 0) {
      setMessage("Year is required.", true);
      searchYearSelect.focus();
      return;
    }

    runSearchBtn.disabled = true;
    setMessage("Searching...");

    try {
      const params = new URLSearchParams({ employee, month, year: String(year) });
      const { response, payload } = await fetchApi(`${selectedSource().search}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(payload?.detail || payload?.message || `Search failed (${response.status}).`);
      }

      const records = Array.isArray(payload?.records) ? payload.records : [];
      setRecords(records);
      setMessage(`Search complete. ${records.length} record(s) found.`);
    } catch (error) {
      setRecords([]);
      setMessage(error.message || "Search failed.", true);
    } finally {
      runSearchBtn.disabled = false;
    }
  }

  function clearSearch() {
    searchEmployeeInput.value = "";
    searchMonthSelect.value = "";
    searchYearSelect.value = "";
    setRecords([]);
    setSearchState("No search executed yet.", false);
    setMessage("Ready.");
  }

  function collectDirtyUpdates() {
    const updates = [];
    for (const [id, record] of state.dirtyById.entries()) {
      const error = validateRecord(record);
      if (error) {
        throw new Error(`Row Ref ${record.rowRef}: ${error}`);
      }

      const payload = { id };
      EDITABLE_COLUMNS.forEach((key) => {
        payload[key] = key === "remarks" ? "M" : normalize(record[key]);
      });
      updates.push(payload);
    }

    return updates;
  }

  function openSaveDialog() {
    if (!state.dirtyById.size) {
      setMessage("No changes to save.", true);
      return;
    }

    saveConfirmText.textContent = `You are about to save ${state.dirtyById.size} edited row(s). Continue?`;
    if (typeof saveConfirmDialog.showModal === "function") {
      saveConfirmDialog.showModal();
    }
  }

  async function performSave() {
    if (state.isSaving) {
      return;
    }

    let updates = [];
    try {
      updates = collectDirtyUpdates();
    } catch (error) {
      setMessage(error.message, true);
      return;
    }

    if (!updates.length) {
      setMessage("No changes to save.");
      return;
    }

    state.isSaving = true;
    saveSearchChangesBtn.disabled = true;
    setMessage("Saving changes...");

    try {
      const { response, payload } = await fetchApi(selectedSource().updates, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        throw new Error(payload?.detail || payload?.message || "Save failed.");
      }

      state.records.forEach((record) => {
        state.originalById.set(record.id, { ...record });
      });
      state.dirtyById.clear();
      setSearchState(`Rows loaded: ${state.records.length} | Changes: 0`, false);
      setMessage(payload?.message || "Changes saved.");
      if (saveConfirmDialog.open) {
        saveConfirmDialog.close();
      }
    } catch (error) {
      setMessage(error.message || "Save failed.", true);
    } finally {
      state.isSaving = false;
      saveSearchChangesBtn.disabled = state.dirtyById.size === 0;
    }
  }

  runSearchBtn.addEventListener("click", runSearch);
  searchDataSourceSelect.addEventListener("change", () => {
    setRecords([]);
    setSearchState("Select filters and search the selected data source.", false);
    setMessage("Ready.");
    loadYears();
  });
  clearSearchBtn.addEventListener("click", clearSearch);
  saveSearchChangesBtn.addEventListener("click", openSaveDialog);
  confirmSaveBtn.addEventListener("click", performSave);
  cancelSaveBtn.addEventListener("click", () => saveConfirmDialog.close());

  searchEmployeeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  });

  searchMonthSelect.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  });

  searchYearSelect.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  });

  setRecords([]);
  setSearchState("No search executed yet.", false);
  setMessage("Ready.");
  loadEmployees();
  applySourcePermissions().then(loadYears);
})();
