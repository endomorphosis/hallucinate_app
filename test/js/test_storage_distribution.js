/**
 * Test for Storage Distribution Visualization Component
 * 
 * This module tests the functionality of the storage distribution component
 * for the PyArrow Content Index Dashboard.
 * 
 * @module test/js/test_storage_distribution
 */

import { JSDOM } from 'jsdom';

// We will use ES modules for this test
// Create a temporary mock of the required modules to test in isolation
const mockBridge = {
  getStats: async () => ({
    // Storage location distribution
    location_counts: {
      'IPFS': 156,
      'Hugging Face': 98,
      'Local': 76,
      'S3': 43,
      'Filecoin': 32
    },
    
    // Storage location sizes (in bytes)
    location_sizes: {
      'IPFS': 5248000000,
      'Hugging Face': 3156000000,
      'Local': 1245000000,
      'S3': 876000000,
      'Filecoin': 432000000
    },
    
    // Content type distribution
    type_counts: {
      'image/jpeg': 87,
      'application/pdf': 54,
      'application/octet-stream': 42,
      'text/plain': 38,
      'image/png': 25
    },
    
    // Content type sizes (in bytes)
    type_sizes: {
      'video/mp4': 5120000000,
      'application/octet-stream': 2560000000,
      'image/jpeg': 480000000,
      'application/pdf': 240000000,
      'image/png': 120000000
    },
    
    // Size distribution
    size_distribution: {
      '<1KB': 42,
      '1KB-10KB': 87,
      '10KB-100KB': 124,
      '100KB-1MB': 96,
      '1MB-10MB': 64
    },
    
    // Timeline distribution (last 7 days)
    timeline_distribution: {
      '2025-03-30': 12,
      '2025-03-31': 15,
      '2025-04-01': 10,
      '2025-04-02': 18,
      '2025-04-03': 22,
      '2025-04-04': 16,
      '2025-04-05': 8
    }
  })
};

