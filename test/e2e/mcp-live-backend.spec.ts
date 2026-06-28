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
const liveDescribe = hasElectronDisplay ? test.describe : test.describe.skip;

const APP_ROOT = path.join(__dirname, '..', '..');
const OUTPUT_DIR = path.join(APP_ROOT, 'test-results', 'mcp-live-backend');

// Opt-in: starting real Python MCP daemons is slow and environment-dependent.
// Run with MCP_LIVE_BACKEND=1 to exercise live backends.
const LIVE_ENABLED = process.env.MCP_LIVE_BACKEND === '1';
const maybe = LIVE_ENABLED ? test : test.skip;

const DASHBOARD_DAEMONS = mcpServers
  .filter((s: any) => s.dashboardPath)
  .map((s: any) => ({ daemonId: s.id, displayName: s.displayName }));

function electronLaunchEnv(extra: Record<string, string> = {}) {
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
  return {
    ...env,
    NODE_ENV: 'test',
    ELECTRON_ENABLE_LOGGING: '1',
    AUTO_START_DAEMONS: 'true',
    ...extra
  };
}

interface LiveResult {
  daemonId: string;
  displayName: string;
  becameHealthy: boolean;
  toolsList: { live: boolean; ok: boolean; status?: number; toolCount: number; error?: string };
  toolsCall: { live: boolean; ok: boolean; status?: number; error?: string };
}

let electronApp: ElectronApplication;
let window: Page;
const results: LiveResult[] = [];

async function waitForHealthy(daemonId: string, attempts = 20, delayMs = 1500): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    const healthy = await window.evaluate(async (id) => {
      try {
        const h = await (window as any).electronAPI?.daemon?.checkHealth?.(id);
        return Boolean(h?.healthy);
      } catch {
        return false;
      }
    }, daemonId);
    if (healthy) return true;
    await window.waitForTimeout(delayMs);
  }
  return false;
}

function extractToolCount(response: any): number {
  if (!response) return 0;
  const candidates = [
    response?.result?.tools,
    response?.tools,
    response?.result,
    response?.datasets,
    response?.models
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c.length;
  }
  return 0;
}

liveDescribe('MCP Live Backend Verification', () => {
  test.beforeAll(async () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(APP_ROOT, 'index.js')],
      env: electronLaunchEnv()
    });
    window = await electronApp.firstWindow({ timeout: 60000 });
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(1500);

    if (LIVE_ENABLED) {
      // Ask the app to start all managed MCP daemons.
      await window.evaluate(async () => {
        try { await (window as any).electronAPI?.daemon?.startAll?.(); } catch { /* ignore */ }
      });
    }
  });

  test.afterAll(async () => {
    if (LIVE_ENABLED) {
      const report = {
        generatedAt: new Date().toISOString(),
        app: 'hallucinate_app',
        liveResults: results
      };
      fs.writeFileSync(path.join(OUTPUT_DIR, 'live-backend.json'), JSON.stringify(report, null, 2));
      // Best-effort stop with a hard timeout so a hung daemon cannot stall worker teardown.
      await Promise.race([
        window.evaluate(async () => {
          try { await (window as any).electronAPI?.daemon?.stopAll?.(); } catch { /* ignore */ }
        }),
        new Promise((resolve) => setTimeout(resolve, 5000))
      ]).catch(() => undefined);
    }
    await Promise.race([
      electronApp?.close(),
      new Promise((resolve) => setTimeout(resolve, 8000))
    ]).catch(() => undefined);
    electronApp = undefined as any;
  });

  for (const dashboard of DASHBOARD_DAEMONS) {
    maybe(`live tools — ${dashboard.daemonId}`, async () => {
      const becameHealthy = await waitForHealthy(dashboard.daemonId);

      const listReceipt = await window.evaluate(async (id) => {
        return (window as any).electronAPI?.daemon?.dashboardToolsList?.(id);
      }, dashboard.daemonId);

      const callReceipt = await window.evaluate(async (id) => {
        return (window as any).electronAPI?.daemon?.dashboardToolsCall?.(id);
      }, dashboard.daemonId);

      const result: LiveResult = {
        daemonId: dashboard.daemonId,
        displayName: dashboard.displayName,
        becameHealthy,
        toolsList: {
          live: Boolean(listReceipt?.response?.live ?? listReceipt?.live),
          ok: listReceipt?.status === 'ok' || listReceipt?.response?.ok === true,
          status: listReceipt?.response?.status_code,
          toolCount: extractToolCount(listReceipt?.response?.response ?? listReceipt?.response),
          error: listReceipt?.response?.error || listReceipt?.error
        },
        toolsCall: {
          live: Boolean(callReceipt?.response?.live ?? callReceipt?.live),
          ok: callReceipt?.status === 'ok' || callReceipt?.response?.ok === true,
          status: callReceipt?.response?.status_code,
          error: callReceipt?.response?.error || callReceipt?.error
        }
      };
      results.push(result);

      // Primary live-backend assertions: the daemon must become healthy and the
      // tools/list call must reach the real backend and return working results.
      expect(becameHealthy, `${dashboard.daemonId} never became healthy`).toBe(true);
      expect(result.toolsList.ok, `${dashboard.daemonId} tools/list did not return a working live result`).toBe(true);
      expect(result.toolsCall.ok, `${dashboard.daemonId} safe tools/call did not return a working live result`).toBe(true);
    });
  }
});
