const authKey = "HomeAuthSession";
const authBaseUrl = window.location.port === "5500"
  ? `http://${window.location.hostname}:3000`
  : "";

const employeePageTitle    = document.getElementById("employeePageTitle");
const employeeNameHeading  = document.getElementById("employeeNameHeading");
const employeePageSubtitle = document.getElementById("employeePageSubtitle");
const employeeLogoutBtn    = document.getElementById("employeeLogoutBtn");

function readSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(authKey) || "null");
    if (!parsed || !parsed.userId || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

function applyEmployeeIdentity() {
  const session = readSession();
  if (!session) {
    window.location.replace("index.html");
    return;
  }

  if (String(session.role).toLowerCase() !== "employee") {
    employeePageTitle.textContent   = "Admin Access";
    employeeNameHeading.textContent = String(session.userId);
    employeePageSubtitle.textContent = "Admin user can access all pages.";
    return;
  }

  const name = String(session.userId);
  employeePageTitle.textContent    = name;
  employeeNameHeading.textContent  = name;
  employeePageSubtitle.textContent = `${name} - Employee View`;
}

employeeLogoutBtn.addEventListener("click", async () => {
  // Server-side session destroy — clears HttpOnly cookie
  try {
    await fetch(`${authBaseUrl}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // ignore network error — still clear local session
  }
  localStorage.removeItem(authKey);
  window.location.replace("index.html");
});

applyEmployeeIdentity();
