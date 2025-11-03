import { app, BrowserWindow, Menu, MenuItem, ipcMain } from 'electron';
import { createModelTesterWindow } from './hallucinate_app/node/accelerate_model_tester.js';
import MCPDaemonManager from './hallucinate_app/node/mcp_daemon_manager.js';
import path from 'path';
import url from 'url';
import electron_squirrel_startup from 'electron-squirrel-startup';
import testHandler from './hallucinate_app/node/test_handler.js';
import benchmarkHandler from './hallucinate_app/node/benchmark_handler.js';
import { getDaemonManager } from './hallucinate_app/node/daemon_manager.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (electron_squirrel_startup) {
  app.quit();
}

// Get the directory where the current module is located
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

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
      nodeIntegration: true,
      contextIsolation: false
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
      nodeIntegration: true,
      contextIsolation: false
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
  // Create the SwissKnife virtual desktop as the default window
  const mainWindow = createSwissKnifeWindow();
  
  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  return mainWindow;
};

// Create a window for the IPFS Kit Dashboard
const createIPFSKitDashboardWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
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
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'MCP Daemon Manager',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  // Create simple HTML content for daemon manager
  const daemonManagerHTML = `
<!DOCTYPE html>
<html>
<head>
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

// Create a window for SwissKnife Virtual Desktop
const createSwissKnifeWindow = () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // Allow loading local resources
    },
    title: 'SwissKnife Virtual Desktop',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  // Try loading in order: proper web desktop, dev server, built dist, fallback message
  const swissKnifeWebPath = path.join(__dirname, 'swissknife', 'web', 'index.html');
  const swissKnifeDistPath = path.join(__dirname, 'swissknife', 'dist', 'index.html');
  const swissKnifeDevUrl = 'http://localhost:5173';
  
  // Try the proper web desktop first (Aero theme with 27+ apps)
  win.loadFile(swissKnifeWebPath).catch((err) => {
    console.log('SwissKnife web desktop not found, trying dev server...', err);
    return win.loadURL(swissKnifeDevUrl);
  }).catch((err) => {
    console.log('Dev server not running, trying dist...', err);
    return win.loadFile(swissKnifeDistPath);
  }).catch((err) => {
    console.error('Could not load SwissKnife from any source:', err);
    // Load a helpful message instead
    const notAvailableHTML = `<!DOCTYPE html>
<html>
<head>
  <title>SwissKnife Virtual Desktop - Setup Required</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 50px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 20px;
      backdrop-filter: blur(20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      max-width: 600px;
    }
    h1 { 
      font-size: 2.5em; 
      margin: 0 0 20px 0;
      background: linear-gradient(45deg, #ffd700, #ff6b6b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .icon { font-size: 4em; margin-bottom: 20px; }
    p { font-size: 1.1em; margin: 15px 0; line-height: 1.6; }
    code {
      background: rgba(0, 0, 0, 0.4);
      padding: 8px 15px;
      border-radius: 8px;
      display: block;
      margin: 15px 0;
      font-family: 'Courier New', monospace;
      font-size: 0.95em;
    }
    .note {
      background: rgba(255, 193, 7, 0.2);
      padding: 15px;
      border-radius: 10px;
      margin-top: 20px;
      border-left: 4px solid #ffc107;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🏔️</div>
    <h1>SwissKnife Virtual Desktop</h1>
    <p>Revolutionary Collaborative Development Environment</p>
    <p><strong>27+ Professional Applications</strong> with Aero theme ready to launch!</p>
    <p>To start SwissKnife with Node.js 20+:</p>
    <code>cd swissknife && npm run desktop:collaborative</code>
    <p>Or single-user mode:</p>
    <code>cd swissknife && npm run desktop</code>
    <div class="note">
      <strong>Note:</strong> Requires Node.js 20+ (current: ${process.version})<br>
      MCP servers are running on ports 3001-3003
    </div>
  </div>
</body>
</html>`;
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(notAvailableHTML)}`);
  });
  
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

