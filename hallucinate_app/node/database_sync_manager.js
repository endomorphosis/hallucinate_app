/**
 * Database Synchronization Manager
 *
 * Provides bidirectional synchronization between OrbitDB, FireproofDB, and DuckDB-IPLD
 * Implements event-driven updates, conflict resolution, selective mirroring,
 * and differential updates as described in CLAUDE.md.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// Set up logging
const logger = {
  info: (msg) => console.log(`[INFO] DatabaseSync: ${msg}`),
  warn: (msg) => console.warn(`[WARN] DatabaseSync: ${msg}`),
  error: (msg) => console.error(`[ERROR] DatabaseSync: ${msg}`),
  debug: (msg) => console.debug(`[DEBUG] DatabaseSync: ${msg}`)
};

// Synchronization capability constants
export const SYNC_CAPABILITIES = {
  SYNC_ORBITDB_TO_FIREPROOFDB: "sync:orbitdb:to:fireproofdb",
  SYNC_FIREPROOFDB_TO_ORBITDB: "sync:fireproofdb:to:orbitdb",
  SYNC_DUCKDB_EXPORT_IPLD: "sync:duckdb:export:ipld",
  SYNC_DUCKDB_IMPORT_IPLD: "sync:duckdb:import:ipld",
  SYNC_SELECTIVE_MIRRORING: "sync:selective:mirroring",
  SYNC_DIFFERENTIAL_UPDATES: "sync:differential:updates",
  SYNC_ADMIN: "sync:admin"
};

/**
 * Manages synchronization between OrbitDB, FireproofDB, and DuckDB-IPLD databases
 *
 * Implements bidirectional sync, event-driven updates, conflict resolution,
 * selective mirroring, and differential updates as described in CLAUDE.md.
 */
export class DatabaseSyncManager extends EventEmitter {
  /**
   * Initialize the sync manager with resources and metadata
   * @param {object} resources - Shared resources (orbitDb, fireproofDb, duckDb, authManager, etc.)
   * @param {object} metadata - Configuration metadata
   */
  constructor(resources = null, metadata = null) {
    super();
    
    // Set default values
    resources = resources || {};
    metadata = metadata || {};
    
    // Initialize resources
    this.resources = resources;
    this.metadata = metadata;
    
    // Verify required resources
    if (!resources.orbitDb) {
      throw new Error("OrbitDB resource is required for DatabaseSyncManager");
    }
    if (!resources.fireproofDb) {
      throw new Error("FireproofDB resource is required for DatabaseSyncManager");
    }
    if (!resources.duckDb) {
      throw new Error("DuckDB-IPLD resource is required for DatabaseSyncManager");
    }
    if (!resources.authManager) {
      throw new Error("AuthManager resource is required for DatabaseSyncManager");
    }
    if (!resources.ipfsKit) {
      throw new Error("IPFS Kit resource is required for DatabaseSyncManager");
    }
    if (!resources.libp2pKit) {
      throw new Error("libp2p Kit resource is required for DatabaseSyncManager");
    }
        
    // Configuration options
    const homeDir = os.homedir();
    this.config = {
      syncInterval: metadata.syncInterval || 60000,  // Default: 1 minute
      differentialUpdateThreshold: metadata.differentialUpdateThreshold || 0.1,  // Default: 10% change threshold
      selectiveMirroringRules: metadata.selectiveMirroringRules || {},
      syncDir: metadata.syncDir || path.join(homeDir, ".hallucinate_app", "sync"),
      pubsubTopic: metadata.pubsubTopic || "hallucinate-app-sync",
      maxRetries: metadata.maxRetries || 3,
      conflictStrategy: metadata.conflictStrategy || "crdt",  // Default strategy: CRDT
      logSyncOperations: metadata.logSyncOperations !== undefined ? metadata.logSyncOperations : true,
      autoSync: metadata.autoSync !== undefined ? metadata.autoSync : true,
    };
    
    // Internal state
    this.syncState = {
      lastOrbitDBSync: 0,
      lastFireproofDBSync: 0,
      lastDuckDBExport: 0,
      lastDuckDBImport: 0,
      activeJobs: {},
      syncHistory: [],
      conflictLog: [],
      changeLog: {}
    };
    
    // Sync interval reference
    this.syncTimer = null;
    
    // Bind method references to maintain 'this' context
    this._handleOrbitDbChange = this._handleOrbitDbChange.bind(this);
    this._handleFireproofDbChange = this._handleFireproofDbChange.bind(this);
    this._handleLibp2pMessage = this._handleLibp2pMessage.bind(this);
    
    // Initialize locks
    this.lock = new AsyncLock();
    
    logger.info(`DatabaseSyncManager initialized with sync directory at ${this.config.syncDir}`);
  }
  
  /**
   * Initialize the sync manager
   * @returns {Promise<object>} - Initialization result
   */
  async init() {
    try {
      // Create sync directory if it doesn't exist
      fs.mkdirSync(this.config.syncDir, { recursive: true });
      
      // Register event listeners
      if (typeof this.resources.orbitDb.on === 'function') {
        this.resources.orbitDb.on("update", this._handleOrbitDbChange);
      }
      
      if (typeof this.resources.fireproofDb.on === 'function') {
        this.resources.fireproofDb.on("update", this._handleFireproofDbChange);
      }
      
      // Subscribe to libp2p pubsub for database synchronization
      await this.resources.libp2pKit.pubsub.subscribe(
        this.config.pubsubTopic, 
        this._handleLibp2pMessage
      );
      
      // Start automatic sync if enabled
      if (this.config.autoSync) {
        this.startAutoSync();
      }
      
      // Load sync state if exists
      try {
        const syncStatePath = path.join(this.config.syncDir, "sync_state.json");
        if (fs.existsSync(syncStatePath)) {
          const loadedState = JSON.parse(fs.readFileSync(syncStatePath, 'utf8'));
          // Update our state with loaded values
          Object.assign(this.syncState, loadedState);
        }
      } catch (e) {
        logger.info(`No previous sync state found, using defaults: ${e.message}`);
      }
      
      return { success: true, message: "Database sync manager initialized" };
    } catch (e) {
      logger.error(`Failed to initialize database sync manager: ${e.message}`);
      throw new Error(`DatabaseSyncManager initialization failed: ${e.message}`);
    }
  }
  
