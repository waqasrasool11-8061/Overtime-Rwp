const homeAuthSessionKey = "HomeAuthSession";
const API_BASE_URL = window.location.port === "5500"
  ? `http://${window.location.hostname}:3000`
  : "";
const HOME_RAW_DATA_API_BASE_URL = API_BASE_URL;
const AUTH_API_BASE_URL = API_BASE_URL;
const HOME_RAW_DATA_API_PATHS = {
  dataRows: "/api/raw-data/data-rows",
};

const form = document.getElementById("mileageForm");
const linkLocoBtn = document.getElementById("linkLoco18Btn") || document.getElementById("downloadLoco18");
const downloadBtn = linkLocoBtn;
const clearFormBtn = document.getElementById("clearForm");
const formStatusNotice = document.getElementById("formStatusNotice");
const startDateInput = form.querySelector("input[name='startDate']");
const endDateInput = form.querySelector("input[name='endDate']");
const employee1NameInput = form.querySelector("input[name='employee1Name']");
const employee2NameInput = form.querySelector("input[name='employee2Name']");
const employee1Dropdown = document.getElementById("employee1Dropdown");
const employee2Dropdown = document.getElementById("employee2Dropdown");
const submitBtn = document.getElementById("submitBtn") || form.querySelector("button[type='submit']");
let canSubmitForm = false;
const overTimeOtInput = form.querySelector("input[name='overTimeOt']");
const mileageInput = form.querySelector("input[name='mileageKm']");
const dutyTypeSelect = form.querySelector("select[name='dutyType']");
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
  if (user?.role === "admin" || user?.role === "guest") {
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.hidden = false;
    });
    return;
  }
  if (Array.isArray(user?.allowedPages) && user.allowedPages.length > 0 && !user.allowedPages.includes("*")) {
    const allowed = user.allowedPages.map((p) => String(p).toLowerCase());
    document.querySelectorAll(".nav-link").forEach((link) => {
      const page = String(link.getAttribute("href") || "").split("#")[0].toLowerCase();
      link.hidden = !allowed.includes(page);
    });
    return;
  }
  if (user?.role === "restricted-admin") {
    const restrictedAllowed = [
      "index.html",
      "genl-164.html",
      "loco-18.html",
      "raw-data.html",
      "raw-data-search.html",
      "video.html",
    ];
    document.querySelectorAll(".nav-link").forEach((link) => {
      const page = String(link.getAttribute("href") || "").split("#")[0].toLowerCase();
      link.hidden = !restrictedAllowed.includes(page);
    });
    return;
  }
  if (user?.role === "employee") {
    const employeeAllowed = ["employee-home.html", "video.html"];
    document.querySelectorAll(".nav-link").forEach((link) => {
      const page = String(link.getAttribute("href") || "").split("#")[0].toLowerCase();
      link.hidden = !employeeAllowed.includes(page);
    });
    return;
  }
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
    "user-management.html": "userManagement",
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
  updateLocoLinkButtonUI();
  if (!activeUser) {
    loginStateText.textContent = "Not signed in.";
    loginToggleBtn.textContent = "Login";
    if (logoutBtn) logoutBtn.hidden = true;
    setHomeAccessByRole(null);
    setLandingMode(true);
    return;
  }

  const roleText = activeUser.role === "admin"
    ? "Admin (Full Access)"
    : activeUser.role === "restricted-admin"
      ? "Restricted Admin"
      : activeUser.role === "sub-admin"
        ? "Sub Admin (Clerk)"
        : "Employee";
  loginStateText.textContent = `Signed in: ${activeUser.userId} | ${roleText}`;
  loginToggleBtn.textContent = activeUser.userId;
  if (logoutBtn) logoutBtn.hidden = false;
  applyNavigationPermissions(activeUser);
  setLandingMode(false);
  setHomeAccessByRole(activeUser);
}

function persistAuthSession() {
  if (!activeUser) {
    localStorage.removeItem(homeAuthSessionKey);
    return;
  }

  localStorage.setItem(
    homeAuthSessionKey,
    JSON.stringify({
      userId: activeUser.userId,
      sapId: activeUser.sapId || "",
      role: activeUser.role,
      permissions: activeUser.permissions || [],
    })
  );
}

