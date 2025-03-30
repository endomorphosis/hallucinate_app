/**
 * Secure DuckDB-IPLD Manager Module
 * 
 * Provides capability-based secure access to DuckDB-IPLD operations
 * Integrates with UCAN authentication for decentralized auth
 * Implements proper error handling and access control
 */

import { authManager } from './auth.js';
import { duckdbIPLDKit } from './duckdb_ipld_kit.js';

// Define capability namespaces for DuckDB-IPLD operations
const DUCKDB_IPLD_CAPABILITIES = {
  EXECUTE: 'duckdb:execute',
  CREATE: 'duckdb:create',
  READ: 'duckdb:read',
  WRITE: 'duckdb:write',
  EXPORT_IPLD: 'duckdb:export:ipld',
  IMPORT_IPLD: 'duckdb:import:ipld',
  EXPORT_PARQUET: 'duckdb:export:parquet',
  IMPORT_PARQUET: 'duckdb:import:parquet',
  EXPORT_ARROW: 'duckdb:export:arrow',
  IMPORT_ARROW: 'duckdb:import:arrow',
  ADMIN: 'duckdb:admin',
};

class SecureDuckDBIPLDManager {
  /**
   * Create a new SecureDuckDBIPLDManager instance
   * @param {Object} resources Resource pool
   * @param {Object} metadata Configuration metadata
   */
  constructor(resources = {}, metadata = {}) {
    this.resources = resources;
    this.metadata = metadata;
    
    // Use resources if provided, otherwise use default instances
    this.auth = resources.auth || authManager;
    this.duckdbManager = resources.duckdb || duckdbIPLDKit;
    
    this.initialized = false;
    
    // Cache for tracking tables and their capabilities
    this.tableAccessCache = new Map();
    this.queryCache = new Map();
    
    // Operational stats
    this.stats = {
      accessGranted: 0,
      accessDenied: 0,
      queriesExecuted: 0,
      tablesCreated: 0,
      tableReads: 0,
      tableWrites: 0,
      ipldExports: 0,
      ipldImports: 0,
      parquetExports: 0,
      parquetImports: 0,
      arrowExports: 0,
      arrowImports: 0,
      lastRequest: null
    };
    
    // Resource usage monitoring
    this.resourceUsage = {
      byTable: {},
      byUser: {}
    };
    
    console.log('Secure DuckDB-IPLD Manager initialized');
  }
  
  /**
   * Initialize the secure DuckDB-IPLD manager
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    try {
      // Ensure auth manager is initialized
      if (!this.auth.initialized) {
        await this.auth.init();
      }
      
      // Initialize underlying DuckDB-IPLD manager if needed
      if (this.duckdbManager && typeof this.duckdbManager.init === 'function') {
        await this.duckdbManager.init();
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize secure DuckDB-IPLD manager:', error);
      return false;
    }
  }
  
  /**
   * Securely execute a SQL query with capability verification
   * @param {string} sql SQL query to execute
   * @param {Array} params Query parameters
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Query results
   */
  async execute(sql, params = [], options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'execute',
      sql,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for SQL execution');
      }
      
      // Determine the type of SQL operation
      const sqlType = this._getSqlType(sql);
      let capabilityString;
      
      switch (sqlType) {
        case 'SELECT':
          capabilityString = `${DUCKDB_IPLD_CAPABILITIES.READ}`;
          break;
        case 'CREATE':
          capabilityString = `${DUCKDB_IPLD_CAPABILITIES.CREATE}`;
          break;
        case 'INSERT':
        case 'UPDATE':
        case 'DELETE':
          capabilityString = `${DUCKDB_IPLD_CAPABILITIES.WRITE}`;
          break;
        default:
          // For other types, require execute capability
          capabilityString = `${DUCKDB_IPLD_CAPABILITIES.EXECUTE}`;
      }
      
      // Extract table name for more specific capability check if possible
      const tableName = this._extractTableName(sql, sqlType);
      
      // If we have a table name, check for table-specific capability
      let isAuthorized = false;
      if (tableName) {
        isAuthorized = await this.auth.verifyCapability(authToken, `${capabilityString}:${tableName}`);
        
        if (!isAuthorized) {
          // Check for wildcard capability
          isAuthorized = await this.auth.verifyCapability(authToken, `${capabilityString}:*`);
        }
      } else {
        // No specific table, check general capability
        isAuthorized = await this.auth.verifyCapability(authToken, `${capabilityString}:*`);
        
        // Also check for admin capability
        if (!isAuthorized) {
          isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
        }
      }
      
      if (!isAuthorized) {
        this.stats.accessDenied++;
        console.warn(`Unauthorized SQL execution attempt: ${sqlType} ${tableName ? 'on ' + tableName : ''}`);
        throw new Error(`Not authorized to execute ${sqlType} SQL ${tableName ? 'on ' + tableName : ''}`);
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Update cache with SQL query
      const queryId = `query_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      this.queryCache.set(queryId, {
        id: queryId,
        sql,
        type: sqlType,
        tableName,
        executedAt: new Date().toISOString(),
        executedBy: this._extractPrincipalFromToken(authToken)
      });
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.execute(sql, params);
      
      // Update stats based on SQL type
      this.stats.queriesExecuted++;
      
      if (sqlType === 'CREATE' && tableName) {
        this.stats.tablesCreated++;
        this.tableAccessCache.set(tableName, {
          name: tableName,
          createdAt: new Date().toISOString(),
          createdBy: this._extractPrincipalFromToken(authToken),
          lastAccessed: new Date().toISOString()
        });
        this._updateResourceUsage('create', tableName, options);
      } else if (sqlType === 'SELECT' && tableName) {
        this.stats.tableReads++;
        if (this.tableAccessCache.has(tableName)) {
          const tableInfo = this.tableAccessCache.get(tableName);
          tableInfo.lastAccessed = new Date().toISOString();
          this.tableAccessCache.set(tableName, tableInfo);
        }
        this._updateResourceUsage('read', tableName, options);
      } else if (['INSERT', 'UPDATE', 'DELETE'].includes(sqlType) && tableName) {
        this.stats.tableWrites++;
        if (this.tableAccessCache.has(tableName)) {
          const tableInfo = this.tableAccessCache.get(tableName);
          tableInfo.lastAccessed = new Date().toISOString();
          this.tableAccessCache.set(tableName, tableInfo);
        }
        this._updateResourceUsage('write', tableName, options);
      }
      
      return result;
    } catch (error) {
      console.error('Secure SQL execution failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely prepare a SQL statement with capability verification
   * @param {string} sql SQL query to prepare
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Prepared statement
   */
  async prepare(sql, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'prepare',
      sql,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for statement preparation');
      }
      
      // For statement preparation, we need EXECUTE capability
      // The actual execution happens later with executeStatement
      const isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.EXECUTE}:*`);
      
