/**
 * Storage Distribution Visualization Component
 * 
 * Provides interactive visualizations for content storage distribution
 * across different storage backends, types, and sizes.
 * 
 * @module dashboard/content_browser/storage_distribution
 */

/**
 * StorageDistribution class for rendering storage visualizations
 */
export class StorageDistribution {
  /**
   * Create a new StorageDistribution visualization component
   * 
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.container - Container element to render into
   * @param {Object} options.bridge - PyArrow index bridge or secure manager
   * @param {Object} options.eventBus - Event bus for component communication
   * @param {Object} options.chartLibrary - Chart library reference (e.g., Chart.js)
   * @param {Object} options.config - Component configuration
   */
  constructor(options = {}) {
    this.container = options.container;
    this.bridge = options.bridge;
    this.eventBus = options.eventBus || {};
    this.chartLibrary = options.chartLibrary || (typeof window !== 'undefined' ? window.Chart : null);
    
    // Default configuration with overrides from options
    this.config = {
      refreshInterval: 60000, // 1 minute
      enableAnimation: true,
      defaultChartType: 'doughnut',
      chartColors: [
        '#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#f56565',
        '#38b2ac', '#ecc94b', '#667eea', '#f687b3', '#68d391'
      ],
      storageBreakdownLimit: 10, // Max number of storage locations to show before grouping
      darkMode: false,
      ...options.config
    };
    
    // State
    this.initialized = false;
    this.loading = false;
    this.error = null;
    this.stats = null;
    this.charts = {};
    this.refreshTimer = null;
    
    // Bind methods
    this._bindMethods();
  }
  
  /**
   * Bind class methods to maintain context
   * @private
   */
  _bindMethods() {
    this.init = this.init.bind(this);
    this.render = this.render.bind(this);
    this.refresh = this.refresh.bind(this);
    this.renderLocationDistribution = this.renderLocationDistribution.bind(this);
    this.renderTypeDistribution = this.renderTypeDistribution.bind(this);
    this.renderSizeDistribution = this.renderSizeDistribution.bind(this);
    this.renderTimelineDistribution = this.renderTimelineDistribution.bind(this);
    this.dispose = this.dispose.bind(this);
    this._loadStats = this._loadStats.bind(this);
    this._handleChartTypeChange = this._handleChartTypeChange.bind(this);
    this._setupEventListeners = this._setupEventListeners.bind(this);
    this._generateColors = this._generateColors.bind(this);
    this._formatSize = this._formatSize.bind(this);
    this._formatDateRange = this._formatDateRange.bind(this);
  }
  
  /**
   * Initialize the component
   * @returns {Promise<boolean>} Success status
   */
  async init() {
    if (this.initialized) return true;
    
    try {
      this.loading = true;
      this.render();
      
      // Verify bridge is available
      if (!this.bridge) {
        throw new Error('PyArrow index bridge is required');
      }
      
      // Verify chart library is available
      if (!this.chartLibrary) {
        console.warn('Chart library not available. Visualizations will be limited.');
      }
      
      // Load initial stats
      await this._loadStats();
      
      // Set up refresh interval if configured
      if (this.config.refreshInterval && this.config.refreshInterval > 0) {
        this.refreshTimer = setInterval(() => {
          this.refresh(true); // silent refresh
        }, this.config.refreshInterval);
      }
      
      // Set up event listeners
      this._setupEventListeners();
      
      this.initialized = true;
      this.loading = false;
      this.render();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize StorageDistribution:', error);
      this.error = error;
      this.loading = false;
      this.render();
      return false;
    }
  }
  
  /**
   * Load statistics from the bridge
   * @private
   */
  async _loadStats() {
    try {
      const stats = await this.bridge.getStats();
      
      if (!stats) {
        throw new Error('No statistics data available');
      }
      
      this.stats = stats;
      
      // Emit event if event bus is available
      if (this.eventBus.emit) {
        this.eventBus.emit('storage-distribution:stats-loaded', {
          success: true,
          stats: this.stats
        });
      }
    } catch (error) {
      console.error('Failed to load storage statistics:', error);
      
      // Generate mock data for development
      this._generateMockStats();
      
      // Re-throw to indicate failure
      throw error;
    }
  }
  
