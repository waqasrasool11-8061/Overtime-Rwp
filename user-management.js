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

  // Render Admins
  function renderAdmins() {
    if (!allAdmins.length) {
      adminsContainer.innerHTML = `<p class="helper-text">No admin accounts found.</p>`;
      return;
    }

    adminsContainer.innerHTML = allAdmins
      .map((admin) => {
        const isMain = admin.role === "admin";
        const roleLabel = isMain ? "Main Admin (Full Access)" : "Restricted Admin";
        const roleBadgeClass = isMain ? "badge-role-main" : "badge-role-restricted";
        const adminKey = `admin_${admin.userId}`;
        const isRevealed = revealedPasswords.has(adminKey);
        const displayPassword = isRevealed ? escapeHtml(admin.password) : "••••••••";
        const maskClass = isRevealed ? "" : "is-masked";

        return `
        <div class="um-admin-card ${isMain ? "is-main-admin" : "is-restricted"}">
          <div class="um-admin-top">
            <div>
              <h3 class="um-admin-name">${escapeHtml(admin.userId)}</h3>
              <span class="${roleBadgeClass}">${roleLabel}</span>
            </div>
            <button class="btn-sm-edit edit-admin-btn" data-user-id="${escapeHtml(admin.userId)}" data-role="${escapeHtml(roleLabel)}" type="button">
              &#x270E; Edit Password
            </button>
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
          <td><strong style="font-family: monospace; color: #0969da;">${escapeHtml(emp.sapId)}</strong></td>
          <td><strong style="color: #0f172a;">${escapeHtml(emp.name)}</strong></td>
          <td style="color: #64748b; font-size: 0.85rem;">${escapeHtml(emp.designation)}</td>
          <td>
            <div class="um-password-box" style="margin: 0;">
              <span class="um-pwd-text ${maskClass}" id="pwd_${empKey}">${displayPassword}</span>
              <button class="btn-pwd-action toggle-pwd-btn" data-key="${empKey}" data-pwd="${escapeHtml(emp.password)}" type="button" title="Toggle Show/Hide">
                ${isRevealed ? "&#x1F648;" : "&#x1F441;&#xFE0F;"}
              </button>
              <button class="btn-pwd-action copy-pwd-btn" data-pwd="${escapeHtml(emp.password)}" type="button" title="Copy password">
                &#x1F4CB;
              </button>
            </div>
          </td>
          <td>${statusBadge}</td>
          <td style="text-align: center; white-space: nowrap;">
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

  // Initialize
  loadUsers();
})();
