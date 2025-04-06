/**
 * Database Backup Bridge
 * 
 * Provides a JavaScript interface to the Python DatabaseBackupManager
 * Enables IPFS-based database backup and restore with PyArrow content index integration
 * 
 * Features:
 * - IPFS-based backup and restore for multiple database types
 * - PyArrow content index integration for metadata tracking
 * - UCAN authentication for secure operations
 * - Progress tracking with event-based feedback
 * - Scheduled backup automation
 */

import path from 'path';
import os from 'os';
import fs from 'fs';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Import metrics collector for observability
import MetricsCollector from './dashboard/observability/metrics_collector.js';
import { getMetricsRegistry } from './dashboard/observability/metrics_registry.js';

// Import python bridge utility if available
let pythonBridge;
try {
  pythonBridge = await import('./python_bridge.js');
} catch (err) {
  console.warn('Python bridge not available, some functionality may be limited');
}

/**
 * Database Backup Bridge
 * 
 * Connects to the Python DatabaseBackupManager for database backup functionality
 */
class DatabaseBackupBridge extends EventEmitter {
  /**
   * Create a new database backup bridge
   * 
   * @param {Object} options - Configuration options
   * @param {Object} options.resources - Resource pool
   * @param {Object} options.metadata - Metadata for configuration
   */
  constructor(options = {}) {
    super();
    
    this.options = Object.assign({
      pythonPath: process.env.PYTHON_PATH || 'python',
      resourceTimeout: 30000, // 30 seconds
      autoInit: true,
      retry: {
        maxRetries: 3,
        delay: 1000
      }
    }, options);
    
    this.resources = this.options.resources || {};
    this.metadata = this.options.metadata || {};
    
    // Default backup directory
    if (!this.metadata.backup_dir) {
      this.metadata.backup_dir = path.join(os.homedir(), '.hallucinate_app', 'backups');
    }
    
    // Default temp directory
    if (!this.metadata.temp_dir) {
      this.metadata.temp_dir = path.join(os.homedir(), '.hallucinate_app', 'temp');
    }
    
    // Ensure directories exist
    this._ensureDirectories([
      this.metadata.backup_dir,
      this.metadata.temp_dir
    ]);
    
    // Setup bridge connection
    this._pythonProcess = null;
    this._initPromise = null;
    this._requestId = 0;
    this._pendingRequests = new Map();
    this._initialized = false;
    
    // Set up metrics collector for observability
    this.metricsCollector = new MetricsCollector({
      component: 'database_backup_bridge',
      registry: getMetricsRegistry()
    });
    
    // Initialize metrics
    this._initializeMetrics();
    
    // Track in-progress operations
    this.inProgressOperations = new Map();
    
    // Automatically initialize if requested
    if (this.options.autoInit) {
      this.init().catch(err => {
        console.error('Failed to initialize DatabaseBackupBridge:', err);
        this.metricsCollector.recordError('initialization', 'init', err);
      });
    }
  }
  
  /**
   * Initialize metrics for tracking backup operations
   * @private
   */
  _initializeMetrics() {
    // Create counters for operations
    this.metricsCollector.createCounter('backups_total', 'Total number of backup operations', ['db_type', 'status']);
    this.metricsCollector.createCounter('restores_total', 'Total number of restore operations', ['db_type', 'status']);
    this.metricsCollector.createCounter('schedule_operations_total', 'Total number of schedule operations', ['operation']);
    this.metricsCollector.createCounter('errors_total', 'Total number of errors', ['operation', 'error_type']);
    
    // Create gauges for tracking current state
    this.metricsCollector.createGauge('backups_in_progress', 'Number of backup operations in progress', ['db_type']);
    this.metricsCollector.createGauge('restores_in_progress', 'Number of restore operations in progress', ['db_type']);
    this.metricsCollector.createGauge('total_backups', 'Total number of stored backups', ['db_type']);
    this.metricsCollector.createGauge('total_scheduled_backups', 'Total number of scheduled backups');
    
    // Create histograms for tracking durations and sizes
    this.metricsCollector.createHistogram('backup_duration_seconds', 'Duration of backup operations in seconds', ['db_type']);
    this.metricsCollector.createHistogram('restore_duration_seconds', 'Duration of restore operations in seconds', ['db_type']);
    this.metricsCollector.createHistogram('backup_size_bytes', 'Size of backup data in bytes', ['db_type']);
    
    // Set initial values
    this.metricsCollector.setGauge('backups_in_progress', 0, { db_type: 'orbitdb' });
    this.metricsCollector.setGauge('backups_in_progress', 0, { db_type: 'fireproofdb' });
    this.metricsCollector.setGauge('backups_in_progress', 0, { db_type: 'duckdb' });
    this.metricsCollector.setGauge('restores_in_progress', 0, { db_type: 'orbitdb' });
    this.metricsCollector.setGauge('restores_in_progress', 0, { db_type: 'fireproofdb' });
    this.metricsCollector.setGauge('restores_in_progress', 0, { db_type: 'duckdb' });
  }
  
