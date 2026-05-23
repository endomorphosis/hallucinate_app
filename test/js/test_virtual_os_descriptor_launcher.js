import assert from 'assert/strict';

import {
  DescriptorPackValidationError,
  VirtualOSDescriptorLauncher,
  appRegistrationFromDescriptor,
  normalizeAppDescriptor,
  normalizeSwissKnifeDescriptorPack,
  renderVirtualOSDescriptorLauncherHTML,
  validateSwissKnifeDescriptorPack
} from '../../hallucinate_app/node/dashboard/virtual_os_descriptor_launcher.js';

async function runTests() {
  await testLauncherConsumesPackAndRoutesPanels();
  testPackValidationRejectsInvalidDescriptor();
  testMcpUiProfileDescriptorNormalizesToDashboardApp();
  testLaunchRoutesToDashboardRuntime();
  testRenderedHtmlEscapesDescriptorFields();
  console.log('Virtual OS descriptor launcher tests passed');
}

async function testLauncherConsumesPackAndRoutesPanels() {
  const element = new FakeElement();
  const eventBus = new FakeEventBus();
  const runtime = new FakeDashboardRuntime();
  const launcher = new VirtualOSDescriptorLauncher({
    element,
    eventBus,
    dashboardRuntime: runtime,
    descriptorPacks: [sampleDescriptorPack()]
  });

  await launcher.init();

  const registrations = launcher.getRegistrations();
  assert.equal(registrations.length, 2);
  assert.deepEqual(registrations.map((entry) => entry.appId).sort(), [
    'dataset-browser',
    'mcp-mesh-control'
  ]);
  assert.equal(runtime.panels.length, 2);
  assert.equal(runtime.panels[0].descriptorApp, true);
  assert.equal(runtime.panels[0].component.registration.component, 'DescriptorAppComponent');
  assert.match(element.innerHTML, /SwissKnife Descriptors/);
  assert.match(element.innerHTML, /data-testid="virtual-os-descriptor-count">2/);
  assert.match(element.innerHTML, /Dataset Browser/);
  assert.match(element.innerHTML, /MCP Mesh Control/);
  assert.equal(eventBus.count('virtual-os-descriptors:pack-loaded'), 1);
}

function testPackValidationRejectsInvalidDescriptor() {
  const validation = validateSwissKnifeDescriptorPack({
    id: 'broken-pack',
    version: '1.0.0',
    source_repository: 'https://example.invalid/swissknife',
    service_owner: 'swissknife',
    descriptors: [
      {
        meta: { id: 'broken', name: 'Broken', version: 'not-semver' },
        services: []
      }
    ]
  });

  assert.equal(validation.valid, false);
  assert(validation.errors.some((error) => error.path === 'descriptors[0].meta.version'));
  assert(validation.errors.some((error) => error.path === 'descriptors[0].ui'));

  const launcher = new VirtualOSDescriptorLauncher();
  assert.throws(
    () => launcher.consumeDescriptorPack({
      id: 'broken-pack',
      version: '1.0.0',
      descriptors: [{ meta: { id: 'broken' } }]
    }),
    DescriptorPackValidationError
  );
}

function testMcpUiProfileDescriptorNormalizesToDashboardApp() {
  const normalized = normalizeSwissKnifeDescriptorPack({
    id: 'profile-pack',
    version: '0.1.0',
    descriptors: [sampleMcpUiProfileDescriptor()]
  }, {
    source_repository: 'https://example.invalid/swissknife',
    service_owner: 'swissknife'
  });
  const validation = validateSwissKnifeDescriptorPack(normalized);
  assert.equal(validation.valid, true);

  const appDescriptor = normalizeAppDescriptor(normalized.descriptors[0], {
    packId: normalized.id
  });
  const registration = appRegistrationFromDescriptor(appDescriptor, {
    packId: normalized.id
  });

  assert.equal(appDescriptor.meta.id, 'mcp-mesh-control');
  assert.equal(appDescriptor.ui.template, 'dashboard');
  assert.equal(appDescriptor.services[0].name, 'mcp_registry');
  assert.equal(appDescriptor.actions.refresh.operation, 'refresh');
  assert.equal(registration.panelId, 'descriptor-mcp-mesh-control');
  assert.equal(registration.component, 'DescriptorAppComponent');
}

function testLaunchRoutesToDashboardRuntime() {
  const runtime = new FakeDashboardRuntime();
  const launcher = new VirtualOSDescriptorLauncher({
    dashboardRuntime: runtime
  });

  launcher.consumeDescriptorPack(sampleDescriptorPack());
  const launchResult = launcher.launch('dataset-browser');

  assert.equal(launchResult.launched, true);
  assert.equal(launchResult.method, 'openPanel');
  assert.deepEqual(runtime.openedPanels, ['descriptor-dataset-browser']);
}

function testRenderedHtmlEscapesDescriptorFields() {
  const descriptor = sampleAppDescriptor({
    id: 'unsafe-app',
    name: '<script>alert("x")</script>',
    title: '<b>Unsafe</b>'
  });
  const registration = appRegistrationFromDescriptor(descriptor, {
    packId: 'unsafe-pack',
    sourceRepository: '<img src=x>'
  });
  const html = renderVirtualOSDescriptorLauncherHTML({
    packs: [{
      id: 'unsafe-pack',
      version: '1.0.0',
      source_repository: '<img src=x>',
      descriptor_count: 1
    }],
    registrations: [registration],
    validationResults: []
  });

  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>Unsafe/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;b&gt;Unsafe&lt;\/b&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
}

