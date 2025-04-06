/**
 * Tests for the Search Interface Component
 * 
 * This file contains tests to verify the functionality of the 
 * SearchInterface component for the PyArrow Content Index Dashboard.
 */

import { SearchInterface } from '../../hallucinate_app/node/dashboard/content_browser/search_interface.js';

// Create a mock bridge for testing
class MockPyArrowIndexBridge {
  async getStats() {
    return {
      mimeTypes: ['application/json', 'image/jpeg', 'text/csv', 'application/parquet'],
      locations: ['ipfs', 'huggingface', 'local'],
      tags: ['dataset', 'model', 'image', 'test', 'production'],
      metadataKeys: ['author', 'version', 'created', 'license']
    };
  }
}

// Create a mock event bus
class MockEventBus {
  constructor() {
    this.listeners = {};
  }
  
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
  
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
}

// Setup tests
describe('SearchInterface', () => {
  // Create testing infrastructure
  let container;
  let mockBridge;
  let mockEventBus;
  let searchInterface;
  
  beforeEach(() => {
    // Create container
    container = document.createElement('div');
    document.body.appendChild(container);
    
    // Create mock objects
    mockBridge = new MockPyArrowIndexBridge();
    mockEventBus = new MockEventBus();
    
    // Create search interface
    searchInterface = new SearchInterface({
      container,
      bridge: mockBridge,
      eventBus: mockEventBus,
      config: {
        enableSavedSearches: true,
        enableSearchHistory: true,
        maxHistoryItems: 10,
        maxSavedSearches: 20
      }
    });
  });
  
  afterEach(() => {
    // Clean up
    if (searchInterface) {
      searchInterface.dispose();
    }
    
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });
  
  // Test initialization
  test('should initialize correctly', async () => {
    const initResult = await searchInterface.init();
    
    expect(initResult).toBe(true);
    expect(searchInterface.initialized).toBe(true);
    expect(searchInterface.availableMimeTypes).toEqual([
      'application/json', 'image/jpeg', 'text/csv', 'application/parquet'
    ]);
    expect(searchInterface.availableLocations).toEqual(['ipfs', 'huggingface', 'local']);
  });
  
  // Test search functionality
  test('should perform search and emit events', () => {
    // Set up an event listener
    let searchEventReceived = false;
    let receivedQuery = '';
    
    searchInterface.on('search', (query) => {
      searchEventReceived = true;
      receivedQuery = query;
    });
    
    // Also listen via the event bus
    let busEventReceived = false;
    mockEventBus.on('content-browser:search', (query) => {
      busEventReceived = true;
    });
    
    // Perform search
    searchInterface.search('test query');
    
    // Check results
    expect(searchEventReceived).toBe(true);
    expect(receivedQuery).toBe('test query');
    expect(busEventReceived).toBe(true);
    expect(searchInterface.currentQuery).toBe('test query');
  });
  
  // Test filter functionality
  test('should apply filters and emit events', () => {
    // Set up an event listener
    let filterEventReceived = false;
    let receivedFilter = null;
    
    searchInterface.on('filter-change', (filter) => {
      filterEventReceived = true;
      receivedFilter = filter;
    });
    
    // Also listen via the event bus
    let busEventReceived = false;
    mockEventBus.on('content-browser:filter', (filter) => {
      busEventReceived = true;
    });
    
    // Apply filter
    const testFilter = {
      mimetype: 'image/jpeg',
      tags: ['test', 'image'],
      sizeMin: 1024,
      sizeMax: 1048576
    };
    
    searchInterface.applyFilter(testFilter);
    
    // Check results
    expect(filterEventReceived).toBe(true);
    expect(receivedFilter).toEqual(testFilter);
    expect(busEventReceived).toBe(true);
    expect(searchInterface.currentFilter).toEqual(testFilter);
  });
  
  // Test suggestions refresh
  test('should refresh suggestions', async () => {
    const refreshResult = await searchInterface.refreshSuggestions();
    
    expect(refreshResult).toBe(true);
    expect(searchInterface.availableMimeTypes).toEqual([
      'application/json', 'image/jpeg', 'text/csv', 'application/parquet'
    ]);
  });
  
  // Test disposal
  test('should dispose properly', () => {
    // Add an event listener
    searchInterface.on('test', () => {});
    
    // Dispose
    searchInterface.dispose();
    
    // Check state
    expect(searchInterface.disposed).toBe(true);
    expect(searchInterface.eventListeners).toEqual({});
  });
});

// If running directly
if (typeof require !== 'undefined' && require.main === module) {
  test('SearchInterface direct test', () => {
    console.log('Running SearchInterface tests directly');
    expect(1).toBe(1);
  });
}