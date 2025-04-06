/**
 * PyArrow Content Index JavaScript Bridge
 * 
 * Provides a bridge between the PyArrow Content Index Python implementation
 * and JavaScript, with observability integration for monitoring and metrics.
 * 
 * @module pyarrow_index_bridge
 */

import path from 'path';
import os from 'os';
import { get_observability, track_operation, track_error, is_enabled } from './observability.js';

/**
 * PyArrow Content Index JavaScript Bridge
 */
class PyArrowIndexBridge {
  /**
   * Initialize the PyArrow content index bridge
   * 
   * @param {Object} options - Configuration options
   * @param {Object} options.pythonBridge - Python bridge instance for communication
   * @param {string} options.indexPath - Path to the content index file
   * @param {boolean} options.useArrow - Whether to use Arrow for data transfer
   * @param {Object} options.resources - Additional resources for initialization
   * @param {Object} options.observabilityOptions - Observability configuration options
   */
  constructor(options = {}) {
    this.pythonBridge = options.pythonBridge;
    this.indexPath = options.indexPath || path.join(os.homedir(), '.hallucinate_app', 'content_index.arrow');
    this.useArrow = options.useArrow !== false; // Default to true
    this.resources = options.resources || {};
    this.initialized = false;
    this.bridgeModule = 'pyarrow_content_index_bridge';
    this.bridgeInstance = 'content_index_bridge';
    
    // Initialize observability
    this.observability = null;
    this.observabilityEnabled = false;
    this._initializeObservability(options.observabilityOptions || {});
    
    // Track operation stats
    this.stats = {
      operations: 0,
      errors: 0,
      lastError: null,
      lastOperation: null,
      startTime: Date.now()
    };
  }

  /**
   * Initialize observability for metrics tracking
   * 
   * @param {Object} options - Observability configuration options
   * @private
   */
  _initializeObservability(options = {}) {
    try {
      // Check if observability is enabled and available
      if (is_enabled && is_enabled()) {
        this.observability = get_observability();
        
        if (this.observability) {
          // Register observability metrics
          this.metrics = {
            operations: this.observability.register_counter(
              "pyarrow_index_operations_total",
              "Total number of PyArrow index operations",
              ["operation", "status"],
              "pyarrow_index",
              "bridge"
            ),
            errors: this.observability.register_counter(
              "pyarrow_index_errors_total",
              "Total number of PyArrow index errors",
              ["operation", "error_type"],
              "pyarrow_index",
              "bridge"
            ),
            operationDuration: this.observability.register_histogram(
              "pyarrow_index_operation_duration_seconds",
              "Duration of PyArrow index operations in seconds",
              ["operation"],
              "pyarrow_index",
              "bridge",
              [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30]
            ),
            indexSize: this.observability.register_gauge(
              "pyarrow_index_entries",
              "Number of entries in the PyArrow index",
              [],
              "pyarrow_index",
              "bridge"
            ),
            processingSize: this.observability.register_gauge(
              "pyarrow_index_processing_size_bytes",
              "Size of data being processed by PyArrow index in bytes",
              ["operation"],
              "pyarrow_index", 
              "bridge"
            )
          };
          
          this.observabilityEnabled = true;
          console.log("PyArrow Index Bridge: Observability initialized");
        }
      }
    } catch (error) {
      console.error("PyArrow Index Bridge: Failed to initialize observability:", error);
      this.observabilityEnabled = false;
    }
  }

  /**
   * Initialize the content index bridge
   * 
   * @returns {Promise<boolean>} Success status
   */
  async init() {
    return track_operation(
      "pyarrow_index_bridge_init",
      async () => {
        try {
          if (!this.pythonBridge) {
            throw new Error('Python bridge not provided');
          }

          // Check if the bridge module is available
          const moduleAvailable = await this.pythonBridge.moduleExists(this.bridgeModule);
          if (!moduleAvailable) {
            throw new Error(`Bridge module ${this.bridgeModule} not available`);
          }

          // Initialize the bridge
          const result = await this.pythonBridge.callAsync({
            module: this.bridgeModule,
            instance: this.bridgeInstance,
            method: 'init'
          });

          this.initialized = result === true;
          
          // If observability is enabled and initialization successful, get stats
          if (this.initialized && this.observabilityEnabled) {
            try {
              const stats = await this.getStats();
              if (stats && stats.entry_count) {
                this.metrics.indexSize.set(stats.entry_count);
              }
            } catch (error) {
              console.warn("PyArrow Index Bridge: Failed to get initial stats:", error);
            }
          }
          
          return this.initialized;
        } catch (error) {
          console.error(`Error initializing PyArrow content index bridge: ${error.message}`);
          track_error("init", error);
          this.stats.errors++;
          this.stats.lastError = error;
          return false;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "init" }
    );
  }

  /**
   * Look up content by CID
   * 
   * @param {string} cid - Content identifier
   * @returns {Promise<Object>} Content metadata
   */
  async lookupByCid(cid) {
    return track_operation(
      "pyarrow_index_bridge_lookup_by_cid",
      async () => {
        try {
          if (!this.initialized) {
            await this.init();
          }

          this.stats.operations++;
          this.stats.lastOperation = 'lookupByCid';

          const result = await this.pythonBridge.callAsync({
            module: this.bridgeModule,
            instance: this.bridgeInstance,
            method: 'js_lookup_by_cid',
            args: [cid, this.useArrow]
          });

          // Handle Arrow data if needed
          if (this.useArrow && result instanceof Uint8Array) {
            // If we have an Arrow deserializer, use it
            if (this.pythonBridge.deserializeArrow) {
              return this.pythonBridge.deserializeArrow(result);
            }
            // Otherwise just return the raw buffer
            return { _arrowData: result, _needsDeserialization: true };
          }

          // Track metrics for successful operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "lookup_by_cid", status: "success" });
          }

          return result;
        } catch (error) {
          console.error(`Error looking up CID ${cid}: ${error.message}`);
          track_error("lookup_by_cid", error);
          this.stats.errors++;
          this.stats.lastError = error;
          
          // Track metrics for failed operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "lookup_by_cid", status: "error" });
            this.metrics.errors.inc({ operation: "lookup_by_cid", error_type: error.name || "Error" });
          }
          
          throw error;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "lookup_by_cid" }
    );
  }

