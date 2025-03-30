/**
 * IPFS FAISS module - Integration Layer
 * 
 * This module serves as an integration layer for the ipfs_faiss_js and ipfs_faiss_py external modules.
 * It does not implement any core functionality itself but provides standardized testing and access
 * to the external module implementations. All principal work should be completed within the
 * imported modules.
 * 
 * The module's responsibility is to:
 * 1. Import and provide access to external modules
 * 2. Run comprehensive tests to ensure external modules function correctly
 * 3. Integrate the modules with the resource pool
 * 4. Provide a unified interface for other components to use the FAISS capability
 */

// Import required dependencies
import path from 'path';
import os from 'os';

// Check for external module availability
let ipfsFaissJsModule = null;
try {
  ipfsFaissJsModule = require('ipfs_faiss_js');
  console.log('Successfully imported ipfs_faiss_js module');
} catch (error) {
  console.warn('ipfs_faiss_js module not found, some functionality will be limited');
}

/**
 * IPFS FAISS Integration class
 * This class does not implement functionality, but delegates to external modules after testing
 */
class IPFSFaiss {
  constructor(resources = {}, metadata = {}) {
    // Store resources and metadata for passing to external modules
    this.resources = resources;
    this.metadata = metadata;
    
    // Track module availability
    this.modules = {
      ipfs_faiss_js: null,
      ipfs_faiss_py: null
    };
    
    // Initialize integration with ipfs_faiss_js
    if (ipfsFaissJsModule) {
      try {
        this.modules.ipfs_faiss_js = new ipfsFaissJsModule.ipfsFaissJs(resources, metadata);
        console.log('Initialized ipfs_faiss_js module instance');
      } catch (error) {
        console.error('Failed to initialize ipfs_faiss_js:', error.message);
      }
    }
    
    // Log initialization
    console.log(`IPFS FAISS integration initialized with ${Object.values(this.modules).filter(Boolean).length} modules`);
  }
  
  /**
   * Initialize all external modules
   */
  async init() {
    const results = {
      ipfs_faiss_js: false,
      ipfs_faiss_py: false
    };
    
    // Initialize ipfs_faiss_js
    if (this.modules.ipfs_faiss_js && typeof this.modules.ipfs_faiss_js.init === 'function') {
      try {
        const jsResult = await this.modules.ipfs_faiss_js.init();
        results.ipfs_faiss_js = jsResult === true;
        console.log(`ipfs_faiss_js initialization ${results.ipfs_faiss_js ? 'successful' : 'failed'}`);
      } catch (error) {
        console.error('ipfs_faiss_js initialization error:', error.message);
      }
    }
    
    // We're only handling JS initialization in this file
    // Python initialization happens through the Python bridge
    
    // Return success if at least one module initialized successfully
    return Object.values(results).some(result => result === true);
  }
  
  /**
   * Run tests on all external modules
   */
  async test() {
    console.log('Testing IPFS FAISS integration modules');
    
    try {
      // Test results storage
      const testResults = {
        success: false,
        module: 'faiss_integration',
        modules_tested: [],
        module_results: {},
        capabilities: {
          ipfs_faiss_js: this.modules.ipfs_faiss_js !== null,
          ipfs_faiss_py: false,  // Will be determined via Python bridge
          ipfs_available: this.resources.ipfsKit !== undefined
        }
      };
      
      // Test ipfs_faiss_js
      if (this.modules.ipfs_faiss_js) {
        try {
          // Only test if module has test method
          if (typeof this.modules.ipfs_faiss_js.test === 'function') {
            const jsTestResult = await this.modules.ipfs_faiss_js.test();
            testResults.module_results.ipfs_faiss_js = jsTestResult;
            testResults.modules_tested.push('ipfs_faiss_js');
            console.log('ipfs_faiss_js test complete:', jsTestResult.success ? 'PASSED' : 'FAILED');
          } else {
            console.warn('ipfs_faiss_js module does not implement test() method');
            testResults.module_results.ipfs_faiss_js = { 
              success: false,
              error: 'No test method available'
            };
          }
        } catch (error) {
          console.error('ipfs_faiss_js test error:', error.message);
          testResults.module_results.ipfs_faiss_js = {
            success: false,
            error: error.message
          };
        }
      }
      
      // Python module tests will happen via Python bridge and aren't included here
      // This integration module should not implement any tests itself
      
      // Update overall success - successful if at least one module passes tests
      testResults.success = testResults.modules_tested.length > 0 && 
                         testResults.modules_tested.some(
                           module => testResults.module_results[module]?.success === true
                         );
      
      return testResults;
    } catch (error) {
      console.error('IPFS FAISS integration test failed:', error);
      return {
        success: false,
        module: 'faiss_integration',
        error: error.message
      };
    }
  }
  
  /**
   * Method forwarding pattern - delegates to external modules
   * All actual functionality should be implemented in the external modules
   */
  async forwardMethod(methodName, ...args) {
    // Try JS module first
    if (this.modules.ipfs_faiss_js && typeof this.modules.ipfs_faiss_js[methodName] === 'function') {
      try {
        return await this.modules.ipfs_faiss_js[methodName](...args);
      } catch (jsError) {
        console.error(`Error in ipfs_faiss_js.${methodName}:`, jsError.message);
        // Continue to try Python module
      }
    }
    
    // If we get here, either JS module doesn't exist or failed
    // Python bridge would handle the Python module communication
    
    return {
      error: `No working implementation found for method: ${methodName}`
    };
  }
  
  // Forwarding methods for standard FAISS operations
  
  async createIndex(dimensions, indexType = 'Flat', options = {}) {
    return this.forwardMethod('createIndex', dimensions, indexType, options);
  }
  
  async addVectors(indexId, vectors, ids = null) {
    return this.forwardMethod('addVectors', indexId, vectors, ids);
  }
  
  async search(indexId, queryVector, k = 5, options = {}) {
    return this.forwardMethod('search', indexId, queryVector, k, options);
  }
  
  async saveToIPFS(indexId, options = {}) {
    return this.forwardMethod('saveToIPFS', indexId, options);
  }
  
  async loadFromIPFS(cid, options = {}) {
    return this.forwardMethod('loadFromIPFS', cid, options);
  }
  
  async getIndexInfo(indexId) {
    return this.forwardMethod('getIndexInfo', indexId);
  }
  
  async listIndexes() {
    return this.forwardMethod('listIndexes');
  }
}

// Create default instance
const ipfsFaiss = new IPFSFaiss();

// Export classes and instances
export { IPFSFaiss, ipfsFaiss };
export default ipfsFaiss;