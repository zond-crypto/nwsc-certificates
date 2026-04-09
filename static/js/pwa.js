(function() {
  'use strict';

  // ── 1. Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/static/sw.js', { scope: '/' })
        .then(reg => {
          console.log('[NWSC PWA] Service worker registered:', reg.scope);
          // Check for updates every 60 minutes
          setInterval(() => reg.update(), 60 * 60 * 1000);
        })
        .catch(err => console.error('[NWSC PWA] SW registration failed:', err));
    });

    // Listen for messages from SW
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SYNC_COMPLETE') showToast('Data synced successfully.');
    });
  }

  // ── 2. Capture the install prompt IMMEDIATELY
  let deferredPrompt = null;
  const PROMPT_DISMISSED_KEY = 'nwsc_install_dismissed';
  const PROMPT_INSTALLED_KEY = 'nwsc_installed';

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Only show if not already installed and not recently dismissed
    const dismissed = sessionStorage.getItem(PROMPT_DISMISSED_KEY);
    const installed = localStorage.getItem(PROMPT_INSTALLED_KEY);
    if (!dismissed && !installed) {
      // Small delay so the page is visible first
      setTimeout(showInstallBanner, 1500);
    }
  });

  // Detect successful install
  window.addEventListener('appinstalled', () => {
    localStorage.setItem(PROMPT_INSTALLED_KEY, '1');
    hideInstallBanner();
    showToast('NWSC Lab installed successfully! You can now use it offline.');
    deferredPrompt = null;
  });

  // ── 3. Build the install banner UI
  function buildBanner() {
    if (document.getElementById('nwsc-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'nwsc-install-banner';
    banner.innerHTML = `
      <div id="nwsc-install-inner">
        <img src="/static/icons/icon-72.png" alt="NWSC" id="nwsc-install-icon">
        <div id="nwsc-install-text">
          <strong>Install NWSC Lab</strong>
          <span>Works offline on any PC — no internet needed</span>
        </div>
        <button id="nwsc-install-btn">Install</button>
        <button id="nwsc-install-close" aria-label="Dismiss">&times;</button>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #nwsc-install-banner {
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999;
        background: #fff; border-top: 3px solid #0077B6;
        box-shadow: 0 -4px 24px rgba(0,119,182,0.18);
        padding: 14px 20px; transform: translateY(100%);
        transition: transform 0.35s cubic-bezier(.22,.61,.36,1);
        font-family: system-ui, sans-serif;
      }
      #nwsc-install-banner.show { transform: translateY(0); }
      #nwsc-install-inner {
        display: flex; align-items: center; gap: 14px;
        max-width: 640px; margin: 0 auto;
      }
      #nwsc-install-icon { width: 48px; height: 48px; border-radius: 10px; flex-shrink: 0; }
      #nwsc-install-text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
      #nwsc-install-text strong { font-size: 15px; color: #0077B6; }
      #nwsc-install-text span   { font-size: 12px; color: #666; }
      #nwsc-install-btn {
        background: #0077B6; color: #fff; border: none; border-radius: 8px;
        padding: 10px 22px; font-size: 14px; font-weight: 600;
        cursor: pointer; white-space: nowrap; flex-shrink: 0;
        transition: background 0.15s;
      }
      #nwsc-install-btn:hover { background: #005f8f; }
      #nwsc-install-close {
        background: none; border: none; font-size: 22px; color: #aaa;
        cursor: pointer; padding: 4px 8px; flex-shrink: 0; line-height: 1;
      }
      #nwsc-install-close:hover { color: #555; }
      #nwsc-toast {
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%) translateY(20px);
        background: #1a1a2e; color: #fff; padding: 10px 20px; border-radius: 8px;
        font-size: 13px; opacity: 0; transition: all 0.3s; z-index: 100000;
        white-space: nowrap; pointer-events: none;
      }
      #nwsc-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
      #nwsc-offline-indicator {
        position: fixed; top: 0; left: 0; right: 0; z-index: 99998;
        background: #e74c3c; color: #fff; text-align: center;
        font-size: 13px; padding: 6px; font-family: system-ui, sans-serif;
        transform: translateY(-100%); transition: transform 0.3s;
      }
      #nwsc-offline-indicator.show { transform: translateY(0); }
    `;

    document.head.appendChild(style);
    document.body.appendChild(banner);

    // Toast element
    const toast = document.createElement('div');
    toast.id = 'nwsc-toast';
    document.body.appendChild(toast);

    // Offline indicator
    const offlineBanner = document.createElement('div');
    offlineBanner.id = 'nwsc-offline-indicator';
    offlineBanner.textContent = '⚠ You are offline — PDFs will be saved locally';
    document.body.appendChild(offlineBanner);

    // Button handlers
    document.getElementById('nwsc-install-btn').addEventListener('click', triggerInstall);
    document.getElementById('nwsc-install-close').addEventListener('click', dismissBanner);
  }

  function showInstallBanner() {
    buildBanner();
    requestAnimationFrame(() => {
      document.getElementById('nwsc-install-banner')?.classList.add('show');
    });
  }

  function hideInstallBanner() {
    document.getElementById('nwsc-install-banner')?.classList.remove('show');
  }

  function dismissBanner() {
    hideInstallBanner();
    sessionStorage.setItem(PROMPT_DISMISSED_KEY, '1');
  }

  async function triggerInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      hideInstallBanner();
    } else {
      sessionStorage.setItem(PROMPT_DISMISSED_KEY, '1');
      hideInstallBanner();
    }
    deferredPrompt = null;
  }

  // ── 4. Toast helper
  let toastTimer;
  function showToast(msg) {
    const t = document.getElementById('nwsc-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  // ── 5. Offline/Online detection
  function updateOnlineStatus() {
    const indicator = document.getElementById('nwsc-offline-indicator');
    if (!navigator.onLine) {
      indicator?.classList.add('show');
    } else {
      indicator?.classList.remove('show');
      if (document._wasOffline) showToast('Back online — syncing data...');
    }
    document._wasOffline = !navigator.onLine;
  }

  // Build the offline indicator early
  window.addEventListener('DOMContentLoaded', () => {
    updateOnlineStatus();
  });
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // ── 6. PDF offline fallback
  // Intercept PDF download buttons when offline
  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-pdf-download], .pdf-download-btn');
    if (!btn || navigator.onLine) return;
    e.preventDefault();
    e.stopPropagation();
    showToast('Offline — PDF saved to downloads queue. Will download when online.');
    // Save button metadata for later
    const queue = JSON.parse(localStorage.getItem('nwsc_pdf_queue') || '[]');
    queue.push({ url: btn.href || btn.dataset.url, label: btn.textContent.trim(), ts: Date.now() });
    localStorage.setItem('nwsc_pdf_queue', JSON.stringify(queue));
  });

  // Flush PDF queue when back online
  window.addEventListener('online', async () => {
    const queue = JSON.parse(localStorage.getItem('nwsc_pdf_queue') || '[]');
    if (!queue.length) return;
    showToast(`Downloading ${queue.length} queued PDF(s)...`);
    for (const item of queue) {
      try {
        const res = await fetch(item.url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = item.label.replace(/\s+/g, '_') + '.pdf';
        a.click();
        await new Promise(r => setTimeout(r, 600));
      } catch (err) { console.error('PDF flush failed:', err); }
    }
    localStorage.removeItem('nwsc_pdf_queue');
  });

})();
