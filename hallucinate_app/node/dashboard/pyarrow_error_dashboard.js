/**
 * PyArrow Content Index Error Dashboard
 * 
 * Electron component for displaying and managing PyArrow Content Index errors
 * Integrates with the main application to show errors in a user-friendly format
 */

const { ipcMain, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

class PyArrowErrorDashboard {
  /**
   * Create a new PyArrow Error Dashboard
   * @param {Object} options Dashboard options
   */
  constructor(options = {}) {
    this.options = {
      errorLogPath: options.errorLogPath || path.join(os.homedir(), '.hallucinate_app', 'logs', 'content_index_errors.log'),
      mainWindow: options.mainWindow || null,
      maxErrorsToShow: options.maxErrorsToShow || 100,
      refreshInterval: options.refreshInterval || 5000, // ms
      autoOpen: options.autoOpen || false,
      openOnFatalError: options.openOnFatalError !== false, // default true
      ...options
    };
    
    this.window = null;
    this.errorHistory = [];
    this.lastError = null;
    this.autoRefreshTimer = null;
    
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
    // Handle display-error-dashboard event from renderer
    ipcMain.on('display-error-dashboard', (event, data) => {
      this.openDashboard(data);
    });
    
    // Handle error events from PyArrow Content Index
    ipcMain.on('pyarrow-index-error', (event, errorInfo) => {
      this._handleError(errorInfo);
    });
    
    // Handle warning events from PyArrow Content Index
    ipcMain.on('pyarrow-index-warning', (event, warningInfo) => {
      this._handleWarning(warningInfo);
    });
    
    // Handle fatal error events from PyArrow Content Index
    ipcMain.on('pyarrow-index-fatal', (event, errorInfo) => {
      this._handleFatalError(errorInfo);
    });
    
    // Handle clear-error-history from renderer
    ipcMain.on('clear-error-history', (event) => {
      this.clearErrorHistory();
      if (this.window) {
        this.window.webContents.send('error-history-cleared');
      }
    });
    
    // Handle refresh-errors from renderer
    ipcMain.on('refresh-errors', (event) => {
      this.refreshErrors();
    });
    
    // Handle close-dashboard from renderer
    ipcMain.on('close-dashboard', (event) => {
      this.closeDashboard();
    });
    
    // Handle export-errors from renderer
    ipcMain.on('export-errors', (event, exportPath) => {
      this.exportErrors(exportPath || this.options.errorLogPath + '.export.json');
    });
  }
  
  /**
   * Handle an error from the PyArrow Content Index
   * @private
   * @param {Object} errorInfo Error information
   */
  _handleError(errorInfo) {
    console.error(`[PyArrow Error Dashboard] Error: ${errorInfo.message}`, errorInfo);
    
    // Add to error history
    this.errorHistory.push({
      ...errorInfo,
      received_at: new Date().toISOString(),
      level: 'error'
    });
    
    // Trim error history
    if (this.errorHistory.length > this.options.maxErrorsToShow) {
      this.errorHistory = this.errorHistory.slice(-this.options.maxErrorsToShow);
    }
    
    // Update last error
    this.lastError = errorInfo;
    
    // Update dashboard if open
    if (this.window) {
      this.window.webContents.send('error-received', errorInfo);
    }
  }
  
  /**
   * Handle a warning from the PyArrow Content Index
   * @private
   * @param {Object} warningInfo Warning information
   */
  _handleWarning(warningInfo) {
    console.warn(`[PyArrow Error Dashboard] Warning: ${warningInfo.message}`, warningInfo);
    
    // Add to error history
    this.errorHistory.push({
      ...warningInfo,
      received_at: new Date().toISOString(),
      level: 'warning'
    });
    
    // Trim error history
    if (this.errorHistory.length > this.options.maxErrorsToShow) {
      this.errorHistory = this.errorHistory.slice(-this.options.maxErrorsToShow);
    }
    
    // Update dashboard if open
    if (this.window) {
      this.window.webContents.send('warning-received', warningInfo);
    }
  }
  
  /**
   * Handle a fatal error from the PyArrow Content Index
   * @private
   * @param {Object} errorInfo Error information
   */
  _handleFatalError(errorInfo) {
    console.error(`[PyArrow Error Dashboard] FATAL ERROR: ${errorInfo.message}`, errorInfo);
    
    // Add to error history
    this.errorHistory.push({
      ...errorInfo,
      received_at: new Date().toISOString(),
      level: 'fatal'
    });
    
    // Trim error history
    if (this.errorHistory.length > this.options.maxErrorsToShow) {
      this.errorHistory = this.errorHistory.slice(-this.options.maxErrorsToShow);
    }
    
    // Update last error
    this.lastError = errorInfo;
    
    // Show dialog for fatal errors
    dialog.showErrorBox(
      `Fatal Error in ${errorInfo.component || 'PyArrow Content Index'}`,
      `${errorInfo.message}\n\nSee the Error Dashboard for more details.`
    );
    
    // Open dashboard for fatal errors if configured
    if (this.options.openOnFatalError) {
      this.openDashboard();
    }
    
    // Update dashboard if open
    if (this.window) {
      this.window.webContents.send('fatal-error-received', errorInfo);
    }
  }
  
  /**
   * Open the error dashboard
   * @param {Object} data Optional data to initialize the dashboard with
   */
  openDashboard(data = null) {
    // If already open, just focus the window
    if (this.window) {
      this.window.focus();
      return;
    }
    
    // Create the dashboard window
    this.window = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'PyArrow Content Index Error Dashboard',
      icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    // Load the dashboard HTML
    this.window.loadFile(path.join(__dirname, 'pyarrow_error_dashboard.html'));
    
    // Handle window closed
    this.window.on('closed', () => {
      this.window = null;
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    });
    
    // When content is loaded, send initial data
    this.window.webContents.on('did-finish-load', () => {
      // Send initial error history
      this.window.webContents.send('init-error-history', {
        errors: this.errorHistory,
        lastError: this.lastError,
        ...data
      });
      
      // Set up auto-refresh timer
      if (this.options.refreshInterval > 0) {
        this.autoRefreshTimer = setInterval(() => {
          this.refreshErrors();
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
    
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }
  
  /**
   * Refresh errors from the content index
   */
  refreshErrors() {
    if (!this.window) return;
    
    try {
      // If we have a main window, ask it to send us the latest errors
      if (this.options.mainWindow) {
        this.options.mainWindow.webContents.send('show-error-dashboard');
      }
      
      // Read the error log file if it exists
      if (fs.existsSync(this.options.errorLogPath)) {
        const logContent = fs.readFileSync(this.options.errorLogPath, 'utf8');
        const logLines = logContent.split('\n').filter(line => line.trim());
        
        // Parse log entries and send to dashboard
        const parsedEntries = logLines.map(line => {
          try {
            const match = line.match(/^(.*?) (ERROR|WARNING): (.*)$/);
            if (match) {
              return {
                timestamp: match[1],
                level: match[2].toLowerCase(),
                message: match[3],
                source: 'log_file'
              };
            }
            return null;
          } catch (e) {
            return null;
          }
        }).filter(entry => entry !== null);
        
        // Send to dashboard
        if (parsedEntries.length > 0 && this.window) {
          this.window.webContents.send('log-entries', parsedEntries);
        }
      }
    } catch (error) {
      console.error('Error refreshing errors:', error);
    }
  }
  
  /**
   * Clear error history
   */
  clearErrorHistory() {
    this.errorHistory = [];
    this.lastError = null;
    
    // Tell the main window to clear error history in PyArrow Content Index
    if (this.options.mainWindow) {
      this.options.mainWindow.webContents.send('clear-pyarrow-error-history');
    }
    
    // Update dashboard if open
    if (this.window) {
      this.window.webContents.send('error-history-cleared');
    }
  }
  
  /**
   * Export errors to file
   * @param {string} exportPath Path to export errors to
   */
  exportErrors(exportPath) {
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        errors: this.errorHistory,
        lastError: this.lastError
      };
      
      fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
      
      // Show success dialog
      if (this.window) {
        dialog.showMessageBox(this.window, {
          type: 'info',
          title: 'Export Successful',
          message: `Errors exported to ${exportPath}`
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error exporting errors:', error);
      
      // Show error dialog
      if (this.window) {
        dialog.showErrorBox(
          'Export Failed',
          `Failed to export errors: ${error.message}`
        );
      }
      
      return false;
    }
  }
}

module.exports = PyArrowErrorDashboard;