import { app, BrowserWindow, Menu, MenuItem } from 'electron';
import { createModelTesterWindow } from './hallucinate_app/node/accelerate_model_tester.js';
import path from 'path';
import url from 'url';
import electron_squirrel_startup from 'electron-squirrel-startup';
import testHandler from './hallucinate_app/node/test_handler.js';
import benchmarkHandler from './hallucinate_app/node/benchmark_handler.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (electron_squirrel_startup) {
  app.quit();
}

// Get the directory where the current module is located
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

// Setup test and benchmark handlers
testHandler.setupIpcHandlers();
benchmarkHandler.setupIpcHandlers();

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
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});