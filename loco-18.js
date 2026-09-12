// loco-18.js
// Official LOCO SHED RWP Loco-18 Sheet Controller

(function () {
  const STORAGE_KEY_DATA = "Loco18CurrentData";
  const STORAGE_KEY_DATE = "Loco18SelectedDate";
  const DEFAULT_ROW_COUNT = 40;

  // DOM Elements
  const locoDatePicker = document.getElementById("locoDatePicker");
  const locoHeaderNativePicker = document.getElementById("locoHeaderNativePicker");
  const locoDatedDisplayText = document.getElementById("locoDatedDisplayText");
  const locoTodayBtn = document.getElementById("locoTodayBtn");
  const locoAddRowBtn = document.getElementById("locoAddRowBtn");
  const locoClearBtn = document.getElementById("locoClearBtn");
  const locoPrintBtn = document.getElementById("locoPrintBtn");
  const locoTableBody = document.getElementById("locoTableBody");
  const locoStatusMsg = document.getElementById("locoStatusMsg");
  const locoRowCount = document.getElementById("locoRowCount");

  // Format YYYY-MM-DD to DD-MM-YYYY (e.g. 15-06-2026)
  function formatDateDisplay(isoStr) {
    if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) {
      return "15-06-2026";
    }
    const [y, m, d] = isoStr.split("-");
    return `${d}-${m}-${y}`;
  }

  // Set active sheet date
  function setSheetDate(isoDateStr) {
    let finalDate = isoDateStr;
    if (!finalDate || !/^\d{4}-\d{2}-\d{2}$/.test(finalDate)) {
      finalDate = "2026-06-15";
    }

    if (locoDatePicker) locoDatePicker.value = finalDate;
    if (locoHeaderNativePicker) locoHeaderNativePicker.value = finalDate;
    const displayDate = formatDateDisplay(finalDate);
    if (locoDatedDisplayText) locoDatedDisplayText.textContent = displayDate;

    // Synchronize document.title for browser tab and default PDF save name
    document.title = `LOCO-18 ${displayDate}`;

    try {
      localStorage.setItem(STORAGE_KEY_DATE, finalDate);
    } catch {}

    if (locoStatusMsg) {
      locoStatusMsg.textContent = `Sheet date set to ${displayDate}.`;
    }
  }

  // Create a single row of 6 columns
  function createRow(cellValues = []) {
    const tr = document.createElement("tr");
    const colClasses = ["col-date", "col-driver", "col-asstt", "col-ot", "col-mileage", "col-operating"];

    for (let i = 0; i < 6; i++) {
      const td = document.createElement("td");
      td.className = colClasses[i];
      td.contentEditable = "true";
      td.spellcheck = false;
      td.textContent = cellValues[i] !== undefined && cellValues[i] !== null ? String(cellValues[i]) : "";

      td.addEventListener("input", onCellInput);
      tr.appendChild(td);
    }

    return tr;
  }

  // Update row counter
  function updateRowCount() {
    if (!locoRowCount || !locoTableBody) return;
    const count = locoTableBody.querySelectorAll("tr").length;
    locoRowCount.textContent = `Rows: ${count}`;
  }

  // Save current grid to localStorage
  function saveCurrentGrid() {
    if (!locoTableBody) return;
    const rows = Array.from(locoTableBody.querySelectorAll("tr")).map((tr) => {
      return Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim());
    });

    try {
      localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(rows));
    } catch (err) {
      console.warn("Loco-18 storage save error:", err);
    }
  }

  let saveDebounceTimer = null;
  function onCellInput() {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      saveCurrentGrid();
      if (locoStatusMsg) {
        locoStatusMsg.textContent = "Changes saved.";
      }
    }, 400);
  }

  // Initialize sheet rows
  function initTableRows() {
    if (!locoTableBody) return;
    locoTableBody.innerHTML = "";

    let savedData = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DATA);
      if (raw) savedData = JSON.parse(raw);
    } catch {}

    if (Array.isArray(savedData) && savedData.length > 0) {
      savedData.forEach((rowVals) => {
        locoTableBody.appendChild(createRow(rowVals));
      });
    } else {
      // Default 40 empty rows matching the blank ledger in image
      for (let i = 0; i < DEFAULT_ROW_COUNT; i++) {
        locoTableBody.appendChild(createRow(["", "", "", "", "", ""]));
      }
    }

    updateRowCount();
  }

  // Event Listeners
  if (locoDatePicker) {
    locoDatePicker.addEventListener("change", () => {
      setSheetDate(locoDatePicker.value);
    });
  }

  if (locoHeaderNativePicker) {
    locoHeaderNativePicker.addEventListener("change", () => {
      setSheetDate(locoHeaderNativePicker.value);
    });
  }

  if (locoTodayBtn) {
    locoTodayBtn.addEventListener("click", () => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      setSheetDate(`${yyyy}-${mm}-${dd}`);
    });
  }

  if (locoAddRowBtn) {
    locoAddRowBtn.addEventListener("click", () => {
      if (!locoTableBody) return;
      locoTableBody.appendChild(createRow(["", "", "", "", "", ""]));
      updateRowCount();
      saveCurrentGrid();
      if (locoStatusMsg) {
        locoStatusMsg.textContent = "New blank row added.";
      }
    });
  }

  if (locoClearBtn) {
    locoClearBtn.addEventListener("click", () => {
      if (!confirm("Are you sure you want to clear all cells in Loco-18 sheet?")) return;
      if (!locoTableBody) return;
      locoTableBody.innerHTML = "";
      for (let i = 0; i < DEFAULT_ROW_COUNT; i++) {
        locoTableBody.appendChild(createRow(["", "", "", "", "", ""]));
      }
      updateRowCount();
      saveCurrentGrid();
      if (locoStatusMsg) {
        locoStatusMsg.textContent = "All table cells reset to empty.";
      }
    });
  }

  // Prepare layout to fit on a single PDF page and set dynamic filename
  function prepareForPrint() {
    const rowCount = locoTableBody ? locoTableBody.querySelectorAll("tr").length : DEFAULT_ROW_COUNT;

    // Available height for table rows on A4 portrait:
    // Total height 297mm - 8mm margins - 3mm container padding - 1.5mm borders - 6.5mm header banner - 5.5mm thead = ~272.5mm
    // Safe target: 266mm leaves plenty of margin
    const availableHeightMm = 266;
    const targetRowHeightMm = Math.max(2.2, Math.min(6.2, availableHeightMm / Math.max(1, rowCount)));

    let fontSizePt = 7.5;
    let thFontSizePt = 7.5;
    let thHeightMm = 5.5;
    let paddingStr = "0.5px 2px";
    let lineHeight = "1.15";

    if (rowCount <= 32) {
      fontSizePt = 8.0;
      thFontSizePt = 8.0;
      thHeightMm = 6.0;
      paddingStr = "1px 3px";
      lineHeight = "1.2";
    } else if (rowCount <= 42) {
      fontSizePt = 7.5;
      thFontSizePt = 7.5;
      thHeightMm = 5.5;
      paddingStr = "0.5px 2px";
      lineHeight = "1.15";
    } else if (rowCount <= 52) {
      fontSizePt = 7.0;
      thFontSizePt = 7.0;
      thHeightMm = 5.0;
      paddingStr = "0.3px 1.5px";
      lineHeight = "1.1";
    } else {
      fontSizePt = 6.2;
      thFontSizePt = 6.5;
      thHeightMm = 4.5;
      paddingStr = "0px 1px";
      lineHeight = "1.05";
    }

    const printArea = document.getElementById("locoPrintArea");
    if (printArea) {
      printArea.style.setProperty("--print-td-height", `${targetRowHeightMm.toFixed(2)}mm`);
      printArea.style.setProperty("--print-td-font", `${fontSizePt}pt`);
      printArea.style.setProperty("--print-th-font", `${thFontSizePt}pt`);
      printArea.style.setProperty("--print-th-height", `${thHeightMm}mm`);
      printArea.style.setProperty("--print-td-pad", paddingStr);
      printArea.style.setProperty("--print-line-height", lineHeight);
    }

    // Set document.title so the browser automatically proposes "LOCO-18 [DATED].pdf"
    const datedText = (locoDatedDisplayText && locoDatedDisplayText.textContent.trim()) || "15-06-2026";
    document.title = `LOCO-18 ${datedText}`;
  }

  if (locoPrintBtn) {
    locoPrintBtn.addEventListener("click", () => {
      prepareForPrint();
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }

  window.addEventListener("beforeprint", () => {
    prepareForPrint();
  });

  const locoLinkBadge = document.getElementById("locoLinkBadge");
  function updateLinkBadge() {
    if (!locoLinkBadge) return;
    const isLinked = localStorage.getItem("Loco18LinkActive") === "true";
    locoLinkBadge.style.display = isLinked ? "inline-flex" : "none";
  }

  // Cross-tab storage listener for real-time synchronization
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY_DATA) {
      initTableRows();
    } else if (e.key === STORAGE_KEY_DATE) {
      setSheetDate(e.newValue);
    } else if (e.key === "Loco18LinkActive") {
      updateLinkBadge();
    }
  });

  // Initial setup
  const savedDate = localStorage.getItem(STORAGE_KEY_DATE) || "2026-06-15";
  setSheetDate(savedDate);
  initTableRows();
  updateLinkBadge();
})();
