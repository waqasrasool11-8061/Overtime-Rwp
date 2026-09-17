(async function enforceRoleNavigation() {
  const sessionKey = "HomeAuthSession";
  const employeePage = "employee-home.html";
  const authBaseUrl = window.location.port === "5500"
    ? `http://${window.location.hostname}:3000`
    : "";

  const RESTRICTED_ADMIN_ALLOWED_PAGES = [
    "index.html",
    "genl-164.html",
    "loco-18.html",
    "raw-data.html",
    "video.html",
  ];
  const EMPLOYEE_ALLOWED_PAGES = [employeePage, "video.html"];

  const pagePermissions = {
    "index.html": "dataEntry",
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
  const navPermissions = { ...pagePermissions };

  function currentPageName() {
    const parts = window.location.pathname.split("/");
    return (parts[parts.length - 1] || "index.html").toLowerCase();
  }

  function allow(user, permission) {
    return !permission || user?.permissions?.includes(permission);
  }

  function hideDeniedNavigation(user) {
    document.querySelectorAll(".nav-link").forEach((link) => {
      const href = String(link.getAttribute("href") || "").split("#")[0].toLowerCase();
      const permission = navPermissions[href];
      link.hidden = Boolean(permission && !allow(user, permission));
    });
  }

  function applyRoleNavigation(user) {
    if (!user) return;
    if (user.role === "restricted-admin") {
      document.querySelectorAll(".nav-link").forEach((link) => {
        const href = String(link.getAttribute("href") || "").split("#")[0].toLowerCase();
        link.hidden = !RESTRICTED_ADMIN_ALLOWED_PAGES.includes(href);
      });
      return;
    }
    if (user.role === "employee") {
      document.querySelectorAll(".nav-link").forEach((link) => {
        const href = String(link.getAttribute("href") || "").split("#")[0].toLowerCase();
        link.hidden = !EMPLOYEE_ALLOWED_PAGES.includes(href);
      });
      return;
    }
    hideDeniedNavigation(user);
  }

  const currentPage = currentPageName();

  // Fast synchronous check from cached session to avoid UI flash
  try {
    const cachedRaw = localStorage.getItem(sessionKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached?.role === "employee") {
        if (currentPage === "index.html") {
          window.location.replace(employeePage);
          return;
        }
        if (!EMPLOYEE_ALLOWED_PAGES.includes(currentPage)) {
          window.location.replace(employeePage);
          return;
        }
      } else if (cached?.role === "restricted-admin") {
        if (!RESTRICTED_ADMIN_ALLOWED_PAGES.includes(currentPage)) {
          window.location.replace("index.html");
          return;
        }
      }
      applyRoleNavigation(cached);
    }
  } catch {}

  let user = null;
  try {
    const response = await fetch(`${authBaseUrl}/api/auth/session`, { credentials: "include" });
    if (response.ok) {
      user = (await response.json()).user;
      localStorage.setItem(sessionKey, JSON.stringify(user));
    }
  } catch {
    user = null;
  }

  if (!user) {
    localStorage.removeItem(sessionKey);
    if (currentPage === "index.html") return;
    window.location.replace("index.html");
    return;
  }

  if (user.role === "employee") {
    if (currentPage === "index.html") {
      window.location.replace(employeePage);
      return;
    }
    if (!EMPLOYEE_ALLOWED_PAGES.includes(currentPage)) {
      window.location.replace(employeePage);
      return;
    }
    applyRoleNavigation(user);
    return;
  }

  if (user.role === "restricted-admin") {
    if (!RESTRICTED_ADMIN_ALLOWED_PAGES.includes(currentPage)) {
      window.location.replace("index.html");
      return;
    }
    applyRoleNavigation(user);
    return;
  }

  applyRoleNavigation(user);
  const requiredPermission = pagePermissions[currentPage];
  if (requiredPermission && !allow(user, requiredPermission)) {
    window.location.replace("index.html");
  }
})();
