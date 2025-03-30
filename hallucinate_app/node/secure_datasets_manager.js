/**
 * Secure Datasets Manager Module
 * 
 * Provides capability-based secure access to dataset operations
 * Integrates with UCAN authentication for decentralized auth
 * Implements proper error handling and access control
 */

import { authManager } from './auth.js';
import { ipfsDatasets } from './ipfs_datasets.js';

// Define capability namespaces for dataset operations
const DATASET_CAPABILITIES = {
  LOAD: 'dataset:load',
  IMPORT: 'dataset:import',
  REMOVE: 'dataset:remove',
  LIST: 'dataset:list',
  SAMPLE: 'dataset:sample',
  ADMIN: 'dataset:admin',
};

class SecureDatasetManager {
  /**
   * Create a new SecureDatasetManager instance
   * @param {Object} resources Resource pool
   * @param {Object} metadata Configuration metadata
   */
  constructor(resources = {}, metadata = {}) {
    this.resources = resources;
    this.metadata = metadata;
    
    // Use resources if provided, otherwise use default instances
    this.auth = resources.auth || authManager;
    this.datasetManager = resources.datasetManager || ipfsDatasets;
    
    this.initialized = false;
    
    // Cache for tracking loaded datasets and their capabilities
    this.datasetAccessCache = new Map();
    this.datasetLoadRequests = new Map();
    
    // Operational stats
    this.stats = {
      accessGranted: 0,
      accessDenied: 0,
      datasetsLoaded: 0,
      samplesRetrieved: 0,
      lastRequest: null
    };
    
    // Resource usage monitoring
    this.resourceUsage = {
      byDataset: {},
      byUser: {}
    };
    
    console.log('Secure Dataset Manager initialized');
  }
  
  /**
   * Initialize the secure dataset manager
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    try {
      // Ensure auth manager is initialized
      if (!this.auth.initialized) {
        await this.auth.init();
      }
      
      // Initialize underlying dataset manager if needed
      if (this.datasetManager && typeof this.datasetManager.init === 'function') {
        await this.datasetManager.init();
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize secure dataset manager:', error);
      return false;
    }
  }
  
  /**
   * Securely load a dataset with capability verification
   * @param {string} datasetId Dataset identifier to load
   * @param {Object} options Loading options
   * @param {string} options.authToken UCAN capability token
   * @returns {Promise<Object>} Load result
   */
  async loadDataset(datasetId, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure dataset manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'loadDataset',
      datasetId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, subset, split } = options;
      
