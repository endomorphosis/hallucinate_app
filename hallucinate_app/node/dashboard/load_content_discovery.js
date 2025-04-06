/**
 * Database Visualization for Content Discovery Loader
 * 
 * This script loads and integrates the enhanced database visualization functionality
 * into the PyArrow Content Index Dashboard.
 * 
 * Usage:
 * 1. Require this file in your dashboard HTML
 * 2. The script will automatically wait for the dashboard to initialize
 * 3. It will then add a new "Discovery" tab with interactive visualizations
 */

const { initializeDiscoveryIntegration } = require('./content_discovery/discovery_integration.js');

/**
 * Default configuration options for visualization
 */
const DEFAULT_CONFIG = {
  enableChartAnimation: true,
  enableTreemapChart: true,
  enableRelationshipGraph: true,
  enableTagCloud: true,
  dataRefreshInterval: 300000, // 5 minutes in milliseconds
  maxDataPoints: 500,
  colorScheme: 'default'
};

/**
 * Initialize and load the database visualization
 * 
 * @param {Object} options - Configuration options
 */
function loadContentDiscovery(options = {}) {
  console.info('Loading database visualization for content discovery...');
  
  // Merge default and custom options
  const config = { ...DEFAULT_CONFIG, ...options };
  
  // Start integration after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Load required libraries first
      loadRequiredLibraries()
        .then(() => {
          return initializeDiscoveryIntegration('.pyarrow-content-index-dashboard', config);
        })
        .then(result => {
          if (result) {
            console.info('Database visualization loaded successfully');
          } else {
            console.warn('Database visualization could not be loaded');
          }
        })
        .catch(error => {
          console.error('Error loading database visualization:', error);
        });
    });
  } else {
    // DOM already loaded, initialize immediately
    loadRequiredLibraries()
      .then(() => {
        return initializeDiscoveryIntegration('.pyarrow-content-index-dashboard', config);
      })
      .then(result => {
        if (result) {
          console.info('Database visualization loaded successfully');
        } else {
          console.warn('Database visualization could not be loaded');
        }
      })
      .catch(error => {
        console.error('Error loading database visualization:', error);
      });
  }
}

/**
 * Load required third-party libraries for visualization
 * 
 * @returns {Promise} - Resolves when all libraries are loaded
 */
function loadRequiredLibraries() {
  return new Promise((resolve, reject) => {
    // Check if Chart.js is already loaded
    if (window.Chart) {
      console.info('Chart.js already loaded');
      
      // Check for and load the treemap plugin if needed
      const isTreemapRegistered = window.Chart.registry.controllers && 
                                 window.Chart.registry.controllers.get && 
                                 window.Chart.registry.controllers.get('treemap');
                                 
      if (!isTreemapRegistered && DEFAULT_CONFIG.enableTreemapChart) {
        console.info('Loading Chart.js treemap plugin...');
        
        const treemapScript = document.createElement('script');
        treemapScript.src = 'https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@2.3.0/dist/chartjs-chart-treemap.min.js';
        treemapScript.onload = () => {
          console.info('Chart.js treemap plugin loaded');
          resolve();
        };
        treemapScript.onerror = (error) => {
          console.warn('Failed to load treemap plugin, continuing without it:', error);
          resolve(); // Resolve anyway to continue
        };
        document.head.appendChild(treemapScript);
      } else {
        // No additional libraries needed
        resolve();
      }
    } else {
      // Chart.js is not loaded, load it
      console.info('Loading Chart.js from CDN...');
      
      const chartScript = document.createElement('script');
      chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js';
      chartScript.onload = () => {
        console.info('Chart.js loaded');
        
        // Now load the treemap plugin if needed
        if (DEFAULT_CONFIG.enableTreemapChart) {
          const treemapScript = document.createElement('script');
          treemapScript.src = 'https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@2.3.0/dist/chartjs-chart-treemap.min.js';
          treemapScript.onload = () => {
            console.info('Chart.js treemap plugin loaded');
            resolve();
          };
          treemapScript.onerror = (error) => {
            console.warn('Failed to load treemap plugin, continuing without it:', error);
            resolve(); // Resolve anyway to continue
          };
          document.head.appendChild(treemapScript);
        } else {
          resolve();
        }
      };
      chartScript.onerror = (error) => {
        console.error('Failed to load Chart.js:', error);
        reject(new Error('Failed to load Chart.js'));
      };
      document.head.appendChild(chartScript);
    }
  });
}

// Automatically load on script execution
loadContentDiscovery();

module.exports = {
  loadContentDiscovery
};