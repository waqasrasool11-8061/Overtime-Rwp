// pay-revisions.js
// Shared Pay Revision History & Effective-Month-Based Basic Pay & Rates Engine

const PAY_REVISIONS_STORAGE_KEY = "EmployeePayRevisions";
const DESIGNATION_RATES_STORAGE_KEY = "DesignationOperatingRates";

// Standard official Pakistan Railways operating allowance rates by designation
const DEFAULT_DESIGNATION_OPERATING_RATES = {
  DRIVER: {
    key: "DRIVER",
    name: "Driver",
    ml: 200,
    shnt: 0,
    pass: 150,
    gds: 120
  },
  DY_DRIVER: {
    key: "DY_DRIVER",
    name: "Dy Driver",
    ml: 0,
    shnt: 120,
    pass: 0,
    gds: 0
  },
  ASSISTANT_DRIVER: {
    key: "ASSISTANT_DRIVER",
    name: "Assistant Driver",
    ml: 100,
    shnt: 120,
    pass: 75,
    gds: 50
  }
};

function normalizeDesgKey(desg) {
  const d = String(desg || "").trim().toUpperCase();
  if (d.includes("ASSISTANT")) return "ASSISTANT_DRIVER";
  if (d.includes("DY") || d.includes("DEPUTY")) return "DY_DRIVER";
  if (d.includes("DRIVER")) return "DRIVER";
  return d.replace(/[\s\.\-_]+/g, "_");
}

/**
 * Retrieves all designation-wise operating allowance rates
 */
function getAllDesignationOperatingRates() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DESIGNATION_RATES_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        return {
          ...DEFAULT_DESIGNATION_OPERATING_RATES,
          ...parsed
        };
      }
    }
  } catch (err) {
    console.warn("getAllDesignationOperatingRates error:", err);
  }
  return { ...DEFAULT_DESIGNATION_OPERATING_RATES };
}

/**
 * Returns the 4 operating rates for a specific designation { ml, shnt, pass, gds }
 */
function getOperatingRatesForDesignation(designation) {
  const allRates = getAllDesignationOperatingRates();
  const rawDesg = String(designation || "").trim().toUpperCase();

  const normKey = normalizeDesgKey(rawDesg);
  if (allRates[normKey]) return allRates[normKey];

  for (const k of Object.keys(allRates)) {
    if (String(allRates[k].name || "").trim().toUpperCase() === rawDesg) {
      return allRates[k];
    }
  }

  if (rawDesg.includes("ASSISTANT")) {
    return allRates.ASSISTANT_DRIVER || DEFAULT_DESIGNATION_OPERATING_RATES.ASSISTANT_DRIVER;
  }
  if (rawDesg.includes("DY") || rawDesg.includes("DEPUTY")) {
    return allRates.DY_DRIVER || DEFAULT_DESIGNATION_OPERATING_RATES.DY_DRIVER;
  }
  if (rawDesg.includes("DRIVER")) {
    return allRates.DRIVER || DEFAULT_DESIGNATION_OPERATING_RATES.DRIVER;
  }

  return allRates.ASSISTANT_DRIVER || DEFAULT_DESIGNATION_OPERATING_RATES.ASSISTANT_DRIVER;
}

/**
 * Saves designation rates dictionary to localStorage and dispatches event
 */
function saveAllDesignationOperatingRates(ratesDict) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DESIGNATION_RATES_STORAGE_KEY, JSON.stringify(ratesDict, null, 2));
    }
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("designationRatesUpdated", { detail: ratesDict }));
    }
  } catch (err) {
    console.error("saveAllDesignationOperatingRates error:", err);
  }
}

// Column Indices in Employee_Master (0-based)
const REV_C_SAP       = 0;
const REV_C_NAME      = 1;
const REV_C_DESG      = 2;
const REV_C_BASIC     = 3;
const REV_C_CAT       = 4;
const REV_C_OT        = 5;
const REV_C_MAIL      = 6;
const REV_C_PASS      = 7;
const REV_C_SHNT      = 8;
const REV_C_GDS       = 9;
const REV_C_SDGH      = 10;
const REV_C_M_ML      = 11;
const REV_C_OP_AL     = 12;
const REV_C_P_AL      = 13;
const REV_C_G_AL      = 14;
const REV_C_CUSTOM    = 15;
const REV_C_LEAVE_55  = 16;

