/**
 * Virtual AI OS daemon manager.
 *
 * This manager is intentionally config-first: all component daemons use the
 * same launch, endpoint, restart, and health-check schema.
 */

import { spawn as defaultSpawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import http from 'http';
import https from 'https';
import net from 'net';
import path from 'path';
import url from 'url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_DAEMON_CONFIG_PATH = path.join(PROJECT_ROOT, 'config', 'virtual_ai_os_daemons.json');
export const REQUIRED_DAEMON_COMPONENT_IDS = Object.freeze([
  'ipfs_kit_py',
  'ipfs_datasets_py',
  'ipfs_accelerate_py',
  'swissknife',
  'mcp_plus_plus'
]);

const DEFAULT_HEALTH = Object.freeze({
  enabled: true,
  type: 'http',
  method: 'GET',
  path: '/health',
  timeoutMs: 2500,
  intervalMs: 30000,
  expectedStatuses: [200]
});

const DEFAULT_LAUNCH = Object.freeze({
  shell: false,
  stdio: 'pipe',
  startupTimeoutMs: 15000,
  shutdownTimeoutMs: 5000
});

const DEFAULT_RESTART_POLICY = Object.freeze({
  enabled: true,
  maxRestarts: 3,
  delayMs: 5000
});

export class DaemonConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DaemonConfigError';
  }
}

export function loadDaemonConfig(configPath = DEFAULT_DAEMON_CONFIG_PATH, options = {}) {
  const resolvedPath = path.resolve(configPath);
  const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  return normalizeDaemonConfig(payload, {
    projectRoot: options.projectRoot || PROJECT_ROOT,
    configPath: resolvedPath
  });
}

export function normalizeDaemonConfig(payload, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new DaemonConfigError('Daemon config must be a JSON object.');
  }
  if (!payload.schemaVersion) {
    throw new DaemonConfigError('Daemon config is missing schemaVersion.');
  }
  if (!Array.isArray(payload.daemons) || payload.daemons.length === 0) {
    throw new DaemonConfigError('Daemon config must define a non-empty daemons array.');
  }

  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const defaults = payload.defaults || {};
  const ids = new Set();
  const componentIds = new Set();

  const daemons = payload.daemons.map((daemon, index) => {
    const normalized = normalizeDaemon(daemon, {
      defaults,
      projectRoot,
      index
    });
    if (ids.has(normalized.id)) {
      throw new DaemonConfigError(`Duplicate daemon id: ${normalized.id}`);
    }
    ids.add(normalized.id);
    componentIds.add(normalized.componentId);
    return normalized;
  });

  for (const componentId of REQUIRED_DAEMON_COMPONENT_IDS) {
    if (!componentIds.has(componentId)) {
      throw new DaemonConfigError(`Daemon config is missing required component endpoint: ${componentId}`);
    }
  }

  return {
    schemaVersion: String(payload.schemaVersion),
    generatedAt: payload.generatedAt || null,
    description: payload.description || '',
    defaults: {
      ...defaults,
      launch: { ...DEFAULT_LAUNCH, ...(defaults.launch || {}) },
      restartPolicy: { ...DEFAULT_RESTART_POLICY, ...(defaults.restartPolicy || {}) },
      healthCheck: { ...DEFAULT_HEALTH, ...(defaults.healthCheck || {}) },
      env: { ...(defaults.env || {}) }
    },
    daemons,
    configPath: options.configPath ? path.resolve(options.configPath) : null,
    projectRoot
  };
}

export class VirtualOSDaemon extends EventEmitter {
  constructor(config, options = {}) {
    super();
    this.config = config;
    this.spawn = options.spawn || defaultSpawn;
    this.logger = options.logger || console;
    this.process = null;
    this.status = 'stopped';
    this.pid = null;
    this.restartCount = 0;
    this.startedAt = null;
    this.stoppedAt = null;
    this.lastError = null;
    this.lastHealth = null;
    this.logs = [];
    this.healthTimer = null;
    this.restartTimer = null;
    this.intentionalStop = false;
  }

  getLaunchPlan() {
    return buildLaunchPlan(this.config);
  }

