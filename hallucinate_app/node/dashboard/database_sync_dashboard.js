/**
 * Database Synchronization Dashboard
 * 
 * Provides a UI for monitoring and controlling database synchronization
 * between OrbitDB, FireproofDB, and DuckDB-IPLD databases.
 */

import { EventEmitter } from 'events';
import databaseSyncManager, { DATABASE_SYNC_CAPABILITIES } from '../database_sync_manager.js';
import authManager from '../auth.js';

// Import dashboard components
import DatabaseSyncStatusPanel from './database_sync_status_panel.js';
import DatabaseSyncMonitor from './database_sync_monitor.js';

// MIME types for export formats
const MIME_TYPES = {
  json: 'application/json',
  csv: 'text/csv'
};

/**
 * Database Synchronization Dashboard component
 * Provides monitoring and control for database synchronization
 */
class DatabaseSyncDashboard extends EventEmitter {
  /**
   * Create a new Database Sync Dashboard
   * 
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.element - DOM element to render the dashboard in
   * @param {Object} options.resources - Resource pool containing dependencies
   * @param {Object} options.config - Configuration options
   */
  constructor(options = {}) {
    super();
    
    this.element = options.element;
    this.resources = options.resources || {};
    this.config = options.config || {};
    
    // Get DB sync manager from resource pool or use default
    this.syncManager = this.resources.syncManager || databaseSyncManager;
    
    // Get auth manager from resource pool or use default
    this.authManager = this.resources.authManager || authManager;
    
    // Default configuration
    this.config = {
      refreshInterval: 5000, // 5 seconds
      theme: 'light', // or 'dark'
      defaultTab: 'status',
      alertsLimit: 5,
      historyLimit: 10,
      enableRealTimeUpdates: true,
      enableMetricsCharts: true,
      enableStatusIcons: true,
      enableAlertNotifications: true,
      ...this.config
    };
    
    // Dashboard state
    this.state = {
      initialized: false,
      syncStatus: {},
      metrics: {},
      alerts: [],
      activeJobs: {},
      history: [],
      selectedTab: this.config.defaultTab,
      filterSettings: {
        alerts: {
          severity: 'all',
          acknowledged: 'all'
        },
        history: {
          syncType: 'all'
        }
      },
      lastUpdated: 0,
      expandedSections: new Set(),
      authenticated: false,
      capabilities: {},
      error: null
    };
    
    // Component references
    this.statusPanel = null;
    this.monitor = null;
    
    // Refresh interval reference
    this.refreshInterval = null;
    
    // Bind methods to maintain context
    this._handleTabChange = this._handleTabChange.bind(this);
    this._handleFilterChange = this._handleFilterChange.bind(this);
    this._handleAlertAcknowledge = this._handleAlertAcknowledge.bind(this);
    this._handleMetricsExport = this._handleMetricsExport.bind(this);
    this._handleSyncAction = this._handleSyncAction.bind(this);
    this._handleStatusUpdate = this._handleStatusUpdate.bind(this);
    this._handleAuthAction = this._handleAuthAction.bind(this);
    this._handleManualSync = this._handleManualSync.bind(this);
  }
  
  /**
   * Initialize the dashboard
   * 
   * @returns {Promise<boolean>} Initialization result
   */
  async init() {
    try {
      // Check if sync manager is initialized
      if (!this.syncManager.resources) {
        console.warn('Database Sync Manager not properly initialized');
      }
      
      // Initialize monitor component if not provided
      if (!this.monitor) {
        this.monitor = new DatabaseSyncMonitor({
          syncManager: this.syncManager
        });
        
        await this.monitor.init();
      }
      
      // Initialize status panel component if not provided
      if (!this.statusPanel) {
        this.statusPanel = new DatabaseSyncStatusPanel({
          resources: {
            syncMonitor: this.monitor
          },
          metadata: {
            refreshInterval: this.config.refreshInterval,
            alertsLimit: this.config.alertsLimit,
            historyLimit: this.config.historyLimit,
            enableRealTimeUpdates: this.config.enableRealTimeUpdates,
            enableMetricsCharts: this.config.enableMetricsCharts,
            enableStatusIcons: this.config.enableStatusIcons,
            enableAlertNotifications: this.config.enableAlertNotifications,
            theme: this.config.theme
          }
        });
      }
      
      // Load CSS for dashboard
      this._loadStyles();
      
      // Fetch current authentication status
      await this._checkAuthentication();
      
      // Load initial data
      await this._loadInitialData();
      
      // Render the UI
      this.render();
      
      // Set up event listeners
      this._setupEventListeners();
      
      // Start auto-refresh if enabled
      if (this.config.refreshInterval > 0) {
        this._startAutoRefresh();
      }
      
      this.state.initialized = true;
      this.emit('initialized', { success: true });
      
      return true;
      
    } catch (error) {
      console.error('Failed to initialize Database Sync Dashboard:', error);
      this.state.error = error.message;
      this.state.initialized = false;
      this.emit('error', { error });
      
      // Render error state
      this.renderError();
      
      return false;
    }
  }
  
  /**
   * Load CSS styles for the dashboard
   * 
   * @private
   */
  _loadStyles() {
    // Check if styles already loaded
    if (document.querySelector('link[href$="database_sync_dashboard.css"]')) {
      return;
    }
    
    // Create stylesheet link
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './dashboard/css/database_sync_dashboard.css';
    document.head.appendChild(link);
  }
  
