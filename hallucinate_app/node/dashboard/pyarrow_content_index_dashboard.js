/**
 * PyArrow Content Index Dashboard
 * 
 * Dashboard panel for visualizing and interacting with the PyArrow Content Index
 * Provides interfaces for searching, browsing, and managing content index entries
 * 
 * @module dashboard/pyarrow_content_index_dashboard
 */

const { ipcMain, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');

// Import the Content Browser Integration
import initializeContentBrowser from './content_browser/content_browser_integration.js';
// Import the Statistics Tab Integration
import initializeStatistics from './content_browser/statistics_integration.js';
// Import the Security Integration
import SecurityIntegration from './security/security_integration.js';
// Import the Metrics Integration
import MetricsIntegration from './observability/metrics_integration.js';
// Import the Secure PyArrow Index Manager
import { getSecurePyArrowIndexManager } from '../secure_pyarrow_index_manager.js';
// Import authentication manager
import authManager from '../auth.js';
// Import Real-Time Updates Integration
import integrateRealtimeUpdates from './realtime_updates/realtime_integration.js';

/**
 * Main PyArrow Content Index Dashboard component
 * Provides an interface for the Electron wrapper
 */
export class PyArrowContentIndexDashboardComponent extends EventEmitter {
  // Interval ID for refresh timer
  #refreshIntervalId = null;
  // WebSocket connection
  #webSocket = null;
  // Content browser components
  #contentBrowser = null;
  // Statistics visualization components
  #statistics = null;
  // Security integration
  #security = null;
  // Metrics integration
  #metrics = null;
  /**
   * Create a PyArrow Content Index Dashboard
   * 
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.element - DOM element to render the dashboard in
   * @param {Object} options.eventBus - Event bus for communication
   * @param {Object} options.resources - Resource pool containing dependencies
   * @param {Object} options.config - Configuration options
   */
  constructor(options = {}) {
    super();
    this.element = options.element;
    this.eventBus = options.eventBus;
    this.resources = options.resources || {};
    this.config = options.config || {};
    
    // Get PyArrow Index from resource pool
    this.pyarrowIndex = this.resources.pyarrowIndex;
    
    // Get Secure PyArrow Index Manager
    this.secureIndexManager = this.resources.secureIndexManager || getSecurePyArrowIndexManager();
    
    // Authentication management
    this.authManager = this.resources.authManager || authManager;
    this.authToken = null;  // Will be obtained during initialization
    
    // Default configuration
    this.config = {
      refreshInterval: 30000, // 30 seconds
      pageSize: 25,
      initialPageSize: 25,
      dynamicLoading: true,
      virtualizedRendering: true,
      lazyLoadImages: true,
      prefetchNextPage: true,
      optimizeForLargeDatasets: true,
      sortField: 'updated_at',
      sortDirection: 'desc',
      enableVisualizations: true,
      enableRealTimeUpdates: true,
      ...this.config
    };
    
    // State
    this.currentPage = 1;
    this.currentQuery = '';
    this.currentFilter = {};
    this.totalEntries = 0;
    this.entries = [];
    this.loading = false;
    this.selectedEntry = null;
    this.viewMode = 'list'; // 'list' or 'detail'
    this.stats = null;
    this.contentTypeDistribution = [];
    this.sizeDistribution = [];
    this.storageDistribution = [];
    this.websocketConnected = false;
    this.searchHistory = this._loadSearchHistory();
    
    // Bind event handlers
    this._bindEvents();
    
    // Set up real-time updates if enabled
    if (this.config.enableRealTimeUpdates) {
      this._setupRealTimeUpdates();
    }
  }
  
  /**
   * Initialize the dashboard panel
   * 
   * @returns {Promise<void>}
   */
  async init() {
    this.loading = true;
    this.render();
    
    try {
      // First authenticate with auth manager
      if (!this.authManager.initialized) {
        await this.authManager.init();
      }
      
      // Get capability token for secure PyArrow Index operations
      try {
        // Get read capability for most dashboard operations
        this.authToken = await this.authManager.getSelfSignedToken('pyarrow-index:read');
        // Initialize the secure manager
        await this.secureIndexManager.init();
      } catch (authError) {
        console.warn('Failed to get PyArrow Index capability token:', authError);
        console.warn('Some operations may be restricted due to missing capabilities');
      }
      
      // Fallback to regular PyArrow Index if secure manager is not available
      if (!this.pyarrowIndex && (!this.secureIndexManager || !this.secureIndexManager.initialized)) {
        if (this.resources.pythonBridge) {
          const { PyArrowIndex } = await import('../pyarrow_index.js');
          this.pyarrowIndex = new PyArrowIndex({
            pythonBridge: this.resources.pythonBridge,
            indexPath: this.config.indexPath
          });
          await this.pyarrowIndex.init();
        } else {
          throw new Error('PyArrow Index not available');
        }
      }
      
      // Initialize web workers if supported
      this._initWebWorkers();
      
      // Initialize all UI components
      await this._initializeComponents();
      
      // Initialize virtual list if enabled
      if (this.config.virtualizedRendering) {
        this._initVirtualList();
      }
      
      // Set up refresh interval
      this._startRefreshInterval();
      
      // Load initial data
      await this._loadData();
      
      // Prefetch next page if enabled
      if (this.config.prefetchNextPage && this.totalEntries > this.config.pageSize) {
        this._prefetchNextPage();
      }
      
      // Record initialization success
      this.emit('dashboard-initialized');
    } catch (error) {
      console.error('Failed to initialize PyArrow Content Index Dashboard:', error);
      this._showError('Failed to initialize dashboard', error);
    } finally {
      this.loading = false;
      this.render();
    }
  }
  
  /**
   * Initialize web workers for offloading data processing tasks
   * 
   * @private
   */
  _initWebWorkers() {
    // Check if web workers are supported by the browser
    if (typeof Worker === 'undefined') {
      console.warn('Web Workers are not supported in this browser. Performance optimizations disabled.');
      this.workersEnabled = false;
      return;
    }
    
    try {
      // Import the worker manager
      import('./workers/worker_manager.js').then(({ WorkerManager }) => {
        // Create worker manager with a pool of workers
        this.workerManager = new WorkerManager(
          './workers/pyarrow_content_index_worker.js',
          navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency - 1, 4) : 2, // Use available cores minus 1, max 4
          {
            terminateOnError: false,
            logErrors: true
          }
        );
        
        this.workersEnabled = true;
        console.log('Web Workers initialized for PyArrow Content Index Dashboard');
      }).catch(error => {
        console.error('Failed to initialize Web Workers:', error);
        this.workersEnabled = false;
      });
    } catch (error) {
      console.error('Error setting up Web Workers:', error);
      this.workersEnabled = false;
    }
  }
  
  /**
   * Initialize the virtual list functionality for large datasets
   * This sets up the infrastructure for efficient rendering of large item lists
   * 
   * @private
   */
  _initVirtualList() {
    // Store original entries as the complete data source
    this.allEntries = [];
    
    // Initialize the virtual list configuration
    this.virtualList = {
      itemHeight: 60, // Estimated height of each item in pixels
      containerHeight: 0, // Will be set when container is measured
      visibleItems: [], // Currently visible items
      startIndex: 0, // First visible item index
      endIndex: 0, // Last visible item index
      scrollTop: 0, // Current scroll position
      renderBuffer: 5, // Extra items to render above/below viewport
      scrollTimeout: null, // For scroll debouncing
      cachedPages: new Map(), // Cache for loaded pages
      pendingFetch: null, // Promise for ongoing fetches
      loadedRanges: [] // Tracks which ranges of items are already loaded
    };
    
    // Initialize IndexedDB cache if enabled
    if (this.config.useIndexedDBCache !== false) {
      this._initIndexedDBCache();
    }
    
    // Add scroll event listener after render
    setTimeout(() => {
      const contentContainer = document.querySelector('.content-list-container');
      if (contentContainer) {
        // Store container height
        this.virtualList.containerHeight = contentContainer.clientHeight;
        
        // Add scroll listener
        contentContainer.addEventListener('scroll', this._handleVirtualScroll.bind(this));
        
        // Add resize observer to update container dimensions
        if (window.ResizeObserver) {
          const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
              if (entry.target === contentContainer) {
                this.virtualList.containerHeight = entry.contentRect.height;
                this._updateVisibleItems();
              }
            }
          });
          resizeObserver.observe(contentContainer);
          this.virtualList.resizeObserver = resizeObserver;
        }
      }
    }, 100);
  }
  
  /**
   * Initialize IndexedDB cache for persisting data between sessions
   * This improves performance by storing query results locally
   * 
   * @private
   */
  _initIndexedDBCache() {
    // Set up IndexedDB for caching if available in browser
    if (!window.indexedDB) {
      console.warn('IndexedDB not supported in this browser. Local caching disabled.');
      this.indexedDBCache = null;
      return;
    }
    
    this.indexedDBCache = {
      dbName: 'pyarrow-content-index-cache',
      dbVersion: 1,
      pageStore: 'pages',
      statsStore: 'stats',
      metadataStore: 'metadata',
      db: null,
      ready: false,
      openPromise: null,
      maxCacheAge: this.config.maxCacheAge || 24 * 60 * 60 * 1000, // Default 24 hours in ms
      maxCacheSize: this.config.maxCacheSize || 1000 // Default max 1000 cache entries
    };
    
    // Open the database
    this.indexedDBCache.openPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(this.indexedDBCache.dbName, this.indexedDBCache.dbVersion);
      
      // Handle database upgrade/creation
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create stores if they don't exist
        if (!db.objectStoreNames.contains(this.indexedDBCache.pageStore)) {
          const pageStore = db.createObjectStore(this.indexedDBCache.pageStore, { keyPath: 'cacheKey' });
          pageStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(this.indexedDBCache.statsStore)) {
          const statsStore = db.createObjectStore(this.indexedDBCache.statsStore, { keyPath: 'key' });
          statsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(this.indexedDBCache.metadataStore)) {
          const metadataStore = db.createObjectStore(this.indexedDBCache.metadataStore, { keyPath: 'key' });
        }
      };
      
      // Success handler
      request.onsuccess = (event) => {
        this.indexedDBCache.db = event.target.result;
        this.indexedDBCache.ready = true;
        console.log('PyArrow Content Index IndexedDB cache initialized');
        
        // Set up some metadata
        this._updateCacheMetadata({
          lastAccess: new Date().toISOString(),
          version: this.config.cacheVersion || '1.0.0'
        });
        
        // Schedule cache cleanup
        setTimeout(() => this._cleanupCache(), 5000);
        
        resolve(this.indexedDBCache.db);
      };
      
      // Error handler
      request.onerror = (event) => {
        console.error('Error opening IndexedDB cache:', event.target.error);
        this.indexedDBCache = null;
        reject(event.target.error);
      };
    }).catch(error => {
      console.error('Failed to initialize IndexedDB cache:', error);
      this.indexedDBCache = null;
    });
  }
  
  /**
   * Update cache metadata
   * 
   * @param {Object} metadata - Metadata to update
   * @private
   */
  async _updateCacheMetadata(metadata) {
    if (!this.indexedDBCache || !this.indexedDBCache.ready) return;
    
    try {
      // Wait for database to be ready
      await this.indexedDBCache.openPromise;
      
      // Start a transaction
      const transaction = this.indexedDBCache.db.transaction([this.indexedDBCache.metadataStore], 'readwrite');
      const store = transaction.objectStore(this.indexedDBCache.metadataStore);
      
      // Create/update each metadata key
      for (const [key, value] of Object.entries(metadata)) {
        const metadataObj = {
          key,
          value,
          timestamp: Date.now()
        };
        store.put(metadataObj);
      }
    } catch (error) {
      console.error('Error updating cache metadata:', error);
    }
  }
  
  /**
   * Get cache metadata
   * 
   * @param {string} key - Metadata key to retrieve
   * @returns {Promise<any>} - The metadata value
   * @private
   */
  async _getCacheMetadata(key) {
    if (!this.indexedDBCache || !this.indexedDBCache.ready) return null;
    
    try {
      // Wait for database to be ready
      await this.indexedDBCache.openPromise;
      
      // Start a transaction
      const transaction = this.indexedDBCache.db.transaction([this.indexedDBCache.metadataStore], 'readonly');
      const store = transaction.objectStore(this.indexedDBCache.metadataStore);
      
      // Get the metadata
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        
        request.onsuccess = (event) => {
          const result = event.target.result;
          resolve(result ? result.value : null);
        };
        
        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`Error getting cache metadata for key ${key}:`, error);
      return null;
    }
  }
  
  /**
   * Cache page results in IndexedDB
   * 
   * @param {number} page - Page number
   * @param {Object} result - Page data to cache
   * @private
   */
  async _cachePageResult(page, result) {
    if (!this.indexedDBCache || !this.indexedDBCache.ready) return;
    
    try {
      // Wait for database to be ready
      await this.indexedDBCache.openPromise;
      
      // Generate cache key
      const cacheKey = this._generateCacheKey(page);
      
      // Prepare data for storage
      const cacheData = {
        cacheKey,
        page,
        data: result,
        query: {
          filter: this.currentFilter,
          sortField: this.config.sortField,
          sortDirection: this.config.sortDirection,
          query: this.currentQuery
        },
        timestamp: Date.now()
      };
      
      // Start a transaction
      const transaction = this.indexedDBCache.db.transaction([this.indexedDBCache.pageStore], 'readwrite');
      const store = transaction.objectStore(this.indexedDBCache.pageStore);
      
      // Store the data
      store.put(cacheData);
    } catch (error) {
      console.error(`Error caching page ${page}:`, error);
    }
  }
  
  /**
   * Get cached page results from IndexedDB
   * 
   * @param {number} page - Page number to retrieve
   * @returns {Promise<Object|null>} - Cached page data or null if not found
   * @private
   */
  async _getCachedPage(page) {
    if (!this.indexedDBCache || !this.indexedDBCache.ready) return null;
    
    try {
      // Wait for database to be ready
      await this.indexedDBCache.openPromise;
      
      // Generate cache key
      const cacheKey = this._generateCacheKey(page);
      
      // Start a transaction
      const transaction = this.indexedDBCache.db.transaction([this.indexedDBCache.pageStore], 'readonly');
      const store = transaction.objectStore(this.indexedDBCache.pageStore);
      
      // Get the data
      return new Promise((resolve, reject) => {
        const request = store.get(cacheKey);
        
        request.onsuccess = (event) => {
          const result = event.target.result;
          
          // Check if the cache entry exists and is still valid
          if (result && (Date.now() - result.timestamp) < this.indexedDBCache.maxCacheAge) {
            // Update access timestamp
            this._updateCacheEntryTimestamp(cacheKey);
            resolve(result.data);
          } else {
            resolve(null);
          }
        };
        
        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(`Error getting cached page ${page}:`, error);
      return null;
    }
  }
  
  /**
   * Update a cache entry's timestamp to mark it as recently accessed
   * 
   * @param {string} cacheKey - The cache key to update
   * @private
   */
  async _updateCacheEntryTimestamp(cacheKey) {
    if (!this.indexedDBCache || !this.indexedDBCache.ready) return;
    
    try {
      // Wait for database to be ready
      await this.indexedDBCache.openPromise;
      
      // Start a transaction
      const transaction = this.indexedDBCache.db.transaction([this.indexedDBCache.pageStore], 'readwrite');
      const store = transaction.objectStore(this.indexedDBCache.pageStore);
      
      // Get the existing entry
      const request = store.get(cacheKey);
      
      request.onsuccess = (event) => {
        const existingData = event.target.result;
        if (existingData) {
          // Update timestamp
          existingData.timestamp = Date.now();
          // Put it back
          store.put(existingData);
        }
      };
    } catch (error) {
      console.error(`Error updating cache entry timestamp for ${cacheKey}:`, error);
    }
  }
  
  /**
   * Generate a cache key for a page
   * Creates a key based on the current query parameters
   * 
   * @param {number} page - Page number
   * @returns {string} - Cache key
   * @private
   */
  _generateCacheKey(page) {
    const queryParams = {
      filter: this.currentFilter,
      sort: {
        field: this.config.sortField,
        direction: this.config.sortDirection
      },
      query: this.currentQuery,
      page,
      pageSize: this.config.pageSize
    };
    
    // Create a deterministic key from query parameters
    return `page_${page}_${JSON.stringify(queryParams)}`;
  }
  
  /**
   * Clean up old cache entries to prevent excessive storage usage
   * 
   * @private
   */
  async _cleanupCache() {
    if (!this.indexedDBCache || !this.indexedDBCache.ready) return;
    
    try {
      // Wait for database to be ready
      await this.indexedDBCache.openPromise;
      
      // Get all cache entries sorted by timestamp
      const transaction = this.indexedDBCache.db.transaction([this.indexedDBCache.pageStore], 'readonly');
      const store = transaction.objectStore(this.indexedDBCache.pageStore);
      const timestampIndex = store.index('timestamp');
      
      const allEntries = await new Promise((resolve, reject) => {
        const entries = [];
        const request = timestampIndex.openCursor();
        
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            entries.push(cursor.value);
            cursor.continue();
          } else {
            resolve(entries);
          }
        };
        
        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
      
      // Check if we need to clean up old entries
      if (allEntries.length > this.indexedDBCache.maxCacheSize) {
        console.log(`Cache cleanup: ${allEntries.length} entries found, max is ${this.indexedDBCache.maxCacheSize}`);
        
        // Sort by timestamp (oldest first)
        allEntries.sort((a, b) => a.timestamp - b.timestamp);
        
        // Calculate how many entries to remove
        const toRemove = allEntries.length - this.indexedDBCache.maxCacheSize;
        const entriesToRemove = allEntries.slice(0, toRemove);
        
        // Remove old entries
        const deleteTransaction = this.indexedDBCache.db.transaction([this.indexedDBCache.pageStore], 'readwrite');
        const deleteStore = deleteTransaction.objectStore(this.indexedDBCache.pageStore);
        
        for (const entry of entriesToRemove) {
          deleteStore.delete(entry.cacheKey);
        }
        
        console.log(`Cache cleanup: Removed ${entriesToRemove.length} old entries`);
      }
      
      // Also remove any expired entries
      const now = Date.now();
      const expiredEntries = allEntries.filter(entry => 
        (now - entry.timestamp) > this.indexedDBCache.maxCacheAge
      );
      
      if (expiredEntries.length > 0) {
        const expiredTransaction = this.indexedDBCache.db.transaction([this.indexedDBCache.pageStore], 'readwrite');
        const expiredStore = expiredTransaction.objectStore(this.indexedDBCache.pageStore);
        
        for (const entry of expiredEntries) {
          expiredStore.delete(entry.cacheKey);
        }
        
        console.log(`Cache cleanup: Removed ${expiredEntries.length} expired entries`);
      }
    } catch (error) {
      console.error('Error cleaning up cache:', error);
    }
  }
  
  /**
   * Cache statistics data in IndexedDB
   * 
   * @param {Object} stats - Statistics to cache
   * @private
   */
  async _cacheStats(stats) {
    if (!this.indexedDBCache || !this.indexedDBCache.ready) return;
    
    try {
      // Wait for database to be ready
      await this.indexedDBCache.openPromise;
      
      // Prepare data for storage
      const cacheData = {
        key: 'dashboard_stats',
        data: stats,
        timestamp: Date.now()
      };
      
      // Start a transaction
      const transaction = this.indexedDBCache.db.transaction([this.indexedDBCache.statsStore], 'readwrite');
      const store = transaction.objectStore(this.indexedDBCache.statsStore);
      
      // Store the data
      store.put(cacheData);
    } catch (error) {
      console.error('Error caching stats:', error);
    }
  }
  
  /**
   * Get cached statistics from IndexedDB
   * 
   * @returns {Promise<Object|null>} - Cached stats or null if not found
   * @private
   */
  async _getCachedStats() {
    if (!this.indexedDBCache || !this.indexedDBCache.ready) return null;
    
    try {
      // Wait for database to be ready
      await this.indexedDBCache.openPromise;
      
      // Start a transaction
      const transaction = this.indexedDBCache.db.transaction([this.indexedDBCache.statsStore], 'readonly');
      const store = transaction.objectStore(this.indexedDBCache.statsStore);
      
      // Get the data
      return new Promise((resolve, reject) => {
        const request = store.get('dashboard_stats');
        
        request.onsuccess = (event) => {
          const result = event.target.result;
          
          // Check if the cache entry exists and is still valid
          if (result && (Date.now() - result.timestamp) < this.indexedDBCache.maxCacheAge) {
            resolve(result.data);
          } else {
            resolve(null);
          }
        };
        
        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error('Error getting cached stats:', error);
      return null;
    }
  }
  
  /**
   * Clear the entire cache
   * Useful for troubleshooting or when the schema changes
   * 
   * @returns {Promise<boolean>} - Success flag
   */
  async clearCache() {
    if (!this.indexedDBCache || !this.indexedDBCache.ready) return false;
    
    try {
      // Wait for database to be ready
      await this.indexedDBCache.openPromise;
      
      // Clear all object stores
      const stores = [
        this.indexedDBCache.pageStore,
        this.indexedDBCache.statsStore
      ];
      
      for (const storeName of stores) {
        const transaction = this.indexedDBCache.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        store.clear();
      }
      
      console.log('IndexedDB cache cleared');
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return false;
    }
  }
  
  /**
   * Handle virtual list scrolling
   * This is the event handler for the scroll event on the content container
   * 
   * @param {Event} event - The scroll event
   * @private
   */
  _handleVirtualScroll(event) {
    // Update scrollTop position
    this.virtualList.scrollTop = event.target.scrollTop;
    
    // Debounce scroll handling for better performance
    if (this.virtualList.scrollTimeout) {
      clearTimeout(this.virtualList.scrollTimeout);
    }
    
    this.virtualList.scrollTimeout = setTimeout(() => {
      this._updateVisibleItems();
      
      // Check if we're near the bottom to load more data
      const { scrollTop, scrollHeight, clientHeight } = event.target;
      const scrolledToBottom = scrollTop + clientHeight > scrollHeight - 200;
      
      if (scrolledToBottom && this.totalEntries > this.entries.length) {
        this._loadMoreItems();
      }
    }, 50);
  }
  
  /**
   * Update which items are visible in the virtual list
   * This calculates which items should be rendered based on scroll position
   * 
   * @private
   */
  _updateVisibleItems() {
    if (!this.config.virtualizedRendering || !this.virtualList) return;
    
    const { itemHeight, containerHeight, renderBuffer, scrollTop } = this.virtualList;
    
    // Calculate visible range
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - renderBuffer);
    const visibleCount = Math.ceil(containerHeight / itemHeight) + (renderBuffer * 2);
    const endIndex = Math.min(this.entries.length - 1, startIndex + visibleCount);
    
    // Update virtual list state
    this.virtualList.startIndex = startIndex;
    this.virtualList.endIndex = endIndex;
    this.virtualList.visibleItems = this.entries.slice(startIndex, endIndex + 1);
    
    // Apply updates to DOM
    this._renderVisibleItems();
    
    // Check if we need to load more data
    const threshold = Math.min(this.entries.length, this.virtualList.endIndex + 10);
    if (threshold >= this.entries.length && this.totalEntries > this.entries.length) {
      this._prefetchNextPage();
    }
  }
  
  /**
   * Render only the visible items in the virtual list
   * This updates the DOM to show only what's currently visible
   * 
   * @private
   */
  _renderVisibleItems() {
    // Skip if not using virtualized rendering
    if (!this.config.virtualizedRendering || !this.virtualList) return;
    
    const tbody = document.querySelector('.content-list-table tbody');
    if (!tbody) return;
    
    const { startIndex, endIndex, visibleItems, itemHeight } = this.virtualList;
    
    // Create spacer rows for proper scrolling
    const topSpacer = document.createElement('tr');
    topSpacer.classList.add('virtual-spacer');
    topSpacer.style.height = `${startIndex * itemHeight}px`;
    
    const bottomSpacer = document.createElement('tr');
    bottomSpacer.classList.add('virtual-spacer');
    const bottomSpacerHeight = Math.max(0, (this.entries.length - endIndex - 1) * itemHeight);
    bottomSpacer.style.height = `${bottomSpacerHeight}px`;
    
    // Create rows for visible items
    const visibleRows = visibleItems.map((entry, index) => {
      const realIndex = startIndex + index;
      const size = entry.size ? this._formatSize(entry.size) : 'N/A';
      const updated = entry.updated_at ? new Date(entry.updated_at).toLocaleString() : 'N/A';
      const typeIcon = this._getTypeIcon(entry.mimetype);
      
      const row = document.createElement('tr');
      row.dataset.index = realIndex;
      row.innerHTML = `
        <td><i class="${typeIcon}"></i> ${entry.mimetype?.split('/')[0] || 'Unknown'}</td>
        <td>${entry.path || 'N/A'}</td>
        <td><span class="cid-display" title="${entry.cid}">${this._shortenCid(entry.cid)}</span></td>
        <td>${size}</td>
        <td>${updated}</td>
        <td>
          <button class="view-btn" data-index="${realIndex}" title="View Details"><i class="fa fa-eye"></i></button>
          <button class="copy-btn" data-cid="${entry.cid}" title="Copy CID"><i class="fa fa-copy"></i></button>
          <button class="download-btn" data-cid="${entry.cid}" title="Download"><i class="fa fa-download"></i></button>
        </td>
      `;
      return row;
    });
    
    // Clear current content
    tbody.innerHTML = '';
    
    // Add spacers and visible rows
    tbody.appendChild(topSpacer);
    visibleRows.forEach(row => tbody.appendChild(row));
    tbody.appendChild(bottomSpacer);
    
    // Set up event listeners for the new rows
    this._setupItemEventListeners();
  }
  
  /**
   * Set up event listeners for virtual list item rows
   * 
   * @private
   */
  _setupItemEventListeners() {
    // View buttons
    const viewButtons = document.querySelectorAll('.view-btn');
    viewButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index, 10);
        this._viewEntry(index);
      });
    });
    
    // Copy buttons
    const copyButtons = document.querySelectorAll('.copy-btn');
    copyButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cid = e.currentTarget.dataset.cid;
        this._handleCopyCid(cid);
      });
    });
    
    // Download buttons
    const downloadButtons = document.querySelectorAll('.download-btn');
    downloadButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cid = e.currentTarget.dataset.cid;
        this._handleDownload(cid);
      });
    });
  }
  
  /**
   * Load more items for infinite scrolling
   * This loads the next page of data when the user scrolls near the bottom
   * 
   * @private
   */
  async _loadMoreItems() {
    // Skip if already loading or we've loaded all items
    if (this.loading || this.entries.length >= this.totalEntries) return;
    
    try {
      this.loading = true;
      
      // Calculate which page we need
      const nextPage = Math.floor(this.entries.length / this.config.pageSize) + 1;
      
      // Show loading indicator at the bottom
      this._showLoadingIndicator();
      
      // Load the next page of data
      const result = await this._fetchPage(nextPage);
      
      if (result && result.entries) {
        // Append the new entries to our current list
        this.entries = [...this.entries, ...result.entries];
        
        // If we're using virtualized rendering, update the view
        if (this.config.virtualizedRendering) {
          this._updateVisibleItems();
        } else {
          // Otherwise, do a full render
          this.render();
        }
        
        // Update total count if needed
        if (result.totalEntries) {
          this.totalEntries = result.totalEntries;
        }
        
        // Emit event if eventBus is available
        if (this.eventBus) {
          this.eventBus.emit('content-index-more-loaded', {
            page: nextPage,
            newEntries: result.entries.length,
            totalLoaded: this.entries.length,
            totalEntries: this.totalEntries
          });
        }
      }
    } catch (error) {
      console.error('Error loading more items:', error);
      this._showError('Failed to load more items');
    } finally {
      this.loading = false;
      this._hideLoadingIndicator();
    }
  }
  
  /**
   * Prefetch the next page of data for faster scrolling
   * This loads data before the user reaches the end for a smoother experience
   * 
   * @private
   */
  async _prefetchNextPage() {
    // Skip if already prefetching, loading, or we've loaded all items
    if (
      this.virtualList.pendingFetch || 
      this.loading || 
      this.entries.length >= this.totalEntries
    ) return;
    
    try {
      // Calculate which page we need
      const nextPage = Math.floor(this.entries.length / this.config.pageSize) + 1;
      
      // Check if we already have this page cached
      if (this.virtualList.cachedPages.has(nextPage)) return;
      
      // Set pending fetch flag
      this.virtualList.pendingFetch = this._fetchPage(nextPage, true);
      
      // Wait for fetch to complete
      const result = await this.virtualList.pendingFetch;
      
      // Cache the result if successful
      if (result && result.entries) {
        this.virtualList.cachedPages.set(nextPage, result);
        
        // Track loaded range
        this.virtualList.loadedRanges.push({
          start: this.entries.length,
          end: this.entries.length + result.entries.length - 1
        });
        
        // Emit event if eventBus is available
        if (this.eventBus) {
          this.eventBus.emit('content-index-page-prefetched', {
            page: nextPage,
            entriesCount: result.entries.length
          });
        }
      }
    } catch (error) {
      console.error('Error prefetching next page:', error);
    } finally {
      // Clear pending fetch flag
      this.virtualList.pendingFetch = null;
    }
  }
  
  /**
   * Fetch a specific page of content index data
   * 
   * @param {number} page - The page number to fetch (1-based)
   * @param {boolean} isPrefetch - Whether this is a prefetch operation
   * @returns {Promise<Object>} The fetched data
   * @private
   */
  async _fetchPage(page, isPrefetch = false) {
    // Check if we already have this page cached in memory
    if (this.virtualList && this.virtualList.cachedPages.has(page)) {
      return this.virtualList.cachedPages.get(page);
    }
    
    // Check if we have this page cached in IndexedDB
    if (this.indexedDBCache && this.indexedDBCache.ready && !isPrefetch) {
      try {
        const cachedData = await this._getCachedPage(page);
        if (cachedData) {
          console.log(`Retrieved page ${page} from IndexedDB cache`);
          
          // Cache in memory as well
          if (this.virtualList) {
            this.virtualList.cachedPages.set(page, cachedData);
          }
          
          return cachedData;
        }
      } catch (error) {
        console.warn(`Error retrieving page ${page} from cache:`, error);
        // Continue to fetch from server
      }
    }
    
    // Calculate offset and limit
    const offset = (page - 1) * this.config.pageSize;
    const limit = this.config.pageSize;
    
    // Prepare query parameters
    const params = {
      offset,
      limit,
      query: this.currentQuery,
      filter: this.currentFilter,
      sortField: this.config.sortField,
      sortDirection: this.config.sortDirection
    };
    
    try {
      let data;
      
      // Use either secure manager or regular index
      if (this.secureIndexManager && this.secureIndexManager.initialized && this.authToken) {
        data = await this.secureIndexManager.searchContentIndex(
          params,
          this.authToken
        );
      } else if (this.pyarrowIndex) {
        data = await this.pyarrowIndex.search(params);
      } else {
        throw new Error('No content index available');
      }
      
      const result = {
        entries: data.entries || [],
        totalEntries: data.totalEntries,
        page
      };
      
      // Cache the result in memory
      if (this.virtualList) {
        this.virtualList.cachedPages.set(page, result);
      }
      
      // Cache in IndexedDB for persistence between sessions
      if (this.indexedDBCache && this.indexedDBCache.ready) {
        this._cachePageResult(page, result);
      }
      
      return result;
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      if (!isPrefetch) {
        // Only show error for actual user-triggered loads, not prefetches
        this._showError(`Failed to load page ${page}`);
      }
      throw error;
    }
  }
  
  /**
   * Show loading indicator for infinite scroll
   * 
   * @private
   */
  _showLoadingIndicator() {
    const container = document.querySelector('.content-list-container');
    if (!container) return;
    
    // Check if loading indicator already exists
    let loadingIndicator = container.querySelector('.loading-indicator');
    if (loadingIndicator) return;
    
    // Create loading indicator
    loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = '<div class="spinner"></div><p>Loading more content...</p>';
    
    // Append to container
    container.appendChild(loadingIndicator);
  }
  
  /**
   * Hide loading indicator for infinite scroll
   * 
   * @private
   */
  _hideLoadingIndicator() {
    const loadingIndicator = document.querySelector('.loading-indicator');
    if (loadingIndicator && loadingIndicator.parentNode) {
      loadingIndicator.parentNode.removeChild(loadingIndicator);
    }
  }
  
  /**
   * Initialize the content browser components (metadata browser and search interface)
   * 
   * @returns {Promise<void>}
   * @private
   */
  /**
   * Check if the user has a specific capability
   * 
   * @param {string} capability - The capability to check for
   * @returns {Promise<boolean>} - Whether the user has the capability
   * @private
   */
  async _hasCapability(capability) {
    if (!this.authToken || !this.secureIndexManager?.initialized) {
      return false;
    }
    
    try {
      // Try to validate the capability directly with the auth manager
      const result = await this.authManager.verifyCapability(
        this.authToken,
        capability
      );
      return result;
    } catch (error) {
      console.warn(`Failed to verify capability ${capability}:`, error);
      return false;
    }
  }
  
  /**
   * Get an auth token with a specific capability
   * 
   * @param {string} capability - The capability to request
   * @returns {Promise<string|null>} - The auth token or null if failed
   * @private
   */
  async _getCapabilityToken(capability) {
    try {
      return await this.authManager.getSelfSignedToken(capability);
    } catch (error) {
      console.warn(`Failed to get token for capability ${capability}:`, error);
      return null;
    }
  }
  
  /**
   * Initialize the dashboard components including content browser, statistics, security, and metrics
   * 
   * @returns {Promise<void>}
   * @private
   */
  async _initializeComponents() {
    try {
      // Initialize content browser
      await this._initializeContentBrowser();
      
      // Set up the content browser metadata browser and search interface
      this._setupContentBrowser();
      
      // Initialize statistics tab
      await this._initializeStatistics();
      
      // Initialize security tab
      await this._initializeSecurity();
      
      // Initialize metrics tab
      await this._initializeMetrics();
      
      // Set up real-time updates if enabled
      if (this.config.enableRealtimeUpdates !== false) {
        this._setupRealTimeUpdates();
      }
      
      console.log('Dashboard components initialized successfully');
    } catch (error) {
      console.error('Failed to initialize dashboard components:', error);
    }
  }
  
  /**
   * Initialize the content browser components
   * 
   * @returns {Promise<void>}
   * @private
   */
  async _initializeContentBrowser() {
    try {
      // Find the browser tab content area
      const browserTabContent = document.getElementById('browser-tab');
      
      if (!browserTabContent) {
        console.warn('Browser tab content area not found');
        return;
      }
      
      // Create a container for the content browser
      const contentBrowserContainer = document.createElement('div');
      contentBrowserContainer.id = 'content-browser-container';
      contentBrowserContainer.className = 'content-browser-container';
      
      // Replace the existing content of the browser tab
      browserTabContent.innerHTML = '';
      browserTabContent.appendChild(contentBrowserContainer);
      
      // Initialize the content browser components
      this.#contentBrowser = await initializeContentBrowser({
        container: contentBrowserContainer,
        bridge: this.pyarrowIndex || this.resources.pyarrowIndexBridge || this.resources.securePyArrowIndexManager,
        eventBus: this.eventBus,
        config: {
          browserConfig: {
            pageSize: this.config.pageSize,
            initialView: this.config.initialView || 'grid',
            enableInfiniteScroll: this.config.enableInfiniteScroll !== false,
            thumbnailSize: this.config.thumbnailSize || 'medium',
            enableDragDrop: this.config.enableDragDrop !== false,
            enableMultiSelect: this.config.enableMultiSelect !== false
          },
          searchConfig: {
            enableSavedSearches: this.config.enableSavedSearches !== false,
            enableSearchHistory: this.config.enableSearchHistory !== false,
            maxHistoryItems: this.config.maxHistoryItems || 10,
            maxSavedSearches: this.config.maxSavedSearches || 20
          }
        }
      });
      
      console.log('Content browser components initialized successfully');
      
      // Connect the content browser to the dashboard events
      if (this.#contentBrowser && this.#contentBrowser.success) {
        // When a metadata item is selected in the browser
        this.#contentBrowser.metadataBrowser.on('selection-change', (selectedItem) => {
          this.selectedEntry = selectedItem;
          
          // If details modal exists, show it with the selected item
          const detailsModal = document.getElementById('content-details-modal');
          if (detailsModal && selectedItem) {
            this._showContentDetails(selectedItem);
          }
        });
        
        // When the dashboard receives a real-time update
        if (this.eventBus) {
          this.eventBus.on('content-index-updated', (updateData) => {
            this.eventBus.emit('refresh-content-browser', updateData);
          });
        }
      }
    } catch (error) {
      console.error('Failed to initialize content browser components:', error);
    }
  }
  
  /**
   * Initialize the statistics tab components
   * 
   * @returns {Promise<void>}
   * @private
   */
  async _initializeStatistics() {
    try {
      // Find the statistics tab content area
      const statsTabContent = document.getElementById('stats-tab');
      
      if (!statsTabContent) {
        console.warn('Statistics tab content area not found');
        return;
      }
      
      // Initialize the statistics components
      this.#statistics = await initializeStatistics({
        container: statsTabContent,
        bridge: this.pyarrowIndex || this.resources.pyarrowIndexBridge || this.resources.securePyArrowIndexManager,
        eventBus: this.eventBus,
        config: {
          visualizationConfig: {
            enableRealtimeUpdates: this.config.enableRealTimeUpdates !== false,
            colorScheme: this.config.chartColorScheme || 'default'
          }
        }
      });
      
      console.log('Statistics components initialized successfully');
      
      // Set up tab change events if not already handled by the event bus
      if (!this.eventBus) {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
          tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            if (tabId === 'stats' && this.#statistics && this.#statistics.visualizationManager) {
              // Render charts when the Statistics tab is shown
              setTimeout(() => this.#statistics.visualizationManager.renderCharts(), 100);
            }
          });
        });
      }
    } catch (error) {
      console.error('Failed to initialize statistics components:', error);
    }
  }
  
  /**
   * Initialize the security tab components
   * 
   * @returns {Promise<void>}
   * @private
   */
  async _initializeSecurity() {
    try {
      // Find the security tab content area
      const securityTabContent = document.getElementById('security-tab');
      
      if (!securityTabContent) {
        console.warn('Security tab content area not found');
        return;
      }
      
      // Create a container for the security panel
      const securityContainer = document.createElement('div');
      securityContainer.id = 'security-panel-container';
      securityContainer.className = 'security-panel-container';
      
      // Create a capability status banner at the top
      const capabilityStatusBanner = document.createElement('div');
      capabilityStatusBanner.id = 'capability-status-banner';
      capabilityStatusBanner.className = 'capability-status-banner';
      
      // Add the status banner before the security container
      securityTabContent.innerHTML = '';
      securityTabContent.appendChild(capabilityStatusBanner);
      securityTabContent.appendChild(securityContainer);
      
      // Render the capability status from the secure PyArrow Index Manager
      await this._renderCapabilityStatus(capabilityStatusBanner);
      
      // Get UCAN manager from resources if available
      const ucanManager = this.resources.ucanManager || this.resources.auth || this.authManager;
      
      // Initialize the security integration
      this.#security = new SecurityIntegration({
        container: securityContainer,
        ucanManager: ucanManager,
        eventBus: this.eventBus,
        pyarrowIndex: this.secureIndexManager || this.pyarrowIndex || this.resources.pyarrowIndexBridge || this.resources.securePyArrowIndexManager,
        onError: (message, error) => {
          console.error(message, error);
          this._showError(message, error);
        },
        useMockImplementation: !ucanManager // Use mock implementation if no UCAN manager is available
      });
      
      await this.#security.init();
      
      console.log('Security components initialized successfully');
      
      // Set up tab change events if not already handled by the event bus
      if (!this.eventBus) {
        const securityTab = document.querySelector('.tab[data-tab="security"]');
        if (securityTab) {
          securityTab.addEventListener('click', () => {
            if (this.#security) {
              // Refresh security panel when the tab is shown
              this.eventBus.emit('tab-shown', 'security');
              // Also refresh capability status
              this._renderCapabilityStatus(capabilityStatusBanner);
            }
          });
        }
      }
      
      // Set up event listener for capability changes from the auth manager
      if (this.eventBus) {
        this.eventBus.on('capability-changed', () => {
          this._renderCapabilityStatus(capabilityStatusBanner);
        });
      }
    } catch (error) {
      console.error('Failed to initialize security components:', error);
    }
  }
  
  /**
   * Render the capability status banner
   * @private
   * @param {HTMLElement} container - Container element for the status
   * @returns {Promise<void>}
   */
  async _renderCapabilityStatus(container) {
    if (!container) return;
    
    try {
      const capabilities = [];
      let authStatus = 'unauthorized';
      let statusClass = 'status-error';
      let statusMessage = 'Not authenticated';
      
      // Check if we have a secure manager and authentication
      if (this.secureIndexManager?.initialized && this.authToken) {
        authStatus = 'authenticated';
        statusClass = 'status-warning';
        statusMessage = 'Limited access';
        
        // Check for specific capabilities
        const capabilityChecks = [
          { name: 'READ', capability: 'pyarrow-index:read', icon: 'icon-read' },
          { name: 'WRITE', capability: 'pyarrow-index:write', icon: 'icon-write' },
          { name: 'SYNC', capability: 'pyarrow-index:sync', icon: 'icon-sync' },
          { name: 'EXPORT', capability: 'pyarrow-index:export', icon: 'icon-export' },
          { name: 'IMPORT', capability: 'pyarrow-index:import', icon: 'icon-import' },
          { name: 'DELETE', capability: 'pyarrow-index:delete', icon: 'icon-delete' },
          { name: 'ADMIN', capability: 'pyarrow-index:admin', icon: 'icon-admin' }
        ];
        
        // Check each capability
        let hasCapabilities = false;
        for (const capCheck of capabilityChecks) {
          const hasCapability = await this._hasCapability(capCheck.capability);
          capabilities.push({
            name: capCheck.name,
            capability: capCheck.capability,
            granted: hasCapability,
            icon: capCheck.icon
          });
          
          if (hasCapability) {
            hasCapabilities = true;
          }
          
          // If admin capability is granted, we have full access
          if (hasCapability && capCheck.name === 'ADMIN') {
            statusClass = 'status-success';
            statusMessage = 'Full access';
            break;
          }
        }
        
        // Update status based on capabilities
        if (hasCapabilities) {
          statusClass = capabilities.some(cap => cap.name === 'WRITE' && cap.granted) ? 
            'status-success' : 'status-warning';
          statusMessage = capabilities.some(cap => cap.name === 'WRITE' && cap.granted) ?
            'Write access granted' : 'Read-only access';
        }
      } else if (!this.authManager?.initialized) {
        // Auth manager is not initialized
        statusMessage = 'Authentication unavailable';
      } else if (!this.secureIndexManager?.initialized) {
        // Secure manager is not initialized
        statusMessage = 'Secure manager unavailable';
      } else if (!this.authToken) {
        // Missing auth token
        statusMessage = 'Authentication required';
      }
      
      // Render the status banner
      container.innerHTML = `
        <div class="capability-status ${statusClass}">
          <div class="status-header">
            <h3>PyArrow Index Security Status</h3>
            <span class="status-indicator ${statusClass}">${statusMessage}</span>
          </div>
          <div class="capability-badges">
            ${capabilities.map(cap => `
              <div class="capability-badge ${cap.granted ? 'granted' : 'denied'}" 
                   title="${cap.capability}">
                <i class="${cap.icon || 'icon-key'}"></i>
                <span>${cap.name}</span>
              </div>
            `).join('')}
          </div>
          ${!this.authToken ? `
            <div class="auth-actions">
              <button id="btn-authenticate" class="primary-button">Authenticate</button>
            </div>
          ` : ''}
        </div>
      `;
      
      // Add authentication button handler if needed
      if (!this.authToken) {
        const authButton = container.querySelector('#btn-authenticate');
        if (authButton) {
          authButton.addEventListener('click', async () => {
            try {
              // Attempt to get a self-signed token for basic read access
              this.authToken = await this.authManager.getSelfSignedToken('pyarrow-index:read');
              
              // Update the status display
              await this._renderCapabilityStatus(container);
              
              // Notify that capabilities have changed
              if (this.eventBus) {
                this.eventBus.emit('capability-changed');
              }
            } catch (error) {
              console.error('Authentication failed:', error);
              this._showError('Authentication failed', error);
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to render capability status:', error);
      container.innerHTML = `
        <div class="capability-status status-error">
          <div class="status-header">
            <h3>PyArrow Index Security Status</h3>
            <span class="status-indicator status-error">Error loading status</span>
          </div>
          <p class="error-message">${error.message}</p>
        </div>
      `;
    }
  }
  
  /**
   * Initialize the metrics tab components
   * 
   * @returns {Promise<void>}
   * @private
   */
  async _initializeMetrics() {
    try {
      // Find the metrics tab content area
      const metricsTabContent = document.getElementById('metrics-tab');
      
      if (!metricsTabContent) {
        console.warn('Metrics tab content area not found');
        return;
      }
      
      // Create a container for the metrics dashboard
      const metricsContainer = document.createElement('div');
      metricsContainer.id = 'metrics-dashboard-container';
      metricsContainer.className = 'metrics-dashboard-container';
      
      // Replace existing content
      metricsTabContent.innerHTML = '';
      metricsTabContent.appendChild(metricsContainer);
      
      // Initialize the metrics integration
      this.#metrics = new MetricsIntegration({
        container: metricsContainer,
        eventBus: this.eventBus,
        resources: this.resources,
        refreshInterval: this.config.refreshInterval || 10000,
        darkMode: this.config.darkMode || false,
        useMockImplementation: !this.resources.observability // Use mock if no observability resource available
      });
      
      await this.#metrics.init();
      
      console.log('Metrics components initialized successfully');
      
      // Set up tab change events if not already handled by the event bus
      if (!this.eventBus) {
        const metricsTab = document.querySelector('.tab[data-tab="metrics"]');
        if (metricsTab) {
          metricsTab.addEventListener('click', () => {
            if (this.#metrics) {
              // Refresh metrics panel when the tab is shown
              this.eventBus.emit('tab-shown', 'metrics');
            }
          });
        }
      }
      
      // Register for timing operations
      if (this.#metrics) {
        // Wrap important methods with timing metrics
        const originalLoadData = this._loadData.bind(this);
        this._loadData = async function(...args) {
          const endTimer = this.#metrics.createTimer('dashboard', 'load_data');
          try {
            const result = await originalLoadData(...args);
            return result;
          } finally {
            endTimer();
          }
        }.bind(this);
        
        const originalRender = this.render.bind(this);
        this.render = function(...args) {
          const endTimer = this.#metrics.createTimer('dashboard', 'render');
          try {
            const result = originalRender(...args);
            return result;
          } finally {
            endTimer();
          }
        }.bind(this);
        
        // Track websocket connection status
        if (this.#metrics.getCollector('dashboard')) {
          const collector = this.#metrics.getCollector('dashboard');
          // Update connection status
          collector.setGauge('websocket_connected', this.websocketConnected ? 1 : 0);
          
          // Listen for connection changes
          this.on('websocket-connected', () => {
            collector.setGauge('websocket_connected', 1);
          });
          
          this.on('websocket-disconnected', () => {
            collector.setGauge('websocket_connected', 0);
          });
          
          // Track total entries
          if (this.totalEntries) {
            collector.setGauge('content_entries_count', this.totalEntries);
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize metrics components:', error);
    }
  }
  
  /**
   * Set up WebSocket connection for real-time updates
   * 
   * @private
   */
  _setupWebSocket() {
    // If WebSocket is already set up, clean it up first
    if (this.#webSocket) {
      try {
        this.#webSocket.close();
      } catch (error) {
        console.error('Error closing existing WebSocket:', error);
      }
      this.#webSocket = null;
    }
    
    // Get WebSocket endpoint from config or use default
    const wsEndpoint = this.config.wsEndpoint || 'ws://localhost:8765/pyarrow-content-index/ws';
    
    try {
      // Create new WebSocket connection
      this.#webSocket = new WebSocket(wsEndpoint);
      
      // Handle WebSocket open
      this.#webSocket.addEventListener('open', () => {
        console.log('WebSocket connected to PyArrow Content Index');
        this.websocketConnected = true;
        
        // Emit event if event bus is available
        if (this.eventBus) {
          this.eventBus.emit('websocket-connected', {
            service: 'pyarrow-content-index',
            endpoint: wsEndpoint
          });
        }
      });
      
      // Handle WebSocket messages
      this.#webSocket.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle different message types
          switch (data.type) {
            case 'entry-added':
            case 'entry-updated':
            case 'entry-deleted':
              // Refresh data when content index changes
              this._loadData();
              
              // Emit event if event bus is available
              if (this.eventBus) {
                this.eventBus.emit('content-index-updated', data);
              }
              break;
              
            case 'stats-updated':
              // Update stats when they change
              if (data.stats) {
                this.stats = data.stats;
                this._processVisualizationData();
                this.render();
              }
              break;
              
            default:
              console.log('Received unknown message type:', data.type);
          }
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
        }
      });
      
      // Handle WebSocket close
      this.#webSocket.addEventListener('close', () => {
        console.log('WebSocket disconnected from PyArrow Content Index');
        this.websocketConnected = false;
        
        // Emit event if event bus is available
        if (this.eventBus) {
          this.eventBus.emit('websocket-disconnected', {
            service: 'pyarrow-content-index'
          });
        }
        
        // Try to reconnect after 5 seconds
        setTimeout(() => {
          if (!this.#webSocket || this.#webSocket.readyState === WebSocket.CLOSED) {
            this._setupWebSocket();
          }
        }, 5000);
      });
      
      // Handle WebSocket errors
      this.#webSocket.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        
        // Emit event if event bus is available
        if (this.eventBus) {
          this.eventBus.emit('websocket-error', {
            service: 'pyarrow-content-index',
            error
          });
        }
      });
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
    }
  }
  
  /**
   * Dispose the dashboard and clean up resources
   * This method should be called when the dashboard is no longer needed
   */
  dispose() {
    try {
      // Clean up refresh interval
      if (this.#refreshIntervalId) {
        clearInterval(this.#refreshIntervalId);
        this.#refreshIntervalId = null;
      }
      
      // Close WebSocket connection if open
      if (this.#webSocket) {
        this.#webSocket.close();
        this.#webSocket = null;
      }
      
      // Dispose content browser components
      if (this.#contentBrowser && this.#contentBrowser.dispose) {
        this.#contentBrowser.dispose();
        this.#contentBrowser = null;
      }
      
      // Dispose statistics components
      if (this.#statistics && this.#statistics.dispose) {
        this.#statistics.dispose();
        this.#statistics = null;
      }
      
      // Dispose security components
      if (this.#security && this.#security.dispose) {
        this.#security.dispose();
        this.#security = null;
      }
      
      // Dispose metrics components
      if (this.#metrics && this.#metrics.dispose) {
        this.#metrics.dispose();
        this.#metrics = null;
      }
      
      // Remove event listeners
      this.removeAllListeners();
      
      console.log('PyArrow Content Index Dashboard disposed successfully');
    } catch (error) {
      console.error('Error disposing PyArrow Content Index Dashboard:', error);
    }
  }
  
  /**
   * Render the dashboard panel
   */
  render() {
    if (!this.element) return;
    
    // Clear the element
    this.element.innerHTML = '';
    
    // Add the dashboard container
    const container = document.createElement('div');
    container.className = 'pyarrow-content-index-dashboard';
    
    // Add the header
    container.appendChild(this._renderHeader());
    
    // Add the search and filter section
    container.appendChild(this._renderSearchControls());
    
    // Add visualization area if enabled
    if (this.config.enableVisualizations) {
      container.appendChild(this._renderVisualizations());
    }
    
    // Add the main content area
    if (this.loading) {
      container.appendChild(this._renderLoading());
    } else if (this.viewMode === 'list') {
      container.appendChild(this._renderList());
    } else if (this.viewMode === 'detail' && this.selectedEntry) {
      container.appendChild(this._renderDetail());
    }
    
    // Add the footer
    container.appendChild(this._renderFooter());
    
    // Append to the main element
    this.element.appendChild(container);
  }
  
  /**
   * Render the visualization area
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderVisualizations() {
    const visualizationContainer = document.createElement('div');
    visualizationContainer.className = 'visualization-container';
    
    // Skip rendering if no stats are available
    if (!this.stats) {
      visualizationContainer.innerHTML = '<p class="loading-text">Loading statistics...</p>';
      return visualizationContainer;
    }
    
    // Add visualization toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'visualization-toolbar';
    toolbar.innerHTML = `
      <h3>Content Index Analytics</h3>
      <div class="visualization-controls">
        <button id="toggle-vis-btn" title="Toggle Visualizations">
          <i class="fa fa-chart-bar"></i> Hide Charts
        </button>
        <button id="export-stats-btn" title="Export Statistics">
          <i class="fa fa-download"></i> Export Stats
        </button>
      </div>
    `;
    visualizationContainer.appendChild(toolbar);
    
    // Add visualization panels
    const panels = document.createElement('div');
    panels.className = 'visualization-panels';
    
    // Content Type Distribution
    const typePanel = document.createElement('div');
    typePanel.className = 'vis-panel';
    typePanel.innerHTML = `<h4>Content Type Distribution</h4>`;
    typePanel.appendChild(this._renderContentTypeChart());
    panels.appendChild(typePanel);
    
    // Size Distribution
    const sizePanel = document.createElement('div');
    sizePanel.className = 'vis-panel';
    sizePanel.innerHTML = `<h4>Size Distribution</h4>`;
    sizePanel.appendChild(this._renderSizeDistributionChart());
    panels.appendChild(sizePanel);
    
    // Storage Location Distribution
    const locationPanel = document.createElement('div');
    locationPanel.className = 'vis-panel';
    locationPanel.innerHTML = `<h4>Storage Location Distribution</h4>`;
    locationPanel.appendChild(this._renderStorageLocationChart());
    panels.appendChild(locationPanel);
    
    visualizationContainer.appendChild(panels);
    
    // Add event listeners
    setTimeout(() => {
      const toggleVisBtn = document.getElementById('toggle-vis-btn');
      const exportStatsBtn = document.getElementById('export-stats-btn');
      
      if (toggleVisBtn) {
        toggleVisBtn.addEventListener('click', () => {
          this.config.enableVisualizations = !this.config.enableVisualizations;
          this.render();
          
          // Emit event if eventBus is available
          if (this.eventBus) {
            this.eventBus.emit('toggle-visualizations', this.config.enableVisualizations);
          }
        });
      }
      
      if (exportStatsBtn) {
        exportStatsBtn.addEventListener('click', () => this._handleExportStats());
      }
    }, 0);
    
    return visualizationContainer;
  }
  
  /**
   * Render the content type distribution chart
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderContentTypeChart() {
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    
    if (!this.contentTypeDistribution || this.contentTypeDistribution.length === 0) {
      chartContainer.innerHTML = '<p class="no-data">No content type data available</p>';
      return chartContainer;
    }
    
    // Create bar chart for content types
    const chartCanvas = document.createElement('canvas');
    chartCanvas.id = 'content-type-chart';
    chartCanvas.width = 400;
    chartCanvas.height = 200;
    chartContainer.appendChild(chartCanvas);
    
    // Add table with details
    const detailsTable = document.createElement('table');
    detailsTable.className = 'chart-details-table';
    
    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Content Type</th>
        <th>Count</th>
        <th>Percentage</th>
      </tr>
    `;
    detailsTable.appendChild(thead);
    
    // Table body
    const tbody = document.createElement('tbody');
    
    // Calculate total for percentages
    const total = this.contentTypeDistribution.reduce((sum, item) => sum + item.count, 0);
    
    this.contentTypeDistribution.forEach(item => {
      const percentage = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item.type}</td>
        <td>${item.count.toLocaleString()}</td>
        <td>${percentage}%</td>
      `;
      tbody.appendChild(row);
    });
    
    detailsTable.appendChild(tbody);
    chartContainer.appendChild(detailsTable);
    
    // Render the chart if Chart.js is available
    setTimeout(() => {
      if (window.Chart) {
        const ctx = chartCanvas.getContext('2d');
        
        this.contentTypeChartInstance = new window.Chart(ctx, {
          type: 'pie',
          data: {
            labels: this.contentTypeDistribution.map(item => item.type),
            datasets: [{
              data: this.contentTypeDistribution.map(item => item.count),
              backgroundColor: [
                '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
                '#FF9F40', '#8AC249', '#EA5F89', '#00D8B6', '#8B75D7'
              ]
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            legend: {
              position: 'right'
            },
            title: {
              display: true,
              text: 'Content Type Distribution'
            }
          }
        });
      }
    }, 0);
    
    return chartContainer;
  }
  
  /**
   * Render the size distribution chart
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderSizeDistributionChart() {
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    
    if (!this.sizeDistribution || this.sizeDistribution.length === 0) {
      chartContainer.innerHTML = '<p class="no-data">No size distribution data available</p>';
      return chartContainer;
    }
    
    // Create bar chart for size distribution
    const chartCanvas = document.createElement('canvas');
    chartCanvas.id = 'size-distribution-chart';
    chartCanvas.width = 400;
    chartCanvas.height = 200;
    chartContainer.appendChild(chartCanvas);
    
    // Add table with details
    const detailsTable = document.createElement('table');
    detailsTable.className = 'chart-details-table';
    
    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Size Range</th>
        <th>Count</th>
        <th>Percentage</th>
      </tr>
    `;
    detailsTable.appendChild(thead);
    
    // Table body
    const tbody = document.createElement('tbody');
    
    // Calculate total for percentages
    const total = this.sizeDistribution.reduce((sum, item) => sum + item.count, 0);
    
    this.sizeDistribution.forEach(item => {
      const percentage = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item.range}</td>
        <td>${item.count.toLocaleString()}</td>
        <td>${percentage}%</td>
      `;
      tbody.appendChild(row);
    });
    
    detailsTable.appendChild(tbody);
    chartContainer.appendChild(detailsTable);
    
    // Render the chart if Chart.js is available
    setTimeout(() => {
      if (window.Chart) {
        const ctx = chartCanvas.getContext('2d');
        
        this.sizeDistributionChartInstance = new window.Chart(ctx, {
          type: 'bar',
          data: {
            labels: this.sizeDistribution.map(item => item.range),
            datasets: [{
              label: 'File Count',
              data: this.sizeDistribution.map(item => item.count),
              backgroundColor: '#36A2EB'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              yAxes: [{
                ticks: {
                  beginAtZero: true
                }
              }]
            },
            title: {
              display: true,
              text: 'Size Distribution'
            }
          }
        });
      }
    }, 0);
    
    return chartContainer;
  }
  
  /**
   * Render the storage location chart
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderStorageLocationChart() {
    const container = document.createElement('div');
    container.className = 'chart-container storage-container';
    
    // Add title with view toggle
    const titleSection = document.createElement('div');
    titleSection.className = 'chart-title-section';
    
    const heading = document.createElement('h3');
    heading.textContent = 'Storage Location Distribution';
    titleSection.appendChild(heading);
    
    // Add view toggle
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'chart-view-toggle';
    toggleContainer.innerHTML = `
      <button class="view-toggle-btn active" data-view="simple">Basic View</button>
      <button class="view-toggle-btn" data-view="enhanced">Enhanced View</button>
    `;
    titleSection.appendChild(toggleContainer);
    container.appendChild(titleSection);
    
    // Create simple view container (default view)
    const simpleView = document.createElement('div');
    simpleView.className = 'chart-view simple-view';
    simpleView.style.display = 'block';
    
    // Create enhanced view container (hidden by default)
    const enhancedView = document.createElement('div');
    enhancedView.className = 'chart-view enhanced-view';
    enhancedView.style.display = 'none';
    
    if (!this.storageDistribution || this.storageDistribution.length === 0) {
      const message = document.createElement('p');
      message.className = 'no-data';
      message.textContent = 'No storage location data available';
      simpleView.appendChild(message);
      enhancedView.appendChild(message.cloneNode(true));
      container.appendChild(simpleView);
      container.appendChild(enhancedView);
      return container;
    }
    
    // Create bar chart for storage locations
    const chartCanvas = document.createElement('canvas');
    chartCanvas.id = 'storage-location-chart';
    chartCanvas.width = 400;
    chartCanvas.height = 200;
    chartContainer.appendChild(chartCanvas);
    
    // Add table with details
    const detailsTable = document.createElement('table');
    detailsTable.className = 'chart-details-table';
    
    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Storage Location</th>
        <th>Count</th>
        <th>Percentage</th>
      </tr>
    `;
    detailsTable.appendChild(thead);
    
    // Table body
    const tbody = document.createElement('tbody');
    
    // Calculate total for percentages
    const total = this.storageDistribution.reduce((sum, item) => sum + item.count, 0);
    
    this.storageDistribution.forEach(item => {
      const percentage = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item.location}</td>
        <td>${item.count.toLocaleString()}</td>
        <td>${percentage}%</td>
      `;
      tbody.appendChild(row);
    });
    
    detailsTable.appendChild(tbody);
    chartContainer.appendChild(detailsTable);
    
    // Render the chart if Chart.js is available
    setTimeout(() => {
      if (window.Chart) {
        const ctx = chartCanvas.getContext('2d');
        
        this.storageLocationChartInstance = new window.Chart(ctx, {
          type: 'horizontalBar',
          data: {
            labels: this.storageDistribution.map(item => item.location),
            datasets: [{
              label: 'Content Count',
              data: this.storageDistribution.map(item => item.count),
              backgroundColor: '#FFCE56'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              xAxes: [{
                ticks: {
                  beginAtZero: true
                }
              }]
            },
            title: {
              display: true,
              text: 'Storage Location Distribution'
            }
          }
        });
      }
    }, 0);
    
    return chartContainer;
  }
  
  /**
   * Handle exporting statistics
   * 
   * @private
   */
  _handleExportStats() {
    if (!this.stats) {
      this._showError('No statistics available to export');
      return;
    }
    
    try {
      // Create a formatted stats object with the visualizations
      const exportData = {
        timestamp: new Date().toISOString(),
        totalEntries: this.totalEntries,
        statistics: this.stats,
        contentTypeDistribution: this.contentTypeDistribution,
        sizeDistribution: this.sizeDistribution,
        storageDistribution: this.storageDistribution
      };
      
      // Convert to JSON
      const jsonData = JSON.stringify(exportData, null, 2);
      
      // Create a Blob
      const blob = new Blob([jsonData], { type: 'application/json' });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `content-index-stats-${new Date().toISOString().slice(0, 10)}.json`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
      this._showSuccess('Statistics exported successfully');
    } catch (error) {
      console.error('Failed to export statistics:', error);
      this._showError('Failed to export statistics', error);
    }
  }
  
  /**
   * Render the dashboard header
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderHeader() {
    const header = document.createElement('div');
    header.className = 'dashboard-header';
    
    const title = document.createElement('h2');
    title.textContent = 'PyArrow Content Index';
    header.appendChild(title);
    
    const stats = document.createElement('div');
    stats.className = 'dashboard-stats';
    stats.innerHTML = `
      <span class="stat">Total Entries: <strong>${this.totalEntries}</strong></span>
      <span class="stat">Last Update: <strong>${new Date().toLocaleString()}</strong></span>
    `;
    header.appendChild(stats);
    
    return header;
  }
  
  /**
   * Render the search controls
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderSearchControls() {
    const controls = document.createElement('div');
    controls.className = 'dashboard-controls';
    
    // Create the advanced search panel
    const searchPanel = this._renderAdvancedSearchPanel();
    controls.appendChild(searchPanel);
    
    // Add a toggle button for advanced search
    const advancedSearchToggle = document.createElement('button');
    advancedSearchToggle.id = 'advanced-search-toggle';
    advancedSearchToggle.className = 'toggle-btn';
    advancedSearchToggle.innerHTML = '<i class="fa fa-sliders"></i> Advanced Search';
    advancedSearchToggle.addEventListener('click', () => {
      const advancedPanel = document.getElementById('advanced-search-panel');
      if (advancedPanel) {
        const isVisible = advancedPanel.style.display !== 'none';
        advancedPanel.style.display = isVisible ? 'none' : 'block';
        advancedSearchToggle.innerHTML = isVisible ? 
          '<i class="fa fa-sliders"></i> Show Advanced Search' : 
          '<i class="fa fa-sliders"></i> Hide Advanced Search';
      }
    });
    
    // Basic search box (always visible)
    const searchBox = document.createElement('div');
    searchBox.className = 'search-box';
    searchBox.innerHTML = `
      <input type="text" id="content-index-search" 
        placeholder="Search by CID, path, or keywords..." 
        value="${this.currentQuery}">
      <button id="content-index-search-btn"><i class="fa fa-search"></i></button>
      <button id="content-index-saved-searches-btn" title="Saved Searches"><i class="fa fa-bookmark"></i></button>
      <button id="content-index-history-btn" title="Search History"><i class="fa fa-history"></i></button>
    `;
    
    // Add active filters indicator if filters are applied
    if (Object.keys(this.currentFilter).length > 0) {
      const activeFilters = document.createElement('div');
      activeFilters.className = 'active-filters';
      
      const filterCount = Object.keys(this.currentFilter).length;
      activeFilters.innerHTML = `
        <span>${filterCount} active filter${filterCount !== 1 ? 's' : ''}</span>
        <button id="clear-filters-btn" title="Clear all filters"><i class="fa fa-times"></i></button>
      `;
      
      searchBox.appendChild(activeFilters);
    }
    
    controls.insertBefore(searchBox, controls.firstChild);
    controls.appendChild(advancedSearchToggle);
    
    // Filter controls
    const filterBox = document.createElement('div');
    filterBox.className = 'filter-box';
    filterBox.innerHTML = `
      <select id="content-index-filter-type">
        <option value="">All Types</option>
        <option value="model" ${this.currentFilter.type === 'model' ? 'selected' : ''}>Models</option>
        <option value="dataset" ${this.currentFilter.type === 'dataset' ? 'selected' : ''}>Datasets</option>
        <option value="embedding" ${this.currentFilter.type === 'embedding' ? 'selected' : ''}>Embeddings</option>
        <option value="document" ${this.currentFilter.type === 'document' ? 'selected' : ''}>Documents</option>
        <option value="image" ${this.currentFilter.type === 'image' ? 'selected' : ''}>Images</option>
        <option value="audio" ${this.currentFilter.type === 'audio' ? 'selected' : ''}>Audio</option>
        <option value="video" ${this.currentFilter.type === 'video' ? 'selected' : ''}>Video</option>
      </select>
      <select id="content-index-sort">
        <option value="updated_at-desc" ${this.config.sortField === 'updated_at' && this.config.sortDirection === 'desc' ? 'selected' : ''}>Latest Updates</option>
        <option value="created_at-desc" ${this.config.sortField === 'created_at' && this.config.sortDirection === 'desc' ? 'selected' : ''}>Newest First</option>
        <option value="created_at-asc" ${this.config.sortField === 'created_at' && this.config.sortDirection === 'asc' ? 'selected' : ''}>Oldest First</option>
        <option value="size-desc" ${this.config.sortField === 'size' && this.config.sortDirection === 'desc' ? 'selected' : ''}>Largest Size</option>
        <option value="size-asc" ${this.config.sortField === 'size' && this.config.sortDirection === 'asc' ? 'selected' : ''}>Smallest Size</option>
      </select>
      <button id="content-index-filter-btn">Apply Filters</button>
      <button id="content-index-refresh-btn" title="Refresh data"><i class="fa fa-refresh"></i></button>
      <span class="websocket-status ${this.websocketConnected ? 'connected' : 'disconnected'}" 
        title="${this.websocketConnected ? 'Real-time updates enabled' : 'Real-time updates disconnected'}">
        <i class="fa fa-${this.websocketConnected ? 'link' : 'unlink'}"></i>
      </span>
    `;
    controls.appendChild(filterBox);
    
    // Set up event listeners for controls after they're added to the DOM
    setTimeout(() => {
      const searchInput = document.getElementById('content-index-search');
      const searchBtn = document.getElementById('content-index-search-btn');
      const savedSearchesBtn = document.getElementById('content-index-saved-searches-btn');
      const historyBtn = document.getElementById('content-index-history-btn');
      const filterBtn = document.getElementById('content-index-filter-btn');
      const refreshBtn = document.getElementById('content-index-refresh-btn');
      const clearFiltersBtn = document.getElementById('clear-filters-btn');
      
      if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
          if (e.key === 'Enter') this._handleSearch();
        });
      }
      
      if (searchBtn) {
        searchBtn.addEventListener('click', () => this._handleSearch());
      }
      
      if (savedSearchesBtn) {
        savedSearchesBtn.addEventListener('click', () => this._handleSavedSearches());
      }
      
      if (historyBtn) {
        historyBtn.addEventListener('click', () => this._showSearchHistory());
      }
      
      if (filterBtn) {
        filterBtn.addEventListener('click', () => this._handleFilterChange());
      }
      
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this._handleRefresh());
      }
      
      if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => this._handleClearFilters());
      }
      
      // Hide the advanced search panel by default
      const advancedPanel = document.getElementById('advanced-search-panel');
      if (advancedPanel) {
        advancedPanel.style.display = 'none';
      }
    }, 0);
    
    return controls;
  }
  
  /**
   * Render the advanced search panel
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderAdvancedSearchPanel() {
    const advancedPanel = document.createElement('div');
    advancedPanel.id = 'advanced-search-panel';
    advancedPanel.className = 'advanced-search-panel';
    
    // Create a grid layout for search criteria
    advancedPanel.innerHTML = `
      <h3>Advanced Search</h3>
      
      <div class="search-grid">
        <div class="search-field">
          <label for="adv-cid">Content ID (CID)</label>
          <input type="text" id="adv-cid" placeholder="Qm...">
        </div>
        
        <div class="search-field">
          <label for="adv-path">Path</label>
          <input type="text" id="adv-path" placeholder="/path/to/content">
        </div>
        
        <div class="search-field">
          <label for="adv-mimetype">MIME Type</label>
          <input type="text" id="adv-mimetype" placeholder="image/jpeg, application/pdf, etc.">
        </div>
        
        <div class="search-field">
          <label for="adv-location">Storage Location</label>
          <select id="adv-location">
            <option value="">Any</option>
            <option value="ipfs">IPFS</option>
            <option value="filecoin">Filecoin</option>
            <option value="huggingface">Hugging Face</option>
            <option value="s3">S3</option>
          </select>
        </div>
        
        <div class="search-field">
          <label for="adv-size-min">Minimum Size (bytes)</label>
          <input type="number" id="adv-size-min" placeholder="0">
        </div>
        
        <div class="search-field">
          <label for="adv-size-max">Maximum Size (bytes)</label>
          <input type="number" id="adv-size-max" placeholder="Any">
        </div>
        
        <div class="search-field">
          <label for="adv-created-after">Created After</label>
          <input type="date" id="adv-created-after">
        </div>
        
        <div class="search-field">
          <label for="adv-created-before">Created Before</label>
          <input type="date" id="adv-created-before">
        </div>
        
        <div class="search-field">
          <label for="adv-tags">Tags (comma separated)</label>
          <input type="text" id="adv-tags" placeholder="tag1, tag2, tag3">
        </div>
        
        <div class="search-field">
          <label for="adv-metadata-key">Metadata Key</label>
          <input type="text" id="adv-metadata-key" placeholder="author, version, etc.">
        </div>
        
        <div class="search-field">
          <label for="adv-metadata-value">Metadata Value</label>
          <input type="text" id="adv-metadata-value" placeholder="Value to match">
        </div>
      </div>
      
      <div class="search-actions">
        <button id="adv-search-apply">Apply Search</button>
        <button id="adv-search-save">Save Search</button>
        <button id="adv-search-reset">Reset</button>
      </div>
    `;
    
    // Add event listeners
    setTimeout(() => {
      const applyBtn = document.getElementById('adv-search-apply');
      const saveBtn = document.getElementById('adv-search-save');
      const resetBtn = document.getElementById('adv-search-reset');
      
      if (applyBtn) {
        applyBtn.addEventListener('click', () => this._handleAdvancedSearch());
      }
      
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this._handleSaveSearch());
      }
      
      if (resetBtn) {
        resetBtn.addEventListener('click', () => this._handleResetAdvancedSearch());
      }
    }, 0);
    
    return advancedPanel;
  }
  
  /**
   * Handle advanced search form submission
   * Collects all advanced search criteria and applies them
   * 
   * @private
   */
  _handleAdvancedSearch() {
    try {
      // Collect all search criteria from the form
      const advancedFilter = {};
      
      // Get CID (exact match)
      const cid = document.getElementById('adv-cid')?.value;
      if (cid && cid.trim()) {
        advancedFilter.cid = cid.trim();
      }
      
      // Get path (partial match)
      const path = document.getElementById('adv-path')?.value;
      if (path && path.trim()) {
        advancedFilter.path = path.trim();
      }
      
      // Get MIME type (partial match)
      const mimetype = document.getElementById('adv-mimetype')?.value;
      if (mimetype && mimetype.trim()) {
        advancedFilter.mimetype = mimetype.trim();
      }
      
      // Get storage location
      const location = document.getElementById('adv-location')?.value;
      if (location && location !== '') {
        advancedFilter.location = location;
      }
      
      // Get size range
      const sizeMin = document.getElementById('adv-size-min')?.value;
      const sizeMax = document.getElementById('adv-size-max')?.value;
      
      if (sizeMin && !isNaN(parseInt(sizeMin, 10))) {
        advancedFilter.sizeMin = parseInt(sizeMin, 10);
      }
      
      if (sizeMax && !isNaN(parseInt(sizeMax, 10))) {
        advancedFilter.sizeMax = parseInt(sizeMax, 10);
      }
      
      // Get date range
      const createdAfter = document.getElementById('adv-created-after')?.value;
      const createdBefore = document.getElementById('adv-created-before')?.value;
      
      if (createdAfter) {
        advancedFilter.createdAfter = new Date(createdAfter).toISOString();
      }
      
      if (createdBefore) {
        advancedFilter.createdBefore = new Date(createdBefore).toISOString();
      }
      
      // Get tags
      const tags = document.getElementById('adv-tags')?.value;
      if (tags && tags.trim()) {
        advancedFilter.tags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      }
      
      // Get metadata key/value
      const metadataKey = document.getElementById('adv-metadata-key')?.value;
      const metadataValue = document.getElementById('adv-metadata-value')?.value;
      
      if (metadataKey && metadataKey.trim()) {
        if (!advancedFilter.metadata) {
          advancedFilter.metadata = {};
        }
        
        if (metadataValue && metadataValue.trim()) {
          advancedFilter.metadata[metadataKey.trim()] = metadataValue.trim();
        } else {
          // Just look for presence of key
          advancedFilter.metadata[metadataKey.trim()] = { $exists: true };
        }
      }
      
      // Apply the advanced filter
      this.currentFilter = advancedFilter;
      this.currentPage = 1; // Reset to first page
      
      // Update the UI
      this._showSuccess(`Applied ${Object.keys(advancedFilter).length} search criteria`);
      
      // Hide the advanced search panel
      const advancedPanel = document.getElementById('advanced-search-panel');
      if (advancedPanel) {
        advancedPanel.style.display = 'none';
      }
      
      // Update the toggle button text
      const toggleBtn = document.getElementById('advanced-search-toggle');
      if (toggleBtn) {
        toggleBtn.innerHTML = '<i class="fa fa-sliders"></i> Show Advanced Search';
      }
      
      // Add the search to history
      this._addToSearchHistory(this.currentQuery, this.currentFilter);
      
      // Load data with the new filter
      this._loadData();
      
      // Emit event if eventBus is available
      if (this.eventBus) {
        this.eventBus.emit('advanced-search-applied', this.currentFilter);
      }
    } catch (error) {
      console.error('Failed to apply advanced search:', error);
      this._showError('Failed to apply search criteria', error);
    }
  }
  
  /**
   * Handle saving the current search configuration
   * Allows users to save and name their search criteria for future use
   * 
   * @private
   */
  _handleSaveSearch() {
    try {
      // Collect all search criteria from the form
      const searchCriteria = {};
      
      // Get CID
      const cid = document.getElementById('adv-cid')?.value;
      if (cid && cid.trim()) {
        searchCriteria.cid = cid.trim();
      }
      
      // Get path
      const path = document.getElementById('adv-path')?.value;
      if (path && path.trim()) {
        searchCriteria.path = path.trim();
      }
      
      // Get MIME type
      const mimetype = document.getElementById('adv-mimetype')?.value;
      if (mimetype && mimetype.trim()) {
        searchCriteria.mimetype = mimetype.trim();
      }
      
      // Get storage location
      const location = document.getElementById('adv-location')?.value;
      if (location && location !== '') {
        searchCriteria.location = location;
      }
      
      // Get size range
      const sizeMin = document.getElementById('adv-size-min')?.value;
      const sizeMax = document.getElementById('adv-size-max')?.value;
      
      if (sizeMin && !isNaN(parseInt(sizeMin, 10))) {
        searchCriteria.sizeMin = parseInt(sizeMin, 10);
      }
      
      if (sizeMax && !isNaN(parseInt(sizeMax, 10))) {
        searchCriteria.sizeMax = parseInt(sizeMax, 10);
      }
      
      // Get date range
      const createdAfter = document.getElementById('adv-created-after')?.value;
      const createdBefore = document.getElementById('adv-created-before')?.value;
      
      if (createdAfter) {
        searchCriteria.createdAfter = createdAfter;
      }
      
      if (createdBefore) {
        searchCriteria.createdBefore = createdBefore;
      }
      
      // Get tags
      const tags = document.getElementById('adv-tags')?.value;
      if (tags && tags.trim()) {
        searchCriteria.tags = tags;
      }
      
      // Get metadata key/value
      const metadataKey = document.getElementById('adv-metadata-key')?.value;
      const metadataValue = document.getElementById('adv-metadata-value')?.value;
      
      if (metadataKey && metadataKey.trim()) {
        searchCriteria.metadataKey = metadataKey.trim();
        
        if (metadataValue && metadataValue.trim()) {
          searchCriteria.metadataValue = metadataValue.trim();
        }
      }
      
      // Check if there are any criteria to save
      if (Object.keys(searchCriteria).length === 0) {
        this._showError('No search criteria to save');
        return;
      }
      
      // Prompt for search name
      const searchName = prompt('Enter a name for this search:', 'My Saved Search');
      
      if (!searchName || !searchName.trim()) {
        // User cancelled or entered empty name
        return;
      }
      
      // Get existing saved searches from localStorage or create new array
      let savedSearches = [];
      
      try {
        const savedSearchesJson = localStorage.getItem('pyarrow-content-index-saved-searches');
        if (savedSearchesJson) {
          savedSearches = JSON.parse(savedSearchesJson);
        }
      } catch (e) {
        console.warn('Failed to parse saved searches:', e);
        savedSearches = [];
      }
      
      // Add new saved search
      savedSearches.push({
        id: Date.now().toString(),
        name: searchName.trim(),
        criteria: searchCriteria,
        created: new Date().toISOString()
      });
      
      // Save back to localStorage
      localStorage.setItem('pyarrow-content-index-saved-searches', JSON.stringify(savedSearches));
      
      this._showSuccess(`Search "${searchName}" saved successfully`);
      
      // Emit event if eventBus is available
      if (this.eventBus) {
        this.eventBus.emit('search-saved', { name: searchName, criteria: searchCriteria });
      }
    } catch (error) {
      console.error('Failed to save search:', error);
      this._showError('Failed to save search', error);
    }
  }
  
  /**
   * Handle resetting the advanced search form
   * Clears all form fields and resets any applied criteria
   * 
   * @private
   */
  _handleResetAdvancedSearch() {
    try {
      // Clear all form fields
      const fields = [
        'adv-cid',
        'adv-path',
        'adv-mimetype',
        'adv-location',
        'adv-size-min',
        'adv-size-max',
        'adv-created-after',
        'adv-created-before',
        'adv-tags',
        'adv-metadata-key',
        'adv-metadata-value'
      ];
      
      fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
          if (field.tagName === 'SELECT') {
            field.selectedIndex = 0;
          } else {
            field.value = '';
          }
        }
      });
      
      this._showSuccess('Advanced search form reset');
      
      // Emit event if eventBus is available
      if (this.eventBus) {
        this.eventBus.emit('advanced-search-reset');
      }
    } catch (error) {
      console.error('Failed to reset advanced search form:', error);
      this._showError('Failed to reset search form', error);
    }
  }
  
  /**
   * Handle displaying and selecting from saved searches
   * Shows a modal with all saved searches and allows selecting one
   * 
   * @private
   */
  _handleSavedSearches() {
    try {
      // Get saved searches from localStorage
      let savedSearches = [];
      
      try {
        const savedSearchesJson = localStorage.getItem('pyarrow-content-index-saved-searches');
        if (savedSearchesJson) {
          savedSearches = JSON.parse(savedSearchesJson);
        }
      } catch (e) {
        console.warn('Failed to parse saved searches:', e);
        savedSearches = [];
      }
      
      if (savedSearches.length === 0) {
        this._showInfo('No saved searches found');
        return;
      }
      
      // Create modal for saved searches
      const modal = document.createElement('div');
      modal.className = 'saved-searches-modal';
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>Saved Searches</h3>
            <button class="close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <div class="saved-searches-list">
              ${savedSearches.map((search, index) => `
                <div class="saved-search-item" data-index="${index}">
                  <div class="saved-search-info">
                    <h4>${search.name}</h4>
                    <span class="saved-date">Saved on: ${new Date(search.created).toLocaleDateString()}</span>
                    <details>
                      <summary>View criteria (${Object.keys(search.criteria).length} filters)</summary>
                      <div class="criteria-list">
                        ${Object.entries(search.criteria).map(([key, value]) => `
                          <div class="criteria-item">
                            <strong>${key}:</strong> ${typeof value === 'object' ? JSON.stringify(value) : value}
                          </div>
                        `).join('')}
                      </div>
                    </details>
                  </div>
                  <div class="saved-search-actions">
                    <button class="apply-search-btn" data-index="${index}">Apply</button>
                    <button class="delete-search-btn" data-index="${index}">Delete</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      
      // Add modal to the DOM
      document.body.appendChild(modal);
      
      // Add event listeners
      const closeBtn = modal.querySelector('.close-btn');
      const applyBtns = modal.querySelectorAll('.apply-search-btn');
      const deleteBtns = modal.querySelectorAll('.delete-search-btn');
      
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          document.body.removeChild(modal);
        });
      }
      
      applyBtns.forEach(btn => {
        btn.addEventListener('click', event => {
          const index = parseInt(event.target.dataset.index, 10);
          const search = savedSearches[index];
          
          if (search) {
            this._applySavedSearch(search);
            document.body.removeChild(modal);
          }
        });
      });
      
      deleteBtns.forEach(btn => {
        btn.addEventListener('click', event => {
          const index = parseInt(event.target.dataset.index, 10);
          
          // Confirm delete
          if (confirm(`Are you sure you want to delete saved search "${savedSearches[index].name}"?`)) {
            savedSearches.splice(index, 1);
            localStorage.setItem('pyarrow-content-index-saved-searches', JSON.stringify(savedSearches));
            
            // Remove the item from the modal UI
            const item = event.target.closest('.saved-search-item');
            if (item) {
              item.remove();
            }
            
            this._showSuccess('Saved search deleted');
            
            // Check if there are no more saved searches
            if (savedSearches.length === 0) {
              document.body.removeChild(modal);
              this._showInfo('No saved searches remaining');
            }
          }
        });
      });
      
      // Handle clicks outside the modal
      modal.addEventListener('click', event => {
        if (event.target === modal) {
          document.body.removeChild(modal);
        }
      });
    } catch (error) {
      console.error('Failed to handle saved searches:', error);
      this._showError('Failed to load saved searches', error);
    }
  }
  
  /**
   * Apply a saved search to the current view
   * 
   * @param {Object} savedSearch - The saved search to apply
   * @private
   */
  _applySavedSearch(savedSearch) {
    try {
      if (!savedSearch || !savedSearch.criteria) {
        return;
      }
      
      // Convert saved search criteria to filter format
      const filter = {};
      const criteria = savedSearch.criteria;
      
      // Map basic criteria directly
      ['cid', 'path', 'mimetype', 'location', 'sizeMin', 'sizeMax'].forEach(key => {
        if (criteria[key] !== undefined) {
          filter[key] = criteria[key];
        }
      });
      
      // Handle date criteria
      if (criteria.createdAfter) {
        filter.createdAfter = new Date(criteria.createdAfter).toISOString();
      }
      
      if (criteria.createdBefore) {
        filter.createdBefore = new Date(criteria.createdBefore).toISOString();
      }
      
      // Handle tags
      if (criteria.tags) {
        filter.tags = criteria.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      }
      
      // Handle metadata
      if (criteria.metadataKey) {
        if (!filter.metadata) {
          filter.metadata = {};
        }
        
        if (criteria.metadataValue) {
          filter.metadata[criteria.metadataKey] = criteria.metadataValue;
        } else {
          filter.metadata[criteria.metadataKey] = { $exists: true };
        }
      }
      
      // Apply the filter
      this.currentFilter = filter;
      this.currentPage = 1; // Reset to first page
      
      // Load data with the new filter
      this._loadData();
      
      this._showSuccess(`Applied saved search "${savedSearch.name}"`);
      
      // Emit event if eventBus is available
      if (this.eventBus) {
        this.eventBus.emit('saved-search-applied', savedSearch);
      }
    } catch (error) {
      console.error('Failed to apply saved search:', error);
      this._showError('Failed to apply saved search', error);
    }
  }
  
  /**
   * Handle clearing all active filters
   * Resets all filters and loads unfiltered data
   * 
   * @private
   */
  _handleClearFilters() {
    try {
      // Reset filter and search
      this.currentFilter = {};
      this.currentQuery = '';
      this.currentPage = 1;
      
      // Clear search input
      const searchInput = document.getElementById('content-index-search');
      if (searchInput) {
        searchInput.value = '';
      }
      
      // Reset filter dropdowns
      const typeFilter = document.getElementById('content-index-filter-type');
      if (typeFilter) {
        typeFilter.selectedIndex = 0;
      }
      
      // Load unfiltered data
      this._loadData();
      
      this._showSuccess('All filters cleared');
      
      // Emit event if eventBus is available
      if (this.eventBus) {
        this.eventBus.emit('filters-cleared');
      }
    } catch (error) {
      console.error('Failed to clear filters:', error);
      this._showError('Failed to clear filters', error);
    }
  }
  
  /**
   * Render the loading spinner
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderLoading() {
    const loading = document.createElement('div');
    loading.className = 'loading-spinner';
    loading.innerHTML = '<div class="spinner"></div><p>Loading content index data...</p>';
    return loading;
  }
  
  /**
   * Render the content list
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderList() {
    const listContainer = document.createElement('div');
    listContainer.className = 'content-list-container';
    
    if (this.entries.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = `
        <p>No content index entries found.</p>
        <button id="content-index-add-btn">Add New Entry</button>
      `;
      listContainer.appendChild(emptyState);
      
      // Add event listener for the add button
      setTimeout(() => {
        const addBtn = document.getElementById('content-index-add-btn');
        if (addBtn) {
          addBtn.addEventListener('click', () => this._handleAddEntry());
        }
      }, 0);
      
      return listContainer;
    }
    
    // Create table for entries
    const table = document.createElement('table');
    table.className = 'content-list-table';
    
    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Preview</th>
        <th>Type</th>
        <th>Path</th>
        <th>CID</th>
        <th>Size</th>
        <th>Updated</th>
        <th>Actions</th>
      </tr>
    `;
    table.appendChild(thead);
    
    // Table body
    const tbody = document.createElement('tbody');
    
    this.entries.forEach((entry, index) => {
      const row = document.createElement('tr');
      row.dataset.index = index;
      
      // Format size
      const size = entry.size ? this._formatSize(entry.size) : 'N/A';
      
      // Format date
      const updated = entry.updated_at ? new Date(entry.updated_at).toLocaleString() : 'N/A';
      
      // Get type icon
      const typeIcon = this._getTypeIcon(entry.mimetype);
      
      // For visual content, add a small thumbnail preview
      let thumbnailCell = '';
      if (this._isVisualContent(entry.mimetype)) {
        thumbnailCell = `<td class="thumbnail-cell">
          <div class="thumbnail-small-loading" data-cid="${entry.cid}">
            <div class="spinner-small"></div>
          </div>
        </td>`;
        
        // Asynchronously load thumbnail
        this._generateThumbnail(entry).then(thumbnailUrl => {
          const thumbnailEl = document.querySelector(`.thumbnail-small-loading[data-cid="${entry.cid}"]`);
          if (thumbnailEl && thumbnailUrl) {
            thumbnailEl.innerHTML = `<img src="${thumbnailUrl}" class="thumbnail-small" alt="Thumbnail">`;
          } else if (thumbnailEl) {
            thumbnailEl.innerHTML = `<i class="${typeIcon} thumbnail-icon"></i>`;
          }
        }).catch(error => {
          console.error('Error loading thumbnail in list view:', error);
          const thumbnailEl = document.querySelector(`.thumbnail-small-loading[data-cid="${entry.cid}"]`);
          if (thumbnailEl) {
            thumbnailEl.innerHTML = `<i class="${typeIcon} thumbnail-icon"></i>`;
          }
        });
      } else {
        thumbnailCell = `<td><i class="${typeIcon}"></i></td>`;
      }
      
      row.innerHTML = `
        ${thumbnailCell}
        <td>${entry.mimetype?.split('/')[0] || 'Unknown'}</td>
        <td>${entry.path || 'N/A'}</td>
        <td><span class="cid-display" title="${entry.cid}">${this._shortenCid(entry.cid)}</span></td>
        <td>${size}</td>
        <td>${updated}</td>
        <td>
          <button class="view-btn" data-index="${index}" title="View Details"><i class="fa fa-eye"></i></button>
          <button class="copy-btn" data-cid="${entry.cid}" title="Copy CID"><i class="fa fa-copy"></i></button>
          <button class="download-btn" data-cid="${entry.cid}" title="Download"><i class="fa fa-download"></i></button>
        </td>
      `;
      
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    listContainer.appendChild(table);
    
    // Add pagination
    if (this.totalEntries > this.config.pageSize) {
      const pagination = document.createElement('div');
      pagination.className = 'pagination';
      
      const totalPages = Math.ceil(this.totalEntries / this.config.pageSize);
      
      pagination.innerHTML = `
        <button id="prev-page-btn" ${this.currentPage === 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${this.currentPage} of ${totalPages}</span>
        <button id="next-page-btn" ${this.currentPage === totalPages ? 'disabled' : ''}>Next</button>
      `;
      
      listContainer.appendChild(pagination);
      
      // Add event listeners for pagination
      setTimeout(() => {
        const prevBtn = document.getElementById('prev-page-btn');
        const nextBtn = document.getElementById('next-page-btn');
        
        if (prevBtn) {
          prevBtn.addEventListener('click', () => {
            if (this.currentPage > 1) {
              this.currentPage--;
              this._loadData();
            }
          });
        }
        
        if (nextBtn) {
          nextBtn.addEventListener('click', () => {
            if (this.currentPage < totalPages) {
              this.currentPage++;
              this._loadData();
            }
          });
        }
      }, 0);
    }
    
    // Add event listeners for row actions
    setTimeout(() => {
      const viewButtons = document.querySelectorAll('.view-btn');
      const copyButtons = document.querySelectorAll('.copy-btn');
      const downloadButtons = document.querySelectorAll('.download-btn');
      
      viewButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.target.closest('.view-btn').dataset.index, 10);
          this._handleViewEntry(index);
        });
      });
      
      copyButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const cid = e.target.closest('.copy-btn').dataset.cid;
          this._handleCopyCid(cid);
        });
      });
      
      downloadButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const cid = e.target.closest('.download-btn').dataset.cid;
          this._handleDownload(cid);
        });
      });
    }, 0);
    
    return listContainer;
  }
  
  /**
   * Render the detail view for a selected entry
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderDetail() {
    const detailContainer = document.createElement('div');
    detailContainer.className = 'content-detail-container';
    
    if (!this.selectedEntry) {
      return detailContainer;
    }
    
    // Back button
    const backBtn = document.createElement('button');
    backBtn.className = 'back-btn';
    backBtn.innerHTML = '<i class="fa fa-arrow-left"></i> Back to List';
    backBtn.addEventListener('click', () => {
      this.viewMode = 'list';
      this.selectedEntry = null;
      this.render();
    });
    detailContainer.appendChild(backBtn);
    
    // Entry header
    const header = document.createElement('div');
    header.className = 'detail-header';
    
    const typeIcon = this._getTypeIcon(this.selectedEntry.mimetype);
    
    header.innerHTML = `
      <h3><i class="${typeIcon}"></i> ${this.selectedEntry.path || 'Unnamed Content'}</h3>
      <div class="detail-actions">
        <button id="detail-copy-btn" title="Copy CID"><i class="fa fa-copy"></i> Copy CID</button>
        <button id="detail-download-btn" title="Download"><i class="fa fa-download"></i> Download</button>
        <button id="detail-delete-btn" title="Delete" class="danger-btn"><i class="fa fa-trash"></i> Delete</button>
      </div>
    `;
    detailContainer.appendChild(header);
    
    // Entry details
    const details = document.createElement('div');
    details.className = 'detail-content';
    
    // Add visual preview for images, videos, and documents if applicable
    if (this._isVisualContent(this.selectedEntry.mimetype)) {
      const previewSection = document.createElement('div');
      previewSection.className = 'detail-section preview-section';
      previewSection.innerHTML = `
        <h4>Content Preview</h4>
        <div class="thumbnail-container">
          <div class="thumbnail-loading">
            <div class="spinner"></div>
            <p>Loading preview...</p>
          </div>
        </div>
      `;
      details.appendChild(previewSection);
      
      // Generate thumbnail asynchronously
      this._generateThumbnail(this.selectedEntry).then(thumbnailUrl => {
        const thumbnailContainer = previewSection.querySelector('.thumbnail-container');
        if (thumbnailUrl) {
          thumbnailContainer.innerHTML = `
            <div class="thumbnail-preview">
              <img src="${thumbnailUrl}" alt="Preview of ${this.selectedEntry.path || this.selectedEntry.cid}" />
            </div>
          `;
        } else {
          thumbnailContainer.innerHTML = '<p class="no-data">Preview not available</p>';
        }
      }).catch(error => {
        console.error('Error loading thumbnail:', error);
        const thumbnailContainer = previewSection.querySelector('.thumbnail-container');
        thumbnailContainer.innerHTML = '<p class="error-text">Failed to load preview</p>';
      });
    }
    
    // Basic info
    const basicInfo = document.createElement('div');
    basicInfo.className = 'detail-section';
    basicInfo.innerHTML = `
      <h4>Basic Information</h4>
      <table class="detail-table">
        <tr>
          <th>CID</th>
          <td><code>${this.selectedEntry.cid}</code></td>
        </tr>
        <tr>
          <th>Path</th>
          <td>${this.selectedEntry.path || 'N/A'}</td>
        </tr>
        <tr>
          <th>MIME Type</th>
          <td>${this.selectedEntry.mimetype || 'Unknown'}</td>
        </tr>
        <tr>
          <th>Size</th>
          <td>${this.selectedEntry.size ? this._formatSize(this.selectedEntry.size) : 'N/A'}</td>
        </tr>
        <tr>
          <th>Created</th>
          <td>${this.selectedEntry.created_at ? new Date(this.selectedEntry.created_at).toLocaleString() : 'N/A'}</td>
        </tr>
        <tr>
          <th>Updated</th>
          <td>${this.selectedEntry.updated_at ? new Date(this.selectedEntry.updated_at).toLocaleString() : 'N/A'}</td>
        </tr>
      </table>
    `;
    details.appendChild(basicInfo);
    
    // Hash information
    if (this.selectedEntry.md5 || this.selectedEntry.sha256) {
      const hashInfo = document.createElement('div');
      hashInfo.className = 'detail-section';
      hashInfo.innerHTML = `
        <h4>Hash Information</h4>
        <table class="detail-table">
          ${this.selectedEntry.md5 ? `<tr><th>MD5</th><td><code>${this._bufferToHex(this.selectedEntry.md5)}</code></td></tr>` : ''}
          ${this.selectedEntry.sha256 ? `<tr><th>SHA-256</th><td><code>${this._bufferToHex(this.selectedEntry.sha256)}</code></td></tr>` : ''}
        </table>
      `;
      details.appendChild(hashInfo);
    }
    
    // Storage locations
    if (this.selectedEntry.locations) {
      const locationsInfo = document.createElement('div');
      locationsInfo.className = 'detail-section';
      locationsInfo.innerHTML = '<h4>Storage Locations</h4>';
      
      const locationsTable = document.createElement('table');
      locationsTable.className = 'detail-table';
      
      // Filecoin
      if (this.selectedEntry.locations.filecoin?.length) {
        const filecoinRow = document.createElement('tr');
        filecoinRow.innerHTML = `
          <th>Filecoin</th>
          <td>
            <ul>
              ${this.selectedEntry.locations.filecoin.map(loc => `<li>${loc}</li>`).join('')}
            </ul>
          </td>
        `;
        locationsTable.appendChild(filecoinRow);
      }
      
      // Storacha
      if (this.selectedEntry.locations.storacha) {
        const storachaRow = document.createElement('tr');
        storachaRow.innerHTML = `
          <th>Storacha W3UP</th>
          <td>${this.selectedEntry.locations.storacha}</td>
        `;
        locationsTable.appendChild(storachaRow);
      }
      
      // libp2p
      if (this.selectedEntry.locations.libp2p?.length) {
        const libp2pRow = document.createElement('tr');
        libp2pRow.innerHTML = `
          <th>libp2p Peers</th>
          <td>
            <ul>
              ${this.selectedEntry.locations.libp2p.map(loc => `<li>${loc}</li>`).join('')}
            </ul>
          </td>
        `;
        locationsTable.appendChild(libp2pRow);
      }
      
      // IPFS
      if (this.selectedEntry.locations.ipfs?.length) {
        const ipfsRow = document.createElement('tr');
        ipfsRow.innerHTML = `
          <th>IPFS Gateways</th>
          <td>
            <ul>
              ${this.selectedEntry.locations.ipfs.map(loc => `<li><a href="${loc}/ipfs/${this.selectedEntry.cid}" target="_blank">${loc}</a></li>`).join('')}
            </ul>
          </td>
        `;
        locationsTable.appendChild(ipfsRow);
      }
      
      // IPFS Cluster
      if (this.selectedEntry.locations.ipfs_cluster?.length) {
        const ipfsClusterRow = document.createElement('tr');
        ipfsClusterRow.innerHTML = `
          <th>IPFS Cluster</th>
          <td>
            <ul>
              ${this.selectedEntry.locations.ipfs_cluster.map(loc => `<li>${loc}</li>`).join('')}
            </ul>
          </td>
        `;
        locationsTable.appendChild(ipfsClusterRow);
      }
      
      // S3
      if (this.selectedEntry.locations.s3?.bucket) {
        const s3Row = document.createElement('tr');
        s3Row.innerHTML = `
          <th>S3</th>
          <td>
            <table class="nested-table">
              <tr><th>Bucket</th><td>${this.selectedEntry.locations.s3.bucket}</td></tr>
              <tr><th>Key</th><td>${this.selectedEntry.locations.s3.key}</td></tr>
              <tr><th>Region</th><td>${this.selectedEntry.locations.s3.region || 'N/A'}</td></tr>
              <tr><th>Endpoint</th><td>${this.selectedEntry.locations.s3.endpoint || 'N/A'}</td></tr>
            </table>
          </td>
        `;
        locationsTable.appendChild(s3Row);
      }
      
      // Hugging Face
      if (this.selectedEntry.locations.huggingface?.repo_id) {
        const hfRow = document.createElement('tr');
        hfRow.innerHTML = `
          <th>Hugging Face</th>
          <td>
            <table class="nested-table">
              <tr><th>Repository</th><td>${this.selectedEntry.locations.huggingface.repo_id}</td></tr>
              <tr><th>Path</th><td>${this.selectedEntry.locations.huggingface.path}</td></tr>
              <tr><th>Revision</th><td>${this.selectedEntry.locations.huggingface.revision || 'main'}</td></tr>
            </table>
          </td>
        `;
        locationsTable.appendChild(hfRow);
      }
      
      locationsInfo.appendChild(locationsTable);
      details.appendChild(locationsInfo);
    }
    
    // Custom metadata
    if (this.selectedEntry.metadata) {
      const metadataSection = document.createElement('div');
      metadataSection.className = 'detail-section';
      metadataSection.innerHTML = '<h4>Custom Metadata</h4>';
      
      const metadataTable = document.createElement('table');
      metadataTable.className = 'detail-table';
      
      Object.entries(this.selectedEntry.metadata).forEach(([key, value]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <th>${key}</th>
          <td>${typeof value === 'object' ? '<pre>' + JSON.stringify(value, null, 2) + '</pre>' : value}</td>
        `;
        metadataTable.appendChild(row);
      });
      
      metadataSection.appendChild(metadataTable);
      details.appendChild(metadataSection);
    }
    
    detailContainer.appendChild(details);
    
    // Add event listeners
    setTimeout(() => {
      const copyBtn = document.getElementById('detail-copy-btn');
      const downloadBtn = document.getElementById('detail-download-btn');
      const deleteBtn = document.getElementById('detail-delete-btn');
      
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          this._handleCopyCid(this.selectedEntry.cid);
        });
      }
      
      if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
          this._handleDownload(this.selectedEntry.cid);
        });
      }
      
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          this._handleDeleteEntry(this.selectedEntry.cid);
        });
      }
    }, 0);
    
    return detailContainer;
  }
  
  /**
   * Render the dashboard footer
   * 
   * @returns {HTMLElement}
   * @private
   */
  _renderFooter() {
    const footer = document.createElement('div');
    footer.className = 'dashboard-footer';
    
    footer.innerHTML = `
      <button id="content-index-add-btn" class="primary-btn">
        <i class="fa fa-plus"></i> Add New Entry
      </button>
      <button id="content-index-export-btn">
        <i class="fa fa-download"></i> Export Index
      </button>
      <button id="content-index-import-btn">
        <i class="fa fa-upload"></i> Import Index
      </button>
    `;
    
    // Add event listeners
    setTimeout(() => {
      const addBtn = document.getElementById('content-index-add-btn');
      const exportBtn = document.getElementById('content-index-export-btn');
      const importBtn = document.getElementById('content-index-import-btn');
      
      if (addBtn) {
        addBtn.addEventListener('click', () => this._handleAddEntry());
      }
      
      if (exportBtn) {
        exportBtn.addEventListener('click', () => this._handleExportIndex());
      }
      
      if (importBtn) {
        importBtn.addEventListener('click', () => this._handleImportIndex());
      }
    }, 0);
    
    return footer;
  }
  
  /**
   * Show an error message
   * 
   * @param {string} message - Error message
   * @param {Error} error - Error object
   * @private
   */
  _showError(message, error) {
    console.error(message, error);
    
    if (!this.element) return;
    
    const errorElem = document.createElement('div');
    errorElem.className = 'error-notification';
    errorElem.innerHTML = `
      <span class="error-icon"><i class="fa fa-exclamation-triangle"></i></span>
      <span class="error-message">${message}</span>
      <button class="error-close"><i class="fa fa-times"></i></button>
    `;
    
    this.element.appendChild(errorElem);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      if (errorElem.parentNode) {
        errorElem.parentNode.removeChild(errorElem);
      }
    }, 5000);
    
    // Add event listener for close button
    const closeBtn = errorElem.querySelector('.error-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        errorElem.parentNode.removeChild(errorElem);
      });
    }
    
    // Report to eventBus if available
    if (this.eventBus) {
      this.eventBus.emit('error', {
        source: 'PyArrow Content Index Dashboard',
        message,
        error
      });
    }
  }
  
  /**
   * Show a success notification
   * 
   * @param {string} message - Success message
   * @private
   */
  _showSuccess(message) {
    if (!this.element) return;
    
    const successElem = document.createElement('div');
    successElem.className = 'success-notification';
    successElem.innerHTML = `
      <span class="success-icon"><i class="fa fa-check-circle"></i></span>
      <span class="success-message">${message}</span>
      <button class="success-close"><i class="fa fa-times"></i></button>
    `;
    
    this.element.appendChild(successElem);
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      if (successElem.parentNode) {
        successElem.parentNode.removeChild(successElem);
      }
    }, 3000);
    
    // Add event listener for close button
    const closeBtn = successElem.querySelector('.success-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        successElem.parentNode.removeChild(successElem);
      });
    }
  }
  
  /**
   * Bind event handlers
   * 
   * @private
   */
  _bindEvents() {
    // Listen for global events if eventBus is available
    if (this.eventBus) {
      // Listen for content index update events
      this.eventBus.on('content-index-updated', () => {
        this._loadData();
      });
      
      // Listen for new entry added events
      this.eventBus.on('content-index-entry-added', (entry) => {
        this._showSuccess(`New entry added: ${entry.path || entry.cid}`);
        this._loadData();
      });
      
      // Listen for entry deleted events
      this.eventBus.on('content-index-entry-deleted', (cid) => {
        this._showSuccess(`Entry deleted: ${cid}`);
        if (this.selectedEntry && this.selectedEntry.cid === cid) {
          this.selectedEntry = null;
          this.viewMode = 'list';
        }
        this._loadData();
      });
      
      // Listen for visualization toggle events
      this.eventBus.on('toggle-visualizations', (state) => {
        this.config.enableVisualizations = state;
        this.render();
      });
      
      // Listen for search history selection events
      this.eventBus.on('search-history-selected', (historyEntry) => {
        this._applySearchFromHistory(historyEntry);
      });
    }
  }
  
  /**
   * Set up real-time updates for the dashboard
   * Integrates with the realtime_updates module to provide WebSocket-based
   * notifications for content changes
   * 
   * @private
   */
  _setupRealTimeUpdates() {
    console.info('Setting up real-time updates for PyArrow Content Index Dashboard');
    
    try {
      // Determine WebSocket endpoint from config or use default
      const wsEndpoint = this.config.wsEndpoint || 'ws://localhost:8765/pyarrow-content-index/ws';
      
      // Prepare options for real-time updates integration
      const options = {
        wsEndpoint,
        eventBus: this.eventBus,
        electronAPI: window.electronAPI,
        
        // Authentication
        authManager: this.authManager,
        authToken: this.authToken,
        authRequired: true, // Require authentication for secure operation
        
        // Visibility settings from config
        enableNotifications: this.config.enableNotifications !== false,
        enableVisualIndicators: this.config.enableVisualIndicators !== false,
        enableBackgroundRefresh: this.config.enableBackgroundRefresh !== false,
        
        // Timing settings from config
        reconnectInterval: this.config.reconnectInterval || 5000,
        heartbeatInterval: this.config.heartbeatInterval || 30000,
        bgRefreshInterval: this.config.bgRefreshInterval || 60000,
        
        // Observability settings
        metricsEnabled: this.config.enableMetrics !== false,
        metricsUpdateInterval: this.config.metricsUpdateInterval || 30000
      };
      
      // Integrate real-time updates with the dashboard
      const result = integrateRealtimeUpdates(this, options);
      
      if (result.success) {
        // Store the realtimeUpdates instance for later use
        this.realtimeUpdates = result.realtimeUpdates;
        
        // Hook up event listeners for content updates
        if (this.eventBus) {
          // Handle content updates
          this.eventBus.on('content-updated', (data) => {
            // Refresh the affected content
            this._handleContentUpdate(data);
          });
          
          // Handle larger content sync operations
          this.eventBus.on('content-synced', (data) => {
            console.info(`Content sync: ${data.added || 0} added, ${data.updated || 0} updated, ${data.removed || 0} removed`);
            
            // If significant changes, refresh the data
            if ((data.added || 0) + (data.updated || 0) + (data.removed || 0) > 0) {
              // Update statistics if changed
              if (this.#statistics) {
                this.#statistics.refreshStatistics();
              }
              
              // Update content browser if available
              if (this.#contentBrowser) {
                this.#contentBrowser.refresh();
              }
            }
          });
          
          // Update connection status in the UI
          this.eventBus.on('websocket-connected', () => {
            this.websocketConnected = true;
            this.render();
          });
          
          this.eventBus.on('websocket-closed', () => {
            this.websocketConnected = false;
            this.render();
          });
          
          // Refresh dashboard when manually requested
          this.eventBus.on('manual-refresh', () => {
            this._loadData();
          });
        }
        
        console.info('Real-time updates integrated successfully');
      } else {
        console.error('Failed to integrate real-time updates:', result.error);
      }
    } catch (error) {
      console.error('Error setting up real-time updates:', error);
    }
  }
  
  /**
   * Set up the content browser component
   * Initializes the metadata browser and search interface for content exploration
   * 
   * @private
   */
  _setupContentBrowser() {
    console.info('Setting up content browser for PyArrow Content Index Dashboard');
    
    try {
      // Get the container element for the content browser
      const browserContainer = document.getElementById('content-browser-container');
      
      if (!browserContainer) {
        console.warn('Content browser container not found');
        return;
      }
      
      // Clear any existing content and show loading state
      browserContainer.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading content browser...</p>
        </div>
      `;
      
      // Get the bridge to use (either secure manager or direct bridge)
      const bridge = this.securePyArrowIndexManager || this.pyarrowIndexBridge;
      
      if (!bridge) {
        console.error('No PyArrow bridge available for content browser');
        browserContainer.innerHTML = `
          <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <h3>Error Initializing Content Browser</h3>
            <p>PyArrow Index bridge not available.</p>
          </div>
        `;
        return;
      }
      
      // Prepare configuration options with enhanced search features
      const browserConfig = this.config.browserConfig || {};
      
      // Configure enhanced search options for content discovery
      const searchConfig = {
        enableSavedSearches: true,
        enableSearchHistory: true,
        maxHistoryItems: 20,
        maxSavedSearches: 50,
        defaultExpandedState: false,
        localStoragePrefix: 'pyarrow_index_search_',
        availableFilters: [
          'mimetype', 'size', 'date', 'tags', 'location', 'metadata'
        ],
        suggestedTags: this.suggestedTags || [],
        suggestedMetadataKeys: this.suggestedMetadataKeys || [],
        ...this.config.searchConfig || {}
      };
      
      // Initialize the content browser integration
      initializeContentBrowser({
        container: browserContainer,
        bridge: bridge,
        eventBus: this.eventBus,
        config: {
          searchConfig: searchConfig,
          browserConfig: browserConfig
        }
      }).then(result => {
        if (result.success) {
          // Store references to the components
          this.#contentBrowser = {
            metadataBrowser: result.metadataBrowser,
            searchInterface: result.searchInterface,
            refresh: () => {
              if (result.metadataBrowser) {
                result.metadataBrowser.refresh();
              }
              if (result.searchInterface) {
                result.searchInterface.refreshSuggestions();
              }
            },
            dispose: () => {
              if (result.dispose && typeof result.dispose === 'function') {
                result.dispose();
              }
            }
          };
          
          console.info('Content browser initialized successfully');
          
          // Connect event listeners for real-time updates and tab changes
          if (this.eventBus) {
            // Forward content updates to the content browser
            this.eventBus.on('content-updated', (data) => {
              // Mark the content as updated in the UI
              if (result.metadataBrowser) {
                // Refresh content that was updated
                result.metadataBrowser.refreshItem(data.cid);
              }
            });
            
            // Connect tab switching events for delayed rendering
            this.eventBus.on('tab-changed', (tabId) => {
              if (tabId === 'browser') {
                // Force refresh when switching to the browser tab
                if (result.metadataBrowser) {
                  setTimeout(() => {
                    result.metadataBrowser.refresh();
                  }, 100);
                }
              }
            });
            
            // Connect enhanced search events with additional functionality
            this.eventBus.on('search-performed', (query) => {
              if (result.searchInterface) {
                result.searchInterface.search(query);
                
                // Track search in analytics if observability is enabled
                if (this.observability) {
                  this.observability.increment('search_queries_total', { type: 'basic' });
                }
              }
            });
            
            // Connect filter events with advanced filtering support
            this.eventBus.on('filter-applied', (filter) => {
              if (result.searchInterface) {
                result.searchInterface.applyFilter(filter);
                
                // Track filter usage in analytics if observability is enabled
                if (this.observability) {
                  this.observability.increment('search_filters_applied_total', { 
                    filter_count: Object.keys(filter).length 
                  });
                }
              }
            });
            
            // Connect saved search events
            this.eventBus.on('search-saved', (savedSearch) => {
              console.info('Search saved:', savedSearch.name);
              
              // Show notification
              if (this.notificationManager) {
                this.notificationManager.addNotification(
                  `Search "${savedSearch.name}" saved successfully`, 
                  'success'
                );
              }
              
              // Track in analytics if observability is enabled
              if (this.observability) {
                this.observability.increment('searches_saved_total');
              }
            });
            
            // Connect search history events
            this.eventBus.on('search-history-used', (historyItem) => {
              console.info('Search history item used:', historyItem.query);
              
              // Track in analytics if observability is enabled
              if (this.observability) {
                this.observability.increment('search_history_used_total');
              }
            });
          }
          
          // Register metrics if observability is enabled
          if (this.observability) {
            this.observability.register_counter('content_browser_views_total', 'Number of times the content browser was viewed');
            this.observability.register_counter('content_browser_searches_total', 'Number of searches performed in the content browser');
            this.observability.register_counter('content_browser_items_viewed_total', 'Number of content items viewed in detail');
          }
        } else {
          console.error('Failed to initialize content browser:', result.error);
          
          // Show error message
          browserContainer.innerHTML = `
            <div class="error-message">
              <i class="fas fa-exclamation-circle"></i>
              <h3>Error Initializing Content Browser</h3>
              <p>${result.error || 'An unknown error occurred during initialization.'}</p>
            </div>
          `;
        }
      }).catch(error => {
        console.error('Error initializing content browser:', error);
        
        // Show error message
        browserContainer.innerHTML = `
          <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <h3>Error Initializing Content Browser</h3>
            <p>${error.message || 'An unknown error occurred during initialization.'}</p>
          </div>
        `;
      });
    } catch (error) {
      console.error('Error setting up content browser:', error);
      
      // Show error message in container if available
      const browserContainer = document.getElementById('content-browser-container');
      if (browserContainer) {
        browserContainer.innerHTML = `
          <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <h3>Error Initializing Content Browser</h3>
            <p>${error.message || 'An unexpected error occurred while setting up the content browser.'}</p>
          </div>
        `;
      }
    }
  }
  
  /**
   * Handle a content update notification received from real-time updates
   * 
   * @param {Object} data Content update data
   * @param {string} data.cid Content identifier that was updated
   * @param {string} data.type Type of update (add, update, delete)
   * @param {Object} data.content Updated content data (if available)
   * @private
   */
  _handleContentUpdate(data) {
    if (!data || !data.cid) {
      console.warn('Received invalid content update notification');
      return;
    }
    
    console.info(`Handling content update for CID ${data.cid}, type: ${data.type || 'unknown'}`);
    
    try {
      // Track metrics if observability is enabled
      if (this.observability) {
        this.observability.increment('content_updates_total', { type: data.type || 'unknown' });
      }
      
      // Update different components based on the update type
      switch (data.type) {
        case 'add':
          // New content added
          this._handleContentAdded(data);
          break;
          
        case 'update':
          // Existing content updated
          this._handleContentUpdated(data);
          break;
          
        case 'delete':
          // Content deleted
          this._handleContentDeleted(data);
          break;
          
        default:
          // Unknown update type - refresh everything to be safe
          this._refreshAllComponents();
      }
      
      // Update overview statistics
      this._updateOverviewStats();
      
      // If the content browser is available, update the specific item
      if (this.#contentBrowser && this.#contentBrowser.metadataBrowser) {
        if (data.type === 'delete') {
          // For deleted content, remove it from the browser
          this.#contentBrowser.metadataBrowser.removeItem(data.cid);
        } else {
          // For added or updated content, refresh the item
          this.#contentBrowser.metadataBrowser.refreshItem(data.cid, data.content);
        }
      }
      
      // If the search interface is available, refresh suggestions and search indexes
      if (this.#contentBrowser && this.#contentBrowser.searchInterface) {
        // Don't refresh immediately for every update - debounce
        if (!this._searchSuggestionsDebounceTimer) {
          this._searchSuggestionsDebounceTimer = setTimeout(() => {
            // Refresh search suggestions based on updated content
            this.#contentBrowser.searchInterface.refreshSuggestions();
            
            // If content was added or updated, add it to the search index
            if ((data.type === 'add' || data.type === 'update') && data.content) {
              // Update search index with new content
              this._updateSearchIndex(data.content);
            } else if (data.type === 'delete') {
              // Remove content from search index
              this._removeFromSearchIndex(data.cid);
            }
            
            this._searchSuggestionsDebounceTimer = null;
          }, 2000); // Debounce for 2 seconds
        }
      }
      
      // Update recent content table in the overview if the content was added or updated
      if ((data.type === 'add' || data.type === 'update') && data.content) {
        this._updateRecentContentTable(data.content);
      }
      
      // Update charts and visualizations if statistics are available
      if (this.#statistics) {
        // Debounce the statistics refresh to avoid multiple rapid updates
        if (!this._statisticsDebounceTimer) {
          this._statisticsDebounceTimer = setTimeout(() => {
            this.#statistics.refreshStatistics();
            this._statisticsDebounceTimer = null;
          }, 1000); // Debounce for 1 second
        }
      }
      
      // Add visual notification if enabled
      if (this.config.enableNotifications !== false && this.notificationManager) {
        const notificationTitle = data.type === 'add' ? 'Content Added' : 
                                  data.type === 'update' ? 'Content Updated' :
                                  data.type === 'delete' ? 'Content Deleted' : 'Content Changed';
                                  
        const notificationMessage = data.content?.path 
          ? `${notificationTitle}: ${data.content.path}`
          : `${notificationTitle}: ${data.cid}`;
          
        this.notificationManager.addNotification(notificationMessage, data.type || 'info');
      }
      
      // Emit update event for other components
      if (this.eventBus) {
        this.eventBus.emit('pyarrow-content-index-updated', data);
      }
    } catch (error) {
      console.error('Error handling content update:', error);
    }
  }
  
  /**
   * Handle content added event
   * @param {Object} data Content data
   * @private
   */
  _handleContentAdded(data) {
    console.info(`Content added: ${data.cid}`);
    
    // Update total entries count
    const totalEntriesElement = document.getElementById('total-entries');
    if (totalEntriesElement) {
      const currentCount = parseInt(totalEntriesElement.textContent.replace(/,/g, ''), 10) || 0;
      totalEntriesElement.textContent = (currentCount + 1).toLocaleString();
    }
    
    // Update last updated timestamp
    const lastUpdatedElement = document.getElementById('last-updated');
    if (lastUpdatedElement) {
      lastUpdatedElement.textContent = 'Just now';
    }
    
    // If the content has size information, update total size
    if (data.content && data.content.size) {
      const totalSizeElement = document.getElementById('total-size');
      if (totalSizeElement) {
        const currentSize = this._parseSizeString(totalSizeElement.textContent) || 0;
        const newSize = currentSize + data.content.size;
        totalSizeElement.textContent = this._formatSize(newSize);
      }
    }
  }
  
  /**
   * Handle content updated event
   * @param {Object} data Content data
   * @private
   */
  _handleContentUpdated(data) {
    console.info(`Content updated: ${data.cid}`);
    
    // Update last updated timestamp
    const lastUpdatedElement = document.getElementById('last-updated');
    if (lastUpdatedElement) {
      lastUpdatedElement.textContent = 'Just now';
    }
    
    // If content has size information and it changed, update total size
    if (data.content && data.content.size && data.previousContent && data.previousContent.size) {
      const sizeDifference = data.content.size - data.previousContent.size;
      
      if (sizeDifference !== 0) {
        const totalSizeElement = document.getElementById('total-size');
        if (totalSizeElement) {
          const currentSize = this._parseSizeString(totalSizeElement.textContent) || 0;
          const newSize = currentSize + sizeDifference;
          totalSizeElement.textContent = this._formatSize(newSize);
        }
      }
    }
  }
  
  /**
   * Handle content deleted event
   * @param {Object} data Content data
   * @private
   */
  _handleContentDeleted(data) {
    console.info(`Content deleted: ${data.cid}`);
    
    // Update total entries count
    const totalEntriesElement = document.getElementById('total-entries');
    if (totalEntriesElement) {
      const currentCount = parseInt(totalEntriesElement.textContent.replace(/,/g, ''), 10) || 0;
      if (currentCount > 0) {
        totalEntriesElement.textContent = (currentCount - 1).toLocaleString();
      }
    }
    
    // Update last updated timestamp
    const lastUpdatedElement = document.getElementById('last-updated');
    if (lastUpdatedElement) {
      lastUpdatedElement.textContent = 'Just now';
    }
    
    // If the content had size information, update total size
    if (data.previousContent && data.previousContent.size) {
      const totalSizeElement = document.getElementById('total-size');
      if (totalSizeElement) {
        const currentSize = this._parseSizeString(totalSizeElement.textContent) || 0;
        const newSize = Math.max(0, currentSize - data.previousContent.size);
        totalSizeElement.textContent = this._formatSize(newSize);
      }
    }
    
    // Remove from recent content table if present
    const recentContentTable = document.getElementById('recent-content-table');
    if (recentContentTable) {
      const row = recentContentTable.querySelector(`tr[data-cid="${data.cid}"]`);
      if (row) {
        row.remove();
      }
    }
  }
  
  /**
   * Parse a human-readable size string into bytes
   * @param {string} sizeString Human-readable size string (e.g., "1.5 GB")
   * @returns {number} Size in bytes
   * @private
   */
  _parseSizeString(sizeString) {
    if (!sizeString) return 0;
    
    // Remove commas and match the size and unit
    const cleanedString = sizeString.replace(/,/g, '');
    const match = cleanedString.match(/^([\d.]+)\s*([KMGT]?B)?$/i);
    
    if (!match) return 0;
    
    const size = parseFloat(match[1]);
    const unit = (match[2] || '').toUpperCase();
    
    // Convert to bytes based on unit
    switch (unit) {
      case 'KB': return size * 1024;
      case 'MB': return size * 1024 * 1024;
      case 'GB': return size * 1024 * 1024 * 1024;
      case 'TB': return size * 1024 * 1024 * 1024 * 1024;
      default: return size; // Assume bytes if no unit
    }
  }
  
  /**
   * Format bytes into a human-readable size string
   * @param {number} bytes Size in bytes
   * @returns {string} Human-readable size string (e.g., "1.5 GB")
   * @private
   */
  _formatSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];
  }
  
  /**
   * Update the search index with content data
   * This updates the search functionality to include new or updated content
   * 
   * @param {Object} content The content data to index
   * @private
   */
  _updateSearchIndex(content) {
    if (!content || !content.cid) return;
    
    try {
      // If we have a content browser with search interface, update its index
      if (this.#contentBrowser && this.#contentBrowser.searchInterface) {
        // Extract searchable data from content
        const searchData = {
          cid: content.cid,
          path: content.path || '',
          mimetype: content.mimetype || '',
          size: content.size || 0,
          tags: content.tags || [],
          metadata: content.metadata || {}
        };
        
        // Add additional searchable properties if available
        if (content.created) searchData.created = content.created;
        if (content.updated) searchData.updated = content.updated;
        if (content.location) searchData.location = content.location;
        
        // Use the search interface method if available
        if (typeof this.#contentBrowser.searchInterface.updateSearchIndex === 'function') {
          this.#contentBrowser.searchInterface.updateSearchIndex(searchData);
        }
        
        // Track in analytics if observability is enabled
        if (this.observability) {
          this.observability.increment('search_index_updates_total');
        }
      }
    } catch (error) {
      console.error('Error updating search index:', error);
    }
  }
  
  /**
   * Remove an item from the search index by CID
   * 
   * @param {string} cid Content identifier to remove
   * @private
   */
  _removeFromSearchIndex(cid) {
    if (!cid) return;
    
    try {
      // If we have a content browser with search interface, update its index
      if (this.#contentBrowser && this.#contentBrowser.searchInterface) {
        // Use the search interface method if available
        if (typeof this.#contentBrowser.searchInterface.removeFromSearchIndex === 'function') {
          this.#contentBrowser.searchInterface.removeFromSearchIndex(cid);
        }
        
        // Track in analytics if observability is enabled
        if (this.observability) {
          this.observability.increment('search_index_removals_total');
        }
      }
    } catch (error) {
      console.error(`Error removing CID ${cid} from search index:`, error);
    }
  }
  
  /**
   * Update all components to reflect the current state
   * @private
   */
  _refreshAllComponents() {
    // Refresh content browser if available
    if (this.#contentBrowser) {
      this.#contentBrowser.refresh();
    }
    
    // Refresh statistics if available
    if (this.#statistics) {
      this.#statistics.refreshStatistics();
    }
    
    // Reload overview data
    this._loadData();
  }
  
  /**
   * Update the overview statistics display
   * @private
   */
  _updateOverviewStats() {
    // Get the latest statistics from the bridge
    const bridge = this.securePyArrowIndexManager || this.pyarrowIndexBridge;
    
    if (!bridge) {
      console.warn('No PyArrow bridge available to update statistics');
      return;
    }
    
    // Load statistics based on whether we're in secure mode
    const loadStats = async () => {
      try {
        if (this.secureMode) {
          const authToken = await this.authManager.getCapabilityToken('pyarrow-index:read');
          return await bridge.getStats(authToken);
        } else {
          return await bridge.getStats();
        }
      } catch (error) {
        console.error('Error loading overview statistics:', error);
        return null;
      }
    };
    
    // Load and update the UI
    loadStats().then(stats => {
      if (!stats) return;
      
      // Update total entries count
      const totalEntriesElement = document.getElementById('total-entries');
      if (totalEntriesElement && stats.total_entries !== undefined) {
        totalEntriesElement.textContent = stats.total_entries.toLocaleString();
      }
      
      // Update total size
      const totalSizeElement = document.getElementById('total-size');
      if (totalSizeElement && stats.total_size !== undefined) {
        totalSizeElement.textContent = this._formatSize(stats.total_size);
      }
      
      // Update entry types count
      const entryTypesElement = document.getElementById('entry-types');
      if (entryTypesElement && stats.type_counts) {
        entryTypesElement.textContent = Object.keys(stats.type_counts).length.toLocaleString();
      }
      
      // Update last updated timestamp
      const lastUpdatedElement = document.getElementById('last-updated');
      if (lastUpdatedElement && stats.last_updated) {
        const date = new Date(stats.last_updated);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.round(diffMs / 60000);
        
        if (diffMins < 1) {
          lastUpdatedElement.textContent = 'Just now';
        } else if (diffMins < 60) {
          lastUpdatedElement.textContent = `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
        } else if (diffMins < 1440) {
          const hours = Math.floor(diffMins / 60);
          lastUpdatedElement.textContent = `${hours} hour${hours === 1 ? '' : 's'} ago`;
        } else {
          lastUpdatedElement.textContent = date.toLocaleDateString();
        }
      }
    });
  }
  
  /**
   * Update the recent content table in the overview
   * @param {Object} contentData New or updated content data
   * @private
   */
  _updateRecentContentTable(contentData) {
    if (!contentData || !contentData.cid) return;
    
    const tableBody = document.getElementById('recent-content-table');
    if (!tableBody) return;
    
    // Check if this CID already exists in the table
    const existingRow = tableBody.querySelector(`tr[data-cid="${contentData.cid}"]`);
    
    // Format date for display
    const dateStr = contentData.added_date ? 
      new Date(contentData.added_date).toLocaleString() : 
      new Date().toLocaleString();
    
    // Format size for display
    const sizeStr = contentData.size !== undefined ? 
      this._formatSize(contentData.size) : 
      '—';
    
    // Trim CID and path for display
    const displayCid = contentData.cid.length > 16 ? 
      contentData.cid.slice(0, 8) + '...' + contentData.cid.slice(-8) : 
      contentData.cid;
      
    const displayPath = contentData.path && contentData.path.length > 30 ? 
      contentData.path.slice(0, 15) + '...' + contentData.path.slice(-15) : 
      contentData.path || '—';
    
    if (existingRow) {
      // Update the existing row
      existingRow.innerHTML = `
        <td title="${contentData.cid}">${displayCid}</td>
        <td title="${contentData.path || ''}">${displayPath}</td>
        <td>${contentData.mimetype || '—'}</td>
        <td>${sizeStr}</td>
        <td>${dateStr}</td>
        <td class="actions-cell">
          <button class="btn btn-sm view-content-btn" data-cid="${contentData.cid}">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      `;
      
      // Add highlighting for the updated row
      existingRow.classList.add('updated-item');
      
      // Remove highlighting after animation completes
      setTimeout(() => {
        existingRow.classList.remove('updated-item');
      }, 2000);
    } else {
      // Create a new row
      const newRow = document.createElement('tr');
      newRow.setAttribute('data-cid', contentData.cid);
      newRow.innerHTML = `
        <td title="${contentData.cid}">${displayCid}</td>
        <td title="${contentData.path || ''}">${displayPath}</td>
        <td>${contentData.mimetype || '—'}</td>
        <td>${sizeStr}</td>
        <td>${dateStr}</td>
        <td class="actions-cell">
          <button class="btn btn-sm view-content-btn" data-cid="${contentData.cid}">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      `;
      
      // Add the new row to the beginning of the table
      if (tableBody.firstChild) {
        tableBody.insertBefore(newRow, tableBody.firstChild);
      } else {
        tableBody.appendChild(newRow);
      }
      
      // Add highlighting for the new row
      newRow.classList.add('updated-item');
      
      // Remove highlighting after animation completes
      setTimeout(() => {
        newRow.classList.remove('updated-item');
      }, 2000);
      
      // Limit the number of rows (keep the most recent)
      const MAX_RECENT_ITEMS = 10;
      while (tableBody.children.length > MAX_RECENT_ITEMS) {
        tableBody.removeChild(tableBody.lastChild);
      }
      
      // Add event listener for view button
      const viewBtn = newRow.querySelector('.view-content-btn');
      if (viewBtn) {
        viewBtn.addEventListener('click', () => {
          this._showContentDetails(contentData.cid);
        });
      }
    }
    
    // Remove "no data" row if it exists
    const noDataRow = tableBody.querySelector('tr td[colspan="6"]');
    if (noDataRow) {
      noDataRow.parentNode.remove();
    }
  }
  
  /**
   * Handle a content update notification received from real-time updates
   * 
   * @param {Object} data Content update data
   * @param {Object} data.content Content object with metadata
   * @param {string} data.content.cid Content identifier
   * @param {string} data.action Update action (added, updated, deleted)
   * @param {string} data.timestamp ISO timestamp of the update
   * @private
   */
  _handleContentUpdate(data) {
    if (!data || !data.content || !data.content.cid) {
      return;
    }
    
    const { content, action } = data;
    console.debug(`Handling ${action} notification for CID: ${content.cid}`);
    
    // Add to search index if available
    if (this.searchIndex && action !== 'deleted') {
      this.searchIndex.addOrUpdate(content);
    } else if (this.searchIndex && action === 'deleted') {
      this.searchIndex.remove(content.cid);
    }
    
    // Check if this content is in the current visible set
    const index = this.entries.findIndex(entry => entry.cid === content.cid);
    
    if (index !== -1) {
      // Update in-place for existing content
      if (action === 'updated') {
        this.entries[index] = { ...this.entries[index], ...content };
        
        // Mark as updated for visual indicator
        this.entries[index].recentlyUpdated = true;
      } else if (action === 'deleted') {
        // Remove from current entries if deleted
        this.entries.splice(index, 1);
        this.totalEntries--;
      }
      
      // Refresh the display
      this.render();
    } else if (action === 'added') {
      // If it's a new item and we're showing recent content, fetch it
      if (this.config.sortField === 'updated_at' && this.config.sortDirection === 'desc') {
        // Prepend to the current list if it's sorted by recency
        if (content.full) {
          // If we have the full content data, add it directly
          this.entries.unshift(content);
          this.totalEntries++;
          
          // Mark as added for visual indicator
          content.recentlyAdded = true;
          
          // Remove last item if we're at the page limit
          if (this.entries.length > this.config.pageSize) {
            this.entries.pop();
          }
          
          // Refresh the display
          this.render();
        } else {
          // Otherwise, reload the first page to include the new item
          this._loadData(1, true);
        }
      }
    }
  }
  
  /**
   * Load search history from localStorage
   * 
   * @returns {Array} Array of search history items
   * @private
   */
  _loadSearchHistory() {
    try {
      const history = localStorage.getItem('pyarrow-content-index-search-history');
      return history ? JSON.parse(history) : [];
    } catch (error) {
      console.error('Error loading search history:', error);
      return [];
    }
  }
  
  /**
   * Save search history to localStorage
   * 
   * @private
   */
  _saveSearchHistory() {
    try {
      // Limit history to last 50 searches
      if (this.searchHistory.length > 50) {
        this.searchHistory = this.searchHistory.slice(0, 50);
      }
      localStorage.setItem('pyarrow-content-index-search-history', JSON.stringify(this.searchHistory));
    } catch (error) {
      console.error('Error saving search history:', error);
    }
  }
  
  /**
   * Add a search to history
   * 
   * @param {string} query - The search query string
   * @param {Object} filter - The filter criteria used
   * @private
   */
  _addToSearchHistory(query, filter) {
    // Skip empty searches
    if (!query && Object.keys(filter).length === 0) {
      return;
    }
    
    // Create history entry
    const searchEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      query: query || '',
      filter: filter || {},
      resultCount: this.totalEntries
    };
    
    // Add to beginning of history array
    this.searchHistory.unshift(searchEntry);
    
    // Remove duplicates based on query and filter
    const uniqueHistory = [];
    const seen = new Set();
    
    for (const entry of this.searchHistory) {
      // Create a key based on query and filter to detect duplicates
      const key = JSON.stringify({
        query: entry.query,
        filter: entry.filter
      });
      
      if (!seen.has(key)) {
        seen.add(key);
        uniqueHistory.push(entry);
      }
    }
    
    this.searchHistory = uniqueHistory;
    
    // Save to localStorage
    this._saveSearchHistory();
  }
  
  /**
   * Show search history panel
   * Displays a modal dialog with the search history
   * 
   * @private
   */
  _showSearchHistory() {
    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'search-history-modal';
    
    // Create modal content
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h3>Search History</h3>
      <button class="close-btn">&times;</button>
    `;
    
    // Create body
    const body = document.createElement('div');
    body.className = 'modal-body';
    
    // No history message
    if (!this.searchHistory || this.searchHistory.length === 0) {
      body.innerHTML = '<div class="no-history">No search history yet</div>';
    } else {
      // Create history list
      const historyList = document.createElement('div');
      historyList.className = 'search-history-list';
      
      this.searchHistory.forEach(item => {
        const entry = document.createElement('div');
        entry.className = 'search-history-item';
        
        // Format timestamp
        const timestamp = new Date(item.timestamp);
        const formattedDate = timestamp.toLocaleDateString();
        const formattedTime = timestamp.toLocaleTimeString();
        
        // Format filter criteria
        const filterCriteria = [];
        for (const [key, value] of Object.entries(item.filter)) {
          if (key && value !== undefined) {
            let displayValue = value;
            
            // Handle specific filter types
            if (key === 'metadata' && typeof value === 'object') {
              displayValue = JSON.stringify(value);
            } else if (Array.isArray(value)) {
              displayValue = value.join(', ');
            } else if (typeof value === 'object') {
              displayValue = JSON.stringify(value);
            }
            
            filterCriteria.push(`<li><b>${key}</b>: ${displayValue}</li>`);
          }
        }
        
        // Result count text
        const resultText = typeof item.resultCount === 'number' 
          ? `${item.resultCount} result${item.resultCount !== 1 ? 's' : ''}` 
          : '';
        
        entry.innerHTML = `
          <div class="search-history-info">
            <div class="search-history-header">
              <span class="search-query">${item.query || '<i>No query text</i>'}</span>
              <span class="search-date">${formattedDate} ${formattedTime}</span>
            </div>
            <div class="search-result-count">${resultText}</div>
            ${filterCriteria.length > 0 ? `
              <details>
                <summary>Filter criteria (${filterCriteria.length})</summary>
                <ul class="filter-criteria-list">
                  ${filterCriteria.join('')}
                </ul>
              </details>
            ` : ''}
          </div>
          <div class="search-history-actions">
            <button class="apply-history-btn" data-id="${item.id}">Apply</button>
            <button class="delete-history-btn" data-id="${item.id}">Delete</button>
          </div>
        `;
        
        historyList.appendChild(entry);
      });
      
      body.appendChild(historyList);
      
      // Add clear all button if we have history
      if (this.searchHistory.length > 0) {
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        footer.innerHTML = `
          <button class="clear-history-btn">Clear All History</button>
        `;
        content.appendChild(footer);
        
        // Add event listener for clear all button
        setTimeout(() => {
          const clearBtn = footer.querySelector('.clear-history-btn');
          if (clearBtn) {
            clearBtn.addEventListener('click', () => {
              this._clearSearchHistory();
              modal.remove();
              this._showSuccess('Search history cleared');
            });
          }
        }, 0);
      }
    }
    
    // Assemble modal
    content.appendChild(header);
    content.appendChild(body);
    modal.appendChild(content);
    
    // Add modal to document
    document.body.appendChild(modal);
    
    // Add event listeners
    setTimeout(() => {
      // Close button
      const closeBtn = modal.querySelector('.close-btn');
      closeBtn?.addEventListener('click', () => {
        modal.remove();
      });
      
      // Apply buttons
      const applyBtns = modal.querySelectorAll('.apply-history-btn');
      applyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const historyEntry = this.searchHistory.find(entry => entry.id.toString() === id);
          
          if (historyEntry) {
            this._applySearchFromHistory(historyEntry);
            modal.remove();
          }
        });
      });
      
      // Delete buttons
      const deleteBtns = modal.querySelectorAll('.delete-history-btn');
      deleteBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const index = this.searchHistory.findIndex(entry => entry.id.toString() === id);
          
          if (index >= 0) {
            this.searchHistory.splice(index, 1);
            this._saveSearchHistory();
            btn.closest('.search-history-item').remove();
            
            // Show empty message if no history left
            if (this.searchHistory.length === 0) {
              modal.querySelector('.modal-body').innerHTML = '<div class="no-history">No search history yet</div>';
              
              // Remove clear all button
              const footer = modal.querySelector('.modal-footer');
              if (footer) {
                footer.remove();
              }
            }
          }
        });
      });
      
      // Close when clicking outside modal content
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });
    }, 0);
  }
  
  /**
   * Apply a search from history
   * 
   * @param {Object} historyEntry - The search history entry to apply
   * @private
   */
  _applySearchFromHistory(historyEntry) {
    if (!historyEntry) return;
    
    // Apply the query
    this.currentQuery = historyEntry.query || '';
    
    // Update the search input field
    const searchInput = document.getElementById('content-index-search');
    if (searchInput) {
      searchInput.value = this.currentQuery;
    }
    
    // Apply the filter
    this.currentFilter = historyEntry.filter || {};
    
    // Reset to first page
    this.currentPage = 1;
    
    // Load data with the restored search parameters
    this._loadData();
    
    // Show success message
    this._showSuccess('Search restored from history');
    
    // Emit event if eventBus is available
    if (this.eventBus) {
      this.eventBus.emit('search-history-applied', historyEntry);
    }
  }
  
  /**
   * Clear all search history
   * 
   * @private
   */
  _clearSearchHistory() {
    this.searchHistory = [];
    this._saveSearchHistory();
  }
  
  /**
   * Set up WebSocket connection for real-time updates
   * This enables push notifications when content index data changes
   * 
   * @private
   */
  _setupWebSocket() {
    try {
      // Close any existing connections
      if (this.websocket && this.websocket.readyState !== WebSocket.CLOSED) {
        this.websocket.close();
      }

      // Determine the WebSocket URL
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = this.config.wsHost || window.location.host;
      const wsPath = this.config.wsPath || '/ws/content-index';
      const wsUrl = `${wsProtocol}//${wsHost}${wsPath}`;
      
      console.log(`Connecting to WebSocket at ${wsUrl}`);
      this.websocket = new WebSocket(wsUrl);
      
      // Connection established
      this.websocket.onopen = () => {
        console.log('WebSocket connected for real-time content index updates');
        this.websocketConnected = true;
        
        // Update UI to show connected status
        this._updateWebSocketStatus();
        
        // Subscribe to updates for current view
        this._sendWebSocketSubscription();
        
        // Optional user notification
        if (this.config.showConnectionNotifications) {
          this._showSuccess('Connected for real-time updates');
        }
        
        // Emit event if eventBus is available
        if (this.eventBus) {
          this.eventBus.emit('websocket-connected');
        }
      };
      
      // Connection closed
      this.websocket.onclose = (event) => {
        const wasConnected = this.websocketConnected;
        this.websocketConnected = false;
        
        // Update UI to show disconnected status
        this._updateWebSocketStatus();
        
        console.log(`WebSocket connection closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
        
        // Show notification only if we were previously connected (avoid spamming)
        if (wasConnected && this.config.showConnectionNotifications) {
          this._showInfo('Real-time updates disconnected. Attempting to reconnect...');
        }
        
        // Emit event if eventBus is available
        if (this.eventBus) {
          this.eventBus.emit('websocket-closed', { code: event.code, reason: event.reason });
        }
        
        // Calculate reconnect delay with exponential backoff
        const maxReconnectDelay = 30000; // 30 seconds max
        const baseDelay = 2000; // Start with 2 seconds
        
        if (!this.reconnectAttempts) {
          this.reconnectAttempts = 0;
        }
        
        // Exponential backoff with maximum limit
        const delay = Math.min(
          baseDelay * Math.pow(1.5, this.reconnectAttempts),
          maxReconnectDelay
        );
        
        this.reconnectAttempts++;
        
        // Attempt to reconnect after delay if real-time updates are enabled
        if (this.config.enableRealTimeUpdates) {
          console.log(`Attempting to reconnect in ${delay/1000} seconds (attempt #${this.reconnectAttempts})...`);
          
          this.reconnectTimer = setTimeout(() => {
            if (this.config.enableRealTimeUpdates) {
              this._setupWebSocket();
            }
          }, delay);
        }
      };
      
      // Connection error
      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.websocketConnected = false;
        
        // Update UI to show disconnected status
        this._updateWebSocketStatus();
        
        // Emit event if eventBus is available
        if (this.eventBus) {
          this.eventBus.emit('websocket-error', error);
        }
      };
      
      // Message received
      this.websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebSocket message received:', message.type);
          
          switch (message.type) {
            case 'update':
              // Handle index-wide update (refresh everything)
              this._loadData();
              break;
              
            case 'entry_added':
              // Handle new entry notification
              this._handleRealtimeEntryAdded(message.data);
              break;
              
            case 'entry_updated':
              // Handle updated entry notification
              this._handleRealtimeEntryUpdated(message.data);
              break;
              
            case 'entry_deleted':
              // Handle deleted entry notification
              this._handleRealtimeEntryDeleted(message.data);
              break;
              
            case 'stats_update':
              // Handle statistics update
              this._handleRealtimeStatsUpdate(message.data);
              break;
              
            case 'error':
              // Handle error message from server
              console.error('WebSocket server error:', message.error);
              this._showError(`Server error: ${message.error}`);
              break;
              
            case 'ping':
              // Respond to ping with pong to keep connection alive
              if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.websocket.send(JSON.stringify({ type: 'pong' }));
              }
              break;
              
            default:
              console.log('Unknown WebSocket message type:', message.type);
          }
          
          // Reset reconnect attempts on successful message
          this.reconnectAttempts = 0;
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
      this.websocketConnected = false;
      this._updateWebSocketStatus();
    }
  }
  
  /**
   * Update WebSocket status indicators in the UI
   * 
   * @private
   */
  _updateWebSocketStatus() {
    const statusElements = document.querySelectorAll('.websocket-status');
    
    statusElements.forEach(el => {
      if (this.websocketConnected) {
        el.classList.remove('disconnected');
        el.classList.add('connected');
        el.setAttribute('title', 'Real-time updates connected');
        el.innerHTML = '<i class="fa fa-link"></i> Connected';
      } else {
        el.classList.remove('connected');
        el.classList.add('disconnected');
        el.setAttribute('title', 'Real-time updates disconnected');
        el.innerHTML = '<i class="fa fa-unlink"></i> Disconnected';
      }
    });
  }
  
  /**
   * Send subscription request to WebSocket server
   * This tells the server what data we're interested in receiving updates for
   * 
   * @private
   */
  _sendWebSocketSubscription() {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // Create subscription message with current view details
    const subscription = {
      type: 'subscribe',
      data: {
        view: this.viewMode,
        filter: this.currentFilter,
        query: this.currentQuery,
        sort: {
          field: this.config.sortField,
          direction: this.config.sortDirection
        },
        pageSize: this.config.pageSize,
        page: this.currentPage
      }
    };
    
    // If in detail view, include the selected entry CID
    if (this.viewMode === 'detail' && this.selectedEntry) {
      subscription.data.selectedCid = this.selectedEntry.cid;
    }
    
    // Send the subscription
    this.websocket.send(JSON.stringify(subscription));
    console.log('Sent WebSocket subscription:', subscription);
  }
  
  /**
   * Handle real-time notification of a new entry being added
   * 
   * @param {Object} entry - The new entry data
   * @private
   */
  _handleRealtimeEntryAdded(entry) {
    if (!entry || !entry.cid) return;
    
    // Show notification
    const displayName = entry.path || entry.cid.substring(0, 10) + '...';
    this._showSuccess(`New entry added: ${displayName}`);
    
    // Add to the entries list if it matches current filter/query
    // This avoids a full reload if we can determine the entry belongs
    if (this._entryMatchesCurrentView(entry)) {
      // Either prepend to current entries or do a full reload
      // depending on current sort order
      if (this.config.sortField === 'created_at' && this.config.sortDirection === 'desc') {
        // For "newest first" we can just prepend
        this.entries.unshift(entry);
        this.totalEntries++;
        
        // Remove last entry if we're at page limit
        if (this.entries.length > this.config.pageSize) {
          this.entries.pop();
        }
        
        // Re-render
        if (this.viewMode === 'list') {
          this.render();
        }
      } else {
        // For other sort orders, do a full reload
        this._loadData();
      }
    }
    
    // Emit event if eventBus is available
    if (this.eventBus) {
      this.eventBus.emit('content-index-entry-added', entry);
    }
  }
  
  /**
   * Handle real-time notification of an entry being updated
   * 
   * @param {Object} entry - The updated entry data
   * @private
   */
  _handleRealtimeEntryUpdated(entry) {
    if (!entry || !entry.cid) return;
    
    // If we're viewing this entry in detail, update it
    if (this.viewMode === 'detail' && this.selectedEntry && this.selectedEntry.cid === entry.cid) {
      this.selectedEntry = entry;
      this.render();
      this._showInfo(`Entry "${entry.path || entry.cid}" has been updated`);
    } else {
      // Update in the entry list if present
      const index = this.entries.findIndex(e => e.cid === entry.cid);
      if (index >= 0) {
        this.entries[index] = entry;
        
        // Re-render if we're in list view
        if (this.viewMode === 'list') {
          this.render();
        }
      } else {
        // If not in our current view, a full reload might be needed
        // but only if the entry now matches our filter
        if (this._entryMatchesCurrentView(entry)) {
          this._loadData();
        }
      }
    }
    
    // Emit event if eventBus is available
    if (this.eventBus) {
      this.eventBus.emit('content-index-entry-updated', entry);
    }
  }
  
  /**
   * Handle real-time notification of an entry being deleted
   * 
   * @param {Object} data - The deleted entry information (typically just the CID)
   * @private
   */
  _handleRealtimeEntryDeleted(data) {
    if (!data || !data.cid) return;
    
    const cid = data.cid;
    
    // Show notification
    this._showInfo(`Entry deleted: ${data.path || cid}`);
    
    // If we're viewing this entry in detail, go back to list
    if (this.viewMode === 'detail' && this.selectedEntry && this.selectedEntry.cid === cid) {
      this.selectedEntry = null;
      this.viewMode = 'list';
      this.render();
    } else {
      // Remove from entries list if present
      const index = this.entries.findIndex(e => e.cid === cid);
      if (index >= 0) {
        this.entries.splice(index, 1);
        this.totalEntries--;
        
        // Re-render if we're in list view
        if (this.viewMode === 'list') {
          this.render();
        }
      }
    }
    
    // Emit event if eventBus is available
    if (this.eventBus) {
      this.eventBus.emit('content-index-entry-deleted', cid);
    }
  }
  
  /**
   * Handle real-time statistics update
   * 
   * @param {Object} stats - The updated statistics data
   * @private
   */
  _handleRealtimeStatsUpdate(stats) {
    if (!stats) return;
    
    // Update statistics
    this.stats = stats;
    
    // Update total count if available
    if (stats.totalEntries !== undefined) {
      this.totalEntries = stats.totalEntries;
    }
    
    // Update distribution data if available
    if (stats.contentTypeDistribution) {
      this.contentTypeDistribution = stats.contentTypeDistribution;
    }
    
    if (stats.sizeDistribution) {
      this.sizeDistribution = stats.sizeDistribution;
    }
    
    if (stats.storageDistribution) {
      this.storageDistribution = stats.storageDistribution;
    }
    
    // Update visualizations if enabled
    if (this.config.enableVisualizations) {
      this._updateCharts();
    }
    
    // Update the stats display in the header
    this._updateStats();
    
    // Emit event if eventBus is available
    if (this.eventBus) {
      this.eventBus.emit('content-index-stats-updated', stats);
    }
  }
  
  /**
   * Update statistics display in the header
   * 
   * @private
   */
  _updateStats() {
    const statsElement = document.querySelector('.dashboard-stats');
    if (statsElement) {
      const now = new Date();
      statsElement.innerHTML = `
        <span class="stat">Total Entries: <strong>${this.totalEntries.toLocaleString()}</strong></span>
        <span class="stat">Last Update: <strong>${now.toLocaleString()}</strong></span>
        <span class="stat websocket-status ${this.websocketConnected ? 'connected' : 'disconnected'}" 
          title="${this.websocketConnected ? 'Real-time updates connected' : 'Real-time updates disconnected'}">
          <i class="fa fa-${this.websocketConnected ? 'link' : 'unlink'}"></i>
          ${this.websocketConnected ? 'Connected' : 'Disconnected'}
        </span>
      `;
    }
  }
  
  /**
   * Update chart visualizations with current data
   * Called when stats are updated via WebSocket
   * 
   * @private
   */
  _updateCharts() {
    // Get references to chart containers
    const contentTypeChart = document.getElementById('content-type-chart');
    const sizeDistributionChart = document.getElementById('size-distribution-chart');
    const storageLocationChart = document.getElementById('storage-location-chart');
    
    // If there are existing Chart.js instances, destroy them first
    // to prevent memory leaks and duplicate rendering
    if (window.Chart) {
      if (this.contentTypeChartInstance) {
        this.contentTypeChartInstance.destroy();
        this.contentTypeChartInstance = null;
      }
      
      if (this.sizeDistributionChartInstance) {
        this.sizeDistributionChartInstance.destroy();
        this.sizeDistributionChartInstance = null;
      }
      
      if (this.storageLocationChartInstance) {
        this.storageLocationChartInstance.destroy();
        this.storageLocationChartInstance = null;
      }
    }
    
    // We need to re-render the entire visualization container
    // to update tables and data displays as well as charts
    const visualizationContainer = document.querySelector('.visualization-container');
    if (visualizationContainer) {
      const parent = visualizationContainer.parentNode;
      const index = Array.from(parent.children).indexOf(visualizationContainer);
      
      // Remove the old visualization
      visualizationContainer.remove();
      
      // Create a new one
      const newViz = this._renderVisualizations();
      
      // Insert at the same position
      if (index >= 0 && index < parent.children.length) {
        parent.insertBefore(newViz, parent.children[index]);
      } else {
        parent.appendChild(newViz);
      }
      
      // After DOM update, wire up events for the new container
      setTimeout(() => {
        const toggleVisBtn = document.getElementById('toggle-vis-btn');
        const exportStatsBtn = document.getElementById('export-stats-btn');
        
        if (toggleVisBtn) {
          toggleVisBtn.addEventListener('click', () => {
            this.config.enableVisualizations = !this.config.enableVisualizations;
            this.render();
            
            // Emit event if eventBus is available
            if (this.eventBus) {
              this.eventBus.emit('toggle-visualizations', this.config.enableVisualizations);
            }
          });
        }
        
        if (exportStatsBtn) {
          exportStatsBtn.addEventListener('click', () => this._handleExportStats());
        }
      }, 0);
    }
  }
  
  /**
   * Check if an entry matches the current view's filter and query
   * 
   * @param {Object} entry - The entry to check
   * @returns {boolean} True if the entry matches current filters
   * @private
   */
  _entryMatchesCurrentView(entry) {
    if (!entry) return false;
    
    // If no filters or query, it matches
    if (Object.keys(this.currentFilter).length === 0 && !this.currentQuery) {
      return true;
    }
    
    // Check against current filter
    if (Object.keys(this.currentFilter).length > 0) {
      // Simple exact match filter for demonstration
      // In a real implementation, this would need more sophisticated filtering
      for (const [key, value] of Object.entries(this.currentFilter)) {
        // Skip complex filters for this simple implementation
        if (typeof value === 'object') continue;
        
        if (entry[key] !== value) {
          return false;
        }
      }
    }
    
    // Check against query
    if (this.currentQuery) {
      const query = this.currentQuery.toLowerCase();
      const matchesCid = entry.cid && entry.cid.toLowerCase().includes(query);
      const matchesPath = entry.path && entry.path.toLowerCase().includes(query);
      const matchesMimeType = entry.mimetype && entry.mimetype.toLowerCase().includes(query);
      
      if (!matchesCid && !matchesPath && !matchesMimeType) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Start the refresh interval
   * 
   * @private
   */
  _startRefreshInterval() {
    // Clear any existing interval
    if (this.#refreshIntervalId) {
      clearInterval(this.#refreshIntervalId);
      this.#refreshIntervalId = null;
    }
    
    // Set up new interval
    if (this.config.refreshInterval > 0) {
      this.#refreshIntervalId = setInterval(() => {
        this._loadData();
      }, this.config.refreshInterval);
    }
  }
  
  /**
   * Load data from the PyArrow Content Index
   * Uses web workers for data processing when available
   * 
   * @returns {Promise<void>}
   * @private
   */
  async _loadData() {
    if (!this.pyarrowIndex) return;
    
    this.loading = true;
    if (this.viewMode === 'list') {
      this.render();
    }
    
    try {
      // Build query options
      const options = {
        offset: (this.currentPage - 1) * this.config.pageSize,
        limit: this.config.pageSize,
        sort: this.config.sortField,
        sortDirection: this.config.sortDirection
      };
      
      // Add filter if present
      if (Object.keys(this.currentFilter).length > 0) {
        options.filter = this.currentFilter;
      }
      
      // Add search query if present
      if (this.currentQuery) {
        options.query = this.currentQuery;
      }
      
      // Query the index and load stats in parallel
      const [result, stats] = await Promise.all([
        this.pyarrowIndex.query(options),
        this.pyarrowIndex.getStats()
      ]);
      
      this.entries = result.entries || [];
      this.totalEntries = result.total || 0;
      this.stats = stats;
      
      // Start a performance measurement
      const perfStart = performance.now();
      
      // Process statistics for visualizations
      if (this.stats) {
        await this._processVisualizationData();
      }
      
      // Log the performance improvement
      const processingTime = performance.now() - perfStart;
      console.debug(`Visualization data processing took ${processingTime.toFixed(2)}ms`);
      
      // If we have the entire dataset (not just the current page), we can use
      // the worker for additional processing like searching and filtering
      if (this.allEntries && this.allEntries.length > 0 && this.workersEnabled && this.workerManager) {
        // Generate stats for all entries in the background
        this._generateAllStatsInBackground();
      }
      
      // If in detail view, refresh the selected entry
      if (this.viewMode === 'detail' && this.selectedEntry) {
        const updatedEntry = await this.pyarrowIndex.lookupByCid(this.selectedEntry.cid);
        if (updatedEntry) {
          this.selectedEntry = updatedEntry;
        }
      }
    } catch (error) {
      console.error('Failed to load content index data:', error);
      this._showError('Failed to load content index data', error);
      this.entries = [];
      this.totalEntries = 0;
    } finally {
      this.loading = false;
      this.render();
    }
  }
  
  /**
   * Generate statistics for all entries in the background using a web worker
   * This provides more accurate stats for the entire dataset, not just the current page
   * 
   * @private
   */
  _generateAllStatsInBackground() {
    if (!this.workersEnabled || !this.workerManager || !this.allEntries) return;
    
    // Only run if we have a significant number of entries
    if (this.allEntries.length < 100) return;
    
    // Generate stats in a worker
    this.workerManager.runTask('generateStats', { entries: this.allEntries })
      .then(result => {
        // Store the comprehensive stats
        this.allStats = result;
        
        // Notify that we have better stats available
        if (this.eventBus) {
          this.eventBus.emit('comprehensive-stats-available', this.allStats);
        }
        
        console.debug(`Generated comprehensive stats for ${this.allEntries.length} entries`);
      })
      .catch(error => {
        console.warn('Failed to generate comprehensive stats:', error);
      });
  }
  
  /**
   * Process statistics for visualizations
   * Offloads the processing to a web worker if available
   * 
   * @private
   * @returns {Promise<void>}
   */
  async _processVisualizationData() {
    if (!this.stats) return;
    
    // Use web worker if available
    if (this.workersEnabled && this.workerManager) {
      try {
        // Process data in the worker
        const result = await this.workerManager.runTaskWithTimeout(
          'processVisualizationData', 
          this.stats,
          5000 // 5 second timeout
        );
        
        // Update the data with the processed results
        this.contentTypeDistribution = result.contentTypeDistribution || [];
        this.sizeDistribution = result.sizeDistribution || [];
        this.storageDistribution = result.storageDistribution || [];
        
        return;
      } catch (error) {
        console.warn('Worker processing failed, falling back to main thread:', error);
        // Continue with main thread processing if worker fails
      }
    }
    
    // Main thread processing (fallback)
    // Process content type distribution
    this.contentTypeDistribution = [];
    if (this.stats.type_counts) {
      this.contentTypeDistribution = Object.entries(this.stats.type_counts)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);
    }
    
    // Process size distribution
    this.sizeDistribution = [];
    if (this.stats.size_ranges) {
      this.sizeDistribution = Object.entries(this.stats.size_ranges)
        .map(([range, count]) => ({ range, count }))
        .sort((a, b) => {
          // Sort by range (< 1MB, 1-10MB, 10-100MB, etc.)
          const sizeOrder = {
            '< 1KB': 0,
            '1KB - 10KB': 1,
            '10KB - 100KB': 2,
            '100KB - 1MB': 3,
            '1MB - 10MB': 4,
            '10MB - 100MB': 5,
            '100MB - 1GB': 6,
            '> 1GB': 7
          };
          return sizeOrder[a.range] - sizeOrder[b.range];
        });
    }
    
    // Process storage location distribution
    this.storageDistribution = [];
    if (this.stats.location_counts) {
      this.storageDistribution = Object.entries(this.stats.location_counts)
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count);
    }
  }
  
  /**
   * Handle search
   * Uses web workers for filtering if available
   * 
   * @private
   */
  _handleSearch() {
    const searchInput = document.getElementById('content-index-search');
    if (!searchInput) return;
    
    this.currentQuery = searchInput.value.trim();
    this.currentPage = 1;
    
    // Add the search to history
    this._addToSearchHistory(this.currentQuery, this.currentFilter);
    
    // If we have a complete dataset and workers are enabled, use client-side filtering
    if (this.allEntries && this.allEntries.length > 0 && 
        this.workersEnabled && this.workerManager && 
        this.allEntries.length <= 10000) { // Only use client-side for reasonable sizes
      
      this._filterEntriesWithWorker();
    } else {
      // Otherwise, load from the server
      this._loadData();
    }
  }
  
  /**
   * Filter entries using a web worker
   * This provides faster filtering for large datasets
   * 
   * @private
   */
  async _filterEntriesWithWorker() {
    if (!this.workersEnabled || !this.workerManager || !this.allEntries) {
      this._loadData();
      return;
    }
    
    // Show loading state
    this.loading = true;
    this.render();
    
    try {
      // Performance measurement
      const perfStart = performance.now();
      
      // Use web worker to filter and sort entries
      const result = await this.workerManager.runTaskWithTimeout(
        'searchAndFilter',
        {
          entries: this.allEntries,
          query: this.currentQuery,
          filter: this.currentFilter
        },
        10000 // 10 second timeout
      );
      
      // Log performance
      const processingTime = performance.now() - perfStart;
      console.debug(`Worker filtering ${this.allEntries.length} entries took ${processingTime.toFixed(2)}ms`);
      
      // Get subset for current page
      const pageSize = this.config.pageSize;
      const startIndex = (this.currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      
      // Update entries and stats
      this.filteredEntries = result.entries || [];
      this.entries = this.filteredEntries.slice(startIndex, endIndex);
      this.totalEntries = this.filteredEntries.length;
      
      // Update stats if provided
      if (result.stats) {
        this.filteredStats = result.stats;
        
        // Process visualization data from filtered stats
        await this._processVisualizationData();
      }
      
      // Emit event for client-side filtering
      if (this.eventBus) {
        this.eventBus.emit('client-side-filtering-applied', {
          query: this.currentQuery,
          filter: this.currentFilter,
          totalResults: this.totalEntries,
          processingTime
        });
      }
    } catch (error) {
      console.warn('Worker filtering failed, falling back to server-side filtering:', error);
      // Fall back to server-side filtering
      this._loadData();
      return;
    } finally {
      this.loading = false;
      this.render();
    }
  }
  
  /**
   * Handle filter change
   * Uses web workers for filtering if available
   * 
   * @private
   */
  _handleFilterChange() {
    const typeSelect = document.getElementById('content-index-filter-type');
    const sortSelect = document.getElementById('content-index-sort');
    
    if (!typeSelect || !sortSelect) return;
    
    const type = typeSelect.value;
    const sortValue = sortSelect.value;
    
    // Update filter
    this.currentFilter = {};
    if (type) {
      this.currentFilter.type = type;
    }
    
    // Update sort
    if (sortValue) {
      const [field, direction] = sortValue.split('-');
      this.config.sortField = field;
      this.config.sortDirection = direction;
    }
    
    this.currentPage = 1;
    
    // If we have a complete dataset and workers are enabled, use client-side filtering
    if (this.allEntries && this.allEntries.length > 0 && 
        this.workersEnabled && this.workerManager && 
        this.allEntries.length <= 10000) { // Only use client-side for reasonable sizes
      
      this._filterEntriesWithWorker();
    } else {
      // Otherwise, load from the server
      this._loadData();
    }
  }
  
  /**
   * Handle refresh
   * 
   * @private
   */
  _handleRefresh() {
    this._loadData();
  }
  
  /**
   * Handle view entry
   * 
   * @param {number} index - Index of the entry to view
   * @private
   */
  _handleViewEntry(index) {
    if (index >= 0 && index < this.entries.length) {
      this.selectedEntry = this.entries[index];
      this.viewMode = 'detail';
      this.render();
    }
  }
  
  /**
   * Handle copying a CID to clipboard
   * 
   * @param {string} cid - CID to copy
   * @private
   */
  _handleCopyCid(cid) {
    if (!cid) return;
    
    try {
      // Copy to clipboard
      navigator.clipboard.writeText(cid)
        .then(() => {
          this._showSuccess('CID copied to clipboard');
        })
        .catch((error) => {
          console.error('Failed to copy CID:', error);
          this._showError('Failed to copy CID', error);
        });
    } catch (error) {
      console.error('Failed to copy CID:', error);
      this._showError('Failed to copy CID', error);
      
      // Fallback method
      const tempInput = document.createElement('input');
      tempInput.value = cid;
      document.body.appendChild(tempInput);
      tempInput.select();
      
      try {
        const success = document.execCommand('copy');
        if (success) {
          this._showSuccess('CID copied to clipboard');
        } else {
          this._showError('Failed to copy CID', new Error('execCommand returned false'));
        }
      } catch (execError) {
        this._showError('Failed to copy CID', execError);
      } finally {
        document.body.removeChild(tempInput);
      }
    }
  }
  
  /**
   * Handle downloading content
   * 
   * @param {string} cid - CID to download
   * @private
   */
  async _handleDownload(cid) {
    if (!cid || !this.pyarrowIndex) return;
    
    try {
      // Show loading state
      this._showSuccess('Starting download...');
      
      // Get entry details
      const entry = await this.pyarrowIndex.lookupByCid(cid);
      if (!entry) {
        throw new Error(`Entry with CID ${cid} not found`);
      }
      
      // Trigger download through IPFS Kit
      const result = await this.pyarrowIndex.download(cid, {
        // Optional download location
        destination: this.config.downloadFolder
      });
      
      if (result.success) {
        this._showSuccess(`Downloaded to: ${result.path}`);
        
        // If result contains a file URL, open it
        if (result.url) {
          window.open(result.url, '_blank');
        }
      } else {
        throw new Error(result.error || 'Unknown download error');
      }
    } catch (error) {
      console.error('Failed to download content:', error);
      this._showError('Failed to download content', error);
    }
  }
  
  /**
   * Handle adding a new entry
   * 
   * @private
   */
  _handleAddEntry() {
    // Create modal for adding new entry
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Add New Content Index Entry</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <form id="add-entry-form">
            <div class="form-group">
              <label for="entry-cid">CID (required)</label>
              <input type="text" id="entry-cid" required placeholder="bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi">
            </div>
            <div class="form-group">
              <label for="entry-path">Path</label>
              <input type="text" id="entry-path" placeholder="/datasets/common_voice/en/train.parquet">
            </div>
            <div class="form-group">
              <label for="entry-mimetype">MIME Type</label>
              <input type="text" id="entry-mimetype" placeholder="application/octet-stream">
            </div>
            <div class="form-group">
              <label for="entry-size">Size (bytes)</label>
              <input type="number" id="entry-size" placeholder="1024">
            </div>
            <div class="form-group">
              <label for="entry-locations">Storage Locations (JSON)</label>
              <textarea id="entry-locations" rows="5" placeholder='{
  "ipfs": ["https://ipfs.io", "https://dweb.link"],
  "huggingface": {
    "repo_id": "username/repo",
    "path": "file.bin",
    "revision": "main"
  }
}'></textarea>
            </div>
            <div class="form-group">
              <label for="entry-metadata">Custom Metadata (JSON)</label>
              <textarea id="entry-metadata" rows="5" placeholder='{
  "description": "My dataset",
  "tags": ["audio", "speech"],
  "language": "en"
}'></textarea>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button id="modal-cancel" class="secondary-btn">Cancel</button>
          <button id="modal-submit" class="primary-btn">Add Entry</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeButton = modal.querySelector('.modal-close');
    const cancelButton = document.getElementById('modal-cancel');
    const submitButton = document.getElementById('modal-submit');
    const form = document.getElementById('add-entry-form');
    
    const closeModal = () => {
      document.body.removeChild(modal);
    };
    
    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (cancelButton) cancelButton.addEventListener('click', closeModal);
    
    if (submitButton && form) {
      submitButton.addEventListener('click', async () => {
        // Get form values
        const cid = document.getElementById('entry-cid')?.value?.trim();
        const path = document.getElementById('entry-path')?.value?.trim();
        const mimetype = document.getElementById('entry-mimetype')?.value?.trim();
        const sizeStr = document.getElementById('entry-size')?.value?.trim();
        const locationsJson = document.getElementById('entry-locations')?.value?.trim();
        const metadataJson = document.getElementById('entry-metadata')?.value?.trim();
        
        // Validate CID
        if (!cid) {
          this._showError('CID is required', new Error('Missing required field'));
          return;
        }
        
        try {
          // Parse JSON fields
          const entry = {
            cid,
            path: path || null,
            mimetype: mimetype || null,
            size: sizeStr ? parseInt(sizeStr, 10) : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          // Add locations if provided
          if (locationsJson) {
            try {
              entry.locations = JSON.parse(locationsJson);
            } catch (jsonError) {
              this._showError('Invalid JSON in locations field', jsonError);
              return;
            }
          }
          
          // Add metadata if provided
          if (metadataJson) {
            try {
              entry.metadata = JSON.parse(metadataJson);
            } catch (jsonError) {
              this._showError('Invalid JSON in metadata field', jsonError);
              return;
            }
          }
          
          // Add the entry
          const result = await this.pyarrowIndex.addEntry(entry);
          
          if (result.success) {
            this._showSuccess('Entry added successfully');
            closeModal();
            
            // Notify event bus if available
            if (this.eventBus) {
              this.eventBus.emit('content-index-entry-added', entry);
            }
            
            // Reload data
            this._loadData();
          } else {
            throw new Error(result.error || 'Failed to add entry');
          }
        } catch (error) {
          console.error('Failed to add entry:', error);
          this._showError('Failed to add entry', error);
        }
      });
    }
  }
  
  /**
   * Handle deleting an entry
   * 
   * @param {string} cid - CID of the entry to delete
   * @private
   */
  _handleDeleteEntry(cid) {
    if (!cid || !this.pyarrowIndex) return;
    
    // Confirm deletion
    const confirmModal = document.createElement('div');
    confirmModal.className = 'modal';
    confirmModal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Confirm Deletion</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to delete the entry with CID:</p>
          <code>${cid}</code>
          <p>This action cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button id="modal-cancel" class="secondary-btn">Cancel</button>
          <button id="modal-confirm" class="danger-btn">Delete</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(confirmModal);
    
    // Add event listeners
    const closeButton = confirmModal.querySelector('.modal-close');
    const cancelButton = document.getElementById('modal-cancel');
    const confirmButton = document.getElementById('modal-confirm');
    
    const closeModal = () => {
      document.body.removeChild(confirmModal);
    };
    
    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (cancelButton) cancelButton.addEventListener('click', closeModal);
    
    if (confirmButton) {
      confirmButton.addEventListener('click', async () => {
        try {
          // Delete the entry
          const result = await this.pyarrowIndex.deleteEntry(cid);
          
          if (result.success) {
            this._showSuccess('Entry deleted successfully');
            closeModal();
            
            // Return to list view if currently viewing the deleted entry
            if (this.viewMode === 'detail' && this.selectedEntry && this.selectedEntry.cid === cid) {
              this.viewMode = 'list';
              this.selectedEntry = null;
            }
            
            // Notify event bus if available
            if (this.eventBus) {
              this.eventBus.emit('content-index-entry-deleted', cid);
            }
            
            // Reload data
            this._loadData();
          } else {
            throw new Error(result.error || 'Failed to delete entry');
          }
        } catch (error) {
          console.error('Failed to delete entry:', error);
          this._showError('Failed to delete entry', error);
        }
      });
    }
  }
  
  /**
   * Handle exporting the index
   * 
   * @private
   */
  async _handleExportIndex() {
    if (!this.pyarrowIndex) return;
    
    try {
      // Show loading notification
      this._showSuccess('Exporting index...');
      
      // Export the index
      const result = await this.pyarrowIndex.exportToParquet({
        path: this.config.exportPath || null,
        includeTimestamp: true
      });
      
      if (result.success) {
        this._showSuccess(`Index exported to: ${result.path}`);
        
        // If result contains a download URL, trigger download
        if (result.url) {
          const link = document.createElement('a');
          link.href = result.url;
          link.download = result.filename || 'content_index.parquet';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } else {
        throw new Error(result.error || 'Failed to export index');
      }
    } catch (error) {
      console.error('Failed to export index:', error);
      this._showError('Failed to export index', error);
    }
  }
  
  /**
   * Handle importing an index
   * 
   * @private
   */
  _handleImportIndex() {
    if (!this.pyarrowIndex) return;
    
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.parquet,.arrow';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    // Handle file selection
    fileInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      
      try {
        // Show loading notification
        this._showSuccess('Importing index...');
        
        // Import the index
        const result = await this.pyarrowIndex.importFromParquet({
          file: file,
          merge: true // Merge with existing index
        });
        
        if (result.success) {
          this._showSuccess(`Index imported successfully: ${result.count} entries`);
          
          // Reload data
          this._loadData();
          
          // Notify event bus if available
          if (this.eventBus) {
            this.eventBus.emit('content-index-updated');
          }
        } else {
          throw new Error(result.error || 'Failed to import index');
        }
      } catch (error) {
        console.error('Failed to import index:', error);
        this._showError('Failed to import index', error);
      } finally {
        // Remove the file input
        document.body.removeChild(fileInput);
      }
    });
    
    // Trigger file selection
    fileInput.click();
  }
  
  /**
   * Format file size in human-readable format
   * 
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   * @private
   */
  _formatSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Check if content has a visual MIME type that can be displayed
   * 
   * @param {string} mimetype - The MIME type to check
   * @returns {boolean} - True if the content is visual
   * @private
   */
  _isVisualContent(mimetype) {
    if (!mimetype) return false;
    
    // Image types
    if (mimetype.startsWith('image/')) {
      return true;
    }
    
    // PDF documents
    if (mimetype === 'application/pdf') {
      return true;
    }
    
    // Video types (for thumbnail generation)
    if (mimetype.startsWith('video/')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Generate a thumbnail for visual content
   * 
   * @param {Object} entry - The content entry
   * @returns {Promise<string>} - Promise resolving to thumbnail URL or null
   * @private
   */
  async _generateThumbnail(entry) {
    if (!entry || !entry.cid || !this._isVisualContent(entry.mimetype)) {
      return null;
    }
    
    try {
      // For images, we can use the IPFS gateway directly
      if (entry.mimetype.startsWith('image/')) {
        // Use the first available IPFS gateway
        if (entry.locations?.ipfs?.length > 0) {
          const gateway = entry.locations.ipfs[0];
          return `${gateway}/ipfs/${entry.cid}`;
        }
        
        // Default gateway if none specified
        return `https://ipfs.io/ipfs/${entry.cid}`;
      }
      
      // For PDFs, we need a thumbnail endpoint
      if (entry.mimetype === 'application/pdf') {
        // Use the configured thumbnail service if available
        if (this.config.thumbnailService) {
          return `${this.config.thumbnailService}/thumbnail?cid=${entry.cid}&type=pdf`;
        }
        
        // Otherwise, use a PDF icon
        return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cGF0aCBmaWxsPSIjZTJlNWU3IiBkPSJNMTI4IDBoMjU2djEyOGgxMjh2MzIwYzAgMzUuMy0yOC43IDY0LTY0IDY0SDY0Yy0zNS4zIDAtNjQtMjguNy02NC02NFYxMjhIMTI4VjB6TTY0IDMwMHYxNDhjMCA4LjggNy4yIDE2IDE2IDE2aDM1MmM4LjggMCAxNi03LjIgMTYtMTZWMzAwSDY0eiIvPjxwYXRoIGZpbGw9IiNjZjQyMjciIGQ9Ik0wIDE2MGg1MTJ2MTQwSDBWMTYweiIvPjx0ZXh0IHg9IjIwMCIgeT0iMjUwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSI2MCIgZmlsbD0id2hpdGUiPlBERjwvdGV4dD48L3N2Zz4=';
      }
      
      // For videos, we need a video thumbnail service
      if (entry.mimetype.startsWith('video/')) {
        // Use the configured thumbnail service if available
        if (this.config.thumbnailService) {
          return `${this.config.thumbnailService}/thumbnail?cid=${entry.cid}&type=video`;
        }
        
        // Otherwise, use a video icon
        return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cGF0aCBmaWxsPSIjNDdhMWY3IiBkPSJNMjU2IDAgQzExNC42IDAgMCAxMTQuNiAwIDI1NnMxMTQuNiAyNTYgMjU2IDI1NiAyNTYtMTE0LjYgMjU2LTI1NlMzOTcuNCAwIDI1NiAwem0wIDQ2NGMtMTE0LjcgMC0yMDgtOTMuMy0yMDgtMjA4UzE0MS4zIDQ4IDI1NiA0OHMyMDggOTMuMyAyMDggMjA4LTkzLjMgMjA4LTIwOCAyMDh6Ii8+PHBhdGggZmlsbD0iIzQ3YTFmNyIgZD0iTTM2OS45IDIwNC4yYy00LTMuNy0xMC4yLTMuOS0xNC4zLS40bC0xMDQgODRjLTIuMyAxLjktMy42IDQuOC0zLjYgNy44czEuMiA1LjkgMy42IDcuOGwxMDQgODRjMi4yIDEuOCA0LjkgMi43IDcuNiAyLjcgMi4zIDAgNC42LS43IDYuNy0yLjIgNC4xLTMgNi41LTcuOCA2LjUtMTNWMjE3LjNjMC01LjItMi41LTEwLTYuNS0xM3ptLTIxLjcgMTU5LjZsLTc1LjQtNjAuOSA3NS40LTYwLjl2MTIxLjh6Ii8+PC9zdmc+';
      }
      
      return null;
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      return null;
    }
  }
  
  /**
   * Shorten a CID for display
   * 
   * @param {string} cid - CID to shorten
   * @returns {string} Shortened CID
   * @private
   */
  _shortenCid(cid) {
    if (!cid) return '';
    if (cid.length <= 16) return cid;
    
    return cid.substring(0, 8) + '...' + cid.substring(cid.length - 8);
  }
  
  /**
   * Get an icon for a given MIME type
   * 
   * @param {string} mimetype - MIME type
   * @returns {string} CSS class for the icon
   * @private
   */
  _getTypeIcon(mimetype) {
    if (!mimetype) return 'fa fa-file-o';
    
    const type = mimetype.split('/')[0];
    const subtype = mimetype.split('/')[1];
    
    switch (type) {
      case 'image':
        return 'fa fa-file-image-o';
      case 'video':
        return 'fa fa-file-video-o';
      case 'audio':
        return 'fa fa-file-audio-o';
      case 'text':
        if (subtype === 'csv') return 'fa fa-file-excel-o';
        if (subtype === 'html') return 'fa fa-file-code-o';
        return 'fa fa-file-text-o';
      case 'application':
        if (subtype === 'pdf') return 'fa fa-file-pdf-o';
        if (subtype === 'json') return 'fa fa-file-code-o';
        if (subtype.includes('javascript')) return 'fa fa-file-code-o';
        if (subtype.includes('zip') || subtype.includes('compressed')) return 'fa fa-file-archive-o';
        return 'fa fa-file-o';
      default:
        return 'fa fa-file-o';
    }
  }
  
  /**
   * Convert a binary buffer to hexadecimal string
   * 
   * @param {Buffer|Uint8Array} buffer - Binary buffer
   * @returns {string} Hexadecimal string
   * @private
   */
  _bufferToHex(buffer) {
    if (!buffer) return '';
    
    // Convert ArrayBuffer to Uint8Array if needed
    const arr = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    
    // Convert to hex
    return Array.from(arr)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

/**
 * Electron wrapper for PyArrow Content Index Dashboard
 * Provides a window and IPC communication for the dashboard component
 */
class PyArrowContentIndexDashboard {
  /**
   * Create a new PyArrow Content Index Dashboard
   * @param {Object} options Dashboard options
   */
  constructor(options = {}) {
    this.options = {
      indexPath: options.indexPath || path.join(os.homedir(), '.hallucinate_app', 'content_index.arrow'),
      mainWindow: options.mainWindow || null,
      refreshInterval: options.refreshInterval || 10000, // ms
      autoOpen: options.autoOpen || false,
      ...options
    };
    
    this.window = null;
    this.autoRefreshTimer = null;
    this.pyarrowIndex = null;
    
    // Set up IPC handlers
    this._setupIpcHandlers();
    
    // Auto-open if configured
    if (this.options.autoOpen) {
      this.openDashboard();
    }
  }
  
  /**
   * Set up IPC handlers for communication with renderer processes
   * @private
   */
  _setupIpcHandlers() {
    // Handle display-content-index-dashboard event from renderer
    ipcMain.on('display-content-index-dashboard', (event, data) => {
      this.openDashboard(data);
    });
    
    // Handle content-index-search from renderer
    ipcMain.on('content-index-search', async (event, query) => {
      try {
        const result = await this._doSearch(query);
        event.reply('content-index-search-result', result);
      } catch (error) {
        console.error('Error searching content index:', error);
        event.reply('content-index-search-error', {
          error: error.message || String(error)
        });
      }
    });
    
    // Handle content-index-view-details from renderer
    ipcMain.on('content-index-view-details', async (event, cid) => {
      try {
        const entry = await this._getEntryByCid(cid);
        event.reply('content-index-entry-details', entry);
      } catch (error) {
        console.error('Error getting entry details:', error);
        event.reply('content-index-entry-error', {
          error: error.message || String(error),
          cid
        });
      }
    });
    
    // Handle content-index-add-entry from renderer
    ipcMain.on('content-index-add-entry', async (event, entry) => {
      try {
        const result = await this._addEntry(entry);
        event.reply('content-index-add-result', result);
      } catch (error) {
        console.error('Error adding entry:', error);
        event.reply('content-index-add-error', {
          error: error.message || String(error)
        });
      }
    });
    
    // Handle content-index-delete-entry from renderer
    ipcMain.on('content-index-delete-entry', async (event, cid) => {
      try {
        const result = await this._deleteEntry(cid);
        event.reply('content-index-delete-result', result);
      } catch (error) {
        console.error('Error deleting entry:', error);
        event.reply('content-index-delete-error', {
          error: error.message || String(error),
          cid
        });
      }
    });
    
    // Handle content-index-export from renderer
    ipcMain.on('content-index-export', async (event, exportOptions) => {
      try {
        const result = await this._exportIndex(exportOptions);
        event.reply('content-index-export-result', result);
      } catch (error) {
        console.error('Error exporting index:', error);
        event.reply('content-index-export-error', {
          error: error.message || String(error)
        });
      }
    });
    
    // Handle content-index-import from renderer
    ipcMain.on('content-index-import', async (event, importOptions) => {
      try {
        const result = await this._importIndex(importOptions);
        event.reply('content-index-import-result', result);
      } catch (error) {
        console.error('Error importing index:', error);
        event.reply('content-index-import-error', {
          error: error.message || String(error)
        });
      }
    });
    
    // Handle close-dashboard from renderer
    ipcMain.on('close-content-index-dashboard', (event) => {
      this.closeDashboard();
    });
  }
  
  /**
   * Perform search on content index
   * @private
   * @param {Object} query Query parameters
   * @returns {Promise<Object>} Search results
   */
  async _doSearch(query) {
    // This would use the PyArrow index in a real implementation
    // For now, it returns mock data
    return {
      entries: Array(10).fill(0).map((_, i) => ({
        cid: `bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzd${i}`,
        path: `/datasets/sample/file_${i}.bin`,
        mimetype: i % 2 === 0 ? 'application/octet-stream' : 'text/plain',
        size: 1024 * (i + 1),
        created_at: new Date(Date.now() - 86400000 * i).toISOString(),
        updated_at: new Date(Date.now() - 3600000 * i).toISOString()
      })),
      total: 42
    };
  }
  
  /**
   * Get entry by CID
   * @private
   * @param {string} cid Content ID
   * @returns {Promise<Object>} Entry details
   */
  async _getEntryByCid(cid) {
    // This would use the PyArrow index in a real implementation
    // For now, it returns mock data
    return {
      cid,
      path: `/datasets/sample/file_${cid.slice(-1)}.bin`,
      mimetype: 'application/octet-stream',
      size: 1024 * 10,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
      locations: {
        ipfs: ['https://ipfs.io', 'https://dweb.link'],
        huggingface: {
          repo_id: 'username/repo',
          path: 'file.bin',
          revision: 'main'
        }
      },
      metadata: {
        description: 'Sample dataset',
        tags: ['sample', 'test'],
        created_by: 'PyArrow Content Index Dashboard'
      }
    };
  }
  
  /**
   * Add entry to content index
   * @private
   * @param {Object} entry Entry to add
   * @returns {Promise<Object>} Result
   */
  async _addEntry(entry) {
    // This would use the PyArrow index in a real implementation
    console.log('Adding entry:', entry);
    return { success: true };
  }
  
  /**
   * Delete entry from content index
   * @private
   * @param {string} cid Content ID to delete
   * @returns {Promise<Object>} Result
   */
  async _deleteEntry(cid) {
    // This would use the PyArrow index in a real implementation
    console.log('Deleting entry:', cid);
    return { success: true };
  }
  
  /**
   * Export content index
   * @private
   * @param {Object} options Export options
   * @returns {Promise<Object>} Result
   */
  async _exportIndex(options) {
    // This would use the PyArrow index in a real implementation
    console.log('Exporting index:', options);
    const exportPath = options.path || path.join(os.homedir(), '.hallucinate_app', 'exports', `content_index_${Date.now()}.parquet`);
    
    // Ensure directory exists
    fs.mkdirSync(path.dirname(exportPath), { recursive: true });
    
    // Create empty file for mock
    fs.writeFileSync(exportPath, 'MOCK EXPORT');
    
    return { 
      success: true,
      path: exportPath
    };
  }
  
  /**
   * Import content index
   * @private
   * @param {Object} options Import options
   * @returns {Promise<Object>} Result
   */
  async _importIndex(options) {
    // This would use the PyArrow index in a real implementation
    console.log('Importing index:', options);
    return { 
      success: true,
      count: 42
    };
  }
  
  /**
   * Open the content index dashboard
   * @param {Object} data Optional data to initialize the dashboard with
   */
  openDashboard(data = null) {
    // If already open, just focus the window
    if (this.window) {
      this.window.focus();
      return;
    }
    
    // Create the dashboard window
    this.window = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'PyArrow Content Index Dashboard',
      icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    // Create the HTML file for the dashboard
    this._createDashboardHtml();
    
    // Load the dashboard HTML
    this.window.loadFile(path.join(__dirname, 'pyarrow_content_index_dashboard.html'));
    
    // Handle window closed
    this.window.on('closed', () => {
      this.window = null;
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    });
    
    // When content is loaded, send initial data
    this.window.webContents.on('did-finish-load', () => {
      // Send initial config
      this.window.webContents.send('init-content-index-dashboard', {
        config: {
          indexPath: this.options.indexPath,
          refreshInterval: this.options.refreshInterval
        },
        ...data
      });
      
      // Set up auto-refresh timer
      if (this.options.refreshInterval > 0) {
        this.autoRefreshTimer = setInterval(() => {
          this.refreshData();
        }, this.options.refreshInterval);
      }
    });
  }
  
  /**
   * Create HTML file for the dashboard
   * @private
   */
  _createDashboardHtml() {
    const htmlPath = path.join(__dirname, 'pyarrow_content_index_dashboard.html');
    const cssPath = path.join(__dirname, 'pyarrow_content_index_dashboard.css');
    
    // Get the CSS content
    let cssContent = '';
    try {
      cssContent = fs.readFileSync(cssPath, 'utf8');
    } catch (error) {
      console.error('Error reading CSS file:', error);
    }
    
    // Create HTML content
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PyArrow Content Index Dashboard</title>
  <style>${cssContent}</style>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
</head>
<body>
  <div id="dashboard-container"></div>
  
  <script>
    // Renderer script
    const { ipcRenderer } = require('electron');
    
    // Dashboard state
    let config = {
      indexPath: '',
      refreshInterval: 10000,
      pageSize: 10,
      sortField: 'updated_at',
      sortDirection: 'desc'
    };
    let currentPage = 1;
    let currentQuery = '';
    let currentFilter = {};
    let totalEntries = 0;
    let entries = [];
    let loading = true;
    let selectedEntry = null;
    let viewMode = 'list'; // 'list' or 'detail'
    
    // Initialize dashboard when config is received
    ipcRenderer.on('init-content-index-dashboard', (event, data) => {
      config = { ...config, ...data.config };
      renderDashboard();
      loadData();
    });
    
    // Handle search results
    ipcRenderer.on('content-index-search-result', (event, result) => {
      entries = result.entries || [];
      totalEntries = result.total || 0;
      loading = false;
      renderDashboard();
    });
    
    // Handle search errors
    ipcRenderer.on('content-index-search-error', (event, error) => {
      showError('Search failed', new Error(error.error));
      loading = false;
      renderDashboard();
    });
    
    // Handle entry details
    ipcRenderer.on('content-index-entry-details', (event, entry) => {
      selectedEntry = entry;
      viewMode = 'detail';
      renderDashboard();
    });
    
    // Handle entry errors
    ipcRenderer.on('content-index-entry-error', (event, error) => {
      showError('Failed to get entry details', new Error(error.error));
    });
    
    // Handle add results
    ipcRenderer.on('content-index-add-result', (event, result) => {
      if (result.success) {
        showSuccess('Entry added successfully');
        loadData();
      } else {
        showError('Failed to add entry', new Error(result.error || 'Unknown error'));
      }
    });
    
    // Handle delete results
    ipcRenderer.on('content-index-delete-result', (event, result) => {
      if (result.success) {
        showSuccess('Entry deleted successfully');
        if (viewMode === 'detail') {
          viewMode = 'list';
          selectedEntry = null;
        }
        loadData();
      } else {
        showError('Failed to delete entry', new Error(result.error || 'Unknown error'));
      }
    });
    
    // Handle export results
    ipcRenderer.on('content-index-export-result', (event, result) => {
      if (result.success) {
        showSuccess(\`Index exported to: \${result.path}\`);
      } else {
        showError('Failed to export index', new Error(result.error || 'Unknown error'));
      }
    });
    
    // Handle import results
    ipcRenderer.on('content-index-import-result', (event, result) => {
      if (result.success) {
        showSuccess(\`Index imported successfully: \${result.count} entries\`);
        loadData();
      } else {
        showError('Failed to import index', new Error(result.error || 'Unknown error'));
      }
    });
    
    // Load data from the backend
    function loadData() {
      loading = true;
      renderDashboard();
      
      // Build query options
      const options = {
        offset: (currentPage - 1) * config.pageSize,
        limit: config.pageSize,
        sort: config.sortField,
        sortDirection: config.sortDirection
      };
      
      // Add filter if present
      if (Object.keys(currentFilter).length > 0) {
        options.filter = currentFilter;
      }
      
      // Add search query if present
      if (currentQuery) {
        options.query = currentQuery;
      }
      
      // Send search request to main process
      ipcRenderer.send('content-index-search', options);
    }
    
    // View entry details
    function viewEntry(index) {
      if (index >= 0 && index < entries.length) {
        const cid = entries[index].cid;
        ipcRenderer.send('content-index-view-details', cid);
      }
    }
    
    // Add a new entry
    function addEntry(entry) {
      ipcRenderer.send('content-index-add-entry', entry);
    }
    
    // Delete an entry
    function deleteEntry(cid) {
      ipcRenderer.send('content-index-delete-entry', cid);
    }
    
    // Export the index
    function exportIndex(options) {
      ipcRenderer.send('content-index-export', options);
    }
    
    // Import an index
    function importIndex(options) {
      ipcRenderer.send('content-index-import', options);
    }
    
    // Handle search
    function handleSearch() {
      const searchInput = document.getElementById('content-index-search');
      if (!searchInput) return;
      
      currentQuery = searchInput.value.trim();
      currentPage = 1;
      loadData();
    }
    
    // Handle filter change
    function handleFilterChange() {
      const typeSelect = document.getElementById('content-index-filter-type');
      const sortSelect = document.getElementById('content-index-sort');
      
      if (!typeSelect || !sortSelect) return;
      
      const type = typeSelect.value;
      const sortValue = sortSelect.value;
      
      // Update filter
      currentFilter = {};
      if (type) {
        currentFilter.type = type;
      }
      
      // Update sort
      if (sortValue) {
        const [field, direction] = sortValue.split('-');
        config.sortField = field;
        config.sortDirection = direction;
      }
      
      currentPage = 1;
      loadData();
    }
    
    // Handle copy CID
    function handleCopyCid(cid) {
      if (!cid) return;
      
      try {
        navigator.clipboard.writeText(cid)
          .then(() => {
            showSuccess('CID copied to clipboard');
          })
          .catch((error) => {
            console.error('Failed to copy CID:', error);
            showError('Failed to copy CID', error);
          });
      } catch (error) {
        console.error('Failed to copy CID:', error);
        showError('Failed to copy CID', error);
        
        // Fallback method
        const tempInput = document.createElement('input');
        tempInput.value = cid;
        document.body.appendChild(tempInput);
        tempInput.select();
        
        try {
          const success = document.execCommand('copy');
          if (success) {
            showSuccess('CID copied to clipboard');
          } else {
            showError('Failed to copy CID', new Error('execCommand returned false'));
          }
        } catch (execError) {
          showError('Failed to copy CID', execError);
        } finally {
          document.body.removeChild(tempInput);
        }
      }
    }
    
    // Handle download
    function handleDownload(cid) {
      showSuccess('Download feature not implemented in demo');
    }
    
    // Handle add entry modal
    function handleAddEntry() {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h3>Add New Content Index Entry</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <form id="add-entry-form">
              <div class="form-group">
                <label for="entry-cid">CID (required)</label>
                <input type="text" id="entry-cid" required placeholder="bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi">
              </div>
              <div class="form-group">
                <label for="entry-path">Path</label>
                <input type="text" id="entry-path" placeholder="/datasets/common_voice/en/train.parquet">
              </div>
              <div class="form-group">
                <label for="entry-mimetype">MIME Type</label>
                <input type="text" id="entry-mimetype" placeholder="application/octet-stream">
              </div>
              <div class="form-group">
                <label for="entry-size">Size (bytes)</label>
                <input type="number" id="entry-size" placeholder="1024">
              </div>
              <div class="form-group">
                <label for="entry-locations">Storage Locations (JSON)</label>
                <textarea id="entry-locations" rows="5" placeholder='{
  "ipfs": ["https://ipfs.io", "https://dweb.link"],
  "huggingface": {
    "repo_id": "username/repo",
    "path": "file.bin",
    "revision": "main"
  }
}'></textarea>
              </div>
              <div class="form-group">
                <label for="entry-metadata">Custom Metadata (JSON)</label>
                <textarea id="entry-metadata" rows="5" placeholder='{
  "description": "My dataset",
  "tags": ["audio", "speech"],
  "language": "en"
}'></textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button id="modal-cancel" class="secondary-btn">Cancel</button>
            <button id="modal-submit" class="primary-btn">Add Entry</button>
          </div>
        </div>
      \`;
      
      document.body.appendChild(modal);
      
      // Add event listeners
      const closeButton = modal.querySelector('.modal-close');
      const cancelButton = document.getElementById('modal-cancel');
      const submitButton = document.getElementById('modal-submit');
      const form = document.getElementById('add-entry-form');
      
      const closeModal = () => {
        document.body.removeChild(modal);
      };
      
      if (closeButton) closeButton.addEventListener('click', closeModal);
      if (cancelButton) cancelButton.addEventListener('click', closeModal);
      
      if (submitButton && form) {
        submitButton.addEventListener('click', () => {
          // Get form values
          const cid = document.getElementById('entry-cid')?.value?.trim();
          const path = document.getElementById('entry-path')?.value?.trim();
          const mimetype = document.getElementById('entry-mimetype')?.value?.trim();
          const sizeStr = document.getElementById('entry-size')?.value?.trim();
          const locationsJson = document.getElementById('entry-locations')?.value?.trim();
          const metadataJson = document.getElementById('entry-metadata')?.value?.trim();
          
          // Validate CID
          if (!cid) {
            showError('CID is required', new Error('Missing required field'));
            return;
          }
          
          try {
            // Parse JSON fields
            const entry = {
              cid,
              path: path || null,
              mimetype: mimetype || null,
              size: sizeStr ? parseInt(sizeStr, 10) : null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            
            // Add locations if provided
            if (locationsJson) {
              try {
                entry.locations = JSON.parse(locationsJson);
              } catch (jsonError) {
                showError('Invalid JSON in locations field', jsonError);
                return;
              }
            }
            
            // Add metadata if provided
            if (metadataJson) {
              try {
                entry.metadata = JSON.parse(metadataJson);
              } catch (jsonError) {
                showError('Invalid JSON in metadata field', jsonError);
                return;
              }
            }
            
            // Add the entry
            addEntry(entry);
            closeModal();
          } catch (error) {
            console.error('Failed to add entry:', error);
            showError('Failed to add entry', error);
          }
        });
      }
    }
    
    // Handle delete entry
    function handleDeleteEntry(cid) {
      if (!cid) return;
      
      // Confirm deletion
      const confirmModal = document.createElement('div');
      confirmModal.className = 'modal';
      confirmModal.innerHTML = \`
        <div class="modal-content">
          <div class="modal-header">
            <h3>Confirm Deletion</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete the entry with CID:</p>
            <code>\${cid}</code>
            <p>This action cannot be undone.</p>
          </div>
          <div class="modal-footer">
            <button id="modal-cancel" class="secondary-btn">Cancel</button>
            <button id="modal-confirm" class="danger-btn">Delete</button>
          </div>
        </div>
      \`;
      
      document.body.appendChild(confirmModal);
      
      // Add event listeners
      const closeButton = confirmModal.querySelector('.modal-close');
      const cancelButton = document.getElementById('modal-cancel');
      const confirmButton = document.getElementById('modal-confirm');
      
      const closeModal = () => {
        document.body.removeChild(confirmModal);
      };
      
      if (closeButton) closeButton.addEventListener('click', closeModal);
      if (cancelButton) cancelButton.addEventListener('click', closeModal);
      
      if (confirmButton) {
        confirmButton.addEventListener('click', () => {
          deleteEntry(cid);
          closeModal();
        });
      }
    }
    
    // Handle export index
    function handleExportIndex() {
      exportIndex({
        includeTimestamp: true
      });
    }
    
    // Handle import index
    function handleImportIndex() {
      showSuccess('Import feature not fully implemented in demo');
      importIndex({
        merge: true
      });
    }
    
    // Show an error message
    function showError(message, error) {
      console.error(message, error);
      
      const errorElem = document.createElement('div');
      errorElem.className = 'error-notification';
      errorElem.innerHTML = \`
        <span class="error-icon"><i class="fa fa-exclamation-triangle"></i></span>
        <span class="error-message">\${message}</span>
        <button class="error-close"><i class="fa fa-times"></i></button>
      \`;
      
      document.body.appendChild(errorElem);
      
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        if (errorElem.parentNode) {
          errorElem.parentNode.removeChild(errorElem);
        }
      }, 5000);
      
      // Add event listener for close button
      const closeBtn = errorElem.querySelector('.error-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          errorElem.parentNode.removeChild(errorElem);
        });
      }
    }
    
    // Show a success notification
    function showSuccess(message) {
      const successElem = document.createElement('div');
      successElem.className = 'success-notification';
      successElem.innerHTML = \`
        <span class="success-icon"><i class="fa fa-check-circle"></i></span>
        <span class="success-message">\${message}</span>
        <button class="success-close"><i class="fa fa-times"></i></button>
      \`;
      
      document.body.appendChild(successElem);
      
      // Auto-dismiss after 3 seconds
      setTimeout(() => {
        if (successElem.parentNode) {
          successElem.parentNode.removeChild(successElem);
        }
      }, 3000);
      
      // Add event listener for close button
      const closeBtn = successElem.querySelector('.success-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          successElem.parentNode.removeChild(successElem);
        });
      }
    }
    
    // Format file size
    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      
      return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Shorten CID
    function shortenCid(cid) {
      if (!cid) return '';
      if (cid.length <= 16) return cid;
      
      return cid.substring(0, 8) + '...' + cid.substring(cid.length - 8);
    }
    
    // Get type icon
    function getTypeIcon(mimetype) {
      if (!mimetype) return 'fa fa-file-o';
      
      const type = mimetype.split('/')[0];
      const subtype = mimetype.split('/')[1];
      
      switch (type) {
        case 'image':
          return 'fa fa-file-image-o';
        case 'video':
          return 'fa fa-file-video-o';
        case 'audio':
          return 'fa fa-file-audio-o';
        case 'text':
          if (subtype === 'csv') return 'fa fa-file-excel-o';
          if (subtype === 'html') return 'fa fa-file-code-o';
          return 'fa fa-file-text-o';
        case 'application':
          if (subtype === 'pdf') return 'fa fa-file-pdf-o';
          if (subtype === 'json') return 'fa fa-file-code-o';
          if (subtype.includes('javascript')) return 'fa fa-file-code-o';
          if (subtype.includes('zip') || subtype.includes('compressed')) return 'fa fa-file-archive-o';
          return 'fa fa-file-o';
        default:
          return 'fa fa-file-o';
      }
    }
    
    // Render the dashboard
    function renderDashboard() {
      const container = document.getElementById('dashboard-container');
      if (!container) return;
      
      // Clear container
      container.innerHTML = '';
      
      // Create dashboard
      const dashboard = document.createElement('div');
      dashboard.className = 'pyarrow-content-index-dashboard';
      
      // Header
      const header = document.createElement('div');
      header.className = 'dashboard-header';
      header.innerHTML = \`
        <h2>PyArrow Content Index</h2>
        <div class="dashboard-stats">
          <span class="stat">Total Entries: <strong>\${totalEntries}</strong></span>
          <span class="stat">Last Update: <strong>\${new Date().toLocaleString()}</strong></span>
        </div>
      \`;
      dashboard.appendChild(header);
      
      // Controls
      const controls = document.createElement('div');
      controls.className = 'dashboard-controls';
      controls.innerHTML = \`
        <div class="search-box">
          <input type="text" id="content-index-search" 
            placeholder="Search by CID, path, or keywords..." 
            value="\${currentQuery}">
          <button id="content-index-search-btn"><i class="fa fa-search"></i></button>
        </div>
        <div class="filter-box">
          <select id="content-index-filter-type">
            <option value="">All Types</option>
            <option value="model">Models</option>
            <option value="dataset">Datasets</option>
            <option value="embedding">Embeddings</option>
            <option value="document">Documents</option>
            <option value="image">Images</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
          </select>
          <select id="content-index-sort">
            <option value="updated_at-desc">Latest Updates</option>
            <option value="created_at-desc">Newest First</option>
            <option value="created_at-asc">Oldest First</option>
            <option value="size-desc">Largest Size</option>
            <option value="size-asc">Smallest Size</option>
          </select>
          <button id="content-index-filter-btn">Apply Filters</button>
          <button id="content-index-refresh-btn"><i class="fa fa-refresh"></i></button>
        </div>
      \`;
      dashboard.appendChild(controls);
      
      // Main content
      let mainContent;
      if (loading) {
        mainContent = document.createElement('div');
        mainContent.className = 'loading-spinner';
        mainContent.innerHTML = '<div class="spinner"></div><p>Loading content index data...</p>';
      } else if (viewMode === 'list') {
        mainContent = renderList();
      } else if (viewMode === 'detail' && selectedEntry) {
        mainContent = renderDetail();
      } else {
        mainContent = document.createElement('div');
        mainContent.className = 'content-list-container';
        mainContent.innerHTML = '<p>No content to display</p>';
      }
      dashboard.appendChild(mainContent);
      
      // Footer
      const footer = document.createElement('div');
      footer.className = 'dashboard-footer';
      footer.innerHTML = \`
        <button id="content-index-add-btn" class="primary-btn">
          <i class="fa fa-plus"></i> Add New Entry
        </button>
        <button id="content-index-export-btn">
          <i class="fa fa-download"></i> Export Index
        </button>
        <button id="content-index-import-btn">
          <i class="fa fa-upload"></i> Import Index
        </button>
      \`;
      dashboard.appendChild(footer);
      
      // Add to container
      container.appendChild(dashboard);
      
      // Add event listeners
      setupEventListeners();
    }
    
    // Render the list view
    function renderList() {
      const listContainer = document.createElement('div');
      listContainer.className = 'content-list-container';
      
      if (entries.length === 0) {
        listContainer.innerHTML = \`
          <div class="empty-state">
            <p>No content index entries found.</p>
            <button id="content-index-add-btn">Add New Entry</button>
          </div>
        \`;
        return listContainer;
      }
      
      // Create table
      const table = document.createElement('table');
      table.className = 'content-list-table';
      table.innerHTML = \`
        <thead>
          <tr>
            <th>Type</th>
            <th>Path</th>
            <th>CID</th>
            <th>Size</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          \${entries.map((entry, index) => {
            const size = entry.size ? formatSize(entry.size) : 'N/A';
            const updated = entry.updated_at ? new Date(entry.updated_at).toLocaleString() : 'N/A';
            const typeIcon = getTypeIcon(entry.mimetype);
            
            return \`
              <tr data-index="\${index}">
                <td><i class="\${typeIcon}"></i> \${entry.mimetype?.split('/')[0] || 'Unknown'}</td>
                <td>\${entry.path || 'N/A'}</td>
                <td><span class="cid-display" title="\${entry.cid}">\${shortenCid(entry.cid)}</span></td>
                <td>\${size}</td>
                <td>\${updated}</td>
                <td>
                  <button class="view-btn" data-index="\${index}" title="View Details"><i class="fa fa-eye"></i></button>
                  <button class="copy-btn" data-cid="\${entry.cid}" title="Copy CID"><i class="fa fa-copy"></i></button>
                  <button class="download-btn" data-cid="\${entry.cid}" title="Download"><i class="fa fa-download"></i></button>
                </td>
              </tr>
            \`;
          }).join('')}
        </tbody>
      \`;
      listContainer.appendChild(table);
      
      // Add pagination if needed
      if (totalEntries > config.pageSize) {
        const totalPages = Math.ceil(totalEntries / config.pageSize);
        const pagination = document.createElement('div');
        pagination.className = 'pagination';
        pagination.innerHTML = \`
          <button id="prev-page-btn" \${currentPage === 1 ? 'disabled' : ''}>Previous</button>
          <span>Page \${currentPage} of \${totalPages}</span>
          <button id="next-page-btn" \${currentPage === totalPages ? 'disabled' : ''}>Next</button>
        \`;
        listContainer.appendChild(pagination);
      }
      
      return listContainer;
    }
    
    // Render the detail view
    function renderDetail() {
      const detailContainer = document.createElement('div');
      detailContainer.className = 'content-detail-container';
      
      if (!selectedEntry) {
        return detailContainer;
      }
      
      // Back button
      const backBtn = document.createElement('button');
      backBtn.className = 'back-btn';
      backBtn.innerHTML = '<i class="fa fa-arrow-left"></i> Back to List';
      backBtn.addEventListener('click', () => {
        viewMode = 'list';
        selectedEntry = null;
        renderDashboard();
      });
      detailContainer.appendChild(backBtn);
      
      // Entry header
      const header = document.createElement('div');
      header.className = 'detail-header';
      const typeIcon = getTypeIcon(selectedEntry.mimetype);
      header.innerHTML = \`
        <h3><i class="\${typeIcon}"></i> \${selectedEntry.path || 'Unnamed Content'}</h3>
        <div class="detail-actions">
          <button id="detail-copy-btn" title="Copy CID"><i class="fa fa-copy"></i> Copy CID</button>
          <button id="detail-download-btn" title="Download"><i class="fa fa-download"></i> Download</button>
          <button id="detail-delete-btn" title="Delete" class="danger-btn"><i class="fa fa-trash"></i> Delete</button>
        </div>
      \`;
      detailContainer.appendChild(header);
      
      // Entry details
      const details = document.createElement('div');
      details.className = 'detail-content';
      
      // Basic info
      const basicInfo = document.createElement('div');
      basicInfo.className = 'detail-section';
      basicInfo.innerHTML = \`
        <h4>Basic Information</h4>
        <table class="detail-table">
          <tr>
            <th>CID</th>
            <td><code>\${selectedEntry.cid}</code></td>
          </tr>
          <tr>
            <th>Path</th>
            <td>\${selectedEntry.path || 'N/A'}</td>
          </tr>
          <tr>
            <th>MIME Type</th>
            <td>\${selectedEntry.mimetype || 'Unknown'}</td>
          </tr>
          <tr>
            <th>Size</th>
            <td>\${selectedEntry.size ? formatSize(selectedEntry.size) : 'N/A'}</td>
          </tr>
          <tr>
            <th>Created</th>
            <td>\${selectedEntry.created_at ? new Date(selectedEntry.created_at).toLocaleString() : 'N/A'}</td>
          </tr>
          <tr>
            <th>Updated</th>
            <td>\${selectedEntry.updated_at ? new Date(selectedEntry.updated_at).toLocaleString() : 'N/A'}</td>
          </tr>
        </table>
      \`;
      details.appendChild(basicInfo);
      
      // Storage locations
      if (selectedEntry.locations) {
        let locationsHtml = '<h4>Storage Locations</h4><table class="detail-table">';
        
        // Filecoin
        if (selectedEntry.locations.filecoin?.length) {
          locationsHtml += \`
            <tr>
              <th>Filecoin</th>
              <td>
                <ul>
                  \${selectedEntry.locations.filecoin.map(loc => \`<li>\${loc}</li>\`).join('')}
                </ul>
              </td>
            </tr>
          \`;
        }
        
        // Storacha
        if (selectedEntry.locations.storacha) {
          locationsHtml += \`
            <tr>
              <th>Storacha W3UP</th>
              <td>\${selectedEntry.locations.storacha}</td>
            </tr>
          \`;
        }
        
        // libp2p
        if (selectedEntry.locations.libp2p?.length) {
          locationsHtml += \`
            <tr>
              <th>libp2p Peers</th>
              <td>
                <ul>
                  \${selectedEntry.locations.libp2p.map(loc => \`<li>\${loc}</li>\`).join('')}
                </ul>
              </td>
            </tr>
          \`;
        }
        
        // IPFS
        if (selectedEntry.locations.ipfs?.length) {
          locationsHtml += \`
            <tr>
              <th>IPFS Gateways</th>
              <td>
                <ul>
                  \${selectedEntry.locations.ipfs.map(loc => \`<li><a href="\${loc}/ipfs/\${selectedEntry.cid}" target="_blank">\${loc}</a></li>\`).join('')}
                </ul>
              </td>
            </tr>
          \`;
        }
        
        // IPFS Cluster
        if (selectedEntry.locations.ipfs_cluster?.length) {
          locationsHtml += \`
            <tr>
              <th>IPFS Cluster</th>
              <td>
                <ul>
                  \${selectedEntry.locations.ipfs_cluster.map(loc => \`<li>\${loc}</li>\`).join('')}
                </ul>
              </td>
            </tr>
          \`;
        }
        
        // S3
        if (selectedEntry.locations.s3?.bucket) {
          locationsHtml += \`
            <tr>
              <th>S3</th>
              <td>
                <table class="nested-table">
                  <tr><th>Bucket</th><td>\${selectedEntry.locations.s3.bucket}</td></tr>
                  <tr><th>Key</th><td>\${selectedEntry.locations.s3.key}</td></tr>
                  <tr><th>Region</th><td>\${selectedEntry.locations.s3.region || 'N/A'}</td></tr>
                  <tr><th>Endpoint</th><td>\${selectedEntry.locations.s3.endpoint || 'N/A'}</td></tr>
                </table>
              </td>
            </tr>
          \`;
        }
        
        // Hugging Face
        if (selectedEntry.locations.huggingface?.repo_id) {
          locationsHtml += \`
            <tr>
              <th>Hugging Face</th>
              <td>
                <table class="nested-table">
                  <tr><th>Repository</th><td>\${selectedEntry.locations.huggingface.repo_id}</td></tr>
                  <tr><th>Path</th><td>\${selectedEntry.locations.huggingface.path}</td></tr>
                  <tr><th>Revision</th><td>\${selectedEntry.locations.huggingface.revision || 'main'}</td></tr>
                </table>
              </td>
            </tr>
          \`;
        }
        
        locationsHtml += '</table>';
        
        const locationsInfo = document.createElement('div');
        locationsInfo.className = 'detail-section';
        locationsInfo.innerHTML = locationsHtml;
        details.appendChild(locationsInfo);
      }
      
      // Custom metadata
      if (selectedEntry.metadata) {
        const metadataSection = document.createElement('div');
        metadataSection.className = 'detail-section';
        metadataSection.innerHTML = '<h4>Custom Metadata</h4><table class="detail-table">';
        
        for (const [key, value] of Object.entries(selectedEntry.metadata)) {
          metadataSection.innerHTML += \`
            <tr>
              <th>\${key}</th>
              <td>\${typeof value === 'object' ? '<pre>' + JSON.stringify(value, null, 2) + '</pre>' : value}</td>
            </tr>
          \`;
        }
        
        metadataSection.innerHTML += '</table>';
        details.appendChild(metadataSection);
      }
      
      detailContainer.appendChild(details);
      return detailContainer;
    }
    
    // Set up event listeners for the dashboard
    function setupEventListeners() {
      // Search input
      const searchInput = document.getElementById('content-index-search');
      if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
          if (e.key === 'Enter') handleSearch();
        });
      }
      
      // Search button
      const searchBtn = document.getElementById('content-index-search-btn');
      if (searchBtn) {
        searchBtn.addEventListener('click', () => handleSearch());
      }
      
      // Filter button
      const filterBtn = document.getElementById('content-index-filter-btn');
      if (filterBtn) {
        filterBtn.addEventListener('click', () => handleFilterChange());
      }
      
      // Refresh button
      const refreshBtn = document.getElementById('content-index-refresh-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadData());
      }
      
      // Add button
      const addBtn = document.getElementById('content-index-add-btn');
      if (addBtn) {
        addBtn.addEventListener('click', () => handleAddEntry());
      }
      
      // Export button
      const exportBtn = document.getElementById('content-index-export-btn');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => handleExportIndex());
      }
      
      // Import button
      const importBtn = document.getElementById('content-index-import-btn');
      if (importBtn) {
        importBtn.addEventListener('click', () => handleImportIndex());
      }
      
      // Pagination buttons
      const prevBtn = document.getElementById('prev-page-btn');
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (currentPage > 1) {
            currentPage--;
            loadData();
          }
        });
      }
      
      const nextBtn = document.getElementById('next-page-btn');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          currentPage++;
          loadData();
        });
      }
      
      // View buttons
      const viewButtons = document.querySelectorAll('.view-btn');
      viewButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.currentTarget.dataset.index, 10);
          viewEntry(index);
        });
      });
      
      // Copy buttons
      const copyButtons = document.querySelectorAll('.copy-btn');
      copyButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const cid = e.currentTarget.dataset.cid;
          handleCopyCid(cid);
        });
      });
      
      // Download buttons
      const downloadButtons = document.querySelectorAll('.download-btn');
      downloadButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const cid = e.currentTarget.dataset.cid;
          handleDownload(cid);
        });
      });
      
      // Detail view buttons
      if (viewMode === 'detail') {
        const detailCopyBtn = document.getElementById('detail-copy-btn');
        if (detailCopyBtn) {
          detailCopyBtn.addEventListener('click', () => {
            handleCopyCid(selectedEntry.cid);
          });
        }
        
        const detailDownloadBtn = document.getElementById('detail-download-btn');
        if (detailDownloadBtn) {
          detailDownloadBtn.addEventListener('click', () => {
            handleDownload(selectedEntry.cid);
          });
        }
        
        const detailDeleteBtn = document.getElementById('detail-delete-btn');
        if (detailDeleteBtn) {
          detailDeleteBtn.addEventListener('click', () => {
            handleDeleteEntry(selectedEntry.cid);
          });
        }
      }
    }
    
    // Initialize when the window loads
    window.addEventListener('DOMContentLoaded', () => {
      renderDashboard();
    });
  </script>
</body>
</html>
`;
    
    // Write the HTML file
    fs.writeFileSync(htmlPath, htmlContent);
  }
  
  /**
   * Close the dashboard
   */
  closeDashboard() {
    if (this.window) {
      this.window.close();
      this.window = null;
    }
    
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }
  
  /**
   * Refresh data from the content index
   */
  refreshData() {
    if (!this.window) return;
    
    try {
      // Perform search to refresh data
      this._doSearch({}).then(result => {
        this.window.webContents.send('content-index-search-result', result);
      }).catch(error => {
        console.error('Error refreshing data:', error);
      });
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }
}

module.exports = PyArrowContentIndexDashboard;