  async start(options = {}) {
    if (this.status === 'running' || this.status === 'starting') {
      return this.getStatus();
    }

    const launch = this.getLaunchPlan();
    this.intentionalStop = false;
    this.status = 'starting';
    this.startedAt = new Date().toISOString();
    this.stoppedAt = null;
    this.lastError = null;
    this.emit('starting', { id: this.config.id, launch });

    try {
      this.process = this.spawn(launch.command, launch.args, {
        cwd: launch.cwd,
        env: launch.env,
        shell: launch.shell,
        stdio: launch.stdio
      });
    } catch (error) {
      this.status = 'failed';
      this.lastError = error.message;
      this.emit('error', { id: this.config.id, error });
      throw error;
    }

    this.pid = this.process.pid || null;
    this.attachProcessHandlers(this.process);
    this.status = 'running';
    this.emit('started', { id: this.config.id, pid: this.pid });

    if (this.config.healthCheck.enabled && options.monitorHealth !== false) {
      this.startHealthMonitoring();
    }

    return this.getStatus();
  }

  async stop(reason = 'requested') {
    this.intentionalStop = true;
    this.stopHealthMonitoring();
    this.clearRestartTimer();

    if (!this.process) {
      this.status = 'stopped';
      this.pid = null;
      this.stoppedAt = new Date().toISOString();
      return this.getStatus();
    }

    const proc = this.process;
    this.status = 'stopping';
    this.emit('stopping', { id: this.config.id, reason });

    if (isChildRunning(proc)) {
      const signal = this.config.launch.stopSignal || 'SIGTERM';
      proc.kill(signal);
      await waitForExit(proc, this.config.launch.shutdownTimeoutMs);
      if (isChildRunning(proc)) {
        proc.kill('SIGKILL');
        await waitForExit(proc, 1000);
      }
    }

    this.process = null;
    this.pid = null;
    this.status = 'stopped';
    this.stoppedAt = new Date().toISOString();
    this.emit('stopped', { id: this.config.id, reason });
    return this.getStatus();
  }

  async restart(reason = 'requested') {
    await this.stop(reason);
    return this.start();
  }

  startHealthMonitoring() {
    this.stopHealthMonitoring();
    const intervalMs = this.config.healthCheck.intervalMs;
    if (!intervalMs || intervalMs <= 0) {
      return;
    }
    this.healthTimer = setInterval(() => {
      this.healthCheck().catch((error) => {
        this.recordHealth({
          ok: false,
          state: 'unhealthy',
          error: error.message,
          checkedAt: new Date().toISOString()
        });
      });
    }, intervalMs);
    if (typeof this.healthTimer.unref === 'function') {
      this.healthTimer.unref();
    }
  }

  stopHealthMonitoring() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  async healthCheck() {
    const started = Date.now();
    if (!isChildRunning(this.process)) {
      return this.recordHealth({
        ok: false,
        state: 'unhealthy',
        reason: 'process_not_running',
        endpoint: this.config.endpoint.url,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started
      });
    }

    let probe;
    if (this.config.healthCheck.type === 'tcp') {
      probe = await tcpHealthCheck(this.config.endpoint, this.config.healthCheck);
    } else if (this.config.healthCheck.type === 'process') {
      probe = { ok: true, state: 'healthy', endpoint: this.config.endpoint.url };
    } else {
      probe = await httpHealthCheck(this.config.endpoint, this.config.healthCheck);
    }

    return this.recordHealth({
      ...probe,
      state: probe.ok ? 'healthy' : 'unhealthy',
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started
    });
  }

  getStatus() {
    return {
      id: this.config.id,
      componentId: this.config.componentId,
      title: this.config.title,
      status: this.status,
      pid: this.pid,
      endpoint: this.config.endpoint,
      restartCount: this.restartCount,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      uptimeMs: this.startedAt && this.status === 'running'
        ? Date.now() - Date.parse(this.startedAt)
        : 0,
      lastError: this.lastError,
      health: this.lastHealth || {
        ok: false,
        state: 'unknown',
        checkedAt: null
      },
      recentLogs: this.logs.slice(-10)
    };
  }

  attachProcessHandlers(proc) {
    proc.stdout?.on('data', (data) => this.addLog('stdout', data));
    proc.stderr?.on('data', (data) => this.addLog('stderr', data));

    proc.on('error', (error) => {
      this.status = 'failed';
      this.lastError = error.message;
      this.emit('daemon-error', { id: this.config.id, error });
    });

    proc.on('exit', (code, signal) => {
      this.stopHealthMonitoring();
      this.process = null;
      this.pid = null;
      this.stoppedAt = new Date().toISOString();

      if (this.intentionalStop || this.status === 'stopping') {
        this.status = 'stopped';
        this.emit('stopped', { id: this.config.id, code, signal });
        return;
      }

      this.status = code === 0 ? 'stopped' : 'crashed';
      if (code !== 0) {
        this.lastError = `Exited with code ${code}${signal ? ` signal ${signal}` : ''}`;
      }
      this.emit('exited', { id: this.config.id, code, signal });

      const restartPolicy = this.config.restartPolicy;
      if (restartPolicy.enabled && code !== 0 && this.restartCount < restartPolicy.maxRestarts) {
        this.restartCount += 1;
        this.restartTimer = setTimeout(() => {
          this.start().catch((error) => {
            this.status = 'failed';
            this.lastError = error.message;
            this.emit('daemon-error', { id: this.config.id, error });
          });
        }, restartPolicy.delayMs);
        if (typeof this.restartTimer.unref === 'function') {
          this.restartTimer.unref();
        }
      }
    });
  }

