const homeAuthSessionKey = "HomeAuthSession";
const HOME_RAW_DATA_API_BASE_URL = "http://localhost:3000";
const AUTH_API_BASE_URL = window.location.port === "5500"
  ? `http://${window.location.hostname}:3000`
  : "";
const HOME_RAW_DATA_API_PATHS = {
  dataRows: "/api/raw-data/data-rows",
};

const form = document.getElementById("mileageForm");
const downloadBtn = document.getElementById("downloadLoco18");
const clearFormBtn = document.getElementById("clearForm");
const startDateInput = form.querySelector("input[name='startDate']");
const endDateInput = form.querySelector("input[name='endDate']");
const employee1NameInput = form.querySelector("input[name='employee1Name']");
const employee2NameInput = form.querySelector("input[name='employee2Name']");
const overTimeOtInput = form.querySelector("input[name='overTimeOt']");
const mileageInput = form.querySelector("input[name='mileageKm']");
const employeeNameOptions = document.getElementById("employeeNameOptions");
const outwardDutyCommencedInput = form.querySelector("input[name='outwardDutyCommenced']");
const outwardDutyTerminatedInput = form.querySelector("input[name='outwardDutyTerminated']");
const inwardDutyCommencedInput = form.querySelector("input[name='inwardDutyCommenced']");
const inwardDutyTerminatedInput = form.querySelector("input[name='inwardDutyTerminated']");
const outwardDurationInput = form.querySelector("input[name='outwardDuration']");
const inwardDurationInput = form.querySelector("input[name='inwardDuration']");
const loginToggleBtn = document.getElementById("loginToggleBtn");
const loginDialog = document.getElementById("loginDialog");
const homeLoginForm = document.getElementById("homeLoginForm");
const loginUserIdInput = document.getElementById("loginUserId");
const loginPasswordInput = document.getElementById("loginPassword");
const logoutBtn = document.getElementById("logoutBtn");
const loginStateText = document.getElementById("loginStateText");

let activeUser = null;
let authRequestInProgress = false;

function setLandingMode(isLanding) {
  document.body.classList.toggle("login-landing", Boolean(isLanding));
}

function openLoginDialog() {
  if (loginDialog && !loginDialog.open) {
    loginDialog.showModal();
  }
}

function closeLoginDialog() {
  if (loginDialog && loginDialog.open) {
    loginDialog.close();
  }
}

function getHomeRawDataApiUrl(pathname) {
  return `${HOME_RAW_DATA_API_BASE_URL}${pathname}`;
}

function getAuthApiUrl(pathname) {
  return `${AUTH_API_BASE_URL}${pathname}`;
}

function applyNavigationPermissions(user) {
  const permissionsByPage = {
    "employee-master.html": "employeeMaster",
    "genl-164.html": "general164",
    "loco-18.html": "loco18",
    "raw-data.html": "rawDataSearch",
    "raw-data-search.html": "rawDataSearch",
    "op72-raw-data.html": "op72RawData",
    "op-72.html": "op72",
    "amount-summary.html": "amountSummary",
    "group-master.html": "groupMaster",
    "holidays.html": "holidays",
  };
  document.querySelectorAll(".nav-link").forEach((link) => {
    const page = String(link.getAttribute("href") || "").split("#")[0].toLowerCase();
    const permission = permissionsByPage[page];
    link.hidden = Boolean(permission && !user?.permissions?.includes(permission));
  });
}

function setHomeAccessByRole(user) {
  const formControls = Array.from(form.querySelectorAll("input, select, textarea, button"));
  const isLoggedIn = Boolean(user);
  const isAdmin = user?.role === "admin" || user?.role === "restricted-admin";

  formControls.forEach((control) => {
    if (control === downloadBtn) {
      control.disabled = !isAdmin;
      return;
    }

    control.disabled = !isLoggedIn;
  });
}

function renderAuthState() {
  if (!activeUser) {
    loginStateText.textContent = "Not signed in.";
    loginToggleBtn.textContent = "Login";
    setHomeAccessByRole(null);
    setLandingMode(true);
    return;
  }

  const roleText = activeUser.role === "admin"
    ? "Admin (Full Access)"
    : activeUser.role === "restricted-admin"
      ? "Restricted Admin"
      : "Employee";
  loginStateText.textContent = `Signed in: ${activeUser.userId} | ${roleText}`;
  loginToggleBtn.textContent = activeUser.userId;
  applyNavigationPermissions(activeUser);
  setLandingMode(false);
  setHomeAccessByRole(activeUser);
}

