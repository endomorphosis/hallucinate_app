/**
 * Electron Preload Script - Secure IPC Bridge
 *
 * This CommonJS preload is loaded by Electron before web content.
 * It exposes a narrow IPC surface to renderer code.
 */

const { contextBridge, ipcRenderer } = require('electron');

const DASHBOARD_ACTION_TIMEOUT_MS = 5000;

async function getDashboardCapability(daemonId) {
  const catalog = await ipcRenderer.invoke('daemon:getDashboardCapabilityCatalog');
  const entry = (catalog?.servers || []).find((server) => server.daemon_id === daemonId);
  if (!entry) {
    throw new Error(`No dashboard capability catalog entry for ${daemonId}`);
  }
  return entry;
}

function dashboardReceipt(entry, operation, status, details = {}) {
  return {
    task_id: 'HAO-678',
    catalog_task_id: entry?.task_id || 'HAO-677',
    daemon_id: entry?.daemon_id,
    server_package: entry?.server_package,
    operation,
    status,
    fail_closed: status === 'fail_closed',
    endpoint: entry?.endpoint,
    health_url: entry?.health_url,
    tool_protocol: details.tool_protocol || null,
    safe_probe: details.safe_probe || null,
    message: details.message || '',
    response: details.response || null,
    error: details.error || null,
    created_at: new Date().toISOString()
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DASHBOARD_ACTION_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function dashboardHealth(daemonId) {
  const entry = await getDashboardCapability(daemonId);
  const [allStatus, health] = await Promise.all([
    ipcRenderer.invoke('daemon:getAll').catch(() => ({})),
    ipcRenderer.invoke('daemon:checkHealth', daemonId).catch((error) => ({ healthy: false, error: error.message }))
  ]);
  const daemonStatus = allStatus?.[daemonId] || null;
  const running = daemonStatus?.status === 'running';
  const healthy = Boolean(health?.healthy);
  const status = running && healthy ? 'ok' : 'fail_closed';
  return {
    entry,
    daemonStatus,
    health,
    receipt: dashboardReceipt(entry, 'daemon/health', status, {
      message: status === 'ok'
        ? `${entry.display_name || daemonId} daemon is healthy.`
        : `${entry.display_name || daemonId} daemon is not healthy; catalog-backed dashboard actions are disabled.`
    })
  };
}

async function ensureDashboardActionAllowed(daemonId, operation) {
  const healthState = await dashboardHealth(daemonId);
  if (healthState.receipt.fail_closed) {
    return {
      allowed: false,
      entry: healthState.entry,
      receipt: dashboardReceipt(healthState.entry, operation, 'fail_closed', {
        message: `${operation} blocked because ${daemonId} is not healthy.`,
        response: {
          daemon_status: healthState.daemonStatus?.status || 'unknown',
          health: healthState.health
        }
      })
    };
  }
  return { allowed: true, entry: healthState.entry, healthState };
}

async function dashboardToolsList(daemonId) {
  const allowed = await ensureDashboardActionAllowed(daemonId, 'tools/list');
  if (!allowed.allowed) {
    return allowed.receipt;
  }

  const protocol = allowed.entry.tool_protocols?.tools_list;
  if (!protocol?.url) {
    return dashboardReceipt(allowed.entry, 'tools/list', 'fail_closed', {
      message: `${daemonId} does not advertise a tools/list URL in the dashboard capability catalog.`
    });
  }

  try {
    const response = await fetchWithTimeout(protocol.url, { method: protocol.method || 'GET' });
    const text = await response.text();
    return dashboardReceipt(allowed.entry, 'tools/list', response.ok ? 'ok' : 'error', {
      tool_protocol: protocol,
      message: response.ok ? 'tools/list completed through the preload daemon bridge.' : `tools/list returned HTTP ${response.status}.`,
      response: {
        ok: response.ok,
        status: response.status,
        body_preview: text.slice(0, 500)
      }
    });
  } catch (error) {
    return dashboardReceipt(allowed.entry, 'tools/list', 'error', {
      tool_protocol: protocol,
      message: 'tools/list request failed through the preload daemon bridge.',
      error: error.message
    });
  }
}

async function dashboardToolsCall(daemonId) {
  const allowed = await ensureDashboardActionAllowed(daemonId, 'tools/call');
  if (!allowed.allowed) {
    return allowed.receipt;
  }

  const protocol = allowed.entry.tool_protocols?.tools_call;
  const safeProbe = protocol?.safeProbe;
  if (!protocol?.url || !safeProbe || safeProbe.mutation !== false) {
    return dashboardReceipt(allowed.entry, 'tools/call', 'fail_closed', {
      tool_protocol: protocol || null,
      safe_probe: safeProbe || null,
      message: `${daemonId} does not advertise a non-mutating safe tools/call probe.`
    });
  }

  try {
    const response = await fetchWithTimeout(protocol.url, {
      method: protocol.method || 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: safeProbe.tool_name,
        arguments: safeProbe.arguments || {},
        metadata: {
          task_id: 'HAO-678',
          source: 'hallucinate_app.dashboard',
          expected_receipt: safeProbe.expected_receipt,
          mutation: false
        }
      })
    });
    const text = await response.text();
    return dashboardReceipt(allowed.entry, 'tools/call', response.ok ? 'ok' : 'error', {
      tool_protocol: protocol,
      safe_probe: safeProbe,
      message: response.ok ? 'Safe tools/call probe completed through the preload daemon bridge.' : `Safe tools/call probe returned HTTP ${response.status}.`,
      response: {
        ok: response.ok,
        status: response.status,
        body_preview: text.slice(0, 500)
      }
    });
  } catch (error) {
    return dashboardReceipt(allowed.entry, 'tools/call', 'error', {
      tool_protocol: protocol,
      safe_probe: safeProbe,
      message: 'Safe tools/call probe failed through the preload daemon bridge.',
      error: error.message
    });
  }
}

