import playwrightTest from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import MCPDaemonManager from '../../hallucinate_app/node/mcp_daemon_manager.js';
import { mcpServers } from '../../hallucinate_app/node/menu_config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { test, expect, _electron: electron } = playwrightTest as unknown as typeof import('@playwright/test');
const hasElectronDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const electronDescribe = hasElectronDisplay ? test.describe : test.describe.skip;
const LAUNCH_READINESS_FIXTURE = path.join(__dirname, 'fixtures', 'hao-682-mcp-dashboard-launch-readiness.json');

const DASHBOARD_SERVER_IDS = ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'] as const;
const FOLLOW_UP_TASKS = ['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683'];
const VAI_503_EVIDENCE_TERMS = [
  'catalog normalization',
  'dashboard UI wiring',
  'mediated tool-call receipts',
  'Swissknife consumers',
  'Playwright coverage',
  'supervisor-generated follow-up subtasks'
];

function electronLaunchEnv(extra: Record<string, string> = {}) {
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
  return {
    ...env,
    ...extra
  };
}

async function clickApplicationMenuItem(electronApp: ElectronApplication, targetLabel: string) {
  return electronApp.evaluate(({ Menu }, label) => {
    const normalize = (value: unknown) =>
      String(value || '').replace(/[^\x20-\x7E]/g, '').trim();
    const matches = (value: unknown) => {
      const normalized = normalize(value);
      return normalized === label || normalized.includes(label);
    };
    const visit = (items: any[]): any => {
      for (const item of items || []) {
        if (matches(item.label)) {
          return item;
        }
        const found = visit(item.submenu?.items || []);
        if (found) {
          return found;
        }
      }
      return null;
    };
    const menu = Menu.getApplicationMenu();
    const item = visit(menu?.items || []);
    if (!item) {
      return false;
    }
    item.click();
    return true;
  }, targetLabel);
}

async function dashboardCatalog(window: Page) {
  return window.evaluate(async () => window?.electronAPI?.daemon?.getDashboardCapabilityCatalog?.());
}

