/**
 * Sidebar Navigation Component
 *
 * Persistent sidebar showing all available dashboard surfaces with
 * health indicators and keyboard shortcut hints.
 *
 * Usage:
 *   <div id="sidebar-nav"></div>
 *   <script src="components/sidebar-nav.js"></script>
 */

(function () {
  'use strict';

  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: '⌂', href: 'dashboard.html', shortcut: '⌘D' },
    { id: 'daemon-manager', label: 'Daemon Manager', icon: '⚙', href: 'daemon_manager.html', shortcut: '⌘M' },
    { id: 'ipfs-kit', label: 'IPFS Kit', icon: '📦', href: 'ipfs_kit_dashboard.html', shortcut: '⌘⌥1', daemon: 'ipfs-kit' },
    { id: 'ipfs-datasets', label: 'IPFS Datasets', icon: '📊', href: 'ipfs_datasets_dashboard.html', shortcut: '⌘⌥2', daemon: 'ipfs-datasets' },
    { id: 'ipfs-accelerate', label: 'IPFS Accelerate', icon: '⚡', href: 'ipfs_accelerate_dashboard.html', shortcut: '⌘⌥3', daemon: 'ipfs-accelerate' },
    { id: 'model-tester', label: 'Model Tester', icon: '🧪', href: 'model_tester.html' },
    { id: 'settings', label: 'Settings', icon: '🔧', href: 'settings.html' },
    { id: 'auth', label: 'Authentication', icon: '🔑', href: 'auth_dashboard.html' },
    { id: 'benchmark', label: 'Benchmark', icon: '📈', href: 'benchmark_dashboard.html' },
    { id: 'database', label: 'Database Backup', icon: '💾', href: 'database_backup_dashboard.html' },
    { id: 'usage', label: 'Usage', icon: '📉', href: 'usage_dashboard.html' },
  ];

  function getCurrentPage() {
    const path = window.location.pathname || window.location.href;
    const filename = path.split('/').pop() || '';
    return filename;
  }

  function createSidebar() {
    const container = document.getElementById('sidebar-nav');
    if (!container) return null;

    const currentPage = getCurrentPage();

    container.innerHTML = `
      <nav class="sn-container" style="
        width: 220px; background: #1e293b; color: #e2e8f0;
        padding: 12px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px; height: 100%; overflow-y: auto;
        border-right: 1px solid #334155;
      ">
        <div style="padding: 0 12px 12px; border-bottom: 1px solid #334155; margin-bottom: 8px;">
          <span style="font-weight: 700; font-size: 14px; color: #f1f5f9;">Hallucinate App</span>
        </div>
        <ul style="list-style: none; margin: 0; padding: 0;">
          ${NAV_ITEMS.map(item => {
            const isActive = currentPage === item.href;
            return `
              <li class="sn-item${isActive ? ' sn-active' : ''}" data-nav="${item.id}" style="
                margin: 2px 8px; border-radius: 4px;
                ${isActive ? 'background: #334155;' : ''}
              ">
                <a href="${item.href}" style="
                  display: flex; align-items: center; padding: 8px 12px;
                  text-decoration: none; color: ${isActive ? '#f1f5f9' : '#94a3b8'};
                  gap: 8px; border-radius: 4px;
                  transition: background 0.15s, color 0.15s;
                " onmouseover="this.style.background='#334155';this.style.color='#f1f5f9'"
                   onmouseout="this.style.background='${isActive ? '#334155' : 'transparent'}';this.style.color='${isActive ? '#f1f5f9' : '#94a3b8'}'">
                  <span style="width: 20px; text-align: center;">${item.icon}</span>
                  <span style="flex: 1;">${item.label}</span>
                  ${item.daemon ? `<span class="sn-health-dot" data-daemon="${item.daemon}" style="
                    width: 6px; height: 6px; border-radius: 50%; background: #4b5563;
                  "></span>` : ''}
                  ${item.shortcut ? `<span style="font-size: 10px; color: #64748b;">${item.shortcut}</span>` : ''}
                </a>
              </li>
            `;
          }).join('')}
        </ul>
      </nav>
    `;

    // Listen for health updates from the health-status-bar
    document.addEventListener('health-updated', (e) => {
      const results = e.detail || [];
      for (const result of results) {
        const dot = container.querySelector(`.sn-health-dot[data-daemon="${result.id}"]`);
        if (dot) {
          const colors = { healthy: '#10b981', degraded: '#f59e0b', unreachable: '#ef4444', unknown: '#4b5563' };
          dot.style.background = colors[result.status] || colors.unknown;
        }
      }
    });

    return container;
  }

  function init() {
    createSidebar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