/**
 * Normalizes string for employee comparison (removes symbols, extra spaces, upper-cases)
 */
function normEmpId(str) {
  return String(str || "").replace(/[\s\.\-_]+/g, " ").trim().toUpperCase();
}

/**
 * Retrieves all stored pay revisions from localStorage
 * Returns object: { [empKey]: [ { effectiveMonth: "YYYY-MM", basicPay: Number, designation?: String, note?: String } ] }
 */
function getAllPayRevisions() {
  try {
    const raw = localStorage.getItem(PAY_REVISIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.warn("getAllPayRevisions error:", err);
    return {};
  }
}

/**
 * Saves the entire revisions dictionary to localStorage
 */
function setAllPayRevisions(dict) {
  try {
    localStorage.setItem(PAY_REVISIONS_STORAGE_KEY, JSON.stringify(dict, null, 2));
    // Dispatch custom event so open tabs/pages can react if needed
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("payRevisionsUpdated", { detail: dict }));
    }
  } catch (err) {
    console.error("setAllPayRevisions error:", err);
  }
}

/**
 * Returns array of revisions for a given employee (matched by SAP ID or Employee Name)
 */
function getPayRevisionsForEmployee(empIdentifier) {
  if (!empIdentifier) return [];
  const target = normEmpId(empIdentifier);
  if (!target) return [];

  const all = getAllPayRevisions();
  // Check exact key match first
  if (Array.isArray(all[target])) return all[target];

  // Check case-insensitive / normalized key match
  for (const k of Object.keys(all)) {
    if (normEmpId(k) === target) {
      return all[k];
    }
  }
  return [];
}

/**
 * Adds or updates a pay revision for an employee
 * @param {string} empIdentifier SAP ID or Employee Name
 * @param {Object} revision { effectiveMonth: "YYYY-MM", basicPay: number, designation?: string, note?: string }
 */
function savePayRevision(empIdentifier, revision) {
  if (!empIdentifier || !revision || !revision.effectiveMonth || !revision.basicPay) {
    return false;
  }

  const key = normEmpId(empIdentifier);
  const all = getAllPayRevisions();
  const list = Array.isArray(all[key]) ? [...all[key]] : [];

  const month = String(revision.effectiveMonth).trim();
  const basicPay = parseFloat(revision.basicPay) || 0;
  const note = String(revision.note || "").trim();
  const designation = revision.designation ? String(revision.designation).trim() : "";

  // Check if entry for this effective month already exists
  const existingIdx = list.findIndex(r => r.effectiveMonth === month);
  const entry = {
    effectiveMonth: month,
    basicPay: basicPay,
    note: note,
    designation: designation,
    updatedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    list[existingIdx] = entry;
  } else {
    list.push(entry);
  }

  // Sort chronologically ascending
  list.sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
  all[key] = list;
  setAllPayRevisions(all);
  return true;
}

/**
 * Deletes a pay revision for an employee by effectiveMonth
 */
function deletePayRevision(empIdentifier, effectiveMonth) {
  if (!empIdentifier || !effectiveMonth) return false;
  const key = normEmpId(empIdentifier);
  const all = getAllPayRevisions();
  if (!Array.isArray(all[key])) return false;

  all[key] = all[key].filter(r => r.effectiveMonth !== effectiveMonth);
  if (all[key].length === 0) {
    delete all[key];
  }
  setAllPayRevisions(all);
  return true;
}

/**
 * Calculates derived rates from basicPay using standard Pakistan Railways formula
 * @param {Array} baseRow The original employee row [SAP, Name, Desg, Basic, Cat, ...]
 * @param {number} basicPay The revised basic pay
 * @param {Object} revisionInfo Metadata about the active revision
 * @returns {Array} A newly constructed employee record with all 17 cells updated
 */