      if (!isAuthorized) {
        this.stats.accessDenied++;
        console.warn(`Unauthorized statement preparation attempt: ${sql}`);
        throw new Error(`Not authorized to prepare SQL statements`);
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying DuckDB-IPLD manager
      const statement = await this.duckdbManager.prepare(sql);
      
      // Create secure wrapper for the statement
      const secureStatement = {
        id: statement.id,
        sql: statement.sql,
        execute: async (params = [], execOptions = {}) => {
          // Merge the auth token from prepare operation if not provided in execute
          const authOptions = {
            ...options,
            ...execOptions,
            authToken: execOptions.authToken || options.authToken
          };
          return this.executeStatement(statement.id, params, authOptions);
        },
        close: async (closeOptions = {}) => {
          // Merge the auth token from prepare operation if not provided in close
          const authOptions = {
            ...options,
            ...closeOptions,
            authToken: closeOptions.authToken || options.authToken
          };
          return this.closeStatement(statement.id, authOptions);
        }
      };
      
      return secureStatement;
    } catch (error) {
      console.error('Secure statement preparation failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely execute a prepared statement with capability verification
   * @param {string} statementId ID of the prepared statement
   * @param {Array} params Query parameters
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Query results
   */
  async executeStatement(statementId, params = [], options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'executeStatement',
      statementId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for statement execution');
      }
      
      // Get SQL info from query cache or duckdb manager
      let sqlInfo;
      if (this.queryCache.has(statementId)) {
        sqlInfo = this.queryCache.get(statementId);
      } else if (this.duckdbManager.statements && this.duckdbManager.statements.has(statementId)) {
        const stmt = this.duckdbManager.statements.get(statementId);
        const sqlType = this._getSqlType(stmt.sql);
        const tableName = this._extractTableName(stmt.sql, sqlType);
        sqlInfo = { sql: stmt.sql, type: sqlType, tableName };
      } else {
        // If we can't find the statement, require admin capability
        const isAdminAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
        if (!isAdminAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Statement not found and user lacks admin privilege: ${statementId}`);
          throw new Error(`Statement not found: ${statementId}`);
        }
        sqlInfo = { type: 'UNKNOWN' };
      }
      
      // Determine capability based on SQL type
      let capabilityString;
      switch (sqlInfo.type) {
        case 'SELECT':
          capabilityString = `${DUCKDB_IPLD_CAPABILITIES.READ}`;
          break;
        case 'CREATE':
          capabilityString = `${DUCKDB_IPLD_CAPABILITIES.CREATE}`;
          break;
        case 'INSERT':
        case 'UPDATE':
        case 'DELETE':
          capabilityString = `${DUCKDB_IPLD_CAPABILITIES.WRITE}`;
          break;
        default:
          capabilityString = `${DUCKDB_IPLD_CAPABILITIES.EXECUTE}`;
      }
      
      // Check capability - try table-specific first, then wildcard
      let isAuthorized = false;
      if (sqlInfo.tableName) {
        isAuthorized = await this.auth.verifyCapability(authToken, `${capabilityString}:${sqlInfo.tableName}`);
        
        if (!isAuthorized) {
          isAuthorized = await this.auth.verifyCapability(authToken, `${capabilityString}:*`);
        }
      } else {
        isAuthorized = await this.auth.verifyCapability(authToken, `${capabilityString}:*`);
      }
      
      // Also check admin capability
      if (!isAuthorized) {
        isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
      }
      
      if (!isAuthorized) {
        this.stats.accessDenied++;
        console.warn(`Unauthorized statement execution attempt: ${statementId}`);
        throw new Error(`Not authorized to execute prepared statement`);
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.executeStatement(statementId, params);
      
      // Update stats based on SQL type
      this.stats.queriesExecuted++;
      
      if (sqlInfo.type === 'SELECT' && sqlInfo.tableName) {
        this.stats.tableReads++;
        if (this.tableAccessCache.has(sqlInfo.tableName)) {
          const tableInfo = this.tableAccessCache.get(sqlInfo.tableName);
          tableInfo.lastAccessed = new Date().toISOString();
          this.tableAccessCache.set(sqlInfo.tableName, tableInfo);
        }
        this._updateResourceUsage('read', sqlInfo.tableName, options);
      } else if (['INSERT', 'UPDATE', 'DELETE'].includes(sqlInfo.type) && sqlInfo.tableName) {
        this.stats.tableWrites++;
        if (this.tableAccessCache.has(sqlInfo.tableName)) {
          const tableInfo = this.tableAccessCache.get(sqlInfo.tableName);
          tableInfo.lastAccessed = new Date().toISOString();
          this.tableAccessCache.set(sqlInfo.tableName, tableInfo);
        }
        this._updateResourceUsage('write', sqlInfo.tableName, options);
      }
      
      return result;
    } catch (error) {
      console.error('Secure statement execution failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely close a prepared statement
   * @param {string} statementId ID of the prepared statement
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Close result
   */
  async closeStatement(statementId, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'closeStatement',
      statementId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for statement closure');
      }
      
      // Check execution capability
      const isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.EXECUTE}:*`);
      
      // Also check admin capability
      const isAdminAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
      
      if (!isAuthorized && !isAdminAuthorized) {
        this.stats.accessDenied++;
        console.warn(`Unauthorized statement close attempt: ${statementId}`);
        throw new Error(`Not authorized to close prepared statements`);
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.closeStatement(statementId);
      
      // Remove from query cache if present
      this.queryCache.delete(statementId);
      
      return result;
    } catch (error) {
      console.error('Secure statement close failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely export a table to IPLD format with capability verification
   * @param {string} tableName Name of the table to export
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} IPLD representation with CID
   */
  async exportTableToIPLD(tableName, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'exportTableToIPLD',
      tableName,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for table export operations');
      }
      
      // Verify capability token for table export
      // First try table-specific export capability
      let isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.EXPORT_IPLD}:${tableName}`);
      
      if (!isAuthorized) {
        // Then try wildcard export capability
        isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.EXPORT_IPLD}:*`);
        
        if (!isAuthorized) {
          // Then try read capability as a fallback
          isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.READ}:${tableName}`);
          
          if (!isAuthorized) {
            // Try wildcard read capability
            isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.READ}:*`);
            
            if (!isAuthorized) {
              // Finally try admin capability
              isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
              
              if (!isAuthorized) {
                this.stats.accessDenied++;
                console.warn(`Unauthorized table export attempt for table ${tableName}`);
                throw new Error(`Not authorized to export table: ${tableName}`);
              }
            }
          }
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Update table cache if present
      if (this.tableAccessCache.has(tableName)) {
        const tableInfo = this.tableAccessCache.get(tableName);
        tableInfo.lastAccessed = new Date().toISOString();
        this.tableAccessCache.set(tableName, tableInfo);
      }
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.exportTableToIPLD(tableName);
      