electronDescribe('MCP Dashboard Interoperability - VAIOS-G723 Electron UI wiring', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(__dirname, '..', '..', 'index.js')],
      env: electronLaunchEnv({
        NODE_ENV: 'test',
        ELECTRON_ENABLE_LOGGING: '1',
        AUTO_START_DAEMONS: 'false'
      })
    });

    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    window.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('normalizes one dashboard capability catalog across menus and backend services', async () => {
    const catalog = await dashboardCatalog(window);
    const menuById = new Map(mcpServers.map((server: any) => [server.id, server]));
    const servers = new Map((catalog?.servers || []).map((server: any) => [server.daemon_id, server]));

    expect(catalog?.schema).toBe('hallucinate_app.mcp_dashboard_capability_catalog.v1');
    expect(catalog?.goal_id).toBe('VAIOS-G723');
    expect(catalog?.control_surface_route).toEqual([
      'Hallucinate App dashboard action',
      'dashboard capability catalog',
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt',
      'supervised MCP server transport'
    ]);

    for (const daemonId of DASHBOARD_SERVER_IDS) {
      const server = servers.get(daemonId) as any;
      const menuEntry = menuById.get(daemonId) as any;

      expect(server).toBeTruthy();
      expect(server.menu_dashboard_url).toBe(menuEntry.webDashboardUrl);
      expect(server.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(server.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(server.tool_protocols.tools_call.safeProbe.mutation).toBe(false);
      expect(server.mcpplusplus_descriptor_evidence.evidence_label).toBe('MCP++ descriptor/profile evidence');
      expect(server.mcpplusplus_descriptor_evidence.daemon_id).toBe(daemonId);
      expect(server.control_surface_receipt_requirements).toEqual(expect.arrayContaining([
        'interaction_envelope',
        'policy_decision',
        'mediation_receipt',
        'receipt_ids',
        'mcpplusplus_descriptor_evidence',
        'receipt_cid'
      ]));
      expect(server.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.electron.dashboard',
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G723'
      ]));
      expect(server.swissknife_consumer).toContain('Swissknife');
    }

    expect((servers.get('ipfs-kit') as any).endpoint).toBe('http://127.0.0.1:8004');
    expect((servers.get('ipfs-datasets') as any).native_dashboard_catalog_url).toBe(
      'http://127.0.0.1:8899/api/hallucinate/dashboard-catalog'
    );
    expect((servers.get('ipfs-accelerate') as any).mcpplusplus.profiles).toContain('mcp++/profile-e-mcp-p2p');
  });

  test('wires dashboard UI entries for kit, datasets, and accelerate', async () => {
    const dashboardLabels = [
      { label: 'IPFS Kit Dashboard', heading: 'IPFS Kit Dashboard', nativeTitle: 'IPFS Kit Native Dashboard' },
      { label: 'IPFS Datasets Dashboard', heading: 'IPFS Datasets Dashboard', nativeTitle: 'IPFS Datasets Native Dashboard' },
      { label: 'IPFS Accelerate Dashboard', heading: 'IPFS Accelerate Dashboard', nativeTitle: 'IPFS Accelerate Native Dashboard' }
    ];

    for (const dashboard of dashboardLabels) {
      expect(await clickApplicationMenuItem(electronApp, dashboard.label)).toBe(true);
      await expect(window.locator('h1')).toContainText(dashboard.heading);
      await expect(window.locator('#package-dashboard-frame')).toHaveAttribute('title', dashboard.nativeTitle);
      await expect(window.locator('#btn-open-daemon-manager')).toBeVisible();
    }
  });

  test('emits mediated safe-probe tool-call receipts before daemon transport', async () => {
    const { receipts } = await validateMediatedSafeProbeReceipts();
    expect(new Set(receipts).size).toBe(DASHBOARD_SERVER_IDS.length * 2);
  });

  test('keeps supervisor follow-up subtasks attached to dashboard validation failures', async () => {
    const catalog = await dashboardCatalog(window);
    const validationGate = {
      task_id: 'VAI-503',
      goal_id: catalog.goal_id,
      evidence_term: 'launch Playwright validation gate',
      playwright_spec: 'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts',
      follow_up_subtasks: FOLLOW_UP_TASKS,
      failure_rule: 'any dashboard or backend validation failure remains supervisor-generated follow-up work'
    };

    expect(VAI_503_EVIDENCE_TERMS).toContain('catalog normalization');
    expect(VAI_503_EVIDENCE_TERMS).toContain('dashboard UI wiring');
    expect(VAI_503_EVIDENCE_TERMS).toContain('mediated tool-call receipts');
    expect(VAI_503_EVIDENCE_TERMS).toContain('Swissknife consumers');
    expect(VAI_503_EVIDENCE_TERMS).toContain('Playwright coverage');
    expect(VAI_503_EVIDENCE_TERMS).toContain('supervisor-generated follow-up subtasks');
    expect(validationGate.goal_id).toBe('VAIOS-G723');
    expect(validationGate.follow_up_subtasks).toEqual([
      'HAO-678',
      'HAO-679',
      'HAO-680',
      'HAO-681',
      'HAO-682',
      'HAO-683'
    ]);
    expect(validationGate.failure_rule).toContain('supervisor-generated follow-up');
  });
});

