/**
 * Test suite for PyArrow Content Index Dashboard performance optimizations
 * 
 * This test verifies the performance optimizations implemented for the
 * PyArrow Content Index Dashboard, specifically for handling large datasets.
 */

const { expect } = require('chai');
const { JSDOM } = require('jsdom');
const sinon = require('sinon');
const { performance } = require('perf_hooks');
const path = require('path');
const fs = require('fs');

// Import the dashboard component
const PyArrowContentIndexDashboard = require('../../hallucinate_app/node/dashboard/pyarrow_content_index_dashboard');

describe('PyArrow Content Index Dashboard Performance', () => {
  let dashboard;
  let dom;
  let container;
  let mockPyArrowIndex;
  let mockSecureManager;
  let mockAuthManager;
  
  // Helper to generate large test datasets
  function generateLargeDataset(size) {
    const entries = [];
    for (let i = 0; i < size; i++) {
      entries.push({
        cid: `Qm${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
        path: `/test/file-${i}.bin`,
        mimetype: i % 5 === 0 ? 'image/jpeg' : 'application/octet-stream',
        size: Math.floor(Math.random() * 10000000),
        created_at: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000).toISOString(),
        updated_at: new Date(Date.now() - Math.floor(Math.random() * 10) * 86400000).toISOString(),
        metadata: {
          description: `Test file ${i}`,
          tags: ['test', i % 3 === 0 ? 'important' : 'regular']
        }
      });
    }
    return entries;
  }
  
  // Setup test environment before each test
  beforeEach(() => {
    // Create JSDOM environment
    dom = new JSDOM(`<!DOCTYPE html><div id="dashboard-container"></div>`, {
      url: "http://localhost",
      pretendToBeVisual: true
    });
    
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.WebSocket = function() {};
    global.Chart = function() {};
    
    // Mock ResizeObserver (not available in JSDOM)
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    
    // Create mocks
    mockPyArrowIndex = {
      init: sinon.stub().resolves(),
      search: sinon.stub().callsFake((params) => {
        const { offset = 0, limit = 10 } = params;
        const totalEntries = 10000; // Simulate large dataset
        const entries = generateLargeDataset(Math.min(limit, totalEntries - offset));
        return Promise.resolve({
          entries,
          totalEntries
        });
      })
    };
    
    mockSecureManager = {
      initialized: true,
      init: sinon.stub().resolves(),
      searchContentIndex: sinon.stub().callsFake((params, authToken) => {
        const { offset = 0, limit = 10 } = params;
        const totalEntries = 10000; // Simulate large dataset
        const entries = generateLargeDataset(Math.min(limit, totalEntries - offset));
        return Promise.resolve({
          entries,
          totalEntries
        });
      })
    };
    
    mockAuthManager = {
      initialized: true,
      init: sinon.stub().resolves(),
      getSelfSignedToken: sinon.stub().resolves('mock-token'),
      verifyCapability: sinon.stub().resolves(true)
    };
    
    // Set up dashboard
    container = document.getElementById('dashboard-container');
    dashboard = new PyArrowContentIndexDashboard({
      element: container,
      eventBus: {
        emit: sinon.stub(),
        on: sinon.stub()
      },
      resources: {
        pyarrowIndex: mockPyArrowIndex,
        secureIndexManager: mockSecureManager,
        authManager: mockAuthManager
      },
      config: {
        refreshInterval: 30000,
        pageSize: 25,
        initialPageSize: 25,
        dynamicLoading: true,
        virtualizedRendering: true,
        lazyLoadImages: true,
        prefetchNextPage: true,
        optimizeForLargeDatasets: true,
        sortField: 'updated_at',
        sortDirection: 'desc'
      }
    });
  });
  
  // Clean up after each test
  afterEach(() => {
    sinon.restore();
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.ResizeObserver;
    delete global.WebSocket;
    delete global.Chart;
  });
  
  describe('Virtual List Initialization', () => {
    it('should initialize virtual list when enabled', async () => {
      // Spy on _initVirtualList method
      const initVirtualListSpy = sinon.spy(dashboard, '_initVirtualList');
      
      // Initialize dashboard
      await dashboard.init();
      
      // Check that _initVirtualList was called
      expect(initVirtualListSpy.calledOnce).to.be.true;
      
      // Check that virtualList object was created
      expect(dashboard.virtualList).to.exist;
      expect(dashboard.virtualList.cachedPages).to.be.an('object');
      expect(dashboard.virtualList.loadedRanges).to.be.an('array');
    });
    
    it('should not initialize virtual list when disabled', async () => {
      // Create dashboard with virtualizedRendering disabled
      const nonVirtualDashboard = new PyArrowContentIndexDashboard({
        element: container,
        eventBus: { emit: sinon.stub(), on: sinon.stub() },
        resources: {
          pyarrowIndex: mockPyArrowIndex,
          secureIndexManager: mockSecureManager,
          authManager: mockAuthManager
        },
        config: {
          virtualizedRendering: false
        }
      });
      
      // Spy on _initVirtualList method
      const initVirtualListSpy = sinon.spy(nonVirtualDashboard, '_initVirtualList');
      
      // Initialize dashboard
      await nonVirtualDashboard.init();
      
      // Check if _initVirtualList was called but early returned
      expect(initVirtualListSpy.called).to.be.false;
    });
  });
  
  describe('Pagination and Data Loading', () => {
    it('should prefetch next page when enabled', async () => {
      // Initialize dashboard
      await dashboard.init();
      
      // Spy on _fetchPage method
      const fetchPageSpy = sinon.spy(dashboard, '_fetchPage');
      
      // Trigger prefetch
      await dashboard._prefetchNextPage();
      
      // Verify _fetchPage was called with correct page and prefetch flag
      expect(fetchPageSpy.calledWith(2, true)).to.be.true;
    });
    
    it('should use cached pages when available', async () => {
      // Initialize dashboard
      await dashboard.init();
      
      // First fetch to populate cache
      const result1 = await dashboard._fetchPage(2, true);
      
      // Spy on the secure manager's search method
      const searchSpy = sinon.spy(mockSecureManager, 'searchContentIndex');
      
      // Second fetch of the same page, should use cache
      const result2 = await dashboard._fetchPage(2, true);
      
      // Verify search was not called again
      expect(searchSpy.called).to.be.false;
      
      // Verify the cached result was returned
      expect(result2).to.equal(result1);
    });
  });
  
  describe('Rendering Optimizations', () => {
    it('should render only visible items in virtual mode', async () => {
      // Initialize dashboard
      await dashboard.init();
      
      // Manually set up the virtual list state
      dashboard.entries = generateLargeDataset(100);
      dashboard.virtualList.containerHeight = 300;
      dashboard.virtualList.startIndex = 10;
      dashboard.virtualList.endIndex = 20;
      dashboard.virtualList.visibleItems = dashboard.entries.slice(10, 21);
      
      // Create a mock container and table for testing
      const mockContainer = document.createElement('div');
      mockContainer.className = 'content-list-container';
      const mockTable = document.createElement('table');
      mockTable.className = 'content-list-table';
      const mockTbody = document.createElement('tbody');
      mockTable.appendChild(mockTbody);
      mockContainer.appendChild(mockTable);
      document.body.appendChild(mockContainer);
      
      // Render the visible items
      dashboard._renderVisibleItems();
      
      // Verify the structure
      const tbody = document.querySelector('.content-list-table tbody');
      const rows = tbody.querySelectorAll('tr:not(.virtual-spacer)');
      const spacers = tbody.querySelectorAll('tr.virtual-spacer');
      
      // Check that only the visible items are rendered plus spacers
      expect(rows.length).to.equal(dashboard.virtualList.visibleItems.length);
      expect(spacers.length).to.equal(2); // Top and bottom spacers
      
      // Clean up
      document.body.removeChild(mockContainer);
    });
    
    it('should maintain correct scroll dimensions with spacers', async () => {
      // Initialize dashboard
      await dashboard.init();
      
      // Manually set up the virtual list state
      dashboard.entries = generateLargeDataset(1000);
      dashboard.virtualList.containerHeight = 300;
      dashboard.virtualList.startIndex = 100;
      dashboard.virtualList.endIndex = 110;
      dashboard.virtualList.visibleItems = dashboard.entries.slice(100, 111);
      dashboard.virtualList.itemHeight = 50;
      
      // Create a mock container and table for testing
      const mockContainer = document.createElement('div');
      mockContainer.className = 'content-list-container';
      const mockTable = document.createElement('table');
      mockTable.className = 'content-list-table';
      const mockTbody = document.createElement('tbody');
      mockTable.appendChild(mockTbody);
      mockContainer.appendChild(mockTable);
      document.body.appendChild(mockContainer);
      
      // Render the visible items
      dashboard._renderVisibleItems();
      
      // Verify the spacers have the correct heights
      const topSpacer = document.querySelector('.content-list-table tbody tr.virtual-spacer:first-child');
      const bottomSpacer = document.querySelector('.content-list-table tbody tr.virtual-spacer:last-child');
      
      expect(topSpacer).to.exist;
      expect(bottomSpacer).to.exist;
      
      // Check spacer heights
      expect(topSpacer.style.height).to.equal('5000px'); // 100 items * 50px
      expect(bottomSpacer.style.height).to.equal('44450px'); // (1000-111) items * 50px
      
      // Clean up
      document.body.removeChild(mockContainer);
    });
  });
  
  describe('Performance Benchmarks', () => {
    it('should render large datasets efficiently', async () => {
      // Initialize dashboard
      await dashboard.init();
      
      // Generate large dataset
      const largeDataset = generateLargeDataset(10000);
      dashboard.entries = largeDataset;
      dashboard.totalEntries = largeDataset.length;
      
      // Measure rendering time
      const startTime = performance.now();
      
      // Update visible items
      dashboard._updateVisibleItems();
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Rendering should be fast regardless of dataset size due to virtualization
      expect(renderTime).to.be.below(100); // Rendering should take less than 100ms
    });
    
    it('should handle scroll events efficiently with debouncing', async () => {
      // Initialize dashboard
      await dashboard.init();
      
      // Generate large dataset
      dashboard.entries = generateLargeDataset(10000);
      
      // Spy on _updateVisibleItems method
      const updateVisibleItemsSpy = sinon.spy(dashboard, '_updateVisibleItems');
      
      // Create mock scroll event
      const mockScrollEvent = {
        target: {
          scrollTop: 0,
          scrollHeight: 50000,
          clientHeight: 300
        }
      };
      
      // Trigger multiple scroll events in quick succession
      for (let i = 0; i < 10; i++) {
        mockScrollEvent.target.scrollTop = i * 100;
        dashboard._handleVirtualScroll(mockScrollEvent);
      }
      
      // At this point, _updateVisibleItems should not have been called yet due to debouncing
      expect(updateVisibleItemsSpy.called).to.be.false;
      
      // Wait for debounce timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now _updateVisibleItems should have been called exactly once
      expect(updateVisibleItemsSpy.calledOnce).to.be.true;
    });
  });
});

// Standalone test runner for easier execution 
if (require.main === module) {
  const Mocha = require('mocha');
  const mocha = new Mocha({
    reporter: 'spec',
    timeout: 10000
  });
  
  mocha.addFile(__filename);
  
  mocha.run(function(failures) {
    process.exit(failures ? 1 : 0);
  });
}