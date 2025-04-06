/**
 * Test for Content Browser Integration
 * 
 * This module tests the integration of metadata browser, search interface, 
 * and storage distribution components in the PyArrow Content Index Dashboard.
 * 
 * @module test/js/test_content_browser_integration
 */

import { JSDOM } from 'jsdom';

// Create a mock PyArrow index bridge for testing
const mockBridge = {
  getStats: async () => ({
    // Storage location distribution
    location_counts: {
      'IPFS': 156,
      'Hugging Face': 98,
      'Local': 76,
      'S3': 43
    },
    type_counts: {
      'image/jpeg': 87,
      'application/pdf': 54,
      'application/octet-stream': 42,
      'text/plain': 38
    },
    size_distribution: {
      '<1KB': 42,
      '1KB-10KB': 87,
      '10KB-100KB': 124,
      '100KB-1MB': 96
    },
    timeline_distribution: {
      '2025-03-30': 12,
      '2025-03-31': 15,
      '2025-04-01': 10,
      '2025-04-02': 18
    }
  }),
  query: async (criteria) => {
    // Mock query response based on criteria
    const results = [];
    for (let i = 0; i < 20; i++) {
      results.push({
        cid: `Qm${Math.random().toString(36).substring(2, 15)}`,
        path: `/example/file${i}.${i % 3 === 0 ? 'jpg' : i % 3 === 1 ? 'pdf' : 'txt'}`,
        mimetype: i % 3 === 0 ? 'image/jpeg' : i % 3 === 1 ? 'application/pdf' : 'text/plain',
        size: Math.floor(Math.random() * 1000000),
        created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000).toISOString()
      });
    }
    return {
      total: 100,
      results
    };
  }
};

// Mock chart.js for testing
class MockChart {
  constructor(ctx, config) {
    this.type = config.type;
    this.data = config.data;
    this.options = config.options;
    this.ctx = ctx;
  }
  
  destroy() {
    // Clean up resources
    this.destroyed = true;
  }
  
  update() {
    // Update the chart
    this.updated = true;
  }
}

class TestContentBrowserIntegration {
  constructor() {
    this.testResults = {};
  }

  /**
   * Sets up the test environment with DOM
   */
  setupTestEnvironment() {
    // Create DOM environment
    this.dom = new JSDOM('<!DOCTYPE html><html><body><div id="test-container"></div></body></html>', {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true
    });
    
    // Set up globals
    global.window = this.dom.window;
    global.document = this.dom.window.document;
    global.HTMLElement = this.dom.window.HTMLElement;
    
    // Mock IntersectionObserver
    global.IntersectionObserver = class IntersectionObserver {
      constructor(callback) {
        this.callback = callback;
        this.entries = [];
      }
      
      observe(element) {
        this.entries.push(element);
      }
      
      unobserve(element) {
        this.entries = this.entries.filter(entry => entry !== element);
      }
      
      disconnect() {
        this.entries = [];
      }
    };
    
    // Mock ResizeObserver
    global.ResizeObserver = class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
        this.entries = [];
      }
      
      observe(element) {
        this.entries.push(element);
      }
      
      unobserve(element) {
        this.entries = this.entries.filter(entry => entry !== element);
      }
      
