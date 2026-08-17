// amount-summary.js
// PDF-exact layout — 2 employees side-by-side, 5 pairs (10 employees total)
// 13 columns per pair: [lbl|sub|cnt|rate|amt|run] sep [lbl|sub|cnt|rate|amt|run]

const amtBody      = document.getElementById("amtBody");
const amtsStatus   = document.getElementById("amtsStatus");
const amtsLoadBtn  = document.getElementById("amtsLoadBtn");
const amtsPrintBtn = document.getElementById("amtsPrintBtn");

// ── localStorage keys (must match op-72.js) ─────────────────────────────────
const OP72_CELLS_KEY  = "OP72EditableCells";
const OP72_GROUP_KEY  = "OP72SelectedGroup";
const OP72_MONTH_KEY  = "OP72SelectedMonth";
const GROUP_MASTER_KEY = "GroupMasterData";
const EMP_MASTER_KEY   = "EmployeeMasterData";

// summaryRows — exact same order as op-72.js
const SUMMARY_ROWS = [
  "OT (hh:mm)",        // 0
  "Total OT",          // 1
  "Mileage (M)",       // 2
  "Mileage (P)",       // 3
  "Mileage (OP/G)",    // 4
  "Sunday",            // 5
  "Gazetted",          // 6
  "Operating (Mail)",  // 7
  "Operating (Shunt)", // 8
  "Operating (Pass)",  // 9
  "Operating (Gds)",   // 10
];
const EMP_COUNT = 10;

// Employee_Master column indices (0-based)
const C_SAP   = 0;
const C_NAME  = 1;
const C_DESG  = 2;
const C_BASIC = 3;
const C_OT    = 5;
const C_MAIL  = 6;
const C_PASS  = 7;
const C_SHNT  = 8;
const C_GDS   = 9;
const C_SDGH  = 10;
const C_M_ML  = 11;
const C_OP_AL = 12;
const C_P_AL  = 13;
const C_G_AL  = 14;

// Fixed fallback rates
const R_ML   = 100;
const R_SHNT = 120;
const R_PASS = 75;
const R_GDS  = 50;

// ── Helpers ──────────────────────────────────────────────────────────────────
function n(v)        { const x = parseFloat(String(v || "").trim()); return isFinite(x) ? x : 0; }
function fmt(v, d=2) { return isFinite(v) ? Number(v).toFixed(d)  : "0.00"; }
function fmtI(v)     { return isFinite(Number(v)) ? Math.round(Number(v)).toString() : "0"; }
function fmtComma(v) {
  const r = Math.round(Number(v) || 0);
  return r.toLocaleString("en-IN");
}

function setStatus(msg, err = false) {
  amtsStatus.textContent = msg;
  amtsStatus.style.color = err ? "#b42318" : "";
}

// ── Read OP-72 summary matrix from localStorage ──────────────────────────────
// Layout in cells[]:
//   [0..9]   = 10 summary-head employee name cells
//   For summaryRow R (0-based), employee E (0-based):
//     label cell  = 10 + R*20 + E       (indices 10..19 for R=0, etc.)
//     value cell  = 10 + R*20 + 10 + E  = 20 + R*20 + E
function extractSummaryMatrix(cells) {
  if (!Array.isArray(cells) || cells.length < 10 + SUMMARY_ROWS.length * 20) return null;
  return SUMMARY_ROWS.map((_, R) =>
    Array.from({ length: EMP_COUNT }, (_, E) => String(cells[20 + R * 20 + E] || "0"))
  );
}

function getSummaryVal(matrix, label, empIdx0) {
  const R = SUMMARY_ROWS.indexOf(label);
  if (R < 0 || !matrix[R]) return "0";
  return matrix[R][empIdx0] || "0";
}