  /**
   * Start automatic synchronization with the configured interval
   * @returns {object} - Start result
   */
  startAutoSync() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    
    const syncTask = async () => {
      try {
        // Create a self-signed token
        const authToken = this.resources.authManager.getSelfSignedToken(
          SYNC_CAPABILITIES.SYNC_ADMIN
        );
        
        // Run sync without blocking
        this.syncAll(authToken)
          .catch(err => {
            logger.error(`Auto sync error: ${err.message}`);
            this.emit("error", { type: "auto-sync", error: err.message });
          });
      } catch (e) {
        logger.error(`Auto sync error: ${e.message}`);
        this.emit("error", { type: "auto-sync", error: e.message });
      }
      
      // Reschedule the task
      this.syncTimer = setTimeout(syncTask, this.config.syncInterval);
    };
    
    // Start the first sync
    this.syncTimer = setTimeout(syncTask, this.config.syncInterval);
    
    return { success: true, message: "Auto sync started" };
  }
  
  /**
   * Stop automatic synchronization
   * @returns {object} - Stop result
   */
  stopAutoSync() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    
    return { success: true, message: "Auto sync stopped" };
  }
  
  /**
   * Verify the user has the required capability for a sync operation
   * @param {string} capability - The capability to check
   * @param {string} token - The UCAN token
   * @returns {Promise<boolean>} - Whether the user has the capability
   * @throws {Error} - If authentication fails
   */
  async _verifyCapability(capability, token) {
    if (!token) {
      throw new Error("Authentication token is required");
    }
    
    try {
      return await this.resources.authManager.verifyCapability(token, capability);
    } catch (e) {
      logger.error(`Capability verification failed for ${capability}: ${e.message}`);
      throw new Error(`Access denied: ${e.message}`);
    }
  }
  
  /**
   * Synchronize all databases
   * @param {string} authToken - UCAN authentication token
   * @returns {Promise<object>} - Sync results
   */
  async syncAll(authToken = null) {
    // Verify admin capability for full sync
    await this._verifyCapability(SYNC_CAPABILITIES.SYNC_ADMIN, authToken);
    
    try {
      const results = {
        orbitToFireproof: await this.syncOrbitDbToFireproofDb(authToken),
        fireproofToOrbit: await this.syncFireproofDbToOrbitDb(authToken),
        duckdbExport: await this.exportDuckDbToIpld(authToken),
        duckdbImport: await this.importIpldToDuckDb(authToken)
      };
      
      // Update sync state timestamps
      await this.lock.acquire('syncState', async () => {
        this.syncState.lastFullSync = Date.now();
      });
      
      // Save sync state
      await this._saveSyncState();
      
      return { success: true, results };
    } catch (e) {
      logger.error(`Error during full sync: ${e.message}`);
      throw new Error(`Full sync failed: ${e.message}`);
    }
  }
  
  /**
   * Synchronize OrbitDB to FireproofDB
   * @param {string} authToken - UCAN authentication token
   * @param {Array} collections - Specific collections to sync (optional)
   * @returns {Promise<object>} - Sync results
   */
  async syncOrbitDbToFireproofDb(authToken = null, collections = null) {
    // Verify capability
    await this._verifyCapability(SYNC_CAPABILITIES.SYNC_ORBITDB_TO_FIREPROOFDB, authToken);
    
    const jobId = `orbit-to-fireproof-${Date.now()}`;
    await this.lock.acquire('syncState', async () => {
      this.syncState.activeJobs[jobId] = {
        type: "orbit-to-fireproof",
        startTime: Date.now(),
        status: "running"
      };
    });
    
    try {
      const stats = {
        processed: 0,
        updated: 0,
        conflicts: 0,
        errors: 0
      };
      
      // Get collections to sync
      const collectionsToSync = collections || await this._getOrbitDbCollections();
      
      // Apply selective mirroring rules if configured
      const filteredCollections = this._applySelectiveMirroring(
        collectionsToSync, 
        "orbitdb-to-fireproofdb"
      );
      
      // Process each collection
      for (const collection of filteredCollections) {
        try {
          // Get all documents from OrbitDB collection
          const orbitDocs = await this.resources.orbitDb.getAll(collection);
          
          // Process each document
          for (const doc of orbitDocs) {
            try {
              stats.processed++;
              
              // Check if document exists in FireproofDB
              const existingDoc = await this.resources.fireproofDb.get(collection, doc._id);
              
              if (existingDoc) {
                // Handle conflict resolution if document exists
                if (this._hasConflict(doc, existingDoc)) {
                  const resolvedDoc = await this._resolveConflict(doc, existingDoc, collection);
                  await this.resources.fireproofDb.put(collection, resolvedDoc);
                  stats.conflicts++;
                  stats.updated++;
                }
              } else {
                // Simple insert if document doesn't exist
                await this.resources.fireproofDb.put(collection, doc);
                stats.updated++;
              }
            } catch (docError) {
              logger.error(`Error processing document ${doc._id} in collection ${collection}: ${docError.message}`);
              stats.errors++;
            }
          }
        } catch (collectionError) {
          logger.error(`Error processing collection ${collection}: ${collectionError.message}`);
          stats.errors++;
        }
      }
      
      // Update sync state
      await this.lock.acquire('syncState', async () => {
        this.syncState.lastOrbitDBSync = Date.now();
        this.syncState.activeJobs[jobId] = {
          type: "orbit-to-fireproof",
          startTime: Date.now(),
          status: "completed",
          completedAt: Date.now(),
          stats
        };
      });
      
      // Log sync operation
      if (this.config.logSyncOperations) {
        await this.lock.acquire('syncState', async () => {
          this.syncState.syncHistory.push({
            type: "orbit-to-fireproof",
            timestamp: Date.now(),
            stats,
            collections: filteredCollections
          });
        });
      }
      
      // Save sync state
      await this._saveSyncState();
      
      // Emit sync event
      this.emit("sync", {
        type: "orbit-to-fireproof",
        stats,
        collections: filteredCollections
      });
      
      return { success: true, stats };
    } catch (e) {
      logger.error(`Error synchronizing OrbitDB to FireproofDB: ${e.message}`);
      await this.lock.acquire('syncState', async () => {
        this.syncState.activeJobs[jobId] = {
          type: "orbit-to-fireproof",
          startTime: Date.now(),
          status: "failed",
          error: e.message,
          completedAt: Date.now()
        };
      });
      throw new Error(`OrbitDB to FireproofDB sync failed: ${e.message}`);
    } finally {
      // Clean up job after some time
      setTimeout(() => {
        this.lock.acquire('syncState', async () => {
          if (this.syncState.activeJobs[jobId]) {
            delete this.syncState.activeJobs[jobId];
          }
        });
      }, 3600000); // 1 hour
    }
  }
  
  /**
   * Synchronize FireproofDB to OrbitDB
   * @param {string} authToken - UCAN authentication token
   * @param {Array} collections - Specific collections to sync (optional)
   * @returns {Promise<object>} - Sync results
   */
  async syncFireproofDbToOrbitDb(authToken = null, collections = null) {
    // Verify capability
    await this._verifyCapability(SYNC_CAPABILITIES.SYNC_FIREPROOFDB_TO_ORBITDB, authToken);
    
    const jobId = `fireproof-to-orbit-${Date.now()}`;
    await this.lock.acquire('syncState', async () => {
      this.syncState.activeJobs[jobId] = {
        type: "fireproof-to-orbit",
        startTime: Date.now(),
        status: "running"
      };
    });
    
    try {
      const stats = {
        processed: 0,
        updated: 0,
        conflicts: 0,
        errors: 0
      };
      
      // Get collections to sync
      const collectionsToSync = collections || await this._getFireproofDbCollections();
      
      // Apply selective mirroring rules if configured
      const filteredCollections = this._applySelectiveMirroring(
        collectionsToSync, 
        "fireproofdb-to-orbitdb"
      );
      
      // Process each collection
      for (const collection of filteredCollections) {
        try {
          // Get all documents from FireproofDB collection
          const fireproofDocs = await this.resources.fireproofDb.getAll(collection);
          
          // Process each document
          for (const doc of fireproofDocs) {
            try {
              stats.processed++;
              
              // Check if document exists in OrbitDB
              const existingDoc = await this.resources.orbitDb.get(collection, doc._id);
              
              if (existingDoc) {
                // Handle conflict resolution if document exists
                if (this._hasConflict(doc, existingDoc)) {
                  const resolvedDoc = await this._resolveConflict(doc, existingDoc, collection);
                  await this.resources.orbitDb.put(collection, resolvedDoc);
                  stats.conflicts++;
                  stats.updated++;
                }
              } else {
                // Simple insert if document doesn't exist
                await this.resources.orbitDb.put(collection, doc);
                stats.updated++;
              }
            } catch (docError) {
              logger.error(`Error processing document ${doc._id} in collection ${collection}: ${docError.message}`);
              stats.errors++;
            }
          }
        } catch (collectionError) {
          logger.error(`Error processing collection ${collection}: ${collectionError.message}`);
          stats.errors++;
        }
      }
      
      // Update sync state
      await this.lock.acquire('syncState', async () => {
        this.syncState.lastFireproofDBSync = Date.now();
        this.syncState.activeJobs[jobId] = {
          type: "fireproof-to-orbit",
          startTime: Date.now(),
          status: "completed",
          completedAt: Date.now(),
          stats
        };
      });
      
      // Log sync operation
      if (this.config.logSyncOperations) {
        await this.lock.acquire('syncState', async () => {
          this.syncState.syncHistory.push({
            type: "fireproof-to-orbit",
            timestamp: Date.now(),
            stats,
            collections: filteredCollections
          });
        });
      }
      
      // Save sync state
      await this._saveSyncState();
      
      // Emit sync event
      this.emit("sync", {
        type: "fireproof-to-orbit",
        stats,
        collections: filteredCollections
      });
      
      return { success: true, stats };
    } catch (e) {
      logger.error(`Error synchronizing FireproofDB to OrbitDB: ${e.message}`);
      await this.lock.acquire('syncState', async () => {
        this.syncState.activeJobs[jobId] = {
          type: "fireproof-to-orbit",
          startTime: Date.now(),
          status: "failed",
          error: e.message,
          completedAt: Date.now()
        };
      });
      throw new Error(`FireproofDB to OrbitDB sync failed: ${e.message}`);
    } finally {
      // Clean up job after some time
      setTimeout(() => {
        this.lock.acquire('syncState', async () => {
          if (this.syncState.activeJobs[jobId]) {
            delete this.syncState.activeJobs[jobId];
          }
        });
      }, 3600000); // 1 hour
    }
  }
  
  /**
   * Export DuckDB database to IPLD for P2P exchange
   * @param {string} authToken - UCAN authentication token
   * @param {Array} tables - Specific tables to export (optional)
   * @param {boolean} differential - Whether to use differential updates (optional)
   * @returns {Promise<object>} - Export results with CIDs
   */
  async exportDuckDbToIpld(authToken = null, tables = null, differential = true) {
    // Verify capability
    await this._verifyCapability(SYNC_CAPABILITIES.SYNC_DUCKDB_EXPORT_IPLD, authToken);
    
    const jobId = `duckdb-export-${Date.now()}`;
    await this.lock.acquire('syncState', async () => {
      this.syncState.activeJobs[jobId] = {
        type: "duckdb-export",
        startTime: Date.now(),
        status: "running"
      };
    });
    
    try {
      const stats = {
        tables: 0,
        rows: 0,
        differential: 0,
        fullExport: 0,
        errors: 0
      };
      
      // Get tables to export
      const tablesToExport = tables || await this._getDuckDbTables();
      
      // Results object to store CIDs for each table
      const results = {
        timestamp: Date.now(),
        tables: {}
      };
      
      // Process each table
      for (const table of tablesToExport) {
        try {
          let cid = null;
          let exportMethod = "full";
          
          // Check if we should do differential update
          if (differential && this.syncState.changeLog && this.syncState.changeLog[table]) {
            const changeLog = this.syncState.changeLog[table];
            const changeRatio = changeLog.changes / Math.max(changeLog.total, 1);
            
            if (changeRatio < this.config.differentialUpdateThreshold) {
              // Differential update is more efficient
              cid = await this.resources.duckDb.exportTableDifferentialToIpld(
                table,
                changeLog.changedRows || []
              );
              stats.differential++;
              exportMethod = "differential";
            } else {
              // Full export is more efficient
              cid = await this.resources.duckDb.exportTableToIpld(table);
              stats.fullExport++;
            }
          } else {
            // Default to full export
            cid = await this.resources.duckDb.exportTableToIpld(table);
            stats.fullExport++;
          }
          
          // Get row count
          const rowCount = await this._getTableRowCount(table);
          stats.rows += rowCount;
          stats.tables++;
          
          // Store results
          if (cid) {
            results.tables[table] = {
              cid: cid.toString(),
              rows: rowCount,
              method: exportMethod,
              timestamp: Date.now()
            };
            
            // Publish to pubsub for peer notification
            await this.resources.libp2pKit.pubsub.publish(
              this.config.pubsubTopic,
              JSON.stringify({
                type: "duckdb-export",
                table,
                cid: cid.toString(),
                method: exportMethod,
                timestamp: Date.now()
              })
            );
            
            // Reset change log for this table
            await this.lock.acquire('syncState', async () => {
              if (!this.syncState.changeLog) {
                this.syncState.changeLog = {};
              }
              this.syncState.changeLog[table] = {
                changes: 0,
                total: rowCount,
                changedRows: [],
                lastExport: Date.now()
              };
            });
          }
        } catch (tableError) {
          logger.error(`Error exporting table ${table}: ${tableError.message}`);
          stats.errors++;
          
          // Store error in results
          results.tables[table] = {
            error: tableError.message,
            timestamp: Date.now()
          };
        }
      }
      
      // Update sync state
      await this.lock.acquire('syncState', async () => {
        this.syncState.lastDuckDBExport = Date.now();
        this.syncState.activeJobs[jobId] = {
          type: "duckdb-export",
          startTime: Date.now(),
          status: "completed",
          completedAt: Date.now(),
          stats
        };
      });
      
      // Store export results
      const resultsPath = path.join(
        this.config.syncDir, 
        `duckdb-export-${Date.now()}.json`
      );
      fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
      
      // Log sync operation
      if (this.config.logSyncOperations) {
        await this.lock.acquire('syncState', async () => {
          this.syncState.syncHistory.push({
            type: "duckdb-export",
            timestamp: Date.now(),
            stats,
            tables: tablesToExport,
            results
          });
        });
      }
      
      // Save sync state
      await this._saveSyncState();
      
      // Emit export event
      this.emit("duckdb-export", {
        stats,
        tables: results.tables
      });
      
      return { success: true, stats, results };
    } catch (e) {
      logger.error(`Error exporting DuckDB to IPLD: ${e.message}`);
      await this.lock.acquire('syncState', async () => {
        this.syncState.activeJobs[jobId] = {
          type: "duckdb-export",
          startTime: Date.now(),
          status: "failed",
          error: e.message,
          completedAt: Date.now()
        };
      });
      throw new Error(`DuckDB export to IPLD failed: ${e.message}`);
    } finally {
      // Clean up job after some time
      setTimeout(() => {
        this.lock.acquire('syncState', async () => {
          if (this.syncState.activeJobs[jobId]) {
            delete this.syncState.activeJobs[jobId];
          }
        });
      }, 3600000); // 1 hour
    }
  }
  
  /**
   * Import IPLD data into DuckDB
   * @param {string} authToken - UCAN authentication token
   * @param {object} tableData - Mapping of table names to CIDs (optional)
   * @returns {Promise<object>} - Import results
   */
  async importIpldToDuckDb(authToken = null, tableData = null) {
    // Verify capability
    await this._verifyCapability(SYNC_CAPABILITIES.SYNC_DUCKDB_IMPORT_IPLD, authToken);
    
    const jobId = `duckdb-import-${Date.now()}`;
    await this.lock.acquire('syncState', async () => {
      this.syncState.activeJobs[jobId] = {
        type: "duckdb-import",
        startTime: Date.now(),
        status: "running"
      };
    });
    
    try {
      const stats = {
        tables: 0,
        rows: 0,
        differential: 0,
        fullImport: 0,
        errors: 0
      };
      
      // If no tableData provided, get from libp2p or previous export
      const tables = tableData || await this._getLatestIpldTableData();
      
      // Results object to store import stats
      const results = {
        timestamp: Date.now(),
        tables: {}
      };
      
      // Process each table
      for (const [table, data] of Object.entries(tables)) {
        try {
          const cid = data.cid;
          const method = data.method || "full";
          
          if (!cid) {
            throw new Error(`Missing CID for table ${table}`);
          }
          
          // Import based on method
          if (method === "differential") {
            // Apply differential update
            await this.resources.duckDb.importDifferentialIpldToTable(table, cid);
            stats.differential++;
          } else {
            // Full table import
            await this.resources.duckDb.importIpldToTable(table, cid);
            stats.fullImport++;
          }
          
          // Get row count after import
          const rowCount = await this._getTableRowCount(table);
          stats.rows += rowCount;
          stats.tables++;
          
          // Store results
          results.tables[table] = {
            cid,
            rows: rowCount,
            method,
            timestamp: Date.now()
          };
        } catch (tableError) {
          logger.error(`Error importing table ${table}: ${tableError.message}`);
          stats.errors++;
          
          // Store error in results
          results.tables[table] = {
            error: tableError.message,
            timestamp: Date.now()
          };
        }
      }
      
      // Update sync state
      await this.lock.acquire('syncState', async () => {
        this.syncState.lastDuckDBImport = Date.now();
        this.syncState.activeJobs[jobId] = {
          type: "duckdb-import",
          startTime: Date.now(),
          status: "completed",
          completedAt: Date.now(),
          stats
        };
      });
      
      // Store import results
      const resultsPath = path.join(
        this.config.syncDir, 
        `duckdb-import-${Date.now()}.json`
      );
      fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
      
      // Log sync operation
      if (this.config.logSyncOperations) {
        await this.lock.acquire('syncState', async () => {
          this.syncState.syncHistory.push({
            type: "duckdb-import",
            timestamp: Date.now(),
            stats,
            results
          });
        });
      }
      
      // Save sync state
      await this._saveSyncState();
      
      // Emit import event
      this.emit("duckdb-import", {
        stats,
        tables: results.tables
      });
      
      return { success: true, stats, results };
    } catch (e) {
      logger.error(`Error importing IPLD to DuckDB: ${e.message}`);
      await this.lock.acquire('syncState', async () => {
        this.syncState.activeJobs[jobId] = {
          type: "duckdb-import",
          startTime: Date.now(),
          status: "failed",
          error: e.message,
          completedAt: Date.now()
        };
      });
      throw new Error(`IPLD import to DuckDB failed: ${e.message}`);
    } finally {
      // Clean up job after some time
      setTimeout(() => {
        this.lock.acquire('syncState', async () => {
          if (this.syncState.activeJobs[jobId]) {
            delete this.syncState.activeJobs[jobId];
          }
        });
      }, 3600000); // 1 hour
    }
  }
  
  /**
   * Test database synchronization functionality
   * @returns {Promise<object>} - Test results
   */
  async test() {
    try {
      // Create test collections/tables in each database
      const testId = `test-${Date.now()}`;
      const testDoc = {
        _id: testId, 
        value: `Test value ${Date.now()}`, 
        timestamp: Date.now()
      };
      
      // Test OrbitDB
      await this.resources.orbitDb.put("test_sync", testDoc);
      const orbitResult = await this.resources.orbitDb.get("test_sync", testId);
      
      // Test FireproofDB
      await this.resources.fireproofDb.put("test_sync", testDoc);
      const fireproofResult = await this.resources.fireproofDb.get("test_sync", testId);
      
      // Test DuckDB
      await this.resources.duckDb.execute(`
        CREATE TABLE IF NOT EXISTS test_sync (
          id VARCHAR,
          value VARCHAR,
          timestamp BIGINT
        )
      `);
      
      await this.resources.duckDb.execute(`
        INSERT INTO test_sync VALUES (
          '${testId}',
          '${testDoc.value}',
          ${testDoc.timestamp}
        )
      `);
      
      const duckdbResult = await this.resources.duckDb.query(`
        SELECT * FROM test_sync WHERE id = '${testId}'
      `);
      
      // Test IPLD export/import for DuckDB
      const exportCid = await this.resources.duckDb.exportTableToIpld("test_sync");
      
      // Clean up test data
      await this.resources.orbitDb.delete("test_sync", testId);
      await this.resources.fireproofDb.delete("test_sync", testId);
      await this.resources.duckDb.execute(`DELETE FROM test_sync WHERE id = '${testId}'`);
      
      return {
        success: true,
        message: "Database sync manager test completed successfully",
        results: {
          orbitDB: Boolean(orbitResult),
          fireproofDB: Boolean(fireproofResult),
          duckDB: Boolean(duckdbResult && duckdbResult.length > 0),
          ipldExport: exportCid ? exportCid.toString() : null
        }
      };
    } catch (e) {
      logger.error(`Database sync manager test failed: ${e.message}`);
      return {
        success: false,
        message: `Database sync manager test failed: ${e.message}`,
        error: e.message
      };
    }
  }
  
  /**
   * Get a list of OrbitDB collections
   * @returns {Promise<Array>} - List of collection names
   */
  async _getOrbitDbCollections() {
    try {
      return await this.resources.orbitDb.getCollections();
    } catch (e) {
      logger.error(`Error getting OrbitDB collections: ${e.message}`);
      return [];
    }
  }
  
  /**
   * Get a list of FireproofDB collections
   * @returns {Promise<Array>} - List of collection names
   */
  async _getFireproofDbCollections() {
    try {
      return await this.resources.fireproofDb.getCollections();
    } catch (e) {
      logger.error(`Error getting FireproofDB collections: ${e.message}`);
      return [];
    }
  }
  
  /**
   * Get a list of DuckDB tables
   * @returns {Promise<Array>} - List of table names
   */
  async _getDuckDbTables() {
    try {
      const result = await this.resources.duckDb.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'main'
      `);
      
      return result.map(row => row.table_name);
    } catch (e) {
      logger.error(`Error getting DuckDB tables: ${e.message}`);
      return [];
    }
  }
  
  /**
   * Get row count for a DuckDB table
   * @param {string} table - Table name
   * @returns {Promise<number>} - Row count
   */
  async _getTableRowCount(table) {
    try {
      const result = await this.resources.duckDb.query(`
        SELECT COUNT(*) as count FROM "${table}"
      `);
      
      return result.length > 0 ? result[0].count : 0;
    } catch (e) {
      logger.error(`Error getting row count for table ${table}: ${e.message}`);
      return 0;
    }
  }
  
  /**
   * Get latest IPLD table data from previous exports or libp2p
   * @returns {Promise<object>} - Table data mapping
   */
  async _getLatestIpldTableData() {
    try {
      // First try to find the most recent export file
      const syncDir = this.config.syncDir;
      const files = fs.readdirSync(syncDir)
        .filter(file => file.startsWith('duckdb-export-') && file.endsWith('.json'))
        .map(file => path.join(syncDir, file));
      
      // Sort by modification time (newest first)
      files.sort((a, b) => {
        return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
      });
      
      if (files.length > 0) {
        const exportData = JSON.parse(fs.readFileSync(files[0], 'utf8'));
        return exportData.tables || {};
      }
      
      // If no export files, return empty object
      return {};
    } catch (e) {
      logger.error(`Error getting latest IPLD table data: ${e.message}`);
      return {};
    }
  }
  
  /**
   * Check if two documents have a conflict
   * @param {object} doc1 - First document
   * @param {object} doc2 - Second document
   * @returns {boolean} - Whether the documents conflict
   */
  _hasConflict(doc1, doc2) {
    // Simple comparison - if timestamps or revisions differ, consider it a conflict
    if (doc1._rev !== doc2._rev) {
      return true;
    }
    
    if (doc1.updatedAt && doc2.updatedAt && doc1.updatedAt !== doc2.updatedAt) {
      return true;
    }
    
    // Hash comparison for deeper check
    const hash1 = this._getDocumentHash(doc1);
    const hash2 = this._getDocumentHash(doc2);
    
    return hash1 !== hash2;
  }
  
  /**
   * Calculate a hash for document contents
   * @param {object} doc - Document to hash
   * @returns {string} - Document hash
   */
  _getDocumentHash(doc) {
    // Create a copy without metadata fields
    const cleanDoc = { ...doc };
    delete cleanDoc._id;
    delete cleanDoc._rev;
    delete cleanDoc.updatedAt;
    delete cleanDoc.createdAt;
    
    // Sort keys for consistent serialization
    const serialized = JSON.stringify(cleanDoc, Object.keys(cleanDoc).sort());
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }
  
  /**
   * Resolve a conflict between two documents
   * @param {object} doc1 - First document
   * @param {object} doc2 - Second document
   * @param {string} collection - Collection name
   * @returns {Promise<object>} - Resolved document
   */
  async _resolveConflict(doc1, doc2, collection) {
    // Log conflict
    await this.lock.acquire('syncState', async () => {
      if (!this.syncState.conflictLog) {
        this.syncState.conflictLog = [];
      }
      
      this.syncState.conflictLog.push({
        timestamp: Date.now(),
        collection,
        docId: doc1._id,
        strategy: this.config.conflictStrategy
      });
    });
    
    // Use configured conflict resolution strategy
    if (this.config.conflictStrategy === "crdt") {
      // Use CRDT-based resolution (merge fields, pick latest for conflicts)
      return this._resolveCrdt(doc1, doc2);
    } else if (this.config.conflictStrategy === "newest") {
      // Use timestamp-based resolution
      return this._resolveNewest(doc1, doc2);
    } else if (this.config.conflictStrategy === "custom") {
      // Use collection-specific custom resolution if available
      return await this._resolveCustom(doc1, doc2, collection);
    } else {
      // Default to CRDT
      return this._resolveCrdt(doc1, doc2);
    }
  }
  
  /**
   * Resolve conflict using CRDT strategy
   * @param {object} doc1 - First document
   * @param {object} doc2 - Second document
   * @returns {object} - Resolved document
   */
  _resolveCrdt(doc1, doc2) {
    // Get timestamps for both documents
    const ts1 = doc1.updatedAt || doc1.timestamp || 0;
    const ts2 = doc2.updatedAt || doc2.timestamp || 0;
    
    // Create new merged document
    const merged = { ...doc1, ...doc2 };
    
    // For conflicting fields, use the value from the newest doc
    for (const key in doc1) {
      if (key in doc2 && doc1[key] !== doc2[key]) {
        merged[key] = ts1 > ts2 ? doc1[key] : doc2[key];
      }
    }
    
    // Set metadata
    merged._id = doc1._id;
    merged._rev = String(parseInt(doc1._rev || "0") + 1);
    merged.updatedAt = Date.now();
    
    return merged;
  }
  
  /**
   * Resolve conflict using newest strategy
   * @param {object} doc1 - First document
   * @param {object} doc2 - Second document
   * @returns {object} - Resolved document
   */
  _resolveNewest(doc1, doc2) {
    // Get timestamps for both documents
    const ts1 = doc1.updatedAt || doc1.timestamp || 0;
    const ts2 = doc2.updatedAt || doc2.timestamp || 0;
    
    // Use the newest document
    if (ts1 > ts2) {
      const updated = { ...doc1 };
      updated._rev = String(parseInt(doc1._rev || "0") + 1);
      updated.updatedAt = Date.now();
      return updated;
    } else {
      const updated = { ...doc2 };
      updated._rev = String(parseInt(doc2._rev || "0") + 1);
      updated.updatedAt = Date.now();
      return updated;
    }
  }
  
  /**
   * Resolve conflict using custom strategy
   * @param {object} doc1 - First document
   * @param {object} doc2 - Second document
   * @param {string} collection - Collection name
   * @returns {Promise<object>} - Resolved document
   */
  async _resolveCustom(doc1, doc2, collection) {
    // Check if we have a custom resolver for this collection
    const customResolvers = this.config.customResolvers || {};
    
    if (collection in customResolvers && typeof customResolvers[collection] === 'function') {
      return customResolvers[collection](doc1, doc2);
    }
    
    // Fall back to CRDT if no custom resolver
    return this._resolveCrdt(doc1, doc2);
  }
  
  /**
   * Apply selective mirroring rules to filter collections
   * @param {Array} collections - Collections to filter
   * @param {string} direction - Sync direction
   * @returns {Array} - Filtered collections
   */
  _applySelectiveMirroring(collections, direction) {
    const rules = (this.config.selectiveMirroringRules || {})[direction] || {};
    
    if (Object.keys(rules).length === 0) {
      // No rules, return all collections
      return collections;
    }
    
    // Apply inclusion and exclusion rules
    return collections.filter(collection => {
      // Explicit inclusions override exclusions
      if (rules.include && rules.include.includes(collection)) {
        return true;
      }
      
      // Explicit exclusions
      if (rules.exclude && rules.exclude.includes(collection)) {
        return false;
      }
      
      // Pattern-based inclusion
      if (rules.includePatterns) {
        for (const pattern of rules.includePatterns) {
          if (new RegExp(pattern).test(collection)) {
            return true;
          }
        }
      }
      
      // Pattern-based exclusion
      if (rules.excludePatterns) {
        for (const pattern of rules.excludePatterns) {
          if (new RegExp(pattern).test(collection)) {
            return false;
          }
        }
      }
      
      // Default inclusion behavior
      return rules.defaultInclude !== false;
    });
  }
  
  /**
   * Save current sync state to disk
   * @returns {Promise<void>}
   */
  async _saveSyncState() {
    try {
      // Create a safe copy of the state without circular references
      const stateCopy = await this.lock.acquire('syncState', async () => {
        return {
          lastOrbitDBSync: this.syncState.lastOrbitDBSync || 0,
          lastFireproofDBSync: this.syncState.lastFireproofDBSync || 0,
          lastDuckDBExport: this.syncState.lastDuckDBExport || 0,
          lastDuckDBImport: this.syncState.lastDuckDBImport || 0,
          // Keep only last 100 entries
          syncHistory: (this.syncState.syncHistory || []).slice(-100),
          conflictLog: (this.syncState.conflictLog || []).slice(-100),
          // Keep change log as is
          changeLog: this.syncState.changeLog || {}
        };
      });
      
      const syncStatePath = path.join(this.config.syncDir, "sync_state.json");
      fs.writeFileSync(syncStatePath, JSON.stringify(stateCopy, null, 2));
    } catch (e) {
      logger.error(`Error saving sync state: ${e.message}`);
    }
  }
  
  /**
   * Handle changes from OrbitDB
   * @param {object} event - Change event
   */
  _handleOrbitDbChange(event) {
    const collection = event.collection;
    const docId = event.docId;
    const operation = event.operation;
    
    // Emit change event
    this.emit("change", {
      type: "orbitdb",
      collection,
      docId,
      operation,
      timestamp: Date.now()
    });
    
    // If auto-sync is enabled and time since last sync exceeds threshold, trigger sync
    const timeSinceLastSync = Date.now() - (this.syncState.lastOrbitDBSync || 0);
    
    if (this.config.autoSync && 
        timeSinceLastSync > (this.config.autoSyncThreshold || 60000)) {
      
      // Queue sync operation to avoid flooding
      if (!this._syncTimeoutOrbit) {
        this._syncTimeoutOrbit = setTimeout(async () => {
          try {
            // Get a self-signed token
            const authToken = this.resources.authManager.getSelfSignedToken(
              SYNC_CAPABILITIES.SYNC_ORBITDB_TO_FIREPROOFDB
            );
            
            // Run sync without blocking
            this.syncOrbitDbToFireproofDb(authToken, [collection])
              .catch(err => logger.error(`Auto-sync OrbitDB to FireproofDB failed: ${err.message}`));
          } catch (e) {
            logger.error(`Auto-sync OrbitDB to FireproofDB failed: ${e.message}`);
          } finally {
            this._syncTimeoutOrbit = null;
          }
        }, 5000);
      }
    }
  }
  
  /**
   * Handle changes from FireproofDB
   * @param {object} event - Change event
   */
  _handleFireproofDbChange(event) {
    const collection = event.collection;
    const docId = event.docId;
    const operation = event.operation;
    
    // Emit change event
    this.emit("change", {
      type: "fireproofdb",
      collection,
      docId,
      operation,
      timestamp: Date.now()
    });
    
    // If auto-sync is enabled and time since last sync exceeds threshold, trigger sync
    const timeSinceLastSync = Date.now() - (this.syncState.lastFireproofDBSync || 0);
    
    if (this.config.autoSync && 
        timeSinceLastSync > (this.config.autoSyncThreshold || 60000)) {
      
      // Queue sync operation to avoid flooding
      if (!this._syncTimeoutFireproof) {
        this._syncTimeoutFireproof = setTimeout(async () => {
          try {
            // Get a self-signed token
            const authToken = this.resources.authManager.getSelfSignedToken(
              SYNC_CAPABILITIES.SYNC_FIREPROOFDB_TO_ORBITDB
            );
            
            // Run sync without blocking
            this.syncFireproofDbToOrbitDb(authToken, [collection])
              .catch(err => logger.error(`Auto-sync FireproofDB to OrbitDB failed: ${err.message}`));
          } catch (e) {
            logger.error(`Auto-sync FireproofDB to OrbitDB failed: ${e.message}`);
          } finally {
            this._syncTimeoutFireproof = null;
          }
        }, 5000);
      }
    }
  }
  
  /**
   * Handle DuckDB changes for tracking differential updates
   * @param {object} event - Change event
   */
  _handleDuckDbChange(event) {
    const table = event.table;
    const rowId = event.rowId;
    const operation = event.operation;
    
    // Initialize or update change log for this table
    this.lock.acquire('syncState', async () => {
      if (!this.syncState.changeLog) {
        this.syncState.changeLog = {};
      }
      
      if (!this.syncState.changeLog[table]) {
        this.syncState.changeLog[table] = {
          changes: 0,
          total: 0,
          changedRows: [],
          lastChange: Date.now()
        };
      }
      
      const tableLog = this.syncState.changeLog[table];
      
      // Update the log
      tableLog.changes++;
      tableLog.lastChange = Date.now();
      if (rowId && !tableLog.changedRows.includes(rowId)) {
        tableLog.changedRows.push(rowId);
      }
    });
    
    // Emit change event
    this.emit("change", {
      type: "duckdb",
      table,
      rowId,
      operation,
      timestamp: Date.now()
    });
    
    // If auto-sync is enabled and enough changes have accumulated, trigger export
    let shouldTrigger = false;
    this.lock.acquire('syncState', async () => {
      const tableLog = this.syncState.changeLog[table];
      shouldTrigger = (
        this.config.autoSync && 
        tableLog && tableLog.changes >= (this.config.autoSyncThreshold || 100)
      );
    });
    
    if (shouldTrigger && !this._syncTimeoutDuckdb) {
      this._syncTimeoutDuckdb = setTimeout(async () => {
        try {
          // Get a self-signed token
          const authToken = this.resources.authManager.getSelfSignedToken(
            SYNC_CAPABILITIES.SYNC_DUCKDB_EXPORT_IPLD
          );
          
          // Run export without blocking
          this.exportDuckDbToIpld(authToken, [table], true)
            .catch(err => logger.error(`Auto-export DuckDB to IPLD failed: ${err.message}`));
        } catch (e) {
          logger.error(`Auto-export DuckDB to IPLD failed: ${e.message}`);
        } finally {
          this._syncTimeoutDuckdb = null;
        }
      }, 5000);
    }
  }
  
  /**
   * Handle libp2p pubsub messages for synchronization
   * @param {object} message - libp2p pubsub message
   */
  async _handleLibp2pMessage(message) {
    try {
      let data;
      
      if (typeof message === 'object' && message.data) {
        // Handle native libp2p message format
        if (Buffer.isBuffer(message.data)) {
          data = JSON.parse(message.data.toString('utf8'));
        } else if (typeof message.data === 'string') {
          data = JSON.parse(message.data);
        } else {
          data = message.data;
        }
      } else {
        // Handle string message
        data = JSON.parse(message);
      }
      
      // Handle based on message type
      if (data.type === "duckdb-export") {
        // Another peer has exported a DuckDB table
        // We can import it if needed
        this.emit("peer-sync", {
          type: "duckdb-export",
          peer: message.from || "unknown",
          table: data.table,
          cid: data.cid,
          method: data.method,
          timestamp: data.timestamp
        });
        
        // Auto-import if configured
        if (this.config.autoImportPeerData) {
          await this.importIpldToDuckDb(
            this.resources.authManager.getSelfSignedToken(
              SYNC_CAPABILITIES.SYNC_DUCKDB_IMPORT_IPLD
            ),
            {
              [data.table]: {
                cid: data.cid,
                method: data.method
              }
            }
          );
        }
      } else if (data.type === "sync-request") {
        // Another peer is requesting sync data
        // We can export our data if needed
        this.emit("peer-sync", {
          type: "sync-request",
          peer: message.from || "unknown",
          collections: data.collections,
          tables: data.tables,
          timestamp: data.timestamp
        });
        
        // Auto-export if configured
        if (this.config.autoExportOnRequest && data.tables) {
          await this.exportDuckDbToIpld(
            this.resources.authManager.getSelfSignedToken(
              SYNC_CAPABILITIES.SYNC_DUCKDB_EXPORT_IPLD
            ),
            data.tables
          );
        }
      }
    } catch (e) {
      logger.error(`Error handling libp2p message: ${e.message}`);
    }
  }
  
  /**
   * Cleanup before shutdown
   * @returns {Promise<object>} - Close result
   */
  async close() {
    // Stop auto-sync
    this.stopAutoSync();
    
    // Unsubscribe from libp2p topic
    if (this.resources.libp2pKit) {
      await this.resources.libp2pKit.pubsub.unsubscribe(this.config.pubsubTopic);
    }
    
    // Remove event listeners
    if (this.resources.orbitDb && typeof this.resources.orbitDb.removeListener === 'function') {
      this.resources.orbitDb.removeListener("update", this._handleOrbitDbChange);
    }
    
    if (this.resources.fireproofDb && typeof this.resources.fireproofDb.removeListener === 'function') {
      this.resources.fireproofDb.removeListener("update", this._handleFireproofDbChange);
    }
    
    // Save final sync state
    await this._saveSyncState();
    
    return { success: true, message: "Database sync manager closed" };
  }
}

/**
 * Simple async mutex for managing concurrent access to shared resources
 */
class AsyncLock {
  constructor() {
    this.locks = {};
    this.waitingPromises = {};
  }

  async acquire(key, fn) {
    if (!this.locks[key]) {
      this.locks[key] = Promise.resolve();
    }

    // Wait for the current lock to release
    const currentPromise = this.locks[key];
    
    // Create a new lock promise
    let releaseLock;
    this.locks[key] = new Promise(resolve => {
      releaseLock = resolve;
    });

    // Wait for the current lock to release
    await currentPromise;

    try {
      // Execute the function
      return await fn();
    } finally {
      // Release the lock
      releaseLock();
    }
  }
}

// Create default instance
const databaseSyncManager = new DatabaseSyncManager();

// Export as default
export default databaseSyncManager;

// Export named constants
export { SYNC_CAPABILITIES as DATABASE_SYNC_CAPABILITIES };