  addLog(level, data) {
    const message = data.toString().trim();
    if (!message) {
      return;
    }
    this.logs.push({ level, message, time: new Date().toISOString() });
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(-100);
    }
    this.emit('log', { id: this.config.id, level, message });
  }

  recordHealth(health) {
    this.lastHealth = health;
    this.emit('health-check', { id: this.config.id, health });
    return health;
  }

  clearRestartTimer() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }
}

export class VirtualOSDaemonManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
    this.config = options.config
      ? normalizeDaemonConfig(options.config, { projectRoot: this.projectRoot })
      : loadDaemonConfig(options.configPath || DEFAULT_DAEMON_CONFIG_PATH, { projectRoot: this.projectRoot });
    this.spawn = options.spawn || defaultSpawn;
    this.logger = options.logger || console;
    this.daemons = new Map();
    this.daemonConfigs = this.config.daemons;

    for (const daemonConfig of this.daemonConfigs) {
      this.registerDaemon(daemonConfig);
    }
  }

  registerDaemon(daemonConfig) {
    const daemon = new VirtualOSDaemon(daemonConfig, {
      spawn: this.spawn,
      logger: this.logger
    });
    this.forwardDaemonEvents(daemon);
    this.daemons.set(daemonConfig.id, daemon);
    return daemon;
  }

  daemonIds() {
    return Array.from(this.daemons.keys());
  }

  getDaemon(id) {
    const daemon = this.daemons.get(id);
    if (!daemon) {
      throw new Error(`Unknown daemon: ${id}`);
    }
    return daemon;
  }

  getLaunchPlan(id) {
    return this.getDaemon(id).getLaunchPlan();
  }

  async startDaemon(id, options = {}) {
    const daemon = this.getDaemon(id);
    const status = await daemon.start(options);
    if (options.waitForHealth) {
      await this.waitForHealthy(id, options);
    }
    return status;
  }

  async stopDaemon(id, reason = 'requested') {
    return this.getDaemon(id).stop(reason);
  }

  async restartDaemon(id, options = {}) {
    await this.getDaemon(id).restart(options.reason || 'requested');
    if (options.waitForHealth) {
      await this.waitForHealthy(id, options);
    }
    return this.getDaemon(id).getStatus();
  }

  async startAll(options = {}) {
    const statuses = await Promise.all(
      this.daemonIds().map((id) => this.startDaemon(id, options))
    );
    if (options.waitForHealth) {
      await Promise.all(this.daemonIds().map((id) => this.waitForHealthy(id, options)));
    }
    return statuses;
  }

  async stopAll(reason = 'requested') {
    return Promise.all(this.daemonIds().map((id) => this.stopDaemon(id, reason)));
  }

  async healthCheckDaemon(id) {
    return this.getDaemon(id).healthCheck();
  }

  async healthCheckAll() {
    const entries = await Promise.all(
      this.daemonIds().map(async (id) => [id, await this.healthCheckDaemon(id)])
    );
    return Object.fromEntries(entries);
  }

  async waitForHealthy(id, options = {}) {
    const timeoutMs = options.timeoutMs || this.getDaemon(id).config.launch.startupTimeoutMs;
    const intervalMs = options.pollIntervalMs || 100;
    const deadline = Date.now() + timeoutMs;
    let lastHealth = null;

    while (Date.now() <= deadline) {
      lastHealth = await this.healthCheckDaemon(id);
      if (lastHealth.ok) {
        return lastHealth;
      }
      await delay(intervalMs);
    }

    const error = new Error(`Daemon did not become healthy before timeout: ${id}`);
    error.lastHealth = lastHealth;
    throw error;
  }

  getStatus(id) {
    return this.getDaemon(id).getStatus();
  }

  getAllStatus() {
    return Object.fromEntries(this.daemonIds().map((id) => [id, this.getStatus(id)]));
  }

  forwardDaemonEvents(daemon) {
    const events = [
      'starting',
      'started',
      'stopping',
      'stopped',
      'exited',
      'daemon-error',
      'health-check',
      'log'
    ];
    for (const event of events) {
      daemon.on(event, (payload) => this.emit(event, payload));
    }
  }
}

