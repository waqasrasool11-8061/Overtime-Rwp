// holidays.js — Gazetted Holidays page

const API_BASE_URL = window.location.port === "5500"
  ? `http://${window.location.hostname}:3000`
  : "";
const HOLIDAYS_API = `${API_BASE_URL}/api/holidays`;

const holCalTitle    = document.getElementById("holCalTitle");
const holCalGrid     = document.getElementById("holCalGrid");
const holCalPrev     = document.getElementById("holCalPrev");
const holCalNext     = document.getElementById("holCalNext");
const holSaveBtn     = document.getElementById("holSaveBtn");
const holClearMonth  = document.getElementById("holClearMonthBtn");
const holFilterMonth = document.getElementById("holFilterMonth");
const holFilterApply = document.getElementById("holFilterApply");
const holFilterClear = document.getElementById("holFilterClear");
const holCountLabel  = document.getElementById("holCountLabel");
const tableBody      = document.getElementById("holidaysTableBody");
const statusEl       = document.getElementById("holidaysStatus");

const DAY_NAMES   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

// All holidays in memory: Map<"YYYY-MM-DD", name:string>
let allHolidays = new Map();

// Pending changes: Map<iso, name>  for adds/updates, Set<iso> for removes
let pendingAdds    = new Map();   // iso → name
let pendingRemoves = new Set();

// Calendar state
const today = new Date();
let calYear  = today.getFullYear();
let calMonth = today.getMonth();

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  return res.json();
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#b42318" : "";
}

// ── Load all holidays from server ─────────────────────────────────────────────

async function loadAllHolidays() {
  try {
    const data = await apiFetch(HOLIDAYS_API);
    allHolidays = new Map();
    (Array.isArray(data.holidays) ? data.holidays : []).forEach((h) => {
      const iso  = typeof h === "string" ? h : String(h.date || "");
      const name = typeof h === "object" ? String(h.name || "") : "";
      if (iso) allHolidays.set(iso, name);
    });
    pendingAdds.clear();
    pendingRemoves.clear();
    setStatus(`${allHolidays.size} holidays loaded.`);
  } catch (err) {
    setStatus(`Failed to load holidays: ${err.message}`, true);
  }
}

// ── Name input dialog ─────────────────────────────────────────────────────────
// Shows a small inline popup to enter/edit holiday name

