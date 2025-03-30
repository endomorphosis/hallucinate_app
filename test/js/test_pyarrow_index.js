/**
 * Test for PyArrow Content Index
 * 
 * Tests the JavaScript client for the PyArrow content index
 * Verifies Python-JavaScript integration with PyBridge
 */

import path from 'path';
import os from 'os';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the PythonBridge
import PythonBridge from '../../hallucinate_app/node/python_bridge.js';

// Import the PyArrowIndex
import PyArrowIndex from '../../hallucinate_app/node/pyarrow_index.js';

/**
 * Run tests for PyArrow Content Index
 * 
 * @returns {Promise<Object>} Test results
 */
async function testPyArrowIndex() {
  console.log('Starting PyArrow Content Index Tests');

  const results = {
    module: 'PyArrowIndex',
    success: false,
    tests: {}
  };
  
  try {
    // Initialize Python Bridge
    console.log('Initializing Python Bridge');
    const pythonBridge = new PythonBridge({
      pythonPath: process.env.PYTHON_PATH || 'python',
      scriptPath: path.join(__dirname, '..', '..'),
      debug: true
    });
    
    await pythonBridge.init();
    console.log('Python Bridge initialized');
    
    // Define a temporary index path for testing
    const indexPath = path.join(os.tmpdir(), `test_content_index_${Date.now()}.arrow`);
    console.log(`Using temporary index path: ${indexPath}`);
    
    // Create PyArrow index with PythonBridge
    const pyArrowIndex = new PyArrowIndex({
      pythonBridge,
      indexPath,
      useArrow: true  // Test with Arrow enabled
    });
    
    // Test initialization
    console.log('Testing initialization');
    const initResult = await pyArrowIndex.init();
    results.tests.initialization = {
      success: initResult === true,
      message: initResult ? 'Successfully initialized PyArrowIndex' : 'Failed to initialize PyArrowIndex'
    };
    
    if (!initResult) {
      results.success = false;
      return results;
    }
    
    // Run the built-in test method
    console.log('Running built-in test method');
    const testResult = await pyArrowIndex.test();
    results.tests.builtInTest = {
      success: testResult.success === true,
      message: testResult.success ? 'Built-in test passed' : 'Built-in test failed',
      details: testResult
    };
    
    // Create a test entry
    const testEntry = {
      cid: `QmTest${Date.now().toString(16)}`,
      path: `/test/path/file-${Date.now()}.txt`,
      mimetype: 'text/plain',
      size: 1024,
      tags: ['test', 'integration'],
      description: 'Test entry for JavaScript integration testing'
    };
    
    // Test adding entry
    console.log('Testing addEntry');
    try {
      const addResult = await pyArrowIndex.addEntry(testEntry);
      const success = addResult && addResult.cid === testEntry.cid;
      results.tests.addEntry = {
        success,
        message: success ? 'Successfully added test entry' : 'Failed to add entry correctly'
      };
    } catch (error) {
      results.tests.addEntry = {
        success: false,
        message: `Error in addEntry: ${error.message}`
      };
    }
    
    // Test lookup by CID
    console.log('Testing lookupByCid');
    try {
      const lookupResult = await pyArrowIndex.lookupByCid(testEntry.cid);
      const success = lookupResult && lookupResult.cid === testEntry.cid;
      results.tests.lookupByCid = {
        success,
        message: success ? 'Successfully looked up entry by CID' : 'Failed to look up by CID correctly'
      };
    } catch (error) {
      results.tests.lookupByCid = {
        success: false,
        message: `Error in lookupByCid: ${error.message}`
      };
    }
    
    // Test lookup by path
    console.log('Testing lookupByPath');
    try {
      const lookupResult = await pyArrowIndex.lookupByPath(testEntry.path);
      const success = lookupResult && lookupResult.path === testEntry.path;
      results.tests.lookupByPath = {
        success,
        message: success ? 'Successfully looked up entry by path' : 'Failed to look up by path correctly'
      };
    } catch (error) {
      results.tests.lookupByPath = {
        success: false,
        message: `Error in lookupByPath: ${error.message}`
      };
    }
    
    // Test update entry
    console.log('Testing updateEntry');
    try {
      const updateData = {
        description: 'Updated test description',
        tags: [...testEntry.tags, 'updated']
      };
      
      const updateResult = await pyArrowIndex.updateEntry(testEntry.cid, updateData);
      const success = updateResult && updateResult.description === updateData.description;
      results.tests.updateEntry = {
        success,
        message: success ? 'Successfully updated entry' : 'Failed to update entry correctly'
      };
    } catch (error) {
      results.tests.updateEntry = {
        success: false,
        message: `Error in updateEntry: ${error.message}`
      };
    }
    
    // Test query
    console.log('Testing query');
    try {
      const queryParams = {
        tags: ['test'],
        limit: 10
      };
      
      const queryResult = await pyArrowIndex.query(queryParams);
      const success = Array.isArray(queryResult) && queryResult.length > 0;
      results.tests.query = {
        success,
        message: success ? `Successfully queried entries, found ${queryResult.length} results` : 'Failed to query entries correctly'
      };
    } catch (error) {
      results.tests.query = {
        success: false,
        message: `Error in query: ${error.message}`
      };
    }
    
    // Test save
    console.log('Testing save');
    try {
      const saveResult = await pyArrowIndex.save();
      results.tests.save = {
        success: saveResult === true,
        message: saveResult ? 'Successfully saved content index' : 'Failed to save content index'
      };
    } catch (error) {
      results.tests.save = {
        success: false,
        message: `Error in save: ${error.message}`
      };
    }
    
    // Test export to Parquet
    console.log('Testing exportToParquet');
    try {
      const exportPath = path.join(os.tmpdir(), `test_export_${Date.now()}.parquet`);
      const exportResult = await pyArrowIndex.exportToParquet(exportPath);
      results.tests.exportToParquet = {
        success: exportResult === true,
        message: exportResult ? `Successfully exported to Parquet: ${exportPath}` : 'Failed to export to Parquet'
      };
    } catch (error) {
      results.tests.exportToParquet = {
        success: false,
        message: `Error in exportToParquet: ${error.message}`
      };
    }
    
    // Test import from Parquet
    if (results.tests.exportToParquet && results.tests.exportToParquet.success) {
      console.log('Testing importFromParquet');
      try {
        // Extract export path from previous test
        const exportPath = results.tests.exportToParquet.message.split(': ')[1];
        const importResult = await pyArrowIndex.importFromParquet(exportPath);
        results.tests.importFromParquet = {
          success: importResult === true,
          message: importResult ? 'Successfully imported from Parquet' : 'Failed to import from Parquet'
        };
      } catch (error) {
        results.tests.importFromParquet = {
          success: false,
          message: `Error in importFromParquet: ${error.message}`
        };
      }
    }
    
    // Test stats
    console.log('Testing getStats');
    try {
      const statsResult = await pyArrowIndex.getStats();
      const success = statsResult && typeof statsResult === 'object';
      results.tests.getStats = {
        success,
        message: success ? 'Successfully retrieved stats' : 'Failed to retrieve stats'
      };
    } catch (error) {
      results.tests.getStats = {
        success: false,
        message: `Error in getStats: ${error.message}`
      };
    }
    
    // Test client stats
    console.log('Testing getClientStats');
    try {
      const clientStats = pyArrowIndex.getClientStats();
      const success = clientStats && typeof clientStats === 'object';
      results.tests.getClientStats = {
        success,
        message: success ? 'Successfully retrieved client stats' : 'Failed to retrieve client stats'
      };
    } catch (error) {
      results.tests.getClientStats = {
        success: false,
        message: `Error in getClientStats: ${error.message}`
      };
    }
    
    // Cleanup - delete test entry
    console.log('Testing deleteEntry');
    try {
      const deleteResult = await pyArrowIndex.deleteEntry(testEntry.cid);
      results.tests.deleteEntry = {
        success: deleteResult === true,
        message: deleteResult ? 'Successfully deleted test entry' : 'Failed to delete test entry'
      };
    } catch (error) {
      results.tests.deleteEntry = {
        success: false,
        message: `Error in deleteEntry: ${error.message}`
      };
    }
    
    // Calculate overall success
    const testResults = Object.values(results.tests);
    results.success = testResults.length > 0 && testResults.every(test => test.success);
    
    console.log(`PyArrow Content Index Tests ${results.success ? 'PASSED' : 'FAILED'}`);
    return results;
    
  } catch (error) {
    console.error('Error in testPyArrowIndex:', error);
    results.error = error.message;
    results.success = false;
    return results;
  }
}

// Run the test if this script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  testPyArrowIndex()
    .then(results => {
      console.log(JSON.stringify(results, null, 2));
      process.exit(results.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Error running tests:', error);
      process.exit(1);
    });
}

export default testPyArrowIndex;