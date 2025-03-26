import { expect } from 'chai';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

class TestAccelerateBridge {
  constructor() {
    this.pythonProcess = null;
    this.serverUrl = 'http://localhost:8000';
    this.serverStarted = false;
    this.resources = {};
    this.metadata = {};
    this.testModelId = 'test-model';
  }

  async startServer() {
    try {
      const pythonPath = 'python';
      const scriptPath = path.join(process.cwd(), 'hallucinate_app/python/hallucinate_app/ipfs_accelerate_server.py');
      
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Script not found at ${scriptPath}`);
      }
      
      this.pythonProcess = spawn(pythonPath, [scriptPath]);
      
      this.pythonProcess.stdout.on('data', (data) => {
        console.log(`Python server output: ${data}`);
        if (data.toString().includes('Application startup complete')) {
          this.serverStarted = true;
        }
      });
      
      this.pythonProcess.stderr.on('data', (data) => {
        console.error(`Python server error: ${data}`);
      });
      
      // Wait for server to start
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          fetch(`${this.serverUrl}/status`)
            .then(response => {
              clearInterval(checkInterval);
              this.serverStarted = true;
              resolve(true);
            })
            .catch(err => {
              // Still waiting for server to start
            });
        }, 500);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!this.serverStarted) {
            resolve(false);
          }
        }, 10000);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      return false;
    }
  }

  async stopServer() {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.pythonProcess = null;
      this.serverStarted = false;
    }
  }

  async checkServerStatus() {
    try {
      const response = await fetch(`${this.serverUrl}/status`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async testLoadModel() {
    try {
      const response = await fetch(`${this.serverUrl}/load_model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model_id: this.testModelId }),
      });
      
      const result = await response.json();
      return result.status === 'success';
    } catch (error) {
      console.error('Test load model failed:', error);
      return false;
    }
  }

  async testInference() {
    try {
      const testInput = {
        text: 'Test input for inference',
      };
      
      const response = await fetch(`${this.serverUrl}/inference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testInput),
      });
      
      const result = await response.json();
      return result && Object.keys(result).length > 0;
    } catch (error) {
      console.error('Test inference failed:', error);
      return false;
    }
  }

  async test() {
    const results = {
      server_start: false,
      server_status: false,
      model_loading: false,
      inference: false,
    };
    
    try {
      // Test 1: Start server
      results.server_start = await this.startServer();
      console.log('Server start test:', results.server_start ? 'PASSED' : 'FAILED');
      
      if (results.server_start) {
        // Test 2: Check server status
        results.server_status = await this.checkServerStatus();
        console.log('Server status test:', results.server_status ? 'PASSED' : 'FAILED');
        
        // Test 3: Load model
        results.model_loading = await this.testLoadModel();
        console.log('Model loading test:', results.model_loading ? 'PASSED' : 'FAILED');
        
        // Test 4: Run inference
        results.inference = await this.testInference();
        console.log('Inference test:', results.inference ? 'PASSED' : 'FAILED');
      }
    } catch (error) {
      console.error('Test execution error:', error);
    } finally {
      // Clean up
      await this.stopServer();
    }
    
    return results;
  }
}

export { TestAccelerateBridge };
export default TestAccelerateBridge;

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new TestAccelerateBridge();
  tester.test().then(results => {
    console.log('Test results:', results);
    const allPassed = Object.values(results).every(result => result === true);
    process.exit(allPassed ? 0 : 1);
  });
}