function askHolidayName(existingName = "") {
  return new Promise((resolve) => {
    // Remove any existing popup
    document.getElementById("holNamePopup")?.remove();

    const popup = document.createElement("div");
    popup.id = "holNamePopup";
    popup.style.cssText = [
      "position:fixed;inset:0;z-index:9999",
      "background:rgba(10,25,42,0.45);backdrop-filter:blur(3px)",
      "display:flex;align-items:center;justify-content:center",
    ].join(";");

    popup.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:22px 24px 18px;
                  box-shadow:0 16px 48px rgba(8,24,45,0.28);max-width:360px;width:90vw;
                  font-family:Segoe UI,sans-serif;">
        <p style="margin:0 0 10px;font-size:0.95rem;font-weight:700;color:#0a233b;">
          Holiday Name (optional)
        </p>
        <input id="holNameInput" type="text" placeholder="e.g. Eid ul Fitr, Independence Day…"
          value="${existingName.replace(/"/g, '&quot;')}"
          style="width:100%;border:1px solid #c5d7ea;border-radius:8px;padding:8px 10px;
                 font:inherit;font-size:0.9rem;box-sizing:border-box;margin-bottom:12px;">
        <div style="display:flex;gap:8px;">
          <button id="holNameOk" style="flex:1;padding:8px;border-radius:8px;border:none;
            background:linear-gradient(125deg,#e0631d,#b64207);color:#fff;
            font:700 0.9rem Segoe UI,sans-serif;cursor:pointer;">Add Holiday</button>
          <button id="holNameCancel" style="flex:1;padding:8px;border-radius:8px;
            border:1px solid #c5d7ea;background:#f4f7fa;color:#355a7f;
            font:600 0.9rem Segoe UI,sans-serif;cursor:pointer;">Cancel</button>
        </div>
      </div>`;

    document.body.appendChild(popup);

    const input = popup.querySelector("#holNameInput");
    input.focus();
    input.select();

    function cleanup(result) {
      popup.remove();
      resolve(result);
    }

    popup.querySelector("#holNameOk").addEventListener("click", () => cleanup(input.value.trim()));
    popup.querySelector("#holNameCancel").addEventListener("click", () => cleanup(null));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  cleanup(input.value.trim());
      if (e.key === "Escape") cleanup(null);
    });
    popup.addEventListener("click", (e) => { if (e.target === popup) cleanup(null); });
  });
}

// ── Calendar rendering ────────────────────────────────────────────────────────

function isoDate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function renderCalendar() {
  holCalTitle.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;
  holCalGrid.innerHTML = "";

  DAY_NAMES.forEach((name) => {
    const hdr = document.createElement("div");
    hdr.className = "hcal-day-header";
    hdr.textContent = name;
    holCalGrid.appendChild(hdr);
  });

  const firstDay  = new Date(calYear, calMonth, 1).getDay();
  const daysInM   = new Date(calYear, calMonth + 1, 0).getDate();
  const todayIso  = isoDate(today.getFullYear(), today.getMonth(), today.getDate());

  for (let i = 0; i < firstDay; i += 1) {
    const blank = document.createElement("div");
    blank.className = "hcal-day";
    holCalGrid.appendChild(blank);
  }

  for (let d = 1; d <= daysInM; d += 1) {
    const iso    = isoDate(calYear, calMonth, d);
    const isSun  = new Date(calYear, calMonth, d).getDay() === 0;
    const isSaved   = allHolidays.has(iso);
    const isAdded   = pendingAdds.has(iso);
    const isRemoved = pendingRemoves.has(iso);
    const isHoliday = (isSaved || isAdded) && !isRemoved;

    const cell = document.createElement("div");
    cell.className = "hcal-day";
    cell.textContent = String(d);
    cell.dataset.iso = iso;
    if (isSun)      cell.classList.add("sunday");
    if (isHoliday)  cell.classList.add("is-holiday");
    if (iso === todayIso) cell.classList.add("today");

    // Tooltip: show holiday name if available
    const holName = pendingAdds.get(iso) || allHolidays.get(iso) || "";
    if (holName) cell.title = holName;

    cell.addEventListener("click", () => toggleCalDay(iso, cell));
    holCalGrid.appendChild(cell);
  }
}

async function toggleCalDay(iso, cell) {
  const isSaved   = allHolidays.has(iso);
  const isAdded   = pendingAdds.has(iso);
  const isRemoved = pendingRemoves.has(iso);

  if (isSaved && !isRemoved) {
    // Already saved — removing it
    pendingRemoves.add(iso);
    pendingAdds.delete(iso);
    cell.classList.remove("is-holiday");
    cell.removeAttribute("title");
    return;
  }

  if (isRemoved) {
    // Was marked for removal — restore it
    pendingRemoves.delete(iso);
    cell.classList.add("is-holiday");
    cell.title = allHolidays.get(iso) || "";
    return;
  }

  if (isAdded) {
    // Already pending add — remove it
    pendingAdds.delete(iso);
    cell.classList.remove("is-holiday");
    cell.removeAttribute("title");
    return;
  }

  // New date — ask for name
  const name = await askHolidayName();
  if (name === null) return; // cancelled

  pendingAdds.set(iso, name);
  cell.classList.add("is-holiday");
  if (name) cell.title = name;
}

// ── Save pending changes ──────────────────────────────────────────────────────

async function savePendingChanges() {
  if (!pendingAdds.size && !pendingRemoves.size) {
    setStatus("No pending changes.");
    return;
  }

  try {
    if (pendingAdds.size) {
      const dates = Array.from(pendingAdds.keys());
      const names = Object.fromEntries(pendingAdds);
      await apiFetch(HOLIDAYS_API, {
        method: "POST",
        body: JSON.stringify({ dates, names }),
      });
    }
    if (pendingRemoves.size) {
      await apiFetch(HOLIDAYS_API, {
        method: "DELETE",
        body: JSON.stringify({ dates: Array.from(pendingRemoves) }),
      });
    }
    await loadAllHolidays();
    renderCalendar();
    renderTable(currentFilterMonth());
    setStatus("Holidays saved successfully.");
  } catch (err) {
    setStatus(`Save failed: ${err.message}`, true);
  }
}

// ── Clear all holidays for current month ──────────────────────────────────────

async function clearCurrentMonth() {
  const prefix   = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
  const toDelete = Array.from(allHolidays.keys()).filter((d) => d.startsWith(prefix));
  const pendingD = Array.from(pendingAdds.keys()).filter((d) => d.startsWith(prefix));

  pendingD.forEach((d) => pendingAdds.delete(d));

  if (!toDelete.length && !pendingD.length) {
    setStatus("No holidays in this month to clear.");
    renderCalendar();
    return;
  }

  if (!toDelete.length) {
    renderCalendar();
    renderTable(currentFilterMonth());
    setStatus("Pending holidays for this month cleared.");
    return;
  }

  if (!window.confirm(`Remove all ${toDelete.length} holiday(s) for ${MONTH_NAMES[calMonth]} ${calYear}?`)) return;

  try {
    await apiFetch(HOLIDAYS_API, {
      method: "DELETE",
      body: JSON.stringify({ dates: toDelete }),
    });
    await loadAllHolidays();
    renderCalendar();
    renderTable(currentFilterMonth());
    setStatus(`Cleared holidays for ${MONTH_NAMES[calMonth]} ${calYear}.`);
  } catch (err) {
    setStatus(`Clear failed: ${err.message}`, true);
  }
}

// ── Table rendering ───────────────────────────────────────────────────────────

function currentFilterMonth() {
  return holFilterMonth.value || "";
}

function renderTable(monthFilter = "") {
  let list = Array.from(allHolidays.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  if (monthFilter && /^\d{4}-\d{2}$/.test(monthFilter)) {
    list = list.filter(([iso]) => iso.startsWith(monthFilter));
  }

  holCountLabel.textContent = `${list.length} holiday(s)`;
  tableBody.innerHTML = "";

  if (!list.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "No holidays found.";
    td.style.cssText = "text-align:center;color:#6a8fad;";
    tr.appendChild(td);
    tableBody.appendChild(tr);
    return;
  }

  list.forEach(([iso, holName]) => {
    const dt      = new Date(iso + "T00:00:00");
    const dow     = dt.getDay();
    const isSun   = dow === 0;
    const dayStr  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][dow];
    const typeStr = isSun ? "Sunday + Gazetted" : "Gazetted";
    const typeCls = isSun ? "both" : "gazetted";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${iso}</td>
      <td>${dayStr}</td>
      <td class="hol-day-type ${typeCls}">${typeStr}</td>
      <td style="font-weight:600;color:#183a5c;">${holName || "<em style='color:#aaa;font-weight:400'>—</em>"}</td>
      <td><button class="hol-delete-btn" data-iso="${iso}" type="button">Remove</button></td>
    `;
    tableBody.appendChild(tr);
  });

  tableBody.querySelectorAll(".hol-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteOneHoliday(btn.dataset.iso));
  });
}