function deriveEmployeeRecordFromBasic(baseRow, basicPay, revisionInfo = null) {
  const row = Array.isArray(baseRow) ? [...baseRow] : new Array(17).fill("");
  const bp = typeof basicPay === "number" ? basicPay : (parseFloat(basicPay) || 0);

  if (bp <= 0) {
    return row;
  }

  const fValue = bp / 30;

  const desg = (revisionInfo && revisionInfo.designation) || row[REV_C_DESG] || (baseRow ? baseRow[REV_C_DESG] : "");
  const opRates = getOperatingRatesForDesignation(desg);

  row[REV_C_BASIC]    = bp;
  row[REV_C_OT]       = fValue;
  row[REV_C_MAIL]     = fValue * 30 / 100;
  row[REV_C_PASS]     = fValue * 25 / 100;
  row[REV_C_SHNT]     = fValue * 20 / 100;
  row[REV_C_GDS]      = fValue * 20 / 100;
  row[REV_C_SDGH]     = bp / 30;
  row[REV_C_M_ML]     = opRates.ml;
  row[REV_C_OP_AL]    = opRates.shnt;
  row[REV_C_P_AL]     = opRates.pass;
  row[REV_C_G_AL]     = opRates.gds;
  row[REV_C_CUSTOM]   = fValue * 55 / 100;
  row[REV_C_LEAVE_55] = fValue * 55 / 100;

  if (revisionInfo && revisionInfo.designation) {
    row[REV_C_DESG] = revisionInfo.designation;
  }

  // Attach non-enumerable or direct property for UI indicator tags
  try {
    row._revisionInfo = revisionInfo;
  } catch {}

  return row;
}

/**
 * Returns the effective employee record for a specific month (YYYY-MM).
 * - Finds the latest revision on or before targetMonthYYYYMM.
 * - If found, recomputes derived rates based on that month's Basic Pay.
 * - If not found, falls back to the baseEmpRecord.
 *
 * @param {Array} baseEmpRecord The base record from Employee_Master
 * @param {string} targetMonthYYYYMM Target month e.g. "2026-05" or "2026-07"
 * @returns {Array} The effective employee record with all correct rates
 */
function getEffectivePayRecord(baseEmpRecord, targetMonthYYYYMM) {
  if (!Array.isArray(baseEmpRecord)) return baseEmpRecord;

  // Format targetMonth to YYYY-MM
  let target = String(targetMonthYYYYMM || "").trim();
  const mMatch = target.match(/^(\d{4})[-/](\d{1,2})/);
  if (mMatch) {
    target = `${mMatch[1]}-${String(mMatch[2]).padStart(2, "0")}`;
  }

  const sap = baseEmpRecord[REV_C_SAP] ? String(baseEmpRecord[REV_C_SAP]).trim() : "";
  const name = baseEmpRecord[REV_C_NAME] ? String(baseEmpRecord[REV_C_NAME]).trim() : "";

  // Lookup revisions by SAP first, then Name
  let revisions = sap ? getPayRevisionsForEmployee(sap) : [];
  if (!revisions.length && name) {
    revisions = getPayRevisionsForEmployee(name);
  }

  if (!revisions.length || !target) {
    return baseEmpRecord;
  }

  // Filter revisions that took effect ON OR BEFORE the target month
  const applicable = revisions.filter(r => r.effectiveMonth <= target);
  if (!applicable.length) {
    // If target month is earlier than the earliest recorded revision,
    // use the earliest historical revision (e.g. 2025-07 baseline)
    // rather than falling back to baseEmpRecord which may contain a newer future pay!
    revisions.sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
    const earliestRev = revisions[0];
    return deriveEmployeeRecordFromBasic(baseEmpRecord, earliestRev.basicPay, {
      effectiveMonth: earliestRev.effectiveMonth,
      note: earliestRev.note,
      designation: earliestRev.designation,
      isRevised: true
    });
  }

  // Pick the latest applicable revision
  applicable.sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
  const activeRev = applicable[applicable.length - 1];

  return deriveEmployeeRecordFromBasic(baseEmpRecord, activeRev.basicPay, {
    effectiveMonth: activeRev.effectiveMonth,
    note: activeRev.note,
    designation: activeRev.designation,
    isRevised: true
  });
}

