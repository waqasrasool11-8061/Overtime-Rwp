// PWA Registration & Install Prompt Handler
(function () {
  // Register Service Worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[PWA] Service Worker registered with scope:", reg.scope);
        })
        .catch((err) => {
          console.warn("[PWA] Service Worker registration failed:", err);
        });
    });
  }

  let deferredPrompt = null;

  // Listen for browser install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    // Prevent mini-infobar on mobile
    e.preventDefault();
    deferredPrompt = e;
    showInstallPromotion();
  });

  function showInstallPromotion() {
    // Check if already dismissed or already exists
    if (document.getElementById("pwaInstallBtn") || sessionStorage.getItem("pwa_dismissed")) {
      return;
    }

    const container = document.createElement("div");
    container.id = "pwaInstallContainer";
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      background: linear-gradient(135deg, #1e3e62 0%, #0b192c 100%);
      color: #ffffff;
      padding: 12px 18px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      gap: 12px;
      border: 1px solid rgba(243, 156, 18, 0.4);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: pwaSlideUp 0.4s ease-out;
    `;

    const text = document.createElement("div");
    text.innerHTML = `
      <strong style="display:block; font-size: 13px; color: #f39c12;">Pakistan Railways App</strong>
      <span style="font-size: 11px; opacity: 0.85;">Install app on your phone</span>
    `;

    const installBtn = document.createElement("button");
    installBtn.id = "pwaInstallBtn";
    installBtn.textContent = "📲 Install";
    installBtn.style.cssText = `
      background: #f39c12;
      color: #0b192c;
      border: none;
      padding: 7px 14px;
      border-radius: 8px;
      font-weight: bold;
      font-size: 12px;
      cursor: pointer;
      transition: transform 0.15s, background 0.15s;
    `;
    installBtn.onmouseover = () => (installBtn.style.background = "#e67e22");
    installBtn.onmouseout = () => (installBtn.style.background = "#f39c12");

    installBtn.onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log("[PWA] User choice:", outcome);
      deferredPrompt = null;
      container.remove();
    };

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: #ffffff;
      opacity: 0.6;
      font-size: 14px;
      cursor: pointer;
      padding: 0 4px;
    `;
    closeBtn.onclick = () => {
      sessionStorage.setItem("pwa_dismissed", "1");
      container.remove();
    };

    container.appendChild(text);
    container.appendChild(installBtn);
    container.appendChild(closeBtn);
    document.body.appendChild(container);
  }

  // Handle successful install
  window.addEventListener("appinstalled", () => {
    console.log("[PWA] App installed successfully!");
    deferredPrompt = null;
    const el = document.getElementById("pwaInstallContainer");
    if (el) el.remove();
  });
})();
