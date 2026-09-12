const fs = require("fs");
const { getEmployeeDb } = require("../backend/employeeDb");
const {
  getEmployeePostingStationStatus,
  updateEmployeePostingStation,
  resetPostingStationLock,
} = require("../backend/employeeRepository");

(async () => {
  try {
    console.log("=== TEST 1: Verify Header Renamed in JSON, JS, and SQLite ===");

    const jsonRaw = JSON.parse(fs.readFileSync("./Employee_Master.json", "utf8"));
    const headerCellJson = jsonRaw.rows[1][4];
    console.log("Employee_Master.json Row 1, Col 4:", headerCellJson);
    if (headerCellJson !== "POSTING STATION") {
      throw new Error(`Expected 'POSTING STATION', got '${headerCellJson}'`);
    }

    const jsRaw = fs.readFileSync("./Employee_Master.data.js", "utf8");
    if (!jsRaw.includes('"POSTING STATION"')) {
      throw new Error("Employee_Master.data.js missing 'POSTING STATION'");
    }
    console.log("PASS: Employee_Master.json and Employee_Master.data.js headers verified!");

    const db = await getEmployeeDb();
    const headerRowDb = await db.get("SELECT row_values_json FROM employee_master_rows WHERE row_index = 1");
    const parsedDbHeader = JSON.parse(headerRowDb.row_values_json);
    console.log("SQLite Row 1, Col 4:", parsedDbHeader[4]);
    if (parsedDbHeader[4] !== "POSTING STATION") {
      throw new Error(`Expected 'POSTING STATION' in SQLite, got '${parsedDbHeader[4]}'`);
    }
    console.log("PASS: SQLite header row verified!");

    console.log("\n=== TEST 2: Check Initial Status for Employee (Waqas Rasool - 60448) ===");
    // Ensure clean initial state for test
    await resetPostingStationLock(db, "60448");

    const initialStatus = await getEmployeePostingStationStatus(db, "60448");
    console.log("Initial status:", initialStatus);
    if (!initialStatus.found) throw new Error("Employee 60448 not found");
    if (initialStatus.isModified !== false || initialStatus.canEdit !== true) {
      throw new Error("Expected isModified=false, canEdit=true initially");
    }
    console.log("PASS: Initial status allows 1-time edit!");

    console.log("\n=== TEST 3: Employee Performs 1-Time Edit (Sets 'RAWALPINDI') ===");
    const updateRes = await updateEmployeePostingStation(db, "60448", "RAWALPINDI", true);
    console.log("Update response:", updateRes);
    if (updateRes.postingStation !== "RAWALPINDI" || updateRes.isModified !== true) {
      throw new Error("Update failed or did not return expected values");
    }

    const updatedStatus = await getEmployeePostingStationStatus(db, "60448");
    console.log("Status after 1-time edit:", updatedStatus);
    if (updatedStatus.postingStation !== "RAWALPINDI" || updatedStatus.isModified !== true || updatedStatus.canEdit !== false) {
      throw new Error("Status after edit should have postingStation='RAWALPINDI', isModified=true, canEdit=false");
    }

    // Verify row in SQLite table
    const dbRow = await db.get("SELECT sap_id, employee_name, category, row_values_json FROM employee_master_rows WHERE sap_id = '60448'");
    const parsedRowVals = JSON.parse(dbRow.row_values_json);
    if (dbRow.category !== "RAWALPINDI" || parsedRowVals[4] !== "RAWALPINDI") {
      throw new Error(`Database row col 4 mismatch: category=${dbRow.category}, rowVals[4]=${parsedRowVals[4]}`);
    }

    // Verify synced to JSON
    const refreshedJson = JSON.parse(fs.readFileSync("./Employee_Master.json", "utf8"));
    const jsonEmp = refreshedJson.rows.slice(refreshedJson.headerRows || 4).find(r => String(r[0]).trim() === "60448");
    if (jsonEmp[4] !== "RAWALPINDI") {
      throw new Error(`JSON file col 4 mismatch, got ${jsonEmp[4]}`);
    }
    console.log("PASS: Employee posting station saved to SQLite and JSON!");

    console.log("\n=== TEST 4: Verify 1-Time Lock Blocks Second Edit as Employee ===");
    let blocked = false;
    try {
      await updateEmployeePostingStation(db, "60448", "KUNDIAN", true); // isEmployeeSelfEdit = true
    } catch (err) {
      blocked = true;
      console.log("Expected block occurred:", err.message);
    }
    if (!blocked) {
      throw new Error("Second edit was NOT blocked for employee! 1-time lock failed.");
    }
    console.log("PASS: Second edit correctly blocked by 1-time lock!");

    console.log("\n=== TEST 5: Admin Resets 1-Time Lock ===");
    const resetRes = await resetPostingStationLock(db, "60448");
    console.log("Reset lock response:", resetRes);

    const statusAfterReset = await getEmployeePostingStationStatus(db, "60448");
    console.log("Status after admin reset:", statusAfterReset);
    if (statusAfterReset.canEdit !== true || statusAfterReset.isModified !== false) {
      throw new Error("Admin reset should have re-enabled canEdit=true");
    }
    console.log("PASS: Admin lock reset re-allows 1-time edit!");

    console.log("\n=== TEST 6: Employee Re-Edits After Admin Reset (Sets 'KUNDIAN') ===");
    await updateEmployeePostingStation(db, "60448", "KUNDIAN", true);
    const finalStatus = await getEmployeePostingStationStatus(db, "60448");
    console.log("Final status after re-edit:", finalStatus);
    if (finalStatus.postingStation !== "KUNDIAN" || finalStatus.isModified !== true || finalStatus.canEdit !== false) {
      throw new Error("Final status check failed");
    }
    console.log("PASS: Employee successfully re-edited and re-locked station!");

    console.log("\n=======================================================");
    console.log("ALL POSTING STATION TESTS PASSED WITH 100% SUCCESS!");
    console.log("=======================================================");
  } catch (err) {
    console.error("Test failed with error:", err);
    process.exit(1);
  }
})();
