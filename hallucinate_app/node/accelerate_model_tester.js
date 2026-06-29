import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import url from 'url';
import pythonBridge from '../../test/js/python_bridge.js';

// Get the directory where the current module is located
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

/**
 * Creates a new window for the IPFS HuggingFace Bridge dashboard
 */
export function createModelTesterWindow() {
  // Create browser window
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'IPFS HuggingFace Bridge',
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });

  // Load dashboard instead of just the model tester
  win.loadFile(path.join(__dirname, 'views', 'dashboard.html'));

  // Setup bridge between UI and Python
  setupIpcHandlers();

  // Return window for further manipulation
  return win;
}

/**
 * Set up IPC handlers for dashboard and model tester UI
 */
function setupIpcHandlers() {
  // Start server
  ipcMain.on('start-server', async (event) => {
    try {
      console.log('Starting IPFS Accelerate server...');
      await pythonBridge.startServer();
      console.log('Server started successfully');
      event.reply('server-status', { running: true });
    } catch (error) {
      console.error('Server start error:', error);
      event.reply('server-status', { 
        running: false, 
        error: error.message 
      });
    }
  });

  // Stop server
  ipcMain.on('stop-server', async (event) => {
    try {
      console.log('Stopping IPFS Accelerate server...');
      await pythonBridge.stopServer();
      console.log('Server stopped successfully');
      event.reply('server-status', { running: false });
    } catch (error) {
      console.error('Server stop error:', error);
      event.reply('server-status', { 
        running: true, 
        error: error.message 
      });
    }
  });

  // Load model
  ipcMain.on('load-model', async (event, modelId) => {
    try {
      console.log(`Loading model: ${modelId}`);
      const result = await pythonBridge.loadModel(modelId);
      console.log('Model loaded successfully:', result);
      event.reply('model-loaded', result);
    } catch (error) {
      console.error('Model loading error:', error);
      event.reply('model-loaded', { 
        error: error.message 
      });
    }
  });

  // Run inference
  ipcMain.on('run-inference', async (event, inputData) => {
    try {
      console.log('Running inference with input:', inputData);
      const result = await pythonBridge.runInference(inputData);
      console.log('Inference result:', result);
      event.reply('inference-result', result);
    } catch (error) {
      console.error('Inference error:', error);
      event.reply('inference-result', { 
        error: error.message 
      });
    }
  });

  // Run test
  ipcMain.on('run-test', async (event) => {
    try {
      console.log('Running IPFS Accelerate tests...');
      const result = await pythonBridge.test();
      console.log('Test results:', result);
      event.reply('test-result', result);
    } catch (error) {
      console.error('Test error:', error);
      event.reply('test-result', { 
        error: error.message 
      });
    }
  });
}

export default { createModelTesterWindow };