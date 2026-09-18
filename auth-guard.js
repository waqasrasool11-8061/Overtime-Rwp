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
    if (user.role === "admin" || user.role === "guest") return ["*"];
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
    if (user.role === "admin" || user.role === "guest") {
      document.querySelectorAll(".nav-link").forEach((link) => {
        link.hidden = false;
      });
      return;
    }
    const allowed = getUserAllowedPages(user);
    if (allowed && !allowed.includes("*")) {
      document.querySelectorAll(".nav-link").forEach((link) => {
        const href = String(link.getAttribute("href") || "").split("#")[0].toLowerCase();
        link.hidden = !allowed.includes(href);
      });
      return;
    }
    hideDeniedNavigation(user);
  }

  const currentPage = currentPageName();

  function checkPageAccess(user) {
    if (!user) return false;
    if (user.role === "admin" || user.role === "guest") return true;

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

  function enforceGuestViewOnly() {
    const page = currentPageName();
    if (page === "video.html") {
      return; // Full access on video.html
    }

    // 1. Top Guest Mode Banner
    function injectGuestBanner() {
      if (document.getElementById("guestModeNotice")) return;
      const banner = document.createElement("div");
      banner.id = "guestModeNotice";
      banner.className = "guest-mode-banner";
      banner.innerHTML = `
        <div class="guest-banner-inner">
          <span class="guest-banner-icon">👁️</span>
          <span class="guest-banner-msg"><strong>GUEST ACCOUNT (View-Only Mode):</strong> You have view-only access to explore the website layout and designs. Adding, editing, or deleting data is disabled.</span>
        </div>
      `;
      const navBar = document.querySelector(".nav-bar") || document.querySelector("header");
      if (navBar && navBar.parentNode) {
        navBar.parentNode.insertBefore(banner, navBar.nextSibling);
      } else {
        document.body.prepend(banner);
      }
    }

    // 2. Floating toast notice for clicked actions
    function showGuestToast(msg) {
      let toast = document.getElementById("guestModeToast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "guestModeToast";
        toast.className = "guest-mode-toast";
        document.body.appendChild(toast);
      }
      toast.textContent = msg || "👁️ Guest Mode Notice: Data modification is disabled. This account has view-only access to explore the layout.";
      toast.classList.add("show");
      clearTimeout(window._guestToastTimer);
      window._guestToastTimer = setTimeout(() => {
        toast.classList.remove("show");
      }, 3500);
    }

    // 3. Lock down DOM mutation elements
    function lockDom() {
      // Contenteditable table cells
      document.querySelectorAll("[contenteditable='true']").forEach((el) => {
        el.contentEditable = "false";
        el.setAttribute("data-guest-locked", "1");
      });

      // Inputs and textareas that submit or add data (excluding search/filter and auth)
      const inputsToLock = document.querySelectorAll(
        "form:not(#homeLoginForm):not(.auth-form) input:not([type='hidden']):not([type='search']):not([data-row-select]):not([data-select-month]):not([data-month-select-header]):not([data-month-jump]), " +
        "form:not(#homeLoginForm):not(.auth-form) textarea, " +
        ".panel input:not([type='search']):not([data-month-jump]), .panel textarea, " +
        "#chatMessageInput, #chatMessageText"
      );
      inputsToLock.forEach((inp) => {
        inp.readOnly = true;
        inp.setAttribute("data-guest-readonly", "1");
      });

      // Target action buttons that mutate or submit data
      const mutationSelectors = [
        "button[type='submit']",
        "input[type='submit']",
        "#submitBtn",
        "#saveRawSheet",
        "#saveOp72Sheet",
        "#saveBtn",
        "#saveTable",
        "#saveChanges",
        "#saveEmployeeMaster",
        "#saveHolidays",
        "#saveUserBtn",
        "#btnOpenCreateUserModal",
        "#submitRawRecord",
        "#submitOp72Record",
        "#importExcelPaste",
        "#importOp72Paste",
        "#deleteSelectedRows",
        "#deleteOp72Rows",
        "#deleteSelected",
        "#cleanupEmptyRows",
        "#cleanupOp72Rows",
        "#cleanupRows",
        "#toggleAddRawRecord",
        "#togglePasteFromExcel",
        "#toggleAddOp72Record",
        "#togglePasteOp72Records",
        "#sendMessageBtn",
        "#sendChatBtn",
        "#submitAddRecord",
        "#btnSaveHolidays",
        "#addHolidayBtn",
        "#btnAddNewUser",
        ".btn-delete",
        ".btn-danger",
        ".delete-btn"
      ];

      mutationSelectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((btn) => {
          btn.setAttribute("data-guest-disabled", "1");
          btn.style.opacity = "0.55";
          btn.style.cursor = "not-allowed";
          btn.title = "Option disabled in Guest (View-Only) Mode";
        });
      });
    }

    // 4. Intercept clicks on mutation buttons in capturing phase
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button, input[type='submit'], .btn-primary, .btn-danger, [data-guest-disabled]");
      if (!btn) return;
      if (
        btn.closest(".nav-bar") ||
        btn.closest(".month-accordion-header") ||
        btn.classList.contains("month-btn-action") ||
        btn.classList.contains("btn-month-copy") ||
        btn.id === "loginToggleBtn" ||
        btn.id === "logoutBtn" ||
        btn.id === "closeCreateUserModalBtn" ||
        btn.id === "btnCancelCreateUser" ||
        btn.id === "copySelectedRawRows" ||
        btn.id === "copySelectedOp72Rows"
      ) {
        return;
      }

      const text = (btn.textContent || btn.value || "").toLowerCase().trim();
      const isAllowed = text.includes("copy") || text.includes("expand") || text.includes("collapse") || text.includes("close") || text.includes("cancel");

      if (!isAllowed && (
        btn.hasAttribute("data-guest-disabled") ||
        btn.type === "submit" ||
        text.includes("save") ||
        text.includes("delete") ||
        text.includes("add") ||
        text.includes("insert") ||
        text.includes("import") ||
        text.includes("clean") ||
        text.includes("send") ||
        text.includes("submit") ||
        text.includes("reset") ||
        text.includes("remove")
      )) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        showGuestToast("👁️ Guest Mode: Adding, modifying, or deleting data is disabled. You have view-only access to explore the website layout.");
        return false;
      }
    }, true);

    // 5. Intercept form submissions
    document.addEventListener("submit", (e) => {
      if (e.target.id === "homeLoginForm" || e.target.classList.contains("auth-form")) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showGuestToast("👁️ Guest Mode: Form submission is disabled. You have view-only access.");
      return false;
    }, true);

    injectGuestBanner();
    lockDom();
    if (window.MutationObserver) {
      const observer = new MutationObserver(() => {
        lockDom();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
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
    if (!u || u.role === "employee" || u.role === "guest") return;
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
        if (cached.role === "guest") enforceGuestViewOnly();
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
  if (user.role === "guest") enforceGuestViewOnly();
})();
