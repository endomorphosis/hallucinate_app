/**
 * Metrics Dashboard Component
 * Visualizes metrics collected from all dashboard components
 */

import { getMetricsService } from './metrics_registry.js';
import PrometheusConnectionPanel from './prometheus_connection_panel.js';

class MetricsDashboard {
  /**
   * Create a new metrics dashboard
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.container - Container element
   * @param {Object} options.eventBus - Event bus for communication
   */
  constructor(options = {}) {
    this.container = options.container;
    this.eventBus = options.eventBus || { on: () => {}, emit: () => {} };
    this.options = {
      refreshInterval: 5000, // 5 seconds
      darkMode: false,
      showAllMetrics: false,
      prometheus: {
        enabled: true,
        port: 9091,
        endpoint: '/metrics'
      },
      ...options
    };
    
    // Component state
    this.initialized = false;
    this.refreshIntervalId = null;
    this.charts = new Map();
    this.collapsedSections = new Set();
    this.filterText = '';
    this.selectedComponent = 'all';
    this.selectedMetricType = 'all';
    this.lastMetricsData = null;
    this.prometheusPanel = null;
    
    // Bind methods
    this._handleRefresh = this._handleRefresh.bind(this);
    this._handleFilterChange = this._handleFilterChange.bind(this);
    this._handleComponentSelect = this._handleComponentSelect.bind(this);
    this._handleMetricTypeSelect = this._handleMetricTypeSelect.bind(this);
    this._handleSectionToggle = this._handleSectionToggle.bind(this);
    this._handleSort = this._handleSort.bind(this);
    this._handleExport = this._handleExport.bind(this);
  }
  
  /**
   * Initialize the metrics dashboard
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;
    
    try {
      // Ensure we have access to the metrics service
      this.metricsService = getMetricsService();
      
      // Set up the dashboard UI
      this._setupDashboard();
      
      // Load Chart.js if we'll be showing charts
      if (this.options.showCharts !== false) {
        await this._loadChartJs();
      }
      
      // Initialize Prometheus panel if enabled
      if (this.options.prometheus?.enabled) {
        await this._setupPrometheusPanel();
      }
      
      // Initial data load
      await this._loadData();
      
      // Set up refresh interval
      this._startRefresh();
      
      // Register for metrics events
      this.metricsService.addEventListener('metrics-report', this._handleMetricsReport.bind(this));
      
      this.initialized = true;
      
      return true;
    } catch (error) {
      console.error('Failed to initialize metrics dashboard:', error);
      
      // Show error in container
      if (this.container) {
        this.container.innerHTML = `
          <div class="metrics-error">
            <h3>Error Initializing Metrics Dashboard</h3>
            <p>${error.message}</p>
          </div>
        `;
      }
      
      throw error;
    }
  }
  
  /**
   * Set up the dashboard UI
   * @private
   */
  _setupDashboard() {
    if (!this.container) {
      throw new Error('Container element is required');
    }
    
    // Apply initial classes
    this.container.classList.add('metrics-dashboard');
    
    if (this.options.darkMode) {
      this.container.classList.add('dark-mode');
    }
    
    // Create dashboard structure
    this.container.innerHTML = `
      <div class="metrics-dashboard-header">
        <h2>Metrics Dashboard</h2>
        <div class="metrics-controls">
          <div class="metrics-filter">
            <input type="text" id="metrics-filter" placeholder="Filter metrics...">
          </div>
          <div class="metrics-selectors">
            <select id="component-selector">
              <option value="all">All Components</option>
            </select>
            <select id="metric-type-selector">
              <option value="all">All Metrics</option>
              <option value="counters">Counters</option>
              <option value="gauges">Gauges</option>
              <option value="histograms">Histograms</option>
            </select>
          </div>
          <div class="metrics-actions">
            <button id="metrics-refresh" title="Refresh Metrics">
              <i class="fa fa-sync"></i> Refresh
            </button>
            <button id="metrics-export" title="Export Metrics">
              <i class="fa fa-download"></i> Export
            </button>
          </div>
        </div>
      </div>
      
      <div class="metrics-dashboard-stats">
        <div class="metrics-stat">
          <span class="metrics-stat-value" id="metrics-component-count">0</span>
          <span class="metrics-stat-label">Components</span>
        </div>
        <div class="metrics-stat">
          <span class="metrics-stat-value" id="metrics-total-count">0</span>
          <span class="metrics-stat-label">Total Metrics</span>
        </div>
        <div class="metrics-stat">
          <span class="metrics-stat-value" id="metrics-counter-count">0</span>
          <span class="metrics-stat-label">Counters</span>
        </div>
        <div class="metrics-stat">
          <span class="metrics-stat-value" id="metrics-gauge-count">0</span>
          <span class="metrics-stat-label">Gauges</span>
        </div>
        <div class="metrics-stat">
          <span class="metrics-stat-value" id="metrics-histogram-count">0</span>
          <span class="metrics-stat-label">Histograms</span>
        </div>
        <div class="metrics-stat">
          <span class="metrics-stat-value" id="metrics-last-update">-</span>
          <span class="metrics-stat-label">Last Update</span>
        </div>
      </div>
      
      <div class="metrics-dashboard-charts">
        <div class="metrics-chart-container">
          <h3>Component Metrics Distribution</h3>
          <div class="chart-container">
            <canvas id="component-metrics-chart"></canvas>
          </div>
        </div>
        <div class="metrics-chart-container">
          <h3>Top Counters</h3>
          <div class="chart-container">
            <canvas id="top-counters-chart"></canvas>
          </div>
        </div>
        <div class="metrics-chart-container">
          <h3>Operation Durations</h3>
          <div class="chart-container">
            <canvas id="operation-durations-chart"></canvas>
          </div>
        </div>
      </div>
      
      <div class="metrics-dashboard-content">
        <!-- Metrics tables will be inserted here -->
        <div class="metrics-loading">
          <div class="spinner"></div>
          <p>Loading metrics data...</p>
        </div>
      </div>
    `;
    
    // Add event listeners
    this._addEventListeners();
  }
  
