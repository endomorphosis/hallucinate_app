/**
 * Electron Preload Script - Secure IPC Bridge
 *
 * This CommonJS preload is loaded by Electron before web content.
 * It exposes a narrow IPC surface to renderer code.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  daemon: {
    getAll: () => ipcRenderer.invoke('daemon:getAll'),
    getLaunchPlan: () => ipcRenderer.invoke('daemon:getLaunchPlan'),
    getDashboardCapabilityCatalog: () => ipcRenderer.invoke('daemon:getDashboardCapabilityCatalog'),
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
  },
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});

console.log('Secure preload script loaded');
