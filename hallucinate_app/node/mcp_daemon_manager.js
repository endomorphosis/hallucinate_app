/**
 * MCP Daemon Manager
 * Manages IPFS MCP server daemons and SwissKnife integration
 */

import { spawn, spawnSync } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import url from 'url';
import crypto from 'crypto';
import { getReporter, ErrorSource, ErrorLevel } from './github_issue_reporter.js';
import { ControlSurfaceInvocationGate } from './control_surface_invocation.js';
import { mcpServers } from './menu_config.js';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_HEALTH_INTERVAL_MS = 30000;
const DEFAULT_STARTUP_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESTARTS = 3;
const LAUNCH_TASK_ID = 'HAO-442';
const STARTUP_MESSAGE_PATTERNS = [
  /\bserver running\b/i,
  /\bapplication startup complete\b/i,
  /\buvicorn running on\b/i,
  /\blistening on\b/i,
  /\bmcp started:\b/i,
  /\bstarted mcp dashboard\b/i
];

const ACCELERATE_MCPPLUSPLUS_PROFILES = [
  'mcp++/profile-a-idl',
  'mcp++/profile-b-cid-artifacts',
  'mcp++/profile-c-ucan',
  'mcp++/profile-d-temporal-policy',
  'mcp++/profile-e-mcp-p2p'
];
const DASHBOARD_CATALOG_SCHEMA = 'hallucinate_app.mcp_dashboard_capability_catalog.v1';
const DASHBOARD_CATALOG_TASK_ID = 'HAO-677';
const DASHBOARD_RECEIPT_TASK_ID = 'HAO-680';
const SWISSKNIFE_DASHBOARD_CONSUMER_TASK_ID = 'HAO-681';
const DASHBOARD_CATALOG_GOAL_ID = 'VAIOS-G723';
const DASHBOARD_LAUNCH_OBJECTIVE_IDS = ['VAIOS-G723', 'VAIOS-G724', 'VAIOS-G728'];
const SWISSKNIFE_DASHBOARD_CONSUMER_PROOF = {
  task_id: SWISSKNIFE_DASHBOARD_CONSUMER_TASK_ID,
  depends_on: ['HAO-677', 'HAO-680'],
  evidence_term: 'Hallucinate App MCP dashboard catalog consumed by Swissknife applications',
  consumer_registry: 'hallucinate_app.swissknife.mcp_capability_registry',
  playwright_spec: 'swissknife/test/e2e/mcp-dashboard.spec.ts',
  validation_command: 'npm --prefix swissknife run test:e2e:mcp',
  discovery_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-681-swissknife-dashboard-catalog-consumer.md',
  receipt_fixture: 'swissknife/test/e2e/fixtures/hao-681-mcp-dashboard-catalog-consumer.json',
  applications: [
    {
      app_id: 'ipfs-kit-storage-console',
      role: 'storage',
      server_package: 'ipfs_kit_py',
      daemon_id: 'ipfs-kit'
    },
    {
      app_id: 'ipfs-datasets-workbench',
      role: 'dataset',
      server_package: 'ipfs_datasets_py',
      daemon_id: 'ipfs-datasets'
    },
    {
      app_id: 'ipfs-accelerate-console',
      role: 'compute',
      server_package: 'ipfs_accelerate_py',
      daemon_id: 'ipfs-accelerate'
    }
  ]
};
const MGW_533_LAUNCH_VALIDATION_GATE = {
  task_id: 'MGW-533',
  goal_id: 'VAIOS-G724',
  goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
  packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
  evidence_term: 'launch Playwright validation gate',
  playwright_specs: [
    'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
    'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
  ],
  validation_command: 'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-26-mgw-533-objective-gap-3e00ad2a0074.md'
};
const MGW_546_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'MGW-546',
  goal_id: 'VAIOS-G723',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-546-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-546-launch-playwright-validation-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-mgw-546-launch-playwright-validation-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-546-mcp-dashboard-launch-gate.json',
  attempt: 7,
  attempt_receipts: [
    'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-546-attempt-7-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-06-28-mgw-546-attempt-7-launch-playwright-validation-gate.md'
  ],
  child_goals: [
    'VAIOS-G723-C1 Catalog normalization',
    'VAIOS-G723-C2 Dashboard UI wiring',
    'VAIOS-G723-C3 Mediated tool-call receipts',
    'VAIOS-G723-C4 Swissknife consumers',
    'VAIOS-G723-C5 Playwright coverage',
    'VAIOS-G723-C6 Supervisor-generated follow-up subtasks'
  ],
  follow_up_subtasks: ['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683']
};
const MGW_547_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'MGW-547',
  goal_id: 'VAIOS-G723',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-547-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-547-launch-playwright-validation-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-mgw-547-launch-playwright-validation-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-547-mcp-dashboard-launch-gate.json',
  child_goals: [
    'VAIOS-G723-C1 Catalog normalization',
    'VAIOS-G723-C2 Dashboard UI wiring',
    'VAIOS-G723-C3 Mediated tool-call receipts',
    'VAIOS-G723-C4 Swissknife consumers',
    'VAIOS-G723-C5 Playwright coverage',
    'VAIOS-G723-C6 Supervisor-generated follow-up subtasks'
  ],
  follow_up_subtasks: ['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683']
};
const VAI_531_DASHBOARD_INTEROPERABILITY_GATE = {
  schema: 'mcp_dashboard_interoperability_gate_v1',
  task_id: 'VAI-531',
  backlog_task_id: 'HAO-714',
  goal_id: 'VAIOS-G723',
  lineage_id: 'VAIOS-G723:mcp-dashboard-interoperability',
  evidence_term: 'launch Playwright validation gate',
  gate_state: 'gate_open_until_playwright_passes',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-27-vai-531-objective-gap-7ea369464239.md',
  hallucinate_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-714-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-27-vai-531-mcp-dashboard-interoperability-gate.md',
  hallucinate_launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-714-mcp-dashboard-interoperability-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-531-mcp-dashboard-interoperability-gate.json',
  playwright_specs: [
    'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
    'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
  ],
  validation_commands: [
    'npm --prefix hallucinate_app run test:daemon-manager',
    'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
    'npm --prefix swissknife run test:e2e:mcp',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ],
  required_backends: [
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py'
  ],
  required_evidence: [
    'catalog normalization',
    'dashboard UI wiring',
    'mediated tool-call receipts',
    'Swissknife consumers',
    'Playwright coverage',
    'supervisor-generated follow-up subtasks',
    'daemon health',
    'MCP++ telemetry',
    'tools/list',
    'tools/call',
    'control_surface receipts',
    'launch Playwright validation gate'
  ],
  child_goals: [
    'VAIOS-G723-C1 Catalog normalization',
    'VAIOS-G723-C2 Dashboard UI wiring',
    'VAIOS-G723-C3 Mediated tool-call receipts',
    'VAIOS-G723-C4 Swissknife consumers',
    'VAIOS-G723-C5 Playwright coverage',
    'VAIOS-G723-C6 Supervisor-generated follow-up subtasks'
  ],
  catalog_source: 'hallucinate_app.node.mcp_daemon_manager.getDashboardCapabilityCatalog',
  catalog_schema: DASHBOARD_CATALOG_SCHEMA,
  catalog_fixture: 'hallucinate_app/test/e2e/fixtures/vai-512-mcp-dashboard-catalog.json',
  receipt_route: [
    'Hallucinate App dashboard action',
    'dashboard capability catalog',
    'interaction_envelope',
    'policy_decision',
    'mediation_receipt',
    'supervised MCP server transport',
    'Swissknife MCP dashboard capability registry'
  ],
  follow_up_subtasks: ['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683'],
  failure_rule: 'Any dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, or Playwright failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const MGW_550_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'MGW-550',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-550-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-550-launch-playwright-validation-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-550-mcp-dashboard-launch-gate.json'
};
const HAO_712_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'HAO-712',
  supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-712-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-712-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-712-mcp-dashboard-launch-gate.json'
};
const VAI_529_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-529',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-27-vai-529-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-529-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-529-mcp-dashboard-launch-gate.json'
};
const VAI_535_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-535',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-535-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-535-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-535-mcp-dashboard-launch-gate.json'
};
const VAI_537_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-537',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-537-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-537-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-537-mcp-dashboard-launch-gate.json'
};
const DASHBOARD_LAUNCH_VALIDATION_GATES = [
  MGW_533_LAUNCH_VALIDATION_GATE,
  MGW_546_LAUNCH_VALIDATION_GATE,
  MGW_547_LAUNCH_VALIDATION_GATE,
  MGW_550_LAUNCH_VALIDATION_GATE,
  HAO_712_LAUNCH_VALIDATION_GATE,
  VAI_529_LAUNCH_VALIDATION_GATE,
  VAI_535_LAUNCH_VALIDATION_GATE,
  VAI_537_LAUNCH_VALIDATION_GATE
];
const DAEMON_LAUNCH_GATE_TASK_ID = 'MGW-535';
const DAEMON_LAUNCH_GATE_VAI_TASK_ID = 'VAI-519';
const DAEMON_LAUNCH_GATE_VAI_TASK_IDS = ['VAI-519', 'VAI-530', 'VAI-536', 'VAI-540'];
const DAEMON_LAUNCH_GATE_BACKLOG_TASK_ID = 'HAO-702';
const DAEMON_LAUNCH_GATE_BACKLOG_TASK_IDS = ['HAO-702', 'HAO-713', 'HAO-719', 'HAO-721'];
const DAEMON_LAUNCH_GATE_GOAL_ID = 'VAIOS-G728';
const DAEMON_LAUNCH_GATE_PACKET_ID = 'goal_packet/launch/hallucinate_app/44dceea6bc53';
const DAEMON_LAUNCH_GATE_PACKET_GOALS = ['VAIOS-G724', 'VAIOS-G728'];
const DAEMON_LAUNCH_GATE_SPECS = [
  'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
  'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
  'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
];
const DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS = [
  'data/virtual_ai_os/discovery/2026-06-26-vai-519-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-06-27-vai-530-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-06-28-vai-536-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-06-28-vai-540-daemon-launch-health-gate.md',
  'data/meta_glasses_display_widgets/discovery/2026-06-26-mgw-535-daemon-launch-health-gate.md',
  'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-551-daemon-launch-health-gate.md'
];
const DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS = [
  'data/virtual_ai_os/discovery/2026-06-26-vai-519-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-06-27-vai-530-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-06-28-vai-536-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-06-28-vai-540-objective-gap-b023c8de5b69.md',
  'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-551-objective-gap-b023c8de5b69.md'
];
const DAEMON_LAUNCH_GATE_SUPERVISOR_GAP_RECEIPTS = [
  'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-702-objective-gap-b023c8de5b69.md',
  'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-objective-gap-b023c8de5b69.md',
  'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-objective-gap-b023c8de5b69.md',
  'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-objective-gap-b023c8de5b69.md'
];
const DAEMON_LAUNCH_GATE_HALLUCINATE_BACKLOG_RECEIPTS = [
  'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-702-daemon-launch-health-gate.md',
  'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-daemon-launch-health-gate.md',
  'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-daemon-launch-health-gate.md',
  'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-daemon-launch-health-gate.md'
];
const MGW_551_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'MGW-551',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-551-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-551-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-551-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'npm --prefix swissknife run test:e2e:meta-glasses',
    'npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts',
    'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
  ]
};
const VAI_536_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-536',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-536-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-536-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-536-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts',
    'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
  ]
};
const VAI_540_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-540',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-540-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-540-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-540-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts',
    'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
  ]
};
const HAO_719_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'HAO-719',
  objective_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-objective-gap-b023c8de5b69.md',
  supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-daemon-launch-health-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-719-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts',
    'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
  ]
};
const HAO_721_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'HAO-721',
  objective_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-objective-gap-b023c8de5b69.md',
  supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-daemon-launch-health-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-721-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts',
    'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
  ]
};

