/**
 * Dashboard Integration
 * 
 * Exports all dashboard components and provides integration utilities
 * for the main Electron application
 */

const PyArrowErrorDashboard = require('./pyarrow_error_dashboard');
const ErrorMonitorDashboard = require('./error_monitor_dashboard');
const PyArrowContentIndexDashboard = require('./pyarrow_content_index_dashboard');
import AuthDashboard from './auth_dashboard.js';
import UsageDashboard from './usage_dashboard.js';
import SecurityTestDashboard from './security_test_dashboard.js';

/**
 * Initialize all dashboards
 * @param {Object} mainWindow Main Electron window
 * @param {Object} options Dashboard options
 */
function initializeDashboards(mainWindow, options = {}) {
  // Initialize the PyArrow Error Dashboard
  const errorDashboard = new PyArrowErrorDashboard({
    mainWindow,
    ...options.errorDashboard
  });
  
  // Initialize the Advanced Error Monitor Dashboard
  const errorMonitorDashboard = new ErrorMonitorDashboard({
    mainWindow,
    ...options.errorMonitorDashboard
  });
  
  // Initialize the PyArrow Content Index Dashboard
  const contentIndexDashboard = new PyArrowContentIndexDashboard({
    mainWindow,
    ...options.contentIndexDashboard
  });
  
  // Initialize the Auth Dashboard
  const authDashboard = new AuthDashboard({
    ...options.authDashboard
  });
  
  // Initialize the Usage Dashboard
  const usageDashboard = new UsageDashboard({
    ...options.usageDashboard
  });
  
  // Initialize the Security Test Dashboard
  const securityTestDashboard = new SecurityTestDashboard({
    ...options.securityTestDashboard
  });
  
  // Add menu items to app menu
  if (options.setupMenu && mainWindow) {
    const { Menu } = require('electron');
    
    const template = [
      {
        label: 'Dashboard',
        submenu: [
          {
            label: 'Authentication & Security',
            click: () => {
              // We'll create a new window for the auth dashboard
              const { BrowserWindow } = require('electron');
              const authWindow = new BrowserWindow({
                width: 1000,
                height: 800,
                title: 'Authentication & Security Dashboard',
                webPreferences: {
                  nodeIntegration: true,
                  contextIsolation: false
                }
              });
              
              // Load HTML content
              authWindow.loadFile('views/auth_dashboard.html');
              
              // Open dev tools in development
              if (process.env.NODE_ENV === 'development') {
                authWindow.webContents.openDevTools();
              }
            }
          },
          {
            label: 'Security Testing',
            click: () => {
              // Create a new window for the security test dashboard
              const { BrowserWindow } = require('electron');
              const securityTestWindow = new BrowserWindow({
                width: 1200,
                height: 900,
                title: 'Security Test Dashboard',
                webPreferences: {
                  nodeIntegration: true,
                  contextIsolation: false
                }
              });
              
              // Load HTML content
              securityTestWindow.loadFile('views/security_test_dashboard.html');
              
              // Open dev tools in development
              if (process.env.NODE_ENV === 'development') {
                securityTestWindow.webContents.openDevTools();
              }
            }
          },
          {
            label: 'Resource Usage Monitor',
            click: () => {
              // Create a new window for the usage dashboard
              const { BrowserWindow } = require('electron');
              const usageWindow = new BrowserWindow({
                width: 1000,
                height: 800,
                title: 'Resource Usage Dashboard',
                webPreferences: {
                  nodeIntegration: true,
                  contextIsolation: false
                }
              });
              
              // Load HTML content
              usageWindow.loadFile('views/usage_dashboard.html');
              
              // Open dev tools in development
              if (process.env.NODE_ENV === 'development') {
                usageWindow.webContents.openDevTools();
              }
            }
          },
          {
            label: 'PyArrow Content Index',
            click: () => contentIndexDashboard.openDashboard()
          },
          {
            label: 'PyArrow Error Dashboard',
            click: () => errorDashboard.openDashboard()
          },
          {
            label: 'Advanced Error Monitor',
            click: () => errorMonitorDashboard.openDashboard()
          },
          { type: 'separator' },
          {
            label: 'Clear Error History',
            click: () => errorDashboard.clearErrorHistory()
          }
        ]
      }
    ];
    
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }
  
  // Register dashboard IPC handlers for renderer processes
  const { ipcMain } = require('electron');
  
  ipcMain.on('open-content-index-dashboard', () => {
    contentIndexDashboard.openDashboard();
  });
  
  ipcMain.on('open-error-dashboard', () => {
    errorDashboard.openDashboard();
  });
  
  ipcMain.on('open-error-monitor-dashboard', () => {
    errorMonitorDashboard.openDashboard();
  });
  
  ipcMain.on('open-security-test-dashboard', () => {
    // Create a new window for the security test dashboard
    const { BrowserWindow } = require('electron');
    const securityTestWindow = new BrowserWindow({
      width: 1200,
      height: 900,
      title: 'Security Test Dashboard',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    // Load HTML content
    securityTestWindow.loadFile('views/security_test_dashboard.html');
    
    // Open dev tools in development
    if (process.env.NODE_ENV === 'development') {
      securityTestWindow.webContents.openDevTools();
    }
  });
  
  ipcMain.on('clear-pyarrow-error-history', () => {
    // Tell all renderer processes to clear error history
    if (mainWindow) {
      mainWindow.webContents.send('clear-pyarrow-error-history');
    }
  });
  
  // Return the dashboard instances in case they need to be accessed elsewhere
  return {
    contentIndexDashboard,
    errorDashboard,
    errorMonitorDashboard,
    authDashboard,
    usageDashboard,
    securityTestDashboard
  };
}

// Utility to create an error reporter function for JavaScript modules
function createErrorReporter(mainWindow) {
  return function reportError(error, operation = 'unknown', options = {}) {
    const {
      details = {},
      component = 'unknown',
      level = 'error',
      tags = []
    } = options;
    
    const errorInfo = {
      id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      error: error.name || error.constructor.name,
      message: error.message || String(error),
      operation,
      component,
      level,
      timestamp: new Date().toISOString(),
      details,
      source: 'js-bridge',
      stack_trace: error.stack,
      tags,
      metadata: {
        app_version: process.env.npm_package_version || 'unknown',
        node_version: process.version,
        platform: process.platform,
        memory_usage: process.memoryUsage()
      }
    };
    
    console.error(`[ErrorReporter] ${level.toUpperCase()} in ${component}/${operation}: ${errorInfo.message}`, error);
    
    // Send to main window to forward to dashboards
    if (mainWindow && mainWindow.webContents) {
      try {
        // Send to original PyArrow error dashboard
        mainWindow.webContents.send('pyarrow-index-error', errorInfo);
        
        // Send to advanced error monitor dashboard
        if (level === 'fatal') {
          mainWindow.webContents.send('fatal-error-received', errorInfo);
        } else if (level === 'warning') {
          mainWindow.webContents.send('warning-received', errorInfo);
        } else {
          mainWindow.webContents.send('error-received', errorInfo);
        }
      } catch (e) {
        console.error('Failed to send error to main window:', e);
      }
    }
    
    return errorInfo;
  };
}

// Export dashboard components and utilities
module.exports = {
  PyArrowErrorDashboard,
  ErrorMonitorDashboard,
  PyArrowContentIndexDashboard,
  AuthDashboard,
  UsageDashboard,
  SecurityTestDashboard,
  initializeDashboards,
  createErrorReporter
};