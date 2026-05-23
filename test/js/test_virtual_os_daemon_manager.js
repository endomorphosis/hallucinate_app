import assert from 'assert/strict';
import fs from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';

import {
  DEFAULT_DAEMON_CONFIG_PATH,
  REQUIRED_DAEMON_COMPONENT_IDS,
  VirtualOSDaemonManager,
  loadDaemonConfig
} from '../../hallucinate_app/node/virtual_os_daemon_manager.js';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

async function runTests() {
  const config = loadDaemonConfig(DEFAULT_DAEMON_CONFIG_PATH, { projectRoot: PROJECT_ROOT });
  assert.equal(config.schemaVersion, 'virtual-ai-os-daemons.v1');
  assert.deepEqual(
    new Set(config.daemons.map((daemon) => daemon.componentId)),
    new Set(REQUIRED_DAEMON_COMPONENT_IDS)
  );

  for (const daemon of config.daemons) {
    assert.ok(daemon.id);
    assert.ok(daemon.title);
    assert.ok(daemon.endpoint.host);
    assert.ok(Number.isInteger(daemon.endpoint.port));
    assert.ok(daemon.endpoint.url);
    assert.ok(daemon.launch.command);
    assert.ok(Array.isArray(daemon.launch.args));
    assert.ok(path.isAbsolute(daemon.launch.cwd));
    assert.ok(daemon.healthCheck.enabled);
    assert.ok(['http', 'tcp', 'process'].includes(daemon.healthCheck.type));
  }

  const ports = await reservePorts(config.daemons.length);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'virtual-os-daemons-'));
  const mockServerPath = path.join(tempDir, 'mock_daemon.cjs');
  await fs.writeFile(mockServerPath, mockServerSource(), 'utf8');

  const mockConfig = {
    ...config,
    defaults: {
      ...config.defaults,
      restartPolicy: {
        enabled: false,
        maxRestarts: 0,
        delayMs: 0
      },
      healthCheck: {
        enabled: true,
        type: 'http',
        method: 'GET',
        path: '/health',
        timeoutMs: 1000,
        intervalMs: 60000,
        expectedStatuses: [200]
      },
      launch: {
        ...config.defaults.launch,
        startupTimeoutMs: 5000,
        shutdownTimeoutMs: 2000
      }
    },
    daemons: config.daemons.map((daemon, index) => ({
      ...daemon,
      endpoint: {
        protocol: 'http',
        host: '127.0.0.1',
        port: ports[index],
        path: '/'
      },
      launch: {
        command: process.execPath,
        args: [mockServerPath],
        cwd: tempDir,
        stdio: 'pipe',
        shell: false,
        startupTimeoutMs: 5000,
        shutdownTimeoutMs: 2000,
        env: {
          VIRTUAL_AI_OS_COMPONENT: daemon.componentId,
          PORT: '${port}'
        }
      },
      healthCheck: {
        enabled: true,
        type: 'http',
        method: 'GET',
        path: '/health',
        timeoutMs: 1000,
        intervalMs: 60000,
        expectedStatuses: [200]
      }
    }))
  };

  const manager = new VirtualOSDaemonManager({
    config: mockConfig,
    projectRoot: PROJECT_ROOT,
    logger: silentLogger()
  });

  try {
    assert.deepEqual(manager.daemonIds().sort(), REQUIRED_DAEMON_COMPONENT_IDS.slice().sort());

    for (const daemon of mockConfig.daemons) {
      const launchPlan = manager.getLaunchPlan(daemon.id);
      assert.equal(launchPlan.command, process.execPath);
      assert.equal(launchPlan.args[0], mockServerPath);
      assert.equal(launchPlan.cwd, tempDir);
      assert.equal(launchPlan.env.PORT, String(daemon.endpoint.port));
      assert.equal(launchPlan.env.VIRTUAL_AI_OS_COMPONENT, daemon.componentId);
    }

    await manager.startAll({ monitorHealth: false });
    await Promise.all(
      manager.daemonIds().map((id) => manager.waitForHealthy(id, {
        timeoutMs: 5000,
        pollIntervalMs: 50
      }))
    );

    const health = await manager.healthCheckAll();
    for (const id of REQUIRED_DAEMON_COMPONENT_IDS) {
      assert.equal(health[id].ok, true, `${id} should pass health check`);
      assert.equal(health[id].state, 'healthy');
      assert.equal(health[id].statusCode, 200);
    }

    const statuses = manager.getAllStatus();
    for (const id of REQUIRED_DAEMON_COMPONENT_IDS) {
      assert.equal(statuses[id].status, 'running');
      assert.equal(statuses[id].health.state, 'healthy');
      assert.ok(statuses[id].pid);
    }
  } finally {
    await manager.stopAll('test-complete');
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  const stopped = manager.getAllStatus();
  for (const id of REQUIRED_DAEMON_COMPONENT_IDS) {
    assert.equal(stopped[id].status, 'stopped');
    assert.equal(stopped[id].pid, null);
  }

  console.log('Virtual OS daemon manager tests passed');
}

async function reservePorts(count) {
  const ports = [];
  for (let index = 0; index < count; index += 1) {
    ports.push(await reservePort());
  }
  return ports;
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function mockServerSource() {
  return `
const http = require('node:http');

const port = Number(process.env.PORT);
const component = process.env.VIRTUAL_AI_OS_COMPONENT || 'unknown';

if (!Number.isInteger(port) || port <= 0) {
  console.error('PORT must be set');
  process.exit(2);
}

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, component }));
    return;
  }
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end(component);
});

server.listen(port, '127.0.0.1', () => {
  console.log('ready ' + component + ' ' + port);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
`;
}

function silentLogger() {
  return {
    log() {},
    info() {},
    warn() {},
    error() {}
  };
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