const DASHBOARD_TOOL_PROTOCOLS = {
  'ipfs-kit': {
    toolsList: {
      operation: 'tools/list',
      transport: 'http',
      method: 'GET',
      path: '/mcp/tools/list'
    },
    toolsCall: {
      operation: 'tools/call',
      transport: 'http',
      method: 'POST',
      path: '/mcp/tools/call',
      safeProbe: {
        tool_name: 'ipfs_status',
        arguments: {},
        mutation: false,
        expected_receipt: 'ipfs_kit_status_probe'
      }
    }
  },
  'ipfs-datasets': {
    toolsList: {
      operation: 'tools/list',
      transport: 'http',
      method: 'GET',
      path: '/datasets/list'
    },
    toolsCall: {
      operation: 'tools/call',
      transport: 'http',
      method: 'POST',
      path: '/datasets/load',
      safeProbe: {
        tool_name: 'datasets_list',
        arguments: { limit: 1 },
        mutation: false,
        expected_receipt: 'ipfs_datasets_list_probe'
      }
    }
  },
  'ipfs-accelerate': {
    toolsList: {
      operation: 'tools/list',
      transport: 'http',
      method: 'GET',
      path: '/models/list'
    },
    toolsCall: {
      operation: 'tools/call',
      transport: 'http',
      method: 'POST',
      path: '/inference',
      safeProbe: {
        tool_name: 'hardware_profile',
        arguments: { dry_run: true },
        mutation: false,
        expected_receipt: 'ipfs_accelerate_hardware_profile_probe'
      }
    }
  }
};

