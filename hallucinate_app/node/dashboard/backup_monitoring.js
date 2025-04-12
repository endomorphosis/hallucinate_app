/**
 * Real-time Backup Monitoring Dashboard
 * 
 * Provides a comprehensive real-time monitoring interface for database backups
 * with live updates, trend visualization, and status notifications.
 */

import { EventEmitter } from 'events';
import { databaseBackupBridge } from '../database_backup_bridge.js';
import { databaseBackupPyArrowAdapter } from '../database_backup_pyarrow_adapter.js';
import MetricsCollector from './observability/metrics_collector.js';
import { getMetricsRegistry } from './observability/metrics_registry.js';

/**
 * Backup Monitoring Dashboard
 * 
 * Real-time monitoring and visualization for database backups
 */
class BackupMonitoringDashboard extends EventEmitter {
  /**
   * Create a backup monitoring dashboard
   * 
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.container - Container element for the dashboard
   * @param {Object} options.resources - Resource pool
   */
  constructor(options = {}) {
    super();
    
    this.container = options.container;
    this.resources = options.resources || {};
    
    // Use provided bridges or get singleton instances
    this.backupBridge = this.resources.databaseBackupBridge || databaseBackupBridge;
    this.pyarrowAdapter = this.resources.databaseBackupPyArrowAdapter || databaseBackupPyArrowAdapter;
    
    // Initialize metrics collector
    this.metricsCollector = new MetricsCollector({
      component: 'backup_monitoring_dashboard',
      registry: getMetricsRegistry()
    });
    
    // State management
    this.activeOperations = new Map();
    this.completedOperations = [];
    this.maxCompletedOperations = 50;
    this.isInitialized = false;
    this.refreshInterval = null;
    this.refreshRate = 5000; // 5 seconds
    this.chartRefreshRate = 30000; // 30 seconds
    this.charts = {};
    this.eventBuffer = [];
    this.dbStatus = {
      orbitdb: { status: 'unknown', collections: 0, documents: 0, size: 0 },
      fireproofdb: { status: 'unknown', tables: 0, documents: 0, size: 0 },
      duckdb: { status: 'unknown', tables: 0, rows: 0, size: 0 }
    };
    
    // Activity log
    this.activityLog = [];
    this.maxActivityLogSize = 100;
    
    // Alert management
    this.alerts = [];
    this.maxAlerts = 10;
    
    // Initialize dashboard
    if (this.container) {
      this.init();
    }
  }
  
  /**
   * Initialize the dashboard
   */
  async init() {
    try {
      // Create UI elements
      this._createUI();
      
      // Initialize metrics
      this._initializeMetrics();
      
      // Bind event listeners
      this._registerEventListeners();
      
      // Load initial data
      await this._loadInitialData();
      
      // Start auto-refresh
      this._startAutoRefresh();
      
      this.isInitialized = true;
      this.emit('initialized', { success: true });
    } catch (error) {
      console.error('Error initializing backup monitoring dashboard:', error);
      this.emit('initialized', { success: false, error });
    }
  }
  
  /**
   * Initialize metrics for tracking backup operations
   * @private
   */
  _initializeMetrics() {
    // Create counters for monitoring operations
    this.metricsCollector.createCounter('operations_monitored', 'Total number of operations monitored', 
      ['operation_type', 'db_type', 'status']);
    this.metricsCollector.createCounter('alerts_generated', 'Total number of alerts generated', 
      ['severity', 'type']);
    
    // Create gauges for current status
    this.metricsCollector.createGauge('active_operations', 'Number of active operations', 
      ['operation_type', 'db_type']);
    this.metricsCollector.createGauge('database_status', 'Database status (1=healthy, 0=unhealthy)', 
      ['db_type']);
    
    // Create histograms for tracking operation durations and sizes
    this.metricsCollector.createHistogram('operation_duration', 'Duration of operations in seconds', 
      ['operation_type', 'db_type']);
    this.metricsCollector.createHistogram('backup_size', 'Size of backups in bytes', 
      ['db_type']);
    
    // Set initial values for gauges
    this.metricsCollector.setGauge('active_operations', 0, { operation_type: 'backup', db_type: 'orbitdb' });
    this.metricsCollector.setGauge('active_operations', 0, { operation_type: 'backup', db_type: 'fireproofdb' });
    this.metricsCollector.setGauge('active_operations', 0, { operation_type: 'backup', db_type: 'duckdb' });
    this.metricsCollector.setGauge('active_operations', 0, { operation_type: 'restore', db_type: 'orbitdb' });
    this.metricsCollector.setGauge('active_operations', 0, { operation_type: 'restore', db_type: 'fireproofdb' });
    this.metricsCollector.setGauge('active_operations', 0, { operation_type: 'restore', db_type: 'duckdb' });
  }
  
