/**
 * Database Backup PyArrow Adapter
 * 
 * Provides integration between the database backup system and 
 * the PyArrow Content Index for better metadata tracking and search capabilities.
 * 
 * Features:
 * - Registers database backup metadata in PyArrow Content Index
 * - Provides advanced search capabilities for database backups
 * - Adds metadata enrichment for database backups
 * - Links CIDs from backups to virtual filesystem paths
 * - Implements observability for tracking backup operations
 */

import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

// Import components
import PyArrowIndexBridge from './pyarrow_index_bridge.js';
import { databaseBackupBridge } from './database_backup_bridge.js';
import MetricsCollector from './dashboard/observability/metrics_collector.js';
import { getMetricsRegistry } from './dashboard/observability/metrics_registry.js';

/**
 * Database Backup PyArrow Adapter
 * 
 * Connects the database backup system to the PyArrow content index
 * for enhanced metadata tracking and search capabilities
 */
class DatabaseBackupPyArrowAdapter extends EventEmitter {
  /**
   * Create a new database backup PyArrow adapter
   * 
   * @param {Object} options - Configuration options
   * @param {Object} options.resources - Resource pool
   * @param {Object} options.metadata - Metadata for configuration
   */
  constructor(options = {}) {
    super();
    
    this.options = Object.assign({
      autoInit: true,
      virtualFsRoot: '/backups/databases'
    }, options);
    
    this.resources = this.options.resources || {};
    this.metadata = this.options.metadata || {};
    
    // Initialize PyArrow index bridge if not provided in resources
    if (!this.resources.pyarrowIndexBridge) {
      this.resources.pyarrowIndexBridge = new PyArrowIndexBridge({
        pythonBridge: this.resources.pythonBridge,
        indexPath: path.join(os.homedir(), '.hallucinate_app', 'content_index.arrow'),
        useArrow: true,
        observabilityOptions: { component: 'database_backup_pyarrow_adapter' }
      });
    }
    
    // Use existing database backup bridge or create a reference
    this.databaseBackupBridge = this.resources.databaseBackupBridge || databaseBackupBridge;
    
    // Set up metrics collector for observability
    this.metricsCollector = new MetricsCollector({
      component: 'database_backup_pyarrow_adapter',
      registry: getMetricsRegistry()
    });
    
    // Initialize metrics
    this._initializeMetrics();
    
    // Track recent operations
    this.recentOperations = [];
    this.maxRecentOperations = 50;
    
    // Register event listeners for database backup bridge
    this._registerEventListeners();
    
    // Initialize if requested
    if (this.options.autoInit) {
      this.init().catch(err => {
        console.error('Failed to initialize DatabaseBackupPyArrowAdapter:', err);
        this.metricsCollector.recordError('initialization', 'init', err);
      });
    }
  }
  
  /**
   * Initialize metrics for tracking operations
   * @private
   */
  _initializeMetrics() {
    // Create counters
    this.metricsCollector.createCounter('operations_total', 'Total number of operations', 
      ['operation', 'db_type', 'status']);
    this.metricsCollector.createCounter('metadata_updates_total', 'Total number of metadata updates', 
      ['db_type', 'status']);
    this.metricsCollector.createCounter('search_operations_total', 'Total number of search operations', 
      ['status']);
    this.metricsCollector.createCounter('errors_total', 'Total number of errors', 
      ['operation', 'error_type']);
    
    // Create gauges
    this.metricsCollector.createGauge('indexed_backups', 'Number of indexed backups', 
      ['db_type']);
    this.metricsCollector.createGauge('index_health', 'Index health status (1=healthy, 0=unhealthy)');
    
    // Create histograms
    this.metricsCollector.createHistogram('operation_duration_seconds', 'Duration of operations in seconds', 
      ['operation']);
    this.metricsCollector.createHistogram('search_result_count', 'Number of search results');
    
    // Set initial values
    this.metricsCollector.setGauge('index_health', 1); // Assume healthy at startup
    this.metricsCollector.setGauge('indexed_backups', 0, { db_type: 'orbitdb' });
    this.metricsCollector.setGauge('indexed_backups', 0, { db_type: 'fireproofdb' });
    this.metricsCollector.setGauge('indexed_backups', 0, { db_type: 'duckdb' });
  }
  
