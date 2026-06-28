import playwrightTest from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { test, expect, _electron: electron } = playwrightTest as unknown as typeof import('@playwright/test');

const hasElectronDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const navDescribe = hasElectronDisplay ? test.describe : test.describe.skip;

const APP_ROOT = path.join(__dirname, '..', '..');
const VIEWS_DIR = path.join(APP_ROOT, 'hallucinate_app', 'node', 'views');

// Sub-dashboards that should expose the persistent "Home" escape hatch.
// The main dashboard (dashboard.html) is intentionally excluded.
const SUB_VIEWS = [
  'settings.html',
  'model_tester.html',
  'test_interface.html',
  'benchmark_dashboard.html',
  'ipfs_kit_dashboard.html',
  'ipfs_datasets_dashboard.html',
  'ipfs_accelerate_dashboard.html',
  'daemon_manager.html',
  'usage_dashboard.html',
  'auth_dashboard.html',
  'security_test_dashboard.html',
  'database_backup_dashboard.html',
  'pyarrow_content_index_dashboard.html'
];

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

async function currentViewFile(): Promise<string> {
  const url: string = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win ? win.webContents.getURL() : '';
  });
  return path.basename(new URL(url).pathname);
}

let electronApp: ElectronApplication;
let window: Page;

navDescribe('Navigation Shell', () => {
  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(APP_ROOT, 'index.js')],
      env: electronLaunchEnv()
    });
    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(1200);
  });

  test.afterAll(async () => {
    await electronApp?.close();
    electronApp = undefined as any;
  });

  for (const view of SUB_VIEWS) {
    test(`home affordance present — ${view}`, async () => {
      const absFile = path.join(VIEWS_DIR, view);
      expect(fs.existsSync(absFile), `missing view ${view}`).toBe(true);

      await navigateToFile(absFile);
      await window.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
      await window.waitForTimeout(600);

      const home = window.locator('[data-testid="nav-home"]');
      await expect(home).toHaveCount(1);
      await expect(home).toBeVisible();
      // Must carry an accessible name.
      await expect(home).toHaveAttribute('aria-label', /dashboard/i);
    });
  }

  test('clicking Home navigates back to the main dashboard', async () => {
    // Start on a representative sub-dashboard.
    await navigateToFile(path.join(VIEWS_DIR, 'ipfs_kit_dashboard.html'));
    await window.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
    await window.waitForTimeout(600);
    expect(await currentViewFile()).toBe('ipfs_kit_dashboard.html');

    await window.locator('[data-testid="nav-home"]').click();

    // The main process navigates the window to dashboard.html via IPC.
    await expect.poll(async () => currentViewFile(), { timeout: 8000 }).toBe('dashboard.html');
  });
});
