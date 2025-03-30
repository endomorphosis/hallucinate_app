/**
 * PyArrow Content Index JavaScript Client
 * 
 * Provides a JavaScript client for the PyArrow content index
 * Uses PyBridge for efficient communication with the Python implementation
 * Supports Arrow data format for high-performance data exchange
 */

import path from 'path';
import os from 'os';

/**
 * JavaScript client for PyArrow Content Index
 */
class PyArrowIndex {
  /**
   * Initialize the PyArrow content index client
   * 
   * @param {Object} options - Configuration options
   * @param {Object} options.pythonBridge - Python bridge instance for communication
   * @param {string} options.indexPath - Path to the content index file
   * @param {boolean} options.useArrow - Whether to use Arrow for data transfer
   * @param {Object} options.resources - Additional resources for initialization
   */
  constructor(options = {}) {
    this.pythonBridge = options.pythonBridge;
    this.indexPath = options.indexPath || path.join(os.homedir(), '.hallucinate_app', 'content_index.arrow');
    this.useArrow = options.useArrow !== false; // Default to true
    this.initialized = false;
    this.bridgeModule = 'pyarrow_content_index_bridge';
    this.bridgeInstance = 'content_index_bridge';
    
    // Track operation stats
    this.stats = {
      operations: 0,
      errors: 0,
      lastError: null,
      lastOperation: null
    };
  }

  /**
   * Initialize the content index client
   * 
   * @returns {Promise<boolean>} Success status
   */
  async init() {
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
      return this.initialized;
    } catch (error) {
      console.error(`Error initializing PyArrow content index: ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = error;
      return false;
    }
  }

  /**
   * Look up content by CID
   * 
   * @param {string} cid - Content identifier
   * @returns {Promise<Object>} Content metadata
   */
  async lookupByCid(cid) {
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

      return result;
    } catch (error) {
      console.error(`Error looking up CID ${cid}: ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = error;
      throw error;
    }
  }

  /**
   * Look up content by virtual filesystem path
   * 
   * @param {string} path - Virtual filesystem path
   * @returns {Promise<Object>} Content metadata
   */
  async lookupByPath(path) {
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

      return result;
    } catch (error) {
      console.error(`Error looking up path ${path}: ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = error;
      throw error;
    }
  }

  /**
   * Add an entry to the content index
   * 
   * @param {Object} entry - Entry data with CID, path, and metadata
   * @returns {Promise<Object>} Added entry
   */
  async addEntry(entry) {
    try {
      if (!this.initialized) {
        await this.init();
      }

      this.stats.operations++;
      this.stats.lastOperation = 'addEntry';

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

      return result;
    } catch (error) {
      console.error(`Error adding entry: ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = error;
      throw error;
    }
  }

  /**
   * Update an entry in the content index
   * 
   * @param {string} cid - Content identifier
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated entry
   */
  async updateEntry(cid, updateData) {
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

      return result;
    } catch (error) {
      console.error(`Error updating entry ${cid}: ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = error;
      throw error;
    }
  }

  /**
   * Delete an entry from the content index
   * 
   * @param {string} cid - Content identifier
   * @returns {Promise<boolean>} Success status
   */
  async deleteEntry(cid) {
    try {
      if (!this.initialized) {
        await this.init();
      }

      this.stats.operations++;
      this.stats.lastOperation = 'deleteEntry';

      return await this.pythonBridge.callAsync({
        module: this.bridgeModule,
        instance: this.bridgeInstance,
        method: 'js_delete_entry',
        args: [cid]
      });
    } catch (error) {
      console.error(`Error deleting entry ${cid}: ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = error;
      throw error;
    }
  }

