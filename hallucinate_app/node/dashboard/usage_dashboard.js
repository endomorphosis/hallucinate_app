/**
 * Usage Tracking Dashboard Component
 * 
 * Provides visualization and management of resource usage across modules
 * Shows real-time metrics, historical data, and performance analysis
 */

import usageTracker from '../usage_tracker.js';
import NotificationSystem from './notifications.js';

export class UsageDashboard {
  /**
   * Create a new usage dashboard instance
   * @param {Object} options Configuration options
   * @param {HTMLElement} options.element Container element for the dashboard
   * @param {Object} options.eventBus Event bus for communication
   */
  constructor(options = {}) {
    this.options = options;
    this.element = options.element;
    this.eventBus = options.eventBus;
    
    this.usageTracker = options.usageTracker || usageTracker;
    this.refreshInterval = options.refreshInterval || 5000;
    
    this.initialized = false;
    this.refreshTimer = null;
    this.notifications = null;
    
    // Chart references
    this.charts = {};
  }
  
  /**
   * Initialize the dashboard component
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    try {
      // Nothing to initialize in the tracker - it's already active
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize usage dashboard:', error);
      this.showError('Failed to initialize. Check console for details.');
      return false;
    }
  }
  
  /**
   * Render the dashboard into the container element
   */
  async render() {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.element) {
      console.error('No container element provided for usage dashboard');
      return;
    }
    
