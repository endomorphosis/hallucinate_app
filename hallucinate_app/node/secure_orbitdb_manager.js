/**
 * Secure OrbitDB Manager Module
 * 
 * Provides capability-based secure access to OrbitDB operations
 * Integrates with UCAN authentication for decentralized auth
 * Implements proper error handling and access control
 */

import { authManager } from './auth.js';
import { orbitdbKit } from './orbitdb_kit.js';

// Define capability namespaces for OrbitDB operations
const ORBITDB_CAPABILITIES = {
  CREATE: 'orbitdb:create',
  OPEN: 'orbitdb:open',
  WRITE: 'orbitdb:write',
  READ: 'orbitdb:read',
  CLOSE: 'orbitdb:close',
  REPLICATE: 'orbitdb:replicate',
  ADMIN: 'orbitdb:admin',
};

class SecureOrbitDBManager {
  /**
   * Create a new SecureOrbitDBManager instance
   * @param {Object} resources Resource pool
   * @param {Object} metadata Configuration metadata
   */
  constructor(resources = {}, metadata = {}) {
    this.resources = resources;
    this.metadata = metadata;
    
    // Use resources if provided, otherwise use default instances
    this.auth = resources.auth || authManager;
    this.orbitdbManager = resources.orbitdb || orbitdbKit;
    
    this.initialized = false;
    
    // Cache for tracking databases and their capabilities
    this.dbAccessCache = new Map();
    this.dbOpenRequests = new Map();
    
    // Operational stats
    this.stats = {
      accessGranted: 0,
      accessDenied: 0,
      databasesCreated: 0,
      databasesOpened: 0,
      writeOperations: 0,
      readOperations: 0,
      replicationEvents: 0,
      lastRequest: null
    };
    
    // Resource usage monitoring
    this.resourceUsage = {
      byDatabase: {},
      byUser: {}
    };
    
    console.log('Secure OrbitDB Manager initialized');
  }
  