  /**
   * Create the dashboard UI
   * @private
   */
  _createUI() {
    // Set container class for styling
    this.container.classList.add('backup-monitoring-dashboard');
    
    // Create dashboard HTML
    const dashboardHTML = `
      <div class="monitoring-header">
        <h2>Real-time Backup Monitoring</h2>
        <div class="monitoring-controls">
          <button id="refresh-btn" class="control-button">
            <i class="fas fa-sync-alt"></i> Refresh
          </button>
          <div class="auto-refresh">
            <label for="auto-refresh-toggle">Auto-refresh</label>
            <input type="checkbox" id="auto-refresh-toggle" checked>
          </div>
        </div>
      </div>
      
      <div class="monitoring-content">
        <div class="monitoring-column main-column">
          <!-- Active Operations -->
          <div class="monitoring-panel active-operations-panel">
            <div class="panel-header">
              <h3>Active Operations</h3>
              <span class="operation-count" id="active-count">0</span>
            </div>
            <div class="panel-content" id="active-operations">
              <div class="no-operations">No active operations</div>
            </div>
          </div>
          
          <!-- Recent Activity -->
          <div class="monitoring-panel activity-panel">
            <div class="panel-header">
              <h3>Recent Activity</h3>
              <span class="activity-count" id="activity-count">0</span>
            </div>
            <div class="panel-content" id="activity-log">
              <div class="no-activity">No recent activity</div>
            </div>
          </div>
          
          <!-- Backup Trends Chart -->
          <div class="monitoring-panel chart-panel">
            <div class="panel-header">
              <h3>Backup Trends</h3>
              <div class="chart-controls">
                <select id="trend-chart-type">
                  <option value="count">Backup Count</option>
                  <option value="size">Backup Size</option>
                  <option value="duration">Backup Duration</option>
                </select>
                <select id="trend-time-range">
                  <option value="day">Last 24 Hours</option>
                  <option value="week" selected>Last Week</option>
                  <option value="month">Last Month</option>
                </select>
              </div>
            </div>
            <div class="panel-content chart-container">
              <canvas id="trends-chart"></canvas>
            </div>
          </div>
        </div>
        
        <div class="monitoring-column sidebar-column">
          <!-- System Status -->
          <div class="monitoring-panel status-panel">
            <div class="panel-header">
              <h3>System Status</h3>
            </div>
            <div class="panel-content">
              <div class="status-item">
                <span class="status-label">OrbitDB:</span>
                <span class="status-value" id="orbitdb-status">Unknown</span>
              </div>
              <div class="status-item">
                <span class="status-label">FireproofDB:</span>
                <span class="status-value" id="fireproofdb-status">Unknown</span>
              </div>
              <div class="status-item">
                <span class="status-label">DuckDB:</span>
                <span class="status-value" id="duckdb-status">Unknown</span>
              </div>
              <div class="status-item">
                <span class="status-label">Backup Service:</span>
                <span class="status-value" id="backup-service-status">Unknown</span>
              </div>
              <div class="status-item">
                <span class="status-label">PyArrow Index:</span>
                <span class="status-value" id="pyarrow-status">Unknown</span>
              </div>
            </div>
          </div>
          
          <!-- Backup Statistics -->
          <div class="monitoring-panel stats-panel">
            <div class="panel-header">
              <h3>Backup Statistics</h3>
            </div>
            <div class="panel-content">
              <div class="stat-item">
                <span class="stat-label">Total Backups:</span>
                <span class="stat-value" id="total-backups">0</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Total Restores:</span>
                <span class="stat-value" id="total-restores">0</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Storage Used:</span>
                <span class="stat-value" id="storage-used">0 B</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Avg Duration:</span>
                <span class="stat-value" id="avg-duration">0s</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Success Rate:</span>
                <span class="stat-value" id="success-rate">0%</span>
              </div>
            </div>
          </div>
          
          <!-- Database Distribution Chart -->
          <div class="monitoring-panel chart-panel">
            <div class="panel-header">
              <h3>Database Distribution</h3>
            </div>
            <div class="panel-content chart-container small-chart">
              <canvas id="distribution-chart"></canvas>
            </div>
          </div>
          
          <!-- Alerts -->
          <div class="monitoring-panel alerts-panel">
            <div class="panel-header">
              <h3>Alerts</h3>
              <button id="clear-alerts-btn" class="clear-button">Clear All</button>
            </div>
            <div class="panel-content" id="alerts-container">
              <div class="no-alerts">No alerts</div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Set container HTML
    this.container.innerHTML = dashboardHTML;
    
    // Initialize any required UI components
    this._initializeUIComponents();
  }
  
  /**
   * Initialize UI components that require JavaScript
   * @private
   */
  _initializeUIComponents() {
    // Set up refresh button
    const refreshBtn = this.container.querySelector('#refresh-btn');
    refreshBtn.addEventListener('click', () => this._refreshDashboard());
    
    // Set up auto-refresh toggle
    const autoRefreshToggle = this.container.querySelector('#auto-refresh-toggle');
    autoRefreshToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        this._startAutoRefresh();
      } else {
        this._stopAutoRefresh();
      }
    });
    
    // Set up chart type selector
    const trendChartType = this.container.querySelector('#trend-chart-type');
    trendChartType.addEventListener('change', () => this._updateTrendsChart());
    
    // Set up time range selector
    const trendTimeRange = this.container.querySelector('#trend-time-range');
    trendTimeRange.addEventListener('change', () => this._updateTrendsChart());
    
    // Set up clear alerts button
    const clearAlertsBtn = this.container.querySelector('#clear-alerts-btn');
    clearAlertsBtn.addEventListener('click', () => this._clearAlerts());
  }
  
  /**
   * Register event listeners for backup bridge and PyArrow adapter
   * @private
   */
  _registerEventListeners() {
    // Backup operation events
    this.backupBridge.on('backup-started', (data) => this._handleBackupStarted(data));
    this.backupBridge.on('backup-progress', (data) => this._handleBackupProgress(data));
    this.backupBridge.on('backup-completed', (data) => this._handleBackupCompleted(data));
    this.backupBridge.on('backup-error', (data) => this._handleBackupError(data));
    
    // Restore operation events
    this.backupBridge.on('restore-started', (data) => this._handleRestoreStarted(data));
    this.backupBridge.on('restore-progress', (data) => this._handleRestoreProgress(data));
    this.backupBridge.on('restore-completed', (data) => this._handleRestoreCompleted(data));
    this.backupBridge.on('restore-error', (data) => this._handleRestoreError(data));
    
    // PyArrow content index events
    this.pyarrowAdapter.on('backup-indexed', (data) => this._handleBackupIndexed(data));
    this.pyarrowAdapter.on('backup-index-error', (data) => this._handleBackupIndexError(data));
    this.pyarrowAdapter.on('restore-metadata-updated', (data) => this._handleRestoreMetadataUpdated(data));
    this.pyarrowAdapter.on('backup-index-discrepancy', (data) => this._handleIndexDiscrepancy(data));
  }
  
  /**
   * Load initial data for the dashboard
   * @private
   */
  async _loadInitialData() {
    try {
      // Get in-progress operations
      const activeOperations = this.backupBridge.getInProgressOperations();
      for (const operation of activeOperations) {
        this.activeOperations.set(operation.operation_id, operation);
      }
      
      // Update active operations UI
      this._updateActiveOperationsUI();
      
      // Get backup statistics from PyArrow adapter
      const backupStats = await this.pyarrowAdapter.getBackupStats();
      this._updateBackupStats(backupStats);
      
      // Load database status
      await this._loadDatabaseStatus();
      
      // Initialize charts
      this._initializeCharts();
      
      // Apply any buffered events that came in during initialization
      this._processEventBuffer();
    } catch (error) {
      console.error('Error loading initial data:', error);
      this._addAlert('error', 'Dashboard Initialization', 'Failed to load initial data');
    }
  }
  
  /**
   * Load database status for all database types
   * @private
   */
  async _loadDatabaseStatus() {
    try {
      // Call the appropriate methods to get database status
      // This would normally call methods on the backupBridge to get status
      // For now, we'll use mock data
      
      this.dbStatus = {
        orbitdb: { 
          status: 'healthy', 
          collections: 12, 
          documents: 1250, 
          size: 2.5 * 1024 * 1024 
        },
        fireproofdb: { 
          status: 'healthy', 
          tables: 8, 
          documents: 3200, 
          size: 4.2 * 1024 * 1024 
        },
        duckdb: { 
          status: 'healthy', 
          tables: 15, 
          rows: 42000, 
          size: 12.8 * 1024 * 1024 
        }
      };
      
      // Update the UI
      this._updateDatabaseStatusUI();
      
      // Set status metrics
      this.metricsCollector.setGauge('database_status', 
        this.dbStatus.orbitdb.status === 'healthy' ? 1 : 0, 
        { db_type: 'orbitdb' }
      );
      this.metricsCollector.setGauge('database_status', 
        this.dbStatus.fireproofdb.status === 'healthy' ? 1 : 0, 
        { db_type: 'fireproofdb' }
      );
      this.metricsCollector.setGauge('database_status', 
        this.dbStatus.duckdb.status === 'healthy' ? 1 : 0, 
        { db_type: 'duckdb' }
      );
      
      // Check index health
      const pyarrowHealth = await this._checkPyArrowHealth();
      this._updateIndexStatusUI(pyarrowHealth);
      
      // Check backup service status
      const backupServiceActive = await this._checkBackupServiceHealth();
      this._updateBackupServiceStatusUI(backupServiceActive);
    } catch (error) {
      console.error('Error loading database status:', error);
      this._addAlert('warning', 'Database Status', 'Failed to load database status information');
    }
  }
  
  /**
   * Check the health of the PyArrow content index
   * @returns {Promise<boolean>} Health status
   * @private
   */
  async _checkPyArrowHealth() {
    try {
      // Try to get stats from the PyArrow adapter
      await this.pyarrowAdapter.getBackupStats();
      return true;
    } catch (error) {
      console.error('Error checking PyArrow health:', error);
      return false;
    }
  }
  
  /**
   * Check the health of the backup service
   * @returns {Promise<boolean>} Health status
   * @private
   */
  async _checkBackupServiceHealth() {
    try {
      // Try to list backups as a simple health check
      await this.backupBridge.listBackups('orbitdb');
      return true;
    } catch (error) {
      console.error('Error checking backup service health:', error);
      return false;
    }
  }
  
  /**
   * Start auto-refresh for the dashboard
   * @private
   */
  _startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    this.refreshInterval = setInterval(() => {
      this._refreshDashboard();
    }, this.refreshRate);
    
    // Also start chart refresh on a less frequent interval
    if (this.chartRefreshInterval) {
      clearInterval(this.chartRefreshInterval);
    }
    
    this.chartRefreshInterval = setInterval(() => {
      this._updateCharts();
    }, this.chartRefreshRate);
  }
  
  /**
   * Stop auto-refresh for the dashboard
   * @private
   */
  _stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    
    if (this.chartRefreshInterval) {
      clearInterval(this.chartRefreshInterval);
      this.chartRefreshInterval = null;
    }
  }
  
  /**
   * Refresh the dashboard data and UI
   * @private
   */
  async _refreshDashboard() {
    try {
      // Update active operations
      const activeOperations = this.backupBridge.getInProgressOperations();
      
      // Clear current operations and add the fresh ones
      this.activeOperations.clear();
      for (const operation of activeOperations) {
        this.activeOperations.set(operation.operation_id, operation);
      }
      
      // Update the UI
      this._updateActiveOperationsUI();
      
      // Check service health
      await this._loadDatabaseStatus();
      
      // Get updated backup statistics
      const backupStats = await this.pyarrowAdapter.getBackupStats();
      this._updateBackupStats(backupStats);
      
      // Update charts
      this._updateCharts();
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
    }
  }
  
  /**
   * Update the active operations UI
   * @private
   */
  _updateActiveOperationsUI() {
    const container = this.container.querySelector('#active-operations');
    const activeCount = this.container.querySelector('#active-count');
    
    // Update count
    activeCount.textContent = this.activeOperations.size;
    
    // Clear container
    container.innerHTML = '';
    
    if (this.activeOperations.size === 0) {
      container.innerHTML = '<div class="no-operations">No active operations</div>';
      return;
    }
    
    // Add operation cards
    for (const [id, operation] of this.activeOperations) {
      const card = document.createElement('div');
      card.className = `operation-card ${operation.type}-operation`;
      card.dataset.id = id;
      
      // Format elapsed time
      const elapsed = operation.elapsed_formatted || this._formatElapsedTime(Date.now() - operation.start_time);
      
      // Create card content
      card.innerHTML = `
        <div class="operation-header">
          <span class="operation-type">${operation.type}</span>
          <span class="operation-db">${operation.db_type}</span>
        </div>
        <div class="operation-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${operation.progress}%"></div>
          </div>
          <span class="progress-text">${operation.progress}%</span>
        </div>
        <div class="operation-details">
          <div class="operation-status">${operation.status}</div>
          <div class="operation-time">
            <i class="far fa-clock"></i> ${elapsed}
          </div>
        </div>
      `;
      
      container.appendChild(card);
    }
  }
  
  /**
   * Update the activity log UI
   * @private
   */
  _updateActivityLogUI() {
    const container = this.container.querySelector('#activity-log');
    const activityCount = this.container.querySelector('#activity-count');
    
    // Update count
    activityCount.textContent = this.activityLog.length;
    
    // Clear container
    container.innerHTML = '';
    
    if (this.activityLog.length === 0) {
      container.innerHTML = '<div class="no-activity">No recent activity</div>';
      return;
    }
    
    // Add activity items
    for (const activity of this.activityLog) {
      const item = document.createElement('div');
      item.className = `activity-item ${activity.type}-activity ${activity.status || ''}`;
      
      // Format timestamp
      const timestamp = this._formatTimestamp(activity.timestamp);
      
      // Create item content
      item.innerHTML = `
        <div class="activity-icon">
          <i class="${this._getActivityIcon(activity)}"></i>
        </div>
        <div class="activity-content">
          <div class="activity-message">${activity.message}</div>
          <div class="activity-details">
            <span class="activity-time">${timestamp}</span>
            <span class="activity-db">${activity.db_type}</span>
          </div>
        </div>
      `;
      
      container.appendChild(item);
    }
  }
  
  /**
   * Update the database status UI
   * @private
   */
  _updateDatabaseStatusUI() {
    // Update OrbitDB status
    const orbitStatus = this.container.querySelector('#orbitdb-status');
    orbitStatus.textContent = this.dbStatus.orbitdb.status;
    orbitStatus.className = `status-value status-${this.dbStatus.orbitdb.status}`;
    
    // Update FireproofDB status
    const fireproofStatus = this.container.querySelector('#fireproofdb-status');
    fireproofStatus.textContent = this.dbStatus.fireproofdb.status;
    fireproofStatus.className = `status-value status-${this.dbStatus.fireproofdb.status}`;
    
    // Update DuckDB status
    const duckdbStatus = this.container.querySelector('#duckdb-status');
    duckdbStatus.textContent = this.dbStatus.duckdb.status;
    duckdbStatus.className = `status-value status-${this.dbStatus.duckdb.status}`;
  }
  
  /**
   * Update the PyArrow index status UI
   * 
   * @param {boolean} isHealthy - Whether the index is healthy
   * @private
   */
  _updateIndexStatusUI(isHealthy) {
    const pyarrowStatus = this.container.querySelector('#pyarrow-status');
    
    if (isHealthy) {
      pyarrowStatus.textContent = 'Healthy';
      pyarrowStatus.className = 'status-value status-healthy';
    } else {
      pyarrowStatus.textContent = 'Unhealthy';
      pyarrowStatus.className = 'status-value status-error';
      
      // Add an alert if the index is unhealthy
      this._addAlert('error', 'PyArrow Index', 'The PyArrow Content Index is not healthy');
    }
  }
  
  /**
   * Update the backup service status UI
   * 
   * @param {boolean} isActive - Whether the service is active
   * @private
   */
  _updateBackupServiceStatusUI(isActive) {
    const serviceStatus = this.container.querySelector('#backup-service-status');
    
    if (isActive) {
      serviceStatus.textContent = 'Active';
      serviceStatus.className = 'status-value status-healthy';
    } else {
      serviceStatus.textContent = 'Inactive';
      serviceStatus.className = 'status-value status-error';
      
      // Add an alert if the service is inactive
      this._addAlert('error', 'Backup Service', 'The backup service is not active');
    }
  }
  
  /**
   * Update backup statistics UI
   * 
   * @param {Object} stats - Backup statistics from PyArrow adapter
   * @private
   */
  _updateBackupStats(stats) {
    // Update total backups
    const totalBackups = this.container.querySelector('#total-backups');
    totalBackups.textContent = stats.total_count;
    
    // Update total restores
    const totalRestores = this.container.querySelector('#total-restores');
    totalRestores.textContent = stats.restore_metrics.total_restores;
    
    // Update storage used
    const storageUsed = this.container.querySelector('#storage-used');
    storageUsed.textContent = this._formatSize(stats.size_metrics.total_size);
    
    // Update average duration (using mock data for now)
    const avgDuration = this.container.querySelector('#avg-duration');
    avgDuration.textContent = '45s';
    
    // Update success rate (using mock data for now)
    const successRate = this.container.querySelector('#success-rate');
    successRate.textContent = '98%';
  }
  
  /**
   * Initialize charts for the dashboard
   * @private
   */
  _initializeCharts() {
    // Initialize trends chart
    this.charts.trends = this._createTrendsChart();
    
    // Initialize distribution chart
    this.charts.distribution = this._createDistributionChart();
  }
  
  /**
   * Create the trends chart
   * @returns {Object} Chart instance
   * @private
   */
  _createTrendsChart() {
    const canvas = this.container.querySelector('#trends-chart');
    const ctx = canvas.getContext('2d');
    
    // Create mock data for demonstration
    const labels = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - 6 + i);
      return date.toLocaleDateString();
    });
    
    const data = {
      labels,
      datasets: [
        {
          label: 'OrbitDB',
          data: [3, 5, 2, 6, 4, 7, 3],
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderWidth: 2,
          tension: 0.4
        },
        {
          label: 'FireproofDB',
          data: [2, 4, 3, 1, 5, 3, 4],
          borderColor: 'rgba(255, 99, 132, 1)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          borderWidth: 2,
          tension: 0.4
        },
        {
          label: 'DuckDB',
          data: [1, 3, 4, 2, 3, 2, 5],
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderWidth: 2,
          tension: 0.4
        }
      ]
    };
    
    return new Chart(ctx, {
      type: 'line',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
          },
          title: {
            display: true,
            text: 'Backup Count by Database Type'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Count'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Date'
            }
          }
        }
      }
    });
  }
  
  /**
   * Create the distribution chart
   * @returns {Object} Chart instance
   * @private
   */
  _createDistributionChart() {
    const canvas = this.container.querySelector('#distribution-chart');
    const ctx = canvas.getContext('2d');
    
    // Create mock data for demonstration
    const data = {
      labels: ['OrbitDB', 'FireproofDB', 'DuckDB'],
      datasets: [{
        data: [12, 8, 15],
        backgroundColor: [
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 99, 132, 0.8)',
          'rgba(75, 192, 192, 0.8)'
        ],
        borderColor: [
          'rgba(54, 162, 235, 1)',
          'rgba(255, 99, 132, 1)',
          'rgba(75, 192, 192, 1)'
        ],
        borderWidth: 1
      }]
    };
    
    return new Chart(ctx, {
      type: 'doughnut',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
          },
          title: {
            display: true,
            text: 'Backup Distribution'
          }
        }
      }
    });
  }
  
  /**
   * Update all charts with latest data
   * @private
   */
  _updateCharts() {
    this._updateTrendsChart();
    this._updateDistributionChart();
  }
  
  /**
   * Update the trends chart with latest data
   * @private
   */
  _updateTrendsChart() {
    const chartType = this.container.querySelector('#trend-chart-type').value;
    const timeRange = this.container.querySelector('#trend-time-range').value;
    
    // In a real implementation, we would fetch data based on chartType and timeRange
    // For now, we'll update with different mock data based on the selection
    
    let title, yTitle, datasets;
    
    switch (chartType) {
      case 'size':
        title = 'Backup Size by Database Type';
        yTitle = 'Size (MB)';
        datasets = [
          {
            label: 'OrbitDB',
            data: [2.5, 3.1, 1.8, 4.2, 3.5, 2.9, 3.3],
            borderColor: 'rgba(54, 162, 235, 1)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderWidth: 2,
            tension: 0.4
          },
          {
            label: 'FireproofDB',
            data: [4.2, 3.8, 4.5, 3.9, 5.1, 4.7, 5.2],
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderWidth: 2,
            tension: 0.4
          },
          {
            label: 'DuckDB',
            data: [12.8, 14.2, 11.5, 13.8, 15.2, 13.9, 16.1],
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderWidth: 2,
            tension: 0.4
          }
        ];
        break;
        
      case 'duration':
        title = 'Backup Duration by Database Type';
        yTitle = 'Duration (seconds)';
        datasets = [
          {
            label: 'OrbitDB',
            data: [45, 52, 38, 61, 48, 55, 42],
            borderColor: 'rgba(54, 162, 235, 1)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderWidth: 2,
            tension: 0.4
          },
          {
            label: 'FireproofDB',
            data: [35, 42, 38, 31, 45, 39, 41],
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderWidth: 2,
            tension: 0.4
          },
          {
            label: 'DuckDB',
            data: [65, 72, 68, 75, 79, 71, 82],
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderWidth: 2,
            tension: 0.4
          }
        ];
        break;
        
      default: // count
        title = 'Backup Count by Database Type';
        yTitle = 'Count';
        datasets = [
          {
            label: 'OrbitDB',
            data: [3, 5, 2, 6, 4, 7, 3],
            borderColor: 'rgba(54, 162, 235, 1)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderWidth: 2,
            tension: 0.4
          },
          {
            label: 'FireproofDB',
            data: [2, 4, 3, 1, 5, 3, 4],
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderWidth: 2,
            tension: 0.4
          },
          {
            label: 'DuckDB',
            data: [1, 3, 4, 2, 3, 2, 5],
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderWidth: 2,
            tension: 0.4
          }
        ];
    }
    
    // Get appropriate time range labels based on selection
    let labels;
    
    switch (timeRange) {
      case 'day':
        // Last 24 hours in 3-hour intervals
        labels = Array.from({ length: 8 }, (_, i) => {
          const date = new Date();
          date.setHours(date.getHours() - 21 + i * 3);
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        });
        break;
        
      case 'month':
        // Last 30 days in 5-day intervals
        labels = Array.from({ length: 6 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - 30 + i * 5);
          return date.toLocaleDateString();
        });
        break;
        
      default: // week
        // Last 7 days
        labels = Array.from({ length: 7 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - 6 + i);
          return date.toLocaleDateString();
        });
    }
    
    // Update chart data and options
    this.charts.trends.data.labels = labels;
    this.charts.trends.data.datasets = datasets;
    this.charts.trends.options.plugins.title.text = title;
    this.charts.trends.options.scales.y.title.text = yTitle;
    
    // Update the chart
    this.charts.trends.update();
  }
  
  /**
   * Update the distribution chart with latest data
   * @private
   */
  _updateDistributionChart() {
    // In a real implementation, we would fetch this data from PyArrow adapter
    // For now, we'll update with mock data
    
    // Update data
    this.charts.distribution.data.datasets[0].data = [
      this.dbStatus.orbitdb.collections,
      this.dbStatus.fireproofdb.tables,
      this.dbStatus.duckdb.tables
    ];
    
    // Update the chart
    this.charts.distribution.update();
  }
  
  /**
   * Add an alert to the alerts panel
   * 
   * @param {string} severity - Alert severity: 'info', 'warning', or 'error'
   * @param {string} type - Alert type
   * @param {string} message - Alert message
   * @private
   */
  _addAlert(severity, type, message) {
    // Create alert object
    const alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      severity,
      type,
      message,
      timestamp: new Date()
    };
    
    // Add to alerts array
    this.alerts.unshift(alert);
    
    // Trim if exceeding max size
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }
    
    // Update alerts UI
    this._updateAlertsUI();
    
    // Track alert in metrics
    this.metricsCollector.incrementCounter('alerts_generated', 1, { 
      severity, 
      type 
    });
  }
  
  /**
   * Update the alerts UI
   * @private
   */
  _updateAlertsUI() {
    const container = this.container.querySelector('#alerts-container');
    
    // Clear container
    container.innerHTML = '';
    
    if (this.alerts.length === 0) {
      container.innerHTML = '<div class="no-alerts">No alerts</div>';
      return;
    }
    
    // Add alert items
    for (const alert of this.alerts) {
      const item = document.createElement('div');
      item.className = `alert-item alert-${alert.severity}`;
      item.dataset.id = alert.id;
      
      // Format timestamp
      const timestamp = this._formatTimestamp(alert.timestamp);
      
      // Create item content
      item.innerHTML = `
        <div class="alert-icon">
          <i class="${this._getAlertIcon(alert.severity)}"></i>
        </div>
        <div class="alert-content">
          <div class="alert-header">
            <span class="alert-type">${alert.type}</span>
            <button class="alert-dismiss" data-id="${alert.id}">×</button>
          </div>
          <div class="alert-message">${alert.message}</div>
          <div class="alert-time">${timestamp}</div>
        </div>
      `;
      
      // Add dismiss event listener
      const dismissBtn = item.querySelector('.alert-dismiss');
      dismissBtn.addEventListener('click', (e) => {
        const alertId = e.target.dataset.id;
        this._dismissAlert(alertId);
      });
      
      container.appendChild(item);
    }
  }
  
  /**
   * Dismiss a specific alert
   * 
   * @param {string} alertId - Alert ID to dismiss
   * @private
   */
  _dismissAlert(alertId) {
    // Find the alert index
    const index = this.alerts.findIndex(alert => alert.id === alertId);
    
    if (index !== -1) {
      // Remove the alert
      this.alerts.splice(index, 1);
      
      // Update the UI
      this._updateAlertsUI();
    }
  }
  
  /**
   * Clear all alerts
   * @private
   */
  _clearAlerts() {
    // Clear alerts array
    this.alerts = [];
    
    // Update the UI
    this._updateAlertsUI();
  }
  
  /**
   * Handle backup started event
   * 
   * @param {Object} data - Backup started event data
   * @private
   */
  _handleBackupStarted(data) {
    if (!this.isInitialized) {
      // Buffer the event for later processing
      this.eventBuffer.push({ type: 'backup-started', data });
      return;
    }
    
    // Add operation to active operations
    this.activeOperations.set(data.operation_id, {
      ...data,
      progress: 0,
      start_time: Date.now(),
      last_updated: Date.now()
    });
    
    // Update active operations UI
    this._updateActiveOperationsUI();
    
    // Add to activity log
    this._addToActivityLog({
      type: 'backup',
      status: 'started',
      db_type: data.db_type,
      message: `Backup started for ${data.db_type}`,
      timestamp: new Date()
    });
    
    // Update metrics
    this.metricsCollector.incrementGauge('active_operations', 1, { 
      operation_type: 'backup', 
      db_type: data.db_type 
    });
  }
  
  /**
   * Handle backup progress event
   * 
   * @param {Object} data - Backup progress event data
   * @private
   */
  _handleBackupProgress(data) {
    if (!this.isInitialized) {
      // Buffer the event for later processing
      this.eventBuffer.push({ type: 'backup-progress', data });
      return;
    }
    
    // Update operation in active operations
    if (this.activeOperations.has(data.operation_id)) {
      const operation = this.activeOperations.get(data.operation_id);
      operation.status = data.status;
      operation.progress = data.progress;
      operation.last_updated = Date.now();
      
      // Update active operations UI
      this._updateActiveOperationsUI();
    }
  }
  
  /**
   * Handle backup completed event
   * 
   * @param {Object} data - Backup completed event data
   * @private
   */
  _handleBackupCompleted(data) {
    if (!this.isInitialized) {
      // Buffer the event for later processing
      this.eventBuffer.push({ type: 'backup-completed', data });
      return;
    }
    
    // Get the operation from active operations
    const operation = this.activeOperations.get(data.operation_id);
    
    // Remove from active operations
    this.activeOperations.delete(data.operation_id);
    
    // Add to completed operations with completion timestamp
    if (operation) {
      const completedOperation = {
        ...operation,
        ...data,
        status: 'completed',
        end_time: Date.now(),
        duration: operation.start_time ? Date.now() - operation.start_time : 0
      };
      
      this.completedOperations.unshift(completedOperation);
      
      // Trim if exceeding max size
      if (this.completedOperations.length > this.maxCompletedOperations) {
        this.completedOperations = this.completedOperations.slice(0, this.maxCompletedOperations);
      }
      
      // Update metrics
      this.metricsCollector.incrementCounter('operations_monitored', 1, { 
        operation_type: 'backup', 
        db_type: data.db_type, 
        status: 'success' 
      });
      
      this.metricsCollector.decrementGauge('active_operations', 1, { 
        operation_type: 'backup', 
        db_type: data.db_type 
      });
      
      if (completedOperation.duration) {
        this.metricsCollector.recordHistogram('operation_duration', 
          completedOperation.duration / 1000, // convert to seconds
          { operation_type: 'backup', db_type: data.db_type }
        );
      }
      
      if (data.size) {
        this.metricsCollector.recordHistogram('backup_size', 
          data.size, 
          { db_type: data.db_type }
        );
      }
    }
    
    // Update active operations UI
    this._updateActiveOperationsUI();
    
    // Add to activity log
    this._addToActivityLog({
      type: 'backup',
      status: 'completed',
      db_type: data.db_type,
      message: `Backup completed for ${data.db_type}`,
      timestamp: new Date(),
      additional: {
        backup_id: data.backup_id,
        cid: data.cid,
        size: data.size,
        document_count: data.document_count
      }
    });
  }
  
  /**
   * Handle backup error event
   * 
   * @param {Object} data - Backup error event data
   * @private
   */
  _handleBackupError(data) {
    if (!this.isInitialized) {
      // Buffer the event for later processing
      this.eventBuffer.push({ type: 'backup-error', data });
      return;
    }
    
    // Get the operation from active operations
    const operation = this.activeOperations.get(data.operation_id);
    
    // Remove from active operations
    this.activeOperations.delete(data.operation_id);
    
    // Add to completed operations with error information
    if (operation) {
      const errorOperation = {
        ...operation,
        ...data,
        status: 'error',
        end_time: Date.now(),
        duration: operation.start_time ? Date.now() - operation.start_time : 0
      };
      
      this.completedOperations.unshift(errorOperation);
      
      // Trim if exceeding max size
      if (this.completedOperations.length > this.maxCompletedOperations) {
        this.completedOperations = this.completedOperations.slice(0, this.maxCompletedOperations);
      }
      
      // Update metrics
      this.metricsCollector.incrementCounter('operations_monitored', 1, { 
        operation_type: 'backup', 
        db_type: data.db_type, 
        status: 'error' 
      });
      
      this.metricsCollector.decrementGauge('active_operations', 1, { 
        operation_type: 'backup', 
        db_type: data.db_type 
      });
    }
    
    // Update active operations UI
    this._updateActiveOperationsUI();
    
    // Add to activity log
    this._addToActivityLog({
      type: 'backup',
      status: 'error',
      db_type: data.db_type,
      message: `Backup failed for ${data.db_type}: ${data.error}`,
      timestamp: new Date()
    });
    
    // Add an alert
    this._addAlert('error', 'Backup Failed', `Backup failed for ${data.db_type}: ${data.error}`);
  }
  
  /**
   * Handle restore started event
   * 
   * @param {Object} data - Restore started event data
   * @private
   */
  _handleRestoreStarted(data) {
    if (!this.isInitialized) {
      // Buffer the event for later processing
      this.eventBuffer.push({ type: 'restore-started', data });
      return;
    }
    
    // Add operation to active operations
    this.activeOperations.set(data.operation_id, {
      ...data,
      type: 'restore',
      progress: 0,
      start_time: Date.now(),
      last_updated: Date.now()
    });
    
    // Update active operations UI
    this._updateActiveOperationsUI();
    
    // Add to activity log
    this._addToActivityLog({
      type: 'restore',
      status: 'started',
      db_type: data.db_type,
      message: `Restore started for ${data.db_type}`,
      timestamp: new Date(),
      additional: {
        backup_id: data.backup_id,
        cid: data.cid
      }
    });
    
    // Update metrics
    this.metricsCollector.incrementGauge('active_operations', 1, { 
      operation_type: 'restore', 
      db_type: data.db_type 
    });
  }
  
  /**
   * Handle restore progress event
   * 
   * @param {Object} data - Restore progress event data
   * @private
   */
  _handleRestoreProgress(data) {
    if (!this.isInitialized) {
      // Buffer the event for later processing
      this.eventBuffer.push({ type: 'restore-progress', data });
      return;
    }
    
    // Update operation in active operations
    if (this.activeOperations.has(data.operation_id)) {
      const operation = this.activeOperations.get(data.operation_id);
      operation.status = data.status;
      operation.progress = data.progress;
      operation.last_updated = Date.now();
      
      // Update active operations UI
      this._updateActiveOperationsUI();
    }
  }
  
  /**
   * Handle restore completed event
   * 
   * @param {Object} data - Restore completed event data
   * @private
   */
  _handleRestoreCompleted(data) {
    if (!this.isInitialized) {
      // Buffer the event for later processing
      this.eventBuffer.push({ type: 'restore-completed', data });
      return;
    }
    
    // Get the operation from active operations
    const operation = this.activeOperations.get(data.operation_id);
    
    // Remove from active operations
    this.activeOperations.delete(data.operation_id);
    
    // Add to completed operations with completion timestamp
    if (operation) {
      const completedOperation = {
        ...operation,
        ...data,
        status: 'completed',
        end_time: Date.now(),
        duration: operation.start_time ? Date.now() - operation.start_time : 0
      };
      
      this.completedOperations.unshift(completedOperation);
      
      // Trim if exceeding max size
      if (this.completedOperations.length > this.maxCompletedOperations) {
        this.completedOperations = this.completedOperations.slice(0, this.maxCompletedOperations);
      }
      
      // Update metrics
      this.metricsCollector.incrementCounter('operations_monitored', 1, { 
        operation_type: 'restore', 
        db_type: data.db_type, 
        status: 'success' 
      });
      
      this.metricsCollector.decrementGauge('active_operations', 1, { 
        operation_type: 'restore', 
        db_type: data.db_type 
      });
      
      if (completedOperation.duration) {
        this.metricsCollector.recordHistogram('operation_duration', 
          completedOperation.duration / 1000, // convert to seconds
          { operation_type: 'restore', db_type: data.db_type }
        );
      }
    }
    
    // Update active operations UI
    this._updateActiveOperationsUI();
    
    // Add to activity log
    this._addToActivityLog({
      type: 'restore',
      status: 'completed',
      db_type: data.db_type,
      message: `Restore completed for ${data.db_type}`,
      timestamp: new Date(),
      additional: {
        backup_id: data.backup_id,
        cid: data.cid,
        collections_restored: data.collections_restored,
        document_count: data.document_count
      }
    });
  }
  
  /**
   * Handle restore error event
   * 
   * @param {Object} data - Restore error event data
   * @private
   */
  _handleRestoreError(data) {
    if (!this.isInitialized) {
      // Buffer the event for later processing
      this.eventBuffer.push({ type: 'restore-error', data });
      return;
    }
    
    // Get the operation from active operations
    const operation = this.activeOperations.get(data.operation_id);
    
    // Remove from active operations
    this.activeOperations.delete(data.operation_id);
    
    // Add to completed operations with error information
    if (operation) {
      const errorOperation = {
        ...operation,
        ...data,
        status: 'error',
        end_time: Date.now(),
        duration: operation.start_time ? Date.now() - operation.start_time : 0
      };
      
      this.completedOperations.unshift(errorOperation);
      
      // Trim if exceeding max size
      if (this.completedOperations.length > this.maxCompletedOperations) {
        this.completedOperations = this.completedOperations.slice(0, this.maxCompletedOperations);
      }
      
      // Update metrics
      this.metricsCollector.incrementCounter('operations_monitored', 1, { 
        operation_type: 'restore', 
        db_type: data.db_type, 
        status: 'error' 
      });
      
      this.metricsCollector.decrementGauge('active_operations', 1, { 
        operation_type: 'restore', 
        db_type: data.db_type 
      });
    }
    
    // Update active operations UI
    this._updateActiveOperationsUI();
    
    // Add to activity log
    this._addToActivityLog({
      type: 'restore',
      status: 'error',
      db_type: data.db_type,
      message: `Restore failed for ${data.db_type}: ${data.error}`,
      timestamp: new Date(),
      additional: {
        backup_id: data.backup_id,
        cid: data.cid
      }
    });
    
    // Add an alert
    this._addAlert('error', 'Restore Failed', `Restore failed for ${data.db_type}: ${data.error}`);
  }
  
  /**
   * Handle backup indexed event
   * 
   * @param {Object} data - Backup indexed event data
   * @private
   */
  _handleBackupIndexed(data) {
    if (!this.isInitialized) {
      // Buffer the event for later processing
      this.eventBuffer.push({ type: 'backup-indexed', data });
      return;
    }
    
    // Add to activity log
    this._addToActivityLog({
      type: 'index',
      status: 'indexed',
      db_type: data.db_type,
      message: `Backup indexed for ${data.db_type}`,
      timestamp: new Date(),
      additional: {
        backup_id: data.backup_id,
        cid: data.cid,
        virtual_path: data.virtual_path
      }
    });
  }
  
  /**
   * Handle backup index error event
   * 
   * @param {Object} data - Backup index error event data
   * @private
   */
  _handleBackupIndexError(data) {
    if (!this.isInitialized) {
      // Buffer the event for later processing
      this.eventBuffer.push({ type: 'backup-index-error', data });
      return;
    }
    
    // Add to activity log
    this._addToActivityLog({
      type: 'index',
      status: 'error',
      db_type: data.db_type,
      message: `Failed to index backup for ${data.db_type}: ${data.error}`,
      timestamp: new Date(),
      additional: {
        backup_id: data.backup_id,
        cid: data.cid
      }
    });
    
    // Add an alert
    this._addAlert('warning', 'Index Error', `Failed to index backup for ${data.db_type}: ${data.error}`);
  }
  
  /**
   * Handle restore metadata updated event
   * 
   * @param {Object} data - Restore metadata updated event data
   * @private
   */
  _handleRestoreMetadataUpdated(data) {
    if (!this.isInitialized) {
      // Buffer the event for later processing
      this.eventBuffer.push({ type: 'restore-metadata-updated', data });
      return;
    }
    
    // Add to activity log
    this._addToActivityLog({
      type: 'index',
      status: 'updated',
      db_type: data.db_type,
      message: `Restore metadata updated for ${data.db_type}`,
      timestamp: new Date(),
      additional: {
        backup_id: data.backup_id,
        cid: data.cid
      }
    });
  }
  
  /**
   * Handle index discrepancy event
   * 
   * @param {Object} data - Backup index discrepancy event data
   * @private
   */
  _handleIndexDiscrepancy(data) {
    if (!this.isInitialized) {
      // Buffer the event for later processing
      this.eventBuffer.push({ type: 'backup-index-discrepancy', data });
      return;
    }
    
    // Add to activity log
    this._addToActivityLog({
      type: 'index',
      status: 'discrepancy',
      db_type: data.db_type,
      message: `Index discrepancy for ${data.db_type}: ${data.backup_count} backups but ${data.indexed_count} indexed`,
      timestamp: new Date()
    });
    
    // Add an alert
    this._addAlert('warning', 'Index Discrepancy', 
      `Index discrepancy detected for ${data.db_type}: ${data.backup_count} backups but ${data.indexed_count} indexed`
    );
  }
  
  /**
   * Process buffered events after initialization
   * @private
   */
  _processEventBuffer() {
    // Process any events that were buffered during initialization
    for (const event of this.eventBuffer) {
      switch (event.type) {
        case 'backup-started':
          this._handleBackupStarted(event.data);
          break;
        case 'backup-progress':
          this._handleBackupProgress(event.data);
          break;
        case 'backup-completed':
          this._handleBackupCompleted(event.data);
          break;
        case 'backup-error':
          this._handleBackupError(event.data);
          break;
        case 'restore-started':
          this._handleRestoreStarted(event.data);
          break;
        case 'restore-progress':
          this._handleRestoreProgress(event.data);
          break;
        case 'restore-completed':
          this._handleRestoreCompleted(event.data);
          break;
        case 'restore-error':
          this._handleRestoreError(event.data);
          break;
        case 'backup-indexed':
          this._handleBackupIndexed(event.data);
          break;
        case 'backup-index-error':
          this._handleBackupIndexError(event.data);
          break;
        case 'restore-metadata-updated':
          this._handleRestoreMetadataUpdated(event.data);
          break;
        case 'backup-index-discrepancy':
          this._handleIndexDiscrepancy(event.data);
          break;
      }
    }
    
    // Clear the buffer
    this.eventBuffer = [];
  }
  
  /**
   * Add an entry to the activity log
   * 
   * @param {Object} activity - Activity data
   * @private
   */
  _addToActivityLog(activity) {
    // Add to activity log
    this.activityLog.unshift(activity);
    
    // Trim if exceeding max size
    if (this.activityLog.length > this.maxActivityLogSize) {
      this.activityLog = this.activityLog.slice(0, this.maxActivityLogSize);
    }
    
    // Update activity log UI
    this._updateActivityLogUI();
  }
  
  /**
   * Get appropriate icon for an activity
   * 
   * @param {Object} activity - Activity data
   * @returns {string} Icon class
   * @private
   */
  _getActivityIcon(activity) {
    const type = activity.type;
    const status = activity.status;
    
    if (type === 'backup') {
      if (status === 'started') return 'fas fa-play';
      if (status === 'completed') return 'fas fa-check';
      if (status === 'error') return 'fas fa-times';
      return 'fas fa-save';
    }
    
    if (type === 'restore') {
      if (status === 'started') return 'fas fa-play';
      if (status === 'completed') return 'fas fa-check';
      if (status === 'error') return 'fas fa-times';
      return 'fas fa-undo';
    }
    
    if (type === 'index') {
      if (status === 'indexed') return 'fas fa-tag';
      if (status === 'updated') return 'fas fa-sync';
      if (status === 'error') return 'fas fa-times';
      if (status === 'discrepancy') return 'fas fa-exclamation-triangle';
      return 'fas fa-database';
    }
    
    return 'fas fa-info-circle';
  }
  
  /**
   * Get appropriate icon for an alert severity
   * 
   * @param {string} severity - Alert severity
   * @returns {string} Icon class
   * @private
   */
  _getAlertIcon(severity) {
    switch (severity) {
      case 'error':
        return 'fas fa-times-circle';
      case 'warning':
        return 'fas fa-exclamation-triangle';
      case 'info':
      default:
        return 'fas fa-info-circle';
    }
  }
  
  /**
   * Format a timestamp for display
   * 
   * @param {Date|string} timestamp - Timestamp to format
   * @returns {string} Formatted timestamp
   * @private
   */
  _formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    
    // If the timestamp is from today, just show time
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    
    // Otherwise show date and time
    return date.toLocaleString([], { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
  
  /**
   * Format elapsed time in milliseconds
   * 
   * @param {number} ms - Elapsed time in milliseconds
   * @returns {string} Formatted time
   * @private
   */
  _formatElapsedTime(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${Math.floor(ms / 1000)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }
  
  /**
   * Format size in bytes
   * 
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   * @private
   */
  _formatSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
  
  /**
   * Clean up resources when the dashboard is destroyed
   */
  destroy() {
    // Stop auto-refresh
    this._stopAutoRefresh();
    
    // Destroy charts
    if (this.charts.trends) {
      this.charts.trends.destroy();
    }
    
    if (this.charts.distribution) {
      this.charts.distribution.destroy();
    }
    
    // Remove event listeners
    this.removeAllListeners();
    
    // Clear data
    this.activeOperations.clear();
    this.completedOperations = [];
    this.activityLog = [];
    this.alerts = [];
  }
}

export default BackupMonitoringDashboard;