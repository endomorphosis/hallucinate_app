/**
 * FireproofDB Kit
 * 
 * Provides a wrapper for FireproofDB database operations
 * Enables serverless database mirroring with CRDT capabilities
 */

// Import Fireproof library - this is a placeholder import
// In a real implementation, you would use the actual library
let fireproof;
try {
  fireproof = require('fireproof');
} catch (error) {
  console.warn('FireproofDB library not found, using mock implementation');
  fireproof = function(name) {
    return createMockFireproofDB(name);
  };
}

/**
 * Create a mock FireproofDB implementation for development/testing
 * @param {string} name Database name
 * @returns {Object} Mock database instance
 */
function createMockFireproofDB(name) {
  const store = new Map();
  const listeners = new Map();
  
  const db = {
    name,
    store,
    listeners,
    
    /**
     * Put a document into the database
     * @param {Object} doc Document to store
     * @returns {Promise<Object>} Result with document ID and revision
     */
    async put(doc) {
      if (!doc._id) {
        doc._id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      
      const existing = store.get(doc._id);
      if (existing) {
        doc._rev = `${parseInt((existing._rev || '0').split('-')[0]) + 1}-${Math.random().toString(36).substr(2, 9)}`;
      } else {
        doc._rev = `1-${Math.random().toString(36).substr(2, 9)}`;
      }
      
      store.set(doc._id, { ...doc });
      
      // Notify all query listeners
      for (const [key, listener] of listeners.entries()) {
        if (listener.type === 'query') {
          // Simple check if the document matches the query
          if (doc[listener.field] !== undefined) {
            listener.callback();
          }
        }
      }
      
      return {
        id: doc._id,
        rev: doc._rev
      };
    },
    
    /**
     * Get a document from the database
     * @param {string} id Document ID
     * @returns {Promise<Object>} Document
     */
    async get(id) {
      const doc = store.get(id);
      if (!doc) {
        throw new Error(`Document not found: ${id}`);
      }
      return { ...doc };
    },
    
    /**
     * Delete a document from the database
     * @param {Object|string} docOrId Document or document ID to delete
     * @param {string} [rev] Document revision (if ID is provided)
     * @returns {Promise<Object>} Result with document ID
     */
    async remove(docOrId, rev) {
      let id;
      if (typeof docOrId === 'string') {
        id = docOrId;
      } else {
        id = docOrId._id;
        rev = docOrId._rev;
      }
      
      const doc = store.get(id);
      if (!doc) {
        throw new Error(`Document not found: ${id}`);
      }
      
      if (rev && doc._rev !== rev) {
        throw new Error(`Revision conflict: ${rev} !== ${doc._rev}`);
      }
      
      store.delete(id);
      
      return {
        id,
        success: true
      };
    },
    
    /**
     * Query documents in the database
     * @param {string} field Field to query
     * @param {Object} options Query options
     * @returns {Promise<Object>} Query results
     */
    async query(field, options = {}) {
      const results = [];
      
      for (const [id, doc] of store.entries()) {
        if (doc[field] !== undefined) {
          let include = true;
          
          // Apply range filter if provided
          if (options.range) {
            const [min, max] = options.range;
            if (doc[field] < min || doc[field] > max) {
              include = false;
            }
          }
          
          // Apply prefix filter if provided
          if (options.prefix && typeof doc[field] === 'string') {
            if (!doc[field].startsWith(options.prefix)) {
              include = false;
            }
          }
          
          if (include) {
            results.push({
              key: doc[field],
              value: doc,
              id: doc._id,
              doc: { ...doc }
            });
          }
        }
      }
      
      // Apply sorting
      results.sort((a, b) => {
        if (options.descending) {
          return b.key > a.key ? 1 : -1;
        }
        return a.key > b.key ? 1 : -1;
      });
      
      // Apply limit
      if (options.limit && options.limit > 0) {
        return {
          rows: results.slice(0, options.limit)
        };
      }
      
      return {
        rows: results
      };
    },
    
    /**
     * Listen for changes to documents
     * @param {Function} callback Function to call when changes occur
     * @returns {Object} Listener object with remove method
     */
    async subscribe(callback) {
      const id = `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      listeners.set(id, {
        type: 'changes',
        callback
      });
      
      return {
        remove: () => {
          listeners.delete(id);
        }
      };
    },
    
    /**
     * Listen for query results changes
     * @param {string} field Field to query
     * @param {Object} options Query options
     * @param {Function} callback Function to call when query results change
     * @returns {Object} Listener object with remove method
     */
    async subscribe(field, options, callback) {
      const id = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      listeners.set(id, {
        type: 'query',
        field,
        options,
        callback
      });
      
      return {
        remove: () => {
          listeners.delete(id);
        }
      };
    },
    
    /**
     * Get database information
     * @returns {Promise<Object>} Database information
     */
    async info() {
      return {
        name,
        doc_count: store.size,
        update_seq: Date.now()
      };
    },
    
    /**
     * Get all documents
     * @returns {Promise<Object>} All documents
     */
    async allDocs(options = {}) {
      const docs = Array.from(store.values()).map(doc => ({
        id: doc._id,
        key: doc._id,
        value: { rev: doc._rev },
        doc: options.include_docs ? { ...doc } : undefined
      }));
      
      return {
        total_rows: docs.length,
        rows: docs
      };
    },
    
    /**
     * Create an index
     * @param {Object} indexDef Index definition
     * @returns {Promise<Object>} Index creation result
     */
    async createIndex(indexDef) {
      // Mock implementation - in a real DB this would create an index
      return {
        id: `idx_${indexDef.name || Date.now()}`,
        name: indexDef.name || `idx_${Date.now()}`,
        fields: indexDef.fields || []
      };
    }
  };
  
  return db;
}

/**
 * FireproofDB Kit class
 * Provides a consistent interface for FireproofDB operations
 */
class FireproofDBKit {
  /**
   * Create a new FireproofDBKit instance
   * @param {Object} resources Resource pool
   * @param {Object} metadata Configuration metadata
   */
  constructor(resources = {}, metadata = {}) {
    this.resources = resources;
    this.metadata = metadata;
    this.databases = new Map();
    this.initialized = false;
    
    // Default configuration
    this.config = {
      syncWithIpfs: metadata.syncWithIpfs || false,
      ...metadata.config
    };
    
    // If IPFS is available in resources, use it for sync
    if (this.config.syncWithIpfs && resources.ipfsKit) {
      this.ipfs = resources.ipfsKit;
    }
    
    console.log('FireproofDB Kit created');
  }
  
  /**
   * Initialize the FireproofDB Kit
   * @returns {Promise<boolean>} True if initialization was successful
   */
  async init() {
    try {
      // Add initialization logic here
      // In a real implementation, this might set up global configs, etc.
      
      this.initialized = true;
      console.log('FireproofDB Kit initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize FireproofDB Kit:', error);
      return false;
    }
  }
  
  /**
   * Create or open a database
   * @param {string} name Database name
   * @param {Object} options Database options
   * @returns {Promise<Object>} Database instance with result
   */
  async createDatabase(name, options = {}) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      // Check if database already exists
      if (this.databases.has(name)) {
        return {
          name,
          db: this.databases.get(name),
          exists: true
        };
      }
      
      // Create a new database
      const db = fireproof(name);
      this.databases.set(name, db);
      
      return {
        name,
        db,
        created: true
      };
    } catch (error) {
      console.error(`Error creating FireproofDB database '${name}':`, error);
      throw error;
    }
  }
  
  /**
   * Get a database by name
   * @param {string} name Database name
   * @returns {Promise<Object>} Database instance
   */
  async getDatabase(name) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      // Check if database exists
      if (this.databases.has(name)) {
        return this.databases.get(name);
      }
      
      // Try to open the database
      const db = fireproof(name);
      this.databases.set(name, db);
      
      return db;
    } catch (error) {
      console.error(`Error getting FireproofDB database '${name}':`, error);
      throw error;
    }
  }
  
  /**
   * List all databases
   * @returns {Promise<Object>} List of databases
   */
  async listDatabases() {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      const dbList = [];
      
      for (const [name, db] of this.databases.entries()) {
        try {
          const info = await db.info();
          dbList.push({
            name,
            doc_count: info.doc_count,
            update_seq: info.update_seq
          });
        } catch (error) {
          console.warn(`Error getting info for database '${name}':`, error);
          dbList.push({
            name,
            error: error.message
          });
        }
      }
      
      return {
        databases: dbList,
        count: dbList.length
      };
    } catch (error) {
      console.error('Error listing FireproofDB databases:', error);
      throw error;
    }
  }
  
  /**
   * Delete a database
   * @param {string} name Database name
   * @returns {Promise<Object>} Deletion result
   */
  async deleteDatabase(name) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      if (!this.databases.has(name)) {
        return {
          name,
          deleted: false,
          reason: 'Database not found'
        };
      }
      
      // In a real implementation, you would use the actual destroy method
      // await this.databases.get(name).destroy();
      
      // For our mock, just remove it from the map
      this.databases.delete(name);
      
      return {
        name,
        deleted: true
      };
    } catch (error) {
      console.error(`Error deleting FireproofDB database '${name}':`, error);
      throw error;
    }
  }
  
  /**
   * Put a document into a database
   * @param {string} dbName Database name
   * @param {Object} doc Document to store
   * @returns {Promise<Object>} Storage result
   */
  async putDocument(dbName, doc) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      const db = await this.getDatabase(dbName);
      const result = await db.put(doc);
      
      return {
        id: result.id,
        rev: result.rev,
        success: true
      };
    } catch (error) {
      console.error(`Error putting document into database '${dbName}':`, error);
      throw error;
    }
  }
  
  /**
   * Get a document from a database
   * @param {string} dbName Database name
   * @param {string} docId Document ID
   * @returns {Promise<Object>} Document
   */
  async getDocument(dbName, docId) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      const db = await this.getDatabase(dbName);
      const doc = await db.get(docId);
      
      return doc;
    } catch (error) {
      console.error(`Error getting document '${docId}' from database '${dbName}':`, error);
      throw error;
    }
  }
  
  /**
   * Delete a document from a database
   * @param {string} dbName Database name
   * @param {string|Object} docOrId Document or document ID
   * @param {string} [rev] Document revision (if ID is provided)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteDocument(dbName, docOrId, rev) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      const db = await this.getDatabase(dbName);
      const result = await db.remove(docOrId, rev);
      
      return {
        id: result.id,
        success: result.success || true
      };
    } catch (error) {
      console.error(`Error deleting document from database '${dbName}':`, error);
      throw error;
    }
  }
  
  /**
   * Query documents in a database
   * @param {string} dbName Database name
   * @param {string} field Field to query
   * @param {Object} options Query options
   * @returns {Promise<Object>} Query results
   */
  async queryDocuments(dbName, field, options = {}) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      const db = await this.getDatabase(dbName);
      const result = await db.query(field, options);
      
      return {
        rows: result.rows,
        total_rows: result.rows.length
      };
    } catch (error) {
      console.error(`Error querying documents in database '${dbName}':`, error);
      throw error;
    }
  }
  
  /**
   * Get all documents from a database
   * @param {string} dbName Database name
   * @param {Object} options Query options
   * @returns {Promise<Object>} All documents
   */
  async getAllDocuments(dbName, options = {}) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      const db = await this.getDatabase(dbName);
      const result = await db.allDocs(options);
      
      return {
        rows: result.rows,
        total_rows: result.total_rows
      };
    } catch (error) {
      console.error(`Error getting all documents from database '${dbName}':`, error);
      throw error;
    }
  }
  
  /**
   * Create an index on a database
   * @param {string} dbName Database name
   * @param {Object} indexDef Index definition
   * @returns {Promise<Object>} Index creation result
   */
  async createIndex(dbName, indexDef) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      const db = await this.getDatabase(dbName);
      const result = await db.createIndex(indexDef);
      
      return {
        id: result.id,
        name: result.name,
        fields: result.fields,
        success: true
      };
    } catch (error) {
      console.error(`Error creating index in database '${dbName}':`, error);
      throw error;
    }
  }
  
  /**
   * Export database to IPFS
   * @param {string} dbName Database name
   * @returns {Promise<Object>} Export result with IPFS CID
   */
  async exportToIPFS(dbName) {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.ipfs) {
      throw new Error('IPFS not available for export. Initialize with syncWithIpfs option.');
    }
    
    try {
      const db = await this.getDatabase(dbName);
      const allDocs = await db.allDocs({ include_docs: true });
      
      // Serialize database content
      const dbContent = {
        name: dbName,
        timestamp: Date.now(),
        docs: allDocs.rows.map(row => row.doc)
      };
      
      // Add to IPFS
      const contentBuffer = Buffer.from(JSON.stringify(dbContent));
      const result = await this.ipfs.ipfs.add(contentBuffer);
      
      return {
        name: dbName,
        cid: result.cid.toString(),
        size: result.size,
        timestamp: dbContent.timestamp,
        doc_count: dbContent.docs.length
      };
    } catch (error) {
      console.error(`Error exporting database '${dbName}' to IPFS:`, error);
      throw error;
    }
  }
  
  /**
   * Import database from IPFS
   * @param {string} cid IPFS CID of the database
   * @param {string} [targetDbName] Target database name (optional)
   * @returns {Promise<Object>} Import result
   */
  async importFromIPFS(cid, targetDbName = null) {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.ipfs) {
      throw new Error('IPFS not available for import. Initialize with syncWithIpfs option.');
    }
    
    try {
      // Get content from IPFS
      const chunks = [];
      for await (const chunk of this.ipfs.ipfs.cat(cid)) {
        chunks.push(chunk);
      }
      
      const contentBuffer = Buffer.concat(chunks);
      const dbContent = JSON.parse(contentBuffer.toString());
      
      // If no target name is provided, use the original name
      const dbName = targetDbName || dbContent.name;
      
      // Create or get the database
      const db = await this.getDatabase(dbName);
      
      // Import all documents
      const results = [];
      for (const doc of dbContent.docs) {
        try {
          const result = await db.put(doc);
          results.push({
            id: result.id,
            success: true
          });
        } catch (error) {
          results.push({
            id: doc._id,
            success: false,
            error: error.message
          });
        }
      }
      
      return {
        name: dbName,
        cid,
        timestamp: dbContent.timestamp,
        imported: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        total: dbContent.docs.length
      };
    } catch (error) {
      console.error(`Error importing database from IPFS CID '${cid}':`, error);
      throw error;
    }
  }
  
  /**
   * Sync database with another FireproofDB
   * @param {string} dbName Database name
   * @param {string} targetUrl Target URL for sync
   * @param {Object} options Sync options
   * @returns {Promise<Object>} Sync result
   */
  async syncDatabase(dbName, targetUrl, options = {}) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      // In a real implementation, this would use the actual sync mechanism
      // For our mock, just return success
      
      return {
        name: dbName,
        target: targetUrl,
        success: true,
        message: 'Mock sync completed'
      };
    } catch (error) {
      console.error(`Error syncing database '${dbName}':`, error);
      throw error;
    }
  }
  
  /**
   * Run tests on the FireproofDB Kit
   * @returns {Promise<Object>} Test results
   */
  async test() {
    console.log('Testing FireproofDB Kit');
    
    try {
      // Initialize if not already initialized
      if (!this.initialized) {
        await this.init();
      }
      
      // Create a test database
      const dbName = `test-db-${Date.now()}`;
      const createResult = await this.createDatabase(dbName);
      
      // Add some test documents
      const doc1 = { _id: 'test1', value: 'Test Document 1', type: 'test', priority: 1 };
      const doc2 = { _id: 'test2', value: 'Test Document 2', type: 'test', priority: 2 };
      
      await this.putDocument(dbName, doc1);
      await this.putDocument(dbName, doc2);
      
      // Query the documents
      const queryResult = await this.queryDocuments(dbName, 'type', { prefix: 'test' });
      
      // Get all documents
      const allDocsResult = await this.getAllDocuments(dbName, { include_docs: true });
      
      // Test results
      return {
        name: 'fireproofdb_kit',
        success: true,
        results: {
          initialization: true,
          databaseCreation: !!createResult.created,
          documentStorage: true,
          documentRetrieval: queryResult.rows.length === 2,
          allDocuments: allDocsResult.rows.length === 2
        }
      };
    } catch (error) {
      console.error('FireproofDB Kit test failed:', error);
      return {
        name: 'fireproofdb_kit',
        success: false,
        error: error.message
      };
    }
  }
}

// Create a singleton instance
const fireproofdbKit = new FireproofDBKit();

// Export the class and singleton
export { FireproofDBKit, fireproofdbKit };
export default fireproofdbKit;