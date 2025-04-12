/**
 * Enhanced Search Functionality Loader
 * 
 * This script loads and integrates the enhanced search functionality
 * into the PyArrow Content Index Dashboard.
 * 
 * Usage:
 * 1. Require this file in your dashboard HTML
 * 2. The script will automatically wait for the dashboard to initialize
 * 3. It will then patch the dashboard's search controls and methods
 */

const { initializeSearchIntegration } = require('./enhanced_search/search_integration.js');

/**
 * Initialize and load the enhanced search functionality
 * 
 * @param {Object} options - Configuration options
 * @param {Object|string} options.dashboard - The dashboard element or selector
 * @param {Object} options.eventBus - Event bus for component communication
 * @param {Object} options.config - Search configuration options
 * @param {Object} options.electronAPI - Electron IPC interface (optional)
 * @returns {Promise<Object>} - Result of the initialization
 */
async function loadEnhancedSearch(options = {}) {
  console.info('Loading enhanced search functionality...');
  
  const { dashboard, eventBus, config = {}, electronAPI } = options;
  
  if (!dashboard) {
    console.error('Dashboard element or selector is required for search integration');
    return { success: false, error: 'Dashboard element required' };
  }
  
  try {
    // Merge default and custom options
    const searchConfig = { 
      enableSavedSearches: true,
      enableSearchHistory: true,
      enableThumbnailIntegration: true,
      maxHistoryItems: 20,
      maxSavedSearches: 10,
      ...config 
    };
    
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
            resolve(initializeEnhancedSearch(dashboardElement, searchConfig, eventBus, electronAPI));
          });
        })
      : initializeEnhancedSearch(dashboardElement, searchConfig, eventBus, electronAPI);
    
    // Wait for integration to complete
    const result = await initPromise;
    
    // Log result
    if (result.success) {
      console.info('Enhanced search functionality loaded successfully');
    } else {
      console.warn('Enhanced search functionality could not be loaded:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Error initializing enhanced search:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown error during search initialization'
    };
  }
}

/**
 * Internal function to handle the actual search integration
 * 
 * @param {HTMLElement} dashboardElement - The dashboard element
 * @param {Object} config - Configuration options
 * @param {Object} eventBus - Event bus for component communication
 * @param {Object} electronAPI - Electron IPC interface (optional)
 * @returns {Promise<Object>} - Integration result
 */
