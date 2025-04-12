/**
 * Register PyArrow Content Index Dashboard
 * 
 * This module provides functionality to register the PyArrow Content Index dashboard
 * with the main dashboard application. It manages the connection between the
 * dashboard UI and the PyArrow Content Index bridge.
 */

// Import required modules
import PyArrowIndexBridge, { PyArrowIndexRealtimeClient } from '../pyarrow_index_bridge.js';
import securePyArrowIndexManager, { PYARROW_INDEX_CAPABILITIES } from '../secure_pyarrow_index_manager.js';
import authManager from '../auth.js';
import { get_observability } from '../observability.js';
import loadRealtimeUpdates from './load_realtime_updates.js';
import loadEnhancedSearch from './load_enhanced_search.js';
import loadEnhancedStorage from './load_enhanced_storage.js';
import loadEnhancedThumbnails from './load_enhanced_thumbnails.js';
import loadContentDiscovery from './load_content_discovery.js';
import initializeContentBrowser from './content_browser/content_browser_integration.js';
import initializeStatistics from './content_browser/statistics_integration.js';
import integrateRealtimeUpdates from './realtime_updates/realtime_integration.js';

/**
 * Register the PyArrow Content Index dashboard with the main dashboard
 * 
 * @param {Object} dashboard - The main dashboard object
 * @param {Object} options - Configuration options
 * @param {Object} options.pythonBridge - Python bridge for communication
 * @param {Object} options.resources - Resource pool for dependencies
 * @param {Object} options.config - Configuration settings
 * @returns {Promise<Object>} - Registration result
 */