// ── Get group employees ───────────────────────────────────────────────────────
function getGroupEmployees() {
  const gName = (localStorage.getItem(OP72_GROUP_KEY) || "").trim();
  if (!gName) return Array(EMP_COUNT).fill("");
  let rows = [];
  try {
    const s = JSON.parse(localStorage.getItem(GROUP_MASTER_KEY) || "[]");
    if (Array.isArray(s)) rows = s;
  } catch {}
  if (!rows.length && window.groupMasterWorkbookData) {
    const h = Number(window.groupMasterWorkbookData.headerRows || 1);
    rows = (window.groupMasterWorkbookData.rows || []).slice(h);
  }
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    if (String(row[0] || "").trim().toLowerCase() === gName.toLowerCase())
      return Array.from({ length: EMP_COUNT }, (_, i) => String(row[i + 1] || "").trim());
  }
  return Array(EMP_COUNT).fill("");
}

// ── Get Employee Master rows ──────────────────────────────────────────────────
function getEmpMasterRows() {
  try {
    const s = JSON.parse(localStorage.getItem(EMP_MASTER_KEY) || "[]");
    if (Array.isArray(s) && s.length) return s;
  } catch {}
  if (window.employeeMasterWorkbookData) {
    const rows = window.employeeMasterWorkbookData.rows || [];
    return rows.slice(Number(window.employeeMasterWorkbookData.headerRows || 4));
  }
  return [];
}

function findEmp(masterRows, name) {
  if (!name) return null;
  const t = name.trim().toUpperCase();
  for (const r of masterRows)
    if (Array.isArray(r) && String(r[C_NAME] || "").trim().toUpperCase() === t) return r;
  return null;
}

// ── Get month label ───────────────────────────────────────────────────────────
function getMonthLabel() {
  const s = (localStorage.getItem(OP72_MONTH_KEY) || "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-");
    return new Date(+y, +m - 1, 1)
      .toLocaleString("en-US", { month: "long", year: "numeric" })
      .toUpperCase();
  }
  return "";
}

// ── Calculate per-employee amounts ────────────────────────────────────────────
function calcEmp(matrix, empIdx0, masterRows, empName) {
  const g   = (l) => n(getSummaryVal(matrix, l, empIdx0));
  const emp = findEmp(masterRows, empName);

  const otHhMm  = getSummaryVal(matrix, "OT (hh:mm)", empIdx0);
  const totalOt = g("Total OT");
  const mileM   = g("Mileage (M)");
  const mileP   = g("Mileage (P)");
  const mileOPG = g("Mileage (OP/G)");
  const sunday  = g("Sunday");
  const gazettd = g("Gazetted");
  const mailCnt = g("Operating (Mail)");
  const shntCnt = g("Operating (Shunt)");
  const passCnt = g("Operating (Pass)");
  const gdsCnt  = g("Operating (Gds)");

  const basicPay = emp ? n(emp[C_BASIC]) : 0;
  const sapId    = emp ? String(emp[C_SAP]  || "") : "";
  const otDay    = emp ? n(emp[C_OT])  : (basicPay / 30);
  const mailR    = emp ? n(emp[C_MAIL]) : 0;
  const passR    = emp ? n(emp[C_PASS]) : 0;
  const shntR    = emp ? n(emp[C_SHNT]) : 0;
  const gdsR     = emp ? n(emp[C_GDS])  : 0;
  const sdGhR    = emp ? n(emp[C_SDGH]) : otDay;
  const mMileR   = emp ? n(emp[C_M_ML]) : 100;
  const opAllow  = emp ? n(emp[C_OP_AL]): 0;
  const pAllow   = emp ? n(emp[C_P_AL]) : 0;
  const gAllow   = emp ? n(emp[C_G_AL]) : 0;

  // OT Amount
  const otAmt    = totalOt * otDay;

  // Mileage amounts: miles × rate / 100
  const mileMa   = mileM   * mMileR / 100;
  const milePa   = mileP   * (passR  > 0 ? passR  : R_PASS) / 100;
  const mileOPGa = mileOPG * (gdsR   > 0 ? gdsR   : R_GDS)  / 100;
  const mileTotal = mileMa + milePa + mileOPGa;

  // SD+GH
  const sdGhCnt  = sunday + gazettd;
  const sdGhAmt  = sdGhCnt * sdGhR;

  // ML (not in summaryRows — placeholder 0)
  const mlCnt    = 0;
  const mlAmt    = mlCnt * R_ML;

  // Operating allowances
  const mailAmt  = mailCnt * (mailR  > 0 ? mailR   : 0);
  const shntAmt  = shntCnt * (opAllow > 0 ? opAllow : R_SHNT);
  const passAmt  = passCnt * (pAllow  > 0 ? pAllow  : R_PASS);
  const gdsAmt   = gdsCnt  * (gAllow  > 0 ? gAllow  : R_GDS);

  // 55% custom row (placeholder — data not in summaryRows)
  const cust55Cnt = 0;
  const cust55Rat = emp ? n(emp[C_P_AL] || 0) : 0;
  const cust55Amt = cust55Cnt * cust55Rat;

  // Running total = everything except mileage
  const runningTotal = otAmt + sdGhAmt + mlAmt + mailAmt + shntAmt + passAmt + gdsAmt;
  // Grand total = running + mileage + custom
  const grandTotal   = runningTotal + mileTotal + cust55Amt;

  return {
    name: empName, sapId, basicPay, otHhMm,
    totalOt, otDay, otAmt,
    mileM,   mMileR,  mileMa,
    mileP,   passR,   milePa,
    mileOPG, gdsR,    mileOPGa, mileTotal,
    sdGhCnt, sdGhR,   sdGhAmt,
    mlCnt,   mlAmt,
    mailCnt, mailR,   mailAmt,
    shntCnt, opAllow, shntAmt,
    passCnt, pAllow,  passAmt,
    gdsCnt,  gAllow,  gdsAmt,
    cust55Cnt, cust55Rat, cust55Amt,
    runningTotal, grandTotal,
  };
}