  /**
   * Check authentication state and get capability tokens
   * 
   * @private
   * @returns {Promise<void>}
   */
  async _checkAuthentication() {
    try {
      // Check if auth manager is initialized
      if (!this.authManager.initialized) {
        await this.authManager.init();
      }
      
      // Check if we have required capabilities
      const capabilities = {};
      
      // Test each capability
      for (const capability of Object.values(DATABASE_SYNC_CAPABILITIES)) {
        try {
          // Get a token for this capability
          const token = await this.authManager.getSelfSignedToken(capability);
          
          // Verify the capability with the token
          const hasCapability = await this.authManager.verifyCapability(token, capability);
          
          capabilities[capability] = {
            hasCapability,
            token: hasCapability ? token : null
          };
          
        } catch (error) {
          console.warn(`Failed to verify capability ${capability}:`, error);
          capabilities[capability] = {
            hasCapability: false,
            token: null,
            error: error.message
          };
        }
      }
      
      // Update authentication state
      this.state.authenticated = Object.values(capabilities).some(cap => cap.hasCapability);
      this.state.capabilities = capabilities;
      
    } catch (error) {
      console.warn('Authentication check failed:', error);
      this.state.authenticated = false;
      this.state.capabilities = {};
    }
  }
  
  /**
   * Load initial data for the dashboard
   * 
   * @private
   * @returns {Promise<void>}
   */
  async _loadInitialData() {
    try {
      // Get current sync status
      this.state.syncStatus = await this.monitor.getSyncStatus();
      
      // Get metrics
      this.state.metrics = await this.monitor.getSyncMetrics();
      
      // Get recent alerts
      this.state.alerts = await this.monitor.getRecentAlerts(this.config.alertsLimit);
      
      // Get active jobs
      this.state.activeJobs = await this.monitor.getActiveJobs();
      
      // Get sync history
      this.state.history = await this.monitor.getSyncHistory(1);
      
      // Update timestamp
      this.state.lastUpdated = Date.now();
      
    } catch (error) {
      console.error('Failed to load initial data:', error);
      throw error;
    }
  }
  
