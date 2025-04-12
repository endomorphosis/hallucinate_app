/**
 * IPFS Kit Client
 * 
 * This module provides a client for communicating with the IPFS Kit Bridge
 * Python process. It handles process management, error handling, and
 * provides a JavaScript API for accessing IPFS Kit functionality.
 */

const path = require('path');
const { spawn } = require('child_process');
const zerorpc = require('zerorpc');
const fs = require('fs');
const { EventEmitter } = require('events');

/**
 * IPFS Kit Client class
 * 
 * Handles communication with the IPFS Kit Bridge Python process
 */
class IPFSKitClient extends EventEmitter {
  /**
   * Create a new IPFS Kit Client
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    super();
    
    this.options = {
      pythonPath: options.pythonPath || 'python',
      scriptPath: options.scriptPath || path.join(__dirname, '..', 'python', 'hallucinate_app', 'ipfs_kit_bridge.py'),
      port: options.port || 4242,
      autoStart: options.autoStart !== false,
      timeout: options.timeout || 30000,
      configPath: options.configPath || null,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      debug: options.debug || false,
      ...options
    };
    
    this.process = null;
    this.client = null;
    this.connected = false;
    this.starting = false;
    this.stopping = false;
    this.retryCount = 0;
    
    // Initialize connection counters and timestamps
    this._stats = {
      operations: 0,
      errors: 0,
      lastOperationTime: null,
      startTime: null,
      connectTime: null
    };
    
    // Initialize immediately if autoStart is true
    if (this.options.autoStart) {
      this.start();
    }
  }
  
  /**
   * Start the IPFS Kit Bridge process and connect to it
   * @returns {Promise<boolean>} True if successfully started
   */
  async start() {
    if (this.connected || this.starting) {
      return true;
    }
    
    this.starting = true;
    this._stats.startTime = Date.now();
    
    try {
      // Start the Python process
      await this._startProcess();
      
      // Create ZeroRPC client
      await this._connectClient();
      
      // Verify connection with ping
      const pong = await this.ping();
      if (!pong || pong.status !== 'ok') {
        throw new Error('Failed to ping IPFS Kit Bridge');
      }
      
      this.connected = true;
      this.starting = false;
      this._stats.connectTime = Date.now();
      this.emit('connected');
      
      if (this.options.debug) {
        console.log('IPFS Kit Bridge connected successfully');
      }
      
      return true;
    } catch (error) {
      this.starting = false;
      this.emit('error', error);
      
      if (this.retryCount < this.options.retryAttempts) {
        this.retryCount++;
        console.warn(`Connection failed, retrying (${this.retryCount}/${this.options.retryAttempts})...`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
        return this.start();
      }
      
      console.error('Failed to start IPFS Kit Bridge:', error.message);
      throw error;
    }
  }
  
  /**
   * Start the Python process for the IPFS Kit Bridge
   * @private
   */
  _startProcess() {
    return new Promise((resolve, reject) => {
      // Check if script exists
      if (!fs.existsSync(this.options.scriptPath)) {
        return reject(new Error(`IPFS Kit Bridge script not found: ${this.options.scriptPath}`));
      }
      
      // Build command arguments
      const args = [
        this.options.scriptPath,
        '--port', this.options.port.toString()
      ];
      
      if (this.options.configPath) {
        args.push('--config', this.options.configPath);
      }
      
      if (this.options.debug) {
        console.log(`Starting IPFS Kit Bridge: ${this.options.pythonPath} ${args.join(' ')}`);
      }
      
      // Spawn process
      this.process = spawn(this.options.pythonPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Handle process events
      this.process.stdout.on('data', (data) => {
        if (this.options.debug) {
          console.log(`[IPFS Kit Bridge] ${data.toString().trim()}`);
        }
        this.emit('stdout', data.toString());
        
        // Check for ready message
        if (data.toString().includes('Starting IPFS Kit Bridge server on port')) {
          resolve();
        }
      });
      
      this.process.stderr.on('data', (data) => {
        console.error(`[IPFS Kit Bridge ERROR] ${data.toString().trim()}`);
        this.emit('stderr', data.toString());
      });
      
      this.process.on('error', (error) => {
        console.error('Failed to start IPFS Kit Bridge process:', error);
        this.emit('process_error', error);
        reject(error);
      });
      
      this.process.on('exit', (code, signal) => {
        if (code !== 0 && !this.stopping) {
          console.error(`IPFS Kit Bridge process exited with code ${code} and signal ${signal}`);
          this.emit('process_exit', { code, signal });
        }
        
        this.process = null;
        this.connected = false;
        
        if (!this.stopping) {
          // Automatically attempt to reconnect if not stopping intentionally
          this._handleDisconnect();
        }
      });
      
      // Set a timeout for startup
      const startupTimeout = setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Timeout waiting for IPFS Kit Bridge to start'));
        }
      }, 10000);
      
      // Clear timeout on success
      this.once('connected', () => clearTimeout(startupTimeout));
      
      // Watch for stdout to indicate server started
      let outputBuffer = '';
      const stdoutListener = (data) => {
        outputBuffer += data.toString();
        if (outputBuffer.includes('Starting IPFS Kit Bridge server on port')) {
          // Give the server a moment to start listening
          setTimeout(resolve, 500);
          this.process.stdout.removeListener('data', stdoutListener);
        }
      };
      
      this.process.stdout.on('data', stdoutListener);
    });
  }
  
  /**
   * Connect the ZeroRPC client to the IPFS Kit Bridge
   * @private
   */
  _connectClient() {
    return new Promise((resolve, reject) => {
      try {
        // Create client
        this.client = new zerorpc.Client({
          timeout: this.options.timeout,
          heartbeatInterval: 5000
        });
        
        // Connect to server
        this.client.connect(`tcp://localhost:${this.options.port}`);
        
        // Set up error handling
        this.client.on('error', (error) => {
          if (!this.stopping) {
            console.error('ZeroRPC client error:', error);
            this.emit('client_error', error);
            this._handleDisconnect();
          }
        });
        
        // Check connection
        setTimeout(() => {
          this.client.invoke('ping', (error, result) => {
            if (error) {
              return reject(error);
            }
            resolve();
          });
        }, 1000);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Handle disconnect event and try to reconnect
   * @private
   */
  _handleDisconnect() {
    if (this.stopping || this.starting) {
      return;
    }
    
    this.connected = false;
    this.emit('disconnected');
    
    // Clean up resources
    if (this.client) {
      try {
        this.client.close();
      } catch (error) {
        // Ignore errors during cleanup
      }
      this.client = null;
    }
    
    // Try to restart if not stopping intentionally
    if (!this.stopping) {
      console.warn('IPFS Kit Bridge disconnected, attempting to reconnect...');
      setTimeout(() => this.start(), 2000);
    }
  }
  
  /**
   * Stop the IPFS Kit Bridge process and client
   */
  async stop() {
    if (!this.connected || this.stopping) {
      return;
    }
    
    this.stopping = true;
    
    try {
      // Try to shut down gracefully
      if (this.client) {
        try {
          await this._invoke('shutdown');
        } catch (error) {
          // Ignore errors during shutdown
        }
        
        this.client.close();
        this.client = null;
      }
      
      // Kill process if still running
      if (this.process) {
        this.process.kill();
        this.process = null;
      }
      
      this.connected = false;
      this.stopping = false;
      this.emit('stopped');
      
      if (this.options.debug) {
        console.log('IPFS Kit Bridge stopped successfully');
      }
    } catch (error) {
      this.stopping = false;
      console.error('Error stopping IPFS Kit Bridge:', error);
      throw error;
    }
  }
  
  /**
   * Invoke a method on the IPFS Kit Bridge
   * @private
   * @param {string} method Method name
   * @param {...any} args Method arguments
   * @returns {Promise<any>} Method result
   */
  _invoke(method, ...args) {
    if (!this.connected) {
      return Promise.reject(new Error('IPFS Kit Bridge not connected'));
    }
    
    this._stats.operations++;
    this._stats.lastOperationTime = Date.now();
    
    return new Promise((resolve, reject) => {
      this.client.invoke(method, ...args, (error, result) => {
        if (error) {
          this._stats.errors++;
          return reject(error);
        }
        resolve(result);
      });
    });
  }
  
  /**
   * Ping the IPFS Kit Bridge
   * @returns {Promise<Object>} Ping response
   */
  async ping() {
    return this._invoke('ping');
  }
  
  /**
   * Get detailed status of the IPFS Kit Bridge
   * @returns {Promise<Object>} Status information
   */
  async getStatus() {
    const status = await this._invoke('get_status');
    
    // Add client-side stats
    return {
      ...status,
      client: {
        connected: this.connected,
        operations: this._stats.operations,
        errors: this._stats.errors,
        uptime: this._stats.startTime ? (Date.now() - this._stats.startTime) / 1000 : 0,
        lastOperationTime: this._stats.lastOperationTime
      }
    };
  }
  
  /**
   * Execute a command on the IPFS Kit Bridge
   * @param {string} command Command name
   * @param {Object} params Command parameters
   * @returns {Promise<Object>} Command result
   */
  async executeCommand(command, params = {}) {
    return this._invoke('execute_command', command, params);
  }
  
  /**
   * Query the metadata index
   * @param {Object} query Query parameters
   * @returns {Promise<Object>} Query results
   */
  async metadataQuery(query = {}) {
    return this._invoke('metadata_query', query);
  }
  
  /**
   * Get metadata for a specific CID
   * @param {string} cid Content ID
   * @returns {Promise<Object>} Metadata for the CID
   */
  async getMetadataForCid(cid) {
    return this._invoke('get_metadata_for_cid', cid);
  }
  
  /**
   * Get metadata for a specific path
   * @param {string} path Virtual filesystem path
   * @returns {Promise<Object>} Metadata for the path
   */
  async getMetadataForPath(path) {
    return this._invoke('get_metadata_for_path', path);
  }
  
  /**
   * Add a new entry to the metadata index
   * @param {Object} entry Metadata entry (must include cid)
   * @returns {Promise<Object>} Result of the operation
   */
  async addMetadataEntry(entry) {
    return this._invoke('add_metadata_entry', entry);
  }
  
  /**
   * Update an existing metadata entry
   * @param {string} cid CID of the entry to update
   * @param {Object} updates Metadata fields to update
   * @returns {Promise<Object>} Result of the operation
   */
  async updateMetadataEntry(cid, updates) {
    return this._invoke('update_metadata_entry', cid, updates);
  }
  
  /**
   * Delete a metadata entry
   * @param {string} cid CID of the entry to delete
   * @returns {Promise<Object>} Result of the operation
   */
  async deleteMetadataEntry(cid) {
    return this._invoke('delete_metadata_entry', cid);
  }
  
  /**
   * Get statistics about the metadata index
   * @returns {Promise<Object>} Statistics about the metadata index
   */
  async getMetadataStats() {
    return this._invoke('get_metadata_stats');
  }
  
  /**
   * Export the metadata index to a file
   * @param {string} format Export format ('parquet', 'json', or 'csv')
   * @param {string} path Path to save the export (optional)
   * @returns {Promise<Object>} Result of the operation
   */
  async exportMetadataIndex(format = "parquet", path = null) {
    return this._invoke('export_metadata_index', format, path);
  }
  
  /**
   * Run tests for the specified module
   * @param {string} moduleName Module name
   * @param {Array<string>} testNames Specific tests to run
   * @returns {Promise<Object>} Test results
   */
  async runTests(moduleName = null, testNames = null) {
    return this._invoke('run_tests', moduleName, testNames);
  }
  
  /**
   * High-level API methods
   * These methods map directly to IPFSSimpleAPI methods
   */
  
  /**
   * Add content to IPFS
   * @param {string|Buffer|Object} content Content to add
   * @param {Object} options Add options
   * @returns {Promise<Object>} Add result
   */
  async add(content, options = {}) {
    const result = await this.executeCommand('add', {
      content,
      ...options
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to add content to IPFS');
    }
    
    return result.result;
  }
  
  /**
   * Get content from IPFS
   * @param {string} cid Content ID
   * @param {Object} options Get options
   * @returns {Promise<Buffer>} Content data
   */
  async get(cid, options = {}) {
    const result = await this.executeCommand('get', {
      cid,
      ...options
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get content from IPFS');
    }
    
    return result.result;
  }
  
  /**
   * List directory contents in IPFS
   * @param {string} cid Content ID
   * @param {Object} options List options
   * @returns {Promise<Array>} Directory contents
   */
  async ls(cid, options = {}) {
    const result = await this.executeCommand('ls', {
      cid,
      ...options
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to list directory contents');
    }
    
    return result.result;
  }
  
  /**
   * Pin content to IPFS
   * @param {string} cid Content ID
   * @param {Object} options Pin options
   * @returns {Promise<Object>} Pin result
   */
  async pin(cid, options = {}) {
    const result = await this.executeCommand('pin', {
      cid,
      ...options
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to pin content');
    }
    
    return result.result;
  }
  
  /**
   * Unpin content from IPFS
   * @param {string} cid Content ID
   * @param {Object} options Unpin options
   * @returns {Promise<Object>} Unpin result
   */
  async unpin(cid, options = {}) {
    const result = await this.executeCommand('unpin', {
      cid,
      ...options
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to unpin content');
    }
    
    return result.result;
  }
  
  /**
   * List pins in IPFS
   * @param {Object} options List pins options
   * @returns {Promise<Object>} List pins result
   */
  async listPins(options = {}) {
    const result = await this.executeCommand('list_pins', options);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to list pins');
    }
    
    return result.result;
  }
  
  /**
   * Check if IPFS Kit is available
   * @returns {Promise<boolean>} True if IPFS Kit is available
   */
  async isIpfsKitAvailable() {
    try {
      const status = await this.getStatus();
      return status.has_ipfs_kit && status.initialized;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Check if the IPFS Kit client is running
   * @returns {Promise<boolean>} True if the client is running
   */
  async isRunning() {
    try {
      await this.ping();
      return this.connected;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get IPFS node information
   * @returns {Promise<Object>} Node information
   */
  async getNodeInfo() {
    const result = await this.executeCommand('id');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get node info');
    }
    
    return result.result;
  }
  
  /**
   * Get IPFS version information
   * @returns {Promise<string>} IPFS version string
   */
  async getVersion() {
    const result = await this.executeCommand('version');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get version');
    }
    
    return result.result.version || result.result;
  }
  
  /**
   * Get IPFS stats (repo size, etc.)
   * @returns {Promise<Object>} IPFS statistics
   */
  async getStats() {
    const result = await this.executeCommand('stats');
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get IPFS stats');
    }
    
    return result.result;
  }
  
  /**
   * Get the status of all IPFS Kit modules
   * @returns {Promise<Object>} Module status information
   */
  async getModuleStatus() {
    try {
      // Get status from IPFS Kit Bridge
      const status = await this.getStatus();
      
      // Extract module status from metadata index availability
      const moduleStatus = {
        ipfs_kit: {
          available: status.has_ipfs_kit && status.initialized,
          version: status.node_info?.version || 'unknown'
        },
        metadata_index: {
          available: status.metadata_index_enabled,
          version: 'N/A'
        }
      };
      
      // Add additional modules if available
      if (status.modules) {
        Object.assign(moduleStatus, status.modules);
      }
      
      return moduleStatus;
    } catch (error) {
      console.error('Error getting module status:', error);
      return {};
    }
  }
  
  /**
   * Test a specific IPFS Kit module
   * @param {string} moduleId Module identifier
   * @returns {Promise<Object>} Test results
   */
  async testModule(moduleId) {
    return this.runTests(moduleId);
  }
}

module.exports = IPFSKitClient;
// For ES modules
export { IPFSKitClient };