async function restoreAuthSession() {
  try {
    const response = await fetch(getAuthApiUrl("/api/auth/session"), { credentials: "include" });
    if (authRequestInProgress) return;
    if (!response.ok) throw new Error("Not authenticated");
    const payload = await response.json();
    activeUser = payload.user;
    persistAuthSession();
    if (activeUser.role === "employee") {
      window.location.replace("employee-home.html");
      return;
    }
    renderAuthState();
  } catch {
    if (authRequestInProgress) return;
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

  const monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  // 8 digits: ddmmyyyy or yyyymmdd
  if (/^\d{8}$/.test(raw)) {
    // Try ddmmyyyy first (e.g. 10082026)
    const dd = Number(raw.slice(0, 2));
    const mm = Number(raw.slice(2, 4));
    const yyyy = Number(raw.slice(4, 8));
    const parsed = new Date(yyyy, mm - 1, dd);
    if (parsed.getFullYear() === yyyy && parsed.getMonth() === mm - 1 && parsed.getDate() === dd) {
      return parsed;
    }

    // Try yyyymmdd (e.g. 20260810)
    const yyyy2 = Number(raw.slice(0, 4));
    const mm2 = Number(raw.slice(4, 6));
    const dd2 = Number(raw.slice(6, 8));
    if (yyyy2 >= 1900 && yyyy2 <= 2100) {
      const parsed2 = new Date(yyyy2, mm2 - 1, dd2);
      if (parsed2.getFullYear() === yyyy2 && parsed2.getMonth() === mm2 - 1 && parsed2.getDate() === dd2) {
        return parsed2;
      }
    }
  }

  // 6 digits: ddmmyy
  if (/^\d{6}$/.test(raw)) {
    const dd = Number(raw.slice(0, 2));
    const mm = Number(raw.slice(2, 4));
    let yyyy = Number(raw.slice(4, 6));
    if (yyyy < 100) yyyy += 2000;
    const parsed = new Date(yyyy, mm - 1, dd);
    if (parsed.getFullYear() === yyyy && parsed.getMonth() === mm - 1 && parsed.getDate() === dd) {
      return parsed;
    }
  }

  // ISO: yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Text month: e.g. 10-Aug-2026, 10-Aug-26, 10 Aug 2026, 10-August-2026, 10.Aug.2026
  const textMonthMatch = raw.match(/^(\d{1,2})[-/\s.]([A-Za-z]{3,9})[-/\s.](\d{2,4})$/);
  if (textMonthMatch) {
    const dd = Number(textMonthMatch[1]);
    const monKey = textMonthMatch[2].slice(0, 3).toLowerCase();
    const mon = monthMap[monKey];
    let yyyy = Number(textMonthMatch[3]);
    if (yyyy < 100) yyyy += 2000;
    if (Number.isFinite(dd) && mon !== undefined) {
      const parsed = new Date(yyyy, mon, dd);
      if (parsed.getFullYear() === yyyy && parsed.getMonth() === mon && parsed.getDate() === dd) {
        return parsed;
      }
    }
  }

  // Numeric: e.g. 10-08-2026, 10/08/26, 10.08.2026, 10.08.26
  const numericMatch = raw.match(/^(\d{1,2})[-/\s.](\d{1,2})[-/\s.](\d{2,4})$/);
  if (numericMatch) {
    const dd = Number(numericMatch[1]);
    const mm = Number(numericMatch[2]);
    let yyyy = Number(numericMatch[3]);
    if (yyyy < 100) yyyy += 2000;
    const parsed = new Date(yyyy, mm - 1, dd);
    if (parsed.getFullYear() === yyyy && parsed.getMonth() === mm - 1 && parsed.getDate() === dd) {
      return parsed;
    }
  }

  return null;
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

function showFormNotice(text, isError = false) {
  if (!formStatusNotice) return;
  formStatusNotice.textContent = text;
  formStatusNotice.style.display = text ? "block" : "none";
  formStatusNotice.style.color = isError ? "#b42318" : "#027a48";
  formStatusNotice.style.backgroundColor = isError ? "#fef3f2" : "#ecfdf3";
  formStatusNotice.style.border = `1px solid ${isError ? "#fda29b" : "#6ce9a6"}`;
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
  if (employeeNameOptions) {
    employeeNameOptions.innerHTML = "";
    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      employeeNameOptions.appendChild(option);
    });
  }
}

