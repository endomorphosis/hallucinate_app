import playwrightTest from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { test, expect, _electron: electron } = playwrightTest as unknown as typeof import('@playwright/test');

const hasElectronDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const a11yDescribe = hasElectronDisplay ? test.describe : test.describe.skip;

const APP_ROOT = path.join(__dirname, '..', '..');
const VIEWS_DIR = path.join(APP_ROOT, 'hallucinate_app', 'node', 'views');

// Every navigable view. Kept in sync with feature-screenshot-survey.spec.ts.
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

// Regression guard: total icon-only/unnamed buttons currently known across all
// views (2 dynamically-generated busy-state buttons in the pyarrow dashboard).
// Any NEW unnamed button pushes this over the threshold and fails the gate.
const MAX_BUTTONS_MISSING_NAME_TOTAL = 2;

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

async function collectA11y(page: Page) {
  return page.evaluate(() => {
    const inputHasLabel = (input: HTMLInputElement) => {
      const type = (input.getAttribute('type') || 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return true;
      if (input.getAttribute('aria-label')?.trim()) return true;
      if (input.getAttribute('aria-labelledby')?.trim()) return true;
      if (input.getAttribute('placeholder')?.trim()) return true;
      const id = input.getAttribute('id');
      if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return true;
      if (input.closest('label')) return true;
      return false;
    };
    const buttonHasName = (el: Element) => {
      if (el.getAttribute('aria-label')?.trim()) return true;
      if ((el as HTMLElement).innerText && (el as HTMLElement).innerText.trim()) return true;
      if (el.getAttribute('title')?.trim()) return true;
      return false;
    };
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    const inputs = Array.from(document.querySelectorAll('input'));
    return {
      hasMainLandmark: Boolean(document.querySelector('main, [role="main"]')),
      h1Count: document.querySelectorAll('h1').length,
      hasLangAttr: Boolean(document.documentElement.getAttribute('lang')),
      inputsMissingLabel: inputs.filter((i) => !inputHasLabel(i as HTMLInputElement)).length,
      buttonsMissingAccessibleName: buttons.filter((b) => !buttonHasName(b)).length
    };
  });
}

let electronApp: ElectronApplication;
let window: Page;
let totalButtonsMissingName = 0;

a11yDescribe('Accessibility Audit', () => {
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

  for (const view of VIEW_FILES) {
    test(`a11y — ${view}`, async () => {
      const absFile = path.join(VIEWS_DIR, view);
      expect(fs.existsSync(absFile), `missing view ${view}`).toBe(true);

      await navigateToFile(absFile);
      await window.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
      await window.waitForTimeout(1000);

      const a11y = await collectA11y(window);
      totalButtonsMissingName += a11y.buttonsMissingAccessibleName;

      // Landmark + heading + lang invariants must hold for every view.
      expect(a11y.hasMainLandmark, `${view} has no <main>/role=main landmark`).toBe(true);
      expect(a11y.h1Count, `${view} has no <h1>`).toBeGreaterThanOrEqual(1);
      expect(a11y.hasLangAttr, `${view} <html> missing lang attribute`).toBe(true);
      expect(a11y.inputsMissingLabel, `${view} has unlabeled inputs`).toBe(0);
    });
  }

  test('no new unnamed buttons across all views', async () => {
    expect(
      totalButtonsMissingName,
      `Found ${totalButtonsMissingName} icon-only buttons without an accessible name (allowed: ${MAX_BUTTONS_MISSING_NAME_TOTAL}). Add aria-label/title to new icon-only buttons.`
    ).toBeLessThanOrEqual(MAX_BUTTONS_MISSING_NAME_TOTAL);
  });
});
