/**
 * Error Monitor Integration Example
 * 
 * This file demonstrates how to integrate the Error Monitor with PyArrow Content Index
 * in both the main process and renderer process of an Electron application.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { PyArrowIndex } = require('../node/pyarrow_index');
const { ErrorMonitorDashboard, createErrorReporter } = require('../node/dashboard');
const { PythonBridge } = require('../node/python_bridge');

/**
 * Example of main process integration
 */
async function initializeMainProcess() {
  // Create main window
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // Create an error reporter for the main process
  const reportError = createErrorReporter(mainWindow);
  
  try {
    // Initialize Python bridge
    const pythonBridge = new PythonBridge({
      scriptPath: path.join(__dirname, 'hallucinate_app'),
      errorCallback: (error) => {
        reportError(error, 'python_bridge_init', {
          component: 'PythonBridge',
          level: 'error',
          tags: ['python', 'initialization']
        });
      }
    });
    
    await pythonBridge.initialize();
    
    // Initialize the PyArrow Content Index
    const contentIndex = new PyArrowIndex({
      pythonBridge,
      indexPath: path.join(app.getPath('userData'), 'content_index.arrow'),
      onError: (error, operation) => {
        reportError(error, operation, {
          component: 'PyArrowContentIndex',
          level: error.fatal ? 'fatal' : 'error',
          tags: ['content-index', 'pyarrow']
        });
        
        // Forward Python errors to the error monitor
        if (error.pythonError) {
          // Python errors are already sent to the error monitor via error_monitor.py
          console.log('Python error detected and forwarded to error monitor');
        }
      }
    });
    
    // Initialize error monitor dashboard
    const errorMonitorDashboard = new ErrorMonitorDashboard({
      mainWindow,
      errorMonitorBridge: pythonBridge, // Pass Python bridge for monitor communication
      refreshInterval: 5000,
      autoOpen: false
    });
    
    // Set up IPC handlers for error monitor
    ipcMain.on('show-error-monitor', () => {
      errorMonitorDashboard.openDashboard();
    });
    
    // Example of intentionally triggering errors for testing
    setTimeout(() => {
      try {
        throw new Error('Example error from main process');
      } catch (error) {
        reportError(error, 'example_operation', {
          component: 'ErrorMonitorExample',
          level: 'warning',
          tags: ['example', 'test'],
          details: {
            example: true,
            timestamp: Date.now()
          }
        });
      }
    }, 3000);
    
    // Make instances available to the window object
    global.contentIndex = contentIndex;
    global.errorMonitor = {
      dashboard: errorMonitorDashboard,
      reportError
    };
    
    // Load the HTML file
    mainWindow.loadFile(path.join(__dirname, '../node/views/dashboard.html'));
    
    return { mainWindow, contentIndex, errorMonitorDashboard };
  } catch (error) {
    reportError(error, 'main_process_init', {
      component: 'MainProcess',
      level: 'fatal',
      tags: ['initialization', 'critical']
    });
    
    throw error; // Re-throw to prevent app from starting with fatal error
  }
}

/**
 * Example of renderer process integration
 * This code would be in a separate HTML file loaded by the renderer process
 */
const rendererProcessExample = `
<script>
  const { ipcRenderer } = require('electron');
  
  // Create UI elements
  const createErrorBtn = document.getElementById('create-error-btn');
  const showDashboardBtn = document.getElementById('show-dashboard-btn');
  
  // Open error monitor dashboard
  showDashboardBtn.addEventListener('click', () => {
    ipcRenderer.send('show-error-monitor');
  });
  
  // Create a test error
  createErrorBtn.addEventListener('click', () => {
    try {
      throw new Error('Test error from renderer');
    } catch (error) {
      // Report error to main process
      ipcRenderer.send('report-error', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        operation: 'test_error',
        options: {
          component: 'RendererProcess',
          level: 'warning',
          tags: ['test', 'renderer'],
          details: {
            timestamp: Date.now(),
            user_triggered: true
          }
        }
      });
    }
  });
  
  // Listen for errors reported from main process
  ipcRenderer.on('error-received', (event, errorInfo) => {
    console.log('Error received in renderer:', errorInfo);
    
    // Update UI to show error notification
    showErrorNotification(errorInfo);
  });
  
  function showErrorNotification(errorInfo) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = \`error-notification \${errorInfo.level}\`;
    notification.innerHTML = \`
      <div class="error-title">\${errorInfo.level.toUpperCase()}: \${errorInfo.component}</div>
      <div class="error-message">\${errorInfo.message}</div>
      <button class="view-details-btn">View Details</button>
    \`;
    
    // Add click handler to view details
    notification.querySelector('.view-details-btn').addEventListener('click', () => {
      ipcRenderer.send('show-error-monitor');
    });
    
    // Add to DOM
    document.getElementById('error-container').appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 500);
    }, 5000);
  }
</script>
`;

// Export functions
module.exports = { 
  initializeMainProcess, 
  rendererProcessExample 
};

// If this script is executed directly, start the example
if (require.main === module) {
  app.whenReady().then(initializeMainProcess);
  
  // Handle app lifecycle events
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      initializeMainProcess();
    }
  });
}