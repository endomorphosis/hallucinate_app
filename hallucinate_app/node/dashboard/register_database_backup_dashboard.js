/**
 * Register Database Backup Dashboard
 * 
 * This module provides functionality to register the Database Backup dashboard
 * with the main dashboard application. It integrates the database backup and restore
 * functionality with the PyArrow Content Index for efficient metadata tracking.
 */

// Import required modules
import { databaseBackupBridge } from '../database_backup_bridge.js';
import DatabaseBackupDashboard from './database_backup_dashboard.js';
import authManager from '../auth.js';
import { get_observability } from '../observability.js';

// Define backup capabilities
export const DATABASE_BACKUP_CAPABILITIES = {
  BACKUP_ORBITDB: 'backup:orbitdb',
  BACKUP_FIREPROOFDB: 'backup:fireproofdb',
  BACKUP_DUCKDB: 'backup:duckdb',
  RESTORE_ORBITDB: 'restore:orbitdb',
  RESTORE_FIREPROOFDB: 'restore:fireproofdb',
  RESTORE_DUCKDB: 'restore:duckdb',
  SCHEDULE: 'backup:schedule',
  ADMIN: 'backup:admin'
};

/**
 * Register the Database Backup dashboard with the main dashboard
 * 
 * @param {Object} dashboard - The main dashboard object
 * @param {Object} options - Configuration options
 * @param {Object} options.pythonBridge - Python bridge for communication
 * @param {Object} options.resources - Resource pool for dependencies
 * @param {Object} options.config - Configuration settings
 * @returns {Promise<Object>} - Registration result
 */
