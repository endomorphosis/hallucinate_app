/**
 * IPFS Embeddings module - Integration Layer
 * 
 * This module serves as an integration layer for the ipfs_embeddings_js and ipfs_embeddings_py
 * external modules. It does not implement any core functionality itself but provides
 * standardized testing and access to the external module implementations. All principal
 * work should be completed within the imported modules.
 * 
 * The module's responsibility is to:
 * 1. Import and provide access to external modules
 * 2. Run comprehensive tests to ensure external modules function correctly
 * 3. Integrate the modules with the resource pool
 * 4. Provide a unified interface for other components to use the embeddings capability
 */

// Import required dependencies
import path from 'path';
import os from 'os';

// Check for external module availability
let ipfsEmbeddingsJsModule = null;
try {
  ipfsEmbeddingsJsModule = require('ipfs_embeddings_js');
  console.log('Successfully imported ipfs_embeddings_js module');
} catch (error) {
  console.warn('ipfs_embeddings_js module not found, some functionality will be limited');
}

/**
 * IPFS Embeddings Integration class
 * This class does not implement functionality, but delegates to external modules after testing
 */
class IPFSEmbeddings {
  constructor(resources = {}, metadata = {}) {
    // Store resources and metadata for passing to external modules
    this.resources = resources;
    this.metadata = metadata;
    
    // Track module availability
    this.modules = {
      ipfs_embeddings_js: null,
      ipfs_embeddings_py: null
    };
    
    // Initialize integration with ipfs_embeddings_js
    if (ipfsEmbeddingsJsModule) {
      try {
        this.modules.ipfs_embeddings_js = new ipfsEmbeddingsJsModule.ipfsEmbeddingsJs(resources, metadata);
        console.log('Initialized ipfs_embeddings_js module instance');
      } catch (error) {
        console.error('Failed to initialize ipfs_embeddings_js:', error.message);
      }
    }
    
    // Get cache directory from metadata or default (only for logging)
    this.cacheDir = metadata.cacheDir || path.join(os.homedir(), '.cache', 'embeddings');
    
    // Log initialization
    console.log(`IPFS Embeddings integration initialized with ${Object.values(this.modules).filter(Boolean).length} modules`);
    console.log(`Cache directory: ${this.cacheDir}`);
  }
  
  /**
   * Initialize all external modules
   */
  async init() {
    const results = {
      ipfs_embeddings_js: false,
      ipfs_embeddings_py: false
    };
    
    // Initialize ipfs_embeddings_js
    if (this.modules.ipfs_embeddings_js && typeof this.modules.ipfs_embeddings_js.init === 'function') {
      try {
        const jsResult = await this.modules.ipfs_embeddings_js.init();
        results.ipfs_embeddings_js = jsResult === true;
        console.log(`ipfs_embeddings_js initialization ${results.ipfs_embeddings_js ? 'successful' : 'failed'}`);
      } catch (error) {
        console.error('ipfs_embeddings_js initialization error:', error.message);
      }
    }
    
    // We're only handling JS initialization in this file
    // Python initialization happens through the Python bridge
    
    // Return success if at least one module initialized successfully
    return Object.values(results).some(result => result === true);
  }
  
  /**
   * Method forwarding pattern - delegates to external modules
   * All actual functionality should be implemented in the external modules
   */
  async forwardMethod(methodName, ...args) {
    // Try JS module first
    if (this.modules.ipfs_embeddings_js && typeof this.modules.ipfs_embeddings_js[methodName] === 'function') {
      try {
        return await this.modules.ipfs_embeddings_js[methodName](...args);
      } catch (jsError) {
        console.error(`Error in ipfs_embeddings_js.${methodName}:`, jsError.message);
        // Continue to try Python module
      }
    }
    
    // If we get here, either JS module doesn't exist or failed
    // Python bridge would handle the Python module communication
    
    // If both modules failed, return error
    return {
      error: `No working implementation found for method: ${methodName}`
    };
  }
  
  // Forward standard embedding operations to external modules
  
  async generateEmbedding(text, options = {}) {
    return this.forwardMethod('generateEmbedding', text, options);
  }
  
  async compareSimilarity(embedding1, embedding2, metric = 'cosine') {
    return this.forwardMethod('compareSimilarity', embedding1, embedding2, metric);
  }
  
  async searchSimilar(query, embeddings, options = {}) {
    return this.forwardMethod('searchSimilar', query, embeddings, options);
  }
  
  async saveEmbeddingsToIpfs(embeddings, options = {}) {
    return this.forwardMethod('saveEmbeddingsToIpfs', embeddings, options);
  }
  
  async loadEmbeddingsFromIpfs(cid, options = {}) {
    return this.forwardMethod('loadEmbeddingsFromIpfs', cid, options);
  }
  
  /**
   * Run tests on all external modules
   */
  async test() {
    console.log('Testing IPFS Embeddings integration modules');
    
    try {
      // Test results storage
      const testResults = {
        success: false,
        module: 'embeddings_integration',
        modules_tested: [],
        module_results: {},
        capabilities: {
          ipfs_embeddings_js: this.modules.ipfs_embeddings_js !== null,
          ipfs_embeddings_py: false,  // Will be determined via Python bridge
          ipfs_available: this.resources.ipfsKit !== undefined
        },
        metadata: this.metadata
      };
      
      // Test ipfs_embeddings_js
      if (this.modules.ipfs_embeddings_js) {
        try {
          // Only test if module has test method
          if (typeof this.modules.ipfs_embeddings_js.test === 'function') {
            const jsTestResult = await this.modules.ipfs_embeddings_js.test();
            testResults.module_results.ipfs_embeddings_js = jsTestResult;
            testResults.modules_tested.push('ipfs_embeddings_js');
            console.log('ipfs_embeddings_js test complete:', jsTestResult.success ? 'PASSED' : 'FAILED');
          } else {
            console.warn('ipfs_embeddings_js module does not implement test() method');
            testResults.module_results.ipfs_embeddings_js = { 
              success: false,
              error: 'No test method available'
            };
          }
        } catch (error) {
          console.error('ipfs_embeddings_js test error:', error.message);
          testResults.module_results.ipfs_embeddings_js = {
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
      console.error('IPFS Embeddings integration test failed:', error);
      return {
        success: false,
        module: 'embeddings_integration',
        error: error.message,
        capabilities: {
          ipfs_embeddings_js: this.modules.ipfs_embeddings_js !== null,
          ipfs_embeddings_py: false
        },
        metadata: this.metadata
      };
    }
  }
}

// Create default instance
const ipfsEmbeddings = new IPFSEmbeddings();

// Export classes and instances
export { IPFSEmbeddings, ipfsEmbeddings };
export default ipfsEmbeddings;