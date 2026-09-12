const { getEmployeeDb } = require("../backend/employeeDb");
const {
  getEmployeeMasterWorkbook,
  getAllPayRevisions,
  saveEmployeeAndRevision,
  deletePayRevision,
} = require("../backend/employeeRepository");
const { getEffectivePayRecord } = require("../pay-revisions");

(async () => {
  try {
    const db = await getEmployeeDb();

    console.log("=== STEP 1: Check Current SQLite Revisions ===");
    const allRevs = await getAllPayRevisions(db);
    console.log("Total employees in revisions:", Object.keys(allRevs).length);

    const awaisRev = allRevs["59234"];
    console.log("M Awais (59234) revisions:", awaisRev);
    const waqasRev = allRevs["60448"];
    console.log("Waqas Rasool (60448) revisions:", waqasRev);

    // Verify both are 2025-07
    if (!awaisRev || awaisRev[0].effectiveMonth !== "2025-07" || awaisRev[0].basicPay !== 47680) {
      throw new Error(`Awais revision expected 2025-07 47680, got ${JSON.stringify(awaisRev)}`);
    }
    if (!waqasRev || waqasRev[0].effectiveMonth !== "2025-07" || waqasRev[0].basicPay !== 37090) {
      throw new Error(`Waqas revision expected 2025-07 37090, got ${JSON.stringify(waqasRev)}`);
    }
    console.log("PASS: M Awais and Waqas Rasool have July-2025 old basic recorded.");

    console.log("\n=== STEP 2: Mock baseEmpRecord and test calculation before July-2026 ===");
    // Suppose master sheet has been updated with a new basic pay of 55,000 for M Awais
    const mockBaseRowAwais = ["59234", "M AWAIS", "Driver", 55000, "Driver", 0, 0, 0, 0, 0, 0, 100, 120, 75, 50, 0, 0];

    // Mock global storage for pay-revisions engine
    global.localStorage = {
      getItem: (k) => {
        if (k === "EmployeePayRevisions") return JSON.stringify(allRevs);
        return null;
      },
    };

    // Test June 2026 (2026-06)
    const juneRec = getEffectivePayRecord(mockBaseRowAwais, "2026-06");
    console.log("Calculation for June 2026 (2026-06): Basic Pay =", juneRec[3], "OT Rate =", juneRec[5]);
    if (juneRec[3] !== 47680) {
      throw new Error(`Expected June 2026 to use old basic 47680, but got ${juneRec[3]}`);
    }
    console.log("PASS: June-2026 correctly used old basic (47,680)!");

    console.log("\n=== STEP 3: Add new revision w.e.f July-2026 in SQLite ===");
    const updatedSave = await saveEmployeeAndRevision(db, {
      sap: "59234",
      name: "M AWAIS",
      designation: "Driver",
      category: "Driver",
      effectiveMonth: "2026-07",
      basicPay: 55000,
      note: "Pay Revision (July-2026 Budget)",
      isNew: false,
    });
    console.log("Saved July-2026 revision for M Awais (Basic 55,000).");

    const refreshedRevs = await getAllPayRevisions(db);
    global.localStorage = {
      getItem: (k) => {
        if (k === "EmployeePayRevisions") return JSON.stringify(refreshedRevs);
        return null;
      },
    };

    console.log("M Awais revisions now:", refreshedRevs["59234"]);

    // Test June 2026 again
    const juneRecAfter = getEffectivePayRecord(mockBaseRowAwais, "2026-06");
    console.log("June 2026 calculation:", juneRecAfter[3], "(Expected: 47680)");
    if (juneRecAfter[3] !== 47680) {
      throw new Error(`June 2026 failed, got ${juneRecAfter[3]}`);
    }

    // Test July 2026
    const julyRec = getEffectivePayRecord(mockBaseRowAwais, "2026-07");
    console.log("July 2026 calculation:", julyRec[3], "(Expected: 55000)");
    if (julyRec[3] !== 55000) {
      throw new Error(`July 2026 failed, got ${julyRec[3]}`);
    }

    // Test August 2026
    const augRec = getEffectivePayRecord(mockBaseRowAwais, "2026-08");
    console.log("August 2026 calculation:", augRec[3], "(Expected: 55000)");
    if (augRec[3] !== 55000) {
      throw new Error(`August 2026 failed, got ${augRec[3]}`);
    }

    console.log("\n=== STEP 4: Revert test July-2026 revision for M Awais ===");
    await deletePayRevision(db, "59234", "2026-07");

    // Also revert M Awais basic back to 47680 in employee_master_rows
    const { calculateEmployeeRates } = require("../backend/employeeRepository");
    const restoredRow = ["59234", "M AWAIS", "Driver", 47680, "Driver", 0, 0, 0, 0, 0, 0, 100, 120, 75, 50, 0, 0];
    const calcRestored = calculateEmployeeRates(restoredRow);
    await db.run(
      "UPDATE employee_master_rows SET basic_pay = 47680, row_values_json = ? WHERE sap_id = '59234'",
      JSON.stringify(calcRestored)
    );

    const finalRevs = await getAllPayRevisions(db);
    console.log("Final M Awais revisions after cleanup:", finalRevs["59234"]);

    console.log("\nALL VERIFICATION TESTS PASSED PERFECTLY!");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
})();
