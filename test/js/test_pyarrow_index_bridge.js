/**
 * Test PyArrow Content Index Bridge
 * 
 * This module tests the PyArrow Content Index Bridge functionality.
 */

const path = require('path');
const assert = require('assert');
const { createPythonBridge } = require('./python_bridge');

// Import the PyArrow Index Bridge
let PyArrowIndexBridge;

// Test configuration
const testConfig = {
  indexPath: path.join(__dirname, '../temp/test_content_index.arrow'),
  useArrow: true,
  observabilityEnabled: true
};

/**
 * Run PyArrow Index Bridge tests
 */
async function runPyArrowIndexBridgeTests() {
  console.log('Running PyArrow Content Index Bridge tests...');
  
  try {
    // Dynamically import ESM modules
    const { default: ImportedPyArrowIndexBridge } = await import('../../hallucinate_app/node/pyarrow_index_bridge.js');
    PyArrowIndexBridge = ImportedPyArrowIndexBridge;
    
    // Create Python bridge
    const pythonBridge = await createPythonBridge();
    
    // Create PyArrow Index Bridge
    const pyarrowIndexBridge = new PyArrowIndexBridge({
      pythonBridge,
      indexPath: testConfig.indexPath,
      useArrow: testConfig.useArrow
    });
    
    // Run initialization test
    console.log('Testing initialization...');
    const initResult = await pyarrowIndexBridge.init();
    assert.strictEqual(initResult, true, 'Initialization should succeed');
    console.log('✓ Initialization test passed');
    
    // Run test method
    console.log('Running test method...');
    const testResult = await pyarrowIndexBridge.test();
    assert.strictEqual(testResult.success, true, 'Test method should succeed');
    
    // Verify test results
    const operations = Object.keys(testResult.operations);
    const expectedOperations = [
      'addEntry', 'lookupByCid', 'lookupByPath', 'updateEntry', 
      'query', 'getStats', 'deleteEntry'
    ];
    
    expectedOperations.forEach(operation => {
      assert(operations.includes(operation), `Test result should include ${operation} operation`);
      assert.strictEqual(
        testResult.operations[operation].success, 
        true, 
        `${operation} operation should succeed`
      );
    });
    
    console.log('✓ Test method test passed');
    
    // Test getStats operation separately
    console.log('Testing getStats operation...');
    const statsResult = await pyarrowIndexBridge.getStats();
    assert(statsResult, 'getStats should return a result');
    assert('entry_count' in statsResult, 'getStats should include entry_count');
    console.log('✓ getStats test passed');
    
    // Test getClientStats operation
    console.log('Testing getClientStats operation...');
    const clientStats = pyarrowIndexBridge.getClientStats();
    assert(clientStats, 'getClientStats should return a result');
    assert.strictEqual(clientStats.clientType, 'JavaScript', 'clientType should be JavaScript');
    assert('operations' in clientStats, 'clientStats should include operations');
    assert('errors' in clientStats, 'clientStats should include errors');
    assert('uptime' in clientStats, 'clientStats should include uptime');
    console.log('✓ getClientStats test passed');
    
    console.log('All PyArrow Content Index Bridge tests passed!');
    return true;
  } catch (error) {
    console.error('PyArrow Content Index Bridge tests failed:', error);
    throw error;
  }
}

// If this is run directly
if (require.main === module) {
  runPyArrowIndexBridgeTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = {
  runPyArrowIndexBridgeTests
};