  /**
   * Register event listeners for database backup bridge events
   * @private
   */
  _registerEventListeners() {
    // Listen for backup completed events
    this.databaseBackupBridge.on('backup-completed', this._handleBackupCompleted.bind(this));
    
    // Listen for restore completed events
    this.databaseBackupBridge.on('restore-completed', this._handleRestoreCompleted.bind(this));
    
    // Listen for backup listing events to update indexed counts
    this.databaseBackupBridge.on('backups-listed', this._handleBackupsListed.bind(this));
  }
  
  /**
   * Handle backup completed event
   * 
   * @param {Object} data - Backup completed event data
   * @private
   */
  async _handleBackupCompleted(data) {
    const timer = this.metricsCollector.startTimer('operation_duration_seconds', { operation: 'index_backup' });
    
    try {
      // Register backup in PyArrow content index
      const indexResult = await this._registerBackupInIndex(data);
      
      // Record successful operation
      this.metricsCollector.incrementCounter('operations_total', 1, { 
        operation: 'index_backup', 
        db_type: data.db_type, 
        status: 'success' 
      });
      
      // Add to recent operations
      this._addRecentOperation({
        type: 'index_backup',
        db_type: data.db_type,
        backup_id: data.backup_id,
        cid: data.cid,
        timestamp: new Date().toISOString(),
        status: 'success'
      });
      
      // Emit index completed event
      this.emit('backup-indexed', {
        operation_id: data.operation_id,
        db_type: data.db_type,
        backup_id: data.backup_id,
        cid: data.cid,
        virtual_path: indexResult.virtual_path
      });
      
      // Update indexed backups gauge
      const currentValue = this.metricsCollector.getGauge('indexed_backups', { db_type: data.db_type }) || 0;
      this.metricsCollector.setGauge('indexed_backups', currentValue + 1, { db_type: data.db_type });
      
      return indexResult;
    } catch (error) {
      // Record error
      console.error(`Error registering backup in PyArrow index: ${error.message}`, error);
      this.metricsCollector.recordError('index_backup', 'register', error);
      this.metricsCollector.incrementCounter('operations_total', 1, { 
        operation: 'index_backup', 
        db_type: data.db_type, 
        status: 'error' 
      });
      
      // Add to recent operations
      this._addRecentOperation({
        type: 'index_backup',
        db_type: data.db_type,
        backup_id: data.backup_id,
        cid: data.cid,
        timestamp: new Date().toISOString(),
        status: 'error',
        error: error.message
      });
      
      // Emit error event
      this.emit('backup-index-error', {
        operation_id: data.operation_id,
        db_type: data.db_type,
        backup_id: data.backup_id,
        cid: data.cid,
        error: error.message
      });
      
      throw error;
    } finally {
      timer.stop();
    }
  }
  
  /**
   * Handle restore completed event
   * 
   * @param {Object} data - Restore completed event data
   * @private
   */
  async _handleRestoreCompleted(data) {
    const timer = this.metricsCollector.startTimer('operation_duration_seconds', { operation: 'update_restore_metadata' });
    
    try {
      // Update metadata in PyArrow content index with restore information
      const updateResult = await this._updateBackupRestoreMetadata(data);
      
      // Record successful operation
      this.metricsCollector.incrementCounter('operations_total', 1, { 
        operation: 'update_restore_metadata', 
        db_type: data.db_type, 
        status: 'success' 
      });
      
      // Add to recent operations
      this._addRecentOperation({
        type: 'update_restore_metadata',
        db_type: data.db_type,
        backup_id: data.backup_id,
        cid: data.cid,
        timestamp: new Date().toISOString(),
        status: 'success'
      });
      
      // Emit metadata updated event
      this.emit('restore-metadata-updated', {
        operation_id: data.operation_id,
        db_type: data.db_type,
        backup_id: data.backup_id,
        cid: data.cid
      });
      
      return updateResult;
    } catch (error) {
      // Record error
      console.error(`Error updating restore metadata in PyArrow index: ${error.message}`, error);
      this.metricsCollector.recordError('update_restore_metadata', 'update', error);
      this.metricsCollector.incrementCounter('operations_total', 1, { 
        operation: 'update_restore_metadata', 
        db_type: data.db_type, 
        status: 'error' 
      });
      
      // Add to recent operations
      this._addRecentOperation({
        type: 'update_restore_metadata',
        db_type: data.db_type,
        backup_id: data.backup_id,
        cid: data.cid,
        timestamp: new Date().toISOString(),
        status: 'error',
        error: error.message
      });
      
      // Emit error event
      this.emit('restore-metadata-update-error', {
        operation_id: data.operation_id,
        db_type: data.db_type,
        backup_id: data.backup_id,
        cid: data.cid,
        error: error.message
      });
    } finally {
      timer.stop();
    }
  }
  