function persistAuthSession() {
  if (!activeUser) {
    localStorage.removeItem(homeAuthSessionKey);
    return;
  }

  localStorage.setItem(homeAuthSessionKey, JSON.stringify({ userId: activeUser.userId, role: activeUser.role }));
}

async function restoreAuthSession() {
  try {
    const response = await fetch(getAuthApiUrl("/api/auth/session"), { credentials: "include" });
    if (authRequestInProgress || activeUser) return;
    if (!response.ok) throw new Error("Not authenticated");
    const payload = await response.json();
    activeUser = payload.user;
    persistAuthSession();
    renderAuthState();
  } catch {
    if (authRequestInProgress || activeUser) return;
    activeUser = null;
    persistAuthSession();
    renderAuthState();
  }
}

async function authenticateUser(userId, password) {
  const response = await fetch(getAuthApiUrl("/api/auth/login"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId, password }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload.user || null;
}

function formatDateDdMmmYyyy(dateValue) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(dateValue.getDate()).padStart(2, "0");
  const mmm = monthNames[dateValue.getMonth()];
  const yyyy = dateValue.getFullYear();
  return `${dd}-${mmm}-${yyyy}`;
}

function parseDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  if (/^\d{8}$/.test(raw)) {
    const dd = Number(raw.slice(0, 2));
    const mm = Number(raw.slice(2, 4));
    const yyyy = Number(raw.slice(4, 8));
    const parsed = new Date(yyyy, mm - 1, dd);
    if (parsed.getFullYear() === yyyy && parsed.getMonth() === mm - 1 && parsed.getDate() === dd) {
      return parsed;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const numericMatch = raw.match(/^(\d{1,2})[-/\s](\d{1,2})[-/\s](\d{4})$/);
  if (numericMatch) {
    const dd = Number(numericMatch[1]);
    const mm = Number(numericMatch[2]);
    const yyyy = Number(numericMatch[3]);
    const parsed = new Date(yyyy, mm - 1, dd);
    if (parsed.getFullYear() === yyyy && parsed.getMonth() === mm - 1 && parsed.getDate() === dd) {
      return parsed;
    }
  }

  const match = raw.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/);
  if (!match) {
    return null;
  }

  const monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const dd = Number(match[1]);
  const mon = monthMap[match[2].toLowerCase()];
  const yyyy = Number(match[3]);
  if (!Number.isFinite(dd) || mon === undefined || !Number.isFinite(yyyy)) {
    return null;
  }

  const parsed = new Date(yyyy, mon, dd);
  if (parsed.getFullYear() !== yyyy || parsed.getMonth() !== mon || parsed.getDate() !== dd) {
    return null;
  }

  return parsed;
}

function normalizeDateInput(inputElement) {
  const parsed = parseDateInput(inputElement.value);
  if (!inputElement.value.trim()) {
    inputElement.setCustomValidity("");
    return "";
  }

  if (!parsed) {
    inputElement.setCustomValidity("Use date format dd-mmm-yyyy");
    return null;
  }

  inputElement.setCustomValidity("");
  const normalized = formatDateDdMmmYyyy(parsed);
  inputElement.value = normalized;
  return normalized;
}

