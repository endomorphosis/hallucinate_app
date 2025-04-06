/**
 * Tests for the PyArrow Content Index Visualization Components
 * 
 * This module tests the visualization components used in the PyArrow Content Index Dashboard
 * to ensure they render correctly and respond to data updates.
 */

const assert = require('assert');
const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

// Create JSDOM environment
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<body>
  <div id="stats-tab">
    <div id="operations-chart"></div>
    <div id="file-type-chart"></div>
    <div id="size-by-type-chart"></div>
    <tbody id="performance-metrics-table"></tbody>
  </div>
</body>
</html>
`);

// Set up global variables for browser environment
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;

// Mock HTMLCanvasElement.getContext
HTMLCanvasElement.prototype.getContext = function() {
  return {};
};

// Mock Chart.js
global.Chart = class Chart {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.type = config.type;
    this.data = config.data;
    this.options = config.options;
  }
  
  destroy() {
    // Mock destroy method
  }
};

// Mock console to catch logs
const originalConsole = { ...console };
let consoleOutput = {
  log: [],
  info: [],
  warn: [],
  error: []
};

function mockConsole() {
  console.log = (...args) => { consoleOutput.log.push(args.join(' ')); };
  console.info = (...args) => { consoleOutput.info.push(args.join(' ')); };
  console.warn = (...args) => { consoleOutput.warn.push(args.join(' ')); };
  console.error = (...args) => { consoleOutput.error.push(args.join(' ')); };
}

function restoreConsole() {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}

function clearConsoleOutput() {
  consoleOutput = {
    log: [],
    info: [],
    warn: [],
    error: []
  };
}

// Mock bridge for testing
const mockBridge = {
  getStats: async () => ({
    operations: {
      query: 256,
      lookupByCid: 189,
      lookupByPath: 132,
      addEntry: 45,
      updateEntry: 23,
      deleteEntry: 8
    },
    type_counts: {
      'image/jpeg': 87,
      'application/pdf': 54,
      'application/octet-stream': 42,
      'text/plain': 38,
      'image/png': 25
    },
    type_sizes: {
      'video/mp4': 512000,
      'application/octet-stream': 256000,
      'image/jpeg': 48000,
      'application/pdf': 24000
    },
    performance: {
      query: {
        count: 256,
        avg_duration: 45.23,
        min_duration: 12.87,
        max_duration: 128.45,
        last_executed: new Date().toISOString()
      },
      lookupByCid: {
        count: 189,
        avg_duration: 22.56,
        min_duration: 8.12,
        max_duration: 78.34,
        last_executed: new Date().toISOString()
      }
    }
  })
};

// Mock event bus
const mockEventBus = {
  listeners: {},
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  },
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
};

describe('PyArrow Content Index Visualization', function() {
  let VisualizationManager;
  let initializeStatistics;
  let visualizationManager;
  
  before(function() {
    // Try to load the modules (skipping test if not available)
    try {
      const vizCompPath = path.resolve(__dirname, '../../hallucinate_app/node/dashboard/content_browser/visualization_components.js');
      const statsIntPath = path.resolve(__dirname, '../../hallucinate_app/node/dashboard/content_browser/statistics_integration.js');
      
      if (!fs.existsSync(vizCompPath) || !fs.existsSync(statsIntPath)) {
        this.skip();
        return;
      }
      
      const vizCompModule = require(vizCompPath);
      const statsIntModule = require(statsIntPath);
      
      VisualizationManager = vizCompModule.default || vizCompModule;
      initializeStatistics = statsIntModule.default || statsIntModule;
    } catch (error) {
      console.error('Error loading modules:', error);
      this.skip();
    }
  });
  
  beforeEach(function() {
    mockConsole();
    clearConsoleOutput();
    
    // Create visualization manager instance
    visualizationManager = new VisualizationManager({
      bridge: mockBridge,
      eventBus: mockEventBus,
      config: {}
    });
  });
  
  afterEach(function() {
    restoreConsole();
    
    // Clean up
    if (visualizationManager && typeof visualizationManager.dispose === 'function') {
      visualizationManager.dispose();
    }
  });
  
  describe('VisualizationManager', function() {
    it('should initialize with the provided options', function() {
      assert.strictEqual(visualizationManager.bridge, mockBridge);
      assert.strictEqual(visualizationManager.eventBus, mockEventBus);
      assert.ok(visualizationManager.config);
      assert.ok(visualizationManager.charts);
      assert.ok(visualizationManager.data);
      assert.ok(Array.isArray(visualizationManager.colors));
    });
    
    it('should load data from the bridge', async function() {
      await visualizationManager.init();
      
      // Check that data was loaded and processed
      assert.ok(Array.isArray(visualizationManager.data.operations));
      assert.ok(visualizationManager.data.operations.length > 0);
      assert.ok(Array.isArray(visualizationManager.data.fileTypes));
      assert.ok(visualizationManager.data.fileTypes.length > 0);
      assert.ok(Array.isArray(visualizationManager.data.sizeByType));
      assert.ok(visualizationManager.data.sizeByType.length > 0);
      assert.ok(Array.isArray(visualizationManager.data.performanceMetrics));
      assert.ok(visualizationManager.data.performanceMetrics.length > 0);
    });
    
    it('should process data correctly', async function() {
      await visualizationManager.init();
      
      // Check specific data items
      const queryOp = visualizationManager.data.operations.find(op => op.operation === 'query');
      assert.strictEqual(queryOp.count, 256);
      
      const jpegType = visualizationManager.data.fileTypes.find(type => type.type === 'image/jpeg');
      assert.strictEqual(jpegType.count, 87);
      
      const mp4Size = visualizationManager.data.sizeByType.find(item => item.type === 'video/mp4');
      assert.strictEqual(mp4Size.size, 512000);
    });
    
    it('should fall back to mock data if bridge returns null', async function() {
      // Create a manager with a null-returning bridge
      const nullBridge = { 
        getStats: async () => null 
      };
      
      const vm = new VisualizationManager({
        bridge: nullBridge,
        eventBus: mockEventBus
      });
      
      await vm.init();
      
      // Verify mock data was used
      assert.ok(Array.isArray(vm.data.operations));
      assert.ok(vm.data.operations.length > 0);
      assert.ok(Array.isArray(vm.data.fileTypes));
      assert.ok(vm.data.fileTypes.length > 0);
      
      // Check console warning
      assert.ok(consoleOutput.warn.some(msg => msg.includes('No statistics data available')));
    });
    
    it('should handle errors when loading data', async function() {
      // Create a manager with an error-throwing bridge
      const errorBridge = { 
        getStats: async () => { throw new Error('Test error'); } 
      };
      
      const vm = new VisualizationManager({
        bridge: errorBridge,
        eventBus: mockEventBus
      });
      
      await vm.loadData();
      
      // Verify error was handled
      assert.ok(consoleOutput.error.some(msg => msg.includes('Failed to load visualization data')));
      
      // Check that mock data was loaded as fallback
      assert.ok(Array.isArray(vm.data.operations));
      assert.ok(vm.data.operations.length > 0);
    });
    
    it('should render charts', async function() {
      await visualizationManager.init();
      
      // Add canvas elements to each chart container
      const containers = ['operations-chart', 'file-type-chart', 'size-by-type-chart'];
      containers.forEach(id => {
        const container = document.getElementById(id);
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);
      });
      
      // Spy on Chart constructor
      let chartInstances = [];
      const originalChart = global.Chart;
      global.Chart = function(ctx, config) {
        const chart = new originalChart(ctx, config);
        chartInstances.push(chart);
        return chart;
      };
      
      visualizationManager.renderCharts();
      
      // Restore Chart constructor
      global.Chart = originalChart;
      
      // Verify that charts were created
      assert.strictEqual(chartInstances.length, 3);
      assert.strictEqual(chartInstances[0].type, 'bar'); // operations chart
      assert.strictEqual(chartInstances[1].type, 'doughnut'); // file type chart
      assert.strictEqual(chartInstances[2].type, 'horizontalBar'); // size by type chart
    });
    
    it('should clean up resources when disposed', function() {
      // Create mock charts to test cleanup
      visualizationManager.charts = {
        operations: { destroy: () => { consoleOutput.log.push('Destroyed operations chart'); } },
        fileType: { destroy: () => { consoleOutput.log.push('Destroyed fileType chart'); } },
        sizeByType: { destroy: () => { consoleOutput.log.push('Destroyed sizeByType chart'); } }
      };
      
      visualizationManager.dispose();
      
      // Verify charts were destroyed
      assert.strictEqual(visualizationManager.charts.operations, null);
      assert.strictEqual(visualizationManager.charts.fileType, null);
      assert.strictEqual(visualizationManager.charts.sizeByType, null);
      assert.strictEqual(consoleOutput.log.length, 3); // Three destroy calls
    });
  });
  
  describe('initializeStatistics', function() {
    it('should initialize statistics with provided options', async function() {
      const result = await initializeStatistics({
        container: document.getElementById('stats-tab'),
        bridge: mockBridge,
        eventBus: mockEventBus,
        config: {}
      });
      
      // Check result
      assert.strictEqual(result.success, true);
      assert.ok(result.visualizationManager instanceof VisualizationManager);
      assert.strictEqual(result.container.id, 'stats-tab');
    });
    
    it('should fail if container is not provided', async function() {
      let error;
      
      try {
        await initializeStatistics({
          bridge: mockBridge,
          eventBus: mockEventBus
        });
      } catch (err) {
        error = err;
      }
      
      assert.ok(error);
      assert.strictEqual(error.message, 'Container element is required');
    });
    
    it('should set up event handlers for tab switching', async function() {
      const onSpy = {
        calls: [],
        event: null,
        callback: null
      };
      
      // Create mock event bus with spy
      const spyEventBus = {
        on(event, callback) {
          onSpy.calls.push(event);
          onSpy.event = event;
          onSpy.callback = callback;
        },
        emit() {}
      };
      
      await initializeStatistics({
        container: document.getElementById('stats-tab'),
        bridge: mockBridge,
        eventBus: spyEventBus,
        config: {}
      });
      
      // Verify event handler was set up
      assert.strictEqual(onSpy.calls.includes('tab-changed'), true);
      
      // Check that the callback is a function
      assert.strictEqual(typeof onSpy.callback, 'function');
    });
    
    it('should emit events on successful initialization', async function() {
      const emitSpy = {
        calls: [],
        event: null,
        data: null
      };
      
      // Create mock event bus with spy
      const spyEventBus = {
        on() {},
        emit(event, data) {
          emitSpy.calls.push(event);
          emitSpy.event = event;
          emitSpy.data = data;
        }
      };
      
      const result = await initializeStatistics({
        container: document.getElementById('stats-tab'),
        bridge: mockBridge,
        eventBus: spyEventBus,
        config: {}
      });
      
      // Verify event was emitted
      assert.strictEqual(emitSpy.calls.includes('statistics-initialized'), true);
      assert.strictEqual(emitSpy.data.success, true);
      assert.ok(emitSpy.data.manager instanceof VisualizationManager);
    });
    
    it('should handle errors during initialization', async function() {
      const emitSpy = {
        calls: [],
        event: null,
        data: null
      };
      
      // Create mock event bus with spy
      const spyEventBus = {
        on() {},
        emit(event, data) {
          emitSpy.calls.push(event);
          emitSpy.event = event;
          emitSpy.data = data;
        }
      };
      
      // Create an error-throwing bridge
      const errorBridge = {
        getStats: async () => { throw new Error('Test error'); }
      };
      
      const result = await initializeStatistics({
        container: document.getElementById('stats-tab'),
        bridge: errorBridge,
        eventBus: spyEventBus,
        config: {}
      });
      
      // Verify error handling
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.strictEqual(emitSpy.calls.includes('statistics-initialization-error'), true);
      assert.strictEqual(emitSpy.data.success, false);
    });
  });
  
  describe('Integration with Dashboard', function() {
    it('should verify visualization styles exist in CSS file', function() {
      const cssPath = path.resolve(__dirname, '../../hallucinate_app/node/dashboard/pyarrow_content_index_dashboard.css');
      
      // Read CSS file
      if (fs.existsSync(cssPath)) {
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        
        // Check for style classes
        assert.ok(cssContent.includes('.chart-section'), 'Chart section styles should exist');
        assert.ok(cssContent.includes('.chart-container'), 'Chart container styles should exist');
        assert.ok(cssContent.includes('.performance-metrics-table'), 'Performance metrics table styles should exist');
      } else {
        this.skip();
      }
    });
    
    it('should verify dashboard registration includes statistics initialization', function() {
      const regPath = path.resolve(__dirname, '../../hallucinate_app/node/dashboard/register_pyarrow_content_index_dashboard.js');
      
      if (fs.existsSync(regPath)) {
        const regContent = fs.readFileSync(regPath, 'utf8');
        
        // Check for imports and initialization
        assert.ok(regContent.includes('import initializeStatistics'), 'Statistics integration should be imported');
        assert.ok(regContent.includes('enableStatisticsVisualization'), 'Statistics visualization should be configurable');
        assert.ok(regContent.includes('initializeStatistics('), 'Statistics should be initialized');
      } else {
        this.skip();
      }
    });
  });
});