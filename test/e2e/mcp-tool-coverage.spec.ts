import playwrightTest from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mcpServers } from '../../hallucinate_app/node/menu_config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { test, expect, _electron: electron } = playwrightTest as unknown as typeof import('@playwright/test');

const hasElectronDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const coverageDescribe = hasElectronDisplay ? test.describe : test.describe.skip;

const APP_ROOT = path.join(__dirname, '..', '..');
const VIEWS_DIR = path.join(APP_ROOT, 'hallucinate_app', 'node', 'views');
const OUTPUT_DIR = path.join(APP_ROOT, 'test-results', 'mcp-tool-coverage');
const COVERAGE_PATH = path.join(OUTPUT_DIR, 'coverage.json');

function electronLaunchEnv(extra: Record<string, string> = {}) {
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
  return {
    ...env,
    NODE_ENV: 'test',
    ELECTRON_ENABLE_LOGGING: '1',
    AUTO_START_DAEMONS: 'false',
    ...extra
  };
}

interface ServerCoverage {
  daemonId: string;
  displayName: string;
  view: string;
  declaredTools: string[];
  surfaceHooksPresent: boolean;
  toolsListReceiptStatus: string | null;
  toolsCallReceiptStatus: string | null;
  discoveredToolCount: number;
  discoveredTools: string[];
  notes: string[];
}

// MCP server dashboards under test, mapped to their declared tool catalog.
const MCP_DASHBOARDS = mcpServers
  .filter((server: any) => server.dashboardPath)
  .map((server: any) => ({
    daemonId: server.id,
    displayName: server.displayName,
    view: path.basename(server.dashboardPath),
    declaredTools: (server.tools || [])
      .filter((tool: any) => tool.label)
      .map((tool: any) => tool.label)
  }));

let electronApp: ElectronApplication;
let window: Page;
const coverage: ServerCoverage[] = [];

async function navigateToFile(target: string) {
  await electronApp.evaluate(async ({ BrowserWindow }, filePath) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No BrowserWindow available');
    const load = win.loadFile(filePath).catch(() => undefined);
    const guard = new Promise<void>((resolve) => {
      setTimeout(() => {
        try { win.webContents.stop(); } catch { /* ignore */ }
        resolve();
      }, 6000);
    });
    await Promise.race([load, guard]);
  }, target);
}

async function clickAndReadReceipt(buttonTestId: string, receiptTestId: string): Promise<string | null> {
  const button = window.locator(`[data-testid="${buttonTestId}"]`);
  if ((await button.count()) === 0) return null;
  await button.click();
  // The dashboards write a JSON receipt synchronously after the bridge call resolves.
  await window.waitForTimeout(1500);
  const text = await window.locator(`[data-testid="${receiptTestId}"]`).textContent();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed.status || (parsed.fail_closed ? 'fail_closed' : 'unknown');
  } catch {
    return 'unparsed';
  }
}

coverageDescribe('MCP Tool Coverage', () => {
  test.beforeAll(async () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(APP_ROOT, 'index.js')],
      env: electronLaunchEnv()
    });
    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(1500);
  });

  test.afterAll(async () => {
    const report = {
      generatedAt: new Date().toISOString(),
      app: 'hallucinate_app',
      note: 'Daemons are not started in this run, so live tool enumeration is expected to be fail-closed. This report verifies the dashboard tool surface, selector hooks, and mediation receipts.',
      servers: coverage
    };
    fs.writeFileSync(COVERAGE_PATH, JSON.stringify(report, null, 2));
    await electronApp?.close();
    electronApp = undefined as any;
  });

  for (const dashboard of MCP_DASHBOARDS) {
    test(`tool surface — ${dashboard.daemonId}`, async () => {
      const absFile = path.join(VIEWS_DIR, dashboard.view);
      expect(fs.existsSync(absFile), `missing view ${dashboard.view}`).toBe(true);

      await navigateToFile(absFile);
      await window.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
      await window.waitForTimeout(1000);

      // Selector contract: the dashboard must expose the stable test hooks.
      const root = window.locator('[data-testid="mcp-dashboard"]');
      await expect(root).toHaveCount(1);
      await expect(root).toHaveAttribute('data-daemon-id', dashboard.daemonId);
      await expect(window.locator('[data-testid="dashboard-title"]')).toHaveCount(1);
      await expect(window.locator('[data-testid="server-status"]')).toHaveCount(1);
      await expect(window.locator('[data-testid="health-status"]')).toHaveCount(1);
      await expect(window.locator('[data-testid="btn-tools-list"]')).toHaveCount(1);
      await expect(window.locator('[data-testid="btn-tools-call"]')).toHaveCount(1);
      await expect(window.locator('[data-testid="tool-receipt"]')).toHaveCount(1);
      await expect(window.locator('[data-testid="discovered-tools"]')).toHaveCount(1);

      const toolsListStatus = await clickAndReadReceipt('btn-tools-list', 'tool-receipt');
      const discoveredEl = window.locator('[data-testid="discovered-tools"]');
      const discoveredAttr = await discoveredEl.getAttribute('data-tool-count');
      const discoveredCount = discoveredAttr ? parseInt(discoveredAttr, 10) : 0;
      const discoveredTools = await window
        .locator('[data-testid="mcp-tool"]')
        .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-tool-name') || ''));

      const toolsCallStatus = await clickAndReadReceipt('btn-tools-call', 'tool-receipt');

      coverage.push({
        daemonId: dashboard.daemonId,
        displayName: dashboard.displayName,
        view: dashboard.view,
        declaredTools: dashboard.declaredTools,
        surfaceHooksPresent: true,
        toolsListReceiptStatus: toolsListStatus,
        toolsCallReceiptStatus: toolsCallStatus,
        discoveredToolCount: discoveredCount,
        discoveredTools,
        notes: [
          `${dashboard.declaredTools.length} tools declared in menu_config.js`,
          toolsListStatus === 'fail_closed'
            ? 'tools/list fail-closed (daemon offline) — mediation verified'
            : `tools/list status: ${toolsListStatus}`
        ]
      });

      // A receipt must always be produced (ok or fail_closed), proving the
      // mediated tool surface is wired end-to-end.
      expect(toolsListStatus, 'tools/list produced no receipt').toBeTruthy();
      expect(toolsCallStatus, 'tools/call produced no receipt').toBeTruthy();
    });
  }

  test('daemon manager exposes control hooks', async () => {
    const absFile = path.join(VIEWS_DIR, 'daemon_manager.html');
    await navigateToFile(absFile);
    await window.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
    await window.waitForTimeout(800);

    await expect(window.locator('[data-testid="daemon-manager"]')).toHaveCount(1);
    await expect(window.locator('[data-testid="btn-start-all"]')).toHaveCount(1);
    await expect(window.locator('[data-testid="btn-stop-all"]')).toHaveCount(1);
    await expect(window.locator('[data-testid="btn-refresh-status"]')).toHaveCount(1);
    await expect(window.locator('[data-testid="daemon-grid"]')).toHaveCount(1);

    // The initialization timestamp must be rendered (regression for the previously
    // unevaluated `${new Date().toLocaleTimeString()}` template literal).
    const initialTime = await window.locator('#initialEventTime').textContent();
    expect(initialTime?.trim()).toBeTruthy();
    expect(initialTime).not.toContain('${');
  });
});
