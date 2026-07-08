/**
 * MCP Daemon Manager
 * Manages IPFS MCP server daemons and SwissKnife integration
 */

import { spawn, spawnSync } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import net from 'net';
import path from 'path';
import url from 'url';
import crypto from 'crypto';
import { getReporter, ErrorSource, ErrorLevel } from './github_issue_reporter.js';
import { ControlSurfaceInvocationGate } from './control_surface_invocation.js';
import { mcpServers } from './menu_config.js';
// Shared, dependency-free MCP tool-catalog helper. The dashboards load this same
// file as a classic browser <script> (window.MCPToolCatalog); importing it here
// for its side effect registers globalThis.MCPToolCatalog so this main-process
// live-probe telemetry computes the SAME true hierarchical tool count the unified
// tool explorer shows, instead of a naive tools/list length that (a) miscounts
// the 4 facade meta-tools and (b) under-reports reduced servers whose real total
// lives in tools_list_categories. See node/views/components/mcp-tool-catalog.js.
import './views/components/mcp-tool-catalog.js';
const MCPToolCatalog = (typeof globalThis !== 'undefined' && globalThis.MCPToolCatalog) || null;

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_HEALTH_INTERVAL_MS = 30000;
// The Python MCP servers import heavy dependencies on cold start (duckdb,
// transformers/HF hub scanners, model managers, hypercorn). Measured cold-boot
// times to first healthy response: ipfs-kit ~6s, ipfs-datasets ~11s,
// ipfs-accelerate ~13s — and slower on first run in a packaged app or on
// constrained hardware. A 5s startup budget marked every server "degraded"
// before it ever finished booting, which surfaced in the UI as "MCP++ servers
// not working". Give cold starts a realistic budget (override via
// MCP_DAEMON_STARTUP_TIMEOUT_MS).
const DEFAULT_STARTUP_TIMEOUT_MS = 45000;
// Per-probe timeout for the health-endpoint fetch. The MCP servers each run a
// single Hypercorn worker; while all three boot in parallel (and contend with
// Electron + the test runner), a `/health/ready` request can legitimately take
// longer than 1s to come back even though the server is fine. A 1s budget made
// the probe abort and report the daemon unhealthy under that transient load,
// which the UI/tests read as "MCP++ servers not working". Give the probe a more
// forgiving budget (override via MCP_DAEMON_HEALTH_TIMEOUT_MS).
const DEFAULT_HEALTH_TIMEOUT_MS = 5000;
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
const withoutFields = (value, fieldNames) => Object.fromEntries(
  Object.entries(value).filter(([key, entry]) => !fieldNames.includes(key) && entry !== undefined)
);
const jsonStableCatalogValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => jsonStableCatalogValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, jsonStableCatalogValue(entry)])
    );
  }
  return value;
};
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
  attempt: 11,
  attempt_receipts: [
    'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-547-attempt-11-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-06-28-mgw-547-attempt-11-launch-playwright-validation-gate.md'
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
const HAO_714_DASHBOARD_INTEROPERABILITY_CONSOLE_GATE = {
  schema: 'launch_readiness_receipt_v1',
  task_id: 'HAO-714',
  goal_id: 'VAIOS-G723',
  goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
  packet_goal_ids: ['VAIOS-G723', 'VAIOS-G724', 'VAIOS-G728'],
  lineage_id: 'VAIOS-G723:hallucinate-mcp-dashboard-interoperability-console',
  source_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-714-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-714-mcp-dashboard-interoperability-console.md',
  evidence_term: 'launch Playwright validation gate',
  gate_state: 'gate_open_until_playwright_passes',
  playwright_specs: [
    'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
    'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
  ],
  validation_commands: [
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
  catalog_schema: DASHBOARD_CATALOG_SCHEMA,
  catalog_generated_by: 'hallucinate_app.node.mcp_daemon_manager.getDashboardCapabilityCatalog',
  catalog_fixture: 'hallucinate_app/test/e2e/fixtures/vai-512-mcp-dashboard-catalog.json',
  catalog_launch_objective_ids: DASHBOARD_LAUNCH_OBJECTIVE_IDS,
  interoperability_fixture: 'hallucinate_app/test/e2e/fixtures/hao-682-mcp-dashboard-launch-readiness.json',
  swissknife_consumer_fixture: 'swissknife/test/e2e/fixtures/hao-681-mcp-dashboard-catalog-consumer.json',
  supervisor_heap: 'implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md',
  receipt_route: [
    'Hallucinate App dashboard action',
    'dashboard capability catalog',
    'interaction_envelope',
    'policy_decision',
    'mediation_receipt',
    'supervised MCP server transport',
    'Swissknife consumer registry'
  ],
  dashboard_servers: [
    {
      daemon_id: 'ipfs-kit',
      server_package: 'ipfs_kit_py',
      health_path: '/api/mcp/status',
      safe_probe_receipt: 'ipfs_kit_status_probe',
      swissknife_consumer: 'Swissknife IPFS storage, pin dashboard, and backend health surfaces'
    },
    {
      daemon_id: 'ipfs-datasets',
      server_package: 'ipfs_datasets_py',
      health_path: '/health/ready',
      safe_probe_receipt: 'ipfs_datasets_list_probe',
      swissknife_consumer: 'Swissknife dataset, content, index, provenance, and background task surfaces'
    },
    {
      daemon_id: 'ipfs-accelerate',
      server_package: 'ipfs_accelerate_py',
      health_path: '/api/mcp/status',
      safe_probe_receipt: 'ipfs_accelerate_hardware_profile_probe',
      swissknife_consumer: 'Swissknife hardware profile, inference job, job status, and telemetry surfaces'
    }
  ],
  supervisor_follow_up_subtasks: ['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683'],
  failure_rule: 'Any catalog normalization, dashboard UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, Playwright, dashboard backend, or supervisor follow-up failure remains supervisor-generated launch work for VAIOS-G723.'
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
const HAO_718_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'HAO-718',
  supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-718-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-718-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-718-mcp-dashboard-launch-gate.json'
};
const HAO_720_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'HAO-720',
  supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-720-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-720-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-720-mcp-dashboard-launch-gate.json'
};
const HAO_724_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'HAO-724',
  supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-724-mcp-dashboard-launch-gate.json',
  validation_commands: [
    'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const HAO_742_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  schema: 'launch_readiness_receipt_v1',
  task_id: 'HAO-742',
  goal_id: 'VAIOS-G724',
  goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
  packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
  packet_sibling_task_id: 'HAO-743',
  packet_sibling_goal_id: 'VAIOS-G728',
  lineage_id: 'VAIOS-G724:hallucinate-mcp-dashboard-capability-catalog',
  source_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-742-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-742-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-742-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-742-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_open_until_playwright_passes',
  validation_commands: [
    'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ],
  required_backends: [
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py'
  ],
  required_evidence: [
    'hallucinate_app menus',
    'Hallucinate App MCP dashboard',
    'dashboard capability catalog',
    'daemon health',
    'tools/list',
    'tools/call',
    'ipfs_accelerate_py MCP server',
    'ipfs_datasets_py MCP server',
    'ipfs_kit_py MCP server',
    'Swissknife applications',
    'Playwright MCP dashboard interoperability',
    'launch Playwright validation gate'
  ],
  catalog_schema: DASHBOARD_CATALOG_SCHEMA,
  catalog_generated_by: 'hallucinate_app.node.mcp_daemon_manager.getDashboardCapabilityCatalog',
  catalog_fixture: 'hallucinate_app/test/e2e/fixtures/vai-512-mcp-dashboard-catalog.json',
  catalog_launch_objective_ids: DASHBOARD_LAUNCH_OBJECTIVE_IDS,
  interoperability_fixture: 'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts',
  swissknife_consumer_fixture: 'swissknife/test/e2e/fixtures/hao-681-mcp-dashboard-catalog-consumer.json',
  supervisor_heap: 'implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md',
  receipt_route: [
    'Hallucinate App dashboard action',
    'dashboard capability catalog',
    'interaction_envelope',
    'policy_decision',
    'mediation_receipt',
    'supervised MCP server transport',
    'Swissknife MCP dashboard capability registry'
  ],
  dashboard_servers: [
    {
      daemon_id: 'ipfs-kit',
      server_package: 'ipfs_kit_py',
      health_path: '/api/mcp/status',
      tools_list: 'tools/list',
      tools_call: 'tools/call',
      safe_probe_receipt: 'ipfs_kit_status_probe',
      swissknife_consumer: 'Swissknife IPFS storage, pin dashboard, and backend health surfaces'
    },
    {
      daemon_id: 'ipfs-datasets',
      server_package: 'ipfs_datasets_py',
      health_path: '/health/ready',
      tools_list: 'tools/list',
      tools_call: 'tools/call',
      safe_probe_receipt: 'ipfs_datasets_list_probe',
      swissknife_consumer: 'Swissknife dataset, content, index, provenance, and background task surfaces'
    },
    {
      daemon_id: 'ipfs-accelerate',
      server_package: 'ipfs_accelerate_py',
      health_path: '/api/mcp/status',
      tools_list: 'tools/list',
      tools_call: 'tools/call',
      safe_probe_receipt: 'ipfs_accelerate_hardware_profile_probe',
      swissknife_consumer: 'Swissknife hardware profile, inference job, job status, and telemetry surfaces'
    }
  ],
  failure_rule: 'Any missing HAO-742 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, or HAO-743 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const HAO_744_LAUNCH_VALIDATION_GATE = {
  ...HAO_742_LAUNCH_VALIDATION_GATE,
  task_id: 'HAO-744',
  packet_sibling_task_id: 'HAO-745',
  source_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-744-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-744-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-744-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-744-mcp-dashboard-launch-gate.json',
  failure_rule: 'Any missing HAO-744 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, or HAO-745 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
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
const VAI_539_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-539',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-539-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-539-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-539-mcp-dashboard-launch-gate.json'
};
const VAI_548_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  schema: 'launch_readiness_receipt_v1',
  task_id: 'VAI-548',
  lineage_id: 'VAIOS-G724:hallucinate-mcp-dashboard-capability-catalog',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-548-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-548-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-548-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-548-mcp-dashboard-launch-gate.json',
  validation_commands: [
    'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ],
  gate_state: 'gate_open_until_playwright_passes',
  required_backends: [
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py'
  ],
  required_evidence: [
    'hallucinate_app menus',
    'Hallucinate App MCP dashboard',
    'dashboard capability catalog',
    'daemon health',
    'tools/list',
    'tools/call',
    'ipfs_accelerate_py MCP server',
    'ipfs_datasets_py MCP server',
    'ipfs_kit_py MCP server',
    'Swissknife applications',
    'Playwright MCP dashboard interoperability',
    'launch Playwright validation gate'
  ],
  catalog_schema: DASHBOARD_CATALOG_SCHEMA,
  catalog_generated_by: 'hallucinate_app.node.mcp_daemon_manager.getDashboardCapabilityCatalog',
  catalog_fixture: 'hallucinate_app/test/e2e/fixtures/vai-512-mcp-dashboard-catalog.json',
  catalog_launch_objective_ids: DASHBOARD_LAUNCH_OBJECTIVE_IDS,
  interoperability_fixture: 'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts',
  swissknife_consumer_fixture: 'swissknife/test/e2e/fixtures/hao-681-mcp-dashboard-catalog-consumer.json',
  supervisor_heap: 'implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md',
  receipt_route: [
    'Hallucinate App dashboard action',
    'dashboard capability catalog',
    'interaction_envelope',
    'policy_decision',
    'mediation_receipt',
    'supervised MCP server transport',
    'Swissknife MCP dashboard capability registry'
  ],
  dashboard_servers: [
    {
      daemon_id: 'ipfs-kit',
      server_package: 'ipfs_kit_py',
      health_path: '/api/mcp/status',
      tools_list: 'tools/list',
      tools_call: 'tools/call',
      safe_probe_receipt: 'ipfs_kit_status_probe',
      swissknife_consumer: 'Swissknife IPFS storage, pin dashboard, and backend health surfaces'
    },
    {
      daemon_id: 'ipfs-datasets',
      server_package: 'ipfs_datasets_py',
      health_path: '/health/ready',
      tools_list: 'tools/list',
      tools_call: 'tools/call',
      safe_probe_receipt: 'ipfs_datasets_list_probe',
      swissknife_consumer: 'Swissknife dataset, content, index, provenance, and background task surfaces'
    },
    {
      daemon_id: 'ipfs-accelerate',
      server_package: 'ipfs_accelerate_py',
      health_path: '/api/mcp/status',
      tools_list: 'tools/list',
      tools_call: 'tools/call',
      safe_probe_receipt: 'ipfs_accelerate_hardware_profile_probe',
      swissknife_consumer: 'Swissknife hardware profile, inference job, job status, and telemetry surfaces'
    }
  ],
  failure_rule: 'Any missing VAI-548 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_542_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-542',
  goal_id: 'VAIOS-G723',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-542-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-542-mcp-dashboard-launch-gate.md',
  hallucinate_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-objective-gap-3e00ad2a0074.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-542-mcp-dashboard-launch-gate.json',
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
const VAI_543_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-543',
  goal_id: 'VAIOS-G723',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-543-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-543-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-vai-543-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-543-mcp-dashboard-launch-gate.json',
  child_goals: [
    'VAIOS-G723-C1 Catalog normalization',
    'VAIOS-G723-C2 Dashboard UI wiring',
    'VAIOS-G723-C3 Mediated tool-call receipts',
    'VAIOS-G723-C4 Swissknife consumers',
    'VAIOS-G723-C5 Playwright coverage',
    'VAIOS-G723-C6 Supervisor-generated follow-up subtasks'
  ],
  follow_up_subtasks: ['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683'],
  failure_rule: 'Any dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, or Playwright failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const HAO_727_LAUNCH_VALIDATION_GATE = {
  ...VAI_543_LAUNCH_VALIDATION_GATE,
  schema: 'launch_readiness_receipt_v1',
  task_id: 'HAO-727',
  lineage_id: 'VAIOS-G723:hallucinate-mcp-dashboard-interoperability',
  source_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-727-mcp-dashboard-launch-gate.json',
  attempt: 5,
  attempt_receipts: [
    'data/hallucinate_multimodal_control/discovery/2026-06-30-hao-727-attempt-5-validation.md'
  ],
  required_backends: [
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py'
  ],
  required_evidence: [
    'Hallucinate App menus',
    'Hallucinate App MCP dashboard',
    'dashboard capability catalog',
    'backend service catalog',
    'daemon health',
    'MCP++ telemetry',
    'tools/list',
    'tools/call',
    'control_surface receipts',
    'Swissknife applications',
    'catalog normalization',
    'dashboard UI wiring',
    'mediated tool-call receipts',
    'Swissknife consumers',
    'Playwright coverage',
    'supervisor-generated follow-up subtasks',
    'launch Playwright validation gate'
  ],
  receipt_route: [
    'Hallucinate App dashboard action',
    'dashboard capability catalog',
    'interaction_envelope',
    'policy_decision',
    'mediation_receipt',
    'supervised MCP server transport',
    'Swissknife MCP dashboard capability registry'
  ],
  dashboard_servers: [
    {
      daemon_id: 'ipfs-kit',
      server_package: 'ipfs_kit_py',
      health_path: '/api/mcp/status',
      tools_list: 'tools/list',
      tools_call: 'tools/call',
      safe_probe_receipt: 'ipfs_kit_status_probe',
      swissknife_consumer: 'Swissknife IPFS storage, pin dashboard, and backend health surfaces'
    },
    {
      daemon_id: 'ipfs-datasets',
      server_package: 'ipfs_datasets_py',
      health_path: '/health/ready',
      tools_list: 'tools/list',
      tools_call: 'tools/call',
      safe_probe_receipt: 'ipfs_datasets_list_probe',
      swissknife_consumer: 'Swissknife dataset, content, index, provenance, and background task surfaces'
    },
    {
      daemon_id: 'ipfs-accelerate',
      server_package: 'ipfs_accelerate_py',
      health_path: '/api/mcp/status',
      tools_list: 'tools/list',
      tools_call: 'tools/call',
      safe_probe_receipt: 'ipfs_accelerate_hardware_profile_probe',
      swissknife_consumer: 'Swissknife hardware profile, inference job, job status, and telemetry surfaces'
    }
  ],
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py tests/test_virtual_ai_os_todo_queue.py -q',
    'npm --prefix hallucinate_app run test:daemon-manager',
    'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
    'npm --prefix swissknife run test:e2e:mcp',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ],
  catalog_source: 'hallucinate_app.node.mcp_daemon_manager.getDashboardCapabilityCatalog',
  catalog_schema: DASHBOARD_CATALOG_SCHEMA,
  catalog_generated_by: 'hallucinate_app.node.mcp_daemon_manager.getDashboardCapabilityCatalog',
  catalog_fixture: 'hallucinate_app/test/e2e/fixtures/vai-512-mcp-dashboard-catalog.json',
  catalog_launch_objective_ids: DASHBOARD_LAUNCH_OBJECTIVE_IDS,
  supervisor_follow_up_subtasks: ['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683']
};
const MGW_558_LAUNCH_VALIDATION_GATE = {
  ...withoutFields(HAO_727_LAUNCH_VALIDATION_GATE, [
    'attempt',
    'attempt_receipts',
    'goal_packet',
    'packet_goal_ids'
  ]),
  task_id: 'MGW-558',
  lineage_id: 'VAIOS-G723:hallucinate-mcp-dashboard-interoperability-console',
  source_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-558-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-558-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-558-launch-playwright-validation-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-29-mgw-558-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-558-mcp-dashboard-launch-gate.json',
  failure_rule: 'Any MGW-558 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, or Playwright failure remains supervisor-generated follow-up work for VAIOS-G723.',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py tests/test_virtual_ai_os_todo_queue.py -q',
    'npm --prefix hallucinate_app run test:daemon-manager',
    'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
    'cd hallucinate_app && (env -u DISPLAY -u WAYLAND_DISPLAY HALLUCINATE_APP_E2E_NO_BOOTSTRAP=true node scripts/run_playwright_test.mjs --help || test $? -eq 78)',
    'npm --prefix swissknife run test:e2e:mcp',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const MGW_559_LAUNCH_VALIDATION_GATE = {
  ...MGW_558_LAUNCH_VALIDATION_GATE,
  task_id: 'MGW-559',
  source_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-559-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-559-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-559-launch-playwright-validation-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-29-mgw-559-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-559-mcp-dashboard-launch-gate.json',
  failure_rule: 'Any MGW-559 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, or Playwright failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const MGW_561_LAUNCH_VALIDATION_GATE = {
  ...MGW_558_LAUNCH_VALIDATION_GATE,
  task_id: 'MGW-561',
  source_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-561-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-561-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-561-launch-playwright-validation-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-30-mgw-561-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-561-mcp-dashboard-launch-gate.json',
  failure_rule: 'Any MGW-561 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, or Playwright failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const MGW_562_LAUNCH_VALIDATION_GATE = {
  ...MGW_558_LAUNCH_VALIDATION_GATE,
  task_id: 'MGW-562',
  source_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-562-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-562-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-562-launch-playwright-validation-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-30-mgw-562-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-562-mcp-dashboard-launch-gate.json',
  failure_rule: 'Any MGW-562 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, or Playwright failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const MGW_563_LAUNCH_VALIDATION_GATE = {
  ...MGW_558_LAUNCH_VALIDATION_GATE,
  task_id: 'MGW-563',
  source_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-07-01-mgw-563-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-07-01-mgw-563-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-07-01-mgw-563-launch-playwright-validation-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-01-mgw-563-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-563-mcp-dashboard-launch-gate.json',
  attempt: 3,
  attempt_receipts: [
    'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-563-attempt-3-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-02-mgw-563-attempt-3-validation.md'
  ],
  failure_rule: 'Any MGW-563 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, or Playwright failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const MGW_566_LAUNCH_VALIDATION_GATE = {
  ...MGW_558_LAUNCH_VALIDATION_GATE,
  task_id: 'MGW-566',
  source_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-566-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-566-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-566-launch-playwright-validation-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-02-mgw-566-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-566-mcp-dashboard-launch-gate.json',
  attempt: 2,
  attempt_receipts: [
    'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-566-attempt-2-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-02-mgw-566-attempt-2-validation.md'
  ],
  failure_rule: 'Any MGW-566 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, or Playwright failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_563_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-563',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-563-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-563-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-563-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-03-vai-563-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-563-mcp-dashboard-launch-gate.json',
  attempt: 2,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-03-vai-563-attempt-2-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-03-vai-563-attempt-2-validation.md'
  ],
  failure_rule: 'Any VAI-563 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, or Playwright failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_566_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-566',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-566-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-566-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-566-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-03-vai-566-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-566-mcp-dashboard-launch-gate.json',
  attempt: 2,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-03-vai-566-attempt-2-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-03-vai-566-attempt-2-validation.md'
  ],
  failure_rule: 'Any VAI-566 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, or Playwright failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_569_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-569',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-569-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-569-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-569-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-569-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-569-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-569-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-569-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-569 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_572_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-572',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-572-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-572-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-572-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-572-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-572-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-572-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-572-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-572 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_575_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-575',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-575-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-575-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-575-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-575-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-575-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-575-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-575-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-575 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_578_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-578',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-578-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-578-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-578-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-578-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-578-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-578-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-578-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-578 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_581_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-581',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-581-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-581-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-581-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-581-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-581-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-581-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-581-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-581 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_584_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-584',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-584-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-584-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-584-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-584-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-584-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-584-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-584-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-584 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_587_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-587',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-587-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-587-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-587-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-587-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-587-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-587-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-587-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-587 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_590_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-590',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-590-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-590-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-590-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-590-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-590-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-590-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-590-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-590 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_591_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-591',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-591-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-591-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-591-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-591-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-591-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-591-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-591-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-591 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_594_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-594',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-594-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-594-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-594-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-594-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-594-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-594-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-594-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-594 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_597_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-597',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-597-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-597-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-597-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-597-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-597-mcp-dashboard-launch-gate.json',
  attempt: 2,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-597-attempt-2-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-597-attempt-2-validation.md'
  ],
  failure_rule: 'Any VAI-597 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_600_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-600',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-600-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-600-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-600-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-600-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-600-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-600-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-600-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-600 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_603_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-603',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-603-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-603-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-603-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-603-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-603-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-603-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-603-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-603 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_606_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-606',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-606-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-606-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-606-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-606-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-606-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-606-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-606-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-606 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_609_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-609',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-609-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-609-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-609-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-609-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-609-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-609-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-609-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-609 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_610_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-610',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-610-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-610-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-610-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-610-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-610-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-610-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-610-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-610 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_613_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-613',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-613-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-613-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-613-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-613-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-613-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-613-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-613-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-613 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_616_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-616',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-616-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-616-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-616-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-616-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-616-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-616-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-616-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-616 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_619_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-619',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-619-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-619-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-619-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-619-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-619-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-619-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-619-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-619 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_622_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-622',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-622-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-622-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-622-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-622-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-622-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-622-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-622-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-622 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_625_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-625',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-625-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-625-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-625-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-625-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-625-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-625-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-625-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-625 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_628_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-628',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-628-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-628-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-628-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-628-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-628-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-628-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-628-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-628 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_631_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-631',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-631-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-631-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-631-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-631-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-631-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-631-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-631-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-631 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_634_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-634',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-634-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-634-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-634-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-634-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-634-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-634-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-634-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-634 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const VAI_637_LAUNCH_VALIDATION_GATE = {
  ...MGW_566_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-637',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-637-objective-gap-7ea369464239.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-637-objective-gap-7ea369464239.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-637-mcp-dashboard-launch-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-637-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-637-mcp-dashboard-launch-gate.json',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-637-attempt-1-launch-playwright-validation-gate.md',
    'data/hallucinate_multimodal_control/discovery/2026-07-04-vai-637-attempt-1-validation.md'
  ],
  failure_rule: 'Any VAI-637 dashboard catalog, UI wiring, mediated tools/list, mediated tools/call, Swissknife consumer, backend validation, Playwright coverage, or supervisor follow-up failure remains supervisor-generated follow-up work for VAIOS-G723.'
};
const MGW_555_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'MGW-555',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-555-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-555-launch-playwright-validation-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-555-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  validation_commands: [
    'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const MGW_564_LAUNCH_VALIDATION_GATE = {
  ...MGW_533_LAUNCH_VALIDATION_GATE,
  task_id: 'MGW-564',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-564-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-564-launch-playwright-validation-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-564-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  validation_commands: [
    'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_556_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-556',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-556-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-556-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-556-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-556-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  failure_rule: 'Any missing VAI-556 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_564_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-564',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-564-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-564-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-564-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-564-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  failure_rule: 'Any missing VAI-564 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_567_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-567',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-567-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-567-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-567-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-567-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  failure_rule: 'Any missing VAI-567 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_573_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-573',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-573-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-573-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-573-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-573-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-574-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-573 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_576_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-576',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-576-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-576-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-576-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-576-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-577-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-576 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_579_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-579',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-579-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-579-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-579-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-579-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-580-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-579 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_582_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-582',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-582-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-582-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-582-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-582-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-583-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-582 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_585_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-585',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-585-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-585-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-585-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-585-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-586-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-585 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_588_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-588',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-588-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-588-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-588-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-588-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-589-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-588 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_592_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-592',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-592-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-592-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-592-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-592-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-593-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-592 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_595_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-595',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-595-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-595-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-595-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-595-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-596-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-595 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_598_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-598',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-598-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-598-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-598-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-598-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-599-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-598 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_601_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-601',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-601-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-601-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-601-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-601-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-602-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-601 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_604_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-604',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-604-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-604-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-604-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-604-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-605-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-604 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_607_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-607',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-607-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-607-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-607-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-607-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-608-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-607 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_611_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-611',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-611-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-611-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-611-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-611-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-612-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-611 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_614_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-614',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-614-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-614-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-614-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-614-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-615-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-614 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_617_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-617',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-617-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-617-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-617-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-617-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-618',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-618-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-617 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_620_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-620',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-620-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-620-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-620-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-620-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-621',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-621-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-620 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_623_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-623',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-623-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-623-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-623-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-623-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-624',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-624-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-623 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_626_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-626',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-626-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-626-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-626-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-626-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-627',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-627-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-626 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_629_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-629',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-629-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-629-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-629-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-629-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-630',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-630-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-629 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-630 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_632_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-632',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-632-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-632-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-632-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-632-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-633',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-633-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-632 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-633 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_635_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-635',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-635-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-635-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-635-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-635-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-636',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-636-daemon-launch-health-gate.md',
  failure_rule: 'Any missing VAI-635 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-636 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_638_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-638',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-638-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-638-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-638-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-638-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-639',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-639-daemon-launch-health-gate.md',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-638-attempt-1-launch-playwright-validation-gate.md'
  ],
  failure_rule: 'Any missing VAI-638 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-639 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_640_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-640',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-640-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-640-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-640-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-640-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-641',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-641-daemon-launch-health-gate.md',
  attempt: 2,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-640-attempt-2-launch-playwright-validation-gate.md'
  ],
  failure_rule: 'Any missing VAI-640 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-641 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_642_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-642',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-642-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-642-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-642-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-642-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-643',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-643-daemon-launch-health-gate.md',
  attempt: 2,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-642-attempt-2-launch-playwright-validation-gate.md'
  ],
  failure_rule: 'Any missing VAI-642 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-643 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_644_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-644',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-644-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-644-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-644-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-644-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-645',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-645-daemon-launch-health-gate.md',
  attempt: 2,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-04-vai-644-attempt-2-launch-playwright-validation-gate.md'
  ],
  failure_rule: 'Any missing VAI-644 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-645 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_647_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-647',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-647-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-647-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-647-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-647-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-648',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-648-daemon-launch-health-gate.md',
  attempt: 2,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-05-vai-647-attempt-2-launch-playwright-validation-gate.md'
  ],
  failure_rule: 'Any missing VAI-647 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-648 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_649_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-649',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-649-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-649-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-649-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-649-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-650',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-650-daemon-launch-health-gate.md',
  attempt: 2,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-05-vai-649-attempt-2-launch-playwright-validation-gate.md'
  ],
  failure_rule: 'Any missing VAI-649 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-650 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_651_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-651',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-651-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-651-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-651-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-651-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-652',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-652-daemon-launch-health-gate.md',
  attempt: 2,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-05-vai-651-attempt-2-launch-playwright-validation-gate.md'
  ],
  failure_rule: 'Any missing VAI-651 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-652 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_653_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-653',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-653-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-653-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-653-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-653-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-654',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-654-daemon-launch-health-gate.md',
  attempt: 2,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-05-vai-653-attempt-2-launch-playwright-validation-gate.md'
  ],
  failure_rule: 'Any missing VAI-653 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-654 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_655_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-655',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-655-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-655-objective-gap-3e00ad2a0074.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-655-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-655-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-656',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-656-daemon-launch-health-gate.md',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-05-vai-655-attempt-1-launch-playwright-validation-gate.md'
  ],
  failure_rule: 'Any missing VAI-655 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-656 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_657_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-657',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-657-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-657-objective-gap-3e00ad2a0074.md',
  todo_source: {
    file: 'implementation_plan/docs/19-virtual-ai-os-submodule-integration.todo.md',
    source_line: 8696
  },
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-657-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-657-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-658',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-658-daemon-launch-health-gate.md',
  attempt: 2,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-05-vai-657-attempt-2-launch-playwright-validation-gate.md'
  ],
  failure_rule: 'Any missing VAI-657 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-658 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_659_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-659',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-659-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-659-objective-gap-3e00ad2a0074.md',
  todo_source: {
    file: 'implementation_plan/docs/19-virtual-ai-os-submodule-integration.todo.md',
    source_line: 8768
  },
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-659-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-659-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-660',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-660-daemon-launch-health-gate.md',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-05-vai-659-attempt-1-launch-playwright-validation-gate.md'
  ],
  failure_rule: 'Any missing VAI-659 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-660 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const VAI_680_LAUNCH_VALIDATION_GATE = {
  ...VAI_548_LAUNCH_VALIDATION_GATE,
  task_id: 'VAI-680',
  source_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-08-vai-680-objective-gap-3e00ad2a0074.md',
  supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-08-vai-680-objective-gap-3e00ad2a0074.md',
  todo_source: {
    file: 'implementation_plan/docs/19-virtual-ai-os-submodule-integration.todo.md',
    source_line: 9360
  },
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-08-vai-680-mcp-dashboard-launch-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-680-mcp-dashboard-launch-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  external_backend_surfaces: [
    'external/ipfs_accelerate',
    'external/ipfs_datasets',
    'external/ipfs_kit'
  ],
  packet_sibling_goal_id: 'VAIOS-G728',
  packet_sibling_task_id: 'VAI-681',
  packet_sibling_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-08-vai-681-daemon-launch-health-gate.md',
  attempt: 1,
  attempt_receipts: [
    'data/virtual_ai_os/discovery/2026-07-08-vai-680-attempt-1-launch-playwright-validation-gate.md'
  ],
  failure_rule: 'Any missing VAI-680 launch Playwright validation gate, catalog, daemon health, tools/list, tools/call, Swissknife consumer, external backend handoff, or VAI-681 packet sibling evidence remains supervisor-fed launch work for VAIOS-G724 and VAIOS-G728.'
};
const DASHBOARD_LAUNCH_VALIDATION_GATES = [
  MGW_533_LAUNCH_VALIDATION_GATE,
  MGW_546_LAUNCH_VALIDATION_GATE,
  MGW_547_LAUNCH_VALIDATION_GATE,
  HAO_714_DASHBOARD_INTEROPERABILITY_CONSOLE_GATE,
  MGW_550_LAUNCH_VALIDATION_GATE,
  HAO_712_LAUNCH_VALIDATION_GATE,
  HAO_718_LAUNCH_VALIDATION_GATE,
  HAO_720_LAUNCH_VALIDATION_GATE,
  HAO_724_LAUNCH_VALIDATION_GATE,
  HAO_742_LAUNCH_VALIDATION_GATE,
  HAO_744_LAUNCH_VALIDATION_GATE,
  VAI_529_LAUNCH_VALIDATION_GATE,
  VAI_535_LAUNCH_VALIDATION_GATE,
  VAI_537_LAUNCH_VALIDATION_GATE,
  VAI_539_LAUNCH_VALIDATION_GATE,
  VAI_548_LAUNCH_VALIDATION_GATE,
  VAI_542_LAUNCH_VALIDATION_GATE,
  VAI_543_LAUNCH_VALIDATION_GATE,
  HAO_727_LAUNCH_VALIDATION_GATE,
  MGW_558_LAUNCH_VALIDATION_GATE,
  MGW_559_LAUNCH_VALIDATION_GATE,
  MGW_561_LAUNCH_VALIDATION_GATE,
  MGW_562_LAUNCH_VALIDATION_GATE,
  MGW_563_LAUNCH_VALIDATION_GATE,
  MGW_555_LAUNCH_VALIDATION_GATE,
  MGW_564_LAUNCH_VALIDATION_GATE,
  VAI_556_LAUNCH_VALIDATION_GATE,
  VAI_564_LAUNCH_VALIDATION_GATE,
  VAI_567_LAUNCH_VALIDATION_GATE,
  VAI_573_LAUNCH_VALIDATION_GATE,
  VAI_576_LAUNCH_VALIDATION_GATE,
  VAI_579_LAUNCH_VALIDATION_GATE,
  VAI_582_LAUNCH_VALIDATION_GATE,
  VAI_585_LAUNCH_VALIDATION_GATE,
  VAI_588_LAUNCH_VALIDATION_GATE,
  VAI_592_LAUNCH_VALIDATION_GATE,
  MGW_566_LAUNCH_VALIDATION_GATE,
  VAI_563_LAUNCH_VALIDATION_GATE,
  VAI_566_LAUNCH_VALIDATION_GATE,
  VAI_569_LAUNCH_VALIDATION_GATE,
  VAI_572_LAUNCH_VALIDATION_GATE,
  VAI_575_LAUNCH_VALIDATION_GATE,
  VAI_578_LAUNCH_VALIDATION_GATE,
  VAI_581_LAUNCH_VALIDATION_GATE,
  VAI_584_LAUNCH_VALIDATION_GATE,
  VAI_587_LAUNCH_VALIDATION_GATE,
  VAI_590_LAUNCH_VALIDATION_GATE,
  VAI_591_LAUNCH_VALIDATION_GATE,
  VAI_594_LAUNCH_VALIDATION_GATE,
  VAI_597_LAUNCH_VALIDATION_GATE,
  VAI_600_LAUNCH_VALIDATION_GATE,
  VAI_603_LAUNCH_VALIDATION_GATE,
  VAI_606_LAUNCH_VALIDATION_GATE,
  VAI_609_LAUNCH_VALIDATION_GATE,
  VAI_610_LAUNCH_VALIDATION_GATE,
  VAI_613_LAUNCH_VALIDATION_GATE,
  VAI_616_LAUNCH_VALIDATION_GATE,
  VAI_619_LAUNCH_VALIDATION_GATE,
  VAI_622_LAUNCH_VALIDATION_GATE,
  VAI_625_LAUNCH_VALIDATION_GATE,
  VAI_628_LAUNCH_VALIDATION_GATE,
  VAI_631_LAUNCH_VALIDATION_GATE,
  VAI_634_LAUNCH_VALIDATION_GATE,
  VAI_637_LAUNCH_VALIDATION_GATE,
  VAI_595_LAUNCH_VALIDATION_GATE,
  VAI_598_LAUNCH_VALIDATION_GATE,
  VAI_601_LAUNCH_VALIDATION_GATE,
  VAI_604_LAUNCH_VALIDATION_GATE,
  VAI_607_LAUNCH_VALIDATION_GATE,
  VAI_611_LAUNCH_VALIDATION_GATE,
  VAI_614_LAUNCH_VALIDATION_GATE,
  VAI_617_LAUNCH_VALIDATION_GATE,
  VAI_620_LAUNCH_VALIDATION_GATE,
  VAI_623_LAUNCH_VALIDATION_GATE,
  VAI_626_LAUNCH_VALIDATION_GATE,
  VAI_629_LAUNCH_VALIDATION_GATE,
  VAI_632_LAUNCH_VALIDATION_GATE,
  VAI_635_LAUNCH_VALIDATION_GATE,
  VAI_638_LAUNCH_VALIDATION_GATE,
  VAI_640_LAUNCH_VALIDATION_GATE,
  VAI_642_LAUNCH_VALIDATION_GATE,
  VAI_644_LAUNCH_VALIDATION_GATE,
  VAI_647_LAUNCH_VALIDATION_GATE,
  VAI_649_LAUNCH_VALIDATION_GATE,
  VAI_651_LAUNCH_VALIDATION_GATE,
  VAI_653_LAUNCH_VALIDATION_GATE,
  VAI_655_LAUNCH_VALIDATION_GATE,
  VAI_657_LAUNCH_VALIDATION_GATE,
  VAI_659_LAUNCH_VALIDATION_GATE,
  VAI_680_LAUNCH_VALIDATION_GATE
];
const DAEMON_LAUNCH_GATE_TASK_ID = 'MGW-535';
const DAEMON_LAUNCH_GATE_VAI_TASK_ID = 'VAI-519';
const DAEMON_LAUNCH_GATE_VAI_TASK_IDS = [
  'VAI-519',
  'VAI-530',
  'VAI-536',
  'VAI-538',
  'VAI-540',
  'VAI-549',
  'VAI-555',
  'VAI-557',
  'VAI-565',
  'VAI-568',
  'VAI-574',
  'VAI-577',
  'VAI-580',
  'VAI-583',
  'VAI-586',
  'VAI-589',
  'VAI-593',
  'VAI-596',
  'VAI-599',
  'VAI-602',
  'VAI-605',
  'VAI-608',
  'VAI-612',
  'VAI-615',
  'VAI-618',
  'VAI-621',
  'VAI-624',
  'VAI-627',
  'VAI-630',
  'VAI-633',
  'VAI-636',
  'VAI-639',
  'VAI-641'
];
const DAEMON_LAUNCH_GATE_BACKLOG_TASK_ID = 'HAO-702';
const DAEMON_LAUNCH_GATE_BACKLOG_TASK_IDS = ['HAO-702', 'HAO-713', 'HAO-719', 'HAO-721', 'HAO-743', 'HAO-745', 'HAO-755'];
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
  'data/virtual_ai_os/discovery/2026-06-28-vai-538-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-06-28-vai-540-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-02-vai-549-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-02-vai-555-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-02-vai-557-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-03-vai-565-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-568-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-574-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-577-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-580-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-583-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-586-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-589-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-593-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-596-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-599-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-602-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-605-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-608-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-612-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-615-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-618-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-621-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-624-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-627-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-630-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-633-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-636-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-639-daemon-launch-health-gate.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-641-daemon-launch-health-gate.md',
  'data/meta_glasses_display_widgets/discovery/2026-06-26-mgw-535-daemon-launch-health-gate.md',
  'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-551-daemon-launch-health-gate.md',
  'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-743-daemon-launch-health-gate.md',
  'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-745-daemon-launch-health-gate.md',
  'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-755-daemon-launch-health-gate.md'
];
const DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS = [
  'data/virtual_ai_os/discovery/2026-06-26-vai-519-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-06-27-vai-530-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-06-28-vai-536-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-06-28-vai-538-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-06-28-vai-540-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-02-vai-549-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-02-vai-555-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-02-vai-557-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-03-vai-565-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-568-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-574-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-577-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-580-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-583-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-586-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-589-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-593-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-596-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-599-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-602-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-605-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-608-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-612-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-615-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-618-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-621-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-624-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-627-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-630-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-633-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-636-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-639-objective-gap-b023c8de5b69.md',
  'data/virtual_ai_os/discovery/2026-07-04-vai-641-objective-gap-b023c8de5b69.md',
  'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-551-objective-gap-b023c8de5b69.md',
  'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-743-objective-gap-b023c8de5b69.md',
  'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-745-objective-gap-b023c8de5b69.md',
  'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-755-objective-gap-b023c8de5b69.md'
];
const DAEMON_LAUNCH_GATE_SUPERVISOR_GAP_RECEIPTS = [
  'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-702-objective-gap-b023c8de5b69.md',
  'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-objective-gap-b023c8de5b69.md',
  'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-objective-gap-b023c8de5b69.md',
  'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-objective-gap-b023c8de5b69.md',
  'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-743-objective-gap-b023c8de5b69.md',
  'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-745-objective-gap-b023c8de5b69.md',
  'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-755-objective-gap-b023c8de5b69.md'
];
const DAEMON_LAUNCH_GATE_HALLUCINATE_BACKLOG_RECEIPTS = [
  'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-702-daemon-launch-health-gate.md',
  'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-daemon-launch-health-gate.md',
  'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-daemon-launch-health-gate.md',
  'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-daemon-launch-health-gate.md',
  'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-743-daemon-launch-health-gate.md',
  'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-745-daemon-launch-health-gate.md',
  'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-755-daemon-launch-health-gate.md'
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
const MGW_556_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'MGW-556',
  supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-556-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-556-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-556-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
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
const VAI_538_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-538',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-538-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-538-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-538-daemon-launch-health-gate.json',
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
const VAI_549_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-549',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-549-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-549-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-549-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_555_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-555',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-555-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-555-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-555-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_557_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-557',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-557-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-557-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-557-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_565_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-565',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-565-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-565-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-565-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_568_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-568',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-568-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-568-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-568-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_574_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-574',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-574-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-574-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-574-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_577_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-577',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-577-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-577-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-577-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_580_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-580',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-580-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-580-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-580-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_583_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-583',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-583-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-583-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-583-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_586_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-586',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-586-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-586-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-586-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_589_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-589',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-589-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-589-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-589-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_593_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-593',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-593-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-593-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-593-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_596_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-596',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-596-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-596-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-596-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_599_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-599',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-599-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-599-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-599-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_602_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-602',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-602-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-602-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-602-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_605_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-605',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-605-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-605-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-605-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_608_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-608',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-608-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-608-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-608-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_612_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-612',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-612-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-612-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-612-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_615_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-615',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-615-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-615-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-615-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_618_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-618',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-618-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-618-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-618-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_621_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-621',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-621-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-621-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-621-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_624_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-624',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-624-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-624-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-624-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_627_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-627',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-627-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-627-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-627-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_630_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-630',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-630-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-630-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-630-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_633_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-633',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-633-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-633-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-633-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_636_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-636',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-636-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-636-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-636-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_639_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-639',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-639-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-639-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-639-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_641_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-641',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-641-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-641-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-641-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_643_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-643',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-643-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-643-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-643-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_645_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-645',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-645-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-645-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-645-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_648_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-648',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-648-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-648-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-648-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_650_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-650',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-650-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-650-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-650-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_652_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-652',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-652-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-652-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-652-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_654_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-654',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-654-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-654-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-654-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_656_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-656',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-656-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-656-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-656-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_658_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-658',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-658-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-658-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-658-daemon-launch-health-gate.json',
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_660_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-660',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-660-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-660-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-660-daemon-launch-health-gate.json',
  todo_source: {
    file: 'implementation_plan/docs/19-virtual-ai-os-submodule-integration.todo.md',
    source_line: 8801
  },
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const VAI_681_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'VAI-681',
  objective_gap_receipt: 'data/virtual_ai_os/discovery/2026-07-08-vai-681-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-07-08-vai-681-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-681-daemon-launch-health-gate.json',
  todo_source: {
    file: 'implementation_plan/docs/19-virtual-ai-os-submodule-integration.todo.md',
    source_line: 9360
  },
  gate_state: 'gate_closed_by_playwright_validation',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
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
const HAO_743_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'HAO-743',
  objective_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-743-objective-gap-b023c8de5b69.md',
  supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-743-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-743-daemon-launch-health-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-743-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-743-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const HAO_745_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'HAO-745',
  objective_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-745-objective-gap-b023c8de5b69.md',
  supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-745-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-745-daemon-launch-health-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-745-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-745-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
  ]
};
const HAO_755_DAEMON_LAUNCH_VALIDATION_GATE = {
  task_id: 'HAO-755',
  objective_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-755-objective-gap-b023c8de5b69.md',
  supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-755-objective-gap-b023c8de5b69.md',
  launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-755-daemon-launch-health-gate.md',
  hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-08-hao-755-daemon-launch-health-gate.md',
  receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-755-daemon-launch-health-gate.json',
  validation_commands: [
    'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
    'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
    'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
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

// Real, working HTTP endpoints used to verify live results from each backend.
// These are intentionally separate from DASHBOARD_TOOL_PROTOCOLS (which encodes the
// mediation/receipt contract) so the dashboards can prove the underlying MCP server
// returns working tool data — not just that the health endpoint is reachable.
const LIVE_TOOL_INVOCATION = {
  'ipfs-kit': {
    toolsList: { method: 'GET', path: '/mcp/tools/list' },
    toolsCall: { method: 'POST', path: '/mcp/tools/call', jsonRpc: true, toolName: 'health_check', arguments: {} }
  },
  'ipfs-datasets': {
    auth: { loginPath: '/auth/login', username: 'hallucinate-app-dashboard', password: 'live-backend-probe' },
    toolsList: { method: 'GET', path: '/tools/list', requiresAuth: true },
    toolsCall: { method: 'POST', path: '/tools/execute/tools_list_categories', requiresAuth: true, body: {} },
    // The datasets server exposes the hierarchical facade: GET /tools/list
    // returns only the 4 meta-tools (a "reduced" surface), so the true total
    // lives in tools_list_categories. When the live tools/list probe comes back
    // reduced, follow up with this call once to recover the real count — exactly
    // as the unified tool explorer does for the visible report.
    categoriesProbe: { method: 'POST', path: '/tools/execute/tools_list_categories', requiresAuth: true, body: {} }
  },
  'ipfs-accelerate': {
    // The accelerate MCP runtime (ipfs_accelerate_py.mcp_dashboard / the
    // http.server fallback) serves a JSON-RPC-only MCP surface at POST /mcp:
    // there is NO GET /mcp/tools/list (it 404s). Both tools/list and tools/call
    // must go through JSON-RPC on /mcp so the dashboard exercises the exact same
    // surface external MCP clients use (initialize -> tools/list -> tools/call).
    toolsList: { method: 'POST', path: '/mcp', jsonRpc: true, rpcMethod: 'tools/list' },
    // Invoke a real, non-mutating MCP tool through the JSON-RPC tools/call
    // interface so the dashboard exercises the actual MCP tool surface.
    toolsCall: { method: 'POST', path: '/mcp', jsonRpc: true, rpcMethod: 'tools/call', toolName: 'hardware_get_info', arguments: {} }
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
    this.healthTimeoutMs = Number(options.healthTimeoutMs || process.env.MCP_DAEMON_HEALTH_TIMEOUT_MS || DEFAULT_HEALTH_TIMEOUT_MS);
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
        args: ['-m', 'ipfs_kit_py.cli', 'mcp', 'start', '--port', String(Number(process.env.MCP_KIT_PORT) || 8014)],
        cwd: path.join(this.baseDir, 'ipfs_kit_py'),
        port: Number(process.env.MCP_KIT_PORT) || 8014,
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
        args: ['-m', 'uvicorn', 'ipfs_datasets_py.mcp_server.fastapi_service:app', '--host', '127.0.0.1', '--port', String(Number(process.env.MCP_DATASETS_PORT) || 3002)],
        cwd: path.join(this.baseDir, 'ipfs_datasets_py'),
        port: Number(process.env.MCP_DATASETS_PORT) || 3002,
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
        args: ['-m', 'ipfs_accelerate_py.cli', 'mcp', 'start', '--port', String(Number(process.env.MCP_ACCELERATE_PORT) || 3003), '--disable-autoscaler'],
        cwd: path.join(this.baseDir, 'ipfs_accelerate_py'),
        port: Number(process.env.MCP_ACCELERATE_PORT) || 3003,
        transport: 'http',
        rpcPath: '/mcp',
        healthPath: '/api/mcp/status',
        swissknifeConsumer: 'Swissknife hardware profile, inference job, job status, and telemetry surfaces',
        mediationContractRef: 'control_surface_contract:mcp-daemon:ipfs-accelerate'
      }
    ];
  }

  _resolveDaemonPythonCommand() {
    const explicitPython = process.env.MCP_DAEMON_PYTHON || process.env.HALLUCINATE_PYTHON;
    if (explicitPython) {
      return explicitPython;
    }

    // Managed per-user environment provisioned by PythonEnvironmentManager.
    // HALLUCINATE_PYTHON_HOME points at the venv root (…/python-runtime/venv).
    const candidateRoots = [];
    if (process.env.HALLUCINATE_PYTHON_HOME) {
      candidateRoots.push(process.env.HALLUCINATE_PYTHON_HOME);
    }
    if (process.env.VIRTUAL_ENV) {
      candidateRoots.push(process.env.VIRTUAL_ENV);
    }
    candidateRoots.push(path.resolve(this.baseDir, '..', '.venv'));

    for (const venvDir of candidateRoots) {
      const candidate = process.platform === 'win32'
        ? path.join(venvDir, 'Scripts', 'python.exe')
        : path.join(venvDir, 'bin', 'python');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return 'python';
  }

  /**
   * Point every managed daemon (and native dashboard) at a specific Python
   * interpreter. Called after the runtime environment is provisioned so the
   * packaged app launches the bundled/managed interpreter instead of a system
   * `python` that may not exist.
   */
  setPythonCommand(pythonCommand) {
    if (!pythonCommand) {
      return;
    }
    this.pythonCommand = pythonCommand;
    for (const config of this.daemonConfigs) {
      config.command = pythonCommand;
      if (config.nativeDashboard && config.nativeDashboard.command) {
        config.nativeDashboard.command = pythonCommand;
      }
    }
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

    // Preflight the port. The configured port may be occupied (a stale daemon
    // from a prior session, or an unrelated process such as an IDE's dev
    // server). Without this the daemon would spawn, fail to bind, exit, and the
    // auto-restart logic would loop forever while the app reported the server
    // as "not working". Resolve to a usable port and rewrite the launch args so
    // every downstream consumer (endpoint, health URL, rpc URL, launch plan,
    // renderer tool panels) follows the live port.
    const portResolution = await this._resolveDaemonPort(config);
    if (portResolution.adopted) {
      console.log(`[${config.name}] Port ${config.port} already serving a healthy ${config.id} daemon; adopting it without spawning.`);
      const adoptedDaemon = {
        id: daemonId,
        name: config.name,
        packageName: config.packageName,
        entrypoint: `${config.command} ${config.args.join(' ')}`,
        process: null,
        pid: null,
        port: config.port,
        status: 'running',
        adopted: true,
        startTime: Date.now(),
        restartCount: this.restartCounts.get(daemonId) || 0,
        lastError: null,
        lastHealth: null,
        launchOrder: config.launchOrder,
        endpoint: this._daemonEndpoint(config),
        logs: []
      };
      this.daemons.set(daemonId, adoptedDaemon);
      this._recordLaunchReceipt(config, adoptedDaemon, 'launch_adopted', 'ok', {
        reason: options.reason || 'manual',
        health: await this.checkDaemonHealth(daemonId)
      });
      this.emit('started', { daemon: daemonId, port: config.port });
      return adoptedDaemon;
    } else if (portResolution.reassigned) {
      console.warn(`[${config.name}] Configured port ${config.port} is in use by another process; falling back to port ${portResolution.port}.`);
      config.port = portResolution.port;
      config.args = this._applyPortToArgs(config.args, portResolution.port);
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
    // MCP++ capability detection can be slow (datasets imports a ~10s trio/p2p
    // bridge; the accelerate JSON-RPC surface can take a few seconds to mount),
    // so kick it off without blocking startup and let convergence update the
    // cached status in the background for every status reader.
    this._refreshMcpPlusPlusStatus(config, daemon).catch(() => {});
    this._scheduleMcpPlusPlusConvergence(config);

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

    // Launch daemons concurrently rather than awaiting each one's health before
    // spawning the next. The servers bind distinct ports and have no hard
    // startup ordering dependency, so a sequential launch only served to stack
    // their (10-13s) cold-boot times — e.g. accelerate would not report healthy
    // until ~30s in, well past the UI/health-probe windows, which surfaced as
    // "MCP++ servers not working". Spawn in launchOrder for deterministic logs,
    // but let the cold boots overlap so all three are healthy in ~max(boot),
    // not ~sum(boot).
    const launches = [];
    for (const config of orderedConfigs) {
      launches.push(
        this.startDaemon(config.id, { reason: 'app_launch' }).catch(err => {
          console.error(`Failed to start ${config.name}:`, err);
          this._recordLaunchReceipt(config, null, 'launch_failed', 'error', {
            reason: 'app_launch',
            error: err.message
          });
          return null;
        })
      );
    }
    const started = await Promise.all(launches);
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

    // Always surface every CONFIGURED daemon, not only the ones already present
    // in this.daemons. Daemons are registered lazily as startDaemon runs (and
    // startAll registers them sequentially), so keying solely off started
    // daemons made the UI render fewer than the three configured cards during
    // and after startup — which read as "MCP++ servers missing/not working".
    // Merge live runtime state over a configured-but-not-started baseline.
    for (const config of this.daemonConfigs) {
      const id = config.id;
      const daemon = this.daemons.get(id);
      if (daemon) {
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
      } else {
        status[id] = {
          id,
          name: config.name,
          status: 'stopped',
          pid: null,
          port: config.port,
          uptime: 0,
          restartCount: this.restartCounts.get(id) || 0,
          lastError: null,
          lastHealth: null,
          mcpPlusPlus: this._mcpPlusPlusStatus(id, null),
          endpoint: this._daemonEndpoint(config),
          nativeDashboard: this._nativeDashboardStatus(id),
          packageName: config.packageName,
          launchOrder: config.launchOrder,
          recentLogs: []
        };
      }
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
          } else if (health.healthy && daemon.status === 'degraded') {
            // The process is alive and the endpoint is now responding. A server
            // that booted slowly (heavy Python imports) and missed its startup
            // budget was parked in 'degraded'; promote it back to 'running' so
            // the UI stops reporting a working server as broken.
            daemon.status = 'running';
            console.log(`[${daemon.name}] Recovered: endpoint healthy, marking as running`);
            this.emit('recovered', { daemon: id, port: config.port, health });
            this.emit('started', { daemon: id, port: config.port, health });
          } else if (!health.endpoint_ok && daemon.status === 'running') {
            // Process is alive but the endpoint stopped responding; reflect the
            // transient degradation instead of continuing to report 'running'.
            daemon.status = 'degraded';
            console.warn(`[${daemon.name}] Endpoint not responding (process alive), marking as degraded`);
            this.emit('degraded', { daemon: id, port: config.port, health });
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
            task_id: MGW_556_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            supervisor_gap_receipt: MGW_556_DAEMON_LAUNCH_VALIDATION_GATE.supervisor_gap_receipt,
            launch_gate_receipt: MGW_556_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
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
            task_id: VAI_538_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_538_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_538_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
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
            task_id: VAI_549_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_549_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_549_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_555_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_555_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_555_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_557_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_557_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_557_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_565_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_565_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_565_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_568_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_568_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_568_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_574_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_574_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_574_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_577_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_577_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_577_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_580_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_580_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_580_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_583_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_583_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_583_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_586_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_586_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_586_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_589_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_589_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_589_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_593_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_593_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_593_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_596_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_596_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_596_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_599_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_599_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_599_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_602_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_602_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_602_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_605_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_605_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_605_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_608_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_608_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_608_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_612_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_612_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_612_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_615_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_615_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_615_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_618_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_618_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_618_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_621_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_621_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_621_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_624_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_624_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_624_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_627_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_627_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_627_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_630_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_630_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_630_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_633_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_633_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_633_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_636_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_636_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_636_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_639_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_639_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_639_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_641_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_641_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_641_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_660_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_660_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_660_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: VAI_681_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: VAI_681_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            launch_gate_receipt: VAI_681_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
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
          },
          {
            task_id: HAO_743_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            supervisor_gap_receipt: HAO_743_DAEMON_LAUNCH_VALIDATION_GATE.supervisor_gap_receipt,
            launch_gate_receipt: HAO_743_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: HAO_745_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            objective_gap_receipt: HAO_745_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
            supervisor_gap_receipt: HAO_745_DAEMON_LAUNCH_VALIDATION_GATE.supervisor_gap_receipt,
            launch_gate_receipt: HAO_745_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          },
          {
            task_id: HAO_755_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
            goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
            evidence_term: 'launch Playwright validation gate',
            playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
            supervisor_gap_receipt: HAO_755_DAEMON_LAUNCH_VALIDATION_GATE.supervisor_gap_receipt,
            launch_gate_receipt: HAO_755_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
          }
        ],
        daemon_id: config.id,
        server_package: config.packageName,
        startup_order: config.launchOrder,
        entrypoint: `${config.command} ${config.args.join(' ')}`,
        cwd: config.cwd,
        port: config.port,
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
      vai_task_ids: overrides.vai_task_ids || [...DAEMON_LAUNCH_GATE_VAI_TASK_IDS],
      backlog_task_id: DAEMON_LAUNCH_GATE_BACKLOG_TASK_ID,
      backlog_task_ids: overrides.backlog_task_ids || [...DAEMON_LAUNCH_GATE_BACKLOG_TASK_IDS],
      shared_packet_task_id: overrides.shared_packet_task_id || DAEMON_LAUNCH_GATE_TASK_ID,
      goal_id: DAEMON_LAUNCH_GATE_GOAL_ID,
      goal_packet: DAEMON_LAUNCH_GATE_PACKET_ID,
      packet_goals: [...DAEMON_LAUNCH_GATE_PACKET_GOALS],
      evidence_term: 'launch Playwright validation gate',
      launch_key: 'hallucinate-daemon-launch-orchestration',
      gate_state: overrides.gate_state || 'gate_open_until_playwright_passes',
      discovery_receipts: overrides.discovery_receipts || [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
      objective_gap_receipt: overrides.objective_gap_receipt || 'data/virtual_ai_os/discovery/2026-06-26-vai-519-objective-gap-b023c8de5b69.md',
      objective_gap_receipts: Array.from(new Set([
        ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
        ...(overrides.objective_gap_receipts || []),
        ...(overrides.objective_gap_receipt ? [overrides.objective_gap_receipt] : [])
      ])),
      supervisor_gap_receipt: overrides.supervisor_gap_receipt || 'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-702-objective-gap-b023c8de5b69.md',
      supervisor_gap_receipts: overrides.supervisor_gap_receipts || [...DAEMON_LAUNCH_GATE_SUPERVISOR_GAP_RECEIPTS],
      hallucinate_backlog_receipt: overrides.hallucinate_backlog_receipt || 'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-702-daemon-launch-health-gate.md',
      hallucinate_backlog_receipts: overrides.hallucinate_backlog_receipts || [...DAEMON_LAUNCH_GATE_HALLUCINATE_BACKLOG_RECEIPTS],
      ...(overrides.launch_gate_receipt ? { launch_gate_receipt: overrides.launch_gate_receipt } : {}),
      ...(overrides.receipt_fixture ? { receipt_fixture: overrides.receipt_fixture } : {}),
      ...(overrides.todo_source ? { todo_source: overrides.todo_source } : {}),
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
        ...MGW_556_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          MGW_556_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: MGW_556_DAEMON_LAUNCH_VALIDATION_GATE.supervisor_gap_receipt,
        objective_gap_receipts: [
          ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
          MGW_556_DAEMON_LAUNCH_VALIDATION_GATE.supervisor_gap_receipt
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_536_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_536_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_538_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_538_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_540_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_540_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_549_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_549_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_555_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_555_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_557_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_557_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_565_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_565_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_568_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_568_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_574_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_574_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_577_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_577_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_580_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_580_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_583_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_583_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_586_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_586_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_589_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_589_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_593_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_593_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_596_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_596_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_599_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_599_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_602_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_602_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_605_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_605_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_608_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_608_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_612_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_612_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_615_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_615_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_618_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_618_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_621_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_621_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_624_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_624_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_627_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_627_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_630_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_630_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_633_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_633_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_636_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_636_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_639_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_639_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_641_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS],
        objective_gap_receipt: VAI_641_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_643_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        vai_task_ids: [...DAEMON_LAUNCH_GATE_VAI_TASK_IDS, VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.task_id],
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
        objective_gap_receipts: [
          ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_645_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        vai_task_ids: [
          ...DAEMON_LAUNCH_GATE_VAI_TASK_IDS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.task_id
        ],
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
        objective_gap_receipts: [
          ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_648_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        vai_task_ids: [
          ...DAEMON_LAUNCH_GATE_VAI_TASK_IDS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.task_id
        ],
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
        objective_gap_receipts: [
          ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_650_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        vai_task_ids: [
          ...DAEMON_LAUNCH_GATE_VAI_TASK_IDS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.task_id
        ],
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
        objective_gap_receipts: [
          ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_652_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        vai_task_ids: [
          ...DAEMON_LAUNCH_GATE_VAI_TASK_IDS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.task_id
        ],
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
        objective_gap_receipts: [
          ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_654_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        vai_task_ids: [
          ...DAEMON_LAUNCH_GATE_VAI_TASK_IDS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.task_id
        ],
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
        objective_gap_receipts: [
          ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_656_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        vai_task_ids: [
          ...DAEMON_LAUNCH_GATE_VAI_TASK_IDS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.task_id
        ],
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
        objective_gap_receipts: [
          ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_658_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        vai_task_ids: [
          ...DAEMON_LAUNCH_GATE_VAI_TASK_IDS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.task_id
        ],
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
        objective_gap_receipts: [
          ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_660_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        vai_task_ids: [
          ...DAEMON_LAUNCH_GATE_VAI_TASK_IDS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_660_DAEMON_LAUNCH_VALIDATION_GATE.task_id
        ],
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_660_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: VAI_660_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
        objective_gap_receipts: [
          ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_660_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...VAI_681_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        vai_task_ids: [
          ...DAEMON_LAUNCH_GATE_VAI_TASK_IDS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_660_DAEMON_LAUNCH_VALIDATION_GATE.task_id,
          VAI_681_DAEMON_LAUNCH_VALIDATION_GATE.task_id
        ],
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_660_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt,
          VAI_681_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: VAI_681_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
        objective_gap_receipts: [
          ...DAEMON_LAUNCH_GATE_OBJECTIVE_GAP_RECEIPTS,
          VAI_643_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_645_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_648_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_650_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_652_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_654_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_656_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_658_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_660_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
          VAI_681_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...HAO_719_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        backlog_task_ids: ['HAO-702', 'HAO-713', 'HAO-719', 'HAO-721'],
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          HAO_719_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: HAO_719_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
        supervisor_gap_receipts: [
          'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-702-objective-gap-b023c8de5b69.md',
          'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-objective-gap-b023c8de5b69.md',
          HAO_719_DAEMON_LAUNCH_VALIDATION_GATE.supervisor_gap_receipt,
          'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-objective-gap-b023c8de5b69.md'
        ],
        hallucinate_backlog_receipts: [
          'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-702-daemon-launch-health-gate.md',
          'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-daemon-launch-health-gate.md',
          HAO_719_DAEMON_LAUNCH_VALIDATION_GATE.hallucinate_backlog_receipt,
          'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-daemon-launch-health-gate.md'
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...HAO_721_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        backlog_task_ids: ['HAO-702', 'HAO-713', 'HAO-719', 'HAO-721'],
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS,
          HAO_721_DAEMON_LAUNCH_VALIDATION_GATE.launch_gate_receipt
        ],
        objective_gap_receipt: HAO_721_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt,
        supervisor_gap_receipts: [
          'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-702-objective-gap-b023c8de5b69.md',
          'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-objective-gap-b023c8de5b69.md',
          'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-objective-gap-b023c8de5b69.md',
          HAO_721_DAEMON_LAUNCH_VALIDATION_GATE.supervisor_gap_receipt
        ],
        hallucinate_backlog_receipts: [
          'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-702-daemon-launch-health-gate.md',
          'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-daemon-launch-health-gate.md',
          'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-daemon-launch-health-gate.md',
          HAO_721_DAEMON_LAUNCH_VALIDATION_GATE.hallucinate_backlog_receipt
        ]
      }),
      this.getDaemonLaunchValidationGate({
        ...HAO_743_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS
        ],
        objective_gap_receipt: HAO_743_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...HAO_745_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS
        ],
        objective_gap_receipt: HAO_745_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      }),
      this.getDaemonLaunchValidationGate({
        ...HAO_755_DAEMON_LAUNCH_VALIDATION_GATE,
        shared_packet_task_id: DAEMON_LAUNCH_GATE_TASK_ID,
        discovery_receipts: [
          ...DAEMON_LAUNCH_GATE_DISCOVERY_RECEIPTS
        ],
        objective_gap_receipt: HAO_755_DAEMON_LAUNCH_VALIDATION_GATE.objective_gap_receipt
      })
    ];
  }

  getDashboardCapabilityCatalog() {
    return jsonStableCatalogValue({
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
    });
  }

  getDashboardCapability(daemonId) {
    return this._dashboardCapabilityEntry(this._requireDaemonConfig(daemonId));
  }

  async dashboardHealth(daemonId) {
    const config = this._requireDaemonConfig(daemonId);
    const health = await this.checkDaemonHealth(daemonId);
    // Once the backend is healthy, converge the MCP++ status to the live-verified
    // value. The initialize handshake can fail at first launch (JSON-RPC surface
    // not mounted yet); the dashboard polls health, so re-probing here lets the
    // MCP++ badge reflect the real negotiated capability instead of a stale value.
    if (health.healthy) {
      await this._maybeRefreshMcpPlusPlusStatus(daemonId);
    }
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

  /**
   * Resolve whether a TCP port on 127.0.0.1 can be bound right now.
   * Returns true when the port is free, false when something is already
   * listening on it.
   */
  _isPortAvailable(port) {
    return new Promise((resolve) => {
      const tester = net.createServer();
      tester.once('error', (err) => {
        tester.close(() => {});
        // EADDRINUSE / EACCES => not available; anything else, assume unusable.
        resolve(false);
      });
      tester.once('listening', () => {
        tester.close(() => resolve(true));
      });
      try {
        tester.listen(port, '127.0.0.1');
      } catch (e) {
        resolve(false);
      }
    });
  }

  /**
   * Probe whether the process already listening on `port` is one of *our* MCP
   * daemons by hitting its health path. Lets us adopt a still-running daemon
   * (e.g. left over from a previous app session) instead of treating it as a
   * foreign conflict.
   */
  async _portServesOurDaemon(config, port) {
    if (typeof fetch !== 'function') return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.healthTimeoutMs);
    try {
      const resp = await fetch(`http://127.0.0.1:${port}${config.healthPath}`, { signal: controller.signal });
      return resp.ok;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Find a usable port for a daemon. Prefers the configured port; if it is
   * occupied by a foreign process, scans forward for the next free port so the
   * daemon still launches instead of crash-looping on EADDRINUSE.
   * Returns { port, reassigned, adopted }.
   */
  async _resolveDaemonPort(config) {
    const preferred = config.port;
    if (await this._isPortAvailable(preferred)) {
      return { port: preferred, reassigned: false, adopted: false };
    }
    // Port is busy — is it our own daemon already serving? If so, adopt it.
    if (await this._portServesOurDaemon(config, preferred)) {
      return { port: preferred, reassigned: false, adopted: true };
    }
    // Foreign occupant: scan forward for a free port.
    for (let candidate = preferred + 1; candidate <= preferred + 50; candidate += 1) {
      if (await this._isPortAvailable(candidate)) {
        return { port: candidate, reassigned: true, adopted: false };
      }
    }
    // Nothing free in range; fall back to the preferred port and let the
    // daemon surface its own bind error.
    return { port: preferred, reassigned: false, adopted: false };
  }

  /**
   * Return a copy of `args` with the daemon's `--port` value set to `port`.
   * Replaces an existing `--port <n>` token, or appends one when the daemon
   * relies on its built-in default (e.g. ipfs-kit).
   */
  _applyPortToArgs(args, port) {
    const next = Array.isArray(args) ? [...args] : [];
    const idx = next.indexOf('--port');
    if (idx !== -1 && idx + 1 < next.length) {
      next[idx + 1] = String(port);
    } else {
      next.push('--port', String(port));
    }
    return next;
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
      menu_dashboard_url: nativeDashboardUrl || `${endpoint}/dashboard`,
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
    const result = {
      ok: health.healthy,
      fail_closed: !health.healthy,
      daemon_id: config.id,
      server_package: config.packageName,
      operation: toolProtocol.operation,
      transport: config.transport,
      endpoint: this._daemonEndpoint(config),
      url: toolProtocol.url,
      health,
      // Live verification fields: prove the dashboard exercised the real MCP
      // backend rather than only checking the health endpoint.
      live: false,
      live_ok: false,
      expected_receipt: toolProtocol.safeProbe?.expected_receipt || `${config.id}_${toolProtocol.operation.replace('/', '_')}_probe`,
      mediation_receipt_id: mediation.mediation_receipt.receipt_id,
      mediation_receipt_cid: mediation.mediation_receipt.receipt_cid
    };

    if (health.healthy) {
      const live = await this._invokeLiveTool(config, toolProtocol.operation);
      result.live_invocation = live;
      result.live = !!live.live;
      result.live_ok = !!live.ok;
      result.live_status_code = live.status_code ?? null;
      if (live.live) {
        if (toolProtocol.operation === 'tools/list' || live.list_proxy) {
          result.tool_count = live.tool_count;
          result.tools_sample = live.tools_sample;
        } else if (live.response_preview) {
          result.live_response_preview = live.response_preview;
        }
      } else if (live.error || live.reason) {
        result.live_error = live.error || live.reason;
      }
    }

    return result;
  }

  _extractLiveToolList(json) {
    if (Array.isArray(json)) {
      return json;
    }
    if (Array.isArray(json?.tools)) {
      return json.tools;
    }
    if (Array.isArray(json?.result?.tools)) {
      return json.result.tools;
    }
    if (Array.isArray(json?.data?.tools)) {
      return json.data.tools;
    }
    if (json?.tools && typeof json.tools === 'object') {
      return Object.keys(json.tools).map((name) => ({ name }));
    }
    return [];
  }

  /**
   * Compute the TRUE tool catalog for a live tools/list response using the same
   * shared helper the dashboards use. Excludes the 4 hierarchical facade
   * meta-tools, honors an inline total/categories the server reports, and sums
   * per-category counts from a fetched tools_list_categories payload.
   *
   * Falls back to a meta-tool-excluding flat count if the shared helper is not
   * available, so the daemon manager never depends on the browser bundle being
   * importable.
   */
  _summarizeLiveTools(listJson, categoriesJson) {
    if (MCPToolCatalog && typeof MCPToolCatalog.summarize === 'function') {
      return MCPToolCatalog.summarize(listJson, categoriesJson);
    }
    const META = new Set(['tools_list_categories', 'tools_list_tools', 'tools_get_schema', 'tools_dispatch']);
    const domainTools = this._extractLiveToolList(listJson).filter((t) => {
      const name = typeof t === 'string' ? t : t?.name;
      return name ? !META.has(name) : true;
    });
    return {
      total: domainTools.length,
      domainTools,
      metaTools: [],
      categories: [],
      hierarchical: false,
      reduced: false,
      source: 'fallback_flat'
    };
  }

  /**
   * Fetch a server's tools_list_categories once so a reduced hierarchical
   * tools/list (meta-tools only) can be resolved to its true total. Uses the
   * daemon's `categoriesProbe` spec; returns the parsed JSON or null on any
   * failure (the caller keeps the reduced summary in that case).
   */
  async _fetchLiveCategories(config, spec) {
    const probe = spec && spec.categoriesProbe;
    if (!probe || typeof fetch !== 'function') {
      return null;
    }
    const url = `${this._daemonEndpoint(config)}${probe.path}`;
    const headers = { 'content-type': 'application/json' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      if (probe.requiresAuth) {
        headers.authorization = `Bearer ${await this._liveAuthToken(config, spec)}`;
      }
      const response = await fetch(url, {
        method: probe.method || 'POST',
        headers,
        body: probe.method === 'GET' ? undefined : JSON.stringify(probe.body || {}),
        signal: controller.signal
      });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async _liveAuthToken(config, spec) {
    if (!this._liveAuthTokens) {
      this._liveAuthTokens = new Map();
    }
    const cached = this._liveAuthTokens.get(config.id);
    if (cached && cached.expires > Date.now()) {
      return cached.token;
    }
    const url = `${this._daemonEndpoint(config)}${spec.auth.loginPath}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: spec.auth.username, password: spec.auth.password }),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`auth login http ${response.status}`);
      }
      const data = await response.json();
      const token = data.access_token || data.token;
      if (!token) {
        throw new Error('auth login returned no access_token');
      }
      this._liveAuthTokens.set(config.id, { token, expires: Date.now() + 60000 });
      return token;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Perform a real HTTP request against the underlying MCP backend and return
   * the live result. This is what lets dashboards verify working results from
   * the live services instead of relying on mocks or a health check alone.
   */
  async _invokeLiveTool(config, operation) {
    const spec = LIVE_TOOL_INVOCATION[config.id];
    if (!spec) {
      return { live: false, supported: false, reason: 'no_live_invocation_spec' };
    }
    const opSpec = operation === 'tools/list' ? spec.toolsList : spec.toolsCall;
    if (!opSpec) {
      return { live: false, supported: false, reason: 'operation_not_supported' };
    }
    if (typeof fetch !== 'function') {
      return { live: false, supported: true, reason: 'fetch_unavailable' };
    }

    const url = `${this._daemonEndpoint(config)}${opSpec.path}`;
    const headers = { 'content-type': 'application/json' };
    let body;

    try {
      if (opSpec.requiresAuth) {
        const token = await this._liveAuthToken(config, spec);
        headers.authorization = `Bearer ${token}`;
      }
      if (opSpec.method === 'POST') {
        if (opSpec.jsonRpc) {
          const rpcMethod = opSpec.rpcMethod || 'tools/call';
          const rpc = { jsonrpc: '2.0', method: rpcMethod, id: 1 };
          if (rpcMethod === 'tools/call') {
            rpc.params = { name: opSpec.toolName, arguments: opSpec.arguments || {} };
          } else if (opSpec.params) {
            rpc.params = opSpec.params;
          }
          body = JSON.stringify(rpc);
        } else {
          body = JSON.stringify(opSpec.body || {});
        }
      }
    } catch (error) {
      return { live: false, supported: true, url, method: opSpec.method, ok: false, error: error.message };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const started = Date.now();
    try {
      const response = await fetch(url, { method: opSpec.method, headers, body, signal: controller.signal });
      let json = null;
      let text = null;
      try {
        json = await response.json();
      } catch {
        try {
          text = await response.text();
        } catch {
          text = null;
        }
      }
      const live = {
        live: true,
        supported: true,
        url,
        method: opSpec.method,
        status_code: response.status,
        ok: response.ok,
        latency_ms: Date.now() - started,
        list_proxy: !!opSpec.listProxy
      };
      if (operation === 'tools/list' || opSpec.listProxy) {
        const rawTools = this._extractLiveToolList(json);
        let summary = this._summarizeLiveTools(json);
        // A reduced hierarchical server returns only the 4 facade meta-tools in
        // tools/list; its true total lives in tools_list_categories. Fetch that
        // once (mirroring the unified tool explorer) so this telemetry matches
        // the visible tool report instead of under-reporting.
        if (summary.reduced && spec && spec.categoriesProbe) {
          const categoriesJson = await this._fetchLiveCategories(config, spec);
          if (categoriesJson) {
            summary = this._summarizeLiveTools(json, categoriesJson);
          }
        }
        live.tool_count = summary.total;
        live.tool_count_source = summary.source;
        const domainNames = (summary.domainTools || [])
          .map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean);
        const categoryNames = (summary.categories || [])
          .map((c) => c && c.name).filter(Boolean);
        let sample = domainNames.length ? domainNames : categoryNames;
        if (!sample.length) {
          // Last resort: fall back to whatever the raw list held (may be the
          // meta-tools on a reduced server we couldn't augment).
          sample = rawTools.map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean);
        }
        live.tools_sample = sample.slice(0, 8);
        // Preserve the existing "the list endpoint works" gate: the tools/list
        // call returned at least one descriptor (a reduced meta-only surface
        // still proves the endpoint is live). Keeping this independent of the
        // true count means the categories follow-up can never flip live_ok.
        live.ok = response.ok && rawTools.length > 0;
      } else {
        // A JSON-RPC tools/call returns HTTP 200 even for protocol errors
        // ({"error": ...}); only treat it as a working result when the backend
        // returned a non-error JSON-RPC result so live_ok reflects a real call.
        if (json && typeof json === 'object' && 'jsonrpc' in json) {
          live.ok = response.ok && !json.error && json.result !== undefined;
          if (json.error) {
            live.error = typeof json.error === 'object' ? json.error.message || JSON.stringify(json.error) : String(json.error);
          }
        }
        live.response_preview = json ? JSON.stringify(json).slice(0, 400) : String(text || '').slice(0, 400);
      }
      return live;
    } catch (error) {
      return {
        live: false,
        supported: true,
        url,
        method: opSpec.method,
        ok: false,
        error: error.name === 'AbortError' ? 'timeout' : error.message,
        latency_ms: Date.now() - started
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  _mcpPlusPlusStatus(daemonId, daemon = null) {
    if (daemon?.mcpPlusPlus) {
      return daemon.mcpPlusPlus;
    }
    const live = this.mcpPlusPlusCapabilities.get(daemonId);
    if (live) {
      return live;
    }
    // Fall back to the statically advertised MCP++ descriptor so dashboards and
    // status payloads expose the daemon's MCP++ profiles/capabilities even
    // before it has finished starting (live status is only populated once
    // startDaemon -> _refreshMcpPlusPlusStatus runs). Without this, opening a
    // dashboard during/just after startup showed no MCP++ profiles, which read
    // as the MCP++ surface being unavailable.
    const config = this.daemonConfigs.find((d) => d.id === daemonId);
    return config ? this._launchPlanMcpPlusPlus(config) : null;
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
    // Deduplicate concurrent probes for the same daemon: the initial fire-and-
    // forget probe from startDaemon and the background convergence tick can
    // otherwise stack multiple ~10s subprocess probes on top of each other.
    if (!this._mcpPlusPlusProbesInFlight) {
      this._mcpPlusPlusProbesInFlight = new Map();
    }
    const existing = this._mcpPlusPlusProbesInFlight.get(config.id);
    if (existing) {
      return existing;
    }
    const promise = (async () => {
      const status = await this._collectMcpPlusPlusStatus(config);
      this.mcpPlusPlusCapabilities.set(config.id, status);
      if (daemon) {
        daemon.mcpPlusPlus = status;
      } else {
        const tracked = this.daemons.get(config.id);
        if (tracked) {
          tracked.mcpPlusPlus = status;
        }
      }
      return status;
    })();
    this._mcpPlusPlusProbesInFlight.set(config.id, promise);
    try {
      return await promise;
    } finally {
      this._mcpPlusPlusProbesInFlight.delete(config.id);
    }
  }

  /**
   * Re-run the MCP++ capability probe only when it hasn't already resolved to a
   * live/available state. This keeps the dashboard health poll cheap (no repeated
   * subprocess/handshake once verified) while still letting a slow-to-mount
   * MCP++ surface converge to its real status.
   */
  async _maybeRefreshMcpPlusPlusStatus(daemonId) {
    const current = this.mcpPlusPlusCapabilities.get(daemonId);
    if (current && (current.live_verified === true || current.available === true)) {
      return current;
    }
    const config = this._requireDaemonConfig(daemonId);
    return this._refreshMcpPlusPlusStatus(config, this.daemons.get(daemonId)).catch(() => current);
  }

  /**
   * The accelerate MCP++ JSON-RPC surface can take several seconds after the
   * health endpoint reports ready to finish mounting (heavy model-manager init).
   * Re-probe the live `initialize` handshake in the background until it verifies
   * so EVERY status reader (getAll status payload, dashboard health poll, launch
   * receipts) converges to the real MCP++ capability instead of the initial
   * unverified value. Timers are unref'd so they never keep the process alive.
   */
  _scheduleMcpPlusPlusConvergence(config, { maxAttempts = 20, delayMs = 2000 } = {}) {
    const current = this.mcpPlusPlusCapabilities.get(config.id);
    if (current && current.available === true) {
      return;
    }
    // kit exposes no MCP++ surface; only accelerate (live initialize handshake)
    // and datasets (async trio/p2p bridge probe) resolve asynchronously.
    if (config.id !== 'ipfs-accelerate' && config.id !== 'ipfs-datasets') {
      return;
    }
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      const daemon = this.daemons.get(config.id);
      if (!daemon || daemon.status === 'stopped') {
        return;
      }
      const status = await this._refreshMcpPlusPlusStatus(config, daemon).catch(() => null);
      if (status && status.available === true) {
        return;
      }
      if (attempts < maxAttempts) {
        const timer = setTimeout(tick, delayMs);
        if (typeof timer.unref === 'function') {
          timer.unref();
        }
      }
    };
    const first = setTimeout(tick, delayMs);
    if (typeof first.unref === 'function') {
      first.unref();
    }
  }

  /**
   * Run a short Python capability probe asynchronously (never blocking the event
   * loop) and resolve its stdout/stderr. MCP++ bridge detection imports a heavy
   * trio/p2p stack that can take ~10s, so a synchronous probe with a short cap
   * both blocked the UI and got killed before producing output.
   */
  _spawnCapabilityProbe(config, script, timeoutMs) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (result) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      let child;
      try {
        child = spawn(config.command, ['-c', script], {
          cwd: config.cwd,
          env: this._buildDaemonEnv(config)
        });
      } catch (error) {
        finish({ stdout: '', stderr: error.message });
        return;
      }
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already exited */
        }
        finish({ stdout: '', stderr: `capability probe timed out after ${timeoutMs}ms` });
      }, timeoutMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', (error) => { clearTimeout(timer); finish({ stdout: '', stderr: error.message }); });
      child.on('close', () => { clearTimeout(timer); finish({ stdout, stderr }); });
    });
  }

  /**
   * Speak the newer MCP++ protocol to the live backend: perform the JSON-RPC
   * `initialize` handshake (advertising the MCP++ experimental capabilities) and
   * read back the server's negotiated capabilities + serverInfo. This is what
   * lets the JS SDK verify MCP++ support against the running server instead of
   * statically assuming it. Tries the canonical /mcp endpoint first, then the
   * legacy /jsonrpc alias.
   */
  async _probeMcpPlusPlusInitialize(config) {
    if (typeof fetch !== 'function') {
      return null;
    }
    const experimental = {};
    for (const profile of ACCELERATE_MCPPLUSPLUS_PROFILES) {
      experimental[profile] = true;
    }
    const endpoint = this._daemonEndpoint(config);
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: { experimental } }
    });
    for (const path of ['/mcp', '/jsonrpc']) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(`${endpoint}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          signal: controller.signal
        });
        if (!response.ok) {
          continue;
        }
        const json = await response.json().catch(() => null);
        const result = json && json.result;
        if (!result) {
          continue;
        }
        const serverInfo = result.serverInfo || {};
        const negotiated = (result.capabilities && result.capabilities.experimental) || {};
        return {
          endpoint_path: path,
          server_name: serverInfo.name || null,
          server_version: serverInfo.version || null,
          protocol_version: result.protocolVersion || null,
          negotiated_capabilities: Object.keys(negotiated),
          is_mcpplusplus: serverInfo.name === 'mcp++'
        };
      } catch {
        /* try the next candidate endpoint */
      } finally {
        clearTimeout(timeout);
      }
    }
    return null;
  }

  async _collectMcpPlusPlusStatus(config) {
    if (config.id === 'ipfs-accelerate') {
      const handshake = await this._probeMcpPlusPlusInitialize(config);
      if (handshake && handshake.is_mcpplusplus) {
        return {
          provider: 'ipfs_accelerate_py.mcp_dashboard.jsonrpc.initialize',
          available: true,
          state: 'available',
          live_verified: true,
          supports_profile_negotiation: true,
          mode: 'optional_additive',
          profiles: [...ACCELERATE_MCPPLUSPLUS_PROFILES],
          active_profile: ACCELERATE_MCPPLUSPLUS_PROFILES[0],
          protocol_version: handshake.protocol_version,
          server_info: { name: handshake.server_name, version: handshake.server_version },
          negotiated_capabilities: handshake.negotiated_capabilities,
          handshake_endpoint: handshake.endpoint_path,
          message: `Live MCP++ initialize handshake negotiated with ${handshake.server_name} ${handshake.server_version || ''}`.trim()
        };
      }
      // The handshake did not confirm a live mcp++ server (still starting, or the
      // running variant lacks the JSON-RPC surface). Advertise the profiles the
      // runtime supports, but do NOT claim live availability — this replaces the
      // previous hardcoded available:true "mock" with the real, unverified state.
      return {
        provider: 'ipfs_accelerate_py.mcp_server.server.get_unified_supported_profiles',
        available: false,
        state: 'degraded',
        live_verified: false,
        supports_profile_negotiation: true,
        mode: 'optional_additive',
        profiles: [...ACCELERATE_MCPPLUSPLUS_PROFILES],
        active_profile: ACCELERATE_MCPPLUSPLUS_PROFILES[0],
        message: 'MCP++ initialize handshake did not confirm a live mcp++ server; showing advertised profiles only.'
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
        // The datasets MCP++ bridge imports a trio/p2p stack that can take ~10s
        // to load, so this probe runs async (never blocking the event loop) with
        // a timeout well above that import cost. A 4s cap previously killed it,
        // making the live bridge report as unavailable ("empty capability probe").
        const result = await this._spawnCapabilityProbe(config, probeScript, 25000);

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
      const timeout = setTimeout(() => controller.abort(), this.healthTimeoutMs);
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
    // Adopted daemons (an already-running instance we attached to without
    // spawning) have no child PID, so trust the endpoint for liveness.
    if (daemon?.adopted && result.endpoint_ok) {
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