export function buildLaunchPlan(config) {
  const context = buildTemplateContext(config);
  const launch = config.launch;
  return {
    command: renderTemplateValue(launch.command, context),
    args: renderTemplateValue(launch.args || [], context),
    cwd: launch.cwd,
    env: {
      ...process.env,
      ...renderTemplateValue(launch.env || {}, context)
    },
    shell: Boolean(launch.shell),
    stdio: launch.stdio || 'pipe'
  };
}

function normalizeDaemon(daemon, options) {
  if (!daemon || typeof daemon !== 'object' || Array.isArray(daemon)) {
    throw new DaemonConfigError(`Daemon at index ${options.index} must be an object.`);
  }

  const id = requireString(daemon.id, `daemons[${options.index}].id`);
  const componentId = requireString(daemon.componentId, `daemons[${options.index}].componentId`);
  const title = requireString(daemon.title, `daemons[${options.index}].title`);
  const endpoint = normalizeEndpoint(daemon.endpoint, options.defaults, id);
  const metadata = daemon.metadata && typeof daemon.metadata === 'object' ? { ...daemon.metadata } : {};

  const partialContext = {
    id,
    componentId,
    title,
    projectRoot: options.projectRoot,
    host: endpoint.host,
    port: endpoint.port,
    protocol: endpoint.protocol,
    endpoint,
    metadata
  };

  const launch = normalizeLaunch(daemon.launch, options.defaults, options.projectRoot, partialContext, id);
  const context = {
    ...partialContext,
    cwd: launch.cwd
  };

  return {
    id,
    componentId,
    title,
    role: daemon.role || '',
    endpoint: {
      ...endpoint,
      url: endpoint.url || buildEndpointUrl(endpoint)
    },
    launch: renderTemplateValue(launch, context),
    restartPolicy: normalizeRestartPolicy(daemon.restartPolicy, options.defaults),
    healthCheck: normalizeHealthCheck(daemon.healthCheck, options.defaults, endpoint, context),
    metadata
  };
}

function normalizeEndpoint(endpoint, defaults, id) {
  if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint)) {
    throw new DaemonConfigError(`Daemon endpoint must be an object: ${id}`);
  }
  const protocol = String(endpoint.protocol || 'http');
  const host = String(endpoint.host || defaults.host || '127.0.0.1');
  const port = Number(endpoint.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new DaemonConfigError(`Daemon endpoint port must be a valid TCP port: ${id}`);
  }
  return {
    protocol,
    host,
    port,
    path: endpoint.path || '/',
    url: endpoint.url || null
  };
}

function normalizeLaunch(launch, defaults, projectRoot, context, id) {
  if (!launch || typeof launch !== 'object' || Array.isArray(launch)) {
    throw new DaemonConfigError(`Daemon launch must be an object: ${id}`);
  }
  const merged = {
    ...DEFAULT_LAUNCH,
    ...(defaults.launch || {}),
    ...launch
  };
  if (!merged.command) {
    throw new DaemonConfigError(`Daemon launch command is required: ${id}`);
  }
  const renderedCwd = renderTemplateValue(merged.cwd || '.', context);
  const cwd = path.isAbsolute(renderedCwd)
    ? renderedCwd
    : path.resolve(projectRoot, renderedCwd);

  return {
    ...merged,
    args: Array.isArray(merged.args) ? merged.args : [],
    cwd,
    env: {
      ...(defaults.env || {}),
      ...(merged.env || {})
    },
    startupTimeoutMs: Number(merged.startupTimeoutMs || DEFAULT_LAUNCH.startupTimeoutMs),
    shutdownTimeoutMs: Number(merged.shutdownTimeoutMs || DEFAULT_LAUNCH.shutdownTimeoutMs)
  };
}

function normalizeRestartPolicy(restartPolicy, defaults) {
  const merged = {
    ...DEFAULT_RESTART_POLICY,
    ...(defaults.restartPolicy || {}),
    ...(restartPolicy || {})
  };
  return {
    enabled: Boolean(merged.enabled),
    maxRestarts: Number(merged.maxRestarts || 0),
    delayMs: Number(merged.delayMs || 0)
  };
}

