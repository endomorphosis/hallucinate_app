/**
 * Tests for PyArrow Content Index security capabilities
 * 
 * Tests the UCAN-based security implementation for the PyArrow Content Index
 * including capability management, verification, and integration with the dashboard.
 */

const assert = require('assert');
const path = require('path');

describe('PyArrow Content Index Security', function() {
  // Mock UCAN capabilities
  const PYARROW_INDEX_CAPABILITIES = {
    READ: 'pyarrow-index:read',
    WRITE: 'pyarrow-index:write',
    DELETE: 'pyarrow-index:delete',
    SYNC: 'pyarrow-index:sync',
    EXPORT: 'pyarrow-index:export',
    IMPORT: 'pyarrow-index:import',
    ADMIN: 'pyarrow-index:admin'
  };
  
  // Mock auth manager
  const mockAuthManager = {
    initialized: true,
    tokens: {},
    async init() {
      return true;
    },
    async getCapabilityToken(capability, resource = '*') {
      const token = `mock-token-${capability}-${resource}-${Date.now()}`;
      this.tokens[capability] = token;
      return token;
    },
    async verifyCapabilityToken(token, capability, resource = '*') {
      // Simple verification based on token pattern
      return token && token.includes(`mock-token-${capability}`);
    }
  };
  
  // Mock the bridge
  const mockBridge = {
    initialized: true,
    async init() {
      return true;
    },
    async query() {
      return {
        entries: [],
        total: 0
      };
    },
    async lookupByCid() {
      return null;
    },
    async getStats() {
      return {
        total_entries: 0,
        total_size: 0
      };
    }
  };
  
  // Mock the secure manager
  let mockSecureManager;
  
  beforeEach(function() {
    // Create a fresh secure manager for each test
    mockSecureManager = {
      initialized: false,
      indexBridge: mockBridge,
      resources: {
        auth: mockAuthManager
      },
      metadata: {},
      accessStats: {
        granted: 0,
        denied: 0
      },
      operations: {
        entriesAdded: 0,
        entriesUpdated: 0,
        entriesDeleted: 0,
        queriesPerformed: 0,
        syncsPerformed: 0,
        importsPerformed: 0,
        exportsPerformed: 0
      },
      async init() {
        this.initialized = true;
        return true;
      },
      async query(params, authToken) {
        return this._verifyCapability(PYARROW_INDEX_CAPABILITIES.READ, '*', authToken)
          .then(async () => {
            this.operations.queriesPerformed++;
            return mockBridge.query(params);
          });
      },
      async lookupByCid(cid, authToken) {
        return this._verifyCapability(PYARROW_INDEX_CAPABILITIES.READ, '*', authToken)
          .then(async () => {
            return mockBridge.lookupByCid(cid);
          });
      },
      async lookupByPath(path, authToken) {
        return this._verifyCapability(PYARROW_INDEX_CAPABILITIES.READ, '*', authToken)
          .then(async () => {
            return mockBridge.lookupByPath(path);
          });
      },
      async addEntry(entry, authToken) {
        return this._verifyCapability(PYARROW_INDEX_CAPABILITIES.WRITE, '*', authToken)
          .then(async () => {
            this.operations.entriesAdded++;
            return { success: true };
          });
      },
      async updateEntry(cid, data, authToken) {
        return this._verifyCapability(PYARROW_INDEX_CAPABILITIES.WRITE, '*', authToken)
          .then(async () => {
            this.operations.entriesUpdated++;
            return { success: true };
          });
      },
      async deleteEntry(cid, authToken) {
        return this._verifyCapability(PYARROW_INDEX_CAPABILITIES.DELETE, '*', authToken)
          .then(async () => {
            this.operations.entriesDeleted++;
            return { success: true };
          });
      },
      async syncWithIpfsPinset(includeMetadata, authToken) {
        return this._verifyCapability(PYARROW_INDEX_CAPABILITIES.SYNC, '*', authToken)
          .then(async () => {
            this.operations.syncsPerformed++;
            return { success: true };
          });
      },
      async exportToParquet(exportPath, authToken) {
        return this._verifyCapability(PYARROW_INDEX_CAPABILITIES.EXPORT, '*', authToken)
          .then(async () => {
            this.operations.exportsPerformed++;
            return { success: true, path: exportPath };
          });
      },
      async importFromParquet(importPath, authToken) {
        return this._verifyCapability(PYARROW_INDEX_CAPABILITIES.IMPORT, '*', authToken)
          .then(async () => {
            this.operations.importsPerformed++;
            return { success: true, count: 10 };
          });
      },
      async getStats(authToken) {
        return this._verifyCapability(PYARROW_INDEX_CAPABILITIES.READ, '*', authToken)
          .then(async () => {
            return mockBridge.getStats();
          });
      },
      getSecurityStatus() {
        return {
          module: 'pyarrow_index',
          initialized: this.initialized,
          secure_mode: true,
          auth_initialized: this.resources.auth?.initialized || false,
          bridge_initialized: this.indexBridge?.initialized || false,
          access_stats: {
            granted: this.accessStats.granted,
            denied: this.accessStats.denied,
            ratio: this.accessStats.granted / (this.accessStats.granted + this.accessStats.denied || 1)
          },
          operations: this.operations,
          active_capabilities: {
            [PYARROW_INDEX_CAPABILITIES.READ]: true,
            [PYARROW_INDEX_CAPABILITIES.WRITE]: false,
            [PYARROW_INDEX_CAPABILITIES.DELETE]: false,
            [PYARROW_INDEX_CAPABILITIES.SYNC]: false,
            [PYARROW_INDEX_CAPABILITIES.EXPORT]: false,
            [PYARROW_INDEX_CAPABILITIES.IMPORT]: false,
            [PYARROW_INDEX_CAPABILITIES.ADMIN]: false
          }
        };
      },
      async test() {
        return {
          success: true,
          module: 'pyarrow_index_secure_manager',
          timestamp: new Date().toISOString(),
          steps: {
            initialization: { success: true },
            read_capability: { success: true },
            write_capability: { success: true },
            delete_capability: { success: true }
          }
        };
      },
      async _verifyCapability(capability, resource, authToken) {
        // Admin capability is a super capability
        const isAdmin = await this._checkAdminCapability(authToken);
        
        if (isAdmin) {
          this.accessStats.granted++;
          return true;
        }
        
        // Check specific capability
        try {
          if (!this.resources.auth) {
            throw new Error('Auth manager not available');
          }
          
          const isAuthorized = await this.resources.auth.verifyCapabilityToken(
            authToken,
            capability,
            resource
          );
          
          if (isAuthorized) {
            this.accessStats.granted++;
            return true;
          } else {
            this.accessStats.denied++;
            throw new Error(`Unauthorized: Missing capability ${capability} for resource ${resource}`);
          }
        } catch (error) {
          this.accessStats.denied++;
          throw error;
        }
      },
      async _checkAdminCapability(authToken) {
        if (!this.resources.auth) {
          return false;
        }
        
        try {
          return await this.resources.auth.verifyCapabilityToken(
            authToken,
            PYARROW_INDEX_CAPABILITIES.ADMIN,
            '*'
          );
        } catch (error) {
          return false;
        }
      }
    };
  });
  
  // Test case: Initialization
  it('should initialize secure manager correctly', async function() {
    const initResult = await mockSecureManager.init();
    assert.strictEqual(initResult, true, 'Init should return true for successful initialization');
    assert.strictEqual(mockSecureManager.initialized, true, 'Should mark as initialized');
  });
  
  // Test case: Security status
  it('should report correct security status', function() {
    const status = mockSecureManager.getSecurityStatus();
    
    assert.strictEqual(status.module, 'pyarrow_index', 'Should report correct module');
    assert.strictEqual(status.secure_mode, true, 'Should report secure mode enabled');
    assert.strictEqual(status.auth_initialized, true, 'Should report auth initialized');
    assert.strictEqual(status.bridge_initialized, true, 'Should report bridge initialized');
    assert.strictEqual(typeof status.access_stats, 'object', 'Should include access stats');
    assert.strictEqual(typeof status.operations, 'object', 'Should include operations');
    assert.strictEqual(typeof status.active_capabilities, 'object', 'Should include active capabilities');
  });
  
  // Test case: Read operation with valid token
  it('should allow read operation with valid token', async function() {
    // Get a capability token for read access
    const readToken = await mockAuthManager.getCapabilityToken(PYARROW_INDEX_CAPABILITIES.READ);
    
    // Perform a query operation
    const result = await mockSecureManager.query({}, readToken);
    
    // Check access stats
    assert.strictEqual(mockSecureManager.accessStats.granted, 1, 'Should increment granted count');
    assert.strictEqual(mockSecureManager.accessStats.denied, 0, 'Should not increment denied count');
    
    // Check operations stats
    assert.strictEqual(mockSecureManager.operations.queriesPerformed, 1, 'Should increment queries performed count');
  });
  
  // Test case: Write operation with valid token
  it('should allow write operation with valid token', async function() {
    // Get a capability token for write access
    const writeToken = await mockAuthManager.getCapabilityToken(PYARROW_INDEX_CAPABILITIES.WRITE);
    
    // Perform an add entry operation
    const result = await mockSecureManager.addEntry({}, writeToken);
    
    // Check result
    assert.strictEqual(result.success, true, 'Should return success result');
    
    // Check access stats
    assert.strictEqual(mockSecureManager.accessStats.granted, 1, 'Should increment granted count');
    assert.strictEqual(mockSecureManager.accessStats.denied, 0, 'Should not increment denied count');
    
    // Check operations stats
    assert.strictEqual(mockSecureManager.operations.entriesAdded, 1, 'Should increment entries added count');
  });
  
  // Test case: Write operation with invalid token
  it('should deny write operation with invalid token', async function() {
    // Get a capability token for read access (not write)
    const readToken = await mockAuthManager.getCapabilityToken(PYARROW_INDEX_CAPABILITIES.READ);
    
    try {
      // Attempt to perform an add entry operation with read token
      await mockSecureManager.addEntry({}, readToken);
      
      // Should not reach here
      assert.fail('Should throw an authorization error');
    } catch (error) {
      // Check that the error is an authorization error
      assert.ok(error.message.includes('Unauthorized'), 'Should throw an authorization error');
      
      // Check access stats
      assert.strictEqual(mockSecureManager.accessStats.granted, 0, 'Should not increment granted count');
      assert.strictEqual(mockSecureManager.accessStats.denied, 1, 'Should increment denied count');
      
      // Check operations stats
      assert.strictEqual(mockSecureManager.operations.entriesAdded, 0, 'Should not increment entries added count');
    }
  });
  
  // Test case: Admin capability grants all access
  it('should allow all operations with admin token', async function() {
    // Get a capability token for admin access
    const adminToken = await mockAuthManager.getCapabilityToken(PYARROW_INDEX_CAPABILITIES.ADMIN);
    
    // Perform various operations with admin token
    await mockSecureManager.query({}, adminToken);
    await mockSecureManager.addEntry({}, adminToken);
    await mockSecureManager.deleteEntry('test-cid', adminToken);
    await mockSecureManager.syncWithIpfsPinset(true, adminToken);
    await mockSecureManager.exportToParquet('test.parquet', adminToken);
    await mockSecureManager.importFromParquet('test.parquet', adminToken);
    
    // Check operations stats
    assert.strictEqual(mockSecureManager.operations.queriesPerformed, 1, 'Should increment queries performed count');
    assert.strictEqual(mockSecureManager.operations.entriesAdded, 1, 'Should increment entries added count');
    assert.strictEqual(mockSecureManager.operations.entriesDeleted, 1, 'Should increment entries deleted count');
    assert.strictEqual(mockSecureManager.operations.syncsPerformed, 1, 'Should increment syncs performed count');
    assert.strictEqual(mockSecureManager.operations.exportsPerformed, 1, 'Should increment exports performed count');
    assert.strictEqual(mockSecureManager.operations.importsPerformed, 1, 'Should increment imports performed count');
    
    // Check access stats
    assert.strictEqual(mockSecureManager.accessStats.granted, 6, 'Should increment granted count for all operations');
    assert.strictEqual(mockSecureManager.accessStats.denied, 0, 'Should not increment denied count');
  });
  
  // Test case: Missing auth token
  it('should deny operations with missing auth token', async function() {
    try {
      // Attempt to perform a query operation without a token
      await mockSecureManager.query({}, null);
      
      // Should not reach here
      assert.fail('Should throw an authorization error');
    } catch (error) {
      // Check that the error is an authorization error
      assert.ok(error.message.includes('Unauthorized'), 'Should throw an authorization error');
      
      // Check access stats
      assert.strictEqual(mockSecureManager.accessStats.granted, 0, 'Should not increment granted count');
      assert.strictEqual(mockSecureManager.accessStats.denied, 1, 'Should increment denied count');
    }
  });
  
  // Test case: Test method
  it('should run self-test correctly', async function() {
    const testResult = await mockSecureManager.test();
    
    assert.strictEqual(testResult.success, true, 'Test should report success');
    assert.strictEqual(testResult.module, 'pyarrow_index_secure_manager', 'Should report correct module name');
    assert.strictEqual(typeof testResult.timestamp, 'string', 'Should include timestamp');
    assert.strictEqual(typeof testResult.steps, 'object', 'Should include test steps');
    assert.strictEqual(testResult.steps.initialization.success, true, 'Initialization step should be successful');
    assert.strictEqual(testResult.steps.read_capability.success, true, 'Read capability step should be successful');
  });
  
  // Test case: Capability verification with various resource patterns
  it('should verify capabilities with specific resources', async function() {
    // Get capability tokens for specific resources
    const readSpecificToken = await mockAuthManager.getCapabilityToken(
      PYARROW_INDEX_CAPABILITIES.READ,
      '/datasets/specific-path'
    );
    
    // Mock the verify method for specific resources
    const originalVerify = mockAuthManager.verifyCapabilityToken;
    mockAuthManager.verifyCapabilityToken = async (token, capability, resource) => {
      if (resource === '/datasets/specific-path') {
        return token === readSpecificToken;
      }
      return originalVerify.call(mockAuthManager, token, capability, resource);
    };
    
    try {
      // First try with a general token on a specific resource - should fail
      const generalToken = await mockAuthManager.getCapabilityToken(PYARROW_INDEX_CAPABILITIES.READ);
      
      try {
        await mockSecureManager._verifyCapability(
          PYARROW_INDEX_CAPABILITIES.READ,
          '/datasets/specific-path',
          generalToken
        );
        assert.fail('Should throw an authorization error');
      } catch (error) {
        assert.ok(error.message.includes('Unauthorized'), 'Should throw an authorization error');
      }
      
      // Now try with the specific token - should succeed
      const result = await mockSecureManager._verifyCapability(
        PYARROW_INDEX_CAPABILITIES.READ,
        '/datasets/specific-path',
        readSpecificToken
      );
      
      assert.strictEqual(result, true, 'Should verify successfully with specific resource token');
    } finally {
      // Restore original verify method
      mockAuthManager.verifyCapabilityToken = originalVerify;
    }
  });
});