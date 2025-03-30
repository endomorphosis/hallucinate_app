/**
 * Register IPFS Kit Dashboard
 * 
 * This script registers the IPFS Kit dashboard component with the main dashboard.
 */

import IPFSKitDashboard from './ipfs_kit_dashboard.js';

/**
 * Register the IPFS Kit dashboard component.
 * 
 * @param {Object} dashboard - Main dashboard instance
 * @param {Object} options - Additional options
 * @returns {Object} Registered component
 */
export function registerIPFSKitDashboard(dashboard, options = {}) {
  // Create container for IPFS Kit dashboard
  const container = document.createElement('div');
  container.className = 'dashboard-panel';
  container.id = 'ipfs-kit-dashboard-panel';
  
  // Add the panel to the dashboard
  dashboard.addPanel({
    id: 'ipfs-kit',
    title: 'IPFS Kit',
    element: container,
    icon: 'network', // Or any appropriate icon name
    priority: options.priority || 50,
  });
  
  // Create RPC handler
  const rpcHandler = async (method, params = {}) => {
    // This function should bridge to the Python backend
    // Implementation depends on your dashboard's communication method
    
    return await dashboard.callPythonBridge('ipfs_kit_rpc', {
      method,
      params
    });
  };
  
  // Create dashboard component
  const ipfsKitDashboard = new IPFSKitDashboard({
    container,
    rpcHandler,
    options: {
      ...options,
      theme: dashboard.getTheme(), // Inherit theme from main dashboard
    }
  });
  
  // Auto-initialize if specified
  if (options.autoInitialize) {
    ipfsKitDashboard.initialize();
  }
  
  // Handle dashboard theme changes
  dashboard.on('themeChanged', (theme) => {
    ipfsKitDashboard.config.theme = theme;
    ipfsKitDashboard.render();
  });
  
  // Handle dashboard dispose
  dashboard.on('dispose', () => {
    ipfsKitDashboard.dispose();
  });
  
  return ipfsKitDashboard;
}

/**
 * Initialize the IPFS Kit dashboard registration.
 * 
 * This function is called automatically when the script is imported.
 */
export async function initIPFSKitDashboard() {
  // Check if the dashboard global is available
  if (typeof globalThis.dashboard !== 'undefined') {
    // Register with the global dashboard
    return registerIPFSKitDashboard(globalThis.dashboard, {
      autoInitialize: true,
    });
  } else {
    console.warn('Main dashboard not found. IPFS Kit dashboard not registered.');
    return null;
  }
}

// Auto-initialize if not imported as a module
if (typeof globalThis.document !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIPFSKitDashboard);
  } else {
    initIPFSKitDashboard();
  }
}

export default {
  registerIPFSKitDashboard,
  initIPFSKitDashboard,
};