  /**
   * Set up event listeners for dashboard components
   * 
   * @private
   */
  _setupEventListeners() {
    if (!this.element) return;
    
    // Tab switching
    this.element.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', this._handleTabChange);
    });
    
    // Filter changes
    this.element.querySelectorAll('.filter-select').forEach(select => {
      select.addEventListener('change', this._handleFilterChange);
    });
    
    // Alert acknowledgment
    this.element.querySelectorAll('.acknowledge-button').forEach(button => {
      button.addEventListener('click', this._handleAlertAcknowledge);
    });
    
    // Metrics export
    this.element.querySelectorAll('.export-button').forEach(button => {
      button.addEventListener('click', this._handleMetricsExport);
    });
    
    // Sync actions
    this.element.querySelectorAll('.sync-action-button').forEach(button => {
      button.addEventListener('click', this._handleSyncAction);
    });
    
    // Manual refresh
    const refreshButton = this.element.querySelector('#refresh-button');
    if (refreshButton) {
      refreshButton.addEventListener('click', this._handleManualSync);
    }
    
    // Authentication button
    const authButton = this.element.querySelector('#auth-button');
    if (authButton) {
      authButton.addEventListener('click', this._handleAuthAction);
    }
    
    // Subscribe to monitor events
    this.monitor.on('status-update', this._handleStatusUpdate);
    this.monitor.on('metrics-update', data => this.refresh());
    this.monitor.on('alert', data => this.refresh());
  }
  
  /**
   * Start auto-refresh timer
   * 
   * @private
   */
  _startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, this.config.refreshInterval);
    
    console.log(`Auto-refresh started with interval ${this.config.refreshInterval}ms`);
  }
  
  /**
   * Stop auto-refresh timer
   * 
   * @private
   */
  _stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('Auto-refresh stopped');
    }
  }
  
  /**
   * Handle tab change event
   * 
   * @private
   * @param {Event} event - Click event
   */
  _handleTabChange(event) {
    const tabName = event.target.dataset.tab;
    
    // Update selected tab
    this.state.selectedTab = tabName;
    
    // Update UI
    this.element.querySelectorAll('.tab-button').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tabName);
    });
    
    this.element.querySelectorAll('.tab-content').forEach(content => {
      content.style.display = content.classList.contains(`${tabName}-tab`) ? 'block' : 'none';
    });
    
    // Refresh the current tab's data
    this.refresh(tabName);
    
    // Emit tab change event
    this.emit('tab-change', { tab: tabName });
  }
  
  /**
   * Handle filter change event
   * 
   * @private
   * @param {Event} event - Change event
   */
  _handleFilterChange(event) {
    const select = event.target;
    const filterType = select.dataset.filterType;
    const filterName = select.dataset.filterName;
    const value = select.value;
    
    // Update filter settings
    if (this.state.filterSettings[filterType]) {
      this.state.filterSettings[filterType][filterName] = value;
    }
    
    // Refresh the current tab
    this.refresh();
    
    // Emit filter change event
    this.emit('filter-change', { filterType, filterName, value });
  }
  
  /**
   * Handle alert acknowledge event
   * 
   * @private
   * @param {Event} event - Click event
   */
  async _handleAlertAcknowledge(event) {
    try {
      const button = event.target;
      const alertId = button.dataset.alertId;
      
      if (!alertId) return;
      
      // Acknowledge the alert
      const result = await this.monitor.acknowledgeAlert(alertId);
      
      if (result.success) {
        // Update UI
        button.disabled = true;
        button.textContent = 'Acknowledged';
        
        // Find and update the alert in state
        const alertIndex = this.state.alerts.findIndex(alert => alert.id === alertId);
        if (alertIndex >= 0) {
          this.state.alerts[alertIndex].acknowledged = true;
          this.state.alerts[alertIndex].acknowledgedAt = Date.now();
        }
        
        // Refresh the alerts tab
        this.refresh('alerts');
        
        // Emit alert acknowledge event
        this.emit('alert-acknowledge', { alertId, success: true });
      } else {
        console.error('Failed to acknowledge alert:', result.message);
        
        // Show error message
        button.classList.add('error');
        setTimeout(() => {
          button.classList.remove('error');
        }, 2000);
        
        // Emit alert acknowledge event
        this.emit('alert-acknowledge', { alertId, success: false, error: result.message });
      }
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
      
      // Emit alert acknowledge event
      this.emit('alert-acknowledge', { alertId: event.target.dataset.alertId, success: false, error: error.message });
    }
  }
  
  /**
   * Handle metrics export event
   * 
   * @private
   * @param {Event} event - Click event
   */
  async _handleMetricsExport(event) {
    const format = event.target.dataset.format;
    
    try {
      // Get metrics data
      const metrics = await this.monitor.getSyncMetrics();
      const trends = await this.monitor.getSyncTrends('daily');
      
      // Combine data for export
      const exportData = {
        metrics,
        trends,
        timestamp: Date.now(),
        generated: new Date().toISOString()
      };
      
      // Format data
      let content;
      let fileName;
      let mimeType;
      
      if (format === 'json') {
        content = JSON.stringify(exportData, null, 2);
        fileName = `database-sync-metrics-${new Date().toISOString().slice(0, 10)}.json`;
        mimeType = MIME_TYPES.json;
      } else if (format === 'csv') {
        // Simple CSV conversion - in a real app this would be more sophisticated
        const rows = ['timestamp,metric,value'];
        
        // Add metrics data
        rows.push(`${exportData.timestamp},total_operations,${metrics.syncOperations.total}`);
        rows.push(`${exportData.timestamp},succeeded_operations,${metrics.syncOperations.succeeded}`);
        rows.push(`${exportData.timestamp},failed_operations,${metrics.syncOperations.failed}`);
        rows.push(`${exportData.timestamp},conflicts,${metrics.conflicts.count}`);
        rows.push(`${exportData.timestamp},errors,${metrics.errors.count}`);
        
        // Add volume data
        Object.entries(metrics.dataVolume).forEach(([key, value]) => {
          rows.push(`${exportData.timestamp},volume_${key},${value}`);
        });
        
        content = rows.join('\\n');
        fileName = `database-sync-metrics-${new Date().toISOString().slice(0, 10)}.csv`;
        mimeType = MIME_TYPES.csv;
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }
      
      // Create download link
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      
      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
      // Emit metrics export event
      this.emit('metrics-export', { format, success: true });
      
    } catch (error) {
      console.error(`Failed to export metrics as ${format}:`, error);
      
      // Emit metrics export event
      this.emit('metrics-export', { format, success: false, error: error.message });
      
      // Show error notification
      this._showNotification(`Export failed: ${error.message}`, 'error');
    }
  }
  
  /**
   * Handle sync action event
   * 
   * @private
   * @param {Event} event - Click event
   */
  async _handleSyncAction(event) {
    const button = event.target;
    const action = button.dataset.action;
    
    // Disable button and show loading state
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = 'Processing...';
    
    try {
      let result;
      
      // Get the appropriate capability token
      const capability = DATABASE_SYNC_CAPABILITIES[action.toUpperCase()];
      let token = null;
      
      if (capability && this.state.capabilities[capability]) {
        token = this.state.capabilities[capability].token;
      }
      
      if (!token) {
        throw new Error(`Missing capability token for ${action}`);
      }
      
      // Perform the action
      switch (action) {
        case 'sync-all':
          result = await this.syncManager.syncAll(token);
          break;
        case 'orbit-to-fireproof':
          result = await this.syncManager.syncOrbitDbToFireproofDb(token);
          break;
        case 'fireproof-to-orbit':
          result = await this.syncManager.syncFireproofDbToOrbitDb(token);
          break;
        case 'duckdb-export':
          result = await this.syncManager.exportDuckDbToIpld(token);
          break;
        case 'duckdb-import':
          result = await this.syncManager.importIpldToDuckDb(token);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
      
      // Show success notification
      this._showNotification(`${action.replace(/-/g, ' ')} completed successfully`, 'success');
      
      // Refresh dashboard
      this.refresh();
      
      // Emit sync action event
      this.emit('sync-action', { action, result, success: true });
      
    } catch (error) {
      console.error(`Failed to perform sync action ${action}:`, error);
      
      // Show error notification
      this._showNotification(`${action.replace(/-/g, ' ')} failed: ${error.message}`, 'error');
      
      // Emit sync action event
      this.emit('sync-action', { action, success: false, error: error.message });
      
    } finally {
      // Reset button state
      button.disabled = false;
      button.textContent = originalText;
    }
  }
  
  /**
   * Handle status update from monitor
   * 
   * @private
   * @param {Object} data - Status update data
   */
  _handleStatusUpdate(data) {
    // Update state
    this.state.syncStatus = data;
    this.state.lastUpdated = Date.now();
    
    // Update UI if necessary
    if (this.state.selectedTab === 'status') {
      this._updateStatusDisplay();
    }
    
    // Emit status update event
    this.emit('status-update', { status: data });
  }
  
  /**
   * Handle authentication button click
   * 
   * @private
   * @param {Event} event - Click event
   */
  async _handleAuthAction(event) {
    try {
      // Authenticate with auth manager
      await this._checkAuthentication();
      
      // Refresh the UI
      this.refresh();
      
      // Emit auth event
      this.emit('auth', { success: this.state.authenticated });
      
      // Show success or failure notification
      if (this.state.authenticated) {
        this._showNotification('Authentication successful', 'success');
      } else {
        this._showNotification('Authentication failed', 'error');
      }
      
    } catch (error) {
      console.error('Authentication failed:', error);
      
      // Show error notification
      this._showNotification(`Authentication failed: ${error.message}`, 'error');
      
      // Emit auth event
      this.emit('auth', { success: false, error: error.message });
    }
  }
  
  /**
   * Handle manual sync button click
   * 
   * @private
   */
  _handleManualSync() {
    // Refresh all data
    this.refresh();
    
    // Show notification
    this._showNotification('Dashboard refreshed', 'info');
  }
  
  /**
   * Show a notification message
   * 
   * @private
   * @param {string} message - Message text
   * @param {string} type - Message type (success, error, info)
   */
  _showNotification(message, type = 'info') {
    // Create notification container if not exists
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      document.body.appendChild(container);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.className = 'notification-close';
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', () => {
      container.removeChild(notification);
    });
    
    notification.appendChild(closeButton);
    
    // Add to container
    container.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (container.contains(notification)) {
        container.removeChild(notification);
      }
    }, 5000);
  }
  
  /**
   * Update the status display in the UI
   * 
   * @private
   */
  _updateStatusDisplay() {
    if (!this.element) return;
    
    // Update status indicators
    const status = this.state.syncStatus;
    
    // Update overall status
    const overallStatus = this.element.querySelector('.overall-status');
    if (overallStatus) {
      overallStatus.className = `overall-status status-${status.overall}`;
      overallStatus.querySelector('.status-indicator').textContent = status.overall.toUpperCase();
    }
    
    // Update individual sync status indicators
    const syncStatusMap = {
      'orbit-to-fireproof': status.orbitToFireproof,
      'fireproof-to-orbit': status.fireproofToOrbit,
      'duckdb-export': status.duckdbExport,
      'duckdb-import': status.duckdbImport
    };
    
    Object.entries(syncStatusMap).forEach(([key, value]) => {
      const element = this.element.querySelector(`.${key}-status`);
      if (element) {
        element.className = `${key}-status status-indicator status-${value}`;
        element.textContent = value.toUpperCase();
      }
    });
    
    // Update active jobs
    const jobsList = this.element.querySelector('.active-jobs-list');
    if (jobsList) {
      jobsList.innerHTML = '';
      
      const jobs = this.state.activeJobs;
      
      if (Object.keys(jobs).length > 0) {
        Object.entries(jobs).forEach(([jobId, job]) => {
          const jobElement = document.createElement('div');
          jobElement.className = `job-item status-${job.status || 'unknown'}`;
          
          jobElement.innerHTML = `
            <div class="job-id">${jobId}</div>
            <div class="job-type">${job.type || 'unknown'}</div>
            <div class="job-status">${(job.status || 'unknown').toUpperCase()}</div>
            <div class="job-timestamp">${new Date(job.startTime).toLocaleString()}</div>
          `;
          
          jobsList.appendChild(jobElement);
        });
      } else {
        const noJobs = document.createElement('div');
        noJobs.className = 'no-jobs';
        noJobs.textContent = 'No active jobs';
        jobsList.appendChild(noJobs);
      }
    }
    
    // Update last updated time
    const lastUpdated = this.element.querySelector('.last-updated-time');
    if (lastUpdated) {
      lastUpdated.textContent = new Date(this.state.lastUpdated).toLocaleString();
    }
  }
  
  /**
   * Refresh dashboard data
   * 
   * @param {string} [section] - Specific section to refresh
   * @returns {Promise<void>}
   */
  async refresh(section) {
    try {
      if (!section || section === 'status') {
        // Update sync status
        this.state.syncStatus = await this.monitor.getSyncStatus();
        this._updateStatusDisplay();
      }
      
      if (!section || section === 'metrics') {
        // Update metrics
        this.state.metrics = await this.monitor.getSyncMetrics();
        this._updateMetricsDisplay();
      }
      
      if (!section || section === 'alerts') {
        // Update alerts
        this.state.alerts = await this.monitor.getRecentAlerts(this.config.alertsLimit);
        this._updateAlertsDisplay();
      }
      
      if (!section || section === 'history') {
        // Update history
        this.state.history = await this.monitor.getSyncHistory(1);
        this._updateHistoryDisplay();
      }
      
      // Update active jobs
      this.state.activeJobs = await this.monitor.getActiveJobs();
      
      // Update timestamp
      this.state.lastUpdated = Date.now();
      this._updateLastUpdatedDisplay();
      
      // Emit refresh event
      this.emit('refresh', { timestamp: this.state.lastUpdated });
      
    } catch (error) {
      console.error('Failed to refresh dashboard:', error);
      
      // Emit error event
      this.emit('refresh-error', { error });
    }
  }
  
  /**
   * Update the metrics display in the UI
   * 
   * @private
   */
  _updateMetricsDisplay() {
    if (!this.element) return;
    
    // Update metrics information
    const metrics = this.state.metrics;
    
    // Update sync operations
    const syncOps = this.element.querySelector('.sync-operations-value');
    if (syncOps) {
      syncOps.textContent = metrics.syncOperations.total;
    }
    
    const syncSucceeded = this.element.querySelector('.sync-succeeded');
    if (syncSucceeded) {
      syncSucceeded.textContent = `${metrics.syncOperations.succeeded} succeeded`;
    }
    
    const syncFailed = this.element.querySelector('.sync-failed');
    if (syncFailed) {
      syncFailed.textContent = `${metrics.syncOperations.failed} failed`;
    }
    
    // Update conflicts
    const conflicts = this.element.querySelector('.conflicts-value');
    if (conflicts) {
      conflicts.textContent = metrics.conflicts.count;
    }
    
    // Update errors
    const errors = this.element.querySelector('.errors-value');
    if (errors) {
      errors.textContent = metrics.errors.count;
    }
    
    // Update data volume bars
    const volumeMap = {
      'orbit-to-fireproof': metrics.dataVolume.orbitToFireproof,
      'fireproof-to-orbit': metrics.dataVolume.fireproofToOrbit,
      'duckdb-export': metrics.dataVolume.duckdbExport,
      'duckdb-import': metrics.dataVolume.duckdbImport
    };
    
    Object.entries(volumeMap).forEach(([key, value]) => {
      const bar = this.element.querySelector(`.${key}-volume-bar`);
      const label = this.element.querySelector(`.${key}-volume-value`);
      
      if (bar) {
        const maxWidth = Math.min(100, value / 100);
        bar.style.width = `${maxWidth}%`;
      }
      
      if (label) {
        label.textContent = value;
      }
    });
  }
  
  /**
   * Update the alerts display in the UI
   * 
   * @private
   */
  _updateAlertsDisplay() {
    if (!this.element) return;
    
    // Get list container
    const alertsList = this.element.querySelector('.alerts-list');
    if (!alertsList) return;
    
    // Get filter settings
    const severityFilter = this.state.filterSettings.alerts.severity;
    const acknowledgedFilter = this.state.filterSettings.alerts.acknowledged;
    
    // Filter alerts
    let filteredAlerts = this.state.alerts;
    
    if (severityFilter !== 'all') {
      filteredAlerts = filteredAlerts.filter(alert => alert.severity === severityFilter);
    }
    
    if (acknowledgedFilter === 'acknowledged') {
      filteredAlerts = filteredAlerts.filter(alert => alert.acknowledged);
    } else if (acknowledgedFilter === 'unacknowledged') {
      filteredAlerts = filteredAlerts.filter(alert => !alert.acknowledged);
    }
    
    // Clear current list
    alertsList.innerHTML = '';
    
    // Add alerts
    if (filteredAlerts.length > 0) {
      filteredAlerts.forEach(alert => {
        const alertElement = document.createElement('div');
        alertElement.className = `alert-item severity-${alert.severity || 'info'} ${alert.acknowledged ? 'acknowledged' : ''}`;
        
        alertElement.innerHTML = `
          <div class="alert-header">
            <span class="alert-severity">${(alert.severity || 'info').toUpperCase()}</span>
            <span class="alert-component">${alert.component || ''}</span>
            <span class="alert-timestamp">${new Date(alert.timestamp).toLocaleString()}</span>
          </div>
          <div class="alert-message">${alert.message || ''}</div>
          <div class="alert-actions">
            ${!alert.acknowledged ? 
              `<button class="acknowledge-button" data-alert-id="${alert.id}">Acknowledge</button>` : 
              `<span class="acknowledged-label">Acknowledged at ${new Date(alert.acknowledgedAt).toLocaleString()}</span>`
            }
          </div>
        `;
        
        // Add event listener to acknowledge button
        const acknowledgeButton = alertElement.querySelector('.acknowledge-button');
        if (acknowledgeButton) {
          acknowledgeButton.addEventListener('click', this._handleAlertAcknowledge);
        }
        
        alertsList.appendChild(alertElement);
      });
    } else {
      // No alerts or none matching filters
      const noAlerts = document.createElement('div');
      noAlerts.className = 'no-alerts';
      noAlerts.textContent = 'No alerts match the selected filters';
      alertsList.appendChild(noAlerts);
    }
  }
  
  /**
   * Update the history display in the UI
   * 
   * @private
   */
  _updateHistoryDisplay() {
    if (!this.element) return;
    
    // Get list container
    const historyList = this.element.querySelector('.history-list');
    if (!historyList) return;
    
    // Get filter settings
    const syncTypeFilter = this.state.filterSettings.history.syncType;
    
    // Filter history
    let filteredHistory = this.state.history;
    
    if (syncTypeFilter !== 'all') {
      filteredHistory = filteredHistory.filter(entry => entry.type === syncTypeFilter);
    }
    
    // Sort by timestamp (newest first)
    filteredHistory.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limit to config.historyLimit
    filteredHistory = filteredHistory.slice(0, this.config.historyLimit);
    
    // Clear current list
    historyList.innerHTML = '';
    
    // Add history entries
    if (filteredHistory.length > 0) {
      filteredHistory.forEach(entry => {
        const historyElement = document.createElement('div');
        historyElement.className = `history-item type-${entry.type || 'unknown'}`;
        
        // Format type for display
        const typeDisplay = (entry.type || '')
          .replace(/-/g, ' to ')
          .replace(/\b\w/g, c => c.toUpperCase());
        
        const stats = entry.stats || {};
        
        historyElement.innerHTML = `
          <div class="history-header">
            <span class="history-type">${typeDisplay}</span>
            <span class="history-timestamp">${new Date(entry.timestamp).toLocaleString()}</span>
          </div>
          <div class="history-stats">
            <span class="stat-item">Processed: ${stats.processed || 0}</span>
            <span class="stat-item">Updated: ${stats.updated || 0}</span>
            <span class="stat-item">Conflicts: ${stats.conflicts || 0}</span>
            <span class="stat-item">Errors: ${stats.errors || 0}</span>
          </div>
        `;
        
        // Add collections/tables if available
        if (entry.collections) {
          const collectionsElement = document.createElement('div');
          collectionsElement.className = 'history-collections';
          collectionsElement.innerHTML = `
            <span class="collections-label">Collections:</span>
            <span class="collections-value">${entry.collections.join(', ')}</span>
          `;
          historyElement.appendChild(collectionsElement);
        } else if (entry.tables) {
          const tablesElement = document.createElement('div');
          tablesElement.className = 'history-tables';
          tablesElement.innerHTML = `
            <span class="tables-label">Tables:</span>
            <span class="tables-value">${entry.tables.join(', ')}</span>
          `;
          historyElement.appendChild(tablesElement);
        }
        
        historyList.appendChild(historyElement);
      });
    } else {
      // No history entries or none matching filters
      const noHistory = document.createElement('div');
      noHistory.className = 'no-history';
      noHistory.textContent = 'No history entries match the selected filters';
      historyList.appendChild(noHistory);
    }
  }
  
  /**
   * Update the last updated display
   * 
   * @private
   */
  _updateLastUpdatedDisplay() {
    if (!this.element) return;
    
    const lastUpdated = this.element.querySelector('.last-updated-time');
    if (lastUpdated) {
      lastUpdated.textContent = new Date(this.state.lastUpdated).toLocaleString();
    }
  }
  
  /**
   * Render the dashboard
   */
  render() {
    if (!this.element) return;
    
    // Create the basic dashboard structure
    this.element.innerHTML = `
      <div class="database-sync-dashboard ${this.config.theme}-theme">
        <div class="dashboard-header">
          <h2 class="dashboard-title">Database Synchronization Dashboard</h2>
          <div class="dashboard-info">
            <div class="last-updated">Last updated: <span class="last-updated-time">${new Date(this.state.lastUpdated).toLocaleString()}</span></div>
            <button id="refresh-button" class="refresh-button">Refresh</button>
          </div>
        </div>
        
        <div class="authentication-status">
          ${this.state.authenticated ? 
            `<div class="auth-status auth-success">
                <span class="auth-icon">✓</span>
                <span class="auth-message">Authenticated</span>
             </div>` : 
            `<div class="auth-status auth-warning">
                <span class="auth-icon">⚠</span>
                <span class="auth-message">Limited Access</span>
                <button id="auth-button" class="auth-button">Authenticate</button>
             </div>`
          }
        </div>
        
        <div class="dashboard-capabilities">
          <div class="capabilities-list">
            ${Object.entries(DATABASE_SYNC_CAPABILITIES).map(([key, capability]) => {
              const capabilityData = this.state.capabilities[capability] || { hasCapability: false };
              return `
                <div class="capability-badge ${capabilityData.hasCapability ? 'granted' : 'denied'}" title="${capability}">
                  <span class="capability-icon">${capabilityData.hasCapability ? '✓' : '✗'}</span>
                  <span class="capability-name">${key.replace(/_/g, ' ')}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <div class="dashboard-tabs">
          <button class="tab-button ${this.state.selectedTab === 'status' ? 'active' : ''}" data-tab="status">Status</button>
          <button class="tab-button ${this.state.selectedTab === 'metrics' ? 'active' : ''}" data-tab="metrics">Metrics</button>
          <button class="tab-button ${this.state.selectedTab === 'alerts' ? 'active' : ''}" data-tab="alerts">Alerts</button>
          <button class="tab-button ${this.state.selectedTab === 'history' ? 'active' : ''}" data-tab="history">History</button>
        </div>
        
        <!-- Status Tab -->
        <div class="tab-content status-tab" style="display: ${this.state.selectedTab === 'status' ? 'block' : 'none'}">
          <div class="status-actions">
            <button class="action-button sync-action-button" data-action="sync-all">Sync All</button>
            <button class="action-button sync-action-button" data-action="orbit-to-fireproof">OrbitDB to FireproofDB</button>
            <button class="action-button sync-action-button" data-action="fireproof-to-orbit">FireproofDB to OrbitDB</button>
            <button class="action-button sync-action-button" data-action="duckdb-export">Export DuckDB</button>
            <button class="action-button sync-action-button" data-action="duckdb-import">Import to DuckDB</button>
          </div>
          
          <div class="status-grid">
            <div class="status-card overall-status status-${this.state.syncStatus.overall || 'unknown'}">
              <h3>Overall Status</h3>
              <div class="status-indicator">${(this.state.syncStatus.overall || 'unknown').toUpperCase()}</div>
            </div>
            
            <div class="status-card">
              <h3>OrbitDB to FireproofDB</h3>
              <div class="orbit-to-fireproof-status status-indicator status-${this.state.syncStatus.orbitToFireproof || 'unknown'}">
                ${(this.state.syncStatus.orbitToFireproof || 'unknown').toUpperCase()}
              </div>
            </div>
            
            <div class="status-card">
              <h3>FireproofDB to OrbitDB</h3>
              <div class="fireproof-to-orbit-status status-indicator status-${this.state.syncStatus.fireproofToOrbit || 'unknown'}">
                ${(this.state.syncStatus.fireproofToOrbit || 'unknown').toUpperCase()}
              </div>
            </div>
            
            <div class="status-card">
              <h3>DuckDB Export</h3>
              <div class="duckdb-export-status status-indicator status-${this.state.syncStatus.duckdbExport || 'unknown'}">
                ${(this.state.syncStatus.duckdbExport || 'unknown').toUpperCase()}
              </div>
            </div>
            
            <div class="status-card">
              <h3>DuckDB Import</h3>
              <div class="duckdb-import-status status-indicator status-${this.state.syncStatus.duckdbImport || 'unknown'}">
                ${(this.state.syncStatus.duckdbImport || 'unknown').toUpperCase()}
              </div>
            </div>
          </div>
          
          <div class="active-jobs-section">
            <h3>Active Jobs</h3>
            <div class="active-jobs-list">
              ${Object.keys(this.state.activeJobs).length > 0 ? 
                Object.entries(this.state.activeJobs).map(([jobId, job]) => `
                  <div class="job-item status-${job.status || 'unknown'}">
                    <div class="job-id">${jobId}</div>
                    <div class="job-type">${job.type || 'unknown'}</div>
                    <div class="job-status">${(job.status || 'unknown').toUpperCase()}</div>
                    <div class="job-timestamp">${new Date(job.startTime).toLocaleString()}</div>
                  </div>
                `).join('') : 
                '<div class="no-jobs">No active jobs</div>'
              }
            </div>
          </div>
        </div>
        
        <!-- Metrics Tab -->
        <div class="tab-content metrics-tab" style="display: ${this.state.selectedTab === 'metrics' ? 'block' : 'none'}">
          <div class="metrics-summary">
            <div class="metric-card">
              <h3>Sync Operations</h3>
              <div class="sync-operations-value metric-value">${this.state.metrics.syncOperations?.total || 0}</div>
              <div class="metric-details">
                <div class="sync-succeeded metric-detail success">${this.state.metrics.syncOperations?.succeeded || 0} succeeded</div>
                <div class="sync-failed metric-detail failure">${this.state.metrics.syncOperations?.failed || 0} failed</div>
              </div>
            </div>
            
            <div class="metric-card">
              <h3>Conflicts</h3>
              <div class="conflicts-value metric-value">${this.state.metrics.conflicts?.count || 0}</div>
              <div class="metric-subtitle">Total Conflicts</div>
            </div>
            
            <div class="metric-card">
              <h3>Errors</h3>
              <div class="errors-value metric-value">${this.state.metrics.errors?.count || 0}</div>
              <div class="metric-subtitle">Total Errors</div>
            </div>
          </div>
          
          <div class="data-volume-section">
            <h3>Data Volume</h3>
            <div class="volume-bars">
              <div class="volume-item">
                <div class="volume-label">OrbitDB to FireproofDB</div>
                <div class="volume-bar-container">
                  <div class="orbit-to-fireproof-volume-bar volume-bar" style="width: ${Math.min(100, (this.state.metrics.dataVolume?.orbitToFireproof || 0) / 100)}%;"></div>
                </div>
                <div class="orbit-to-fireproof-volume-value volume-value">${this.state.metrics.dataVolume?.orbitToFireproof || 0}</div>
              </div>
              
              <div class="volume-item">
                <div class="volume-label">FireproofDB to OrbitDB</div>
                <div class="volume-bar-container">
                  <div class="fireproof-to-orbit-volume-bar volume-bar" style="width: ${Math.min(100, (this.state.metrics.dataVolume?.fireproofToOrbit || 0) / 100)}%;"></div>
                </div>
                <div class="fireproof-to-orbit-volume-value volume-value">${this.state.metrics.dataVolume?.fireproofToOrbit || 0}</div>
              </div>
              
              <div class="volume-item">
                <div class="volume-label">DuckDB Export</div>
                <div class="volume-bar-container">
                  <div class="duckdb-export-volume-bar volume-bar" style="width: ${Math.min(100, (this.state.metrics.dataVolume?.duckdbExport || 0) / 100)}%;"></div>
                </div>
                <div class="duckdb-export-volume-value volume-value">${this.state.metrics.dataVolume?.duckdbExport || 0}</div>
              </div>
              
              <div class="volume-item">
                <div class="volume-label">DuckDB Import</div>
                <div class="volume-bar-container">
                  <div class="duckdb-import-volume-bar volume-bar" style="width: ${Math.min(100, (this.state.metrics.dataVolume?.duckdbImport || 0) / 100)}%;"></div>
                </div>
                <div class="duckdb-import-volume-value volume-value">${this.state.metrics.dataVolume?.duckdbImport || 0}</div>
              </div>
            </div>
          </div>
          
          <div class="export-section">
            <h3>Export Metrics</h3>
            <div class="export-actions">
              <button class="export-button" data-format="json">Export as JSON</button>
              <button class="export-button" data-format="csv">Export as CSV</button>
            </div>
          </div>
        </div>
        
        <!-- Alerts Tab -->
        <div class="tab-content alerts-tab" style="display: ${this.state.selectedTab === 'alerts' ? 'block' : 'none'}">
          <div class="filters-bar">
            <div class="filter-group">
              <label>Severity:</label>
              <select class="filter-select" data-filter-type="alerts" data-filter-name="severity">
                <option value="all" ${this.state.filterSettings.alerts.severity === 'all' ? 'selected' : ''}>All</option>
                <option value="error" ${this.state.filterSettings.alerts.severity === 'error' ? 'selected' : ''}>Error</option>
                <option value="warning" ${this.state.filterSettings.alerts.severity === 'warning' ? 'selected' : ''}>Warning</option>
                <option value="info" ${this.state.filterSettings.alerts.severity === 'info' ? 'selected' : ''}>Info</option>
              </select>
            </div>
            
            <div class="filter-group">
              <label>Status:</label>
              <select class="filter-select" data-filter-type="alerts" data-filter-name="acknowledged">
                <option value="all" ${this.state.filterSettings.alerts.acknowledged === 'all' ? 'selected' : ''}>All</option>
                <option value="acknowledged" ${this.state.filterSettings.alerts.acknowledged === 'acknowledged' ? 'selected' : ''}>Acknowledged</option>
                <option value="unacknowledged" ${this.state.filterSettings.alerts.acknowledged === 'unacknowledged' ? 'selected' : ''}>Unacknowledged</option>
              </select>
            </div>
          </div>
          
          <div class="alerts-list">
            <!-- Alerts will be rendered here -->
            <div class="no-alerts">Loading alerts...</div>
          </div>
        </div>
        
        <!-- History Tab -->
        <div class="tab-content history-tab" style="display: ${this.state.selectedTab === 'history' ? 'block' : 'none'}">
          <div class="filters-bar">
            <div class="filter-group">
              <label>Sync Type:</label>
              <select class="filter-select" data-filter-type="history" data-filter-name="syncType">
                <option value="all" ${this.state.filterSettings.history.syncType === 'all' ? 'selected' : ''}>All</option>
                <option value="orbit-to-fireproof" ${this.state.filterSettings.history.syncType === 'orbit-to-fireproof' ? 'selected' : ''}>OrbitDB to FireproofDB</option>
                <option value="fireproof-to-orbit" ${this.state.filterSettings.history.syncType === 'fireproof-to-orbit' ? 'selected' : ''}>FireproofDB to OrbitDB</option>
                <option value="duckdb-export" ${this.state.filterSettings.history.syncType === 'duckdb-export' ? 'selected' : ''}>DuckDB Export</option>
                <option value="duckdb-import" ${this.state.filterSettings.history.syncType === 'duckdb-import' ? 'selected' : ''}>DuckDB Import</option>
              </select>
            </div>
          </div>
          
          <div class="history-list">
            <!-- History entries will be rendered here -->
            <div class="no-history">Loading history...</div>
          </div>
        </div>
      </div>
    `;
    
    // Set up event listeners
    this._setupEventListeners();
    
    // Update tabs based on capabilities
    this._updateTabsBasedOnCapabilities();
    
    // Update displays
    this._updateStatusDisplay();
    this._updateMetricsDisplay();
    this._updateAlertsDisplay();
    this._updateHistoryDisplay();
  }
  
  /**
   * Update tab availability based on capabilities
   * 
   * @private
   */
  _updateTabsBasedOnCapabilities() {
    // Disable tabs if no related capabilities are available
    const capabilities = this.state.capabilities;
    
    if (!capabilities[DATABASE_SYNC_CAPABILITIES.SYNC_ADMIN] && 
        !capabilities[DATABASE_SYNC_CAPABILITIES.SYNC_ORBITDB_TO_FIREPROOFDB] && 
        !capabilities[DATABASE_SYNC_CAPABILITIES.SYNC_FIREPROOFDB_TO_ORBITDB]) {
      
      const statusTab = this.element.querySelector('[data-tab="status"]');
      if (statusTab) {
        statusTab.classList.add('disabled');
        statusTab.title = 'Requires sync capabilities';
      }
    }
    
    if (!capabilities[DATABASE_SYNC_CAPABILITIES.SYNC_ADMIN]) {
      // Disable certain sync action buttons
      this.element.querySelectorAll('.sync-action-button').forEach(button => {
        const action = button.dataset.action;
        const capability = DATABASE_SYNC_CAPABILITIES[action.toUpperCase().replace(/-/g, '_')];
        
        if (capability && !capabilities[capability]?.hasCapability) {
          button.disabled = true;
          button.title = `Requires ${capability} capability`;
        }
      });
    }
  }
  
  /**
   * Render error state
   */
  renderError() {
    if (!this.element) return;
    
    this.element.innerHTML = `
      <div class="database-sync-dashboard error-state ${this.config.theme}-theme">
        <div class="error-container">
          <h2>Dashboard Error</h2>
          <p class="error-message">${this.state.error || 'An unknown error occurred'}</p>
          <button class="retry-button">Retry</button>
        </div>
      </div>
    `;
    
    // Add retry button listener
    const retryButton = this.element.querySelector('.retry-button');
    if (retryButton) {
      retryButton.addEventListener('click', () => {
        this.init();
      });
    }
  }
  
  /**
   * Test the dashboard functionality
   * 
   * @returns {Promise<object>} Test results
   */
  async test() {
    try {
      // Test initial data loading
      await this._loadInitialData();
      
      // Test sync manager availability
      const syncManagerAvailable = Boolean(this.syncManager && this.syncManager.resources);
      
      // Test render function
      let renderSuccess = false;
      try {
        this.render();
        renderSuccess = true;
      } catch (renderError) {
        console.error('Render test failed:', renderError);
      }
      
      // Test refresh function
      let refreshSuccess = false;
      try {
        await this.refresh();
        refreshSuccess = true;
      } catch (refreshError) {
        console.error('Refresh test failed:', refreshError);
      }
      
      return {
        success: true,
        message: 'Database sync dashboard test completed successfully',
        results: {
          syncManagerAvailable,
          renderSuccess,
          refreshSuccess,
          dataLoaded: Boolean(this.state.metrics && this.state.syncStatus),
          authenticated: this.state.authenticated
        }
      };
    } catch (error) {
      console.error('Database sync dashboard test failed:', error);
      return {
        success: false,
        message: `Database sync dashboard test failed: ${error.message}`,
        error: error.message
      };
    }
  }
  
  /**
   * Clean up resources
   * 
   * @returns {Promise<object>} Cleanup result
   */
  async close() {
    try {
      // Stop auto-refresh
      this._stopAutoRefresh();
      
      // Remove event listeners
      if (this.element) {
        this.element.querySelectorAll('.tab-button').forEach(button => {
          button.removeEventListener('click', this._handleTabChange);
        });
        
        this.element.querySelectorAll('.filter-select').forEach(select => {
          select.removeEventListener('change', this._handleFilterChange);
        });
        
        this.element.querySelectorAll('.acknowledge-button').forEach(button => {
          button.removeEventListener('click', this._handleAlertAcknowledge);
        });
        
        this.element.querySelectorAll('.export-button').forEach(button => {
          button.removeEventListener('click', this._handleMetricsExport);
        });
        
        this.element.querySelectorAll('.sync-action-button').forEach(button => {
          button.removeEventListener('click', this._handleSyncAction);
        });
        
        const refreshButton = this.element.querySelector('#refresh-button');
        if (refreshButton) {
          refreshButton.removeEventListener('click', this._handleManualSync);
        }
        
        const authButton = this.element.querySelector('#auth-button');
        if (authButton) {
          authButton.removeEventListener('click', this._handleAuthAction);
        }
      }
      
      // Unsubscribe from monitor events
      if (this.monitor) {
        this.monitor.removeListener('status-update', this._handleStatusUpdate);
        this.monitor.removeListener('metrics-update', data => this.refresh());
        this.monitor.removeListener('alert', data => this.refresh());
      }
      
      // Close monitor
      if (this.monitor) {
        await this.monitor.close();
      }
      
      return {
        success: true,
        message: 'Database sync dashboard closed'
      };
    } catch (error) {
      console.error('Failed to close database sync dashboard:', error);
      return {
        success: false,
        message: `Failed to close database sync dashboard: ${error.message}`
      };
    }
  }
}

// Create default instance
const databaseSyncDashboard = new DatabaseSyncDashboard();

// Export as default
export default databaseSyncDashboard;

// Named exports
export { DatabaseSyncDashboard };