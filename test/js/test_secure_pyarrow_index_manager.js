/**
 * Test for Secure PyArrow Content Index Manager
 * 
 * Tests the capability-based security integration with the PyArrow Content Index
 * Validates that operations are properly secured with UCAN authentication
 */

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Mock auth manager for testing
class MockAuthManager {
  constructor() {
    this.initialized = true;
    this.capabilities = {};
  }
  
  async init() {
    return true;
  }
  
  getSelfSignedToken(capability) {
    return `mock-token-${capability}-${Date.now()}`;
  }
  
  async verifyCapability(token, capabilityString) {
    // For testing, assume valid token contains the capability it's checking for
    return token.includes(capabilityString.split(':')[0]) || token.includes('admin');
  }
}

// Mock Python bridge for testing
class MockPythonBridge {
  constructor() {
    this.initialized = true;
    this.data = new Map();
  }
  
  async callAsync(params) {
    const { module, method, args = [] } = params;
    
    if (method === 'init') {
      return true;
    }
    
    if (method === 'lookup_by_cid') {
      const cid = args[0];
      return this.data.get(cid) || null;
    }
    
    if (method === 'lookup_by_path') {
      const path = args[0];
      for (const entry of this.data.values()) {
        if (entry.path === path) {
          return entry;
        }
      }
      return null;
    }
    
    if (method === 'add_entry') {
      const entry = args[0];
      this.data.set(entry.cid, entry);
      return entry;
    }
    
    if (method === 'update_entry') {
      const cid = args[0];
      const updateData = args[1];
      const entry = this.data.get(cid);
      
      if (!entry) {
        return null;
      }
      
      const updatedEntry = {
        ...entry,
        ...updateData,
        metadata: { ...entry.metadata, ...updateData.metadata }
      };
      
      this.data.set(cid, updatedEntry);
      return updatedEntry;
    }
    
    if (method === 'delete_entry') {
      const cid = args[0];
      return this.data.delete(cid);
    }
    
    if (method === 'query') {
      const query = args[0];
      // Very simple query implementation for testing
      const results = [];
      
      for (const entry of this.data.values()) {
        if (!query.filter || (entry.metadata && entry.metadata.test)) {
          results.push(entry);
        }
      }
      
      return results;
    }
    
    if (method === 'get_stats') {
      return {
        entry_count: this.data.size,
        total_size: Array.from(this.data.values()).reduce((sum, entry) => sum + (entry.size || 0), 0),
        updated_at: new Date().toISOString()
      };
    }
    
    if (method === 'sync_with_ipfs_pinset') {
      return {
        added: 5,
        updated: 3,
        removed: 1,
        total: this.data.size
      };
    }
    
    if (method === 'export_to_parquet' || method === 'import_from_parquet') {
      return true;
    }
    
    return null;
  }
  
  async moduleExists(moduleName) {
    return true;
  }
}