  /**
   * Add event listeners for dashboard controls
   * @private
   */
  _addEventListeners() {
    // Refresh button
    const refreshButton = this.container.querySelector('#metrics-refresh');
    if (refreshButton) {
      refreshButton.addEventListener('click', this._handleRefresh);
    }
    
    // Export button
    const exportButton = this.container.querySelector('#metrics-export');
    if (exportButton) {
      exportButton.addEventListener('click', this._handleExport);
    }
    
    // Filter input
    const filterInput = this.container.querySelector('#metrics-filter');
    if (filterInput) {
      filterInput.addEventListener('input', this._handleFilterChange);
    }
    
    // Component selector
    const componentSelector = this.container.querySelector('#component-selector');
    if (componentSelector) {
      componentSelector.addEventListener('change', this._handleComponentSelect);
    }
    
    // Metric type selector
    const metricTypeSelector = this.container.querySelector('#metric-type-selector');
    if (metricTypeSelector) {
      metricTypeSelector.addEventListener('change', this._handleMetricTypeSelect);
    }
  }
  
  /**
   * Start the refresh interval
   * @private
   */
  _startRefresh() {
    // Clear any existing interval
    this._stopRefresh();
    
    // Set up new interval
    this.refreshIntervalId = setInterval(() => {
      this._loadData();
    }, this.options.refreshInterval);
  }
  
  /**
   * Stop the refresh interval
   * @private
   */
  _stopRefresh() {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
  }
  
  /**
   * Load metrics data
   * @private
   * @returns {Promise<void>}
   */
  async _loadData() {
    try {
      // Show loading state
      const content = this.container.querySelector('.metrics-dashboard-content');
      if (content) {
        content.innerHTML = `
          <div class="metrics-loading">
            <div class="spinner"></div>
            <p>Loading metrics data...</p>
          </div>
        `;
      }
      
      // Get metrics from service
      const metrics = this.metricsService.getAllMetrics();
      this.lastMetricsData = metrics;
      
      // Update stats
      this._updateStats(metrics);
      
      // Update charts
      this._updateCharts(metrics);
      
      // Render metrics tables
      this._renderMetricsTables(metrics);
      
      // Update component selector options
      this._updateComponentSelector(metrics);
      
      // Update last update time
      const lastUpdateElement = this.container.querySelector('#metrics-last-update');
      if (lastUpdateElement) {
        lastUpdateElement.textContent = new Date().toLocaleTimeString();
      }
    } catch (error) {
      console.error('Failed to load metrics data:', error);
      
      // Show error in content area
      const content = this.container.querySelector('.metrics-dashboard-content');
      if (content) {
        content.innerHTML = `
          <div class="metrics-error">
            <h3>Error Loading Metrics</h3>
            <p>${error.message}</p>
          </div>
        `;
      }
    }
  }
  
  /**
   * Update dashboard stats
   * @private
   * @param {Object} metrics - Metrics data
   */
  _updateStats(metrics) {
    // Count components
    const componentCount = Object.keys(metrics.components).length;
    
    // Count metrics by type
    let counterCount = 0;
    let gaugeCount = 0;
    let histogramCount = 0;
    
    for (const componentMetrics of Object.values(metrics.components)) {
      counterCount += Object.keys(componentMetrics.counters).length;
      gaugeCount += Object.keys(componentMetrics.gauges).length;
      histogramCount += Object.keys(componentMetrics.histograms).length;
    }
    
    const totalCount = counterCount + gaugeCount + histogramCount;
    
    // Update UI
    const componentCountElement = this.container.querySelector('#metrics-component-count');
    if (componentCountElement) {
      componentCountElement.textContent = componentCount;
    }
    
    const totalCountElement = this.container.querySelector('#metrics-total-count');
    if (totalCountElement) {
      totalCountElement.textContent = totalCount;
    }
    
    const counterCountElement = this.container.querySelector('#metrics-counter-count');
    if (counterCountElement) {
      counterCountElement.textContent = counterCount;
    }
    
    const gaugeCountElement = this.container.querySelector('#metrics-gauge-count');
    if (gaugeCountElement) {
      gaugeCountElement.textContent = gaugeCount;
    }
    
    const histogramCountElement = this.container.querySelector('#metrics-histogram-count');
    if (histogramCountElement) {
      histogramCountElement.textContent = histogramCount;
    }
  }
  