export async function registerPyArrowContentIndexDashboard(dashboard, options = {}) {
  if (!dashboard) {
    throw new Error('Dashboard is required');
  }

  const { pythonBridge, resources = {}, config = {} } = options;

  if (!pythonBridge) {
    console.warn('PyArrow Content Index dashboard registration: Python bridge not provided');
    return {
      success: false,
      message: 'Python bridge is required for PyArrow Content Index dashboard'
    };
  }

  try {
    console.log('Registering PyArrow Content Index dashboard...');

    // Initialize observability if available
    const observability = get_observability ? get_observability() : null;
    const observabilityOptions = observability ? {
      namespace: 'pyarrow_index',
      subsystem: 'dashboard',
      labels: {
        component: 'pyarrow_content_index_dashboard'
      }
    } : {};

    // Initialize auth manager if needed
    if (!authManager.initialized) {
      await authManager.init();
    }
    
    // Determine whether to use the secure manager or direct bridge
    const useSecureManager = config.useSecureManager !== false; // Default to true
    
    let pyarrowIndexBridge;
    let secureManager;
    
    if (useSecureManager) {
      // Use the secure manager for capability-based access control
      secureManager = securePyArrowIndexManager;
      
      // Initialize with resources
      secureManager.resources = {
        ...secureManager.resources,
        pythonBridge,
        auth: authManager,
        ...resources
      };
      
      secureManager.metadata = {
        ...secureManager.metadata,
        indexPath: config.indexPath,
        useArrow: config.useArrow !== false,
        observabilityOptions
      };
      
      // Initialize the secure manager
      const secureInitResult = await secureManager.init();
      if (!secureInitResult) {
        throw new Error('Failed to initialize Secure PyArrow Index Manager');
      }
      
      // Use the underlying bridge for some operations
      pyarrowIndexBridge = secureManager.indexBridge;
    } else {
      // Create direct PyArrow Index Bridge instance without security
      pyarrowIndexBridge = new PyArrowIndexBridge({
        pythonBridge,
        resources,
        indexPath: config.indexPath,
        useArrow: config.useArrow !== false,
        observabilityOptions
      });
      
      // Initialize the bridge
      const initResult = await pyarrowIndexBridge.init();
      if (!initResult) {
        throw new Error('Failed to initialize PyArrow Index Bridge');
      }
    }

    // Add resources for dashboard to use
    const dashboardResources = {
      ...resources,
      pyarrowIndexBridge,
      securePyArrowIndexManager: secureManager,
      authManager
    };
    
    // Add configuration for enhanced components
    dashboardResources.enhancedComponentConfig = {
      searchConfig: config.searchConfig || {},
      storageConfig: config.storageConfig || {},
      thumbnailConfig: config.thumbnailConfig || {},
      discoveryConfig: config.discoveryConfig || {},
      realtimeConfig: config.realtimeConfig || {}
    };

    // Add dashboard panel and register event handlers
    const panelElement = document.getElementById('pyarrow-content-index-panel');
    if (panelElement) {
      // If you have a custom panel constructor, use it here
      // Otherwise, the existing dashboard template should handle initialization
      dashboard.registerPanel('pyarrow-content-index', {
        name: 'PyArrow Content Index',
        icon: 'database',
        element: panelElement,
        resources: dashboardResources,
        config: config.dashboardConfig || {}
      });
    } else {
      console.warn('PyArrow Content Index panel element not found');
    }

    // Register metrics if observability is enabled
    if (observability) {
      // Register dashboard-specific metrics
      const dashboardMetrics = {
        panelViews: observability.register_counter(
          'dashboard_panel_views_total',
          'Number of times the dashboard panel was viewed',
          ['panel'],
          'pyarrow_index',
          'dashboard'
        ),
        panelActions: observability.register_counter(
          'dashboard_panel_actions_total',
          'Number of actions performed in the dashboard panel',
          ['panel', 'action'],
          'pyarrow_index',
          'dashboard'
        )
      };

      // Add metrics to resources for dashboard to use
      dashboardResources.dashboardMetrics = dashboardMetrics;
    }

    // Register IPC handlers for dashboard-backend communication
    if (dashboard.ipc) {
      // Get or create an auth token for operations
      const getAuthToken = async (capability) => {
        try {
          // If secure mode, get a token, otherwise return null (bypass security)
          if (useSecureManager) {
            return await authManager.getCapabilityToken(capability);
          }
          return null;
        } catch (error) {
          console.error(`Error getting auth token for ${capability}:`, error);
          return null;
        }
      };
      
      // Use appropriate manager based on security mode
      const getManager = () => {
        return useSecureManager ? secureManager : pyarrowIndexBridge;
      };
      
      // Register handlers with security integration
      dashboard.ipc.handle('pyarrow-content-index:lookup-by-cid', async (event, cid) => {
        try {
          const manager = getManager();
          
          if (useSecureManager) {
            const authToken = await getAuthToken(PYARROW_INDEX_CAPABILITIES.READ);
            return await manager.lookupByCid(cid, authToken);
          } else {
            return await manager.lookupByCid(cid);
          }
        } catch (error) {
          console.error(`Error looking up CID ${cid}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:lookup-by-path', async (event, path) => {
        try {
          const manager = getManager();
          
          if (useSecureManager) {
            const authToken = await getAuthToken(PYARROW_INDEX_CAPABILITIES.READ);
            return await manager.lookupByPath(path, authToken);
          } else {
            return await manager.lookupByPath(path);
          }
        } catch (error) {
          console.error(`Error looking up path ${path}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:query', async (event, queryParams) => {
        try {
          const manager = getManager();
          
          if (useSecureManager) {
            const authToken = await getAuthToken(PYARROW_INDEX_CAPABILITIES.READ);
            return await manager.query(queryParams, authToken);
          } else {
            return await manager.query(queryParams);
          }
        } catch (error) {
          console.error('Error querying content index:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:get-stats', async () => {
        try {
          const manager = getManager();
          
          if (useSecureManager) {
            const authToken = await getAuthToken(PYARROW_INDEX_CAPABILITIES.READ);
            return await manager.getStats(authToken);
          } else {
            return await manager.getStats();
          }
        } catch (error) {
          console.error('Error getting content index stats:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:add-entry', async (event, entry) => {
        try {
          const manager = getManager();
          
          if (useSecureManager) {
            const authToken = await getAuthToken(PYARROW_INDEX_CAPABILITIES.WRITE);
            return await manager.addEntry(entry, authToken);
          } else {
            return await manager.addEntry(entry);
          }
        } catch (error) {
          console.error('Error adding content index entry:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:update-entry', async (event, cid, updateData) => {
        try {
          const manager = getManager();
          
          if (useSecureManager) {
            const authToken = await getAuthToken(PYARROW_INDEX_CAPABILITIES.WRITE);
            return await manager.updateEntry(cid, updateData, authToken);
          } else {
            return await manager.updateEntry(cid, updateData);
          }
        } catch (error) {
          console.error(`Error updating content index entry ${cid}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:delete-entry', async (event, cid) => {
        try {
          const manager = getManager();
          
          if (useSecureManager) {
            const authToken = await getAuthToken(PYARROW_INDEX_CAPABILITIES.DELETE);
            return await manager.deleteEntry(cid, authToken);
          } else {
            return await manager.deleteEntry(cid);
          }
        } catch (error) {
          console.error(`Error deleting content index entry ${cid}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:sync-with-ipfs-pinset', async (event, includeMetadata) => {
        try {
          const manager = getManager();
          
          if (useSecureManager) {
            const authToken = await getAuthToken(PYARROW_INDEX_CAPABILITIES.SYNC);
            return await manager.syncWithIpfsPinset(includeMetadata, authToken);
          } else {
            return await manager.syncWithIpfsPinset(includeMetadata);
          }
        } catch (error) {
          console.error('Error syncing content index with IPFS pinset:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:export-to-parquet', async (event, exportPath) => {
        try {
          const manager = getManager();
          
          if (useSecureManager) {
            const authToken = await getAuthToken(PYARROW_INDEX_CAPABILITIES.EXPORT);
            return await manager.exportToParquet(exportPath, authToken);
          } else {
            return await manager.exportToParquet(exportPath);
          }
        } catch (error) {
          console.error(`Error exporting content index to Parquet ${exportPath}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:import-from-parquet', async (event, importPath) => {
        try {
          const manager = getManager();
          
          if (useSecureManager) {
            const authToken = await getAuthToken(PYARROW_INDEX_CAPABILITIES.IMPORT);
            return await manager.importFromParquet(importPath, authToken);
          } else {
            return await manager.importFromParquet(importPath);
          }
        } catch (error) {
          console.error(`Error importing content index from Parquet ${importPath}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:test', async () => {
        try {
          const manager = getManager();
          return await manager.test();
        } catch (error) {
          console.error('Error running content index test:', error);
          throw error;
        }
      });
      
      // Add security-specific handlers
      dashboard.ipc.handle('pyarrow-content-index:get-security-status', async () => {
        try {
          if (useSecureManager) {
            return secureManager.getSecurityStatus();
          } else {
            return {
              module: 'pyarrow_index',
              initialized: true,
              secure_mode: false,
              message: 'Running in non-secure mode - security not enabled'
            };
          }
        } catch (error) {
          console.error('Error getting security status:', error);
          throw error;
        }
      });
      
      dashboard.ipc.handle('pyarrow-content-index:issue-capability', async (event, capability, resource) => {
        try {
          if (!useSecureManager) {
            throw new Error('Security not enabled - cannot issue capabilities');
          }
          
          // Issue a capability token for the requested operation
          const token = await authManager.getCapabilityToken(`${capability}:${resource || '*'}`);
          return {
            token,
            capability,
            resource: resource || '*',
            issued_at: new Date().toISOString(),
            secure_mode: true
          };
        } catch (error) {
          console.error(`Error issuing capability ${capability}:`, error);
          throw error;
        }
      });
    }

    console.log('PyArrow Content Index dashboard registered successfully');
    
    // Create object to store enhanced component results
    const enhancedResults = {};
    const eventBus = dashboard.eventBus;
    
    // Initialize enhanced search if enabled
    if (config.enableEnhancedSearch !== false) {
      try {
        console.log('Initializing enhanced search...');
        const searchResult = await loadEnhancedSearch({
          dashboard: dashboard.element || dashboard,
          eventBus,
          config: dashboardResources.enhancedComponentConfig.searchConfig,
          electronAPI: dashboard.ipc
        });
        
        console.log('Enhanced search initialized:', searchResult.success);
        enhancedResults.search = searchResult;
      } catch (error) {
        console.error('Failed to initialize enhanced search:', error);
        enhancedResults.search = { success: false, error: error.message };
      }
    }
    
    // Initialize enhanced storage visualization if enabled
    if (config.enableEnhancedStorage !== false) {
      try {
        console.log('Initializing enhanced storage visualization...');
        const storageResult = await loadEnhancedStorage({
          dashboard: dashboard.element || dashboard,
          eventBus,
          config: dashboardResources.enhancedComponentConfig.storageConfig,
          electronAPI: dashboard.ipc
        });
        
        console.log('Enhanced storage visualization initialized:', storageResult.success);
        enhancedResults.storage = storageResult;
      } catch (error) {
        console.error('Failed to initialize enhanced storage visualization:', error);
        enhancedResults.storage = { success: false, error: error.message };
      }
    }
    
    // Initialize enhanced thumbnails if enabled
    if (config.enableEnhancedThumbnails !== false) {
      try {
        console.log('Initializing enhanced thumbnails...');
        const thumbnailsResult = await loadEnhancedThumbnails({
          dashboard: dashboard.element || dashboard,
          eventBus,
          config: dashboardResources.enhancedComponentConfig.thumbnailConfig,
          electronAPI: dashboard.ipc
        });
        
        console.log('Enhanced thumbnails initialized:', thumbnailsResult.success);
        enhancedResults.thumbnails = thumbnailsResult;
      } catch (error) {
        console.error('Failed to initialize enhanced thumbnails:', error);
        enhancedResults.thumbnails = { success: false, error: error.message };
      }
    }
    
    // Initialize content discovery if enabled
    if (config.enableContentDiscovery !== false) {
      try {
        console.log('Initializing content discovery...');
        const discoveryResult = await loadContentDiscovery({
          dashboard: dashboard.element || dashboard,
          eventBus,
          config: dashboardResources.enhancedComponentConfig.discoveryConfig,
          electronAPI: dashboard.ipc
        });
        
        console.log('Content discovery initialized:', discoveryResult.success);
        enhancedResults.discovery = discoveryResult;
      } catch (error) {
        console.error('Failed to initialize content discovery:', error);
        enhancedResults.discovery = { success: false, error: error.message };
      }
    }
    
    // Initialize content browser if enabled
    if (config.enableContentBrowser !== false) {
      try {
        console.log('Initializing content browser...');
        const browserContainer = document.getElementById('content-browser-container');
        
        if (browserContainer) {
          // Clear the loading state
          browserContainer.innerHTML = '';
          
          // Create the content browser wrapper
          const browserWrapper = document.createElement('div');
          browserWrapper.className = 'content-browser-wrapper';
          browserContainer.appendChild(browserWrapper);
          
          // Initialize the content browser
          const browserResult = await initializeContentBrowser({
            container: browserWrapper,
            bridge: useSecureManager ? secureManager : pyarrowIndexBridge,
            eventBus,
            config: {
              searchConfig: dashboardResources.enhancedComponentConfig.searchConfig, 
              browserConfig: config.browserConfig || {}
            }
          });
          
          // Connect content browser to real-time updates if available
          if (eventBus) {
            // Forward events from other components to the content browser
            eventBus.on('realtime-update', (updateData) => {
              eventBus.emit('content-index-updated', updateData);
            });
            
            // Connect tab switching events
            eventBus.on('tab-changed', (tabId) => {
              if (tabId === 'browser') {
                // Force refresh when switching to the browser tab
                if (browserResult.success && browserResult.metadataBrowser) {
                  setTimeout(() => {
                    browserResult.metadataBrowser.refresh();
                  }, 100);
                }
              }
            });
          }
          
          console.log('Content browser initialized:', browserResult.success);
          enhancedResults.browser = browserResult;
        } else {
          console.warn('Content browser container not found');
          enhancedResults.browser = { success: false, error: 'Container element not found' };
        }
      } catch (error) {
        console.error('Failed to initialize content browser:', error);
        enhancedResults.browser = { success: false, error: error.message };
      }
    }
    
    // Initialize statistics visualization if enabled
    if (config.enableStatisticsVisualization !== false) {
      try {
        console.log('Initializing statistics visualization...');
        const statsContainer = document.getElementById('stats-tab');
        
        if (statsContainer) {
          // Initialize the statistics visualization manager
          const statsResult = await initializeStatistics({
            container: statsContainer,
            bridge: useSecureManager ? secureManager : pyarrowIndexBridge,
            eventBus,
            config: config.visualizationConfig || {}
          });
          
          // Set up event handling for real-time updates
          if (eventBus && statsResult.success) {
            // Forward content index updates to the visualization manager
            eventBus.on('content-index-updated', (updateData) => {
              // Reload data and update charts when content index changes
              if (statsResult.visualizationManager) {
                statsResult.visualizationManager.loadData().then(() => {
                  statsResult.visualizationManager.updateCharts();
                });
              }
            });
          }
          
          console.log('Statistics visualization initialized:', statsResult.success);
          enhancedResults.statistics = statsResult;
        } else {
          console.warn('Statistics container not found');
          enhancedResults.statistics = { success: false, error: 'Container element not found' };
        }
      } catch (error) {
        console.error('Failed to initialize statistics visualization:', error);
        enhancedResults.statistics = { success: false, error: error.message };
      }
    }
    
    // Initialize real-time updates if enabled
    if (config.enableRealtimeUpdates !== false) {
      try {
        // Use existing event bus from dashboard if available
        const eventBus = dashboard.eventBus || {
          listeners: {},
          on(event, callback) {
            if (!this.listeners[event]) {
              this.listeners[event] = [];
            }
            this.listeners[event].push(callback);
            return this;
          },
          emit(event, data) {
            if (this.listeners[event]) {
              this.listeners[event].forEach(callback => callback(data));
            }
            return this;
          }
        };
        
        // Configure WebSocket endpoint from config or use default
        const wsEndpoint = config.realtimeConfig?.wsEndpoint || 'ws://localhost:8765/pyarrow-content-index/ws';
        
        console.log('Initializing PyArrow Content Index real-time updates with the dedicated client...');
        
        // Get auth token if security is enabled
        let authToken = null;
        if (useSecureManager && config.realtimeConfig?.authRequired !== false) {
          authToken = await getAuthToken(PYARROW_INDEX_CAPABILITIES.READ);
        }
        
        // Create the real-time client instance using PyArrowIndexRealtimeClient
        const realtimeClient = new PyArrowIndexRealtimeClient({
          wsEndpoint,
          pythonBridge, // Pass the Python bridge for server communication
          eventBus,     // Pass the event bus for events
          
          // Authentication support
          authManager: useSecureManager ? authManager : null,
          authToken,
          authRequired: config.realtimeConfig?.authRequired !== false,
          
          // Configuration options
          autoConnect: config.realtimeConfig?.autoConnect !== false,
          autoReconnect: config.realtimeConfig?.autoReconnect !== false,
          reconnectInterval: config.realtimeConfig?.reconnectInterval || 5000,
          heartbeatInterval: config.realtimeConfig?.heartbeatInterval || 30000,
          
          // Metrics options
          metricsEnabled: config.realtimeConfig?.metricsEnabled !== false,
          metricsUpdateInterval: config.realtimeConfig?.metricsUpdateInterval || 30000
        });
        
        // Start the real-time server if needed
        if (config.realtimeConfig?.startServer !== false) {
          console.log('Starting PyArrow Content Index real-time server...');
          
          try {
            // Use the server startup capability of the client
            const serverResult = await realtimeClient.startServer({
              host: config.realtimeConfig?.serverHost || 'localhost',
              port: config.realtimeConfig?.serverPort || 8765,
              authManager: useSecureManager ? true : false
            });
            
            console.log('Real-time server started successfully:', serverResult.success);
          } catch (serverError) {
            console.warn('Failed to start real-time server:', serverError.message);
            // Continue with client connection even if server failed to start
            // (it might be started elsewhere or already running)
          }
        }
        
        // Now integrate with the dashboard UI using our utility to get consistent UI behavior
        console.log('Integrating real-time client with dashboard UI...');
        const realtimeResult = integrateRealtimeUpdates(dashboard.element || dashboard, {
          electronAPI: dashboard.ipc,
          eventBus,
          wsEndpoint,
          
          // Authentication support
          authManager: useSecureManager ? authManager : null,
          authRequired: config.realtimeConfig?.authRequired !== false,
          authToken,
          
          // Feature toggles
          autoConnect: false, // Don't connect in the integrator since we're managing it ourselves
          enableNotifications: config.realtimeConfig?.enableNotifications !== false,
          enableVisualIndicators: config.realtimeConfig?.enableVisualIndicators !== false,
          enableBackgroundRefresh: config.realtimeConfig?.enableBackgroundRefresh !== false,
          
          // WebSocket configuration
          reconnectInterval: config.realtimeConfig?.reconnectInterval || 5000,
          heartbeatInterval: config.realtimeConfig?.heartbeatInterval || 30000,
          bgRefreshInterval: config.realtimeConfig?.backgroundRefreshInterval || 60000,
          
          // Metrics tracking
          metricsEnabled: config.realtimeConfig?.metricsEnabled !== false,
          metricsUpdateInterval: config.realtimeConfig?.metricsUpdateInterval || 30000,
          
          // Add our client interface
          realtimeClient
        });
        
        // Connect real-time updates to the content browser
        if (enhancedResults.browser && enhancedResults.browser.success) {
          console.log('Connecting real-time updates to content browser...');
          
          // Forward real-time events to the content browser
          eventBus.on('content-updated', (updateData) => {
            if (enhancedResults.browser.metadataBrowser) {
              // Mark the item as updated in the browser
              enhancedResults.browser.metadataBrowser.markItemUpdated(
                updateData.content.cid,
                updateData.action
              );
            }
          });
          
          // Handle background refresh
          eventBus.on('background-refresh', (refreshData) => {
            if (enhancedResults.browser.metadataBrowser) {
              // Refresh the browser with the full refresh flag
              enhancedResults.browser.metadataBrowser.refresh(refreshData.fullRefresh);
            }
          });
        }
        
        // Connect real-time updates to statistics visualization
        if (enhancedResults.statistics && enhancedResults.statistics.success) {
          console.log('Connecting real-time updates to statistics visualization...');
          
          // Forward real-time events to update statistics
          eventBus.on('content-updated', () => {
            if (enhancedResults.statistics.visualizationManager) {
              // Refresh the visualization data
              enhancedResults.statistics.visualizationManager.loadData().then(() => {
                enhancedResults.statistics.visualizationManager.updateCharts();
              });
            }
          });
          
          // Handle background refresh
          eventBus.on('background-refresh', () => {
            if (enhancedResults.statistics.visualizationManager) {
              // Refresh the visualization data
              enhancedResults.statistics.visualizationManager.loadData().then(() => {
                enhancedResults.statistics.visualizationManager.updateCharts();
              });
            }
          });
        }
        
        // Setup periodic status updates
        let statusUpdateInterval;
        if (config.realtimeConfig?.statusUpdateInterval !== false) {
          const interval = config.realtimeConfig?.statusUpdateInterval || 30000;
          statusUpdateInterval = setInterval(() => {
            try {
              const status = realtimeClient.getStatus();
              eventBus.emit('realtime-status-update', status);
            } catch (error) {
              console.warn('Error updating realtime status:', error);
            }
          }, interval);
        }
        
        // Add cleanup function to dashboard if available
        if (dashboard && typeof dashboard === 'object') {
          const originalCleanup = dashboard.cleanup || (() => {});
          dashboard.cleanup = function() {
            // Stop the status update interval
            if (statusUpdateInterval) {
              clearInterval(statusUpdateInterval);
            }
            
            // Stop the server and disconnect client
            try {
              realtimeClient.disconnect();
              realtimeClient.stopServer().catch(err => console.warn('Error stopping realtime server:', err));
            } catch (error) {
              console.warn('Error cleaning up realtime client:', error);
            }
            
            // Call original cleanup
            originalCleanup.call(this);
          };
        }
        
        // Add real-time client to dashboard resources
        dashboardResources.realtimeClient = realtimeClient;
        
        // Add real-time updates instance to result
        return {
          success: true,
          message: 'PyArrow Content Index dashboard registered successfully',
          bridge: pyarrowIndexBridge,
          secureManager: useSecureManager ? secureManager : null,
          secureMode: useSecureManager,
          enhancedComponents: enhancedResults,
          realtimeClient,
          eventBus
        };
      } catch (error) {
        console.error('Failed to initialize real-time updates:', error);
        
        // Still return success for the dashboard registration
        return {
          success: true,
          message: 'PyArrow Content Index dashboard registered successfully (real-time updates failed)',
          bridge: pyarrowIndexBridge,
          secureManager: useSecureManager ? secureManager : null,
          secureMode: useSecureManager,
          enhancedComponents: enhancedResults,
          realtimeUpdateError: error.message
        };
      }
    }
    
    return {
      success: true,
      message: 'PyArrow Content Index dashboard registered successfully',
      bridge: pyarrowIndexBridge,
      secureManager: useSecureManager ? secureManager : null,
      secureMode: useSecureManager,
      enhancedComponents: enhancedResults
    };
  } catch (error) {
    console.error('Failed to register PyArrow Content Index dashboard:', error);
    return {
      success: false,
      message: `Failed to register PyArrow Content Index dashboard: ${error.message}`,
      error
    };
  }
}

// Export the registration function
export default registerPyArrowContentIndexDashboard;