function setupEmployeeAutocomplete(inputElement, dropdownElement) {
  if (!inputElement || !dropdownElement) return;

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
    const allNames = collectEmployeeNames();
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

  inputElement.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (dropdownElement.hidden) {
        openDropdown();
        if (currentItems.length) {
          setHighlight(0);
        }
      } else {
        setHighlight(selectedIndex + 1);
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (dropdownElement.hidden) {
        openDropdown();
        if (currentItems.length) {
          setHighlight(currentItems.length - 1);
        }
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
    if (!inputElement.contains(event.target) && !dropdownElement.contains(event.target)) {
      closeDropdown();
    }
  });
}

async function loadEmployeeMasterDataForForm() {
  try {
    const res = await fetch("/api/employee-master/workbook", {
      headers: { Accept: "application/json" },
      credentials: "include"
    });
    if (res.ok) {
      window.employeeMasterWorkbookData = await res.json();
      renderEmployeeNameOptions();
    }
  } catch {
    // fallback to local data
  }
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

  // OT and mileage are saved only on the first base row.
  rows[0][4] = entry.overTimeOt ? toHhMm(entry.overTimeOt) : "";
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

  if (remarksParts.length === 1) {
    // If a single remark is given for multi-row or single-row, apply to all rows
    rows.forEach((row) => {
      row[12] = remarksParts[0];
    });
  } else if (remarksParts.length > 1) {
    // If multiple comma-separated remarks are given, assign each to its row
    remarksParts.forEach((part, index) => {
      if (index < rows.length) {
        rows[index][12] = part;
      }
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

  if (!canSubmitForm) {
    event.stopImmediatePropagation();
    return;
  }
  canSubmitForm = false;

  if (!activeUser) {
    loginStateText.textContent = "Please sign in first.";
    openLoginDialog();
    return;
  }

  if (activeUser?.role === "guest") {
    showFormNotice("Guest Mode: Adding or submitting data is disabled. You have view-only access to explore the layout.", true);
    return;
  }

  // Mandatory fields restriction: Start date, End date, Employee 1 name & Dutytype must be filled
  if (!startDateInput.value.trim()) {
    startDateInput.setCustomValidity("Please enter Start Date.");
    startDateInput.reportValidity();
    return;
  }
  startDateInput.setCustomValidity("");

  if (!endDateInput.value.trim()) {
    endDateInput.setCustomValidity("Please enter End Date.");
    endDateInput.reportValidity();
    return;
  }
  endDateInput.setCustomValidity("");

  if (!employee1NameInput.value.trim()) {
    employee1NameInput.setCustomValidity("Please enter Employee 1 Name.");
    employee1NameInput.reportValidity();
    return;
  }
  employee1NameInput.setCustomValidity("");

  if (!dutyTypeSelect.value.trim()) {
    dutyTypeSelect.setCustomValidity("Please select DutyType.");
    dutyTypeSelect.reportValidity();
    return;
  }
  dutyTypeSelect.setCustomValidity("");

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
  if (!parsedStartDate) {
    startDateInput.setCustomValidity("Please enter a valid Start Date (dd-mmm-yyyy).");
    startDateInput.reportValidity();
    return;
  }
  if (!parsedEndDate) {
    endDateInput.setCustomValidity("Please enter a valid End Date (dd-mmm-yyyy).");
    endDateInput.reportValidity();
    return;
  }
  if (parsedEndDate < parsedStartDate) {
    endDateInput.setCustomValidity("End Date cannot be before Start Date.");
    endDateInput.reportValidity();
    return;
  }
  startDateInput.setCustomValidity("");
  endDateInput.setCustomValidity("");

  if (!Number.isInteger(mileageNumber)) {
    mileageInput.setCustomValidity("Mileage must be a whole number");
    form.reportValidity();
    return;
  }

  mileageInput.setCustomValidity("");

  const formData = new FormData(form);

  const employee1Name = String(formData.get("employee1Name") || "").trim().toUpperCase();
  const employee2Name = String(formData.get("employee2Name") || "").trim().toUpperCase();
  const dutyType = String(formData.get("dutyType") || "").trim().toUpperCase();

  if (!employee1Name) {
    employee1NameInput.setCustomValidity("Please enter Employee 1 Name.");
    employee1NameInput.reportValidity();
    return;
  }

  if (!dutyType) {
    dutyTypeSelect.setCustomValidity("Please select DutyType.");
    dutyTypeSelect.reportValidity();
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
    outwardDuty: String(formData.get("outwardDuty") || "").trim().toUpperCase(),
    outwardDutyCommenced: normalizedOutwardCommenced,
    outwardDuration: normalizedOutwardDuration,
    outwardDutyTerminated: normalizedOutwardTerminated,
    inwardDuty: String(formData.get("inwardDuty") || "").trim().toUpperCase(),
    inwardDutyCommenced: normalizedInwardCommenced,
    inwardDuration: normalizedInwardDuration,
    inwardDutyTerminated: normalizedInwardTerminated,
    remarks: String(formData.get("remarks") || "").trim().toUpperCase(),
  };

  try {
    const rows = buildRawDataRowsFromEntry(entry);
    const result = await appendRawDataRows(rows);

    let locoNote = "";
    if (localStorage.getItem("Loco18LinkActive") === "true") {
      const locoResult = syncEntryToLoco18(entry, parsedStartDate, parsedEndDate);
      if (locoResult && locoResult.placedRows > 0) {
        locoNote = ` & placed in Loco-18 (${locoResult.placedRows} row${locoResult.placedRows === 1 ? "" : "s"})`;
      }
    }

    const successMsg = `Entries saved successfully (${result.savedRowCount} row${result.savedRowCount === 1 ? "" : "s"}${locoNote}).`;
    loginStateText.textContent = successMsg;
    showFormNotice(successMsg, false);
    clearFormBtn.click();
    setTimeout(() => {
      startDateInput.focus();
    }, 0);
  } catch (error) {
    loginStateText.textContent = error.message;
    showFormNotice(error.message, true);
  }
});

function syncEntryToLoco18(entry, parsedStartDate, parsedEndDate) {
  try {
    const isPendingFirstDate = localStorage.getItem("Loco18LinkPendingFirstDate") === "true";
    if (isPendingFirstDate && parsedStartDate) {
      const yyyy = parsedStartDate.getFullYear();
      const mm = String(parsedStartDate.getMonth() + 1).padStart(2, "0");
      const dd = String(parsedStartDate.getDate()).padStart(2, "0");
      const isoDate = `${yyyy}-${mm}-${dd}`;
      localStorage.setItem("Loco18SelectedDate", isoDate);
      localStorage.setItem("Loco18LinkPendingFirstDate", "false");
    }

    const startOnly = new Date(parsedStartDate.getFullYear(), parsedStartDate.getMonth(), parsedStartDate.getDate());
    const endOnly = new Date(parsedEndDate.getFullYear(), parsedEndDate.getMonth(), parsedEndDate.getDate());
    const baseRowCount = Math.floor((endOnly.getTime() - startOnly.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    let locoGrid = [];
    try {
      const raw = localStorage.getItem("Loco18CurrentData");
      if (raw) locoGrid = JSON.parse(raw);
    } catch {}

    if (!Array.isArray(locoGrid) || locoGrid.length === 0) {
      locoGrid = Array.from({ length: 40 }, () => ["", "", "", "", "", ""]);
    }

    const rowsToPlace = [];
    for (let i = 0; i < baseRowCount; i++) {
      const curDate = new Date(startOnly.getFullYear(), startOnly.getMonth(), startOnly.getDate() + i);
      const rowDateStr = formatDateDdMmmYyyy(curDate);
      const otVal = i === 0 ? (entry.overTimeOt ? toHhMm(entry.overTimeOt) : "") : "";
      const mileageVal = i === 0 ? (entry.mileageKm === 0 ? "0" : (entry.mileageKm ? String(entry.mileageKm) : "")) : "";

      rowsToPlace.push([
        rowDateStr,
        entry.employee1Name || "",
        entry.employee2Name || "",
        otVal,
        mileageVal,
        entry.dutyType || "",
      ]);
    }

    rowsToPlace.forEach((newRow) => {
      const emptyIdx = locoGrid.findIndex(
        (r) => Array.isArray(r) && r.every((c) => !c || String(c).trim() === "")
      );
      if (emptyIdx !== -1) {
        locoGrid[emptyIdx] = newRow;
      } else {
        locoGrid.push(newRow);
      }
    });

    localStorage.setItem("Loco18CurrentData", JSON.stringify(locoGrid));
    return { placedRows: rowsToPlace.length };
  } catch (err) {
    console.error("Loco-18 sync error:", err);
    return null;
  }
}

function updateLocoLinkButtonUI() {
  if (!linkLocoBtn) return;
  const isActive = localStorage.getItem("Loco18LinkActive") === "true";
  linkLocoBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
  linkLocoBtn.classList.toggle("is-active", isActive);
  if (isActive) {
    linkLocoBtn.innerHTML = `&#128279; Link with Loco-18 <span class="badge-linked">Linked</span>`;
    linkLocoBtn.title = "Loco-18 is Linked (Active). Entries will automatically be placed into Loco-18 sheet. Click to unlink.";
  } else {
    linkLocoBtn.innerHTML = `Link with Loco-18`;
    linkLocoBtn.title = "Click to link entries with Loco-18 sheet (persistent pressed mode)";
  }
}

clearFormBtn.addEventListener("click", () => {
  form.reset();
  showFormNotice("");
  startDateInput.setCustomValidity("");
  endDateInput.setCustomValidity("");
  employee1NameInput.setCustomValidity("");
  employee2NameInput.setCustomValidity("");
  dutyTypeSelect.setCustomValidity("");
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
  setTimeout(() => {
    startDateInput.focus();
  }, 0);
});

if (linkLocoBtn) {
  linkLocoBtn.addEventListener("click", () => {
    if (!activeUser || (activeUser.role !== "admin" && activeUser.role !== "restricted-admin")) {
      loginStateText.textContent = "Only admin users can toggle Loco-18 linking.";
      return;
    }

    const currentActive = localStorage.getItem("Loco18LinkActive") === "true";
    const nextActive = !currentActive;
    localStorage.setItem("Loco18LinkActive", nextActive ? "true" : "false");

    if (nextActive) {
      localStorage.setItem("Loco18LinkPendingFirstDate", "true");
      loginStateText.textContent = "Loco-18 link activated. Entries will be placed into Loco-18 sheet.";
    } else {
      loginStateText.textContent = "Loco-18 link deactivated.";
    }

    updateLocoLinkButtonUI();
  });
}

startDateInput.addEventListener("blur", () => {
  normalizeDateInput(startDateInput);
  if (startDateInput.value.trim() && !endDateInput.value.trim()) {
    endDateInput.value = startDateInput.value;
  }
});
endDateInput.addEventListener("blur", () => {
  normalizeDateInput(endDateInput);
});
overTimeOtInput.addEventListener("blur", () => normalizeOtInput(overTimeOtInput));

startDateInput.addEventListener("input", () => {
  startDateInput.setCustomValidity("");
  endDateInput.setCustomValidity("");
});
endDateInput.addEventListener("input", () => {
  endDateInput.setCustomValidity("");
  startDateInput.setCustomValidity("");
});

// Enforce submit restriction: Only Shift + Enter or mouse click can submit form
form.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    if (event.shiftKey) {
      event.preventDefault();
      canSubmitForm = true;
      form.requestSubmit();
    } else {
      if (event.target.tagName !== "TEXTAREA") {
        event.preventDefault();
      }
    }
  }
});

if (submitBtn) {
  submitBtn.addEventListener("pointerdown", () => {
    canSubmitForm = true;
  });
  submitBtn.addEventListener("click", (event) => {
    if (event.detail > 0) {
      canSubmitForm = true;
    }
  });
  submitBtn.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
    }
    if (event.key === " ") {
      event.preventDefault();
    }
  });
}
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
dutyTypeSelect.addEventListener("change", () => dutyTypeSelect.setCustomValidity(""));
dutyTypeSelect.addEventListener("input", () => dutyTypeSelect.setCustomValidity(""));

