import { app, BrowserWindow, Menu, MenuItem, ipcMain, protocol, shell } from 'electron';
import { createModelTesterWindow } from './hallucinate_app/node/accelerate_model_tester.js';
import MCPDaemonManager from './hallucinate_app/node/mcp_daemon_manager.js';
import MenuGenerator from './hallucinate_app/node/menu_generator.js';
import path from 'path';
import url from 'url';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { appendFileSync as appendFileSyncSync } from 'fs';
import electron_squirrel_startup from 'electron-squirrel-startup';
import testHandler from './hallucinate_app/node/test_handler.js';
import benchmarkHandler from './hallucinate_app/node/benchmark_handler.js';
import { getDaemonManager } from './hallucinate_app/node/daemon_manager.js';

// ============================================================
// VERBOSE ERROR LOGGING CONFIGURATION
// ============================================================
const LOG_FILE = '/tmp/hallucinate-app-debug.log';
const ENABLE_VERBOSE_LOGGING = true;

function logError(context, error, additionalInfo = {}) {
  const timestamp = new Date().toISOString();
  const errorLog = {
    timestamp,
    context,
    error: {
      message: error?.message || String(error),
      stack: error?.stack,
      name: error?.name,
      code: error?.code
    },
    ...additionalInfo
  };
  
  // Only log to console if stdout is available (not EPIPE)
  try {
    console.error(`[${timestamp}] ❌ ERROR in ${context}:`, error);
    if (additionalInfo && Object.keys(additionalInfo).length > 0) {
      console.error('Additional Info:', additionalInfo);
    }
  } catch (e) {
    // Ignore EPIPE errors when writing to console
  }
  
  // Write to log file
  if (ENABLE_VERBOSE_LOGGING) {
    try {
      appendFileSyncSync(LOG_FILE, JSON.stringify(errorLog, null, 2) + '\n---\n');
    } catch (e) {
      // Ignore file write errors
    }
  }
  
  return errorLog;
}

function logInfo(context, message, data = {}) {
  const timestamp = new Date().toISOString();
  
  // Only log to console if stdout is available (not EPIPE)
  try {
    console.log(`[${timestamp}] ℹ️  ${context}: ${message}`);
    if (data && Object.keys(data).length > 0) {
      console.log('Data:', data);
    }
  } catch (e) {
    // Ignore EPIPE errors when writing to console
  }
  
  if (ENABLE_VERBOSE_LOGGING) {
    try {
      const logEntry = { timestamp, context, message, data };
      appendFileSyncSync(LOG_FILE, JSON.stringify(logEntry, null, 2) + '\n');
    } catch (e) {
      // Ignore file write errors
    }
  }
}

// Global error handlers
process.on('uncaughtException', (error) => {
  logError('UNCAUGHT_EXCEPTION', error, { fatal: true });
});

process.on('unhandledRejection', (reason, promise) => {
  logError('UNHANDLED_REJECTION', reason, { promise: String(promise) });
});

