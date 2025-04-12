/**
 * Enhanced Thumbnail Generator Loader
 * 
 * This script loads and integrates the enhanced thumbnail functionality
 * into the PyArrow Content Index Dashboard.
 * 
 * Usage:
 * 1. Import this module in your dashboard initialization
 * 2. Call loadEnhancedThumbnails with the dashboard element and configuration
 * 3. It will patch the dashboard's list and detail view methods
 */

const { integrateThumbnails, initializeThumbnailIntegration } = require('./enhanced_thumbnails/thumbnail_integration.js');

/**
 * Default configuration options for thumbnail generation
 */
const DEFAULT_CONFIG = {
  ipfsGateway: 'https://ipfs.io/ipfs/',
  thumbnailService: null,
  enableListThumbnails: true,
  enableDetailPreview: true,
  embedPdfPreview: false,
  embedVideoPreview: true,
  enableLazyLoading: true,
  cacheThumbnails: true,
  maxCacheSize: 200,
  thumbnailSize: 'medium' // small, medium, large
};

/**
 * Initialize and load the enhanced thumbnail functionality
 * 
 * @param {Object} options - Configuration options for thumbnail generator
 * @param {Object|string} options.dashboard - The dashboard element or selector
 * @param {Object} options.eventBus - Event bus for component communication
 * @param {Object} options.config - Thumbnail configuration options
 * @param {Object} options.electronAPI - Electron IPC interface (optional)
 * @returns {Promise<Object>} - Result of the initialization
 */
async function loadEnhancedThumbnails(options = {}) {
  console.info('Loading enhanced thumbnail generator...');
  
  const { dashboard, eventBus, config = {}, electronAPI } = options;
  
  if (!dashboard) {
    console.error('Dashboard element or selector is required for thumbnail integration');
    return { success: false, error: 'Dashboard element required' };
  }
  
  try {
    // Merge default and custom options
    const thumbnailConfig = { ...DEFAULT_CONFIG, ...config };
    
    // Get dashboard element
    const dashboardElement = typeof dashboard === 'string' 
      ? document.querySelector(dashboard)
      : dashboard;
    
    if (!dashboardElement) {
      console.error('Dashboard element not found:', dashboard);
      return { success: false, error: 'Dashboard element not found' };
    }
    
    // Determine if we should wait for DOM content to be loaded
    const initPromise = document.readyState === 'loading'
      ? new Promise(resolve => {
          document.addEventListener('DOMContentLoaded', () => {
            resolve(integrateEnhancedThumbnails(dashboardElement, thumbnailConfig, eventBus, electronAPI));
          });
        })
      : integrateEnhancedThumbnails(dashboardElement, thumbnailConfig, eventBus, electronAPI);
    
    // Wait for integration to complete
    const result = await initPromise;
    
    // Log result
    if (result.success) {
      console.info('Enhanced thumbnail generator loaded successfully');
    } else {
      console.warn('Enhanced thumbnail generator could not be loaded:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Error initializing enhanced thumbnails:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown error during thumbnail initialization'
    };
  }
}

/**
 * Internal function to handle the actual integration
 * 
 * @param {HTMLElement} dashboardElement - The dashboard element
 * @param {Object} config - Configuration options
 * @param {Object} eventBus - Event bus for component communication
 * @param {Object} electronAPI - Electron IPC interface (optional)
 * @returns {Promise<Object>} - Integration result
 */
async function integrateEnhancedThumbnails(dashboardElement, config, eventBus, electronAPI) {
  try {
    // Get the dashboard instance
    const dashboard = dashboardElement.contentIndexDashboard || window.contentIndexDashboard;
    
    if (!dashboard) {
      const dashboardInstance = await waitForDashboardInstance(dashboardElement, 5000);
      if (!dashboardInstance) {
        return { 
          success: false, 
          error: 'Could not find dashboard instance after waiting' 
        };
      }
    }
    
    // Attempt to integrate thumbnails
    const integrationSuccess = integrateThumbnails(dashboard || window.contentIndexDashboard, config);
    
    if (!integrationSuccess) {
      return { 
        success: false, 
        error: 'Failed to integrate thumbnails with dashboard' 
      };
    }
    
    // Set up event listeners if event bus is provided
    if (eventBus) {
      setupThumbnailEventHandlers(eventBus, config);
    }
    
    // Set up IPC handlers if electronAPI is provided
    if (electronAPI) {
      setupThumbnailIPCHandlers(electronAPI, config);
    }
    
    return { 
      success: true, 
      thumbnailGenerator: dashboard?._generateThumbnail || null,
      message: 'Enhanced thumbnails initialized successfully'
    };
  } catch (error) {
    console.error('Error in thumbnail integration:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown error during thumbnail integration'
    };
  }
}

/**
 * Wait for the dashboard instance to be available
 * 
 * @param {HTMLElement} element - The dashboard element
 * @param {number} timeout - Maximum wait time in milliseconds
 * @returns {Promise<Object|null>} - Dashboard instance or null if not found
 */
function waitForDashboardInstance(element, timeout = 5000) {
  return new Promise(resolve => {
    // Check if dashboard is already available
    if (element.contentIndexDashboard || window.contentIndexDashboard) {
      resolve(element.contentIndexDashboard || window.contentIndexDashboard);
      return;
    }
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      resolve(null);
    }, timeout);
    
    // Check periodically
    const interval = setInterval(() => {
      if (element.contentIndexDashboard || window.contentIndexDashboard) {
        clearInterval(interval);
        clearTimeout(timeoutId);
        resolve(element.contentIndexDashboard || window.contentIndexDashboard);
      }
    }, 100);
  });
}

