/**
 * Register IPFS Kit Dashboard
 * 
 * This module registers the IPFS Kit Dashboard with the main dashboard
 * It creates the necessary dependencies and initializes the dashboard
 */

import Dashboard from './dashboard.js';
import IPFSKitDashboard from './ipfs_kit_dashboard.js';
import { IPFSKitClient } from '../ipfs_kit_client.js';

/**
 * Register the IPFS Kit Dashboard with the main application
 * @param {Object} options Configuration options
 * @param {HTMLElement} options.container Container element for the dashboard
 * @param {Object} options.eventBus Event bus for dashboard events
 * @returns {Promise<Object>} The dashboard instance
 */
export async function registerIPFSKitDashboard(options = {}) {
  // Create container element if not provided
  const container = options.container || document.getElementById('dashboard-container');
  if (!container) {
    console.error('No container element found for IPFS Kit dashboard');
    return null;
  }
  
  // Create event bus if not provided
  const eventBus = options.eventBus || createEventBus();
  
  // Initialize IPFS Kit client
  const ipfsKit = new IPFSKitClient(options.ipfsKitOptions);
  
  try {
    // Start IPFS Kit if not already running
    if (!await ipfsKit.isRunning()) {
      await ipfsKit.start();
    }
    
    // Create IPFS Kit dashboard container
    const ipfsKitContainer = document.createElement('div');
    ipfsKitContainer.id = 'ipfs-kit-dashboard-container';
    ipfsKitContainer.classList.add('dashboard-panel');
    
    // Create IPFS Kit dashboard
    const ipfsKitDashboard = new IPFSKitDashboard({
      element: ipfsKitContainer,
      eventBus: eventBus,
      ipfsKit: ipfsKit
    });
    
    // Initialize dashboard
    await ipfsKitDashboard.init();
    
    // Create main dashboard if dashboard option is null
    if (!options.dashboard) {
      const dashboard = new Dashboard({
        element: container,
        eventBus: eventBus
      });
      
      // Add IPFS Kit panel
      dashboard.addPanel({
        id: 'ipfs-kit',
        title: 'IPFS Kit',
        component: ipfsKitDashboard,
        element: ipfsKitContainer,
        icon: 'network-wired'
      });
      
      // Render dashboard
      await dashboard.render();
      
      return {
        dashboard: dashboard,
        ipfsKitDashboard: ipfsKitDashboard,
        ipfsKit: ipfsKit,
        eventBus: eventBus
      };
    } else {
      // Add to existing dashboard
      options.dashboard.addPanel({
        id: 'ipfs-kit',
        title: 'IPFS Kit',
        component: ipfsKitDashboard,
        element: ipfsKitContainer,
        icon: 'network-wired'
      });
      
      return {
        dashboard: options.dashboard,
        ipfsKitDashboard: ipfsKitDashboard,
        ipfsKit: ipfsKit,
        eventBus: eventBus
      };
    }
  } catch (error) {
    console.error('Failed to register IPFS Kit dashboard:', error);
    
    // Clean up IPFS Kit client if we created it
    if (ipfsKit && !options.ipfsKit) {
      await ipfsKit.stop().catch(e => console.error('Failed to stop IPFS Kit:', e));
    }
    
    return null;
  }
}

/**
 * Create an event bus for dashboard components
 * @returns {Object} Event bus object
 */
function createEventBus() {
  const events = {};
  
  return {
    on(event, callback) {
      if (!events[event]) {
        events[event] = [];
      }
      events[event].push(callback);
    },
    
    off(event, callback) {
      if (!events[event]) return;
      events[event] = events[event].filter(cb => cb !== callback);
    },
    
    emit(event, data) {
      if (!events[event]) return;
      events[event].forEach(callback => callback(data));
    }
  };
}

export default registerIPFSKitDashboard;