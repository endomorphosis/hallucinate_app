/**
 * Loader Module for Real-Time Updates
 * 
 * This module provides an easy way to load and integrate the real-time updates
 * functionality into the PyArrow Content Index Dashboard. It handles loading the
 * required scripts and initializing the components.
 */

import integrateRealtimeUpdates from './realtime_updates/realtime_integration.js';

// Default configuration
const DEFAULT_CONFIG = {
  wsEndpoint: 'ws://localhost:8765/pyarrow-content-index/ws',
  autoConnect: true,
  enableNotifications: true,
  enableVisualIndicators: true,
  enableBackgroundRefresh: true,
  backgroundRefreshInterval: 60000 // 1 minute
};

/**
 * Load and initialize real-time updates for the PyArrow Content Index Dashboard
 * 
 * @param {Object} options Configuration options
 * @param {string} options.dashboardSelector CSS selector for the dashboard container (default: '.pyarrow-content-index-dashboard')
 * @param {Object} options.electronAPI Electron API for IPC communication
 * @param {Object} options.eventBus Event bus for dashboard communication
 * @param {string} options.wsEndpoint WebSocket endpoint URL
 * @param {boolean} options.autoConnect Automatically connect to WebSocket (default: true)
 * @param {boolean} options.enableNotifications Show notifications (default: true)
 * @param {boolean} options.enableVisualIndicators Display visual indicators (default: true)
 * @param {boolean} options.enableBackgroundRefresh Refresh in background (default: true)
 * @param {number} options.backgroundRefreshInterval Background refresh interval in ms (default: 60000)
 * @returns {Promise<Object>} Result with success status and real-time updates instance
 */
async function loadRealtimeUpdates(options = {}) {
  console.info('Loading real-time updates module...');
  
  // Merge default and custom options
  const config = { ...DEFAULT_CONFIG, ...options };
  
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    return new Promise((resolve) => {
      document.addEventListener('DOMContentLoaded', () => {
        resolve(initializeRealtimeUpdates(config));
      });
    });
  } else {
    return initializeRealtimeUpdates(config);
  }
}

/**
 * Initialize real-time updates
 * 
 * @param {Object} config Configuration options
 * @returns {Promise<Object>} Result with success status and real-time updates instance
 */
async function initializeRealtimeUpdates(config) {
  try {
    // Find dashboard container
    const dashboardSelector = config.dashboardSelector || '.pyarrow-content-index-dashboard';
    let dashboardContainer = document.querySelector(dashboardSelector);
    
    // Try to find dashboard by ID if selector fails
    if (!dashboardContainer) {
      dashboardContainer = document.getElementById('dashboard-container');
    }
    
    // If still not found, look for any element with dashboard in the class
    if (!dashboardContainer) {
      dashboardContainer = document.querySelector('[class*="dashboard"]');
    }
    
    // If no container found, warn but try to find the dashboard instance
    if (!dashboardContainer) {
      console.warn(`Dashboard container not found with selector: ${dashboardSelector}`);
      
      // Check if there's a dashboard instance in the global scope
      if (window.dashboard) {
        console.info('Using global dashboard instance');
        dashboardContainer = window.dashboard;
      } else {
        throw new Error('Dashboard container or instance not found');
      }
    }
    
    // Integrate real-time updates
    const result = integrateRealtimeUpdates(dashboardContainer, {
      electronAPI: config.electronAPI || window.electronAPI,
      eventBus: config.eventBus,
      wsEndpoint: config.wsEndpoint,
      autoConnect: config.autoConnect,
      enableNotifications: config.enableNotifications,
      enableVisualIndicators: config.enableVisualIndicators,
      enableBackgroundRefresh: config.enableBackgroundRefresh
    });
    
    if (result.success) {
      console.info('Real-time updates loaded successfully');
      
      // Configure background refresh interval if specified
      if (config.backgroundRefreshInterval && result.realtimeUpdates) {
        result.realtimeUpdates.bgRefreshInterval = config.backgroundRefreshInterval;
        
        if (result.realtimeUpdates.backgroundRefreshEnabled) {
          result.realtimeUpdates.stopBackgroundRefresh();
          result.realtimeUpdates.startBackgroundRefresh();
        }
      }
      
      // Store instance in global scope for debugging if needed
      if (config.exposeGlobally) {
        window.realtimeUpdates = result.realtimeUpdates;
      }
    } else {
      console.error('Failed to load real-time updates:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Error initializing real-time updates:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Auto-load if the script is loaded with data-auto-init attribute
if (document.currentScript && document.currentScript.dataset.autoInit !== undefined) {
  // Extract configuration from data attributes
  const dataConfig = {};
  const script = document.currentScript;
  
  if (script.dataset.wsEndpoint) dataConfig.wsEndpoint = script.dataset.wsEndpoint;
  if (script.dataset.autoConnect) dataConfig.autoConnect = script.dataset.autoConnect !== 'false';
  if (script.dataset.enableNotifications) dataConfig.enableNotifications = script.dataset.enableNotifications !== 'false';
  if (script.dataset.enableVisualIndicators) dataConfig.enableVisualIndicators = script.dataset.enableVisualIndicators !== 'false';
  if (script.dataset.enableBackgroundRefresh) dataConfig.enableBackgroundRefresh = script.dataset.enableBackgroundRefresh !== 'false';
  if (script.dataset.backgroundRefreshInterval) dataConfig.backgroundRefreshInterval = parseInt(script.dataset.backgroundRefreshInterval, 10);
  if (script.dataset.dashboardSelector) dataConfig.dashboardSelector = script.dataset.dashboardSelector;
  if (script.dataset.exposeGlobally) dataConfig.exposeGlobally = script.dataset.exposeGlobally !== 'false';
  
  // Auto-load with extracted configuration
  loadRealtimeUpdates(dataConfig);
}

export default loadRealtimeUpdates;