function stableReceiptCid(value) {
  const canonical = JSON.stringify(value);
  const digest = crypto.createHash('sha256').update(canonical).digest('hex');
  return `sha256:mcp_daemon_receipt:${digest}`;
}

class MCPDaemonManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.daemons = new Map();
    this.dashboardSidecars = new Map();
    this.mcpPlusPlusCapabilities = new Map();
    this.launchReceipts = [];
    this.restartCounts = new Map();
    this.healthCheckInterval = null;
    this.baseDir = path.join(__dirname, '..', '..');
    this.healthIntervalMs = Number(options.healthIntervalMs || process.env.MCP_DAEMON_HEALTH_INTERVAL_MS || DEFAULT_HEALTH_INTERVAL_MS);
    this.startupTimeoutMs = Number(options.startupTimeoutMs || process.env.MCP_DAEMON_STARTUP_TIMEOUT_MS || DEFAULT_STARTUP_TIMEOUT_MS);
    this.maxRestarts = Number(options.maxRestarts || process.env.MCP_DAEMON_MAX_RESTARTS || DEFAULT_MAX_RESTARTS);
    this.pythonCommand = options.pythonCommand || this._resolveDaemonPythonCommand();
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
        command: this.pythonCommand,
        args: ['-m', 'ipfs_kit_py.cli', 'mcp', 'start'],
        cwd: path.join(this.baseDir, 'ipfs_kit_py'),
        port: 8004,
        transport: 'http',
        rpcPath: '/mcp/tools/call',
        healthPath: '/api/mcp/status',
        detachedLauncher: true,
        swissknifeConsumer: 'Swissknife IPFS storage, pin dashboard, and backend health surfaces',
        mediationContractRef: 'control_surface_contract:mcp-daemon:ipfs-kit'
      },
      {
        id: 'ipfs-datasets',
        packageName: 'ipfs_datasets_py',
        name: 'IPFS Datasets MCP',
        launchOrder: 20,
        command: this.pythonCommand,
        args: ['-m', 'uvicorn', 'ipfs_datasets_py.mcp_server.fastapi_service:app', '--host', '127.0.0.1', '--port', '3002'],
        cwd: path.join(this.baseDir, 'ipfs_datasets_py'),
        port: 3002,
        transport: 'http',
        rpcPath: '/datasets/load',
        healthPath: '/health/ready',
        nativeDashboard: {
          port: 8899,
          path: '/mcp',
          catalogPath: '/api/hallucinate/dashboard-catalog',
          healthPath: '/api/mcp/status',
          command: this.pythonCommand,
          args: [path.join(this.baseDir, 'scripts', 'ipfs_datasets_dashboard_launcher.py'), '--host', '127.0.0.1', '--port', '8899', '--mcp-host', '127.0.0.1', '--mcp-port', '3002']
        },
        swissknifeConsumer: 'Swissknife dataset, content, index, provenance, and background task surfaces',
        mediationContractRef: 'control_surface_contract:mcp-daemon:ipfs-datasets'
      },
      {
        id: 'ipfs-accelerate',
        packageName: 'ipfs_accelerate_py',
        name: 'IPFS Accelerate MCP',
        launchOrder: 30,
        command: this.pythonCommand,
        args: ['-m', 'ipfs_accelerate_py.cli', 'mcp', 'start', '--port', '3003'],
        cwd: path.join(this.baseDir, 'ipfs_accelerate_py'),
        port: 3003,
        transport: 'http',
        rpcPath: '/mcp',
        healthPath: '/api/mcp/status',
        swissknifeConsumer: 'Swissknife hardware profile, inference job, job status, and telemetry surfaces',
        mediationContractRef: 'control_surface_contract:mcp-daemon:ipfs-accelerate'
      }
    ];
  }

  _resolveDaemonPythonCommand() {
    const explicitPython = process.env.MCP_DAEMON_PYTHON;
    if (explicitPython) {
      return explicitPython;
    }

    const venvDir = process.env.VIRTUAL_ENV || path.resolve(this.baseDir, '..', '.venv');
    const candidate = process.platform === 'win32'
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python');

    if (fs.existsSync(candidate)) {
      return candidate;
    }

    return 'python';
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
      
      this._markDaemonStartedFromOutput(daemonId, daemon, config, message);
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
      if (config.detachedLauncher && code === 0) {
        daemon.launcherExited = true;
      } else {
        daemon.status = 'stopped';
      }
      this._recordLaunchReceipt(config, daemon, 'process_exit', code === 0 ? 'stopped' : 'error', {
        exit_code: code,
        signal,
        restart_count: daemon.restartCount
      });
      
      if (config.detachedLauncher && code === 0) {
        this.emit('log', {
          daemon: daemonId,
          level: 'info',
          message: `${config.name} launcher exited after handing off to the background service`
        });
        return;
      }

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

    await this._startNativeDashboardSidecar(config);
    await this._refreshMcpPlusPlusStatus(config, daemon);

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
    await this._stopNativeDashboardSidecar(daemonId);
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
        mcpPlusPlus: this._mcpPlusPlusStatus(id, daemon),
        endpoint: daemon.endpoint,
        nativeDashboard: this._nativeDashboardStatus(id),
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
      mcpPlusPlus: this._mcpPlusPlusStatus(daemonId, daemon),
      endpoint: daemon.endpoint,
      nativeDashboard: this._nativeDashboardStatus(daemonId),
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
        launch_objective_ids: DAEMON_LAUNCH_GATE_PACKET_GOALS,
        launch_validation_gate: {
          task_id: DAEMON_LAUNCH_GATE_TASK_ID,
          goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
          evidence_term: 'launch Playwright validation gate',
          playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts'
        },
        launch_validation_gates: [
          {
            task_id: DAEMON_LAUNCH_GATE_TASK_ID,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts'
          },
          {
            task_id: MGW_551_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            supervisor_gap_receipt: MGW_551_DAEMON_LAUNCH_VALIDATION_GATE.supervisor_gap_receipt
          },
          {
            task_id: VAI_536_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_536_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_536_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_540_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_540_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_540_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: HAO_719_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            supervisor_gap_receipt: HAO_719_DAEMON_LAUNCH_VALIDATION_GATE.supervisor_gap_receipt,
            launch_gate_receipt: HAO_719_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: HAO_721_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            supervisor_gap_receipt: HAO_721_DAEMON_LAUNCH_VALIDATION_GATE.supervisor_gap_receipt,
            launch_gate_receipt: HAO_721_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          }
        ],
        daemon_id: config.id,
        server_package: config.packageName,
        startup_order: config.launchOrder,
        entrypoint: `${config.command} ${config.args.join(' ')}`,
        cwd: config.cwd,
        endpoint: this._daemonEndpoint(config),
        transport: config.transport,
        rpc_path: config.rpcPath,
        health_path: config.healthPath,
        native_dashboard_url: config.nativeDashboard
          ? `http://127.0.0.1:${config.nativeDashboard.port}${config.nativeDashboard.path}`
          : null,
        native_dashboard_health_path: config.nativeDashboard?.healthPath || null,
        mcpplusplus: this._launchPlanMcpPlusPlus(config),
        mediation_contract_ref: config.mediationContractRef,
        swissknife_consumer: config.swissknifeConsumer,
        restart_behavior: `auto-restart after crash or failed process health up to ${this.maxRestarts} attempts`
      }));
  }

  getDaemonLaunchValidationGate(overrides = {}) {
    const launchPlan = this.getLaunchPlan();
    return {
      schema: 'hallucinate_app.daemon_launch_validation_gate.v1',
      receipt_schema: 'launch_readiness_receipt_v1',
      task_id: overrides.task_id || DAEMON_LAUNCH_GATE_TASK_ID,
      vai_task_id: DAEMON_LAUNCH_GATE_VAI_TASK_ID,
      vai_task_ids: [...DAEMON_LAUNCH_GATE_VAI_TASK_IDS],
      backlog_task_id: DAEMON_LAUNCH_GATE_BACKLOG_TASK_ID,
      backlog_task_ids: [...DAEMON_LAUNCH_GATE_BACKLOG_TASK_IDS],
      shared_packet_task_id: overrides.shared_packet_task_id || DAEMON_LAUNCH_GATE_TASK_ID,
      goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
      goal_packet: DAEMON_LAUNCH_GATE_PACKET_ID,
      packet_goals: [...DAEMON_LAUNCH_GATE_PACKET_GOALS],
      evidence_term: 'launch Playwright validation gate',
      launch_key: 'hallucinate-daemon-launch-orchestration',
      gate_state: 'gate_open_until_playwright_passes',
      discovery_receipts: overrides.discovery_receipts || [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
      objective_gap_receipt: overrides.objective_gap_receipt || 'data/virtual_ai_os/discovery/2026-06-26-vai-519-objective-gap-b023c8de5b69.md',
      objective_gap_receipts: Array.from(new Set([
        ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
        ...(overrides.objective_gap_receipts || []),
        ...(overrides.objective_gap_receipt ? [overrides.objective_gap_receipt] : [])
      ])),
      supervisor_gap_receipt: overrides.supervisor_gap_receipt || 'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-702-objective-gap-b023c8de5b69.md',
      supervisor_gap_receipts: [...DAEMON_LAUNCH_GATE_SUPERVISOR_GAP_RECEIPTS],
      hallucinate_backlog_receipt: overrides.hallucinate_backlog_receipt || 'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-702-daemon-launch-health-gate.md',
      hallucinate_backlog_receipts: [...DAEMON_LAUNCH_GATE_HALLUCINATE_BACKLOG_RECEIPTS],
      ...(overrides.launch_gate_receipt ? { launch_gate_receipt: overrides.launch_gate_receipt } : {}),
      ...(overrides.receipt_fixture ? { receipt_fixture: overrides.receipt_fixture } : {}),
      validation_commands: overrides.validation_commands || [
        'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
        'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
        'npm --prefix swissknife run test:e2e:meta-glasses',
        'npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
      ],
      playwright_specs: [...DAEMON_LAUNCH_GATE_SPECS],
      required_backends: launchPlan.map((entry) => entry.server_package),
      daemon_health_paths: launchPlan.map((entry) => ({
        daemon_id: entry.daemon_id,
        server_package: entry.server_package,
        endpoint: entry.endpoint,
        health_path: entry.health_path,
        rpc_path: entry.rpc_path,
        startup_order: entry.startup_order
      })),
      required_evidence: [
        'Hallucinate App daemon health',
        'daemon launcher',
        'MCP server',
        'MCP dashboard',
        'ipfs_accelerate_py',
        'ipfs_datasets_py',
        'ipfs_kit_py',
        'dashboard capability catalog',
        'Swissknife applications',
        'launch Playwright validation gate'
      ],
      swissknife_handoff: launchPlan.map((entry) => ({
        daemon_id: entry.daemon_id,
        server_package: entry.server_package,
        swissknife_consumer: entry.swissknife_consumer,
        mediation_contract_ref: entry.mediation_contract_ref
      })),
      failure_rule: 'Any daemon launch, health, dashboard catalog, Swissknife handoff, or Playwright validation failure remains supervisor-generated follow-up work for VAIOS-G728.'
    };
  }

  getDaemonLaunchValidationGates() {
    return [
      this.getDaemonLaunchValidationGate(),
      this.getDaemonLaunchValidationGate({
        ...MGW_551_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: 'MGW-551',
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: MGW_551_DAEMON_LAUNCH_VALIDATION_GATE.supervisor_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_536_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_536_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_540_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_540_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...HAO_719_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          HAO_719_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: HAO_719_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...HAO_721_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          HAO_721_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: HAO_721_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      })
    ];
  }

  getDashboardCapabilityCatalog() {
    return {
      schema: DASHBOARD_CATALOG_SCHEMA,
      task_id: DASHBOARD_CATALOG_TASK_ID,
      validation_task_id: 'VAI-512',
      goal_id: DASHBOARD_CATALOG_GOAL_ID,
      launch_objective_ids: DASHBOARD_LAUNCH_OBJECTIVE_IDS,
      launch_validation_gate: MGW_533_LAUNCH_VALIDATION_GATE,
      launch_validation_gates: DASHBOARD_LAUNCH_VALIDATION_GATES,
      dashboard_interoperability_validation_gate: VAI_531_DASHBOARD_INTEROPERABILITY_GATE,
      swissknife_catalog_consumer_proof: SWISSKNIFE_DASHBOARD_CONSUMER_PROOF,
      generated_by: 'hallucinate_app.node.mcp_daemon_manager.getDashboardCapabilityCatalog',
      dashboard_only_mocks: false,
      control_surface_route: [
        'Hallucinate App dashboard action',
        'dashboard capability catalog',
        'interaction_envelope',
        'policy_decision',
        'mediation_receipt',
        'supervised MCP server transport'
      ],
      servers: [...this.daemonConfigs]
        .sort((a, b) => a.launchOrder - b.launchOrder)
        .map((config) => this._dashboardCapabilityEntry(config))
    };
  }

  getDashboardCapability(daemonId) {
    return this._dashboardCapabilityEntry(this._requireDaemonConfig(daemonId));
  }

  async dashboardHealth(daemonId) {
    const config = this._requireDaemonConfig(daemonId);
    const health = await this.checkDaemonHealth(daemonId);
    const entry = this._dashboardCapabilityEntry(config);
    const receipt = {
      receipt_schema: 'mcp_dashboard_health_receipt_v1',
      task_id: DASHBOARD_RECEIPT_TASK_ID,
      goal_id: DASHBOARD_CATALOG_GOAL_ID,
      daemon_id: config.id,
      server_package: config.packageName,
      emitted_at: new Date().toISOString(),
      status: health.healthy ? 'ok' : 'fail_closed',
      fail_closed: !health.healthy,
      health,
      receipt_route: [
        'dashboard health probe',
        'dashboard capability catalog',
        'control_surface readiness check',
        'supervised MCP server transport'
      ],
      mcpplusplus_descriptor_evidence: this._mcpPlusPlusDescriptorEvidence(config),
      control_surface_contract_ref: config.mediationContractRef,
      dashboard_receipt_consumer_refs: this._dashboardReceiptConsumerRefs(config)
    };
    receipt.receipt_cid = stableReceiptCid(receipt);
    return { entry, health, receipt };
  }

  async dashboardToolsList(daemonId, invoker = null) {
    const config = this._requireDaemonConfig(daemonId);
    const entry = this._dashboardCapabilityEntry(config);
    const toolProtocol = entry.tool_protocols.tools_list;
    return this.invokeManagedService(daemonId, {
      method: toolProtocol.operation,
      target_ref: toolProtocol.url,
      tool_protocol: toolProtocol,
      surface: 'dashboard',
      surface_event: 'tools_list_probe',
      intent: `dashboard.tools_list.${daemonId}`,
      mcpplusplus: entry.mcpplusplus_descriptor_evidence,
      dashboard_receipt_consumer_refs: this._dashboardReceiptConsumerRefs(config)
    }, invoker || (async (_payload, mediation) => this._dashboardTransportProbe(config, toolProtocol, mediation)));
  }

  async dashboardToolsCall(daemonId, invoker = null) {
    const config = this._requireDaemonConfig(daemonId);
    const entry = this._dashboardCapabilityEntry(config);
    const toolProtocol = entry.tool_protocols.tools_call;
    const safeProbe = toolProtocol.safeProbe || {};
    return this.invokeManagedService(daemonId, {
      method: toolProtocol.operation,
      target_ref: toolProtocol.url,
      tool_name: safeProbe.tool_name,
      arguments: safeProbe.arguments || {},
      tool_protocol: toolProtocol,
      safe_probe: safeProbe,
      surface: 'dashboard',
      surface_event: 'safe_tools_call_probe',
      intent: `dashboard.safe_probe.${daemonId}`,
      mcpplusplus: entry.mcpplusplus_descriptor_evidence,
      dashboard_receipt_consumer_refs: this._dashboardReceiptConsumerRefs(config)
    }, invoker || (async (_payload, mediation) => this._dashboardTransportProbe(config, toolProtocol, mediation)));
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

  _nativeDashboardStatus(daemonId) {
    const sidecar = this.dashboardSidecars.get(daemonId);
    if (!sidecar) {
      return null;
    }

    return {
      pid: sidecar.process?.pid || null,
      port: sidecar.port,
      url: sidecar.url,
      healthUrl: sidecar.healthUrl,
      catalogUrl: sidecar.catalogUrl,
      status: sidecar.status
    };
  }

  _nativeDashboardUrl(config) {
    if (!config.nativeDashboard) {
      return null;
    }
    return `http://127.0.0.1:${config.nativeDashboard.port}${config.nativeDashboard.path}`;
  }

  _nativeDashboardCatalogUrl(config) {
    if (!config.nativeDashboard?.catalogPath) {
      return null;
    }
    return `http://127.0.0.1:${config.nativeDashboard.port}${config.nativeDashboard.catalogPath}`;
  }

  _dashboardToolProtocol(config) {
    const protocol = DASHBOARD_TOOL_PROTOCOLS[config.id] || {};
    const endpoint = this._daemonEndpoint(config);
    const withUrl = (value) => {
      if (!value) {
        return null;
      }
      return {
        ...value,
        url: `${endpoint}${value.path}`
      };
    };

    return {
      tools_list: withUrl(protocol.toolsList),
      tools_call: withUrl(protocol.toolsCall)
    };
  }

  _normalizedMcpPlusPlusStatus(config) {
    return this._mcpPlusPlusStatus(config.id) || this._launchPlanMcpPlusPlus(config) || {
      available: false,
      state: 'not_advertised',
      mode: 'not_advertised',
      supports_profile_negotiation: false,
      profiles: [],
      message: `${config.packageName} does not currently advertise MCP++ profiles through the dashboard catalog.`
    };
  }

  _dashboardCapabilityEntry(config) {
    const menuServer = mcpServers.find((server) => server.id === config.id) || {};
    const endpoint = this._daemonEndpoint(config);
    const nativeDashboardUrl = this._nativeDashboardUrl(config);
    const nativeDashboardCatalogUrl = this._nativeDashboardCatalogUrl(config);

    return {
      schema: `${DASHBOARD_CATALOG_SCHEMA}.server`,
      task_id: DASHBOARD_CATALOG_TASK_ID,
      goal_id: DASHBOARD_CATALOG_GOAL_ID,
      launch_objective_ids: DASHBOARD_LAUNCH_OBJECTIVE_IDS,
      daemon_id: config.id,
      server_package: config.packageName,
      display_name: menuServer.displayName || config.name,
      menu_label: menuServer.name || config.name,
      startup_order: config.launchOrder,
      port: config.port,
      endpoint,
      transport: config.transport,
      rpc_path: config.rpcPath,
      health_path: config.healthPath,
      health_url: `${endpoint}${config.healthPath}`,
      menu_dashboard_path: menuServer.dashboardPath || null,
      menu_dashboard_url: menuServer.webDashboardUrl || nativeDashboardUrl || `${endpoint}/dashboard`,
      native_dashboard_url: nativeDashboardUrl,
      native_dashboard_health_path: config.nativeDashboard?.healthPath || null,
      native_dashboard_catalog_url: nativeDashboardCatalogUrl,
      menu_tools: (menuServer.tools || [])
        .filter((tool) => tool && tool.type !== 'separator')
        .map((tool) => ({
          label: tool.label,
          url: tool.url || null,
          action: tool.action || null,
          app: tool.app || null
        })),
      tool_protocols: this._dashboardToolProtocol(config),
      mcpplusplus: this._normalizedMcpPlusPlusStatus(config),
      mcpplusplus_descriptor_evidence: this._mcpPlusPlusDescriptorEvidence(config),
      swissknife_consumer: config.swissknifeConsumer,
      control_surface_mediation_contract: config.mediationContractRef,
      control_surface_receipt_requirements: [
        'interaction_envelope',
        'policy_decision',
        'mediation_receipt',
        'receipt_ids',
        'daemon_id',
        'server_package',
        'tool_protocol',
        'safe_probe',
        'mcpplusplus_descriptor_evidence',
        'receipt_cid'
      ],
      dashboard_receipt_consumer_refs: this._dashboardReceiptConsumerRefs(config)
    };
  }

  _dashboardReceiptConsumerRefs(config) {
    return [
      'hallucinate_app.electron.dashboard',
      'hallucinate_app.swissknife.mcp_capability_registry',
      'launch_readiness_packet:VAIOS-G723',
      'launch_readiness_packet:VAIOS-G724',
      'launch_readiness_packet:VAIOS-G728',
      `mcp_daemon:${config.id}`
    ];
  }

  _mcpPlusPlusDescriptorEvidence(config) {
    const status = this._normalizedMcpPlusPlusStatus(config);
    return {
      evidence_label: 'MCP++ descriptor/profile evidence',
      daemon_id: config.id,
      server_package: config.packageName,
      descriptor_ref: status?.provider || status?.descriptor_ref || `${config.packageName}:mcpplusplus:not_advertised`,
      mode: status?.mode || 'not_advertised',
      available: Boolean(status?.available),
      supports_profile_negotiation: Boolean(status?.supports_profile_negotiation),
      profiles: Array.isArray(status?.profiles) ? [...status.profiles] : [],
      active_profile: status?.active_profile || null,
      bridge_to: status?.bridge_to || null,
      state: status?.state || (status ? 'catalog_advertised' : 'not_advertised'),
      message: status?.message || `${config.packageName} has no advertised MCP++ profile descriptor in the dashboard catalog.`
    };
  }

  async _dashboardTransportProbe(config, toolProtocol, mediation) {
    const health = await this.checkDaemonHealth(config.id);
    return {
      ok: health.healthy,
      fail_closed: !health.healthy,
      daemon_id: config.id,
      server_package: config.packageName,
      operation: toolProtocol.operation,
      transport: config.transport,
      endpoint: this._daemonEndpoint(config),
      url: toolProtocol.url,
      health,
      expected_receipt: toolProtocol.safeProbe?.expected_receipt || `${config.id}_${toolProtocol.operation.replace('/', '_')}_probe`,
      mediation_receipt_id: mediation.mediation_receipt.receipt_id,
      mediation_receipt_cid: mediation.mediation_receipt.receipt_cid
    };
  }

  _mcpPlusPlusStatus(daemonId, daemon = null) {
    if (daemon?.mcpPlusPlus) {
      return daemon.mcpPlusPlus;
    }
    return this.mcpPlusPlusCapabilities.get(daemonId) || null;
  }

  _launchPlanMcpPlusPlus(config) {
    if (config.id === 'ipfs-accelerate') {
      return {
        available: true,
        supports_profile_negotiation: true,
        mode: 'optional_additive',
        profiles: [...ACCELERATE_MCPPLUSPLUS_PROFILES]
      };
    }

    if (config.id === 'ipfs-datasets') {
      return {
        provider: 'ipfs_datasets_py.mcp_server.mcplusplus',
        bridge_to: 'ipfs_accelerate_py.mcplusplus_module',
        supports_profile_negotiation: false,
        mode: 'optional_bridge',
        profiles: []
      };
    }

    return null;
  }

  async _refreshMcpPlusPlusStatus(config, daemon) {
    const status = this._collectMcpPlusPlusStatus(config);
    this.mcpPlusPlusCapabilities.set(config.id, status);
    if (daemon) {
      daemon.mcpPlusPlus = status;
    }
    return status;
  }

  _collectMcpPlusPlusStatus(config) {
    if (config.id === 'ipfs-accelerate') {
      return {
        provider: 'ipfs_accelerate_py.mcp_server.server.get_unified_supported_profiles',
        available: true,
        state: 'available',
        supports_profile_negotiation: true,
        mode: 'optional_additive',
        profiles: [...ACCELERATE_MCPPLUSPLUS_PROFILES],
        active_profile: ACCELERATE_MCPPLUSPLUS_PROFILES[0],
        message: 'Unified MCP++ profiles are advertised by the accelerate MCP runtime.'
      };
    }

    if (config.id === 'ipfs-datasets') {
      const probeScript = [
        'import json',
        'status = {"provider": "ipfs_datasets_py.mcp_server.mcplusplus"}',
        'try:',
        '    from ipfs_datasets_py.mcp_server import mcplusplus',
        '    caps = mcplusplus.get_capabilities()',
        '    ok, missing = mcplusplus.check_requirements()',
        '    available = bool(caps.get("mcplusplus_available"))',
        '    status.update({',
        '        "available": available,',
        '        "state": "available" if available else "degraded",',
        '        "mode": "optional_bridge",',
        '        "supports_profile_negotiation": False,',
        '        "profiles": [],',
        '        "bridge_capabilities": caps.get("capabilities", {}),',
        '        "mcplusplus_version": caps.get("mcplusplus_version"),',
        '        "requirements_ok": bool(ok),',
        '        "missing_requirements": list(missing or []),',
        '    })',
        'except Exception as exc:',
        '    status.update({',
        '        "available": False,',
        '        "state": "unavailable",',
        '        "mode": "optional_bridge",',
        '        "supports_profile_negotiation": False,',
        '        "profiles": [],',
        '        "error": str(exc),',
        '    })',
        'print(json.dumps(status))'
      ].join('\n');

      try {
        const result = spawnSync(config.command, ['-c', probeScript], {
          cwd: config.cwd,
          env: this._buildDaemonEnv(config),
          encoding: 'utf8',
          timeout: 4000
        });

        const raw = String(result.stdout || '').trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            ...parsed,
            message: parsed.available
              ? 'Datasets MCP++ bridge is available via ipfs_accelerate_py.mcplusplus_module.'
              : 'Datasets MCP++ bridge is unavailable; P2P engines run in degraded local mode.'
          };
        }

        return {
          provider: 'ipfs_datasets_py.mcp_server.mcplusplus',
          available: false,
          state: 'unavailable',
          mode: 'optional_bridge',
          supports_profile_negotiation: false,
          profiles: [],
          error: String(result.stderr || 'empty capability probe response'),
          message: 'Datasets MCP++ bridge probe returned no data.'
        };
      } catch (error) {
        return {
          provider: 'ipfs_datasets_py.mcp_server.mcplusplus',
          available: false,
          state: 'unavailable',
          mode: 'optional_bridge',
          supports_profile_negotiation: false,
          profiles: [],
          error: error.message,
          message: 'Datasets MCP++ bridge probe failed.'
        };
      }
    }

    return null;
  }

  async _startNativeDashboardSidecar(config) {
    if (!config.nativeDashboard) {
      return null;
    }

    const existing = this.dashboardSidecars.get(config.id);
    if (existing && existing.status !== 'stopped') {
      return existing;
    }

    const dashboardProcess = spawn(config.nativeDashboard.command, config.nativeDashboard.args, {
      cwd: config.cwd,
      env: this._buildDaemonEnv(config),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const sidecar = {
      daemonId: config.id,
      port: config.nativeDashboard.port,
      url: `http://127.0.0.1:${config.nativeDashboard.port}${config.nativeDashboard.path}`,
      healthUrl: `http://127.0.0.1:${config.nativeDashboard.port}${config.nativeDashboard.healthPath}`,
      catalogUrl: config.nativeDashboard.catalogPath
        ? `http://127.0.0.1:${config.nativeDashboard.port}${config.nativeDashboard.catalogPath}`
        : null,
      process: dashboardProcess,
      status: 'starting',
      logs: []
    };
    this.dashboardSidecars.set(config.id, sidecar);

    dashboardProcess.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        sidecar.logs.push({ time: Date.now(), level: 'info', message });
      }
    });

    dashboardProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        sidecar.logs.push({ time: Date.now(), level: 'error', message });
      }
    });

    dashboardProcess.on('exit', () => {
      sidecar.status = 'stopped';
    });

    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(sidecar.healthUrl);
        if (response.ok) {
          sidecar.status = 'running';
          return sidecar;
        }
      } catch {
        // Native dashboard is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    sidecar.status = 'degraded';
    return sidecar;
  }

  async _stopNativeDashboardSidecar(daemonId) {
    const sidecar = this.dashboardSidecars.get(daemonId);
    if (!sidecar || sidecar.status === 'stopped') {
      return;
    }

    sidecar.status = 'stopped';
    try {
      sidecar.process.kill('SIGTERM');
    } catch {
      // Ignore sidecar stop failures during shutdown.
    }
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

    if (config.detachedLauncher && result.endpoint_ok) {
      result.process_alive = true;
    }

    result.healthy = result.process_alive && result.endpoint_ok;
    return result;
  }

  _markDaemonStartedFromOutput(daemonId, daemon, config, message) {
    if (daemon.status !== 'starting') {
      return;
    }

    const normalized = String(message || '').trim();
    if (!normalized) {
      return;
    }

    const isStartupMessage = STARTUP_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized));
    if (!isStartupMessage) {
      return;
    }

    daemon.status = 'running';
    this.emit('started', { daemon: daemonId, port: config.port });
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