async function openCatalogDashboard(daemonId) {
  const healthState = await dashboardHealth(daemonId);
  const url = healthState.entry?.menu_dashboard_url || healthState.entry?.native_dashboard_url;
  if (healthState.receipt.fail_closed) {
    return dashboardReceipt(healthState.entry, 'navigation/openDashboard', 'fail_closed', {
      message: `Dashboard navigation blocked because ${daemonId} is not healthy.`,
      response: {
        daemon_status: healthState.daemonStatus?.status || 'unknown',
        health: healthState.health
      }
    });
  }
  if (!url) {
    return dashboardReceipt(healthState.entry, 'navigation/openDashboard', 'fail_closed', {
      message: `${daemonId} does not advertise a native or menu dashboard URL.`
    });
  }

  globalThis.open?.(url, '_blank', 'noopener,noreferrer');
  return dashboardReceipt(healthState.entry, 'navigation/openDashboard', 'ok', {
    message: `Opened catalog dashboard URL for ${daemonId}.`,
    response: { url }
  });
}

contextBridge.exposeInMainWorld('electronAPI', {
  daemon: {
    getAll: () => ipcRenderer.invoke('daemon:getAll'),
    getLaunchPlan: () => ipcRenderer.invoke('daemon:getLaunchPlan'),
    getDashboardCapabilityCatalog: () => ipcRenderer.invoke('daemon:getDashboardCapabilityCatalog'),
    getDashboardCapability: (daemonId) => getDashboardCapability(daemonId),
    dashboardHealth: (daemonId) => dashboardHealth(daemonId),
    dashboardToolsList: (daemonId) => dashboardToolsList(daemonId),
    dashboardToolsCall: (daemonId) => dashboardToolsCall(daemonId),
    getLaunchReceipts: (limit) => ipcRenderer.invoke('daemon:getLaunchReceipts', limit),
    checkHealth: (daemonId) => ipcRenderer.invoke('daemon:checkHealth', daemonId),
    start: (daemonId) => ipcRenderer.invoke('daemon:start', daemonId),
    startAll: () => ipcRenderer.invoke('daemon:startAll'),
    stop: (daemonId) => ipcRenderer.invoke('daemon:stop', daemonId),
    stopAll: () => ipcRenderer.invoke('daemon:stopAll'),
    restart: (daemonId) => ipcRenderer.invoke('daemon:restart', daemonId),
    getLogs: (daemonId) => ipcRenderer.invoke('daemon:getLogs', daemonId),
    onEvent: (handler) => {
      if (typeof handler !== 'function') {
        return () => {};
      }
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on('daemon:event', listener);
      return () => ipcRenderer.removeListener('daemon:event', listener);
    },
  },
  test: {
    run: (testConfig) => ipcRenderer.invoke('test:run', testConfig),
    getResults: () => ipcRenderer.invoke('test:getResults'),
  },
  benchmark: {
    run: (benchmarkConfig) => ipcRenderer.invoke('benchmark:run', benchmarkConfig),
    getResults: () => ipcRenderer.invoke('benchmark:getResults'),
  },
  controlSurface: {
    getSnapshot: () => ipcRenderer.invoke('controlSurface:getSnapshot'),
    createRule: (policyRule) => ipcRenderer.invoke('controlSurface:createRule', policyRule),
    simulateConfirmation: (actionRequest) => ipcRenderer.invoke('controlSurface:simulateConfirmation', actionRequest),
    approveConfirmation: (confirmationId, operatorId) =>
      ipcRenderer.invoke('controlSurface:approveConfirmation', confirmationId, operatorId),
    rejectConfirmation: (confirmationId, operatorId) =>
      ipcRenderer.invoke('controlSurface:rejectConfirmation', confirmationId, operatorId),
    openOperatorConsole: () => ipcRenderer.send('open-operator-console'),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  navigation: {
    openDaemonManager: () => ipcRenderer.send('open-daemon-manager'),
    openModelTester: () => ipcRenderer.send('open-model-tester'),
    openSecurityTestDashboard: () => ipcRenderer.send('open-security-test-dashboard'),
    openDatabaseBackupDashboard: () => ipcRenderer.send('open-database-backup-dashboard'),
    openDashboard: (daemonId) => openCatalogDashboard(daemonId),
  },
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});

console.log('Secure preload script loaded');