function normalizeHealthCheck(healthCheck, defaults, endpoint, context) {
  const merged = {
    ...DEFAULT_HEALTH,
    ...(defaults.healthCheck || {}),
    ...(healthCheck || {})
  };
  const type = String(merged.type || inferHealthCheckType(endpoint.protocol));
  const rendered = renderTemplateValue(merged, context);
  return {
    enabled: rendered.enabled !== false,
    type,
    method: String(rendered.method || 'GET').toUpperCase(),
    path: rendered.path || '/health',
    url: rendered.url || null,
    timeoutMs: Number(rendered.timeoutMs || DEFAULT_HEALTH.timeoutMs),
    intervalMs: Number(rendered.intervalMs || DEFAULT_HEALTH.intervalMs),
    expectedStatuses: Array.isArray(rendered.expectedStatuses)
      ? rendered.expectedStatuses.map(Number)
      : DEFAULT_HEALTH.expectedStatuses
  };
}

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new DaemonConfigError(`Required string field is missing: ${field}`);
  }
  return value.trim();
}

function inferHealthCheckType(protocol) {
  return protocol === 'http' || protocol === 'https' ? 'http' : 'tcp';
}

function buildTemplateContext(config) {
  return {
    id: config.id,
    componentId: config.componentId,
    title: config.title,
    projectRoot: config.projectRoot || PROJECT_ROOT,
    cwd: config.launch?.cwd,
    host: config.endpoint.host,
    port: config.endpoint.port,
    protocol: config.endpoint.protocol,
    endpoint: config.endpoint,
    metadata: config.metadata || {}
  };
}

function renderTemplateValue(value, context) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Za-z0-9_.-]+)\}/g, (_match, key) => {
      const replacement = readContextValue(context, key);
      if (replacement === undefined || replacement === null) {
        throw new DaemonConfigError(`Unknown daemon config template variable: ${key}`);
      }
      return String(replacement);
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderTemplateValue(item, context));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderTemplateValue(item, context)])
    );
  }
  return value;
}

function readContextValue(context, key) {
  return key.split('.').reduce((cursor, part) => {
    if (cursor === undefined || cursor === null) {
      return undefined;
    }
    return cursor[part];
  }, context);
}

function buildEndpointUrl(endpoint) {
  if (endpoint.protocol === 'http' || endpoint.protocol === 'https') {
    return `${endpoint.protocol}://${endpoint.host}:${endpoint.port}${normalizeUrlPath(endpoint.path || '/')}`;
  }
  return `${endpoint.protocol}://${endpoint.host}:${endpoint.port}`;
}

function buildHealthUrl(endpoint, healthCheck) {
  if (healthCheck.url) {
    return healthCheck.url;
  }
  const protocol = endpoint.protocol === 'https' ? 'https' : 'http';
  return `${protocol}://${endpoint.host}:${endpoint.port}${normalizeUrlPath(healthCheck.path || endpoint.path || '/')}`;
}

function normalizeUrlPath(urlPath) {
  if (!urlPath) {
    return '/';
  }
  return urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
}

async function httpHealthCheck(endpoint, healthCheck) {
  const healthUrl = buildHealthUrl(endpoint, healthCheck);
  const parsed = new URL(healthUrl);
  const client = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const request = client.request(parsed, {
      method: healthCheck.method || 'GET',
      timeout: healthCheck.timeoutMs
    }, (response) => {
      response.resume();
      response.on('end', () => {
        const statusCode = response.statusCode || 0;
        settle({
          ok: healthCheck.expectedStatuses.includes(statusCode),
          statusCode,
          endpoint: healthUrl
        });
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error(`Health check timed out after ${healthCheck.timeoutMs}ms`));
    });
    request.on('error', (error) => {
      settle({
        ok: false,
        endpoint: healthUrl,
        error: error.message
      });
    });
    request.end();
  });
}

async function tcpHealthCheck(endpoint, healthCheck) {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: endpoint.host,
      port: endpoint.port
    });
    let settled = false;
    const settle = (result) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };
    socket.setTimeout(healthCheck.timeoutMs);
    socket.on('connect', () => settle({ ok: true, endpoint: endpoint.url }));
    socket.on('timeout', () => settle({ ok: false, endpoint: endpoint.url, error: 'timeout' }));
    socket.on('error', (error) => settle({ ok: false, endpoint: endpoint.url, error: error.message }));
  });
}

function isChildRunning(child) {
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}

function waitForExit(child, timeoutMs) {
  if (!isChildRunning(child)) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default VirtualOSDaemonManager;
