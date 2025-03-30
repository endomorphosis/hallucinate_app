/**
 * IPFS Model Manager Dashboard Registration
 * 
 * Registers the IPFS Model Manager dashboard component with the main dashboard
 */

import IPFSModelManagerDashboard from './ipfs_model_manager_dashboard.js';

/**
 * Register the IPFS Model Manager dashboard component
 * 
 * @param {Object} dashboard - Main dashboard instance
 * @param {Object} options - Registration options
 * @returns {Object} Registration result
 */
export function registerIPFSModelManagerDashboard(dashboard, options = {}) {
  // Check if dashboard exists
  if (!dashboard) {
    console.error('Dashboard not provided for IPFS Model Manager registration');
    return { success: false, error: 'Dashboard not provided' };
  }
  
  try {
    // Create container for model manager dashboard
    const container = document.createElement('div');
    container.id = 'ipfs-model-manager-dashboard-container';
    container.className = 'dashboard-panel';
    container.style.height = '100%';
    container.style.overflow = 'auto';
    
    // Create Python bridge (proxy to communicate with Python)
    const bridge = {
      executeOperation: async (operation, params) => {
        // Call dashboard API to execute Python operation
        return await dashboard.executePythonOperation(
          'ipfs_model_manager_panel', 
          'execute_operation',
          { operation, params }
        );
      }
    };
    
    // Get theme from dashboard or use default
    const theme = options.theme || dashboard.getTheme() || {
      primary: '#6200ea',
      secondary: '#03dac6',
      background: '#121212',
      surface: '#1e1e1e',
      text: '#ffffff',
      error: '#cf6679'
    };
    
    // Create dashboard component
    const modelManagerDashboard = new IPFSModelManagerDashboard({
      container: container,
      bridge: bridge,
      theme: theme,
      onEvent: (event) => {
        // Forward events to main dashboard
        if (dashboard.onPanelEvent) {
          dashboard.onPanelEvent('ipfs_model_manager', event);
        }
      }
    });
    
    // Register the panel with the main dashboard
    const panelOptions = {
      id: 'ipfs_model_manager',
      title: 'IPFS Model Manager',
      icon: 'model', // Dashboard should provide this icon
      element: container,
      order: options.order || 30, // Position in sidebar
      group: 'models',
      description: 'Manage AI models with IPFS integration',
      badges: [{
        id: 'models-count',
        label: 'Models',
        value: '0',
        color: theme.secondary
      }]
    };
    
    // Add panel to dashboard
    const panelId = dashboard.addPanel(panelOptions);
    
    // Setup update listener to refresh badges
    const updateInterval = setInterval(() => {
      if (modelManagerDashboard.state.models_count !== undefined) {
        dashboard.updatePanelBadge('ipfs_model_manager', 'models-count', {
          value: modelManagerDashboard.state.models_count.toString()
        });
      }
    }, 5000); // Update every 5 seconds
    
    // Initial badge update
    setTimeout(() => {
      if (modelManagerDashboard.state.models_count !== undefined) {
        dashboard.updatePanelBadge('ipfs_model_manager', 'models-count', {
          value: modelManagerDashboard.state.models_count.toString()
        });
      }
    }, 1000); // Update after 1 second
    
    // Setup theme change listener
    const themeListenerId = dashboard.addThemeChangeListener((newTheme) => {
      Object.assign(modelManagerDashboard.theme, newTheme);
      // Re-render with new theme
      modelManagerDashboard.applyStyles();
      modelManagerDashboard.renderModelsList();
      modelManagerDashboard.renderOperationsList();
    });
    
    // Return registration details
    return {
      success: true,
      panelId: panelId,
      dashboard: modelManagerDashboard,
      
      // Cleanup function
      unregister: () => {
        // Stop intervals
        clearInterval(updateInterval);
        
        // Remove theme listener
        dashboard.removeThemeChangeListener(themeListenerId);
        
        // Remove panel
        dashboard.removePanel(panelId);
      }
    };
  } catch (error) {
    console.error('Failed to register IPFS Model Manager dashboard:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Create a button to add to the dashboard toolbar
 * 
 * @param {Object} dashboard - Main dashboard instance
 * @returns {HTMLElement} Toolbar button
 */
export function createIPFSModelManagerToolbarButton(dashboard) {
  // Create button
  const button = document.createElement('button');
  button.className = 'dashboard-toolbar-button';
  button.title = 'Import Model';
  button.innerHTML = '<i class="fas fa-cloud-download-alt"></i>';
  
  // Style the button
  button.style.backgroundColor = 'transparent';
  button.style.border = 'none';
  button.style.borderRadius = '4px';
  button.style.padding = '8px';
  button.style.cursor = 'pointer';
  button.style.color = '#ffffff';
  button.style.fontSize = '16px';
  
  // Add hover effect
  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = 'transparent';
  });
  
  // Add click handler to switch to model manager panel
  button.addEventListener('click', () => {
    dashboard.switchToPanel('ipfs_model_manager');
    
    // Also switch to import tab
    const modelManagerDashboard = dashboard.getPanelInstance('ipfs_model_manager');
    if (modelManagerDashboard && modelManagerDashboard.switchTab) {
      modelManagerDashboard.switchTab('import');
    }
  });
  
  return button;
}

// Auto-register on window load if dashboard is available
window.addEventListener('DashboardReady', (event) => {
  const dashboard = event.detail.dashboard;
  if (dashboard) {
    registerIPFSModelManagerDashboard(dashboard);
    
    // Add toolbar button if toolbar exists
    if (dashboard.addToolbarItem) {
      const button = createIPFSModelManagerToolbarButton(dashboard);
      dashboard.addToolbarItem('ipfs_model_manager_import', button);
    }
  }
});