  /**
   * Initialize the bridge connection to the Python module
   * 
   * @returns {Promise<boolean>} Initialization result
   */
  async init() {
    if (this._initialized) {
      return true;
    }
    
    if (this._initPromise) {
      return this._initPromise;
    }
    
    this._initPromise = new Promise(async (resolve, reject) => {
      try {
        // Check if python bridge is available
        if (pythonBridge) {
          console.log('Using Python Bridge for database backup');
          
          // Initialize the resources
          const moduleParams = {
            module_name: 'database_backup_manager',
            class_name: 'database_backup_manager',
            method_args: {},
            resources: this.resources,
            metadata: this.metadata
          };
          
          // Call the init method on the module
          const result = await pythonBridge.callMethod(
            'database_backup_manager',
            'init',
            moduleParams
          );
          
          this._initialized = true;
          this.emit('initialized', { success: true });
          resolve(true);
          
        } else {
          // Fallback to spawning a separate Python process
          console.log('Python Bridge not available, using direct process communication');
          
          // Create a script to run
          const scriptPath = path.join(os.tmpdir(), `database_backup_bridge_${Date.now()}.py`);
          
          // Create basic Python script for communication
          const script = `
import sys
import json
import asyncio
from pathlib import Path

# Add parent directory to path
parent_dir = str(Path(__file__).parent.parent)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

# Try to import the database backup manager
try:
    from hallucinate_app.database_backup_manager import database_backup_manager
except ImportError:
    import json
    print(json.dumps({
        "error": "Failed to import database_backup_manager module"
    }))
    sys.exit(1)

# Initialize and run event loop
async def main():
    # Initialize with provided metadata
    metadata = ${JSON.stringify(this.metadata)}
    
    # Initialize the database backup manager
    await database_backup_manager.init()
    
    # Signal that initialization is complete
    print(json.dumps({
        "initialized": True,
        "success": True
    }))
    sys.stdout.flush()
    
    # Process commands
    for line in sys.stdin:
        try:
            request = json.loads(line)
            
            # Extract command and parameters
            cmd = request.get("cmd")
            params = request.get("params", {})
            request_id = request.get("id")
            
            # Process command
            if cmd == "backup_orbitdb":
                result = await database_backup_manager.backup_orbitdb(
                    collections=params.get("collections"),
                    auth_token=params.get("auth_token"),
                    metadata=params.get("metadata")
                )
                response = {
                    "id": request_id,
                    "result": result
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
            elif cmd == "backup_fireproofdb":
                result = await database_backup_manager.backup_fireproofdb(
                    collections=params.get("collections"),
                    auth_token=params.get("auth_token"),
                    metadata=params.get("metadata")
                )
                response = {
                    "id": request_id,
                    "result": result
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
            elif cmd == "backup_duckdb":
                result = await database_backup_manager.backup_duckdb(
                    tables=params.get("tables"),
                    auth_token=params.get("auth_token"),
                    metadata=params.get("metadata")
                )
                response = {
                    "id": request_id,
                    "result": result
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
            elif cmd == "restore_orbitdb":
                result = await database_backup_manager.restore_orbitdb(
                    backup_id=params.get("backup_id"),
                    cid=params.get("cid"),
                    auth_token=params.get("auth_token"),
                    target_collections=params.get("target_collections")
                )
                response = {
                    "id": request_id,
                    "result": result
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
            elif cmd == "restore_fireproofdb":
                result = await database_backup_manager.restore_fireproofdb(
                    backup_id=params.get("backup_id"),
                    cid=params.get("cid"),
                    auth_token=params.get("auth_token"),
                    target_collections=params.get("target_collections")
                )
                response = {
                    "id": request_id,
                    "result": result
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
            elif cmd == "restore_duckdb":
                result = await database_backup_manager.restore_duckdb(
                    backup_id=params.get("backup_id"),
                    cid=params.get("cid"),
                    auth_token=params.get("auth_token"),
                    target_tables=params.get("target_tables")
                )
                response = {
                    "id": request_id,
                    "result": result
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
            elif cmd == "list_backups":
                result = await database_backup_manager.list_backups(
                    params.get("db_type"),
                    params.get("auth_token")
                )
                response = {
                    "id": request_id,
                    "result": result
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
            elif cmd == "get_backup_info":
                result = await database_backup_manager.get_backup_info(
                    params.get("db_type"),
                    params.get("backup_id"),
                    params.get("auth_token")
                )
                response = {
                    "id": request_id,
                    "result": result
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
            elif cmd == "delete_backup":
                result = await database_backup_manager.delete_backup(
                    params.get("db_type"),
                    params.get("backup_id"),
                    params.get("auth_token")
                )
                response = {
                    "id": request_id,
                    "result": result
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
            elif cmd == "schedule_backup":
                result = await database_backup_manager.schedule_backup(
                    params.get("schedule"),
                    params.get("auth_token")
                )
                response = {
                    "id": request_id,
                    "result": result
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
            elif cmd == "list_schedules":
                result = await database_backup_manager.list_schedules(
                    params.get("auth_token")
                )
                response = {
                    "id": request_id,
                    "result": result
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
            elif cmd == "delete_schedule":
                result = await database_backup_manager.delete_schedule(
                    params.get("schedule_id"),
                    params.get("auth_token")
                )
                response = {
                    "id": request_id,
                    "result": result
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
            elif cmd == "exit":
                await database_backup_manager.close()
                sys.exit(0)
                
            else:
                response = {
                    "id": request_id,
                    "error": f"Unknown command: {cmd}"
                }
                print(json.dumps(response))
                sys.stdout.flush()
                
        except Exception as e:
            response = {
                "id": request_id if "request_id" in locals() else 0,
                "error": str(e)
            }
            print(json.dumps(response))
            sys.stdout.flush()

# Run the main function
asyncio.run(main())
          `;
          
          // Write script to file
          fs.writeFileSync(scriptPath, script);
          
          // Spawn Python process to run the script
          this._pythonProcess = spawn(this.options.pythonPath, [scriptPath]);
          
          // Set up event handlers
          this._pythonProcess.stdout.on('data', (data) => {
            // Process each line
            const lines = data.toString().trim().split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              
              try {
                const response = JSON.parse(line);
                
                // Check if it's an initialization response
                if (response.initialized) {
                  this._initialized = true;
                  this.emit('initialized', response);
                  resolve(true);
                  continue;
                }
                
                // Check if it's a response to a specific request
                if (response.id && this._pendingRequests.has(response.id)) {
                  const { resolve, reject } = this._pendingRequests.get(response.id);
                  this._pendingRequests.delete(response.id);
                  
                  if (response.error) {
                    reject(new Error(response.error));
                  } else {
                    resolve(response.result);
                  }
                }
              } catch (err) {
                console.error('Error parsing response:', err, line);
              }
            }
          });
          
          this._pythonProcess.stderr.on('data', (data) => {
            console.error('Python error:', data.toString());
          });
          
          this._pythonProcess.on('close', (code) => {
            console.log(`Python process exited with code ${code}`);
            this._initialized = false;
            this._pythonProcess = null;
            
            // Reject all pending requests
            for (const [id, { reject }] of this._pendingRequests) {
              reject(new Error(`Python process exited with code ${code}`));
            }
            this._pendingRequests.clear();
            
            this.emit('closed', { code });
          });
        }
      } catch (err) {
        console.error('Error initializing database backup bridge:', err);
        this._initPromise = null;
        reject(err);
      }
    });
    