// ── Cell factory ─────────────────────────────────────────────────────────────
function mkTd(text, cls, colSpan, rowSpan) {
  const td = document.createElement("td");
  td.textContent = text;
  if (cls)     td.className = cls;
  if (colSpan && colSpan > 1) td.colSpan = colSpan;
  if (rowSpan && rowSpan > 1) td.rowSpan = rowSpan;
  return td;
}

// Running-total cell — vertical text inside a span
function mkRunTd(text, rowSpan) {
  const td = document.createElement("td");
  td.className = "amt-running";
  if (rowSpan && rowSpan > 1) td.rowSpan = rowSpan;
  const inner = document.createElement("span");
  inner.className = "run-inner";
  inner.textContent = text;
  td.appendChild(inner);
  return td;
}

function addRow(parent, cls, cells) {
  const tr = document.createElement("tr");
  if (cls) tr.className = cls;
  cells.forEach(td => tr.appendChild(td));
  parent.appendChild(tr);
}

// ── Separator cell (shared between pairs) ────────────────────────────────────
function sepTd() { return mkTd("", "amt-sep"); }

// ── Build the full table ──────────────────────────────────────────────────────
function buildTable(emps, monthLabel, groupName) {
  amtBody.innerHTML = "";

  // Title row — spans all 13 columns
  const titleTr = document.createElement("tr");
  titleTr.className = "amt-title-row";
  const titleTd = document.createElement("td");
  titleTd.colSpan = 13;
  titleTd.textContent =
    `MILEAGE SUMMARY OF RWP SHED — ${groupName} — ${monthLabel}`;
  titleTr.appendChild(titleTd);
  amtBody.appendChild(titleTr);

  // 5 employee pairs
  for (let g = 0; g < 5; g++) {
    buildEmployeePair(amtBody, emps[g * 2], emps[g * 2 + 1]);

    // Spacer between pairs (not after last)
    if (g < 4) {
      const spacer = document.createElement("tr");
      spacer.className = "amt-spacer";
      const st = document.createElement("td");
      st.colSpan = 13;
      spacer.appendChild(st);
      amtBody.appendChild(spacer);
    }
  }

  // Footer row
  const footTr = document.createElement("tr");
  footTr.className = "amt-footer";
  const f1 = document.createElement("td"); f1.colSpan = 6;  f1.textContent = "BILL CLERK / VERIFIED BY";
  const f2 = document.createElement("td"); f2.colSpan = 7;  f2.textContent = "AME/RWP — COUNTER SIGN BY";
  footTr.appendChild(f1); footTr.appendChild(f2);
  amtBody.appendChild(footTr);
}

