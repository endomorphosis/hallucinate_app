/**
 * Secure PyArrow Content Index Manager
 * 
 * Provides capability-based secure access to PyArrow Content Index operations
 * Integrates with UCAN authentication for decentralized auth
 * Implements proper error handling and access control
 */

import authManager from './auth.js';
import PyArrowIndexBridge from './pyarrow_index_bridge.js';
import { get_observability, track_operation, track_error, is_enabled } from './observability.js';

// Define capability namespaces for PyArrow Content Index operations
export const PYARROW_INDEX_CAPABILITIES = {
  READ: 'pyarrow-index:read',     // Read access to the content index
  WRITE: 'pyarrow-index:write',   // Write access to the content index
  SYNC: 'pyarrow-index:sync',     // Sync index with IPFS pinset
  EXPORT: 'pyarrow-index:export', // Export index to Parquet
  IMPORT: 'pyarrow-index:import', // Import index from Parquet
  DELETE: 'pyarrow-index:delete', // Delete entries from the index
  ADMIN: 'pyarrow-index:admin',   // Administrative operations (all capabilities)
};

/**
 * Secure PyArrow Content Index Manager
 * 
 * Provides capability-based security for all content index operations
 */
export class SecurePyArrowIndexManager {
  /**
   * Create a new SecurePyArrowIndexManager instance
   * @param {Object} resources - Resource pool
   * @param {Object} metadata - Configuration metadata
   */
  constructor(resources = {}, metadata = {}) {
    this.resources = resources || {};
    this.metadata = metadata || {};
    
    // Use resources if provided, otherwise use default instances
    this.auth = this.resources.auth || authManager;
    this.indexBridge = null; // Will be initialized later
    
    // Default options
    this.options = {
      pythonBridge: this.resources.pythonBridge,
      indexPath: this.metadata.indexPath,
      useArrow: this.metadata.useArrow !== false,
      observabilityOptions: this.metadata.observabilityOptions || {}
    };
    
    // Initialization flag
    this.initialized = false;
    
    // Operational stats
    this.stats = {
      accessGranted: 0,
      accessDenied: 0,
      entriesAdded: 0,
      entriesUpdated: 0,
      entriesDeleted: 0,
      queriesPerformed: 0,
      syncsPerformed: 0,
      importsPerformed: 0,
      exportsPerformed: 0,
      lastRequest: null
    };
    
    // Set up observability
    this.observability = null;
    this.observabilityEnabled = false;
    this._initializeObservability(this.options.observabilityOptions);
    
    console.log('Secure PyArrow Content Index Manager initialized');
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
          const namespace = options.namespace || 'pyarrow_index';
          const subsystem = options.subsystem || 'secure_manager';
          const baseLabels = options.labels || { component: 'secure_pyarrow_index' };
          
          // Register metrics
          this.metrics = {
            accessRequests: this.observability.register_counter(
              "pyarrow_index_access_requests_total",
              "Total number of PyArrow index access requests",
              ["operation", "status"],
              namespace,
              subsystem
            ),
            accessErrors: this.observability.register_counter(
              "pyarrow_index_access_errors_total",
              "Total number of PyArrow index access errors",
              ["operation", "error_type"],
              namespace,
              subsystem
            ),
            operationDuration: this.observability.register_histogram(
              "pyarrow_index_operation_duration_seconds",
              "Duration of PyArrow index operations",
              ["operation"],
              [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10],
              namespace,
              subsystem
            ),
            indexSize: this.observability.register_gauge(
              "pyarrow_index_entry_count",
              "Number of entries in the PyArrow content index",
              [],
              namespace,
              subsystem
            ),
            querySize: this.observability.register_histogram(
              "pyarrow_index_query_result_size",
              "Size of PyArrow index query results",
              ["query_type"],
              [0, 1, 10, 50, 100, 500, 1000],
              namespace,
              subsystem
            )
          };
          
          this.observabilityEnabled = true;
        }
      }
    } catch (error) {
      console.error('Failed to initialize observability:', error);
    }
  }
  
  /**
   * Initialize the secure PyArrow content index manager
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    return track_operation(
      "secure_pyarrow_index_init",
      async () => {
        try {
          // Ensure auth manager is initialized
          if (!this.auth.initialized) {
            await this.auth.init();
          }
          
          // Initialize the index bridge
          this.indexBridge = new PyArrowIndexBridge({
            pythonBridge: this.options.pythonBridge,
            indexPath: this.options.indexPath,
            useArrow: this.options.useArrow,
            resources: this.resources,
            observabilityOptions: this.options.observabilityOptions
          });
          
          await this.indexBridge.init();
          
          // Update the index size metric if available
          if (this.observabilityEnabled && this.indexBridge.initialized) {
            const stats = await this.indexBridge.getStats();
            if (stats && stats.entry_count !== undefined) {
              this.metrics.indexSize.set(stats.entry_count);
            }
          }
          
          this.initialized = true;
          return true;
        } catch (error) {
          console.error(`Error initializing secure PyArrow content index manager: ${error.message}`);
          track_error("secure_pyarrow_index_init", error);
          return false;
        }
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "init" }
    );
  }
  
  /**
   * Verify the requested capability
   * 
   * @param {string} capabilityType - Type of capability required
   * @param {string} authToken - Authentication token
   * @param {string} resource - Optional specific resource identifier
   * @returns {Promise<boolean>} True if access is granted
   * @private
   */
  async _verifyCapability(capabilityType, authToken, resource = '*') {
    if (!this.initialized) {
      throw new Error('Secure PyArrow Content Index Manager not initialized');
    }
    
    try {
      // Track access request
      this.stats.lastRequest = {
        capability: capabilityType,
        resource,
        timestamp: new Date().toISOString()
      };
      
      // Check for admin capability (which grants all access)
      const hasAdminCapability = await this.auth.verifyCapability(
        authToken,
        `${PYARROW_INDEX_CAPABILITIES.ADMIN}:${resource}`
      );
      
      if (hasAdminCapability) {
        // Admin capability grants access to everything
        this.stats.accessGranted++;
        
        if (this.observabilityEnabled) {
          this.metrics.accessRequests.inc({ operation: capabilityType, status: 'granted_admin' });
        }
        
        return true;
      }
      
      // Check for specific capability
      const hasCapability = await this.auth.verifyCapability(
        authToken,
        `${capabilityType}:${resource}`
      );
      
      if (hasCapability) {
        this.stats.accessGranted++;
        
        if (this.observabilityEnabled) {
          this.metrics.accessRequests.inc({ operation: capabilityType, status: 'granted' });
        }
        
        return true;
      }
      
      // Access denied
      this.stats.accessDenied++;
      
      if (this.observabilityEnabled) {
        this.metrics.accessRequests.inc({ operation: capabilityType, status: 'denied' });
      }
      
      return false;
    } catch (error) {
      console.error(`Error verifying capability ${capabilityType}: ${error.message}`);
      
      if (this.observabilityEnabled) {
        this.metrics.accessErrors.inc({ 
          operation: capabilityType, 
          error_type: error.name || 'unknown' 
        });
      }
      
      throw new Error(`Access verification failed: ${error.message}`);
    }
  }
  
  /**
   * Look up content by CID with capability verification
   * 
   * @param {string} cid - Content identifier to look up
   * @param {string} authToken - Authentication token
   * @returns {Promise<Object>} Content metadata
   */
  async lookupByCid(cid, authToken) {
    return track_operation(
      "secure_pyarrow_index_lookup_by_cid",
      async () => {
        // Verify read capability
        const hasAccess = await this._verifyCapability(
          PYARROW_INDEX_CAPABILITIES.READ,
          authToken,
          cid
        );
        
        if (!hasAccess) {
          throw new Error(`Access denied: Missing capability ${PYARROW_INDEX_CAPABILITIES.READ}:${cid}`);
        }
        
        // Perform the operation
        return await this.indexBridge.lookupByCid(cid);
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "lookup_by_cid" }
    );
  }
  
  /**
   * Look up content by path with capability verification
   * 
   * @param {string} path - Virtual filesystem path to look up
   * @param {string} authToken - Authentication token
   * @returns {Promise<Object>} Content metadata
   */
  async lookupByPath(path, authToken) {
    return track_operation(
      "secure_pyarrow_index_lookup_by_path",
      async () => {
        // Verify read capability
        const hasAccess = await this._verifyCapability(
          PYARROW_INDEX_CAPABILITIES.READ,
          authToken,
          path
        );
        
        if (!hasAccess) {
          throw new Error(`Access denied: Missing capability ${PYARROW_INDEX_CAPABILITIES.READ}:${path}`);
        }
        
        // Perform the operation
        return await this.indexBridge.lookupByPath(path);
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "lookup_by_path" }
    );
  }
  
  /**
   * Query content index with capability verification
   * 
   * @param {Object} queryParams - Query parameters
   * @param {string} authToken - Authentication token
   * @returns {Promise<Array>} Query results
   */
  async query(queryParams, authToken) {
    return track_operation(
      "secure_pyarrow_index_query",
      async () => {
        // Verify read capability
        const hasAccess = await this._verifyCapability(
          PYARROW_INDEX_CAPABILITIES.READ,
          authToken
        );
        
        if (!hasAccess) {
          throw new Error(`Access denied: Missing capability ${PYARROW_INDEX_CAPABILITIES.READ}`);
        }
        
        // Perform the operation
        const results = await this.indexBridge.query(queryParams);
        
        // Update stats
        this.stats.queriesPerformed++;
        
        // Update metrics
        if (this.observabilityEnabled && results) {
          this.metrics.querySize.observe(
            { query_type: queryParams.type || 'general' },
            results.length || 0
          );
        }
        
        return results;
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "query" }
    );
  }
  
  /**
   * Add a new entry to the content index with capability verification
   * 
   * @param {Object} entry - Entry to add
   * @param {string} authToken - Authentication token
   * @returns {Promise<Object>} Added entry
   */
  async addEntry(entry, authToken) {
    return track_operation(
      "secure_pyarrow_index_add_entry",
      async () => {
        // Verify write capability
        const resource = entry.cid || '*';
        const hasAccess = await this._verifyCapability(
          PYARROW_INDEX_CAPABILITIES.WRITE,
          authToken,
          resource
        );
        
        if (!hasAccess) {
          throw new Error(`Access denied: Missing capability ${PYARROW_INDEX_CAPABILITIES.WRITE}:${resource}`);
        }
        
        // Perform the operation
        const result = await this.indexBridge.addEntry(entry);
        
        // Update stats
        this.stats.entriesAdded++;
        
        // Update metrics
        if (this.observabilityEnabled) {
          const stats = await this.indexBridge.getStats();
          if (stats && stats.entry_count !== undefined) {
            this.metrics.indexSize.set(stats.entry_count);
          }
        }
        
        return result;
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "add_entry" }
    );
  }
  
  /**
   * Update an existing entry in the content index with capability verification
   * 
   * @param {string} cid - Content identifier of the entry to update
   * @param {Object} updateData - Data to update
   * @param {string} authToken - Authentication token
   * @returns {Promise<Object>} Updated entry
   */
  async updateEntry(cid, updateData, authToken) {
    return track_operation(
      "secure_pyarrow_index_update_entry",
      async () => {
        // Verify write capability
        const hasAccess = await this._verifyCapability(
          PYARROW_INDEX_CAPABILITIES.WRITE,
          authToken,
          cid
        );
        
        if (!hasAccess) {
          throw new Error(`Access denied: Missing capability ${PYARROW_INDEX_CAPABILITIES.WRITE}:${cid}`);
        }
        
        // Perform the operation
        const result = await this.indexBridge.updateEntry(cid, updateData);
        
        // Update stats
        this.stats.entriesUpdated++;
        
        return result;
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "update_entry" }
    );
  }
  
  /**
   * Delete an entry from the content index with capability verification
   * 
   * @param {string} cid - Content identifier of the entry to delete
   * @param {string} authToken - Authentication token
   * @returns {Promise<boolean>} True if deletion successful
   */
  async deleteEntry(cid, authToken) {
    return track_operation(
      "secure_pyarrow_index_delete_entry",
      async () => {
        // Verify delete capability
        const hasAccess = await this._verifyCapability(
          PYARROW_INDEX_CAPABILITIES.DELETE,
          authToken,
          cid
        );
        
        if (!hasAccess) {
          throw new Error(`Access denied: Missing capability ${PYARROW_INDEX_CAPABILITIES.DELETE}:${cid}`);
        }
        
        // Perform the operation
        const result = await this.indexBridge.deleteEntry(cid);
        
        // Update stats
        this.stats.entriesDeleted++;
        
        // Update metrics
        if (this.observabilityEnabled) {
          const stats = await this.indexBridge.getStats();
          if (stats && stats.entry_count !== undefined) {
            this.metrics.indexSize.set(stats.entry_count);
          }
        }
        
        return result;
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "delete_entry" }
    );
  }
  
  /**
   * Get content index statistics with capability verification
   * 
   * @param {string} authToken - Authentication token
   * @returns {Promise<Object>} Index statistics
   */
  async getStats(authToken) {
    return track_operation(
      "secure_pyarrow_index_get_stats",
      async () => {
        // Verify read capability
        const hasAccess = await this._verifyCapability(
          PYARROW_INDEX_CAPABILITIES.READ,
          authToken
        );
        
        if (!hasAccess) {
          throw new Error(`Access denied: Missing capability ${PYARROW_INDEX_CAPABILITIES.READ}`);
        }
        
        // Perform the operation
        return await this.indexBridge.getStats();
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "get_stats" }
    );
  }
  
  /**
   * Synchronize content index with IPFS pinset with capability verification
   * 
   * @param {boolean} includeMetadata - Whether to include metadata retrieval
   * @param {string} authToken - Authentication token
   * @returns {Promise<Object>} Sync results
   */
  async syncWithIpfsPinset(includeMetadata, authToken) {
    return track_operation(
      "secure_pyarrow_index_sync_with_ipfs_pinset",
      async () => {
        // Verify sync capability
        const hasAccess = await this._verifyCapability(
          PYARROW_INDEX_CAPABILITIES.SYNC,
          authToken
        );
        
        if (!hasAccess) {
          throw new Error(`Access denied: Missing capability ${PYARROW_INDEX_CAPABILITIES.SYNC}`);
        }
        
        // Perform the operation
        const result = await this.indexBridge.syncWithIpfsPinset(includeMetadata);
        
        // Update stats
        this.stats.syncsPerformed++;
        
        // Update metrics
        if (this.observabilityEnabled) {
          const stats = await this.indexBridge.getStats();
          if (stats && stats.entry_count !== undefined) {
            this.metrics.indexSize.set(stats.entry_count);
          }
        }
        
        return result;
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "sync_with_ipfs_pinset" }
    );
  }
  
  /**
   * Export content index to Parquet format with capability verification
   * 
   * @param {string} exportPath - Path to export the index to
   * @param {string} authToken - Authentication token
   * @returns {Promise<boolean>} True if export successful
   */
  async exportToParquet(exportPath, authToken) {
    return track_operation(
      "secure_pyarrow_index_export_to_parquet",
      async () => {
        // Verify export capability
        const hasAccess = await this._verifyCapability(
          PYARROW_INDEX_CAPABILITIES.EXPORT,
          authToken
        );
        
        if (!hasAccess) {
          throw new Error(`Access denied: Missing capability ${PYARROW_INDEX_CAPABILITIES.EXPORT}`);
        }
        
        // Perform the operation
        const result = await this.indexBridge.exportToParquet(exportPath);
        
        // Update stats
        this.stats.exportsPerformed++;
        
        return result;
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "export_to_parquet" }
    );
  }
  
  /**
   * Import content index from Parquet format with capability verification
   * 
   * @param {string} importPath - Path to import the index from
   * @param {string} authToken - Authentication token
   * @returns {Promise<boolean>} True if import successful
   */
  async importFromParquet(importPath, authToken) {
    return track_operation(
      "secure_pyarrow_index_import_from_parquet",
      async () => {
        // Verify import capability
        const hasAccess = await this._verifyCapability(
          PYARROW_INDEX_CAPABILITIES.IMPORT,
          authToken
        );
        
        if (!hasAccess) {
          throw new Error(`Access denied: Missing capability ${PYARROW_INDEX_CAPABILITIES.IMPORT}`);
        }
        
        // Perform the operation
        const result = await this.indexBridge.importFromParquet(importPath);
        
        // Update stats
        this.stats.importsPerformed++;
        
        // Update metrics
        if (this.observabilityEnabled) {
          const stats = await this.indexBridge.getStats();
          if (stats && stats.entry_count !== undefined) {
            this.metrics.indexSize.set(stats.entry_count);
          }
        }
        
        return result;
      },
      this.observabilityEnabled ? this.metrics.operationDuration : null,
      { operation: "import_from_parquet" }
    );
  }
  
  /**
   * Get security status metrics
   * 
   * @returns {Object} Security status
   */
  getSecurityStatus() {
    return {
      module: 'secure_pyarrow_index',
      initialized: this.initialized,
      auth_initialized: this.auth && this.auth.initialized,
      bridge_initialized: this.indexBridge && this.indexBridge.initialized,
      access_stats: {
        granted: this.stats.accessGranted,
        denied: this.stats.accessDenied,
        ratio: this.stats.accessDenied > 0 ? 
          (this.stats.accessGranted / (this.stats.accessGranted + this.stats.accessDenied)).toFixed(2) : 
          1.0
      },
      operations: {
        entriesAdded: this.stats.entriesAdded,
        entriesUpdated: this.stats.entriesUpdated,
        entriesDeleted: this.stats.entriesDeleted,
        queriesPerformed: this.stats.queriesPerformed,
        syncsPerformed: this.stats.syncsPerformed,
        importsPerformed: this.stats.importsPerformed,
        exportsPerformed: this.stats.exportsPerformed
      },
      last_request: this.stats.lastRequest
    };
  }
  
  /**
   * Run module tests
   * 
   * @returns {Promise<Object>} Test results
   */
  async test() {
    console.log('Testing secure PyArrow content index manager');
    
    try {
      const testResults = {
        success: false,
        module: 'secure_pyarrow_index',
        initialization: false,
        capability_verification: false,
        operations: {
          lookup: false,
          query: false,
          add: false,
          update: false,
          delete: false,
          sync: false,
          export: false,
          import: false
        },
        security: {
          access_control: false,
          token_verification: false
        }
      };
      
      // Test initialization
      if (!this.initialized) {
        const initResult = await this.init();
        testResults.initialization = initResult;
      } else {
        testResults.initialization = true;
      }
      
      if (testResults.initialization) {
        // Get auth token for testing
        const authToken = this.auth.getSelfSignedToken(PYARROW_INDEX_CAPABILITIES.ADMIN);
        
        // Test capability verification
        try {
          const hasAdminAccess = await this._verifyCapability(
            PYARROW_INDEX_CAPABILITIES.ADMIN,
            authToken
          );
          
          testResults.capability_verification = hasAdminAccess;
          testResults.security.token_verification = hasAdminAccess;
          
          if (hasAdminAccess) {
            // Test operations with admin token
            // Add a test entry
            const testEntry = {
              cid: `test-cid-${Date.now()}`,
              path: `/test/path-${Date.now()}`,
              size: 1024,
              mimetype: 'text/plain',
              added_at: new Date().toISOString(),
              metadata: {
                test: true,
                timestamp: Date.now()
              }
            };
            
            // Test add entry
            try {
              const addResult = await this.addEntry(testEntry, authToken);
              testResults.operations.add = Boolean(addResult);
              
              if (testResults.operations.add) {
                // Test lookup by CID
                try {
                  const lookupResult = await this.lookupByCid(testEntry.cid, authToken);
                  testResults.operations.lookup = Boolean(lookupResult) && lookupResult.cid === testEntry.cid;
                  
                  // Test update entry
                  try {
                    const updateResult = await this.updateEntry(
                      testEntry.cid,
                      { metadata: { ...testEntry.metadata, updated: true } },
                      authToken
                    );
                    testResults.operations.update = Boolean(updateResult);
                    
                    // Test query
                    try {
                      const queryResult = await this.query({ filter: "test = true" }, authToken);
                      testResults.operations.query = Array.isArray(queryResult);
                      
                      // Test delete entry
                      try {
                        const deleteResult = await this.deleteEntry(testEntry.cid, authToken);
                        testResults.operations.delete = deleteResult === true;
                      } catch (deleteError) {
                        console.error('Test delete entry failed:', deleteError);
                      }
                    } catch (queryError) {
                      console.error('Test query failed:', queryError);
                    }
                  } catch (updateError) {
                    console.error('Test update entry failed:', updateError);
                  }
                } catch (lookupError) {
                  console.error('Test lookup failed:', lookupError);
                }
              }
            } catch (addError) {
              console.error('Test add entry failed:', addError);
            }
            
            // Test access control with invalid token
            try {
              const invalidToken = "invalid-token";
              try {
                await this.lookupByCid(testEntry.cid, invalidToken);
                // Should not reach here - access should be denied
                testResults.security.access_control = false;
              } catch (accessError) {
                // Access should be denied - this is correct behavior
                testResults.security.access_control = accessError.message.includes('Access denied');
              }
            } catch (accessControlError) {
              console.error('Test access control failed:', accessControlError);
            }
          }
        } catch (capabilityError) {
          console.error('Test capability verification failed:', capabilityError);
        }
      }
      
      // Overall success
      testResults.success = (
        testResults.initialization &&
        testResults.capability_verification &&
        testResults.security.access_control &&
        testResults.security.token_verification &&
        testResults.operations.lookup &&
        testResults.operations.query &&
        testResults.operations.add &&
        testResults.operations.update &&
        testResults.operations.delete
      );
      
      return testResults;
    } catch (error) {
      console.error('Secure PyArrow index test failed:', error);
      return {
        success: false,
        module: 'secure_pyarrow_index',
        error: error.message
      };
    }
  }
}

// Create default instance
const securePyArrowIndexManager = new SecurePyArrowIndexManager();

// For API compatibility
export function getSecurePyArrowIndexManager() {
  return securePyArrowIndexManager;
}

export default securePyArrowIndexManager;