  /**
   * Look up content by virtual filesystem path
   * 
   * @param {string} path - Virtual filesystem path
   * @returns {Promise<Object>} Content metadata
   */
  async lookupByPath(path) {
    return track_operation(
      "pyarrow_index_bridge_lookup_by_path",
      async () => {
        try {
          if (!this.initialized) {
            await this.init();
          }

          this.stats.operations++;
          this.stats.lastOperation = 'lookupByPath';

          const result = await this.pythonBridge.callAsync({
            module: this.bridgeModule,
            instance: this.bridgeInstance,
            method: 'js_lookup_by_path',
            args: [path, this.useArrow]
          });

          // Handle Arrow data if needed
          if (this.useArrow && result instanceof Uint8Array) {
            // If we have an Arrow deserializer, use it
            if (this.pythonBridge.deserializeArrow) {
              return this.pythonBridge.deserializeArrow(result);
            }
            // Otherwise just return the raw buffer
            return { _arrowData: result, _needsDeserialization: true };
          }

          // Track metrics for successful operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "lookup_by_path", status: "success" });
          }

          return result;
        } catch (error) {
          console.error(`Error looking up path ${path}: ${error.message}`);
          track_error("lookup_by_path", error);
          this.stats.errors++;
          this.stats.lastError = error;
          
          // Track metrics for failed operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "lookup_by_path", status: "error" });
            this.metrics.errors.inc({ operation: "lookup_by_path", error_type: error.name || "Error" });
          }
          
          throw error;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "lookup_by_path" }
    );
  }

  /**
   * Add an entry to the content index
   * 
   * @param {Object} entry - Entry data with CID, path, and metadata
   * @returns {Promise<Object>} Added entry
   */
  async addEntry(entry) {
    return track_operation(
      "pyarrow_index_bridge_add_entry",
      async () => {
        try {
          if (!this.initialized) {
            await this.init();
          }

          this.stats.operations++;
          this.stats.lastOperation = 'addEntry';

          // Track processing size if available and observability is enabled
          if (this.observabilityEnabled && entry && entry.size) {
            this.metrics.processingSize.set({ operation: "add_entry" }, entry.size);
          }

          // Serialize to Arrow if needed
          let entryData = entry;
          if (this.useArrow && this.pythonBridge.serializeArrow) {
            entryData = this.pythonBridge.serializeArrow([entry]);
          }

          const result = await this.pythonBridge.callAsync({
            module: this.bridgeModule,
            instance: this.bridgeInstance,
            method: 'js_add_entry',
            args: [entryData, this.useArrow]
          });

          // Handle Arrow data if needed
          if (this.useArrow && result instanceof Uint8Array) {
            // If we have an Arrow deserializer, use it
            if (this.pythonBridge.deserializeArrow) {
              return this.pythonBridge.deserializeArrow(result);
            }
            // Otherwise just return the raw buffer
            return { _arrowData: result, _needsDeserialization: true };
          }

          // Update index size metric if successful
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "add_entry", status: "success" });
            try {
              const stats = await this.getStats();
              if (stats && stats.entry_count) {
                this.metrics.indexSize.set(stats.entry_count);
              }
            } catch (error) {
              console.warn("PyArrow Index Bridge: Failed to update index size metric:", error);
            }
          }

          return result;
        } catch (error) {
          console.error(`Error adding entry: ${error.message}`);
          track_error("add_entry", error);
          this.stats.errors++;
          this.stats.lastError = error;
          
          // Track metrics for failed operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "add_entry", status: "error" });
            this.metrics.errors.inc({ operation: "add_entry", error_type: error.name || "Error" });
          }
          
          throw error;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "add_entry" }
    );
  }

  /**
   * Update an entry in the content index
   * 
   * @param {string} cid - Content identifier
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated entry
   */
  async updateEntry(cid, updateData) {
    return track_operation(
      "pyarrow_index_bridge_update_entry",
      async () => {
        try {
          if (!this.initialized) {
            await this.init();
          }

          this.stats.operations++;
          this.stats.lastOperation = 'updateEntry';

          // Serialize to Arrow if needed
          let serializedUpdateData = updateData;
          if (this.useArrow && this.pythonBridge.serializeArrow) {
            serializedUpdateData = this.pythonBridge.serializeArrow([updateData]);
          }

          const result = await this.pythonBridge.callAsync({
            module: this.bridgeModule,
            instance: this.bridgeInstance,
            method: 'js_update_entry',
            args: [cid, serializedUpdateData, this.useArrow]
          });

          // Handle Arrow data if needed
          if (this.useArrow && result instanceof Uint8Array) {
            // If we have an Arrow deserializer, use it
            if (this.pythonBridge.deserializeArrow) {
              return this.pythonBridge.deserializeArrow(result);
            }
            // Otherwise just return the raw buffer
            return { _arrowData: result, _needsDeserialization: true };
          }

          // Track metrics for successful operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "update_entry", status: "success" });
          }

          return result;
        } catch (error) {
          console.error(`Error updating entry ${cid}: ${error.message}`);
          track_error("update_entry", error);
          this.stats.errors++;
          this.stats.lastError = error;
          
          // Track metrics for failed operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "update_entry", status: "error" });
            this.metrics.errors.inc({ operation: "update_entry", error_type: error.name || "Error" });
          }
          
          throw error;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "update_entry" }
    );
  }

  /**
   * Delete an entry from the content index
   * 
   * @param {string} cid - Content identifier
   * @returns {Promise<boolean>} Success status
   */
  async deleteEntry(cid) {
    return track_operation(
      "pyarrow_index_bridge_delete_entry",
      async () => {
        try {
          if (!this.initialized) {
            await this.init();
          }

          this.stats.operations++;
          this.stats.lastOperation = 'deleteEntry';

          const result = await this.pythonBridge.callAsync({
            module: this.bridgeModule,
            instance: this.bridgeInstance,
            method: 'js_delete_entry',
            args: [cid]
          });

          // Update index size metric if successful
          if (this.observabilityEnabled && result) {
            this.metrics.operations.inc({ operation: "delete_entry", status: "success" });
            try {
              const stats = await this.getStats();
              if (stats && stats.entry_count) {
                this.metrics.indexSize.set(stats.entry_count);
              }
            } catch (error) {
              console.warn("PyArrow Index Bridge: Failed to update index size metric:", error);
            }
          }

          return result;
        } catch (error) {
          console.error(`Error deleting entry ${cid}: ${error.message}`);
          track_error("delete_entry", error);
          this.stats.errors++;
          this.stats.lastError = error;
          
          // Track metrics for failed operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "delete_entry", status: "error" });
            this.metrics.errors.inc({ operation: "delete_entry", error_type: error.name || "Error" });
          }
          
          throw error;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "delete_entry" }
    );
  }

  /**
   * Query the content index
   * 
   * @param {Object} queryParams - Query parameters including filters, sorting, pagination
   * @returns {Promise<Array<Object>>} Matching entries
   */
  async query(queryParams) {
    return track_operation(
      "pyarrow_index_bridge_query",
      async () => {
        try {
          if (!this.initialized) {
            await this.init();
          }

          this.stats.operations++;
          this.stats.lastOperation = 'query';

          // Serialize to Arrow if needed
          let serializedQueryParams = queryParams;
          if (this.useArrow && this.pythonBridge.serializeArrow) {
            serializedQueryParams = this.pythonBridge.serializeArrow([queryParams]);
          }

          const result = await this.pythonBridge.callAsync({
            module: this.bridgeModule,
            instance: this.bridgeInstance,
            method: 'js_query',
            args: [serializedQueryParams, this.useArrow]
          });

          // Handle Arrow data if needed
          if (this.useArrow && result instanceof Uint8Array) {
            // If we have an Arrow deserializer, use it
            if (this.pythonBridge.deserializeArrow) {
              return this.pythonBridge.deserializeArrow(result);
            }
            // Otherwise just return the raw buffer
            return { _arrowData: result, _needsDeserialization: true };
          }

          // Track metrics for successful operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "query", status: "success" });
            if (result && Array.isArray(result)) {
              // Track result size
              this.metrics.processingSize.set({ operation: "query_result" }, result.length);
            }
          }

          return result;
        } catch (error) {
          console.error(`Error querying content index: ${error.message}`);
          track_error("query", error);
          this.stats.errors++;
          this.stats.lastError = error;
          
          // Track metrics for failed operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "query", status: "error" });
            this.metrics.errors.inc({ operation: "query", error_type: error.name || "Error" });
          }
          
          throw error;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "query" }
    );
  }

  /**
   * Synchronize the content index with the IPFS pinset
   * 
   * @param {boolean} includeMetadata - Whether to include detailed metadata
   * @returns {Promise<Object>} Synchronization results
   */
  async syncWithIpfsPinset(includeMetadata = true) {
    return track_operation(
      "pyarrow_index_bridge_sync_with_ipfs_pinset",
      async () => {
        try {
          if (!this.initialized) {
            await this.init();
          }

          this.stats.operations++;
          this.stats.lastOperation = 'syncWithIpfsPinset';

          const result = await this.pythonBridge.callAsync({
            module: this.bridgeModule,
            instance: this.bridgeInstance,
            method: 'js_sync_with_ipfs_pinset',
            args: [includeMetadata, this.useArrow]
          });

          // Handle Arrow data if needed
          if (this.useArrow && result instanceof Uint8Array) {
            // If we have an Arrow deserializer, use it
            if (this.pythonBridge.deserializeArrow) {
              return this.pythonBridge.deserializeArrow(result);
            }
            // Otherwise just return the raw buffer
            return { _arrowData: result, _needsDeserialization: true };
          }

          // Update index size metric if successful
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "sync_with_ipfs_pinset", status: "success" });
            try {
              const stats = await this.getStats();
              if (stats && stats.entry_count) {
                this.metrics.indexSize.set(stats.entry_count);
              }
            } catch (error) {
              console.warn("PyArrow Index Bridge: Failed to update index size metric:", error);
            }
          }

          return result;
        } catch (error) {
          console.error(`Error syncing with IPFS pinset: ${error.message}`);
          track_error("sync_with_ipfs_pinset", error);
          this.stats.errors++;
          this.stats.lastError = error;
          
          // Track metrics for failed operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "sync_with_ipfs_pinset", status: "error" });
            this.metrics.errors.inc({ operation: "sync_with_ipfs_pinset", error_type: error.name || "Error" });
          }
          
          throw error;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "sync_with_ipfs_pinset" }
    );
  }

  /**
   * Get statistics about the content index
   * 
   * @returns {Promise<Object>} Statistics including count, size, types, etc.
   */
  async getStats() {
    return track_operation(
      "pyarrow_index_bridge_get_stats",
      async () => {
        try {
          if (!this.initialized) {
            await this.init();
          }

          this.stats.operations++;
          this.stats.lastOperation = 'getStats';

          const result = await this.pythonBridge.callAsync({
            module: this.bridgeModule,
            instance: this.bridgeInstance,
            method: 'js_get_stats',
            args: [this.useArrow]
          });

          // Handle Arrow data if needed
          if (this.useArrow && result instanceof Uint8Array) {
            // If we have an Arrow deserializer, use it
            if (this.pythonBridge.deserializeArrow) {
              return this.pythonBridge.deserializeArrow(result);
            }
            // Otherwise just return the raw buffer
            return { _arrowData: result, _needsDeserialization: true };
          }

          // Update metrics based on stats
          if (this.observabilityEnabled && result) {
            this.metrics.operations.inc({ operation: "get_stats", status: "success" });
            if (result.entry_count) {
              this.metrics.indexSize.set(result.entry_count);
            }
          }

          return result;
        } catch (error) {
          console.error(`Error getting content index stats: ${error.message}`);
          track_error("get_stats", error);
          this.stats.errors++;
          this.stats.lastError = error;
          
          // Track metrics for failed operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "get_stats", status: "error" });
            this.metrics.errors.inc({ operation: "get_stats", error_type: error.name || "Error" });
          }
          
          throw error;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "get_stats" }
    );
  }

  /**
   * Save the content index to disk
   * 
   * @returns {Promise<boolean>} Success status
   */
  async save() {
    return track_operation(
      "pyarrow_index_bridge_save",
      async () => {
        try {
          if (!this.initialized) {
            await this.init();
          }

          this.stats.operations++;
          this.stats.lastOperation = 'save';

          const result = await this.pythonBridge.callAsync({
            module: this.bridgeModule,
            instance: this.bridgeInstance,
            method: 'js_save'
          });

          // Track metrics for successful operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "save", status: "success" });
          }

          return result;
        } catch (error) {
          console.error(`Error saving content index: ${error.message}`);
          track_error("save", error);
          this.stats.errors++;
          this.stats.lastError = error;
          
          // Track metrics for failed operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "save", status: "error" });
            this.metrics.errors.inc({ operation: "save", error_type: error.name || "Error" });
          }
          
          throw error;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "save" }
    );
  }

  /**
   * Export the content index to Parquet format
   * 
   * @param {string} exportPath - Path to export the Parquet file
   * @returns {Promise<boolean>} Success status
   */
  async exportToParquet(exportPath) {
    return track_operation(
      "pyarrow_index_bridge_export_to_parquet",
      async () => {
        try {
          if (!this.initialized) {
            await this.init();
          }

          this.stats.operations++;
          this.stats.lastOperation = 'exportToParquet';

          const result = await this.pythonBridge.callAsync({
            module: this.bridgeModule,
            instance: this.bridgeInstance,
            method: 'js_export_to_parquet',
            args: [exportPath]
          });

          // Track metrics for successful operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "export_to_parquet", status: "success" });
          }

          return result;
        } catch (error) {
          console.error(`Error exporting content index to Parquet: ${error.message}`);
          track_error("export_to_parquet", error);
          this.stats.errors++;
          this.stats.lastError = error;
          
          // Track metrics for failed operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "export_to_parquet", status: "error" });
            this.metrics.errors.inc({ operation: "export_to_parquet", error_type: error.name || "Error" });
          }
          
          throw error;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "export_to_parquet" }
    );
  }

  /**
   * Import the content index from Parquet format
   * 
   * @param {string} importPath - Path to import the Parquet file from
   * @returns {Promise<boolean>} Success status
   */
  async importFromParquet(importPath) {
    return track_operation(
      "pyarrow_index_bridge_import_from_parquet",
      async () => {
        try {
          if (!this.initialized) {
            await this.init();
          }

          this.stats.operations++;
          this.stats.lastOperation = 'importFromParquet';

          const result = await this.pythonBridge.callAsync({
            module: this.bridgeModule,
            instance: this.bridgeInstance,
            method: 'js_import_from_parquet',
            args: [importPath]
          });

          // Update index size metric if successful
          if (this.observabilityEnabled && result) {
            this.metrics.operations.inc({ operation: "import_from_parquet", status: "success" });
            try {
              const stats = await this.getStats();
              if (stats && stats.entry_count) {
                this.metrics.indexSize.set(stats.entry_count);
              }
            } catch (error) {
              console.warn("PyArrow Index Bridge: Failed to update index size metric:", error);
            }
          }

          return result;
        } catch (error) {
          console.error(`Error importing content index from Parquet: ${error.message}`);
          track_error("import_from_parquet", error);
          this.stats.errors++;
          this.stats.lastError = error;
          
          // Track metrics for failed operation
          if (this.observabilityEnabled) {
            this.metrics.operations.inc({ operation: "import_from_parquet", status: "error" });
            this.metrics.errors.inc({ operation: "import_from_parquet", error_type: error.name || "Error" });
          }
          
          throw error;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "import_from_parquet" }
    );
  }

  /**
   * Get client statistics
   * 
   * @returns {Object} Client statistics
   */
  getClientStats() {
    const now = Date.now();
    const uptimeMs = now - this.stats.startTime;
    
    return {
      ...this.stats,
      clientType: 'JavaScript',
      useArrow: this.useArrow,
      initialized: this.initialized,
      observabilityEnabled: this.observabilityEnabled,
      uptime: Math.floor(uptimeMs / 1000), // seconds
      timestamp: new Date(now).toISOString()
    };
  }

  /**
   * Test the content index functionality
   * 
   * @returns {Promise<Object>} Test results
   */
  async test() {
    return track_operation(
      "pyarrow_index_bridge_test",
      async () => {
        try {
          // Create a simple test entry
          const testEntry = {
            cid: `QmTest${Date.now().toString(16)}`,
            path: `/test/path/file-${Date.now()}.txt`,
            mimetype: 'text/plain',
            size: 1024,
            tags: ['test', 'javascript', 'bridge'],
            description: 'Test entry from JavaScript bridge'
          };

          // Run basic operations to test functionality
          const results = {
            module: 'PyArrowIndexBridge',
            success: false,
            operations: {},
            diagnostics: {
              useArrow: this.useArrow,
              initialized: this.initialized,
              bridgeAvailable: !!this.pythonBridge,
              observabilityEnabled: this.observabilityEnabled
            }
          };

          // Initialize if needed
          if (!this.initialized) {
            const initResult = await this.init();
            results.operations.initialization = {
              success: initResult,
              message: initResult ? 'Successfully initialized content index bridge' : 'Failed to initialize content index bridge'
            };
            
            if (!initResult) {
              results.success = false;
              return results;
            }
          }

          // Add test entry
          try {
            const addResult = await this.addEntry(testEntry);
            results.operations.addEntry = {
              success: true,
              message: 'Successfully added test entry'
            };
          } catch (error) {
            results.operations.addEntry = {
              success: false,
              message: `Failed to add test entry: ${error.message}`
            };
          }

          // Look up by CID
          try {
            const lookupResult = await this.lookupByCid(testEntry.cid);
            
            const success = lookupResult && lookupResult.cid === testEntry.cid;
            results.operations.lookupByCid = {
              success,
              message: success ? 'Successfully looked up entry by CID' : 'Failed to look up entry by CID correctly'
            };
          } catch (error) {
            results.operations.lookupByCid = {
              success: false,
              message: `Failed to look up entry by CID: ${error.message}`
            };
          }

          // Look up by path
          try {
            const lookupResult = await this.lookupByPath(testEntry.path);
            
            const success = lookupResult && lookupResult.path === testEntry.path;
            results.operations.lookupByPath = {
              success,
              message: success ? 'Successfully looked up entry by path' : 'Failed to look up entry by path correctly'
            };
          } catch (error) {
            results.operations.lookupByPath = {
              success: false,
              message: `Failed to look up entry by path: ${error.message}`
            };
          }

          // Update entry
          try {
            const updateData = {
              description: 'Updated test description from bridge',
              tags: [...testEntry.tags, 'updated']
            };
            
            const updateResult = await this.updateEntry(testEntry.cid, updateData);
            
            const success = updateResult && updateResult.description === updateData.description;
            results.operations.updateEntry = {
              success,
              message: success ? 'Successfully updated entry' : 'Failed to update entry correctly'
            };
          } catch (error) {
            results.operations.updateEntry = {
              success: false,
              message: `Failed to update entry: ${error.message}`
            };
          }

          // Query
          try {
            const queryParams = {
              tags: ['test'],
              limit: 10
            };
            
            const queryResult = await this.query(queryParams);
            
            const success = Array.isArray(queryResult) && queryResult.length > 0;
            results.operations.query = {
              success,
              message: success ? `Successfully queried entries, found ${queryResult.length} results` : 'Failed to query entries correctly'
            };
          } catch (error) {
            results.operations.query = {
              success: false,
              message: `Failed to query entries: ${error.message}`
            };
          }

          // Get stats
          try {
            const statsResult = await this.getStats();
            
            const success = statsResult && typeof statsResult === 'object';
            results.operations.getStats = {
              success,
              message: success ? 'Successfully retrieved content index stats' : 'Failed to retrieve content index stats'
            };
          } catch (error) {
            results.operations.getStats = {
              success: false,
              message: `Failed to get stats: ${error.message}`
            };
          }

          // Cleanup - delete test entry
          try {
            const deleteResult = await this.deleteEntry(testEntry.cid);
            
            results.operations.deleteEntry = {
              success: deleteResult === true,
              message: deleteResult === true ? 'Successfully deleted test entry' : 'Failed to delete test entry'
            };
          } catch (error) {
            results.operations.deleteEntry = {
              success: false,
              message: `Failed to delete test entry: ${error.message}`
            };
          }

          // Determine overall success
          const operationSuccesses = Object.values(results.operations).map(op => op.success);
          results.success = operationSuccesses.length > 0 && operationSuccesses.every(Boolean);

          return results;
        } catch (error) {
          console.error(`Error in test: ${error.message}`);
          track_error("test", error);
          return {
            module: 'PyArrowIndexBridge',
            success: false,
            error: error.message
          };
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "test" }
    );
  }
}

/**
 * WebSocket client for real-time updates from the PyArrow Content Index
 */
class PyArrowIndexRealtimeClient {
  /**
   * Initialize the real-time client
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.wsEndpoint - WebSocket endpoint URL
   * @param {Object} options.pythonBridge - Python bridge for starting the server
   * @param {Object} options.eventBus - Event bus for broadcasting events
   * @param {Object} options.authManager - Authentication manager
   * @param {boolean} options.autoConnect - Whether to connect automatically
   */
  constructor(options = {}) {
    this.wsEndpoint = options.wsEndpoint || 'ws://localhost:8765/pyarrow-content-index/ws';
    this.pythonBridge = options.pythonBridge;
    this.eventBus = options.eventBus;
    this.authManager = options.authManager;
    
    this.websocket = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.pendingReconnect = false;
    
    // Configuration
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.heartbeatInterval = options.heartbeatInterval || 30000;
    
    // Authentication state
    this.authRequired = options.authRequired || false;
    this.authToken = options.authToken || null;
    this.authAttempted = false;
    this.authSuccess = false;
    
    // Metrics
    this.metrics = {
      connected: false,
      connectAttempts: 0,
      connectSuccesses: 0,
      connectFailures: 0,
      messagesSent: 0,
      messagesReceived: 0,
      notificationsReceived: 0,
      reconnectAttempts: 0,
      lastHeartbeat: null,
      errors: [],
      rateLimitsExceeded: 0
    };
    
    // Auto-connect if specified
    if (options.autoConnect !== false) {
      this.connect();
    }
  }
  
  /**
   * Connect to the WebSocket server
   * 
   * @returns {Promise<boolean>} Connection success status
   */
  async connect() {
    if (this.websocket && (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING)) {
      return true;
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Update metrics
        this.metrics.connectAttempts++;
        
        console.info(`Connecting to WebSocket at ${this.wsEndpoint}`);
        
        // Create WebSocket connection
        this.websocket = new WebSocket(this.wsEndpoint);
        
        // Set up timeout for connection
        const connectionTimeout = setTimeout(() => {
          if (!this.connected) {
            console.warn('WebSocket connection timed out');
            this.websocket.close();
            
            // Update metrics
            this.metrics.connectFailures++;
            this.metrics.errors.push({
              time: Date.now(),
              type: 'connection_timeout',
              message: 'Connection timed out'
            });
            
            // Keep only the last 10 errors
            if (this.metrics.errors.length > 10) {
              this.metrics.errors.shift();
            }
            
            reject(new Error('Connection timed out'));
          }
        }, 10000); // 10 seconds timeout
        
        // Set up event handlers
        this.websocket.addEventListener('open', async (event) => {
          clearTimeout(connectionTimeout);
          
          this.connected = true;
          this.pendingReconnect = false;
          
          // Update metrics
          this.metrics.connectSuccesses++;
          this.metrics.connected = true;
          this.metrics.lastHeartbeat = Date.now();
          
          // Start heartbeat
          this.startHeartbeat();
          
          // Emit connection event
          if (this.eventBus) {
            this.eventBus.emit('websocket-connected', {
              endpoint: this.wsEndpoint,
              timestamp: new Date().toISOString()
            });
          }
          
          // Perform authentication if required
          if (this.authRequired) {
            try {
              await this.authenticate();
            } catch (error) {
              console.error('Authentication error:', error);
              // Continue with connection even if auth fails
            }
          }
          
          resolve(true);
        });
        
        this.websocket.addEventListener('message', (event) => {
          this.onMessage(event);
        });
        
        this.websocket.addEventListener('error', (event) => {
          clearTimeout(connectionTimeout);
          
          console.error('WebSocket error:', event);
          
          // Update metrics
          this.metrics.connectFailures++;
          this.metrics.errors.push({
            time: Date.now(),
            type: 'connection_error',
            message: event.message || 'WebSocket connection error'
          });
          
          // Keep only the last 10 errors
          if (this.metrics.errors.length > 10) {
            this.metrics.errors.shift();
          }
          
          // Emit error event
          if (this.eventBus) {
            this.eventBus.emit('websocket-error', {
              error: event.message || 'Unknown WebSocket error',
              timestamp: new Date().toISOString()
            });
          }
          
          reject(new Error('WebSocket connection error'));
        });
        
        this.websocket.addEventListener('close', (event) => {
          this.onClose(event);
        });
        
      } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        
        // Update metrics
        this.metrics.connectFailures++;
        this.metrics.errors.push({
          time: Date.now(),
          type: 'connection_exception',
          message: error.message
        });
        
        // Keep only the last 10 errors
        if (this.metrics.errors.length > 10) {
          this.metrics.errors.shift();
        }
        
        reject(error);
      }
    });
  }
  
  /**
   * Disconnect from the WebSocket server
   */
  disconnect() {
    // Clear timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.autoReconnect = false;
    
    // Close connection if open
    if (this.websocket) {
      if (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING) {
        this.websocket.close(1000, 'Client disconnected');
      }
      this.websocket = null;
    }
    
    this.connected = false;
    
    // Emit disconnection event
    if (this.eventBus) {
      this.eventBus.emit('websocket-closed', {
        reason: 'Client disconnected',
        code: 1000,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Authenticate with the WebSocket server
   * 
   * @returns {Promise<boolean>} Authentication success status
   */
  async authenticate() {
    if (!this.connected) {
      throw new Error('Cannot authenticate: WebSocket not connected');
    }
    
    // If auth token is not provided, try to get it from auth manager
    if (!this.authToken && this.authManager) {
      try {
        this.authToken = await this.authManager.getCapabilityToken('pyarrow-index:read');
      } catch (error) {
        console.error('Failed to get authentication token:', error);
        
        // Update metrics
        this.metrics.errors.push({
          time: Date.now(),
          type: 'auth_error',
          message: 'Failed to get authentication token: ' + error.message
        });
        
        throw error;
      }
    }
    
    if (!this.authToken) {
      throw new Error('No authentication token available');
    }
    
    return new Promise((resolve, reject) => {
      const authTimeoutId = setTimeout(() => {
        reject(new Error('Authentication timed out'));
      }, 10000); // 10 seconds timeout
      
      // Set up one-time message handler for auth response
      const authResponseHandler = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'auth_success') {
            clearTimeout(authTimeoutId);
            this.authSuccess = true;
            this.websocket.removeEventListener('message', authResponseHandler);
            
            // Emit auth success event
            if (this.eventBus) {
              this.eventBus.emit('auth-success', {
                timestamp: new Date().toISOString(),
                principal: data.principal
              });
            }
            
            resolve(true);
          } else if (data.type === 'error' && (data.error === 'auth_required' || data.error === 'invalid_token')) {
            clearTimeout(authTimeoutId);
            this.authSuccess = false;
            this.websocket.removeEventListener('message', authResponseHandler);
            
            // Emit auth error event
            if (this.eventBus) {
              this.eventBus.emit('auth-error', {
                timestamp: new Date().toISOString(),
                error: data.error,
                message: data.message
              });
            }
            
            reject(new Error(`Authentication failed: ${data.message}`));
          }
        } catch (error) {
          console.error('Error processing authentication response:', error);
        }
      };
      
      // Add temporary auth response handler
      this.websocket.addEventListener('message', authResponseHandler);
      
      // Send authentication message
      this.sendMessage({
        type: 'auth',
        token: this.authToken
      });
      
      this.authAttempted = true;
    });
  }
  
  /**
   * Send a heartbeat message to keep the connection alive
   */
  sendHeartbeat() {
    if (this.connected && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.sendMessage({ type: 'heartbeat' });
    }
  }
  
  /**
   * Start the heartbeat timer
   */
  startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.heartbeatTimer = setInterval(this.sendHeartbeat.bind(this), this.heartbeatInterval);
  }
  
  /**
   * Send a message to the WebSocket server
   * 
   * @param {Object} message Message to send
   */
  sendMessage(message) {
    if (!this.connected || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message: WebSocket not connected');
      return false;
    }
    
    try {
      const messageString = JSON.stringify(message);
      this.websocket.send(messageString);
      
      // Update metrics
      this.metrics.messagesSent++;
      
      return true;
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      
      // Update metrics
      this.metrics.errors.push({
        time: Date.now(),
        type: 'message_send_error',
        message: error.message
      });
      
      // Keep only the last 10 errors
      if (this.metrics.errors.length > 10) {
        this.metrics.errors.shift();
      }
      
      return false;
    }
  }
  
  /**
   * Handle incoming WebSocket messages
   * 
   * @param {MessageEvent} event WebSocket message event
   */
  onMessage(event) {
    try {
      const data = JSON.parse(event.data);
      
      // Update metrics
      this.metrics.messagesReceived++;
      
      // Handle different message types
      switch (data.type) {
        case 'heartbeat':
          // Update metrics for heartbeat
          if (this.metrics) {
            this.metrics.lastHeartbeat = Date.now();
          }
          break;
          
        case 'auth_success':
          // Authentication success is handled in the authenticate method
          this.authSuccess = true;
          break;
          
        case 'error':
          console.error('Received error from server:', data.error, data.message);
          
          // Update metrics
          this.metrics.errors.push({
            time: Date.now(),
            type: `server_${data.error || 'unknown'}`,
            message: data.message || 'Server error'
          });
          
          // Keep only the last 10 errors
          if (this.metrics.errors.length > 10) {
            this.metrics.errors.shift();
          }
          
          // Rate limit error handling
          if (data.error === 'rate_limit_exceeded') {
            this.metrics.rateLimitsExceeded++;
          }
          
          // Emit error event
          if (this.eventBus) {
            this.eventBus.emit('error', {
              error: data.error,
              message: data.message,
              timestamp: data.timestamp || new Date().toISOString()
            });
          }
          break;
          
        case 'content-added':
        case 'content-updated':
        case 'content-deleted':
          // Handle content notifications
          this.metrics.notificationsReceived++;
          
          // Emit specific event for this notification type
          if (this.eventBus) {
            this.eventBus.emit('content-updated', {
              type: data.type,
              content: data.data,
              action: data.action,
              timestamp: data.timestamp || new Date().toISOString()
            });
          }
          break;
          
        case 'content-synced':
          // Handle sync notification
          this.metrics.notificationsReceived++;
          
          // Emit sync event
          if (this.eventBus) {
            this.eventBus.emit('content-synced', {
              added: data.data?.added || 0,
              updated: data.data?.updated || 0,
              removed: data.data?.removed || 0,
              timestamp: data.timestamp || new Date().toISOString()
            });
          }
          break;
          
        case 'system':
          // Handle system notifications
          console.info('System notification:', data.message);
          
          // Emit system notification event
          if (this.eventBus) {
            this.eventBus.emit('system-notification', {
              message: data.message,
              timestamp: data.timestamp || new Date().toISOString()
            });
          }
          break;
          
        default:
          console.info('Received unknown message type:', data.type);
          
          // Emit generic message event for unknown types
          if (this.eventBus) {
            this.eventBus.emit('message', {
              type: data.type,
              data: data,
              timestamp: data.timestamp || new Date().toISOString()
            });
          }
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error, event.data);
      
      // Update metrics
      this.metrics.errors.push({
        time: Date.now(),
        type: 'message_processing_error',
        message: error.message
      });
      
      // Keep only the last 10 errors
      if (this.metrics.errors.length > 10) {
        this.metrics.errors.shift();
      }
    }
  }
  
  /**
   * Handle WebSocket close event
   * 
   * @param {CloseEvent} event WebSocket close event
   */
  onClose(event) {
    console.info(`WebSocket closed: Code ${event.code}${event.reason ? ` (${event.reason})` : ''}`);
    this.connected = false;
    
    // Clear heartbeat timer
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // Update metrics
    this.metrics.connected = false;
    
    // Add error for abnormal closure
    if (event.code !== 1000 && event.code !== 1001) {
      this.metrics.errors.push({
        time: Date.now(),
        type: 'connection_closed',
        message: `Connection closed with code ${event.code}${event.reason ? `: ${event.reason}` : ''}`
      });
      
      // Keep only the last 10 errors
      if (this.metrics.errors.length > 10) {
        this.metrics.errors.shift();
      }
    }
    
    // Emit close event
    if (this.eventBus) {
      this.eventBus.emit('websocket-closed', {
        code: event.code,
        reason: event.reason,
        timestamp: new Date().toISOString()
      });
    }
    
    // Reconnect if auto-reconnect is enabled
    if (this.autoReconnect) {
      this.pendingReconnect = true;
      
      console.info(`Reconnecting in ${this.reconnectInterval}ms...`);
      
      // Update metrics
      this.metrics.reconnectAttempts++;
      
      // Set up reconnect timer
      this.reconnectTimer = setTimeout(() => {
        this.connect().catch(error => {
          console.error('Reconnection failed:', error);
        });
      }, this.reconnectInterval);
    }
  }
  
  /**
   * Start the real-time updates server
   * 
   * @param {Object} options Server options
   * @param {string} options.host Server host
   * @param {number} options.port Server port
   * @param {Object} options.authManager Authentication manager
   * @returns {Promise<Object>} Server information
   */
  async startServer(options = {}) {
    if (!this.pythonBridge) {
      throw new Error('Python bridge not available for starting server');
    }
    
    try {
      const host = options.host || 'localhost';
      const port = options.port || 8765;
      
      // Call Python function to start the server
      const result = await this.pythonBridge.callAsync({
        module: 'pyarrow_content_index_integration',
        instance: 'content_index_integration',
        method: 'start_realtime_server',
        args: [host, port, options.authManager ? true : false]
      });
      
      // Update endpoint if server was started successfully
      if (result && result.success) {
        this.wsEndpoint = result.websocket_url;
        
        console.info(`Real-time server started at ${this.wsEndpoint}`);
        
        // Connect to the server if auto-connect is enabled
        if (options.autoConnect !== false) {
          await this.connect();
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error starting real-time server:', error);
      throw error;
    }
  }
  
  /**
   * Stop the real-time updates server
   * 
   * @returns {Promise<boolean>} Success status
   */
  async stopServer() {
    if (!this.pythonBridge) {
      throw new Error('Python bridge not available for stopping server');
    }
    
    try {
      // First disconnect the client
      this.disconnect();
      
      // Call Python function to stop the server
      const result = await this.pythonBridge.callAsync({
        module: 'pyarrow_content_index_integration',
        instance: 'content_index_integration',
        method: 'stop_realtime_server'
      });
      
      console.info('Real-time server stopped');
      
      return result;
    } catch (error) {
      console.error('Error stopping real-time server:', error);
      throw error;
    }
  }
  
  /**
   * Get current client status and metrics
   * 
   * @returns {Object} Client status and metrics
   */
  getStatus() {
    return {
      connected: this.connected,
      endpoint: this.wsEndpoint,
      authRequired: this.authRequired,
      authAttempted: this.authAttempted,
      authSuccess: this.authSuccess,
      autoReconnect: this.autoReconnect,
      pendingReconnect: this.pendingReconnect,
      metrics: { ...this.metrics }, // Return a copy
      timestamp: new Date().toISOString()
    };
  }
}

export {
  PyArrowIndexBridge as default,
  PyArrowIndexRealtimeClient
};