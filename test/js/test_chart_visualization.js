/**
 * Chart Visualization Components Tests
 * 
 * Tests for the chart visualization components in the PyArrow Content Index Dashboard
 */

const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Create a mock window environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

// Mock Chart.js
global.window.Chart = class Chart {
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

// Import the VisualizationManager
const visualizationComponents = path.resolve(__dirname, '../../hallucinate_app/node/dashboard/content_browser/visualization_components.js');
let VisualizationManager;

describe('Chart Visualization Components', function() {
  let manager;
  
  before(async function() {
    if (fs.existsSync(visualizationComponents)) {
      // Use dynamic import for ESM modules
      const module = await import('file://' + visualizationComponents);
      VisualizationManager = module.VisualizationManager;
    } else {
      console.error('visualization_components.js not found');
      this.skip();
    }
  });
  
  beforeEach(function() {
    // Set up DOM for charts
    document.body.innerHTML = `
      <div id="operations-chart"></div>
      <div id="file-type-chart"></div>
      <div id="size-by-type-chart"></div>
      <div id="location-distribution-chart"></div>
      <div id="size-distribution-chart"></div>
      <div id="content-timeline-chart"></div>
      <table><tbody id="performance-metrics-table"></tbody></table>
    `;
    
    // Create mock event bus
    const eventBus = {
      on: (event, callback) => {},
      emit: (event, data) => {}
    };
    
    // Create mock bridge
    const bridge = {
      getStats: async () => {
        return {
          operations: {
            query: 100,
            lookupByCid: 75,
            addEntry: 50
          },
          type_counts: {
            'image/jpeg': 80,
            'application/pdf': 60,
            'text/plain': 40
          },
          type_sizes: {
            'image/jpeg': 8000000,
            'application/pdf': 12000000,
            'text/plain': 500000
          },
          location_counts: {
            'IPFS': 150,
            'Hugging Face': 100,
            'Local': 70,
            'S3': 40
          },
          size_distribution: {
            '<1KB': 42,
            '1KB-10KB': 87,
            '10KB-100KB': 124,
            '100KB-1MB': 96,
            '1MB-10MB': 64,
            '10MB-100MB': 32,
            '100MB-1GB': 13,
            '>1GB': 7
          },
          content_timeline: {
            '2023-01-01': 12,
            '2023-01-02': 15,
            '2023-01-03': 18,
            '2023-01-04': 16,
            '2023-01-05': 23
          },
          performance: {
            query: {
              count: 100,
              avg_duration: 45.23,
              min_duration: 12.87,
              max_duration: 128.45,
              last_executed: new Date().toISOString()
            },
            lookupByCid: {
              count: 75,
              avg_duration: 22.56,
              min_duration: 8.12,
              max_duration: 78.34,
              last_executed: new Date().toISOString()
            }
          }
        };
      }
    };
    
    // Create visualization manager instance
    manager = new VisualizationManager({
      bridge,
      eventBus,
      chartLibrary: window.Chart,
      config: {}
    });
  });
  
  describe('Initialization', function() {
    it('should initialize with chart data structures', function() {
      // Check that the manager initializes properly
      assert.ok(manager);
      assert.ok(manager.charts);
      assert.ok(manager.data);
      
      // Check that chart instances are initialized to null
      assert.strictEqual(manager.charts.operations, null);
      assert.strictEqual(manager.charts.fileType, null);
      assert.strictEqual(manager.charts.locationDistribution, null);
      assert.strictEqual(manager.charts.sizeDistribution, null);
      assert.strictEqual(manager.charts.contentTimeline, null);
    });
    
    it('should load data successfully', async function() {
      await manager.init();
      
      // Check that data was loaded
      assert.strictEqual(manager.data.operations.length, 3);
      assert.strictEqual(manager.data.fileTypes.length, 3);
      assert.strictEqual(manager.data.locationDistribution.length, 4);
      assert.strictEqual(manager.data.sizeDistribution.labels.length, 8);
      assert.strictEqual(manager.data.contentTimeline.labels.length, 5);
    });
  });
  
  describe('Chart Rendering', function() {
    beforeEach(async function() {
      // Initialize and load data before each test
      await manager.init();
    });
    
    it('should render location distribution chart', function() {
      manager.renderLocationDistributionChart('location-distribution-chart');
      
      // Check that chart was created
      assert.ok(manager.charts.locationDistribution);
      assert.strictEqual(manager.charts.locationDistribution.type, 'pie');
      assert.strictEqual(manager.charts.locationDistribution.data.labels.length, 4);
      assert.strictEqual(manager.charts.locationDistribution.data.datasets[0].data.length, 4);
    });
    
    it('should render size distribution chart', function() {
      manager.renderSizeDistributionChart('size-distribution-chart');
      
      // Check that chart was created
      assert.ok(manager.charts.sizeDistribution);
      assert.strictEqual(manager.charts.sizeDistribution.type, 'bar');
      assert.strictEqual(manager.charts.sizeDistribution.data.labels.length, 8);
      assert.strictEqual(manager.charts.sizeDistribution.data.datasets[0].data.length, 8);
    });
    
    it('should render content timeline chart', function() {
      manager.renderContentTimelineChart('content-timeline-chart');
      
      // Check that chart was created
      assert.ok(manager.charts.contentTimeline);
      assert.strictEqual(manager.charts.contentTimeline.type, 'line');
      assert.strictEqual(manager.charts.contentTimeline.data.labels.length, 5);
      assert.strictEqual(manager.charts.contentTimeline.data.datasets[0].data.length, 5);
    });
    
    it('should render all charts at once', function() {
      manager.renderCharts();
      
      // Check that all charts were created
      assert.ok(manager.charts.operations);
      assert.ok(manager.charts.fileType);
      assert.ok(manager.charts.sizeByType);
      assert.ok(manager.charts.locationDistribution);
      assert.ok(manager.charts.sizeDistribution);
      assert.ok(manager.charts.contentTimeline);
    });
  });
  
  describe('Data Processing', function() {
    it('should process raw statistics into chart data', async function() {
      const mockStats = {
        operations: {
          query: 100,
          lookupByCid: 75
        },
        location_counts: {
          'IPFS': 150,
          'Hugging Face': 100
        },
        size_distribution: {
          '<1KB': 42,
          '1KB-10KB': 87
        },
        content_timeline: {
          '2023-01-01': 12,
          '2023-01-02': 15
        }
      };
      
      // Process the data
      manager._processData(mockStats);
      
      // Check operations data
      assert.strictEqual(manager.data.operations.length, 2);
      assert.strictEqual(manager.data.operations[0].operation, 'query');
      assert.strictEqual(manager.data.operations[0].count, 100);
      
      // Check location distribution data
      assert.strictEqual(manager.data.locationDistribution.length, 2);
      assert.strictEqual(manager.data.locationDistribution[0].location, 'IPFS');
      assert.strictEqual(manager.data.locationDistribution[0].count, 150);
      
      // Check size distribution data
      assert.strictEqual(manager.data.sizeDistribution.labels.length, 2);
      assert.strictEqual(manager.data.sizeDistribution.labels[0], '<1KB');
      assert.strictEqual(manager.data.sizeDistribution.counts[0], 42);
      
      // Check content timeline data
      assert.strictEqual(manager.data.contentTimeline.labels.length, 2);
      assert.strictEqual(manager.data.contentTimeline.labels[0], '2023-01-01');
      assert.strictEqual(manager.data.contentTimeline.counts[0], 12);
    });
  });
  
  describe('Mock Data', function() {
    it('should provide valid mock data for development', function() {
      // Load mock data
      manager._loadMockData();
      
      // Check that mock data is valid
      assert.ok(manager.data.operations.length > 0);
      assert.ok(manager.data.locationDistribution.length > 0);
      assert.ok(manager.data.sizeDistribution.labels.length > 0);
      assert.ok(manager.data.contentTimeline.labels.length > 0);
      
      // Check some specific mock data values
      assert.strictEqual(manager.data.locationDistribution[0].location, 'IPFS');
      assert.strictEqual(manager.data.sizeDistribution.labels[0], '<1KB');
    });
  });
  
  describe('Color Generation', function() {
    it('should generate color arrays for charts', function() {
      // Generate colors for different sizes
      const colors3 = manager._generateColors(3);
      const colors10 = manager._generateColors(10);
      const colors15 = manager._generateColors(15);
      
      // Check that correct number of colors are generated
      assert.strictEqual(colors3.length, 3);
      assert.strictEqual(colors10.length, 10);
      assert.strictEqual(colors15.length, 15);
      
      // Check that colors are valid
      colors3.forEach(color => {
        assert.ok(color.startsWith('#') || color.startsWith('rgb') || color.startsWith('rgba'));
      });
    });
  });
  
  describe('Resource Cleanup', function() {
    it('should properly clean up resources when disposed', async function() {
      // Initialize and render charts
      await manager.init();
      manager.renderCharts();
      
      // Verify charts exist
      assert.ok(manager.charts.operations);
      assert.ok(manager.charts.locationDistribution);
      
      // Dispose manager
      manager.dispose();
      
      // Verify charts are destroyed
      assert.strictEqual(manager.charts.operations, null);
      assert.strictEqual(manager.charts.locationDistribution, null);
    });
  });
});