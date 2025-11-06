/**
 * MCP Daemon Manager
 * Manages IPFS MCP server daemons and SwissKnife integration
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import url from 'url';
import crypto from 'crypto';
import { getReporter, ErrorSource, ErrorLevel } from './github_issue_reporter.js';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

class MCPDaemonManager extends EventEmitter {
  constructor() {
    super();
    this.daemons = new Map();
    this.healthCheckInterval = null;
    this.baseDir = path.join(__dirname, '..', '..');
    
    // Initialize GitHub reporter if enabled
    this.githubReporter = null;
    if (process.env.GITHUB_ISSUE_REPORTER_ENABLED === 'true') {
      try {
        this.githubReporter = getReporter();
        console.log('GitHub issue reporter initialized for MCP daemon errors');
      } catch (error) {
        console.error('Failed to initialize GitHub reporter:', error.message);
      }
    }
    
    // Define the MCP servers
    this.daemonConfigs = [
      {
        id: 'ipfs-kit',
        name: 'IPFS Kit MCP',
        command: 'python',
        args: ['-m', 'ipfs_kit_py.cli', 'mcp', 'start'],
        cwd: path.join(this.baseDir, 'ipfs_kit_py'),
        port: 3001,
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      },
      {
        id: 'ipfs-datasets',
        name: 'IPFS Datasets MCP',
        command: 'python',
        args: ['-m', 'ipfs_datasets_py.mcp_server', '--http', '--port', '3002'],
        cwd: path.join(this.baseDir, 'ipfs_datasets_py'),
        port: 3002,
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      },
      {
        id: 'ipfs-accelerate',
        name: 'IPFS Accelerate MCP',
        command: 'python',
        args: ['-m', 'ipfs_accelerate_py.cli', 'mcp', 'start', '--port', '3003'],
        cwd: path.join(this.baseDir, 'ipfs_accelerate_py'),
        port: 3003,
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      }
    ];
  }

  /**
   * Start a specific daemon
   */
  async startDaemon(daemonId) {
    const config = this.daemonConfigs.find(d => d.id === daemonId);
    if (!config) {
      throw new Error(`Unknown daemon: ${daemonId}`);
    }

    if (this.daemons.has(daemonId)) {
      const existing = this.daemons.get(daemonId);
      if (existing.status === 'running') {
        console.log(`[${config.name}] Already running`);
        return existing;
      }
    }

    console.log(`[${config.name}] Starting on port ${config.port}...`);
    
    const process = spawn(config.command, config.args, {
      cwd: config.cwd,
      env: config.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const daemon = {
      id: daemonId,
      name: config.name,
      process,
      pid: process.pid,
      port: config.port,
      status: 'starting',
      startTime: Date.now(),
      restartCount: 0,
      lastError: null,
      logs: []
    };

    this.daemons.set(daemonId, daemon);

    // Handle process output
    process.stdout.on('data', (data) => {
      const message = data.toString().trim();
      daemon.logs.push({ time: Date.now(), level: 'info', message });
      
      // Keep only last 100 log entries
      if (daemon.logs.length > 100) {
        daemon.logs = daemon.logs.slice(-100);
      }
      
      console.log(`[${config.name}] ${message}`);
      this.emit('log', { daemon: daemonId, level: 'info', message });
      
      // Check for successful startup indicators
      if (message.includes('Server running') || 
          message.includes('Started') || 
          message.includes('Listening') ||
          message.includes('ready')) {
        daemon.status = 'running';
        this.emit('started', { daemon: daemonId, port: config.port });
      }
    });

    process.stderr.on('data', (data) => {
      const message = data.toString().trim();
      daemon.logs.push({ time: Date.now(), level: 'error', message });
      
      if (daemon.logs.length > 100) {
        daemon.logs = daemon.logs.slice(-100);
      }
      
      // Filter out non-critical warnings
      if (!message.includes('UserWarning') && 
          !message.includes('deprecated') &&
          !message.includes('Module') && 
          !message.includes('not available')) {
        console.error(`[${config.name}] ${message}`);
        daemon.lastError = message;
        this.emit('log', { daemon: daemonId, level: 'error', message });
      }
    });

    process.on('error', (error) => {
      console.error(`[${config.name}] Process error:`, error);
      daemon.status = 'error';
      daemon.lastError = error.message;
      this.emit('error', { daemon: daemonId, error: error.message });
      
      // Report to GitHub if enabled
      if (this.githubReporter) {
        this._reportErrorToGitHub(error, config.name, 'daemon_startup', daemonId);
      }
    });

    process.on('exit', (code, signal) => {
      console.log(`[${config.name}] Process exited with code ${code}, signal ${signal}`);
      daemon.status = 'stopped';
      
      if (code !== 0 && code !== null) {
        daemon.lastError = `Exited with code ${code}`;
        this.emit('error', { daemon: daemonId, error: `Exited with code ${code}` });
        
        // Report to GitHub if enabled
        if (this.githubReporter) {
          const errorObj = new Error(`Daemon exited with code ${code}`);
          errorObj.code = code;
          errorObj.signal = signal;
          this._reportErrorToGitHub(errorObj, config.name, 'daemon_crash', daemonId);
        }
        
        // Auto-restart on crash (max 3 times)
        if (daemon.restartCount < 3) {
          daemon.restartCount++;
          console.log(`[${config.name}] Auto-restarting (attempt ${daemon.restartCount}/3)...`);
          setTimeout(() => this.startDaemon(daemonId), 5000);
        }
      } else {
        this.emit('stopped', { daemon: daemonId });
      }
    });

    // Mark as running after a short delay if no errors
    setTimeout(() => {
      if (daemon.status === 'starting') {
        daemon.status = 'running';
        this.emit('started', { daemon: daemonId, port: config.port });
      }
    }, 3000);

    return daemon;
  }

  /**
   * Stop a specific daemon
   */
  async stopDaemon(daemonId) {
    const daemon = this.daemons.get(daemonId);
    if (!daemon) {
      throw new Error(`Daemon not found: ${daemonId}`);
    }

    if (daemon.status === 'stopped') {
      console.log(`[${daemon.name}] Already stopped`);
      return;
    }

    console.log(`[${daemon.name}] Stopping...`);
    daemon.process.kill('SIGTERM');
    
    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (daemon.status !== 'stopped') {
        console.log(`[${daemon.name}] Force killing...`);
        daemon.process.kill('SIGKILL');
      }
    }, 5000);

    daemon.status = 'stopped';
  }

  /**
   * Restart a specific daemon
   */
  async restartDaemon(daemonId) {
    console.log(`Restarting daemon: ${daemonId}`);
    await this.stopDaemon(daemonId);
    
    // Wait a bit before restarting
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return this.startDaemon(daemonId);
  }

  /**
   * Start all daemons
   */
  async startAll() {
    console.log('Starting all MCP daemons...');
    const promises = this.daemonConfigs.map(config => 
      this.startDaemon(config.id).catch(err => {
        console.error(`Failed to start ${config.name}:`, err);
        return null;
      })
    );
    
    await Promise.all(promises);
    console.log('All daemons started');
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    this.emit('all-started');
  }

  /**
   * Stop all daemons
   */
  async stopAll() {
    console.log('Stopping all MCP daemons...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    const promises = Array.from(this.daemons.keys()).map(id => 
      this.stopDaemon(id).catch(err => {
        console.error(`Failed to stop ${id}:`, err);
        return null;
      })
    );
    
    await Promise.all(promises);
    console.log('All daemons stopped');
    
    this.emit('all-stopped');
  }

  /**
   * Get status of all daemons
   */
  getAllStatus() {
    const status = {};
    
    for (const [id, daemon] of this.daemons) {
      status[id] = {
        id: daemon.id,
        name: daemon.name,
        status: daemon.status,
        pid: daemon.pid,
        port: daemon.port,
        uptime: daemon.status === 'running' ? Date.now() - daemon.startTime : 0,
        restartCount: daemon.restartCount,
        lastError: daemon.lastError,
        recentLogs: daemon.logs.slice(-10)
      };
    }
    
    return status;
  }

  /**
   * Get status of a specific daemon
   */
  getStatus(daemonId) {
    const daemon = this.daemons.get(daemonId);
    if (!daemon) {
      return null;
    }
    
    return {
      id: daemon.id,
      name: daemon.name,
      status: daemon.status,
      pid: daemon.pid,
      port: daemon.port,
      uptime: daemon.status === 'running' ? Date.now() - daemon.startTime : 0,
      restartCount: daemon.restartCount,
      lastError: daemon.lastError,
      recentLogs: daemon.logs.slice(-10)
    };
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      return;
    }
    
    console.log('Starting health monitoring (30s interval)...');
    
    this.healthCheckInterval = setInterval(() => {
      for (const [id, daemon] of this.daemons) {
        if (daemon.status === 'running') {
          // Check if process is still alive
          try {
            process.kill(daemon.pid, 0);
            this.emit('health-check', { daemon: id, healthy: true });
          } catch (err) {
            console.error(`[${daemon.name}] Process not responding, marking as stopped`);
            daemon.status = 'stopped';
            this.emit('health-check', { daemon: id, healthy: false });
            
            // Auto-restart
            if (daemon.restartCount < 3) {
              daemon.restartCount++;
              console.log(`[${daemon.name}] Auto-restarting (attempt ${daemon.restartCount}/3)...`);
              this.startDaemon(id);
            }
          }
        }
      }
    }, 30000); // 30 seconds
  }

  /**
   * Get logs for a specific daemon
   */
  getLogs(daemonId, limit = 50) {
    const daemon = this.daemons.get(daemonId);
    if (!daemon) {
      return [];
    }
    
    return daemon.logs.slice(-limit);
  }
  
  /**
   * Report an error to GitHub
   * @private
   */
  async _reportErrorToGitHub(error, component, operation, daemonId) {
    if (!this.githubReporter) {
      return;
    }
    
    try {
      const daemon = this.daemons.get(daemonId);
      const errorData = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: ErrorLevel.ERROR,
        source: ErrorSource.MCP_SERVER,
        component: component,
        operation: operation,
        message: error.message,
        name: error.name || 'Error',
        stackTrace: error.stack,
        details: {
          daemonId: daemonId,
          port: daemon?.port,
          restartCount: daemon?.restartCount,
          exitCode: error.code,
          signal: error.signal
        },
        metadata: {
          errorType: error.name || 'Error',
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          daemonStatus: daemon?.status,
          recentLogs: daemon?.logs?.slice(-5) || []
        },
        tags: [component.toLowerCase(), 'mcp-server', 'daemon-error'],
        count: 1
      };
      
      await this.githubReporter.createIssue(errorData);
    } catch (reportError) {
      console.error('Failed to report error to GitHub:', reportError);
    }
  }
}

export default MCPDaemonManager;
export { MCPDaemonManager };