/**
 * Returns API base URL depending on environment (e.g. Live Server port 5500 vs port 3000)
 */
function getPayRevisionApiBaseUrl() {
  if (typeof window !== "undefined" && window.location) {
    if (window.location.port === "5500") {
      return `http://${window.location.hostname}:3000`;
    }
  }
  return "";
}

/**
 * Fetches all pay revisions from the SQLite backend and caches them into localStorage
 */
async function syncPayRevisionsFromBackend() {
  try {
    const baseUrl = getPayRevisionApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/employee-master/pay-revisions`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.revisions && typeof data.revisions === "object") {
      setAllPayRevisions(data.revisions);
      return data.revisions;
    }
  } catch (err) {
    console.warn("syncPayRevisionsFromBackend warning:", err.message);
  }
  return null;
}

/**
 * Saves employee revision to SQLite backend API and updates local cache
 */
async function savePayRevisionToBackend(empKey, revision) {
  const baseUrl = getPayRevisionApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/employee-master/employee`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({
      sap: revision.sap || "",
      name: revision.name || empKey,
      designation: revision.designation || "",
      category: revision.category || "RUNNING STAFF",
      effectiveMonth: revision.effectiveMonth,
      basicPay: revision.basicPay,
      note: revision.note || "",
      isNew: Boolean(revision.isNew),
    }),
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => ({}));
    throw new Error(errPayload.message || `HTTP ${res.status}`);
  }

  const result = await res.json();
  // Update local cache
  savePayRevision(empKey, revision);
  return result;
}

/**
 * Deletes revision from SQLite backend API and updates local cache
 */
async function deletePayRevisionFromBackend(empKey, effectiveMonth) {
  const baseUrl = getPayRevisionApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/employee-master/pay-revision`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({ empKey, effectiveMonth }),
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => ({}));
    throw new Error(errPayload.message || `HTTP ${res.status}`);
  }

  const result = await res.json();
  deletePayRevision(empKey, effectiveMonth);
  return result;
}

/**
 * Syncs designation rates from SQLite backend API
 */
async function syncDesignationRatesFromBackend() {
  try {
    const baseUrl = getPayRevisionApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/employee-master/operating-rates`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && typeof data.rates === "object" && Object.keys(data.rates).length > 0) {
        saveAllDesignationOperatingRates(data.rates);
        return data.rates;
      }
    }
  } catch (err) {
    console.warn("syncDesignationRatesFromBackend warning:", err.message);
  }
  return null;
}

/**
 * Saves designation rates to backend API and updates local storage
 */
async function saveDesignationRatesToBackend(rates) {
  const baseUrl = getPayRevisionApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/employee-master/operating-rates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({ rates }),
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => ({}));
    throw new Error(errPayload.message || `HTTP ${res.status}`);
  }

  saveAllDesignationOperatingRates(rates);
  return await res.json();
}

// Auto-sync in browser background on script load
if (typeof window !== "undefined" && typeof fetch === "function") {
  syncPayRevisionsFromBackend().catch(() => {});
  syncDesignationRatesFromBackend().catch(() => {});
}

// Export for Node.js test environment if required
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getAllPayRevisions,
    getPayRevisionsForEmployee,
    savePayRevision,
    deletePayRevision,
    deriveEmployeeRecordFromBasic,
    getEffectivePayRecord,
    syncPayRevisionsFromBackend,
    savePayRevisionToBackend,
    deletePayRevisionFromBackend,
    getAllDesignationOperatingRates,
    getOperatingRatesForDesignation,
    saveAllDesignationOperatingRates,
    syncDesignationRatesFromBackend,
    saveDesignationRatesToBackend,
    DEFAULT_DESIGNATION_OPERATING_RATES,
    DESIGNATION_RATES_STORAGE_KEY,
    PAY_REVISIONS_STORAGE_KEY
  };
}