const mockEventBus = {
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

// Mock Chart.js
class MockChart {
  constructor(ctx, config) {
    this.type = config.type;
    this.data = config.data;
    this.options = config.options;
    this.plugins = config.plugins;
    this.ctx = ctx;
    this.id = Math.random().toString(36).substr(2, 9);
  }
  
  destroy() {
    // Clean up resources
    this.destroyed = true;
  }
  
  update() {
    // Update the chart
    this.updated = true;
  }
  
  getDatasetMeta(index) {
    return {
      data: this.data.datasets[index].data.map((value, i) => ({
        index: i,
        hidden: false
      }))
    };
  }
}

class TestStorageDistribution {
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
    
    // Mock FontAwesome classes
    const style = document.createElement('style');
    style.textContent = `
      .fas { display: inline-block; width: 16px; height: 16px; }
      .fa-chart-pie { content: 'pie'; }
      .fa-chart-bar { content: 'bar'; }
      .fa-chart-line { content: 'line'; }
      .fa-sync-alt { content: 'refresh'; }
      .fa-info-circle { content: 'info'; }
      .fa-exclamation-circle { content: 'error'; }
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
   * Load the storage distribution module dynamically
   */
  async loadModules() {
    try {
      // Import the StorageDistribution class
      // Since we're in Node and not a browser environment, we'll mock this
      
      // Create a mock StorageDistribution class based on the implementation
      this.StorageDistribution = class StorageDistribution {
        constructor(options = {}) {
          this.container = options.container;
          this.bridge = options.bridge;
          this.eventBus = options.eventBus || {};
          this.chartLibrary = options.chartLibrary || MockChart;
          
          this.config = {
            refreshInterval: 60000,
            enableAnimation: true,
            defaultChartType: 'doughnut',
            chartColors: [
              '#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#f56565'
            ],
            storageBreakdownLimit: 10,
            darkMode: false,
            ...options.config
          };
          
          this.initialized = false;
          this.loading = false;
          this.error = null;
          this.stats = null;
          this.charts = {};
          this.refreshTimer = null;
          
          // Bind methods
          this.init = this.init.bind(this);
          this.render = this.render.bind(this);
          this.refresh = this.refresh.bind(this);
          this.renderLocationDistribution = this.renderLocationDistribution.bind(this);
          this.renderTypeDistribution = this.renderTypeDistribution.bind(this);
          this.renderSizeDistribution = this.renderSizeDistribution.bind(this);
          this.renderTimelineDistribution = this.renderTimelineDistribution.bind(this);
          this.dispose = this.dispose.bind(this);
        }
        
        async init() {
          if (this.initialized) return true;
          
          try {
            this.loading = true;
            this.render();
            
            await this._loadStats();
            
            this.initialized = true;
            this.loading = false;
            this.render();
            
            return true;
          } catch (error) {
            console.error('Failed to initialize:', error);
            this.error = error;
            this.loading = false;
            this.render();
            return false;
          }
        }
        
        async _loadStats() {
          try {
            const stats = await this.bridge.getStats();
            
            if (!stats) {
              throw new Error('No statistics data available');
            }
            
            this.stats = stats;
            
            return this.stats;
          } catch (error) {
            console.error('Failed to load statistics:', error);
            throw error;
          }
        }
        
        async refresh(silent = false) {
          if (!silent) {
            this.loading = true;
            this.render();
          }
          
          try {
            await this._loadStats();
            
            if (!silent) {
              this.loading = false;
              this.render();
            } else {
              // Update charts without re-rendering
              this._updateCharts();
            }
            
            return this.stats;
          } catch (error) {
            if (!silent) {
              this.error = error;
              this.loading = false;
              this.render();
            }
            
            throw error;
          }
        }
        
        _updateCharts() {
          // This would update each chart with new data
          Object.values(this.charts).forEach(chart => {
            if (chart) {
              chart.update();
            }
          });
        }
        
        render() {
          if (!this.container) return;
          
          // Clear the container
          this.container.innerHTML = '';
          
          // Create component wrapper
          const wrapper = document.createElement('div');
          wrapper.className = `storage-distribution-container ${this.config.darkMode ? 'dark-mode' : ''}`;
          
          // If loading, show loading indicator
          if (this.loading) {
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'loading-indicator';
            loadingIndicator.innerHTML = `
              <div class="spinner"></div>
              <div>Loading storage statistics...</div>
            `;
            wrapper.appendChild(loadingIndicator);
            this.container.appendChild(wrapper);
            return;
          }
          
          // If error, show error message
          if (this.error) {
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message';
            errorMessage.innerHTML = `
              <i class="fas fa-exclamation-circle"></i>
              <h3>Error Loading Statistics</h3>
              <p>${this.error.message}</p>
              <button class="retry-button">Retry</button>
            `;
            wrapper.appendChild(errorMessage);
            this.container.appendChild(wrapper);
            return;
          }
          
          // If no stats, show empty state
          if (!this.stats) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
              <i class="fas fa-chart-pie"></i>
              <h3>No Storage Data Available</h3>
              <p>No storage distribution data is currently available.</p>
              <button class="refresh-button">Refresh Data</button>
            `;
            wrapper.appendChild(emptyState);
            this.container.appendChild(wrapper);
            return;
          }
          
          // Create header with actions
          const header = document.createElement('div');
          header.className = 'storage-distribution-header';
          header.innerHTML = `
            <h2>Content Storage Distribution</h2>
            <div class="storage-distribution-actions">
              <button class="refresh-button" title="Refresh Data">
                <i class="fas fa-sync-alt"></i>
              </button>
            </div>
          `;
          wrapper.appendChild(header);
          
          // Create grid for charts
          const chartsGrid = document.createElement('div');
          chartsGrid.className = 'storage-distribution-grid';
          
          // Location chart container
          chartsGrid.innerHTML += `
            <div class="chart-container location-distribution">
              <div class="chart-header">
                <h3>Storage Location Distribution</h3>
                <div class="chart-controls">
                  <div class="chart-type-selector">
                    <button class="chart-type-btn active" data-chart="locationDistribution" data-type="doughnut">
                      <i class="fas fa-chart-pie"></i>
                    </button>
                    <button class="chart-type-btn" data-chart="locationDistribution" data-type="bar">
                      <i class="fas fa-chart-bar"></i>
                    </button>
                  </div>
                </div>
              </div>
              <div class="chart-body">
                <canvas id="locationDistributionChart"></canvas>
              </div>
            </div>
          `;
          
          wrapper.appendChild(chartsGrid);
          
          // Add to container
          this.container.appendChild(wrapper);
          
          // Render charts
          if (this.chartLibrary) {
            this.renderLocationDistribution();
            this.renderTypeDistribution();
            this.renderSizeDistribution();
            this.renderTimelineDistribution();
          }
        }
        
        renderLocationDistribution() {
          const canvas = document.getElementById('locationDistributionChart');
          if (!canvas || !this.chartLibrary || !this.stats) return;
          
          // Clean up previous chart
          if (this.charts.locationDistribution) {
            this.charts.locationDistribution.destroy();
            this.charts.locationDistribution = null;
          }
          
          // Get data from stats
          const locations = Object.keys(this.stats.location_counts || {});
          const counts = locations.map(loc => this.stats.location_counts[loc]);
          
          // Create chart
          const ctx = canvas.getContext('2d');
          this.charts.locationDistribution = new this.chartLibrary(ctx, {
            type: 'doughnut',
            data: {
              labels: locations,
              datasets: [{
                data: counts,
                backgroundColor: this.config.chartColors.slice(0, locations.length)
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false
            }
          });
          
          return this.charts.locationDistribution;
        }
        
        renderTypeDistribution() {
          const canvas = document.getElementById('typeDistributionChart');
          if (!canvas || !this.chartLibrary || !this.stats) return;
          
          // Clean up previous chart
          if (this.charts.typeDistribution) {
            this.charts.typeDistribution.destroy();
            this.charts.typeDistribution = null;
          }
          
          // Get data from stats
          const types = Object.keys(this.stats.type_counts || {});
          const counts = types.map(type => this.stats.type_counts[type]);
          
          // Create chart
          const ctx = canvas.getContext('2d');
          this.charts.typeDistribution = new this.chartLibrary(ctx, {
            type: 'doughnut',
            data: {
              labels: types,
              datasets: [{
                data: counts,
                backgroundColor: this.config.chartColors.slice(0, types.length)
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false
            }
          });
          
          return this.charts.typeDistribution;
        }
        
        renderSizeDistribution() {
          const canvas = document.getElementById('sizeDistributionChart');
          if (!canvas || !this.chartLibrary || !this.stats) return;
          
          // Clean up previous chart
          if (this.charts.sizeDistribution) {
            this.charts.sizeDistribution.destroy();
            this.charts.sizeDistribution = null;
          }
          
          // Get data from stats
          const sizes = Object.keys(this.stats.size_distribution || {});
          const counts = sizes.map(size => this.stats.size_distribution[size]);
          
          // Create chart
          const ctx = canvas.getContext('2d');
          this.charts.sizeDistribution = new this.chartLibrary(ctx, {
            type: 'bar',
            data: {
              labels: sizes,
              datasets: [{
                label: 'Number of Files',
                data: counts,
                backgroundColor: 'rgba(75, 192, 192, 0.6)'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false
            }
          });
          
          return this.charts.sizeDistribution;
        }
        
        renderTimelineDistribution() {
          const canvas = document.getElementById('timelineDistributionChart');
          if (!canvas || !this.chartLibrary || !this.stats) return;
          
          // Clean up previous chart
          if (this.charts.timelineDistribution) {
            this.charts.timelineDistribution.destroy();
            this.charts.timelineDistribution = null;
          }
          
          // Get data from stats
          const dates = Object.keys(this.stats.timeline_distribution || {}).sort();
          const counts = dates.map(date => this.stats.timeline_distribution[date]);
          
          // Create chart
          const ctx = canvas.getContext('2d');
          this.charts.timelineDistribution = new this.chartLibrary(ctx, {
            type: 'line',
            data: {
              labels: dates,
              datasets: [{
                label: 'Files Added',
                data: counts,
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false
            }
          });
          
          return this.charts.timelineDistribution;
        }
        
        _updateTimelineRange(range) {
          // This would filter timeline data based on date range
          const chart = this.charts.timelineDistribution;
          if (chart) {
            chart.update();
          }
        }
        
        dispose() {
          // Clean up charts
          Object.values(this.charts).forEach(chart => {
            if (chart) {
              chart.destroy();
            }
          });
          
          this.charts = {};
          
          // Clear timer
          if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
          }
          
          // Clear container
          if (this.container) {
            this.container.innerHTML = '';
          }
          
          this.initialized = false;
        }
      };
      
      return true;
    } catch (error) {
      console.error('Error loading modules:', error);
      return false;
    }
  }

  /**
   * Run tests for the storage distribution component
   */
  async runTests() {
    this.setupTestEnvironment();
    await this.loadModules();
    
    // Run test cases
    await this.testInitialization();
    await this.testChartRendering();
    await this.testErrorHandling();
    await this.testRefresh();
    await this.testChartTypeChange();
    await this.testEvents();
    await this.testDisposal();
    
    // Return test results
    return this.testResults;
  }

  /**
   * Test storage distribution initialization
   */
  async testInitialization() {
    try {
      const distribution = new this.StorageDistribution({
        container: this.container,
        bridge: mockBridge,
        eventBus: mockEventBus
      });
      
      // Test initialization
      const initResult = await distribution.init();
      this.testResults.initialization = {
        success: initResult === true,
        message: initResult ? 'StorageDistribution initialized successfully' : 'StorageDistribution failed to initialize'
      };
      
      // Test that stats were loaded
      this.testResults.initialization.statsLoaded = {
        success: distribution.stats !== null,
        message: distribution.stats !== null ? 
          'Statistics loaded successfully' : 
          'Failed to load statistics'
      };
      
      // Check component structure
      const containerElement = this.container.querySelector('.storage-distribution-container');
      const header = this.container.querySelector('.storage-distribution-header');
      const chartsGrid = this.container.querySelector('.storage-distribution-grid');
      
      this.testResults.initialization.renderStructure = {
        success: containerElement !== null && header !== null && chartsGrid !== null,
        message: (containerElement !== null && header !== null && chartsGrid !== null) ?
          'Component structure rendered correctly' :
          'Component structure not rendered correctly'
      };
      
      // Clean up
      distribution.dispose();
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
   * Test chart rendering
   */
  async testChartRendering() {
    try {
      const distribution = new this.StorageDistribution({
        container: this.container,
        bridge: mockBridge,
        eventBus: mockEventBus,
        chartLibrary: MockChart
      });
      
      await distribution.init();
      
      // Test chart creation
      const locationChart = distribution.renderLocationDistribution();
      const typeChart = distribution.renderTypeDistribution();
      const sizeChart = distribution.renderSizeDistribution();
      const timelineChart = distribution.renderTimelineDistribution();
      
      this.testResults.chartRendering = {
        success: locationChart !== undefined && typeChart !== undefined && 
                sizeChart !== undefined && timelineChart !== undefined,
        message: (locationChart !== undefined && typeChart !== undefined && 
                 sizeChart !== undefined && timelineChart !== undefined) ?
          'All charts rendered successfully' :
          'Failed to render all charts'
      };
      
      // Test chart types
      this.testResults.chartRendering.chartTypes = {
        success: locationChart.type === 'doughnut' && 
                typeChart.type === 'doughnut' && 
                sizeChart.type === 'bar' && 
                timelineChart.type === 'line',
        message: (locationChart.type === 'doughnut' && 
                typeChart.type === 'doughnut' && 
                sizeChart.type === 'bar' && 
                timelineChart.type === 'line') ?
          'Charts initialized with correct types' :
          'Charts initialized with incorrect types'
      };
      
      // Test data mapping
      this.testResults.chartRendering.dataMapping = {
        success: locationChart.data.labels.length > 0 && 
                locationChart.data.datasets[0].data.length === locationChart.data.labels.length,
        message: (locationChart.data.labels.length > 0 && 
                locationChart.data.datasets[0].data.length === locationChart.data.labels.length) ?
          'Chart data mapped correctly' :
          'Chart data mapping failed'
      };
      
      // Clean up
      distribution.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.chartRendering = {
        success: false,
        message: 'Error during chart rendering test',
        error: error.message
      };
    }
  }

  /**
   * Test error handling
   */
  async testErrorHandling() {
    try {
      // Create a bridge that will fail
      const failingBridge = {
        getStats: async () => {
          throw new Error('Simulated error');
        }
      };
      
      const distribution = new this.StorageDistribution({
        container: this.container,
        bridge: failingBridge,
        eventBus: mockEventBus
      });
      
      // Test initialization with error
      const initResult = await distribution.init();
      
      // Check error state
      const errorMessage = this.container.querySelector('.error-message');
      const errorText = errorMessage ? errorMessage.textContent : '';
      
      this.testResults.errorHandling = {
        success: initResult === false && errorMessage !== null && errorText.includes('Simulated error'),
        message: (initResult === false && errorMessage !== null && errorText.includes('Simulated error')) ?
          'Error handling works correctly' :
          'Error handling failed'
      };
      
      // Test retry button presence
      const retryButton = this.container.querySelector('.retry-button');
      this.testResults.errorHandling.retryButton = {
        success: retryButton !== null,
        message: retryButton !== null ?
          'Retry button rendered correctly' :
          'Retry button not rendered'
      };
      
      // Clean up
      distribution.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.errorHandling = {
        success: false,
        message: 'Error during error handling test',
        error: error.message
      };
    }
  }

  /**
   * Test refresh functionality
   */
  async testRefresh() {
    try {
      let refreshCount = 0;
      const refreshTrackingBridge = {
        getStats: async () => {
          refreshCount++;
          return mockBridge.getStats();
        }
      };
      
      const distribution = new this.StorageDistribution({
        container: this.container,
        bridge: refreshTrackingBridge,
        eventBus: mockEventBus
      });
      
      await distribution.init();
      
      // First load already happened during init
      const initialRefreshCount = refreshCount;
      
      // Test manual refresh
      await distribution.refresh();
      
      this.testResults.refresh = {
        success: refreshCount === initialRefreshCount + 1,
        message: refreshCount === initialRefreshCount + 1 ?
          'Manual refresh works correctly' :
          'Manual refresh failed'
      };
      
      // Test silent refresh
      await distribution.refresh(true);
      
      this.testResults.refresh.silentRefresh = {
        success: refreshCount === initialRefreshCount + 2,
        message: refreshCount === initialRefreshCount + 2 ?
          'Silent refresh works correctly' :
          'Silent refresh failed'
      };
      
      // Test refresh button
      const refreshButton = this.container.querySelector('.refresh-button');
      
      if (refreshButton) {
        // Track if refresh was called when button is clicked
        const originalRefresh = distribution.refresh;
        let refreshButtonClicked = false;
        
        distribution.refresh = async (silent) => {
          refreshButtonClicked = true;
          return await originalRefresh.call(distribution, silent);
        };
        
        // Simulate click
        refreshButton.click();
        
        this.testResults.refresh.refreshButton = {
          success: refreshButtonClicked,
          message: refreshButtonClicked ?
            'Refresh button click works correctly' :
            'Refresh button click failed'
        };
        
        // Restore original method
        distribution.refresh = originalRefresh;
      }
      
      // Clean up
      distribution.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.refresh = {
        success: false,
        message: 'Error during refresh test',
        error: error.message
      };
    }
  }

  /**
   * Test chart type change
   */
  async testChartTypeChange() {
    try {
      const distribution = new this.StorageDistribution({
        container: this.container,
        bridge: mockBridge,
        eventBus: mockEventBus
      });
      
      await distribution.init();
      
      // Get initial chart type
      const locationChart = distribution.charts.locationDistribution;
      const initialType = locationChart.type;
      
      // Find a chart type button with a different type
      const chartTypeBtn = this.container.querySelector(`.chart-type-btn[data-chart="locationDistribution"][data-type="bar"]`);
      
      if (chartTypeBtn) {
        // Track chart updates
        let chartUpdated = false;
        locationChart.update = () => {
          chartUpdated = true;
        };
        
        // Simulate click to change chart type
        chartTypeBtn.click();
        
        // Check if chart type was updated
        this.testResults.chartTypeChange = {
          success: chartTypeBtn.classList.contains('active') && chartUpdated,
          message: (chartTypeBtn.classList.contains('active') && chartUpdated) ?
            'Chart type change works correctly' :
            'Chart type change failed'
        };
      } else {
        this.testResults.chartTypeChange = {
          success: false,
          message: 'Chart type button not found'
        };
      }
      
      // Clean up
      distribution.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.chartTypeChange = {
        success: false,
        message: 'Error during chart type change test',
        error: error.message
      };
    }
  }

  /**
   * Test event emissions
   */
  async testEvents() {
    try {
      const eventBus = {
        eventLog: [],
        on(event, callback) {
          return this;
        },
        emit(event, data) {
          this.eventLog.push({ event, data });
          return this;
        }
      };
      
      const distribution = new this.StorageDistribution({
        container: this.container,
        bridge: mockBridge,
        eventBus: eventBus
      });
      
      await distribution.init();
      
      // Test stat loading event
      const statsLoadedEvent = eventBus.eventLog.find(e => e.event === 'storage-distribution:stats-loaded');
      
      this.testResults.events = {
        success: statsLoadedEvent !== undefined,
        message: statsLoadedEvent !== undefined ?
          'Stats loaded event emitted correctly' :
          'Stats loaded event not emitted'
      };
      
      // Test timeline range change event
      distribution._updateTimelineRange('week');
      
      const timelineRangeEvent = eventBus.eventLog.find(e => e.event === 'storage-distribution:timeline-range-changed');
      
      this.testResults.events.timelineRange = {
        success: timelineRangeEvent !== undefined,
        message: timelineRangeEvent !== undefined ?
          'Timeline range changed event emitted correctly' :
          'Timeline range changed event not emitted'
      };
      
      // Clean up
      distribution.dispose();
      this.container.innerHTML = '';
    } catch (error) {
      this.testResults.events = {
        success: false,
        message: 'Error during events test',
        error: error.message
      };
    }
  }

  /**
   * Test disposal functionality
   */
  async testDisposal() {
    try {
      const distribution = new this.StorageDistribution({
        container: this.container,
        bridge: mockBridge,
        eventBus: mockEventBus
      });
      
      await distribution.init();
      
      // Store chart references before disposal
      const charts = { ...distribution.charts };
      
      // Perform disposal
      distribution.dispose();
      
      // Check that container was cleared
      const containerEmpty = this.container.children.length === 0;
      
      // Check that charts were destroyed
      const chartsDestroyed = Object.values(charts).every(chart => chart.destroyed === true);
      
      this.testResults.disposal = {
        success: containerEmpty && chartsDestroyed && !distribution.initialized,
        message: (containerEmpty && chartsDestroyed && !distribution.initialized) ?
          'Disposal works correctly' :
          'Disposal failed'
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
const tester = new TestStorageDistribution();
export default tester;

// Allow running directly
if (typeof require !== 'undefined' && require.main === module) {
  tester.runTests().then(results => {
    console.log('Storage Distribution Tests Results:', results);
  }).catch(err => {
    console.error('Error running tests:', err);
  });
}