/**
 * Secure FAISS Manager Module
 * 
 * Provides capability-based secure access to FAISS vector operations
 * Integrates with UCAN authentication for decentralized auth
 * Implements proper error handling and access control
 */

import authManager from './auth.js'; // Corrected: Import default export
import { ipfsFaiss } from './ipfs_faiss.js';

// Define capability namespaces for FAISS operations
const FAISS_CAPABILITIES = {
  CREATE: 'faiss:create',
  ADD: 'faiss:add',
  SEARCH: 'faiss:search',
  SAVE: 'faiss:save',
  LOAD: 'faiss:load',
  LIST: 'faiss:list',
  ADMIN: 'faiss:admin',
};

class SecureFaissManager {
  /**
   * Create a new SecureFaissManager instance
   * @param {Object} resources Resource pool
   * @param {Object} metadata Configuration metadata
   */
  constructor(resources = {}, metadata = {}) {
    this.resources = resources;
    this.metadata = metadata;
    
    // Use resources if provided, otherwise use default instances
    this.auth = resources.auth || authManager;
    this.faissManager = resources.faiss || ipfsFaiss;
    
    this.initialized = false;
    
    // Cache for tracking indexes and their capabilities
    this.indexAccessCache = new Map();
    this.indexCreateRequests = new Map();
    
    // Operational stats
    this.stats = {
      accessGranted: 0,
      accessDenied: 0,
      indexesCreated: 0,
      vectorsAdded: 0,
      searchesPerformed: 0,
      indexesSaved: 0,
      indexesLoaded: 0,
      lastRequest: null
    };
    
    // Resource usage monitoring
    this.resourceUsage = {
      byIndex: {},
      byUser: {}
    };
    
    console.log('Secure FAISS Manager initialized');
  }
  
