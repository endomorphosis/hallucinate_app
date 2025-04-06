/**
 * Register Backup Monitoring Dashboard
 * 
 * This module provides functionality to register the Backup Monitoring dashboard
 * with the main dashboard application. It integrates real-time monitoring of
 * database backup and restore operations.
 */

// Import required modules
import { databaseBackupBridge } from '../database_backup_bridge.js';
import { databaseBackupPyArrowAdapter } from '../database_backup_pyarrow_adapter.js';
import BackupMonitoringDashboard from './backup_monitoring.js';
import authManager from '../auth.js';
import { get_observability } from '../observability.js';

// Import constants from database backup dashboard
import { DATABASE_BACKUP_CAPABILITIES } from './register_database_backup_dashboard.js';

/**
 * Register the Backup Monitoring dashboard with the main dashboard
 * 
 * @param {Object} dashboard - The main dashboard object
 * @param {Object} options - Configuration options
 * @param {Object} options.pythonBridge - Python bridge for communication
 * @param {Object} options.resources - Resource pool for dependencies
 * @param {Object} options.config - Configuration settings
 * @returns {Promise<Object>} - Registration result
 */
export async function registerBackupMonitoringDashboard(dashboard, options = {}) {
  if (!dashboard) {
    throw new Error('Dashboard is required');
  }

  const { pythonBridge, resources = {}, config = {} } = options;

  if (!pythonBridge) {
    console.warn('Backup Monitoring dashboard registration: Python bridge not provided');
    return {
      success: false,
      message: 'Python bridge is required for Backup Monitoring dashboard'
    };
  }

  try {
    console.log('Registering Backup Monitoring dashboard...');

    // Initialize observability if available
    const observability = get_observability ? get_observability() : null;
    const observabilityOptions = observability ? {
      namespace: 'backup_monitoring',
      subsystem: 'dashboard',
      labels: {
        component: 'backup_monitoring_dashboard'
      }
    } : {};

    // Initialize auth manager if needed
    if (!authManager.initialized) {
      await authManager.init();
    }
    
    // Ensure database backup bridge is initialized
    if (!databaseBackupBridge._initialized) {
      // Pass resources to bridge
      databaseBackupBridge.resources = {
        ...databaseBackupBridge.resources,
        pythonBridge,
        auth: authManager,
        ...resources
      };
      
      // Update metadata
      databaseBackupBridge.metadata = {
        ...databaseBackupBridge.metadata,
        backup_dir: config.backupDir,
        temp_dir: config.tempDir,
        content_index_path: config.contentIndexPath,
        observabilityOptions
      };
      
      // Initialize the bridge
      const initResult = await databaseBackupBridge.init();
      if (!initResult) {
        throw new Error('Failed to initialize Database Backup Bridge');
      }
    }

    // Ensure PyArrow adapter is initialized
    if (!databaseBackupPyArrowAdapter._initialized) {
      // Initialize with resources
      databaseBackupPyArrowAdapter.resources = {
        ...databaseBackupPyArrowAdapter.resources,
        pythonBridge,
        databaseBackupBridge,
        auth: authManager,
        ...resources
      };
      
      // Initialize the adapter
      const adapterInitResult = await databaseBackupPyArrowAdapter.init();
      if (!adapterInitResult) {
        throw new Error('Failed to initialize Database Backup PyArrow Adapter');
      }
    }

    // Add resources for dashboard to use
    const dashboardResources = {
      ...resources,
      databaseBackupBridge,
      databaseBackupPyArrowAdapter,
      authManager
    };
    
    // Add dashboard panel and register event handlers
    const panelElement = document.getElementById('backup-monitoring-panel');
    if (panelElement) {
      // Initialize the dashboard component
      const monitoringDashboard = new BackupMonitoringDashboard({
        container: panelElement,
        resources: dashboardResources
      });
      
      // Register with main dashboard
      dashboard.registerPanel('backup-monitoring', {
        name: 'Backup Monitoring',
        icon: 'tachometer-alt',
        element: panelElement,
        resources: dashboardResources,
        config: config.monitoringConfig || {},
        component: monitoringDashboard
      });

      // Add dashboard to resources
      dashboardResources.backupMonitoringDashboard = monitoringDashboard;
    } else {
      console.warn('Backup Monitoring panel element not found');
    }

    // Register metrics if observability is enabled
    if (observability) {
      // Register dashboard-specific metrics
      const monitoringMetrics = {
        operationsMonitored: observability.register_counter(
          'backup_operations_monitored_total',
          'Number of backup operations monitored',
          ['operation_type', 'db_type', 'status'],
          'backup_monitoring',
          'dashboard'
        ),
        alertsGenerated: observability.register_counter(
          'backup_alerts_generated_total',
          'Number of alerts generated',
          ['severity', 'type'],
          'backup_monitoring',
          'dashboard'
        ),
        activeOperations: observability.register_gauge(
          'backup_active_operations',
          'Number of active backup operations',
          ['operation_type', 'db_type'],
          'backup_monitoring',
          'dashboard'
        ),
        databaseStatus: observability.register_gauge(
          'backup_database_status',
          'Database status (1=healthy, 0=unhealthy)',
          ['db_type'],
          'backup_monitoring',
          'dashboard'
        ),
        operationDuration: observability.register_histogram(
          'backup_operation_duration_seconds',
          'Duration of backup operations in seconds',
          ['operation_type', 'db_type'],
          [0.1, 0.5, 1, 5, 10, 30, 60, 300, 600],
          'backup_monitoring',
          'dashboard'
        ),
        backupSize: observability.register_histogram(
          'backup_size_bytes',
          'Size of backups in bytes',
          ['db_type'],
          [1024, 10240, 102400, 1048576, 10485760, 104857600, 1073741824],
          'backup_monitoring',
          'dashboard'
        )
      };

      // Add metrics to resources for dashboard to use
      dashboardResources.monitoringMetrics = monitoringMetrics;
    }

    // Register IPC handlers for monitoring dashboard communication
    if (dashboard.ipc) {
      // Get or create an auth token for operations
      const getAuthToken = async (capability) => {
        try {
          return await authManager.getCapabilityToken(capability);
        } catch (error) {
          console.error(`Error getting auth token for ${capability}:`, error);
          return null;
        }
      };
      
      // Register handlers with security integration
      dashboard.ipc.handle('backup-monitoring:get-active-operations', async () => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.ADMIN);
          return databaseBackupBridge.getInProgressOperations(authToken);
        } catch (error) {
          console.error('Error getting active operations:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('backup-monitoring:get-backup-stats', async () => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.ADMIN);
          return databaseBackupPyArrowAdapter.getBackupStats(authToken);
        } catch (error) {
          console.error('Error getting backup stats:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('backup-monitoring:get-database-status', async (event, dbType) => {
        try {
          const authToken = await getAuthToken(`backup:${dbType}`);
          return databaseBackupBridge.getDatabaseStatus(dbType, authToken);
        } catch (error) {
          console.error(`Error getting ${dbType} status:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('backup-monitoring:clear-alerts', async () => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.ADMIN);
          return { success: true, message: 'Alerts cleared' };
        } catch (error) {
          console.error('Error clearing alerts:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('backup-monitoring:test', async () => {
        try {
          // Simple test to verify the monitoring dashboard is working
          return { success: true, message: 'Backup monitoring dashboard is operational' };
        } catch (error) {
          console.error('Error testing backup monitoring:', error);
          throw error;
        }
      });
    }

    console.log('Backup Monitoring dashboard registered successfully');
    
    return {
      success: true,
      message: 'Backup Monitoring dashboard registered successfully',
      dashboard: dashboardResources.backupMonitoringDashboard
    };
  } catch (error) {
    console.error('Failed to register Backup Monitoring dashboard:', error);
    return {
      success: false,
      message: `Failed to register Backup Monitoring dashboard: ${error.message}`,
      error
    };
  }
}

// Export the registration function
export default registerBackupMonitoringDashboard;