/**
 * Secure Transformers Manager Module
 * 
 * Provides capability-based secure access to transformer operations
 * Integrates with UCAN authentication for decentralized auth
 * Implements proper error handling and access control
 */

import { authManager } from './auth.js';
import { ipfsTransformers } from './ipfs_transformers.js';

// Define capability namespaces for transformer operations
const TRANSFORMER_CAPABILITIES = {
  LOAD: 'transformer:load',
  INFERENCE: 'transformer:inference',
  LIST: 'transformer:list',
  ADMIN: 'transformer:admin',
};

class SecureTransformersManager {
  /**
   * Create a new SecureTransformersManager instance
   * @param {Object} resources Resource pool
   * @param {Object} metadata Configuration metadata
   */
  constructor(resources = {}, metadata = {}) {
    this.resources = resources;
    this.metadata = metadata;
    
    // Use resources if provided, otherwise use default instances
    this.auth = resources.auth || authManager;
    this.transformersManager = resources.transformers || ipfsTransformers;
    
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
    
    console.log('Secure Transformers Manager initialized');
  }
  
  /**
   * Initialize the secure transformers manager
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    try {
      // Ensure auth manager is initialized
      if (!this.auth.initialized) {
        await this.auth.init();
      }
      
      // Initialize underlying transformers manager if needed
      if (this.transformersManager && typeof this.transformersManager.init === 'function') {
        await this.transformersManager.init();
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize secure transformers manager:', error);
      return false;
    }
  }
  
  /**
   * Securely load a transformer model with capability verification
   * @param {string} modelId Model identifier to load
   * @param {Object} options Loading options
   * @param {string} options.authToken UCAN capability token
   * @param {string} options.task The task for the model (text-generation, etc.)
   * @returns {Promise<Object>} Load result
   */
  async loadModel(modelId, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure transformers manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'loadModel',
      modelId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, task } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for model loading');
      }
      
      // Verify capability token for model access
      const capabilityString = `${TRANSFORMER_CAPABILITIES.LOAD}:${modelId}`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check if a broader transformer:load:* capability exists
        const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${TRANSFORMER_CAPABILITIES.LOAD}:*`);
        
        if (!wildcardAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized transformer model load attempt for ${modelId}`);
          throw new Error(`Not authorized to load transformer model ${modelId}`);
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
          // Call underlying transformers manager
          const success = await this.transformersManager.loadModel(modelId, task);
          
          if (success) {
            // Get active model info
            const activeModelId = this.transformersManager.activeModelId || modelId;
            
            // Update cache with successful load
            this.modelAccessCache.set(modelId, {
              loadedAt: new Date().toISOString(),
              loadedBy: this._extractPrincipalFromToken(authToken),
              token: authToken,
              lastUsed: new Date().toISOString(),
              task: task,
              activeModelId: activeModelId
            });
            
            // Update stats
            this.stats.modelsLoaded++;
            this._updateResourceUsage('load', modelId, options);
            
            return {
              success: true,
              modelId: modelId,
              task: task
            };
          } else {
            return {
              success: false,
              modelId: modelId,
              error: 'Failed to load model'
            };
          }
        } catch (error) {
          console.error(`Failed to load model ${modelId}:`, error);
          return {
            success: false,
            modelId: modelId,
            error: error.message || 'Unknown error'
          };
        } finally {
          // Remove from pending requests regardless of outcome
          this.modelLoadRequests.delete(modelId);
        }
      })();
      
      // Store the promise for potential concurrent requests
      this.modelLoadRequests.set(modelId, loadPromise);
      
      return loadPromise;
    } catch (error) {
      console.error(`Secure transformer model load failed for ${modelId}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely run inference with capability verification
   * @param {string} inputText Input text for inference
   * @param {Object} options Inference options
   * @param {string} options.authToken UCAN capability token
   * @param {string} options.modelId Model ID to use
   * @param {string} options.task Task for the model
   * @param {Object} options.params Additional parameters for inference
   * @returns {Promise<Object>} Inference result
   */
  async runInference(inputText, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure transformers manager not initialized. Call init() first');
    }
    
    const { modelId } = options;
    
    this.stats.lastRequest = {
      action: 'runInference',
      modelId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, task, params } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for transformer inference');
      }
      
      // Verify capability token for transformer inference
      const capabilityString = modelId ? 
        `${TRANSFORMER_CAPABILITIES.INFERENCE}:${modelId}` : 
        `${TRANSFORMER_CAPABILITIES.INFERENCE}:*`;
        
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized && modelId) {
        // Check if a broader transformer:inference:* capability exists
        const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${TRANSFORMER_CAPABILITIES.INFERENCE}:*`);
        
        if (!wildcardAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized transformer inference attempt for ${modelId}`);
          throw new Error(`Not authorized to run inference on transformer model ${modelId}`);
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // If model_id is specified, make sure it's loaded first
      if (modelId && !this.modelAccessCache.has(modelId)) {
        const loadOptions = {
          authToken,
          task,
          userId: options.userId
        };
        const loadResult = await this.loadModel(modelId, loadOptions);
        if (!loadResult.success) {
          return {
            success: false,
            modelId,
            error: `Failed to load model ${modelId}`
          };
        }
      }
      
      // Call underlying transformers manager implementation
      const result = await this.transformersManager.runInference(
        inputText,
        modelId,
        task,
        params
      );
      
      // Update stats
      this.stats.inferencesRun++;
      this._updateResourceUsage('inference', modelId || 'default', options);
      
      // Update last used timestamp if model in cache
      const usedModelId = modelId || result.modelId;
      if (usedModelId && this.modelAccessCache.has(usedModelId)) {
        const modelInfo = this.modelAccessCache.get(usedModelId);
        modelInfo.lastUsed = new Date().toISOString();
        this.modelAccessCache.set(usedModelId, modelInfo);
      }
      
      return result;
    } catch (error) {
      console.error('Secure transformer inference failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely list loaded transformer models with capability verification
   * @param {Object} options List options
   * @param {string} options.authToken UCAN capability token
   * @returns {Promise<Object>} List of loaded models
   */
  async listModels(options = {}) {
    if (!this.initialized) {
      throw new Error('Secure transformers manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'listModels',
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for model listing');
      }
      
      // Verify capability token for model listing
      const capabilityString = `${TRANSFORMER_CAPABILITIES.LIST}:*`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        this.stats.accessDenied++;
        console.warn('Unauthorized transformer model listing attempt');
        throw new Error('Not authorized to list transformer models');
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Return the model cache
      const result = {};
      this.modelAccessCache.forEach((modelInfo, modelId) => {
        result[modelId] = {
          modelId,
          loadedAt: modelInfo.loadedAt,
          loadedBy: modelInfo.loadedBy,
          lastUsed: modelInfo.lastUsed,
          task: modelInfo.task,
          active: modelInfo.activeModelId === modelId
        };
      });
      
      return {
        success: true,
        models: result,
        count: Object.keys(result).length
      };
    } catch (error) {
      console.error('Secure transformer model listing failed:', error);
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
      throw new Error('Secure transformers manager not initialized. Call init() first');
    }
    
    try {
      const { authToken } = options;
      
      // Verify capability token for admin access
      const capabilityString = `${TRANSFORMER_CAPABILITIES.ADMIN}:stats`;
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
          topModels: this._getTopModels(5),
          byUser: this._getUserStats()
        }
      };
    } catch (error) {
      console.error('Failed to get secure transformers manager stats:', error);
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
   * Get user statistics with JSON-serializable format
   * @private
   * @returns {Object} User statistics
   */
  _getUserStats() {
    const userStats = {};
    
    Object.entries(this.resourceUsage.byUser).forEach(([userId, stats]) => {
      userStats[userId] = {
        loads: stats.loads,
        inferences: stats.inferences,
        models: Array.from(stats.models)
      };
    });
    
    return userStats;
  }
  
  /**
   * Run tests on the secure transformers manager
   * @returns {Promise<Object>} Test results
   */
  async test() {
    console.log('Testing secure transformers manager');
    
    try {
      const testResults = {
        success: true,
        module: 'secure_transformers_manager',
        initialization: false,
        capability_verification: false,
        model_operations: {
          load: false,
          inference: false,
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
          can: TRANSFORMER_CAPABILITIES.ADMIN,
          with: '*'
        });
        
        const loadToken = await this.auth.issueCapability('root', 'test-user', {
          can: TRANSFORMER_CAPABILITIES.LOAD,
          with: '*'
        });
        
        const inferenceToken = await this.auth.issueCapability('root', 'test-user', {
          can: TRANSFORMER_CAPABILITIES.INFERENCE,
          with: '*'
        });
        
        const listToken = await this.auth.issueCapability('root', 'test-user', {
          can: TRANSFORMER_CAPABILITIES.LIST,
          with: '*'
        });
        
        // Mock the transformers manager for testing
        const originalTransformersManager = this.transformersManager;
        
        // Create a mock transformers manager
        this.transformersManager = {
          activeModelId: null,
          
          async init() {
            return true;
          },
          
          async loadModel(modelId, task) {
            this.activeModelId = modelId;
            return true;
          },
          
          async runInference(inputText, modelId, task, params) {
            return {
              modelId: modelId || this.activeModelId || 'default-model',
              input: inputText,
              results: 'Mock inference result'
            };
          }
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
                userId: 'test-user',
                task: 'text-generation'
              });
              testResults.model_operations.load = loadResult.success === true;
              
              // Test inference
              const inferenceResult = await this.runInference('Test input', { 
                authToken: inferenceToken.token,
                userId: 'test-user',
                modelId: 'test-model'
              });
              testResults.model_operations.inference = 'results' in inferenceResult;
              
              // Test list models
              const listResult = await this.listModels({ 
                authToken: listToken.token 
              });
              testResults.model_operations.list = listResult.success === true;
              
              // Test stats
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
              if (!testResults.stats_tracking) testResults.stats_tracking = false;
            }
          }
        } finally {
          // Restore original transformers manager
          this.transformersManager = originalTransformersManager;
        }
      }
      
      // Overall success
      testResults.success = testResults.initialization && 
                          testResults.capability_verification &&
                          Object.values(testResults.model_operations).every(Boolean) &&
                          testResults.stats_tracking;
      
      return testResults;
    } catch (error) {
      console.error('Secure transformers manager test failed:', error);
      return {
        success: false,
        module: 'secure_transformers_manager',
        error: error.message
      };
    }
  }
}

// Create default instance
const secureTransformersManager = new SecureTransformersManager();

export { SecureTransformersManager, secureTransformersManager, TRANSFORMER_CAPABILITIES };
export default secureTransformersManager;