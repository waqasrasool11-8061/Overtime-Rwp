(() => {
  const MAX_DETAIL_ROWS = 37; // Always keep exactly 37 detail rows in the printable General 164 table
  const REST_SCAN_LIMIT_ROWS = 38; // Excel rows 7..44 for counts
  const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const LEAVE_KEYWORDS = ["LEAVE", "SCHOOL", "PVT", "PRC", "AT RWP", "AT LLM", "IN OFFICE", "ENQ", "P-9", "C OFFICE", "F OFFICE", "S.MAN", "FORS"];
  const RAW_COL = Object.freeze({
    DATE_ENTRY: 0,
    EMPLOYEE_1: 1,
    EMPLOYEE_2: 2,
    FALLBACK_DUTY: 3,
    OUTWARD_DUTY: 6,
    OUT_COMMENCED: 7,
    OUT_TERMINATED: 8,
    INWARD_DUTY: 9,
    IN_COMMENCED: 10,
    IN_TERMINATED: 11,
    REMARKS: 12,
  });
  const RAW_JOURNEY_COLS = Object.freeze([
    RAW_COL.OUTWARD_DUTY,
    RAW_COL.OUT_COMMENCED,
    RAW_COL.OUT_TERMINATED,
    RAW_COL.INWARD_DUTY,
    RAW_COL.IN_COMMENCED,
    RAW_COL.IN_TERMINATED,
  ]);
  const API_BASE_URL = window.location.port === "5500" ? `http://${window.location.hostname}:3000` : "";

  const employeeSelect = document.getElementById("genlEmployeeSelect");
  const monthPicker = document.getElementById("genlMonthPicker");
  const pageSizeSelect = document.getElementById("genlPageSize");
  const loadBtn = document.getElementById("genlLoadBtn");
  const printBtn = document.getElementById("genlPrintBtn");
  const missingBtn = document.getElementById("genlMissingBtn");
  const statusEl = document.getElementById("genlStatus");
  const rowsBody = document.getElementById("genlRowsBody");
  const missingList = document.getElementById("genlMissingDates");

  const state = {
    selectedMonth: firstDayOfMonth(new Date()),
    selectedEmployee: "",
    detailRows: [],
    missingDates: [],
  };

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.style.color = isError ? "#8b1f2e" : "#26424f";
  }

  function apiUrl(path) {
    return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
  }

  async function fetchApi(path, options) {
    const response = await fetch(apiUrl(path), options);
    const contentType = response.headers.get("content-type") || "";
    let payload = {};

    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = text ? { message: text } : {};
    }

    if (!response.ok) {
      throw new Error(payload.message || "Request failed.");
    }

    return payload;
  }

  function normalize(value) {
    return String(value ?? "").trim();
  }

  function upper(value) {
    return normalize(value).toUpperCase();
  }

  function firstDayOfMonth(dateValue) {
    return new Date(dateValue.getFullYear(), dateValue.getMonth(), 1);
  }

  function parseMonthInput(value) {
    const raw = normalize(value);
    const match = raw.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return null;
    }
    return new Date(year, month - 1, 1);
  }

  function formatMonthInputValue(dateValue) {
    const yyyy = String(dateValue.getFullYear());
    const mm = String(dateValue.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  function formatDateDdMmmYyyy(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
      return "";
    }
    const day = String(dateValue.getDate()).padStart(2, "0");
    const month = MONTH_SHORT[dateValue.getMonth()] || "";
    return `${day}-${month}-${dateValue.getFullYear()}`;
  }

  function isSameMonthYear(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }

  function parseDateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const asDate = new Date(excelEpoch.getTime() + Math.round(value * 86400000));
      if (!Number.isNaN(asDate.getTime())) {
        return new Date(asDate.getFullYear(), asDate.getMonth(), asDate.getDate());
      }
    }

    const text = normalize(value);
    if (!text) {
      return null;
    }

    const dmyShort = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
    if (dmyShort) {
      const day = Number(dmyShort[1]);
      const monthLabel = upper(dmyShort[2]);
      const monthIndex = MONTH_SHORT.indexOf(monthLabel);
      const year = 2000 + Number(dmyShort[3]);
      if (monthIndex >= 0) {
        const parsed = new Date(year, monthIndex, day);
        if (!Number.isNaN(parsed.getTime())) {
          return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        }
      }
    }

    const dmyLong = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmyLong) {
      const parsed = new Date(Number(dmyLong[3]), Number(dmyLong[2]) - 1, Number(dmyLong[1]));
      if (!Number.isNaN(parsed.getTime())) {
        return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      }
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }

    return null;
  }

  function parseTimeFraction(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      if (value >= 0 && value < 1) {
        return value;
      }
      const whole = Math.floor(value);
      return value - whole;
    }

    const text = normalize(value);
    if (!text) {
      return null;
    }

    const hhmmss = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (hhmmss) {
      const h = Number(hhmmss[1]);
      const m = Number(hhmmss[2]);
      const s = Number(hhmmss[3] || 0);
      if (h <= 23 && m <= 59 && s <= 59) {
        return (h * 3600 + m * 60 + s) / 86400;
      }
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return (parsed.getHours() * 3600 + parsed.getMinutes() * 60 + parsed.getSeconds()) / 86400;
    }

    return null;
  }

  function formatClock(timeFraction) {
    if (timeFraction === null || timeFraction === undefined || !Number.isFinite(timeFraction)) {
      return "";
    }

    let totalMinutes = Math.round(timeFraction * 24 * 60);
    if (totalMinutes < 0) {
      totalMinutes = (totalMinutes % 1440) + 1440;
    }

    const minutesInDay = 24 * 60;
    totalMinutes %= minutesInDay;

    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function formatDuration(durationDays) {
    if (durationDays === null || durationDays === undefined || !Number.isFinite(durationDays)) {
      return "";
    }

    const sign = durationDays < 0 ? "-" : "";
    const absolute = Math.abs(durationDays);
    let totalMinutes = Math.round(absolute * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${sign}${hours}:${String(minutes).padStart(2, "0")}`;
  }

  function toSerialDate(dateValue) {
    return Date.UTC(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate()) / 86400000;
  }

  function datePlusTime(dateValue, timeFraction) {
    return toSerialDate(dateValue) + Number(timeFraction || 0);
  }

  function toNumeric(value) {
    return Number.isFinite(value) ? value : 0;
  }

  function hasValue(value) {
    return value !== null && value !== undefined && normalize(value) !== "";
  }

  function isLeaveKeyword(text) {
    const s = upper(text);
    if (!s) {
      return false;
    }
    return LEAVE_KEYWORDS.some((keyword) => s.includes(keyword));
  }

  function safeCell(row, index) {
    return Array.isArray(row) ? row[index] : "";
  }

  function formatDisplayMonth(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
      return "—";
    }
    return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(dateValue);
  }

  function getEmployeeHeaderMeta(employeeName) {
    const names = Array.isArray(window.employeeMasterWorkbookData?.rows)
      ? window.employeeMasterWorkbookData.rows
      : [];
    const headerRows = Number(window.employeeMasterWorkbookData?.headerRows || 4);

    for (let i = headerRows; i < names.length; i += 1) {
      const row = names[i];
      if (normalize(safeCell(row, 1)) === employeeName) {
        const designation = normalize(safeCell(row, 2));
        const sapId = normalize(safeCell(row, 0));
        const station = sapId ? "RWP" : "—";
        return {
          station,
          designation: designation || "—",
        };
      }
    }

    return {
      station: "—",
      designation: "—",
    };
  }

  function updateGenlHeader() {
    const employee = normalize(employeeSelect.value) || state.selectedEmployee;
    const monthValue = monthPicker.value ? parseMonthInput(monthPicker.value) : state.selectedMonth;
    const headerEmployee = document.getElementById("genlHeaderEmployee");
    const headerDesignation = document.getElementById("genlHeaderDesignation");
    const headerStation = document.getElementById("genlHeaderStation");
    const headerMonth = document.getElementById("genlPrintMonth");

    if (headerEmployee) {
      headerEmployee.textContent = employee || "—";
    }

    if (headerDesignation || headerStation) {
      const meta = getEmployeeHeaderMeta(employee);
      if (headerDesignation) {
        headerDesignation.textContent = meta.designation || "—";
      }
      if (headerStation) {
        headerStation.textContent = meta.station || "—";
      }
    }

    if (headerMonth) {
      headerMonth.textContent = formatDisplayMonth(monthValue || new Date());
    }
  }

  function getEmployeeNames() {
    const names = [];

    const workbookRows = Array.isArray(window.employeeMasterWorkbookData?.rows)
      ? window.employeeMasterWorkbookData.rows
      : [];
    const workbookHeaderRows = Number(window.employeeMasterWorkbookData?.headerRows || 4);

    workbookRows.slice(workbookHeaderRows).forEach((row) => {
      const employeeName = normalize(safeCell(row, 1));
      if (employeeName) {
        names.push(employeeName);
      }
    });

    try {
      const savedRows = JSON.parse(localStorage.getItem("EmployeeMasterData") || "[]");
      if (Array.isArray(savedRows)) {
        savedRows.forEach((row) => {
          const employeeName = normalize(safeCell(row, 1));
          if (employeeName) {
            names.push(employeeName);
          }
        });
      }
    } catch {
      // ignore storage parse issues
    }

    return Array.from(new Set(names.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  function fillEmployeeSelect() {
    const names = getEmployeeNames();
    employeeSelect.innerHTML = '<option value="">Select Employee</option>';

    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      employeeSelect.appendChild(option);
    });
  }

  function buildBaseRow(dateValue) {
    return {
      A: dateValue,
      B: "",
      C: null,
      D: null,
      E: null,
      F: null,
      G: "",
      H: null,
      I: null,
      J: null,
      K: null,
      L: null,
      M: "",
    };
  }

  function collectMatchingRawRows(rawRows, selectedEmployee, selectedMonth) {
    const target = upper(selectedEmployee);

    const matches = [];
    rawRows.forEach((row) => {
      const dateEntry = parseDateValue(safeCell(row, RAW_COL.DATE_ENTRY));
      if (!dateEntry) {
        return;
      }

      if (!isSameMonthYear(dateEntry, selectedMonth)) {
        return;
      }

      const employee1 = upper(safeCell(row, RAW_COL.EMPLOYEE_1));
      const employee2 = upper(safeCell(row, RAW_COL.EMPLOYEE_2));
      if (employee1 !== target && employee2 !== target) {
        return;
      }

      const outDuty = normalize(safeCell(row, RAW_COL.OUTWARD_DUTY));
      const outCommenced = parseTimeFraction(safeCell(row, RAW_COL.OUT_COMMENCED));
      const outTerminated = parseTimeFraction(safeCell(row, RAW_COL.OUT_TERMINATED));
      const inDuty = normalize(safeCell(row, RAW_COL.INWARD_DUTY));
      const inCommenced = parseTimeFraction(safeCell(row, RAW_COL.IN_COMMENCED));
      const inTerminated = parseTimeFraction(safeCell(row, RAW_COL.IN_TERMINATED));

      const allJourneyEmpty = RAW_JOURNEY_COLS.every((idx) => !hasValue(safeCell(row, idx)));
      const fallbackDuty = normalize(safeCell(row, RAW_COL.FALLBACK_DUTY));

      let lastTime = null;
      [outCommenced, outTerminated, inCommenced, inTerminated].forEach((value) => {
        if (Number.isFinite(value)) {
          lastTime = value;
        }
      });

      matches.push({
        raw: row,
        dateEntry,
        rowB: allJourneyEmpty ? fallbackDuty : outDuty,
        outCommenced,
        outTerminated,
        inDuty,
        inCommenced,
        inTerminated,
        lastTime,
      });
    });

    matches.sort((a, b) => {
      const dateDiff = a.dateEntry.getTime() - b.dateEntry.getTime();
      if (dateDiff !== 0) {
        return dateDiff;
      }

      const aLast = Number.isFinite(a.lastTime) ? a.lastTime : -1;
      const bLast = Number.isFinite(b.lastTime) ? b.lastTime : -1;
      return aLast - bLast;
    });

    return matches;
  }

  function findFirstRemarkByDate(rawRows, selectedEmployee, dateValue) {
    const target = upper(selectedEmployee);
    const dateSerial = toSerialDate(dateValue);

    for (let i = 0; i < rawRows.length; i += 1) {
      const row = rawRows[i];
      const rowDate = parseDateValue(safeCell(row, RAW_COL.DATE_ENTRY));
      if (!rowDate) {
        continue;
      }
      const employee1 = upper(safeCell(row, RAW_COL.EMPLOYEE_1));
      const employee2 = upper(safeCell(row, RAW_COL.EMPLOYEE_2));
      if (employee1 !== target && employee2 !== target) {
        continue;
      }
      if (toSerialDate(rowDate) === dateSerial) {
        return normalize(safeCell(row, RAW_COL.REMARKS));
      }
    }

    return "";
  }

  function computeColumnE(rows) {
    if (!rows.length) {
      return;
    }

    if (Number.isFinite(rows[0].C) && Number.isFinite(rows[0].D)) {
      rows[0].E = rows[0].D - rows[0].C;
    } else {
      rows[0].E = null;
    }

    for (let i = 1; i < rows.length; i += 1) {
      const cur = rows[i];
      const prev = rows[i - 1];

      if (Number.isFinite(cur.C) && Number.isFinite(cur.D)) {
        cur.E = cur.D - cur.C;
      } else if (Number.isFinite(cur.C) && !Number.isFinite(cur.D)) {
        cur.E = null;
      } else if (!Number.isFinite(cur.C) && Number.isFinite(cur.D)) {
        if (Number.isFinite(prev.C)) {
          cur.E = datePlusTime(cur.A, cur.D) - datePlusTime(prev.A, prev.C);
        } else {
          cur.E = null;
        }
      } else {
        cur.E = null;
      }
    }
  }

  function computeColumnF(rows) {
    const last = rows.length - 1;

    for (let i = 0; i <= last; i += 1) {
      const current = rows[i];
      const curDterm = current.D;

      if (!Number.isFinite(curDterm)) {
        current.F = null;
        continue;
      }

      let tempH = null;
      let firstHRow = -1;

      if (Number.isFinite(current.H)) {
        tempH = current.H;
        firstHRow = i;
      } else {
        for (let rr = i + 1; rr <= last; rr += 1) {
          if (Number.isFinite(rows[rr].H)) {
            tempH = rows[rr].H;
            firstHRow = rr;
            break;
          }
        }
      }

      if (Number.isFinite(tempH)) {
        let tempC = null;
        let tempCRow = -1;

        for (let rr = i + 1; rr <= firstHRow; rr += 1) {
          if (Number.isFinite(rows[rr].C)) {
            tempC = rows[rr].C;
            tempCRow = rr;
            break;
          }
        }

        if (Number.isFinite(tempC)) {
          current.F = datePlusTime(rows[tempCRow].A, tempC) - datePlusTime(current.A, curDterm);
        } else {
          current.F = datePlusTime(rows[firstHRow].A, tempH) - datePlusTime(current.A, curDterm);
        }
        continue;
      }

      current.F = null;
      for (let rr = i + 1; rr <= last; rr += 1) {
        if (Number.isFinite(rows[rr].C)) {
          current.F = datePlusTime(rows[rr].A, rows[rr].C) - datePlusTime(current.A, curDterm);
          break;
        }
      }
    }
  }

  function isZeroDuration(value) {
    return Number.isFinite(value) && Math.abs(value) < 0.000001;
  }

  function applyFZeroRule(row) {
    if (!isZeroDuration(row.F)) {
      return;
    }
    if (!Number.isFinite(row.E)) {
      return;
    }

    row.J = toNumeric(row.J) + row.E;
    row.E = null;
  }

  function computeColumnJ(rows) {
    if (!rows.length) {
      return;
    }

    function findDutyCommence(rowIndex) {
      for (let i = rowIndex; i >= 0; i -= 1) {
        const row = rows[i];

        if (Number.isFinite(row.H)) {
          return { date: row.A, time: row.H };
        }

        if (Number.isFinite(row.C)) {
          return { date: row.A, time: row.C };
        }
      }

      return null;
    }

    for (let i = 0; i < rows.length; i += 1) {
      const current = rows[i];
      const currentI = current.I;

      if (!Number.isFinite(currentI)) {
        current.J = null;
        continue;
      }

      const commence = findDutyCommence(i);
      if (!commence) {
        current.J = null;
        continue;
      }

      current.J = datePlusTime(current.A, currentI) - datePlusTime(commence.date, commence.time);
      applyFZeroRule(current);
    }
  }

  function computeColumnK(rows) {
    const last = rows.length - 1;

    for (let i = 0; i <= last; i += 1) {
      const current = rows[i];
      if (!Number.isFinite(current.I)) {
        current.K = null;
        continue;
      }

      let foundC = false;
      let stopBlank = false;
      let nextC = null;
      let nextDate = null;

      for (let rr = i + 1; rr <= last; rr += 1) {
        const probe = rows[rr];

        if (Number.isFinite(probe.C)) {
          foundC = true;
          nextC = probe.C;
          nextDate = probe.A;
          break;
        }

        const allEmptyCJ = ["C", "D", "E", "F", "G", "H", "I", "J"].every((key) => !hasValue(probe[key]));
        if (allEmptyCJ) {
          const bValue = normalize(probe.B);
          if (!bValue || isLeaveKeyword(bValue)) {
            stopBlank = true;
            break;
          }
        }
      }

      if (stopBlank) {
        current.K = null;
      } else if (foundC && Number.isFinite(nextC)) {
        current.K = datePlusTime(nextDate, nextC) - datePlusTime(current.A, current.I);
      } else {
        current.K = null;
      }
    }
  }

  function computeColumnL(rows) {
    for (let i = 0; i < rows.length; i += 1) {
      const eValue = toNumeric(rows[i].E);
      const jValue = toNumeric(rows[i].J);

      if (i === 0) {
        rows[i].L = eValue + jValue;
      } else {
        rows[i].L = toNumeric(rows[i - 1].L) + eValue + jValue;
      }
    }
  }

  function computeSummary(rows, selectedMonth) {
    const summary = {
      L46: null,
      L47: null,
      L48: 0,
      L49: 0,
      L50: 0,
    };

    if (!rows.length) {
      return summary;
    }

    summary.L46 = rows[rows.length - 1].L;

    if (Number.isFinite(summary.L46)) {
      const monthDays = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
      summary.L47 = summary.L46 * 7 / monthDays;
    }

    const scanCount = Math.min(REST_SCAN_LIMIT_ROWS, rows.length);
    for (let i = 0; i < scanCount; i += 1) {
      [rows[i].F, rows[i].K].forEach((restValue) => {
        if (!Number.isFinite(restValue)) {
          return;
        }

        const restHours = restValue * 24;
        if (restHours > 24) {
          summary.L48 += 1;
        } else if (restHours > 22 && restHours <= 24) {
          summary.L49 += 1;
        } else if (restHours > 20 && restHours <= 22) {
          summary.L50 += 1;
        }
      });
    }

    return summary;
  }

  function renderRows(rows, summary) {
    rowsBody.innerHTML = "";

    for (let i = 0; i < MAX_DETAIL_ROWS; i += 1) {
      const row = rows[i] || buildBaseRow(null);
      const tr = document.createElement("tr");

      const cells = [
        row.A instanceof Date && !Number.isNaN(row.A.getTime()) ? formatDateDdMmmYyyy(row.A) : "",
        normalize(row.B),
        formatClock(row.C),
        formatClock(row.D),
        formatDuration(row.E),
        formatDuration(row.F),
        normalize(row.G),
        formatClock(row.H),
        formatClock(row.I),
        formatDuration(row.J),
        formatDuration(row.K),
        formatDuration(row.L),
        normalize(row.M),
      ];

      cells.forEach((value, index) => {
        const td = document.createElement("td");
        td.textContent = value;
        if (index === 1 || index === 6 || index === 12) {
          td.classList.add("genl-text");
        }
        if (index === 10 && Number.isFinite(row.K) && row.K * 24 < 12) {
          td.classList.add("genl-warning-rest");
        }
        tr.appendChild(td);
      });

      rowsBody.appendChild(tr);
    }

    const summaryRows = [
      { label: "Total actual hours worked during the month", value: formatDuration(summary.L46) },
      { label: "(ii) Average hours worked per week", value: formatDuration(summary.L47), rowNo: "47" },
      { label: "(iii) No. of rest periods exceeding 24 consecutive hours", value: String(summary.L48), rowNo: "48" },
      { label: "(iv) No. of rest periods exceeding 22 consecutive hours", value: String(summary.L49), rowNo: "49" },
      { label: "(v) No. of rest periods exceeding 20 consecutive hours", value: String(summary.L50), rowNo: "50" },
    ];

    const summaryBlockRow = document.createElement("tr");
    summaryBlockRow.classList.add("genl-summary-row");

    const formulaCell = document.createElement("td");
    formulaCell.colSpan = 7;
    formulaCell.classList.add("genl-summary-formula-cell");

    const formulaWrap = document.createElement("div");
    formulaWrap.classList.add("genl-summary-formula-wrap");

    const formulaNumerator = document.createElement("div");
    formulaNumerator.textContent = "Total actual hours worked during the month × 7";
    formulaNumerator.classList.add("genl-summary-formula-num");

    const formulaBar = document.createElement("div");
    formulaBar.classList.add("genl-summary-formula-bar");

    const formulaDenominator = document.createElement("div");
    formulaDenominator.textContent = "Number of days in month";
    formulaDenominator.classList.add("genl-summary-formula-den");

    formulaWrap.appendChild(formulaNumerator);
    formulaWrap.appendChild(formulaBar);
    formulaWrap.appendChild(formulaDenominator);
    formulaCell.appendChild(formulaWrap);
    summaryBlockRow.appendChild(formulaCell);

    const summaryRightCell = document.createElement("td");
    summaryRightCell.colSpan = 6;
    summaryRightCell.classList.add("genl-summary-right-cell");

    const summaryStack = document.createElement("div");
    summaryStack.classList.add("genl-summary-stack");

    summaryRows.forEach((item) => {
      const line = document.createElement("div");
      line.classList.add("genl-summary-line");

      const label = document.createElement("div");
      label.textContent = item.label;
      label.classList.add("genl-summary-label");

      const value = document.createElement("div");
      value.textContent = item.value;
      value.classList.add("genl-summary-value");

      line.appendChild(label);
      line.appendChild(value);
      summaryStack.appendChild(line);
    });

    summaryRightCell.appendChild(summaryStack);
    summaryBlockRow.appendChild(summaryRightCell);

    rowsBody.appendChild(summaryBlockRow);
  }

  function collectMissingDates(rows, selectedMonth) {
    const existing = new Set();

    rows.slice(0, MAX_DETAIL_ROWS).forEach((row) => {
      if (!(row.A instanceof Date) || Number.isNaN(row.A.getTime())) {
        return;
      }
      existing.add(toSerialDate(row.A));
    });

    const output = [];
    const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
    const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);

    for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
      const serial = toSerialDate(cursor);
      if (!existing.has(serial)) {
        output.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
      }
      if (output.length >= MAX_DETAIL_ROWS) {
        break;
      }
    }

    return output;
  }

  function renderMissingDates(dates) {
    missingList.innerHTML = "";

    if (!dates.length) {
      const li = document.createElement("li");
      li.textContent = "No missing dates for selected month.";
      missingList.appendChild(li);
      return;
    }

    dates.forEach((dateValue) => {
      const li = document.createElement("li");
      li.textContent = formatDateDdMmmYyyy(dateValue);
      missingList.appendChild(li);
    });
  }

  function getPrintClass(pageSize) {
    const map = {
      A4: "genl-print-a4",
      A3: "genl-print-a3",
      Legal: "genl-print-legal",
    };
    return map[pageSize] || "genl-print-a4";
  }

  function applyPrintSize(pageSize) {
    document.body.classList.remove("genl-print-a4", "genl-print-a3", "genl-print-legal", "genl-print-letter");
    document.body.classList.add(getPrintClass(pageSize));
  }

  async function loadGenlData() {
    const employee = normalize(employeeSelect.value);
    const selectedMonth = parseMonthInput(monthPicker.value);

    if (!employee) {
      setStatus("Please select employee in B2 equivalent field.", true);
      return;
    }
    if (!selectedMonth) {
      setStatus("Please select valid month in K4 equivalent field.", true);
      return;
    }

    loadBtn.disabled = true;
    setStatus("Loading RawData and calculating GENL-164...");

    try {
      const workbookPayload = await fetchApi("/api/raw-data/workbook", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const headerRows = Number(workbookPayload?.headerRows || 2);
      const allRows = Array.isArray(workbookPayload?.rows) ? workbookPayload.rows : [];
      const rawRows = allRows.slice(headerRows);

      const matches = collectMatchingRawRows(rawRows, employee, selectedMonth);
      const detailRows = matches.slice(0, MAX_DETAIL_ROWS).map((item) => {
        const row = buildBaseRow(item.dateEntry);
        row.B = item.rowB;
        row.C = item.outCommenced;
        row.D = item.outTerminated;
        row.G = item.inDuty;
        row.H = item.inCommenced;
        row.I = item.inTerminated;
        row.M = findFirstRemarkByDate(rawRows, employee, item.dateEntry);
        return row;
      });

      computeColumnE(detailRows);
      computeColumnF(detailRows);
      computeColumnJ(detailRows);
      computeColumnK(detailRows);
      computeColumnL(detailRows);

      const summary = computeSummary(detailRows, selectedMonth);

      state.selectedMonth = selectedMonth;
      state.selectedEmployee = employee;
      state.detailRows = detailRows;
      state.missingDates = collectMissingDates(detailRows, selectedMonth);

      renderRows(detailRows, summary);
      renderMissingDates(state.missingDates);
      updateGenlHeader();

      setStatus(`Loaded ${matches.length} source rows for ${employee}. Displaying ${detailRows.length} row(s).`);
    } catch (error) {
      setStatus(error.message || "Failed to load GENL-164 data.", true);
    } finally {
      loadBtn.disabled = false;
    }
  }

  function handleMissingDates() {
    const selectedMonth = parseMonthInput(monthPicker.value);
    if (!selectedMonth) {
      setStatus("Please select valid month first.", true);
      return;
    }

    state.selectedMonth = selectedMonth;
    state.missingDates = collectMissingDates(state.detailRows, selectedMonth);
    renderMissingDates(state.missingDates);
    setStatus(`Missing dates listed in R7:R46 equivalent list (${state.missingDates.length}).`);
  }

  function buildGenlPdfFilename(employee, selectedMonth) {
    const employeeName = normalize(employee).replace(/[\\/:*?"<>|]/g, "").trim().toUpperCase();
    const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(selectedMonth).toUpperCase();
    const yearValue = selectedMonth.getFullYear();
    const safeEmployee = employeeName || "EMPLOYEE";
    return `${safeEmployee} ${monthName}-${yearValue}.pdf`;
  }

  // ── Save dialog: location picker + duplicate/update handling ──────────────
  // Uses File System Access API (Chrome/Edge). Falls back to plain download in
  // browsers that don't support it (Firefox, Safari older versions).

  // In-memory directory handle cache so the user doesn't have to re-pick every time.
  let _savedDirHandle = null;

  function buildDuplicateDialog(filename) {
    return new Promise((resolve) => {
      // Overlay
      const overlay = document.createElement("div");
      overlay.style.cssText = [
        "position:fixed;inset:0;z-index:9999",
        "background:rgba(10,25,42,0.55);backdrop-filter:blur(4px)",
        "display:flex;align-items:center;justify-content:center",
      ].join(";");

      // Card
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
    // "AZHAR MAY-2026.pdf" → "AZHAR MAY-2026 (2).pdf", then (3), etc.
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
        setStatus(`Saved: "${fileHandle.name}"`);
        return;
      } catch (err) {
        // User cancelled the picker → AbortError; anything else is a real error
        if (err.name === "AbortError") {
          setStatus("Save cancelled.");
          return;
        }
        // Fall through to Path B on unexpected errors
      }
    }

    // ── Path B: Directory picker — remember last folder, check for duplicates ─
    if (typeof window.showDirectoryPicker === "function") {
      try {
        // Re-use cached handle if available; otherwise ask user to pick
        let dirHandle = _savedDirHandle;
        if (!dirHandle) {
          dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
          _savedDirHandle = dirHandle;
        }

        let finalName = suggestedName;

        // Check if file already exists
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
            setStatus("Save cancelled.");
            return;
          }
          if (choice === "new") {
            finalName = makeUniqueName(suggestedName);
          }
          // choice === "update" → keep same name, overwrite
        }

        const fileHandle = await dirHandle.getFileHandle(finalName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(pdfBlob);
        await writable.close();
        setStatus(`Saved: "${finalName}"`);
        return;
      } catch (err) {
        if (err.name === "AbortError") {
          _savedDirHandle = null; // reset so next time the picker opens again
          setStatus("Save cancelled.");
          return;
        }
        // Fall through to Path C
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
    setStatus(`Downloaded: "${suggestedName}"`);
  }

  function captureAndSave(filename) {
    const printArea = document.getElementById("genlPrintArea");
    if (!printArea) { setStatus("Print area not found.", true); return; }

    setStatus("Generating PDF, please wait...");
    printBtn.disabled = true;

    // Hide non-print elements
    const hideSelectors = [".genl-missing-panel", "#genlStatus", ".genl-toolbar", ".nav-bar", ".site-header", ".bg-shape"];
    const hiddenEls = [];
    hideSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (el.style.display !== "none") {
          el.style.display = "none";
          hiddenEls.push(el);
        }
      });
    });

    // Portrait mode page sizes (mm)
    const pageSizes = {
      A4:    { w: 210,   h: 297   },
      A3:    { w: 297,   h: 420   },
      Legal: { w: 215.9, h: 355.6 },
    };
    const pageSize = pageSizes[pageSizeSelect.value] || pageSizes.Legal;

    // Margins (mm) in Portrait mode - Left 20mm for file punch hole clearance, Right 7mm
    const marginLeft   = 20; // mm (punch-hole filing clearance)
    const marginRight  = 7;  // mm (compact right margin)
    const marginTop    = 8;  // mm
    const marginBottom = 8;  // mm
    const availW       = pageSize.w - marginLeft - marginRight;
    const availH       = pageSize.h - marginTop - marginBottom;

    // High-resolution render width for clean, un-wrapped table layout
    const canvasW = 1200;

    // Collapse grid to 1fr and set width to canvasW so table spans full available printable width
    const origGridCols = printArea.style.gridTemplateColumns;
    const origWidth    = printArea.style.width;
    const origMinWidth = printArea.style.minWidth;
    const origMaxWidth = printArea.style.maxWidth;

    printArea.style.gridTemplateColumns = "1fr";
    printArea.style.width    = canvasW + "px";
    printArea.style.minWidth = canvasW + "px";
    printArea.style.maxWidth = canvasW + "px";

    // Remove overflow and max-height so html2canvas captures full scrollable content
    const overflowEls = [];
    const checkEls = [printArea, ...Array.from(printArea.querySelectorAll("*"))];
    checkEls.forEach((el) => {
      if (!el || !el.style) return;
      const computed = window.getComputedStyle(el);
      const ox = computed.overflowX;
      const oy = computed.overflowY;
      const maxH = el.style.maxHeight;
      if (ox === "auto" || ox === "hidden" || ox === "scroll" ||
          oy === "auto" || oy === "hidden" || oy === "scroll" ||
          (computed.maxHeight && computed.maxHeight !== "none")) {
        overflowEls.push({ el, ox: el.style.overflowX, oy: el.style.overflowY, maxH });
        el.style.overflowX = "visible";
        el.style.overflowY = "visible";
        el.style.maxHeight = "none";
      }
    });

    const canvasH  = printArea.scrollHeight;

    const restoreAll = () => {
      printArea.style.gridTemplateColumns = origGridCols;
      printArea.style.width    = origWidth;
      printArea.style.minWidth = origMinWidth;
      printArea.style.maxWidth = origMaxWidth;
      hiddenEls.forEach((el) => { el.style.display = ""; });
      overflowEls.forEach(({ el, ox, oy, maxH }) => {
        el.style.overflowX = ox;
        el.style.overflowY = oy;
        el.style.maxHeight = maxH;
      });
    };

    html2canvas(printArea, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: canvasW,
      height: canvasH,
      windowWidth: canvasW,
      windowHeight: canvasH,
      scrollX: 0,
      scrollY: 0,
      logging: false,
    }).then(async (canvas) => {
      restoreAll();

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const { jsPDF } = window.jspdf;

      // Fit to Page: Stretch content to fill 100% of available portrait page width and height
      // Ensures no empty space at bottom, larger clear details, and perfect 20mm punch margin
      const imgW = availW;
      const imgH = availH;

      // Strictly Portrait mode as requested by user
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [pageSize.w, pageSize.h] });

      // Left margin 20mm for punching holes, top margin 8mm, fills completely down to bottom margin
      const offsetX = marginLeft;
      const offsetY = marginTop;
      pdf.addImage(imgData, "JPEG", offsetX, offsetY, imgW, imgH);

      // output() returns a string; convert to Blob for File System API
      const pdfBlob = pdf.output("blob");
      await savePdfBlob(pdfBlob, filename);
      printBtn.disabled = false;
    }).catch((err) => {
      restoreAll();
      setStatus("PDF generation failed: " + (err.message || err), true);
      printBtn.disabled = false;
    });
  }

  function handlePrintPreview() {
    const employee     = normalize(employeeSelect.value);
    const selectedMonth = parseMonthInput(monthPicker.value);

    if (!employee) {
      setStatus("Please select employee before saving PDF.", true);
      return;
    }
    if (!selectedMonth) {
      setStatus("Please select month before saving PDF.", true);
      return;
    }

    const filename = buildGenlPdfFilename(employee, selectedMonth);

    // Fallback to window.print() if jsPDF or html2canvas not loaded
    if (typeof window.jspdf === "undefined" || typeof window.html2canvas === "undefined") {
      const previousTitle = document.title;
      document.title = filename;
      applyPrintSize(pageSizeSelect.value);
      setStatus("Saving... Use 'Save as PDF' in the print dialog.");
      window.print();
      setTimeout(() => { document.title = previousTitle; }, 2000);
      return;
    }

    captureAndSave(filename);
  }

  function initialize() {
    fillEmployeeSelect();

    const defaultMonth = new Date(2026, 0, 1);
    monthPicker.value = formatMonthInputValue(defaultMonth);
    state.selectedMonth = defaultMonth;
    applyPrintSize(pageSizeSelect.value);

    loadBtn.addEventListener("click", loadGenlData);
    missingBtn.addEventListener("click", handleMissingDates);
    printBtn.addEventListener("click", handlePrintPreview);

    pageSizeSelect.addEventListener("change", () => {
      applyPrintSize(pageSizeSelect.value);
    });

    monthPicker.addEventListener("change", () => {
      updateGenlHeader();
    });

    employeeSelect.addEventListener("change", () => {
      state.selectedEmployee = normalize(employeeSelect.value);
      updateGenlHeader();
    });
  }

  initialize();
})();
