/**
 * Statistics Tab Integration
 * 
 * This module integrates the visualization components with the PyArrow Content Index Dashboard.
 * 
 * @module dashboard/content_browser/statistics_integration
 */

import VisualizationManager from './visualization_components.js';

/**
 * Initialize the statistics tab with visualization components
 * 
 * @param {Object} options Configuration options
 * @param {HTMLElement} options.container Statistics tab container element
 * @param {Object} options.bridge PyArrow index bridge for data access
 * @param {Object} options.eventBus Event bus for communication
 * @param {Object} options.config Additional configuration options
 * @returns {Promise<Object>} Initialization result with components
 */
export async function initializeStatistics(options = {}) {
  const { container, bridge, eventBus, config = {} } = options;
  
  if (!container) {
    throw new Error('Container element is required');
  }
  
  if (!bridge) {
    console.warn('PyArrow index bridge not provided. Using mock data.');
  }
  
  try {
    // Ensure Chart.js is loaded
    await ensureChartLibraryLoaded();
    
    // Create the visualization manager
    const visualizationManager = new VisualizationManager({
      bridge,
      eventBus,
      chartLibrary: window.Chart,
      config: config.visualizationConfig || {}
    });
    
    // Initialize the visualization manager
    const initResult = await visualizationManager.init();
    
    if (!initResult) {
      console.warn('Failed to initialize visualization manager. Charts may not render correctly.');
    }
    
    // Set up tab switching event handlers
    setupTabEventHandlers(eventBus, visualizationManager);
    
    // Emit initialization event
    if (eventBus) {
      eventBus.emit('statistics-initialized', {
        success: true,
        manager: visualizationManager
      });
    }
    
    return {
      success: true,
      visualizationManager,
      container,
      dispose: () => {
        // Clean up visualization manager
        if (visualizationManager) {
          visualizationManager.dispose();
        }
      }
    };
  } catch (error) {
    console.error('Failed to initialize statistics components:', error);
    
    // Emit error event
    if (eventBus) {
      eventBus.emit('statistics-initialization-error', {
        success: false,
        error: error.message
      });
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Ensure the Chart.js library is loaded
 * @returns {Promise<void>}
 */
async function ensureChartLibraryLoaded() {
  // If Chart.js is already loaded, return immediately
  if (window.Chart) {
    return Promise.resolve();
  }
  
  // Otherwise load Chart.js from CDN
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js';
    script.integrity = 'sha384-7NrRHqlw+G3zcZ4h5HKOlQDJrZSZ+sU/Z/5UHaJEYL0KjspipPLkYSUK53KUvXN3';
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Chart.js'));
    document.head.appendChild(script);
  });
}

/**
 * Set up event handlers for tab switching
 * @param {Object} eventBus Event bus for communication
 * @param {VisualizationManager} visualizationManager Visualization manager instance
 */
function setupTabEventHandlers(eventBus, visualizationManager) {
  // Use direct DOM event handlers if eventBus is not available
  if (!eventBus) {
    // Add click event listeners to tab elements
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        if (tabId === 'stats') {
          // Give the DOM a moment to update before rendering charts
          setTimeout(() => visualizationManager.renderCharts(), 100);
        }
      });
    });
    return;
  }
  
  // Listen for tab change events on the event bus
  eventBus.on('tab-changed', (tabId) => {
    if (tabId === 'stats') {
      // Render charts when the Statistics tab is shown
      setTimeout(() => visualizationManager.renderCharts(), 100);
    }
  });
  
  // If there's no existing tab-changed event, set up DOM event listeners 
  // that will emit the event
  const tabs = document.querySelectorAll('.tab');
  if (tabs.length > 0) {
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        eventBus.emit('tab-changed', tabId);
      });
    });
  }
}

export default initializeStatistics;