  /**
   * Generate mock statistics for development/testing
   * @private
   */
  _generateMockStats() {
    this.stats = {
      // Storage location distribution
      location_counts: {
        'IPFS': 156,
        'Hugging Face': 98,
        'Local': 76,
        'S3': 43,
        'Filecoin': 32,
        'Web3.Storage': 25,
        'Pinata': 18,
        'Other': 12
      },
      
      // Storage location sizes (in bytes)
      location_sizes: {
        'IPFS': 5248000000,
        'Hugging Face': 3156000000,
        'Local': 1245000000,
        'S3': 876000000,
        'Filecoin': 432000000,
        'Web3.Storage': 321000000,
        'Pinata': 156000000,
        'Other': 95000000
      },
      
      // Content type distribution
      type_counts: {
        'image/jpeg': 87,
        'application/pdf': 54,
        'application/octet-stream': 42,
        'text/plain': 38,
        'image/png': 25,
        'video/mp4': 12,
        'application/json': 8,
        'other': 14
      },
      
      // Content type sizes (in bytes)
      type_sizes: {
        'video/mp4': 5120000000,
        'application/octet-stream': 2560000000,
        'image/jpeg': 480000000,
        'application/pdf': 240000000,
        'image/png': 120000000,
        'text/plain': 25000000,
        'application/json': 12000000,
        'other': 80000000
      },
      
      // Size distribution
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
      
      // Timeline distribution (last 14 days)
      timeline_distribution: {}
    };
    
    // Generate timeline data
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      
      // Generate a random count with an upward trend
      const baseCount = 5 + Math.floor(i * 0.7);
      const randomVariation = Math.floor(Math.random() * 8) - 4;
      this.stats.timeline_distribution[dateString] = baseCount + randomVariation;
    }
  }
  
  /**
   * Refresh statistics and update visualizations
   * @param {boolean} silent Whether to show loading indicators
   * @returns {Promise<Object>} Updated stats
   */
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
        // Update charts without re-rendering the entire component
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
  
  /**
   * Update existing charts with new data
   * @private
   */
  _updateCharts() {
    // Update each chart if it exists
    Object.keys(this.charts).forEach(chartId => {
      const chart = this.charts[chartId];
      if (!chart) return;
      
      if (chartId === 'locationDistribution') {
        this._updateLocationChart(chart);
      } else if (chartId === 'typeDistribution') {
        this._updateTypeChart(chart);
      } else if (chartId === 'sizeDistribution') {
        this._updateSizeChart(chart);
      } else if (chartId === 'timelineDistribution') {
        this._updateTimelineChart(chart);
      }
    });
  }
  
  /**
   * Update the location distribution chart
   * @param {Object} chart Chart instance
   * @private
   */
  _updateLocationChart(chart) {
    if (!this.stats || !this.stats.location_counts) return;
    
    // Get location data
    const locations = Object.keys(this.stats.location_counts);
    const counts = locations.map(loc => this.stats.location_counts[loc]);
    
    // Update chart data
    chart.data.labels = locations;
    chart.data.datasets[0].data = counts;
    
    // Update background colors if there's a change in number of items
    if (chart.data.datasets[0].backgroundColor.length !== locations.length) {
      chart.data.datasets[0].backgroundColor = this._generateColors(locations.length);
    }
    
    chart.update();
  }
  
  /**
   * Update the type distribution chart
   * @param {Object} chart Chart instance
   * @private
   */
  _updateTypeChart(chart) {
    if (!this.stats || !this.stats.type_counts) return;
    
    // Get type data
    const types = Object.keys(this.stats.type_counts);
    const counts = types.map(type => this.stats.type_counts[type]);
    
    // Update chart data
    chart.data.labels = types;
    chart.data.datasets[0].data = counts;
    
    // Update background colors if there's a change in number of items
    if (chart.data.datasets[0].backgroundColor.length !== types.length) {
      chart.data.datasets[0].backgroundColor = this._generateColors(types.length);
    }
    
    chart.update();
  }
  
  /**
   * Update the size distribution chart
   * @param {Object} chart Chart instance
   * @private
   */
  _updateSizeChart(chart) {
    if (!this.stats || !this.stats.size_distribution) return;
    
    // Get size data
    const sizes = Object.keys(this.stats.size_distribution);
    const counts = sizes.map(size => this.stats.size_distribution[size]);
    
    // Update chart data
    chart.data.labels = sizes;
    chart.data.datasets[0].data = counts;
    
    chart.update();
  }
  
  /**
   * Update the timeline distribution chart
   * @param {Object} chart Chart instance
   * @private
   */
  _updateTimelineChart(chart) {
    if (!this.stats || !this.stats.timeline_distribution) return;
    
    // Get timeline data
    const dates = Object.keys(this.stats.timeline_distribution).sort();
    const counts = dates.map(date => this.stats.timeline_distribution[date]);
    
    // Update chart data
    chart.data.labels = dates;
    chart.data.datasets[0].data = counts;
    
    chart.update();
  }
  
  /**
   * Render the component
   */
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
      
      // Add retry button click handler
      const retryButton = errorMessage.querySelector('.retry-button');
      if (retryButton) {
        retryButton.addEventListener('click', () => {
          this.error = null;
          this.refresh();
        });
      }
      
      wrapper.appendChild(errorMessage);
      this.container.appendChild(wrapper);
      return;
    }
    
    // If no chart library, show info message
    if (!this.chartLibrary && typeof window !== 'undefined') {
      const infoMessage = document.createElement('div');
      infoMessage.className = 'info-message';
      infoMessage.innerHTML = `
        <i class="fas fa-info-circle"></i>
        <h3>Chart Library Not Available</h3>
        <p>
          Please include Chart.js to enable interactive visualizations. 
          <a href="https://www.chartjs.org/docs/latest/getting-started/installation.html" target="_blank">
            Learn more
          </a>
        </p>
      `;
      wrapper.appendChild(infoMessage);
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
      
      // Add refresh button click handler
      const refreshButton = emptyState.querySelector('.refresh-button');
      if (refreshButton) {
        refreshButton.addEventListener('click', () => this.refresh());
      }
      
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
    
    // Add refresh button click handler
    const refreshButton = header.querySelector('.refresh-button');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => this.refresh());
    }
    
    wrapper.appendChild(header);
    
    // Create grid layout for charts
    const chartsGrid = document.createElement('div');
    chartsGrid.className = 'storage-distribution-grid';
    
    // Storage location distribution chart
    const locationChartContainer = document.createElement('div');
    locationChartContainer.className = 'chart-container location-distribution';
    locationChartContainer.innerHTML = `
      <div class="chart-header">
        <h3>Storage Location Distribution</h3>
        <div class="chart-controls">
          <div class="chart-type-selector">
            <button class="chart-type-btn active" data-chart="locationDistribution" data-type="doughnut">
              <i class="fas fa-chart-pie"></i>
            </button>
            <button class="chart-type-btn" data-chart="locationDistribution" data-type="pie">
              <i class="fas fa-circle"></i>
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
      <div class="chart-legend-container"></div>
    `;
    
    // Content type distribution chart
    const typeChartContainer = document.createElement('div');
    typeChartContainer.className = 'chart-container type-distribution';
    typeChartContainer.innerHTML = `
      <div class="chart-header">
        <h3>Content Type Distribution</h3>
        <div class="chart-controls">
          <div class="chart-type-selector">
            <button class="chart-type-btn active" data-chart="typeDistribution" data-type="doughnut">
              <i class="fas fa-chart-pie"></i>
            </button>
            <button class="chart-type-btn" data-chart="typeDistribution" data-type="bar">
              <i class="fas fa-chart-bar"></i>
            </button>
          </div>
          <div class="chart-view-selector">
            <button class="chart-view-btn active" data-chart="typeDistribution" data-view="count">
              Count
            </button>
            <button class="chart-view-btn" data-chart="typeDistribution" data-view="size">
              Size
            </button>
          </div>
        </div>
      </div>
      <div class="chart-body">
        <canvas id="typeDistributionChart"></canvas>
      </div>
      <div class="chart-legend-container"></div>
    `;
    
    // Size distribution chart
    const sizeChartContainer = document.createElement('div');
    sizeChartContainer.className = 'chart-container size-distribution';
    sizeChartContainer.innerHTML = `
      <div class="chart-header">
        <h3>Content Size Distribution</h3>
        <div class="chart-controls">
          <div class="chart-type-selector">
            <button class="chart-type-btn active" data-chart="sizeDistribution" data-type="bar">
              <i class="fas fa-chart-bar"></i>
            </button>
            <button class="chart-type-btn" data-chart="sizeDistribution" data-type="pie">
              <i class="fas fa-chart-pie"></i>
            </button>
          </div>
        </div>
      </div>
      <div class="chart-body">
        <canvas id="sizeDistributionChart"></canvas>
      </div>
    `;
    
    // Timeline distribution chart
    const timelineChartContainer = document.createElement('div');
    timelineChartContainer.className = 'chart-container timeline-distribution';
    timelineChartContainer.innerHTML = `
      <div class="chart-header">
        <h3>Content Timeline</h3>
        <div class="chart-controls">
          <div class="chart-type-selector">
            <button class="chart-type-btn active" data-chart="timelineDistribution" data-type="line">
              <i class="fas fa-chart-line"></i>
            </button>
            <button class="chart-type-btn" data-chart="timelineDistribution" data-type="bar">
              <i class="fas fa-chart-bar"></i>
            </button>
          </div>
          <div class="time-range-selector">
            <select id="timeRangeSelector">
              <option value="all">All Time</option>
              <option value="week" selected>Last Week</option>
              <option value="month">Last Month</option>
              <option value="quarter">Last Quarter</option>
              <option value="year">Last Year</option>
            </select>
          </div>
        </div>
      </div>
      <div class="chart-body">
        <canvas id="timelineDistributionChart"></canvas>
      </div>
    `;
    
    // Add charts to grid
    chartsGrid.appendChild(locationChartContainer);
    chartsGrid.appendChild(typeChartContainer);
    chartsGrid.appendChild(sizeChartContainer);
    chartsGrid.appendChild(timelineChartContainer);
    
    wrapper.appendChild(chartsGrid);
    
    // Add summary panel with key statistics
    const summaryPanel = document.createElement('div');
    summaryPanel.className = 'storage-summary-panel';
    
    // Calculate total stats
    const totalFiles = Object.values(this.stats.location_counts || {}).reduce((sum, count) => sum + count, 0);
    const totalSize = Object.values(this.stats.location_sizes || {}).reduce((sum, size) => sum + size, 0);
    
    // Find primary storage location
    let primaryLocation = 'None';
    let primaryLocationSize = 0;
    if (this.stats.location_sizes) {
      Object.entries(this.stats.location_sizes).forEach(([location, size]) => {
        if (size > primaryLocationSize) {
          primaryLocation = location;
          primaryLocationSize = size;
        }
      });
    }
    
    // Find most common content type
    let mostCommonType = 'None';
    let mostCommonTypeCount = 0;
    if (this.stats.type_counts) {
      Object.entries(this.stats.type_counts).forEach(([type, count]) => {
        if (count > mostCommonTypeCount) {
          mostCommonType = type;
          mostCommonTypeCount = count;
        }
      });
    }
    
    // Summary content
    summaryPanel.innerHTML = `
      <h3>Storage Summary</h3>
      <div class="summary-stats">
        <div class="summary-stat-item">
          <div class="stat-value">${totalFiles.toLocaleString()}</div>
          <div class="stat-label">Total Files</div>
        </div>
        <div class="summary-stat-item">
          <div class="stat-value">${this._formatSize(totalSize)}</div>
          <div class="stat-label">Total Size</div>
        </div>
        <div class="summary-stat-item">
          <div class="stat-value">${primaryLocation}</div>
          <div class="stat-label">Primary Storage</div>
          <div class="stat-detail">${this._formatSize(primaryLocationSize)} (${Math.round(primaryLocationSize / totalSize * 100)}%)</div>
        </div>
        <div class="summary-stat-item">
          <div class="stat-value">${mostCommonType}</div>
          <div class="stat-label">Most Common Type</div>
          <div class="stat-detail">${mostCommonTypeCount.toLocaleString()} files (${Math.round(mostCommonTypeCount / totalFiles * 100)}%)</div>
        </div>
      </div>
    `;
    
    wrapper.appendChild(summaryPanel);
    
    // Add the wrapper to the container
    this.container.appendChild(wrapper);
    
    // Render charts
    if (this.chartLibrary) {
      this.renderLocationDistribution();
      this.renderTypeDistribution();
      this.renderSizeDistribution();
      this.renderTimelineDistribution();
    }
    
    // Set up chart type button handlers
    this.container.querySelectorAll('.chart-type-btn').forEach(button => {
      button.addEventListener('click', this._handleChartTypeChange);
    });
    
    // Set up chart view button handlers
    this.container.querySelectorAll('.chart-view-btn').forEach(button => {
      button.addEventListener('click', (event) => {
        const chartId = event.target.dataset.chart;
        const view = event.target.dataset.view;
        
        // Update button states
        this.container.querySelectorAll(`.chart-view-btn[data-chart="${chartId}"]`).forEach(btn => {
          btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // Update the chart based on the view
        if (chartId === 'typeDistribution') {
          this._updateTypeDistributionView(view);
        }
      });
    });
    
    // Set up timeline range selector
    const timeRangeSelector = this.container.querySelector('#timeRangeSelector');
    if (timeRangeSelector) {
      timeRangeSelector.addEventListener('change', () => {
        this._updateTimelineRange(timeRangeSelector.value);
      });
    }
  }
  
  /**
   * Render the location distribution chart
   */
  renderLocationDistribution() {
    const canvas = document.getElementById('locationDistributionChart');
    if (!canvas || !this.chartLibrary || !this.stats) return;
    
    // Clean up previous chart
    if (this.charts.locationDistribution) {
      this.charts.locationDistribution.destroy();
      this.charts.locationDistribution = null;
    }
    
    // Prepare data
    let locations = [];
    let counts = [];
    
    if (this.stats.location_counts) {
      // Sort by count in descending order
      const sortedLocations = Object.entries(this.stats.location_counts)
        .sort((a, b) => b[1] - a[1]);
      
      // If we have too many locations, group smaller ones
      if (sortedLocations.length > this.config.storageBreakdownLimit) {
        // Take top N locations
        const topLocations = sortedLocations.slice(0, this.config.storageBreakdownLimit - 1);
        
        // Group the rest as "Other"
        const otherLocations = sortedLocations.slice(this.config.storageBreakdownLimit - 1);
        const otherCount = otherLocations.reduce((sum, [_, count]) => sum + count, 0);
        
        // Update data arrays
        locations = topLocations.map(([location, _]) => location);
        counts = topLocations.map(([_, count]) => count);
        
        // Add "Other" category
        locations.push('Other');
        counts.push(otherCount);
      } else {
        // Use all locations
        locations = sortedLocations.map(([location, _]) => location);
        counts = sortedLocations.map(([_, count]) => count);
      }
    }
    
    // Generate colors
    const colors = this._generateColors(locations.length);
    
    // Create chart
    const ctx = canvas.getContext('2d');
    this.charts.locationDistribution = new this.chartLibrary(ctx, {
      type: 'doughnut',
      data: {
        labels: locations,
        datasets: [{
          data: counts,
          backgroundColor: colors,
          borderColor: this.config.darkMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.8)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: this.config.enableAnimation ? 1000 : 0,
          easing: 'easeOutQuart'
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 20,
              boxWidth: 12,
              color: this.config.darkMode ? '#ffffff' : '#333333'
            },
            onClick: (event, legendItem, legend) => {
              // Handle legend click (show/hide)
              const index = legendItem.index;
              const meta = legend.chart.getDatasetMeta(0);
              
              meta.data[index].hidden = !meta.data[index].hidden;
              legend.chart.update();
              
              // Update custom legend (if we add one)
              this._updateCustomLegend('locationDistribution');
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.raw || 0;
                const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                const percentage = Math.round((value / total) * 100);
                return `${label}: ${value.toLocaleString()} (${percentage}%)`;
              }
            }
          }
        },
        onClick: (event, elements, chart) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const location = locations[index];
            
            // Emit click event if event bus is available
            if (this.eventBus.emit) {
              this.eventBus.emit('storage-distribution:location-clicked', {
                location,
                count: counts[index]
              });
            }
          }
        }
      }
    });
    
    // Update custom legend (if we implement one)
    this._updateCustomLegend('locationDistribution');
  }
  
  /**
   * Render the content type distribution chart
   */
  renderTypeDistribution() {
    const canvas = document.getElementById('typeDistributionChart');
    if (!canvas || !this.chartLibrary || !this.stats) return;
    
    // Clean up previous chart
    if (this.charts.typeDistribution) {
      this.charts.typeDistribution.destroy();
      this.charts.typeDistribution = null;
    }
    
    // Prepare data
    let types = [];
    let counts = [];
    
    if (this.stats.type_counts) {
      // Sort by count in descending order
      const sortedTypes = Object.entries(this.stats.type_counts)
        .sort((a, b) => b[1] - a[1]);
      
      // If we have too many types, group smaller ones
      if (sortedTypes.length > this.config.storageBreakdownLimit) {
        // Take top N types
        const topTypes = sortedTypes.slice(0, this.config.storageBreakdownLimit - 1);
        
        // Group the rest as "Other"
        const otherTypes = sortedTypes.slice(this.config.storageBreakdownLimit - 1);
        const otherCount = otherTypes.reduce((sum, [_, count]) => sum + count, 0);
        
        // Update data arrays
        types = topTypes.map(([type, _]) => type);
        counts = topTypes.map(([_, count]) => count);
        
        // Add "Other" category
        types.push('Other');
        counts.push(otherCount);
      } else {
        // Use all types
        types = sortedTypes.map(([type, _]) => type);
        counts = sortedTypes.map(([_, count]) => count);
      }
    }
    
    // Generate colors
    const colors = this._generateColors(types.length);
    
    // Create chart
    const ctx = canvas.getContext('2d');
    this.charts.typeDistribution = new this.chartLibrary(ctx, {
      type: 'doughnut',
      data: {
        labels: types,
        datasets: [{
          data: counts,
          backgroundColor: colors,
          borderColor: this.config.darkMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.8)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: this.config.enableAnimation ? 1000 : 0,
          easing: 'easeOutQuart'
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 20,
              boxWidth: 12,
              color: this.config.darkMode ? '#ffffff' : '#333333'
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.raw || 0;
                const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                const percentage = Math.round((value / total) * 100);
                return `${label}: ${value.toLocaleString()} (${percentage}%)`;
              }
            }
          }
        },
        onClick: (event, elements, chart) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const type = types[index];
            
            // Emit click event if event bus is available
            if (this.eventBus.emit) {
              this.eventBus.emit('storage-distribution:type-clicked', {
                type,
                count: counts[index]
              });
            }
          }
        }
      }
    });
  }
  
  /**
   * Update the type distribution chart view (count vs size)
   * @param {string} view View type ('count' or 'size')
   * @private
   */
  _updateTypeDistributionView(view) {
    if (!this.charts.typeDistribution || !this.stats) return;
    
    const chart = this.charts.typeDistribution;
    
    if (view === 'count' && this.stats.type_counts) {
      // Sort by count in descending order
      const sortedTypes = Object.entries(this.stats.type_counts)
        .sort((a, b) => b[1] - a[1]);
      
      // Update chart data based on grouping logic
      let types = [];
      let counts = [];
      
      if (sortedTypes.length > this.config.storageBreakdownLimit) {
        // Take top N types
        const topTypes = sortedTypes.slice(0, this.config.storageBreakdownLimit - 1);
        
        // Group the rest as "Other"
        const otherTypes = sortedTypes.slice(this.config.storageBreakdownLimit - 1);
        const otherCount = otherTypes.reduce((sum, [_, count]) => sum + count, 0);
        
        // Update data arrays
        types = topTypes.map(([type, _]) => type);
        counts = topTypes.map(([_, count]) => count);
        
        // Add "Other" category
        types.push('Other');
        counts.push(otherCount);
      } else {
        // Use all types
        types = sortedTypes.map(([type, _]) => type);
        counts = sortedTypes.map(([_, count]) => count);
      }
      
      chart.data.labels = types;
      chart.data.datasets[0].data = counts;
      
      // Update tooltip callback
      chart.options.plugins.tooltip.callbacks.label = (context) => {
        const label = context.label || '';
        const value = context.raw || 0;
        const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
        const percentage = Math.round((value / total) * 100);
        return `${label}: ${value.toLocaleString()} files (${percentage}%)`;
      };
    } else if (view === 'size' && this.stats.type_sizes) {
      // Sort by size in descending order
      const sortedTypes = Object.entries(this.stats.type_sizes)
        .sort((a, b) => b[1] - a[1]);
      
      // Update chart data based on grouping logic
      let types = [];
      let sizes = [];
      
      if (sortedTypes.length > this.config.storageBreakdownLimit) {
        // Take top N types
        const topTypes = sortedTypes.slice(0, this.config.storageBreakdownLimit - 1);
        
        // Group the rest as "Other"
        const otherTypes = sortedTypes.slice(this.config.storageBreakdownLimit - 1);
        const otherSize = otherTypes.reduce((sum, [_, size]) => sum + size, 0);
        
        // Update data arrays
        types = topTypes.map(([type, _]) => type);
        sizes = topTypes.map(([_, size]) => size);
        
        // Add "Other" category
        types.push('Other');
        sizes.push(otherSize);
      } else {
        // Use all types
        types = sortedTypes.map(([type, _]) => type);
        sizes = sortedTypes.map(([_, size]) => size);
      }
      
      chart.data.labels = types;
      chart.data.datasets[0].data = sizes;
      
      // Update tooltip callback
      chart.options.plugins.tooltip.callbacks.label = (context) => {
        const label = context.label || '';
        const value = context.raw || 0;
        const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
        const percentage = Math.round((value / total) * 100);
        return `${label}: ${this._formatSize(value)} (${percentage}%)`;
      };
    }
    
    // Update background colors if there's a change in number of items
    if (chart.data.datasets[0].backgroundColor.length !== chart.data.labels.length) {
      chart.data.datasets[0].backgroundColor = this._generateColors(chart.data.labels.length);
    }
    
    // Update the chart
    chart.update();
  }
  
  /**
   * Render the size distribution chart
   */
  renderSizeDistribution() {
    const canvas = document.getElementById('sizeDistributionChart');
    if (!canvas || !this.chartLibrary || !this.stats) return;
    
    // Clean up previous chart
    if (this.charts.sizeDistribution) {
      this.charts.sizeDistribution.destroy();
      this.charts.sizeDistribution = null;
    }
    
    // Prepare data
    let sizes = [];
    let counts = [];
    
    if (this.stats.size_distribution) {
      // Sort by size ranges in ascending order (preserve the order)
      const sortedSizes = Object.entries(this.stats.size_distribution);
      
      // Use all size ranges
      sizes = sortedSizes.map(([size, _]) => size);
      counts = sortedSizes.map(([_, count]) => count);
    }
    
    // Create chart
    const ctx = canvas.getContext('2d');
    this.charts.sizeDistribution = new this.chartLibrary(ctx, {
      type: 'bar',
      data: {
        labels: sizes,
        datasets: [{
          label: 'Number of Files',
          data: counts,
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: this.config.enableAnimation ? 1000 : 0,
          easing: 'easeOutQuart'
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: this.config.darkMode ? '#cccccc' : '#666666'
            },
            grid: {
              color: this.config.darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
            }
          },
          x: {
            ticks: {
              color: this.config.darkMode ? '#cccccc' : '#666666',
              autoSkip: false,
              maxRotation: 45,
              minRotation: 45
            },
            grid: {
              color: this.config.darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                return `${context.raw.toLocaleString()} files`;
              }
            }
          }
        },
        onClick: (event, elements, chart) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const size = sizes[index];
            
            // Emit click event if event bus is available
            if (this.eventBus.emit) {
              this.eventBus.emit('storage-distribution:size-clicked', {
                sizeRange: size,
                count: counts[index]
              });
            }
          }
        }
      }
    });
  }
  
  /**
   * Render the timeline distribution chart
   */
  renderTimelineDistribution() {
    const canvas = document.getElementById('timelineDistributionChart');
    if (!canvas || !this.chartLibrary || !this.stats) return;
    
    // Clean up previous chart
    if (this.charts.timelineDistribution) {
      this.charts.timelineDistribution.destroy();
      this.charts.timelineDistribution = null;
    }
    
    // Prepare data
    let dates = [];
    let counts = [];
    
    if (this.stats.timeline_distribution) {
      // Sort dates in ascending order
      dates = Object.keys(this.stats.timeline_distribution).sort();
      counts = dates.map(date => this.stats.timeline_distribution[date]);
    }
    
    // Get selected time range
    const timeRangeSelector = document.getElementById('timeRangeSelector');
    const selectedRange = timeRangeSelector ? timeRangeSelector.value : 'week';
    
    // Filter data based on time range if not "all"
    if (selectedRange !== 'all' && dates.length > 0) {
      const filteredData = this._filterTimelineByRange(dates, counts, selectedRange);
      dates = filteredData.dates;
      counts = filteredData.counts;
    }
    
    // Format dates for display
    const formattedDates = dates.map(date => {
      const d = new Date(date);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });
    
    // Create chart
    const ctx = canvas.getContext('2d');
    this.charts.timelineDistribution = new this.chartLibrary(ctx, {
      type: 'line',
      data: {
        labels: formattedDates,
        datasets: [{
          label: 'Files Added',
          data: counts,
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: this.config.enableAnimation ? 1000 : 0,
          easing: 'easeOutQuart'
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
              color: this.config.darkMode ? '#cccccc' : '#666666'
            },
            grid: {
              color: this.config.darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
            }
          },
          x: {
            ticks: {
              color: this.config.darkMode ? '#cccccc' : '#666666',
              maxRotation: 45,
              minRotation: 45
            },
            grid: {
              color: this.config.darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              title: (context) => {
                const index = context[0].dataIndex;
                return dates[index]; // Show full date in tooltip
              },
              label: (context) => {
                return `Files Added: ${context.raw.toLocaleString()}`;
              }
            }
          }
        }
      }
    });
  }
  
  /**
   * Update the timeline range
   * @param {string} range Selected time range (all, week, month, quarter, year)
   * @private
   */
  _updateTimelineRange(range) {
    if (!this.charts.timelineDistribution || !this.stats) return;
    
    const chart = this.charts.timelineDistribution;
    
    // Prepare all data
    let dates = [];
    let counts = [];
    
    if (this.stats.timeline_distribution) {
      // Sort dates in ascending order
      dates = Object.keys(this.stats.timeline_distribution).sort();
      counts = dates.map(date => this.stats.timeline_distribution[date]);
    }
    
    // Filter data based on time range if not "all"
    if (range !== 'all' && dates.length > 0) {
      const filteredData = this._filterTimelineByRange(dates, counts, range);
      dates = filteredData.dates;
      counts = filteredData.counts;
    }
    
    // Format dates for display
    const formattedDates = dates.map(date => {
      const d = new Date(date);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });
    
    // Update chart data
    chart.data.labels = formattedDates;
    chart.data.datasets[0].data = counts;
    
    // Update chart
    chart.update();
    
    // Emit event if eventBus is available
    if (this.eventBus.emit) {
      this.eventBus.emit('storage-distribution:timeline-range-changed', {
        range,
        dateRange: this._formatDateRange(dates)
      });
    }
  }
  
  /**
   * Filter timeline data by range
   * @param {string[]} dates Date strings in ISO format
   * @param {number[]} counts Count values
   * @param {string} range Range to filter ('week', 'month', 'quarter', 'year')
   * @returns {Object} Filtered data {dates, counts}
   * @private
   */
  _filterTimelineByRange(dates, counts, range) {
    // Get the end date (usually the latest date in the data)
    const endDate = new Date(dates[dates.length - 1]);
    
    // Calculate start date based on range
    let startDate = new Date(endDate);
    
    switch (range) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }
    
    // Convert start date to string for comparison
    const startDateStr = startDate.toISOString().split('T')[0];
    
    // Filter dates and counts
    const filteredIndices = dates.map((date, index) => ({ date, index }))
      .filter(item => item.date >= startDateStr)
      .map(item => item.index);
    
    const filteredDates = filteredIndices.map(index => dates[index]);
    const filteredCounts = filteredIndices.map(index => counts[index]);
    
    return { dates: filteredDates, counts: filteredCounts };
  }
  
  /**
   * Format a date range for display
   * @param {string[]} dates Array of date strings
   * @returns {string} Formatted date range
   * @private
   */
  _formatDateRange(dates) {
    if (!dates || dates.length === 0) {
      return 'No dates available';
    }
    
    if (dates.length === 1) {
      return new Date(dates[0]).toLocaleDateString();
    }
    
    const startDate = new Date(dates[0]);
    const endDate = new Date(dates[dates.length - 1]);
    
    return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
  }
  
  /**
   * Handle chart type change
   * @param {Event} event Click event
   * @private
   */
  _handleChartTypeChange(event) {
    const button = event.currentTarget;
    const chartId = button.dataset.chart;
    const chartType = button.dataset.type;
    
    // Update button states
    this.container.querySelectorAll(`.chart-type-btn[data-chart="${chartId}"]`).forEach(btn => {
      btn.classList.remove('active');
    });
    button.classList.add('active');
    
    // Update chart type
    const chart = this.charts[chartId];
    if (chart) {
      chart.config.type = chartType;
      
      // Additional configurations based on chart type
      if (chartId === 'locationDistribution' || chartId === 'typeDistribution') {
        if (chartType === 'bar') {
          // Configure horizontal bar chart for locations/types
          chart.options.indexAxis = 'y';
          chart.options.scales = {
            x: {
              beginAtZero: true,
              ticks: {
                color: this.config.darkMode ? '#cccccc' : '#666666'
              },
              grid: {
                color: this.config.darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
              }
            },
            y: {
              ticks: {
                color: this.config.darkMode ? '#cccccc' : '#666666'
              },
              grid: {
                color: this.config.darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
              }
            }
          };
          
          // Show single dataset legend
          chart.options.plugins.legend.display = false;
        } else {
          // Reset for pie/doughnut
          delete chart.options.indexAxis;
          delete chart.options.scales;
          
          // Show legend for pie/doughnut
          chart.options.plugins.legend.display = true;
          chart.options.plugins.legend.position = 'bottom';
        }
      } else if (chartId === 'sizeDistribution') {
        if (chartType === 'pie' || chartType === 'doughnut') {
          // Configure for pie/doughnut
          delete chart.options.scales;
          
          // Show legend
          chart.options.plugins.legend.display = true;
          chart.options.plugins.legend.position = 'bottom';
        } else {
          // Reset for bar chart
          chart.options.scales = {
            y: {
              beginAtZero: true,
              ticks: {
                color: this.config.darkMode ? '#cccccc' : '#666666'
              },
              grid: {
                color: this.config.darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
              }
            },
            x: {
              ticks: {
                color: this.config.darkMode ? '#cccccc' : '#666666',
                autoSkip: false,
                maxRotation: 45,
                minRotation: 45
              },
              grid: {
                color: this.config.darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
              }
            }
          };
          
          // Hide legend for bar chart
          chart.options.plugins.legend.display = false;
        }
      } else if (chartId === 'timelineDistribution') {
        if (chartType === 'line') {
          // Configure for line chart
          chart.data.datasets[0].tension = 0.4;
          chart.data.datasets[0].fill = true;
        } else {
          // Reset for bar chart
          chart.data.datasets[0].tension = 0;
          chart.data.datasets[0].fill = false;
        }
      }
      
      chart.update();
      
      // Emit event if eventBus is available
      if (this.eventBus.emit) {
        this.eventBus.emit('storage-distribution:chart-type-changed', {
          chartId,
          chartType
        });
      }
    }
  }
  
  /**
   * Update custom legend for a chart
   * @param {string} chartId Chart ID
   * @private
   */
  _updateCustomLegend(chartId) {
    // This would implement custom interactive legends
    // For now, we're using the built-in Chart.js legends
  }
  
  /**
   * Set up event listeners for the component
   * @private
   */
  _setupEventListeners() {
    // Listen for events on eventBus if available
    if (this.eventBus.on) {
      // Listen for real-time updates that might affect stats
      this.eventBus.on('content-index-updated', () => {
        this.refresh(true); // silent refresh
      });
      
      // Listen for dark mode toggle if implemented
      this.eventBus.on('theme-changed', (data) => {
        if (data && typeof data.darkMode !== 'undefined') {
          this.config.darkMode = data.darkMode;
          this.render();
        }
      });
    }
  }
  
  /**
   * Generate colors for charts
   * @param {number} count Number of colors needed
   * @returns {string[]} Array of color strings
   * @private
   */
  _generateColors(count) {
    if (count <= 0) return [];
    
    // Use configured colors
    const baseColors = this.config.chartColors;
    
    if (count <= baseColors.length) {
      return baseColors.slice(0, count);
    }
    
    // If we need more colors than are defined, generate them
    const colors = [...baseColors];
    
    // Generate additional colors by adjusting opacity of base colors
    for (let i = baseColors.length; i < count; i++) {
      const baseColor = baseColors[i % baseColors.length];
      const opacity = 0.7 - ((Math.floor(i / baseColors.length) * 0.2) % 0.6); // Cycle through opacities
      
      // Parse base color
      const r = parseInt(baseColor.substring(1, 3), 16);
      const g = parseInt(baseColor.substring(3, 5), 16);
      const b = parseInt(baseColor.substring(5, 7), 16);
      
      colors.push(`rgba(${r}, ${g}, ${b}, ${opacity})`);
    }
    
    return colors;
  }
  
  /**
   * Format bytes as human-readable size
   * @param {number} bytes Number of bytes
   * @returns {string} Formatted size string
   * @private
   */
  _formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Clean up resources
   */
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
}

export default StorageDistribution;