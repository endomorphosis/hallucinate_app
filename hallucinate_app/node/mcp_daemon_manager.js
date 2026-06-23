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
import { ControlSurfaceInvocationGate } from './control_surface_invocation.js';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_HEALTH_INTERVAL_MS = 30000;
const DEFAULT_STARTUP_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESTARTS = 3;
const LAUNCH_TASK_ID = 'HAO-442';

function stableReceiptCid(value) {
  const canonical = JSON.stringify(value);
  const digest = crypto.createHash('sha256').update(canonical).digest('hex');
  return `sha256:mcp_daemon_receipt:${digest}`;
}

class MCPDaemonManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.daemons = new Map();
    this.launchReceipts = [];
    this.restartCounts = new Map();
    this.healthCheckInterval = null;
    this.baseDir = path.join(__dirname, '..', '..');
    this.healthIntervalMs = Number(options.healthIntervalMs || process.env.MCP_DAEMON_HEALTH_INTERVAL_MS || DEFAULT_HEALTH_INTERVAL_MS);
    this.startupTimeoutMs = Number(options.startupTimeoutMs || process.env.MCP_DAEMON_STARTUP_TIMEOUT_MS || DEFAULT_STARTUP_TIMEOUT_MS);
    this.maxRestarts = Number(options.maxRestarts || process.env.MCP_DAEMON_MAX_RESTARTS || DEFAULT_MAX_RESTARTS);
    this.controlSurfaceInvocationGate = options.controlSurfaceInvocationGate || new ControlSurfaceInvocationGate({
      source: 'hallucinate_app.node.mcp_daemon_manager'
    });
    
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
        packageName: 'ipfs_kit_py',
        name: 'IPFS Kit MCP',
        launchOrder: 10,
        command: 'python',
        args: ['-m', 'ipfs_kit_py.cli', 'mcp', 'start'],
        cwd: path.join(this.baseDir, 'ipfs_kit_py'),
        port: 3001,
        transport: 'http',
        rpcPath: '/mcp/tools/call',
        healthPath: '/health',
        swissknifeConsumer: 'Swissknife IPFS storage, pin dashboard, and backend health surfaces',
        mediationContractRef: 'control_surface_contract:mcp-daemon:ipfs-kit'
      },
      {
        id: 'ipfs-datasets',
        packageName: 'ipfs_datasets_py',
        name: 'IPFS Datasets MCP',
        launchOrder: 20,
        command: 'python',
        args: ['-m', 'ipfs_datasets_py.mcp_server', '--http', '--port', '3002'],
        cwd: path.join(this.baseDir, 'ipfs_datasets_py'),
        port: 3002,
        transport: 'http',
        rpcPath: '/mcp',
        healthPath: '/health',
        swissknifeConsumer: 'Swissknife dataset, content, index, provenance, and background task surfaces',
        mediationContractRef: 'control_surface_contract:mcp-daemon:ipfs-datasets'
      },
      {
        id: 'ipfs-accelerate',
        packageName: 'ipfs_accelerate_py',
        name: 'IPFS Accelerate MCP',
        launchOrder: 30,
        command: 'python',
        args: ['-m', 'ipfs_accelerate_py.cli', 'mcp', 'start', '--port', '3003'],
        cwd: path.join(this.baseDir, 'ipfs_accelerate_py'),
        port: 3003,
        transport: 'http',
        rpcPath: '/mcp',
        healthPath: '/health',
        swissknifeConsumer: 'Swissknife hardware profile, inference job, job status, and telemetry surfaces',
        mediationContractRef: 'control_surface_contract:mcp-daemon:ipfs-accelerate'
      }
    ];
  }

  /**
   * Start a specific daemon
   */
  async startDaemon(daemonId, options = {}) {
    const config = this.daemonConfigs.find(d => d.id === daemonId);
    if (!config) {
      throw new Error(`Unknown daemon: ${daemonId}`);
    }

    if (this.daemons.has(daemonId)) {
      const existing = this.daemons.get(daemonId);
      if (existing.status === 'running') {
        console.log(`[${config.name}] Already running`);
        this._recordLaunchReceipt(config, existing, 'already_running', 'ok', {
          reason: options.reason || 'manual',
          health: await this.checkDaemonHealth(daemonId)
        });
        return existing;
      }
    }

    console.log(`[${config.name}] Starting on port ${config.port}...`);
    const launchEnv = this._buildDaemonEnv(config);
    
    const process = spawn(config.command, config.args, {
      cwd: config.cwd,
      env: launchEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const daemon = {
      id: daemonId,
      name: config.name,
      packageName: config.packageName,
      entrypoint: `${config.command} ${config.args.join(' ')}`,
      process,
      pid: process.pid,
      port: config.port,
      status: 'starting',
      startTime: Date.now(),
      restartCount: this.restartCounts.get(daemonId) || 0,
      lastError: null,
      lastHealth: null,
      launchOrder: config.launchOrder,
      endpoint: this._daemonEndpoint(config),
      logs: []
    };

    this.daemons.set(daemonId, daemon);
    this._recordLaunchReceipt(config, daemon, 'launch_spawned', 'pending', {
      reason: options.reason || 'manual',
      startup_order: config.launchOrder,
      environment: this._redactedDaemonEnvironment(launchEnv)
    });

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
      this._recordLaunchReceipt(config, daemon, 'launch_error', 'error', {
        reason: options.reason || 'manual',
        error: error.message
      });
      this.emit('error', { daemon: daemonId, error: error.message });
      
      // Report to GitHub if enabled
      if (this.githubReporter) {
        this._reportErrorToGitHub(error, config.name, 'daemon_startup', daemonId);
      }
    });

    process.on('exit', (code, signal) => {
      console.log(`[${config.name}] Process exited with code ${code}, signal ${signal}`);
      daemon.status = 'stopped';
      this._recordLaunchReceipt(config, daemon, 'process_exit', code === 0 ? 'stopped' : 'error', {
        exit_code: code,
        signal,
        restart_count: daemon.restartCount
      });
      
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
        
        // Auto-restart on crash.
        if (daemon.restartCount < this.maxRestarts) {
          daemon.restartCount++;
          this.restartCounts.set(daemonId, daemon.restartCount);
          this._recordLaunchReceipt(config, daemon, 'restart_scheduled', 'pending', {
            restart_count: daemon.restartCount,
            max_restarts: this.maxRestarts,
            delay_ms: 5000
          });
          console.log(`[${config.name}] Auto-restarting (attempt ${daemon.restartCount}/${this.maxRestarts})...`);
          setTimeout(() => this.startDaemon(daemonId, { reason: 'crash_restart' }), 5000);
        }
      } else {
        this.emit('stopped', { daemon: daemonId });
      }
    });

    daemon.lastHealth = await this._waitForDaemonHealth(config, daemon);
    if (daemon.status === 'starting') {
      daemon.status = daemon.lastHealth.healthy ? 'running' : 'degraded';
      this.emit('started', { daemon: daemonId, port: config.port, health: daemon.lastHealth });
    }
    this._recordLaunchReceipt(config, daemon, 'launch_health_checked', daemon.lastHealth.healthy ? 'ok' : 'degraded', {
      reason: options.reason || 'manual',
      health: daemon.lastHealth
    });

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
    const config = this._requireDaemonConfig(daemonId);
    this._recordLaunchReceipt(config, daemon, 'stop_requested', 'stopped', {
      signal: 'SIGTERM'
    });
  }

  /**
   * Restart a specific daemon
   */
  async restartDaemon(daemonId) {
    console.log(`Restarting daemon: ${daemonId}`);
    await this.stopDaemon(daemonId);
    
    // Wait a bit before restarting
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return this.startDaemon(daemonId, { reason: 'manual_restart' });
  }

  /**
   * Start all daemons
   */
  async startAll() {
    console.log('Starting all MCP daemons...');
    const orderedConfigs = [...this.daemonConfigs].sort((a, b) => a.launchOrder - b.launchOrder);
    const started = [];
    for (const config of orderedConfigs) {
      const daemon = await this.startDaemon(config.id, { reason: 'app_launch' }).catch(err => {
        console.error(`Failed to start ${config.name}:`, err);
        this._recordLaunchReceipt(config, null, 'launch_failed', 'error', {
          reason: 'app_launch',
          error: err.message
        });
        return null;
      });
      started.push(daemon);
    }
    console.log('All daemons started');
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    this.emit('all-started', { startupOrder: orderedConfigs.map((config) => config.id) });
    return started;
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
    
    const orderedIds = Array.from(this.daemons.keys()).sort((a, b) => {
      return this._requireDaemonConfig(b).launchOrder - this._requireDaemonConfig(a).launchOrder;
    });
    const promises = orderedIds.map(id => 
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
        lastHealth: daemon.lastHealth,
        endpoint: daemon.endpoint,
        packageName: daemon.packageName,
        launchOrder: daemon.launchOrder,
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
      lastHealth: daemon.lastHealth,
      endpoint: daemon.endpoint,
      packageName: daemon.packageName,
      launchOrder: daemon.launchOrder,
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
    
    console.log(`Starting MCP daemon health monitoring (${this.healthIntervalMs}ms interval)...`);
    
    this.healthCheckInterval = setInterval(async () => {
      for (const [id, daemon] of this.daemons) {
        if (daemon.status === 'running' || daemon.status === 'degraded') {
          const config = this._requireDaemonConfig(id);
          const health = await this.checkDaemonHealth(id);
          daemon.lastHealth = health;
          this.emit('health-check', { daemon: id, healthy: health.healthy, health });
          this._recordLaunchReceipt(config, daemon, 'daemon_health', health.healthy ? 'ok' : 'degraded', {
            health
          });

          if (!health.process_alive) {
            console.error(`[${daemon.name}] Process not responding, marking as stopped`);
            daemon.status = 'stopped';
            
            // Auto-restart
            if (daemon.restartCount < this.maxRestarts) {
              daemon.restartCount++;
              this.restartCounts.set(id, daemon.restartCount);
              this._recordLaunchReceipt(config, daemon, 'restart_scheduled', 'pending', {
                restart_count: daemon.restartCount,
                max_restarts: this.maxRestarts,
                reason: 'health_check_failed'
              });
              console.log(`[${daemon.name}] Auto-restarting (attempt ${daemon.restartCount}/${this.maxRestarts})...`);
              this.startDaemon(id, { reason: 'health_restart' });
            }
          }
        }
      }
    }, this.healthIntervalMs);
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

  getLaunchReceipts(limit = 100) {
    return this.launchReceipts.slice(-limit);
  }

  getLaunchPlan() {
    return [...this.daemonConfigs]
      .sort((a, b) => a.launchOrder - b.launchOrder)
      .map((config) => ({
        task_id: LAUNCH_TASK_ID,
        daemon_id: config.id,
        server_package: config.packageName,
        startup_order: config.launchOrder,
        entrypoint: `${config.command} ${config.args.join(' ')}`,
        cwd: config.cwd,
        endpoint: this._daemonEndpoint(config),
        transport: config.transport,
        rpc_path: config.rpcPath,
        health_path: config.healthPath,
        mediation_contract_ref: config.mediationContractRef,
        swissknife_consumer: config.swissknifeConsumer,
        restart_behavior: `auto-restart after crash or failed process health up to ${this.maxRestarts} attempts`
      }));
  }

  async checkDaemonHealth(daemonId) {
    const config = this._requireDaemonConfig(daemonId);
    const daemon = this.daemons.get(daemonId);
    return this._checkDaemonHealth(config, daemon);
  }

  /**
   * Configure the shared control_surface policy hook used before invoke.
   * If no runtime evaluator is registered, the gate emits a fail_closed
   * require_confirmation decision and does not call the daemon transport.
   */
  setControlSurfacePolicyHook(policyHook) {
    this.controlSurfaceInvocationGate.setPolicyHook(policyHook);
  }

  setControlSurfaceRuntimePolicyEvaluator(policyEvaluator) {
    this.controlSurfaceInvocationGate.setRuntimePolicyEvaluator(policyEvaluator);
  }

  /**
   * Run the single pre-invocation mediation hook for an MCP-managed service.
   */
  async beforeInvoke(daemonId, invocation = {}) {
    this._requireDaemonConfig(daemonId);
    return this.controlSurfaceInvocationGate.beforeInvoke(
      this._managedInvocationPayload(daemonId, invocation)
    );
  }

  /**
   * Invoke an MCP-managed transport only after policy_decision mediation.
   */
  async invokeManagedService(daemonId, invocation = {}, invoker = null) {
    this._requireDaemonConfig(daemonId);
    return this.controlSurfaceInvocationGate.invoke(
      this._managedInvocationPayload(daemonId, invocation),
      invoker
    );
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

  _requireDaemonConfig(daemonId) {
    const config = this.daemonConfigs.find(d => d.id === daemonId);
    if (!config) {
      throw new Error(`Unknown daemon: ${daemonId}`);
    }
    return config;
  }

  _managedInvocationPayload(daemonId, invocation = {}) {
    const config = this._requireDaemonConfig(daemonId);
    return {
      ...invocation,
      daemon_id: daemonId,
      service_id: invocation.service_id || daemonId,
      server_family: invocation.server_family || daemonId,
      transport: invocation.transport || 'mcp-server',
      endpoint: invocation.endpoint || `http://127.0.0.1:${config.port}`,
      control_surface_contract_ref: (
        invocation.control_surface_contract_ref ||
        config.mediationContractRef ||
        `control_surface_contract:mcp-daemon:${daemonId}`
      )
    };
  }

  _buildDaemonEnv(config) {
    const pythonPaths = [
      config.cwd,
      this.baseDir,
      process.env.PYTHONPATH
    ].filter(Boolean);
    return {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      HALLUCINATE_APP_MCP_DAEMON_ID: config.id,
      HALLUCINATE_APP_MCP_PACKAGE: config.packageName,
      HALLUCINATE_APP_MCP_PORT: String(config.port),
      HALLUCINATE_APP_CONTROL_SURFACE_CONTRACT_REF: config.mediationContractRef,
      CONTROL_SURFACE_DAEMON_MEDIATION: process.env.CONTROL_SURFACE_DAEMON_MEDIATION || 'shadow',
      PYTHONPATH: [...new Set(pythonPaths)].join(path.delimiter)
    };
  }

  _redactedDaemonEnvironment(env) {
    return {
      PYTHONUNBUFFERED: env.PYTHONUNBUFFERED,
      HALLUCINATE_APP_MCP_DAEMON_ID: env.HALLUCINATE_APP_MCP_DAEMON_ID,
      HALLUCINATE_APP_MCP_PACKAGE: env.HALLUCINATE_APP_MCP_PACKAGE,
      HALLUCINATE_APP_MCP_PORT: env.HALLUCINATE_APP_MCP_PORT,
      HALLUCINATE_APP_CONTROL_SURFACE_CONTRACT_REF: env.HALLUCINATE_APP_CONTROL_SURFACE_CONTRACT_REF,
      CONTROL_SURFACE_DAEMON_MEDIATION: env.CONTROL_SURFACE_DAEMON_MEDIATION,
      PYTHONPATH: env.PYTHONPATH
    };
  }

  _daemonEndpoint(config) {
    return `http://127.0.0.1:${config.port}`;
  }

  async _waitForDaemonHealth(config, daemon) {
    const deadline = Date.now() + this.startupTimeoutMs;
    let lastHealth = await this._checkDaemonHealth(config, daemon);
    while (!lastHealth.healthy && Date.now() < deadline && daemon.status !== 'error' && daemon.status !== 'stopped') {
      await new Promise(resolve => setTimeout(resolve, 250));
      lastHealth = await this._checkDaemonHealth(config, daemon);
    }
    return lastHealth;
  }

  async _checkDaemonHealth(config, daemon) {
    const endpoint = this._daemonEndpoint(config);
    const result = {
      checked_at: new Date().toISOString(),
      daemon_id: config.id,
      endpoint,
      health_url: `${endpoint}${config.healthPath}`,
      process_alive: false,
      endpoint_ok: false,
      healthy: false,
      status_code: null,
      error: ''
    };

    if (daemon?.pid) {
      try {
        process.kill(daemon.pid, 0);
        result.process_alive = true;
      } catch (error) {
        result.error = error.message;
      }
    }

    if (typeof fetch === 'function') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      try {
        const response = await fetch(result.health_url, { signal: controller.signal });
        result.status_code = response.status;
        result.endpoint_ok = response.ok;
      } catch (error) {
        result.error = result.error || error.message;
      } finally {
        clearTimeout(timeout);
      }
    }

    result.healthy = result.process_alive && result.endpoint_ok;
    return result;
  }

  _recordLaunchReceipt(config, daemon, eventType, outcome, details = {}) {
    const receipt = {
      receipt_schema: 'mcp_daemon_launch_receipt_v1',
      task_id: LAUNCH_TASK_ID,
      event_type: eventType,
      outcome,
      emitted_at: new Date().toISOString(),
      daemon_id: config.id,
      server_package: config.packageName,
      startup_order: config.launchOrder,
      entrypoint: `${config.command} ${config.args.join(' ')}`,
      cwd: config.cwd,
      pid: daemon?.pid || null,
      port: config.port,
      endpoint: this._daemonEndpoint(config),
      transport: config.transport,
      rpc_path: config.rpcPath,
      health_path: config.healthPath,
      mediation_hook: 'ControlSurfaceInvocationGate.beforeInvoke',
      control_surface_contract_ref: config.mediationContractRef,
      swissknife_consumer: config.swissknifeConsumer,
      glasses_render_profile: 'daemon-health-summary',
      restart_count: daemon?.restartCount || this.restartCounts.get(config.id) || 0,
      max_restarts: this.maxRestarts,
      redaction_profile: 'launch-receipt-redacted',
      details
    };
    receipt.receipt_cid = stableReceiptCid(receipt);
    this.launchReceipts.push(receipt);
    if (this.launchReceipts.length > 500) {
      this.launchReceipts = this.launchReceipts.slice(-500);
    }
    this.emit('launch-receipt', receipt);
    return receipt;
  }
}

export default MCPDaemonManager;
export { MCPDaemonManager };
