/**
 * Integration Test for PyArrow Content Index Dashboard
 * 
 * Tests the integration of all enhanced components with the PyArrow Content Index Dashboard.
 */

const assert = require('assert');
const path = require('path');
const { JSDOM } = require('jsdom');

// Mock browser environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost'
});

// Set up global browser environment
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.navigator = { userAgent: 'node.js' };
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;
global.EventTarget = dom.window.EventTarget;

// Create container for dashboard
const dashboardContainer = document.createElement('div');
dashboardContainer.id = 'dashboard-container';
document.body.appendChild(dashboardContainer);

// Mocks
class MockPythonBridge {
  async moduleExists() {
    return true;
  }
  
  async callAsync({ method, args }) {
    if (method === 'init') return true;
    if (method === 'js_lookup_by_cid') return null;
    if (method === 'js_lookup_by_path') return null;
    if (method === 'js_query') return { entries: [], total: 0 };
    if (method === 'js_get_stats') return {
      entry_count: 0,
      total_size: 0,
      mime_types: []
    };
    return null;
  }
}

class MockEventEmitter {
  constructor() {
    this.listeners = {};
  }
  
  on(event, listener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    return this;
  }
  
  once(event, listener) {
    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      listener.apply(this, args);
    };
    return this.on(event, onceWrapper);
  }
  
  off(event, listener) {
    if (!this.listeners[event]) return this;
    if (listener) {
      this.listeners[event] = this.listeners[event].filter(l => l !== listener);
    } else {
      delete this.listeners[event];
    }
    return this;
  }
  
  emit(event, ...args) {
    if (!this.listeners[event]) return false;
    this.listeners[event].forEach(listener => {
      listener.apply(this, args);
    });
    return true;
  }
}

class MockAuthManager {
  constructor() {
    this.initialized = true;
  }
  
  async init() {
    return true;
  }
  
  async getCapabilityToken(capability) {
    return `mock-token-${capability}`;
  }
  
  async verifyCapabilityToken(token, capability) {
    return true;
  }
}

// Import modules after setting up mocks
const registerPyArrowContentIndexDashboard = require('../../hallucinate_app/node/dashboard/register_pyarrow_content_index_dashboard').default;

// Mock dashboard container
const dashboard = {
  element: dashboardContainer,
  eventBus: new MockEventEmitter(),
  registerPanel: (id, config) => {},
  ipc: {
    handle: (channel, handler) => {},
    invoke: async (channel, ...args) => {
      if (channel === 'pyarrow-content-index:get-security-status') {
        return {
          module: 'pyarrow_index',
          initialized: true,
          secure_mode: true,
          auth_initialized: true,
          bridge_initialized: true
        };
      }
      return null;
    }
  }
};

