/**
 * Daemon Manager for MCP Servers
 * 
 * This module manages the lifecycle of MCP (Model Context Protocol) servers
 * including starting, stopping, health monitoring, and auto-restart functionality.
 * 
 * Manages 3 MCP servers:
 * 1. IPFS Accelerate MCP Server - For distributed AI/ML operations
 * 2. SwissKnife MCP Server - For CLI and vibecoding tools
 * 3. HuggingFace MCP Server - For model and dataset management
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import url from 'url';
import { ControlSurfaceInvocationGate } from './control_surface_invocation.js';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

class MCPDaemon extends EventEmitter {
  constructor(config) {
    super();
    this.name = config.name;
    this.command = config.command;
    this.args = config.args || [];
    this.cwd = config.cwd || process.cwd();
    this.env = { ...process.env, ...config.env };
    this.autoRestart = config.autoRestart !== false;
    this.maxRestarts = config.maxRestarts || 5;
    this.restartDelay = config.restartDelay || 5000;
    this.healthCheckInterval = config.healthCheckInterval || 30000;
    
    this.process = null;
    this.status = 'stopped';
    this.restartCount = 0;
    this.lastStartTime = null;
    this.healthCheckTimer = null;
  }

  /**
   * Start the MCP server process
   */
  async start() {
    if (this.status === 'running') {
      console.log(`[${this.name}] Already running`);
      return;
    }

    this.status = 'starting';
    this.emit('starting', { name: this.name });

    try {
      this.process = spawn(this.command, this.args, {
        cwd: this.cwd,
        env: this.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.lastStartTime = Date.now();
      
      // Set up process event handlers
      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[${this.name}] ${output}`);
        this.emit('stdout', { name: this.name, data: output });
      });

      this.process.stderr.on('data', (data) => {
        const output = data.toString();
        console.error(`[${this.name}] ${output}`);
        this.emit('stderr', { name: this.name, data: output });
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[${this.name}] Exited with code ${code}, signal ${signal}`);
        this.handleExit(code, signal);
      });

      this.process.on('error', (error) => {
        console.error(`[${this.name}] Error:`, error);
        this.emit('error', { name: this.name, error });
      });

      this.status = 'running';
      this.emit('started', { name: this.name, pid: this.process.pid });
      
      // Start health monitoring
      this.startHealthCheck();

      console.log(`[${this.name}] Started successfully (PID: ${this.process.pid})`);
    } catch (error) {
      this.status = 'failed';
      this.emit('error', { name: this.name, error });
      console.error(`[${this.name}] Failed to start:`, error);
      throw error;
    }
  }

  /**
   * Stop the MCP server process
   */
  async stop() {
    if (this.status === 'stopped') {
      console.log(`[${this.name}] Already stopped`);
      return;
    }

    this.status = 'stopping';
    this.emit('stopping', { name: this.name });

    // Stop health monitoring
    this.stopHealthCheck();

    if (this.process) {
      try {
        // Try graceful shutdown first
        this.process.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            // Force kill if graceful shutdown takes too long
            if (this.process && !this.process.killed) {
              console.log(`[${this.name}] Force killing process`);
              this.process.kill('SIGKILL');
            }
            resolve();
          }, 5000);

          if (this.process) {
            this.process.once('exit', () => {
              clearTimeout(timeout);
              resolve();
            });
          } else {
            clearTimeout(timeout);
            resolve();
          }
        });
      } catch (error) {
        console.error(`[${this.name}] Error stopping process:`, error);
      }
    }

    this.process = null;
    this.status = 'stopped';
    this.emit('stopped', { name: this.name });
    console.log(`[${this.name}] Stopped successfully`);
  }

  /**
   * Restart the MCP server process
   */
  async restart() {
    console.log(`[${this.name}] Restarting...`);
    await this.stop();
    
    // Wait for restart delay
    await new Promise(resolve => setTimeout(resolve, this.restartDelay));
    
    await this.start();
  }

  /**
   * Handle process exit
   */
  handleExit(code, signal) {
    this.stopHealthCheck();
    
    if (this.status === 'stopping') {
      // Expected exit during stop
      return;
    }

    this.status = 'crashed';
    this.emit('crashed', { name: this.name, code, signal });

    // Auto-restart if enabled and not exceeded max restarts
    if (this.autoRestart && this.restartCount < this.maxRestarts) {
      this.restartCount++;
      console.log(`[${this.name}] Auto-restarting (attempt ${this.restartCount}/${this.maxRestarts})...`);
      
      setTimeout(() => {
        this.start().catch(error => {
          console.error(`[${this.name}] Auto-restart failed:`, error);
        });
      }, this.restartDelay);
    } else if (this.restartCount >= this.maxRestarts) {
      console.error(`[${this.name}] Max restarts exceeded, giving up`);
      this.status = 'failed';
      this.emit('failed', { name: this.name });
    }
  }

  /**
   * Start health check monitoring
   */
  startHealthCheck() {
    this.stopHealthCheck(); // Clear any existing timer
    
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * Stop health check monitoring
   */
  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Perform health check
   */
  performHealthCheck() {
    if (!this.process || this.process.killed) {
      console.warn(`[${this.name}] Health check failed: process not running`);
      this.emit('health-check-failed', { name: this.name, reason: 'process_not_running' });
      return;
    }

    // Basic health check - process is alive
    // TODO: Implement more sophisticated health checks (e.g., HTTP ping, response time)
    this.emit('health-check', { name: this.name, status: 'healthy', pid: this.process.pid });
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      name: this.name,
      status: this.status,
      pid: this.process?.pid,
      restartCount: this.restartCount,
      lastStartTime: this.lastStartTime,
      uptime: this.lastStartTime ? Date.now() - this.lastStartTime : 0
    };
  }
}

