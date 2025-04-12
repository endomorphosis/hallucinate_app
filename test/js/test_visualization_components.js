/**
 * Visualization Components Tests
 * 
 * Tests for the enhanced storage visualization components in PyArrow Content Index Dashboard
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

describe('Visualization Components', function() {
  let storageViz;
  
  // Load the visualization components
  before(function() {
    const storageVisualizationPath = path.resolve(__dirname, '../../hallucinate_app/node/dashboard/enhanced_storage/storage_visualization.js');
    
    if (fs.existsSync(storageVisualizationPath)) {
      storageViz = require(storageVisualizationPath);
    } else {
      this.skip();
    }
  });
  
  beforeEach(function() {
    // Set up fresh DOM
    document.body.innerHTML = '';
    
    // Mock console
    mockConsole();
    clearConsoleOutput();
  });
  
  afterEach(function() {
    // Restore console
    restoreConsole();
  });
  
  describe('renderEnhancedStorageView', function() {
    it('should create DOM elements for enhanced storage visualization', function() {
      // Call the function
      const container = storageViz.renderEnhancedStorageView();
      
      // Add to DOM
      document.body.appendChild(container);
      
      // Assertions
      assert.strictEqual(container.className, 'enhanced-storage-view');
      assert.ok(document.querySelector('.storage-filters'));
      assert.ok(document.querySelector('#storage-group-by'));
      assert.ok(document.querySelector('#storage-chart-type'));
      assert.ok(document.querySelector('#storage-metric'));
      assert.ok(document.querySelector('#primary-storage-chart'));
      assert.ok(document.querySelector('#storage-type-chart'));
      assert.ok(document.querySelector('#storage-timeline-chart'));
      assert.ok(document.querySelector('#storage-analytics-body'));
    });
  });
  
  describe('processStorageData', function() {
    it('should handle empty storage distribution', function() {
      const result = storageViz.processStorageData([], 'location', 'count');
      
      assert.deepStrictEqual(result.groupedData, []);
      assert.deepStrictEqual(result.extendedData, []);
      assert.strictEqual(result.metric, 'count');
      assert.strictEqual(result.groupBy, 'location');
    });
    
    it('should process storage distribution data correctly', function() {
      const mockData = [
        { location: 'ipfs', count: 100 },
        { location: 'huggingface', count: 75 }
      ];
      
      const result = storageViz.processStorageData(mockData, 'location', 'count');
      
      assert.strictEqual(result.groupedData.length, 2);
      assert.strictEqual(result.extendedData.length, 2);
      assert.strictEqual(result.groupedData[0].location, 'ipfs');
      assert.strictEqual(result.groupedData[0].count, 100);
      assert.strictEqual(typeof result.groupedData[0].size, 'number');
    });
    
    it('should group data by provider type', function() {
      const mockData = [
        { location: 'ipfs', count: 100 },
        { location: 'filecoin', count: 50 },
        { location: 's3', count: 75 }
      ];
      
      const result = storageViz.processStorageData(mockData, 'provider', 'count');
      
      // Check that data is grouped by provider type
      const distributedItems = result.groupedData.find(item => item.providerType === 'Distributed');
      assert.ok(distributedItems);
      assert.strictEqual(distributedItems.count, 150); // 100 + 50
    });
  });
  
  describe('Chart rendering functions', function() {
    let mockCanvas;
    let mockData;
    
    beforeEach(function() {
      // Create a mock canvas element
      mockCanvas = document.createElement('canvas');
      mockCanvas.getContext = () => ({});
      document.body.appendChild(mockCanvas);
      
      // Mock data for rendering
      mockData = {
        groupedData: [
          { location: 'ipfs', count: 100, size: 1000000 },
          { location: 'huggingface', count: 75, size: 2000000 }
        ],
        extendedData: [
          { location: 'ipfs', count: 100, size: 1000000, providerType: 'Distributed', protocol: 'IPFS' },
          { location: 'huggingface', count: 75, size: 2000000, providerType: 'Hosted API', protocol: 'HTTPS' }
        ],
        metric: 'count',
        groupBy: 'location'
      };
    });
    
    it('renderPrimaryStorageChart should create a chart instance', function() {
      const context = {
        primaryStorageChart: null
      };
      
      // Bind the chart rendering method to context for proper this binding
      const boundRender = storageViz.renderPrimaryStorageChart.bind(context);
      boundRender(mockCanvas, mockData, 'bar');
      
      // Check that chart instance was created
      assert.ok(context.primaryStorageChart);
      assert.strictEqual(context.primaryStorageChart.type, 'horizontalBar');
      assert.strictEqual(context.primaryStorageChart.data.datasets[0].data.length, 2);
    });
    
    it('renderStorageTypeChart should create a doughnut chart', function() {
      const context = {
        typeStorageChart: null
      };
      
      const boundRender = storageViz.renderStorageTypeChart.bind(context);
      boundRender(mockCanvas, mockData);
      
      assert.ok(context.typeStorageChart);
      assert.strictEqual(context.typeStorageChart.type, 'doughnut');
    });
    
    it('renderStorageTimelineChart should create a line chart', function() {
      const context = {
        timelineStorageChart: null
      };
      
      const boundRender = storageViz.renderStorageTimelineChart.bind(context);
      boundRender(mockCanvas);
      
      assert.ok(context.timelineStorageChart);
      assert.strictEqual(context.timelineStorageChart.type, 'line');
    });
  });
  
  describe('populateStorageAnalyticsTable', function() {
    it('should populate the analytics table with data', function() {
      // Create table body
      const tableBody = document.createElement('tbody');
      tableBody.id = 'storage-analytics-body';
      document.body.appendChild(tableBody);
      
      // Mock data
      const mockData = {
        extendedData: [
          { 
            location: 'ipfs', 
            count: 100, 
            size: 1000000, 
            lastUpdated: new Date().toISOString(),
            availability: 99,
            providerType: 'Distributed',
            protocol: 'IPFS'
          }
        ]
      };
      
      // Bind and call the function
      const boundPopulate = storageViz.populateStorageAnalyticsTable.bind({});
      boundPopulate(mockData);
      
      // Check table was populated
      assert.strictEqual(tableBody.querySelectorAll('tr').length, 1);
      assert.strictEqual(tableBody.querySelectorAll('td').length, 7);
    });
  });
  
  describe('Integration with Dashboard', function() {
    it('should verify storage integration module exists', function() {
      const storageIntegrationPath = path.resolve(__dirname, '../../hallucinate_app/node/dashboard/storage_integration.js');
      assert.ok(fs.existsSync(storageIntegrationPath), 'storage_integration.js file should exist');
    });
    
    it('should verify enhanced storage CSS file exists', function() {
      const cssPath = path.resolve(__dirname, '../../hallucinate_app/node/dashboard/enhanced_storage/styles.css');
      assert.ok(fs.existsSync(cssPath), 'enhanced storage styles.css file should exist');
    });
  });
});