async function initializeEnhancedSearch(dashboardElement, config, eventBus, electronAPI) {
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
    
    // Import the search integration module
    const { initializeSearchIntegration } = require('./enhanced_search/search_integration.js');
    
    // Initialize search integration
    const integrationSuccess = await initializeSearchIntegration(dashboard || window.contentIndexDashboard);
    
    if (!integrationSuccess) {
      return { 
        success: false, 
        error: 'Failed to integrate search with dashboard' 
      };
    }
    
    // Set up thumbnail integration if enabled and dashboard has thumbnail generator
    if (config.enableThumbnailIntegration) {
      const dashboardInstance = dashboard || window.contentIndexDashboard;
      
      if (dashboardInstance && dashboardInstance._generateThumbnail) {
        setupThumbnailIntegration(dashboardInstance, eventBus);
        console.info('Search thumbnail integration enabled');
      } else {
        console.warn('Thumbnail generator not available for search integration');
      }
    }
    
    // Set up event listeners if event bus is provided
    if (eventBus) {
      setupSearchEventHandlers(eventBus, config);
    }
    
    // Set up IPC handlers if electronAPI is provided
    if (electronAPI) {
      setupSearchIPCHandlers(electronAPI, config);
    }
    
    return { 
      success: true, 
      searchIntegration: true,
      message: 'Enhanced search initialized successfully'
    };
  } catch (error) {
    console.error('Error in search integration:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown error during search integration'
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
 * Set up thumbnail integration with the search functionality
 * 
 * @param {Object} dashboard - The dashboard instance
 * @param {Object} eventBus - Event bus for component communication
 */
function setupThumbnailIntegration(dashboard, eventBus) {
  try {
    // Import necessary search discovery modules
    const { 
      enhanceSearchResultsWithThumbnails, 
      createEnhancedSearchResultsView,
      createContentDetailPanel,
      createEmptyDetailPanel
    } = require('./enhanced_search/search_discovery.js');
    
    // Store original render method to enhance
    const originalRenderResults = dashboard._renderSearchResults || dashboard._renderResults;
    
    if (!originalRenderResults) {
      console.warn('Unable to find dashboard render method for thumbnail integration');
      return;
    }
    
    // Override the render method to enhance with thumbnails
    dashboard._renderSearchResults = function(results, container) {
      // Check if we should use original or enhanced rendering
      if (!results || !Array.isArray(results) || !this._generateThumbnail) {
        // Use original render method if no results or no thumbnail generator
        return originalRenderResults.call(this, results, container);
      }
      
      // Determine if we're in grid or list view mode
      const viewMode = this.viewMode || 'list';
      
      // Create enhanced view with thumbnails
      const enhancedView = createEnhancedSearchResultsView(
        results, 
        this._generateThumbnail.bind(this), 
        {
          viewMode,
          showThumbnailsInList: true,
          thumbnailOptions: {
            thumbnailSize: viewMode === 'grid' ? 'medium' : 'small',
            ipfsGateway: this.ipfsGateway,
            cacheThumbnails: true
          },
          onItemClick: (item) => {
            this._showContentDetails(item);
          },
          onItemView: (item) => {
            this._showContentDetails(item);
          }
        }
      );
      
      // Clear container and append the enhanced view
      if (container) {
        container.innerHTML = '';
        container.appendChild(enhancedView);
      }
      
      return enhancedView;
    };
    
    // Ensure we have a reference to the new render method
    if (dashboard._renderResults && !dashboard._renderSearchResults) {
      dashboard._renderSearchResults = dashboard._renderResults;
    }
    
    // Add or override _showContentDetails method to show the detail panel
    dashboard._showContentDetails = function(item) {
      if (!item) return;
      
      // Look for existing detail panel
      let detailContainer = document.getElementById('content-detail-container');
      
      // Create container if it doesn't exist
      if (!detailContainer) {
        detailContainer = document.createElement('div');
        detailContainer.id = 'content-detail-container';
        detailContainer.className = 'content-detail-container';
        
        // Find where to add it - main content area or modal
        const contentArea = document.querySelector('.content-browser-container') || 
                            document.querySelector('#browser-tab') ||
                            document.querySelector('#dashboard-container');
        
        if (contentArea) {
          contentArea.appendChild(detailContainer);
        } else {
          // Fallback to modal if we can't find a good container
          // Check if we have a modal element we can use
          const modalBody = document.querySelector('#content-details-modal .modal-body');
          if (modalBody) {
            modalBody.innerHTML = '';
            detailContainer = modalBody;
            
            // Show the modal
            const modal = document.getElementById('content-details-modal');
            if (modal) {
              modal.classList.add('active');
            }
          } else {
            // Create a floating container if no modal available
            detailContainer.style.position = 'fixed';
            detailContainer.style.top = '50%';
            detailContainer.style.left = '50%';
            detailContainer.style.transform = 'translate(-50%, -50%)';
            detailContainer.style.zIndex = '1000';
            detailContainer.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.3)';
            detailContainer.style.background = '#fff';
            document.body.appendChild(detailContainer);
          }
        }
      }
      
      // Create the detail panel
      const detailPanel = createContentDetailPanel(item, {
        ipfsGateway: this.ipfsGateway || 'https://ipfs.io/ipfs/',
        textContentLoader: (cid, callback) => {
          // Create a function to load text content
          if (this._fetchContentText) {
            this._fetchContentText(cid, callback);
          } else {
            // Fallback if no content loader is available
            callback(`Text content loading not available.
The integration requires a text content loader to be configured.`);
          }
        },
        onClose: () => {
          // Handle closing the detail panel
          if (detailContainer.parentNode) {
            if (detailContainer === document.querySelector('#content-details-modal .modal-body')) {
              // If it's in a modal, just hide the modal
              const modal = document.getElementById('content-details-modal');
              if (modal) {
                modal.classList.remove('active');
              }
            } else if (detailContainer.style.position === 'fixed') {
              // If it's a floating container, remove it
              document.body.removeChild(detailContainer);
            } else {
              // Otherwise just hide it
              detailContainer.style.display = 'none';
            }
          }
        },
        onGatewayChange: (gateway) => {
          // Update the gateway URL
          this.ipfsGateway = gateway;
        },
        onApplyOptions: (options) => {
          // Apply preview options
          if (options.ipfsGateway) {
            this.ipfsGateway = options.ipfsGateway;
          }
          
          // Update the detail panel with new options
          this._showContentDetails(item);
        }
      });
      
      // Clear the container and add the detail panel
      detailContainer.innerHTML = '';
      detailContainer.appendChild(detailPanel);
      
      // Make sure the container is visible
      detailContainer.style.display = 'block';
      
      // If we have an event bus, emit a content-selected event
      if (eventBus) {
        eventBus.emit('content-selected', item);
      }
    };
    
    // If eventBus is available, set up events for view mode changes
    if (eventBus) {
      eventBus.on('view-mode-changed', (mode) => {
        if (dashboard) {
          dashboard.viewMode = mode;
          dashboard._refreshDashboard();
        }
      });
    }
    
    console.info('Thumbnail and detail panel integration successfully configured');
  } catch (error) {
    console.error('Error setting up thumbnail and detail panel integration:', error);
  }
}

/**
 * Set up event handlers for search integration
 * 
 * @param {Object} eventBus - Event bus for component communication
 * @param {Object} config - Search configuration
 */
function setupSearchEventHandlers(eventBus, config) {
  // Listen for content updates to refresh search when needed
  eventBus.on('content-updated', (data) => {
    // Find any dashboard instance
    const dashboard = window.contentIndexDashboard;
    if (dashboard && dashboard._refreshDashboard) {
      // Refresh the current search view
      dashboard._refreshDashboard();
    }
  });
  
  // Listen for tab changes to optimize search performance
  eventBus.on('tab-changed', (tabId) => {
    // Only load search when in browser tab
    if (tabId === 'browser') {
      // If there's a pending search, execute it now
      const dashboard = window.contentIndexDashboard;
      if (dashboard && dashboard.pendingSearch) {
        dashboard._handleSearch(dashboard.pendingSearch);
        dashboard.pendingSearch = null;
      }
    }
  });
}

/**
 * Set up IPC handlers for search integration
 * 
 * @param {Object} electronAPI - Electron IPC interface
 * @param {Object} config - Search configuration
 */
function setupSearchIPCHandlers(electronAPI, config) {
  // Add IPC handlers for search operations if needed
  electronAPI.handle('request-search', async (event, searchCriteria) => {
    try {
      const dashboard = window.contentIndexDashboard;
      if (!dashboard) {
        return { success: false, error: 'Dashboard not available' };
      }
      
      // Apply search criteria
      dashboard.searchCriteria = searchCriteria;
      dashboard._refreshDashboard();
      
      return { success: true };
    } catch (error) {
      console.error('Error handling search request:', error);
      return { success: false, error: error.message };
    }
  });
}

// Automatically load on script execution
loadEnhancedSearch();

module.exports = {
  loadEnhancedSearch
};