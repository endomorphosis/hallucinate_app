import assert from 'assert/strict';

import {
  VirtualOSHealthDashboard,
  normalizeVirtualOSHealthSnapshot,
  renderVirtualOSHealthHTML,
  snapshotFromDaemonStatus
} from '../../hallucinate_app/node/dashboard/virtual_os_health_dashboard.js';

async function runTests() {
  await testDashboardRendersInjectedSnapshot();
  testDaemonStatusMapNormalizesWithoutStartingDaemons();
  testRenderedHtmlEscapesDashboardFields();
  await testEventBusSnapshotUpdatesRenderedHealth();
  console.log('Virtual OS health dashboard tests passed');
}

async function testDashboardRendersInjectedSnapshot() {
  const element = new FakeElement();
  const eventBus = new FakeEventBus();
  const source = {
    calls: 0,
    async getDashboardSnapshot() {
      this.calls += 1;
      return sampleSnapshot();
    }
  };

  const dashboard = new VirtualOSHealthDashboard({
    element,
    eventBus,
    healthSource: source,
    refreshIntervalMs: 0
  });

  await dashboard.init();

  assert.equal(source.calls, 1);
  assert.match(element.innerHTML, /Virtual AI OS Health/);
  assert.match(element.innerHTML, /Component Health/);
  assert.match(element.innerHTML, /IPFS Accelerate/);
  assert.match(element.innerHTML, /GPU daemon disabled in test profile/);
  assert.match(element.innerHTML, /Daemon Status/);
  assert.match(element.innerHTML, /swissknife/);
  assert.match(element.innerHTML, /stopped/);
  assert.match(element.innerHTML, /MCP\+\+ Mesh Status/);
  assert.match(element.innerHTML, /data-testid="virtual-os-mcp-nodes">2/);
  assert.match(element.innerHTML, /data-testid="virtual-os-mcp-edges">1/);
  assert.match(element.innerHTML, /mcp\+\+\/event-dag/);
  assert.match(element.innerHTML, /Degraded Mode/);
}

function testDaemonStatusMapNormalizesWithoutStartingDaemons() {
  const snapshot = snapshotFromDaemonStatus({
    mcp_plus_plus: {
      id: 'mcp_plus_plus',
      componentId: 'mcp_plus_plus',
      title: 'MCP++ Service Mesh',
      status: 'running',
      pid: 4242,
      endpoint: {
        protocol: 'http',
        host: '127.0.0.1',
        port: 3005,
        path: '/'
      },
      health: {
        ok: true,
        state: 'healthy',
        checkedAt: '2026-05-22T20:00:00.000Z'
      },
      metadata: {
        mcpPlusPlusProfiles: ['mcp++/event-dag']
      }
    },
    swissknife: {
      id: 'swissknife',
      componentId: 'swissknife',
      title: 'SwissKnife Virtual Desktop',
      status: 'stopped',
      pid: null,
      endpoint: {
        protocol: 'http',
        host: '127.0.0.1',
        port: 3004,
        path: '/'
      },
      health: {
        ok: false,
        state: 'stopped',
        reason: 'desktop service disabled for test'
      }
    }
  });

  assert.equal(snapshot.daemons.length, 2);
  assert.equal(snapshot.components.length, 2);
  assert.equal(snapshot.mcpMesh.state, 'healthy');
  assert.equal(snapshot.mcpMesh.status, 'running');
  assert.equal(snapshot.health, 'degraded');
  assert.equal(snapshot.degradedMode.active, true);
  assert.match(snapshot.degradedMode.reason, /desktop service disabled/);
}

function testRenderedHtmlEscapesDashboardFields() {
  const html = renderVirtualOSHealthHTML({
    health: 'degraded',
    components: [
      {
        component: 'unsafe_component',
        state: 'degraded',
        message: '<script>alert("x")</script>'
      }
    ],
    daemons: [],
    mcp_dag: {
      nodes: [],
      edges: []
    },
    metadata: {
      degradedModeReason: '<b>mock degraded reason</b>'
    }
  }, {
    showRefreshButton: false
  });

  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>mock/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;mock degraded reason&lt;\/b&gt;/);
}

