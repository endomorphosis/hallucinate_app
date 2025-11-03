import { app, BrowserWindow, Menu, MenuItem, ipcMain, protocol } from 'electron';
import { createModelTesterWindow } from './hallucinate_app/node/accelerate_model_tester.js';
import MCPDaemonManager from './hallucinate_app/node/mcp_daemon_manager.js';
import path from 'path';
import url from 'url';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
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

// Create a simple static file server for SwissKnife web files
let swissKnifeServer = null;
const SWISSKNIFE_PORT = 8765;

function startSwissKnifeServer() {
  const swissKnifeWebDir = path.join(__dirname, 'swissknife', 'web');
  
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
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch (err) {
      console.error('SwissKnife server error:', err.message);
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  
  swissKnifeServer.listen(SWISSKNIFE_PORT, '127.0.0.1', () => {
    console.log(`✅ SwissKnife web server running on http://127.0.0.1:${SWISSKNIFE_PORT}`);
  });
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

// Create main application window
const createWindow = () => {
  // Create the main dashboard window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Allow loading local resources
      allowRunningInsecureContent: true
    },
    title: 'hallucinate_app - IPFS HuggingFace Bridge',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  // Load the main dashboard
  mainWindow.loadFile(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'dashboard.html'));
  
  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  // Clear the mainWindow reference when closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  return mainWindow;
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

// Create application menu with comprehensive structure
const createAppMenu = () => {
  const appMenu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Home',
          accelerator: 'CommandOrControl+H',
          click: () => {
            navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'dashboard.html'));
          }
        },
        { type: 'separator' },
        { 
          label: 'Settings',
          accelerator: 'CommandOrControl+,',
          enabled: false  // TODO: implement settings
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Dashboards',
      submenu: [
        {
          label: 'Main Dashboard',
          accelerator: 'CommandOrControl+D',
          click: () => {
            navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'dashboard.html'));
          }
        },
        { type: 'separator' },
        {
          label: 'IPFS MCP Servers',
          submenu: [
            {
              label: 'IPFS Kit Dashboard',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'ipfs_kit_dashboard.html'));
              }
            },
            {
              label: 'IPFS Datasets Dashboard',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'ipfs_datasets_dashboard.html'));
              }
            },
            {
              label: 'IPFS Accelerate Dashboard',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'ipfs_accelerate_dashboard.html'));
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Testing & Benchmarks',
          submenu: [
            {
              label: 'Test Interface',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'test_interface.html'));
              }
            },
            {
              label: 'Benchmark Dashboard',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'benchmark_dashboard.html'));
              }
            },
            {
              label: 'Model Tester',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'model_tester.html'));
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Security & Authentication',
          submenu: [
            {
              label: 'Auth Dashboard',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'auth_dashboard.html'));
              }
            },
            {
              label: 'Security Test Dashboard',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'security_test_dashboard.html'));
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Database & Storage',
          submenu: [
            {
              label: 'Database Backup Dashboard',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'database_backup_dashboard.html'));
              }
            },
            {
              label: 'PyArrow Content Index',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'pyarrow_content_index_dashboard.html'));
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'System Management',
          submenu: [
            {
              label: 'Daemon Manager',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'daemon_manager.html'));
              }
            },
            {
              label: 'Usage Dashboard',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'usage_dashboard.html'));
              }
            }
          ]
        }
      ]
    },
    {
      label: 'MCP Servers',
      submenu: [
        {
          label: 'Daemon Manager',
          click: () => {
            navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'daemon_manager.html'));
          }
        },
        { type: 'separator' },
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
            },
            { type: 'separator' },
            {
              label: 'Open Dashboard',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'ipfs_kit_dashboard.html'));
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
            },
            { type: 'separator' },
            {
              label: 'Open Dashboard',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'ipfs_datasets_dashboard.html'));
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
            },
            { type: 'separator' },
            {
              label: 'Open Dashboard',
              click: () => {
                navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'ipfs_accelerate_dashboard.html'));
              }
            }
          ]
        }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'SwissKnife Virtual Desktop',
          click: () => {
            // SwissKnife runs on its own server, so we load it in main window
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.loadURL(`http://127.0.0.1:${SWISSKNIFE_PORT}`);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Model Tester',
          click: () => {
            navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'model_tester.html'));
          }
        },
        {
          label: 'Test Interface',
          click: () => {
            navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'test_interface.html'));
          }
        },
        {
          label: 'Benchmark Dashboard',
          click: () => {
            navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'benchmark_dashboard.html'));
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { 
          label: 'Back',
          accelerator: 'Alt+Left',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.canGoBack()) {
              mainWindow.webContents.goBack();
            }
          }
        },
        { 
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.canGoForward()) {
              mainWindow.webContents.goForward();
            }
          }
        },
        { type: 'separator' },
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
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: async () => {
            const { shell } = await import('electron');
            await shell.openExternal('https://github.com/endomorphosis/hallucinate_app');
          }
        },
        {
          label: 'Report Issue',
          click: async () => {
            const { shell } = await import('electron');
            await shell.openExternal('https://github.com/endomorphosis/hallucinate_app/issues');
          }
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About hallucinate_app',
              message: 'hallucinate_app',
              detail: 'Electron App for IPFS HuggingFace Bridge\nVersion 1.0.3\n\nA comprehensive platform for decentralized AI model serving with IPFS.',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ]);
  
  Menu.setApplicationMenu(appMenu);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', () => {
  // Start the SwissKnife web server
  startSwissKnifeServer();
  
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

// Clean up daemons and server on quit
app.on('before-quit', async (event) => {
  event.preventDefault();
  
  console.log('🛑 Shutting down MCP daemons...');
  await daemonManager.stopAll();
  
  // Stop SwissKnife web server
  if (swissKnifeServer) {
    swissKnifeServer.close(() => {
      console.log('🛑 SwissKnife web server stopped');
    });
  }
  
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