  /**
   * Update charts with metrics data
   * @private
   * @param {Object} metrics - Metrics data
   */
  _updateCharts(metrics) {
    if (!window.Chart || this.options.showCharts === false) {
      return;
    }
    
    // Component metrics distribution chart
    this._updateComponentMetricsChart(metrics);
    
    // Top counters chart
    this._updateTopCountersChart(metrics);
    
    // Operation durations chart
    this._updateOperationDurationsChart(metrics);
  }
  
  /**
   * Update component metrics distribution chart
   * @private
   * @param {Object} metrics - Metrics data
   */
  _updateComponentMetricsChart(metrics) {
    const chartCanvas = this.container.querySelector('#component-metrics-chart');
    if (!chartCanvas) return;
    
    // Prepare data
    const components = Object.keys(metrics.components);
    const datasets = [
      {
        label: 'Counters',
        data: components.map(component => Object.keys(metrics.components[component].counters).length),
        backgroundColor: 'rgba(54, 162, 235, 0.6)'
      },
      {
        label: 'Gauges',
        data: components.map(component => Object.keys(metrics.components[component].gauges).length),
        backgroundColor: 'rgba(75, 192, 192, 0.6)'
      },
      {
        label: 'Histograms',
        data: components.map(component => Object.keys(metrics.components[component].histograms).length),
        backgroundColor: 'rgba(255, 159, 64, 0.6)'
      }
    ];
    
    // Create or update chart
    if (this.charts.has('componentMetrics')) {
      const chart = this.charts.get('componentMetrics');
      chart.data.labels = components;
      chart.data.datasets = datasets;
      chart.update();
    } else {
      const chart = new Chart(chartCanvas, {
        type: 'bar',
        data: {
          labels: components,
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              stacked: true
            },
            y: {
              stacked: true,
              beginAtZero: true
            }
          }
        }
      });
      