// Run the tests
async function runSecurePyArrowIndexManagerTests() {
  console.log('Running Secure PyArrow Content Index Manager tests...');
  
  try {
    // Dynamically import the module (handle ESM)
    let SecurePyArrowIndexManager;
    let PYARROW_INDEX_CAPABILITIES;
    
    try {
      const module = await import('../../hallucinate_app/node/secure_pyarrow_index_manager.js');
      SecurePyArrowIndexManager = module.SecurePyArrowIndexManager;
      PYARROW_INDEX_CAPABILITIES = module.PYARROW_INDEX_CAPABILITIES;
    } catch (importError) {
      console.error('Failed to import SecurePyArrowIndexManager:', importError);
      throw importError;
    }
    
    // Create mock resources
    const mockAuthManager = new MockAuthManager();
    const mockPythonBridge = new MockPythonBridge();
    
    // Create test instance with mock resources
    const securePyArrowManager = new SecurePyArrowIndexManager({
      auth: mockAuthManager,
      pythonBridge: mockPythonBridge
    }, {
      indexPath: path.join(os.tmpdir(), 'test-content-index.arrow'),
      useArrow: true
    });
    
    // Test initialization
    console.log('Testing initialization...');
    const initResult = await securePyArrowManager.init();
    assert.strictEqual(initResult, true, 'Initialization should succeed');
    assert.strictEqual(securePyArrowManager.initialized, true, 'Manager should be initialized');
    console.log('✓ Initialization test passed');
    
    // Test capability verification
    console.log('Testing capability verification...');
    const adminToken = mockAuthManager.getSelfSignedToken(PYARROW_INDEX_CAPABILITIES.ADMIN);
    const verifyResult = await securePyArrowManager._verifyCapability(
      PYARROW_INDEX_CAPABILITIES.READ,
      adminToken
    );
    assert.strictEqual(verifyResult, true, 'Admin capability should grant access');
    console.log('✓ Capability verification test passed');
    
    // Test add entry with valid token
    console.log('Testing add entry with valid token...');
    const testEntry = {
      cid: 'test-cid-123',
      path: '/test/path-123',
      size: 1024,
      mimetype: 'text/plain',
      metadata: {
        test: true,
        timestamp: Date.now()
      }
    };
    
    const writeToken = mockAuthManager.getSelfSignedToken(PYARROW_INDEX_CAPABILITIES.WRITE);
    const addResult = await securePyArrowManager.addEntry(testEntry, writeToken);
    assert.deepStrictEqual(addResult, testEntry, 'Add entry should return the added entry');
    console.log('✓ Add entry test passed');
    
    // Test lookup by CID with valid token
    console.log('Testing lookup by CID with valid token...');
    const readToken = mockAuthManager.getSelfSignedToken(PYARROW_INDEX_CAPABILITIES.READ);
    const lookupResult = await securePyArrowManager.lookupByCid(testEntry.cid, readToken);
    assert.deepStrictEqual(lookupResult, testEntry, 'Lookup should return the correct entry');
    console.log('✓ Lookup by CID test passed');
    
    // Test update entry with valid token
    console.log('Testing update entry with valid token...');
    const updateData = {
      metadata: {
        test: true,
        updated: true,
        timestamp: Date.now()
      }
    };
    
    const updateResult = await securePyArrowManager.updateEntry(
      testEntry.cid,
      updateData,
      writeToken
    );
    
    assert.strictEqual(updateResult.metadata.updated, true, 'Update should modify the entry');
    console.log('✓ Update entry test passed');
    
    // Test query with valid token
    console.log('Testing query with valid token...');
    const queryResult = await securePyArrowManager.query({ filter: "test = true" }, readToken);
    assert.strictEqual(Array.isArray(queryResult), true, 'Query should return an array');
    assert.strictEqual(queryResult.length, 1, 'Query should return one entry');
    console.log('✓ Query test passed');
    
    // Test get stats with valid token
    console.log('Testing get stats with valid token...');
    const statsResult = await securePyArrowManager.getStats(readToken);
    assert.strictEqual(typeof statsResult, 'object', 'Stats should be an object');
    assert.strictEqual(statsResult.entry_count, 1, 'Stats should show correct entry count');
    console.log('✓ Get stats test passed');
    
    // Test delete entry with valid token
    console.log('Testing delete entry with valid token...');
    const deleteToken = mockAuthManager.getSelfSignedToken(PYARROW_INDEX_CAPABILITIES.DELETE);
    const deleteResult = await securePyArrowManager.deleteEntry(testEntry.cid, deleteToken);
    assert.strictEqual(deleteResult, true, 'Delete should return true on success');
    console.log('✓ Delete entry test passed');
    
    // Test access control with invalid token
    console.log('Testing access control with invalid token...');
    const invalidToken = "invalid-token";
    
    try {
      await securePyArrowManager.lookupByCid(testEntry.cid, invalidToken);
      assert.fail('Access should be denied with invalid token');
    } catch (error) {
      assert.strictEqual(
        error.message.includes('Access denied'), 
        true, 
        'Error should indicate access denied'
      );
      console.log('✓ Access control test passed');
    }
    
    // Test self-test method
    console.log('Testing self-test method...');
    const testResults = await securePyArrowManager.test();
    assert.strictEqual(testResults.module, 'secure_pyarrow_index', 'Test should identify correct module');
    console.log('✓ Self-test method test passed');
    
    console.log('All Secure PyArrow Content Index Manager tests passed!');
    return true;
  } catch (error) {
    console.error('Tests failed:', error);
    return false;
  }
}

// Check if being run directly
if (require.main === module) {
  runSecurePyArrowIndexManagerTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test error:', error);
      process.exit(1);
    });
} else {
  // Export for use in other test suites
  module.exports = { runSecurePyArrowIndexManagerTests };
}