      // Verify capability token for dataset access
      const capabilityString = `${DATASET_CAPABILITIES.LOAD}:${datasetId}`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check if a broader dataset:load:* capability exists
        const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${DATASET_CAPABILITIES.LOAD}:*`);
        
        if (!wildcardAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized dataset load attempt for ${datasetId}`);
          throw new Error(`Not authorized to load dataset ${datasetId}`);
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Check if dataset is already being loaded
      if (this.datasetLoadRequests.has(datasetId)) {
        console.log(`Dataset ${datasetId} is already being loaded, waiting for completion`);
        return this.datasetLoadRequests.get(datasetId);
      }
      
      // Create a promise for this load request
      const loadPromise = (async () => {
        try {
          // Call underlying dataset manager
          const result = await this.datasetManager.loadDataset(datasetId, {
            subset,
            split
          });
          
          if (result && !result.error) {
            // Update cache with successful load
            this.datasetAccessCache.set(datasetId, {
              loadedAt: new Date().toISOString(),
              loadedBy: this._extractPrincipalFromToken(authToken),
              token: authToken,
              lastUsed: new Date().toISOString(),
              metadata: result
            });
            
            // Update stats
            this.stats.datasetsLoaded++;
            this._updateResourceUsage('load', datasetId, options);
          }
          
          return result;
        } catch (error) {
          console.error(`Failed to load dataset ${datasetId}:`, error);
          throw error;
        } finally {
          // Remove from pending requests regardless of outcome
          this.datasetLoadRequests.delete(datasetId);
        }
      })();
      
      // Store the promise for potential concurrent requests
      this.datasetLoadRequests.set(datasetId, loadPromise);
      
      return loadPromise;
    } catch (error) {
      console.error(`Secure dataset load failed for ${datasetId}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely import a dataset from IPFS with capability verification
   * @param {string} datasetId Dataset identifier to import
   * @param {string} cid IPFS content identifier
   * @param {Object} options Import options
   * @param {string} options.authToken UCAN capability token
   * @returns {Promise<Object>} Import result
   */
  async importDatasetFromIPFS(datasetId, cid, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure dataset manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'importDatasetFromIPFS',
      datasetId,
      cid,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      // Verify capability token for dataset import
      const capabilityString = `${DATASET_CAPABILITIES.IMPORT}:${datasetId}`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check if a broader dataset:import:* capability exists
        const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${DATASET_CAPABILITIES.IMPORT}:*`);
        
        if (!wildcardAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized dataset import attempt for ${datasetId}`);
          throw new Error(`Not authorized to import dataset ${datasetId}`);
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying dataset manager
      const result = await this.datasetManager.importDatasetFromIPFS(datasetId, cid);
      
      if (result && !result.error) {
        // Update cache with successful import
        this.datasetAccessCache.set(datasetId, {
          loadedAt: new Date().toISOString(),
          loadedBy: this._extractPrincipalFromToken(authToken),
          token: authToken,
          lastUsed: new Date().toISOString(),
          source: 'ipfs',
          cid,
          metadata: result
        });
        
        // Update stats
        this.stats.datasetsLoaded++;
        this._updateResourceUsage('import', datasetId, options);
      }
      
      return result;
    } catch (error) {
      console.error(`Secure dataset import failed for ${datasetId}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely remove a dataset with capability verification
   * @param {string} datasetId Dataset identifier to remove
   * @param {Object} options Removal options
   * @param {string} options.authToken UCAN capability token
   * @returns {Promise<boolean>} True if removal successful
   */
  async removeDataset(datasetId, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure dataset manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'removeDataset',
      datasetId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      // Verify capability token for dataset removal
      const capabilityString = `${DATASET_CAPABILITIES.REMOVE}:${datasetId}`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      // Also allow admins or original loaders to remove datasets
      let isAdmin = await this.auth.verifyCapability(authToken, `${DATASET_CAPABILITIES.ADMIN}:*`);
      let isOriginalLoader = false;
      
      if (this.datasetAccessCache.has(datasetId)) {
        const datasetAccess = this.datasetAccessCache.get(datasetId);
        const originalLoader = this._extractPrincipalFromToken(datasetAccess.token);
        const currentUser = this._extractPrincipalFromToken(authToken);
        isOriginalLoader = originalLoader === currentUser;
      }
      
      if (!isAuthorized && !isAdmin && !isOriginalLoader) {
        this.stats.accessDenied++;
        console.warn(`Unauthorized dataset removal attempt for ${datasetId}`);
        throw new Error(`Not authorized to remove dataset ${datasetId}`);
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying dataset manager
      const result = await this.datasetManager.removeDataset(datasetId);
      
      // Remove from cache
      this.datasetAccessCache.delete(datasetId);
      
      return result;
    } catch (error) {
      console.error(`Secure dataset removal failed for ${datasetId}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely list datasets with capability verification
   * @param {Object} options List options
   * @param {string} options.authToken UCAN capability token
   * @returns {Promise<Object>} List of datasets
   */
  async listDatasets(options = {}) {
    if (!this.initialized) {
      throw new Error('Secure dataset manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'listDatasets',
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      // Verify capability token for dataset listing
      const capabilityString = `${DATASET_CAPABILITIES.LIST}:*`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        this.stats.accessDenied++;
        console.warn('Unauthorized dataset listing attempt');
        throw new Error('Not authorized to list datasets');
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying dataset manager
      const datasets = await this.datasetManager.listDatasets();
      
      // Enrich with access info from cache
      Object.keys(datasets).forEach(datasetId => {
        if (this.datasetAccessCache.has(datasetId)) {
          const accessInfo = this.datasetAccessCache.get(datasetId);
          datasets[datasetId].lastAccess = accessInfo.lastUsed;
          datasets[datasetId].loadedBy = accessInfo.loadedBy;
        }
      });
      
      return datasets;
    } catch (error) {
      console.error('Secure dataset listing failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely get dataset sample with capability verification
   * @param {string} datasetId Dataset identifier
   * @param {Object} options Sample options
   * @param {string} options.authToken UCAN capability token
   * @param {string} options.split Dataset split
   * @param {number} options.numSamples Number of samples to return
   * @returns {Promise<Object>} Dataset samples
   */
  async getSample(datasetId, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure dataset manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'getSample',
      datasetId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, split, numSamples = 5 } = options;
      
      // Verify capability token for dataset sampling
      const capabilityString = `${DATASET_CAPABILITIES.SAMPLE}:${datasetId}`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check if a broader dataset:sample:* capability exists
        const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${DATASET_CAPABILITIES.SAMPLE}:*`);
        
        if (!wildcardAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized dataset sample attempt for ${datasetId}`);
          throw new Error(`Not authorized to sample dataset ${datasetId}`);
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Update cache if dataset exists
      if (this.datasetAccessCache.has(datasetId)) {
        const datasetAccess = this.datasetAccessCache.get(datasetId);
        datasetAccess.lastUsed = new Date().toISOString();
        this.datasetAccessCache.set(datasetId, datasetAccess);
      }
      
      // Call underlying dataset manager
      const result = await this.datasetManager.getSample(datasetId, split, numSamples);
      
      // Update stats
      this.stats.samplesRetrieved++;
      this._updateResourceUsage('sample', datasetId, options);
      
      return result;
    } catch (error) {
      console.error(`Secure dataset sample failed for ${datasetId}:`, error);
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
   * @param {string} datasetId Dataset ID
   * @param {Object} options Operation options
   */
  _updateResourceUsage(operation, datasetId, options = {}) {
    // Initialize dataset tracking if needed
    if (!this.resourceUsage.byDataset[datasetId]) {
      this.resourceUsage.byDataset[datasetId] = {
        loads: 0,
        imports: 0,
        samples: 0,
        lastAccess: null
      };
    }
    
    // Initialize user tracking if options has user info
    const userId = options.userId || 'anonymous';
    if (!this.resourceUsage.byUser[userId]) {
      this.resourceUsage.byUser[userId] = {
        loads: 0,
        imports: 0,
        samples: 0,
        datasets: new Set()
      };
    }
    
    // Update counters based on operation
    if (operation === 'load') {
      this.resourceUsage.byDataset[datasetId].loads++;
      this.resourceUsage.byUser[userId].loads++;
      this.resourceUsage.byUser[userId].datasets.add(datasetId);
    } else if (operation === 'import') {
      this.resourceUsage.byDataset[datasetId].imports++;
      this.resourceUsage.byUser[userId].imports++;
      this.resourceUsage.byUser[userId].datasets.add(datasetId);
    } else if (operation === 'sample') {
      this.resourceUsage.byDataset[datasetId].samples++;
      this.resourceUsage.byUser[userId].samples++;
    }
    
    // Update last access timestamp
    this.resourceUsage.byDataset[datasetId].lastAccess = new Date().toISOString();
  }
  
  /**
   * Get module statistics
   * @param {Object} options Options for stats retrieval
   * @param {string} options.authToken UCAN capability token
   * @returns {Promise<Object>} Module statistics
   */
  async getStats(options = {}) {
    if (!this.initialized) {
      throw new Error('Secure dataset manager not initialized. Call init() first');
    }
    
    try {
      const { authToken } = options;
      
      // Verify capability token for admin access
      const capabilityString = `${DATASET_CAPABILITIES.ADMIN}:stats`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        console.warn('Unauthorized stats access attempt');
        throw new Error('Not authorized to access module statistics');
      }
      
      // Return copy of stats
      return {
        ...this.stats,
        datasetCount: this.datasetAccessCache.size,
        resourceUsage: {
          datasetCount: Object.keys(this.resourceUsage.byDataset).length,
          userCount: Object.keys(this.resourceUsage.byUser).length,
          totalSamples: this.stats.samplesRetrieved,
          topDatasets: this._getTopDatasets(5)
        }
      };
    } catch (error) {
      console.error('Failed to get secure dataset manager stats:', error);
      throw error;
    }
  }
  
  /**
   * Get top N datasets by sample count
   * @private
   * @param {number} count Number of datasets to return
   * @returns {Array} Top datasets
   */
  _getTopDatasets(count = 5) {
    return Object.entries(this.resourceUsage.byDataset)
      .sort((a, b) => b[1].samples - a[1].samples)
      .slice(0, count)
      .map(([datasetId, stats]) => ({
        datasetId,
        samples: stats.samples,
        loads: stats.loads,
        imports: stats.imports,
        lastAccess: stats.lastAccess
      }));
  }
  
  /**
   * Run tests on the secure dataset manager
   * @returns {Promise<Object>} Test results
   */
  async test() {
    console.log('Testing secure dataset manager');
    
    try {
      const testResults = {
        success: true,
        module: 'secure_dataset_manager',
        initialization: false,
        capability_verification: false,
        dataset_operations: {
          load: false,
          import: false,
          remove: false,
          list: false,
          sample: false
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
          can: DATASET_CAPABILITIES.ADMIN,
          with: '*'
        });
        
        const loadToken = await this.auth.issueCapability('root', 'test-user', {
          can: DATASET_CAPABILITIES.LOAD,
          with: '*'
        });
        
        const importToken = await this.auth.issueCapability('root', 'test-user', {
          can: DATASET_CAPABILITIES.IMPORT,
          with: '*'
        });
        
        const sampleToken = await this.auth.issueCapability('root', 'test-user', {
          can: DATASET_CAPABILITIES.SAMPLE,
          with: '*'
        });
        
        // Mock the dataset manager for testing
        const originalDatasetManager = this.datasetManager;
        
        // Create a mock dataset manager
        this.datasetManager = {
          loadDataset: async (datasetId) => ({ datasetId, success: true }),
          importDatasetFromIPFS: async (datasetId, cid) => ({ datasetId, cid, success: true }),
          removeDataset: async (datasetId) => true,
          listDatasets: async () => ({ 'test-dataset': { id: 'test-dataset' } }),
          getSample: async (datasetId, split, numSamples) => ({ 
            datasetId, 
            split, 
            samples: Array(numSamples).fill({ data: 'test' }) 
          })
        };
        
        // Test capability verification
        try {
          // Test with invalid token (should fail)
          try {
            await this.loadDataset('test-dataset', { authToken: 'invalid-token' });
            testResults.capability_verification = false;
          } catch (error) {
            // This should fail, so it's actually good
            testResults.capability_verification = true;
          }
          
          if (testResults.capability_verification) {
            // Test dataset operations with valid tokens
            try {
              // Test load dataset
              const loadResult = await this.loadDataset('test-dataset', { 
                authToken: loadToken.token,
                userId: 'test-user'
              });
              testResults.dataset_operations.load = loadResult.success === true;
              
              // Test import dataset
              const importResult = await this.importDatasetFromIPFS('test-dataset', 'test-cid', { 
                authToken: importToken.token,
                userId: 'test-user'
              });
              testResults.dataset_operations.import = importResult.success === true;
              
              // Test sample dataset
              const sampleResult = await this.getSample('test-dataset', { 
                authToken: sampleToken.token,
                userId: 'test-user'
              });
              testResults.dataset_operations.sample = Array.isArray(sampleResult.samples);
              
              // Test list datasets
              const listResult = await this.listDatasets({ 
                authToken: adminToken.token 
              });
              testResults.dataset_operations.list = typeof listResult === 'object' && listResult['test-dataset'];
              
              // Test remove dataset
              const removeResult = await this.removeDataset('test-dataset', { 
                authToken: adminToken.token,
                userId: 'test-user'
              });
              testResults.dataset_operations.remove = removeResult === true;
              
              // Test stats tracking
              const stats = await this.getStats({ authToken: adminToken.token });
              testResults.stats_tracking = stats && 
                typeof stats.accessGranted === 'number' && 
                typeof stats.samplesRetrieved === 'number';
            } catch (error) {
              console.error('Dataset operations tests failed:', error);
              
              // Mark failed operations
              if (!testResults.dataset_operations.load) testResults.dataset_operations.load = false;
              if (!testResults.dataset_operations.import) testResults.dataset_operations.import = false;
              if (!testResults.dataset_operations.sample) testResults.dataset_operations.sample = false;
              if (!testResults.dataset_operations.list) testResults.dataset_operations.list = false;
              if (!testResults.dataset_operations.remove) testResults.dataset_operations.remove = false;
              if (!testResults.stats_tracking) testResults.stats_tracking = false;
            }
          }
        } finally {
          // Restore original dataset manager
          this.datasetManager = originalDatasetManager;
        }
      }
      
      // Overall success
      testResults.success = testResults.initialization && 
                          testResults.capability_verification &&
                          Object.values(testResults.dataset_operations).every(Boolean) &&
                          testResults.stats_tracking;
      
      return testResults;
    } catch (error) {
      console.error('Secure dataset manager test failed:', error);
      return {
        success: false,
        module: 'secure_dataset_manager',
        error: error.message
      };
    }
  }
}

// Create default instance
const secureDatasetManager = new SecureDatasetManager();

export { SecureDatasetManager, secureDatasetManager, DATASET_CAPABILITIES };
export default secureDatasetManager;