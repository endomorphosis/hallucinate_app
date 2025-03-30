/**
 * Register IPFS Datasets Dashboard
 * 
 * This script registers the IPFS Datasets dashboard component with the main dashboard.
 */

import IPFSDatasetsDashboard from './ipfs_datasets_dashboard.js';

/**
 * Register the IPFS Datasets dashboard component.
 * 
 * @param {Object} dashboard - Main dashboard instance
 * @param {Object} options - Additional options
 * @returns {Object} Registered component
 */
export function registerIPFSDatasetsDashboard(dashboard, options = {}) {
  // Create container for IPFS Datasets dashboard
  const container = document.createElement('div');
  container.className = 'dashboard-panel';
  container.id = 'ipfs-datasets-dashboard-panel';
  
  // Add the panel to the dashboard
  dashboard.addPanel({
    id: 'ipfs-datasets',
    title: 'IPFS Datasets',
    element: container,
    icon: 'database', // Or any appropriate icon name
    priority: options.priority || 55, // Just after IPFS Kit at 50
  });
  
  // Create RPC handler
  const rpcHandler = async (method, params = {}) => {
    // This function should bridge to the Python backend
    // Implementation depends on your dashboard's communication method
    
    return await dashboard.callPythonBridge('ipfs_datasets_rpc', {
      method,
      params
    });
  };
  
  // Create dashboard component
  const ipfsDatasetsDashboard = new IPFSDatasetsDashboard({
    container,
    rpcHandler,
    options: {
      ...options,
      theme: dashboard.getTheme(), // Inherit theme from main dashboard
    }
  });
  
  // Auto-initialize if specified
  if (options.autoInitialize) {
    ipfsDatasetsDashboard.initialize();
  }
  
  // Handle dashboard theme changes
  dashboard.on('themeChanged', (theme) => {
    ipfsDatasetsDashboard.config.theme = theme;
    ipfsDatasetsDashboard.render();
  });
  
  // Handle dashboard dispose
  dashboard.on('dispose', () => {
    ipfsDatasetsDashboard.dispose();
  });
  
  return ipfsDatasetsDashboard;
}

/**
 * Initialize the IPFS Datasets dashboard registration.
 * 
 * This function is called automatically when the script is imported.
 */
export async function initIPFSDatasetsDashboard() {
  // Check if the dashboard global is available
  if (typeof globalThis.dashboard !== 'undefined') {
    // Register with the global dashboard
    return registerIPFSDatasetsDashboard(globalThis.dashboard, {
      autoInitialize: true,
    });
  } else {
    console.warn('Main dashboard not found. IPFS Datasets dashboard not registered.');
    return null;
  }
}

// Auto-initialize if not imported as a module
if (typeof globalThis.document !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIPFSDatasetsDashboard);
  } else {
    initIPFSDatasetsDashboard();
  }
}

export default {
  registerIPFSDatasetsDashboard,
  initIPFSDatasetsDashboard,
};