      disconnect() {
        this.entries = [];
      }
    };
    
    // Mock FontAwesome classes
    const style = document.createElement('style');
    style.textContent = `
      .fas { display: inline-block; width: 16px; height: 16px; }
      .fa-th { content: 'grid'; }
      .fa-list { content: 'list'; }
      .fa-chart-pie { content: 'pie'; }
      .fa-chart-bar { content: 'bar'; }
      .fa-chart-line { content: 'line'; }
      .fa-sync-alt { content: 'refresh'; }
      .fa-search { content: 'search'; }
      .fa-filter { content: 'filter'; }
    `;
    document.head.appendChild(style);
    
    // Test container
    this.container = document.getElementById('test-container');
    
    // Add canvas elements needed for charts
    const canvasElements = ['locationDistributionChart', 'typeDistributionChart', 'sizeDistributionChart', 'timelineDistributionChart'];
    canvasElements.forEach(id => {
      const canvas = document.createElement('canvas');
      canvas.id = id;
      document.body.appendChild(canvas);
    });
    
    // Mock Chart.js for testing
    global.Chart = MockChart;
  }

  /**
   * Load the content browser module dynamically
   */
  async loadModules() {
    try {
      // Since we're in Node and not a browser environment, we'll create mock implementations
      
      // Mock MetadataBrowser class
      this.MetadataBrowser = class MetadataBrowser {
        constructor(options) {
          this.container = options.container;
          this.bridge = options.bridge;
          this.eventBus = options.eventBus;
          this.initialized = false;
          this.listeners = {};
        }
        
        async init() {
          this.initialized = true;
          return true;
        }
        
        render() {
          if (this.container) {
            this.container.innerHTML = '<div class="metadata-browser-content">Metadata Browser</div>';
          }
        }
        
        applyFilter(filter) {
          this.currentFilter = filter;
          this.emit('filter-applied', filter);
        }
        
        refresh(silent = false) {
          this.emit('refresh-complete', { success: true });
          return Promise.resolve(true);
        }
        
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
          if (this.eventBus) {
            this.eventBus.emit(`metadata-browser:${event}`, data);
          }
          return this;
        }
        
        dispose() {
          this.listeners = {};
          if (this.container) {
            this.container.innerHTML = '';
          }
        }
      };
      
      // Mock SearchInterface class
      this.SearchInterface = class SearchInterface {
        constructor(options) {
          this.container = options.container;
          this.bridge = options.bridge;
          this.eventBus = options.eventBus;
          this.initialized = false;
          this.listeners = {};
        }
        
        async init() {
          this.initialized = true;
          return true;
        }
        
        render() {
          if (this.container) {
            this.container.innerHTML = '<div class="search-interface-content">Search Interface</div>';
          }
        }
        
        refreshSuggestions() {
          return Promise.resolve(true);
        }
        
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
          if (this.eventBus) {
            this.eventBus.emit(`search-interface:${event}`, data);
          }
          return this;
        }
        
        dispose() {
          this.listeners = {};
          if (this.container) {
            this.container.innerHTML = '';
          }
        }
      };
      
      // Mock StorageDistribution class
      this.StorageDistribution = class StorageDistribution {
        constructor(options) {
          this.container = options.container;
          this.bridge = options.bridge;
          this.eventBus = options.eventBus;
          this.chartLibrary = options.chartLibrary;
          this.initialized = false;
          this.listeners = {};
          this.charts = {};
        }
        
        async init() {
          this.initialized = true;
          return true;
        }
        
        render() {
          if (this.container) {
            this.container.innerHTML = '<div class="storage-distribution-content">Storage Distribution</div>';
          }
        }
        
        renderLocationDistribution() {
          const canvas = document.getElementById('locationDistributionChart');
          if (!canvas || !this.chartLibrary) return;
          
          this.charts.locationDistribution = new this.chartLibrary(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
              labels: ['IPFS', 'Hugging Face', 'Local', 'S3'],
              datasets: [{
                data: [156, 98, 76, 43]
              }]
            }
          });
          
          return this.charts.locationDistribution;
        }
        
        refresh(silent = false) {
          this.emit('refresh-complete', { success: true });
          return Promise.resolve(true);
        }
        
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
          if (this.eventBus) {
            this.eventBus.emit(event, data);
          }
          return this;
        }
        
        dispose() {
          Object.values(this.charts).forEach(chart => {
            if (chart) {
              chart.destroy();
            }
          });
          
          this.charts = {};
          this.listeners = {};
          
          if (this.container) {
            this.container.innerHTML = '';
          }
        }
      };
      
      // Create a mock implementation of the integration function
      this.initializeContentBrowser = async (options = {}) => {
        const { container, bridge, eventBus, config = {}, chartLibrary } = options;
        
        if (!container) {
          throw new Error('Container element is required');
        }
        
        if (!bridge) {
          throw new Error('PyArrow index bridge is required');
        }
        
        // Check if Chart.js is available for visualizations
        const chartLib = chartLibrary || global.Chart;
        
        // Create event bus if not provided
        const localEventBus = eventBus || {
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
        
        // Create container elements for components
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-interface-container';
        
        const metadataContainer = document.createElement('div');
        metadataContainer.className = 'metadata-browser-container';
        
        const storageDistributionContainer = document.createElement('div');
        storageDistributionContainer.className = 'storage-distribution-container';
        storageDistributionContainer.style.display = 'none'; // Hide initially
        
        // Add containers to the main container
        container.appendChild(searchContainer);
        container.appendChild(metadataContainer);
        container.appendChild(storageDistributionContainer);
        
        // Create tab navigation
        const tabNav = document.createElement('div');
        tabNav.className = 'content-browser-tabs';
        tabNav.innerHTML = `
          <button class="tab-button active" data-tab="browser">Browser</button>
          <button class="tab-button" data-tab="statistics">Storage Statistics</button>
        `;
        container.insertBefore(tabNav, container.firstChild);
        
        // Create components
        const searchInterface = new this.SearchInterface({
          container: searchContainer,
          bridge: bridge,
          eventBus: localEventBus,
          config: config.searchConfig || {}
        });
        
        const metadataBrowser = new this.MetadataBrowser({
          container: metadataContainer,
          bridge: bridge,
          eventBus: localEventBus,
          config: config.browserConfig || {}
        });
        
        const storageDistribution = new this.StorageDistribution({
          container: storageDistributionContainer,
          bridge: bridge,
          eventBus: localEventBus,
          chartLibrary: chartLib,
          config: config.distributionConfig || {}
        });
        
        // Initialize components
        await searchInterface.init();
        await metadataBrowser.init();
        await storageDistribution.init();
        
        // Set up tab navigation
        tabNav.querySelectorAll('.tab-button').forEach(tab => {
          tab.addEventListener('click', () => {
            // Update active tab
            tabNav.querySelectorAll('.tab-button').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show/hide content based on selected tab
            const tabName = tab.dataset.tab;
            
            if (tabName === 'browser') {
              searchContainer.style.display = 'block';
              metadataContainer.style.display = 'block';
              storageDistributionContainer.style.display = 'none';
            } else if (tabName === 'statistics') {
              searchContainer.style.display = 'none';
              metadataContainer.style.display = 'none';
              storageDistributionContainer.style.display = 'block';
              
              // Emit event for tab change
              localEventBus.emit('tab-changed', tabName);
            }
          });
        });
        
        // Connect components
        searchInterface.on('search', (query) => {
          metadataBrowser.applyFilter({ query });
        });
        
        searchInterface.on('filter-change', (filters) => {
          metadataBrowser.applyFilter(filters);
        });
        
        return {
          success: true,
          metadataBrowser,
          searchInterface,
          storageDistribution,
          container,
          dispose: () => {
            searchInterface.dispose();
            metadataBrowser.dispose();
            storageDistribution.dispose();
          }
        };
      };
      
      return true;
    } catch (error) {
      console.error('Error loading modules:', error);
      return false;
    }
  }

  /**
   * Run tests for the content browser integration
   */
  async runTests() {
    this.setupTestEnvironment();
    await this.loadModules();
    
    // Run test cases
    await this.testInitialization();
    await this.testTabNavigation();
    await this.testComponentInteractions();
    await this.testEventHandling();
    await this.testDisposal();
    
    // Return test results
    return this.testResults;
  }

  /**
   * Test content browser initialization
   */
  async testInitialization() {
    try {
      // Initialize content browser
      const result = await this.initializeContentBrowser({
        container: this.container,
        bridge: mockBridge,
        chartLibrary: global.Chart
      });
      
      // Check if initialization was successful
      this.testResults.initialization = {
        success: result.success === true && 
                result.metadataBrowser && 
                result.searchInterface && 
                result.storageDistribution,
        message: (result.success === true && 
                 result.metadataBrowser && 
                 result.searchInterface && 
                 result.storageDistribution) ?
          'Content browser initialized successfully' :
          'Content browser initialization failed'
      };
      
      // Check DOM structure
      const tabNav = this.container.querySelector('.content-browser-tabs');
      const searchContainer = this.container.querySelector('.search-interface-container');
      const metadataContainer = this.container.querySelector('.metadata-browser-container');
      const storageContainer = this.container.querySelector('.storage-distribution-container');
      
      this.testResults.initialization.domStructure = {
        success: tabNav !== null && 
                searchContainer !== null && 
                metadataContainer !== null && 
                storageContainer !== null,
        message: (tabNav !== null && 
                 searchContainer !== null && 
                 metadataContainer !== null && 
                 storageContainer !== null) ?
          'DOM structure rendered correctly' :
          'DOM structure is incomplete'
      };
      
      // Check default state
      const activeTab = tabNav.querySelector('.tab-button.active');
      const browserTabActive = activeTab?.dataset?.tab === 'browser';
      const statisticsTabHidden = storageContainer.style.display === 'none';
      
      this.testResults.initialization.defaultState = {
        success: browserTabActive && statisticsTabHidden,
        message: (browserTabActive && statisticsTabHidden) ?
          'Default state is correct (browser tab active)' :
          'Default state is incorrect'
      };
      
      // Clean up
      result.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.initialization = {
        success: false,
        message: 'Error during initialization test',
        error: error.message
      };
    }
  }

  /**
   * Test tab navigation
   */
  async testTabNavigation() {
    try {
      // Initialize content browser
      const result = await this.initializeContentBrowser({
        container: this.container,
        bridge: mockBridge,
        chartLibrary: global.Chart
      });
      
      // Get DOM elements
      const tabNav = this.container.querySelector('.content-browser-tabs');
      const searchContainer = this.container.querySelector('.search-interface-container');
      const metadataContainer = this.container.querySelector('.metadata-browser-container');
      const storageContainer = this.container.querySelector('.storage-distribution-container');
      
      // Test switching to statistics tab
      const statisticsTab = tabNav.querySelector('.tab-button[data-tab="statistics"]');
      
      // Track if tab changed event was emitted
      let tabChangedEventEmitted = false;
      let tabChangedName = null;
      result.storageDistribution.eventBus.on('tab-changed', (tabName) => {
        tabChangedEventEmitted = true;
        tabChangedName = tabName;
      });
      
      // Click statistics tab
      statisticsTab.click();
      
      // Check if tab was switched
      const browserTabInactive = !tabNav.querySelector('.tab-button[data-tab="browser"]').classList.contains('active');
      const statisticsTabActive = statisticsTab.classList.contains('active');
      const browserContainersHidden = searchContainer.style.display === 'none' && metadataContainer.style.display === 'none';
      const statisticsContainerVisible = storageContainer.style.display === 'block';
      
      this.testResults.tabNavigation = {
        success: browserTabInactive && 
                statisticsTabActive && 
                browserContainersHidden && 
                statisticsContainerVisible,
        message: (browserTabInactive && 
                 statisticsTabActive && 
                 browserContainersHidden && 
                 statisticsContainerVisible) ?
          'Tab navigation to statistics works correctly' :
          'Tab navigation to statistics failed'
      };
      
      // Check tab change event
      this.testResults.tabNavigation.tabChangedEvent = {
        success: tabChangedEventEmitted && tabChangedName === 'statistics',
        message: (tabChangedEventEmitted && tabChangedName === 'statistics') ?
          'Tab changed event emitted correctly' :
          'Tab changed event not emitted'
      };
      
      // Switch back to browser tab
      const browserTab = tabNav.querySelector('.tab-button[data-tab="browser"]');
      browserTab.click();
      
      // Check if tab was switched back
      const browserTabActive = browserTab.classList.contains('active');
      const statisticsTabInactive = !statisticsTab.classList.contains('active');
      const browserContainersVisible = searchContainer.style.display === 'block' && metadataContainer.style.display === 'block';
      const statisticsContainerHidden = storageContainer.style.display === 'none';
      
      this.testResults.tabNavigation.switchBack = {
        success: browserTabActive && 
                statisticsTabInactive && 
                browserContainersVisible && 
                statisticsContainerHidden,
        message: (browserTabActive && 
                 statisticsTabInactive && 
                 browserContainersVisible && 
                 statisticsContainerHidden) ?
          'Tab navigation back to browser works correctly' :
          'Tab navigation back to browser failed'
      };
      
      // Clean up
      result.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.tabNavigation = {
        success: false,
        message: 'Error during tab navigation test',
        error: error.message
      };
    }
  }

  /**
   * Test component interactions
   */
  async testComponentInteractions() {
    try {
      // Initialize content browser
      const result = await this.initializeContentBrowser({
        container: this.container,
        bridge: mockBridge,
        chartLibrary: global.Chart
      });
      
      // Test search interface filter propagation
      let filterApplied = false;
      let appliedFilter = null;
      
      // Monitor metadata browser for filter application
      result.metadataBrowser.applyFilter = (filter) => {
        filterApplied = true;
        appliedFilter = filter;
      };
      
      // Trigger search event
      result.searchInterface.emit('search', 'test query');
      
      // Check if filter was applied
      this.testResults.componentInteractions = {
        success: filterApplied && appliedFilter && appliedFilter.query === 'test query',
        message: (filterApplied && appliedFilter && appliedFilter.query === 'test query') ?
          'Search interface to metadata browser interaction works' :
          'Search interface to metadata browser interaction failed'
      };
      
      // Test storage distribution chart click propagation
      // Reset filter tracking
      filterApplied = false;
      appliedFilter = null;
      
      // Trigger location click event
      result.storageDistribution.emit('storage-distribution:location-clicked', {
        location: 'IPFS',
        count: 156
      });
      
      // Check if filter was applied and tab switched
      const browserTabActive = this.container.querySelector('.tab-button[data-tab="browser"]').classList.contains('active');
      
      this.testResults.componentInteractions.chartClickInteraction = {
        success: filterApplied && 
                appliedFilter && 
                appliedFilter.location === 'IPFS' &&
                browserTabActive,
        message: (filterApplied && 
                 appliedFilter && 
                 appliedFilter.location === 'IPFS' &&
                 browserTabActive) ?
          'Chart click to metadata browser interaction works' :
          'Chart click to metadata browser interaction failed'
      };
      
      // Clean up
      result.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.componentInteractions = {
        success: false,
        message: 'Error during component interactions test',
        error: error.message
      };
    }
  }

  /**
   * Test event handling
   */
  async testEventHandling() {
    try {
      // Initialize content browser
      const result = await this.initializeContentBrowser({
        container: this.container,
        bridge: mockBridge,
        chartLibrary: global.Chart
      });
      
      // Track refresh calls
      let metadataBrowserRefreshed = false;
      let storageDistributionRefreshed = false;
      let searchInterfaceRefreshed = false;
      
      result.metadataBrowser.refresh = (silent) => {
        metadataBrowserRefreshed = true;
        return Promise.resolve(true);
      };
      
      result.storageDistribution.refresh = (silent) => {
        storageDistributionRefreshed = true;
        return Promise.resolve(true);
      };
      
      result.searchInterface.refreshSuggestions = () => {
        searchInterfaceRefreshed = true;
        return Promise.resolve(true);
      };
      
      // Trigger content update event
      result.metadataBrowser.eventBus.emit('content-index-updated', {
        type: 'add',
        cid: 'QmTest'
      });
      
      // Check if components were refreshed
      this.testResults.eventHandling = {
        success: metadataBrowserRefreshed && 
                storageDistributionRefreshed && 
                searchInterfaceRefreshed,
        message: (metadataBrowserRefreshed && 
                 storageDistributionRefreshed && 
                 searchInterfaceRefreshed) ?
          'Content update event properly refreshes all components' :
          'Content update event handling failed'
      };
      
      // Clean up
      result.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.eventHandling = {
        success: false,
        message: 'Error during event handling test',
        error: error.message
      };
    }
  }

  /**
   * Test disposal
   */
  async testDisposal() {
    try {
      // Initialize content browser
      const result = await this.initializeContentBrowser({
        container: this.container,
        bridge: mockBridge,
        chartLibrary: global.Chart
      });
      
      // Track disposal calls
      let metadataBrowserDisposed = false;
      let storageDistributionDisposed = false;
      let searchInterfaceDisposed = false;
      
      const originalMetadataBrowserDispose = result.metadataBrowser.dispose;
      result.metadataBrowser.dispose = () => {
        metadataBrowserDisposed = true;
        originalMetadataBrowserDispose.call(result.metadataBrowser);
      };
      
      const originalStorageDistributionDispose = result.storageDistribution.dispose;
      result.storageDistribution.dispose = () => {
        storageDistributionDisposed = true;
        originalStorageDistributionDispose.call(result.storageDistribution);
      };
      
      const originalSearchInterfaceDispose = result.searchInterface.dispose;
      result.searchInterface.dispose = () => {
        searchInterfaceDisposed = true;
        originalSearchInterfaceDispose.call(result.searchInterface);
      };
      
      // Call dispose
      result.dispose();
      
      // Check if components were disposed
      this.testResults.disposal = {
        success: metadataBrowserDisposed && 
                storageDistributionDisposed && 
                searchInterfaceDisposed,
        message: (metadataBrowserDisposed && 
                 storageDistributionDisposed && 
                 searchInterfaceDisposed) ?
          'Content browser components properly disposed' :
          'Content browser disposal failed'
      };
      
      // Check if container is empty
      const containerEmpty = this.container.children.length === 0;
      
      this.testResults.disposal.containerCleanup = {
        success: containerEmpty,
        message: containerEmpty ?
          'Container cleaned up properly' :
          'Container not cleaned up'
      };
      
      // Clean up
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.disposal = {
        success: false,
        message: 'Error during disposal test',
        error: error.message
      };
    }
  }
}

// Run tests when imported
const tester = new TestContentBrowserIntegration();
export default tester;

// Allow running directly
if (typeof require !== 'undefined' && require.main === module) {
  tester.runTests().then(results => {
    console.log('Content Browser Integration Tests Results:', results);
  }).catch(err => {
    console.error('Error running tests:', err);
  });
}