  /**
   * Handle backups listed event to update indexed counts
   * 
   * @param {Object} data - Backups listed event data
   * @private
   */
  async _handleBackupsListed(data) {
    try {
      // Get the count of backups indexed in PyArrow
      const indexedCount = await this._countIndexedBackups(data.db_type);
      
      // Update the gauge
      this.metricsCollector.setGauge('indexed_backups', indexedCount, { db_type: data.db_type });
      
      // If there's a discrepancy, emit a warning
      if (indexedCount !== data.count) {
        console.warn(`Discrepancy in backup counts for ${data.db_type}: ${data.count} backups, but ${indexedCount} indexed`);
        
        // Emit discrepancy event
        this.emit('backup-index-discrepancy', {
          db_type: data.db_type,
          backup_count: data.count,
          indexed_count: indexedCount,
          difference: data.count - indexedCount
        });
      }
    } catch (error) {
      console.error(`Error counting indexed backups for ${data.db_type}: ${error.message}`);
      this.metricsCollector.recordError('count_indexed', data.db_type, error);
    }
  }
  
  /**
   * Count the number of backups indexed in PyArrow for a database type
   * 
   * @param {string} dbType - Database type
   * @returns {Promise<number>} Number of indexed backups
   * @private
   */
  async _countIndexedBackups(dbType) {
    try {
      // Build a query to count backups of this type
      const query = {
        filter: `type = 'backup' AND db_type = '${dbType}'`,
        count_only: true
      };
      
      // Execute query through PyArrow index
      const result = await this.resources.pyarrowIndexBridge.query(query);
      
      return result.count || 0;
    } catch (error) {
      console.error(`Error counting indexed backups: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Add an operation to the recent operations list
   * 
   * @param {Object} operation - Operation details
   * @private
   */
  _addRecentOperation(operation) {
    // Add to the beginning of the array
    this.recentOperations.unshift(operation);
    
    // Trim if exceeding max length
    if (this.recentOperations.length > this.maxRecentOperations) {
      this.recentOperations = this.recentOperations.slice(0, this.maxRecentOperations);
    }
  }
  
  /**
   * Initialize the adapter
   * 
   * @returns {Promise<boolean>} Initialization result
   */
  async init() {
    const timer = this.metricsCollector.startTimer('operation_duration_seconds', { operation: 'init' });
    
    try {
      // Ensure PyArrow index bridge is initialized
      if (!this.resources.pyarrowIndexBridge.initialized) {
        await this.resources.pyarrowIndexBridge.init();
      }
      
      // Check index health by performing a simple query
      const healthCheck = await this._checkIndexHealth();
      this.metricsCollector.setGauge('index_health', healthCheck ? 1 : 0);
      
      // Initialize database backup counts for each type
      await this._initializeBackupCounts();
      
      this.emit('initialized', { success: true });
      
      return true;
    } catch (error) {
      console.error('Error initializing DatabaseBackupPyArrowAdapter:', error);
      this.metricsCollector.recordError('initialization', 'init', error);
      this.metricsCollector.setGauge('index_health', 0);
      
      this.emit('initialized', { success: false, error: error.message });
      
      return false;
    } finally {
      timer.stop();
    }
  }
  
  /**
   * Check the health of the PyArrow index
   * 
   * @returns {Promise<boolean>} Health status
   * @private
   */
  async _checkIndexHealth() {
    try {
      // Perform a simple query to check if the index is responsive
      const query = {
        limit: 1
      };
      
      await this.resources.pyarrowIndexBridge.query(query);
      return true;
    } catch (error) {
      console.error('PyArrow index health check failed:', error);
      return false;
    }
  }
  
  /**
   * Initialize backup counts for each database type
   * 
   * @returns {Promise<void>}
   * @private
   */
  async _initializeBackupCounts() {
    try {
      // Count backups for each database type
      const dbTypes = ['orbitdb', 'fireproofdb', 'duckdb'];
      
      for (const dbType of dbTypes) {
        const count = await this._countIndexedBackups(dbType);
        this.metricsCollector.setGauge('indexed_backups', count, { db_type: dbType });
      }
    } catch (error) {
      console.error('Error initializing backup counts:', error);
      throw error;
    }
  }
  
  /**
   * Register a database backup in the PyArrow content index
   * 
   * @param {Object} backupData - Backup data from backup-completed event
   * @returns {Promise<Object>} Registration result
   * @private
   */
  async _registerBackupInIndex(backupData) {
    if (!backupData.cid) {
      throw new Error('Missing CID in backup data');
    }
    
    // Build virtual filesystem path for this backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const virtualPath = path.join(
      this.options.virtualFsRoot,
      backupData.db_type,
      `backup-${backupData.backup_id}-${timestamp}`
    );
    
    // Prepare entry for PyArrow content index
    const entry = {
      cid: backupData.cid,
      path: virtualPath,
      type: 'backup',
      db_type: backupData.db_type,
      backup_id: backupData.backup_id,
      created_at: new Date().toISOString(),
      size: backupData.size || 0,
      document_count: backupData.document_count || 0,
      collections: Array.isArray(backupData.collections) ? backupData.collections : 
        (backupData.collections === 'all' ? 'all' : null),
      tables: Array.isArray(backupData.tables) ? backupData.tables : 
        (backupData.tables === 'all' ? 'all' : null),
      metadata: {
        ...backupData.metadata,
        indexed_at: new Date().toISOString(),
        restore_count: 0,
        last_restored: null
      },
      mimetype: 'application/ipld',
      tags: ['backup', `db-type:${backupData.db_type}`, `backup-id:${backupData.backup_id}`]
    };
    
    // Add entry to PyArrow content index
    const result = await this.resources.pyarrowIndexBridge.addEntry(entry);
    
    // Increment metadata updates counter
    this.metricsCollector.incrementCounter('metadata_updates_total', 1, { 
      db_type: backupData.db_type, 
      status: 'success' 
    });
    
    return {
      ...result,
      virtual_path: virtualPath
    };
  }
  
  /**
   * Update backup metadata with restore information
   * 
   * @param {Object} restoreData - Restore data from restore-completed event
   * @returns {Promise<Object>} Update result
   * @private
   */
  async _updateBackupRestoreMetadata(restoreData) {
    if (!restoreData.cid && !restoreData.backup_id) {
      throw new Error('Missing CID or backup_id in restore data');
    }
    
    // Look up the backup by CID or backup_id
    let existingEntry;
    
    if (restoreData.cid) {
      existingEntry = await this.resources.pyarrowIndexBridge.lookupByCid(restoreData.cid);
    } else {
      // Find by backup_id using query
      const query = {
        filter: `backup_id = '${restoreData.backup_id}' AND db_type = '${restoreData.db_type}'`,
        limit: 1
      };
      
      const queryResult = await this.resources.pyarrowIndexBridge.query(query);
      
      if (queryResult && Array.isArray(queryResult) && queryResult.length > 0) {
        existingEntry = queryResult[0];
      }
    }
    
    if (!existingEntry) {
      throw new Error(`Backup not found in index with CID: ${restoreData.cid || 'unknown'} or backup_id: ${restoreData.backup_id || 'unknown'}`);
    }
    
    // Update metadata
    const updateData = {
      metadata: {
        ...existingEntry.metadata,
        restore_count: (existingEntry.metadata?.restore_count || 0) + 1,
        last_restored: new Date().toISOString(),
        last_restore_target_collections: restoreData.collections_restored || restoreData.target_collections,
        last_restore_document_count: restoreData.document_count
      },
      tags: [...(existingEntry.tags || []), 'restored']
    };
    
    // Update entry in PyArrow content index
    const result = await this.resources.pyarrowIndexBridge.updateEntry(existingEntry.cid, updateData);
    
    // Increment metadata updates counter
    this.metricsCollector.incrementCounter('metadata_updates_total', 1, { 
      db_type: restoreData.db_type, 
      status: 'success' 
    });
    
    return result;
  }
  
  /**
   * Search for database backups with advanced filtering
   * 
   * @param {Object} options - Search options
   * @param {string} options.db_type - Database type to filter by
   * @param {string} options.text - Text search term
   * @param {Object} options.filter - Additional filter criteria
   * @param {Object} options.sort - Sort options
   * @param {number} options.limit - Maximum results to return
   * @param {number} options.offset - Result offset for pagination
   * @returns {Promise<Object>} Search results
   */
  async searchBackups(options = {}) {
    const timer = this.metricsCollector.startTimer('operation_duration_seconds', { operation: 'search_backups' });
    
    try {
      // Build filter conditions
      let filterConditions = ["type = 'backup'"];
      
      if (options.db_type) {
        filterConditions.push(`db_type = '${options.db_type}'`);
      }
      
      // Add date range filters if provided
      if (options.filter) {
        if (options.filter.date_from) {
          filterConditions.push(`created_at >= '${options.filter.date_from}'`);
        }
        
        if (options.filter.date_to) {
          filterConditions.push(`created_at <= '${options.filter.date_to}'`);
        }
        
        // Add collection filter if provided
        if (options.filter.collection) {
          // This assumes collections data is stored as a string representation of an array
          filterConditions.push(`collections LIKE '%${options.filter.collection}%'`);
        }
        
        // Add table filter if provided
        if (options.filter.table) {
          // This assumes tables data is stored as a string representation of an array
          filterConditions.push(`tables LIKE '%${options.filter.table}%'`);
        }
        
        // Add restored filter if provided
        if (options.filter.restored !== undefined) {
          if (options.filter.restored) {
            filterConditions.push(`metadata.restore_count > 0`);
          } else {
            filterConditions.push(`metadata.restore_count = 0 OR metadata.restore_count IS NULL`);
          }
        }
        
        // Add size filter if provided
        if (options.filter.min_size !== undefined) {
          filterConditions.push(`size >= ${options.filter.min_size}`);
        }
        
        if (options.filter.max_size !== undefined) {
          filterConditions.push(`size <= ${options.filter.max_size}`);
        }
      }
      
      // Add text search if provided (searches across multiple fields)
      if (options.text) {
        // Sanitize the search text
        const sanitizedText = options.text.replace(/'/g, "''");
        
        // Search across multiple fields
        filterConditions.push(`(
          backup_id LIKE '%${sanitizedText}%' OR 
          path LIKE '%${sanitizedText}%' OR 
          cid LIKE '%${sanitizedText}%' OR
          tags LIKE '%${sanitizedText}%'
        )`);
      }
      
      // Build the query
      const query = {
        filter: filterConditions.join(' AND '),
        sort: options.sort || { field: 'created_at', direction: 'desc' },
        limit: options.limit || 50,
        offset: options.offset || 0
      };
      
      // Execute query
      const results = await this.resources.pyarrowIndexBridge.query(query);
      
      // Update metrics
      this.metricsCollector.incrementCounter('search_operations_total', 1, { status: 'success' });
      if (Array.isArray(results)) {
        this.metricsCollector.recordHistogram('search_result_count', results.length);
      }
      
      return {
        backups: Array.isArray(results) ? results : [],
        total: Array.isArray(results) ? results.length : 0,
        query: query
      };
    } catch (error) {
      console.error(`Error searching backups: ${error.message}`, error);
      this.metricsCollector.recordError('search', 'query', error);
      this.metricsCollector.incrementCounter('search_operations_total', 1, { status: 'error' });
      
      throw error;
    } finally {
      timer.stop();
    }
  }
  
  /**
   * Get detailed information about a specific backup by ID or CID
   * 
   * @param {Object} options - Query options
   * @param {string} options.backup_id - Backup ID to look up
   * @param {string} options.cid - Content ID to look up
   * @param {string} options.db_type - Database type
   * @returns {Promise<Object>} Backup details
   */
  async getBackupDetails(options = {}) {
    const timer = this.metricsCollector.startTimer('operation_duration_seconds', { operation: 'get_backup_details' });
    
    try {
      let entry;
      
      // Look up by CID if provided
      if (options.cid) {
        entry = await this.resources.pyarrowIndexBridge.lookupByCid(options.cid);
      } 
      // Otherwise, search by backup_id and db_type
      else if (options.backup_id && options.db_type) {
        const query = {
          filter: `backup_id = '${options.backup_id}' AND db_type = '${options.db_type}' AND type = 'backup'`,
          limit: 1
        };
        
        const results = await this.resources.pyarrowIndexBridge.query(query);
        
        if (Array.isArray(results) && results.length > 0) {
          entry = results[0];
        }
      } else {
        throw new Error('Either cid or both backup_id and db_type must be provided');
      }
      
      if (!entry) {
        throw new Error('Backup not found in content index');
      }
      
      // Also get the backup info from the database backup bridge
      let backupInfo;
      try {
        backupInfo = await this.databaseBackupBridge.getBackupInfo(
          entry.db_type,
          entry.backup_id,
          options.auth_token
        );
      } catch (error) {
        console.warn(`Could not get backup info from database backup bridge: ${error.message}`);
        backupInfo = { error: error.message };
      }
      
      // Combine information
      const result = {
        ...entry,
        backup_info: backupInfo,
        enhanced_metadata: {
          indexed_at: entry.metadata?.indexed_at || null,
          restore_count: entry.metadata?.restore_count || 0,
          last_restored: entry.metadata?.last_restored || null,
          virtual_path: entry.path
        }
      };
      
      // Success metrics
      this.metricsCollector.incrementCounter('operations_total', 1, { 
        operation: 'get_backup_details', 
        db_type: entry.db_type, 
        status: 'success' 
      });
      
      return result;
    } catch (error) {
      console.error(`Error getting backup details: ${error.message}`, error);
      this.metricsCollector.recordError('get_backup_details', 'lookup', error);
      this.metricsCollector.incrementCounter('operations_total', 1, { 
        operation: 'get_backup_details', 
        db_type: options.db_type || 'unknown', 
        status: 'error' 
      });
      
      throw error;
    } finally {
      timer.stop();
    }
  }
  
  /**
   * Get aggregated statistics about indexed backups
   * 
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Statistics
   */
  async getBackupStats(options = {}) {
    const timer = this.metricsCollector.startTimer('operation_duration_seconds', { operation: 'get_backup_stats' });
    
    try {
      const stats = {
        total_count: 0,
        by_db_type: {},
        by_month: {},
        restore_metrics: {
          total_restores: 0,
          average_restore_time: 0
        },
        size_metrics: {
          total_size: 0,
          average_size: 0,
          min_size: 0,
          max_size: 0
        }
      };
      
      // Query for all backups
      const query = {
        filter: "type = 'backup'",
        sort: { field: 'created_at', direction: 'desc' }
      };
      
      const results = await this.resources.pyarrowIndexBridge.query(query);
      
      if (!Array.isArray(results) || results.length === 0) {
        return stats;
      }
      
      // Process results
      stats.total_count = results.length;
      
      // Group by database type
      for (const backup of results) {
        // By DB type
        if (!stats.by_db_type[backup.db_type]) {
          stats.by_db_type[backup.db_type] = 0;
        }
        stats.by_db_type[backup.db_type]++;
        
        // By month
        const created = new Date(backup.created_at);
        const monthKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
        
        if (!stats.by_month[monthKey]) {
          stats.by_month[monthKey] = 0;
        }
        stats.by_month[monthKey]++;
        
        // Restore metrics
        const restoreCount = backup.metadata?.restore_count || 0;
        stats.restore_metrics.total_restores += restoreCount;
        
        // Size metrics
        if (backup.size) {
          const size = parseInt(backup.size, 10);
          stats.size_metrics.total_size += size;
          
          if (stats.size_metrics.min_size === 0 || size < stats.size_metrics.min_size) {
            stats.size_metrics.min_size = size;
          }
          
          if (size > stats.size_metrics.max_size) {
            stats.size_metrics.max_size = size;
          }
        }
      }
      
      // Calculate averages
      if (stats.total_count > 0) {
        stats.size_metrics.average_size = Math.floor(stats.size_metrics.total_size / stats.total_count);
      }
      
      // Success metrics
      this.metricsCollector.incrementCounter('operations_total', 1, { 
        operation: 'get_backup_stats', 
        db_type: 'all', 
        status: 'success' 
      });
      
      return stats;
    } catch (error) {
      console.error(`Error getting backup stats: ${error.message}`, error);
      this.metricsCollector.recordError('get_backup_stats', 'aggregation', error);
      this.metricsCollector.incrementCounter('operations_total', 1, { 
        operation: 'get_backup_stats', 
        db_type: 'all', 
        status: 'error' 
      });
      
      throw error;
    } finally {
      timer.stop();
    }
  }
  
  /**
   * Check for backups that exist in the backup system but not in the index
   * and add them to the index
   * 
   * @param {Object} options - Sync options
   * @param {string} options.db_type - Database type to sync
   * @param {string} options.auth_token - Authentication token
   * @returns {Promise<Object>} Sync results
   */
  async syncBackupsToIndex(options = {}) {
    const timer = this.metricsCollector.startTimer('operation_duration_seconds', { operation: 'sync_backups_to_index' });
    
    try {
      // Get all backups from the backup bridge
      const backupList = await this.databaseBackupBridge.listBackups(
        options.db_type,
        options.auth_token
      );
      
      if (!backupList || !Array.isArray(backupList.backups)) {
        throw new Error('Failed to get backup list from database backup bridge');
      }
      
      // Query for all indexed backups of this type
      const query = {
        filter: `type = 'backup' AND db_type = '${options.db_type}'`
      };
      
      const indexedBackups = await this.resources.pyarrowIndexBridge.query(query);
      
      // Create a map of indexed backups by backup_id
      const indexedBackupMap = {};
      if (Array.isArray(indexedBackups)) {
        for (const backup of indexedBackups) {
          indexedBackupMap[backup.backup_id] = backup;
        }
      }
      
      // Find backups that need to be indexed
      const backupsToIndex = [];
      for (const backup of backupList.backups) {
        if (!indexedBackupMap[backup.backup_id]) {
          backupsToIndex.push(backup);
        }
      }
      
      // Index missing backups
      const results = {
        total: backupList.backups.length,
        indexed: indexedBackups ? indexedBackups.length : 0,
        missing: backupsToIndex.length,
        newly_indexed: 0,
        errors: 0,
        details: []
      };
      
      // Process each backup that needs indexing
      for (const backup of backupsToIndex) {
        try {
          // Get detailed info for the backup
          const backupInfo = await this.databaseBackupBridge.getBackupInfo(
            options.db_type,
            backup.backup_id,
            options.auth_token
          );
          
          // Register in the index
          const indexResult = await this._registerBackupInIndex({
            ...backupInfo,
            db_type: options.db_type,
            backup_id: backup.backup_id,
            cid: backup.cid
          });
          
          results.newly_indexed++;
          results.details.push({
            backup_id: backup.backup_id,
            cid: backup.cid,
            status: 'indexed',
            virtual_path: indexResult.virtual_path
          });
        } catch (error) {
          console.error(`Error indexing backup ${backup.backup_id}: ${error.message}`);
          results.errors++;
          results.details.push({
            backup_id: backup.backup_id,
            cid: backup.cid,
            status: 'error',
            error: error.message
          });
        }
      }
      
      // Update metrics
      this.metricsCollector.incrementCounter('operations_total', 1, { 
        operation: 'sync_backups_to_index', 
        db_type: options.db_type, 
        status: 'success' 
      });
      
      // Update indexed backups gauge
      this.metricsCollector.setGauge('indexed_backups', results.indexed + results.newly_indexed, { 
        db_type: options.db_type 
      });
      
      return results;
    } catch (error) {
      console.error(`Error syncing backups to index: ${error.message}`, error);
      this.metricsCollector.recordError('sync_backups_to_index', 'sync', error);
      this.metricsCollector.incrementCounter('operations_total', 1, { 
        operation: 'sync_backups_to_index', 
        db_type: options.db_type || 'unknown', 
        status: 'error' 
      });
      
      throw error;
    } finally {
      timer.stop();
    }
  }
  
  /**
   * Get recent operations performed by the adapter
   * 
   * @param {number} limit - Maximum number of operations to return
   * @returns {Array} Recent operations
   */
  getRecentOperations(limit = 10) {
    return this.recentOperations.slice(0, limit);
  }
  
  /**
   * Get metrics and statistics for the adapter
   * 
   * @returns {Object} Metrics and statistics
   */
  getMetrics() {
    return {
      counters: {
        operations: {
          index_backup: this.metricsCollector.getCounter('operations_total', { 
            operation: 'index_backup', status: 'success' 
          }) || 0,
          search: this.metricsCollector.getCounter('search_operations_total', { 
            status: 'success' 
          }) || 0,
          metadata_updates: this.metricsCollector.getCounter('metadata_updates_total', { 
            status: 'success' 
          }) || 0
        },
        errors: this.metricsCollector.getCounter('errors_total') || 0
      },
      gauges: {
        indexed_backups: {
          orbitdb: this.metricsCollector.getGauge('indexed_backups', { db_type: 'orbitdb' }) || 0,
          fireproofdb: this.metricsCollector.getGauge('indexed_backups', { db_type: 'fireproofdb' }) || 0,
          duckdb: this.metricsCollector.getGauge('indexed_backups', { db_type: 'duckdb' }) || 0
        },
        index_health: this.metricsCollector.getGauge('index_health') || 0
      },
      histograms: {
        operation_duration: {
          search: this.metricsCollector.getHistogram('operation_duration_seconds', { 
            operation: 'search_backups' 
          }),
          index: this.metricsCollector.getHistogram('operation_duration_seconds', { 
            operation: 'index_backup' 
          })
        },
        search_result_count: this.metricsCollector.getHistogram('search_result_count')
      }
    };
  }
  
  /**
   * Perform a test of adapter functionality
   * 
   * @returns {Promise<Object>} Test results
   */
  async test() {
    try {
      const results = {
        module: 'DatabaseBackupPyArrowAdapter',
        success: false,
        operations: {},
        diagnostics: {
          pyarrow_index_bridge_available: !!this.resources.pyarrowIndexBridge,
          database_backup_bridge_available: !!this.databaseBackupBridge,
          index_health: await this._checkIndexHealth()
        }
      };
      
      // Test search functionality
      try {
        const searchResult = await this.searchBackups({
          limit: 5
        });
        
        results.operations.search = {
          success: true,
          result_count: searchResult.backups.length,
          message: `Successfully searched for backups, found ${searchResult.backups.length} results`
        };
      } catch (error) {
        results.operations.search = {
          success: false,
          message: `Failed to search backups: ${error.message}`
        };
      }
      
      // Test stats functionality
      try {
        const statsResult = await this.getBackupStats();
        
        results.operations.stats = {
          success: true,
          total_count: statsResult.total_count,
          message: `Successfully retrieved backup stats with ${statsResult.total_count} total backups`
        };
      } catch (error) {
        results.operations.stats = {
          success: false,
          message: `Failed to get backup stats: ${error.message}`
        };
      }
      
      // Determine overall success
      const operationSuccesses = Object.values(results.operations).map(op => op.success);
      results.success = operationSuccesses.length > 0 && operationSuccesses.every(Boolean);
      
      return results;
    } catch (error) {
      console.error(`Error in test: ${error.message}`);
      return {
        module: 'DatabaseBackupPyArrowAdapter',
        success: false,
        error: error.message
      };
    }
  }
}

// Create singleton instance
const databaseBackupPyArrowAdapter = new DatabaseBackupPyArrowAdapter();

// Export both the class and singleton instance
export {
  DatabaseBackupPyArrowAdapter,
  databaseBackupPyArrowAdapter
};