/**
 * Register PyArrow Content Index Dashboard
 * 
 * This module provides functionality to register the PyArrow Content Index dashboard
 * with the main dashboard application. It manages the connection between the
 * dashboard UI and the PyArrow Content Index bridge.
 */

// Import required modules
import PyArrowIndexBridge from '../pyarrow_index_bridge.js';
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

    // Create PyArrow Index Bridge instance
    const pyarrowIndexBridge = new PyArrowIndexBridge({
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

    // Add bridge to resources for dashboard to use
    const dashboardResources = {
      ...resources,
      pyarrowIndexBridge
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
      // Register handlers for PyArrow Content Index operations
      dashboard.ipc.handle('pyarrow-content-index:lookup-by-cid', async (event, cid) => {
        try {
          return await pyarrowIndexBridge.lookupByCid(cid);
        } catch (error) {
          console.error(`Error looking up CID ${cid}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:lookup-by-path', async (event, path) => {
        try {
          return await pyarrowIndexBridge.lookupByPath(path);
        } catch (error) {
          console.error(`Error looking up path ${path}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:query', async (event, queryParams) => {
        try {
          return await pyarrowIndexBridge.query(queryParams);
        } catch (error) {
          console.error('Error querying content index:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:get-stats', async () => {
        try {
          return await pyarrowIndexBridge.getStats();
        } catch (error) {
          console.error('Error getting content index stats:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:add-entry', async (event, entry) => {
        try {
          return await pyarrowIndexBridge.addEntry(entry);
        } catch (error) {
          console.error('Error adding content index entry:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:update-entry', async (event, cid, updateData) => {
        try {
          return await pyarrowIndexBridge.updateEntry(cid, updateData);
        } catch (error) {
          console.error(`Error updating content index entry ${cid}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:delete-entry', async (event, cid) => {
        try {
          return await pyarrowIndexBridge.deleteEntry(cid);
        } catch (error) {
          console.error(`Error deleting content index entry ${cid}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:sync-with-ipfs-pinset', async (event, includeMetadata) => {
        try {
          return await pyarrowIndexBridge.syncWithIpfsPinset(includeMetadata);
        } catch (error) {
          console.error('Error syncing content index with IPFS pinset:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:export-to-parquet', async (event, exportPath) => {
        try {
          return await pyarrowIndexBridge.exportToParquet(exportPath);
        } catch (error) {
          console.error(`Error exporting content index to Parquet ${exportPath}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:import-from-parquet', async (event, importPath) => {
        try {
          return await pyarrowIndexBridge.importFromParquet(importPath);
        } catch (error) {
          console.error(`Error importing content index from Parquet ${importPath}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('pyarrow-content-index:test', async () => {
        try {
          return await pyarrowIndexBridge.test();
        } catch (error) {
          console.error('Error running content index test:', error);
          throw error;
        }
      });
    }

    console.log('PyArrow Content Index dashboard registered successfully');
    return {
      success: true,
      message: 'PyArrow Content Index dashboard registered successfully',
      bridge: pyarrowIndexBridge
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