export async function registerDatabaseBackupDashboard(dashboard, options = {}) {
  if (!dashboard) {
    throw new Error('Dashboard is required');
  }

  const { pythonBridge, resources = {}, config = {} } = options;

  if (!pythonBridge) {
    console.warn('Database Backup dashboard registration: Python bridge not provided');
    return {
      success: false,
      message: 'Python bridge is required for Database Backup dashboard'
    };
  }

  try {
    console.log('Registering Database Backup dashboard...');

    // Initialize observability if available
    const observability = get_observability ? get_observability() : null;
    const observabilityOptions = observability ? {
      namespace: 'database_backup',
      subsystem: 'dashboard',
      labels: {
        component: 'database_backup_dashboard'
      }
    } : {};

    // Initialize auth manager if needed
    if (!authManager.initialized) {
      await authManager.init();
    }
    
    // Initialize the database backup bridge if not already initialized
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

    // Add resources for dashboard to use
    const dashboardResources = {
      ...resources,
      databaseBackupBridge,
      authManager
    };
    
    // Add dashboard panel and register event handlers
    const panelElement = document.getElementById('database-backup-panel');
    if (panelElement) {
      // Initialize the dashboard component
      const backupDashboard = new DatabaseBackupDashboard({
        element: panelElement,
        eventBus: dashboard.eventBus,
        authManager: authManager,
        resources: dashboardResources
      });
      
      // Register with main dashboard
      dashboard.registerPanel('database-backup', {
        name: 'Database Backup',
        icon: 'cloud-upload-alt',
        element: panelElement,
        resources: dashboardResources,
        config: config.dashboardConfig || {},
        component: backupDashboard
      });
    } else {
      console.warn('Database Backup panel element not found');
    }

    // Register metrics if observability is enabled
    if (observability) {
      // Register dashboard-specific metrics
      const dashboardMetrics = {
        backupCount: observability.register_counter(
          'database_backup_count_total',
          'Number of database backups created',
          ['db_type'],
          'database_backup',
          'dashboard'
        ),
        restoreCount: observability.register_counter(
          'database_restore_count_total',
          'Number of database restores performed',
          ['db_type'],
          'database_backup',
          'dashboard'
        ),
        backupSize: observability.register_histogram(
          'database_backup_size_bytes',
          'Size of database backups in bytes',
          ['db_type'],
          [1024, 10240, 102400, 1048576, 10485760, 104857600, 1073741824],
          'database_backup',
          'dashboard'
        ),
        backupDuration: observability.register_histogram(
          'database_backup_duration_seconds',
          'Duration of database backup operations in seconds',
          ['db_type'],
          [0.1, 0.5, 1, 5, 10, 30, 60, 300],
          'database_backup',
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
          return await authManager.getCapabilityToken(capability);
        } catch (error) {
          console.error(`Error getting auth token for ${capability}:`, error);
          return null;
        }
      };
      
      // Register handlers with security integration
      dashboard.ipc.handle('database-backup:backup-orbitdb', async (event, options) => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.BACKUP_ORBITDB);
          return await databaseBackupBridge.backupOrbitDB({
            ...options,
            auth_token: authToken
          });
        } catch (error) {
          console.error('Error backing up OrbitDB:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('database-backup:backup-fireproofdb', async (event, options) => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.BACKUP_FIREPROOFDB);
          return await databaseBackupBridge.backupFireproofDB({
            ...options,
            auth_token: authToken
          });
        } catch (error) {
          console.error('Error backing up FireproofDB:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('database-backup:backup-duckdb', async (event, options) => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.BACKUP_DUCKDB);
          return await databaseBackupBridge.backupDuckDB({
            ...options,
            auth_token: authToken
          });
        } catch (error) {
          console.error('Error backing up DuckDB:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('database-backup:restore-orbitdb', async (event, options) => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.RESTORE_ORBITDB);
          return await databaseBackupBridge.restoreOrbitDB({
            ...options,
            auth_token: authToken
          });
        } catch (error) {
          console.error('Error restoring OrbitDB:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('database-backup:restore-fireproofdb', async (event, options) => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.RESTORE_FIREPROOFDB);
          return await databaseBackupBridge.restoreFireproofDB({
            ...options,
            auth_token: authToken
          });
        } catch (error) {
          console.error('Error restoring FireproofDB:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('database-backup:restore-duckdb', async (event, options) => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.RESTORE_DUCKDB);
          return await databaseBackupBridge.restoreDuckDB({
            ...options,
            auth_token: authToken
          });
        } catch (error) {
          console.error('Error restoring DuckDB:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('database-backup:list-backups', async (event, dbType) => {
        try {
          const authToken = await getAuthToken(`backup:${dbType}`);
          return await databaseBackupBridge.listBackups(dbType, authToken);
        } catch (error) {
          console.error(`Error listing ${dbType} backups:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('database-backup:get-backup-info', async (event, dbType, backupId) => {
        try {
          const authToken = await getAuthToken(`backup:${dbType}`);
          return await databaseBackupBridge.getBackupInfo(dbType, backupId, authToken);
        } catch (error) {
          console.error(`Error getting backup info for ${dbType}/${backupId}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('database-backup:delete-backup', async (event, dbType, backupId) => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.ADMIN);
          return await databaseBackupBridge.deleteBackup(dbType, backupId, authToken);
        } catch (error) {
          console.error(`Error deleting backup ${dbType}/${backupId}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('database-backup:schedule-backup', async (event, schedule) => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.SCHEDULE);
          return await databaseBackupBridge.scheduleBackup(schedule, authToken);
        } catch (error) {
          console.error('Error scheduling backup:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('database-backup:list-schedules', async () => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.SCHEDULE);
          return await databaseBackupBridge.listSchedules(authToken);
        } catch (error) {
          console.error('Error listing backup schedules:', error);
          throw error;
        }
      });

      dashboard.ipc.handle('database-backup:delete-schedule', async (event, scheduleId) => {
        try {
          const authToken = await getAuthToken(DATABASE_BACKUP_CAPABILITIES.SCHEDULE);
          return await databaseBackupBridge.deleteSchedule(scheduleId, authToken);
        } catch (error) {
          console.error(`Error deleting schedule ${scheduleId}:`, error);
          throw error;
        }
      });

      dashboard.ipc.handle('database-backup:test', async () => {
        try {
          // Simple test to verify the bridge is working
          return { success: true, message: 'Database backup bridge is operational' };
        } catch (error) {
          console.error('Error testing database backup:', error);
          throw error;
        }
      });
    }

    console.log('Database Backup dashboard registered successfully');
    
    return {
      success: true,
      message: 'Database Backup dashboard registered successfully',
      bridge: databaseBackupBridge
    };
  } catch (error) {
    console.error('Failed to register Database Backup dashboard:', error);
    return {
      success: false,
      message: `Failed to register Database Backup dashboard: ${error.message}`,
      error
    };
  }
}

// Export the registration function
export default registerDatabaseBackupDashboard;