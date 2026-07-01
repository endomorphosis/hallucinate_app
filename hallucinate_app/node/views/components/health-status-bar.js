/**
 * Shared Health Status Bar Component
 *
 * Shows real-time connectivity status for all MCP servers.
 * Auto-updates every 10 seconds. Color-coded:
 *   green  = healthy
 *   yellow = degraded/starting
 *   red    = unreachable
 *   gray   = unknown/not checked
 *
 * Usage:
 *   <div id="health-status-bar"></div>
 *   <script src="components/health-status-bar.js"></script>
 */

(function () {
  'use strict';

  const POLL_INTERVAL_MS = 10000;
  const REQUEST_TIMEOUT_MS = 5000;

  const SERVERS = [
    { id: 'ipfs-kit', name: 'IPFS Kit', port: 8014, healthPath: '/api/mcp/status' },
    { id: 'ipfs-datasets', name: 'IPFS Datasets', port: 3002, healthPath: '/health/ready' },
    { id: 'ipfs-accelerate', name: 'IPFS Accelerate', port: 3003, healthPath: '/api/mcp/status' },
  ];

  const STATUS_COLORS = {
    healthy: '#10b981',
    degraded: '#f59e0b',
    unreachable: '#ef4444',
    unknown: '#9ca3af',
  };

  function createStatusBar() {
    const container = document.getElementById('health-status-bar');
    if (!container) return null;

    container.innerHTML = `
      <div class="hsb-container" style="
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 8px 16px;
        background: #1e293b;
        border-radius: 6px;
        margin-bottom: 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        color: #e2e8f0;
        flex-wrap: wrap;
      ">
        <span style="font-weight: 600; color: #94a3b8; margin-right: 4px;">MCP Servers</span>
        ${SERVERS.map(s => `
          <div class="hsb-server" data-server="${s.id}" style="display: flex; align-items: center; gap: 6px;">
            <span class="hsb-dot" style="
              width: 8px; height: 8px; border-radius: 50%;
              background: ${STATUS_COLORS.unknown};
              display: inline-block;
              transition: background 0.3s;
            "></span>
            <span class="hsb-name">${s.name}</span>
            <span class="hsb-port" style="color: #64748b; font-size: 11px;">:${s.port}</span>
          </div>
        `).join('')}
        <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
          <span class="hsb-last-check" style="color: #64748b; font-size: 11px;">--</span>
          <button class="hsb-refresh" style="
            background: none; border: 1px solid #475569; border-radius: 4px;
            color: #94a3b8; padding: 2px 8px; cursor: pointer; font-size: 11px;
          " title="Refresh now">↻</button>
        </div>
      </div>
    `;

    container.querySelector('.hsb-refresh').addEventListener('click', checkAllServers);
    return container;
  }

  async function checkServerHealth(server) {
    const url = `http://127.0.0.1:${server.port}${server.healthPath}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) return 'healthy';
      if (resp.status >= 500) return 'degraded';
      return 'degraded';
    } catch (err) {
      clearTimeout(timer);
      return 'unreachable';
    }
  }

  async function checkAllServers() {
    const container = document.getElementById('health-status-bar');
    if (!container) return;

    const results = await Promise.all(
      SERVERS.map(async (server) => {
        const status = await checkServerHealth(server);
        return { id: server.id, status };
      })
    );

    for (const result of results) {
      const serverEl = container.querySelector(`[data-server="${result.id}"]`);
      if (serverEl) {
        const dot = serverEl.querySelector('.hsb-dot');
        if (dot) {
          dot.style.background = STATUS_COLORS[result.status] || STATUS_COLORS.unknown;
          dot.title = result.status;
        }
      }
    }

    const lastCheck = container.querySelector('.hsb-last-check');
    if (lastCheck) {
      lastCheck.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    }

    // Dispatch event for other components
    container.dispatchEvent(new CustomEvent('health-updated', {
      detail: results,
      bubbles: true,
    }));
  }

  // Also try IPC if available (Electron renderer)
  async function checkViaIPC() {
    if (typeof window !== 'undefined' && window.electronAPI?.ipfs?.status) {
      try {
        const status = await window.electronAPI.ipfs.status();
        if (status && !status.error) {
          const container = document.getElementById('health-status-bar');
          if (!container) return;

          // Map backend response to server statuses
          const mapping = {
            'ipfs-kit': status.ipfs_kit,
            'ipfs-datasets': status.ipfs_datasets,
            'ipfs-accelerate': status.ipfs_accelerate,
          };

          for (const [id, info] of Object.entries(mapping)) {
            if (!info) continue;
            const serverEl = container.querySelector(`[data-server="${id}"]`);
            if (serverEl) {
              const dot = serverEl.querySelector('.hsb-dot');
              const statusVal = info.available ? 'healthy' : 'unreachable';
              if (dot) {
                dot.style.background = STATUS_COLORS[statusVal];
                dot.title = statusVal;
              }
            }
          }

          const lastCheck = container.querySelector('.hsb-last-check');
          if (lastCheck) {
            lastCheck.textContent = `Updated ${new Date().toLocaleTimeString()} (IPC)`;
          }
          return true;
        }
      } catch {
        // Fall through to direct HTTP
      }
    }
    return false;
  }

  async function poll() {
    const usedIPC = await checkViaIPC();
    if (!usedIPC) {
      await checkAllServers();
    }
  }

  // Initialize on DOM ready
  function init() {
    const bar = createStatusBar();
    if (bar) {
      poll();
      setInterval(poll, POLL_INTERVAL_MS);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