async function deleteOneHoliday(iso) {
  const name = allHolidays.get(iso) || iso;
  if (!window.confirm(`Remove holiday: ${name} (${iso})?`)) return;
  try {
    await apiFetch(HOLIDAYS_API, {
      method: "DELETE",
      body: JSON.stringify({ dates: [iso] }),
    });
    await loadAllHolidays();
    renderCalendar();
    renderTable(currentFilterMonth());
    setStatus(`Removed: ${iso}`);
  } catch (err) {
    setStatus(`Remove failed: ${err.message}`, true);
  }
}

// ── Event wiring ──────────────────────────────────────────────────────────────

holCalPrev.addEventListener("click", () => {
  calMonth -= 1;
  if (calMonth < 0) { calMonth = 11; calYear -= 1; }
  pendingAdds.clear();
  pendingRemoves.clear();
  renderCalendar();
});

holCalNext.addEventListener("click", () => {
  calMonth += 1;
  if (calMonth > 11) { calMonth = 0; calYear += 1; }
  pendingAdds.clear();
  pendingRemoves.clear();
  renderCalendar();
});

holSaveBtn.addEventListener("click", savePendingChanges);
holClearMonth.addEventListener("click", clearCurrentMonth);

holFilterApply.addEventListener("click", () => renderTable(currentFilterMonth()));
holFilterClear.addEventListener("click", () => {
  holFilterMonth.value = "";
  renderTable("");
});

// ── HTML: add Holiday Name column header ─────────────────────────────────────
// (update the table header to include Name column)
document.querySelector("#holidaysTable thead tr").innerHTML = `
  <th>Date</th>
  <th>Day</th>
  <th>Type</th>
  <th>Holiday Name</th>
  <th style="width:60px;">Remove</th>
`;

// ── Init ──────────────────────────────────────────────────────────────────────

(async () => {
  await loadAllHolidays();
  renderCalendar();
  renderTable("");
})();
