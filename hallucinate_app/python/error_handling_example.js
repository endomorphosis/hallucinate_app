/**
 * Error Handling Integration Example
 * 
 * Shows how to integrate the enhanced error handling into the Electron app
 * This is an example file that can be used as a guide for integration
 */

// Import required modules
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');

// Import PyArrow Content Index
const { 
  PyArrowIndex,
  ContentIndexError,
  ContentNotFoundError 
} = require('../node/pyarrow_index');

// Import dashboard utilities
const { 
  initializeDashboards,
  createErrorReporter 
} = require('../node/dashboard');

// Create the PyArrow Content Index bridge
async function createPyArrowIndex(pythonBridge, electron) {
  try {
    // Create the index with error handling enabled
    const pyarrowIndex = new PyArrowIndex({
      pythonBridge,
      electron,
      notifyErrors: true,
      errorLogPath: path.join(os.homedir(), '.hallucinate_app', 'logs', 'content_index_errors.log')
    });
    
    // Initialize the index
    await pyarrowIndex.init();
    
    // Set up Electron integration
    pyarrowIndex.setupElectronIntegration(electron);
    
    console.log('PyArrow Content Index initialized successfully');
    return pyarrowIndex;
  } catch (error) {
    console.error('Failed to create PyArrow Content Index:', error);
    throw error;
  }
}

// Example main function showing integration
async function main() {
  // Create main window
  let mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // Create error reporter
  const reportError = createErrorReporter(mainWindow);
  
  try {
    // Load main page
    await mainWindow.loadFile('path/to/index.html');
    
    // Initialize dashboards
    const dashboards = initializeDashboards(mainWindow, {
      setupMenu: true,
      errorDashboard: {
        autoOpen: false,
        openOnFatalError: true
      }
    });
    
    // Setup Python bridge (simplified example)
    const pythonBridge = {
      executeCode: async (code) => {
        // This would be replaced with your actual Python bridge
        console.log('Executing Python code:', code);
        return { success: true };
      }
    };
    
    // Create PyArrow Content Index with error handling
    const pyarrowIndex = await createPyArrowIndex(pythonBridge, {
      ipcRenderer: ipcMain, // In main process, use ipcMain for integration
    });
    
    // Handle window closed
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    
    // Setup handling for renderer process integration
    ipcMain.on('initialize-pyarrow-index', async (event) => {
      try {
        // When a renderer process needs the PyArrow index,
        // tell it that we've got it initialized
        event.sender.send('pyarrow-index-initialized', { success: true });
        
        // Notify that it can use error handling
        event.sender.send('pyarrow-error-handling-available');
      } catch (error) {
        reportError(error, 'initialize-pyarrow-index');
        event.sender.send('pyarrow-index-initialized', { 
          success: false,
          error: error.message
        });
      }
    });
    
    // Example error handling API for renderer process
    ipcMain.handle('pyarrow-lookup-cid', async (event, cid) => {
      try {
        const result = await pyarrowIndex.lookupByCid(cid);
        return { success: true, data: result };
      } catch (error) {
        // Handle specific error types
        if (error instanceof ContentNotFoundError) {
          return { 
            success: false, 
            error: 'not_found',
            message: `Content with CID ${cid} not found`
          };
        }
        
        // Handle other errors
        reportError(error, 'pyarrow-lookup-cid', { cid });
        return { 
          success: false, 
          error: 'error',
          message: error.message
        };
      }
    });
    
    console.log('Application initialized successfully');
  } catch (error) {
    reportError(error, 'main-initialization');
    
    // Show a dialog for initialization errors
    const { dialog } = require('electron');
    dialog.showErrorBox(
      'Initialization Error',
      `Failed to initialize application: ${error.message}`
    );
  }
}

// Example renderer process integration
// This would go in a separate file loaded in the renderer process
function rendererProcessIntegration() {
  const { ipcRenderer } = require('electron');
  
  // Request PyArrow index initialization
  ipcRenderer.send('initialize-pyarrow-index');
  
  // Listen for initialization result
  ipcRenderer.on('pyarrow-index-initialized', (event, result) => {
    if (result.success) {
      console.log('PyArrow index is available');
      
      // Example: Look up content by CID
      lookupContentByCid('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
    } else {
      console.error('PyArrow index initialization failed:', result.error);
      
      // Show error in UI
      document.getElementById('error-message').textContent = 
        `Failed to initialize PyArrow index: ${result.error}`;
    }
  });
  
  // Listen for error handling availability
  ipcRenderer.on('pyarrow-error-handling-available', () => {
    // Add a button to open error dashboard
    const errorButton = document.createElement('button');
    errorButton.textContent = 'Show Errors';
    errorButton.onclick = () => {
      ipcRenderer.send('open-error-dashboard');
    };
    
    document.getElementById('toolbar').appendChild(errorButton);
  });
  
  // Example function to look up content by CID
  async function lookupContentByCid(cid) {
    try {
      const result = await ipcRenderer.invoke('pyarrow-lookup-cid', cid);
      
      if (result.success) {
        console.log('Content found:', result.data);
        displayContent(result.data);
      } else {
        console.error('Error looking up content:', result.message);
        
        // Handle specific error types
        if (result.error === 'not_found') {
          // Show "not found" UI
          document.getElementById('content-area').innerHTML = 
            `<div class="not-found">Content with CID ${cid} not found</div>`;
        } else {
          // Show generic error UI
          document.getElementById('error-message').textContent = result.message;
        }
      }
    } catch (error) {
      console.error('Error invoking pyarrow-lookup-cid:', error);
      document.getElementById('error-message').textContent = 
        `Error: ${error.message}`;
    }
  }
  
  // Example function to display content
  function displayContent(content) {
    // Display the content in the UI
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `
      <h2>${content.path}</h2>
      <p>CID: ${content.cid}</p>
      <p>Size: ${content.size} bytes</p>
      <p>Type: ${content.mimetype}</p>
    `;
  }
  
  // Listen for error handling messages
  ipcRenderer.on('clear-pyarrow-error-history', async () => {
    // Code to clear any local error state if needed
    document.getElementById('error-message').textContent = '';
  });
}

// Export the example functions for demonstration
module.exports = {
  main,
  rendererProcessIntegration,
  createPyArrowIndex
};