  /**
   * Query the content index
   * 
   * @param {Object} queryParams - Query parameters including filters, sorting, pagination
   * @returns {Promise<Array<Object>>} Matching entries
   */
  async query(queryParams) {
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

      return result;
    } catch (error) {
      console.error(`Error querying content index: ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = error;
      throw error;
    }
  }

  /**
   * Synchronize the content index with the IPFS pinset
   * 
   * @param {boolean} includeMetadata - Whether to include detailed metadata
   * @returns {Promise<Object>} Synchronization results
   */
  async syncWithIpfsPinset(includeMetadata = true) {
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

      return result;
    } catch (error) {
      console.error(`Error syncing with IPFS pinset: ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = error;
      throw error;
    }
  }

  /**
   * Get statistics about the content index
   * 
   * @returns {Promise<Object>} Statistics including count, size, types, etc.
   */
  async getStats() {
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

      return result;
    } catch (error) {
      console.error(`Error getting content index stats: ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = error;
      throw error;
    }
  }

  /**
   * Save the content index to disk
   * 
   * @returns {Promise<boolean>} Success status
   */
  async save() {
    try {
      if (!this.initialized) {
        await this.init();
      }

      this.stats.operations++;
      this.stats.lastOperation = 'save';

      return await this.pythonBridge.callAsync({
        module: this.bridgeModule,
        instance: this.bridgeInstance,
        method: 'js_save'
      });
    } catch (error) {
      console.error(`Error saving content index: ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = error;
      throw error;
    }
  }

  /**
   * Export the content index to Parquet format
   * 
   * @param {string} exportPath - Path to export the Parquet file
   * @returns {Promise<boolean>} Success status
   */
  async exportToParquet(exportPath) {
    try {
      if (!this.initialized) {
        await this.init();
      }

      this.stats.operations++;
      this.stats.lastOperation = 'exportToParquet';

      return await this.pythonBridge.callAsync({
        module: this.bridgeModule,
        instance: this.bridgeInstance,
        method: 'js_export_to_parquet',
        args: [exportPath]
      });
    } catch (error) {
      console.error(`Error exporting content index to Parquet: ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = error;
      throw error;
    }
  }

  /**
   * Import the content index from Parquet format
   * 
   * @param {string} importPath - Path to import the Parquet file from
   * @returns {Promise<boolean>} Success status
   */
  async importFromParquet(importPath) {
    try {
      if (!this.initialized) {
        await this.init();
      }

      this.stats.operations++;
      this.stats.lastOperation = 'importFromParquet';

      return await this.pythonBridge.callAsync({
        module: this.bridgeModule,
        instance: this.bridgeInstance,
        method: 'js_import_from_parquet',
        args: [importPath]
      });
    } catch (error) {
      console.error(`Error importing content index from Parquet: ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = error;
      throw error;
    }
  }

  /**
   * Test the content index functionality
   * 
   * @returns {Promise<Object>} Test results
   */
  async test() {
    try {
      // Create a simple test entry
      const testEntry = {
        cid: `QmTest${Date.now().toString(16)}`,
        path: `/test/path/file-${Date.now()}.txt`,
        mimetype: 'text/plain',
        size: 1024,
        tags: ['test', 'javascript'],
        description: 'Test entry from JavaScript'
      };

      // Run basic operations to test functionality
      const results = {
        module: 'PyArrowIndex',
        success: false,
        operations: {},
        diagnostics: {
          useArrow: this.useArrow,
          initialized: this.initialized,
          bridgeAvailable: !!this.pythonBridge
        }
      };

      // Initialize if needed
      if (!this.initialized) {
        const initResult = await this.init();
        results.operations.initialization = {
          success: initResult,
          message: initResult ? 'Successfully initialized content index client' : 'Failed to initialize content index client'
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
          description: 'Updated test description',
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
      return {
        module: 'PyArrowIndex',
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get client statistics
   * 
   * @returns {Object} Client statistics
   */
  getClientStats() {
    return {
      ...this.stats,
      clientType: 'JavaScript',
      useArrow: this.useArrow,
      initialized: this.initialized,
      timestamp: new Date().toISOString()
    };
  }
}

export default PyArrowIndex;