function autoFormatDateTyping(inputElement) {
  const raw = String(inputElement.value || "");
  if (/[A-Za-z]/.test(raw)) {
    return;
  }

  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (!digits) {
    inputElement.value = "";
    return;
  }

  if (digits.length <= 2) {
    inputElement.value = digits;
    return;
  }

  if (digits.length <= 4) {
    inputElement.value = `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return;
  }

  inputElement.value = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function toHhMm(timeValue) {
  const value = String(timeValue || "").trim();
  if (!value) {
    return "";
  }

  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }

  return value;
}

function parseSmartTime(rawValue) {
  const compact = String(rawValue || "").trim().replace(/\s+/g, "");
  if (!compact) {
    return null;
  }

  if (compact.includes(":")) {
    const match = compact.match(/^(\d+):(\d{1,2})$/);
    if (!match) {
      return null;
    }

    return {
      hours: Number(match[1]),
      minutes: Number(match[2]),
    };
  }

  const digits = compact.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  if (digits.length <= 2) {
    return {
      hours: 0,
      minutes: Number(digits),
    };
  }

  if (digits.length === 3) {
    return {
      hours: Number(digits.slice(0, 1)),
      minutes: Number(digits.slice(1)),
    };
  }

  return {
    hours: Number(digits.slice(0, -2)),
    minutes: Number(digits.slice(-2)),
  };
}

function normalizeJourneyTimeInput(inputElement) {
  const raw = String(inputElement.value || "").trim();
  if (!raw) {
    inputElement.setCustomValidity("");
    return "";
  }

  const parsed = parseSmartTime(raw);
  if (!parsed) {
    inputElement.setCustomValidity("Use time format hh:mm");
    return null;
  }

  const { hours, minutes } = parsed;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    inputElement.setCustomValidity("Use time between 00:00 and 23:59");
    return null;
  }

  inputElement.setCustomValidity("");
  const normalized = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  inputElement.value = normalized;
  return normalized;
}

function normalizeOtInput(inputElement) {
  const raw = String(inputElement.value || "").trim();
  if (!raw) {
    inputElement.setCustomValidity("");
    return "";
  }

  const compact = raw.replace(/\s+/g, "");
  let hoursPart = "";
  let minutesPart = "";

  if (compact.includes(":")) {
    const match = compact.match(/^(\d+):(\d{1,2})$/);
    if (!match) {
      inputElement.setCustomValidity("Use OT format h:mm");
      return null;
    }

    hoursPart = match[1];
    minutesPart = match[2].padStart(2, "0");
  } else {
    const digits = compact.replace(/\D/g, "");
    if (!digits) {
      inputElement.setCustomValidity("Use OT format h:mm");
      return null;
    }

    if (digits.length <= 2) {
      hoursPart = "00";
      minutesPart = digits.padStart(2, "0");
    } else if (digits.length === 3) {
      hoursPart = String(Number(digits.slice(0, 1)));
      minutesPart = digits.slice(1);
    } else {
      hoursPart = String(Number(digits.slice(0, -2)));
      minutesPart = digits.slice(-2);
    }
  }

  if (Number(minutesPart) > 59) {
    inputElement.setCustomValidity("Minutes must be between 00 and 59");
    return null;
  }

  inputElement.setCustomValidity("");
  const normalized = `${hoursPart}:${minutesPart}`;
  inputElement.value = normalized;
  return normalized;
}

function autoFormatOtTyping(inputElement) {
  const raw = String(inputElement.value || "");
  const sanitized = raw.replace(/[^0-9:]/g, "");
  if (sanitized !== raw) {
    inputElement.value = sanitized;
  }
}

function autoFormatJourneyTimeTyping(inputElement) {
  const raw = String(inputElement.value || "");
  const sanitized = raw.replace(/[^0-9:]/g, "");
  if (sanitized !== raw) {
    inputElement.value = sanitized;
  }
}

function normalizeDurationInput(inputElement) {
  const raw = String(inputElement.value || "").trim();
  if (!raw) {
    inputElement.value = "0";
    inputElement.setCustomValidity("");
    return "0";
  }

  if (!/^\d+$/.test(raw)) {
    inputElement.setCustomValidity("Duration must be a whole number between 0 and 5");
    return null;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 5) {
    inputElement.setCustomValidity("Duration must be between 0 and 5");
    return null;
  }

  inputElement.setCustomValidity("");
  inputElement.value = String(value);
  return String(value);
}

function autoFormatDurationTyping(inputElement) {
  const raw = String(inputElement.value || "");
  const sanitized = raw.replace(/\D/g, "").slice(0, 1);
  if (sanitized !== raw) {
    inputElement.value = sanitized;
  }
}

function collectEmployeeNames() {
  const names = new Set();

  try {
    const savedRows = JSON.parse(localStorage.getItem("EmployeeMasterData") || "[]");
    if (Array.isArray(savedRows)) {
      savedRows.forEach((row) => {
        const name = Array.isArray(row) ? String(row[1] || "").trim() : "";
        if (name) {
          names.add(name);
        }
      });
    }
  } catch {
    // ignore invalid local data
  }

  const workbookRows = window.employeeMasterWorkbookData?.rows;
  const workbookHeaderRows = Number(window.employeeMasterWorkbookData?.headerRows || 0);
  if (Array.isArray(workbookRows)) {
    workbookRows.slice(workbookHeaderRows).forEach((row) => {
      const name = Array.isArray(row) ? String(row[1] || "").trim() : "";
      if (name) {
        names.add(name);
      }
    });
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function renderEmployeeNameOptions() {
  const names = collectEmployeeNames();
  employeeNameOptions.innerHTML = "";

  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    employeeNameOptions.appendChild(option);
  });
}

function parseClockToMinutes(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return (hours * 60) + minutes;
}

function parseOtToDayFraction(otValue) {
  const raw = String(otValue || "").trim();
  if (!raw) {
    return "";
  }

  const match = raw.match(/^(\d+):(\d{2})$/);
  if (!match) {
    throw new Error("Invalid OT format.");
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || minutes < 0 || minutes > 59) {
    throw new Error("Invalid OT value.");
  }

  return (hours + (minutes / 60)) / 24;
}

function getJourneyTerminationOffset(startMinutes, endMinutes, durationDays) {
  if (endMinutes === null) {
    return null;
  }

  if (durationDays > 0) {
    return durationDays;
  }

  if (startMinutes !== null && endMinutes < startMinutes) {
    return 1;
  }

  return 0;
}

function parseRemarksParts(rawRemarks) {
  const raw = String(rawRemarks || "").trim();
  if (!raw) {
    return [];
  }

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

  const baseRowCount = Math.floor((endOnly.getTime() - startOnly.getTime()) / (24 * 60 * 60 * 1000)) + 1;

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
  if (outTermOffset !== null) {
    candidateRowCounts.push(outTermOffset + 1);
  }
  if (inCommOffset !== null) {
    candidateRowCounts.push(inCommOffset + 1);
  }
  if (inTermOffset !== null) {
    candidateRowCounts.push(inTermOffset + 1);
  }
  const totalRowCount = Math.max(...candidateRowCounts);

  const remarksParts = parseRemarksParts(entry.remarks);
  if (remarksParts.length && remarksParts.length !== totalRowCount) {
    throw new Error(`Remarks contains ${remarksParts.length} parts, but ${totalRowCount} rows are required.`);
  }

  const rows = Array.from({ length: totalRowCount }, (_, index) => {
    const rowDate = new Date(startOnly.getFullYear(), startOnly.getMonth(), startOnly.getDate() + index);
    const row = new Array(13).fill("");
    row[0] = formatDateDdMmmYyyy(rowDate);

    if (index < baseRowCount) {
      row[1] = entry.employee1Name;
      row[2] = entry.employee2Name;
      row[3] = entry.dutyType;
    }

    return row;
  });

  // OT and mileage are saved only on the first base row, matching VBA behavior.
  rows[0][4] = parseOtToDayFraction(entry.overTimeOt);
  rows[0][5] = entry.mileageKm === 0 ? 0 : (entry.mileageKm || "");

  if (entry.outwardDuty) {
    rows[0][6] = entry.outwardDuty;
  }
  if (entry.outwardDutyCommenced) {
    rows[0][7] = toHhMm(entry.outwardDutyCommenced);
  }
  if (entry.outwardDutyTerminated && outTermOffset !== null) {
    rows[outTermOffset][8] = toHhMm(entry.outwardDutyTerminated);
  }

  if (entry.inwardDuty && inCommOffset !== null) {
    rows[inCommOffset][9] = entry.inwardDuty;
  }
  if (entry.inwardDutyCommenced && inCommOffset !== null) {
    rows[inCommOffset][10] = toHhMm(entry.inwardDutyCommenced);
  }
  if (entry.inwardDutyTerminated && inTermOffset !== null) {
    rows[inTermOffset][11] = toHhMm(entry.inwardDutyTerminated);
  }

  if (remarksParts.length) {
    remarksParts.forEach((part, index) => {
      rows[index][12] = part;
    });
  }

  return rows;
}

async function appendRawDataRows(rows) {
  const response = await fetch(getHomeRawDataApiUrl(HOME_RAW_DATA_API_PATHS.dataRows), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ rows }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!activeUser) {
    loginStateText.textContent = "Please sign in first.";
    return;
  }

  const normalizedStartDate = normalizeDateInput(startDateInput);
  const normalizedEndDate = normalizeDateInput(endDateInput);
  const normalizedOt = normalizeOtInput(overTimeOtInput);
  const normalizedOutwardCommenced = normalizeJourneyTimeInput(outwardDutyCommencedInput);
  const normalizedOutwardTerminated = normalizeJourneyTimeInput(outwardDutyTerminatedInput);
  const normalizedInwardCommenced = normalizeJourneyTimeInput(inwardDutyCommencedInput);
  const normalizedInwardTerminated = normalizeJourneyTimeInput(inwardDutyTerminatedInput);
  const normalizedOutwardDuration = normalizeDurationInput(outwardDurationInput);
  const normalizedInwardDuration = normalizeDurationInput(inwardDurationInput);
  const mileageNumber = Number(mileageInput.value || 0);

  if (
    normalizedStartDate === null ||
    normalizedEndDate === null ||
    normalizedOt === null ||
    normalizedOutwardCommenced === null ||
    normalizedOutwardTerminated === null ||
    normalizedInwardCommenced === null ||
    normalizedInwardTerminated === null ||
    normalizedOutwardDuration === null ||
    normalizedInwardDuration === null
  ) {
    form.reportValidity();
    return;
  }

  const parsedStartDate = parseDateInput(normalizedStartDate);
  const parsedEndDate = parseDateInput(normalizedEndDate);
  if (!parsedStartDate || !parsedEndDate || parsedEndDate < parsedStartDate) {
    endDateInput.setCustomValidity("End Date must be after Start Date");
    form.reportValidity();
    return;
  }
  endDateInput.setCustomValidity("");

  if (!Number.isInteger(mileageNumber)) {
    mileageInput.setCustomValidity("Mileage must be a whole number");
    form.reportValidity();
    return;
  }

  mileageInput.setCustomValidity("");

  const formData = new FormData(form);

  const employee1Name = String(formData.get("employee1Name") || "").trim();
  const employee2Name = String(formData.get("employee2Name") || "").trim();
  const dutyType = String(formData.get("dutyType") || "").trim();

  if (!employee1Name || !dutyType) {
    loginStateText.textContent = "Employee 1 and Duty Type are required.";
    return;
  }

  if (employee2Name && employee1Name.toLowerCase() === employee2Name.toLowerCase()) {
    employee2NameInput.setCustomValidity("Employee 2 cannot be the same as Employee 1.");
    form.reportValidity();
    return;
  }
  employee2NameInput.setCustomValidity("");

  const entry = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    employee1Name,
    employee2Name,
    dutyType,
    mileageKm: mileageNumber,
    overTimeOt: normalizedOt,
    outwardDuty: String(formData.get("outwardDuty") || "").trim(),
    outwardDutyCommenced: normalizedOutwardCommenced,
    outwardDuration: normalizedOutwardDuration,
    outwardDutyTerminated: normalizedOutwardTerminated,
    inwardDuty: String(formData.get("inwardDuty") || "").trim(),
    inwardDutyCommenced: normalizedInwardCommenced,
    inwardDuration: normalizedInwardDuration,
    inwardDutyTerminated: normalizedInwardTerminated,
    remarks: String(formData.get("remarks") || "").trim(),
  };

  try {
    const rows = buildRawDataRowsFromEntry(entry);
    const result = await appendRawDataRows(rows);
    loginStateText.textContent = `Entries saved successfully (${result.savedRowCount} row${result.savedRowCount === 1 ? "" : "s"}).`;
    clearFormBtn.click();
  } catch (error) {
    loginStateText.textContent = error.message;
  }
});

clearFormBtn.addEventListener("click", () => {
  form.reset();
  startDateInput.setCustomValidity("");
  endDateInput.setCustomValidity("");
  overTimeOtInput.setCustomValidity("");
  mileageInput.setCustomValidity("");
  outwardDutyCommencedInput.setCustomValidity("");
  outwardDutyTerminatedInput.setCustomValidity("");
  inwardDutyCommencedInput.setCustomValidity("");
  inwardDutyTerminatedInput.setCustomValidity("");
  outwardDurationInput.setCustomValidity("");
  inwardDurationInput.setCustomValidity("");
  outwardDurationInput.value = "0";
  inwardDurationInput.value = "0";
});

downloadBtn.addEventListener("click", () => {
  if (!activeUser || activeUser.role !== "admin") {
    loginStateText.textContent = "Only admin users can open Loco-18.";
    return;
  }
  window.location.href = "loco-18.html";
});

startDateInput.addEventListener("blur", () => normalizeDateInput(startDateInput));
endDateInput.addEventListener("blur", () => normalizeDateInput(endDateInput));
overTimeOtInput.addEventListener("blur", () => normalizeOtInput(overTimeOtInput));

startDateInput.addEventListener("input", () => autoFormatDateTyping(startDateInput));
endDateInput.addEventListener("input", () => autoFormatDateTyping(endDateInput));
overTimeOtInput.addEventListener("input", () => autoFormatOtTyping(overTimeOtInput));
outwardDutyCommencedInput.addEventListener("input", () => autoFormatJourneyTimeTyping(outwardDutyCommencedInput));
outwardDutyTerminatedInput.addEventListener("input", () => autoFormatJourneyTimeTyping(outwardDutyTerminatedInput));
inwardDutyCommencedInput.addEventListener("input", () => autoFormatJourneyTimeTyping(inwardDutyCommencedInput));
inwardDutyTerminatedInput.addEventListener("input", () => autoFormatJourneyTimeTyping(inwardDutyTerminatedInput));
outwardDurationInput.addEventListener("input", () => autoFormatDurationTyping(outwardDurationInput));
inwardDurationInput.addEventListener("input", () => autoFormatDurationTyping(inwardDurationInput));

outwardDutyCommencedInput.addEventListener("blur", () => normalizeJourneyTimeInput(outwardDutyCommencedInput));
outwardDutyTerminatedInput.addEventListener("blur", () => normalizeJourneyTimeInput(outwardDutyTerminatedInput));
inwardDutyCommencedInput.addEventListener("blur", () => normalizeJourneyTimeInput(inwardDutyCommencedInput));
inwardDutyTerminatedInput.addEventListener("blur", () => normalizeJourneyTimeInput(inwardDutyTerminatedInput));
outwardDurationInput.addEventListener("blur", () => normalizeDurationInput(outwardDurationInput));
inwardDurationInput.addEventListener("blur", () => normalizeDurationInput(inwardDurationInput));

mileageInput.addEventListener("input", () => {
  const value = String(mileageInput.value || "");
  if (value.includes(".")) {
    mileageInput.value = value.split(".")[0];
  }
});

employee1NameInput.addEventListener("input", () => employee1NameInput.setCustomValidity(""));
employee2NameInput.addEventListener("input", () => employee2NameInput.setCustomValidity(""));

homeLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authRequestInProgress = true;
  try {
    const user = await authenticateUser(loginUserIdInput.value, loginPasswordInput.value);
    if (!user) {
      loginStateText.textContent = "Invalid user or password.";
      return;
    }

    activeUser = user;
    persistAuthSession();
    renderAuthState();
    loginPasswordInput.value = "";

    closeLoginDialog();

    if (activeUser.role === "employee") {
      window.location.href = "employee-home.html";
    }
  } finally {
    authRequestInProgress = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await fetch(getAuthApiUrl("/api/auth/logout"), { method: "POST", credentials: "include" });
  activeUser = null;
  persistAuthSession();
  renderAuthState();
  homeLoginForm.reset();
  closeLoginDialog();
  openLoginDialog();
});

loginToggleBtn.addEventListener("click", () => {
  if (!activeUser) {
    openLoginDialog();
    return;
  }

  openLoginDialog();
  if (loginUserIdInput.value.trim()) {
    loginPasswordInput.focus();
  } else {
    loginUserIdInput.focus();
  }
});

renderEmployeeNameOptions();
restoreAuthSession().then(() => {
  if (!activeUser) {
    setLandingMode(true);
    openLoginDialog();
  }
});
