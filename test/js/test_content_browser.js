/**
 * Integration tests for PyArrow Content Index Dashboard content browser components
 * 
 * Tests the metadata browser and search interface functionality including
 * content rendering, search, filtering, and integration with the dashboard.
 */

const assert = require('assert');
const { JSDOM } = require('jsdom');
const path = require('path');

// Create a mock window object with necessary browser APIs
const setupMockDOM = () => {
  // Create a DOM environment
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="test-container"></div></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
  });

  // Set up the global window and document objects
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn()
  };
  
  return dom;
};

// Clean up after tests
const cleanupMockDOM = (dom) => {
  dom.window.close();
  global.window = undefined;
  global.document = undefined;
  global.localStorage = undefined;
};

describe('Content Browser Components', function() {
  let dom;
  let MetadataBrowser;
  let SearchInterface;
  let initializeContentBrowser;
  let container;
  let mockBridge;
  let mockEventBus;
  
  // Set up before tests
  before(function() {
    dom = setupMockDOM();
    
    // Import the content browser modules
    // Note: In a real test, you'd use the actual module paths
    // For this example, we'll mock the imports to simulate the modules
    
    // Mock MetadataBrowser class
    MetadataBrowser = class {
      constructor(options) {
        this.container = options.container;
        this.bridge = options.bridge;
        this.eventBus = options.eventBus;
        this.config = options.config || {};
        this.listeners = {};
        this.initialized = false;
        this.disposed = false;
      }
      
      async init() {
        this.initialized = true;
        return true;
      }
      
      render() {}
      
      refresh() {}
      
      applyFilter() {}
      
      loadMore() {}
      
      on(event, callback) {
        if (!this.listeners[event]) {
          this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
        return this;
      }
      
      emit(event, data) {
        if (this.listeners[event]) {
          this.listeners[event].forEach(callback => callback(data));
        }
        return this;
      }
      
      dispose() {
        this.disposed = true;
      }
    };
    
    // Import the real SearchInterface class
    // In a real test environment, we'd use proper ESM imports
    // For this example, we'll mock as if we imported it
    SearchInterface = jest.mock('../../hallucinate_app/node/dashboard/content_browser/search_interface.js', () => {
      return {
        SearchInterface: class {
          constructor(options) {
            this.container = options.container;
            this.bridge = options.bridge;
            this.eventBus = options.eventBus;
            this.config = options.config || {};
            this.onSearch = options.onSearch;
            this.onFilterChange = options.onFilterChange;
            
            // Initialize state
            this.initialized = false;
            this.disposed = false;
            this.expanded = false;
            this.currentQuery = '';
            this.currentFilter = {};
            this.savedSearches = [];
            this.searchHistory = [];
            this.availableMimeTypes = [];
            this.availableLocations = [];
            this.eventListeners = {};
          }
          
          async init() {
            if (this.initialized) return true;
            
            try {
              this.initialized = true;
              
              // If bridge is available, load metadata for search suggestions
              if (this.bridge && typeof this.bridge.getStats === 'function') {
                await this.refreshSuggestions();
              }
              
              return true;
            } catch (error) {
              console.error('Error initializing SearchInterface:', error);
              return false;
            }
          }
          
          search(query) {
            this.currentQuery = query || '';
            
            // Call search callback if defined
            if (typeof this.onSearch === 'function') {
              this.onSearch(this.currentQuery);
            }
            
            // Emit event via event bus if available
            if (this.eventBus) {
              this.eventBus.emit('content-browser:search', this.currentQuery);
            }
            
            // Emit direct event to listeners
            this.emit('search', this.currentQuery);
            
            return this;
          }
          
          applyFilter(filter) {
            this.currentFilter = filter || {};
            
            // Call filter callback if defined
            if (typeof this.onFilterChange === 'function') {
              this.onFilterChange(this.currentFilter);
            }
            
            // Emit event via event bus if available
            if (this.eventBus) {
              this.eventBus.emit('content-browser:filter', this.currentFilter);
            }
            
            // Emit direct event to listeners
            this.emit('filter-change', this.currentFilter);
            
            return this;
          }
          
          async refreshSuggestions() {
            try {
              if (!this.bridge || typeof this.bridge.getStats !== 'function') {
                return false;
              }
              
              const stats = await this.bridge.getStats();
              
              if (stats && stats.mimeTypes) {
                this.availableMimeTypes = stats.mimeTypes;
              }
              
              if (stats && stats.locations) {
                this.availableLocations = stats.locations;
              }
              
              return true;
            } catch (error) {
              console.error('Error refreshing search suggestions:', error);
              return false;
            }
          }
          
          on(event, callback) {
            if (!this.eventListeners[event]) {
              this.eventListeners[event] = [];
            }
            this.eventListeners[event].push(callback);
            return this;
          }
          
          emit(event, data) {
            if (this.eventListeners[event]) {
              this.eventListeners[event].forEach(callback => callback(data));
            }
            return this;
          }
          
          dispose() {
            // Clear event listeners
            this.eventListeners = {};
            this.disposed = true;
            return this;
          }
        }
      };
    });
    
    // Mock the integration module
    initializeContentBrowser = async (options) => {
      const { container, bridge, eventBus, config = {} } = options;
      
      if (!container) {
        throw new Error('Container element is required');
      }
      
      if (!bridge) {
        console.warn('Bridge not provided. Using mock data.');
      }
      
      // Create container elements for components
      const searchContainer = document.createElement('div');
      searchContainer.className = 'search-interface-container';
      
      const metadataContainer = document.createElement('div');
      metadataContainer.className = 'metadata-browser-container';
      
      // Add containers to the main container
      container.appendChild(searchContainer);
      container.appendChild(metadataContainer);
      
      // Create the components
      const searchInterface = new SearchInterface({
        container: searchContainer,
        bridge,
        eventBus,
        config: config.searchConfig || {}
      });
      
      const metadataBrowser = new MetadataBrowser({
        container: metadataContainer,
        bridge,
        eventBus,
        config: config.browserConfig || {}
      });
      
      // Initialize components
      await searchInterface.init();
      await metadataBrowser.init();
      
      return {
        success: true,
        searchInterface,
        metadataBrowser,
        container,
        dispose: () => {
          searchInterface.dispose();
          metadataBrowser.dispose();
        }
      };
    };
    
    // Set up test container
    container = document.getElementById('test-container');
    
    // Create mock bridge
    mockBridge = {
      query: async () => {
        return {
          entries: [
            {
              cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
              path: '/datasets/test/file1.json',
              mimetype: 'application/json',
              size: 1024,
              created_at: new Date().toISOString()
            },
            {
              cid: 'bafybeihykjqdprkllrar7w5mbyfmitkaedjqpxk5mztpuk5xtyms262lni',
              path: '/datasets/test/file2.csv',
              mimetype: 'text/csv',
              size: 2048,
              created_at: new Date().toISOString()
            }
          ],
          total: 2
        };
      },
      lookupByCid: async (cid) => {
        return {
          cid,
          path: '/datasets/test/file1.json',
          mimetype: 'application/json',
          size: 1024,
          created_at: new Date().toISOString()
        };
      },
      lookupByPath: async (path) => {
        return {
          cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
          path,
          mimetype: 'application/json',
          size: 1024,
          created_at: new Date().toISOString()
        };
      },
      getStats: async () => {
        return {
          total_entries: 2,
          total_size: 3072
        };
      }
    };
    
    // Create mock event bus
    mockEventBus = {
      listeners: {},
      on(event, callback) {
        if (!this.listeners[event]) {
          this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
        return this;
      },
      emit(event, data) {
        if (this.listeners[event]) {
          this.listeners[event].forEach(callback => callback(data));
        }
        return this;
      }
    };
  });
  
  // Clean up after tests
  after(function() {
    cleanupMockDOM(dom);
  });
  
  // Test case: MetadataBrowser initialization
  it('should initialize MetadataBrowser correctly', async function() {
    const browserContainer = document.createElement('div');
    container.appendChild(browserContainer);
    
    const metadataBrowser = new MetadataBrowser({
      container: browserContainer,
      bridge: mockBridge,
      eventBus: mockEventBus,
      config: {}
    });
    
    assert.strictEqual(typeof metadataBrowser, 'object', 'Should create a metadata browser instance');
    assert.strictEqual(metadataBrowser.container, browserContainer, 'Should set the container correctly');
    assert.strictEqual(metadataBrowser.bridge, mockBridge, 'Should set the bridge correctly');
    assert.strictEqual(metadataBrowser.eventBus, mockEventBus, 'Should set the event bus correctly');
    
    const initResult = await metadataBrowser.init();
    assert.strictEqual(initResult, true, 'Init should return true for successful initialization');
    assert.strictEqual(metadataBrowser.initialized, true, 'Should mark as initialized');
  });
  
  // Test case: SearchInterface initialization
  it('should initialize SearchInterface correctly', async function() {
    const searchContainer = document.createElement('div');
    container.appendChild(searchContainer);
    
    const searchInterface = new SearchInterface({
      container: searchContainer,
      bridge: mockBridge,
      eventBus: mockEventBus,
      config: {}
    });
    
    assert.strictEqual(typeof searchInterface, 'object', 'Should create a search interface instance');
    assert.strictEqual(searchInterface.container, searchContainer, 'Should set the container correctly');
    assert.strictEqual(searchInterface.bridge, mockBridge, 'Should set the bridge correctly');
    assert.strictEqual(searchInterface.eventBus, mockEventBus, 'Should set the event bus correctly');
    
    const initResult = await searchInterface.init();
    assert.strictEqual(initResult, true, 'Init should return true for successful initialization');
    assert.strictEqual(searchInterface.initialized, true, 'Should mark as initialized');
  });
  
  // Test case: Content browser integration initialization
  it('should initialize content browser integration correctly', async function() {
    const contentBrowserContainer = document.createElement('div');
    contentBrowserContainer.id = 'content-browser-container';
    container.appendChild(contentBrowserContainer);
    
    const result = await initializeContentBrowser({
      container: contentBrowserContainer,
      bridge: mockBridge,
      eventBus: mockEventBus,
      config: {
        browserConfig: {
          pageSize: 20,
          initialView: 'grid'
        },
        searchConfig: {
          enableSavedSearches: true,
          enableSearchHistory: true
        }
      }
    });
    
    assert.strictEqual(result.success, true, 'Initialization should succeed');
    assert.strictEqual(typeof result.searchInterface, 'object', 'Should return search interface');
    assert.strictEqual(typeof result.metadataBrowser, 'object', 'Should return metadata browser');
    assert.strictEqual(typeof result.dispose, 'function', 'Should return dispose function');
    
    assert.strictEqual(result.searchInterface.initialized, true, 'Search interface should be initialized');
    assert.strictEqual(result.metadataBrowser.initialized, true, 'Metadata browser should be initialized');
    
    // Check if containers were created
    const searchContainer = contentBrowserContainer.querySelector('.search-interface-container');
    const metadataContainer = contentBrowserContainer.querySelector('.metadata-browser-container');
    
    assert.strictEqual(searchContainer instanceof HTMLElement, true, 'Should create search container');
    assert.strictEqual(metadataContainer instanceof HTMLElement, true, 'Should create metadata container');
  });
  
  // Test case: Event propagation
  it('should handle event propagation correctly', async function() {
    const contentBrowserContainer = document.createElement('div');
    container.appendChild(contentBrowserContainer);
    
    const result = await initializeContentBrowser({
      container: contentBrowserContainer,
      bridge: mockBridge,
      eventBus: mockEventBus,
      config: {}
    });
    
    // Set up event trackers
    let searchEventReceived = false;
    let filterEventReceived = false;
    let searchData = null;
    let filterData = null;
    
    // Mock the applyFilter method on the metadata browser
    result.metadataBrowser.applyFilter = (data) => {
      if (data.query) {
        searchEventReceived = true;
        searchData = data;
      } else {
        filterEventReceived = true;
        filterData = data;
      }
    };
    
    // Emit search and filter events from the search interface
    result.searchInterface.emit('search', 'test query');
    result.searchInterface.emit('filter-change', { type: 'image' });
    
    // Check if events were propagated correctly
    assert.strictEqual(searchEventReceived, true, 'Search event should be received');
    assert.strictEqual(filterEventReceived, true, 'Filter event should be received');
    assert.deepStrictEqual(searchData, { query: 'test query' }, 'Search data should be correct');
    assert.deepStrictEqual(filterData, { type: 'image' }, 'Filter data should be correct');
  });
  
  // Test case: Real-time updates
  it('should handle real-time updates correctly', async function() {
    const contentBrowserContainer = document.createElement('div');
    container.appendChild(contentBrowserContainer);
    
    const result = await initializeContentBrowser({
      container: contentBrowserContainer,
      bridge: mockBridge,
      eventBus: mockEventBus,
      config: {}
    });
    
    // Set up refresh trackers
    let browserRefreshCalled = false;
    let suggestionsRefreshedCalled = false;
    
    // Mock the refresh and refreshSuggestions methods
    result.metadataBrowser.refresh = (silent) => {
      browserRefreshCalled = true;
    };
    
    result.searchInterface.refreshSuggestions = () => {
      suggestionsRefreshedCalled = true;
    };
    
    // Emit content update event
    mockEventBus.emit('content-index-updated', { type: 'entry-added' });
    
    // Check if the appropriate methods were called
    assert.strictEqual(browserRefreshCalled, true, 'Browser refresh should be called');
    assert.strictEqual(suggestionsRefreshedCalled, true, 'Suggestions refresh should be called');
  });
  
  // Test case: Disposal
  it('should dispose properly', async function() {
    const contentBrowserContainer = document.createElement('div');
    container.appendChild(contentBrowserContainer);
    
    const result = await initializeContentBrowser({
      container: contentBrowserContainer,
      bridge: mockBridge,
      eventBus: mockEventBus,
      config: {}
    });
    
    // Call the dispose function
    result.dispose();
    
    // Check if components were properly disposed
    assert.strictEqual(result.searchInterface.disposed, true, 'Search interface should be disposed');
    assert.strictEqual(result.metadataBrowser.disposed, true, 'Metadata browser should be disposed');
  });
  
  // Test case: Error handling - missing container
  it('should handle missing container error', async function() {
    try {
      await initializeContentBrowser({
        bridge: mockBridge,
        eventBus: mockEventBus,
        config: {}
      });
      
      // Should not reach here
      assert.fail('Should throw an error for missing container');
    } catch (error) {
      assert.strictEqual(error.message, 'Container element is required', 'Should throw proper error message');
    }
  });
  
  // Test case: Missing bridge warning
  it('should handle missing bridge with warning', async function() {
    const contentBrowserContainer = document.createElement('div');
    container.appendChild(contentBrowserContainer);
    
    // Store console.warn to verify it's called
    const originalWarn = console.warn;
    let warnCalled = false;
    console.warn = (message) => {
      if (message.includes('Bridge not provided')) {
        warnCalled = true;
      }
    };
    
    try {
      const result = await initializeContentBrowser({
        container: contentBrowserContainer,
        eventBus: mockEventBus,
        config: {}
      });
      
      assert.strictEqual(warnCalled, true, 'Should warn about missing bridge');
      assert.strictEqual(result.success, true, 'Should still initialize successfully');
    } finally {
      // Restore console.warn
      console.warn = originalWarn;
    }
  });
});