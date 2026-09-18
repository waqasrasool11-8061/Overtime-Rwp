// ══════════════════════════════════════════════════════════════════
// ADMIN CHAT INBOX CLIENT ENGINE
// ══════════════════════════════════════════════════════════════════
(function () {
  const authBaseUrl = window.location.port === "5500" ? `http://${window.location.hostname}:3000` : "";

  // State
  let allThreads = [];
  let allStaffDirectory = [];
  let selectedEmployee = null;
  let selectedEmployeeMeta = null;
  let activeTab = "all"; // 'all' | 'unread' | 'directory'
  let searchQuery = "";
  let pollInterval = null;
  let lastMessageCount = 0;

  // DOM Elements
  const chatSidebar = document.getElementById("chatSidebar");
  const chatMainPanel = document.getElementById("chatMainPanel");
  const chatThreadsList = document.getElementById("chatThreadsList");
  const chatSearchInput = document.getElementById("chatSearchInput");
  const sidebarTotalUnread = document.getElementById("sidebarTotalUnread");
  const countAllChats = document.getElementById("countAllChats");
  const countUnreadChats = document.getElementById("countUnreadChats");

  const tabFilterAll = document.getElementById("tabFilterAll");
  const tabFilterUnread = document.getElementById("tabFilterUnread");
  const tabFilterDirectory = document.getElementById("tabFilterDirectory");

  const chatEmptyView = document.getElementById("chatEmptyView");
  const chatActiveView = document.getElementById("chatActiveView");
  const activeChatAvatar = document.getElementById("activeChatAvatar");
  const activeChatName = document.getElementById("activeChatName");
  const activeChatSap = document.getElementById("activeChatSap");
  const activeChatDesg = document.getElementById("activeChatDesg");
  const activeChatStation = document.getElementById("activeChatStation");
  const activeChatPortalLink = document.getElementById("activeChatPortalLink");

  const chatStream = document.getElementById("chatStream");
  const chatComposerForm = document.getElementById("chatComposerForm");
  const chatMessageInput = document.getElementById("chatMessageInput");
  const btnRefreshThread = document.getElementById("btnRefreshThread");
  const btnBackToSidebar = document.getElementById("btnBackToSidebar");

  // Helper: Escape HTML to prevent XSS
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Helper: Format initials
  function getInitials(name) {
    if (!name) return "PR";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Helper: Format Time / Date
  function formatMsgTime(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isToday) return timeStr;
    return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${timeStr}`;
  }

  function formatDateDivider(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return "Today";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  // 1. Initialize Staff Directory from Employee_Master.data.js
  function loadStaffDirectory() {
    try {
      if (window.employeeMasterData && Array.isArray(window.employeeMasterData.rows)) {
        const headerRows = Number(window.employeeMasterData.headerRows || 4);
        const rows = window.employeeMasterData.rows.slice(headerRows);
        const staff = [];
        const seen = new Set();
        rows.forEach(r => {
          if (!Array.isArray(r)) return;
          const sapId = String(r[0] || "").trim();
          const name = String(r[1] || "").trim();
          const designation = String(r[2] || "Staff").trim();
          const station = String(r[4] || "RWP").trim();
          if (name && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            staff.push({ name, sapId, designation, station });
          }
        });
        allStaffDirectory = staff.sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (e) {
      console.warn("Could not parse staff directory:", e);
    }
  }

  function getStaffMeta(empName) {
    if (!empName) return { sapId: "", designation: "Staff", station: "RWP" };
    const found = allStaffDirectory.find(s => s.name.toLowerCase() === empName.toLowerCase());
    if (found) return found;
    return { sapId: "", designation: "Running Staff", station: "RAWALPINDI" };
  }

  // 2. Fetch Threads from Server
  async function fetchThreads() {
    try {
      const res = await fetch(`${authBaseUrl}/api/chat/threads`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      allThreads = Array.isArray(data.threads) ? data.threads : [];
      renderThreads();
    } catch (err) {
      console.error("Failed to load threads:", err);
    }
  }

  // 3. Render Thread List in Left Sidebar
  function renderThreads() {
    chatThreadsList.innerHTML = "";

    // Calculate totals
    const totalUnread = allThreads.reduce((sum, t) => sum + (t.unreadCount || 0), 0);
    if (totalUnread > 0) {
      sidebarTotalUnread.textContent = `${totalUnread} unread`;
      sidebarTotalUnread.style.display = "inline-block";
    } else {
      sidebarTotalUnread.style.display = "none";
    }

    countAllChats.textContent = String(allThreads.length);
    const unreadThreadsCount = allThreads.filter(t => t.unreadCount > 0).length;
    countUnreadChats.textContent = String(unreadThreadsCount);

    const query = searchQuery.trim().toLowerCase();

    if (activeTab === "directory") {
      // Render full staff directory
      const filteredStaff = allStaffDirectory.filter(s => {
        if (!query) return true;
        return s.name.toLowerCase().includes(query) ||
          s.sapId.toLowerCase().includes(query) ||
          s.designation.toLowerCase().includes(query);
      });

      if (!filteredStaff.length) {
        chatThreadsList.innerHTML = '<li style="padding: 20px; text-align: center; color: #64748b; font-size: 0.88rem;">No staff found matching query.</li>';
        return;
      }

      filteredStaff.forEach(s => {
        const li = document.createElement("li");
        li.className = "chat-thread-item";
        if (selectedEmployee && selectedEmployee.toLowerCase() === s.name.toLowerCase()) {
          li.classList.add("active");
        }

        const desgClass = s.designation.toLowerCase().includes("driver") ? "avatar-driver" : "avatar-asst";
        li.innerHTML = `
          <div class="chat-avatar ${desgClass}">${escapeHtml(getInitials(s.name))}</div>
          <div class="chat-thread-content">
            <div class="chat-thread-top">
              <span class="chat-thread-name">${escapeHtml(s.name)}</span>
            </div>
            <div class="chat-thread-meta">
              <span class="chat-sap-tag">SAP: ${escapeHtml(s.sapId || "—")}</span>
              <span>${escapeHtml(s.designation)}</span>
            </div>
          </div>
        `;

        li.addEventListener("click", () => {
          selectEmployeeThread(s.name, s);
        });

        chatThreadsList.appendChild(li);
      });
      return;
    }

    // Tab is 'all' or 'unread'
    let list = allThreads;
    if (activeTab === "unread") {
      list = list.filter(t => (t.unreadCount || 0) > 0);
    }

    if (query) {
      list = list.filter(t => {
        return (t.employeeName || "").toLowerCase().includes(query) ||
          (t.sapId || "").toLowerCase().includes(query) ||
          (t.designation || "").toLowerCase().includes(query) ||
          (t.lastMessage || "").toLowerCase().includes(query);
      });
    }

    if (!list.length) {
      const msg = activeTab === "unread" ? "No unread messages." : "No conversations found.";
      chatThreadsList.innerHTML = `<li style="padding: 24px; text-align: center; color: #64748b; font-size: 0.88rem;">${msg}</li>`;
      return;
    }

    list.forEach(t => {
      const li = document.createElement("li");
      li.className = "chat-thread-item";
      if (t.unreadCount > 0) li.classList.add("has-unread");
      if (selectedEmployee && selectedEmployee.toLowerCase() === (t.employeeName || "").toLowerCase()) {
        li.classList.add("active");
      }

      const meta = getStaffMeta(t.employeeName);
      const sap = t.sapId || meta.sapId;
      const desg = t.designation || meta.designation || "Staff";
      const desgClass = desg.toLowerCase().includes("driver") ? "avatar-driver" : "avatar-asst";

      li.innerHTML = `
        <div class="chat-avatar ${desgClass}">${escapeHtml(getInitials(t.employeeName))}</div>
        <div class="chat-thread-content">
          <div class="chat-thread-top">
            <span class="chat-thread-name">${escapeHtml(t.employeeName)}</span>
            <span class="chat-thread-time">${formatMsgTime(t.lastTimestamp)}</span>
          </div>
          <div class="chat-thread-meta">
            <span class="chat-sap-tag">SAP: ${escapeHtml(sap || "—")}</span>
            <span>${escapeHtml(desg)}</span>
          </div>
          <div class="chat-thread-snippet-row">
            <span class="chat-thread-snippet">${escapeHtml(t.lastMessage || "No messages yet")}</span>
            ${t.unreadCount > 0 ? `<span class="chat-thread-unread-badge">${t.unreadCount}</span>` : ""}
          </div>
        </div>
      `;

      li.addEventListener("click", () => {
        selectEmployeeThread(t.employeeName, { sapId: sap, designation: desg, station: meta.station });
      });

      chatThreadsList.appendChild(li);
    });
  }

  // 4. Select an Employee Thread
  async function selectEmployeeThread(empName, meta) {
    if (!empName) return;
    selectedEmployee = empName;
    selectedEmployeeMeta = meta || getStaffMeta(empName);

    // Switch view
    chatEmptyView.style.display = "none";
    chatActiveView.style.display = "flex";

    // Populate Topbar
    activeChatName.textContent = selectedEmployee;
    activeChatAvatar.textContent = getInitials(selectedEmployee);
    activeChatSap.textContent = `SAP: ${selectedEmployeeMeta.sapId || "—"}`;
    activeChatDesg.textContent = selectedEmployeeMeta.designation || "Running Staff";
    activeChatStation.textContent = selectedEmployeeMeta.station || "RAWALPINDI";
    activeChatPortalLink.href = `employee-home.html?emp=${encodeURIComponent(selectedEmployee)}`;

    // Re-render thread list to highlight active item
    renderThreads();

    // Handle mobile view toggle
    if (window.innerWidth <= 860) {
      chatSidebar.classList.add("mobile-hidden");
      chatMainPanel.classList.remove("mobile-hidden");
    }

    // Mark messages as read on server
    markEmployeeMessagesRead(selectedEmployee);

    // Load messages
    await loadActiveThreadMessages();
    chatMessageInput.focus();
  }

  // 5. Mark messages from employee as read
  async function markEmployeeMessagesRead(empName) {
    try {
      const res = await fetch(`${authBaseUrl}/api/chat/mark-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ employee: empName })
      });
      if (res.ok) {
        const t = allThreads.find(item => (item.employeeName || "").toLowerCase() === empName.toLowerCase());
        if (t) t.unreadCount = 0;
        renderThreads();
        // Update navbar badge if available
        const badges = document.querySelectorAll(".chat-nav-badge");
        const remainingUnread = allThreads.reduce((s, it) => s + (it.unreadCount || 0), 0);
        badges.forEach(b => {
          if (remainingUnread > 0) {
            b.textContent = remainingUnread > 99 ? "99+" : String(remainingUnread);
            b.style.display = "inline-block";
          } else {
            b.style.display = "none";
          }
        });
      }
    } catch (e) {
      console.warn("Failed to mark messages as read:", e);
    }
  }

  // 6. Load Messages for Active Thread
  async function loadActiveThreadMessages(isBackground = false) {
    if (!selectedEmployee) return;

    try {
      const res = await fetch(`${authBaseUrl}/api/chat/messages?employee=${encodeURIComponent(selectedEmployee)}`, {
        credentials: "include"
      });
      if (!res.ok) return;
      const data = await res.json();
      const messages = Array.isArray(data.messages) ? data.messages : [];

      if (isBackground && messages.length === lastMessageCount) {
        return;
      }

      lastMessageCount = messages.length;
      renderMessageStream(messages);
    } catch (err) {
      console.error("Failed to load thread messages:", err);
    }
  }

  // 7. Render Stream in Message Area
  function renderMessageStream(messages) {
    chatStream.innerHTML = "";

    if (!messages.length) {
      chatStream.innerHTML = `
        <div style="text-align: center; margin: 40px auto; color: #64748b; font-size: 0.9rem;">
          <p style="font-size: 1.8rem; margin: 0 0 6px 0;">💬</p>
          <strong>No conversation history with ${escapeHtml(selectedEmployee)}.</strong>
          <p style="margin: 4px 0 0 0; font-size: 0.82rem;">Type a reply or inquiry below to start the conversation.</p>
        </div>
      `;
      return;
    }

    let lastDateStr = "";

    messages.forEach(m => {
      const msgDateStr = m.timestamp ? new Date(m.timestamp).toDateString() : "";
      if (msgDateStr && msgDateStr !== lastDateStr) {
        lastDateStr = msgDateStr;
        const dateDiv = document.createElement("div");
        dateDiv.className = "chat-date-chip";
        dateDiv.textContent = formatDateDivider(m.timestamp);
        chatStream.appendChild(dateDiv);
      }

      const isEmployee = m.senderRole === "employee" || String(m.sender || "").toLowerCase() === selectedEmployee.toLowerCase();
      const row = document.createElement("div");
      row.className = isEmployee ? "chat-bubble-row emp-row" : "chat-bubble-row admin-row";

      const box = document.createElement("div");
      box.className = isEmployee ? "chat-bubble-box emp-box" : "chat-bubble-box admin-box";

      const senderDiv = document.createElement("div");
      senderDiv.className = isEmployee ? "chat-bubble-sender emp-sender" : "chat-bubble-sender admin-sender";
      senderDiv.textContent = isEmployee ? (m.sender || selectedEmployee) : "👑 Vicky Ch (Main Admin)";

      const textDiv = document.createElement("div");
      textDiv.className = "chat-bubble-text";
      textDiv.textContent = m.text;

      const metaDiv = document.createElement("div");
      metaDiv.className = "chat-bubble-meta";
      metaDiv.innerHTML = `
        <span>${formatMsgTime(m.timestamp)}</span>
        ${!isEmployee ? '<span title="Delivered">✓✓</span>' : ""}
      `;

      box.appendChild(senderDiv);
      box.appendChild(textDiv);
      box.appendChild(metaDiv);
      row.appendChild(box);
      chatStream.appendChild(row);
    });

    chatStream.scrollTop = chatStream.scrollHeight;
  }

  // 8. Send Reply
  chatComposerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    const text = chatMessageInput.value.trim();
    if (!text) return;

    const btn = document.getElementById("btnSendMessage");
    btn.disabled = true;

    try {
      const res = await fetch(`${authBaseUrl}/api/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text: text,
          receiver: selectedEmployee
        })
      });

      if (res.ok) {
        chatMessageInput.value = "";
        chatMessageInput.style.height = "auto";
        await loadActiveThreadMessages();
        fetchThreads();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Failed to send message: ${errData.message || res.statusText}`);
      }
    } catch (err) {
      console.error("Error sending message:", err);
      alert("Network error: Could not send message.");
    } finally {
      btn.disabled = false;
      chatMessageInput.focus();
    }
  });

  // Enter to send (Shift+Enter for new line)
  chatMessageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatComposerForm.dispatchEvent(new Event("submit"));
    }
  });

  // Auto-expand textarea
  chatMessageInput.addEventListener("input", () => {
    chatMessageInput.style.height = "auto";
    chatMessageInput.style.height = Math.min(chatMessageInput.scrollHeight, 120) + "px";
  });

  // Quick Reply chips
  document.querySelectorAll(".chat-quick-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const txt = chip.getAttribute("data-text");
      if (txt) {
        chatMessageInput.value = txt;
        chatMessageInput.style.height = "auto";
        chatMessageInput.style.height = Math.min(chatMessageInput.scrollHeight, 120) + "px";
        chatMessageInput.focus();
      }
    });
  });

  // Filter Tabs click
  [tabFilterAll, tabFilterUnread, tabFilterDirectory].forEach(btn => {
    btn.addEventListener("click", () => {
      [tabFilterAll, tabFilterUnread, tabFilterDirectory].forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.getAttribute("data-tab");
      renderThreads();
    });
  });

  // Search filter
  chatSearchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderThreads();
  });

  // Manual refresh thread button
  btnRefreshThread.addEventListener("click", () => {
    loadActiveThreadMessages();
    fetchThreads();
  });

  // Mobile Back button
  btnBackToSidebar.addEventListener("click", () => {
    chatSidebar.classList.remove("mobile-hidden");
    chatMainPanel.classList.add("mobile-hidden");
  });

  // 9. Auto Polling Loop (every 4 seconds)
  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (selectedEmployee) {
        await loadActiveThreadMessages(true);
      }
      fetchThreads();
    }, 4000);
  }

  // 10. Check URL query params for auto-open
  function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const empParam = urlParams.get("employee") || urlParams.get("emp");
    if (empParam) {
      const meta = getStaffMeta(empParam);
      selectEmployeeThread(empParam, meta);
    }
  }

  // Boot
  loadStaffDirectory();
  fetchThreads().then(() => {
    checkUrlParams();
    startPolling();
  });

})();
