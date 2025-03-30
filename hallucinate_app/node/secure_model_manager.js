/**
 * Secure Model Manager Module
 * 
 * Provides capability-based secure access to model operations
 * Integrates with UCAN authentication for decentralized auth
 * Implements proper error handling and access control
 */

import { authManager } from './auth.js';
import { ipfsModelManager } from './ipfs_model_manager.js';

// Define capability namespaces for model operations
const MODEL_CAPABILITIES = {
  LOAD: 'model:load',
  UNLOAD: 'model:unload',
  INFERENCE: 'model:inference',
  LIST: 'model:list',
  CACHE: 'model:cache',
  ADMIN: 'model:admin',
};

class SecureModelManager {
  /**
   * Create a new SecureModelManager instance
   * @param {Object} resources Resource pool
   * @param {Object} metadata Configuration metadata
   */
  constructor(resources = {}, metadata = {}) {
    this.resources = resources;
    this.metadata = metadata;
    
    // Use resources if provided, otherwise use default instances
    this.auth = resources.auth || authManager;
    this.modelManager = resources.modelManager || ipfsModelManager;
    
    this.initialized = false;
    
    // Cache for tracking loaded models and their capabilities
    this.modelAccessCache = new Map();
    this.modelLoadRequests = new Map();
    
    // Operational stats
    this.stats = {
      accessGranted: 0,
      accessDenied: 0,
      modelsLoaded: 0,
      inferencesRun: 0,
      lastRequest: null
    };
    
    // Resource usage monitoring
    this.resourceUsage = {
      byModel: {},
      byUser: {}
    };
    
    console.log('Secure Model Manager initialized');
  }
  
  /**
   * Initialize the secure model manager
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    try {
      // Ensure auth manager is initialized
      if (!this.auth.initialized) {
        await this.auth.init();
      }
      
      // Initialize underlying model manager if needed
      if (this.modelManager && typeof this.modelManager.init === 'function') {
        await this.modelManager.init();
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize secure model manager:', error);
      return false;
    }
  }
  
  /**
   * Securely load a model with capability verification
   * @param {string} modelId Model identifier to load
   * @param {Object} options Loading options
   * @param {string} options.authToken UCAN capability token
   * @returns {Promise<Object>} Load result
   */
  async loadModel(modelId, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure model manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'loadModel',
      modelId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      // Verify capability token for model access
      const capabilityString = `${MODEL_CAPABILITIES.LOAD}:${modelId}`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check if a broader model:load:* capability exists
        const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${MODEL_CAPABILITIES.LOAD}:*`);
        
        if (!wildcardAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized model load attempt for ${modelId}`);
          throw new Error(`Not authorized to load model ${modelId}`);
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Check if model is already being loaded
      if (this.modelLoadRequests.has(modelId)) {
        console.log(`Model ${modelId} is already being loaded, waiting for completion`);
        return this.modelLoadRequests.get(modelId);
      }
      
      // Create a promise for this load request
      const loadPromise = (async () => {
        try {
          // Call underlying model manager
          const result = await this.modelManager.loadModel(modelId, options);
          
          // Update cache with successful load
          this.modelAccessCache.set(modelId, {
            loadedAt: new Date().toISOString(),
            loadedBy: this._extractPrincipalFromToken(authToken),
            token: authToken,
            lastUsed: new Date().toISOString()
          });
          
          // Update stats
          this.stats.modelsLoaded++;
          this._updateResourceUsage('load', modelId, options);
          
          return result;
        } catch (error) {
          console.error(`Failed to load model ${modelId}:`, error);
          throw error;
        } finally {
          // Remove from pending requests regardless of outcome
          this.modelLoadRequests.delete(modelId);
        }
      })();
      
      // Store the promise for potential concurrent requests
      this.modelLoadRequests.set(modelId, loadPromise);
      