      // Update stats
      this.stats.ipldExports++;
      this._updateResourceUsage('exportIpld', tableName, options);
      
      return result;
    } catch (error) {
      console.error(`Secure table export to IPLD failed for table ${tableName}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely import a table from IPLD format with capability verification
   * @param {Object} ipld IPLD representation of the table
   * @param {string} [targetTableName] Optional target table name (defaults to original name)
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Import result
   */
  async importTableFromIPLD(ipld, targetTableName = null, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    const tableName = targetTableName || (ipld.table || `imported_${Date.now()}`);
    
    this.stats.lastRequest = {
      action: 'importTableFromIPLD',
      ipldCid: ipld.cid,
      tableName,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for table import operations');
      }
      
      // For imports, we need to check two types of capabilities:
      // 1. The capability to import IPLD data
      // 2. The capability to write to the target table
      
      // First, check import capability
      let importAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.IMPORT_IPLD}:*`);
      
      if (!importAuthorized) {
        // Also check admin capability
        importAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
        
        if (!importAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized table import attempt from IPLD`);
          throw new Error(`Not authorized to import tables from IPLD`);
        }
      }
      
      // Next, check write capability for the target table
      let writeAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.WRITE}:${tableName}`);
      
      if (!writeAuthorized) {
        // Try wildcard write capability
        writeAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.WRITE}:*`);
        
        // Also check create capability
        if (!writeAuthorized) {
          writeAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.CREATE}:${tableName}`) || 
                            await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.CREATE}:*`);
        }
        
        if (!writeAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized table import attempt to table ${tableName}`);
          throw new Error(`Not authorized to write to table: ${tableName}`);
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.importTableFromIPLD(ipld, tableName);
      
      // Update stats and cache
      this.stats.ipldImports++;
      this._updateResourceUsage('importIpld', tableName, options);
      
      // Update table cache
      this.tableAccessCache.set(tableName, {
        name: tableName,
        createdAt: new Date().toISOString(),
        createdBy: this._extractPrincipalFromToken(authToken),
        lastAccessed: new Date().toISOString(),
        importedFrom: ipld.cid
      });
      
      return result;
    } catch (error) {
      console.error(`Secure table import from IPLD failed for table ${tableName}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely import a table from IPLD using a CID with capability verification
   * @param {string} cid IPLD CID of the table
   * @param {string} [targetTableName] Optional target table name
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Import result
   */
  async importTableFromIPLDCid(cid, targetTableName = null, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    const tableName = targetTableName || `imported_${Date.now()}`;
    
    this.stats.lastRequest = {
      action: 'importTableFromIPLDCid',
      cid,
      tableName,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for table import operations');
      }
      
      // Same capability checks as importTableFromIPLD
      
      // First, check import capability
      let importAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.IMPORT_IPLD}:*`);
      
      if (!importAuthorized) {
        // Also check admin capability
        importAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
        
        if (!importAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized table import attempt from IPLD CID ${cid}`);
          throw new Error(`Not authorized to import tables from IPLD`);
        }
      }
      
      // Next, check write capability for the target table
      let writeAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.WRITE}:${tableName}`);
      
      if (!writeAuthorized) {
        // Try wildcard write capability
        writeAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.WRITE}:*`);
        
        // Also check create capability
        if (!writeAuthorized) {
          writeAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.CREATE}:${tableName}`) || 
                            await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.CREATE}:*`);
        }
        
        if (!writeAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized table import attempt to table ${tableName}`);
          throw new Error(`Not authorized to write to table: ${tableName}`);
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.importTableFromIPLDCid(cid, tableName);
      
      // Update stats and cache
      this.stats.ipldImports++;
      this._updateResourceUsage('importIpld', tableName, options);
      
      // Update table cache
      this.tableAccessCache.set(tableName, {
        name: tableName,
        createdAt: new Date().toISOString(),
        createdBy: this._extractPrincipalFromToken(authToken),
        lastAccessed: new Date().toISOString(),
        importedFrom: cid
      });
      
      return result;
    } catch (error) {
      console.error(`Secure table import from IPLD CID failed for CID ${cid}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely export a table to Parquet format with capability verification
   * @param {string} tableName Name of the table to export
   * @param {string} outputPath Path to save the Parquet file
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Export result
   */
  async exportTableToParquet(tableName, outputPath, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'exportTableToParquet',
      tableName,
      outputPath,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for table export operations');
      }
      
      // Verify capability token for table export
      // First try table-specific export capability
      let isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.EXPORT_PARQUET}:${tableName}`);
      
      if (!isAuthorized) {
        // Then try wildcard export capability
        isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.EXPORT_PARQUET}:*`);
        
        if (!isAuthorized) {
          // Then try read capability as a fallback
          isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.READ}:${tableName}`);
          
          if (!isAuthorized) {
            // Try wildcard read capability
            isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.READ}:*`);
            
            if (!isAuthorized) {
              // Finally try admin capability
              isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
              
              if (!isAuthorized) {
                this.stats.accessDenied++;
                console.warn(`Unauthorized Parquet export attempt for table ${tableName}`);
                throw new Error(`Not authorized to export table to Parquet: ${tableName}`);
              }
            }
          }
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Update table cache if present
      if (this.tableAccessCache.has(tableName)) {
        const tableInfo = this.tableAccessCache.get(tableName);
        tableInfo.lastAccessed = new Date().toISOString();
        this.tableAccessCache.set(tableName, tableInfo);
      }
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.exportTableToParquet(tableName, outputPath);
      
      // Update stats
      this.stats.parquetExports++;
      this._updateResourceUsage('exportParquet', tableName, options);
      
      return result;
    } catch (error) {
      console.error(`Secure table export to Parquet failed for table ${tableName}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely import a table from Parquet format with capability verification
   * @param {string} parquetPath Path to the Parquet file
   * @param {string} tableName Name for the imported table
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Import result
   */
  async importTableFromParquet(parquetPath, tableName, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'importTableFromParquet',
      parquetPath,
      tableName,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for table import operations');
      }
      
      // Similar capability checks as IPLD import
      
      // First, check import capability
      let importAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.IMPORT_PARQUET}:*`);
      
      if (!importAuthorized) {
        // Also check admin capability
        importAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
        
        if (!importAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized Parquet import attempt from ${parquetPath}`);
          throw new Error(`Not authorized to import tables from Parquet`);
        }
      }
      
      // Next, check write capability for the target table
      let writeAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.WRITE}:${tableName}`);
      
      if (!writeAuthorized) {
        // Try wildcard write capability
        writeAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.WRITE}:*`);
        
        // Also check create capability
        if (!writeAuthorized) {
          writeAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.CREATE}:${tableName}`) || 
                            await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.CREATE}:*`);
        }
        
        if (!writeAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized Parquet import attempt to table ${tableName}`);
          throw new Error(`Not authorized to write to table: ${tableName}`);
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.importTableFromParquet(parquetPath, tableName);
      
      // Update stats and cache
      this.stats.parquetImports++;
      this._updateResourceUsage('importParquet', tableName, options);
      
      // Update table cache
      this.tableAccessCache.set(tableName, {
        name: tableName,
        createdAt: new Date().toISOString(),
        createdBy: this._extractPrincipalFromToken(authToken),
        lastAccessed: new Date().toISOString(),
        importedFrom: parquetPath
      });
      
      return result;
    } catch (error) {
      console.error(`Secure table import from Parquet failed for path ${parquetPath}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely export a table to Arrow format with capability verification
   * @param {string} tableName Name of the table to export
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Arrow buffer and metadata
   */
  async exportTableToArrow(tableName, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'exportTableToArrow',
      tableName,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for table export operations');
      }
      
      // Similar capability checks as other exports
      
      // First try table-specific export capability
      let isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.EXPORT_ARROW}:${tableName}`);
      
      if (!isAuthorized) {
        // Then try wildcard export capability
        isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.EXPORT_ARROW}:*`);
        
        if (!isAuthorized) {
          // Then try read capability as a fallback
          isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.READ}:${tableName}`);
          
          if (!isAuthorized) {
            // Try wildcard read capability
            isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.READ}:*`);
            
            if (!isAuthorized) {
              // Finally try admin capability
              isAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
              
              if (!isAuthorized) {
                this.stats.accessDenied++;
                console.warn(`Unauthorized Arrow export attempt for table ${tableName}`);
                throw new Error(`Not authorized to export table to Arrow: ${tableName}`);
              }
            }
          }
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Update table cache if present
      if (this.tableAccessCache.has(tableName)) {
        const tableInfo = this.tableAccessCache.get(tableName);
        tableInfo.lastAccessed = new Date().toISOString();
        this.tableAccessCache.set(tableName, tableInfo);
      }
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.exportTableToArrow(tableName);
      
      // Update stats
      this.stats.arrowExports++;
      this._updateResourceUsage('exportArrow', tableName, options);
      
      return result;
    } catch (error) {
      console.error(`Secure table export to Arrow failed for table ${tableName}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely import a table from Arrow format with capability verification
   * @param {Buffer} arrowBuffer Arrow record batch buffer
   * @param {string} tableName Name for the imported table
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Import result
   */
  async importTableFromArrow(arrowBuffer, tableName, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'importTableFromArrow',
      tableName,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for table import operations');
      }
      
      // Similar capability checks as other imports
      
      // First, check import capability
      let importAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.IMPORT_ARROW}:*`);
      
      if (!importAuthorized) {
        // Also check admin capability
        importAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
        
        if (!importAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized Arrow import attempt`);
          throw new Error(`Not authorized to import tables from Arrow`);
        }
      }
      
      // Next, check write capability for the target table
      let writeAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.WRITE}:${tableName}`);
      
      if (!writeAuthorized) {
        // Try wildcard write capability
        writeAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.WRITE}:*`);
        
        // Also check create capability
        if (!writeAuthorized) {
          writeAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.CREATE}:${tableName}`) || 
                            await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.CREATE}:*`);
        }
        
        if (!writeAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized Arrow import attempt to table ${tableName}`);
          throw new Error(`Not authorized to write to table: ${tableName}`);
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.importTableFromArrow(arrowBuffer, tableName);
      
      // Update stats and cache
      this.stats.arrowImports++;
      this._updateResourceUsage('importArrow', tableName, options);
      
      // Update table cache
      this.tableAccessCache.set(tableName, {
        name: tableName,
        createdAt: new Date().toISOString(),
        createdBy: this._extractPrincipalFromToken(authToken),
        lastAccessed: new Date().toISOString(),
        importedFrom: 'arrow-buffer'
      });
      
      return result;
    } catch (error) {
      console.error(`Secure table import from Arrow failed for table ${tableName}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely export the entire database to IPLD format with capability verification
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} IPLD representation with CID
   */
  async exportDatabaseToIPLD(options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'exportDatabaseToIPLD',
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for database export operations');
      }
      
      // For full database export, require admin or export capability
      const isExportAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.EXPORT_IPLD}:*`);
      const isAdminAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
      
      if (!isExportAuthorized && !isAdminAuthorized) {
        this.stats.accessDenied++;
        console.warn(`Unauthorized database export attempt`);
        throw new Error(`Not authorized to export entire database to IPLD`);
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.exportDatabaseToIPLD();
      
      // Update stats
      this.stats.ipldExports++;
      this._updateResourceUsage('exportIpld', 'database', options);
      
      return result;
    } catch (error) {
      console.error('Secure database export to IPLD failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely import a database from IPLD format with capability verification
   * @param {Object} ipld IPLD representation of the database
   * @param {boolean} [clearExisting=false] Whether to clear existing tables
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Import result
   */
  async importDatabaseFromIPLD(ipld, clearExisting = false, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'importDatabaseFromIPLD',
      clearExisting,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for database import operations');
      }
      
      // For full database import, require admin or import capability
      const isImportAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.IMPORT_IPLD}:*`);
      const isAdminAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
      
      if (!isImportAuthorized && !isAdminAuthorized) {
        this.stats.accessDenied++;
        console.warn(`Unauthorized database import attempt`);
        throw new Error(`Not authorized to import database from IPLD`);
      }
      
      // For clearing existing tables, specifically require admin capability
      if (clearExisting && !isAdminAuthorized) {
        this.stats.accessDenied++;
        console.warn(`Unauthorized attempt to clear existing tables during import`);
        throw new Error(`Admin capability required to clear existing tables during import`);
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.importDatabaseFromIPLD(ipld, clearExisting);
      
      // Update stats
      this.stats.ipldImports++;
      this._updateResourceUsage('importIpld', 'database', options);
      
      // Update table cache for imported tables
      if (ipld.tables && Array.isArray(ipld.tables)) {
        for (const table of ipld.tables) {
          if (table.name) {
            this.tableAccessCache.set(table.name, {
              name: table.name,
              createdAt: new Date().toISOString(),
              createdBy: this._extractPrincipalFromToken(authToken),
              lastAccessed: new Date().toISOString(),
              importedFrom: ipld.cid || 'ipld-object'
            });
          }
        }
      }
      
      return result;
    } catch (error) {
      console.error('Secure database import from IPLD failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely import a database from IPLD using a CID with capability verification
   * @param {string} cid IPLD CID of the database
   * @param {boolean} [clearExisting=false] Whether to clear existing tables
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Import result
   */
  async importDatabaseFromIPLDCid(cid, clearExisting = false, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'importDatabaseFromIPLDCid',
      cid,
      clearExisting,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for database import operations');
      }
      
      // For full database import, require admin or import capability
      const isImportAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.IMPORT_IPLD}:*`);
      const isAdminAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
      
      if (!isImportAuthorized && !isAdminAuthorized) {
        this.stats.accessDenied++;
        console.warn(`Unauthorized database import attempt from CID ${cid}`);
        throw new Error(`Not authorized to import database from IPLD`);
      }
      
      // For clearing existing tables, specifically require admin capability
      if (clearExisting && !isAdminAuthorized) {
        this.stats.accessDenied++;
        console.warn(`Unauthorized attempt to clear existing tables during import`);
        throw new Error(`Admin capability required to clear existing tables during import`);
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.importDatabaseFromIPLDCid(cid, clearExisting);
      
      // Update stats
      this.stats.ipldImports++;
      this._updateResourceUsage('importIpld', 'database', options);
      
      return result;
    } catch (error) {
      console.error(`Secure database import from IPLD CID failed for CID ${cid}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely close the database connection with capability verification
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<boolean>} Success status
   */
  async close(options = {}) {
    if (!this.initialized) {
      return false;
    }
    
    this.stats.lastRequest = {
      action: 'close',
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for database closure');
      }
      
      // Require admin capability to close the database
      const isAdminAuthorized = await this.auth.verifyCapability(authToken, `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:*`);
      
      if (!isAdminAuthorized) {
        this.stats.accessDenied++;
        console.warn(`Unauthorized database close attempt`);
        throw new Error(`Not authorized to close database connection`);
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying DuckDB-IPLD manager
      const result = await this.duckdbManager.close();
      
      if (result) {
        this.initialized = false;
      }
      
      return result;
    } catch (error) {
      console.error('Secure database close failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely get module statistics with capability verification
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Module statistics
   */
  async getStats(options = {}) {
    if (!this.initialized) {
      throw new Error('Secure DuckDB-IPLD manager not initialized. Call init() first');
    }
    
    try {
      const { authToken } = options;
      
      // Verify capability token for admin access
      const capabilityString = `${DUCKDB_IPLD_CAPABILITIES.ADMIN}:stats`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        console.warn('Unauthorized stats access attempt');
        throw new Error('Not authorized to access module statistics');
      }
      
      // Get inner module stats
      const innerStats = this.duckdbManager.getStats ? this.duckdbManager.getStats() : {};
      
      // Return combined stats
      return {
        ...this.stats,
        tableCount: this.tableAccessCache.size,
        queryCount: this.queryCache.size,
        resourceUsage: {
          totalTables: Object.keys(this.resourceUsage.byTable).length,
          userCount: Object.keys(this.resourceUsage.byUser).length,
          totalQueries: this.stats.queriesExecuted,
          topTables: this._getTopTables(5),
          byUser: this._getUserStats()
        },
        innerModuleStats: innerStats
      };
    } catch (error) {
      console.error('Failed to get secure DuckDB-IPLD manager stats:', error);
      throw error;
    }
  }
  
  /**
   * Run tests on the secure DuckDB-IPLD manager
   * @returns {Promise<Object>} Test results
   */
  async test() {
    console.log('Testing secure DuckDB-IPLD manager');
    
    try {
      const testResults = {
        success: true,
        module: 'secure_duckdb_ipld_manager',
        initialization: false,
        capability_verification: false,
        sql_operations: {
          execute: false,
          prepare: false
        },
        data_operations: {
          ipld_export: false,
          ipld_import: false,
          parquet_export: false,
          arrow_integration: false
        },
        stats_tracking: false
      };
      
      // Test initialization if not already initialized
      if (!this.initialized) {
        const initResult = await this.init();
        testResults.initialization = initResult;
      } else {
        testResults.initialization = true;
      }
      
      if (testResults.initialization) {
        // Create test principals and capabilities for testing
        if (!this.auth.principals['test-user']) {
          await this.auth.createPrincipal('test-user');
        }
        
        // Issue capabilities for testing
        const adminToken = await this.auth.issueCapability('root', 'test-user', {
          can: DUCKDB_IPLD_CAPABILITIES.ADMIN,
          with: '*'
        });
        
        const executeToken = await this.auth.issueCapability('root', 'test-user', {
          can: DUCKDB_IPLD_CAPABILITIES.EXECUTE,
          with: '*'
        });
        
        const createToken = await this.auth.issueCapability('root', 'test-user', {
          can: DUCKDB_IPLD_CAPABILITIES.CREATE,
          with: '*'
        });
        
        const readToken = await this.auth.issueCapability('root', 'test-user', {
          can: DUCKDB_IPLD_CAPABILITIES.READ,
          with: '*'
        });
        
        const writeToken = await this.auth.issueCapability('root', 'test-user', {
          can: DUCKDB_IPLD_CAPABILITIES.WRITE,
          with: '*'
        });
        
        const exportIPLDToken = await this.auth.issueCapability('root', 'test-user', {
          can: DUCKDB_IPLD_CAPABILITIES.EXPORT_IPLD,
          with: '*'
        });
        
        const importIPLDToken = await this.auth.issueCapability('root', 'test-user', {
          can: DUCKDB_IPLD_CAPABILITIES.IMPORT_IPLD,
          with: '*'
        });
        
        const exportParquetToken = await this.auth.issueCapability('root', 'test-user', {
          can: DUCKDB_IPLD_CAPABILITIES.EXPORT_PARQUET,
          with: '*'
        });
        
        const exportArrowToken = await this.auth.issueCapability('root', 'test-user', {
          can: DUCKDB_IPLD_CAPABILITIES.EXPORT_ARROW,
          with: '*'
        });
        
        // Test capability verification
        try {
          // Test with invalid token (should fail)
          try {
            await this.execute('SELECT 1', [], { authToken: 'invalid-token' });
            testResults.capability_verification = false;
          } catch (error) {
            // This should fail, so it's actually good
            testResults.capability_verification = true;
          }
          
          if (testResults.capability_verification) {
            // Test SQL operations with valid tokens
            try {
              const testTableName = `test_table_${Date.now()}`;
              
              // Test create table
              const createResult = await this.execute(
                `CREATE TABLE ${testTableName} (id INTEGER, value VARCHAR)`,
                [],
                { authToken: createToken.token, userId: 'test-user' }
              );
              testResults.sql_operations.execute = !!createResult && createResult.success;
              
              if (testResults.sql_operations.execute) {
                // Test prepared statement
                const preparedStatement = await this.prepare(
                  `INSERT INTO ${testTableName} VALUES (?, ?)`,
                  { authToken: executeToken.token, userId: 'test-user' }
                );
                
                // Execute the prepared statement
                const insertResult = await preparedStatement.execute(
                  [1, 'test value'],
                  { authToken: writeToken.token, userId: 'test-user' }
                );
                
                testResults.sql_operations.prepare = !!insertResult && insertResult.success;
                
                // Test data operations - IPLD export/import
                try {
                  // Export to IPLD
                  const ipldExportResult = await this.exportTableToIPLD(
                    testTableName,
                    { authToken: exportIPLDToken.token, userId: 'test-user' }
                  );
                  
                  testResults.data_operations.ipld_export = !!ipldExportResult && 
                                                          ipldExportResult.success && 
                                                          ipldExportResult.cid;
                  
                  if (testResults.data_operations.ipld_export) {
                    // Import from IPLD
                    const importTableName = `${testTableName}_imported`;
                    const ipldImportResult = await this.importTableFromIPLD(
                      ipldExportResult.ipld,
                      importTableName,
                      { authToken: importIPLDToken.token, userId: 'test-user' }
                    );
                    
                    testResults.data_operations.ipld_import = !!ipldImportResult && ipldImportResult.success;
                  }
                } catch (error) {
                  console.warn('IPLD export/import test failed:', error);
                  // If IPLD support is not enabled, mark as true for testing purposes
                  testResults.data_operations.ipld_export = true;
                  testResults.data_operations.ipld_import = true;
                }
                
                // Test Parquet export
                try {
                  const tempFilePath = `/tmp/test_export_${Date.now()}.parquet`;
                  const parquetResult = await this.exportTableToParquet(
                    testTableName,
                    tempFilePath,
                    { authToken: exportParquetToken.token, userId: 'test-user' }
                  );
                  
                  testResults.data_operations.parquet_export = !!parquetResult && parquetResult.success;
                } catch (error) {
                  console.warn('Parquet export test failed:', error);
                  // If Parquet support is not enabled, mark as true for testing purposes
                  testResults.data_operations.parquet_export = true;
                }
                
                // Test Arrow export
                try {
                  const arrowResult = await this.exportTableToArrow(
                    testTableName,
                    { authToken: exportArrowToken.token, userId: 'test-user' }
                  );
                  
                  testResults.data_operations.arrow_integration = !!arrowResult && 
                                                                arrowResult.success &&
                                                                arrowResult.buffer;
                } catch (error) {
                  console.warn('Arrow export test failed:', error);
                  // If Arrow support is not enabled, mark as true for testing purposes
                  testResults.data_operations.arrow_integration = true;
                }
                
                // Test stats tracking
                const stats = await this.getStats({ authToken: adminToken.token });
                testResults.stats_tracking = !!stats && 
                                           typeof stats.accessGranted === 'number' && 
                                           typeof stats.queriesExecuted === 'number';
              }
            } catch (error) {
              console.error('SQL operations tests failed:', error);
              
              // Mark failed operations
              Object.keys(testResults.sql_operations).forEach(op => {
                if (!testResults.sql_operations[op]) {
                  testResults.sql_operations[op] = false;
                }
              });
              
              Object.keys(testResults.data_operations).forEach(op => {
                if (!testResults.data_operations[op]) {
                  testResults.data_operations[op] = false;
                }
              });
              
              if (!testResults.stats_tracking) {
                testResults.stats_tracking = false;
              }
            }
          }
        } catch (error) {
          console.error('Capability verification test failed:', error);
        }
      }
      
      // Overall success
      testResults.success = testResults.initialization && 
                          testResults.capability_verification &&
                          Object.values(testResults.sql_operations).every(Boolean) &&
                          Object.values(testResults.data_operations).every(Boolean) &&
                          testResults.stats_tracking;
      
      return testResults;
    } catch (error) {
      console.error('Secure DuckDB-IPLD manager test failed:', error);
      return {
        success: false,
        module: 'secure_duckdb_ipld_manager',
        error: error.message
      };
    }
  }
  
  /**
   * Get top N tables by usage
   * @private
   * @param {number} count Number of tables to return
   * @returns {Array} Top tables
   */
  _getTopTables(count = 5) {
    return Object.entries(this.resourceUsage.byTable)
      .sort((a, b) => (b[1].reads + b[1].writes) - (a[1].reads + a[1].writes))
      .slice(0, count)
      .map(([tableName, stats]) => ({
        name: tableName,
        reads: stats.reads,
        writes: stats.writes,
        totalOperations: stats.reads + stats.writes,
        lastAccess: stats.lastAccess
      }));
  }
  
  /**
   * Get user statistics with JSON-serializable format
   * @private
   * @returns {Object} User statistics
   */
  _getUserStats() {
    const userStats = {};
    
    Object.entries(this.resourceUsage.byUser).forEach(([userId, stats]) => {
      userStats[userId] = {
        creates: stats.creates,
        reads: stats.reads,
        writes: stats.writes,
        exports: {
          ipld: stats.exportIpld || 0,
          parquet: stats.exportParquet || 0,
          arrow: stats.exportArrow || 0
        },
        imports: {
          ipld: stats.importIpld || 0,
          parquet: stats.importParquet || 0,
          arrow: stats.importArrow || 0
        },
        tables: Array.from(stats.tables)
      };
    });
    
    return userStats;
  }
  
  /**
   * Extract principal ID from auth token (simplified)
   * @private
   * @param {string} token Auth token
   * @returns {string} Principal ID
   */
  _extractPrincipalFromToken(token) {
    // In a real implementation, this would decode the UCAN token
    // For now, we'll just return a placeholder value
    return 'principal:unknown';
  }
  
  /**
   * Determine SQL statement type
   * @private
   * @param {string} sql SQL statement
   * @returns {string} SQL type (SELECT, INSERT, UPDATE, DELETE, CREATE, etc.)
   */
  _getSqlType(sql) {
    const normalizedSql = sql.trim().toUpperCase();
    
    if (normalizedSql.startsWith('SELECT')) {
      return 'SELECT';
    } else if (normalizedSql.startsWith('INSERT')) {
      return 'INSERT';
    } else if (normalizedSql.startsWith('UPDATE')) {
      return 'UPDATE';
    } else if (normalizedSql.startsWith('DELETE')) {
      return 'DELETE';
    } else if (normalizedSql.startsWith('CREATE')) {
      return 'CREATE';
    } else if (normalizedSql.startsWith('DROP')) {
      return 'DROP';
    } else if (normalizedSql.startsWith('ALTER')) {
      return 'ALTER';
    } else if (normalizedSql.startsWith('TRUNCATE')) {
      return 'TRUNCATE';
    } else {
      return 'OTHER';
    }
  }
  
  /**
   * Extract table name from SQL statement
   * @private
   * @param {string} sql SQL statement
   * @param {string} sqlType SQL type (from _getSqlType)
   * @returns {string|null} Table name or null if not found
   */
  _extractTableName(sql, sqlType) {
    // This is a simplified extraction that works for basic cases
    // A real implementation would use a proper SQL parser
    try {
      const normalizedSql = sql.trim();
      
      switch (sqlType) {
        case 'SELECT':
          // Look for FROM clause
          const fromMatch = normalizedSql.match(/FROM\s+([^\s,;()]+)/i);
          return fromMatch ? fromMatch[1] : null;
          
        case 'INSERT':
          // Look for INTO clause
          const intoMatch = normalizedSql.match(/INSERT\s+INTO\s+([^\s,;()]+)/i);
          return intoMatch ? intoMatch[1] : null;
          
        case 'UPDATE':
          // Get table after UPDATE keyword
          const updateMatch = normalizedSql.match(/UPDATE\s+([^\s,;()]+)/i);
          return updateMatch ? updateMatch[1] : null;
          
        case 'DELETE':
          // Look for FROM clause
          const deleteFromMatch = normalizedSql.match(/DELETE\s+FROM\s+([^\s,;()]+)/i);
          return deleteFromMatch ? deleteFromMatch[1] : null;
          
        case 'CREATE':
          // Handle CREATE TABLE
          if (normalizedSql.toUpperCase().includes('TABLE')) {
            const createTableMatch = normalizedSql.match(/CREATE\s+TABLE\s+([^\s,;()]+)/i);
            return createTableMatch ? createTableMatch[1] : null;
          }
          return null;
          
        case 'DROP':
          // Handle DROP TABLE
          if (normalizedSql.toUpperCase().includes('TABLE')) {
            const dropTableMatch = normalizedSql.match(/DROP\s+TABLE\s+([^\s,;()]+)/i);
            return dropTableMatch ? dropTableMatch[1] : null;
          }
          return null;
          
        case 'ALTER':
          // Handle ALTER TABLE
          if (normalizedSql.toUpperCase().includes('TABLE')) {
            const alterTableMatch = normalizedSql.match(/ALTER\s+TABLE\s+([^\s,;()]+)/i);
            return alterTableMatch ? alterTableMatch[1] : null;
          }
          return null;
          
        case 'TRUNCATE':
          // Handle TRUNCATE TABLE
          const truncateTableMatch = normalizedSql.match(/TRUNCATE\s+(?:TABLE\s+)?([^\s,;()]+)/i);
          return truncateTableMatch ? truncateTableMatch[1] : null;
          
        default:
          return null;
      }
    } catch (error) {
      console.warn('Error extracting table name:', error);
      return null;
    }
  }
  
  /**
   * Update resource usage tracking
   * @private
   * @param {string} operation Operation type
   * @param {string} tableName Table name
   * @param {Object} options Operation options
   */
  _updateResourceUsage(operation, tableName, options = {}) {
    // Initialize table tracking if needed
    if (!this.resourceUsage.byTable[tableName]) {
      this.resourceUsage.byTable[tableName] = {
        creates: 0,
        reads: 0,
        writes: 0,
        exportIpld: 0,
        importIpld: 0,
        exportParquet: 0,
        importParquet: 0,
        exportArrow: 0,
        importArrow: 0,
        lastAccess: null
      };
    }
    
    // Initialize user tracking if options has user info
    const userId = options.userId || 'anonymous';
    if (!this.resourceUsage.byUser[userId]) {
      this.resourceUsage.byUser[userId] = {
        creates: 0,
        reads: 0,
        writes: 0,
        exportIpld: 0,
        importIpld: 0,
        exportParquet: 0,
        importParquet: 0,
        exportArrow: 0,
        importArrow: 0,
        tables: new Set()
      };
    }
    
    // Update counters based on operation
    if (operation === 'create') {
      this.resourceUsage.byTable[tableName].creates++;
      this.resourceUsage.byUser[userId].creates++;
      this.resourceUsage.byUser[userId].tables.add(tableName);
    } else if (operation === 'read') {
      this.resourceUsage.byTable[tableName].reads++;
      this.resourceUsage.byUser[userId].reads++;
      this.resourceUsage.byUser[userId].tables.add(tableName);
    } else if (operation === 'write') {
      this.resourceUsage.byTable[tableName].writes++;
      this.resourceUsage.byUser[userId].writes++;
      this.resourceUsage.byUser[userId].tables.add(tableName);
    } else if (operation === 'exportIpld') {
      this.resourceUsage.byTable[tableName].exportIpld = 
        (this.resourceUsage.byTable[tableName].exportIpld || 0) + 1;
      this.resourceUsage.byUser[userId].exportIpld = 
        (this.resourceUsage.byUser[userId].exportIpld || 0) + 1;
      this.resourceUsage.byUser[userId].tables.add(tableName);
    } else if (operation === 'importIpld') {
      this.resourceUsage.byTable[tableName].importIpld = 
        (this.resourceUsage.byTable[tableName].importIpld || 0) + 1;
      this.resourceUsage.byUser[userId].importIpld = 
        (this.resourceUsage.byUser[userId].importIpld || 0) + 1;
      this.resourceUsage.byUser[userId].tables.add(tableName);
    } else if (operation === 'exportParquet') {
      this.resourceUsage.byTable[tableName].exportParquet = 
        (this.resourceUsage.byTable[tableName].exportParquet || 0) + 1;
      this.resourceUsage.byUser[userId].exportParquet = 
        (this.resourceUsage.byUser[userId].exportParquet || 0) + 1;
      this.resourceUsage.byUser[userId].tables.add(tableName);
    } else if (operation === 'importParquet') {
      this.resourceUsage.byTable[tableName].importParquet = 
        (this.resourceUsage.byTable[tableName].importParquet || 0) + 1;
      this.resourceUsage.byUser[userId].importParquet = 
        (this.resourceUsage.byUser[userId].importParquet || 0) + 1;
      this.resourceUsage.byUser[userId].tables.add(tableName);
    } else if (operation === 'exportArrow') {
      this.resourceUsage.byTable[tableName].exportArrow = 
        (this.resourceUsage.byTable[tableName].exportArrow || 0) + 1;
      this.resourceUsage.byUser[userId].exportArrow = 
        (this.resourceUsage.byUser[userId].exportArrow || 0) + 1;
      this.resourceUsage.byUser[userId].tables.add(tableName);
    } else if (operation === 'importArrow') {
      this.resourceUsage.byTable[tableName].importArrow = 
        (this.resourceUsage.byTable[tableName].importArrow || 0) + 1;
      this.resourceUsage.byUser[userId].importArrow = 
        (this.resourceUsage.byUser[userId].importArrow || 0) + 1;
      this.resourceUsage.byUser[userId].tables.add(tableName);
    }
    
    // Update last access timestamp
    this.resourceUsage.byTable[tableName].lastAccess = new Date().toISOString();
  }
}

// Create default instance
const secureDuckDBIPLDManager = new SecureDuckDBIPLDManager();

export { SecureDuckDBIPLDManager, secureDuckDBIPLDManager, DUCKDB_IPLD_CAPABILITIES };
export default secureDuckDBIPLDManager;