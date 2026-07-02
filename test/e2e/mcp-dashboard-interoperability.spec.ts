import playwrightTest from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { spawnSync } from 'child_process';
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

// The published catalog fixtures snapshot the DEFAULT daemon ports. When a port
// is overridden (e.g. MCP_KIT_PORT to dodge a busy 8014 locally) the generated
// catalog legitimately reports the override; normalize back to default ports so
// the parity check validates schema/content, not the environment's port choice.
const PORT_NORMALIZATION: Array<[number, number]> = [
  [Number(process.env.MCP_KIT_PORT) || 8014, 8014],
  [Number(process.env.MCP_DATASETS_PORT) || 3002, 3002],
  [Number(process.env.MCP_ACCELERATE_PORT) || 3003, 3003],
  [Number(process.env.MCP_SWISSKNIFE_PORT) || 3004, 3004],
  [Number(process.env.MCP_DATASETS_DASHBOARD_PORT) || 8899, 8899],
];

function normalizeCatalogPorts<T>(value: T): T {
  let json = JSON.stringify(value);
  for (const [actual, canonical] of PORT_NORMALIZATION) {
    if (actual === canonical) {
      continue;
    }
    json = json.split(`:${actual}/`).join(`:${canonical}/`);
    json = json.split(`:${actual}"`).join(`:${canonical}"`);
    json = json.split(`"port":${actual}`).join(`"port":${canonical}`);
  }
  return JSON.parse(json);
}

const APP_ROOT = path.join(__dirname, '..', '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const HAO_679_INTEROP_FIXTURE = path.join(__dirname, 'fixtures', 'hao-679-mcp-dashboard-interoperability.json');
const LAUNCH_READINESS_FIXTURE = path.join(__dirname, 'fixtures', 'hao-682-mcp-dashboard-launch-readiness.json');
const VAI_512_CATALOG_FIXTURE = path.join(__dirname, 'fixtures', 'vai-512-mcp-dashboard-catalog.json');
const VAI_512_CONSUMPTION_RECEIPT = path.join(
  __dirname,
  'fixtures',
  'vai-512-hallucinate-swissknife-mcp-dashboard-consumption.json'
);
const VAI_517_LAUNCH_READINESS_FIXTURE = path.join(__dirname, 'fixtures', 'vai-517-mcp-dashboard-launch-readiness.json');
const MGW_546_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-546-mcp-dashboard-launch-gate.json');
const MGW_547_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-547-mcp-dashboard-launch-gate.json');
const VAI_531_DASHBOARD_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-531-mcp-dashboard-interoperability-gate.json');
const HAO_714_INTEROPERABILITY_CONSOLE_FIXTURE = path.join(
  __dirname,
  'fixtures',
  'hao-714-mcp-dashboard-interoperability-console.json'
);
const MGW_533_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-533-mcp-dashboard-launch-gate.json');
const MGW_550_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-550-mcp-dashboard-launch-gate.json');
const HAO_700_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'hao-700-mcp-dashboard-launch-gate.json');
const HAO_712_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'hao-712-mcp-dashboard-launch-gate.json');
const HAO_720_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'hao-720-mcp-dashboard-launch-gate.json');
const HAO_724_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'hao-724-mcp-dashboard-launch-gate.json');
const VAI_529_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-529-mcp-dashboard-launch-gate.json');
const VAI_535_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-535-mcp-dashboard-launch-gate.json');
const VAI_537_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-537-mcp-dashboard-launch-gate.json');
const VAI_539_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-539-mcp-dashboard-launch-gate.json');
const VAI_543_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-543-mcp-dashboard-launch-gate.json');
const HAO_727_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'hao-727-mcp-dashboard-launch-gate.json');
const MGW_555_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-555-mcp-dashboard-launch-gate.json');
const MGW_558_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-558-mcp-dashboard-launch-gate.json');
const MGW_559_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-559-mcp-dashboard-launch-gate.json');
const MGW_561_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-561-mcp-dashboard-launch-gate.json');
const MGW_562_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-562-mcp-dashboard-launch-gate.json');
const MGW_563_LAUNCH_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-563-mcp-dashboard-launch-gate.json');
const HAO_681_SWISSKNIFE_CONSUMER_FIXTURE = path.join(
  REPO_ROOT,
  'swissknife',
  'test',
  'e2e',
  'fixtures',
  'hao-681-mcp-dashboard-catalog-consumer.json'
);
const HAO_680_DISCOVERY_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-27-hao-680-dashboard-tool-receipts.md'
);
const MGW_533_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-26-mgw-533-objective-gap-3e00ad2a0074.md'
);
const MGW_546_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-27-mgw-546-objective-gap-7ea369464239.md'
);
const MGW_546_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-27-mgw-546-launch-playwright-validation-gate.md'
);
const MGW_546_HALLUCINATE_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-27-mgw-546-launch-playwright-validation-gate.md'
);
const MGW_546_ATTEMPT_7_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-28-mgw-546-attempt-7-launch-playwright-validation-gate.md'
);
const MGW_546_ATTEMPT_7_HALLUCINATE_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-28-mgw-546-attempt-7-launch-playwright-validation-gate.md'
);
const MGW_547_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-27-mgw-547-objective-gap-7ea369464239.md'
);
const MGW_547_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-27-mgw-547-launch-playwright-validation-gate.md'
);
const MGW_547_HALLUCINATE_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-27-mgw-547-launch-playwright-validation-gate.md'
);
const VAI_531_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'virtual_ai_os',
  'discovery',
  '2026-06-27-vai-531-objective-gap-7ea369464239.md'
);
const VAI_531_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'virtual_ai_os',
  'discovery',
  '2026-06-27-vai-531-mcp-dashboard-interoperability-gate.md'
);
const HAO_714_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-27-hao-714-mcp-dashboard-interoperability-gate.md'
);
const MGW_550_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-27-mgw-550-objective-gap-3e00ad2a0074.md'
);
const MGW_550_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-27-mgw-550-launch-playwright-validation-gate.md'
);
const VAI_529_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'virtual_ai_os',
  'discovery',
  '2026-06-27-vai-529-objective-gap-3e00ad2a0074.md'
);
const VAI_529_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'virtual_ai_os',
  'discovery',
  '2026-06-28-vai-529-mcp-dashboard-launch-gate.md'
);
const HAO_720_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-28-hao-720-objective-gap-3e00ad2a0074.md'
);
const HAO_720_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-28-hao-720-mcp-dashboard-launch-gate.md'
);
const HAO_724_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-28-hao-724-objective-gap-3e00ad2a0074.md'
);
const HAO_724_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-28-hao-724-mcp-dashboard-launch-gate.md'
);
const VAI_535_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'virtual_ai_os',
  'discovery',
  '2026-06-28-vai-535-objective-gap-3e00ad2a0074.md'
);
const VAI_535_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'virtual_ai_os',
  'discovery',
  '2026-06-28-vai-535-mcp-dashboard-launch-gate.md'
);
const VAI_537_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'virtual_ai_os',
  'discovery',
  '2026-06-28-vai-537-objective-gap-3e00ad2a0074.md'
);
const VAI_537_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'virtual_ai_os',
  'discovery',
  '2026-06-28-vai-537-mcp-dashboard-launch-gate.md'
);
const VAI_539_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'virtual_ai_os',
  'discovery',
  '2026-06-28-vai-539-objective-gap-3e00ad2a0074.md'
);
const VAI_539_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'virtual_ai_os',
  'discovery',
  '2026-06-28-vai-539-mcp-dashboard-launch-gate.md'
);
const VAI_543_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'virtual_ai_os',
  'discovery',
  '2026-06-28-vai-543-objective-gap-7ea369464239.md'
);
const VAI_543_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'virtual_ai_os',
  'discovery',
  '2026-06-28-vai-543-mcp-dashboard-launch-gate.md'
);
const VAI_543_HALLUCINATE_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-28-vai-543-mcp-dashboard-launch-gate.md'
);
const HAO_727_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-28-hao-727-objective-gap-7ea369464239.md'
);
const HAO_727_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-28-hao-727-mcp-dashboard-launch-gate.md'
);
const HAO_727_ATTEMPT_5_VALIDATION_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-30-hao-727-attempt-5-validation.md'
);
const MGW_555_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-28-mgw-555-objective-gap-3e00ad2a0074.md'
);
const MGW_555_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-28-mgw-555-launch-playwright-validation-gate.md'
);
const MGW_558_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-29-mgw-558-objective-gap-7ea369464239.md'
);
const MGW_558_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-29-mgw-558-launch-playwright-validation-gate.md'
);
const MGW_558_HALLUCINATE_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-29-mgw-558-mcp-dashboard-launch-gate.md'
);
const MGW_559_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-29-mgw-559-objective-gap-7ea369464239.md'
);
const MGW_559_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-29-mgw-559-launch-playwright-validation-gate.md'
);
const MGW_559_HALLUCINATE_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-29-mgw-559-mcp-dashboard-launch-gate.md'
);
const MGW_561_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-30-mgw-561-objective-gap-7ea369464239.md'
);
const MGW_561_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-30-mgw-561-launch-playwright-validation-gate.md'
);
const MGW_561_HALLUCINATE_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-30-mgw-561-mcp-dashboard-launch-gate.md'
);
const MGW_562_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-30-mgw-562-objective-gap-7ea369464239.md'
);
const MGW_562_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-06-30-mgw-562-launch-playwright-validation-gate.md'
);
const MGW_562_HALLUCINATE_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-30-mgw-562-mcp-dashboard-launch-gate.md'
);
const MGW_563_OBJECTIVE_GAP_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-07-01-mgw-563-objective-gap-7ea369464239.md'
);
const MGW_563_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-07-01-mgw-563-launch-playwright-validation-gate.md'
);
const MGW_563_HALLUCINATE_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-07-01-mgw-563-mcp-dashboard-launch-gate.md'
);
const MGW_563_ATTEMPT_3_LAUNCH_GATE_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'meta_glasses_display_widgets',
  'discovery',
  '2026-07-02-mgw-563-attempt-3-launch-playwright-validation-gate.md'
);
const MGW_563_ATTEMPT_3_HALLUCINATE_VALIDATION_RECEIPT = path.join(
  REPO_ROOT,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-07-02-mgw-563-attempt-3-validation.md'
);
const MGW_OBJECTIVE_HEAP = path.join(
  REPO_ROOT,
  'implementation_plan',
  'docs',
  '23-virtual-ai-os-objective-goal-heap.md'
);
const LAUNCH_READINESS_DOC = path.join(
  REPO_ROOT,
  'docs',
  'launch',
  'phone_desktop_glasses_readiness.md'
);