// Automatically convert all text typing in data entry form to capital letters
form.addEventListener("input", (event) => {
  const el = event.target;
  if (!el) return;
  const tag = el.tagName;
  const type = (el.type || "").toLowerCase();
  if (
    (tag === "INPUT" && type !== "number" && type !== "password" && type !== "hidden" && type !== "submit" && type !== "button" && type !== "checkbox" && type !== "radio") ||
    tag === "TEXTAREA"
  ) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const orig = el.value;
    const upper = orig.toUpperCase();
    if (orig !== upper) {
      el.value = upper;
      if (start !== null && end !== null) {
        try {
          el.setSelectionRange(start, end);
        } catch {
          // ignore if not supported
        }
      }
    }
  }
});

homeLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authRequestInProgress = true;
  try {
    const user = await authenticateUser(loginUserIdInput.value, loginPasswordInput.value);
    if (!user) {
      loginStateText.textContent = "Invalid user or password.";
      loginStateText.style.color = "#ef4444";
      return;
    }

    activeUser = user;
    persistAuthSession();
    renderAuthState();

    const enableBioCheckbox = document.getElementById("enableBiometricCheckbox");
    if (enableBioCheckbox && enableBioCheckbox.checked) {
      loginStateText.textContent = "👆 Fingerprint register kar rahe hain... (Touch sensor)";
      loginStateText.style.color = "#38bdf8";
      await registerBiometricDirect(user);
    }

    loginPasswordInput.value = "";
    closeLoginDialog();

    if (activeUser.role === "employee") {
      document.documentElement.style.display = "none";
      window.location.replace("employee-home.html");
      return;
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

const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener("click", () => {
    loginStateText.innerHTML = "🔑 <b>Password Bhool Gaye?</b><br>Employees ka default password unka <b>SAP ID</b> hai.<br>Agar aap password bhool gaye hain, to <b>Admin Vicky Ch</b> se reset karwayen.";
    loginStateText.style.color = "#f3b33f";
  });
}

renderEmployeeNameOptions();
setupEmployeeAutocomplete(employee1NameInput, employee1Dropdown);
setupEmployeeAutocomplete(employee2NameInput, employee2Dropdown);
loadEmployeeMasterDataForForm();
updateLocoLinkButtonUI();
// Instant cache check to avoid UI flash while network fetch completes
try {
  const cachedRaw = localStorage.getItem(homeAuthSessionKey);
  if (cachedRaw) {
    const cached = JSON.parse(cachedRaw);
    if (cached?.role === "employee") {
      window.location.replace("employee-home.html");
    } else if (cached?.role) {
      applyNavigationPermissions(cached);
    }
  } else {
    setLandingMode(true);
    openLoginDialog();
  }
} catch {}

// ── Biometric (WebAuthn / Fingerprint) Login ────────────────────────────────
function base64urlToBuffer(base64url) {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function registerBiometricDirect(user) {
  if (!window.PublicKeyCredential) return false;
  try {
    const optRes = await fetch(getAuthApiUrl("/api/auth/biometric/register-options"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!optRes.ok) return false;
    const options = await optRes.json();

    const pubKeyOptions = {
      challenge: base64urlToBuffer(options.challenge),
      rp: options.rp,
      user: {
        id: base64urlToBuffer(options.user.id),
        name: options.user.name,
        displayName: options.user.displayName,
      },
      pubKeyCredParams: options.pubKeyCredParams,
      authenticatorSelection: options.authenticatorSelection,
      timeout: options.timeout || 60000,
      attestation: options.attestation || "none",
    };

    const credential = await navigator.credentials.create({ publicKey: pubKeyOptions });
    if (!credential) return false;

    const credentialId = credential.id;
    const clientDataJSON = bufferToBase64url(credential.response.clientDataJSON);
    const attestationObject = bufferToBase64url(credential.response.attestationObject);

    const deviceName = navigator.userAgent.includes("Android")
      ? "Android Phone"
      : navigator.userAgent.includes("iPhone")
      ? "iPhone / iPad"
      : navigator.userAgent.includes("Mac")
      ? "Mac Touch ID"
      : "Windows Hello / PC";

    const verifyRes = await fetch(getAuthApiUrl("/api/auth/biometric/register-verify"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credentialId,
        response: { clientDataJSON, attestationObject },
        deviceName,
      }),
    });

    if (verifyRes.ok) {
      localStorage.setItem("hasRegisteredBiometric", "true");
      localStorage.setItem("biometricUser", user.userId);
      return true;
    }
  } catch (err) {
    console.warn("Biometric register skipped/cancelled:", err.message);
  }
  return false;
}

async function handleBiometricLogin() {
  const btn = document.getElementById("biometricLoginBtn");
  if (btn) btn.disabled = true;

  // Friendly check: If not registered on this device yet, guide user clearly
  if (!localStorage.getItem("hasRegisteredBiometric")) {
    loginStateText.innerHTML = "💡 <b>Pehle Fingerprint Register Karein:</b><br>Upar User ID aur Password likhein aur <b>'Register Fingerprint'</b> dabayein ya <b>[✓] Enable Fingerprint</b> tick kar ke Sign In karein.";
    loginStateText.style.color = "#f59e0b";
    if (btn) btn.disabled = false;
    return;
  }

  loginStateText.textContent = "Biometric sensor verify ho raha hai... (Touch sensor)";
  loginStateText.style.color = "#38bdf8";

  try {
    const optRes = await fetch(getAuthApiUrl("/api/auth/biometric/login-options"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!optRes.ok) throw new Error("Biometric challenge load nahi ho saka.");
    const options = await optRes.json();

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: base64urlToBuffer(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout || 60000,
        userVerification: options.userVerification || "preferred",
      },
    });

    if (!credential) {
      throw new Error("Biometric sensor verification cancel ho gai.");
    }

    const credentialId = credential.id;
    const clientDataJSON = bufferToBase64url(credential.response.clientDataJSON);
    const authenticatorData = bufferToBase64url(credential.response.authenticatorData);
    const signature = bufferToBase64url(credential.response.signature);

    const verifyRes = await fetch(getAuthApiUrl("/api/auth/biometric/login-verify"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: options.challengeId,
        credentialId,
        clientDataJSON,
        authenticatorData,
        signature,
      }),
    });

    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) {
      throw new Error(verifyData.message || "Biometric login failed.");
    }

    activeUser = verifyData.user;
    persistAuthSession();
    renderAuthState();
    closeLoginDialog();

    if (activeUser.role === "employee") {
      document.documentElement.style.display = "none";
      window.location.replace("employee-home.html");
      return;
    }
  } catch (err) {
    if (err.name === "NotAllowedError" || err.message?.includes("passkey") || err.message?.includes("credentials")) {
      loginStateText.innerHTML = "💡 <b>Is device par abhi fingerprint save nahi hai:</b><br>Upar User ID aur Password likhein aur <b>'Register Fingerprint'</b> dabayein.";
      loginStateText.style.color = "#f59e0b";
    } else {
      loginStateText.textContent = err.message || "Biometric verification failed.";
      loginStateText.style.color = "#ef4444";
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function initBiometricLoginUI() {
  const wrapper = document.getElementById("biometricLoginWrapper");
  const btn = document.getElementById("biometricLoginBtn");
  const checkboxLabel = document.getElementById("enableBiometricCheckboxLabel");
  const directRegBtn = document.getElementById("btnDirectRegisterBio");
  const checkbox = document.getElementById("enableBiometricCheckbox");
  if (!wrapper || !btn) return;

  if (window.PublicKeyCredential && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (available) {
        wrapper.style.display = "block";
        if (checkboxLabel) checkboxLabel.style.display = "flex";
        if (directRegBtn) directRegBtn.style.display = "inline-block";

        if (checkbox && !localStorage.getItem("hasRegisteredBiometric")) {
          checkbox.checked = true; // Auto-tick for seamless 1st-time registration
        }
      }
    } catch {}
  }

  btn.addEventListener("click", handleBiometricLogin);

  if (directRegBtn) {
    directRegBtn.addEventListener("click", async () => {
      const uId = loginUserIdInput.value.trim();
      const pwd = loginPasswordInput.value.trim();
      if (!uId || !pwd) {
        loginStateText.textContent = "Pehle apna User ID aur Password likhein.";
        loginStateText.style.color = "#f59e0b";
        return;
      }

      loginStateText.textContent = "Checking credentials...";
      loginStateText.style.color = "#38bdf8";

      const user = await authenticateUser(uId, pwd);
      if (!user) {
        loginStateText.textContent = "Invalid user or password.";
        loginStateText.style.color = "#ef4444";
        return;
      }

      activeUser = user;
      persistAuthSession();
      renderAuthState();

      loginStateText.textContent = "👆 Apna fingerprint sensor touch karein...";
      loginStateText.style.color = "#38bdf8";

      const ok = await registerBiometricDirect(user);
      if (ok) {
        loginStateText.textContent = "✓ Fingerprint save ho geya! Logging in...";
        loginStateText.style.color = "#10b981";
        setTimeout(() => {
          loginPasswordInput.value = "";
          closeLoginDialog();
          if (activeUser.role === "employee") {
            document.documentElement.style.display = "none";
            window.location.replace("employee-home.html");
          }
        }, 700);
      } else {
        loginStateText.textContent = "Fingerprint registration cancel ya skip ho gai.";
        loginStateText.style.color = "#f59e0b";
        setTimeout(() => {
          loginPasswordInput.value = "";
          closeLoginDialog();
          if (activeUser.role === "employee") {
            document.documentElement.style.display = "none";
            window.location.replace("employee-home.html");
          }
        }, 800);
      }
    });
  }
}

initBiometricLoginUI();

restoreAuthSession().then(() => {
  if (!activeUser) {
    setLandingMode(true);
    openLoginDialog();
  }
});
