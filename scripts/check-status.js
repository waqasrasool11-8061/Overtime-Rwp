const { getEmployeeDb } = require("../backend/employeeDb");

(async () => {
  const db = await getEmployeeDb();
  const nonBase = await db.all("SELECT * FROM employee_pay_revisions WHERE note != 'Base Master Record'");
  console.log("Non-base revisions count:", nonBase.length, nonBase);

  const awais = await db.all("SELECT * FROM employee_pay_revisions WHERE emp_key = '59234' OR employee_name LIKE '%AWAIS%'");
  console.log("Awais revisions:", awais);

  const waqas = await db.all("SELECT * FROM employee_pay_revisions WHERE emp_key = '60448' OR employee_name LIKE '%WAQAS RASOOL%'");
  console.log("Waqas revisions:", waqas);

  const awaisRow = await db.get("SELECT sap_id, employee_name, basic_pay FROM employee_master_rows WHERE sap_id = '59234'");
  console.log("Awais row in master:", awaisRow);

  const waqasRow = await db.get("SELECT sap_id, employee_name, basic_pay FROM employee_master_rows WHERE sap_id = '60448'");
  console.log("Waqas row in master:", waqasRow);
})();