  /**
   * Initialize the secure FAISS manager
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    try {
      // Ensure auth manager is initialized
      if (!this.auth.initialized) {
        await this.auth.init();
      }
      
      // Initialize underlying FAISS manager if needed
      if (this.faissManager && typeof this.faissManager.init === 'function') {
        await this.faissManager.init();
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize secure FAISS manager:', error);
      return false;
    }
  }
  
  /**
   * Securely create a FAISS index with capability verification
   * @param {number} dimensions Number of dimensions for the vector index
   * @param {Object} options Index creation options
   * @param {string} options.authToken UCAN capability token
   * @param {string} options.indexType Type of index to create (default: Flat)
   * @returns {Promise<Object>} Creation result
   */
  async createIndex(dimensions, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure FAISS manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'createIndex',
      dimensions,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, indexType = 'Flat', indexOptions = {} } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for FAISS index creation');
      }
      
      // Verify capability token for index creation
      const capabilityString = `${FAISS_CAPABILITIES.CREATE}:*`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        this.stats.accessDenied++;
        console.warn('Unauthorized FAISS index creation attempt');
        throw new Error('Not authorized to create FAISS index');
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying FAISS manager
      let result;
      if (this.faissManager && typeof this.faissManager.createIndex === 'function') {
        result = await this.faissManager.createIndex(dimensions, indexType, indexOptions);
        
        if (result && !result.error) {
          const indexId = result.indexId;
          
          if (indexId) {
            // Update cache with successful creation
            this.indexAccessCache.set(indexId, {
              createdAt: new Date().toISOString(),
              createdBy: this._extractPrincipalFromToken(authToken),
              token: authToken,
              lastUsed: new Date().toISOString(),
              dimensions,
              indexType,
              vectorsCount: 0
            });
            
            // Update stats
            this.stats.indexesCreated++;
            this._updateResourceUsage('create', indexId, options);
          }
        }
      } else {
        // Mock implementation if no FAISS manager available
        const mockIndexId = `mock-index-${Date.now()}`;
        result = {
          success: true,
          indexId: mockIndexId,
          dimensions,
          indexType,
          mock: true
        };
        
        // Update cache with mock creation
        this.indexAccessCache.set(mockIndexId, {
          createdAt: new Date().toISOString(),
          createdBy: this._extractPrincipalFromToken(authToken),
          token: authToken,
          lastUsed: new Date().toISOString(),
          dimensions,
          indexType,
          vectorsCount: 0,
          mock: true
        });
        
        // Update stats
        this.stats.indexesCreated++;
        this._updateResourceUsage('create', mockIndexId, options);
      }
      
      return result;
    } catch (error) {
      console.error('Secure FAISS index creation failed:', error);
      throw error;
    }
  }
  
  /**
   * Securely add vectors to a FAISS index with capability verification
   * @param {string} indexId Index identifier to add vectors to
   * @param {Array<Array<number>>} vectors List of vectors to add
   * @param {Object} options Options including authToken for authorization
   * @returns {Promise<Object>} Result of the operation
   */
  async addVectors(indexId, vectors, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure FAISS manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'addVectors',
      indexId,
      vectorsCount: vectors ? vectors.length : 0,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, ids } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for adding vectors');
      }
      
      // Verify capability token for vector addition
      const capabilityString = `${FAISS_CAPABILITIES.ADD}:${indexId}`;
      let isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check if a broader faiss:add:* capability exists
        const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${FAISS_CAPABILITIES.ADD}:*`);
        
        if (!wildcardAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized vector add attempt for index ${indexId}`);
          throw new Error(`Not authorized to add vectors to index ${indexId}`);
        } else {
          isAuthorized = true;
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Make sure the index exists in cache
      if (!this.indexAccessCache.has(indexId)) {
        // Try to get index info if connected to a real FAISS manager
        let indexExists = false;
        if (this.faissManager && typeof this.faissManager.getIndexInfo === 'function') {
          try {
            const indexInfo = await this.faissManager.getIndexInfo(indexId);
            if (indexInfo && !indexInfo.error) {
              // Add to cache
              this.indexAccessCache.set(indexId, {
                createdAt: indexInfo.createdAt || new Date().toISOString(),
                createdBy: 'unknown',
                lastUsed: new Date().toISOString(),
                dimensions: indexInfo.dimensions || 0,
                indexType: indexInfo.indexType || 'unknown',
                vectorsCount: indexInfo.vectorsCount || 0
              });
              indexExists = true;
            }
          } catch (error) {
            console.warn(`Error getting index info for ${indexId}:`, error);
          }
        }
        
        if (!indexExists) {
          return {
            success: false,
            error: `Index ${indexId} not found or not accessible`
          };
        }
      }
      
      // Update last used timestamp
      if (this.indexAccessCache.has(indexId)) {
        const indexInfo = this.indexAccessCache.get(indexId);
        indexInfo.lastUsed = new Date().toISOString();
        this.indexAccessCache.set(indexId, indexInfo);
      }
      
      // Call underlying FAISS manager
      let result;
      if (this.faissManager && typeof this.faissManager.addVectors === 'function') {
        result = await this.faissManager.addVectors(indexId, vectors, ids);
        
        if (result && !result.error) {
          const vectorsAdded = vectors.length;
          
          // Update cache with new vectors count
          if (this.indexAccessCache.has(indexId)) {
            const indexInfo = this.indexAccessCache.get(indexId);
            indexInfo.vectorsCount = (indexInfo.vectorsCount || 0) + vectorsAdded;
            this.indexAccessCache.set(indexId, indexInfo);
          }
          
          // Update stats
          this.stats.vectorsAdded += vectorsAdded;
          this._updateResourceUsage('add', indexId, options, vectorsAdded);
        }
      } else {
        // Mock implementation
        const vectorsAdded = vectors.length;
        const indexInfo = this.indexAccessCache.get(indexId) || {};
        const currentCount = indexInfo.vectorsCount || 0;
        
        result = {
          success: true,
          indexId,
          vectorsAdded,
          totalVectors: currentCount + vectorsAdded,
          mock: true
        };
        
        // Update cache with new vectors count
        if (this.indexAccessCache.has(indexId)) {
          const indexInfo = this.indexAccessCache.get(indexId);
          indexInfo.vectorsCount = (indexInfo.vectorsCount || 0) + vectorsAdded;
          this.indexAccessCache.set(indexId, indexInfo);
        }
        
        // Update stats
        this.stats.vectorsAdded += vectorsAdded;
        this._updateResourceUsage('add', indexId, options, vectorsAdded);
      }
      
      return result;
    } catch (error) {
      console.error(`Secure vector addition failed for index ${indexId}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely search vectors in a FAISS index with capability verification
   * @param {string} indexId Index identifier to search in
   * @param {Array<number>} queryVector Query vector for similarity search
   * @param {Object} options Search options including authToken for authorization
   * @returns {Promise<Object>} Search results
   */
  async search(indexId, queryVector, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure FAISS manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'search',
      indexId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, k = 5, searchOptions = {} } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for vector search');
      }
      
      // Verify capability token for vector search
      const capabilityString = `${FAISS_CAPABILITIES.SEARCH}:${indexId}`;
      let isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check if a broader faiss:search:* capability exists
        const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${FAISS_CAPABILITIES.SEARCH}:*`);
        
        if (!wildcardAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized vector search attempt for index ${indexId}`);
          throw new Error(`Not authorized to search vectors in index ${indexId}`);
        } else {
          isAuthorized = true;
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Make sure the index exists in cache
      if (!this.indexAccessCache.has(indexId)) {
        // Try to get index info if connected to a real FAISS manager
        let indexExists = false;
        if (this.faissManager && typeof this.faissManager.getIndexInfo === 'function') {
          try {
            const indexInfo = await this.faissManager.getIndexInfo(indexId);
            if (indexInfo && !indexInfo.error) {
              // Add to cache
              this.indexAccessCache.set(indexId, {
                createdAt: indexInfo.createdAt || new Date().toISOString(),
                createdBy: 'unknown',
                lastUsed: new Date().toISOString(),
                dimensions: indexInfo.dimensions || 0,
                indexType: indexInfo.indexType || 'unknown',
                vectorsCount: indexInfo.vectorsCount || 0
              });
              indexExists = true;
            }
          } catch (error) {
            console.warn(`Error getting index info for ${indexId}:`, error);
          }
        }
        
        if (!indexExists) {
          return {
            success: false,
            error: `Index ${indexId} not found or not accessible`
          };
        }
      }
      
      // Update last used timestamp
      if (this.indexAccessCache.has(indexId)) {
        const indexInfo = this.indexAccessCache.get(indexId);
        indexInfo.lastUsed = new Date().toISOString();
        this.indexAccessCache.set(indexId, indexInfo);
      }
      
      // Call underlying FAISS manager
      let result;
      if (this.faissManager && typeof this.faissManager.search === 'function') {
        result = await this.faissManager.search(indexId, queryVector, k, searchOptions);
        
        if (result && !result.error) {
          // Update stats
          this.stats.searchesPerformed++;
          this._updateResourceUsage('search', indexId, options);
        }
      } else {
        // Mock implementation
        const mockResults = [];
        for (let i = 0; i < Math.min(k, 5); i++) {  // Return at most 5 mock results
          mockResults.push({
            id: i,
            score: 1.0 - (i * 0.1),  // Decreasing similarity scores
            vector: Array(queryVector.length).fill(0.0)  // Mock vector with same dimensions
          });
        }
        
        result = {
          success: true,
          indexId,
          query: queryVector.slice(0, 5).concat(queryVector.length > 5 ? ['...'] : []),  // Truncate for logging
          k,
          results: mockResults,
          mock: true
        };
        
        // Update stats
        this.stats.searchesPerformed++;
        this._updateResourceUsage('search', indexId, options);
      }
      
      return result;
    } catch (error) {
      console.error(`Secure vector search failed for index ${indexId}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely save a FAISS index to IPFS with capability verification
   * @param {string} indexId Index identifier to save
   * @param {Object} options Save options including authToken for authorization
   * @returns {Promise<Object>} Save result
   */
  async saveToIPFS(indexId, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure FAISS manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'saveToIPFS',
      indexId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, saveOptions = {} } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for saving index to IPFS');
      }
      
      // Verify capability token for index saving
      const capabilityString = `${FAISS_CAPABILITIES.SAVE}:${indexId}`;
      let isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check if a broader faiss:save:* capability exists
        const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${FAISS_CAPABILITIES.SAVE}:*`);
        
        if (!wildcardAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized save attempt for index ${indexId}`);
          throw new Error(`Not authorized to save index ${indexId} to IPFS`);
        } else {
          isAuthorized = true;
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Make sure the index exists in cache
      if (!this.indexAccessCache.has(indexId)) {
        // Try to get index info if connected to a real FAISS manager
        let indexExists = false;
        if (this.faissManager && typeof this.faissManager.getIndexInfo === 'function') {
          try {
            const indexInfo = await this.faissManager.getIndexInfo(indexId);
            if (indexInfo && !indexInfo.error) {
              // Add to cache
              this.indexAccessCache.set(indexId, {
                createdAt: indexInfo.createdAt || new Date().toISOString(),
                createdBy: 'unknown',
                lastUsed: new Date().toISOString(),
                dimensions: indexInfo.dimensions || 0,
                indexType: indexInfo.indexType || 'unknown',
                vectorsCount: indexInfo.vectorsCount || 0
              });
              indexExists = true;
            }
          } catch (error) {
            console.warn(`Error getting index info for ${indexId}:`, error);
          }
        }
        
        if (!indexExists) {
          return {
            success: false,
            error: `Index ${indexId} not found or not accessible`
          };
        }
      }
      
      // Update last used timestamp
      if (this.indexAccessCache.has(indexId)) {
        const indexInfo = this.indexAccessCache.get(indexId);
        indexInfo.lastUsed = new Date().toISOString();
        this.indexAccessCache.set(indexId, indexInfo);
      }
      
      // Call underlying FAISS manager
      let result;
      if (this.faissManager && typeof this.faissManager.saveToIPFS === 'function') {
        result = await this.faissManager.saveToIPFS(indexId, saveOptions);
        
        if (result && !result.error && result.cid) {
          // Update stats
          this.stats.indexesSaved++;
          this._updateResourceUsage('save', indexId, options);
          
          // Store CID in cache
          if (this.indexAccessCache.has(indexId)) {
            const indexInfo = this.indexAccessCache.get(indexId);
            indexInfo.ipfsCid = result.cid;
            this.indexAccessCache.set(indexId, indexInfo);
          }
        }
      } else {
        // Mock implementation
        const mockCid = `Qm${'abcdef0123456789'.split('').sort(() => 0.5 - Math.random()).join('').slice(0, 44)}`;
        result = {
          success: true,
          indexId,
          cid: mockCid,
          mock: true
        };
        
        // Update stats
        this.stats.indexesSaved++;
        this._updateResourceUsage('save', indexId, options);
        
        // Store mock CID in cache
        if (this.indexAccessCache.has(indexId)) {
          const indexInfo = this.indexAccessCache.get(indexId);
          indexInfo.ipfsCid = mockCid;
          this.indexAccessCache.set(indexId, indexInfo);
        }
      }
      
      return result;
    } catch (error) {
      console.error(`Secure index save failed for index ${indexId}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely load a FAISS index from IPFS with capability verification
   * @param {string} cid IPFS content identifier
   * @param {Object} options Load options including authToken for authorization
   * @returns {Promise<Object>} Load result
   */
  async loadFromIPFS(cid, options = {}) {
    if (!this.initialized) {
      throw new Error('Secure FAISS manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'loadFromIPFS',
      cid,
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken, loadOptions = {} } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for loading index from IPFS');
      }
      
      // Verify capability token for index loading
      const capabilityString = `${FAISS_CAPABILITIES.LOAD}:${cid}`;
      let isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        // Check if a broader faiss:load:* capability exists
        const wildcardAuthorized = await this.auth.verifyCapability(authToken, `${FAISS_CAPABILITIES.LOAD}:*`);
        
        if (!wildcardAuthorized) {
          this.stats.accessDenied++;
          console.warn(`Unauthorized load attempt for IPFS CID ${cid}`);
          throw new Error(`Not authorized to load index from IPFS CID ${cid}`);
        } else {
          isAuthorized = true;
        }
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying FAISS manager
      let result;
      if (this.faissManager && typeof this.faissManager.loadFromIPFS === 'function') {
        result = await this.faissManager.loadFromIPFS(cid, loadOptions);
        
        if (result && !result.error && result.indexId) {
          const indexId = result.indexId;
          
          // Update cache with loaded index
          this.indexAccessCache.set(indexId, {
            createdAt: new Date().toISOString(),
            createdBy: this._extractPrincipalFromToken(authToken),
            token: authToken,
            lastUsed: new Date().toISOString(),
            ipfsCid: cid,
            dimensions: result.dimensions || 0,
            indexType: result.indexType || 'unknown',
            vectorsCount: result.vectorsCount || 0
          });
          
          // Update stats
          this.stats.indexesLoaded++;
          this._updateResourceUsage('load', indexId, options);
        }
      } else {
        // Mock implementation
        const mockIndexId = `mock-index-${Date.now()}`;
        result = {
          success: true,
          indexId: mockIndexId,
          cid,
          dimensions: 128,  // Mock dimensions
          indexType: 'Flat',
          vectorsCount: 1000,  // Mock count
          mock: true
        };
        
        // Update cache with mock loaded index
        this.indexAccessCache.set(mockIndexId, {
          createdAt: new Date().toISOString(),
          createdBy: this._extractPrincipalFromToken(authToken),
          token: authToken,
          lastUsed: new Date().toISOString(),
          ipfsCid: cid,
          dimensions: 128,
          indexType: 'Flat',
          vectorsCount: 1000,
          mock: true
        });
        
        // Update stats
        this.stats.indexesLoaded++;
        this._updateResourceUsage('load', mockIndexId, options);
      }
      
      return result;
    } catch (error) {
      console.error(`Secure index load failed for CID ${cid}:`, error);
      throw error;
    }
  }
  
  /**
   * Securely list FAISS indexes with capability verification
   * @param {Object} options List options including authToken for authorization
   * @returns {Promise<Object>} List of indexes
   */
  async listIndexes(options = {}) {
    if (!this.initialized) {
      throw new Error('Secure FAISS manager not initialized. Call init() first');
    }
    
    this.stats.lastRequest = {
      action: 'listIndexes',
      timestamp: new Date().toISOString()
    };
    
    try {
      const { authToken } = options;
      
      if (!authToken) {
        throw new Error('Authentication token required for listing indexes');
      }
      
      // Verify capability token for index listing
      const capabilityString = `${FAISS_CAPABILITIES.LIST}:*`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        this.stats.accessDenied++;
        console.warn('Unauthorized index listing attempt');
        throw new Error('Not authorized to list FAISS indexes');
      }
      
      // Track access
      this.stats.accessGranted++;
      
      // Call underlying FAISS manager if available
      let externalIndexes = {};
      if (this.faissManager && typeof this.faissManager.listIndexes === 'function') {
        try {
          const externalList = await this.faissManager.listIndexes();
          if (externalList && !externalList.error && externalList.indexes) {
            externalIndexes = externalList.indexes;
          }
        } catch (error) {
          console.warn('Error listing indexes from FAISS manager:', error);
        }
      }
      
      // Merge external indexes with cache
      const indexes = {};
      
      // Add all cached indexes
      for (const [indexId, indexInfo] of this.indexAccessCache.entries()) {
        indexes[indexId] = {
          indexId,
          createdAt: indexInfo.createdAt,
          createdBy: indexInfo.createdBy,
          lastUsed: indexInfo.lastUsed,
          ipfsCid: indexInfo.ipfsCid,
          dimensions: indexInfo.dimensions,
          indexType: indexInfo.indexType,
          vectorsCount: indexInfo.vectorsCount,
          mock: indexInfo.mock || false
        };
      }
      
      // Add any external indexes not in cache
      for (const [indexId, indexInfo] of Object.entries(externalIndexes)) {
        if (!indexes[indexId]) {
          indexes[indexId] = indexInfo;
          
          // Add to cache
          this.indexAccessCache.set(indexId, {
            createdAt: indexInfo.createdAt || new Date().toISOString(),
            createdBy: 'unknown',
            lastUsed: new Date().toISOString(),
            ipfsCid: indexInfo.ipfsCid,
            dimensions: indexInfo.dimensions || 0,
            indexType: indexInfo.indexType || 'unknown',
            vectorsCount: indexInfo.vectorsCount || 0
          });
        }
      }
      
      return {
        success: true,
        indexes,
        count: Object.keys(indexes).length
      };
    } catch (error) {
      console.error('Secure index listing failed:', error);
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
   * @param {string} indexId Index ID
   * @param {Object} options Operation options
   * @param {number} count Number of items affected (for add operations)
   */
  _updateResourceUsage(operation, indexId, options = {}, count = 1) {
    // Initialize index tracking if needed
    if (!this.resourceUsage.byIndex[indexId]) {
      this.resourceUsage.byIndex[indexId] = {
        creates: 0,
        adds: 0,
        searches: 0,
        saves: 0,
        loads: 0,
        vectorsAdded: 0,
        lastAccess: null
      };
    }
    
    // Initialize user tracking if options has user info
    const userId = options.userId || 'anonymous';
    if (!this.resourceUsage.byUser[userId]) {
      this.resourceUsage.byUser[userId] = {
        creates: 0,
        adds: 0,
        searches: 0,
        saves: 0,
        loads: 0,
        vectorsAdded: 0,
        indexes: new Set()
      };
    }
    
    // Update counters based on operation
    if (operation === 'create') {
      this.resourceUsage.byIndex[indexId].creates++;
      this.resourceUsage.byUser[userId].creates++;
      this.resourceUsage.byUser[userId].indexes.add(indexId);
    } else if (operation === 'add') {
      this.resourceUsage.byIndex[indexId].adds++;
      this.resourceUsage.byIndex[indexId].vectorsAdded += count;
      this.resourceUsage.byUser[userId].adds++;
      this.resourceUsage.byUser[userId].vectorsAdded += count;
      this.resourceUsage.byUser[userId].indexes.add(indexId);
    } else if (operation === 'search') {
      this.resourceUsage.byIndex[indexId].searches++;
      this.resourceUsage.byUser[userId].searches++;
      this.resourceUsage.byUser[userId].indexes.add(indexId);
    } else if (operation === 'save') {
      this.resourceUsage.byIndex[indexId].saves++;
      this.resourceUsage.byUser[userId].saves++;
      this.resourceUsage.byUser[userId].indexes.add(indexId);
    } else if (operation === 'load') {
      this.resourceUsage.byIndex[indexId].loads++;
      this.resourceUsage.byUser[userId].loads++;
      this.resourceUsage.byUser[userId].indexes.add(indexId);
    }
    
    // Update last access timestamp
    this.resourceUsage.byIndex[indexId].lastAccess = new Date().toISOString();
  }
  
  /**
   * Get module statistics
   * @param {Object} options Options for stats retrieval including authToken
   * @returns {Promise<Object>} Module statistics
   */
  async getStats(options = {}) {
    if (!this.initialized) {
      throw new Error('Secure FAISS manager not initialized. Call init() first');
    }
    
    try {
      const { authToken } = options;
      
      // Verify capability token for admin access
      const capabilityString = `${FAISS_CAPABILITIES.ADMIN}:stats`;
      const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);
      
      if (!isAuthorized) {
        console.warn('Unauthorized stats access attempt');
        throw new Error('Not authorized to access module statistics');
      }
      
      // Return copy of stats
      return {
        ...this.stats,
        indexCount: this.indexAccessCache.size,
        resourceUsage: {
          indexCount: Object.keys(this.resourceUsage.byIndex).length,
          userCount: Object.keys(this.resourceUsage.byUser).length,
          totalVectorsAdded: this.stats.vectorsAdded,
          totalSearches: this.stats.searchesPerformed,
          topIndexes: this._getTopIndexes(5),
          byUser: this._getUserStats()
        }
      };
    } catch (error) {
      console.error('Failed to get secure FAISS manager stats:', error);
      throw error;
    }
  }
  
  /**
   * Get top N indexes by search count
   * @private
   * @param {number} count Number of indexes to return
   * @returns {Array} Top indexes
   */
  _getTopIndexes(count = 5) {
    return Object.entries(this.resourceUsage.byIndex)
      .sort((a, b) => b[1].searches - a[1].searches)
      .slice(0, count)
      .map(([indexId, stats]) => ({
        indexId,
        searches: stats.searches,
        vectorsAdded: stats.vectorsAdded,
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
        creates: stats.creates,
        adds: stats.adds,
        searches: stats.searches,
        saves: stats.saves,
        loads: stats.loads,
        vectorsAdded: stats.vectorsAdded,
        indexes: Array.from(stats.indexes)
      };
    });
    
    return userStats;
  }
  
  /**
   * Run tests on the secure FAISS manager
   * @returns {Promise<Object>} Test results
   */
  async test() {
    console.log('Testing secure FAISS manager');
    
    try {
      const testResults = {
        success: true,
        module: 'secure_faiss_manager',
        initialization: false,
        capability_verification: false,
        index_operations: {
          create: false,
          add: false,
          search: false,
          save: false,
          load: false,
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
          can: FAISS_CAPABILITIES.ADMIN,
          with: '*'
        });
        
        const createToken = await this.auth.issueCapability('root', 'test-user', {
          can: FAISS_CAPABILITIES.CREATE,
          with: '*'
        });
        
        const addToken = await this.auth.issueCapability('root', 'test-user', {
          can: FAISS_CAPABILITIES.ADD,
          with: '*'
        });
        
        const searchToken = await this.auth.issueCapability('root', 'test-user', {
          can: FAISS_CAPABILITIES.SEARCH,
          with: '*'
        });
        
        const saveToken = await this.auth.issueCapability('root', 'test-user', {
          can: FAISS_CAPABILITIES.SAVE,
          with: '*'
        });
        
        const loadToken = await this.auth.issueCapability('root', 'test-user', {
          can: FAISS_CAPABILITIES.LOAD,
          with: '*'
        });
        
        const listToken = await this.auth.issueCapability('root', 'test-user', {
          can: FAISS_CAPABILITIES.LIST,
          with: '*'
        });
        
        // Test capability verification
        try {
          // Test with invalid token (should fail)
          try {
            await this.createIndex(128, { authToken: 'invalid-token' });
            testResults.capability_verification = false;
          } catch (error) {
            // This should fail, so it's actually good
            testResults.capability_verification = true;
          }
          
          if (testResults.capability_verification) {
            // Test index operations with valid tokens
            try {
              // Test create index
              const createResult = await this.createIndex(128, { 
                authToken: createToken.token,
                userId: 'test-user',
                indexType: 'Flat'
              });
              testResults.index_operations.create = createResult && createResult.indexId;
              
              if (createResult && createResult.indexId) {
                const indexId = createResult.indexId;
                
                // Test add vectors
                const testVectors = Array(5).fill().map(() => Array(128).fill().map(() => Math.random()));
                const addResult = await this.addVectors(indexId, testVectors, { 
                  authToken: addToken.token,
                  userId: 'test-user'
                });
                testResults.index_operations.add = addResult && addResult.success;
                
                // Test search vectors
                const searchResult = await this.search(indexId, testVectors[0], { 
                  authToken: searchToken.token,
                  userId: 'test-user',
                  k: 3
                });
                testResults.index_operations.search = searchResult && searchResult.results;
                
                // Test save to IPFS
                const saveResult = await this.saveToIPFS(indexId, { 
                  authToken: saveToken.token,
                  userId: 'test-user'
                });
                testResults.index_operations.save = saveResult && saveResult.cid;
                
                // Test list indexes
                const listResult = await this.listIndexes({ 
                  authToken: listToken.token 
                });
                testResults.index_operations.list = listResult && 
                  listResult.success && 
                  listResult.indexes && 
                  listResult.indexes[indexId];
                
                // Test load from IPFS (only if save worked)
                if (saveResult && saveResult.cid) {
                  const cid = saveResult.cid;
                  const loadResult = await this.loadFromIPFS(cid, { 
                    authToken: loadToken.token,
                    userId: 'test-user'
                  });
                  testResults.index_operations.load = loadResult && loadResult.indexId;
                }
                
                // Test stats
                const stats = await this.getStats({ authToken: adminToken.token });
                testResults.stats_tracking = stats && 
                  typeof stats.accessGranted === 'number' && 
                  typeof stats.indexesCreated === 'number' && 
                  typeof stats.vectorsAdded === 'number' && 
                  typeof stats.searchesPerformed === 'number';
              }
            } catch (error) {
              console.error('Index operations tests failed:', error);
              
              // Mark failed operations
              if (!testResults.index_operations.create) testResults.index_operations.create = false;
              if (!testResults.index_operations.add) testResults.index_operations.add = false;
              if (!testResults.index_operations.search) testResults.index_operations.search = false;
              if (!testResults.index_operations.save) testResults.index_operations.save = false;
              if (!testResults.index_operations.load) testResults.index_operations.load = false;
              if (!testResults.index_operations.list) testResults.index_operations.list = false;
              if (!testResults.stats_tracking) testResults.stats_tracking = false;
            }
          }
        } catch (error) {
          console.error('Capability verification test failed:', error);
        }
      }
      
      // Overall success
      testResults.success = testResults.initialization && 
                          testResults.capability_verification &&
                          Object.values(testResults.index_operations).every(Boolean) &&
                          testResults.stats_tracking;
      
      return testResults;
    } catch (error) {
      console.error('Secure FAISS manager test failed:', error);
      return {
        success: false,
        module: 'secure_faiss_manager',
        error: error.message
      };
    }
  }
}

// Create default instance
const secureFaissManager = new SecureFaissManager();

export { SecureFaissManager, secureFaissManager, FAISS_CAPABILITIES };
export default secureFaissManager;
