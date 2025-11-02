import { app, BrowserWindow, Menu, MenuItem, ipcMain } from 'electron';
import { createModelTesterWindow } from './hallucinate_app/node/accelerate_model_tester.js';
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

// Get daemon manager instance
const daemonManager = getDaemonManager();

// Setup test and benchmark handlers
testHandler.setupIpcHandlers();
benchmarkHandler.setupIpcHandlers();

// Setup daemon manager IPC handlers
setupDaemonManagerIPC();

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
  // Create the test interface window instead of the model tester window
  const mainWindow = createTestWindow();
  
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

// Create a window for SwissKnife Virtual Desktop
const createSwissKnifeWindow = () => {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    title: 'SwissKnife - Virtual Desktop',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  // Load SwissKnife web interface
  const swissknifePath = path.join(__dirname, 'swissknife', 'web', 'index.html');
  
  // Check if built version exists, otherwise use dev server URL
  const fs = require('fs');
  if (fs.existsSync(swissknifePath)) {
    win.loadFile(swissknifePath);
  } else {
    // Development mode - connect to vite dev server
    win.loadURL('http://localhost:3001');
  }
  
  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

// Create a window for Daemon Manager Dashboard
const createDaemonManagerWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'MCP Daemon Manager',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  win.loadFile(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'daemon_manager.html'));
  
  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

// Setup IPC handlers for daemon manager
function setupDaemonManagerIPC() {
  // Get daemon status
  ipcMain.handle('daemon:get-status', async () => {
    return daemonManager.getStatus();
  });

  // Start all daemons
  ipcMain.handle('daemon:start-all', async () => {
    await daemonManager.startAll();
    return daemonManager.getStatus();
  });

  // Stop all daemons
  ipcMain.handle('daemon:stop-all', async () => {
    await daemonManager.stopAll();
    return daemonManager.getStatus();
  });

  // Start specific daemon
  ipcMain.handle('daemon:start', async (event, name) => {
    await daemonManager.startDaemon(name);
    return daemonManager.getDaemonStatus(name);
  });

  // Stop specific daemon
  ipcMain.handle('daemon:stop', async (event, name) => {
    await daemonManager.stopDaemon(name);
    return daemonManager.getDaemonStatus(name);
  });

  // Restart specific daemon
  ipcMain.handle('daemon:restart', async (event, name) => {
    await daemonManager.restartDaemon(name);
    return daemonManager.getDaemonStatus(name);
  });

  // Forward daemon events to renderer
  const eventTypes = [
    'daemon-starting', 'daemon-started', 'daemon-stopping', 
    'daemon-stopped', 'daemon-crashed', 'daemon-failed',
    'daemon-error', 'daemon-health-check', 'daemon-health-check-failed'
  ];

  eventTypes.forEach(eventType => {
    daemonManager.on(eventType, (data) => {
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('daemon-event', { type: eventType, data });
      });
    });
  });
}

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
  
  // Auto-start daemons on app start (optional)
  if (process.env.AUTO_START_DAEMONS !== 'false') {
    setTimeout(() => {
      console.log('Auto-starting MCP daemons...');
      daemonManager.startAll().catch(err => {
        console.error('Error auto-starting daemons:', err);
      });
    }, 2000); // Wait 2 seconds after app start
  }
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up daemons on app quit
app.on('before-quit', async (event) => {
  event.preventDefault();
  
  console.log('Stopping all daemons before quit...');
  await daemonManager.stopAll();
  
  // Allow app to quit
  process.nextTick(() => {
    app.exit(0);
  });
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});