async function testEventBusSnapshotUpdatesRenderedHealth() {
  const element = new FakeElement();
  const eventBus = new FakeEventBus();
  const dashboard = new VirtualOSHealthDashboard({
    element,
    eventBus,
    snapshot: sampleSnapshot(),
    refreshIntervalMs: 0
  });

  await dashboard.init();
  assert.match(element.innerHTML, /GPU daemon disabled/);

  eventBus.emit('virtual-os-health:snapshot', {
    snapshot: {
      generated_at: '2026-05-22T20:05:00.000Z',
      health: 'unhealthy',
      components: [
        {
          component: 'ipfs_kit_py',
          state: 'unhealthy',
          message: 'required adapter missing'
        }
      ],
      daemons: [],
      mcp_dag: {
        nodes: [],
        edges: []
      },
      errors: ['required adapter missing']
    }
  });

  assert.match(element.innerHTML, /required adapter missing/);
  assert.match(element.innerHTML, /Unhealthy/);
}

function sampleSnapshot() {
  return normalizeVirtualOSHealthSnapshot({
    generated_at: '2026-05-22T20:00:00.000Z',
    health: 'degraded',
    components: [
      {
        component: 'ipfs_kit_py',
        state: 'healthy',
        daemon_id: 'ipfs_kit_py',
        message: 'storage ready'
      },
      {
        component: 'ipfs_accelerate_py',
        state: 'degraded',
        daemon_id: 'ipfs_accelerate_py',
        message: 'GPU daemon disabled in test profile'
      },
      {
        component: 'mcp_plus_plus',
        state: 'healthy',
        daemon_id: 'mcp_plus_plus',
        metadata: {
          mcpPlusPlusProfiles: ['mcp++/event-dag']
        }
      }
    ],
    daemons: [
      {
        daemon_id: 'ipfs_kit_py',
        component: 'ipfs_kit_py',
        state: 'healthy',
        status: 'running',
        pid: 1001,
        endpoint: 'http://127.0.0.1:3001/healthz'
      },
      {
        daemon_id: 'swissknife',
        component: 'swissknife',
        state: 'stopped',
        status: 'stopped',
        endpoint: 'http://127.0.0.1:3004/',
        last_error: 'desktop service disabled in test profile'
      },
      {
        daemon_id: 'mcp_plus_plus',
        component: 'mcp_plus_plus',
        state: 'healthy',
        status: 'running',
        pid: 1005,
        endpoint: 'http://127.0.0.1:3005/health'
      }
    ],
    mcp_dag: {
      nodes: [
        {
          node_id: 'node-1',
          event_id: 'event-1',
          event_type: 'virtual_os.daemon.heartbeat',
          peer_id: 'peer-a'
        },
        {
          node_id: 'node-2',
          event_id: 'event-2',
          event_type: 'virtual_os.compute.inference',
          peer_id: 'peer-a'
        }
      ],
      edges: [
        {
          parent_event_id: 'event-1',
          child_event_id: 'event-2'
        }
      ],
      root_event_ids: ['event-1'],
      orphan_parent_event_ids: []
    },
    notices: ['GPU daemon disabled in test profile'],
    metadata: {
      degradedModeReason: 'GPU daemon disabled in test profile'
    }
  });
}

class FakeElement {
  constructor() {
    this.innerHTML = '';
    this.classes = new Set();
    this.classList = {
      add: (...classes) => {
        for (const className of classes) {
          this.classes.add(className);
        }
      }
    };
  }

  querySelector() {
    return null;
  }
}

class FakeEventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    const listeners = this.listeners.get(eventName) || [];
    listeners.push(handler);
    this.listeners.set(eventName, listeners);
  }

  emit(eventName, payload) {
    for (const handler of this.listeners.get(eventName) || []) {
      handler(payload);
    }
  }
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