const DASHBOARD_SERVER_IDS = ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'] as const;
const DASHBOARD_LAUNCH_OBJECTIVE_IDS = ['VAIOS-G723', 'VAIOS-G724', 'VAIOS-G728'];
const MGW_533_REQUIRED_EVIDENCE = [
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
];
const HAO_727_REQUIRED_EVIDENCE = [
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
];
const FOLLOW_UP_TASKS = ['HAO-678', 'HAO-679', 'HAO-680', 'HAO-681', 'HAO-682', 'HAO-683'];
const VAI_503_EVIDENCE_TERMS = [
  'catalog normalization',
  'dashboard UI wiring',
  'mediated tool-call receipts',
  'Swissknife consumers',
  'Playwright coverage',
  'supervisor-generated follow-up subtasks'
];
const MGW_546_CHILD_GOALS = [
  'VAIOS-G723-C1 Catalog normalization',
  'VAIOS-G723-C2 Dashboard UI wiring',
  'VAIOS-G723-C3 Mediated tool-call receipts',
  'VAIOS-G723-C4 Swissknife consumers',
  'VAIOS-G723-C5 Playwright coverage',
  'VAIOS-G723-C6 Supervisor-generated follow-up subtasks'
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

async function clickApplicationMenuPath(electronApp: ElectronApplication, labels: string[]) {
  return electronApp.evaluate(({ Menu }, labelPath) => {
    const normalize = (value: unknown) =>
      String(value || '').replace(/[^\x20-\x7E]/g, '').trim();
    const matches = (value: unknown, expected: string) => {
      const normalizedValue = normalize(value);
      const normalizedExpected = normalize(expected);
      return normalizedValue === normalizedExpected || normalizedValue.includes(normalizedExpected);
    };

    let currentItems = Menu.getApplicationMenu()?.items || [];
    let found = null;

    for (const label of labelPath) {
      found = (currentItems || []).find((item: any) => matches(item.label, label));
      if (!found) {
        return false;
      }
      currentItems = found.submenu?.items || [];
    }

    if (!found) {
      return false;
    }

    found.click();
    return true;
  }, labels);
}

async function dashboardCatalog(window: Page) {
  return window.evaluate(async () => window?.electronAPI?.daemon?.getDashboardCapabilityCatalog?.());
}

// Bring the given dashboard daemons up through the app's own daemon manager and
// wait until each reports healthy. "Open Web Dashboard" loads the daemon's live
// dashboard URL into a BrowserWindow; if the backend is unreachable the
// navigation never commits (ERR_CONNECTION_REFUSED leaves window.url() empty),
// so the URL assertion can only be satisfied deterministically when the live
// backend is actually serving. This makes the "opens each live dashboard URL"
// test verify real live dashboards instead of depending on ambient/external
// daemons that happen to be running.
async function ensureDashboardDaemonsHealthy(window: Page, ids: readonly string[], timeoutMs = 60000) {
  for (const id of ids) {
    await window.evaluate(async (daemonId) => {
      try {
        await window?.electronAPI?.daemon?.start?.(daemonId);
      } catch {
        /* already running / start raced — health poll below is the gate */
      }
    }, id);
  }

  const deadline = Date.now() + timeoutMs;
  for (const id of ids) {
    let healthy = false;
    while (Date.now() < deadline) {
      healthy = await window.evaluate(async (daemonId) => {
        const health = await window?.electronAPI?.daemon?.checkHealth?.(daemonId).catch(() => null);
        return !!health?.healthy;
      }, id);
      if (healthy) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(healthy, `${id} did not become healthy within ${timeoutMs}ms`).toBe(true);
  }
}

async function waitForWindowUrl(electronApp: ElectronApplication, matcher: RegExp, attempts = 20, delayMs = 500) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const windows = electronApp.windows();
    for (const candidate of windows) {
      if (matcher.test(candidate.url())) {
        return candidate;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`No window URL matched ${matcher}`);
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
    expect(catalog?.launch_objective_ids).toEqual(DASHBOARD_LAUNCH_OBJECTIVE_IDS);
    expect(catalog?.launch_validation_gate).toMatchObject({
      task_id: 'MGW-533',
      goal_id: 'VAIOS-G724',
      goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
      evidence_term: 'launch Playwright validation gate'
    });
    expect(catalog?.launch_validation_gate?.packet_goal_ids).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(catalog?.dashboard_interoperability_validation_gate).toMatchObject({
      schema: 'mcp_dashboard_interoperability_gate_v1',
      task_id: 'VAI-531',
      backlog_task_id: 'HAO-714',
      goal_id: 'VAIOS-G723',
      evidence_term: 'launch Playwright validation gate',
      source_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-27-vai-531-objective-gap-7ea369464239.md',
      launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-27-vai-531-mcp-dashboard-interoperability-gate.md',
      hallucinate_launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-714-mcp-dashboard-interoperability-gate.md',
      receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-531-mcp-dashboard-interoperability-gate.json'
    });
    expect(catalog?.dashboard_interoperability_validation_gate?.child_goals).toEqual(MGW_546_CHILD_GOALS);
    expect(catalog?.dashboard_interoperability_validation_gate?.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(catalog?.launch_validation_gate?.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(catalog?.launch_validation_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: 'MGW-546',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-546-objective-gap-7ea369464239.md'
      }),
      expect.objectContaining({
        task_id: 'MGW-547',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-547-objective-gap-7ea369464239.md'
      }),
      expect.objectContaining({
        task_id: 'HAO-714',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        source_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-714-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-714-mcp-dashboard-interoperability-console.md'
      }),
      expect.objectContaining({
        task_id: 'MGW-550',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-550-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'HAO-712',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-712-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'HAO-724',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'VAI-529',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-27-vai-529-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'VAI-535',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-535-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'VAI-537',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-537-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'VAI-539',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-539-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'MGW-555',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-555-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'MGW-558',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-558-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-558-launch-playwright-validation-gate.md',
        hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-29-mgw-558-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-558-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'MGW-559',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-559-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-559-launch-playwright-validation-gate.md',
        hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-29-mgw-559-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-559-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'MGW-561',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-561-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-561-launch-playwright-validation-gate.md',
        hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-30-mgw-561-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-561-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'MGW-562',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-562-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-562-launch-playwright-validation-gate.md',
        hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-30-mgw-562-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-562-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'MGW-563',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-07-01-mgw-563-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-07-01-mgw-563-launch-playwright-validation-gate.md',
        hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-01-mgw-563-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-563-mcp-dashboard-launch-gate.json'
      })
    ]));
    expect(catalog?.swissknife_catalog_consumer_proof).toMatchObject({
      task_id: 'HAO-681',
      depends_on: ['HAO-677', 'HAO-680'],
      evidence_term: 'Hallucinate App MCP dashboard catalog consumed by Swissknife applications',
      consumer_registry: 'hallucinate_app.swissknife.mcp_capability_registry',
      receipt_fixture: 'swissknife/test/e2e/fixtures/hao-681-mcp-dashboard-catalog-consumer.json'
    });
    expect(catalog?.validation_task_id).toBe('VAI-512');
    expect(catalog?.dashboard_only_mocks).toBe(false);
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
      expect(server.launch_objective_ids).toEqual(DASHBOARD_LAUNCH_OBJECTIVE_IDS);
      expect(server.menu_dashboard_url).toBe(server.native_dashboard_url || `${server.endpoint}/dashboard`);
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
        'launch_readiness_packet:VAIOS-G723',
        'launch_readiness_packet:VAIOS-G724',
        'launch_readiness_packet:VAIOS-G728'
      ]));
      expect(server.swissknife_consumer).toContain('Swissknife');
    }

    expect((servers.get('ipfs-kit') as any).endpoint).toBe('http://127.0.0.1:8014');
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

  test('opens each live dashboard URL from the MCP Servers menu', async () => {
    // The dashboards must be live for their URLs to commit into a window; start
    // the backing daemons through the app and wait for health before opening.
    await ensureDashboardDaemonsHealthy(window, DASHBOARD_SERVER_IDS);

    const catalog = await dashboardCatalog(window);
    const serversById = new Map((catalog?.servers || []).map((server: any) => [server.daemon_id, server]));

    for (const menuServer of mcpServers.filter((server: any) => DASHBOARD_SERVER_IDS.includes(server.id))) {
      const catalogServer = serversById.get(menuServer.id) as any;
      const liveDashboardUrl = catalogServer.native_dashboard_url || catalogServer.menu_dashboard_url;
      const menuPath = [
        'MCP Servers',
        `${menuServer.displayName} MCP (Port ${menuServer.port})`,
        'Open Web Dashboard'
      ];

      expect(liveDashboardUrl).toBe(catalogServer.native_dashboard_url || `${catalogServer.endpoint}/dashboard`);
      expect(await clickApplicationMenuPath(electronApp, menuPath)).toBe(true);

      const dashboardWindow = await waitForWindowUrl(
        electronApp,
        new RegExp(`^${liveDashboardUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
      expect(dashboardWindow.url()).toContain(liveDashboardUrl);

      if (dashboardWindow !== window) {
        await dashboardWindow.close();
      }
    }
  });

  test('emits mediated safe-probe tool-call receipts before daemon transport', async () => {
    const { receipts, operations } = await validateMediatedDashboardToolReceipts();
    expect(new Set(receipts).size).toBe(DASHBOARD_SERVER_IDS.length * 2);
    expect(operations).toEqual(expect.arrayContaining([
      'ipfs-kit:tools/list',
      'ipfs-kit:tools/call',
      'ipfs-datasets:tools/list',
      'ipfs-datasets:tools/call',
      'ipfs-accelerate:tools/list',
      'ipfs-accelerate:tools/call'
    ]));
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
  test('keeps the shared VAI-512 catalog fixture in parity with the Hallucinate manager', () => {
    const manager = new MCPDaemonManager();
    const catalog = manager.getDashboardCapabilityCatalog();
    const fixture = JSON.parse(fs.readFileSync(VAI_512_CATALOG_FIXTURE, 'utf8'));

    expect(fixture).toEqual(normalizeCatalogPorts(catalog));
    expect(fixture.validation_task_id).toBe('VAI-512');
    expect(fixture.dashboard_only_mocks).toBe(false);
    expect(fixture.generated_by).toBe('hallucinate_app.node.mcp_daemon_manager.getDashboardCapabilityCatalog');
    expect(fixture.servers.map((server: any) => server.server_package).sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);
  });

  test('normalizes the dashboard capability catalog without a display server', () => {
    const manager = new MCPDaemonManager();
    const catalog = manager.getDashboardCapabilityCatalog();
    const menuById = new Map(mcpServers.map((server: any) => [server.id, server]));
    const servers = new Map((catalog?.servers || []).map((server: any) => [server.daemon_id, server]));

    expect(catalog.schema).toBe('hallucinate_app.mcp_dashboard_capability_catalog.v1');
    expect(catalog.goal_id).toBe('VAIOS-G723');
    expect(catalog.launch_objective_ids).toEqual(DASHBOARD_LAUNCH_OBJECTIVE_IDS);
    expect(catalog.launch_validation_gate).toMatchObject({
      task_id: 'MGW-533',
      goal_id: 'VAIOS-G724',
      evidence_term: 'launch Playwright validation gate',
      supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-26-mgw-533-objective-gap-3e00ad2a0074.md'
    });
    expect(catalog.validation_task_id).toBe('VAI-512');
    expect(catalog.dashboard_only_mocks).toBe(false);
    expect(catalog.control_surface_route).toContain('mediation_receipt');

    for (const daemonId of DASHBOARD_SERVER_IDS) {
      const server = servers.get(daemonId) as any;
      const menuEntry = menuById.get(daemonId) as any;
      expect(server.launch_objective_ids).toEqual(DASHBOARD_LAUNCH_OBJECTIVE_IDS);
      expect(server.menu_dashboard_url).toBe(server.native_dashboard_url || `${server.endpoint}/dashboard`);
      expect(server.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(server.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(server.tool_protocols.tools_call.safeProbe.mutation).toBe(false);
      expect(server.mcpplusplus_descriptor_evidence.evidence_label).toBe('MCP++ descriptor/profile evidence');
      expect(server.swissknife_consumer).toContain('Swissknife');
    }
  });

  test('emits mediated safe-probe tool-call receipts without daemon transport', async () => {
    const { receipts, operations } = await validateMediatedDashboardToolReceipts();
    expect(new Set(receipts).size).toBe(DASHBOARD_SERVER_IDS.length * 2);
    expect(operations).toEqual(expect.arrayContaining([
      'ipfs-kit:tools/list',
      'ipfs-kit:tools/call',
      'ipfs-datasets:tools/list',
      'ipfs-datasets:tools/call',
      'ipfs-accelerate:tools/list',
      'ipfs-accelerate:tools/call'
    ]));
  });

  test('records the HAO-680 launch-readiness receipt for dashboard tool mediation', () => {
    const receipt = fs.readFileSync(HAO_680_DISCOVERY_RECEIPT, 'utf8');

    expect(receipt).toContain('Task: HAO-680');
    expect(receipt).toContain('Depends on: HAO-677');
    expect(receipt).toContain('interaction_envelope');
    expect(receipt).toContain('policy_decision');
    expect(receipt).toContain('mediation_receipt');
    expect(receipt).toContain('supervised MCP server transport');
    expect(receipt).toContain('MCP++ descriptor/profile evidence');
    expect(receipt).toContain('tools/list');
    expect(receipt).toContain('tools/call');
    expect(receipt).toContain('hallucinate_app.swissknife.mcp_capability_registry');
    expect(receipt).toContain('launch_readiness_packet:VAIOS-G728');
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

  test('lets Swissknife consume the same dashboard catalog without duplicate schemas or mocks', () => {
    const receipt = JSON.parse(fs.readFileSync(VAI_512_CONSUMPTION_RECEIPT, 'utf8'));
    const result = spawnSync('npm', ['--prefix', 'swissknife', 'run', 'test:e2e:mcp'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        HALLUCINATE_APP_E2E_NO_BOOTSTRAP: 'true'
      }
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const match = String(result.stdout || '').match(/\{\s*"status"[\s\S]*\}\s*$/);
    expect(match, result.stdout).toBeTruthy();
    const payload = JSON.parse(match![0]);
    expect(payload).toMatchObject({
      status: 'ok',
      task_id: 'HAO-681',
      catalog_task_id: 'VAI-512',
      launch_task_id: 'MGW-533',
      consumer_receipt_task_id: 'HAO-681',
      swissknife_launch_task_id: 'HAO-704',
      launch_goal_ids: ['VAIOS-G723', 'VAIOS-G724', 'VAIOS-G728'],
      catalog_schema: 'hallucinate_app.mcp_dashboard_capability_catalog.v1'
    });
    expect(receipt).toMatchObject({
      schema: 'launch_readiness_receipt_v1',
      task_id: 'VAI-512',
      goal_id: 'VAIOS-G723',
      evidence_term: 'Hallucinate dashboard to Swissknife MCP consumer launch receipt',
      catalog_schema: payload.catalog_schema,
      catalog_fixture: 'hallucinate_app/test/e2e/fixtures/vai-512-mcp-dashboard-catalog.json',
      dashboard_only_mocks: false,
      shared_receipt_schema: 'mcp_server_invocation_receipt_v1'
    });
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'npm --prefix swissknife run test:e2e:mcp',
      'npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.receipt_route).toEqual([
      'Hallucinate App MCP dashboard',
      'dashboard capability catalog',
      'Swissknife MCP dashboard capability registry',
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt',
      'supervised MCP server transport'
    ]);
    expect(receipt.required_evidence).toEqual(expect.arrayContaining([
      'Hallucinate App exposes MCP server dashboards',
      'tools/list mediated through control plane',
      'tools/call mediated through control plane',
      'Swissknife applications consume the same catalog',
      'no duplicate catalog schemas',
      'no dashboard-only mocks',
      'hardware-free Playwright evidence'
    ]));
    expect(receipt.required_backends.sort()).toEqual(payload.packages);
    expect(receipt.required_operations).toEqual(expect.arrayContaining(payload.operations));
    expect(receipt.dashboard_servers.map((server: any) => server.server_package).sort()).toEqual(payload.packages);
    expect(payload.packages).toEqual(['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py']);
    expect(payload.operations).toEqual(expect.arrayContaining([
      'ipfs_kit_py:tools/list',
      'ipfs_kit_py:tools/call',
      'ipfs_datasets_py:tools/list',
      'ipfs_datasets_py:tools/call',
      'ipfs_accelerate_py:tools/list',
      'ipfs_accelerate_py:tools/call'
    ]));
  });

  test('records HAO-681 Swissknife storage dataset and compute catalog consumption', () => {
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const receipt = JSON.parse(fs.readFileSync(HAO_681_SWISSKNIFE_CONSUMER_FIXTURE, 'utf8'));
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt).toMatchObject({
      schema: 'swissknife_mcp_dashboard_catalog_consumer_receipt_v1',
      task_id: 'HAO-681',
      depends_on: ['HAO-677', 'HAO-680'],
      goal_id: 'VAIOS-G723',
      catalog_schema: catalog.schema,
      catalog_generated_by: catalog.generated_by,
      consumer_registry: 'hallucinate_app.swissknife.mcp_capability_registry',
      receipt_schema: 'mcp_server_invocation_receipt_v1'
    });
    expect(catalog.swissknife_catalog_consumer_proof).toMatchObject({
      task_id: receipt.task_id,
      receipt_fixture: 'swissknife/test/e2e/fixtures/hao-681-mcp-dashboard-catalog-consumer.json',
      discovery_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-681-swissknife-dashboard-catalog-consumer.md'
    });
    expect(receipt.receipt_route).toEqual(expect.arrayContaining([
      'Hallucinate App MCP dashboard catalog',
      'MCP++ capability descriptor',
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt',
      'supervised MCP server transport'
    ]));
    expect(receipt.required_receipt_fields).toEqual(expect.arrayContaining([
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt',
      'mediation_receipt_id',
      'receipt_cid',
      'mcpplusplus_descriptor_evidence'
    ]));
    expect(receipt.applications.map((app: any) => app.role).sort()).toEqual(['compute', 'dataset', 'storage']);

    for (const app of receipt.applications) {
      const server = serversByPackage.get(app.server_package) as any;
      expect(server, app.server_package).toBeTruthy();
      expect(server.daemon_id).toBe(app.daemon_id);
      expect(server.tool_protocols.tools_list.url).toBe(app.tools_list_url);
      expect(server.tool_protocols.tools_call.safeProbe.tool_name).toBe(app.safe_tools_call_probe);
      expect(server.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(app.safe_probe_receipt);
      expect(server.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry'
      ]));
    }
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
    expect(receipt.validation_commands).toContain(
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts'
    );
    expect(receipt.required_backends).toEqual(['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py']);
    expect(receipt.required_evidence).toEqual(expect.arrayContaining([
      'catalog normalization',
      'dashboard UI wiring',
      'mediated tool-call receipts',
      'Swissknife consumers',
      'Playwright coverage',
      'supervisor-generated follow-up subtasks'
    ]));
    expect(receipt.receipt_route).toContain('mediation_receipt');
    expect(receipt.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(receipt.failure_rule).toContain('VAIOS-G723 cannot close');
  });

  test('captures the HAO-679 dashboard interoperability receipt matrix', () => {
    const receipt = JSON.parse(fs.readFileSync(HAO_679_INTEROP_FIXTURE, 'utf8'));
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const serversById = new Map(catalog.servers.map((server: any) => [server.daemon_id, server]));

    expect(receipt.schema).toBe('mcp_dashboard_interoperability_receipt_v1');
    expect(receipt.task_id).toBe('HAO-679');
    expect(receipt.goal_id).toBe('VAIOS-G723');
    expect(receipt.depends_on).toBe('HAO-678');
    expect(receipt.playwright_spec).toBe('hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts');
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:e2e -- mcp-dashboard-interoperability.spec.ts',
      'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q'
    ]));
    expect(receipt.catalog_fixture).toBe('hallucinate_app/test/e2e/fixtures/vai-512-mcp-dashboard-catalog.json');
    expect(receipt.shared_catalog_schema).toBe(catalog.schema);
    expect(receipt.acceptance_matrix).toEqual([
      'dashboards_menu_to_catalog_dashboard',
      'mcp_servers_menu_to_live_dashboard_url',
      'daemon_health_observed',
      'shared_catalog_read',
      'hardware_free_tools_list',
      'safe_tools_call_probe',
      'pass_fail_launch_receipts'
    ]);

    for (const row of receipt.dashboard_menu_matrix) {
      const server = serversById.get(row.daemon_id) as any;
      expect(server).toBeTruthy();
      expect(row.status).toBe('pass');
      expect(row.dashboard_menu_label).toBe(`${server.display_name} Dashboard`);
      expect(row.mcp_servers_menu_path).toEqual([
        'MCP Servers',
        `${server.display_name} MCP (Port ${server.port})`,
        'Open Web Dashboard'
      ]);
      expect(row.live_dashboard_url).toBe(server.native_dashboard_url || server.menu_dashboard_url);
      expect(row.health_path).toBe(server.health_path);
      expect(row.tools_list.operation).toBe('tools/list');
      expect(row.tools_call.operation).toBe('tools/call');
      expect(row.tools_call.safe_probe.mutation).toBe(false);
      expect(row.receipt_refs).toEqual(expect.arrayContaining([
        'interaction_envelope',
        'policy_decision',
        'mediation_receipt',
        'receipt_cid'
      ]));
    }
  });

  test('binds MGW-533 launch objective coverage to the dashboard Playwright gate', () => {
    const receipt = JSON.parse(fs.readFileSync(MGW_533_LAUNCH_GATE_FIXTURE, 'utf8'));
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const objectiveGap = fs.readFileSync(MGW_533_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');

    expect(receipt.schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe('MGW-533');
    expect(receipt.goal_id).toBe('VAIOS-G724');
    expect(receipt.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(receipt.packet_goal_ids).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(receipt.evidence_term).toBe('launch Playwright validation gate');
    expect(receipt.required_evidence).toEqual(MGW_533_REQUIRED_EVIDENCE);
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.required_backends).toEqual(['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py']);
    expect(receipt.receipt_route).toContain('mediation_receipt');
    expect(receipt.supervisor_gap_receipt).toBe(
      'data/meta_glasses_display_widgets/discovery/2026-06-26-mgw-533-objective-gap-3e00ad2a0074.md'
    );

    expect(catalog.launch_objective_ids).toEqual(DASHBOARD_LAUNCH_OBJECTIVE_IDS);
    expect(catalog.launch_validation_gate).toMatchObject({
      task_id: receipt.task_id,
      goal_id: receipt.goal_id,
      goal_packet: receipt.goal_packet,
      packet_goal_ids: receipt.packet_goal_ids,
      evidence_term: receipt.evidence_term
    });
    expect(catalog.servers.map((server: any) => server.server_package).sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);

    for (const term of [
      'Hallucinate App MCP dashboard capability catalog',
      'Missing Evidence',
      'launch Playwright validation gate',
      'tools/list',
      'tools/call',
      'ipfs_accelerate_py MCP server',
      'ipfs_datasets_py MCP server',
      'ipfs_kit_py MCP server',
      'Swissknife applications'
    ]) {
      expect(objectiveGap).toContain(term);
    }

    expect(objectiveHeap).toContain('## VAIOS-G724 Hallucinate App MCP dashboard capability catalog');
    expect(objectiveHeap).toContain('MGW-533 proof');
    expect(objectiveHeap).toContain('hallucinate_app/test/e2e/fixtures/mgw-533-mcp-dashboard-launch-gate.json');
    expect(objectiveHeap).toContain('launch Playwright validation gate');
    expect(objectiveHeap).toContain('VAIOS-G728');
  });

  test('binds MGW-546 objective gap evidence to the VAIOS-G723 launch Playwright gate', () => {
    const receipt = JSON.parse(fs.readFileSync(MGW_546_LAUNCH_GATE_FIXTURE, 'utf8'));
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const objectiveGap = fs.readFileSync(MGW_546_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const launchGateReceipt = fs.readFileSync(MGW_546_LAUNCH_GATE_RECEIPT, 'utf8');
    const hallucinateLaunchGateReceipt = fs.readFileSync(MGW_546_HALLUCINATE_LAUNCH_GATE_RECEIPT, 'utf8');
    const attempt7LaunchGateReceipt = fs.readFileSync(MGW_546_ATTEMPT_7_LAUNCH_GATE_RECEIPT, 'utf8');
    const attempt7HallucinateLaunchGateReceipt = fs.readFileSync(
      MGW_546_ATTEMPT_7_HALLUCINATE_LAUNCH_GATE_RECEIPT,
      'utf8'
    );
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const readinessDoc = fs.readFileSync(LAUNCH_READINESS_DOC, 'utf8');
    const launchGate = catalog.launch_validation_gates?.find((gate: any) => gate.task_id === 'MGW-546');

    expect(receipt.schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe('MGW-546');
    expect(receipt.goal_id).toBe('VAIOS-G723');
    expect(receipt.evidence_term).toBe('launch Playwright validation gate');
    expect(receipt.source_gap_receipt).toBe(
      'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-546-objective-gap-7ea369464239.md'
    );
    expect(receipt.launch_gate_receipt).toBe(
      'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-546-launch-playwright-validation-gate.md'
    );
    expect(receipt.hallucinate_backlog_receipt).toBe(
      'data/hallucinate_multimodal_control/discovery/2026-06-27-mgw-546-launch-playwright-validation-gate.md'
    );
    expect(receipt.attempt).toBe(7);
    expect(receipt.attempt_receipts).toEqual([
      'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-546-attempt-7-launch-playwright-validation-gate.md',
      'data/hallucinate_multimodal_control/discovery/2026-06-28-mgw-546-attempt-7-launch-playwright-validation-gate.md'
    ]);
    expect(receipt.child_goals).toEqual(MGW_546_CHILD_GOALS);
    expect(receipt.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(receipt.catalog_schema).toBe(catalog.schema);
    expect(receipt.catalog_generated_by).toBe(catalog.generated_by);
    expect(receipt.catalog_launch_objective_ids).toEqual(catalog.launch_objective_ids);
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:daemon-manager',
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'npm --prefix swissknife run test:e2e:mcp'
    ]));
    expect(receipt.required_backends.sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);
    expect(launchGate).toMatchObject({
      task_id: receipt.task_id,
      goal_id: receipt.goal_id,
      evidence_term: receipt.evidence_term,
      supervisor_gap_receipt: receipt.source_gap_receipt,
      launch_gate_receipt: receipt.launch_gate_receipt,
      hallucinate_backlog_receipt: receipt.hallucinate_backlog_receipt,
      receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-546-mcp-dashboard-launch-gate.json',
      attempt: receipt.attempt,
      attempt_receipts: receipt.attempt_receipts,
      child_goals: receipt.child_goals,
      follow_up_subtasks: receipt.follow_up_subtasks
    });

    for (const server of receipt.dashboard_servers) {
      const catalogServer = catalog.servers.find((entry: any) => entry.server_package === server.server_package);
      expect(catalogServer, server.server_package).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe(server.tools_list);
      expect(catalogServer.tool_protocols.tools_call.operation).toBe(server.tools_call);
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.control_surface_receipt_requirements).toEqual(expect.arrayContaining([
        'interaction_envelope',
        'policy_decision',
        'mediation_receipt',
        'receipt_cid'
      ]));
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G723'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of [
      'catalog normalization',
      'dashboard UI wiring',
      'mediated tool-call receipts',
      'Swissknife consumers',
      'Playwright coverage',
      'supervisor-generated follow-up subtasks',
      'launch Playwright validation gate',
      'tools/list',
      'tools/call'
    ]) {
      expect(launchGateReceipt).toContain(term);
      expect(hallucinateLaunchGateReceipt).toContain(term);
      expect(attempt7LaunchGateReceipt).toContain(term);
      expect(attempt7HallucinateLaunchGateReceipt).toContain(term);
      expect(objectiveHeap).toContain(term);
      expect(readinessDoc).toContain(term);
    }

    for (const term of [
      'Hallucinate MCP dashboard interoperability console',
      'dashboard capability catalog',
      'daemon health',
      'MCP++',
      'tools/list',
      'tools/call',
      'Swissknife',
      'launch Playwright validation gate'
    ]) {
      expect(objectiveGap).toContain(term);
    }

    expect(objectiveHeap).toContain('MGW-546 proof');
    expect(objectiveHeap).toContain('2026-06-28-mgw-546-attempt-7-launch-playwright-validation-gate.md');
    expect(objectiveHeap).toContain('hallucinate_app/test/e2e/fixtures/mgw-546-mcp-dashboard-launch-gate.json');
    expect(readinessDoc).toContain('MGW-546');
    expect(readinessDoc).toContain('2026-06-28-mgw-546-attempt-7-launch-playwright-validation-gate.md');
  });

  test('binds MGW-547 objective gap evidence to the VAIOS-G723 launch Playwright gate', () => {
    const receipt = JSON.parse(fs.readFileSync(MGW_547_LAUNCH_GATE_FIXTURE, 'utf8'));
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const objectiveGap = fs.readFileSync(MGW_547_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const launchGateReceipt = fs.readFileSync(MGW_547_LAUNCH_GATE_RECEIPT, 'utf8');
    const hallucinateLaunchGateReceipt = fs.readFileSync(MGW_547_HALLUCINATE_LAUNCH_GATE_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const readinessDoc = fs.readFileSync(LAUNCH_READINESS_DOC, 'utf8');
    const launchGate = catalog.launch_validation_gates?.find((gate: any) => gate.task_id === 'MGW-547');

    expect(receipt.schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe('MGW-547');
    expect(receipt.goal_id).toBe('VAIOS-G723');
    expect(receipt.lineage_id).toBe('VAIOS-G723:mcp-dashboard-interoperability');
    expect(receipt.evidence_term).toBe('launch Playwright validation gate');
    expect(receipt.source_gap_receipt).toBe(
      'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-547-objective-gap-7ea369464239.md'
    );
    expect(receipt.launch_gate_receipt).toBe(
      'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-547-launch-playwright-validation-gate.md'
    );
    expect(receipt.hallucinate_backlog_receipt).toBe(
      'data/hallucinate_multimodal_control/discovery/2026-06-27-mgw-547-launch-playwright-validation-gate.md'
    );
    expect(receipt.child_goals).toEqual(MGW_546_CHILD_GOALS);
    expect(receipt.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(receipt.catalog_schema).toBe(catalog.schema);
    expect(receipt.catalog_generated_by).toBe(catalog.generated_by);
    expect(receipt.catalog_launch_objective_ids).toEqual(catalog.launch_objective_ids);
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:daemon-manager',
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'npm --prefix swissknife run test:e2e:mcp'
    ]));
    expect(receipt.required_backends.sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);
    expect(launchGate).toMatchObject({
      task_id: receipt.task_id,
      goal_id: receipt.goal_id,
      evidence_term: receipt.evidence_term,
      supervisor_gap_receipt: receipt.source_gap_receipt,
      launch_gate_receipt: receipt.launch_gate_receipt,
      hallucinate_backlog_receipt: receipt.hallucinate_backlog_receipt,
      receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-547-mcp-dashboard-launch-gate.json',
      child_goals: receipt.child_goals,
      follow_up_subtasks: receipt.follow_up_subtasks
    });

    for (const server of receipt.dashboard_servers) {
      const catalogServer = catalog.servers.find((entry: any) => entry.server_package === server.server_package);
      expect(catalogServer, server.server_package).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe(server.tools_list);
      expect(catalogServer.tool_protocols.tools_call.operation).toBe(server.tools_call);
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G723'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of [
      'Hallucinate App menus',
      'dashboard capability catalog',
      'backend service catalog',
      'daemon health',
      'tools/list',
      'tools/call',
      'control_surface receipts',
      'Swissknife applications',
      'launch Playwright validation gate'
    ]) {
      expect(objectiveGap).toContain(term);
    }

    for (const term of receipt.required_evidence) {
      expect(launchGateReceipt).toContain(term);
    }

    for (const term of [
      'catalog normalization',
      'dashboard UI wiring',
      'mediated tool-call receipts',
      'Swissknife consumers',
      'Playwright coverage',
      'supervisor-generated follow-up subtasks',
      'launch Playwright validation gate',
      'tools/list',
      'tools/call'
    ]) {
      expect(hallucinateLaunchGateReceipt).toContain(term);
      expect(objectiveHeap).toContain(term);
      expect(readinessDoc).toContain(term);
    }

    expect(objectiveHeap).toContain('MGW-547 proof');
    expect(objectiveHeap).toContain('hallucinate_app/test/e2e/fixtures/mgw-547-mcp-dashboard-launch-gate.json');
    expect(objectiveHeap).toContain('data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-547-launch-playwright-validation-gate.md');
    expect(readinessDoc).toContain('MGW-547');
  });

  test('binds VAI-531 and HAO-714 dashboard interoperability evidence to the launch Playwright gate', () => {
    const receipt = JSON.parse(fs.readFileSync(VAI_531_DASHBOARD_GATE_FIXTURE, 'utf8'));
    const hao714Receipt = JSON.parse(fs.readFileSync(HAO_714_INTEROPERABILITY_CONSOLE_FIXTURE, 'utf8'));
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const launchGate = catalog.dashboard_interoperability_validation_gate;
    const hao714LaunchGate = catalog.launch_validation_gates?.find((gate: any) => gate.task_id === 'HAO-714');
    const objectiveGap = fs.readFileSync(VAI_531_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const launchGateReceipt = fs.readFileSync(VAI_531_LAUNCH_GATE_RECEIPT, 'utf8');
    const hallucinateLaunchGateReceipt = fs.readFileSync(HAO_714_LAUNCH_GATE_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const readinessDoc = fs.readFileSync(LAUNCH_READINESS_DOC, 'utf8');

    expect(receipt).toEqual(launchGate);
    expect(hao714Receipt).toEqual(hao714LaunchGate);
    expect(hao714Receipt).toMatchObject({
      schema: 'launch_readiness_receipt_v1',
      task_id: 'HAO-714',
      goal_id: 'VAIOS-G723',
      source_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-714-objective-gap-7ea369464239.md',
      launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-714-mcp-dashboard-interoperability-console.md',
      catalog_schema: catalog.schema,
      catalog_generated_by: catalog.generated_by
    });
    expect(receipt).toMatchObject({
      schema: 'mcp_dashboard_interoperability_gate_v1',
      task_id: 'VAI-531',
      backlog_task_id: 'HAO-714',
      goal_id: 'VAIOS-G723',
      evidence_term: 'launch Playwright validation gate',
      source_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-27-vai-531-objective-gap-7ea369464239.md',
      hallucinate_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-714-objective-gap-7ea369464239.md',
      launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-27-vai-531-mcp-dashboard-interoperability-gate.md',
      hallucinate_launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-714-mcp-dashboard-interoperability-gate.md',
      receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-531-mcp-dashboard-interoperability-gate.json',
      catalog_schema: catalog.schema,
      catalog_source: catalog.generated_by
    });
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:daemon-manager',
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'npm --prefix swissknife run test:e2e:mcp',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_backends.sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);
    expect(receipt.child_goals).toEqual(MGW_546_CHILD_GOALS);
    expect(receipt.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(hao714Receipt.child_goals).toEqual(MGW_546_CHILD_GOALS);
    expect(hao714Receipt.supervisor_follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(receipt.receipt_route).toEqual(expect.arrayContaining([
      'dashboard capability catalog',
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt',
      'Swissknife MCP dashboard capability registry'
    ]));
    expect(hao714Receipt.receipt_route).toEqual(expect.arrayContaining([
      'dashboard capability catalog',
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt',
      'Swissknife consumer registry'
    ]));

    for (const term of [
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
    ]) {
      expect(receipt.required_evidence).toContain(term);
      expect(hao714Receipt.required_evidence).toContain(term);
      expect(launchGateReceipt).toContain(term);
      expect(hallucinateLaunchGateReceipt).toContain(term);
      expect(objectiveHeap).toContain(term);
      expect(readinessDoc).toContain(term);
    }

    for (const term of [
      'Hallucinate MCP dashboard interoperability console',
      'dashboard capability catalog',
      'backend service catalog',
      'daemon health',
      'MCP++ telemetry',
      'tools/list',
      'tools/call',
      'control_surface receipts',
      'Swissknife applications',
      'launch Playwright validation gate'
    ]) {
      expect(objectiveGap).toContain(term);
    }

    expect(objectiveHeap).toContain('HAO-714/VAI-531 dashboard gate');
    expect(objectiveHeap).toContain('hallucinate_app/test/e2e/fixtures/vai-531-mcp-dashboard-interoperability-gate.json');
    expect(readinessDoc).toContain('HAO-714/VAI-531');
  });

  test('binds MGW-550 objective gap evidence to the current dashboard Playwright gate', () => {
    const receipt = JSON.parse(fs.readFileSync(MGW_550_LAUNCH_GATE_FIXTURE, 'utf8'));
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const objectiveGap = fs.readFileSync(MGW_550_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const launchGateReceipt = fs.readFileSync(MGW_550_LAUNCH_GATE_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const launchGate = catalog.launch_validation_gates?.find((gate: any) => gate.task_id === 'MGW-550');

    expect(receipt.schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe('MGW-550');
    expect(receipt.goal_id).toBe('VAIOS-G724');
    expect(receipt.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(receipt.packet_goal_ids).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(receipt.evidence_term).toBe('launch Playwright validation gate');
    expect(receipt.required_evidence).toEqual(MGW_533_REQUIRED_EVIDENCE);
    expect(receipt.source_gap_receipt).toBe(
      'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-550-objective-gap-3e00ad2a0074.md'
    );
    expect(receipt.launch_gate_receipt).toBe(
      'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-550-launch-playwright-validation-gate.md'
    );
    expect(receipt.catalog_schema).toBe(catalog.schema);
    expect(receipt.catalog_generated_by).toBe(catalog.generated_by);
    expect(receipt.catalog_launch_objective_ids).toEqual(catalog.launch_objective_ids);
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_backends.sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);
    expect(launchGate).toMatchObject({
      task_id: receipt.task_id,
      goal_id: receipt.goal_id,
      goal_packet: receipt.goal_packet,
      packet_goal_ids: receipt.packet_goal_ids,
      evidence_term: receipt.evidence_term,
      supervisor_gap_receipt: receipt.source_gap_receipt,
      launch_gate_receipt: receipt.launch_gate_receipt,
      receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-550-mcp-dashboard-launch-gate.json'
    });

    for (const server of receipt.dashboard_servers) {
      const catalogServer = catalog.servers.find((entry: any) => entry.server_package === server.server_package);
      expect(catalogServer, server.server_package).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(catalogServer.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G724',
        'launch_readiness_packet:VAIOS-G728'
      ]));
      expect(catalogServer.swissknife_consumer).toContain('Swissknife');
    }

    for (const term of MGW_533_REQUIRED_EVIDENCE) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
    }

    expect(objectiveHeap).toContain('MGW-550 proof');
    expect(objectiveHeap).toContain('hallucinate_app/test/e2e/fixtures/mgw-550-mcp-dashboard-launch-gate.json');
    expect(objectiveHeap).toContain('data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-550-launch-playwright-validation-gate.md');
  });

  test('binds VAI-517 objective gap evidence to the shared dashboard launch gate', () => {
    const receipt = JSON.parse(fs.readFileSync(VAI_517_LAUNCH_READINESS_FIXTURE, 'utf8'));
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const servers = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt.schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe('VAI-517');
    expect(receipt.goal_id).toBe('VAIOS-G724');
    expect(receipt.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(receipt.packet_goal_ids).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(receipt.evidence_term).toBe('launch Playwright validation gate');
    expect(receipt.objective_gap_receipt).toBe(
      'data/virtual_ai_os/discovery/2026-06-26-vai-517-objective-gap-3e00ad2a0074.md'
    );
    expect(receipt.catalog_schema).toBe(catalog.schema);
    expect(receipt.catalog_generated_by).toBe(catalog.generated_by);
    expect(receipt.catalog_launch_objective_ids).toEqual(catalog.launch_objective_ids);
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toContain(
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts'
    );
    expect(receipt.required_backends.sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);

    for (const backend of receipt.required_backends) {
      const server = servers.get(backend) as any;
      expect(server, backend).toBeTruthy();
      expect(server.launch_objective_ids).toEqual(DASHBOARD_LAUNCH_OBJECTIVE_IDS);
      expect(server.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(server.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(server.health_path).toBeTruthy();
      expect(server.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G724',
        'launch_readiness_packet:VAIOS-G728'
      ]));
      expect(server.swissknife_consumer).toContain('Swissknife');
    }
  });

  test('closes the HAO-700 objective gap with the same launch Playwright validation gate', () => {
    const receipt = JSON.parse(fs.readFileSync(HAO_700_LAUNCH_GATE_FIXTURE, 'utf8'));
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt.schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe('HAO-700');
    expect(receipt.goal_id).toBe('VAIOS-G724');
    expect(receipt.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(receipt.packet_goal_ids).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(receipt.source_gap_receipt).toBe(
      'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-700-objective-gap-3e00ad2a0074.md'
    );
    expect(receipt.evidence_term).toBe('launch Playwright validation gate');
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_evidence).toEqual(MGW_533_REQUIRED_EVIDENCE);
    expect(receipt.catalog_schema).toBe(catalog.schema);
    expect(catalog.launch_validation_gate).toMatchObject({
      goal_id: receipt.goal_id,
      goal_packet: receipt.goal_packet,
      packet_goal_ids: receipt.packet_goal_ids,
      evidence_term: receipt.evidence_term
    });

    for (const server of receipt.dashboard_servers) {
      const catalogServer = serversByPackage.get(server.server_package) as any;
      expect(catalogServer).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(catalogServer.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G724',
        'launch_readiness_packet:VAIOS-G728'
      ]));
    }
  });

  test('closes the HAO-712 objective gap with the current Hallucinate launch Playwright validation gate', () => {
    const receipt = JSON.parse(fs.readFileSync(HAO_712_LAUNCH_GATE_FIXTURE, 'utf8'));
    const launchGateReceipt = fs.readFileSync(path.join(
      REPO_ROOT,
      'data',
      'hallucinate_multimodal_control',
      'discovery',
      '2026-06-27-hao-712-mcp-dashboard-launch-gate.md'
    ), 'utf8');
    const objectiveGap = fs.readFileSync(path.join(
      REPO_ROOT,
      'data',
      'hallucinate_multimodal_control',
      'discovery',
      '2026-06-27-hao-712-objective-gap-3e00ad2a0074.md'
    ), 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt.schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe('HAO-712');
    expect(receipt.goal_id).toBe('VAIOS-G724');
    expect(receipt.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(receipt.packet_goal_ids).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(receipt.source_gap_receipt).toBe(
      'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-712-objective-gap-3e00ad2a0074.md'
    );
    expect(receipt.launch_gate_receipt).toBe(
      'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-712-mcp-dashboard-launch-gate.md'
    );
    expect(receipt.evidence_term).toBe('launch Playwright validation gate');
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_evidence).toEqual(MGW_533_REQUIRED_EVIDENCE);
    expect(receipt.catalog_schema).toBe(catalog.schema);
    expect(catalog.launch_validation_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: receipt.task_id,
        goal_id: receipt.goal_id,
        goal_packet: receipt.goal_packet,
        packet_goal_ids: receipt.packet_goal_ids,
        evidence_term: receipt.evidence_term,
        supervisor_gap_receipt: receipt.source_gap_receipt,
        launch_gate_receipt: receipt.launch_gate_receipt,
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-712-mcp-dashboard-launch-gate.json'
      })
    ]));

    for (const server of receipt.dashboard_servers) {
      const catalogServer = serversByPackage.get(server.server_package) as any;
      expect(catalogServer).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(catalogServer.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G724',
        'launch_readiness_packet:VAIOS-G728'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of MGW_533_REQUIRED_EVIDENCE) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
    }

    expect(objectiveHeap).toContain('HAO-712 proof');
    expect(objectiveHeap).toContain('hallucinate_app/test/e2e/fixtures/hao-712-mcp-dashboard-launch-gate.json');
    expect(objectiveHeap).toContain('data/hallucinate_multimodal_control/discovery/2026-06-27-hao-712-mcp-dashboard-launch-gate.md');
  });

  test('closes the VAI-529 objective gap with the current Hallucinate launch Playwright validation gate', () => {
    const receipt = JSON.parse(fs.readFileSync(VAI_529_LAUNCH_GATE_FIXTURE, 'utf8'));
    const launchGateReceipt = fs.readFileSync(VAI_529_LAUNCH_GATE_RECEIPT, 'utf8');
    const objectiveGap = fs.readFileSync(VAI_529_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt.schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe('VAI-529');
    expect(receipt.goal_id).toBe('VAIOS-G724');
    expect(receipt.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(receipt.packet_goal_ids).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(receipt.source_gap_receipt).toBe(
      'data/virtual_ai_os/discovery/2026-06-27-vai-529-objective-gap-3e00ad2a0074.md'
    );
    expect(receipt.launch_gate_receipt).toBe(
      'data/virtual_ai_os/discovery/2026-06-28-vai-529-mcp-dashboard-launch-gate.md'
    );
    expect(receipt.evidence_term).toBe('launch Playwright validation gate');
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_evidence).toEqual(MGW_533_REQUIRED_EVIDENCE);
    expect(receipt.catalog_schema).toBe(catalog.schema);
    expect(receipt.catalog_generated_by).toBe(catalog.generated_by);
    expect(receipt.catalog_launch_objective_ids).toEqual(catalog.launch_objective_ids);
    expect(catalog.launch_validation_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: receipt.task_id,
        goal_id: receipt.goal_id,
        goal_packet: receipt.goal_packet,
        packet_goal_ids: receipt.packet_goal_ids,
        evidence_term: receipt.evidence_term,
        supervisor_gap_receipt: receipt.source_gap_receipt,
        launch_gate_receipt: receipt.launch_gate_receipt,
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-529-mcp-dashboard-launch-gate.json'
      })
    ]));

    for (const server of receipt.dashboard_servers) {
      const catalogServer = serversByPackage.get(server.server_package) as any;
      expect(catalogServer).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(catalogServer.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G724',
        'launch_readiness_packet:VAIOS-G728'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of MGW_533_REQUIRED_EVIDENCE) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
    }

    expect(objectiveHeap).toContain('VAI-529 proof');
    expect(objectiveHeap).toContain('hallucinate_app/test/e2e/fixtures/vai-529-mcp-dashboard-launch-gate.json');
    expect(objectiveHeap).toContain('data/virtual_ai_os/discovery/2026-06-28-vai-529-mcp-dashboard-launch-gate.md');
  });

  test('closes the HAO-720 objective gap with the current Hallucinate launch Playwright validation gate', () => {
    const receipt = JSON.parse(fs.readFileSync(HAO_720_LAUNCH_GATE_FIXTURE, 'utf8'));
    const launchGateReceipt = fs.readFileSync(HAO_720_LAUNCH_GATE_RECEIPT, 'utf8');
    const objectiveGap = fs.readFileSync(HAO_720_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt.schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe('HAO-720');
    expect(receipt.goal_id).toBe('VAIOS-G724');
    expect(receipt.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(receipt.packet_goal_ids).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(receipt.source_gap_receipt).toBe(
      'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-720-objective-gap-3e00ad2a0074.md'
    );
    expect(receipt.launch_gate_receipt).toBe(
      'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-720-mcp-dashboard-launch-gate.md'
    );
    expect(receipt.evidence_term).toBe('launch Playwright validation gate');
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_evidence).toEqual(MGW_533_REQUIRED_EVIDENCE);
    expect(receipt.catalog_schema).toBe(catalog.schema);
    expect(receipt.catalog_generated_by).toBe(catalog.generated_by);
    expect(receipt.catalog_launch_objective_ids).toEqual(catalog.launch_objective_ids);
    expect(catalog.launch_validation_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: receipt.task_id,
        goal_id: receipt.goal_id,
        goal_packet: receipt.goal_packet,
        packet_goal_ids: receipt.packet_goal_ids,
        evidence_term: receipt.evidence_term,
        supervisor_gap_receipt: receipt.source_gap_receipt,
        launch_gate_receipt: receipt.launch_gate_receipt,
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-720-mcp-dashboard-launch-gate.json'
      })
    ]));

    for (const server of receipt.dashboard_servers) {
      const catalogServer = serversByPackage.get(server.server_package) as any;
      expect(catalogServer).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(catalogServer.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G724',
        'launch_readiness_packet:VAIOS-G728'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of MGW_533_REQUIRED_EVIDENCE) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
    }

    expect(objectiveHeap).toContain('HAO-720 proof');
    expect(objectiveHeap).toContain('hallucinate_app/test/e2e/fixtures/hao-720-mcp-dashboard-launch-gate.json');
    expect(objectiveHeap).toContain('data/hallucinate_multimodal_control/discovery/2026-06-28-hao-720-mcp-dashboard-launch-gate.md');
    expect(objectiveHeap).toContain('VAIOS-G728');
  });

  test('closes the HAO-724 objective gap with the current Hallucinate launch Playwright validation gate', () => {
    validateDashboardLaunchGateReceipt({
      fixturePath: HAO_724_LAUNCH_GATE_FIXTURE,
      launchGateReceiptPath: HAO_724_LAUNCH_GATE_RECEIPT,
      objectiveGapPath: HAO_724_OBJECTIVE_GAP_RECEIPT,
      taskId: 'HAO-724',
      sourceGapReceipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-objective-gap-3e00ad2a0074.md',
      launchGateReceipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-mcp-dashboard-launch-gate.md',
      receiptFixture: 'hallucinate_app/test/e2e/fixtures/hao-724-mcp-dashboard-launch-gate.json',
      heapProof: 'HAO-724 proof'
    });
  });

  test('closes the VAI-535 objective gap with the current Hallucinate launch Playwright validation gate', () => {
    const receipt = JSON.parse(fs.readFileSync(VAI_535_LAUNCH_GATE_FIXTURE, 'utf8'));
    const launchGateReceipt = fs.readFileSync(VAI_535_LAUNCH_GATE_RECEIPT, 'utf8');
    const objectiveGap = fs.readFileSync(VAI_535_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt.schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe('VAI-535');
    expect(receipt.goal_id).toBe('VAIOS-G724');
    expect(receipt.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(receipt.packet_goal_ids).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(receipt.source_gap_receipt).toBe(
      'data/virtual_ai_os/discovery/2026-06-28-vai-535-objective-gap-3e00ad2a0074.md'
    );
    expect(receipt.launch_gate_receipt).toBe(
      'data/virtual_ai_os/discovery/2026-06-28-vai-535-mcp-dashboard-launch-gate.md'
    );
    expect(receipt.evidence_term).toBe('launch Playwright validation gate');
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_evidence).toEqual(MGW_533_REQUIRED_EVIDENCE);
    expect(receipt.catalog_schema).toBe(catalog.schema);
    expect(receipt.catalog_generated_by).toBe(catalog.generated_by);
    expect(receipt.catalog_launch_objective_ids).toEqual(catalog.launch_objective_ids);
    expect(catalog.launch_validation_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: receipt.task_id,
        goal_id: receipt.goal_id,
        goal_packet: receipt.goal_packet,
        packet_goal_ids: receipt.packet_goal_ids,
        evidence_term: receipt.evidence_term,
        supervisor_gap_receipt: receipt.source_gap_receipt,
        launch_gate_receipt: receipt.launch_gate_receipt,
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-535-mcp-dashboard-launch-gate.json'
      })
    ]));

    for (const server of receipt.dashboard_servers) {
      const catalogServer = serversByPackage.get(server.server_package) as any;
      expect(catalogServer).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(catalogServer.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G724',
        'launch_readiness_packet:VAIOS-G728'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of MGW_533_REQUIRED_EVIDENCE) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
    }

    expect(objectiveHeap).toContain('VAI-535 proof');
    expect(objectiveHeap).toContain('hallucinate_app/test/e2e/fixtures/vai-535-mcp-dashboard-launch-gate.json');
    expect(objectiveHeap).toContain('data/virtual_ai_os/discovery/2026-06-28-vai-535-mcp-dashboard-launch-gate.md');
    expect(objectiveHeap).toContain('VAIOS-G728');
  });

  test('closes the VAI-537 objective gap with the current Hallucinate launch Playwright validation gate', () => {
    validateDashboardLaunchGateReceipt({
      fixturePath: VAI_537_LAUNCH_GATE_FIXTURE,
      launchGateReceiptPath: VAI_537_LAUNCH_GATE_RECEIPT,
      objectiveGapPath: VAI_537_OBJECTIVE_GAP_RECEIPT,
      taskId: 'VAI-537',
      sourceGapReceipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-537-objective-gap-3e00ad2a0074.md',
      launchGateReceipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-537-mcp-dashboard-launch-gate.md',
      receiptFixture: 'hallucinate_app/test/e2e/fixtures/vai-537-mcp-dashboard-launch-gate.json',
      heapProof: 'VAI-537 proof'
    });
  });

  test('closes the VAI-539 objective gap with the current Hallucinate launch Playwright validation gate', () => {
    validateDashboardLaunchGateReceipt({
      fixturePath: VAI_539_LAUNCH_GATE_FIXTURE,
      launchGateReceiptPath: VAI_539_LAUNCH_GATE_RECEIPT,
      objectiveGapPath: VAI_539_OBJECTIVE_GAP_RECEIPT,
      taskId: 'VAI-539',
      sourceGapReceipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-539-objective-gap-3e00ad2a0074.md',
      launchGateReceipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-539-mcp-dashboard-launch-gate.md',
      receiptFixture: 'hallucinate_app/test/e2e/fixtures/vai-539-mcp-dashboard-launch-gate.json',
      heapProof: 'VAI-539 proof'
    });
  });

  test('closes the MGW-555 objective gap with the current Hallucinate launch Playwright validation gate', () => {
    validateDashboardLaunchGateReceipt({
      fixturePath: MGW_555_LAUNCH_GATE_FIXTURE,
      launchGateReceiptPath: MGW_555_LAUNCH_GATE_RECEIPT,
      objectiveGapPath: MGW_555_OBJECTIVE_GAP_RECEIPT,
      taskId: 'MGW-555',
      sourceGapReceipt: 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-555-objective-gap-3e00ad2a0074.md',
      launchGateReceipt: 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-555-launch-playwright-validation-gate.md',
      receiptFixture: 'hallucinate_app/test/e2e/fixtures/mgw-555-mcp-dashboard-launch-gate.json',
      heapProof: 'MGW-555 proof',
      gateState: 'gate_closed_by_playwright_validation'
    });
  });

  test('closes the VAI-543 objective gap with a dashboard interoperability launch gate receipt', () => {
    const receipt = JSON.parse(fs.readFileSync(VAI_543_LAUNCH_GATE_FIXTURE, 'utf8'));
    const launchGateReceipt = fs.readFileSync(VAI_543_LAUNCH_GATE_RECEIPT, 'utf8');
    const hallucinateLaunchGateReceipt = fs.readFileSync(VAI_543_HALLUCINATE_LAUNCH_GATE_RECEIPT, 'utf8');
    const objectiveGap = fs.readFileSync(VAI_543_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const readinessDoc = fs.readFileSync(LAUNCH_READINESS_DOC, 'utf8');
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const launchGate = catalog.launch_validation_gates?.find((gate: any) => gate.task_id === 'VAI-543');

    expect(receipt).toMatchObject({
      schema: 'mcp_dashboard_interoperability_gate_v1',
      task_id: 'VAI-543',
      goal_id: 'VAIOS-G723',
      lineage_id: 'VAIOS-G723:mcp-dashboard-interoperability',
      evidence_term: 'launch Playwright validation gate',
      source_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-543-objective-gap-7ea369464239.md',
      launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-543-mcp-dashboard-launch-gate.md',
      hallucinate_launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-vai-543-mcp-dashboard-launch-gate.md',
      catalog_schema: catalog.schema,
      catalog_source: catalog.generated_by
    });
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:daemon-manager',
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'npm --prefix swissknife run test:e2e:mcp',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_backends.sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);
    expect(receipt.child_goals).toEqual(MGW_546_CHILD_GOALS);
    expect(receipt.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(launchGate).toMatchObject({
      task_id: receipt.task_id,
      goal_id: receipt.goal_id,
      evidence_term: receipt.evidence_term,
      supervisor_gap_receipt: receipt.source_gap_receipt,
      launch_gate_receipt: receipt.launch_gate_receipt,
      hallucinate_backlog_receipt: receipt.hallucinate_backlog_receipt,
      receipt_fixture: receipt.receipt_fixture,
      child_goals: receipt.child_goals,
      follow_up_subtasks: receipt.follow_up_subtasks
    });

    for (const server of receipt.dashboard_servers) {
      const catalogServer = catalog.servers.find((entry: any) => entry.server_package === server.server_package);
      expect(catalogServer, server.server_package).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe(server.tools_list);
      expect(catalogServer.tool_protocols.tools_call.operation).toBe(server.tools_call);
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G723'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of receipt.required_evidence) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
      expect(hallucinateLaunchGateReceipt).toContain(term);
      expect(objectiveHeap).toContain(term);
      expect(readinessDoc).toContain(term);
    }

    expect(objectiveHeap).toContain('VAI-543 proof');
    expect(objectiveHeap).toContain('hallucinate_app/test/e2e/fixtures/vai-543-mcp-dashboard-launch-gate.json');
    expect(objectiveHeap).toContain('data/virtual_ai_os/discovery/2026-06-28-vai-543-mcp-dashboard-launch-gate.md');
    expect(readinessDoc).toContain('VAI-543');
    expect(readinessDoc).toContain('mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts');
  });

  test('binds HAO-727 backlog evidence to the VAIOS-G723 dashboard launch Playwright gate', () => {
    const receipt = JSON.parse(fs.readFileSync(HAO_727_LAUNCH_GATE_FIXTURE, 'utf8'));
    const launchGateReceipt = fs.readFileSync(HAO_727_LAUNCH_GATE_RECEIPT, 'utf8');
    const attempt5ValidationReceipt = fs.readFileSync(HAO_727_ATTEMPT_5_VALIDATION_RECEIPT, 'utf8');
    const objectiveGap = fs.readFileSync(HAO_727_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const readinessDoc = fs.readFileSync(LAUNCH_READINESS_DOC, 'utf8');
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const launchGate = catalog.launch_validation_gates?.find((gate: any) => gate.task_id === 'HAO-727');
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt).toMatchObject({
      schema: 'launch_readiness_receipt_v1',
      task_id: 'HAO-727',
      goal_id: 'VAIOS-G723',
      lineage_id: 'VAIOS-G723:hallucinate-mcp-dashboard-interoperability',
      evidence_term: 'launch Playwright validation gate',
      source_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-objective-gap-7ea369464239.md',
      launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-mcp-dashboard-launch-gate.md',
      hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-mcp-dashboard-launch-gate.md',
      receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-727-mcp-dashboard-launch-gate.json',
      catalog_schema: catalog.schema,
      catalog_source: catalog.generated_by,
      catalog_generated_by: catalog.generated_by
    });
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py tests/test_virtual_ai_os_todo_queue.py -q',
      'npm --prefix hallucinate_app run test:daemon-manager',
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'npm --prefix swissknife run test:e2e:mcp',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_backends.sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);
    expect(receipt.required_evidence).toEqual(HAO_727_REQUIRED_EVIDENCE);
    expect(receipt.child_goals).toEqual(MGW_546_CHILD_GOALS);
    expect(receipt.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(receipt.supervisor_follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(receipt.attempt).toBe(5);
    expect(receipt.attempt_receipts).toEqual([
      'data/hallucinate_multimodal_control/discovery/2026-06-30-hao-727-attempt-5-validation.md'
    ]);
    expect(launchGate).toMatchObject({
      task_id: receipt.task_id,
      goal_id: receipt.goal_id,
      evidence_term: receipt.evidence_term,
      supervisor_gap_receipt: receipt.source_gap_receipt,
      launch_gate_receipt: receipt.launch_gate_receipt,
      hallucinate_backlog_receipt: receipt.hallucinate_backlog_receipt,
      receipt_fixture: receipt.receipt_fixture,
      attempt: receipt.attempt,
      attempt_receipts: receipt.attempt_receipts,
      child_goals: receipt.child_goals,
      follow_up_subtasks: receipt.follow_up_subtasks
    });

    for (const server of receipt.dashboard_servers) {
      const catalogServer = serversByPackage.get(server.server_package) as any;
      expect(catalogServer, server.server_package).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe(server.tools_list);
      expect(catalogServer.tool_protocols.tools_call.operation).toBe(server.tools_call);
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G723'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of receipt.required_evidence) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
      expect(attempt5ValidationReceipt).toContain(term);
      expect(objectiveHeap).toContain(term);
      expect(readinessDoc).toContain(term);
    }

    expect(objectiveHeap).toContain('HAO-727 proof');
    expect(objectiveHeap).toContain(receipt.receipt_fixture);
    expect(objectiveHeap).toContain(receipt.launch_gate_receipt);
    expect(objectiveHeap).toContain(receipt.attempt_receipts[0]);
    expect(readinessDoc).toContain('HAO-727');
    expect(readinessDoc).toContain(receipt.receipt_fixture);
    expect(readinessDoc).toContain(receipt.launch_gate_receipt);
    expect(readinessDoc).toContain(receipt.attempt_receipts[0]);
    expect(attempt5ValidationReceipt).toContain('125 passed, 1 warning');
    expect(attempt5ValidationReceipt).toContain('30 passed, 33 skipped');
    expect(attempt5ValidationReceipt).toContain('missing_xvfb_for_electron_playwright');
  });

  test('binds MGW-558 objective gap evidence to the VAIOS-G723 dashboard launch Playwright gate', () => {
    const receipt = JSON.parse(fs.readFileSync(MGW_558_LAUNCH_GATE_FIXTURE, 'utf8'));
    const launchGateReceipt = fs.readFileSync(MGW_558_LAUNCH_GATE_RECEIPT, 'utf8');
    const hallucinateLaunchGateReceipt = fs.readFileSync(MGW_558_HALLUCINATE_LAUNCH_GATE_RECEIPT, 'utf8');
    const objectiveGap = fs.readFileSync(MGW_558_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const readinessDoc = fs.readFileSync(LAUNCH_READINESS_DOC, 'utf8');
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const launchGate = catalog.launch_validation_gates?.find((gate: any) => gate.task_id === 'MGW-558');
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt).toMatchObject({
      schema: 'launch_readiness_receipt_v1',
      task_id: 'MGW-558',
      goal_id: 'VAIOS-G723',
      lineage_id: 'VAIOS-G723:hallucinate-mcp-dashboard-interoperability-console',
      evidence_term: 'launch Playwright validation gate',
      source_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-558-objective-gap-7ea369464239.md',
      launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-558-launch-playwright-validation-gate.md',
      hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-29-mgw-558-mcp-dashboard-launch-gate.md',
      receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-558-mcp-dashboard-launch-gate.json',
      catalog_schema: catalog.schema,
      catalog_source: catalog.generated_by,
      catalog_generated_by: catalog.generated_by
    });
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py tests/test_virtual_ai_os_todo_queue.py -q',
      'npm --prefix hallucinate_app run test:daemon-manager',
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'cd hallucinate_app && (env -u DISPLAY -u WAYLAND_DISPLAY HALLUCINATE_APP_E2E_NO_BOOTSTRAP=true node scripts/run_playwright_test.mjs --help || test $? -eq 78)',
      'npm --prefix swissknife run test:e2e:mcp',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_backends.sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);
    expect(receipt.required_evidence).toEqual(HAO_727_REQUIRED_EVIDENCE);
    expect(receipt.child_goals).toEqual(MGW_546_CHILD_GOALS);
    expect(receipt.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(receipt.supervisor_follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(launchGate).toMatchObject({
      task_id: receipt.task_id,
      goal_id: receipt.goal_id,
      evidence_term: receipt.evidence_term,
      supervisor_gap_receipt: receipt.source_gap_receipt,
      launch_gate_receipt: receipt.launch_gate_receipt,
      hallucinate_backlog_receipt: receipt.hallucinate_backlog_receipt,
      receipt_fixture: receipt.receipt_fixture,
      child_goals: receipt.child_goals,
      follow_up_subtasks: receipt.follow_up_subtasks
    });

    for (const server of receipt.dashboard_servers) {
      const catalogServer = serversByPackage.get(server.server_package) as any;
      expect(catalogServer, server.server_package).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe(server.tools_list);
      expect(catalogServer.tool_protocols.tools_call.operation).toBe(server.tools_call);
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G723'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of receipt.required_evidence) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
      expect(hallucinateLaunchGateReceipt).toContain(term);
      expect(objectiveHeap).toContain(term);
      expect(readinessDoc).toContain(term);
    }

    expect(objectiveHeap).toContain('MGW-558 proof');
    expect(objectiveHeap).toContain(receipt.receipt_fixture);
    expect(objectiveHeap).toContain(receipt.launch_gate_receipt);
    expect(objectiveHeap).toContain(receipt.hallucinate_backlog_receipt);
    expect(readinessDoc).toContain('MGW-558');
    expect(readinessDoc).toContain(receipt.receipt_fixture);
    expect(readinessDoc).toContain(receipt.launch_gate_receipt);
    expect(readinessDoc).toContain(receipt.hallucinate_backlog_receipt);
  });

  test('binds MGW-559 objective gap evidence to the VAIOS-G723 dashboard launch Playwright gate', () => {
    const receipt = JSON.parse(fs.readFileSync(MGW_559_LAUNCH_GATE_FIXTURE, 'utf8'));
    const launchGateReceipt = fs.readFileSync(MGW_559_LAUNCH_GATE_RECEIPT, 'utf8');
    const hallucinateLaunchGateReceipt = fs.readFileSync(MGW_559_HALLUCINATE_LAUNCH_GATE_RECEIPT, 'utf8');
    const objectiveGap = fs.readFileSync(MGW_559_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const readinessDoc = fs.readFileSync(LAUNCH_READINESS_DOC, 'utf8');
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const launchGate = catalog.launch_validation_gates?.find((gate: any) => gate.task_id === 'MGW-559');
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt).toMatchObject({
      schema: 'launch_readiness_receipt_v1',
      task_id: 'MGW-559',
      goal_id: 'VAIOS-G723',
      lineage_id: 'VAIOS-G723:hallucinate-mcp-dashboard-interoperability-console',
      evidence_term: 'launch Playwright validation gate',
      source_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-559-objective-gap-7ea369464239.md',
      launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-559-launch-playwright-validation-gate.md',
      hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-29-mgw-559-mcp-dashboard-launch-gate.md',
      receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-559-mcp-dashboard-launch-gate.json',
      catalog_schema: catalog.schema,
      catalog_source: catalog.generated_by,
      catalog_generated_by: catalog.generated_by
    });
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py tests/test_virtual_ai_os_todo_queue.py -q',
      'npm --prefix hallucinate_app run test:daemon-manager',
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'cd hallucinate_app && (env -u DISPLAY -u WAYLAND_DISPLAY HALLUCINATE_APP_E2E_NO_BOOTSTRAP=true node scripts/run_playwright_test.mjs --help || test $? -eq 78)',
      'npm --prefix swissknife run test:e2e:mcp',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_backends.sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);
    expect(receipt.required_evidence).toEqual(HAO_727_REQUIRED_EVIDENCE);
    expect(receipt.child_goals).toEqual(MGW_546_CHILD_GOALS);
    expect(receipt.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(receipt.supervisor_follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(launchGate).toMatchObject({
      task_id: receipt.task_id,
      goal_id: receipt.goal_id,
      evidence_term: receipt.evidence_term,
      supervisor_gap_receipt: receipt.source_gap_receipt,
      launch_gate_receipt: receipt.launch_gate_receipt,
      hallucinate_backlog_receipt: receipt.hallucinate_backlog_receipt,
      receipt_fixture: receipt.receipt_fixture,
      child_goals: receipt.child_goals,
      follow_up_subtasks: receipt.follow_up_subtasks
    });

    for (const server of receipt.dashboard_servers) {
      const catalogServer = serversByPackage.get(server.server_package) as any;
      expect(catalogServer, server.server_package).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe(server.tools_list);
      expect(catalogServer.tool_protocols.tools_call.operation).toBe(server.tools_call);
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G723'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of receipt.required_evidence) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
      expect(hallucinateLaunchGateReceipt).toContain(term);
      expect(objectiveHeap).toContain(term);
      expect(readinessDoc).toContain(term);
    }

    expect(objectiveHeap).toContain('MGW-559 proof');
    expect(objectiveHeap).toContain(receipt.receipt_fixture);
    expect(objectiveHeap).toContain(receipt.launch_gate_receipt);
    expect(objectiveHeap).toContain(receipt.hallucinate_backlog_receipt);
    expect(readinessDoc).toContain('MGW-559');
    expect(readinessDoc).toContain(receipt.receipt_fixture);
    expect(readinessDoc).toContain(receipt.launch_gate_receipt);
    expect(readinessDoc).toContain(receipt.hallucinate_backlog_receipt);
  });

  test('binds MGW-561 objective gap evidence to the VAIOS-G723 dashboard launch Playwright gate', () => {
    const receipt = JSON.parse(fs.readFileSync(MGW_561_LAUNCH_GATE_FIXTURE, 'utf8'));
    const launchGateReceipt = fs.readFileSync(MGW_561_LAUNCH_GATE_RECEIPT, 'utf8');
    const hallucinateLaunchGateReceipt = fs.readFileSync(MGW_561_HALLUCINATE_LAUNCH_GATE_RECEIPT, 'utf8');
    const objectiveGap = fs.readFileSync(MGW_561_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const readinessDoc = fs.readFileSync(LAUNCH_READINESS_DOC, 'utf8');
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const launchGate = catalog.launch_validation_gates?.find((gate: any) => gate.task_id === 'MGW-561');
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt).toMatchObject({
      schema: 'launch_readiness_receipt_v1',
      task_id: 'MGW-561',
      goal_id: 'VAIOS-G723',
      lineage_id: 'VAIOS-G723:hallucinate-mcp-dashboard-interoperability-console',
      evidence_term: 'launch Playwright validation gate',
      source_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-561-objective-gap-7ea369464239.md',
      launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-561-launch-playwright-validation-gate.md',
      hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-30-mgw-561-mcp-dashboard-launch-gate.md',
      receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-561-mcp-dashboard-launch-gate.json',
      catalog_schema: catalog.schema,
      catalog_source: catalog.generated_by,
      catalog_generated_by: catalog.generated_by
    });
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py tests/test_virtual_ai_os_todo_queue.py -q',
      'npm --prefix hallucinate_app run test:daemon-manager',
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'cd hallucinate_app && (env -u DISPLAY -u WAYLAND_DISPLAY HALLUCINATE_APP_E2E_NO_BOOTSTRAP=true node scripts/run_playwright_test.mjs --help || test $? -eq 78)',
      'npm --prefix swissknife run test:e2e:mcp',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_backends.sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);
    expect(receipt.required_evidence).toEqual(HAO_727_REQUIRED_EVIDENCE);
    expect(receipt.child_goals).toEqual(MGW_546_CHILD_GOALS);
    expect(receipt.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(receipt.supervisor_follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(launchGate).toMatchObject({
      task_id: receipt.task_id,
      goal_id: receipt.goal_id,
      evidence_term: receipt.evidence_term,
      supervisor_gap_receipt: receipt.source_gap_receipt,
      launch_gate_receipt: receipt.launch_gate_receipt,
      hallucinate_backlog_receipt: receipt.hallucinate_backlog_receipt,
      receipt_fixture: receipt.receipt_fixture,
      child_goals: receipt.child_goals,
      follow_up_subtasks: receipt.follow_up_subtasks
    });

    for (const server of receipt.dashboard_servers) {
      const catalogServer = serversByPackage.get(server.server_package) as any;
      expect(catalogServer, server.server_package).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe(server.tools_list);
      expect(catalogServer.tool_protocols.tools_call.operation).toBe(server.tools_call);
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G723'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of receipt.required_evidence) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
      expect(hallucinateLaunchGateReceipt).toContain(term);
      expect(objectiveHeap).toContain(term);
      expect(readinessDoc).toContain(term);
    }

    expect(objectiveHeap).toContain('MGW-561 proof');
    expect(objectiveHeap).toContain(receipt.receipt_fixture);
    expect(objectiveHeap).toContain(receipt.launch_gate_receipt);
    expect(objectiveHeap).toContain(receipt.hallucinate_backlog_receipt);
    expect(readinessDoc).toContain('MGW-561');
    expect(readinessDoc).toContain(receipt.receipt_fixture);
    expect(readinessDoc).toContain(receipt.launch_gate_receipt);
    expect(readinessDoc).toContain(receipt.hallucinate_backlog_receipt);
  });

  test('binds MGW-562 objective gap evidence to the VAIOS-G723 dashboard launch Playwright gate', () => {
    const receipt = JSON.parse(fs.readFileSync(MGW_562_LAUNCH_GATE_FIXTURE, 'utf8'));
    const launchGateReceipt = fs.readFileSync(MGW_562_LAUNCH_GATE_RECEIPT, 'utf8');
    const hallucinateLaunchGateReceipt = fs.readFileSync(MGW_562_HALLUCINATE_LAUNCH_GATE_RECEIPT, 'utf8');
    const objectiveGap = fs.readFileSync(MGW_562_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const readinessDoc = fs.readFileSync(LAUNCH_READINESS_DOC, 'utf8');
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const launchGate = catalog.launch_validation_gates?.find((gate: any) => gate.task_id === 'MGW-562');
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt).toMatchObject({
      schema: 'launch_readiness_receipt_v1',
      task_id: 'MGW-562',
      goal_id: 'VAIOS-G723',
      lineage_id: 'VAIOS-G723:hallucinate-mcp-dashboard-interoperability-console',
      evidence_term: 'launch Playwright validation gate',
      source_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-562-objective-gap-7ea369464239.md',
      launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-562-launch-playwright-validation-gate.md',
      hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-30-mgw-562-mcp-dashboard-launch-gate.md',
      receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-562-mcp-dashboard-launch-gate.json',
      catalog_schema: catalog.schema,
      catalog_source: catalog.generated_by,
      catalog_generated_by: catalog.generated_by
    });
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py tests/test_virtual_ai_os_todo_queue.py -q',
      'npm --prefix hallucinate_app run test:daemon-manager',
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'cd hallucinate_app && (env -u DISPLAY -u WAYLAND_DISPLAY HALLUCINATE_APP_E2E_NO_BOOTSTRAP=true node scripts/run_playwright_test.mjs --help || test $? -eq 78)',
      'npm --prefix swissknife run test:e2e:mcp',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_backends.sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);
    expect(receipt.required_evidence).toEqual(HAO_727_REQUIRED_EVIDENCE);
    expect(receipt.child_goals).toEqual(MGW_546_CHILD_GOALS);
    expect(receipt.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(receipt.supervisor_follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(launchGate).toMatchObject({
      task_id: receipt.task_id,
      goal_id: receipt.goal_id,
      evidence_term: receipt.evidence_term,
      supervisor_gap_receipt: receipt.source_gap_receipt,
      launch_gate_receipt: receipt.launch_gate_receipt,
      hallucinate_backlog_receipt: receipt.hallucinate_backlog_receipt,
      receipt_fixture: receipt.receipt_fixture,
      child_goals: receipt.child_goals,
      follow_up_subtasks: receipt.follow_up_subtasks
    });

    for (const server of receipt.dashboard_servers) {
      const catalogServer = serversByPackage.get(server.server_package) as any;
      expect(catalogServer, server.server_package).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe(server.tools_list);
      expect(catalogServer.tool_protocols.tools_call.operation).toBe(server.tools_call);
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G723'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of receipt.required_evidence) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
      expect(hallucinateLaunchGateReceipt).toContain(term);
      expect(objectiveHeap).toContain(term);
      expect(readinessDoc).toContain(term);
    }

    expect(objectiveHeap).toContain('MGW-562 proof');
    expect(objectiveHeap).toContain(receipt.receipt_fixture);
    expect(objectiveHeap).toContain(receipt.launch_gate_receipt);
    expect(objectiveHeap).toContain(receipt.hallucinate_backlog_receipt);
    expect(readinessDoc).toContain('MGW-562');
    expect(readinessDoc).toContain(receipt.receipt_fixture);
    expect(readinessDoc).toContain(receipt.launch_gate_receipt);
    expect(readinessDoc).toContain(receipt.hallucinate_backlog_receipt);
  });

  test('binds MGW-563 objective gap evidence to the VAIOS-G723 dashboard launch Playwright gate', () => {
    const receipt = JSON.parse(fs.readFileSync(MGW_563_LAUNCH_GATE_FIXTURE, 'utf8'));
    const launchGateReceipt = fs.readFileSync(MGW_563_LAUNCH_GATE_RECEIPT, 'utf8');
    const hallucinateLaunchGateReceipt = fs.readFileSync(MGW_563_HALLUCINATE_LAUNCH_GATE_RECEIPT, 'utf8');
    const attempt3LaunchGateReceipt = fs.readFileSync(MGW_563_ATTEMPT_3_LAUNCH_GATE_RECEIPT, 'utf8');
    const attempt3HallucinateValidationReceipt = fs.readFileSync(MGW_563_ATTEMPT_3_HALLUCINATE_VALIDATION_RECEIPT, 'utf8');
    const objectiveGap = fs.readFileSync(MGW_563_OBJECTIVE_GAP_RECEIPT, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const readinessDoc = fs.readFileSync(LAUNCH_READINESS_DOC, 'utf8');
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const launchGate = catalog.launch_validation_gates?.find((gate: any) => gate.task_id === 'MGW-563');
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt).toMatchObject({
      schema: 'launch_readiness_receipt_v1',
      task_id: 'MGW-563',
      goal_id: 'VAIOS-G723',
      lineage_id: 'VAIOS-G723:hallucinate-mcp-dashboard-interoperability-console',
      evidence_term: 'launch Playwright validation gate',
      source_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-07-01-mgw-563-objective-gap-7ea369464239.md',
      launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-07-01-mgw-563-launch-playwright-validation-gate.md',
      hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-07-01-mgw-563-mcp-dashboard-launch-gate.md',
      receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-563-mcp-dashboard-launch-gate.json',
      catalog_schema: catalog.schema,
      catalog_source: catalog.generated_by,
      catalog_generated_by: catalog.generated_by
    });
    expect(receipt.playwright_specs).toEqual(expect.arrayContaining([
      'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
      'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
    ]));
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py tests/test_virtual_ai_os_todo_queue.py -q',
      'npm --prefix hallucinate_app run test:daemon-manager',
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'cd hallucinate_app && (env -u DISPLAY -u WAYLAND_DISPLAY HALLUCINATE_APP_E2E_NO_BOOTSTRAP=true node scripts/run_playwright_test.mjs --help || test $? -eq 78)',
      'npm --prefix swissknife run test:e2e:mcp',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_backends.sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py'
    ]);
    expect(receipt.required_evidence).toEqual(HAO_727_REQUIRED_EVIDENCE);
    expect(receipt.child_goals).toEqual(MGW_546_CHILD_GOALS);
    expect(receipt.follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(receipt.supervisor_follow_up_subtasks).toEqual(FOLLOW_UP_TASKS);
    expect(launchGate).toMatchObject({
      task_id: receipt.task_id,
      goal_id: receipt.goal_id,
      evidence_term: receipt.evidence_term,
      supervisor_gap_receipt: receipt.source_gap_receipt,
      launch_gate_receipt: receipt.launch_gate_receipt,
      hallucinate_backlog_receipt: receipt.hallucinate_backlog_receipt,
      receipt_fixture: receipt.receipt_fixture,
      attempt: 3,
      attempt_receipts: [
        'data/meta_glasses_display_widgets/discovery/2026-07-02-mgw-563-attempt-3-launch-playwright-validation-gate.md',
        'data/hallucinate_multimodal_control/discovery/2026-07-02-mgw-563-attempt-3-validation.md'
      ],
      child_goals: receipt.child_goals,
      follow_up_subtasks: receipt.follow_up_subtasks
    });

    for (const server of receipt.dashboard_servers) {
      const catalogServer = serversByPackage.get(server.server_package) as any;
      expect(catalogServer, server.server_package).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe(server.tools_list);
      expect(catalogServer.tool_protocols.tools_call.operation).toBe(server.tools_call);
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G723'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of receipt.required_evidence) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
      expect(hallucinateLaunchGateReceipt).toContain(term);
      expect(attempt3LaunchGateReceipt).toContain(term);
      expect(attempt3HallucinateValidationReceipt).toContain(term);
      expect(objectiveHeap).toContain(term);
      expect(readinessDoc).toContain(term);
    }

    expect(objectiveHeap).toContain('MGW-563 proof');
    expect(objectiveHeap).toContain('MGW-563 attempt 3 validation');
    expect(objectiveHeap).toContain('2026-07-02-mgw-563-attempt-3-launch-playwright-validation-gate.md');
    expect(readinessDoc).toContain('2026-07-02-mgw-563-attempt-3-validation.md');
    expect(attempt3LaunchGateReceipt).toContain('127 passed, 1 warning');
    expect(attempt3LaunchGateReceipt).toContain('33 passed, 33 skipped');
    expect(attempt3LaunchGateReceipt).toContain('missing_xvfb_for_electron_playwright');
    expect(attempt3HallucinateValidationReceipt).toContain('5 passed');
    expect(objectiveHeap).toContain(receipt.receipt_fixture);
    expect(objectiveHeap).toContain(receipt.launch_gate_receipt);
    expect(objectiveHeap).toContain(receipt.hallucinate_backlog_receipt);
    expect(readinessDoc).toContain('MGW-563');
    expect(readinessDoc).toContain(receipt.receipt_fixture);
    expect(readinessDoc).toContain(receipt.launch_gate_receipt);
    expect(readinessDoc).toContain(receipt.hallucinate_backlog_receipt);
  });

  function validateDashboardLaunchGateReceipt(expected: {
    fixturePath: string;
    launchGateReceiptPath: string;
    objectiveGapPath: string;
    taskId: string;
    sourceGapReceipt: string;
    launchGateReceipt: string;
    receiptFixture: string;
    heapProof: string;
    gateState?: string;
  }) {
    const receipt = JSON.parse(fs.readFileSync(expected.fixturePath, 'utf8'));
    const launchGateReceipt = fs.readFileSync(expected.launchGateReceiptPath, 'utf8');
    const objectiveGap = fs.readFileSync(expected.objectiveGapPath, 'utf8');
    const objectiveHeap = fs.readFileSync(MGW_OBJECTIVE_HEAP, 'utf8');
    const catalog = new MCPDaemonManager().getDashboardCapabilityCatalog();
    const serversByPackage = new Map(catalog.servers.map((server: any) => [server.server_package, server]));

    expect(receipt.schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe(expected.taskId);
    expect(receipt.goal_id).toBe('VAIOS-G724');
    expect(receipt.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(receipt.packet_goal_ids).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(receipt.source_gap_receipt).toBe(expected.sourceGapReceipt);
    expect(receipt.launch_gate_receipt).toBe(expected.launchGateReceipt);
    expect(receipt.evidence_term).toBe('launch Playwright validation gate');
    if (expected.gateState) {
      expect(receipt.gate_state).toBe(expected.gateState);
    }
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]));
    expect(receipt.required_evidence).toEqual(MGW_533_REQUIRED_EVIDENCE);
    expect(receipt.catalog_schema).toBe(catalog.schema);
    expect(receipt.catalog_generated_by).toBe(catalog.generated_by);
    expect(receipt.catalog_launch_objective_ids).toEqual(catalog.launch_objective_ids);
    expect(catalog.launch_validation_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: receipt.task_id,
        goal_id: receipt.goal_id,
        goal_packet: receipt.goal_packet,
        packet_goal_ids: receipt.packet_goal_ids,
        evidence_term: receipt.evidence_term,
        supervisor_gap_receipt: receipt.source_gap_receipt,
        launch_gate_receipt: receipt.launch_gate_receipt,
        receipt_fixture: expected.receiptFixture,
        ...(expected.gateState ? { gate_state: expected.gateState } : {})
      })
    ]));

    for (const server of receipt.dashboard_servers) {
      const catalogServer = serversByPackage.get(server.server_package) as any;
      expect(catalogServer).toBeTruthy();
      expect(catalogServer.daemon_id).toBe(server.daemon_id);
      expect(catalogServer.health_path).toBe(server.health_path);
      expect(catalogServer.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(catalogServer.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(catalogServer.tool_protocols.tools_call.safeProbe.expected_receipt).toBe(server.safe_probe_receipt);
      expect(catalogServer.dashboard_receipt_consumer_refs).toEqual(expect.arrayContaining([
        'hallucinate_app.swissknife.mcp_capability_registry',
        'launch_readiness_packet:VAIOS-G724',
        'launch_readiness_packet:VAIOS-G728'
      ]));
      expect(catalogServer.swissknife_consumer).toBe(server.swissknife_consumer);
    }

    for (const term of MGW_533_REQUIRED_EVIDENCE) {
      expect(objectiveGap).toContain(term);
      expect(launchGateReceipt).toContain(term);
    }

    expect(objectiveHeap).toContain(expected.heapProof);
    expect(objectiveHeap).toContain(expected.receiptFixture);
    expect(objectiveHeap).toContain(expected.launchGateReceipt);
    if (expected.gateState) {
      expect(launchGateReceipt).toContain(expected.gateState);
      expect(objectiveHeap).toContain(expected.gateState);
    }
    expect(objectiveHeap).toContain('VAIOS-G728');
  }
});

async function validateMediatedDashboardToolReceipts() {
  const manager = new MCPDaemonManager();
  manager.setControlSurfaceRuntimePolicyEvaluator((request: any) => ({
    outcome: 'allow',
    reasons: ['VAI-512 launch Playwright validation gate dashboard MCP operation'],
    metadata: {
      gate: 'mcp-dashboard-interoperability',
      daemon_id: request.service_id,
      method: request.method
    }
  }));

  const catalog = manager.getDashboardCapabilityCatalog();
  const receipts = [];
  const operations = [];

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
      'launch_readiness_packet:VAIOS-G723',
      'launch_readiness_packet:VAIOS-G724',
      'launch_readiness_packet:VAIOS-G728'
    ]));
    receipts.push(listResult.mediation_receipt.receipt_id);
    operations.push(`${server.daemon_id}:${listResult.method}`);

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
    operations.push(`${server.daemon_id}:${result.method}`);
  }

  return { receipts, operations };
}