      this.charts.set('componentMetrics', chart);
    }
  }
  
  /**
   * Update top counters chart
   * @private
   * @param {Object} metrics - Metrics data
   */
  _updateTopCountersChart(metrics) {
    const chartCanvas = this.container.querySelector('#top-counters-chart');
    if (!chartCanvas) return;
    
    // Aggregate counters from all components
    const counterValues = new Map();
    
    for (const componentMetrics of Object.values(metrics.components)) {
      for (const [key, counter] of Object.entries(componentMetrics.counters)) {
        const name = counter.name;
        
        if (!counterValues.has(name)) {
          counterValues.set(name, 0);
        }
        
        counterValues.set(name, counterValues.get(name) + counter.value);
      }
    }
    
    // Sort and take top 10
    const topCounters = Array.from(counterValues.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    // Prepare data
    const labels = topCounters.map(([name]) => name);
    const data = topCounters.map(([, value]) => value);
    
    // Create or update chart
    if (this.charts.has('topCounters')) {
      const chart = this.charts.get('topCounters');
      chart.data.labels = labels;
      chart.data.datasets[0].data = data;
      chart.update();
    } else {
      const chart = new Chart(chartCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Counter Value',
            data,
            backgroundColor: 'rgba(255, 99, 132, 0.6)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });
      
      this.charts.set('topCounters', chart);
    }
  }
  
  /**
   * Update operation durations chart
   * @private
   * @param {Object} metrics - Metrics data
   */
  _updateOperationDurationsChart(metrics) {
    const chartCanvas = this.container.querySelector('#operation-durations-chart');
    if (!chartCanvas) return;
    
    // Find histograms that appear to be operation durations (ending with _seconds or _duration)
    const durationHistograms = [];
    
    for (const componentMetrics of Object.values(metrics.components)) {
      for (const [key, histogram] of Object.entries(componentMetrics.histograms)) {
        const name = histogram.name;
        
        if (name.endsWith('_seconds') || name.endsWith('_duration')) {
          // Calculate average duration
          const avgDuration = histogram.count > 0 ? histogram.sum / histogram.count : 0;
          
          durationHistograms.push({
            name,
            component: histogram.labels?.component || 'unknown',
            avgDuration,
            count: histogram.count
          });
        }
      }
    }
    
    // Sort by average duration and take top 10
    const topDurations = durationHistograms
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);
    
    // Prepare data
    const labels = topDurations.map(item => {
      const operation = item.name.replace(/_seconds$|_duration$/, '');
      return `${operation} (${item.component})`;
    });
    
    const data = topDurations.map(item => item.avgDuration);
    
    // Create or update chart
    if (this.charts.has('operationDurations')) {
      const chart = this.charts.get('operationDurations');
      chart.data.labels = labels;
      chart.data.datasets[0].data = data;
      chart.update();
    } else {
      const chart = new Chart(chartCanvas, {
        type: 'horizontalBar',
        data: {
          labels,
          datasets: [{
            label: 'Avg Duration (seconds)',
            data,
            backgroundColor: 'rgba(153, 102, 255, 0.6)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              beginAtZero: true
            }
          }
        }
      });
      
      this.charts.set('operationDurations', chart);
    }
  }
  
  /**
   * Render metrics tables
   * @private
   * @param {Object} metrics - Metrics data
   */
  _renderMetricsTables(metrics) {
    const content = this.container.querySelector('.metrics-dashboard-content');
    if (!content) return;
    
    // Clear content
    content.innerHTML = '';
    
    // Apply filters
    const components = this._filterComponents(metrics);
    
    // Create sections
    if (this.selectedMetricType === 'all' || this.selectedMetricType === 'counters') {
      content.appendChild(this._createCountersSection(components));
    }
    
    if (this.selectedMetricType === 'all' || this.selectedMetricType === 'gauges') {
      content.appendChild(this._createGaugesSection(components));
    }
    
    if (this.selectedMetricType === 'all' || this.selectedMetricType === 'histograms') {
      content.appendChild(this._createHistogramsSection(components));
    }
    
    // Show message if no metrics match filters
    if (content.children.length === 0) {
      content.innerHTML = `
        <div class="metrics-empty">
          <p>No metrics match the current filters.</p>
        </div>
      `;
    }
  }
  
  /**
   * Create counters section
   * @private
   * @param {Object} components - Filtered components
   * @returns {HTMLElement} Counters section
   */
  _createCountersSection(components) {
    const section = document.createElement('div');
    section.className = 'metrics-section';
    section.dataset.type = 'counters';
    
    // Section header
    const header = document.createElement('div');
    header.className = 'metrics-section-header';
    header.innerHTML = `
      <h3>
        <span class="section-toggle ${this.collapsedSections.has('counters') ? 'collapsed' : ''}">
          <i class="fa ${this.collapsedSections.has('counters') ? 'fa-caret-right' : 'fa-caret-down'}"></i>
        </span>
        Counters
      </h3>
      <div class="metrics-section-actions">
        <button class="metrics-sort" data-sort="name" data-section="counters">
          <i class="fa fa-sort-alpha-down"></i> Sort by Name
        </button>
        <button class="metrics-sort" data-sort="value" data-section="counters">
          <i class="fa fa-sort-numeric-down"></i> Sort by Value
        </button>
      </div>
    `;
    
    // Add toggle event listener
    header.querySelector('.section-toggle').addEventListener('click', () => {
      this._handleSectionToggle('counters');
    });
    
    // Add sort event listeners
    header.querySelectorAll('.metrics-sort').forEach(button => {
      button.addEventListener('click', this._handleSort);
    });
    
    section.appendChild(header);
    
    // Section content
    const content = document.createElement('div');
    content.className = 'metrics-section-content';
    content.style.display = this.collapsedSections.has('counters') ? 'none' : 'block';
    
    // Gather all counters
    const counters = [];
    for (const [componentName, componentData] of Object.entries(components)) {
      for (const [key, counter] of Object.entries(componentData.counters)) {
        if (this._matchesFilter(counter.name, this.filterText)) {
          counters.push({
            name: counter.name,
            value: counter.value,
            component: componentName,
            labels: counter.labels
          });
        }
      }
    }
    
    // Create table
    if (counters.length > 0) {
      const table = document.createElement('table');
      table.className = 'metrics-table';
      
      // Table header
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Name</th>
          <th>Component</th>
          <th>Value</th>
          <th>Labels</th>
        </tr>
      `;
      table.appendChild(thead);
      
      // Table body
      const tbody = document.createElement('tbody');
      
      // Sort counters by name
      counters.sort((a, b) => a.name.localeCompare(b.name));
      
      // Add rows
      for (const counter of counters) {
        const row = document.createElement('tr');
        
        // Name cell
        const nameCell = document.createElement('td');
        nameCell.className = 'metrics-name';
        nameCell.textContent = counter.name;
        row.appendChild(nameCell);
        
        // Component cell
        const componentCell = document.createElement('td');
        componentCell.className = 'metrics-component';
        componentCell.textContent = counter.component;
        row.appendChild(componentCell);
        
        // Value cell
        const valueCell = document.createElement('td');
        valueCell.className = 'metrics-value';
        valueCell.textContent = counter.value;
        row.appendChild(valueCell);
        
        // Labels cell
        const labelsCell = document.createElement('td');
        labelsCell.className = 'metrics-labels';
        
        if (counter.labels && Object.keys(counter.labels).length > 0) {
          const labelsList = document.createElement('ul');
          
          for (const [key, value] of Object.entries(counter.labels)) {
            if (key !== 'component') { // Skip component label as it's already shown
              const labelItem = document.createElement('li');
              labelItem.textContent = `${key}: ${value}`;
              labelsList.appendChild(labelItem);
            }
          }
          
          labelsCell.appendChild(labelsList);
        } else {
          labelsCell.textContent = '-';
        }
        
        row.appendChild(labelsCell);
        
        tbody.appendChild(row);
      }
      
      table.appendChild(tbody);
      content.appendChild(table);
    } else {
      // No counters match filter
      content.innerHTML = `
        <div class="metrics-empty">
          <p>No counters match the current filters.</p>
        </div>
      `;
    }
    
    section.appendChild(content);
    
    return section;
  }
  
  /**
   * Create gauges section
   * @private
   * @param {Object} components - Filtered components
   * @returns {HTMLElement} Gauges section
   */
  _createGaugesSection(components) {
    const section = document.createElement('div');
    section.className = 'metrics-section';
    section.dataset.type = 'gauges';
    
    // Section header
    const header = document.createElement('div');
    header.className = 'metrics-section-header';
    header.innerHTML = `
      <h3>
        <span class="section-toggle ${this.collapsedSections.has('gauges') ? 'collapsed' : ''}">
          <i class="fa ${this.collapsedSections.has('gauges') ? 'fa-caret-right' : 'fa-caret-down'}"></i>
        </span>
        Gauges
      </h3>
      <div class="metrics-section-actions">
        <button class="metrics-sort" data-sort="name" data-section="gauges">
          <i class="fa fa-sort-alpha-down"></i> Sort by Name
        </button>
        <button class="metrics-sort" data-sort="value" data-section="gauges">
          <i class="fa fa-sort-numeric-down"></i> Sort by Value
        </button>
      </div>
    `;
    
    // Add toggle event listener
    header.querySelector('.section-toggle').addEventListener('click', () => {
      this._handleSectionToggle('gauges');
    });
    
    // Add sort event listeners
    header.querySelectorAll('.metrics-sort').forEach(button => {
      button.addEventListener('click', this._handleSort);
    });
    
    section.appendChild(header);
    
    // Section content
    const content = document.createElement('div');
    content.className = 'metrics-section-content';
    content.style.display = this.collapsedSections.has('gauges') ? 'none' : 'block';
    
    // Gather all gauges
    const gauges = [];
    for (const [componentName, componentData] of Object.entries(components)) {
      for (const [key, gauge] of Object.entries(componentData.gauges)) {
        if (this._matchesFilter(gauge.name, this.filterText)) {
          gauges.push({
            name: gauge.name,
            value: gauge.value,
            component: componentName,
            labels: gauge.labels
          });
        }
      }
    }
    
    // Create table
    if (gauges.length > 0) {
      const table = document.createElement('table');
      table.className = 'metrics-table';
      
      // Table header
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Name</th>
          <th>Component</th>
          <th>Value</th>
          <th>Labels</th>
        </tr>
      `;
      table.appendChild(thead);
      
      // Table body
      const tbody = document.createElement('tbody');
      
      // Sort gauges by name
      gauges.sort((a, b) => a.name.localeCompare(b.name));
      
      // Add rows
      for (const gauge of gauges) {
        const row = document.createElement('tr');
        
        // Name cell
        const nameCell = document.createElement('td');
        nameCell.className = 'metrics-name';
        nameCell.textContent = gauge.name;
        row.appendChild(nameCell);
        
        // Component cell
        const componentCell = document.createElement('td');
        componentCell.className = 'metrics-component';
        componentCell.textContent = gauge.component;
        row.appendChild(componentCell);
        
        // Value cell
        const valueCell = document.createElement('td');
        valueCell.className = 'metrics-value';
        valueCell.textContent = gauge.value;
        row.appendChild(valueCell);
        
        // Labels cell
        const labelsCell = document.createElement('td');
        labelsCell.className = 'metrics-labels';
        
        if (gauge.labels && Object.keys(gauge.labels).length > 0) {
          const labelsList = document.createElement('ul');
          
          for (const [key, value] of Object.entries(gauge.labels)) {
            if (key !== 'component') { // Skip component label as it's already shown
              const labelItem = document.createElement('li');
              labelItem.textContent = `${key}: ${value}`;
              labelsList.appendChild(labelItem);
            }
          }
          
          labelsCell.appendChild(labelsList);
        } else {
          labelsCell.textContent = '-';
        }
        
        row.appendChild(labelsCell);
        
        tbody.appendChild(row);
      }
      
      table.appendChild(tbody);
      content.appendChild(table);
    } else {
      // No gauges match filter
      content.innerHTML = `
        <div class="metrics-empty">
          <p>No gauges match the current filters.</p>
        </div>
      `;
    }
    
    section.appendChild(content);
    
    return section;
  }
  
  /**
   * Create histograms section
   * @private
   * @param {Object} components - Filtered components
   * @returns {HTMLElement} Histograms section
   */
  _createHistogramsSection(components) {
    const section = document.createElement('div');
    section.className = 'metrics-section';
    section.dataset.type = 'histograms';
    
    // Section header
    const header = document.createElement('div');
    header.className = 'metrics-section-header';
    header.innerHTML = `
      <h3>
        <span class="section-toggle ${this.collapsedSections.has('histograms') ? 'collapsed' : ''}">
          <i class="fa ${this.collapsedSections.has('histograms') ? 'fa-caret-right' : 'fa-caret-down'}"></i>
        </span>
        Histograms
      </h3>
      <div class="metrics-section-actions">
        <button class="metrics-sort" data-sort="name" data-section="histograms">
          <i class="fa fa-sort-alpha-down"></i> Sort by Name
        </button>
        <button class="metrics-sort" data-sort="count" data-section="histograms">
          <i class="fa fa-sort-numeric-down"></i> Sort by Count
        </button>
      </div>
    `;
    
    // Add toggle event listener
    header.querySelector('.section-toggle').addEventListener('click', () => {
      this._handleSectionToggle('histograms');
    });
    
    // Add sort event listeners
    header.querySelectorAll('.metrics-sort').forEach(button => {
      button.addEventListener('click', this._handleSort);
    });
    
    section.appendChild(header);
    
    // Section content
    const content = document.createElement('div');
    content.className = 'metrics-section-content';
    content.style.display = this.collapsedSections.has('histograms') ? 'none' : 'block';
    
    // Gather all histograms
    const histograms = [];
    for (const [componentName, componentData] of Object.entries(components)) {
      for (const [key, histogram] of Object.entries(componentData.histograms)) {
        if (this._matchesFilter(histogram.name, this.filterText)) {
          histograms.push({
            name: histogram.name,
            count: histogram.count,
            sum: histogram.sum,
            min: histogram.min !== Infinity ? histogram.min : null,
            max: histogram.max !== -Infinity ? histogram.max : null,
            avg: histogram.count > 0 ? histogram.sum / histogram.count : null,
            component: componentName,
            labels: histogram.labels
          });
        }
      }
    }
    
    // Create table
    if (histograms.length > 0) {
      const table = document.createElement('table');
      table.className = 'metrics-table';
      
      // Table header
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Name</th>
          <th>Component</th>
          <th>Count</th>
          <th>Avg</th>
          <th>Min</th>
          <th>Max</th>
          <th>Labels</th>
        </tr>
      `;
      table.appendChild(thead);
      
      // Table body
      const tbody = document.createElement('tbody');
      
      // Sort histograms by name
      histograms.sort((a, b) => a.name.localeCompare(b.name));
      
      // Add rows
      for (const histogram of histograms) {
        const row = document.createElement('tr');
        
        // Name cell
        const nameCell = document.createElement('td');
        nameCell.className = 'metrics-name';
        nameCell.textContent = histogram.name;
        row.appendChild(nameCell);
        
        // Component cell
        const componentCell = document.createElement('td');
        componentCell.className = 'metrics-component';
        componentCell.textContent = histogram.component;
        row.appendChild(componentCell);
        
        // Count cell
        const countCell = document.createElement('td');
        countCell.className = 'metrics-count';
        countCell.textContent = histogram.count;
        row.appendChild(countCell);
        
        // Avg cell
        const avgCell = document.createElement('td');
        avgCell.className = 'metrics-avg';
        avgCell.textContent = histogram.avg !== null ? histogram.avg.toFixed(6) : '-';
        row.appendChild(avgCell);
        
        // Min cell
        const minCell = document.createElement('td');
        minCell.className = 'metrics-min';
        minCell.textContent = histogram.min !== null ? histogram.min.toFixed(6) : '-';
        row.appendChild(minCell);
        
        // Max cell
        const maxCell = document.createElement('td');
        maxCell.className = 'metrics-max';
        maxCell.textContent = histogram.max !== null ? histogram.max.toFixed(6) : '-';
        row.appendChild(maxCell);
        
        // Labels cell
        const labelsCell = document.createElement('td');
        labelsCell.className = 'metrics-labels';
        
        if (histogram.labels && Object.keys(histogram.labels).length > 0) {
          const labelsList = document.createElement('ul');
          
          for (const [key, value] of Object.entries(histogram.labels)) {
            if (key !== 'component') { // Skip component label as it's already shown
              const labelItem = document.createElement('li');
              labelItem.textContent = `${key}: ${value}`;
              labelsList.appendChild(labelItem);
            }
          }
          
          labelsCell.appendChild(labelsList);
        } else {
          labelsCell.textContent = '-';
        }
        
        row.appendChild(labelsCell);
        
        tbody.appendChild(row);
      }
      
      table.appendChild(tbody);
      content.appendChild(table);
    } else {
      // No histograms match filter
      content.innerHTML = `
        <div class="metrics-empty">
          <p>No histograms match the current filters.</p>
        </div>
      `;
    }
    
    section.appendChild(content);
    
    return section;
  }
  
  /**
   * Update component selector options
   * @private
   * @param {Object} metrics - Metrics data
   */
  _updateComponentSelector(metrics) {
    const selector = this.container.querySelector('#component-selector');
    if (!selector) return;
    
    // Save current selection
    const currentValue = selector.value;
    
    // Clear all options except the "All Components" option
    while (selector.options.length > 1) {
      selector.remove(1);
    }
    
    // Add option for each component
    const components = Object.keys(metrics.components).sort();
    
    for (const component of components) {
      const option = document.createElement('option');
      option.value = component;
      option.textContent = component;
      selector.appendChild(option);
    }
    
    // Restore previous selection if it still exists
    if (currentValue && (currentValue === 'all' || components.includes(currentValue))) {
      selector.value = currentValue;
    } else {
      selector.value = 'all';
      this.selectedComponent = 'all';
    }
  }
  
  /**
   * Filter components based on current filters
   * @private
   * @param {Object} metrics - Metrics data
   * @returns {Object} Filtered components
   */
  _filterComponents(metrics) {
    const result = {};
    
    // Apply component filter
    if (this.selectedComponent === 'all') {
      // Include all components
      Object.assign(result, metrics.components);
    } else if (metrics.components[this.selectedComponent]) {
      // Include only the selected component
      result[this.selectedComponent] = metrics.components[this.selectedComponent];
    }
    
    return result;
  }
  
  /**
   * Check if a metric name matches the filter
   * @private
   * @param {string} name - Metric name
   * @param {string} filter - Filter text
   * @returns {boolean} Whether the name matches the filter
   */
  _matchesFilter(name, filter) {
    if (!filter) return true;
    
    return name.toLowerCase().includes(filter.toLowerCase());
  }
  
  /**
   * Handle metrics report event
   * @private
   * @param {Object} metrics - Metrics data
   */
  _handleMetricsReport(metrics) {
    // Update UI with new metrics
    this._updateStats(metrics);
    this._updateCharts(metrics);
    this._renderMetricsTables(metrics);
    
    // Update last update time
    const lastUpdateElement = this.container.querySelector('#metrics-last-update');
    if (lastUpdateElement) {
      lastUpdateElement.textContent = new Date().toLocaleTimeString();
    }
  }
  
  /**
   * Handle refresh button click
   * @private
   */
  _handleRefresh() {
    this._loadData();
  }
  
  /**
   * Handle export button click
   * @private
   */
  _handleExport() {
    if (!this.lastMetricsData) {
      console.error('No metrics data to export');
      return;
    }
    
    // Export as JSON
    const json = JSON.stringify(this.lastMetricsData, null, 2);
    
    // Create download link
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `metrics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
  
  /**
   * Handle filter input change
   * @private
   * @param {Event} event - Input event
   */
  _handleFilterChange(event) {
    this.filterText = event.target.value;
    
    // Re-render with filter
    if (this.lastMetricsData) {
      this._renderMetricsTables(this.lastMetricsData);
    }
  }
  
  /**
   * Handle component selector change
   * @private
   * @param {Event} event - Change event
   */
  _handleComponentSelect(event) {
    this.selectedComponent = event.target.value;
    
    // Re-render with filter
    if (this.lastMetricsData) {
      this._renderMetricsTables(this.lastMetricsData);
    }
  }
  
  /**
   * Handle metric type selector change
   * @private
   * @param {Event} event - Change event
   */
  _handleMetricTypeSelect(event) {
    this.selectedMetricType = event.target.value;
    
    // Re-render with filter
    if (this.lastMetricsData) {
      this._renderMetricsTables(this.lastMetricsData);
    }
  }
  
  /**
   * Handle section toggle
   * @private
   * @param {string} section - Section name
   */
  _handleSectionToggle(section) {
    // Toggle collapsed state
    if (this.collapsedSections.has(section)) {
      this.collapsedSections.delete(section);
    } else {
      this.collapsedSections.add(section);
    }
    
    // Update UI
    const sectionElement = this.container.querySelector(`.metrics-section[data-type="${section}"]`);
    if (sectionElement) {
      const content = sectionElement.querySelector('.metrics-section-content');
      const toggle = sectionElement.querySelector('.section-toggle');
      const icon = toggle.querySelector('i');
      
      if (this.collapsedSections.has(section)) {
        // Collapse section
        content.style.display = 'none';
        toggle.classList.add('collapsed');
        icon.className = 'fa fa-caret-right';
      } else {
        // Expand section
        content.style.display = 'block';
        toggle.classList.remove('collapsed');
        icon.className = 'fa fa-caret-down';
      }
    }
  }
  
  /**
   * Handle sort button click
   * @private
   * @param {Event} event - Click event
   */
  _handleSort(event) {
    const button = event.currentTarget;
    const sortBy = button.dataset.sort;
    const section = button.dataset.section;
    
    // Get table body
    const sectionElement = this.container.querySelector(`.metrics-section[data-type="${section}"]`);
    if (!sectionElement) return;
    
    const table = sectionElement.querySelector('.metrics-table');
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    // Get all rows
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Sort rows
    rows.sort((a, b) => {
      let aValue, bValue;
      
      if (sortBy === 'name') {
        aValue = a.querySelector('.metrics-name').textContent;
        bValue = b.querySelector('.metrics-name').textContent;
        return aValue.localeCompare(bValue);
      } else if (sortBy === 'value' || sortBy === 'count') {
        const aCell = a.querySelector(sortBy === 'value' ? '.metrics-value' : '.metrics-count');
        const bCell = b.querySelector(sortBy === 'value' ? '.metrics-value' : '.metrics-count');
        
        aValue = aCell ? parseFloat(aCell.textContent) : 0;
        bValue = bCell ? parseFloat(bCell.textContent) : 0;
        
        if (isNaN(aValue)) aValue = 0;
        if (isNaN(bValue)) bValue = 0;
        
        return bValue - aValue; // Sort descending
      }
      
      return 0;
    });
    
    // Re-append rows in sorted order
    rows.forEach(row => tbody.appendChild(row));
  }
  
  /**
   * Set up the Prometheus panel
   * @private
   * @returns {Promise<void>}
   */
  async _setupPrometheusPanel() {
    try {
      // Create container for Prometheus panel
      const prometheusContainer = document.createElement('div');
      prometheusContainer.className = 'metrics-prometheus-panel';
      
      // Find place to insert the panel (after the dashboard stats)
      const dashboardStats = this.container.querySelector('.metrics-dashboard-stats');
      if (dashboardStats) {
        dashboardStats.parentNode.insertBefore(prometheusContainer, dashboardStats.nextSibling);
      } else {
        // Fallback: Add to the bottom of the dashboard
        this.container.appendChild(prometheusContainer);
      }
      
      // Create the Prometheus panel
      this.prometheusPanel = new PrometheusConnectionPanel({
        container: prometheusContainer,
        eventBus: this.eventBus,
        prometheusOptions: {
          port: this.options.prometheus.port,
          endpoint: this.options.prometheus.endpoint,
          autoStart: this.options.prometheus.autoStart
        }
      });
      
      // Initialize the panel
      await this.prometheusPanel.init();
      
      // Listen for Prometheus-related events
      this.eventBus.on('prometheus-config-saved', (config) => {
        // Update our stored config
        this.options.prometheus = {
          ...this.options.prometheus,
          ...config
        };
      });
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Prometheus panel:', error);
      return false;
    }
  }
  
  /**
   * Load Chart.js
   * @private
   * @returns {Promise<void>}
   */
  async _loadChartJs() {
    // Skip if Chart.js is already loaded
    if (window.Chart) return;
    
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  
  /**
   * Dispose of the metrics dashboard and clean up resources
   */
  dispose() {
    // Stop refresh interval
    this._stopRefresh();
    
    // Dispose charts
    for (const chart of this.charts.values()) {
      chart.destroy();
    }
    this.charts.clear();
    
    // Dispose Prometheus panel if it exists
    if (this.prometheusPanel) {
      this.prometheusPanel.dispose();
      this.prometheusPanel = null;
    }
    
    // Remove event listeners
    const refreshButton = this.container.querySelector('#metrics-refresh');
    if (refreshButton) {
      refreshButton.removeEventListener('click', this._handleRefresh);
    }
    
    const exportButton = this.container.querySelector('#metrics-export');
    if (exportButton) {
      exportButton.removeEventListener('click', this._handleExport);
    }
    
    const filterInput = this.container.querySelector('#metrics-filter');
    if (filterInput) {
      filterInput.removeEventListener('input', this._handleFilterChange);
    }
    
    const componentSelector = this.container.querySelector('#component-selector');
    if (componentSelector) {
      componentSelector.removeEventListener('change', this._handleComponentSelect);
    }
    
    const metricTypeSelector = this.container.querySelector('#metric-type-selector');
    if (metricTypeSelector) {
      metricTypeSelector.removeEventListener('change', this._handleMetricTypeSelect);
    }
    
    // Unregister from metrics events
    if (this.metricsService) {
      this.metricsService.removeEventListener('metrics-report', this._handleMetricsReport);
    }
    
    // Unregister from Prometheus events
    this.eventBus.removeListener && this.eventBus.removeListener('prometheus-config-saved');
    
    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }
    
    this.initialized = false;
  }
}

// Export the class
export default MetricsDashboard;