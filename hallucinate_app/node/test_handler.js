import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import pythonBridge from '../../test/js/python_bridge.js';

// Import module test implementations
import { MockApp } from '../../test/js/test_accelerate_electron.js';

/**
 * Module Test Handler
 * Manages testing of all different modules in the application
 */
class ModuleTestHandler {
  constructor() {
    this.services = {
      pythonServer: false,
      ipfsNode: false
    };
    
    this.modules = {
      'ipfs-kit': null,
      'model-manager': null,
      'transformers': null,
      'datasets': null,
      'accelerate': null,
      'faiss': null,
      'agents': null,
      'libp2p': null,
      'orbitdb': null,
      'fireproofdb': null,
      'duckdb-ipld': null,
      'embeddings': null,
      'auth': null,
      'keystore': null,
      'auth-keystore': null,
      'secure-faiss': null,
      'security-integration': null,
      'auth-dashboard': null
    };
    
    this.testResults = {};
  }

  /**
   * Initialize all IPC handlers for module testing
   */
  setupIpcHandlers() {
    // Start all services
    ipcMain.on('start-all-services', async (event) => {
      try {
        console.log('Starting all services...');
        await this.startAllServices();
        event.reply('services-status', { running: true });
      } catch (error) {
        console.error('Failed to start services:', error);
        event.reply('services-status', { 
          running: false, 
          error: error.message 
        });
      }
    });

    // Stop all services
    ipcMain.on('stop-all-services', async (event) => {
      try {
        console.log('Stopping all services...');
        await this.stopAllServices();
        event.reply('services-status', { running: false });
      } catch (error) {
        console.error('Failed to stop services:', error);
        event.reply('services-status', { 
          running: true, 
          error: error.message 
        });
      }
    });

    // Check services status
    ipcMain.on('check-services-status', async (event) => {
      try {
        const running = this.services.pythonServer;
        event.reply('services-status', { running });
      } catch (error) {
        console.error('Failed to check services status:', error);
        event.reply('services-status', { 
          running: false, 
          error: error.message 
        });
      }
    });

    // Test specific module
    ipcMain.on('test-module', async (event, data) => {
      try {
        const { module, config } = data;
        console.log(`Testing module: ${module} with config:`, config);
        
        const startTime = Date.now();
        const result = await this.testModule(module, config);
        const duration = Date.now() - startTime;
        
        const testResult = {
          module,
          success: result.success,
          details: result.details,
          error: result.error,
          duration
        };
        
        // Store results
        this.testResults[module] = testResult;
        
        event.reply('test-result', testResult);
      } catch (error) {
        console.error(`Module test error for ${data.module}:`, error);
        event.reply('test-result', { 
          module: data.module,
          success: false,
          error: error.message,
          details: { error: error.message }
        });
      }
    });

    // Run all module tests
    ipcMain.on('run-all-tests', async (event, config) => {
      try {
        console.log('Running all module tests with config:', config);
        
        // Clear previous results
        this.testResults = {};
        
        // Test each module
        for (const module of Object.keys(this.modules)) {
          const startTime = Date.now();
          
          try {
            const result = await this.testModule(module, config);
            const duration = Date.now() - startTime;
            
            const testResult = {
              module,
              success: result.success,
              details: result.details,
              error: result.error,
              duration
            };
            
            // Store results
            this.testResults[module] = testResult;
            
            // Send result to renderer
            event.reply('test-result', testResult);
          } catch (error) {
            console.error(`Error testing module ${module}:`, error);
            
            const testResult = {
              module,
              success: false,
              error: error.message,
              details: { error: error.message },
              duration: Date.now() - startTime
            };
            
            // Store results
            this.testResults[module] = testResult;
            
            // Send result to renderer
            event.reply('test-result', testResult);
          }
        }
        
        // Determine overall success
        const allSuccess = Object.values(this.testResults)
          .every(result => result.success);
        
        // Send completion message
        event.reply('all-tests-complete', {
          success: allSuccess,
          summary: true
        });
        
        // Save results if requested
        if (config.save) {
          this.saveTestResults();
        }
      } catch (error) {
        console.error('Failed to run all tests:', error);
        event.reply('all-tests-complete', {
          success: false,
          error: error.message
        });
      }
    });

    // Export test results
    ipcMain.on('export-test-results', async (event, data) => {
      try {
        console.log('Exporting test results...');
        const path = await this.saveTestResults();
        event.reply('export-complete', { success: true, path });
      } catch (error) {
        console.error('Failed to export test results:', error);
        event.reply('export-complete', { 
          success: false, 
          error: error.message 
        });
      }
    });
  }