// ── Build one employee pair (12 rows × 13 cols) ───────────────────────────────
//
// Column map (13 cols, 0-indexed):
//   0  = Label         (left emp)
//   1  = Sub-label     (left emp)   — "M"/"P"/"OP/G" for mileage rows, else ""
//   2  = Count         (left emp)
//   3  = Rate RED      (left emp)
//   4  = Amount        (left emp)
//   5  = Running Total (left emp)   — rowSpan=10 in row-2 (OT row), skipped rows 3-11
//   6  = Separator
//   7  = Label         (right emp)
//   8  = Sub-label     (right emp)
//   9  = Count         (right emp)
//  10  = Rate RED      (right emp)
//  11  = Amount        (right emp)
//  12  = Running Total (right emp)  — rowSpan=10 in row-2, skipped rows 3-11
//
// Row 1  (header):  name | SAP lbl | SAP val | BASIC lbl | BASIC val | [run — skipped] | sep | … (same right)
//   → running-total col NOT used in row 1 (it's part of the row-2 rowspan that starts at row 2)
//   → so row 1 has 11 cells (cols 0-4 left, no col5; col6 sep; cols 7-11 right, no col12)
//   → BUT col5 and col12 are wide enough to be visible as part of the employee block —
//     we handle this by giving the empname cell colSpan=1 extra or letting col5/12 be blank.
//   → Simplest: row 1 uses the name cell with colSpan covering 0..4 (5 cols), sep, same right.
//     col 5 and 12 start with the rowSpan=10 running-total in row 2.
//
// Row 2  (OT):      "OT" | "" | count | rate | amt | RunTotal(rowspan=10) | sep | … right
// Rows 3-11        normal 6 cells left (no col5) | sep | 6 right (no col12)
// Row 12 (55%):    "55%"yellow | "" | count | rate | amt | mileTotal(green) | sep | …
//
// NOTE: Row 1 must also span col5/col12 so the block border is solid.
//   We give empname colSpan=5 covering 0-4, then let SAP/BASIC cells NOT extend into col5,
//   instead we add an empty cell in col5 for row1. Same for col12 on right.
//
function buildEmployeePair(tbody, e1, e2) {
  const tb = document.createElement("tbody");
  tb.className = "amt-emp-block";
  tbody.appendChild(tb);

  // ── Row 1: Employee header ────────────────────────────────────────────────
  // Cols: [empname(span2)] [sap-lbl] [sap-val] [bp-lbl] [bp-val] [empty-col5] | sep |
  //        [empname(span2)] [sap-lbl] [sap-val] [bp-lbl] [bp-val] [empty-col12]
  addRow(tb, "amt-emp-row", [
    mkTd(e1.name,              "amt-empname",   2),   // cols 0-1
    mkTd("SAP ID",             "amt-meta-lbl",  1),   // col 2
    mkTd(e1.sapId,             "amt-meta-val",  1),   // col 3
    mkTd("BASIC PAY",          "amt-meta-lbl",  1),   // col 4
    mkTd(fmtComma(e1.basicPay),"amt-meta-val",  1),   // col 5 (running-total col row1 placeholder)
    sepTd(),                                          // col 6
    mkTd(e2.name,              "amt-empname",   2),   // cols 7-8
    mkTd("SAP ID",             "amt-meta-lbl",  1),   // col 9
    mkTd(e2.sapId,             "amt-meta-val",  1),   // col 10
    mkTd("BASIC PAY",          "amt-meta-lbl",  1),   // col 11
    mkTd(fmtComma(e2.basicPay),"amt-meta-val",  1),   // col 12
  ]);

  // ── Row 2: OT — Running Total starts here with rowSpan=10 ────────────────
  // Cols: [lbl(span2)] [count] [rate-RED] [amt] [RunTotal rowspan=10] | sep |
  //        [lbl(span2)] [count] [rate-RED] [amt] [RunTotal rowspan=10]
  addRow(tb, "", [
    mkTd("OT",                 "amt-lbl",       2),   // cols 0-1
    mkTd(fmt(e1.totalOt),      "amt-cnt",       1),   // col 2
    mkTd(fmtI(e1.otDay),       "amt-rate-red",  1),   // col 3
    mkTd(fmtI(e1.otAmt),       "amt-amt",       1),   // col 4
    mkRunTd(`Rs= ${fmtComma(e1.runningTotal)}`, 10),  // col 5 (rowSpan=10, rows 2-11)
    sepTd(),                                          // col 6
    mkTd("OT",                 "amt-lbl",       2),   // cols 7-8
    mkTd(fmt(e2.totalOt),      "amt-cnt",       1),   // col 9
    mkTd(fmtI(e2.otDay),       "amt-rate-red",  1),   // col 10
    mkTd(fmtI(e2.otAmt),       "amt-amt",       1),   // col 11
    mkRunTd(`Rs= ${fmtComma(e2.runningTotal)}`, 10),  // col 12 (rowSpan=10)
  ]);

  // ── Rows 3-11: col5 & col12 are CONSUMED by rowspan — DO NOT add them ─────

  // ── Row 3: MILEAGE M ──────────────────────────────────────────────────────
  addRow(tb, "", [
    mkTd("MILEAGE",            "amt-lbl-blue",  1),   // col 0
    mkTd("M",                  "amt-sublbl",    1),   // col 1
    mkTd(fmtI(e1.mileM),       "amt-cnt",       1),   // col 2
    mkTd(fmtI(e1.mMileR),      "amt-rate-red",  1),   // col 3
    mkTd(fmtI(e1.mileMa),      "amt-amt",       1),   // col 4
    // col 5 skipped (rowspan)
    sepTd(),                                          // col 6
    mkTd("MILEAGE",            "amt-lbl-blue",  1),   // col 7
    mkTd("M",                  "amt-sublbl",    1),   // col 8
    mkTd(fmtI(e2.mileM),       "amt-cnt",       1),   // col 9
    mkTd(fmtI(e2.mMileR),      "amt-rate-red",  1),   // col 10
    mkTd(fmtI(e2.mileMa),      "amt-amt",       1),   // col 11
    // col 12 skipped (rowspan)
  ]);

  // ── Row 4: MILEAGE P ──────────────────────────────────────────────────────
  addRow(tb, "", [
    mkTd("",                   "amt-lbl-blue",  1),
    mkTd("P",                  "amt-sublbl",    1),
    mkTd(fmtI(e1.mileP),       "amt-cnt",       1),
    mkTd(fmtI(e1.passR > 0 ? e1.passR : R_PASS), "amt-rate-red", 1),
    mkTd(fmtI(e1.milePa),      "amt-amt",       1),
    sepTd(),
    mkTd("",                   "amt-lbl-blue",  1),
    mkTd("P",                  "amt-sublbl",    1),
    mkTd(fmtI(e2.mileP),       "amt-cnt",       1),
    mkTd(fmtI(e2.passR > 0 ? e2.passR : R_PASS), "amt-rate-red", 1),
    mkTd(fmtI(e2.milePa),      "amt-amt",       1),
  ]);

  // ── Row 5: MILEAGE OP/G ───────────────────────────────────────────────────
  addRow(tb, "", [
    mkTd("",                   "amt-lbl-blue",  1),
    mkTd("OP/G",               "amt-sublbl",    1),
    mkTd(fmtI(e1.mileOPG),     "amt-cnt",       1),
    mkTd(fmtI(e1.gdsR > 0 ? e1.gdsR : R_GDS),  "amt-rate-red", 1),
    mkTd(fmtI(e1.mileOPGa),    "amt-amt",       1),
    sepTd(),
    mkTd("",                   "amt-lbl-blue",  1),
    mkTd("OP/G",               "amt-sublbl",    1),
    mkTd(fmtI(e2.mileOPG),     "amt-cnt",       1),
    mkTd(fmtI(e2.gdsR > 0 ? e2.gdsR : R_GDS),  "amt-rate-red", 1),
    mkTd(fmtI(e2.mileOPGa),    "amt-amt",       1),
  ]);

  // ── Row 6: SD +GH ─────────────────────────────────────────────────────────
  addRow(tb, "", [
    mkTd("SD +GH",             "amt-lbl",       2),
    mkTd(fmtI(e1.sdGhCnt),     "amt-cnt",       1),
    mkTd(fmt(e1.sdGhR),        "amt-rate-red",  1),
    mkTd(fmtI(e1.sdGhAmt),     "amt-amt",       1),
    sepTd(),
    mkTd("SD +GH",             "amt-lbl",       2),
    mkTd(fmtI(e2.sdGhCnt),     "amt-cnt",       1),
    mkTd(fmt(e2.sdGhR),        "amt-rate-red",  1),
    mkTd(fmtI(e2.sdGhAmt),     "amt-amt",       1),
  ]);

  // ── Row 7: ML ─────────────────────────────────────────────────────────────
  addRow(tb, "", [
    mkTd("ML",                 "amt-lbl",       2),
    mkTd(fmtI(e1.mlCnt),       "amt-cnt",       1),
    mkTd(String(R_ML),         "amt-rate-red",  1),
    mkTd(fmtI(e1.mlAmt),       "amt-amt",       1),
    sepTd(),
    mkTd("ML",                 "amt-lbl",       2),
    mkTd(fmtI(e2.mlCnt),       "amt-cnt",       1),
    mkTd(String(R_ML),         "amt-rate-red",  1),
    mkTd(fmtI(e2.mlAmt),       "amt-amt",       1),
  ]);

  // ── Row 8: SHNT/OP ────────────────────────────────────────────────────────
  addRow(tb, "", [
    mkTd("SHNT/OP",            "amt-lbl",       2),
    mkTd(fmtI(e1.shntCnt),     "amt-cnt",       1),
    mkTd(fmtI(e1.opAllow > 0 ? e1.opAllow : R_SHNT), "amt-rate-red", 1),
    mkTd(fmtI(e1.shntAmt),     "amt-amt",       1),
    sepTd(),
    mkTd("SHNT/OP",            "amt-lbl",       2),
    mkTd(fmtI(e2.shntCnt),     "amt-cnt",       1),
    mkTd(fmtI(e2.opAllow > 0 ? e2.opAllow : R_SHNT), "amt-rate-red", 1),
    mkTd(fmtI(e2.shntAmt),     "amt-amt",       1),
  ]);

  // ── Row 9: PASSNGER ───────────────────────────────────────────────────────
  addRow(tb, "", [
    mkTd("PASSNGER",           "amt-lbl",       2),
    mkTd(fmtI(e1.passCnt),     "amt-cnt",       1),
    mkTd(fmtI(e1.pAllow > 0 ? e1.pAllow : R_PASS), "amt-rate-red", 1),
    mkTd(fmtI(e1.passAmt),     "amt-amt",       1),
    sepTd(),
    mkTd("PASSNGER",           "amt-lbl",       2),
    mkTd(fmtI(e2.passCnt),     "amt-cnt",       1),
    mkTd(fmtI(e2.pAllow > 0 ? e2.pAllow : R_PASS), "amt-rate-red", 1),
    mkTd(fmtI(e2.passAmt),     "amt-amt",       1),
  ]);

  // ── Row 10: GDS ───────────────────────────────────────────────────────────
  addRow(tb, "", [
    mkTd("GDS",                "amt-lbl",       2),
    mkTd(fmtI(e1.gdsCnt),      "amt-cnt",       1),
    mkTd(fmtI(e1.gAllow > 0 ? e1.gAllow : R_GDS), "amt-rate-red", 1),
    mkTd(fmtI(e1.gdsAmt),      "amt-amt",       1),
    sepTd(),
    mkTd("GDS",                "amt-lbl",       2),
    mkTd(fmtI(e2.gdsCnt),      "amt-cnt",       1),
    mkTd(fmtI(e2.gAllow > 0 ? e2.gAllow : R_GDS), "amt-rate-red", 1),
    mkTd(fmtI(e2.gdsAmt),      "amt-amt",       1),
  ]);

  // ── Row 11: Custom / blank row — last of the rowSpan=10 ───────────────────
  // col5/col12 still consumed by rowspan here (this is the 10th row from OT, 0-indexed: rows 2..11)
  addRow(tb, "", [
    mkTd("",                   "amt-lbl",       2),
    mkTd(fmtI(e1.cust55Cnt),   "amt-cnt",       1),
    mkTd(fmtI(e1.cust55Rat),   "amt-rate-red",  1),
    mkTd(fmtI(e1.cust55Amt),   "amt-amt",       1),
    // col 5 still consumed by rowspan
    sepTd(),
    mkTd("",                   "amt-lbl",       2),
    mkTd(fmtI(e2.cust55Cnt),   "amt-cnt",       1),
    mkTd(fmtI(e2.cust55Rat),   "amt-rate-red",  1),
    mkTd(fmtI(e2.cust55Amt),   "amt-amt",       1),
    // col 12 still consumed by rowspan
  ]);

  // ── Row 12: 55% row — rowSpan ends, col5 & col12 FREE again ──────────────
  // col 5 = "MILEAGE" label (light yellow); col 12 = mileage Rs= total (green)
  addRow(tb, "amt-row-55", [
    mkTd("55%",                "amt-lbl-55",    2),   // cols 0-1
    mkTd(fmtI(e1.cust55Cnt),   "amt-cnt",       1),   // col 2
    mkTd(fmtI(e1.cust55Rat),   "amt-rate-red",  1),   // col 3
    mkTd(fmtI(e1.cust55Amt),   "amt-amt",       1),   // col 4
    mkTd(`Rs= ${fmtComma(e1.mileTotal)}`, "amt-grand", 1),  // col 5 — mileage total green
    sepTd(),                                          // col 6
    mkTd("55%",                "amt-lbl-55",    2),   // cols 7-8
    mkTd(fmtI(e2.cust55Cnt),   "amt-cnt",       1),   // col 9
    mkTd(fmtI(e2.cust55Rat),   "amt-rate-red",  1),   // col 10
    mkTd(fmtI(e2.cust55Amt),   "amt-amt",       1),   // col 11
    mkTd(`Rs= ${fmtComma(e2.mileTotal)}`, "amt-grand", 1),  // col 12 — mileage total green
  ]);
}