/**
 * Set up event handlers for thumbnail integration
 * 
 * @param {Object} eventBus - Event bus for component communication
 * @param {Object} config - Thumbnail configuration
 */
function setupThumbnailEventHandlers(eventBus, config) {
  // Listen for content updates to refresh thumbnails
  eventBus.on('content-updated', (data) => {
    // Refresh thumbnail cache for the updated content
    if (data && data.content && data.content.cid) {
      // Access the thumbnail cache from the window object
      const cache = window.thumbnailCache;
      if (cache) {
        // Remove this item from cache to force refresh
        const cid = data.content.cid;
        ['small', 'medium', 'large'].forEach(size => {
          const key = `${cid}:${data.content.mime_type || ''}:${size}`;
          if (cache.has(key)) {
            cache.delete(key);
          }
        });
      }
    }
  });
  
  // Listen for tab changes to optimize thumbnail loading
  eventBus.on('tab-changed', (tabId) => {
    // Only load thumbnails when in browser tab
    if (tabId === 'browser') {
      // Set a flag to indicate thumbnails should be loaded
      window.loadThumbnails = true;
    } else {
      // Set flag to false to pause thumbnail loading
      window.loadThumbnails = false;
    }
  });
}

/**
 * Set up IPC handlers for thumbnail integration
 * 
 * @param {Object} electronAPI - Electron IPC interface
 * @param {Object} config - Thumbnail configuration
 */
function setupThumbnailIPCHandlers(electronAPI, config) {
  // Handle requests for thumbnails from main process
  electronAPI.handle('request-thumbnail', async (event, request) => {
    try {
      const { cid, mimeType, size } = request;
      
      // Access the thumbnail generator from the window object
      const dashboard = window.contentIndexDashboard;
      if (!dashboard || !dashboard._generateThumbnail) {
        return { success: false, error: 'Thumbnail generator not available' };
      }
      
      // Generate thumbnail data
      const thumbnail = dashboard._generateThumbnail(cid, mimeType, '', {
        thumbnailSize: size || config.thumbnailSize,
        ipfsGateway: config.ipfsGateway,
        thumbnailService: config.thumbnailService
      });
      
      return { success: true, thumbnail };
    } catch (error) {
      console.error('Error handling thumbnail request:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  loadEnhancedThumbnails,
  DEFAULT_CONFIG
};