/**
 * Daemon Manager for managing multiple MCP servers
 */
class DaemonManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.daemons = new Map();
    this.controlSurfaceInvocationGate = options.controlSurfaceInvocationGate || new ControlSurfaceInvocationGate({
      source: 'hallucinate_app.node.daemon_manager'
    });
    this.setupDefaultDaemons();
  }

  /**
   * Set up default MCP servers
   */
  setupDefaultDaemons() {
    const rootDir = path.join(__dirname, '../..');
    
    // 1. IPFS Accelerate MCP Server
    this.registerDaemon({
      name: 'ipfs-accelerate-mcp',
      command: 'node',
      args: [
        path.join(rootDir, 'swissknife/src/patches/mcp/mcp-server-controller.js')
      ],
      cwd: path.join(rootDir, 'swissknife'),
      env: {
        MCP_SERVER_NAME: 'ipfs-accelerate',
        MCP_SERVER_PORT: '3001'
      },
      autoRestart: true,
      maxRestarts: 5
    });

    // 2. SwissKnife MCP Server
    this.registerDaemon({
      name: 'swissknife-mcp',
      command: 'node',
      args: [
        path.join(rootDir, 'swissknife/cli.mjs'),
        'mcp',
        '--cwd', rootDir
      ],
      cwd: path.join(rootDir, 'swissknife'),
      env: {
        MCP_SERVER_NAME: 'swissknife-cli',
        MCP_SERVER_PORT: '3002'
      },
      autoRestart: true,
      maxRestarts: 5
    });

    // 3. HuggingFace MCP Server
    this.registerDaemon({
      name: 'huggingface-mcp',
      command: 'node',
      args: [
        path.join(rootDir, 'hallucinate_app/node/ipfs_model_manager.js')
      ],
      cwd: rootDir,
      env: {
        MCP_SERVER_NAME: 'huggingface',
        MCP_SERVER_PORT: '3003'
      },
      autoRestart: true,
      maxRestarts: 5
    });
  }

  /**
   * Register a new daemon
   */
  registerDaemon(config) {
    const daemon = new MCPDaemon(config);
    
    // Forward daemon events
    daemon.on('starting', (data) => this.emit('daemon-starting', data));
    daemon.on('started', (data) => this.emit('daemon-started', data));
    daemon.on('stopping', (data) => this.emit('daemon-stopping', data));
    daemon.on('stopped', (data) => this.emit('daemon-stopped', data));
    daemon.on('crashed', (data) => this.emit('daemon-crashed', data));
    daemon.on('failed', (data) => this.emit('daemon-failed', data));
    daemon.on('error', (data) => this.emit('daemon-error', data));
    daemon.on('health-check', (data) => this.emit('daemon-health-check', data));
    daemon.on('health-check-failed', (data) => this.emit('daemon-health-check-failed', data));
    
    this.daemons.set(config.name, daemon);
    console.log(`Registered daemon: ${config.name}`);
  }

  /**
   * Start a specific daemon
   */
  async startDaemon(name) {
    const daemon = this.daemons.get(name);
    if (!daemon) {
      throw new Error(`Daemon not found: ${name}`);
    }
    await daemon.start();
  }

  /**
   * Stop a specific daemon
   */
  async stopDaemon(name) {
    const daemon = this.daemons.get(name);
    if (!daemon) {
      throw new Error(`Daemon not found: ${name}`);
    }
    await daemon.stop();
  }

  /**
   * Restart a specific daemon
   */
  async restartDaemon(name) {
    const daemon = this.daemons.get(name);
    if (!daemon) {
      throw new Error(`Daemon not found: ${name}`);
    }
    await daemon.restart();
  }

  /**
   * Start all daemons
   */
  async startAll() {
    console.log('Starting all daemons...');
    const promises = Array.from(this.daemons.values()).map(daemon => daemon.start());
    await Promise.allSettled(promises);
    console.log('All daemons started');
  }

  /**
   * Stop all daemons
   */
  async stopAll() {
    console.log('Stopping all daemons...');
    const promises = Array.from(this.daemons.values()).map(daemon => daemon.stop());
    await Promise.allSettled(promises);
    console.log('All daemons stopped');
  }

  /**
   * Get status of all daemons
   */
  getStatus() {
    const status = {};
    for (const [name, daemon] of this.daemons.entries()) {
      status[name] = daemon.getStatus();
    }
    return status;
  }

  /**
   * Get status of a specific daemon
   */
  getDaemonStatus(name) {
    const daemon = this.daemons.get(name);
    if (!daemon) {
      throw new Error(`Daemon not found: ${name}`);
    }
    return daemon.getStatus();
  }

  /**
   * Configure the shared control_surface policy hook used before invoke.
   */
  setControlSurfacePolicyHook(policyHook) {
    this.controlSurfaceInvocationGate.setPolicyHook(policyHook);
  }

  /**
   * Run the single pre-invocation mediation hook for a daemon-managed MCP call.
   */
  async beforeInvoke(name, invocation = {}) {
    this.requireDaemon(name);
    return this.controlSurfaceInvocationGate.beforeInvoke(
      this.managedInvocationPayload(name, invocation)
    );
  }

  /**
   * Invoke through a daemon-managed transport only after policy_decision mediation.
   */
  async invokeManagedService(name, invocation = {}, invoker = null) {
    this.requireDaemon(name);
    return this.controlSurfaceInvocationGate.invoke(
      this.managedInvocationPayload(name, invocation),
      invoker
    );
  }

  requireDaemon(name) {
    const daemon = this.daemons.get(name);
    if (!daemon) {
      throw new Error(`Daemon not found: ${name}`);
    }
    return daemon;
  }

  managedInvocationPayload(name, invocation = {}) {
    const daemon = this.requireDaemon(name);
    return {
      ...invocation,
      daemon_id: name,
      service_id: invocation.service_id || name,
      server_family: invocation.server_family || name,
      transport: invocation.transport || 'mcp-server',
      endpoint: invocation.endpoint || (
        daemon.env?.MCP_SERVER_PORT
          ? `http://127.0.0.1:${daemon.env.MCP_SERVER_PORT}`
          : ''
      ),
      control_surface_contract_ref: (
        invocation.control_surface_contract_ref ||
        `control_surface_contract:mcp-daemon:${name}`
      )
    };
  }
}

// Singleton instance
let daemonManagerInstance = null;

/**
 * Get the daemon manager instance
 */
export function getDaemonManager() {
  if (!daemonManagerInstance) {
    daemonManagerInstance = new DaemonManager();
  }
  return daemonManagerInstance;
}

export { DaemonManager, MCPDaemon };