    // Create main container
    this.element.innerHTML = `
      <div class="usage-dashboard">
        <div class="dashboard-header">
          <h2><i class="fas fa-chart-line"></i> Resource Usage Monitor</h2>
          <div class="status-indicator" id="tracker-status">
            <span class="status-dot online"></span>
            <span class="status-text">Active</span>
          </div>
        </div>
        
        <div class="dashboard-tabs">
          <button class="tab-button active" data-tab="overview">Overview</button>
          <button class="tab-button" data-tab="modules">Modules</button>
          <button class="tab-button" data-tab="events">Events</button>
          <button class="tab-button" data-tab="analytics">Analytics</button>
        </div>
        
        <div class="dashboard-content">
          <!-- Overview Tab -->
          <div class="tab-content active" id="overview-content">
            <div class="card-grid">
              <div class="mini-card">
                <div class="mini-card-value" id="total-events-count">0</div>
                <div class="mini-card-label">Total Events</div>
              </div>
              <div class="mini-card">
                <div class="mini-card-value" id="error-rate">0%</div>
                <div class="mini-card-label">Error Rate</div>
              </div>
              <div class="mini-card">
                <div class="mini-card-value" id="avg-response-time">0ms</div>
                <div class="mini-card-label">Avg Response Time</div>
              </div>
              <div class="mini-card">
                <div class="mini-card-value" id="modules-count">0</div>
                <div class="mini-card-label">Active Modules</div>
              </div>
            </div>
            
            <div class="dashboard-card">
              <div class="card-header">
                <h3>Activity Overview</h3>
                <div class="timeframe-selector">
                  <select id="activity-timeframe">
                    <option value="1h">Last Hour</option>
                    <option value="3h">Last 3 Hours</option>
                    <option value="24h" selected>Last 24 Hours</option>
                  </select>
                </div>
              </div>
              <div class="card-body">
                <div class="chart-container">
                  <canvas id="activity-chart"></canvas>
                </div>
              </div>
            </div>
            
            <div class="dashboard-card">
              <div class="card-header">
                <h3>Top Operations</h3>
              </div>
              <div class="card-body">
                <div class="table-container">
                  <table class="data-table" id="top-operations-table">
                    <thead>
                      <tr>
                        <th>Module</th>
                        <th>Operation</th>
                        <th>Count</th>
                        <th>Avg Duration</th>
                        <th>Error Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colspan="5" class="text-center">Loading operations...</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Modules Tab -->
          <div class="tab-content" id="modules-content">
            <div class="dashboard-card">
              <div class="card-header">
                <h3>Module Performance</h3>
              </div>
              <div class="card-body">
                <div class="table-container">
                  <table class="data-table" id="modules-table">
                    <thead>
                      <tr>
                        <th>Module</th>
                        <th>Events</th>
                        <th>Operations</th>
                        <th>Avg Duration</th>
                        <th>Error Rate</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colspan="6" class="text-center">Loading modules...</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            <div class="dashboard-card">
              <div class="card-header">
                <h3>Module Performance Comparison</h3>
              </div>
              <div class="card-body">
                <div class="chart-container">
                  <canvas id="modules-chart"></canvas>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Events Tab -->
          <div class="tab-content" id="events-content">
            <div class="dashboard-card">
              <div class="card-header">
                <h3>Recent Events</h3>
                <div class="card-actions">
                  <select id="events-filter">
                    <option value="all">All Events</option>
                    <option value="errors">Errors Only</option>
                  </select>
                </div>
              </div>
              <div class="card-body">
                <div class="table-container">
                  <table class="data-table" id="events-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Module</th>
                        <th>Operation</th>
                        <th>Duration</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colspan="6" class="text-center">Loading events...</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            <div id="event-details" class="dashboard-card" style="display: none;">
              <div class="card-header">
                <h3>Event Details</h3>
                <button class="close-btn" id="close-event-details">&times;</button>
              </div>
              <div class="card-body">
                <div id="event-details-content">
                  <p>Select an event to view details.</p>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Analytics Tab -->
          <div class="tab-content" id="analytics-content">
            <div class="dashboard-card">
              <div class="card-header">
                <h3>Usage Patterns</h3>
              </div>
              <div class="card-body">
                <div class="chart-container">
                  <canvas id="usage-patterns-chart"></canvas>
                </div>
              </div>
            </div>
            
            <div class="dashboard-card">
              <div class="card-header">
                <h3>Resource Utilization</h3>
              </div>
              <div class="card-body">
                <div class="chart-grid">
                  <div class="chart-container">
                    <canvas id="memory-chart"></canvas>
                  </div>
                  <div class="chart-container">
                    <canvas id="duration-chart"></canvas>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Initialize notification system
    this.notifications = new NotificationSystem({
      container: this.element,
      position: 'top-right'
    });
    
    // Add event listeners
    this.addEventListeners();
    
    // Load initial data
    await this.loadData();
    
    // Set up refresh timer
    this.startRefreshTimer();
  }
  
  /**
   * Add event listeners to dashboard elements
   */
  addEventListeners() {
    // Tab switching
    const tabButtons = this.element.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Remove active class from all buttons and content
        tabButtons.forEach(btn => btn.classList.remove('active'));
        const contents = this.element.querySelectorAll('.tab-content');
        contents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked button and corresponding content
        button.classList.add('active');
        const tabId = button.getAttribute('data-tab');
        document.getElementById(`${tabId}-content`).classList.add('active');
      });
    });
    
    // Events filter
    const eventsFilter = this.element.querySelector('#events-filter');
    if (eventsFilter) {
      eventsFilter.addEventListener('change', () => {
        this.loadEventsTable();
      });
    }
    
    // Activity timeframe
    const activityTimeframe = this.element.querySelector('#activity-timeframe');
    if (activityTimeframe) {
      activityTimeframe.addEventListener('change', () => {
        this.updateActivityChart();
      });
    }
    
    // Close event details
    const closeEventDetails = this.element.querySelector('#close-event-details');
    if (closeEventDetails) {
      closeEventDetails.addEventListener('click', () => {
        const eventDetails = this.element.querySelector('#event-details');
        eventDetails.style.display = 'none';
      });
    }
    
    // Listen for usage tracker events
    this.usageTracker.on('usage-event', (event) => {
      // Only update if the events tab is active
      const eventsTab = this.element.querySelector('#events-content');
      if (eventsTab.classList.contains('active')) {
        this.loadEventsTable();
      }
    });
    
    this.usageTracker.on('metrics-aggregated', () => {
      // Update overview charts if active
      const overviewTab = this.element.querySelector('#overview-content');
      if (overviewTab.classList.contains('active')) {
        this.updateActivityChart();
      }
    });
  }
  
  /**
   * Start the refresh timer
   */
  startRefreshTimer() {
    // Clear existing timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    // Set up new timer
    this.refreshTimer = setInterval(() => {
      this.refreshData();
    }, this.refreshInterval);
  }
  
  /**
   * Load initial dashboard data
   */
  async loadData() {
    try {
      // Get usage statistics
      const stats = this.usageTracker.getStats();
      
      // Update summary metrics
      this.updateSummaryMetrics(stats);
      
      // Load tables and charts
      this.loadTopOperationsTable(stats);
      this.loadModulesTable(stats);
      this.loadEventsTable();
      
      // Initialize charts
      this.initCharts();
      
      // Mark as initialized
      this.initialized = true;
    } catch (error) {
      console.error('Failed to load usage data:', error);
      this.showError('Failed to load usage data. Check console for details.');
    }
  }
  
  /**
   * Refresh dashboard data
   */
  async refreshData() {
    try {
      // Get usage statistics
      const stats = this.usageTracker.getStats();
      
      // Update summary metrics
      this.updateSummaryMetrics(stats);
      
      // Get active tab
      const activeTab = this.element.querySelector('.tab-content.active');
      if (!activeTab) return;
      
      // Update based on active tab
      const tabId = activeTab.id;
      
      if (tabId === 'overview-content') {
        this.loadTopOperationsTable(stats);
        this.updateActivityChart();
      } else if (tabId === 'modules-content') {
        this.loadModulesTable(stats);
        this.updateModulesChart(stats);
      } else if (tabId === 'events-content') {
        this.loadEventsTable();
      } else if (tabId === 'analytics-content') {
        this.updateAnalyticsCharts(stats);
      }
    } catch (error) {
      console.error('Failed to refresh usage data:', error);
    }
  }
  
  /**
   * Update summary metrics on the dashboard
   * @param {Object} stats Usage statistics
   */
  updateSummaryMetrics(stats) {
    // Update total events
    const totalEventsCount = this.element.querySelector('#total-events-count');
    if (totalEventsCount) {
      totalEventsCount.textContent = stats.totalEvents.toLocaleString();
    }
    
    // Update error rate
    const errorRate = this.element.querySelector('#error-rate');
    if (errorRate) {
      errorRate.textContent = (stats.errorRate * 100).toFixed(2) + '%';
      
      // Add color based on error rate
      errorRate.className = 'mini-card-value';
      if (stats.errorRate > 0.05) {
        errorRate.classList.add('text-error');
      } else if (stats.errorRate > 0.01) {
        errorRate.classList.add('text-warning');
      } else {
        errorRate.classList.add('text-success');
      }
    }
    
    // Update average response time
    const avgResponseTime = this.element.querySelector('#avg-response-time');
    if (avgResponseTime) {
      avgResponseTime.textContent = stats.avgDuration.toFixed(2) + 'ms';
    }
    
    // Update modules count
    const modulesCount = this.element.querySelector('#modules-count');
    if (modulesCount) {
      modulesCount.textContent = Object.keys(stats.modules).length;
    }
  }
  
  /**
   * Load data for the top operations table
   * @param {Object} stats Usage statistics
   */
  loadTopOperationsTable(stats) {
    const tableBody = this.element.querySelector('#top-operations-table tbody');
    if (!tableBody) return;
    
    // Check if there are operations
    if (stats.topOperations.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="text-center">No operations recorded yet</td></tr>';
      return;
    }
    
    // Build table rows
    let html = '';
    for (const op of stats.topOperations) {
      // Skip error operations in this view
      if (op.operation.endsWith('_error')) continue;
      
      const errorRate = op.count > 0 ? op.errors / op.count : 0;
      const errorRateClass = errorRate > 0.05 ? 'text-error' : 
                             errorRate > 0.01 ? 'text-warning' : '';
      
      html += `
        <tr>
          <td>${op.module}</td>
          <td>${op.operation}</td>
          <td>${op.count.toLocaleString()}</td>
          <td>${op.avgDuration.toFixed(2)}ms</td>
          <td class="${errorRateClass}">${(errorRate * 100).toFixed(2)}%</td>
        </tr>
      `;
    }
    
    tableBody.innerHTML = html;
  }
  
  /**
   * Load data for the modules table
   * @param {Object} stats Usage statistics
   */
  loadModulesTable(stats) {
    const tableBody = this.element.querySelector('#modules-table tbody');
    if (!tableBody) return;
    
    // Check if there are modules
    if (Object.keys(stats.modules).length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No modules recorded yet</td></tr>';
      return;
    }
    
    // Build table rows
    let html = '';
    for (const [module, moduleStats] of Object.entries(stats.modules)) {
      const errorRateClass = moduleStats.errorRate > 0.05 ? 'text-error' : 
                             moduleStats.errorRate > 0.01 ? 'text-warning' : '';
      
      html += `
        <tr>
          <td>${module}</td>
          <td>${moduleStats.count.toLocaleString()}</td>
          <td>${moduleStats.operations}</td>
          <td>${moduleStats.avgDuration.toFixed(2)}ms</td>
          <td class="${errorRateClass}">${(moduleStats.errorRate * 100).toFixed(2)}%</td>
          <td>
            <button class="btn btn-sm btn-outline" data-module="${module}" data-action="view-module">
              <i class="fas fa-eye"></i>
            </button>
          </td>
        </tr>
      `;
    }
    
    tableBody.innerHTML = html;
    
    // Add event listeners to action buttons
    tableBody.querySelectorAll('[data-action="view-module"]').forEach(button => {
      button.addEventListener('click', (e) => {
        const module = e.currentTarget.getAttribute('data-module');
        this.showModuleDetails(module);
      });
    });
  }
  
  /**
   * Load data for the events table
   */
  loadEventsTable() {
    const tableBody = this.element.querySelector('#events-table tbody');
    if (!tableBody) return;
    
    // Get filter value
    const filter = this.element.querySelector('#events-filter').value;
    
    // Get recent events
    const events = this.usageTracker.getRecentEvents(50);
    
    // Filter events if needed
    const filteredEvents = filter === 'errors' 
      ? events.filter(event => event.operation.endsWith('_error'))
      : events;
    
    // Check if there are events
    if (filteredEvents.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No events recorded yet</td></tr>';
      return;
    }
    
    // Build table rows
    let html = '';
    for (const event of filteredEvents) {
      const isError = event.operation.endsWith('_error');
      const statusClass = isError ? 'status-badge offline' : 'status-badge online';
      const statusText = isError ? 'Error' : 'Success';
      
      html += `
        <tr>
          <td>${new Date(event.timestamp).toLocaleTimeString()}</td>
          <td>${event.module}</td>
          <td>${event.operation}</td>
          <td>${event.metrics.duration.toFixed(2)}ms</td>
          <td><span class="${statusClass}">${statusText}</span></td>
          <td>
            <button class="btn btn-sm btn-outline" data-event-id="${event.id}" data-action="view-event">
              <i class="fas fa-eye"></i>
            </button>
          </td>
        </tr>
      `;
    }
    
    tableBody.innerHTML = html;
    
    // Add event listeners to action buttons
    tableBody.querySelectorAll('[data-action="view-event"]').forEach(button => {
      button.addEventListener('click', (e) => {
        const eventId = e.currentTarget.getAttribute('data-event-id');
        this.showEventDetails(eventId);
      });
    });
  }
  
  /**
   * Initialize charts
   */
  initCharts() {
    // Check if Chart.js is available - we'll use a placeholder if not
    const hasChartJs = typeof Chart !== 'undefined';
    
    if (hasChartJs) {
      // Activity chart
      const activityCtx = this.element.querySelector('#activity-chart')?.getContext('2d');
      if (activityCtx) {
        this.charts.activity = new Chart(activityCtx, {
          type: 'line',
          data: {
            labels: [],
            datasets: [{
              label: 'Events',
              data: [],
              borderColor: '#4a6cf7',
              backgroundColor: 'rgba(74, 108, 247, 0.1)',
              tension: 0.4,
              fill: true
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
      }
      
      // Modules chart
      const modulesCtx = this.element.querySelector('#modules-chart')?.getContext('2d');
      if (modulesCtx) {
        this.charts.modules = new Chart(modulesCtx, {
          type: 'bar',
          data: {
            labels: [],
            datasets: [{
              label: 'Events',
              data: [],
              backgroundColor: '#4a6cf7'
            }, {
              label: 'Errors',
              data: [],
              backgroundColor: '#ef4444'
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
      }
      
      // Usage patterns chart
      const patternsCtx = this.element.querySelector('#usage-patterns-chart')?.getContext('2d');
      if (patternsCtx) {
        this.charts.patterns = new Chart(patternsCtx, {
          type: 'radar',
          data: {
            labels: [],
            datasets: [{
              label: 'Events',
              data: [],
              borderColor: '#4a6cf7',
              backgroundColor: 'rgba(74, 108, 247, 0.2)'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false
          }
        });
      }
      
      // Memory chart
      const memoryCtx = this.element.querySelector('#memory-chart')?.getContext('2d');
      if (memoryCtx) {
        this.charts.memory = new Chart(memoryCtx, {
          type: 'pie',
          data: {
            labels: [],
            datasets: [{
              data: [],
              backgroundColor: [
                '#4a6cf7',
                '#10b981',
                '#f59e0b',
                '#ef4444',
                '#8b5cf6'
              ]
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: 'Memory Usage by Module'
              }
            }
          }
        });
      }
      
      // Duration chart
      const durationCtx = this.element.querySelector('#duration-chart')?.getContext('2d');
      if (durationCtx) {
        this.charts.duration = new Chart(durationCtx, {
          type: 'pie',
          data: {
            labels: [],
            datasets: [{
              data: [],
              backgroundColor: [
                '#10b981',
                '#4a6cf7',
                '#f59e0b',
                '#ef4444',
                '#8b5cf6'
              ]
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: 'Execution Time by Module'
              }
            }
          }
        });
      }
      
      // Update all charts with initial data
      this.updateAllCharts();
    } else {
      // Replace chart canvases with placeholders
      this.element.querySelectorAll('canvas').forEach(canvas => {
        const placeholder = document.createElement('div');
        placeholder.className = 'chart-placeholder';
        placeholder.innerHTML = `
          <div class="chart-placeholder-icon">
            <i class="fas fa-chart-line"></i>
          </div>
          <div class="chart-placeholder-text">
            Charts require Chart.js library
          </div>
        `;
        canvas.parentNode.replaceChild(placeholder, canvas);
      });
    }
  }
  
  /**
   * Update all charts with current data
   */
  updateAllCharts() {
    // Get stats
    const stats = this.usageTracker.getStats();
    
    // Update each chart
    this.updateActivityChart();
    this.updateModulesChart(stats);
    this.updateAnalyticsCharts(stats);
  }
  
  /**
   * Update the activity chart
   */
  updateActivityChart() {
    if (!this.charts.activity) return;
    
    // Get timeframe
    const timeframeSelect = this.element.querySelector('#activity-timeframe');
    const timeframe = timeframeSelect ? timeframeSelect.value : '24h';
    
    // Get time series data
    const timeSeries = this.usageTracker.getTimeSeries('events');
    
    // Filter based on selected timeframe
    const now = Date.now();
    let timeframeMs;
    
    switch (timeframe) {
      case '1h':
        timeframeMs = 60 * 60 * 1000;
        break;
      case '3h':
        timeframeMs = 3 * 60 * 60 * 1000;
        break;
      case '24h':
      default:
        timeframeMs = 24 * 60 * 60 * 1000;
        break;
    }
    
    const filteredSeries = timeSeries.filter(point => 
      point.timestamp >= now - timeframeMs
    );
    
    // Update chart data
    this.charts.activity.data.labels = filteredSeries.map(point => 
      new Date(point.timestamp).toLocaleTimeString()
    );
    
    this.charts.activity.data.datasets[0].data = filteredSeries.map(point => 
      point.value
    );
    
    // Update chart
    this.charts.activity.update();
  }
  
  /**
   * Update the modules chart
   * @param {Object} stats Usage statistics
   */
  updateModulesChart(stats) {
    if (!this.charts.modules) return;
    
    // Get modules data
    const modules = Object.entries(stats.modules)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10); // Top 10 modules
    
    // Update chart data
    this.charts.modules.data.labels = modules.map(([name]) => name);
    
    this.charts.modules.data.datasets[0].data = modules.map(([_, stats]) => 
      stats.count
    );
    
    this.charts.modules.data.datasets[1].data = modules.map(([_, stats]) => 
      stats.errors
    );
    
    // Update chart
    this.charts.modules.update();
  }
  
  /**
   * Update analytics charts
   * @param {Object} stats Usage statistics
   */
  updateAnalyticsCharts(stats) {
    // Update patterns chart
    if (this.charts.patterns) {
      // Get top modules for radar chart
      const topModules = Object.entries(stats.modules)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 8); // Top 8 modules for radar
      
      this.charts.patterns.data.labels = topModules.map(([name]) => name);
      
      this.charts.patterns.data.datasets[0].data = topModules.map(([_, stats]) => 
        stats.count
      );
      
      this.charts.patterns.update();
    }
    
    // Update memory chart
    if (this.charts.memory) {
      // Get memory usage by module
      const memoryByModule = Object.entries(stats.modules)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5); // Top 5 modules
      
      this.charts.memory.data.labels = memoryByModule.map(([name]) => name);
      
      // Use placeholder memory data for now
      this.charts.memory.data.datasets[0].data = memoryByModule.map(([_, stats]) => 
        stats.count * (Math.random() * 10 + 1) // Placeholder random memory usage
      );
      
      this.charts.memory.update();
    }
    
    // Update duration chart
    if (this.charts.duration) {
      // Get duration by module
      const durationByModule = Object.entries(stats.modules)
        .sort((a, b) => b[1].totalDuration - a[1].totalDuration)
        .slice(0, 5); // Top 5 modules
      
      this.charts.duration.data.labels = durationByModule.map(([name]) => name);
      
      this.charts.duration.data.datasets[0].data = durationByModule.map(([_, stats]) => 
        stats.totalDuration
      );
      
      this.charts.duration.update();
    }
  }
  
  /**
   * Show event details
   * @param {string} eventId Event ID
   */
  showEventDetails(eventId) {
    // Find event in tracker
    const event = this.usageTracker.storage.events.find(e => e.id === eventId);
    
    if (!event) {
      this.showError('Event not found');
      return;
    }
    
    // Show event details panel
    const eventDetails = this.element.querySelector('#event-details');
    const eventDetailsContent = this.element.querySelector('#event-details-content');
    
    if (!eventDetails || !eventDetailsContent) return;
    
    // Format event details
    const isError = event.operation.endsWith('_error');
    const statusClass = isError ? 'status-badge offline' : 'status-badge online';
    const statusText = isError ? 'Error' : 'Success';
    
    let detailsHtml = `
      <div class="event-header">
        <h4>${event.module} / ${event.operation}</h4>
        <span class="${statusClass}">${statusText}</span>
      </div>
      