// ── Load button ──────────────────────────────────────────────────────────────
amtsLoadBtn.addEventListener("click", () => {
  const groupName = (localStorage.getItem(OP72_GROUP_KEY) || "").trim();
  if (!groupName) {
    setStatus("OP-72 pe group select karein aur Load All Employees chalayein.", true);
    return;
  }

  const rawCells = localStorage.getItem(OP72_CELLS_KEY);
  if (!rawCells) {
    setStatus("OP-72 page se pehle Load All Employees run karein.", true);
    return;
  }

  let cells;
  try { cells = JSON.parse(rawCells); }
  catch { setStatus("Data corrupt. OP-72 reload karein.", true); return; }

  const matrix = extractSummaryMatrix(cells);
  if (!matrix) {
    setStatus("Summary data nahi mila. OP-72 pe Load All Employees chalayein.", true);
    return;
  }

  const employees  = getGroupEmployees();
  const masterRows = getEmpMasterRows();
  const monthLabel = getMonthLabel();

  const empData = employees.map((name, i) => calcEmp(matrix, i, masterRows, name));
  buildTable(empData, monthLabel, groupName);

  setStatus(
    `${groupName} — ${monthLabel} — ${employees.filter(Boolean).length} employees loaded.`
  );
});

amtsPrintBtn.addEventListener("click", () => {
  if (!amtBody.children.length) { setStatus("Pehle Load karein.", true); return; }
  window.print();
});

// ── Auto-load on page open ────────────────────────────────────────────────────
(function () {
  if (localStorage.getItem(OP72_GROUP_KEY) && localStorage.getItem(OP72_CELLS_KEY))
    amtsLoadBtn.click();
})();
