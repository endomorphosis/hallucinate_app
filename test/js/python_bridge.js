import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

class PythonBridge {
  constructor() {
    this.pythonProcess = null;
    this.serverUrl = 'http://localhost:8000';
    this.serverStarted = false;
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      try {
        const pythonPath = 'python';  // or specify full path to python executable
        
        // Find server script path
        const serverScriptPath = path.join(
          process.cwd(), 
          'test', 
          'python',
          'ipfs_accelerate_server.py'
        );
        
        if (!fs.existsSync(serverScriptPath)) {
          return reject(new Error(`Server script not found at ${serverScriptPath}`));
        }
        
        this.pythonProcess = spawn(pythonPath, [serverScriptPath]);
        
        this.pythonProcess.stdout.on('data', (data) => {
          console.log(`Python server output: ${data}`);
          if (data.toString().includes('Application startup complete')) {
            this.serverStarted = true;
          }
        });
        
        this.pythonProcess.stderr.on('data', (data) => {
          console.error(`Python server error: ${data}`);
        });
        
        this.pythonProcess.on('error', (error) => {
          reject(error);
        });
        
        // Wait for server to start
        let retries = 0;
        const maxRetries = 10;
        const retryInterval = 500; // ms
        
        const checkServer = () => {
          fetch(`${this.serverUrl}/status`)
            .then(response => {
              if (response.status === 200) {
                this.serverStarted = true;
                resolve(true);
              } else {
                retryCheck();
              }
            })
            .catch(() => retryCheck());
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
  }

  async stopServer() {
    return new Promise((resolve) => {
      if (this.pythonProcess) {
        this.pythonProcess.kill();
        this.pythonProcess.on('close', () => {
          this.pythonProcess = null;
          this.serverStarted = false;
          resolve(true);
        });
        
        // Force resolve after timeout
        setTimeout(() => {
          if (this.pythonProcess) {
            this.pythonProcess.kill('SIGKILL');
            this.pythonProcess = null;
            this.serverStarted = false;
          }
          resolve(true);
        }, 3000);
      } else {
        resolve(true);
      }
    });
  }

  async loadModel(modelId) {
    if (!this.serverStarted) {
      throw new Error('Server not started');
    }
    
    try {
      const response = await fetch(`${this.serverUrl}/load_model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model_id: modelId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to load model');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error loading model:', error);
      throw error;
    }
  }

  async runInference(inputData) {
    if (!this.serverStarted) {
      throw new Error('Server not started');
    }
    
    try {
      const response = await fetch(`${this.serverUrl}/inference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inputData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Inference failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error running inference:', error);
      throw error;
    }
  }

  async test() {
    if (!this.serverStarted) {
      throw new Error('Server not started');
    }
    
    try {
      const response = await fetch(`${this.serverUrl}/test`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Test failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error running test:', error);
      throw error;
    }
  }
}

export { PythonBridge };
export default new PythonBridge();