function sampleDescriptorPack() {
  return {
    id: 'org.swissknife.desktop.descriptor-pack',
    version: '1.0.0',
    source_repository: 'https://github.com/endomorphosis/swissknife',
    service_owner: 'swissknife',
    descriptors: [
      sampleAppDescriptor(),
      sampleMcpUiProfileDescriptor()
    ],
    required_surfaces: ['browse', 'refresh'],
    backend_bindings: [
      {
        surface: 'browse',
        operation: 'browse',
        tool_module: 'ipfs_datasets_py.mcp_server.tools.dataset_tools.load_dataset',
        tool_function: 'load_dataset',
        payload_contracts: ['dataset_ref']
      },
      {
        surface: 'refresh',
        operation: 'refresh',
        tool_module: 'ipfs_datasets_py.mcp_server.p2p_mcp_registry_adapter',
        tool_function: 'list_interfaces',
        payload_contracts: ['service_ref'],
        stream: {
          kind: 'events',
          event_contract: 'service_ref'
        }
      }
    ],
    normalized_contracts: {
      dataset_ref: { type: 'object' },
      service_ref: { type: 'object' }
    }
  };
}

function sampleAppDescriptor(overrides = {}) {
  const id = overrides.id || 'dataset-browser';
  const name = overrides.name || 'Dataset Browser';
  const title = overrides.title || 'Dataset Browser';
  return {
    contractVersion: '1.0.0',
    lifecycle: ['discover', 'bind', 'authorize', 'invoke', 'stream_updates', 'recover'],
    compatibilityPolicy: {
      semver: true,
      allowMinorAdditiveOnly: true
    },
    meta: {
      id,
      name,
      version: '1.2.0',
      description: 'Descriptor-driven dataset browser.'
    },
    services: [
      {
        name: 'ipfs_datasets',
        version: '1.0.0',
        endpoint: 'mcp://ipfs-datasets',
        operations: ['browse', 'pin'],
        streams: ['progress']
      }
    ],
    ui: {
      template: 'explorer',
      window: {
        title,
        icon: 'database',
        singleton: true
      },
      regions: [
        { name: 'Datasets', description: 'Dataset catalog' }
      ],
      commands: [
        { action: 'browse', label: 'Browse' }
      ]
    },
    dataContracts: {
      entities: {
        dataset: { fields: ['id', 'cid'] }
      }
    },
    permissions: ['ipfs:read'],
    stateModel: {
      conflictPolicy: 'remote-authoritative'
    },
    actions: {
      browse: {
        service: 'ipfs_datasets',
        operation: 'browse'
      }
    }
  };
}

function sampleMcpUiProfileDescriptor() {
  const objectSchema = { type: 'object', additionalProperties: true };
  return {
    name: 'MCP Mesh Control Profile',
    namespace: 'swissknife.mcp.mesh',
    version: '0.1.0',
    methods: [
      { name: 'refresh', input_schema: objectSchema, output_schema: objectSchema },
      { name: 'status', input_schema: objectSchema, output_schema: objectSchema }
    ],
    errors: [],
    requires: [],
    compatibility: {
      semver: true
    },
    meta: {
      profile: 'swissknife.mcp++/ui-profile',
      profile_version: '0.1.0',
      app_id: 'mcp-mesh-control',
      title: 'MCP Mesh Control',
      description: 'Descriptor-driven MCP mesh control surface.',
      icon: 'plug'
    },
    services: [
      {
        id: 'mcp_registry',
        interface_type: 'generic',
        endpoint: 'mcp://registry',
        operations: ['refresh', 'status']
      }
    ],
    ui: {
      primary_template: 'dashboard',
      templates: [
        {
          kind: 'dashboard',
          operations: ['refresh', 'status'],
          regions: [
            { id: 'overview', kind: 'status', operation: 'status' }
          ]
        }
      ],
      sections: [
        { id: 'overview', title: 'Overview', kind: 'status', operation: 'status' }
      ]
    },
    data_contracts: {
      operations: [
        {
          method: 'refresh',
          title: 'Refresh Services',
          input_schema: objectSchema,
          output_schema: objectSchema
        },
        {
          method: 'status',
          title: 'Read Status',
          input_schema: objectSchema,
          output_schema: objectSchema
        }
      ],
      schemas: {
        service: objectSchema
      }
    },
    permissions: {
      default_deny: true,
      operations: {
        refresh: ['mcp:discover'],
        status: ['mcp:read']
      }
    },
    state_model: {
      keys: ['services', 'selected_service'],
      events: ['service_refreshed'],
      replay: true
    }
  };
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

  querySelectorAll() {
    return [];
  }
}

class FakeDashboardRuntime {
  constructor() {
    this.panels = [];
    this.openedPanels = [];
  }

  addPanel(panel) {
    this.panels.push(panel);
    return panel.id;
  }

  openPanel(panelId) {
    this.openedPanels.push(panelId);
    return panelId;
  }
}

class FakeEventBus {
  constructor() {
    this.events = new Map();
  }

  emit(eventName, payload) {
    const rows = this.events.get(eventName) || [];
    rows.push(payload);
    this.events.set(eventName, rows);
  }

  count(eventName) {
    return (this.events.get(eventName) || []).length;
  }
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