  /**
   * Start all required services for testing
   */
  async startAllServices() {
    try {
      // Start Python server
      await pythonBridge.startServer();
      this.services.pythonServer = true;
      
      // Future: Start IPFS node if needed
      
      return true;
    } catch (error) {
      console.error('Failed to start services:', error);
      throw error;
    }
  }

  /**
   * Stop all services
   */
  async stopAllServices() {
    try {
      // Stop Python server
      if (this.services.pythonServer) {
        await pythonBridge.stopServer();
        this.services.pythonServer = false;
      }
      
      // Future: Stop IPFS node if needed
      
      return true;
    } catch (error) {
      console.error('Failed to stop services:', error);
      throw error;
    }
  }

  /**
   * Test a specific module
   * @param {string} moduleId - Module identifier
   * @param {object} config - Test configuration
   * @returns {object} Test result
   */
  async testModule(moduleId, config) {
    try {
      console.log(`Testing module: ${moduleId}`);
      
      // Check if services are running
      if (!this.services.pythonServer && config.environment !== 'mock') {
        await this.startAllServices();
      }
      
      // Implement test functionality based on module
      switch (moduleId) {
        case 'ipfs-kit': 
          return await this.testIpfsKit(config);
        case 'model-manager':
          return await this.testModelManager(config);
        case 'transformers':
          return await this.testTransformers(config);
        case 'datasets':
          return await this.testDatasets(config);
        case 'accelerate':
          return await this.testAccelerate(config);
        case 'faiss':
          return await this.testFaiss(config);
        case 'agents':
          return await this.testAgents(config);
        case 'libp2p':
          return await this.testLibp2p(config);
        case 'orbitdb':
          return await this.testOrbitDb(config);
        case 'fireproofdb':
          return await this.testFireproofDB(config);
        case 'duckdb-ipld':
          return await this.testDuckDBIPLD(config);
        case 'embeddings':
          return await this.testEmbeddings(config);
        case 'auth':
          return await this.testAuth(config);
        case 'keystore':
          return await this.testKeystore(config);
        case 'auth-keystore':
          return await this.testAuthKeystore(config);
        case 'secure-faiss':
          return await this.testSecureFaiss(config);
        case 'security-integration':
          return await this.testSecurityIntegration(config);
        case 'auth-dashboard':
          return await this.testAuthDashboard(config);
        default:
          throw new Error(`Unknown module: ${moduleId}`);
      }
    } catch (error) {
      console.error(`Failed to test module ${moduleId}:`, error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Test IPFS Kit module
   */
  async testIpfsKit(config) {
    try {
      // Parse config
      const configObj = this.parseConfig(config);
      
      // Call actual test endpoint if not using mock
      if (config.environment !== 'mock') {
        try {
          // Import the IPFS Kit module
          const { ipfsKit } = await import('../node/ipfs_kit.js');
          
          // Run the tests
          console.log('Testing IPFS Kit with config:', configObj);
          
          // Initialize basic test results
          const results = {
            success: true,
            module: 'ipfs_kit',
            initialization: false,
            node_connection: false,
            content_operations: {
              add: false,
              get: false,
              pin: false
            },
            config_operations: false,
            daemon_operations: false
          };
          
          // Test initialization
          try {
            // Make sure IPFS is ready
            const readyResult = await ipfsKit.ipfsKitReady();
            results.node_connection = readyResult === true || 
                                     (typeof readyResult === 'object' && readyResult.ipfs === true);
            
            // If IPFS is not running, try to start it
            if (!results.node_connection) {
              console.log('IPFS not running, attempting to start...');
              await ipfsKit.ipfsKitStart();
              
              // Check again
              const readyAgain = await ipfsKit.ipfsKitReady();
              results.node_connection = readyAgain === true || 
                                       (typeof readyAgain === 'object' && readyAgain.ipfs === true);
              
              results.daemon_operations = results.node_connection;
            } else {
              results.daemon_operations = true;
            }
            
            // Consider initialization successful if we have a connection
            results.initialization = results.node_connection;
          } catch (e) {
            console.error('IPFS Kit initialization or connection test failed:', e);
            results.initialization = false;
            results.node_connection = false;
          }
          
          // Test config operations if we have a connection
          if (results.node_connection) {
            try {
              // Get config
              const configResult = await ipfsKit.ipfsGetConfig();
              
              // Test setting a config value
              if (configResult.ipfsGetConfig) {
                const testKey = 'Addresses.API';
                const originalValue = await ipfsKit.ipfsGetConfigValue(testKey);
                
                if (originalValue.ipfsGetConfigValue) {
                  // Set it back to the same value (non-destructive test)
                  const setValue = await ipfsKit.ipfsSetConfigValue(
                    testKey, 
                    originalValue.ipfsGetConfigValue
                  );
                  
                  results.config_operations = setValue.ipfsSetConfigValue !== null;
                }
              }
            } catch (e) {
              console.error('IPFS Kit config operations test failed:', e);
              results.config_operations = false;
            }
          }
          
          // Test content operations if we have a connection
          if (results.node_connection) {
            try {
              // Create a test file
              const fs = await import('fs');
              const path = await import('path');
              const os = await import('os');
              
              const testDir = path.join(os.tmpdir(), 'ipfs_kit_test');
              if (!fs.existsSync(testDir)) {
                fs.mkdirSync(testDir, { recursive: true });
              }
              
              const testFile = path.join(testDir, 'test.txt');
              fs.writeFileSync(testFile, 'Test content for IPFS Kit test');
              
              // Test upload
              const uploadResult = await ipfsKit.ipfsUploadObject(testFile);
              results.content_operations.add = uploadResult && 
                uploadResult.ipfsUploadObject && 
                uploadResult.ipfsUploadObject.results && 
                uploadResult.ipfsUploadObject.results.length > 0;
              
              // Get the CID from the upload result
              if (results.content_operations.add) {
                const uploadedCid = uploadResult.ipfsUploadObject.results[0].hash;
                
                // Test pinning
                const pinResult = await ipfsKit.ipfsAddPin(uploadedCid);
                results.content_operations.pin = pinResult && 
                  (pinResult.ipfsAddPin !== null || pinResult.ipfsClusterCtlAddPin !== null);
                
                // Test download
                const downloadPath = path.join(testDir, 'test_download.txt');
                const downloadResult = await ipfsKit.ipgetDownloadObject(uploadedCid, downloadPath);
                results.content_operations.get = downloadResult && 
                  downloadResult.ipgetDownloadObject && 
                  fs.existsSync(downloadPath);
                
                // Cleanup
                if (fs.existsSync(downloadPath)) {
                  fs.unlinkSync(downloadPath);
                }
              }
              
              // Cleanup
              if (fs.existsSync(testFile)) {
                fs.unlinkSync(testFile);
              }
              try {
                fs.rmdirSync(testDir);
              } catch (e) {
                // Ignore errors on cleanup
              }
            } catch (e) {
              console.error('IPFS Kit content operations test failed:', e);
              results.content_operations.add = false;
              results.content_operations.get = false;
              results.content_operations.pin = false;
            }
          }
          
          // Update overall success
          results.success = results.initialization && 
                           results.node_connection &&
                           (results.content_operations.add || 
                            results.content_operations.get || 
                            results.content_operations.pin) &&
                           results.config_operations;
                           
          return {
            success: results.success,
            details: results
          };
        } catch (error) {
          console.error('Error importing or testing IPFS Kit module:', error);
          
          // Fall back to HTTP API
          const response = await fetch(`${pythonBridge.serverUrl}/test_module/ipfs_kit`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(configObj),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Test failed');
          }
          
          const result = await response.json();
          return {
            success: result.success,
            details: result
          };
        }
      } else {
        // Mock test result
        return {
          success: true,
          details: {
            module: 'ipfs_kit',
            initialization: true,
            node_connection: true,
            content_operations: {
              add: true,
              get: true,
              pin: true
            },
            config_operations: true,
            daemon_operations: true,
            metadata: configObj.metadata
          }
        };
      }
    } catch (error) {
      console.error('IPFS Kit test error:', error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Test Model Manager module
   */
  async testModelManager(config) {
    try {
      // Parse config
      const configObj = this.parseConfig(config);
      
      // Call actual test endpoint if not using mock
      if (config.environment !== 'mock') {
        try {
          // Import the IPFS Model Manager module
          const { ipfsModelManager } = await import('../node/ipfs_model_manager.js');
          
          // Run the tests
          console.log('Testing IPFS Model Manager with config:', configObj);
          
          // Initialize basic test results
          const results = {
            success: true,
            module: 'model_manager',
            initialization: false,
            registry: false,
            list_models: false,
            imports: {
              huggingface: false,
              ipfs: false
            },
            capabilities: {
              huggingface: false,
              ipfs: false
            }
          };
          
          // Test initialization and basic functionality
          try {
            // Call the init method if available
            if (ipfsModelManager.init && typeof ipfsModelManager.init === 'function') {
              await ipfsModelManager.init();
              results.initialization = true;
            }
            
            // Test model listing if available
            if (ipfsModelManager.listModels && typeof ipfsModelManager.listModels === 'function') {
              const models = await ipfsModelManager.listModels();
              results.list_models = true;
              results.models = Array.isArray(models) ? models.slice(0, 5) : models;
            }
            
            // Check if the model manager can import from HuggingFace
            results.capabilities.huggingface = ipfsModelManager.importModelFromHuggingface !== undefined;
            
            // Check if the model manager can import from IPFS
            results.capabilities.ipfs = ipfsModelManager.importModelFromIpfs !== undefined;
            
            // Update overall success
            results.success = results.initialization;
            
            return {
              success: results.success,
              details: results
            };
          } catch (e) {
            console.error('Model Manager module test error:', e);
            results.success = false;
            results.error = e.message;
            
            return {
              success: false,
              details: results
            };
          }
        } catch (error) {
          console.error('Error importing or testing IPFS Model Manager module:', error);
          
          // Fall back to HTTP API
          const response = await fetch(`${pythonBridge.serverUrl}/test_module/model_manager`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(configObj),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Test failed');
          }
          
          const result = await response.json();
          return {
            success: result.success,
            details: result
          };
        }
      } else {
        // Mock test result
        return {
          success: true,
          details: {
            module: 'model_manager',
            initialization: true,
            registry: true,
            list_models: true,
            imports: {
              huggingface: true,
              ipfs: true
            },
            capabilities: {
              huggingface: true,
              ipfs: true
            },
            models: ['mock-model-1', 'mock-model-2'],
            metadata: configObj.metadata
          }
        };
      }
    } catch (error) {
      console.error('Model Manager test error:', error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Test Transformers module
   */
  async testTransformers(config) {
    try {
      // Parse config
      const configObj = this.parseConfig(config);
      
      // Call actual test endpoint if not using mock
      if (config.environment !== 'mock') {
        try {
          // Import the IPFS Transformers module
          const { ipfsTransformers } = await import('../node/ipfs_transformers.js');
          
          // Run the tests
          console.log('Testing IPFS Transformers with config:', configObj);
          
          // Initialize basic test results
          const results = {
            success: true,
            module: 'transformers',
            initialization: false,
            model_loading: false,
            inference: false,
            capabilities: {
              transformers: false,
              model_manager: false,
              torch: false,
              cuda: false
            },
            active_model: null,
            device: null
          };
          
          // Test initialization and basic functionality
          try {
            // Call the init method if available
            if (ipfsTransformers.init && typeof ipfsTransformers.init === 'function') {
              await ipfsTransformers.init();
              results.initialization = true;
            }
            
            // Test model loading if available
            if (ipfsTransformers.loadModel && typeof ipfsTransformers.loadModel === 'function') {
              // Use a small test model
              const testModel = configObj.metadata?.model || 'hf-internal-testing/tiny-random-bert';
              const loadResult = await ipfsTransformers.loadModel(testModel);
              results.model_loading = loadResult === true;
              results.active_model = testModel;
            }
            
            // Test inference if model was loaded
            if (results.model_loading && 
                ipfsTransformers.runInference && 
                typeof ipfsTransformers.runInference === 'function') {
              const inferenceResult = await ipfsTransformers.runInference('This is a test.');
              results.inference = inferenceResult && !inferenceResult.error;
              results.inference_result = inferenceResult;
            }
            
            // Check capabilities
            if (ipfsTransformers.device) {
              results.device = ipfsTransformers.device;
            }
            
            // Update overall success
            results.success = results.initialization && 
                              (results.model_loading || results.capabilities.transformers);
            
            return {
              success: results.success,
              details: results
            };
          } catch (e) {
            console.error('Transformers module test error:', e);
            results.success = false;
            results.error = e.message;
            
            return {
              success: false,
              details: results
            };
          }
        } catch (error) {
          console.error('Error importing or testing IPFS Transformers module:', error);
          
          // Fall back to HTTP API
          const response = await fetch(`${pythonBridge.serverUrl}/test_module/transformers`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(configObj),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Test failed');
          }
          
          const result = await response.json();
          return {
            success: result.success,
            details: result
          };
        }
      } else {
        // Mock test result
        return {
          success: true,
          details: {
            module: 'transformers',
            initialization: true,
            model_loading: true,
            inference: true,
            capabilities: {
              transformers: true,
              model_manager: true,
              torch: true,
              cuda: false
            },
            active_model: 'mock-bert-model',
            device: 'cpu',
            inference_result: {
              input: 'This is a test.',
              results: ["Mock inference output"]
            },
            metadata: configObj.metadata
          }
        };
      }
    } catch (error) {
      console.error('Transformers test error:', error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Test Datasets module
   */
  async testDatasets(config) {
    try {
      // Parse config
      const configObj = this.parseConfig(config);
      
      // Call actual test endpoint if not using mock
      if (config.environment !== 'mock') {
        try {
          // Import the IPFS Datasets module
          const { ipfsDatasets } = await import('../node/ipfs_datasets.js');
          
          // Run the tests
          console.log('Testing IPFS Datasets with config:', configObj);
          
          // Call the test method directly
          const testResults = await ipfsDatasets.test();
          
          // If the test method failed, try our own testing
          if (!testResults || testResults.error) {
            // Initialize basic test results
            const results = {
              success: true,
              module: 'datasets',
              initialization: false,
              registry: false,
              list_datasets: false,
              dataset_loading: false,
              sample_loading: false,
              ipfs_integration: false,
              capabilities: {
                huggingface_datasets: false,
                ipfs: false,
                ipfs_datasets_js: true
              }
            };
            
            // Test initialization
            try {
              if (ipfsDatasets.init && typeof ipfsDatasets.init === 'function') {
                const initResult = await ipfsDatasets.init();
                results.initialization = initResult;
              }
              
              // Test registry operations
              if (ipfsDatasets.loadRegistry && typeof ipfsDatasets.loadRegistry === 'function') {
                const regResult = await ipfsDatasets.loadRegistry();
                results.registry = regResult;
              }
              
              // Test listing datasets
              if (ipfsDatasets.listDatasets && typeof ipfsDatasets.listDatasets === 'function') {
                const datasets = await ipfsDatasets.listDatasets();
                results.list_datasets = typeof datasets === 'object';
              }
              
              // Update capabilities
              results.capabilities.ipfs = ipfsDatasets.ipfsKit !== null && ipfsDatasets.ipfsKit !== undefined;
              
              // Overall success
              results.success = results.initialization && results.registry && results.list_datasets;
              
              return {
                success: results.success,
                details: results
              };
            } catch (e) {
              console.error('IPFS Datasets testing error:', e);
              return {
                success: false,
                details: {
                  module: 'datasets',
                  error: e.message,
                  initialization: false,
                  registry: false,
                  list_datasets: false
                }
              };
            }
          }
          
          return {
            success: testResults.success,
            details: testResults
          };
        } catch (error) {
          console.error('Error importing or testing IPFS Datasets module:', error);
          
          // Fall back to HTTP API
          const response = await fetch(`${pythonBridge.serverUrl}/test_module/datasets`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(configObj),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Test failed');
          }
          
          const result = await response.json();
          return {
            success: result.success,
            details: result
          };
        }
      } else {
        // Mock test result
        return {
          success: true,
          details: {
            module: 'datasets',
            initialization: true,
            registry: true,
            list_datasets: true,
            dataset_loading: true,
            sample_loading: true,
            ipfs_integration: true,
            capabilities: {
              huggingface_datasets: true,
              ipfs: true,
              ipfs_datasets_js: true
            },
            samples: [
              { "text": "Mock dataset sample 1", "label": 1 },
              { "text": "Mock dataset sample 2", "label": 0 }
            ],
            metadata: configObj.metadata
          }
        };
      }
    } catch (error) {
      console.error('Datasets test error:', error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Test Accelerate module
   */
  async testAccelerate(config) {
    try {
      // Use the existing accelerate test if not in mock mode
      if (config.environment !== 'mock') {
        const result = await pythonBridge.test();
        return {
          success: result.success,
          details: result
        };
      } else {
        // Use mock test implementation
        const mockApp = new MockApp();
        const testResults = await mockApp.test();
        
        // Clean up the mock
        mockApp.cleanup();
        
        return {
          success: Object.values(testResults).every(result => result === true),
          details: testResults
        };
      }
    } catch (error) {
      console.error('Accelerate test error:', error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Test FAISS module
   */
  async testFaiss(config) {
    try {
      // Parse config
      const configObj = this.parseConfig(config);
      
      // Call actual test endpoint if not using mock
      if (config.environment !== 'mock') {
        const response = await fetch(`${pythonBridge.serverUrl}/test_module/faiss`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(configObj),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Test failed');
        }
        
        const result = await response.json();
        return {
          success: result.success,
          details: result
        };
      } else {
        // Mock test result
        return {
          success: true,
          details: {
            module: 'faiss',
            initialization: true,
            index_creation: true,
            search_test: true,
            metadata: configObj.metadata
          }
        };
      }
    } catch (error) {
      console.error('FAISS test error:', error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Test Agents module
   */
  async testAgents(config) {
    try {
      // Parse config
      const configObj = this.parseConfig(config);
      
      // Call actual test endpoint if not using mock
      if (config.environment !== 'mock') {
        const response = await fetch(`${pythonBridge.serverUrl}/test_module/agents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(configObj),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Test failed');
        }
        
        const result = await response.json();
        return {
          success: result.success,
          details: result
        };
      } else {
        // Mock test result
        return {
          success: true,
          details: {
            module: 'agents',
            initialization: true,
            agent_creation: true,
            agent_execution: true,
            metadata: configObj.metadata
          }
        };
      }
    } catch (error) {
      console.error('Agents test error:', error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Test libp2p module
   */
  async testLibp2p(config) {
    try {
      // Parse config
      const configObj = this.parseConfig(config);
      
      // Call actual test endpoint if not using mock
      if (config.environment !== 'mock') {
        const response = await fetch(`${pythonBridge.serverUrl}/test_module/libp2p`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(configObj),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Test failed');
        }
        
        const result = await response.json();
        return {
          success: result.success,
          details: result
        };
      } else {
        // Mock test result
        return {
          success: true,
          details: {
            module: 'libp2p',
            initialization: true,
            peer_connection: true,
            messaging: true,
            metadata: configObj.metadata
          }
        };
      }
    } catch (error) {
      console.error('libp2p test error:', error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Test OrbitDB module
   */
  async testOrbitDb(config) {
    try {
      // Parse config
      const configObj = this.parseConfig(config);
      
      // Call actual test endpoint if not using mock
      if (config.environment !== 'mock') {
        const response = await fetch(`${pythonBridge.serverUrl}/test_module/orbitdb`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(configObj),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Test failed');
        }
        
        const result = await response.json();
        return {
          success: result.success,
          details: result
        };
      } else {
        // Mock test result
        return {
          success: true,
          details: {
            module: 'orbitdb',
            initialization: true,
            database_creation: true,
            data_operations: true,
            metadata: configObj.metadata
          }
        };
      }
    } catch (error) {
      console.error('OrbitDB test error:', error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }
  
  /**
   * Test Embeddings module
   */
  async testEmbeddings(config) {
    try {
      // Parse config
      const configObj = this.parseConfig(config);
      
      // Call actual test endpoint if not using mock
      if (config.environment !== 'mock') {
        try {
          // Import the IPFS Embeddings module
          const { ipfsEmbeddings } = await import('../node/ipfs_embeddings.js');
          
          // Run the tests
          console.log('Testing IPFS Embeddings with config:', configObj);
          
          // Call the test method directly
          const testResults = await ipfsEmbeddings.test();
          
          return {
            success: testResults.success,
            details: testResults
          };
        } catch (error) {
          console.error('Error importing or testing IPFS Embeddings module:', error);
          
          // Fall back to HTTP API
          const response = await fetch(`${pythonBridge.serverUrl}/test_module/embeddings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(configObj),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Test failed');
          }
          
          const result = await response.json();
          return {
            success: result.success,
            details: result
          };
        }
      } else {
        // Mock test result
        return {
          success: true,
          details: {
            module: 'embeddings',
            initialization: true,
            embedding_generation: true,
            similarity_comparison: true,
            search: true,
            capabilities: {
              has_package: true,
              using_mock: true
            },
            metadata: configObj.metadata
          }
        };
      }
    } catch (error) {
      console.error('Embeddings test error:', error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }
  
  /**
   * Test FireproofDB module
   */
  async testFireproofDB(config) {
    try {
      // Parse config
      const configObj = this.parseConfig(config);
      
      // Call actual test endpoint if not using mock
      if (config.environment !== 'mock') {
        try {
          // Import the secure FireproofDB manager
          const { secureFireproofdbManager } = await import('../node/secure_fireproofdb_manager.js');
          
          // Run the tests
          console.log('Testing Secure FireproofDB Manager with config:', configObj);
          
          // Call the test method directly
          const testResults = await secureFireproofdbManager.test();
          
          return {
            success: testResults.success,
            details: testResults
          };
        } catch (error) {
          console.error('Error importing or testing Secure FireproofDB Manager:', error);
          
          // Fall back to HTTP API
          const response = await fetch(`${pythonBridge.serverUrl}/test_module/fireproofdb`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(configObj),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Test failed');
          }
          
          const result = await response.json();
          return {
            success: result.success,
            details: result
          };
        }
      } else {
        // Mock test result
        return {
          success: true,
          details: {
            module: 'secure_fireproofdb_manager',
            initialization: true,
            capability_verification: true,
            database_operations: {
              create: true,
              delete: true,
              write: true,
              read: true,
              query: true,
              export: true,
              import: true,
              sync: true
            },
            stats_tracking: true,
            metadata: configObj.metadata
          }
        };
      }
    } catch (error) {
      console.error('FireproofDB test error:', error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }
  
  /**
   * Test DuckDB-IPLD module
   */
  async testDuckDBIPLD(config) {
    try {
      // Parse config
      const configObj = this.parseConfig(config);
      
      // Call actual test endpoint if not using mock
      if (config.environment !== 'mock') {
        try {
          // Import the secure DuckDB-IPLD manager
          const { secureDuckDBIPLDManager } = await import('../node/secure_duckdb_ipld_manager.js');
          
          // Run the tests
          console.log('Testing Secure DuckDB-IPLD Manager with config:', configObj);
          
          // Call the test method directly
          const testResults = await secureDuckDBIPLDManager.test();
          
          return {
            success: testResults.success,
            details: testResults
          };
        } catch (error) {
          console.error('Error importing or testing Secure DuckDB-IPLD Manager:', error);
          
          // Fall back to HTTP API
          const response = await fetch(`${pythonBridge.serverUrl}/test_module/duckdb_ipld`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(configObj),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Test failed');
          }
          
          const result = await response.json();
          return {
            success: result.success,
            details: result
          };
        }
      } else {
        // Mock test result
        return {
          success: true,
          details: {
            module: 'secure_duckdb_ipld_manager',
            initialization: true,
            capability_verification: true,
            sql_operations: {
              execute: true,
              prepare: true
            },
            data_operations: {
              ipld_export: true,
              ipld_import: true,
              parquet_export: true,
              arrow_integration: true
            },
            stats_tracking: true,
            metadata: configObj.metadata
          }
        };
      }
    } catch (error) {
      console.error('DuckDB-IPLD test error:', error);
      return {
        success: false,
        error: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Parse configuration from string or object
   */
  parseConfig(config) {
    if (typeof config === 'string') {
      try {
        return JSON.parse(config);
      } catch (error) {
        console.error('Failed to parse config:', error);
        return {};
      }
    }
    return config;
  }

  /**
   * Save test results to JSON file
   */
  async saveTestResults() {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const fileName = `test_results_${timestamp}.json`;
      const filePath = path.join(process.cwd(), 'test', 'results', fileName);
      
      // Create directory if it doesn't exist
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Save results to file
      fs.writeFileSync(
        filePath, 
        JSON.stringify(this.testResults, null, 2), 
        'utf8'
      );
      
      console.log(`Test results saved to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('Failed to save test results:', error);
      throw error;
    }
  }
}

const testHandler = new ModuleTestHandler();

// Import security modules
import authManager from './auth.js';
import keystore from './keystore.js';
import authKeystoreIntegration from './auth_keystore_integration.js';
import secureFaissManager from './secure_faiss_manager.js';
import testSecurityIntegration from './test_security_integration.js';

/**
 * Test Auth module
 */
ModuleTestHandler.prototype.testAuth = async function(config) {
  try {
    // Parse config
    const configObj = this.parseConfig(config);
    
    // Call actual test endpoint if not using mock
    if (config.environment !== 'mock') {
      try {
        // Ensure auth manager is initialized
        if (!authManager.initialized) {
          await authManager.init();
        }
        
        // Run the test method directly
        const testResults = await authManager.test();
        
        return {
          success: testResults.success,
          details: testResults
        };
      } catch (error) {
        console.error('Error testing Auth module:', error);
        return {
          success: false,
          error: error.message,
          details: { 
            error: error.message,
            module: 'auth'
          }
        };
      }
    } else {
      // Mock test result
      return {
        success: true,
        details: {
          module: 'auth',
          initialization: true,
          principal_creation: true,
          capability_issuance: true,
          capability_verification: true,
          capability_revocation: true,
          capability: {
            ucan_available: false
          },
          metadata: configObj.metadata
        }
      };
    }
  } catch (error) {
    console.error('Auth test error:', error);
    return {
      success: false,
      error: error.message,
      details: { error: error.message }
    };
  }
};

/**
 * Test Keystore module
 */
ModuleTestHandler.prototype.testKeystore = async function(config) {
  try {
    // Parse config
    const configObj = this.parseConfig(config);
    
    // Call actual test endpoint if not using mock
    if (config.environment !== 'mock') {
      try {
        // Ensure keystore is initialized
        if (!keystore.initialized) {
          await keystore.init();
        }
        
        // Run the test method directly
        const testResults = await keystore.test();
        
        return {
          success: testResults.success,
          details: testResults
        };
      } catch (error) {
        console.error('Error testing Keystore module:', error);
        return {
          success: false,
          error: error.message,
          details: { 
            error: error.message,
            module: 'keystore'
          }
        };
      }
    } else {
      // Mock test result
      return {
        success: true,
        details: {
          module: 'keystore',
          initialization: true,
          key_operations: {
            set: true,
            get: true,
            info: true,
            delete: true,
            rotate: true
          },
          persistence: true,
          metadata: configObj.metadata
        }
      };
    }
  } catch (error) {
    console.error('Keystore test error:', error);
    return {
      success: false,
      error: error.message,
      details: { error: error.message }
    };
  }
};

/**
 * Test Auth-Keystore Integration module
 */
ModuleTestHandler.prototype.testAuthKeystore = async function(config) {
  try {
    // Parse config
    const configObj = this.parseConfig(config);
    
    // Call actual test endpoint if not using mock
    if (config.environment !== 'mock') {
      try {
        // Ensure integration is initialized
        if (!authKeystoreIntegration.initialized) {
          await authKeystoreIntegration.init();
        }
        
        // Run the test method directly
        const testResults = await authKeystoreIntegration.test();
        
        return {
          success: testResults.success,
          details: testResults
        };
      } catch (error) {
        console.error('Error testing Auth-Keystore Integration module:', error);
        return {
          success: false,
          error: error.message,
          details: { 
            error: error.message,
            module: 'auth_keystore_integration'
          }
        };
      }
    } else {
      // Mock test result
      return {
        success: true,
        details: {
          module: 'auth_keystore_integration',
          initialization: true,
          capabilities: true,
          authorized_operations: {
            get_key: true,
            set_key: true,
            delete_key: true,
            list_providers: true,
            get_info: true,
            rotate_key: true,
            issue_capability: true
          },
          metadata: configObj.metadata
        }
      };
    }
  } catch (error) {
    console.error('Auth-Keystore Integration test error:', error);
    return {
      success: false,
      error: error.message,
      details: { error: error.message }
    };
  }
};

/**
 * Test Secure FAISS Manager module
 */
ModuleTestHandler.prototype.testSecureFaiss = async function(config) {
  try {
    // Parse config
    const configObj = this.parseConfig(config);
    
    // Call actual test endpoint if not using mock
    if (config.environment !== 'mock') {
      try {
        // Ensure secure FAISS manager is initialized
        if (!secureFaissManager.initialized) {
          await secureFaissManager.init();
        }
        
        // Run the test method directly
        const testResults = await secureFaissManager.test();
        
        return {
          success: testResults.success,
          details: testResults
        };
      } catch (error) {
        console.error('Error testing Secure FAISS Manager module:', error);
        return {
          success: false,
          error: error.message,
          details: { 
            error: error.message,
            module: 'secure_faiss_manager'
          }
        };
      }
    } else {
      // Mock test result
      return {
        success: true,
        details: {
          module: 'secure_faiss_manager',
          initialization: true,
          capability_verification: true,
          index_operations: {
            create: true,
            add: true, 
            search: true,
            save: true,
            load: true,
            list: true
          },
          stats_tracking: true,
          metadata: configObj.metadata
        }
      };
    }
  } catch (error) {
    console.error('Secure FAISS Manager test error:', error);
    return {
      success: false,
      error: error.message,
      details: { error: error.message }
    };
  }
};

/**
 * Test Security Integration
 */
ModuleTestHandler.prototype.testSecurityIntegration = async function(config) {
  try {
    // Parse config
    const configObj = this.parseConfig(config);
    
    // Call actual test endpoint if not using mock
    if (config.environment !== 'mock') {
      try {
        // Run the security integration test
        const testResults = await testSecurityIntegration();
        
        return {
          success: testResults.success,
          details: testResults
        };
      } catch (error) {
        console.error('Error testing Security Integration:', error);
        return {
          success: false,
          error: error.message,
          details: { 
            error: error.message,
            module: 'security_integration'
          }
        };
      }
    } else {
      // Mock test result
      return {
        success: true,
        details: {
          module: 'security_integration',
          results: {
            auth_manager: true,
            keystore: true,
            auth_keystore_integration: true,
            auth_dashboard: true,
            api_key_flow: true
          },
          implementation_details: {
            auth_using_external: false,
            keystore_using_external: false,
            integration_using_external: false
          },
          message: 'Security integration tests passed successfully',
          metadata: configObj.metadata
        }
      };
    }
  } catch (error) {
    console.error('Security Integration test error:', error);
    return {
      success: false,
      error: error.message,
      details: { error: error.message }
    };
  }
};

/**
 * Test Auth Dashboard
 */
ModuleTestHandler.prototype.testAuthDashboard = async function(config) {
  try {
    // Parse config
    const configObj = this.parseConfig(config);
    
    // Call actual test endpoint if not using mock
    if (config.environment !== 'mock') {
      try {
        // Import the test function for the auth dashboard
        const testAuthDashboard = await import('./dashboard/test_auth_dashboard.js');
        
        // Run the auth dashboard test
        const testResults = await testAuthDashboard.default();
        
        return {
          success: testResults.success,
          details: testResults
        };
      } catch (error) {
        console.error('Error testing Auth Dashboard:', error);
        return {
          success: false,
          error: error.message,
          details: { 
            error: error.message,
            module: 'auth_dashboard'
          }
        };
      }
    } else {
      // Mock test result
      return {
        success: true,
        details: {
          module: 'auth_dashboard',
          component_initialization: true,
          integration: {
            auth_manager: true,
            keystore: true,
            auth_keystore: true
          },
          message: 'Auth dashboard component successfully tested with integration layers',
          metadata: configObj.metadata
        }
      };
    }
  } catch (error) {
    console.error('Auth Dashboard test error:', error);
    return {
      success: false,
      error: error.message,
      details: { error: error.message }
    };
  }
};

export default testHandler;
