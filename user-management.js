(function () {
  "use strict";

  const API_BASE_URL = window.location.port === "5500"
    ? `http://${window.location.hostname}:3000`
    : "";

  // State
  let allAdmins = [];
  let allEmployees = [];
  let filteredEmployees = [];
  let currentPage = 1;
  let pageSize = 50;
  let allRevealed = false;
  let editingUser = null;
  const revealedPasswords = new Set(); // Stores IDs of revealed passwords

  // Elements
  const statAdminCount = document.getElementById("statAdminCount");
  const statEmpCount = document.getElementById("statEmpCount");
  const statCustomCount = document.getElementById("statCustomCount");
  const statDefaultCount = document.getElementById("statDefaultCount");
  const adminsContainer = document.getElementById("adminsContainer");
  const empTableBody = document.getElementById("empTableBody");
  const empSearchInput = document.getElementById("empSearchInput");
  const pwdFilterSelect = document.getElementById("pwdFilterSelect");
  const resultsCountText = document.getElementById("resultsCountText");
  const toggleAllEmpPasswordsBtn = document.getElementById("toggleAllEmpPasswords");
  const pageSizeSelect = document.getElementById("pageSizeSelect");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageInfoText = document.getElementById("pageInfoText");

  // Modal elements
  const editPasswordModal = document.getElementById("editPasswordModal");
  const editPasswordForm = document.getElementById("editPasswordForm");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const modalCancelBtn = document.getElementById("modalCancelBtn");
  const modalTitle = document.getElementById("modalTitle");
  const modalUserName = document.getElementById("modalUserName");
  const modalUserSub = document.getElementById("modalUserSub");
  const modalNewPassword = document.getElementById("modalNewPassword");
  const modalConfirmPassword = document.getElementById("modalConfirmPassword");
  const toggleModalPwdBtn = document.getElementById("toggleModalPwdBtn");
  const modalGenRandomBtn = document.getElementById("modalGenRandomBtn");
  const modalResetDefaultBtn = document.getElementById("modalResetDefaultBtn");
  const umToast = document.getElementById("umToast");

  // Create User modal elements
  const btnOpenCreateUserModal = document.getElementById("btnOpenCreateUserModal");
  const createUserModal = document.getElementById("createUserModal");
  const closeCreateUserModalBtn = document.getElementById("closeCreateUserModalBtn");
  const btnCancelCreateUser = document.getElementById("btnCancelCreateUser");
  const createUserForm = document.getElementById("createUserForm");
  const newUserId = document.getElementById("newUserId");
  const newUserPassword = document.getElementById("newUserPassword");
  const toggleNewUserPwdBtn = document.getElementById("toggleNewUserPwdBtn");
  const btnGenNewUserPwd = document.getElementById("btnGenNewUserPwd");
  const newUserRole = document.getElementById("newUserRole");
  const btnSelectAllPages = document.getElementById("btnSelectAllPages");
  const btnDeselectAllPages = document.getElementById("btnDeselectAllPages");
  const pageAccessGrid = document.getElementById("pageAccessGrid");

  // Toast notification
  let toastTimer = null;
  function showToast(message, type = "success") {
    if (toastTimer) clearTimeout(toastTimer);
    umToast.textContent = message;
    umToast.className = `um-toast show ${type}`;
    toastTimer = setTimeout(() => {
      umToast.className = "um-toast";
    }, 3200);
  }

  // Fetch Users
  async function loadUsers() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 403) {
          window.location.replace("index.html");
          return;
        }
        throw new Error(`Failed to load users (HTTP ${response.status})`);
      }

      const data = await response.json();
      allAdmins = Array.isArray(data?.admins) ? data.admins : [];
      allEmployees = Array.isArray(data?.employees) ? data.employees : [];

      renderStats();
      renderAdmins();
      applyFilters();
    } catch (err) {
      console.error(err);
      showToast(err.message, "error");
      empTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #cf222e; padding: 20px;">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // Render Stats
  function renderStats() {
    statAdminCount.textContent = allAdmins.length;
    statEmpCount.textContent = allEmployees.length;
    const customCount = allEmployees.filter((e) => e.isCustomPassword).length;
    statCustomCount.textContent = customCount;
    statDefaultCount.textContent = allEmployees.length - customCount;
  }

  const PAGE_LABELS = {
    "index.html": "Home",
    "video.html": "Video",
    "employee-master.html": "Emp Master",
    "group-master.html": "Group Master",
    "holidays.html": "Holidays",
    "op-72.html": "OP-72",
    "op72-raw-data.html": "OP72 Raw Data",
    "genl-164.html": "GENL-164",
    "loco-18.html": "Loco-18",
    "amount-summary.html": "Amount Summary",
    "raw-data.html": "RawData",
    "raw-data-search.html": "RawData Search",
    "employee-home.html": "Emp Portal",
    "user-management.html": "User Mgmt",
  };

  function formatAccessSummary(admin) {
    if (admin.role === "admin" || (Array.isArray(admin.allowedPages) && admin.allowedPages.includes("*"))) {
      return "Full Access (All Modules)";
    }
    if (!Array.isArray(admin.allowedPages) || !admin.allowedPages.length) {
      return "No Access";
    }
    return admin.allowedPages.map((p) => PAGE_LABELS[p] || p.replace(/\.html$/i, "")).join(", ");
  }

  // Render Admins
  function renderAdmins() {
    if (!allAdmins.length) {
      adminsContainer.innerHTML = `<p class="helper-text">No admin accounts found.</p>`;
      return;
    }

    adminsContainer.innerHTML = allAdmins
      .map((admin) => {
        const isMain = admin.role === "admin";
        const isRestricted = admin.role === "restricted-admin";
        const isSubAdmin = admin.role === "sub-admin";

        let roleLabel = "Admin";
        let roleBadgeClass = "badge-role-main";
        let cardClass = "is-main-admin";

        if (isMain) {
          roleLabel = "Main Admin (Full Access)";
          roleBadgeClass = "badge-role-main";
          cardClass = "is-main-admin";
        } else if (isRestricted) {
          roleLabel = "Restricted Admin";
          roleBadgeClass = "badge-role-restricted";
          cardClass = "is-restricted";
        } else if (isSubAdmin) {
          roleLabel = "Sub Admin / Clerk";
          roleBadgeClass = "badge-role-subadmin";
          cardClass = "is-sub-admin";
        } else {
          roleLabel = admin.role || "User";
          roleBadgeClass = "badge-role-restricted";
          cardClass = "is-restricted";
        }

        const accessSummary = formatAccessSummary(admin);
        const isCoreAdmin = ["vicky ch", "vicky raja"].includes(String(admin.userId || "").toLowerCase());
        const adminKey = `admin_${admin.userId}`;
        const isRevealed = revealedPasswords.has(adminKey);
        const displayPassword = isRevealed ? escapeHtml(admin.password) : "••••••••";
        const maskClass = isRevealed ? "" : "is-masked";

        return `
        <div class="um-admin-card ${cardClass}">
          <div class="um-admin-top">
            <div>
              <h3 class="um-admin-name">${escapeHtml(admin.userId)}</h3>
              <span class="${roleBadgeClass}">${escapeHtml(roleLabel)}</span>
              <div class="um-access-tag" title="${escapeHtml(accessSummary)}">
                <strong>Access:</strong> ${escapeHtml(accessSummary)}
              </div>
            </div>
            <div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end;">
              <button class="btn-sm-edit edit-admin-btn" data-user-id="${escapeHtml(admin.userId)}" data-role="${escapeHtml(roleLabel)}" type="button">
                &#x270E; Edit Password
              </button>
              ${
                !isCoreAdmin
                  ? `<button class="btn-sm-reset delete-admin-btn" data-user-id="${escapeHtml(admin.userId)}" type="button" title="Delete this administrative user">&#x1F5D1;&#xFE0F; Delete</button>`
                  : ""
              }
            </div>
          </div>
          <div class="um-password-box">
            <span class="um-pwd-text ${maskClass}" id="pwd_${adminKey}">${displayPassword}</span>
            <button class="btn-pwd-action toggle-pwd-btn" data-key="${adminKey}" data-pwd="${escapeHtml(admin.password)}" type="button" title="Toggle Show/Hide">
              ${isRevealed ? "&#x1F648;" : "&#x1F441;&#xFE0F;"}
            </button>
            <button class="btn-pwd-action copy-pwd-btn" data-pwd="${escapeHtml(admin.password)}" type="button" title="Copy password">
              &#x1F4CB;
            </button>
          </div>
        </div>
      `;
      })
      .join("");
  }

  // Apply Filters
  function applyFilters() {
    const query = String(empSearchInput.value || "").trim().toLowerCase();
    const filter = pwdFilterSelect.value;

    filteredEmployees = allEmployees.filter((emp) => {
      // Password type filter
      if (filter === "custom" && !emp.isCustomPassword) return false;
      if (filter === "default" && emp.isCustomPassword) return false;

      // Text search filter
      if (!query) return true;
      const sapMatch = String(emp.sapId || "").toLowerCase().includes(query);
      const nameMatch = String(emp.name || "").toLowerCase().includes(query);
      const desgMatch = String(emp.designation || "").toLowerCase().includes(query);
      return sapMatch || nameMatch || desgMatch;
    });

    currentPage = 1;
    renderEmployeesTable();
  }

  // Render Employee Table & Pagination
  function renderEmployeesTable() {
    resultsCountText.textContent = `Showing ${filteredEmployees.length} of ${allEmployees.length} employees`;

    if (!filteredEmployees.length) {
      empTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: #64748b;">No employees match your search criteria.</td></tr>`;
      prevPageBtn.disabled = true;
      nextPageBtn.disabled = true;
      pageInfoText.textContent = "Page 0 of 0";
      return;
    }

    const currentSize = pageSizeSelect.value === "all" ? filteredEmployees.length : Number(pageSizeSelect.value);
    const totalPages = Math.ceil(filteredEmployees.length / currentSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * currentSize;
    const pageItems = filteredEmployees.slice(startIndex, startIndex + currentSize);

    empTableBody.innerHTML = pageItems
      .map((emp) => {
        const empKey = `emp_${emp.sapId}`;
        const isRevealed = allRevealed || revealedPasswords.has(empKey);
        const displayPassword = isRevealed ? escapeHtml(emp.password) : "••••••••";
        const maskClass = isRevealed ? "" : "is-masked";
        const statusBadge = emp.isCustomPassword
          ? `<span class="badge-status-custom">&#x2714; Custom Password</span>`
          : `<span class="badge-status-default">&#x1F512; Default (SAP ID)</span>`;

        return `
        <tr>
          <td style="text-align: center;"><strong style="font-family: monospace; color: #0969da; font-size: 0.86rem;">${escapeHtml(emp.sapId)}</strong></td>
          <td title="${escapeHtml(emp.name)}"><strong style="color: #0f172a;">${escapeHtml(emp.name)}</strong></td>
          <td style="color: #475569; font-size: 0.83rem;" title="${escapeHtml(emp.designation)}">${escapeHtml(emp.designation)}</td>
          <td>
            <div class="um-password-box">
              <span class="um-pwd-text ${maskClass}" id="pwd_${empKey}">${displayPassword}</span>
              <button class="btn-pwd-action toggle-pwd-btn" data-key="${empKey}" data-pwd="${escapeHtml(emp.password)}" type="button" title="Toggle Show/Hide">
                ${isRevealed ? "&#x1F648;" : "&#x1F441;&#xFE0F;"}
              </button>
              <button class="btn-pwd-action copy-pwd-btn" data-pwd="${escapeHtml(emp.password)}" type="button" title="Copy password">
                &#x1F4CB;
              </button>
            </div>
          </td>
          <td style="text-align: center;">${statusBadge}</td>
          <td style="text-align: center;">
            <button class="btn-sm-edit edit-emp-btn" 
              data-sap-id="${escapeHtml(emp.sapId)}" 
              data-name="${escapeHtml(emp.name)}" 
              data-is-custom="${emp.isCustomPassword}"
              type="button">
              &#x270E; Edit
            </button>
            ${
              emp.isCustomPassword
                ? `<button class="btn-sm-reset reset-emp-btn" data-sap-id="${escapeHtml(emp.sapId)}" data-name="${escapeHtml(emp.name)}" type="button" title="Reset to default SAP ID">&#x21BA; Reset</button>`
                : ""
            }
          </td>
        </tr>
      `;
      })
      .join("");

    // Pagination controls
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
    pageInfoText.textContent = `Page ${currentPage} of ${totalPages}`;
  }

  // Open Edit Modal
  function openEditModal(target) {
    editingUser = target;
    modalNewPassword.value = "";
    modalConfirmPassword.value = "";
    modalNewPassword.type = "password";
    modalConfirmPassword.type = "password";
    toggleModalPwdBtn.innerHTML = "&#x1F441;&#xFE0F;";

    if (target.type === "admin") {
      modalTitle.textContent = `Edit Password — ${target.userId}`;
      modalUserName.textContent = target.userId;
      modalUserSub.textContent = target.role;
      modalResetDefaultBtn.style.display = "none";
    } else {
      modalTitle.textContent = `Edit / Reset Password — ${target.name}`;
      modalUserName.textContent = target.name;
      modalUserSub.textContent = `SAP ID: ${target.sapId}`;
      modalResetDefaultBtn.style.display = target.isCustom ? "inline-block" : "none";
    }

    if (editPasswordModal && !editPasswordModal.open) {
      editPasswordModal.showModal();
      modalNewPassword.focus();
    }
  }

  function closeEditModal() {
    if (editPasswordModal && editPasswordModal.open) {
      editPasswordModal.close();
    }
    editingUser = null;
  }

  // Save Password via API
  async function submitPasswordUpdate(newPassword) {
    if (!editingUser) return;
    const endpoint = `${API_BASE_URL}/api/admin/users/password`;
    const payload = {
      type: editingUser.type,
      id: editingUser.type === "admin" ? editingUser.userId : editingUser.sapId,
      newPassword,
    };

    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const resData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(resData?.message || `HTTP ${response.status}`);
      }

      showToast(resData?.message || "Password updated successfully!");
      closeEditModal();
      await loadUsers();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // Reset Employee Password to Default SAP ID
  async function resetEmployeeToDefault(sapId, empName) {
    if (!confirm(`Are you sure you want to reset password for "${empName || sapId}" back to default (SAP ID: ${sapId})?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/reset-default`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ sapId }),
      });

      const resData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(resData?.message || `HTTP ${response.status}`);
      }

      showToast(resData?.message || `Password reset to default (${sapId})!`);
      closeEditModal();
      await loadUsers();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // Generate Random Password
  function generateRandomPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  // Utility escape HTML
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Event Listeners
  empSearchInput.addEventListener("input", applyFilters);
  pwdFilterSelect.addEventListener("change", applyFilters);

  pageSizeSelect.addEventListener("change", () => {
    currentPage = 1;
    renderEmployeesTable();
  });

  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderEmployeesTable();
    }
  });

  nextPageBtn.addEventListener("click", () => {
    currentPage++;
    renderEmployeesTable();
  });

  toggleAllEmpPasswordsBtn.addEventListener("click", () => {
    allRevealed = !allRevealed;
    toggleAllEmpPasswordsBtn.innerHTML = allRevealed
      ? "&#x1F648; Hide All Passwords"
      : "&#x1F441;&#xFE0F; Reveal All Passwords";
    renderEmployeesTable();
  });

  // Table & Admin click delegations
  document.addEventListener("click", (event) => {
    // Show/Hide toggle password
    const toggleBtn = event.target.closest(".toggle-pwd-btn");
    if (toggleBtn) {
      const key = toggleBtn.getAttribute("data-key");
      const pwd = toggleBtn.getAttribute("data-pwd");
      const isNowRevealed = !revealedPasswords.has(key);
      if (isNowRevealed) {
        revealedPasswords.add(key);
      } else {
        revealedPasswords.delete(key);
      }
      const pwdEl = document.getElementById(`pwd_${key}`);
      if (pwdEl) {
        pwdEl.textContent = isNowRevealed ? pwd : "••••••••";
        pwdEl.classList.toggle("is-masked", !isNowRevealed);
      }
      toggleBtn.innerHTML = isNowRevealed ? "&#x1F648;" : "&#x1F441;&#xFE0F;";
      return;
    }

    // Copy to clipboard
    const copyBtn = event.target.closest(".copy-pwd-btn");
    if (copyBtn) {
      const pwd = copyBtn.getAttribute("data-pwd");
      if (pwd) {
        navigator.clipboard.writeText(pwd).then(
          () => showToast("Password copied to clipboard!"),
          () => showToast("Could not copy password", "error")
        );
      }
      return;
    }

    // Edit Admin button
    const editAdminBtn = event.target.closest(".edit-admin-btn");
    if (editAdminBtn) {
      const userId = editAdminBtn.getAttribute("data-user-id");
      const role = editAdminBtn.getAttribute("data-role");
      openEditModal({ type: "admin", userId, role });
      return;
    }

    // Edit Employee button
    const editEmpBtn = event.target.closest(".edit-emp-btn");
    if (editEmpBtn) {
      const sapId = editEmpBtn.getAttribute("data-sap-id");
      const name = editEmpBtn.getAttribute("data-name");
      const isCustom = editEmpBtn.getAttribute("data-is-custom") === "true";
      openEditModal({ type: "employee", sapId, name, isCustom });
      return;
    }

    // Reset Employee to Default button
    const resetEmpBtn = event.target.closest(".reset-emp-btn");
    if (resetEmpBtn) {
      const sapId = resetEmpBtn.getAttribute("data-sap-id");
      const name = resetEmpBtn.getAttribute("data-name");
      resetEmployeeToDefault(sapId, name);
      return;
    }
    // Delete Admin button
    const deleteAdminBtn = event.target.closest(".delete-admin-btn");
    if (deleteAdminBtn) {
      const userId = deleteAdminBtn.getAttribute("data-user-id");
      if (!confirm(`Are you sure you want to delete user "${userId}"? This action cannot be undone.`)) {
        return;
      }

      (async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(userId)}`, {
            method: "DELETE",
            headers: { Accept: "application/json" },
            credentials: "include",
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.message || `HTTP ${res.status}`);
          }
          showToast(data?.message || `User "${userId}" deleted successfully.`);
          await loadUsers();
        } catch (err) {
          showToast(err.message, "error");
        }
      })();
      return;
    }
  });

  // Modal actions
  closeModalBtn.addEventListener("click", closeEditModal);
  modalCancelBtn.addEventListener("click", closeEditModal);

  toggleModalPwdBtn.addEventListener("click", () => {
    const isPwd = modalNewPassword.type === "password";
    modalNewPassword.type = isPwd ? "text" : "password";
    modalConfirmPassword.type = isPwd ? "text" : "password";
    toggleModalPwdBtn.innerHTML = isPwd ? "&#x1F648;" : "&#x1F441;&#xFE0F;";
  });

  modalGenRandomBtn.addEventListener("click", () => {
    const generated = generateRandomPassword();
    modalNewPassword.value = generated;
    modalConfirmPassword.value = generated;
    modalNewPassword.type = "text";
    modalConfirmPassword.type = "text";
    toggleModalPwdBtn.innerHTML = "&#x1F648;";
  });

  modalResetDefaultBtn.addEventListener("click", () => {
    if (editingUser && editingUser.type === "employee") {
      resetEmployeeToDefault(editingUser.sapId, editingUser.name);
    }
  });

  editPasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPwd = modalNewPassword.value.trim();
    const confirmPwd = modalConfirmPassword.value.trim();

    if (!newPwd) {
      showToast("Password cannot be empty.", "error");
      modalNewPassword.focus();
      return;
    }

    if (newPwd.length < 4) {
      showToast("Password must be at least 4 characters.", "error");
      modalNewPassword.focus();
      return;
    }

    if (newPwd !== confirmPwd) {
      showToast("Passwords do not match.", "error");
      modalConfirmPassword.focus();
      return;
    }

    await submitPasswordUpdate(newPwd);
  });

  // ── Create User Modal Actions ────────────────────────────────────────────────
  function applyPresetPagesForRole(role) {
    const checkboxes = document.querySelectorAll('#pageAccessGrid input[name="allowedPage"]');
    checkboxes.forEach((cb) => {
      if (role === "admin") {
        cb.checked = true;
      } else if (role === "restricted-admin") {
        cb.checked = ["index.html", "genl-164.html", "loco-18.html", "raw-data.html", "raw-data-search.html", "video.html"].includes(cb.value);
      } else {
        // sub-admin / clerk
        cb.checked = ["index.html", "video.html"].includes(cb.value);
      }
    });
  }

  function openCreateUserModal() {
    if (!createUserModal) return;
    if (createUserForm) createUserForm.reset();
    if (newUserId) newUserId.value = "";
    if (newUserPassword) {
      newUserPassword.value = "";
      newUserPassword.type = "password";
    }
    if (toggleNewUserPwdBtn) toggleNewUserPwdBtn.innerHTML = "&#x1F441;&#xFE0F;";
    if (newUserRole) newUserRole.value = "sub-admin";
    applyPresetPagesForRole("sub-admin");

    if (!createUserModal.open) {
      createUserModal.showModal();
      if (newUserId) newUserId.focus();
    }
  }

  function closeCreateUserModal() {
    if (createUserModal && createUserModal.open) {
      createUserModal.close();
    }
  }

  if (btnOpenCreateUserModal) {
    btnOpenCreateUserModal.addEventListener("click", openCreateUserModal);
  }

  if (closeCreateUserModalBtn) {
    closeCreateUserModalBtn.addEventListener("click", closeCreateUserModal);
  }

  if (btnCancelCreateUser) {
    btnCancelCreateUser.addEventListener("click", closeCreateUserModal);
  }

  if (toggleNewUserPwdBtn && newUserPassword) {
    toggleNewUserPwdBtn.addEventListener("click", () => {
      const isPwd = newUserPassword.type === "password";
      newUserPassword.type = isPwd ? "text" : "password";
      toggleNewUserPwdBtn.innerHTML = isPwd ? "&#x1F648;" : "&#x1F441;&#xFE0F;";
    });
  }

  if (btnGenNewUserPwd && newUserPassword) {
    btnGenNewUserPwd.addEventListener("click", () => {
      const gen = generateRandomPassword();
      newUserPassword.value = gen;
      newUserPassword.type = "text";
      if (toggleNewUserPwdBtn) toggleNewUserPwdBtn.innerHTML = "&#x1F648;";
    });
  }

  if (newUserRole) {
    newUserRole.addEventListener("change", () => {
      applyPresetPagesForRole(newUserRole.value);
    });
  }

  if (btnSelectAllPages) {
    btnSelectAllPages.addEventListener("click", () => {
      document.querySelectorAll('#pageAccessGrid input[name="allowedPage"]').forEach((cb) => {
        cb.checked = true;
      });
    });
  }

  if (btnDeselectAllPages) {
    btnDeselectAllPages.addEventListener("click", () => {
      document.querySelectorAll('#pageAccessGrid input[name="allowedPage"]').forEach((cb) => {
        cb.checked = false;
      });
    });
  }

  if (createUserForm) {
    createUserForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userId = newUserId ? newUserId.value.trim() : "";
      const password = newUserPassword ? newUserPassword.value.trim() : "";
      const role = newUserRole ? newUserRole.value : "sub-admin";

      if (!userId) {
        showToast("Please enter a User ID / Name.", "error");
        if (newUserId) newUserId.focus();
        return;
      }
      if (!password || password.length < 4) {
        showToast("Password must be at least 4 characters.", "error");
        if (newUserPassword) newUserPassword.focus();
        return;
      }

      const checkedPages = Array.from(
        document.querySelectorAll('#pageAccessGrid input[name="allowedPage"]:checked')
      ).map((cb) => cb.value);

      if (role !== "admin" && checkedPages.length === 0) {
        showToast("Please select at least one permitted page for this user.", "error");
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          body: JSON.stringify({
            userId,
            password,
            role,
            allowedPages: checkedPages,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.message || `HTTP ${res.status}`);
        }

        showToast(data?.message || `User "${userId}" created successfully!`);
        closeCreateUserModal();
        await loadUsers();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  }

  // Initialize
  loadUsers();
})();