  /**
   * Initialize the secure OrbitDB manager
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    try {
      // Ensure auth manager is initialized
      if (!this.auth.initialized) {
        await this.auth.init();
      }
      
      // Initialize underlying OrbitDB manager if needed
      if (this.orbitdbManager && typeof this.orbitdbManager.init === 'function') {
        await this.orbitdbManager.init();
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize secure OrbitDB manager:', error);
      return false;
    }
  }
  
  /**
   * Securely create an OrbitDB database with capability verification
   * @param {string} name Database name
   * @param {string} type Database type (keyvalue, docstore, eventlog, feed, counter)
   * @param {Object} options Creation options including authToken for authorization
   * @returns {Promise<Object>} Creation result
   */
  async createDatabase(name, type, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure OrbitDB manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'createDatabase',
      name,
      type,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, createOptions = {} } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for OrbitDB database creation');
      }
      
      // Verify capability token for database creation
      const capabilityString = `${ORBITDB_CAPABILITIES.CREATE}:${name}`;
      let isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check if a broader orbitdb:create:* capability exists
        const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.CREATE}:*`);
        
        if (!wildcardAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized database creation attempt for ${name}`);
          throw new Error(`Not authorized to create database: ${name}`);
        } else {
          isAuthorized = true;
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying OrbitDB manager
      let result;
      if (this.orbitdbManager && typeof this.orbitdbManager.createDatabase === 'function') {
        result = await this.orbitdbManager.createDatabase(name, type, createOptions);
        
        if (result && !result.error && result.address) {
          const address = result.address;
          
          // Update cache with successful creation
          this.dbAccessCache.set(address, {
            name,
            type,
            createdAt: new Date().toISOString(),
            createdBy: this._extractPrincipalFromToken(authToken),
            token: authToken,
            lastUsed: new Date().toISOString()
          });
          
          // Update stats
          this.stats.databasesCreated++;
          this._updateResourceUsage('create', address, options);
        }
      } else {
        // Mock implementation if no OrbitDB manager available
        const mockAddress = `/orbitdb/${Buffer.from(name).toString('hex')}/mock-${type}-${Date.now()}`;
        result = {
          success: true,
          name,
          type,
          address: mockAddress,
          mock: true
        };
        
        // Update cache with mock creation
        this.dbAccessCache.set(mockAddress, {
          name,
          type,
          createdAt: new Date().toISOString(),
          createdBy: this._extractPrincipalFromToken(authToken),
          token: authToken,
          lastUsed: new Date().toISOString(),
          mock: true
        });
        
        // Update stats
        this.stats.databasesCreated++;
        this._updateResourceUsage('create', mockAddress, options);
      }
      
      return result;
    } catch (error) {
      console.error('Secure OrbitDB database creation failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely open an OrbitDB database with capability verification
   * @param {string} address OrbitDB address to open
   * @param {Object} options Open options including authToken for authorization
   * @returns {Promise<Object>} Database instance result
   */
  async openDatabase(address, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure OrbitDB manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'openDatabase',
      address,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, openOptions = {} } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for opening OrbitDB database');
      }
      
      // Extract name from address if possible
      const dbName = address.split('/').pop() || address;
      
      // Verify capability token for database opening
      const capabilityString = `${ORBITDB_CAPABILITIES.OPEN}:${dbName}`;
      let isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check for address-based capability
        const addressCapability = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.OPEN}:${address}`);
        
        if (!addressCapability) {
          // Check if a broader orbitdb:open:* capability exists
          const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.OPEN}:*`);
          
          if (!wildcardAuthorized) {
            this.stats.accessDenied++;
            console.warn(`Unauthorized database open attempt for ${address}`);
            throw new Error(`Not authorized to open database: ${address}`);
          } else {
            isAuthorized = true;
          }
        } else {
          isAuthorized = true;
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Track pending open requests
      this.dbOpenRequests.set(address, {
        requestedAt: new Date().toISOString(),
        requestedBy: this._extractPrincipalFromToken(authToken),
        token: authToken
      });
      
      // Call underlying OrbitDB manager
      let result;
      if (this.orbitdbManager && typeof this.orbitdbManager.openDatabase === 'function') {
        result = await this.orbitdbManager.openDatabase(address, openOptions);
        
        if (result && !result.error) {
          // Update cache with successful open
          if (!this.dbAccessCache.has(address)) {
            this.dbAccessCache.set(address, {
              name: dbName,
              address: address,
              createdAt: 'unknown',
              createdBy: 'unknown',
              lastUsed: new Date().toISOString()
            });
          } else {
            // Update last used timestamp
            const dbInfo = this.dbAccessCache.get(address);
            dbInfo.lastUsed = new Date().toISOString();
            this.dbAccessCache.set(address, dbInfo);
          }
          
          // Update stats
          this.stats.databasesOpened++;
          this._updateResourceUsage('open', address, options);
        }
      } else {
        // Mock implementation if no OrbitDB manager available
        result = {
          success: true,
          address,
          name: dbName,
          mock: true,
          dbInstance: {
            address,
            type: 'mock',
            get: () => null,
            put: () => 'mock-hash',
            add: () => 'mock-hash'
          }
        };
        
        // Update cache with mock open
        if (!this.dbAccessCache.has(address)) {
          this.dbAccessCache.set(address, {
            name: dbName,
            address: address,
            createdAt: new Date().toISOString(),
            createdBy: this._extractPrincipalFromToken(authToken),
            lastUsed: new Date().toISOString(),
            mock: true
          });
        } else {
          // Update last used timestamp
          const dbInfo = this.dbAccessCache.get(address);
          dbInfo.lastUsed = new Date().toISOString();
          this.dbAccessCache.set(address, dbInfo);
        }
        
        // Update stats
        this.stats.databasesOpened++;
        this._updateResourceUsage('open', address, options);
      }
      
      // Clean up open request
      this.dbOpenRequests.delete(address);
      
      return result;
    } catch (error) {
      // Clean up open request
      this.dbOpenRequests.delete(address);
      
      console.error('Secure OrbitDB database opening failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely write to an OrbitDB database with capability verification
   * @param {string} address OrbitDB address to write to
   * @param {string} operation Write operation (put, add, inc, etc.)
   * @param {any} data Data to write
   * @param {Object} options Write options including authToken for authorization
   * @returns {Promise<Object>} Write result
   */
  async write(address, operation, data, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure OrbitDB manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'write',
      address,
      operation,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, key, writeOptions = {} } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for OrbitDB write operations');
      }
      
      // Extract name from address if possible
      const dbName = address.split('/').pop() || address;
      
      // Verify capability token for database writing
      const capabilityString = `${ORBITDB_CAPABILITIES.WRITE}:${dbName}`;
      let isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check for address-based capability
        const addressCapability = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.WRITE}:${address}`);
        
        if (!addressCapability) {
          // Check if a broader orbitdb:write:* capability exists
          const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.WRITE}:*`);
          
          if (!wildcardAuthorized) {
            this.stats.accessDenied++;
            console.warn(`Unauthorized database write attempt for ${address}`);
            throw new Error(`Not authorized to write to database: ${address}`);
          } else {
            isAuthorized = true;
          }
        } else {
          isAuthorized = true;
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Update last used timestamp in cache
      if (this.dbAccessCache.has(address)) {
        const dbInfo = this.dbAccessCache.get(address);
        dbInfo.lastUsed = new Date().toISOString();
        this.dbAccessCache.set(address, dbInfo);
      }
      
      // Call underlying OrbitDB manager
      let result;
      if (this.orbitdbManager && typeof this.orbitdbManager.write === 'function') {
        result = await this.orbitdbManager.write(address, operation, data, key, writeOptions);
        
        if (result && !result.error) {
          // Update stats
          this.stats.writeOperations++;
          this._updateResourceUsage('write', address, options);
        }
      } else {
        // Mock implementation if no OrbitDB manager available
        const mockHash = `z${Buffer.from(JSON.stringify({ address, operation, data, key })).toString('base64').substring(0, 43)}`;
        
        result = {
          success: true,
          hash: mockHash,
          operation,
          address,
          mock: true
        };
        
        // Update stats
        this.stats.writeOperations++;
        this._updateResourceUsage('write', address, options);
      }
      
      return result;
    } catch (error) {
      console.error('Secure OrbitDB write operation failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely read from an OrbitDB database with capability verification
   * @param {string} address OrbitDB address to read from
   * @param {string} operation Read operation (get, query, iterator, etc.)
   * @param {any} key Key or query parameters for read operation
   * @param {Object} options Read options including authToken for authorization
   * @returns {Promise<Object>} Read result
   */
  async read(address, operation, key = null, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure OrbitDB manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'read',
      address,
      operation,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, readOptions = {} } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for OrbitDB read operations');
      }
      
      // Extract name from address if possible
      const dbName = address.split('/').pop() || address;
      
      // Verify capability token for database reading
      const capabilityString = `${ORBITDB_CAPABILITIES.READ}:${dbName}`;
      let isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check for address-based capability
        const addressCapability = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.READ}:${address}`);
        
        if (!addressCapability) {
          // Check if a broader orbitdb:read:* capability exists
          const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.READ}:*`);
          
          if (!wildcardAuthorized) {
            this.stats.accessDenied++;
            console.warn(`Unauthorized database read attempt for ${address}`);
            throw new Error(`Not authorized to read from database: ${address}`);
          } else {
            isAuthorized = true;
          }
        } else {
          isAuthorized = true;
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Update last used timestamp in cache
      if (this.dbAccessCache.has(address)) {
        const dbInfo = this.dbAccessCache.get(address);
        dbInfo.lastUsed = new Date().toISOString();
        this.dbAccessCache.set(address, dbInfo);
      }
      
      // Call underlying OrbitDB manager
      let result;
      if (this.orbitdbManager && typeof this.orbitdbManager.read === 'function') {
        result = await this.orbitdbManager.read(address, operation, key, readOptions);
        
        if (result !== undefined) {
          // Update stats
          this.stats.readOperations++;
          this._updateResourceUsage('read', address, options);
        }
      } else {
        // Mock implementation if no OrbitDB manager available
        if (operation === 'get') {
          result = key ? { id: key, value: `mock-value-for-${key}` } : null;
        } else if (operation === 'query') {
          result = [{ id: 'mock1', value: 'Mock data 1' }, { id: 'mock2', value: 'Mock data 2' }];
        } else if (operation === 'iterator') {
          result = {
            collect: () => [{ id: 'mock1', value: 'Mock data 1' }, { id: 'mock2', value: 'Mock data 2' }],
            next: () => ({ id: 'mock1', value: 'Mock data 1' }),
            hasNext: () => false
          };
        } else {
          result = null;
        }
        
        // Update stats
        this.stats.readOperations++;
        this._updateResourceUsage('read', address, options);
      }
      
      return {
        success: true,
        address,
        operation,
        key,
        result,
        mock: !this.orbitdbManager || typeof this.orbitdbManager.read !== 'function'
      };
    } catch (error) {
      console.error('Secure OrbitDB read operation failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely close an OrbitDB database with capability verification
   * @param {string} address OrbitDB address to close
   * @param {Object} options Close options including authToken for authorization
   * @returns {Promise<Object>} Close result
   */
  async closeDatabase(address, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure OrbitDB manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'closeDatabase',
      address,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for closing OrbitDB database');
      }
      
      // Extract name from address if possible
      const dbName = address.split('/').pop() || address;
      
      // Verify capability token for database closing
      const capabilityString = `${ORBITDB_CAPABILITIES.CLOSE}:${dbName}`;
      let isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check for address-based capability
        const addressCapability = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.CLOSE}:${address}`);
        
        if (!addressCapability) {
          // Check for write capability (which implies close capability)
          const writeCapability = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.WRITE}:${dbName}`);
          const writeAddressCapability = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.WRITE}:${address}`);
          
          if (!writeCapability && !writeAddressCapability) {
            // Check for wildcard capabilities
            const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.CLOSE}:*`);
            const writeWildcardAuthorized = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.WRITE}:*`);
            
            if (!wildcardAuthorized && !writeWildcardAuthorized) {
              this.stats.accessDenied++;
              console.warn(`Unauthorized database close attempt for ${address}`);
              throw new Error(`Not authorized to close database: ${address}`);
            } else {
              isAuthorized = true;
            }
          } else {
            isAuthorized = true;
          }
        } else {
          isAuthorized = true;
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying OrbitDB manager
      let result;
      if (this.orbitdbManager && typeof this.orbitdbManager.closeDatabase === 'function') {
        result = await this.orbitdbManager.closeDatabase(address);
      } else {
        // Mock implementation if no OrbitDB manager available
        result = {
          success: true,
          address,
          mock: true
        };
      }
      
      // Update last used timestamp in cache before removing
      if (this.dbAccessCache.has(address)) {
        const dbInfo = this.dbAccessCache.get(address);
        dbInfo.lastUsed = new Date().toISOString();
        dbInfo.closed = true;
        this.dbAccessCache.set(address, dbInfo);
      }
      
      return result;
    } catch (error) {
      console.error('Secure OrbitDB database closing failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely replicate an OrbitDB database with capability verification
   * @param {string} address OrbitDB address to replicate
   * @param {Object} options Replication options including authToken for authorization
   * @returns {Promise<Object>} Replication result
   */
  async replicateDatabase(address, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure OrbitDB manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'replicateDatabase',
      address,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, replicationOptions = {} } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for OrbitDB database replication');
      }
      
      // Extract name from address if possible
      const dbName = address.split('/').pop() || address;
      
      // Verify capability token for database replication
      const capabilityString = `${ORBITDB_CAPABILITIES.REPLICATE}:${dbName}`;
      let isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check for address-based capability
        const addressCapability = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.REPLICATE}:${address}`);
        
        if (!addressCapability) {
          // Check if a broader orbitdb:replicate:* capability exists
          const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.REPLICATE}:*`);
          
          if (!wildcardAuthorized) {
            this.stats.accessDenied++;
            console.warn(`Unauthorized database replication attempt for ${address}`);
            throw new Error(`Not authorized to replicate database: ${address}`);
          } else {
            isAuthorized = true;
          }
        } else {
          isAuthorized = true;
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Update last used timestamp in cache
      if (this.dbAccessCache.has(address)) {
        const dbInfo = this.dbAccessCache.get(address);
        dbInfo.lastUsed = new Date().toISOString();
        this.dbAccessCache.set(address, dbInfo);
      }
      
      // Call underlying OrbitDB manager
      let result;
      if (this.orbitdbManager && typeof this.orbitdbManager.replicateDatabase === 'function') {
        result = await this.orbitdbManager.replicateDatabase(address, replicationOptions);
        
        if (result && !result.error) {
          // Update stats
          this.stats.replicationEvents++;
          this._updateResourceUsage('replicate', address, options);
        }
      } else {
        // Mock implementation if no OrbitDB manager available
        result = {
          success: true,
          address,
          peers: ['QmMock1', 'QmMock2'],
          progress: 100,
          mock: true
        };
        
        // Update stats
        this.stats.replicationEvents++;
        this._updateResourceUsage('replicate', address, options);
      }
      
      return result;
    } catch (error) {
      console.error('Secure OrbitDB database replication failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely list OrbitDB databases with capability verification
   * @param {Object} options List options including authToken for authorization
   * @returns {Promise<Object>} List of databases
   */
  async listDatabases(options = {}) {
    if (!this.initialized) {
      throw new Error('Secure OrbitDB manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'listDatabases',
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for listing OrbitDB databases');
      }
      
      // Verify capability token for database listing (admin capability)
      const capabilityString = `${ORBITDB_CAPABILITIES.ADMIN}:list`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        this.stats.accessDenied++;
        console.warn('Unauthorized database listing attempt');
        throw new Error('Not authorized to list OrbitDB databases');
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying OrbitDB manager if available
      let externalDatabases = {};
      if (this.orbitdbManager && typeof this.orbitdbManager.listDatabases === 'function') {
        try {
          const externalList = await this.orbitdbManager.listDatabases();
          if (externalList && !externalList.error && externalList.databases) {
            externalDatabases = externalList.databases;
          }
        } catch (error) {
          console.warn('Error listing databases from OrbitDB manager:', error);
        }
      }
      
      // Merge external databases with cache
      const databases = {};
      
      // Add all cached databases
      for (const [address, dbInfo] of this.dbAccessCache.entries()) {
        databases[address] = {
          address,
          name: dbInfo.name,
          createdAt: dbInfo.createdAt,
          createdBy: dbInfo.createdBy,
          lastUsed: dbInfo.lastUsed,
          type: dbInfo.type || 'unknown',
          closed: dbInfo.closed || false,
          mock: dbInfo.mock || false
        };
      }
      
      // Add any external databases not in cache
      for (const [address, dbInfo] of Object.entries(externalDatabases)) {
        if (!databases[address]) {
          databases[address] = dbInfo;
          
          // Add to cache
          this.dbAccessCache.set(address, {
            name: dbInfo.name || address.split('/').pop() || address,
            type: dbInfo.type || 'unknown',
            createdAt: dbInfo.createdAt || new Date().toISOString(),
            createdBy: dbInfo.createdBy || 'unknown',
            lastUsed: new Date().toISOString()
          });
        }
      }
      
      return {
        success: true,
        databases,
        count: Object.keys(databases).length
      };
    } catch (error) {
      console.error('Secure OrbitDB database listing failed:', error);
      throw error;
    }
  }
  
  /**
   * Get database information with capability verification
   * @param {string} address OrbitDB address to get info about
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Database information
   */
  async getDatabaseInfo(address, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure OrbitDB manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'getDatabaseInfo',
      address,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for getting database info');
      }
      
      // Extract name from address if possible
      const dbName = address.split('/').pop() || address;
      
      // Verify capability token for database reading (read access implies info access)
      const capabilityString = `${ORBITDB_CAPABILITIES.READ}:${dbName}`;
      let isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check for address-based capability
        const addressCapability = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.READ}:${address}`);
        
        if (!addressCapability) {
          // Check for admin capability
          const adminCapability = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.ADMIN}:*`);
          
          if (!adminCapability) {
            // Check for wildcard read capability
            const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${ORBITDB_CAPABILITIES.READ}:*`);
            
            if (!wildcardAuthorized) {
              this.stats.accessDenied++;
              console.warn(`Unauthorized database info request for ${address}`);
              throw new Error(`Not authorized to get info for database: ${address}`);
            } else {
              isAuthorized = true;
            }
          } else {
            isAuthorized = true;
          }
        } else {
          isAuthorized = true;
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Update last used timestamp in cache
      let cachedInfo = null;
      if (this.dbAccessCache.has(address)) {
        const dbInfo = this.dbAccessCache.get(address);
        dbInfo.lastUsed = new Date().toISOString();
        this.dbAccessCache.set(address, dbInfo);
        cachedInfo = dbInfo;
      }
      
      // Get info from underlying OrbitDB manager if available
      let externalInfo = null;
      if (this.orbitdbManager && typeof this.orbitdbManager.getDatabaseInfo === 'function') {
        try {
          externalInfo = await this.orbitdbManager.getDatabaseInfo(address);
        } catch (error) {
          console.warn(`Error getting database info for ${address} from OrbitDB manager:`, error);
        }
      }
      
      // Combine cached and external info, preferring external if available
      const info = {
        address,
        name: dbName,
        type: 'unknown',
        createdAt: 'unknown',
        createdBy: 'unknown',
        lastUsed: new Date().toISOString(),
        ...cachedInfo,
        ...(externalInfo && !externalInfo.error ? externalInfo : {})
      };
      
      // Update stats
      this.stats.readOperations++;
      this._updateResourceUsage('info', address, options);
      
      return {
        success: true,
        info,
        mock: !externalInfo && (!this.orbitdbManager || typeof this.orbitdbManager.getDatabaseInfo !== 'function')
      };
    } catch (error) {
      console.error('Secure OrbitDB get database info failed:', error);
      throw error;
    }
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
   * Update resource usage tracking
   * @private
   * @param {string} operation Operation type
   * @param {string} address Database address
   * @param {Object} options Operation options
   */
  _updateResourceUsage(operation, address, options = {}) {
    // Initialize database tracking if needed
    if (!this.resourceUsage.byDatabase[address]) {
      this.resourceUsage.byDatabase[address] = {
        creates: 0,
        opens: 0,
        writes: 0,
        reads: 0,
        replications: 0,
        lastAccess: null
      };
    }
    
    // Initialize user tracking if options has user info
    const userId = options.userId || 'anonymous';
    if (!this.resourceUsage.byUser[userId]) {
      this.resourceUsage.byUser[userId] = {
        creates: 0,
        opens: 0,
        writes: 0,
        reads: 0,
        replications: 0,
        databases: new Set()
      };
    }
    
    // Update counters based on operation
    if (operation === 'create') {
      this.resourceUsage.byDatabase[address].creates++;
      this.resourceUsage.byUser[userId].creates++;
      this.resourceUsage.byUser[userId].databases.add(address);
    } else if (operation === 'open') {
      this.resourceUsage.byDatabase[address].opens++;
      this.resourceUsage.byUser[userId].opens++;
      this.resourceUsage.byUser[userId].databases.add(address);
    } else if (operation === 'write') {
      this.resourceUsage.byDatabase[address].writes++;
      this.resourceUsage.byUser[userId].writes++;
      this.resourceUsage.byUser[userId].databases.add(address);
    } else if (operation === 'read' || operation === 'info') {
      this.resourceUsage.byDatabase[address].reads++;
      this.resourceUsage.byUser[userId].reads++;
      this.resourceUsage.byUser[userId].databases.add(address);
    } else if (operation === 'replicate') {
      this.resourceUsage.byDatabase[address].replications++;
      this.resourceUsage.byUser[userId].replications++;
      this.resourceUsage.byUser[userId].databases.add(address);
    }
    
    // Update last access timestamp
    this.resourceUsage.byDatabase[address].lastAccess = new Date().toISOString();
  }
  
  /**
   * Get module statistics
   * @param {Object} options Options for stats retrieval including authToken
   * @returns {Promise<Object>} Module statistics
   */
  async getStats(options = {}) {
    if (!this.initialized) {
      throw new Error('Secure OrbitDB manager not initialized. Call init() first');
    }
    
    try {
      const { authToken } = options;
      
      // Verify capability token for admin access
      const capabilityString = `${ORBITDB_CAPABILITIES.ADMIN}:stats`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        console.warn('Unauthorized stats access attempt');
        throw new Error('Not authorized to access module statistics');
      }
      
      // Return copy of stats
      return {
        ...this.stats,
        databaseCount: this.dbAccessCache.size,
        resourceUsage: {
          databaseCount: Object.keys(this.resourceUsage.byDatabase).length,
          userCount: Object.keys(this.resourceUsage.byUser).length,
          totalWrites: this.stats.writeOperations,
          totalReads: this.stats.readOperations,
          topDatabases: this._getTopDatabases(5),
          byUser: this._getUserStats()
        }
      };
    } catch (error) {
      console.error('Failed to get secure OrbitDB manager stats:', error);
      throw error;
    }
  }
  
  /**
   * Get top N databases by usage
   * @private
   * @param {number} count Number of databases to return
   * @returns {Array} Top databases
   */
  _getTopDatabases(count = 5) {
    return Object.entries(this.resourceUsage.byDatabase)
      .sort((a, b) => (b[1].reads + b[1].writes) - (a[1].reads + a[1].writes))
      .slice(0, count)
      .map(([address, stats]) => ({
        address,
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
        opens: stats.opens,
        writes: stats.writes,
        reads: stats.reads,
        replications: stats.replications,
        databases: Array.from(stats.databases)
      };
    });
    
    return userStats;
  }
  
  /**
   * Run tests on the secure OrbitDB manager
   * @returns {Promise<Object>} Test results
   */
  async test() {
    console.log('Testing secure OrbitDB manager');
    
    try {
      const testResults = {
        success: true,
        module: 'secure_orbitdb_manager',
        initialization: false,
        capability_verification: false,
        database_operations: {
          create: false,
          open: false,
          write: false,
          read: false,
          close: false,
          replicate: false,
          list: false
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
          can: ORBITDB_CAPABILITIES.ADMIN,
          with: '*'
        });
        
        const createToken = await this.auth.issueCapability('root', 'test-user', {
          can: ORBITDB_CAPABILITIES.CREATE,
          with: '*'
        });
        
        const openToken = await this.auth.issueCapability('root', 'test-user', {
          can: ORBITDB_CAPABILITIES.OPEN,
          with: '*'
        });
        
        const writeToken = await this.auth.issueCapability('root', 'test-user', {
          can: ORBITDB_CAPABILITIES.WRITE,
          with: '*'
        });
        
        const readToken = await this.auth.issueCapability('root', 'test-user', {
          can: ORBITDB_CAPABILITIES.READ,
          with: '*'
        });
        
        const closeToken = await this.auth.issueCapability('root', 'test-user', {
          can: ORBITDB_CAPABILITIES.CLOSE,
          with: '*'
        });
        
        const replicateToken = await this.auth.issueCapability('root', 'test-user', {
          can: ORBITDB_CAPABILITIES.REPLICATE,
          with: '*'
        });
        
        // Test capability verification
        try {
          // Test with invalid token (should fail)
          try {
            await this.createDatabase('test-db', 'keyvalue', { authToken: 'invalid-token' });
            testResults.capability_verification = false;
          } catch (error) {
            // This should fail, so it's actually good
            testResults.capability_verification = true;
          }
          
          if (testResults.capability_verification) {
            // Test database operations with valid tokens
            try {
              // Test create database
              const createResult = await this.createDatabase('test-db', 'keyvalue', { 
                authToken: createToken.token,
                userId: 'test-user'
              });
              testResults.database_operations.create = createResult && createResult.address;
              
              if (createResult && createResult.address) {
                const address = createResult.address;
                
                // Test open database
                const openResult = await this.openDatabase(address, { 
                  authToken: openToken.token,
                  userId: 'test-user'
                });
                testResults.database_operations.open = openResult && (openResult.success || openResult.dbInstance);
                
                // Test write operation
                const writeResult = await this.write(address, 'put', { key: 'test-key', value: 'test-value' }, { 
                  authToken: writeToken.token,
                  userId: 'test-user',
                  key: 'test-key'
                });
                testResults.database_operations.write = writeResult && (writeResult.success || writeResult.hash);
                
                // Test read operation
                const readResult = await this.read(address, 'get', 'test-key', { 
                  authToken: readToken.token,
                  userId: 'test-user'
                });
                testResults.database_operations.read = readResult && readResult.success;
                
                // Test replication (may be mock)
                const replicateResult = await this.replicateDatabase(address, { 
                  authToken: replicateToken.token,
                  userId: 'test-user'
                });
                testResults.database_operations.replicate = replicateResult && replicateResult.success;
                
                // Test list databases
                const listResult = await this.listDatabases({ 
                  authToken: adminToken.token 
                });
                testResults.database_operations.list = listResult && 
                  listResult.success && 
                  listResult.databases && 
                  listResult.databases[address];
                
                // Test close database
                const closeResult = await this.closeDatabase(address, { 
                  authToken: closeToken.token,
                  userId: 'test-user'
                });
                testResults.database_operations.close = closeResult && closeResult.success;
                
                // Test stats
                const stats = await this.getStats({ authToken: adminToken.token });
                testResults.stats_tracking = stats && 
                  typeof stats.accessGranted === 'number' && 
                  typeof stats.databasesCreated === 'number' && 
                  typeof stats.writeOperations === 'number' && 
                  typeof stats.readOperations === 'number';
              }
            } catch (error) {
              console.error('Database operations tests failed:', error);
              
              // Mark failed operations
              if (!testResults.database_operations.create) testResults.database_operations.create = false;
              if (!testResults.database_operations.open) testResults.database_operations.open = false;
              if (!testResults.database_operations.write) testResults.database_operations.write = false;
              if (!testResults.database_operations.read) testResults.database_operations.read = false;
              if (!testResults.database_operations.close) testResults.database_operations.close = false;
              if (!testResults.database_operations.replicate) testResults.database_operations.replicate = false;
              if (!testResults.database_operations.list) testResults.database_operations.list = false;
              if (!testResults.stats_tracking) testResults.stats_tracking = false;
            }
          }
        } catch (error) {
          console.error('Capability verification test failed:', error);
        }
      }
      
      // Overall success
      testResults.success = testResults.initialization && 
                          testResults.capability_verification &&
                          Object.values(testResults.database_operations).every(Boolean) &&
                          testResults.stats_tracking;
      
      return testResults;
    } catch (error) {
      console.error('Secure OrbitDB manager test failed:', error);
      return {
        success: false,
        module: 'secure_orbitdb_manager',
        error: error.message
      };
    }
  }
}

// Create default instance
const secureOrbitdbManager = new SecureOrbitDBManager();

export { SecureOrbitDBManager, secureOrbitdbManager, ORBITDB_CAPABILITIES };
export default secureOrbitdbManager;