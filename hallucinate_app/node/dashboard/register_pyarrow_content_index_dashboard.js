/**
 * Register PyArrow Content Index Dashboard
 * 
 * This module provides functionality to register the PyArrow Content Index dashboard
 * with the main dashboard application. It manages the connection between the
 * dashboard UI and the PyArrow Content Index bridge.
 */

// Import required modules
import PyArrowIndexBridge from '../pyarrow_index_bridge.js';
import securePyArrowIndexManager, { PYARROW_INDEX_CAPABILITIES } from '../secure_pyarrow_index_manager.js';
import authManager from '../auth.js';
import { get_observability } from '../observability.js';

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
    return {
      success: true,
      message: 'PyArrow Content Index dashboard registered successfully',
      bridge: pyarrowIndexBridge,
      secureManager: useSecureManager ? secureManager : null,
      secureMode: useSecureManager
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