describe('PyArrow Content Index Dashboard Integration', function() {
  // Mock module loading
  const originalRequire = require;
  let loadedModules = {};
  
  // Mock all enhanced component loaders
  beforeEach(function() {
    loadedModules = {};
    
    // Mock require to track module loading
    global.require = function(module) {
      if (module.includes('load_enhanced_search') ||
          module.includes('load_enhanced_storage') ||
          module.includes('load_enhanced_thumbnails') ||
          module.includes('load_content_discovery') ||
          module.includes('load_realtime_updates')) {
        
        // Create mock loader that records being called
        const loaderName = path.basename(module, '.js');
        loadedModules[loaderName] = true;
        
        return async () => {
          return { success: true, message: `${loaderName} initialized` };
        };
      }
      
      if (module.includes('content_browser_integration')) {
        return async () => {
          return { success: true, message: 'Content browser initialized' };
        };
      }
      
      // Pass through for other modules
      return originalRequire(module);
    };
  });
  
  // Restore original require
  afterEach(function() {
    global.require = originalRequire;
  });
  
  it('should register dashboard successfully with all components', async function() {
    // Create options for registration
    const options = {
      pythonBridge: new MockPythonBridge(),
      resources: {
        auth: new MockAuthManager()
      },
      config: {
        enableEnhancedSearch: true,
        enableEnhancedStorage: true,
        enableEnhancedThumbnails: true,
        enableContentDiscovery: true,
        enableRealtimeUpdates: true
      }
    };
    
    // Register dashboard
    const result = await registerPyArrowContentIndexDashboard(dashboard, options);
    
    // Verify success
    assert.strictEqual(result.success, true, 'Dashboard registration should succeed');
    assert.ok(result.bridge, 'Should return bridge instance');
    assert.strictEqual(result.secureMode, true, 'Secure mode should be enabled');
    assert.ok(result.enhancedComponents, 'Should return enhanced components');
  });
  
  it('should load all enhanced components when enabled', async function() {
    // Create options for registration with all components enabled
    const options = {
      pythonBridge: new MockPythonBridge(),
      resources: {
        auth: new MockAuthManager()
      },
      config: {
        enableEnhancedSearch: true,
        enableEnhancedStorage: true,
        enableEnhancedThumbnails: true,
        enableContentDiscovery: true,
        enableRealtimeUpdates: true
      }
    };
    
    // Register dashboard
    await registerPyArrowContentIndexDashboard(dashboard, options);
    
    // Verify all component loaders were called
    assert.ok(loadedModules['load_enhanced_search'], 'Enhanced search should be loaded');
    assert.ok(loadedModules['load_enhanced_storage'], 'Enhanced storage should be loaded');
    assert.ok(loadedModules['load_enhanced_thumbnails'], 'Enhanced thumbnails should be loaded');
    assert.ok(loadedModules['load_content_discovery'], 'Content discovery should be loaded');
    assert.ok(loadedModules['load_realtime_updates'], 'Real-time updates should be loaded');
  });
  
  it('should skip loading disabled components', async function() {
    // Create options for registration with some components disabled
    const options = {
      pythonBridge: new MockPythonBridge(),
      resources: {
        auth: new MockAuthManager()
      },
      config: {
        enableEnhancedSearch: true,
        enableEnhancedStorage: false,
        enableEnhancedThumbnails: true,
        enableContentDiscovery: false,
        enableRealtimeUpdates: true
      }
    };
    
    // Register dashboard
    await registerPyArrowContentIndexDashboard(dashboard, options);
    
    // Verify only enabled component loaders were called
    assert.ok(loadedModules['load_enhanced_search'], 'Enhanced search should be loaded');
    assert.ok(!loadedModules['load_enhanced_storage'], 'Enhanced storage should not be loaded');
    assert.ok(loadedModules['load_enhanced_thumbnails'], 'Enhanced thumbnails should be loaded');
    assert.ok(!loadedModules['load_content_discovery'], 'Content discovery should not be loaded');
    assert.ok(loadedModules['load_realtime_updates'], 'Real-time updates should be loaded');
  });
  
  it('should continue dashboard registration when a component fails', async function() {
    // Override require to make one component fail
    global.require = function(module) {
      if (module.includes('load_enhanced_search')) {
        loadedModules['load_enhanced_search'] = true;
        return async () => {
          throw new Error('Failed to load enhanced search');
        };
      }
      
      if (module.includes('load_enhanced_storage') ||
          module.includes('load_enhanced_thumbnails') ||
          module.includes('load_content_discovery') ||
          module.includes('load_realtime_updates')) {
        
        const loaderName = path.basename(module, '.js');
        loadedModules[loaderName] = true;
        
        return async () => {
          return { success: true, message: `${loaderName} initialized` };
        };
      }
      
      if (module.includes('content_browser_integration')) {
        return async () => {
          return { success: true, message: 'Content browser initialized' };
        };
      }
      
      return originalRequire(module);
    };
    
    // Create options for registration
    const options = {
      pythonBridge: new MockPythonBridge(),
      resources: {
        auth: new MockAuthManager()
      },
      config: {
        enableEnhancedSearch: true,
        enableEnhancedStorage: true,
        enableEnhancedThumbnails: true,
        enableContentDiscovery: true,
        enableRealtimeUpdates: true
      }
    };
    
    // Register dashboard
    const result = await registerPyArrowContentIndexDashboard(dashboard, options);
    
    // Verify registration still succeeds overall
    assert.strictEqual(result.success, true, 'Dashboard registration should succeed despite component failure');
    
    // Check component status
    assert.strictEqual(result.enhancedComponents.search.success, false, 'Enhanced search should report failure');
    assert.ok(result.enhancedComponents.search.error, 'Enhanced search should have error message');
    
    // Other components should succeed
    assert.strictEqual(result.enhancedComponents.storage.success, true, 'Enhanced storage should succeed');
    assert.strictEqual(result.enhancedComponents.thumbnails.success, true, 'Enhanced thumbnails should succeed');
    assert.strictEqual(result.enhancedComponents.discovery.success, true, 'Content discovery should succeed');
  });
  
  it('should pass correct configuration to each component', async function() {
    let configPassed = {};
    
    // Override require to capture passed configuration
    global.require = function(module) {
      if (module.includes('load_enhanced_search') ||
          module.includes('load_enhanced_storage') ||
          module.includes('load_enhanced_thumbnails') ||
          module.includes('load_content_discovery') ||
          module.includes('load_realtime_updates')) {
        
        const loaderName = path.basename(module, '.js');
        
        return async (options) => {
          configPassed[loaderName] = options.config;
          return { success: true, config: options.config };
        };
      }
      
      if (module.includes('content_browser_integration')) {
        return async () => {
          return { success: true };
        };
      }
      
      return originalRequire(module);
    };
    
    // Create options with specific config values
    const options = {
      pythonBridge: new MockPythonBridge(),
      resources: {
        auth: new MockAuthManager()
      },
      config: {
        enableEnhancedSearch: true,
        enableEnhancedStorage: true,
        enableEnhancedThumbnails: true,
        enableContentDiscovery: true,
        enableRealtimeUpdates: true,
        
        searchConfig: {
          enableSavedSearches: true,
          maxHistoryItems: 20
        },
        
        storageConfig: {
          defaultView: 'bar'
        },
        
        thumbnailConfig: {
          thumbnailSize: 'medium'
        },
        
        discoveryConfig: {
          enableTagCloud: true
        },
        
        realtimeConfig: {
          wsEndpoint: 'ws://test-endpoint'
        }
      }
    };
    
    // Register dashboard
    await registerPyArrowContentIndexDashboard(dashboard, options);
    
    // Verify configuration was passed correctly
    assert.strictEqual(configPassed['load_enhanced_search'].enableSavedSearches, true);
    assert.strictEqual(configPassed['load_enhanced_search'].maxHistoryItems, 20);
    
    assert.strictEqual(configPassed['load_enhanced_storage'].defaultView, 'bar');
    
    assert.strictEqual(configPassed['load_enhanced_thumbnails'].thumbnailSize, 'medium');
    
    assert.strictEqual(configPassed['load_content_discovery'].enableTagCloud, true);
    
    // Real-time updates receives additional parameters directly
    assert.strictEqual(configPassed['load_realtime_updates'], undefined);
  });
});

// Run the tests when executed directly
if (require.main === module) {
  const Mocha = require('mocha');
  const mocha = new Mocha();
  mocha.addFile(__filename);
  mocha.run();
}