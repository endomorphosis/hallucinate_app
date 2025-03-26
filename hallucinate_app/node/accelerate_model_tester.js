import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import url from 'url';
import pythonBridge from '../../test/js/python_bridge.js';

// Get the directory where the current module is located
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

/**
 * Creates a new window for testing the accelerate model server
 */
export function createModelTesterWindow() {
  // Create browser window
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load HTML file (this would need to be created)
  win.loadFile(path.join(__dirname, 'views', 'model_tester.html'));

  // Handle IPC messages from renderer
  setupIpcHandlers();

  return win;
}

/**
 * Set up IPC handlers for model tester UI
 */
function setupIpcHandlers() {
  // Start server
  ipcMain.on('start-server', async (event) => {
    try {
      await pythonBridge.startServer();
      event.reply('server-status', { running: true });
    } catch (error) {
      event.reply('server-status', { 
        running: false, 
        error: error.message 
      });
    }
  });

  // Stop server
  ipcMain.on('stop-server', async (event) => {
    try {
      await pythonBridge.stopServer();
      event.reply('server-status', { running: false });
    } catch (error) {
      event.reply('server-status', { 
        running: true, 
        error: error.message 
      });
    }
  });

  // Load model
  ipcMain.on('load-model', async (event, modelId) => {
    try {
      const result = await pythonBridge.loadModel(modelId);
      event.reply('model-loaded', result);
    } catch (error) {
      event.reply('model-loaded', { 
        error: error.message 
      });
    }
  });

  // Run inference
  ipcMain.on('run-inference', async (event, inputData) => {
    try {
      const result = await pythonBridge.runInference(inputData);
      event.reply('inference-result', result);
    } catch (error) {
      event.reply('inference-result', { 
        error: error.message 
      });
    }
  });

  // Run test
  ipcMain.on('run-test', async (event) => {
    try {
      const result = await pythonBridge.test();
      event.reply('test-result', result);
    } catch (error) {
      event.reply('test-result', { 
        error: error.message 
      });
    }
  });
}

export default { createModelTesterWindow };