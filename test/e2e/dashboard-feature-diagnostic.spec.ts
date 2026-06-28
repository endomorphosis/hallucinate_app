import playwrightTest from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { test, expect, _electron: electron } = playwrightTest as unknown as typeof import('@playwright/test');

const hasElectronDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const diagDescribe = hasElectronDisplay ? test.describe : test.describe.skip;

const APP_ROOT = path.join(__dirname, '..', '..');
const VIEWS_DIR = path.join(APP_ROOT, 'hallucinate_app', 'node', 'views');
const OUTPUT_DIR = path.join(APP_ROOT, 'test-results', 'dashboard-diagnostic');

const VIEW_FILES = [
  'dashboard.html',
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

interface ButtonProbe {
  label: string;
  selector: string;
  clicked: boolean;
  errorAfterClick?: string;
}

interface DashboardDiagnostic {
  view: string;
  loaded: boolean;
  pageErrors: string[];
  failedRequests: { url: string; failure: string }[];
  consoleErrors: string[];
  bridgeAvailable: boolean;
  buttonCount: number;
  buttonsProbed: ButtonProbe[];
}

let electronApp: ElectronApplication;
let window: Page;
const diagnostics: DashboardDiagnostic[] = [];

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

diagDescribe('Dashboard Feature Diagnostic', () => {
  test.beforeAll(async () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(APP_ROOT, 'index.js')],
      env: electronLaunchEnv()
    });
    window = await electronApp.firstWindow({ timeout: 60000 });
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(1200);
  });

  test.afterAll(async () => {
    const report = {
      generatedAt: new Date().toISOString(),
      app: 'hallucinate_app',
      note: 'Daemons are NOT started; this captures front-end defects (uncaught exceptions, failed requests, broken handlers) independent of backend availability.',
      dashboards: diagnostics
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'diagnostic.json'), JSON.stringify(report, null, 2));
    await electronApp?.close();
    electronApp = undefined as any;
  });

  for (const view of VIEW_FILES) {
    test(`diagnose ${view}`, async () => {
      const absFile = path.join(VIEWS_DIR, view);
      const diag: DashboardDiagnostic = {
        view,
        loaded: false,
        pageErrors: [],
        failedRequests: [],
        consoleErrors: [],
        bridgeAvailable: false,
        buttonCount: 0,
        buttonsProbed: []
      };

      const onPageError = (err: Error) => diag.pageErrors.push((err.message || String(err)).slice(0, 300));
      const onConsole = (msg: any) => {
        if (msg.type() === 'error') diag.consoleErrors.push(msg.text().slice(0, 300));
      };
      const onRequestFailed = (req: any) => {
        diag.failedRequests.push({
          url: req.url().slice(0, 200),
          failure: req.failure()?.errorText || 'unknown'
        });
      };
      window.on('pageerror', onPageError);
      window.on('console', onConsole);
      window.on('requestfailed', onRequestFailed);

      try {
        await navigateToFile(absFile);
        await window.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
        await window.waitForTimeout(1500);
        diag.loaded = true;

        diag.bridgeAvailable = await window.evaluate(() => Boolean((window as any).electronAPI));

        // Enumerate clickable buttons with a stable selector.
        const buttons = await window.evaluate(() => {
          const out: { label: string; selector: string }[] = [];
          const els = Array.from(document.querySelectorAll('button'));
          els.forEach((b, i) => {
            const testid = b.getAttribute('data-testid');
            const id = b.getAttribute('id');
            const selector = testid ? `[data-testid="${testid}"]` : id ? `#${id}` : `button:nth-of-type(${i + 1})`;
            const label = (b.textContent || b.getAttribute('aria-label') || selector).replace(/\s+/g, ' ').trim().slice(0, 40);
            out.push({ label, selector });
          });
          return out;
        });
        diag.buttonCount = buttons.length;

        // Probe a bounded subset of buttons that are safe to click (skip nav/home
        // and destructive-sounding controls) and record any exception triggered.
        const skip = /home|quit|delete|remove|stop|reset|clear|shutdown|destroy/i;
        for (const btn of buttons.slice(0, 12)) {
          if (skip.test(btn.label)) continue;
          const before = diag.pageErrors.length;
          let clicked = false;
          try {
            const loc = window.locator(btn.selector).first();
            if (await loc.count() && await loc.isVisible() && await loc.isEnabled()) {
              await loc.click({ timeout: 1500, trial: false });
              clicked = true;
              await window.waitForTimeout(250);
            }
          } catch (err: any) {
            diag.buttonsProbed.push({
              label: btn.label,
              selector: btn.selector,
              clicked: false,
              errorAfterClick: (err?.message || String(err)).slice(0, 160)
            });
            continue;
          }
          const probe: ButtonProbe = { label: btn.label, selector: btn.selector, clicked };
          if (diag.pageErrors.length > before) {
            probe.errorAfterClick = diag.pageErrors[diag.pageErrors.length - 1];
          }
          diag.buttonsProbed.push(probe);
        }
      } finally {
        window.off('pageerror', onPageError);
        window.off('console', onConsole);
        window.off('requestfailed', onRequestFailed);
        diagnostics.push(diag);
      }

      // Diagnostic test: a healthy front-end should throw no uncaught exceptions
      // and expose the IPC bridge. (Recorded even if this assertion fails.)
      expect(diag.bridgeAvailable, `${view}: electronAPI bridge missing`).toBe(true);
    });
  }
});