      <div class="event-metadata">
        <div class="metadata-item">
          <div class="metadata-label">Time:</div>
          <div class="metadata-value">${new Date(event.timestamp).toLocaleString()}</div>
        </div>
        
        <div class="metadata-item">
          <div class="metadata-label">Duration:</div>
          <div class="metadata-value">${event.metrics.duration.toFixed(2)}ms</div>
        </div>
    `;
    
    // Add error details if available
    if (isError && event.details && event.details.error) {
      detailsHtml += `
        <div class="metadata-item">
          <div class="metadata-label">Error:</div>
          <div class="metadata-value text-error">${event.details.error}</div>
        </div>
      `;
    }
    
    detailsHtml += `</div>`;
    
    // Add details section
    if (Object.keys(event.details).length > 0) {
      detailsHtml += `
        <div class="details-section">
          <h5>Details</h5>
          <div class="details-content">
            <pre>${JSON.stringify(event.details, null, 2)}</pre>
          </div>
        </div>
      `;
    }
    
    // Add metrics section
    if (Object.keys(event.metrics).length > 0) {
      detailsHtml += `
        <div class="details-section">
          <h5>Metrics</h5>
          <div class="details-content">
            <pre>${JSON.stringify(event.metrics, null, 2)}</pre>
          </div>
        </div>
      `;
    }
    
    // Set content
    eventDetailsContent.innerHTML = detailsHtml;
    
    // Show panel
    eventDetails.style.display = 'block';
  }
  
  /**
   * Show module details
   * @param {string} module Module name
   */
  showModuleDetails(module) {
    // Get module stats
    const moduleStats = this.usageTracker.getModuleStats(module);
    
    if (!moduleStats) {
      this.showError('Module not found');
      return;
    }
    
    // Get module events
    const moduleEvents = this.usageTracker.getModuleEvents(module, 20);
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    
    // Calculate error rate percentage
    const errorRate = moduleStats.count > 0 ? moduleStats.errors / moduleStats.count : 0;
    const errorRateClass = errorRate > 0.05 ? 'text-error' : 
                          errorRate > 0.01 ? 'text-warning' : '';
    
    // Format operations table
    let operationsHtml = '';
    
    for (const op of moduleStats.operations) {
      const opErrorRate = op.count > 0 ? op.errors / op.count : 0;
      const opErrorRateClass = opErrorRate > 0.05 ? 'text-error' : 
                              opErrorRate > 0.01 ? 'text-warning' : '';
      
      operationsHtml += `
        <tr>
          <td>${op.operation}</td>
          <td>${op.count.toLocaleString()}</td>
          <td>${op.avgDuration.toFixed(2)}ms</td>
          <td class="${opErrorRateClass}">${(opErrorRate * 100).toFixed(2)}%</td>
        </tr>
      `;
    }
    
    if (operationsHtml === '') {
      operationsHtml = '<tr><td colspan="4" class="text-center">No operations found</td></tr>';
    }
    
    // Format recent events
    let eventsHtml = '';
    
    for (const event of moduleEvents) {
      const isError = event.operation.endsWith('_error');
      const statusClass = isError ? 'status-badge offline' : 'status-badge online';
      const statusText = isError ? 'Error' : 'Success';
      
      eventsHtml += `
        <tr>
          <td>${new Date(event.timestamp).toLocaleTimeString()}</td>
          <td>${event.operation}</td>
          <td>${event.metrics.duration.toFixed(2)}ms</td>
          <td><span class="${statusClass}">${statusText}</span></td>
        </tr>
      `;
    }
    
    if (eventsHtml === '') {
      eventsHtml = '<tr><td colspan="4" class="text-center">No events found</td></tr>';
    }
    
    dialog.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <h3>Module Details: ${module}</h3>
          <button class="dialog-close" id="close-module-dialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="module-summary">
            <div class="summary-row">
              <div class="summary-item">
                <div class="summary-label">Total Events</div>
                <div class="summary-value">${moduleStats.count.toLocaleString()}</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Operations</div>
                <div class="summary-value">${moduleStats.operations.length}</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Avg Duration</div>
                <div class="summary-value">${moduleStats.avgDuration.toFixed(2)}ms</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Error Rate</div>
                <div class="summary-value ${errorRateClass}">${(errorRate * 100).toFixed(2)}%</div>
              </div>
            </div>
          </div>
          
          <div class="module-details-tabs">
            <button class="tab-button active" data-tab="operations">Operations</button>
            <button class="tab-button" data-tab="events">Recent Events</button>
          </div>
          
          <div class="module-details-content">
            <div class="tab-content active" id="operations-content">
              <div class="table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Operation</th>
                      <th>Count</th>
                      <th>Avg Duration</th>
                      <th>Error Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${operationsHtml}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div class="tab-content" id="events-content">
              <div class="table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Operation</th>
                      <th>Duration</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${eventsHtml}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-primary" id="btn-close-module-details">Close</button>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(dialog);
    
    // Add event listeners
    document.getElementById('close-module-dialog').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    document.getElementById('btn-close-module-details').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
    
    // Tab switching
    const tabButtons = dialog.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Remove active class from all buttons and content
        tabButtons.forEach(btn => btn.classList.remove('active'));
        const contents = dialog.querySelectorAll('.tab-content');
        contents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked button and corresponding content
        button.classList.add('active');
        const tabId = button.getAttribute('data-tab');
        dialog.querySelector(`#${tabId}-content`).classList.add('active');
      });
    });
  }
  
  /**
   * Show error message
   * @param {string} message Error message
   */
  showError(message) {
    console.error(message);
    if (this.notifications) {
      this.notifications.error(message);
    } else {
      alert(`Error: ${message}`);
    }
  }
  
  /**
   * Show message
   * @param {string} type Message type (success, error, info, warning)
   * @param {string} message Message text
   */
  showMessage(type, message) {
    console.log(`[${type}] ${message}`);
    if (this.notifications) {
      this.notifications[type](message);
    } else {
      alert(message);
    }
  }
  
  /**
   * Clean up resources when dashboard is destroyed
   */
  destroy() {
    // Clear refresh timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    // Remove event listeners
    this.usageTracker.removeAllListeners();
  }
}

export default UsageDashboard;