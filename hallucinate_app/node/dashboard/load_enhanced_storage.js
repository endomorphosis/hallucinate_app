/**
 * Enhanced Storage Visualization Loader
 * 
 * This script loads and integrates the enhanced storage visualization components
 * into the PyArrow Content Index Dashboard.
 * 
 * Usage:
 * 1. Require this file in your dashboard HTML
 * 2. The script will automatically wait for the dashboard to initialize
 * 3. It will then patch the dashboard's storage location chart method
 */

const { initializeIntegration } = require('./storage_integration.js');

/**
 * Ensure Chart.js library is loaded
 * 
 * @returns {Promise<void>}
 */
async function ensureChartLibraryLoaded() {
  // If Chart.js is already loaded, return immediately
  if (window.Chart) {
    return Promise.resolve();
  }
  
  // Otherwise, load Chart.js from CDN
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
 * Initialize and load the enhanced storage visualization
 */
function loadEnhancedStorageVisualization() {
  console.info('Loading enhanced storage visualization...');
  
  // Start integration after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      try {
        // First load Chart.js
        await ensureChartLibraryLoaded();
        
        // Then initialize integration
        const result = await initializeIntegration();
        if (result) {
          console.info('Enhanced storage visualization loaded successfully');
        } else {
          console.warn('Enhanced storage visualization could not be loaded');
        }
      } catch (error) {
        console.error('Error loading enhanced storage visualization:', error);
      }
    });
  } else {
    // DOM already loaded, initialize immediately
    (async () => {
      try {
        // First load Chart.js
        await ensureChartLibraryLoaded();
        
        // Then initialize integration
        const result = await initializeIntegration();
        if (result) {
          console.info('Enhanced storage visualization loaded successfully');
        } else {
          console.warn('Enhanced storage visualization could not be loaded');
        }
      } catch (error) {
        console.error('Error loading enhanced storage visualization:', error);
      }
    })();
  }
}

// Automatically load on script execution
loadEnhancedStorageVisualization();

module.exports = {
  loadEnhancedStorageVisualization
};