    return this._initPromise;
  }
  
  /**
   * Ensure required directories exist
   * 
   * @param {string[]} dirs - Array of directory paths
   * @private
   */
  _ensureDirectories(dirs) {
    for (const dir of dirs) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } catch (err) {
        console.warn(`Failed to create directory ${dir}:`, err);
      }
    }
  }
  
  /**
   * Send a command to the Python process
   * 
   * @param {string} cmd - Command to execute
   * @param {Object} params - Command parameters
   * @param {number} retryCount - Current retry attempt
   * @returns {Promise<any>} Command result
   * @private
   */
  async _sendCommand(cmd, params, retryCount = 0) {
    // Ensure bridge is initialized
    if (!this._initialized) {
      await this.init();
    }
    
    // Check if Python bridge is available
    if (pythonBridge) {
      try {
        // Use Python bridge to call the method
        const result = await pythonBridge.callMethod(
          'database_backup_manager',
          cmd,
          params
        );
        
        return result;
      } catch (err) {
        // Retry logic
        if (retryCount < this.options.retry.maxRetries) {
          console.warn(`Error calling ${cmd}, retrying (${retryCount + 1}/${this.options.retry.maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, this.options.retry.delay));
          return this._sendCommand(cmd, params, retryCount + 1);
        }
        
        throw err;
      }
    }
    
    // Fall back to direct process communication
    return new Promise((resolve, reject) => {
      if (!this._pythonProcess) {
        return reject(new Error('Python process not available'));
      }
      
      const requestId = ++this._requestId;
      
      // Set up timeout
      const timeout = setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          reject(new Error(`Timeout waiting for response to command: ${cmd}`));
        }
      }, this.options.resourceTimeout);
      
      // Store pending request
      this._pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });
      
      // Send command to Python process
      const request = {
        id: requestId,
        cmd,
        params
      };
      
      try {
        this._pythonProcess.stdin.write(JSON.stringify(request) + '\n');
      } catch (err) {
        clearTimeout(timeout);
        this._pendingRequests.delete(requestId);
        
        // Retry logic
        if (retryCount < this.options.retry.maxRetries) {
          console.warn(`Error sending command ${cmd}, retrying (${retryCount + 1}/${this.options.retry.maxRetries})...`);
          setTimeout(() => {
            this._sendCommand(cmd, params, retryCount + 1)
              .then(resolve)
              .catch(reject);
          }, this.options.retry.delay);
        } else {
          reject(err);
        }
      }
    });
  }
  
  /**
   * Backup OrbitDB to IPFS
   * 
   * @param {Object} options - Backup options
   * @param {string[]} options.collections - Collections to backup (null for all)
   * @param {string} options.auth_token - Authentication token
   * @param {Object} options.metadata - Additional metadata
   * @returns {Promise<Object>} Backup result
   */
  async backupOrbitDB(options = {}) {
    // Create a unique operation ID
    const operationId = `orbitdb-backup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Start metrics tracking
    this.metricsCollector.incrementGauge('backups_in_progress', 1, { db_type: 'orbitdb' });
    const timer = this.metricsCollector.startTimer('backup_duration_seconds', { db_type: 'orbitdb' });
    
    // Track operation in progress with initial status
    this.inProgressOperations.set(operationId, {
      type: 'backup',
      db_type: 'orbitdb',
      status: 'starting',
      progress: 0,
      collections: options.collections || 'all',
      start_time: Date.now()
    });
    
    // Emit start event with operation ID
    this.emit('backup-started', {
      operation_id: operationId,
      db_type: 'orbitdb',
      collections: options.collections
    });
    
    try {
      // Update status to in-progress
      this._updateOperationProgress(operationId, 'in-progress', 10);
      
      // Execute backup command
      const result = await this._sendCommand('backup_orbitdb', {
        collections: options.collections,
        auth_token: options.auth_token,
        metadata: options.metadata
      });
      
      // Update status to complete
      this._updateOperationProgress(operationId, 'complete', 100);
      
      // Stop timer and track metrics
      timer.stop();
      this.metricsCollector.incrementCounter('backups_total', 1, { 
        db_type: 'orbitdb', 
        status: 'success' 
      });
      
      // Track backup size if available
      if (result.size) {
        this.metricsCollector.recordHistogram('backup_size_bytes', result.size, { db_type: 'orbitdb' });
      }
      
      // Emit completion event
      this.emit('backup-completed', {
        operation_id: operationId,
        db_type: 'orbitdb',
        backup_id: result.backup_id,
        cid: result.cid,
        collections: options.collections,
        document_count: result.document_count,
        size: result.size
      });
      
      return result;
    } catch (error) {
      // Update status to error
      this._updateOperationProgress(operationId, 'error', 0);
      
      // Record error metrics
      this.metricsCollector.recordError('backup', 'orbitdb', error);
      this.metricsCollector.incrementCounter('backups_total', 1, { 
        db_type: 'orbitdb', 
        status: 'error' 
      });
      
      // Stop timer
      timer.stop();
      
      // Emit error event
      this.emit('backup-error', {
        operation_id: operationId,
        db_type: 'orbitdb',
        error: error.message
      });
      
      throw error;
    } finally {
      // Cleanup operation tracking
      this.inProgressOperations.delete(operationId);
      this.metricsCollector.decrementGauge('backups_in_progress', 1, { db_type: 'orbitdb' });
    }
  }
  
  /**
   * Backup FireproofDB to IPFS
   * 
   * @param {Object} options - Backup options
   * @param {string[]} options.collections - Collections to backup (null for all)
   * @param {string} options.auth_token - Authentication token
   * @param {Object} options.metadata - Additional metadata
   * @returns {Promise<Object>} Backup result
   */
  async backupFireproofDB(options = {}) {
    return this._sendCommand('backup_fireproofdb', {
      collections: options.collections,
      auth_token: options.auth_token,
      metadata: options.metadata
    });
  }
  
  /**
   * Backup DuckDB to IPFS
   * 
   * @param {Object} options - Backup options
   * @param {string[]} options.tables - Tables to backup (null for all)
   * @param {string} options.auth_token - Authentication token
   * @param {Object} options.metadata - Additional metadata
   * @returns {Promise<Object>} Backup result
   */
  async backupDuckDB(options = {}) {
    return this._sendCommand('backup_duckdb', {
      tables: options.tables,
      auth_token: options.auth_token,
      metadata: options.metadata
    });
  }
  
  /**
   * Restore OrbitDB from backup
   * 
   * @param {Object} options - Restore options
   * @param {string} options.backup_id - Backup ID
   * @param {string} options.cid - Content ID (alternative to backup_id)
   * @param {string} options.auth_token - Authentication token
   * @param {string[]} options.target_collections - Specific collections to restore
   * @returns {Promise<Object>} Restore result
   */
  async restoreOrbitDB(options = {}) {
    // Create a unique operation ID
    const operationId = `orbitdb-restore-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Start metrics tracking
    this.metricsCollector.incrementGauge('restores_in_progress', 1, { db_type: 'orbitdb' });
    const timer = this.metricsCollector.startTimer('restore_duration_seconds', { db_type: 'orbitdb' });
    
    // Track operation in progress
    this.inProgressOperations.set(operationId, {
      type: 'restore',
      db_type: 'orbitdb',
      status: 'starting',
      progress: 0,
      backup_id: options.backup_id,
      cid: options.cid,
      target_collections: options.target_collections || 'all',
      start_time: Date.now()
    });
    
    // Emit start event
    this.emit('restore-started', {
      operation_id: operationId,
      db_type: 'orbitdb',
      backup_id: options.backup_id,
      cid: options.cid,
      target_collections: options.target_collections
    });
    
    try {
      // Update status to downloading
      this._updateOperationProgress(operationId, 'downloading', 10);
      
      // Execute restore command
      const result = await this._sendCommand('restore_orbitdb', {
        backup_id: options.backup_id,
        cid: options.cid,
        auth_token: options.auth_token,
        target_collections: options.target_collections
      });
      
      // Update status to complete
      this._updateOperationProgress(operationId, 'complete', 100);
      
      // Stop timer and track metrics
      timer.stop();
      this.metricsCollector.incrementCounter('restores_total', 1, { 
        db_type: 'orbitdb', 
        status: 'success' 
      });
      
      // Emit completion event
      this.emit('restore-completed', {
        operation_id: operationId,
        db_type: 'orbitdb',
        backup_id: options.backup_id || result.backup_id,
        cid: options.cid || result.cid,
        collections_restored: result.collections_restored,
        document_count: result.document_count
      });
      
      return result;
    } catch (error) {
      // Update status to error
      this._updateOperationProgress(operationId, 'error', 0);
      
      // Record error metrics
      this.metricsCollector.recordError('restore', 'orbitdb', error);
      this.metricsCollector.incrementCounter('restores_total', 1, { 
        db_type: 'orbitdb', 
        status: 'error' 
      });
      
      // Stop timer
      timer.stop();
      
      // Emit error event
      this.emit('restore-error', {
        operation_id: operationId,
        db_type: 'orbitdb',
        backup_id: options.backup_id,
        cid: options.cid,
        error: error.message
      });
      
      throw error;
    } finally {
      // Cleanup operation tracking
      this.inProgressOperations.delete(operationId);
      this.metricsCollector.decrementGauge('restores_in_progress', 1, { db_type: 'orbitdb' });
    }
  }
  
  /**
   * Restore FireproofDB from backup
   * 
   * @param {Object} options - Restore options
   * @param {string} options.backup_id - Backup ID
   * @param {string} options.cid - Content ID (alternative to backup_id)
   * @param {string} options.auth_token - Authentication token
   * @param {string[]} options.target_collections - Specific collections to restore
   * @returns {Promise<Object>} Restore result
   */
  async restoreFireproofDB(options = {}) {
    return this._sendCommand('restore_fireproofdb', {
      backup_id: options.backup_id,
      cid: options.cid,
      auth_token: options.auth_token,
      target_collections: options.target_collections
    });
  }
  
  /**
   * Restore DuckDB from backup
   * 
   * @param {Object} options - Restore options
   * @param {string} options.backup_id - Backup ID
   * @param {string} options.cid - Content ID (alternative to backup_id)
   * @param {string} options.auth_token - Authentication token
   * @param {string[]} options.target_tables - Specific tables to restore
   * @returns {Promise<Object>} Restore result
   */
  async restoreDuckDB(options = {}) {
    return this._sendCommand('restore_duckdb', {
      backup_id: options.backup_id,
      cid: options.cid,
      auth_token: options.auth_token,
      target_tables: options.target_tables
    });
  }
  
  /**
   * List backups for a database type
   * 
   * @param {string} db_type - Database type
   * @param {string} auth_token - Authentication token
   * @returns {Promise<Object>} List of backups
   */
  async listBackups(db_type, auth_token) {
    try {
      const result = await this._sendCommand('list_backups', {
        db_type,
        auth_token
      });
      
      // Update metrics for total backups if available
      if (result && result.backups && Array.isArray(result.backups)) {
        // Update total backups gauge
        this.metricsCollector.setGauge('total_backups', result.backups.length, { db_type });
        
        // Calculate total size if available
        let totalSize = 0;
        for (const backup of result.backups) {
          if (backup.size) {
            totalSize += parseInt(backup.size, 10);
          }
        }
        
        // Emit backups-listed event
        this.emit('backups-listed', {
          db_type,
          count: result.backups.length,
          total_size: totalSize,
          backups: result.backups.map(b => ({
            backup_id: b.backup_id,
            timestamp: b.timestamp,
            cid: b.cid
          }))
        });
      }
      
      return result;
    } catch (error) {
      // Record error
      this.metricsCollector.recordError('list', 'backups', error, { db_type });
      
      // Emit error event
      this.emit('backups-list-error', {
        db_type,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Update the progress of an in-progress operation and emit progress event
   * 
   * @param {string} operationId - Operation ID
   * @param {string} status - Operation status
   * @param {number} progress - Progress percentage (0-100)
   * @param {Object} [additionalData={}] - Additional data to include in the event
   * @private
   */
  _updateOperationProgress(operationId, status, progress, additionalData = {}) {
    // Get the operation
    const operation = this.inProgressOperations.get(operationId);
    if (!operation) return;
    
    // Update operation status and progress
    operation.status = status;
    operation.progress = progress;
    operation.last_updated = Date.now();
    
    // Update operation with additional data
    Object.assign(operation, additionalData);
    
    // Emit progress event
    const eventName = `${operation.type}-progress`;
    this.emit(eventName, {
      operation_id: operationId,
      db_type: operation.db_type,
      status,
      progress,
      ...additionalData
    });
  }
  
  /**
   * Get information about a specific backup
   * 
   * @param {string} db_type - Database type
   * @param {string} backup_id - Backup ID
   * @param {string} auth_token - Authentication token
   * @returns {Promise<Object>} Backup information
   */
  async getBackupInfo(db_type, backup_id, auth_token) {
    return this._sendCommand('get_backup_info', {
      db_type,
      backup_id,
      auth_token
    });
  }
  
  /**
   * Delete a backup
   * 
   * @param {string} db_type - Database type
   * @param {string} backup_id - Backup ID
   * @param {string} auth_token - Authentication token
   * @returns {Promise<Object>} Delete result
   */
  async deleteBackup(db_type, backup_id, auth_token) {
    return this._sendCommand('delete_backup', {
      db_type,
      backup_id,
      auth_token
    });
  }
  
  /**
   * Create a scheduled backup
   * 
   * @param {Object} schedule - Schedule information
   * @param {string} auth_token - Authentication token
   * @returns {Promise<Object>} Schedule result
   */
  async scheduleBackup(schedule, auth_token) {
    try {
      // Record operation metrics
      this.metricsCollector.incrementCounter('schedule_operations_total', 1, { operation: 'create' });
      
      // Execute command
      const result = await this._sendCommand('schedule_backup', {
        schedule,
        auth_token
      });
      
      // Update metrics on success
      const dbType = schedule.db_type || 'unknown';
      
      // Emit event on success
      this.emit('schedule-created', {
        id: result.id,
        db_type: dbType,
        interval: schedule.interval,
        description: schedule.description
      });
      
      return result;
    } catch (error) {
      // Record error metrics
      this.metricsCollector.recordError('schedule', 'create', error);
      
      // Emit error event
      this.emit('schedule-error', {
        operation: 'create',
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * List scheduled backups
   * 
   * @param {string} auth_token - Authentication token
   * @returns {Promise<Object>} List of schedules
   */
  async listSchedules(auth_token) {
    try {
      // Execute command
      const result = await this._sendCommand('list_schedules', {
        auth_token
      });
      
      // Update metrics if schedules are available
      if (result && result.schedules && Array.isArray(result.schedules)) {
        // Update total schedules gauge
        this.metricsCollector.setGauge('total_scheduled_backups', result.schedules.length);
        
        // Count active vs inactive schedules
        const activeSchedules = result.schedules.filter(s => s.active).length;
        
        // Emit event
        this.emit('schedules-listed', {
          count: result.schedules.length,
          active_count: activeSchedules,
          schedules: result.schedules.map(s => ({
            id: s.id,
            db_type: s.db_type,
            interval: s.interval,
            active: s.active,
            last_run: s.last_run,
            description: s.description
          }))
        });
      }
      
      return result;
    } catch (error) {
      // Record error metrics
      this.metricsCollector.recordError('schedule', 'list', error);
      
      // Emit error event
      this.emit('schedule-error', {
        operation: 'list',
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Delete a scheduled backup
   * 
   * @param {number} schedule_id - Schedule ID
   * @param {string} auth_token - Authentication token
   * @returns {Promise<Object>} Delete result
   */
  async deleteSchedule(schedule_id, auth_token) {
    return this._sendCommand('delete_schedule', {
      schedule_id,
      auth_token
    });
  }
  
  /**
   * Get status of all in-progress operations
   * 
   * @returns {Array} Array of in-progress operations
   */
  getInProgressOperations() {
    // Convert Map to array of operations
    return Array.from(this.inProgressOperations.values()).map(operation => {
      // Calculate elapsed time
      const elapsed = operation.last_updated ? 
        operation.last_updated - operation.start_time : 
        Date.now() - operation.start_time;
      
      return {
        ...operation,
        elapsed_ms: elapsed,
        elapsed_formatted: this._formatElapsedTime(elapsed)
      };
    });
  }
  
  /**
   * Get operation metrics for dashboard
   * 
   * @returns {Object} Operation metrics
   */
  getOperationMetrics() {
    return {
      counters: {
        backups: {
          orbitdb: this.metricsCollector.getCounter('backups_total', { db_type: 'orbitdb', status: 'success' }) || 0,
          fireproofdb: this.metricsCollector.getCounter('backups_total', { db_type: 'fireproofdb', status: 'success' }) || 0,
          duckdb: this.metricsCollector.getCounter('backups_total', { db_type: 'duckdb', status: 'success' }) || 0
        },
        restores: {
          orbitdb: this.metricsCollector.getCounter('restores_total', { db_type: 'orbitdb', status: 'success' }) || 0,
          fireproofdb: this.metricsCollector.getCounter('restores_total', { db_type: 'fireproofdb', status: 'success' }) || 0,
          duckdb: this.metricsCollector.getCounter('restores_total', { db_type: 'duckdb', status: 'success' }) || 0
        },
        errors: this.metricsCollector.getCounter('errors_total') || 0
      },
      gauges: {
        total_backups: {
          orbitdb: this.metricsCollector.getGauge('total_backups', { db_type: 'orbitdb' }) || 0,
          fireproofdb: this.metricsCollector.getGauge('total_backups', { db_type: 'fireproofdb' }) || 0,
          duckdb: this.metricsCollector.getGauge('total_backups', { db_type: 'duckdb' }) || 0
        },
        scheduled_backups: this.metricsCollector.getGauge('total_scheduled_backups') || 0,
        in_progress: {
          backups: {
            orbitdb: this.metricsCollector.getGauge('backups_in_progress', { db_type: 'orbitdb' }) || 0,
            fireproofdb: this.metricsCollector.getGauge('backups_in_progress', { db_type: 'fireproofdb' }) || 0,
            duckdb: this.metricsCollector.getGauge('backups_in_progress', { db_type: 'duckdb' }) || 0
          },
          restores: {
            orbitdb: this.metricsCollector.getGauge('restores_in_progress', { db_type: 'orbitdb' }) || 0,
            fireproofdb: this.metricsCollector.getGauge('restores_in_progress', { db_type: 'fireproofdb' }) || 0,
            duckdb: this.metricsCollector.getGauge('restores_in_progress', { db_type: 'duckdb' }) || 0
          }
        }
      },
      histograms: {
        backup_duration: {
          orbitdb: this.metricsCollector.getHistogram('backup_duration_seconds', { db_type: 'orbitdb' }),
          fireproofdb: this.metricsCollector.getHistogram('backup_duration_seconds', { db_type: 'fireproofdb' }),
          duckdb: this.metricsCollector.getHistogram('backup_duration_seconds', { db_type: 'duckdb' })
        },
        backup_size: {
          orbitdb: this.metricsCollector.getHistogram('backup_size_bytes', { db_type: 'orbitdb' }),
          fireproofdb: this.metricsCollector.getHistogram('backup_size_bytes', { db_type: 'fireproofdb' }),
          duckdb: this.metricsCollector.getHistogram('backup_size_bytes', { db_type: 'duckdb' })
        }
      }
    };
  }
  
  /**
   * Format elapsed time in milliseconds to a human-readable string
   * 
   * @param {number} ms - Elapsed time in milliseconds
   * @returns {string} Formatted time string
   * @private
   */
  _formatElapsedTime(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    }
  }
  
  /**
   * Close the bridge connection
   * 
   * @returns {Promise<boolean>} Success status
   */
  async close() {
    if (this._pythonProcess) {
      // Send exit command
      try {
        this._pythonProcess.stdin.write(JSON.stringify({
          cmd: 'exit'
        }) + '\n');
      } catch (err) {
        // Ignore errors, we're closing anyway
      }
      
      // Wait for process to exit
      await new Promise(resolve => {
        const timeout = setTimeout(() => {
          // Force kill if it doesn't exit cleanly
          if (this._pythonProcess) {
            this._pythonProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
        
        this._pythonProcess.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      
      this._pythonProcess = null;
    }
    
    this._initialized = false;
    this._initPromise = null;
    
    return true;
  }
}

// Create singleton instance
const databaseBackupBridge = new DatabaseBackupBridge();

// Export both the class and singleton instance
export {
  DatabaseBackupBridge,
  databaseBackupBridge
};