logInfo('STARTUP', 'Hallucinate App starting...', { 
  nodeVersion: process.version,
  electronVersion: process.versions.electron,
  platform: process.platform,
  arch: process.arch
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (electron_squirrel_startup) {
  logInfo('SQUIRREL', 'Squirrel startup detected, quitting...');
  app.quit();
}

// Get the directory where the current module is located
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

// Create a simple static file server for SwissKnife web files
let swissKnifeServer = null;
const SWISSKNIFE_PORT = 8765;

function startSwissKnifeServer() {
  try {
    const swissKnifeWebDir = path.join(__dirname, 'swissknife', 'web');
    logInfo('SWISSKNIFE_SERVER', 'Starting server...', { port: SWISSKNIFE_PORT, webDir: swissKnifeWebDir });
    
    swissKnifeServer = createServer(async (req, res) => {
      try {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        filePath = path.join(swissKnifeWebDir, filePath);
        
        // Security: prevent directory traversal
        if (!filePath.startsWith(swissKnifeWebDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
      
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      };
      
      const contentType = contentTypes[ext] || 'application/octet-stream';
      
      const data = await readFile(filePath);
      
      // Set security headers
      const headers = {
        'Content-Type': contentType,
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http://127.0.0.1:*",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN'
      };
      
      res.writeHead(200, headers);
      res.end(data);
    } catch (err) {
      logError('SWISSKNIFE_SERVER_FILE', err, { url: req.url, filePath });
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  
  swissKnifeServer.on('error', (err) => {
    logError('SWISSKNIFE_SERVER', err, { port: SWISSKNIFE_PORT });
  });
  
  swissKnifeServer.listen(SWISSKNIFE_PORT, '127.0.0.1', () => {
    logInfo('SWISSKNIFE_SERVER', `Server running at http://127.0.0.1:${SWISSKNIFE_PORT}`);
  });
  } catch (error) {
    logError('SWISSKNIFE_SERVER_START', error);
    throw error;
  }
}

// Initialize MCP Daemon Manager
const daemonManager = new MCPDaemonManager();

// Setup daemon manager event listeners
daemonManager.on('started', ({ daemon, port }) => {
  console.log(`✅ ${daemon} started on port ${port}`);
});

daemonManager.on('stopped', ({ daemon }) => {
  console.log(`🛑 ${daemon} stopped`);
});

daemonManager.on('error', ({ daemon, error }) => {
  console.error(`❌ ${daemon} error: ${error}`);
});

daemonManager.on('all-started', () => {
  console.log('🚀 All MCP daemons are running');
});

// Setup test and benchmark handlers
testHandler.setupIpcHandlers();
benchmarkHandler.setupIpcHandlers();

// Setup daemon manager IPC handlers
ipcMain.handle('daemon:getAll', async () => {
  return daemonManager.getAllStatus();
});

ipcMain.handle('daemon:start', async (event, daemonId) => {
  return await daemonManager.startDaemon(daemonId);
});

ipcMain.handle('daemon:stop', async (event, daemonId) => {
  return await daemonManager.stopDaemon(daemonId);
});

ipcMain.handle('daemon:restart', async (event, daemonId) => {
  return await daemonManager.restartDaemon(daemonId);
});

ipcMain.handle('daemon:getLogs', async (event, daemonId, limit) => {
  return daemonManager.getLogs(daemonId, limit);
});

// Create a window for the benchmark dashboard
const createBenchmarkWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    title: 'IPFS Python Modules - Benchmark Dashboard',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  win.loadFile(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'benchmark_dashboard.html'));
  
  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

// Create a window for the test interface
const createTestWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    title: 'IPFS HuggingFace Bridge - Module Testing',
    icon: path.join(__dirname, 'hallucinate_app', 'node', 'assets', 'icon.png')
  });

  win.loadFile(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'test_interface.html'));
  
  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

// Create main application window
const createWindow = () => {
  try {
    logInfo('WINDOW_CREATE', 'Creating main window (SwissKnife)...');
    // Create the SwissKnife virtual desktop as the default window
    mainWindow = createSwissKnifeWindow();
    
    // Add error handlers
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      logError('WINDOW_LOAD_FAIL', new Error(errorDescription), { errorCode, url: validatedURL });
    });
    
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const levelMap = { 0: 'INFO', 1: 'WARN', 2: 'ERROR' };
      if (level === 2) {
        logError('RENDERER_CONSOLE', new Error(message), { line, sourceId });
      }
    });
    
    mainWindow.webContents.on('render-process-gone', (event, details) => {
      logError('RENDERER_CRASH', new Error('Renderer process crashed'), details);
    });
    
    // Open the DevTools in development
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
    
    logInfo('WINDOW_CREATE', 'Main window created successfully');
    return mainWindow;
  } catch (error) {
    logError('WINDOW_CREATE', error);
    throw error;
  }
};

// Create a window for the IPFS Kit Dashboard
const createIPFSKitDashboardWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    title: 'IPFS Kit Dashboard',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  win.loadFile(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'ipfs_kit_dashboard.html'));
  
  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

