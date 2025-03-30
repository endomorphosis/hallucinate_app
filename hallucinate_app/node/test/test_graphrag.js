/**
 * Tests for the GraphRAG integration layer
 * 
 * This file contains tests for verifying the functionality
 * of the GraphRAG integration layer for Hallucinate App.
 */

import path from 'path';
import os from 'os';
import fs from 'fs';
import { GraphRAG } from '../graphrag.js';

// Configure test utilities
const TEST_STORAGE_DIR = path.join(os.tmpdir(), 'graphrag_test');

// Clean up previous test files if they exist
try {
  if (fs.existsSync(TEST_STORAGE_DIR)) {
    fs.rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_STORAGE_DIR, { recursive: true });
} catch (err) {
  console.error(`Error setting up test directory: ${err.message}`);
}

/**
 * Run basic tests to verify GraphRAG functionality
 */
async function testGraphRAG() {
  console.log('Starting GraphRAG integration tests...');
  
  const results = {
    module: 'graphrag',
    success: false,
    tests: {}
  };
  
  try {
    // Initialize GraphRAG with test configuration
    const graphrag = new GraphRAG(
      null, 
      { 
        storageDir: TEST_STORAGE_DIR,
        dbName: 'test_graphrag',
        testMode: true
      }
    );
    
    results.tests.initialization = { status: 'running' };
    const initResult = await graphrag.init();
    results.tests.initialization = { 
      status: 'completed',
      success: initResult === true,
      details: initResult
    };
    
    // Check if we have a working implementation
    results.tests.implementationAvailable = {
      status: 'completed',
      success: graphrag.graphragImpl !== null,
      details: graphrag.graphragImpl ? 'GraphRAG implementation found' : 'No GraphRAG implementation available'
    };
    
    // If we don't have an implementation, skip the rest of the tests
    if (!graphrag.graphragImpl) {
      results.success = false;
      results.message = 'Tests incomplete - no GraphRAG implementation available';
      return results;
    }
    
    // Test adding a document
    results.tests.addDocument = { status: 'running' };
    try {
      const docId = `test_doc_${Date.now()}`;
      const addDocResult = await graphrag.addDocument(
        docId,
        'This is a test document for GraphRAG integration testing.',
        { test: true, timestamp: Date.now() }
      );
      
      results.tests.addDocument = {
        status: 'completed',
        success: addDocResult !== null && !addDocResult.error,
        details: addDocResult
      };
    } catch (error) {
      results.tests.addDocument = {
        status: 'error',
        success: false,
        details: error.message
      };
    }
    
    // Test adding nodes and edges
    results.tests.addNodeAndEdge = { status: 'running' };
    try {
      const node1Id = `test_node_${Date.now()}`;
      const node2Id = `test_node_${Date.now() + 1}`;
      
      const addNode1Result = await graphrag.addNode(
        node1Id,
        'Test Node 1',
        { type: 'test' }
      );
      
      const addNode2Result = await graphrag.addNode(
        node2Id,
        'Test Node 2',
        { type: 'test' }
      );
      
      const addEdgeResult = await graphrag.addEdge(
        node1Id,
        node2Id,
        0.8,
        true
      );
      
      results.tests.addNodeAndEdge = {
        status: 'completed',
        success: addNode1Result !== null && !addNode1Result.error && 
                 addNode2Result !== null && !addNode2Result.error &&
                 addEdgeResult !== null && !addEdgeResult.error,
        details: {
          node1: addNode1Result,
          node2: addNode2Result,
          edge: addEdgeResult
        }
      };
    } catch (error) {
      results.tests.addNodeAndEdge = {
        status: 'error',
        success: false,
        details: error.message
      };
    }
    
    // Test vector search
    results.tests.vectorSearch = { status: 'running' };
    try {
      const searchResult = await graphrag.vectorSearch('test', 2);
      
      results.tests.vectorSearch = {
        status: 'completed',
        success: searchResult !== null && !searchResult.error,
        details: searchResult
      };
    } catch (error) {
      results.tests.vectorSearch = {
        status: 'error',
        success: false,
        details: error.message
      };
    }
    
    // Test hybrid search
    results.tests.hybridSearch = { status: 'running' };
    try {
      const searchResult = await graphrag.hybridSearch('test', 2);
      
      results.tests.hybridSearch = {
        status: 'completed',
        success: searchResult !== null && !searchResult.error,
        details: searchResult
      };
    } catch (error) {
      results.tests.hybridSearch = {
        status: 'error',
        success: false,
        details: error.message
      };
    }
    
    // Test persistence
    results.tests.persistence = { status: 'running' };
    try {
      const savePath = path.join(TEST_STORAGE_DIR, 'test_save.json');
      
      // Save to disk
      const saveResult = await graphrag.saveToDisk(savePath);
      
      // Load from disk
      const loadResult = await graphrag.loadFromDisk(savePath);
      
      results.tests.persistence = {
        status: 'completed',
        success: saveResult !== null && !saveResult.error && 
                 loadResult !== null && !loadResult.error,
        details: {
          save: saveResult,
          load: loadResult
        }
      };
    } catch (error) {
      results.tests.persistence = {
        status: 'error',
        success: false,
        details: error.message
      };
    }
    
    // Determine overall success
    results.success = 
      results.tests.initialization.success &&
      results.tests.implementationAvailable.success &&
      (results.tests.addDocument.success || results.tests.addNodeAndEdge.success) &&
      results.tests.vectorSearch.success;
    
    results.message = results.success 
      ? 'All critical GraphRAG tests passed'
      : 'Some GraphRAG tests failed';
    
  } catch (error) {
    results.success = false;
    results.message = `GraphRAG tests failed with error: ${error.message}`;
    results.error = error.stack;
  }
  
  return results;
}

// Export the test function
export default testGraphRAG;

// Run the test if this file is executed directly
if (process.argv[1] === import.meta.url) {
  testGraphRAG().then(results => {
    console.log(JSON.stringify(results, null, 2));
    process.exit(results.success ? 0 : 1);
  }).catch(error => {
    console.error('Test failed with error:', error);
    process.exit(1);
  });
}