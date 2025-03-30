/**
 * Error Monitor Dashboard
 * 
 * Electron component for displaying and managing the advanced error monitoring system.
 * Provides visualizations, filtering, and management of errors across the application.
 */

const { ipcMain, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Chart = require('chart.js');

class ErrorMonitorDashboard {
  /**
   * Create a new Error Monitor Dashboard
   * @param {Object} options Dashboard options
   */
  constructor(options = {}) {
    this.options = {
      mainWindow: options.mainWindow || null,
      refreshInterval: options.refreshInterval || 5000, // ms
      autoOpen: options.autoOpen || false,
      width: options.width || 1200,
      height: options.height || 800,
      errorMonitorBridge: options.errorMonitorBridge || null,
      ...options
    };
    
    this.window = null;
    this.errorData = {
      errors: [],
      alerts: [],
      componentStatus: {},
      analytics: {}
    };
    this.refreshTimer = null;
    
    // Set up IPC handlers
    this._setupIpcHandlers();
    
    // Auto-open if configured
    if (this.options.autoOpen) {
      this.openDashboard();
    }
  }
  
  /**
   * Set up IPC handlers for communication with renderer processes
   * @private
   */
  _setupIpcHandlers() {
    // Handle request to open dashboard
    ipcMain.on('open-error-monitor-dashboard', (event, data = {}) => {
      this.openDashboard(data);
    });
    
    // Handle refresh request
    ipcMain.on('refresh-error-monitor', async (event) => {
      await this.refreshData();
      this.sendDataToRenderer();
    });
    
    // Handle filter change
    ipcMain.on('error-monitor-filter', (event, filter) => {
      if (this.window) {
        this.window.webContents.send('apply-filter', filter);
      }
    });
    
    // Handle error resolution
    ipcMain.on('resolve-error', async (event, data) => {
      const { errorId, notes } = data;
      
      const result = await this._resolveError(errorId, notes);
      
      if (result.success) {
        await this.refreshData();
        this.sendDataToRenderer();
      }
      
      event.reply('resolve-error-result', result);
    });
    
    // Handle error deletion
    ipcMain.on('delete-error', async (event, errorId) => {
      const result = await this._deleteError(errorId);
      
      if (result.success) {
        await this.refreshData();
        this.sendDataToRenderer();
      }
      
      event.reply('delete-error-result', result);
    });
    
    // Handle relating errors
    ipcMain.on('relate-errors', async (event, errorIds) => {
      const result = await this._relateErrors(errorIds);
      
      if (result.success) {
        await this.refreshData();
        this.sendDataToRenderer();
      }
      
      event.reply('relate-errors-result', result);
    });
    
    // Handle error note addition
    ipcMain.on('add-error-note', async (event, data) => {
      const { errorId, note } = data;
      
      const result = await this._addErrorNote(errorId, note);
      
      if (result.success) {
        await this.refreshData();
        this.sendDataToRenderer();
      }
      
      event.reply('add-note-result', result);
    });
    
    // Handle export request
    ipcMain.on('export-error-monitor-data', async (event, format = 'json') => {
      const result = await this._exportData(format);
      event.reply('export-result', result);
    });
  }
  
  /**
   * Open the error monitor dashboard
   * @param {Object} data Optional data to initialize the dashboard with
   */
  openDashboard(data = {}) {
    // If already open, just focus the window
    if (this.window) {
      this.window.focus();
      return;
    }
    
    // Create the dashboard window
    this.window = new BrowserWindow({
      width: this.options.width,
      height: this.options.height,
      title: 'Advanced Error Monitoring Dashboard',
      icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    // Load the dashboard HTML
    this.window.loadFile(path.join(__dirname, 'error_monitor_dashboard.html'));
    
    // Handle window closed
    this.window.on('closed', () => {
      this.window = null;
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    });
    
    // When content is loaded, send initial data
    this.window.webContents.on('did-finish-load', async () => {
      // Initial data load
      await this.refreshData();
      this.sendDataToRenderer();
      
      // Set up refresh timer
      if (this.options.refreshInterval > 0) {
        this.refreshTimer = setInterval(async () => {
          await this.refreshData();
          this.sendDataToRenderer();
        }, this.options.refreshInterval);
      }
    });
  }
  
  /**
   * Close the dashboard
   */
  closeDashboard() {
    if (this.window) {
      this.window.close();
      this.window = null;
    }
    
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  
  /**
   * Refresh data from Python error monitor
   */
  async refreshData() {
    if (!this.options.errorMonitorBridge) {
      console.warn('ErrorMonitorDashboard: No error monitor bridge available');
      return;
    }
    
    try {
      // Get errors
      const errors = await this._fetchErrors();
      this.errorData.errors = errors;
      
      // Get alerts
      const alerts = await this._fetchAlerts();
      this.errorData.alerts = alerts;
      
      // Get component status
      const status = await this._fetchComponentStatus();
      this.errorData.componentStatus = status;
      
      // Get analytics
      const analytics = await this._fetchAnalytics();
      this.errorData.analytics = analytics;
      
      return true;
    } catch (error) {
      console.error('Error refreshing error monitor data:', error);
      return false;
    }
  }
  
  /**
   * Send data to the renderer
   */
  sendDataToRenderer() {
    if (!this.window) return;
    
    this.window.webContents.send('error-monitor-data', this.errorData);
  }
  
  /**
   * Fetch errors from Python error monitor
   * @private
   */
  async _fetchErrors() {
    const pythonResponse = await this.options.errorMonitorBridge.executeCode(`
      from hallucinate_app.error_monitor import error_monitor
      import json
      import asyncio
      
      # Get errors
      errors = await error_monitor.get_errors(limit=1000)
      
      # Convert to serializable format
      serializable = [error.to_dict() for error in errors]
      
      # Return as JSON
      json.dumps(serializable)
    `);
    
    if (pythonResponse) {
      return JSON.parse(pythonResponse);
    }
    
    return [];
  }
  
  /**
   * Fetch alerts from Python error monitor
   * @private
   */
  async _fetchAlerts() {
    const pythonResponse = await this.options.errorMonitorBridge.executeCode(`
      from hallucinate_app.error_monitor import error_monitor
      import json
      
      # Get alerts
      alerts = await error_monitor.get_alerts(limit=100)
      
      # Return as JSON
      json.dumps(alerts)
    `);
    
    if (pythonResponse) {
      return JSON.parse(pythonResponse);
    }
    
    return [];
  }
  
  /**
   * Fetch component status from Python error monitor
   * @private
   */
  async _fetchComponentStatus() {
    const pythonResponse = await this.options.errorMonitorBridge.executeCode(`
      from hallucinate_app.error_monitor import error_monitor
      import json
      
      # Get component status
      status = await error_monitor.get_component_status()
      
      # Return as JSON
      json.dumps(status)
    `);
    
    if (pythonResponse) {
      return JSON.parse(pythonResponse);
    }
    
    return {};
  }
  
  /**
   * Fetch analytics from Python error monitor
   * @private
   */
  async _fetchAnalytics() {
    const pythonResponse = await this.options.errorMonitorBridge.executeCode(`
      from hallucinate_app.error_monitor import error_monitor
      import json
      
      # Get analytics
      analytics = await error_monitor.get_analytics()
      
      # Return as JSON
      json.dumps(analytics)
    `);
    
    if (pythonResponse) {
      return JSON.parse(pythonResponse);
    }
    
    return {};
  }
  
  /**
   * Resolve an error
   * @private
   * @param {string} errorId Error ID to resolve
   * @param {string} notes Resolution notes
   */
  async _resolveError(errorId, notes) {
    try {
      const pythonResponse = await this.options.errorMonitorBridge.executeCode(`
        from hallucinate_app.error_monitor import error_monitor
        import json
        import datetime
        
        # Create resolution info
        resolution_info = {
          "timestamp": datetime.datetime.now().isoformat(),
          "automatic": False,
          "notes": "${notes || 'Manually resolved via dashboard'}"
        }
        
        # Mark as resolved
        success = await error_monitor.mark_resolved("${errorId}", resolution_info)
        
        {"success": success}
      `);
      
      if (pythonResponse) {
        return JSON.parse(pythonResponse);
      }
      
      return { success: false, message: 'No response from Python' };
    } catch (error) {
      console.error('Error resolving error:', error);
      return { success: false, message: error.message };
    }
  }
  
  /**
   * Delete an error
   * @private
   * @param {string} errorId Error ID to delete
   */
  async _deleteError(errorId) {
    try {
      const pythonResponse = await this.options.errorMonitorBridge.executeCode(`
        from hallucinate_app.error_monitor import error_monitor
        import json
        
        # Delete error
        success = await error_monitor.delete_error("${errorId}")
        
        {"success": success}
      `);
      
      if (pythonResponse) {
        return JSON.parse(pythonResponse);
      }
      
      return { success: false, message: 'No response from Python' };
    } catch (error) {
      console.error('Error deleting error:', error);
      return { success: false, message: error.message };
    }
  }
  
  /**
   * Relate multiple errors
   * @private
   * @param {string[]} errorIds Error IDs to relate
   */
  async _relateErrors(errorIds) {
    try {
      const pythonResponse = await this.options.errorMonitorBridge.executeCode(`
        from hallucinate_app.error_monitor import error_monitor
        import json
        
        # Relate errors
        error_ids = json.loads('${JSON.stringify(errorIds)}')
        success = await error_monitor.relate_errors(error_ids)
        
        {"success": success}
      `);
      
      if (pythonResponse) {
        return JSON.parse(pythonResponse);
      }
      
      return { success: false, message: 'No response from Python' };
    } catch (error) {
      console.error('Error relating errors:', error);
      return { success: false, message: error.message };
    }
  }
  
  /**
   * Add a note to an error
   * @private
   * @param {string} errorId Error ID
   * @param {string} note Note to add
   */
  async _addErrorNote(errorId, note) {
    try {
      const pythonResponse = await this.options.errorMonitorBridge.executeCode(`
        from hallucinate_app.error_monitor import error_monitor
        import json
        
        # Add note
        success = await error_monitor.add_note("${errorId}", "${note}")
        
        {"success": success}
      `);
      
      if (pythonResponse) {
        return JSON.parse(pythonResponse);
      }
      
      return { success: false, message: 'No response from Python' };
    } catch (error) {
      console.error('Error adding note:', error);
      return { success: false, message: error.message };
    }
  }
  
  /**
   * Export data
   * @private
   * @param {string} format Export format (json or csv)
   */
  async _exportData(format = 'json') {
    try {
      // Default export path
      const exportDir = path.join(os.homedir(), '.hallucinate_app', 'exports');
      fs.mkdirSync(exportDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const exportPath = path.join(exportDir, `error_monitor_export_${timestamp}.${format}`);
      
      if (format === 'json') {
        // Export to JSON
        fs.writeFileSync(exportPath, JSON.stringify(this.errorData, null, 2));
      } else if (format === 'csv') {
        // Export to CSV
        let csvContent = 'ID,Timestamp,Level,Source,Component,Operation,Message,Resolved\n';
        
        for (const error of this.errorData.errors) {
          csvContent += `"${error.id}","${error.timestamp}","${error.level}","${error.source}","${error.component}","${error.operation}","${error.message.replace(/"/g, '""')}","${error.resolved}"\n`;
        }
        
        fs.writeFileSync(exportPath, csvContent);
      }
      
      return { 
        success: true, 
        path: exportPath,
        message: `Data exported to ${exportPath}`
      };
    } catch (error) {
      console.error('Error exporting data:', error);
      return { success: false, message: error.message };
    }
  }
}

module.exports = ErrorMonitorDashboard;