// Create a window for the MCP Daemon Manager
const createDaemonManagerWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    title: 'MCP Daemon Manager',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  // Create simple HTML content for daemon manager
  const daemonManagerHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:*">
  <title>MCP Daemon Manager</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      text-align: center;
      margin-bottom: 30px;
    }
    .daemon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .daemon-card {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 20px;
      backdrop-filter: blur(10px);
    }
    .daemon-card h2 {
      margin-top: 0;
      font-size: 1.5em;
    }
    .status {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
      margin-bottom: 15px;
    }
    .status.running { background: #10b981; }
    .status.stopped { background: #ef4444; }
    .status.starting { background: #f59e0b; }
    .status.error { background: #dc2626; }
    .info-row {
      margin: 8px 0;
      display: flex;
      justify-content: space-between;
    }
    .buttons {
      margin-top: 15px;
      display: flex;
      gap: 10px;
    }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.8;
    }
    .btn-start { background: #10b981; color: white; }
    .btn-stop { background: #ef4444; color: white; }
    .btn-restart { background: #f59e0b; color: white; }
    .controls {
      text-align: center;
      margin: 30px 0;
    }
    .controls button {
      padding: 15px 30px;
      font-size: 1.1em;
      margin: 0 10px;
    }
    .logs {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
      padding: 20px;
      max-height: 300px;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }
    .log-entry {
      margin: 5px 0;
      padding: 5px;
      border-left: 3px solid #667eea;
      padding-left: 10px;
    }
    .log-entry.error {
      border-left-color: #ef4444;
      color: #fca5a5;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔧 MCP Daemon Manager</h1>
    
    <div class="controls">
      <button class="btn-start" onclick="startAll()">🚀 Start All Daemons</button>
      <button class="btn-stop" onclick="stopAll()">🛑 Stop All Daemons</button>
      <button class="btn-restart" onclick="refreshStatus()">🔄 Refresh Status</button>
    </div>
    
    <div class="daemon-grid" id="daemon-grid">
      <!-- Daemon cards will be inserted here -->
    </div>
    
    <h2>📋 Event Log</h2>
    <div class="logs" id="event-log">
      <div class="log-entry">Daemon manager initialized</div>
    </div>
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    
    function updateDaemonStatus() {
      // In a real implementation, this would query the daemon manager
      // For now, we'll create a placeholder
      const daemons = [
        { id: 'ipfs-kit', name: 'IPFS Kit MCP', port: 3001, status: 'running' },
        { id: 'ipfs-datasets', name: 'IPFS Datasets MCP', port: 3002, status: 'running' },
        { id: 'ipfs-accelerate', name: 'IPFS Accelerate MCP', port: 3003, status: 'running' }
      ];
      
      const grid = document.getElementById('daemon-grid');
      grid.innerHTML = daemons.map(daemon => \`
        <div class="daemon-card">
          <h2>\${daemon.name}</h2>
          <span class="status \${daemon.status}">\${daemon.status.toUpperCase()}</span>
          <div class="info-row">
            <span>Port:</span>
            <span>\${daemon.port}</span>
          </div>
          <div class="info-row">
            <span>ID:</span>
            <span>\${daemon.id}</span>
          </div>
          <div class="buttons">
            <button class="btn-start" onclick="startDaemon('\${daemon.id}')">Start</button>
            <button class="btn-stop" onclick="stopDaemon('\${daemon.id}')">Stop</button>
            <button class="btn-restart" onclick="restartDaemon('\${daemon.id}')">Restart</button>
          </div>
        </div>
      \`).join('');
    }
    
    function addLog(message, isError = false) {
      const log = document.getElementById('event-log');
      const entry = document.createElement('div');
      entry.className = 'log-entry' + (isError ? ' error' : '');
      const time = new Date().toLocaleTimeString();
      entry.textContent = \`[\${time}] \${message}\`;
      log.insertBefore(entry, log.firstChild);
    }
    
    function startAll() {
      addLog('Starting all daemons...');
    }
    
    function stopAll() {
      addLog('Stopping all daemons...');
    }
    
    function refreshStatus() {
      addLog('Refreshing status...');
      updateDaemonStatus();
    }
    
    function startDaemon(id) {
      addLog(\`Starting daemon: \${id}\`);
    }
    
    function stopDaemon(id) {
      addLog(\`Stopping daemon: \${id}\`);
    }
    
    function restartDaemon(id) {
      addLog(\`Restarting daemon: \${id}\`);
    }
    
    // Initial status update
    updateDaemonStatus();
    
    // Auto-refresh every 10 seconds
    setInterval(updateDaemonStatus, 10000);
  </script>
</body>
</html>
  `;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(daemonManagerHTML)}`);
  
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

// Helper function to create MCP dashboard window
const createMCPDashboardWindow = (title, url, width = 1200, height = 800) => {
  const win = new BrowserWindow({
    width,
    height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    title,
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  win.loadURL(url);
  
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

// Create windows for specific MCP dashboards
const createIPFSKitDashboard = () => {
  return createMCPDashboardWindow('IPFS Kit MCP Dashboard', 'http://127.0.0.1:3001/dashboard');
};

const createIPFSDatasetsDashboard = () => {
  return createMCPDashboardWindow('IPFS Datasets MCP Dashboard', 'http://127.0.0.1:3002/dashboard');
};

const createIPFSAccelerateDashboard = () => {
  return createMCPDashboardWindow('IPFS Accelerate MCP Dashboard', 'http://127.0.0.1:3006/dashboard');
};

const createSwissKnifeMCPDashboard = () => {
  return createMCPDashboardWindow('SwissKnife MCP Dashboard', 'http://127.0.0.1:3004/dashboard');
};

// Create a window for SwissKnife Virtual Desktop
const createSwissKnifeWindow = () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,           // Disabled for security
      contextIsolation: true,            // Enabled for security
      enableRemoteModule: false,         // Disabled for security
      webSecurity: true,                 // Enabled - use localhost server instead
      allowRunningInsecureContent: false, // Disabled for security
      preload: path.join(__dirname, 'preload.js'), // Secure IPC bridge
      sandbox: false                     // Disabled to allow preload script
    },
    title: 'hallucinate_app - IPFS HuggingFace Bridge',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  // Load the main dashboard
  win.loadFile(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'dashboard.html'));
  
  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  // Clear the mainWindow reference when closed (if this is the main window)
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
  
  return win;
};

// Store reference to main window for navigation
let mainWindow = null;

// Helper function to navigate within the main window
const navigateToView = (viewPath) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(viewPath);
  }
};

// Setup IPC handlers for navigation and window management
ipcMain.on('open-daemon-manager', () => {
  navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'daemon_manager.html'));
});

ipcMain.on('open-model-tester', () => {
  navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'model_tester.html'));
});

ipcMain.on('open-security-test-dashboard', () => {
  navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'security_test_dashboard.html'));
});

ipcMain.on('open-database-backup-dashboard', () => {
  navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'database_backup_dashboard.html'));
});

// Global menu generator instance
let menuGenerator = null;

// Create application menu with programmatic generation
const createAppMenu = () => {
  // Initialize menu generator with necessary context
  menuGenerator = new MenuGenerator({
    daemonManager: daemonManager,
    navigateToView: navigateToView,
    createSwissKnifeWindow: createSwissKnifeWindow,
    createMCPDashboardWindow: createMCPDashboardWindow,
    mainWindow: mainWindow
  });
  
  // Generate and set the menu
  menuGenerator.generate();
  
  logInfo('MENU', 'Application menu generated programmatically');
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', async () => {
  try {
    logInfo('APP_READY', 'Electron app ready, initializing...');
    
    // Start the SwissKnife web server
    await startSwissKnifeServer();
    
    logInfo('APP_READY', 'Creating menu...');
    createAppMenu();
    
    logInfo('APP_READY', 'Creating window...');
    createWindow();
    
    // Auto-start MCP daemons after a short delay
    setTimeout(async () => {
      try {
        logInfo('MCP_DAEMONS', 'Auto-starting MCP daemons...');
        await daemonManager.startAll();
        logInfo('MCP_DAEMONS', 'All daemons started');
      } catch (error) {
        logError('MCP_DAEMONS_START', error);
      }
    }, 2000);
  } catch (error) {
    logError('APP_READY', error);
    // Show error dialog
    const { dialog } = await import('electron');
    dialog.showErrorBox('Startup Error', `Failed to start application: ${error.message}\n\nCheck ${LOG_FILE} for details.`);
  }
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  logInfo('APP_LIFECYCLE', 'All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up daemons and server on quit
app.on('before-quit', async (event) => {
  event.preventDefault();
  
  try {
    logInfo('APP_QUIT', 'Shutting down MCP daemons...');
    await daemonManager.stopAll();
    
    // Stop SwissKnife web server
    if (swissKnifeServer) {
      swissKnifeServer.close(() => {
        logInfo('APP_QUIT', 'SwissKnife web server stopped');
      });
    }
    
    logInfo('APP_QUIT', 'Cleanup complete, exiting...');
    // Now actually quit
    app.exit(0);
  } catch (error) {
    logError('APP_QUIT', error);
    app.exit(1);
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  logInfo('APP_LIFECYCLE', 'App activated');
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});