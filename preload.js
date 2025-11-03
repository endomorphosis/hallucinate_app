/**
 * Electron Preload Script - Secure IPC Bridge
 * 
 * This script runs in the renderer process before web content loads.
 * It provides a secure API bridge between the renderer and main processes.
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose secure API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Daemon management
  daemon: {
    getAll: () => ipcRenderer.invoke('daemon:getAll'),
    start: (daemonId) => ipcRenderer.invoke('daemon:start', daemonId),
    stop: (daemonId) => ipcRenderer.invoke('daemon:stop', daemonId),
    restart: (daemonId) => ipcRenderer.invoke('daemon:restart', daemonId),
    getLogs: (daemonId) => ipcRenderer.invoke('daemon:getLogs', daemonId),
  },
  
  // Test handlers
  test: {
    run: (testConfig) => ipcRenderer.invoke('test:run', testConfig),
    getResults: () => ipcRenderer.invoke('test:getResults'),
  },
  
  // Benchmark handlers
  benchmark: {
    run: (benchmarkConfig) => ipcRenderer.invoke('benchmark:run', benchmarkConfig),
    getResults: () => ipcRenderer.invoke('benchmark:getResults'),
  },
  
  // Window management
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  
  // Platform info
  platform: process.platform,
  
  // Version info
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});

// Log when preload is ready
console.log('🔒 Secure preload script loaded');