// Create application menu
const createAppMenu = () => {
  const appMenu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Daemons',
      submenu: [
        {
          label: 'Daemon Manager',
          click: () => {
            createDaemonManagerWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Start All Daemons',
          click: async () => {
            await daemonManager.startAll();
          }
        },
        {
          label: 'Stop All Daemons',
          click: async () => {
            await daemonManager.stopAll();
          }
        },
        { type: 'separator' },
        {
          label: 'IPFS Kit MCP',
          submenu: [
            {
              label: 'Start',
              click: async () => {
                await daemonManager.startDaemon('ipfs-kit');
              }
            },
            {
              label: 'Stop',
              click: async () => {
                await daemonManager.stopDaemon('ipfs-kit');
              }
            },
            {
              label: 'Restart',
              click: async () => {
                await daemonManager.restartDaemon('ipfs-kit');
              }
            }
          ]
        },
        {
          label: 'IPFS Datasets MCP',
          submenu: [
            {
              label: 'Start',
              click: async () => {
                await daemonManager.startDaemon('ipfs-datasets');
              }
            },
            {
              label: 'Stop',
              click: async () => {
                await daemonManager.stopDaemon('ipfs-datasets');
              }
            },
            {
              label: 'Restart',
              click: async () => {
                await daemonManager.restartDaemon('ipfs-datasets');
              }
            }
          ]
        },
        {
          label: 'IPFS Accelerate MCP',
          submenu: [
            {
              label: 'Start',
              click: async () => {
                await daemonManager.startDaemon('ipfs-accelerate');
              }
            },
            {
              label: 'Stop',
              click: async () => {
                await daemonManager.stopDaemon('ipfs-accelerate');
              }
            },
            {
              label: 'Restart',
              click: async () => {
                await daemonManager.restartDaemon('ipfs-accelerate');
              }
            }
          ]
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Windows',
      submenu: [
        {
          label: 'SwissKnife Virtual Desktop',
          click: () => {
            createSwissKnifeWindow();
          }
        },
        {
          label: 'Daemon Manager',
          click: () => {
            createDaemonManagerWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Test Interface',
          click: () => {
            createTestWindow();
          }
        },
        {
          label: 'Benchmark Dashboard',
          click: () => {
            createBenchmarkWindow();
          }
        },
        {
          label: 'Model Tester',
          click: () => {
            createModelTesterWindow();
          }
        },
        {
          label: 'IPFS Kit Dashboard',
          click: () => {
            createIPFSKitDashboardWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'SwissKnife Virtual Desktop',
          click: () => {
            createSwissKnifeWindow();
          }
        },
        {
          label: 'Daemon Manager',
          click: () => {
            createDaemonManagerWindow();
          }
        }
      ]
    },
    {
      label: 'Daemons',
      submenu: [
        {
          label: 'Start All MCP Servers',
          click: async () => {
            await daemonManager.startAll();
          }
        },
        {
          label: 'Stop All MCP Servers',
          click: async () => {
            await daemonManager.stopAll();
          }
        },
        { type: 'separator' },
        {
          label: 'IPFS Accelerate MCP',
          submenu: [
            {
              label: 'Start',
              click: async () => {
                await daemonManager.startDaemon('ipfs-accelerate-mcp');
              }
            },
            {
              label: 'Stop',
              click: async () => {
                await daemonManager.stopDaemon('ipfs-accelerate-mcp');
              }
            },
            {
              label: 'Restart',
              click: async () => {
                await daemonManager.restartDaemon('ipfs-accelerate-mcp');
              }
            }
          ]
        },
        {
          label: 'SwissKnife MCP',
          submenu: [
            {
              label: 'Start',
              click: async () => {
                await daemonManager.startDaemon('swissknife-mcp');
              }
            },
            {
              label: 'Stop',
              click: async () => {
                await daemonManager.stopDaemon('swissknife-mcp');
              }
            },
            {
              label: 'Restart',
              click: async () => {
                await daemonManager.restartDaemon('swissknife-mcp');
              }
            }
          ]
        },
        {
          label: 'HuggingFace MCP',
          submenu: [
            {
              label: 'Start',
              click: async () => {
                await daemonManager.startDaemon('huggingface-mcp');
              }
            },
            {
              label: 'Stop',
              click: async () => {
                await daemonManager.stopDaemon('huggingface-mcp');
              }
            },
            {
              label: 'Restart',
              click: async () => {
                await daemonManager.restartDaemon('huggingface-mcp');
              }
            }
          ]
        }
      ]
    }
  ]);
  
  Menu.setApplicationMenu(appMenu);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', () => {
  createAppMenu();
  createWindow();
  
  // Auto-start MCP daemons after a short delay
  setTimeout(async () => {
    console.log('🚀 Auto-starting MCP daemons...');
    await daemonManager.startAll();
  }, 2000);
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up daemons on quit
app.on('before-quit', async (event) => {
  event.preventDefault();
  
  console.log('🛑 Shutting down MCP daemons...');
  await daemonManager.stopAll();
  
  // Now actually quit
  app.exit(0);
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});