(async function enforceRoleNavigation() {
  const sessionKey = "HomeAuthSession";
  const employeePage = "employee-home.html";
  const authBaseUrl = window.location.port === "5500"
    ? `http://${window.location.hostname}:3000`
    : "";
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

  const currentPage = currentPageName();

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
    const allowedPages = [employeePage, "video.html"];
    if (!allowedPages.includes(currentPage)) {
      window.location.replace(employeePage);
      return;
    }
    document.querySelectorAll(".nav-link").forEach((link) => {
      const href = String(link.getAttribute("href") || "").split("#")[0].toLowerCase();
      link.hidden = !allowedPages.includes(href);
    });
    return;
  }

  hideDeniedNavigation(user);
  const requiredPermission = pagePermissions[currentPage];
  if (requiredPermission && !allow(user, requiredPermission)) window.location.replace("index.html");
})();
