/**
 * Register IPFS Transformers Dashboard
 * 
 * Registers the IPFS Transformers Dashboard with the main dashboard system.
 */

import { IPFSTransformersDashboard } from './ipfs_transformers_dashboard.js';

/**
 * Register the IPFS Transformers Dashboard with the main dashboard
 * 
 * @param {Object} dashboard - Main dashboard instance
 * @param {Object} options - Registration options
 * @param {Object} options.bridge - Bridge to communicate with Python
 * @param {Boolean} options.autoRefresh - Auto-refresh status
 * @param {Number} options.refreshInterval - Refresh interval in ms
 * @param {String} options.panelId - ID for the panel
 * @param {Boolean} options.addToolbarButton - Whether to add toolbar button
 * @returns {IPFSTransformersDashboard} - Dashboard instance
 */
export function registerIPFSTransformersDashboard(dashboard, options = {}) {
  if (!dashboard) {
    console.error('Cannot register IPFS Transformers Dashboard: Dashboard not provided');
    return null;
  }
  
  const {
    bridge,
    autoRefresh = true,
    refreshInterval = 5000,
    panelId = 'ipfs-transformers',
    addToolbarButton = true
  } = options;
  
  // Create panel container
  const panelContainer = document.createElement('div');
  panelContainer.id = `${panelId}-panel`;
  panelContainer.className = 'dashboard-panel ipfs-transformers-panel';
  
  // Add to dashboard
  dashboard.addPanel({
    id: panelId,
    title: 'IPFS Transformers',
    container: panelContainer,
    icon: 'transformer', // Icon name from icon set
    order: options.order || 30 // Position in sidebar
  });
  
  // Create transformers dashboard
  const transformersDashboard = new IPFSTransformersDashboard({
    container: panelContainer,
    bridge: bridge || dashboard.bridge,
    theme: { mode: dashboard.theme },
    autoRefresh,
    refreshInterval
  });
  
  // Sync theme changes
  dashboard.on('theme-changed', (event) => {
    transformersDashboard.theme = { mode: event.theme };
    transformersDashboard.render();
  });
  
  // Add toolbar button if requested
  if (addToolbarButton) {
    dashboard.addToolbarButton({
      id: `${panelId}-btn`,
      text: 'Run Inference',
      icon: 'play',
      tooltip: 'Run model inference',
      onClick: () => {
        // Show panel
        dashboard.showPanel(panelId);
        
        // Activate inference tab
        const tabButtons = panelContainer.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
          if (btn.dataset.tab === 'inference') {
            btn.click();
          }
        });
      }
    });
  }
  
  // Return the dashboard instance
  return transformersDashboard;
}

// Export panel registration function for dynamically loaded panels
export default registerIPFSTransformersDashboard;