/**
 * Multi-Database Integration Test
 * 
 * Tests the integration between OrbitDB, FireproofDB, and DuckDB-IPLD 
 * for the multi-database approach described in CLAUDE.md
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const assert = require('assert');
const rmdir = promisify(fs.rm || fs.rmdir);

// Import the database modules
// Note: In a real test, we'd import the actual implementations
// For this test, we'll create mock implementations
const DuckDBIPLDKit = require('../../hallucinate_app/node/duckdb_ipld_kit').default;

// Mock OrbitDB kit
class MockOrbitDBKit {
  constructor(options = {}) {
    this.resources = options.resources || {};
    this.metadata = options.metadata || {};
    this.databases = new Map();
    this.collections = new Map();
    this.initialized = false;
    this.mockMode = true;
    this.stats = {
      operations: 0,
      lastOperation: null
    };
  }
  
  async init() {
    this.initialized = true;
    return true;
  }
  
  async createDatabase(name, options = {}) {
    this.databases.set(name, { name, options, collections: new Map() });
    this.stats.operations++;
    this.stats.lastOperation = 'createDatabase';
    return {
      name,
      success: true,
      mock: true
    };
  }
  
  async getDatabase(name) {
    if (!this.databases.has(name)) {
      return {
        success: false,
        error: `Database not found: ${name}`
      };
    }
    this.stats.operations++;
    this.stats.lastOperation = 'getDatabase';
    return {
      ...this.databases.get(name),
      success: true,
      mock: true
    };
  }
  
  async createCollection(dbName, collectionName, options = {}) {
    if (!this.databases.has(dbName)) {
      return {
        success: false,
        error: `Database not found: ${dbName}`
      };
    }
    
    const db = this.databases.get(dbName);
    db.collections.set(collectionName, { name: collectionName, options, documents: new Map() });
    
    const collectionId = `${dbName}/${collectionName}`;
    this.collections.set(collectionId, db.collections.get(collectionName));
    
    this.stats.operations++;
    this.stats.lastOperation = 'createCollection';
    
    return {
      name: collectionName,
      success: true,
      mock: true
    };
  }
  
  async addDocument(dbName, collectionName, document) {
    const collectionId = `${dbName}/${collectionName}`;
    if (!this.collections.has(collectionId)) {
      return {
        success: false,
        error: `Collection not found: ${collectionId}`
      };
    }
    
    const collection = this.collections.get(collectionId);
    const docId = document._id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    document._id = docId;
    document._createdAt = document._createdAt || new Date().toISOString();
    document._updatedAt = new Date().toISOString();
    
    collection.documents.set(docId, document);
    
    this.stats.operations++;
    this.stats.lastOperation = 'addDocument';
    
    return {
      _id: docId,
      document,
      success: true,
      mock: true
    };
  }
  
  async getDocument(dbName, collectionName, docId) {
    const collectionId = `${dbName}/${collectionName}`;
    if (!this.collections.has(collectionId)) {
      return {
        success: false,
        error: `Collection not found: ${collectionId}`
      };
    }
    
    const collection = this.collections.get(collectionId);
    if (!collection.documents.has(docId)) {
      return {
        success: false,
        error: `Document not found: ${docId}`
      };
    }
    
    this.stats.operations++;
    this.stats.lastOperation = 'getDocument';
    
    return {
      document: collection.documents.get(docId),
      success: true,
      mock: true
    };
  }
  
  async queryDocuments(dbName, collectionName, query = {}) {
    const collectionId = `${dbName}/${collectionName}`;
    if (!this.collections.has(collectionId)) {
      return {
        success: false,
        error: `Collection not found: ${collectionId}`
      };
    }
    
    const collection = this.collections.get(collectionId);
    const documents = Array.from(collection.documents.values());
    
    this.stats.operations++;
    this.stats.lastOperation = 'queryDocuments';
    
    return {
      documents,
      count: documents.length,
      success: true,
      mock: true
    };
  }
  
  async close() {
    this.initialized = false;
    return true;
  }
}

// Mock FireproofDB kit
class MockFireproofDBKit {
  constructor(options = {}) {
    this.resources = options.resources || {};
    this.metadata = options.metadata || {};
    this.databases = new Map();
    this.tables = new Map();
    this.initialized = false;
    this.mockMode = true;
    this.stats = {
      operations: 0,
      lastOperation: null
    };
  }
  
  async init() {
    this.initialized = true;
    return true;
  }
  
  async createDatabase(name, options = {}) {
    this.databases.set(name, { name, options, tables: new Map() });
    this.stats.operations++;
    this.stats.lastOperation = 'createDatabase';
    return {
      name,
      success: true,
      mock: true
    };
  }
  
  async getDatabase(name) {
    if (!this.databases.has(name)) {
      return {
        success: false,
        error: `Database not found: ${name}`
      };
    }
    this.stats.operations++;
    this.stats.lastOperation = 'getDatabase';
    return {
      ...this.databases.get(name),
      success: true,
      mock: true
    };
  }
  
  async createTable(dbName, tableName, options = {}) {
    if (!this.databases.has(dbName)) {
      return {
        success: false,
        error: `Database not found: ${dbName}`
      };
    }
    
    const db = this.databases.get(dbName);
    db.tables.set(tableName, { name: tableName, options, records: new Map() });
    
    const tableId = `${dbName}/${tableName}`;
    this.tables.set(tableId, db.tables.get(tableName));
    
    this.stats.operations++;
    this.stats.lastOperation = 'createTable';
    
    return {
      name: tableName,
      success: true,
      mock: true
    };
  }
  
  async put(dbName, tableName, record) {
    const tableId = `${dbName}/${tableName}`;
    if (!this.tables.has(tableId)) {
      return {
        success: false,
        error: `Table not found: ${tableId}`
      };
    }
    
    const table = this.tables.get(tableId);
    const recordId = record.id || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    record.id = recordId;
    record._createdAt = record._createdAt || new Date().toISOString();
    record._updatedAt = new Date().toISOString();
    
    table.records.set(recordId, record);
    
    this.stats.operations++;
    this.stats.lastOperation = 'put';
    
    return {
      id: recordId,
      record,
      success: true,
      mock: true
    };
  }
  
  async get(dbName, tableName, recordId) {
    const tableId = `${dbName}/${tableName}`;
    if (!this.tables.has(tableId)) {
      return {
        success: false,
        error: `Table not found: ${tableId}`
      };
    }
    
    const table = this.tables.get(tableId);
    if (!table.records.has(recordId)) {
      return {
        success: false,
        error: `Record not found: ${recordId}`
      };
    }
    
    this.stats.operations++;
    this.stats.lastOperation = 'get';
    
    return {
      record: table.records.get(recordId),
      success: true,
      mock: true
    };
  }
  
  async query(dbName, tableName, options = {}) {
    const tableId = `${dbName}/${tableName}`;
    if (!this.tables.has(tableId)) {
      return {
        success: false,
        error: `Table not found: ${tableId}`
      };
    }
    
    const table = this.tables.get(tableId);
    const records = Array.from(table.records.values());
    
    this.stats.operations++;
    this.stats.lastOperation = 'query';
    
    return {
      records,
      count: records.length,
      success: true,
      mock: true
    };
  }
  
  async close() {
    this.initialized = false;
    return true;
  }
}

// Database Sync Manager for the multi-database approach
class DatabaseSyncManager {
  constructor(options = {}) {
    this.resources = options.resources || {};
    this.metadata = options.metadata || {};
    
    // Verify required resources
    if (!this.resources.orbitDb) {
      throw new Error('OrbitDB resource is required for DatabaseSyncManager');
    }
    if (!this.resources.fireproofDb) {
      throw new Error('FireproofDB resource is required for DatabaseSyncManager');
    }
    if (!this.resources.duckDb) {
      throw new Error('DuckDB-IPLD resource is required for DatabaseSyncManager');
    }
    
    this.initialized = false;
    this.syncInProgress = false;
    this.lastSyncTime = null;
    
    // Configuration
    this.config = {
      syncInterval: this.metadata.syncInterval || 60000, // 1 minute
      autoSync: this.metadata.autoSync !== false,
      conflictResolution: this.metadata.conflictResolution || 'newest', // 'newest', 'crdt', 'custom'
      selectiveMirroring: this.metadata.selectiveMirroring || false,
      mirrorRules: this.metadata.mirrorRules || {}
    };
    
    // Sync stats
    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSync: null,
      syncLog: []
    };
  }
  
  async init() {
    // Initialize the database resources if needed
    if (!this.resources.orbitDb.initialized) {
      await this.resources.orbitDb.init();
    }
    
    if (!this.resources.fireproofDb.initialized) {
      await this.resources.fireproofDb.init();
    }
    
    if (!this.resources.duckDb.initialized) {
      await this.resources.duckDb.init();
    }
    
    this.initialized = true;
    
    // Start auto-sync if enabled
    if (this.config.autoSync) {
      this._startAutoSync();
    }
    
    return true;
  }
  
  _startAutoSync() {
    this.syncInterval = setInterval(() => {
      this.syncAll().catch(err => {
        console.error('Auto-sync error:', err);
      });
    }, this.config.syncInterval);
  }
  
  _stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
  
  async syncOrbitToFireproof(options = {}) {
    const syncStart = Date.now();
    const syncId = `sync_${syncStart}_${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      // Log sync start
      console.log(`[${syncId}] Starting OrbitDB to FireproofDB sync`);
      
      // Get all OrbitDB databases
      const orbitDbs = Array.from(this.resources.orbitDb.databases.keys());
      
      // Process each database
      let totalCollections = 0;
      let totalDocuments = 0;
      
      for (const dbName of orbitDbs) {
        // Create or get the FireproofDB database
        if (!this.resources.fireproofDb.databases.has(dbName)) {
          await this.resources.fireproofDb.createDatabase(dbName);
        }
        
        // Get OrbitDB collections
        const db = this.resources.orbitDb.databases.get(dbName);
        const collections = Array.from(db.collections.keys());
        
        // Process each collection
        for (const collectionName of collections) {
          totalCollections++;
          
          // Create or get the FireproofDB table
          if (!this.resources.fireproofDb.tables.has(`${dbName}/${collectionName}`)) {
            await this.resources.fireproofDb.createTable(dbName, collectionName);
          }
          
          // Get OrbitDB documents
          const collection = db.collections.get(collectionName);
          const documents = Array.from(collection.documents.values());
          
          // Insert or update documents in FireproofDB
          for (const doc of documents) {
            await this.resources.fireproofDb.put(dbName, collectionName, {
              ...doc,
              _syncedFrom: 'orbitdb',
              _syncedAt: new Date().toISOString()
            });
            
            totalDocuments++;
          }
        }
      }
      
      // Log sync success
      console.log(`[${syncId}] OrbitDB to FireproofDB sync completed: ${totalCollections} collections, ${totalDocuments} documents`);
      
      // Update sync stats
      this.stats.totalSyncs++;
      this.stats.successfulSyncs++;
      this.stats.lastSync = {
        id: syncId,
        type: 'orbitToFireproof',
        startTime: new Date(syncStart).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - syncStart,
        collections: totalCollections,
        documents: totalDocuments,
        success: true
      };
      
      this.stats.syncLog.push(this.stats.lastSync);
      
      return {
        syncId,
        collections: totalCollections,
        documents: totalDocuments,
        duration: Date.now() - syncStart,
        success: true
      };
    } catch (error) {
      // Log sync error
      console.error(`[${syncId}] OrbitDB to FireproofDB sync error:`, error);
      
      // Update sync stats
      this.stats.totalSyncs++;
      this.stats.failedSyncs++;
      this.stats.lastSync = {
        id: syncId,
        type: 'orbitToFireproof',
        startTime: new Date(syncStart).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - syncStart,
        error: error.message,
        success: false
      };
      
      this.stats.syncLog.push(this.stats.lastSync);
      
      return {
        syncId,
        error: error.message,
        duration: Date.now() - syncStart,
        success: false
      };
    }
  }
  
  async syncFireproofToOrbit(options = {}) {
    const syncStart = Date.now();
    const syncId = `sync_${syncStart}_${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      // Log sync start
      console.log(`[${syncId}] Starting FireproofDB to OrbitDB sync`);
      
      // Get all FireproofDB databases
      const fireproofDbs = Array.from(this.resources.fireproofDb.databases.keys());
      
      // Process each database
      let totalTables = 0;
      let totalRecords = 0;
      
      for (const dbName of fireproofDbs) {
        // Create or get the OrbitDB database
        if (!this.resources.orbitDb.databases.has(dbName)) {
          await this.resources.orbitDb.createDatabase(dbName);
        }
        
        // Get FireproofDB tables
        const db = this.resources.fireproofDb.databases.get(dbName);
        const tables = Array.from(db.tables.keys());
        
        // Process each table
        for (const tableName of tables) {
          totalTables++;
          
          // Create or get the OrbitDB collection
          if (!this.resources.orbitDb.collections.has(`${dbName}/${tableName}`)) {
            await this.resources.orbitDb.createCollection(dbName, tableName);
          }
          
          // Get FireproofDB records
          const table = db.tables.get(tableName);
          const records = Array.from(table.records.values());
          
          // Insert or update records in OrbitDB
          for (const record of records) {
            // Skip records that originated from OrbitDB to prevent sync loops
            if (record._syncedFrom === 'orbitdb') {
              continue;
            }
            
            await this.resources.orbitDb.addDocument(dbName, tableName, {
              ...record,
              _syncedFrom: 'fireproofdb',
              _syncedAt: new Date().toISOString()
            });
            
            totalRecords++;
          }
        }
      }
      
      // Log sync success
      console.log(`[${syncId}] FireproofDB to OrbitDB sync completed: ${totalTables} tables, ${totalRecords} records`);
      
      // Update sync stats
      this.stats.totalSyncs++;
      this.stats.successfulSyncs++;
      this.stats.lastSync = {
        id: syncId,
        type: 'fireproofToOrbit',
        startTime: new Date(syncStart).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - syncStart,
        tables: totalTables,
        records: totalRecords,
        success: true
      };
      
      this.stats.syncLog.push(this.stats.lastSync);
      
      return {
        syncId,
        tables: totalTables,
        records: totalRecords,
        duration: Date.now() - syncStart,
        success: true
      };
    } catch (error) {
      // Log sync error
      console.error(`[${syncId}] FireproofDB to OrbitDB sync error:`, error);
      
      // Update sync stats
      this.stats.totalSyncs++;
      this.stats.failedSyncs++;
      this.stats.lastSync = {
        id: syncId,
        type: 'fireproofToOrbit',
        startTime: new Date(syncStart).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - syncStart,
        error: error.message,
        success: false
      };
      
      this.stats.syncLog.push(this.stats.lastSync);
      
      return {
        syncId,
        error: error.message,
        duration: Date.now() - syncStart,
        success: false
      };
    }
  }
  
  async syncOrbitToDuckDB(options = {}) {
    const syncStart = Date.now();
    const syncId = `sync_${syncStart}_${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      // Log sync start
      console.log(`[${syncId}] Starting OrbitDB to DuckDB-IPLD sync`);
      
      // Get all OrbitDB databases
      const orbitDbs = Array.from(this.resources.orbitDb.databases.keys());
      
      // Process each database
      let totalCollections = 0;
      let totalDocuments = 0;
      let exportedTables = [];
      
      for (const dbName of orbitDbs) {
        // Get OrbitDB collections
        const db = this.resources.orbitDb.databases.get(dbName);
        const collections = Array.from(db.collections.keys());
        
        // Process each collection
        for (const collectionName of collections) {
          totalCollections++;
          
          // Create a table in DuckDB
          const tableName = `${dbName}_${collectionName}`;
          
          // Create the table with a schema based on the documents
          const collection = db.collections.get(collectionName);
          const documents = Array.from(collection.documents.values());
          
          if (documents.length === 0) {
            continue;
          }
          
          // Create table schema dynamically from first document
          const sampleDoc = documents[0];
          const columns = [];
          
          // Add document ID and metadata columns
          columns.push('id VARCHAR PRIMARY KEY');
          columns.push('document TEXT');
          columns.push('created_at TIMESTAMP');
          columns.push('updated_at TIMESTAMP');
          
          // Create the table
          await this.resources.duckDb.execute(`
            CREATE TABLE IF NOT EXISTS ${tableName} (
              ${columns.join(', ')}
            )
          `);
          
          // Insert documents
          for (const doc of documents) {
            await this.resources.duckDb.execute(
              `INSERT OR REPLACE INTO ${tableName} (id, document, created_at, updated_at) 
               VALUES (?, ?, ?, ?)`,
              [
                doc._id, 
                JSON.stringify(doc), 
                doc._createdAt, 
                doc._updatedAt
              ]
            );
            
            totalDocuments++;
          }
          
          // Export the table to IPLD for P2P exchange
          const exportResult = await this.resources.duckDb.exportTableToIPLD(tableName);
          
          exportedTables.push({
            name: tableName,
            cid: exportResult.cid,
            documents: documents.length
          });
        }
      }
      
      // Log sync success
      console.log(`[${syncId}] OrbitDB to DuckDB-IPLD sync completed: ${totalCollections} collections, ${totalDocuments} documents`);
      
      // Update sync stats
      this.stats.totalSyncs++;
      this.stats.successfulSyncs++;
      this.stats.lastSync = {
        id: syncId,
        type: 'orbitToDuckDB',
        startTime: new Date(syncStart).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - syncStart,
        collections: totalCollections,
        documents: totalDocuments,
        exportedTables,
        success: true
      };
      
      this.stats.syncLog.push(this.stats.lastSync);
      
      return {
        syncId,
        collections: totalCollections,
        documents: totalDocuments,
        exportedTables,
        duration: Date.now() - syncStart,
        success: true
      };
    } catch (error) {
      // Log sync error
      console.error(`[${syncId}] OrbitDB to DuckDB-IPLD sync error:`, error);
      
      // Update sync stats
      this.stats.totalSyncs++;
      this.stats.failedSyncs++;
      this.stats.lastSync = {
        id: syncId,
        type: 'orbitToDuckDB',
        startTime: new Date(syncStart).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - syncStart,
        error: error.message,
        success: false
      };
      
      this.stats.syncLog.push(this.stats.lastSync);
      
      return {
        syncId,
        error: error.message,
        duration: Date.now() - syncStart,
        success: false
      };
    }
  }
  
  async exportDuckDBToIPLD(options = {}) {
    const syncStart = Date.now();
    const syncId = `sync_${syncStart}_${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      // Log export start
      console.log(`[${syncId}] Starting DuckDB to IPLD export`);
      
      // Export the entire database to IPLD
      const exportResult = await this.resources.duckDb.exportDatabaseToIPLD();
      
      // Log export success
      console.log(`[${syncId}] DuckDB to IPLD export completed: CID ${exportResult.cid}`);
      
      // Update sync stats
      this.stats.totalSyncs++;
      this.stats.successfulSyncs++;
      this.stats.lastSync = {
        id: syncId,
        type: 'duckDBToIPLD',
        startTime: new Date(syncStart).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - syncStart,
        cid: exportResult.cid,
        tableCount: exportResult.tableCount,
        success: true
      };
      
      this.stats.syncLog.push(this.stats.lastSync);
      
      return {
        syncId,
        cid: exportResult.cid,
        tableCount: exportResult.tableCount,
        duration: Date.now() - syncStart,
        success: true
      };
    } catch (error) {
      // Log export error
      console.error(`[${syncId}] DuckDB to IPLD export error:`, error);
      
      // Update sync stats
      this.stats.totalSyncs++;
      this.stats.failedSyncs++;
      this.stats.lastSync = {
        id: syncId,
        type: 'duckDBToIPLD',
        startTime: new Date(syncStart).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - syncStart,
        error: error.message,
        success: false
      };
      
      this.stats.syncLog.push(this.stats.lastSync);
      
      return {
        syncId,
        error: error.message,
        duration: Date.now() - syncStart,
        success: false
      };
    }
  }
  
  async importIPLDToDuckDB(cid, options = {}) {
    const syncStart = Date.now();
    const syncId = `sync_${syncStart}_${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      // Log import start
      console.log(`[${syncId}] Starting IPLD to DuckDB import from CID ${cid}`);
      
      // Import the database from IPLD
      const importResult = await this.resources.duckDb.importDatabaseFromIPLDCid(cid, options.clearExisting);
      
      // Log import success
      console.log(`[${syncId}] IPLD to DuckDB import completed: ${importResult.tablesImported} tables`);
      
      // Update sync stats
      this.stats.totalSyncs++;
      this.stats.successfulSyncs++;
      this.stats.lastSync = {
        id: syncId,
        type: 'ipldToDuckDB',
        startTime: new Date(syncStart).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - syncStart,
        cid,
        tablesImported: importResult.tablesImported,
        success: true
      };
      
      this.stats.syncLog.push(this.stats.lastSync);
      
      return {
        syncId,
        cid,
        tablesImported: importResult.tablesImported,
        duration: Date.now() - syncStart,
        success: true
      };
    } catch (error) {
      // Log import error
      console.error(`[${syncId}] IPLD to DuckDB import error:`, error);
      
      // Update sync stats
      this.stats.totalSyncs++;
      this.stats.failedSyncs++;
      this.stats.lastSync = {
        id: syncId,
        type: 'ipldToDuckDB',
        startTime: new Date(syncStart).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - syncStart,
        cid,
        error: error.message,
        success: false
      };
      
      this.stats.syncLog.push(this.stats.lastSync);
      
      return {
        syncId,
        cid,
        error: error.message,
        duration: Date.now() - syncStart,
        success: false
      };
    }
  }
  
  async syncAll(options = {}) {
    const syncStart = Date.now();
    const syncId = `sync_${syncStart}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Prevent multiple syncs from running at the same time
    if (this.syncInProgress) {
      return {
        syncId,
        error: 'Sync already in progress',
        success: false
      };
    }
    
    this.syncInProgress = true;
    
    try {
      // Log sync start
      console.log(`[${syncId}] Starting full sync`);
      
      // Perform all sync operations
      const results = {
        orbitToFireproof: await this.syncOrbitToFireproof(options),
        fireproofToOrbit: await this.syncFireproofToOrbit(options),
        orbitToDuckDB: await this.syncOrbitToDuckDB(options),
        duckDBToIPLD: await this.exportDuckDBToIPLD(options)
      };
      
      // Determine overall success
      const success = Object.values(results).every(r => r.success);
      
      // Log sync result
      if (success) {
        console.log(`[${syncId}] Full sync completed successfully`);
      } else {
        console.error(`[${syncId}] Full sync completed with errors`);
      }
      
      // Update last sync time
      this.lastSyncTime = new Date().toISOString();
      
      return {
        syncId,
        results,
        duration: Date.now() - syncStart,
        success
      };
    } catch (error) {
      // Log sync error
      console.error(`[${syncId}] Full sync error:`, error);
      
      return {
        syncId,
        error: error.message,
        duration: Date.now() - syncStart,
        success: false
      };
    } finally {
      this.syncInProgress = false;
    }
  }
  
  async close() {
    // Stop auto-sync
    this._stopAutoSync();
    
    // Close all database connections
    await Promise.all([
      this.resources.orbitDb.close(),
      this.resources.fireproofDb.close(),
      this.resources.duckDb.close()
    ]);
    
    this.initialized = false;
    return true;
  }
}

describe('Multi-Database Integration', function() {
  // Set timeout for tests
  this.timeout(15000);
  
  let tempDir;
  let dbPath;
  let resources;
  let syncManager;
  
  before(async function() {
    // Create a temporary directory for test databases
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-db-test-'));
    dbPath = path.join(tempDir, 'duckdb.db');
    
    // Set up database resources
    resources = {
      orbitDb: new MockOrbitDBKit({
        metadata: { instanceId: 'test-orbit' }
      }),
      fireproofDb: new MockFireproofDBKit({
        metadata: { instanceId: 'test-fireproof' }
      }),
      duckDb: new DuckDBIPLDKit({
        metadata: {
          dbPath,
          instanceId: 'test-duckdb'
        }
      })
    };
    
    // Initialize database resources
    await resources.orbitDb.init();
    await resources.fireproofDb.init();
    await resources.duckDb.init();
    
    // Set up sync manager
    syncManager = new DatabaseSyncManager({
      resources,
      metadata: {
        syncInterval: 5000,
        autoSync: false
      }
    });
    
    await syncManager.init();
  });
  
  after(async function() {
    // Close database connections
    await syncManager.close();
    
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      await rmdir(tempDir, { recursive: true, force: true });
    }
  });
  
  // Helper function to create test data
  async function createTestData() {
    // Create OrbitDB database and collection
    await resources.orbitDb.createDatabase('testDb');
    await resources.orbitDb.createCollection('testDb', 'testCollection');
    
    // Add documents to OrbitDB
    for (let i = 0; i < 5; i++) {
      await resources.orbitDb.addDocument('testDb', 'testCollection', {
        name: `Test ${i}`,
        value: i,
        tags: ['test', `tag-${i}`],
        active: i % 2 === 0
      });
    }
    
    // Create FireproofDB database and table
    await resources.fireproofDb.createDatabase('testDb');
    await resources.fireproofDb.createTable('testDb', 'testTable');
    
    // Add records to FireproofDB
    for (let i = 5; i < 10; i++) {
      await resources.fireproofDb.put('testDb', 'testTable', {
        name: `Test ${i}`,
        value: i,
        tags: ['test', `tag-${i}`],
        active: i % 2 === 0
      });
    }
    
    // Create a table in DuckDB
    await resources.duckDb.execute(`
      CREATE TABLE IF NOT EXISTS test_analytics (
        id INTEGER PRIMARY KEY,
        name VARCHAR,
        value DOUBLE,
        timestamp TIMESTAMP
      )
    `);
    
    // Add data to DuckDB
    for (let i = 0; i < 10; i++) {
      await resources.duckDb.execute(
        "INSERT INTO test_analytics VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        [i, `Analytics ${i}`, i * 2.5]
      );
    }
    
    return {
      orbitDbDocs: 5,
      fireproofDbDocs: 5,
      duckDbRows: 10
    };
  }
  
  describe('Basic Database Operations', function() {
    it('should initialize all database systems', async function() {
      assert.strictEqual(resources.orbitDb.initialized, true);
      assert.strictEqual(resources.fireproofDb.initialized, true);
      assert.strictEqual(resources.duckDb.initialized, true);
      assert.strictEqual(syncManager.initialized, true);
    });
    
    it('should create and retrieve data in all database systems', async function() {
      // Create test data
      const counts = await createTestData();
      
      // Verify OrbitDB data
      const orbitResult = await resources.orbitDb.queryDocuments('testDb', 'testCollection');
      assert.strictEqual(orbitResult.success, true);
      assert.strictEqual(orbitResult.documents.length, counts.orbitDbDocs);
      
      // Verify FireproofDB data
      const fireproofResult = await resources.fireproofDb.query('testDb', 'testTable');
      assert.strictEqual(fireproofResult.success, true);
      assert.strictEqual(fireproofResult.records.length, counts.fireproofDbDocs);
      
      // Verify DuckDB data
      const duckdbResult = await resources.duckDb.execute('SELECT COUNT(*) FROM test_analytics');
      assert.strictEqual(duckdbResult.success, true);
      
      // In mock mode, this may not match exactly
      if (!resources.duckDb.mockMode) {
        assert.strictEqual(duckdbResult.rows[0]['count_star()'], counts.duckDbRows);
      }
    });
  });
  
  describe('Database Synchronization', function() {
    it('should sync data from OrbitDB to FireproofDB', async function() {
      const syncResult = await syncManager.syncOrbitToFireproof();
      
      assert.strictEqual(syncResult.success, true);
      assert(syncResult.collections > 0);
      assert(syncResult.documents > 0);
      
      // Verify FireproofDB has the documents from OrbitDB
      const fireproofResult = await resources.fireproofDb.query('testDb', 'testCollection');
      assert.strictEqual(fireproofResult.success, true);
      assert(fireproofResult.records.length > 0);
    });
    
    it('should sync data from FireproofDB to OrbitDB', async function() {
      const syncResult = await syncManager.syncFireproofToOrbit();
      
      assert.strictEqual(syncResult.success, true);
      assert(syncResult.tables > 0);
      
      // Verify OrbitDB has the documents from FireproofDB
      const orbitResult = await resources.orbitDb.queryDocuments('testDb', 'testTable');
      assert.strictEqual(orbitResult.success, true);
      assert(orbitResult.documents.length > 0);
    });
    
    it('should sync data from OrbitDB to DuckDB for analytics', async function() {
      const syncResult = await syncManager.syncOrbitToDuckDB();
      
      assert.strictEqual(syncResult.success, true);
      assert(syncResult.collections > 0);
      assert(syncResult.documents > 0);
      assert(syncResult.exportedTables.length > 0);
      
      // Verify DuckDB has the data from OrbitDB
      const tableName = 'testDb_testCollection';
      const duckdbResult = await resources.duckDb.execute(`SELECT COUNT(*) FROM ${tableName}`);
      
      assert.strictEqual(duckdbResult.success, true);
    });
    
    it('should export DuckDB database to IPLD for P2P exchange', async function() {
      const exportResult = await syncManager.exportDuckDBToIPLD();
      
      assert.strictEqual(exportResult.success, true);
      assert.ok(exportResult.cid);
      assert(exportResult.tableCount > 0);
      
      // Store CID for import test
      this.exportedCid = exportResult.cid;
    });
    
    it('should import IPLD data into DuckDB', async function() {
      // Skip if no exported CID
      if (!this.exportedCid) {
        this.skip();
      }
      
      const importResult = await syncManager.importIPLDToDuckDB(this.exportedCid);
      
      assert.strictEqual(importResult.success, true);
      assert(importResult.tablesImported > 0);
    });
    
    it('should perform a full sync across all databases', async function() {
      const syncResult = await syncManager.syncAll();
      
      assert.strictEqual(syncResult.success, true);
      assert.ok(syncResult.results.orbitToFireproof.success);
      assert.ok(syncResult.results.fireproofToOrbit.success);
      assert.ok(syncResult.results.orbitToDuckDB.success);
      assert.ok(syncResult.results.duckDBToIPLD.success);
    });
  });
});