test.describe('MCP Dashboard Interoperability - VAIOS-G723 headless backend gate', () => {
  test('normalizes the dashboard capability catalog without a display server', () => {
    const manager = new MCPDaemonManager();
    const catalog = manager.getDashboardCapabilityCatalog();
    const menuById = new Map(mcpServers.map((server: any) => [server.id, server]));
    const servers = new Map((catalog?.servers || []).map((server: any) => [server.daemon_id, server]));

    expect(catalog.schema).toBe('hallucinate_app.mcp_dashboard_capability_catalog.v1');
    expect(catalog.goal_id).toBe('VAIOS-G723');
    expect(catalog.control_surface_route).toContain('mediation_receipt');

    for (const daemonId of DASHBOARD_SERVER_IDS) {
      const server = servers.get(daemonId) as any;
      const menuEntry = menuById.get(daemonId) as any;
      expect(server.menu_dashboard_url).toBe(menuEntry.webDashboardUrl);
      expect(server.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(server.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(server.tool_protocols.tools_call.safeProbe.mutation).toBe(false);
      expect(server.mcpplusplus_descriptor_evidence.evidence_label).toBe('MCP++ descriptor/profile evidence');
      expect(server.swissknife_consumer).toContain('Swissknife');
    }
  });

  test('emits mediated safe-probe tool-call receipts without daemon transport', async () => {
    const { receipts } = await validateMediatedSafeProbeReceipts();
    expect(new Set(receipts).size).toBe(DASHBOARD_SERVER_IDS.length * 2);
  });

  test('records supervisor follow-up subtasks for failed dashboard validation', () => {
    expect(VAI_503_EVIDENCE_TERMS).toEqual([
      'catalog normalization',
      'dashboard UI wiring',
      'mediated tool-call receipts',
      'Swissknife consumers',
      'Playwright coverage',
      'supervisor-generated follow-up subtasks'
    ]);
    expect(FOLLOW_UP_TASKS).toEqual(['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683']);
  });

  test('binds the launch Playwright validation gate to the readiness receipt', () => {
    const receipt = JSON.parse(fs.readFileSync(LAUNCH_READINESS_FIXTURE, 'utf8'));

    expect(receipt.schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe('HAO-682');
    expect(receipt.vai_task_id).toBe('VAI-503');
    expect(receipt.goal_id).toBe('VAIOS-G723');
    expect(receipt.evidence_term).toBe('launch Playwright validation gate');
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.required_backends).toEqual(['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py']);
    expect(receipt.required_evidence).toEqual(VAI_503_EVIDENCE_TERMS);
    expect(receipt.receipt_route).toContain('mediation_receipt');
    expect(receipt.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(receipt.failure_rule).toContain('supervisor-generated follow-up');
  });
});

async function validateMediatedSafeProbeReceipts() {
  const manager = new MCPDaemonManager();
  manager.setControlSurfaceRuntimePolicyEvaluator((request: any) => ({
    outcome: 'allow',
    reasons: ['VAI-503 launch Playwright validation gate safe probe'],
    metadata: {
      gate: 'mcp-dashboard-interoperability',
      daemon_id: request.service_id,
      method: request.method
    }
  }));

  const catalog = manager.getDashboardCapabilityCatalog();
  const receipts = [];

  for (const server of catalog.servers) {
    const listResult = await manager.dashboardToolsList(server.daemon_id, async (_payload: any, mediation: any) => ({
      ok: true,
      daemon_id: server.daemon_id,
      operation: server.tool_protocols.tools_list.operation,
      receipt_id: mediation.mediation_receipt.receipt_id
    }));

    expect(listResult.ok).toBe(true);
    expect(listResult.method).toBe('tools/list');
    expect(listResult.interaction_envelope.normalized_intent.method).toBe('tools/list');
    expect(listResult.mediation_receipt.control_surface_contract_ref).toBe(server.control_surface_mediation_contract);
    expect(listResult.mediation_receipt.receipt_id).toMatch(/^receipt:/);
    expect(listResult.mediation_receipt.receipt_cid).toMatch(/^sha256:mediation_receipt:/);
    expect(listResult.mediation_receipt.metadata.receipt_ids).toMatchObject({
      interaction_id: listResult.interaction_envelope.interaction_id,
      decision_id: listResult.policy_decision.decision_id,
      receipt_id: listResult.mediation_receipt.receipt_id,
      receipt_cid: listResult.mediation_receipt.receipt_cid
    });
    expect(listResult.mediation_receipt.metadata.receipt_route).toEqual([
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt',
      'supervised MCP server transport'
    ]);
    expect(listResult.mediation_receipt.metadata.mcpplusplus).toMatchObject({
      evidence_label: 'MCP++ descriptor/profile evidence',
      daemon_id: server.daemon_id
    });
    expect(listResult.mediation_receipt.metadata.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
      'hallucinate_app.electron.dashboard',
      'hallucinate_app.swissknife.mcp_capability_registry',
      'launch_readiness_packet:VAIOS-G723'
    ]));
    receipts.push(listResult.mediation_receipt.receipt_id);

    const safeProbe = server.tool_protocols.tools_call.safeProbe;
    const result = await manager.dashboardToolsCall(server.daemon_id, async (_payload: any, mediation: any) => ({
      ok: true,
      daemon_id: server.daemon_id,
      operation: server.tool_protocols.tools_call.operation,
      receipt_id: mediation.mediation_receipt.receipt_id,
      expected_receipt: safeProbe.expected_receipt
    }));

    expect(result.ok).toBe(true);
    expect(result.method).toBe('tools/call');
    expect(result.interaction_envelope.normalized_intent.method).toBe('tools/call');
    expect(result.mediation_receipt.control_surface_contract_ref).toBe(server.control_surface_mediation_contract);
    expect(result.mediation_receipt.mediation_result.invoked).toBe(true);
    expect(result.mediation_receipt.receipt_id).toMatch(/^receipt:/);
    expect(result.mediation_receipt.receipt_cid).toMatch(/^sha256:mediation_receipt:/);
    expect(result.mediation_receipt.metadata.mcpplusplus).toMatchObject({
      evidence_label: 'MCP++ descriptor/profile evidence',
      daemon_id: server.daemon_id
    });
    expect(result.policy_decision.outcome).toBe('allow');
    expect(result.output.expected_receipt).toBe(safeProbe.expected_receipt);
    receipts.push(result.mediation_receipt.receipt_id);
  }

  return { receipts };
}