      return loadPromise;
    } catch (error) {
      console.error(`Secure model load failed for ${modelId}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely run inference on a model with capability verification
   * @param {string} modelId Model identifier to use
   * @param {Object} input Input data for inference
   * @param {Object} options Inference options
   * @param {string} options.authToken UCAN capability token
   * @returns {Promise<Object>} Inference result
   */
  async runInference(modelId, input, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure model manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'runInference',
      modelId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      // Verify capability token for model inference
      const capabilityString = `${MODEL_CAPABILITIES.INFERENCE}:${modelId}`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check if a broader model:inference:* capability exists
        const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${MODEL_CAPABILITIES.INFERENCE}:*`);
        
        if (!wildcardAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized model inference attempt for ${modelId}`);
          throw new Error(`Not authorized to run inference on model ${modelId}`);
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Verify model is loaded
      if (!this.modelAccessCache.has(modelId)) {
        throw new Error(`Model ${modelId} is not loaded. Load the model first.`);
      }
      
      // Update last used timestamp
      const modelAccess = this.modelAccessCache.get(modelId);
      modelAccess.lastUsed = new Date().toISOString();
      this.modelAccessCache.set(modelId, modelAccess);
      
      // Call underlying model manager
      const result = await this.modelManager.runInference(modelId, input, options);
      
      // Update stats
      this.stats.inferencesRun++;
      this._updateResourceUsage('inference', modelId, options);
      
      return result;
    } catch (error) {
      console.error(`Secure model inference failed for ${modelId}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely unload a model with capability verification
   * @param {string} modelId Model identifier to unload
   * @param {Object} options Unloading options
   * @param {string} options.authToken UCAN capability token
   * @returns {Promise<Object>} Unload result
   */
  async unloadModel(modelId, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure model manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'unloadModel',
      modelId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      // Verify capability token for model access
      const capabilityString = `${MODEL_CAPABILITIES.UNLOAD}:${modelId}`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      // Also allow admins or original loaders to unload models
      let isAdmin = await this.auth.verifyCapability(authToken, `${MODEL_CAPABILITIES.ADMIN}:*`);
      let isOriginalLoader = false;
      
      if (this.modelAccessCache.has(modelId)) {
        const modelAccess = this.modelAccessCache.get(modelId);
        const originalLoader = this._extractPrincipalFromToken(modelAccess.token);
        const currentUser = this._extractPrincipalFromToken(authToken);
        isOriginalLoader = originalLoader === currentUser;
      }
      
      if (!isAuthorized && !isAdmin && !isOriginalLoader) {
        this.stats.accessDenied++;
        console.warn(`Unauthorized model unload attempt for ${modelId}`);
        throw new Error(`Not authorized to unload model ${modelId}`);
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying model manager
      const result = await this.modelManager.unloadModel(modelId, options);
      
      // Remove from cache
      this.modelAccessCache.delete(modelId);
      
      return result;
    } catch (error) {
      console.error(`Secure model unload failed for ${modelId}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely list loaded models with capability verification
   * @param {Object} options List options
   * @param {string} options.authToken UCAN capability token
   * @returns {Promise<Array>} List of loaded models
   */
  async listModels(options = {}) {
    if (!this.initialized) {
      throw new Error('Secure model manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'listModels',
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      // Verify capability token for model listing
      const capabilityString = `${MODEL_CAPABILITIES.LIST}:*`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        this.stats.accessDenied++;
        console.warn('Unauthorized model listing attempt');
        throw new Error('Not authorized to list models');
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying model manager if available
      let models = [];
      if (this.modelManager && typeof this.modelManager.listModels === 'function') {
        models = await this.modelManager.listModels(options);
      } else {
        // Fallback to cache if underlying implementation doesn't exist
        models = Array.from(this.modelAccessCache.keys()).map(modelId => ({
          id: modelId,
          ...this.modelAccessCache.get(modelId)
        }));
      }
      
      return models;
    } catch (error) {
      console.error('Secure model listing failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely get model cache status with capability verification
   * @param {Object} options Cache options
   * @param {string} options.authToken UCAN capability token
   * @returns {Promise<Object>} Cache status
   */
  async getCacheStatus(options = {}) {
    if (!this.initialized) {
      throw new Error('Secure model manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'getCacheStatus',
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      // Verify capability token for cache access
      const capabilityString = `${MODEL_CAPABILITIES.CACHE}:status`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        this.stats.accessDenied++;
        console.warn('Unauthorized cache status access attempt');
        throw new Error('Not authorized to access cache status');
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying model manager if available
      if (this.modelManager && typeof this.modelManager.getCacheStatus === 'function') {
        return await this.modelManager.getCacheStatus(options);
      }
      
      // Fallback to basic cache info if underlying implementation doesn't exist
      return {
        cacheSize: this.modelAccessCache.size,
        models: Array.from(this.modelAccessCache.keys()),
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Secure cache status access failed:', error);
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
   * @param {string} modelId Model ID
   * @param {Object} options Operation options
   */
  _updateResourceUsage(operation, modelId, options = {}) {
    // Initialize model tracking if needed
    if (!this.resourceUsage.byModel[modelId]) {
      this.resourceUsage.byModel[modelId] = {
        loads: 0,
        inferences: 0,
        lastAccess: null
      };
    }
    
    // Initialize user tracking if options has user info
    const userId = options.userId || 'anonymous';
    if (!this.resourceUsage.byUser[userId]) {
      this.resourceUsage.byUser[userId] = {
        loads: 0,
        inferences: 0,
        models: new Set()
      };
    }
    
    // Update counters based on operation
    if (operation === 'load') {
      this.resourceUsage.byModel[modelId].loads++;
      this.resourceUsage.byUser[userId].loads++;
      this.resourceUsage.byUser[userId].models.add(modelId);
    } else if (operation === 'inference') {
      this.resourceUsage.byModel[modelId].inferences++;
      this.resourceUsage.byUser[userId].inferences++;
    }
    
    // Update last access timestamp
    this.resourceUsage.byModel[modelId].lastAccess = new Date().toISOString();
  }
  
  /**
   * Get module statistics
   * @param {Object} options Options for stats retrieval
   * @param {string} options.authToken UCAN capability token
   * @returns {Promise<Object>} Module statistics
   */
  async getStats(options = {}) {
    if (!this.initialized) {
      throw new Error('Secure model manager not initialized. Call init() first');
    }
    
    try {
      const { authToken } = options;
      
      // Verify capability token for admin access
      const capabilityString = `${MODEL_CAPABILITIES.ADMIN}:stats`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        console.warn('Unauthorized stats access attempt');
        throw new Error('Not authorized to access module statistics');
      }
      
      // Return copy of stats
      return {
        ...this.stats,
        modelCount: this.modelAccessCache.size,
        resourceUsage: {
          modelCount: Object.keys(this.resourceUsage.byModel).length,
          userCount: Object.keys(this.resourceUsage.byUser).length,
          totalInferences: this.stats.inferencesRun,
          topModels: this._getTopModels(5)
        }
      };
    } catch (error) {
      console.error('Failed to get secure model manager stats:', error);
      throw error;
    }
  }
  
  /**
   * Get top N models by inference count
   * @private
   * @param {number} count Number of models to return
   * @returns {Array} Top models
   */
  _getTopModels(count = 5) {
    return Object.entries(this.resourceUsage.byModel)
      .sort((a, b) => b[1].inferences - a[1].inferences)
      .slice(0, count)
      .map(([modelId, stats]) => ({
        modelId,
        inferences: stats.inferences,
        loads: stats.loads,
        lastAccess: stats.lastAccess
      }));
  }
  
  /**
   * Run tests on the secure model manager
   * @returns {Promise<Object>} Test results
   */
  async test() {
    console.log('Testing secure model manager');
    
    try {
      const testResults = {
        success: true,
        module: 'secure_model_manager',
        initialization: false,
        capability_verification: false,
        model_operations: {
          load: false,
          inference: false,
          unload: false,
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
          can: MODEL_CAPABILITIES.ADMIN,
          with: '*'
        });
        
        const loadToken = await this.auth.issueCapability('root', 'test-user', {
          can: MODEL_CAPABILITIES.LOAD,
          with: '*'
        });
        
        const inferenceToken = await this.auth.issueCapability('root', 'test-user', {
          can: MODEL_CAPABILITIES.INFERENCE,
          with: '*'
        });
        
        // Mock the model manager for testing
        const originalModelManager = this.modelManager;
        
        // Create a mock model manager
        this.modelManager = {
          loadModel: async (modelId) => ({ success: true, modelId }),
          runInference: async (modelId) => ({ success: true, modelId, result: 'test-output' }),
          unloadModel: async (modelId) => ({ success: true, modelId }),
          listModels: async () => [{ id: 'test-model', status: 'loaded' }]
        };
        
        // Test capability verification
        try {
          // Test with invalid token (should fail)
          try {
            await this.loadModel('test-model', { authToken: 'invalid-token' });
            testResults.capability_verification = false;
          } catch (error) {
            // This should fail, so it's actually good
            testResults.capability_verification = true;
          }
          
          if (testResults.capability_verification) {
            // Test model operations with valid tokens
            try {
              // Test load model
              const loadResult = await this.loadModel('test-model', { 
                authToken: loadToken.token,
                userId: 'test-user'
              });
              testResults.model_operations.load = loadResult.success === true;
              
              // Test run inference
              const inferenceResult = await this.runInference('test-model', { text: 'test input' }, { 
                authToken: inferenceToken.token,
                userId: 'test-user'
              });
              testResults.model_operations.inference = inferenceResult.success === true;
              
              // Test list models
              const listResult = await this.listModels({ 
                authToken: adminToken.token 
              });
              testResults.model_operations.list = Array.isArray(listResult);
              
              // Test unload model
              const unloadResult = await this.unloadModel('test-model', { 
                authToken: adminToken.token,
                userId: 'test-user'
              });
              testResults.model_operations.unload = unloadResult.success === true;
              
              // Test stats tracking
              const stats = await this.getStats({ authToken: adminToken.token });
              testResults.stats_tracking = stats && 
                typeof stats.accessGranted === 'number' && 
                typeof stats.inferencesRun === 'number';
            } catch (error) {
              console.error('Model operations tests failed:', error);
              
              // Mark failed operations
              if (!testResults.model_operations.load) testResults.model_operations.load = false;
              if (!testResults.model_operations.inference) testResults.model_operations.inference = false;
              if (!testResults.model_operations.list) testResults.model_operations.list = false;
              if (!testResults.model_operations.unload) testResults.model_operations.unload = false;
              if (!testResults.stats_tracking) testResults.stats_tracking = false;
            }
          }
        } finally {
          // Restore original model manager
          this.modelManager = originalModelManager;
        }
      }
      
      // Overall success
      testResults.success = testResults.initialization && 
                          testResults.capability_verification &&
                          Object.values(testResults.model_operations).every(Boolean) &&
                          testResults.stats_tracking;
      
      return testResults;
    } catch (error) {
      console.error('Secure model manager test failed:', error);
      return {
        success: false,
        module: 'secure_model_manager',
        error: error.message
      };
    }
  }
}

// Create default instance
const secureModelManager = new SecureModelManager();

export { SecureModelManager, secureModelManager, MODEL_CAPABILITIES };
export default secureModelManager;