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
        const pythonPath = 'python3';  // use python3 for Linux/macOS
        
        // Try the main server script first
        let serverScriptPath = path.join(
          process.cwd(), 
          'hallucinate_app',
          'python',
          'hallucinate_app',
          'main.py'
        );
        
        // If main server not found, try accelerate server
        if (!fs.existsSync(serverScriptPath)) {
          console.log(`Main server script not found at ${serverScriptPath}, trying accelerate server...`);
          serverScriptPath = path.join(
            process.cwd(), 
            'hallucinate_app',
            'python',
            'hallucinate_app',
            'ipfs_accelerate_server.py'
          );
          
          // If accelerate server not found, fall back to test server
          if (!fs.existsSync(serverScriptPath)) {
            console.log(`Accelerate server script not found at ${serverScriptPath}, falling back to test server`);
            serverScriptPath = path.join(
              process.cwd(), 
              'test', 
              'python',
              'ipfs_accelerate_server.py'
            );
            
            if (!fs.existsSync(serverScriptPath)) {
              return reject(new Error(`No server script found. Tried main.py, ipfs_accelerate_server.py, and test server.`));
            }
          }
        }
        
        console.log(`Starting server from: ${serverScriptPath}`);
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
        const maxRetries = 20;  // Increased retries
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
  }

  async stopServer() {
    return new Promise((resolve) => {
      if (this.pythonProcess) {
        console.log('Stopping Python server...');
        this.pythonProcess.kill();
        this.pythonProcess.on('close', () => {
          console.log('Python server stopped');
          this.pythonProcess = null;
          this.serverStarted = false;
          resolve(true);
        });
        
        // Force resolve after timeout
        setTimeout(() => {
          if (this.pythonProcess) {
            console.log('Force killing Python server');
            this.pythonProcess.kill('SIGKILL');
            this.pythonProcess = null;
            this.serverStarted = false;
          }
          resolve(true);
        }, 5000);
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
      console.log(`Loading model: ${modelId}`);
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
      
      const result = await response.json();
      console.log(`Model loaded successfully: ${modelId}`);
      return result;
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
      console.log(`Running inference with data: ${JSON.stringify(inputData)}`);
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
      
      const result = await response.json();
      console.log('Inference completed successfully');
      return result;
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
      console.log('Running accelerator tests...');
      const response = await fetch(`${this.serverUrl}/test`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Test failed');
      }
      
      const result = await response.json();
      console.log('Tests completed successfully');
      return result;
    } catch (error) {
      console.error('Error running test:', error);
      throw error;
    }
  }
}

export { PythonBridge };
export default new PythonBridge();