import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pythonBridge from './python_bridge.js';

class TestAccelerateBridge {
  constructor() {
    this.testModelId = 'test-model';
  }

  async forceTestServer() {
    // Override the startServer method to use test server
    const originalStartServer = pythonBridge.startServer;
    
    pythonBridge.startServer = async function() {
      return new Promise((resolve, reject) => {
        try {
          const pythonPath = 'python3';
          
          // Force using the test server
          const serverScriptPath = path.join(
            process.cwd(), 
            'test', 
            'python',
            'ipfs_accelerate_server.py'
          );
          
          if (!fs.existsSync(serverScriptPath)) {
            return reject(new Error(`Test server script not found at ${serverScriptPath}`));
          }
          
          console.log(`Starting test server from: ${serverScriptPath}`);
          this.pythonProcess = spawn(pythonPath, [serverScriptPath]);
          
          this.pythonProcess.stdout.on('data', (data) => {
            console.log(`Python server output: ${data}`);
          });
          
          this.pythonProcess.stderr.on('data', (data) => {
            console.error(`Python server error: ${data}`);
          });
          
          this.pythonProcess.on('error', (error) => {
            reject(error);
          });
          
          // Wait for server to start
          let retries = 0;
          const maxRetries = 20;
          const retryInterval = 500; // ms
          
          const checkServer = () => {
            console.log(`Checking server status (attempt ${retries + 1}/${maxRetries})...`);
            fetch(`${this.serverUrl}/status`)
              .then(response => {
                if (response.status === 200) {
                  console.log('Server started successfully!');
                  this.serverStarted = true;
                  resolve(true);
                } else {
                  retryCheck();
                }
              })
              .catch(error => {
                console.log(`Server not ready yet: ${error.message}`);
                retryCheck();
              });
          };
          
          const retryCheck = () => {
            retries++;
            if (retries >= maxRetries) {
              reject(new Error('Failed to start server after multiple attempts'));
            } else {
              setTimeout(checkServer, retryInterval);
            }
          };
          
          setTimeout(checkServer, 1000); // Initial delay to let server start
          
        } catch (error) {
          reject(error);
        }
      });
    };
    
    return originalStartServer;
  }

  async runTests() {
    console.log('Testing IPFS Accelerate Python Bridge');
    
    // Save original method to restore later
    const originalStartServer = await this.forceTestServer();
    
    try {
      // Start server
      console.log('\n--- Starting server ---');
      await pythonBridge.startServer();
      console.log('Server started successfully');
      
      // Test model loading
      console.log('\n--- Testing model loading ---');
      const modelId = this.testModelId;
      const loadResult = await pythonBridge.loadModel(modelId);
      console.log('Model loading result:', loadResult);
      
      // Test inference
      console.log('\n--- Testing inference ---');
      const inferenceInput = { text: 'This is a test input from JavaScript' };
      const inferenceResult = await pythonBridge.runInference(inferenceInput);
      console.log('Inference result:', inferenceResult);
      
      // Test server test endpoint
      console.log('\n--- Testing test endpoint ---');
      const testResult = await pythonBridge.test();
      console.log('Test result:', testResult);
      
      // Stop server
      console.log('\n--- Stopping server ---');
      await pythonBridge.stopServer();
      console.log('Server stopped successfully');
      
      console.log('\n✅ All tests passed!');
      return true;
    } catch (error) {
      console.error('\n❌ Test failed:', error);
      
      // Try to stop server
      try {
        await pythonBridge.stopServer();
      } catch (e) {
        console.error('Error stopping server:', e);
      }
      
      return false;
    } finally {
      // Restore original method
      pythonBridge.startServer = originalStartServer;
    }
  }

  async test() {
    const success = await this.runTests();
    return {
      bridge_integration: success
    };
  }
}

export { TestAccelerateBridge };
export default TestAccelerateBridge;

// Run test if this file is executed directly
const isDirectExecution = process.argv[1] &&
  path.basename(fileURLToPath(import.meta.url)) === path.basename(process.argv[1]);
if (isDirectExecution) {
  const tester = new TestAccelerateBridge();
  tester.runTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}