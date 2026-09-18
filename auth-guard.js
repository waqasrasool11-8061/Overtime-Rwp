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
    "raw-data-search.html",
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
    "chat-inbox.html": "chatInbox",
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

  function getUserAllowedPages(user) {
    if (!user) return null;
    if (user.role === "admin") return ["*"];
    if (Array.isArray(user.allowedPages) && user.allowedPages.length > 0) {
      return user.allowedPages.map((p) => String(p).toLowerCase());
    }
    if (user.role === "restricted-admin") {
      return RESTRICTED_ADMIN_ALLOWED_PAGES;
    }
    if (user.role === "employee") {
      return EMPLOYEE_ALLOWED_PAGES;
    }
    return null;
  }

  function applyRoleNavigation(user) {
    if (!user) return;
    const allowed = getUserAllowedPages(user);
    if (allowed && !allowed.includes("*")) {
      document.querySelectorAll(".nav-link").forEach((link) => {
        const href = String(link.getAttribute("href") || "").split("#")[0].toLowerCase();
        link.hidden = !allowed.includes(href);
      });
      return;
    }
    if (user.role === "admin") {
      document.querySelectorAll(".nav-link").forEach((link) => {
        link.hidden = false;
      });
      return;
    }
    hideDeniedNavigation(user);
  }

  const currentPage = currentPageName();

  function checkPageAccess(user) {
    if (!user) return false;
    if (user.role === "admin") return true;

    if (user.role === "employee") {
      if (currentPage === "index.html" || !EMPLOYEE_ALLOWED_PAGES.includes(currentPage)) {
        window.location.replace(employeePage);
        return false;
      }
      return true;
    }

    const allowed = getUserAllowedPages(user);
    if (allowed && !allowed.includes("*")) {
      if (!allowed.includes(currentPage)) {
        const target = allowed[0] || "index.html";
        window.location.replace(target);
        return false;
      }
      return true;
    }

    const requiredPermission = pagePermissions[currentPage];
    if (requiredPermission && !allow(user, requiredPermission)) {
      window.location.replace("index.html");
      return false;
    }
    return true;
  }

  async function updateChatBadge() {
    try {
      const res = await fetch(`${authBaseUrl}/api/chat/unread-count`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const count = Number(data.unreadCount || 0);
      document.querySelectorAll(".chat-nav-badge").forEach((badge) => {
        if (count > 0) {
          badge.textContent = count > 99 ? "99+" : String(count);
          badge.style.display = "inline-block";
        } else {
          badge.style.display = "none";
        }
      });
    } catch {}
  }

  function setupAdminChatBadge(u) {
    if (!u || u.role === "employee") return;
    updateChatBadge();
    if (!window._chatBadgeInterval) {
      window._chatBadgeInterval = setInterval(updateChatBadge, 20000);
    }
  }

  // Fast synchronous check from cached session to avoid UI flash
  try {
    const cachedRaw = localStorage.getItem(sessionKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached) {
        if (!checkPageAccess(cached)) return;
        applyRoleNavigation(cached);
        setupAdminChatBadge(cached);
      }
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

  if (!checkPageAccess(user)) return;
  applyRoleNavigation(user);
  setupAdminChatBadge(user);
})();
