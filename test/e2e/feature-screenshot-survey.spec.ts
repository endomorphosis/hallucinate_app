import playwrightTest from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { test, expect, _electron: electron } = playwrightTest as unknown as typeof import('@playwright/test');

// Electron needs a display server. Skip gracefully when none is available
// (e.g. headless CI without xvfb) to mirror the rest of the e2e suite.
const hasElectronDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const surveyDescribe = hasElectronDisplay ? test.describe : test.describe.skip;

const APP_ROOT = path.join(__dirname, '..', '..');
const VIEWS_DIR = path.join(APP_ROOT, 'hallucinate_app', 'node', 'views');
const OUTPUT_DIR = path.join(APP_ROOT, 'test-results', 'ui-survey');
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');

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

/**
 * Every navigable HTML "section" of the desktop app. The id is used for the
 * screenshot filename and as the key in the generated survey report.
 */
interface SectionDef {
  id: string;
  title: string;
  file: string;
  category: string;
  description: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'dashboard', title: 'Main Dashboard', file: 'dashboard.html', category: 'Core', description: 'Primary application dashboard and module navigation.' },
  { id: 'settings', title: 'Settings', file: 'settings.html', category: 'Core', description: 'Application configuration and preferences.' },
  { id: 'model-tester', title: 'Model Tester', file: 'model_tester.html', category: 'Testing & Benchmarks', description: 'AI model testing interface.' },
  { id: 'test-interface', title: 'Test Interface', file: 'test_interface.html', category: 'Testing & Benchmarks', description: 'Module testing interface.' },
  { id: 'benchmark-dashboard', title: 'Benchmark Dashboard', file: 'benchmark_dashboard.html', category: 'Testing & Benchmarks', description: 'Performance benchmarking dashboard.' },
  { id: 'ipfs-kit-dashboard', title: 'IPFS Kit Dashboard', file: 'ipfs_kit_dashboard.html', category: 'MCP Servers', description: 'IPFS Kit MCP server dashboard and tools.' },
  { id: 'ipfs-datasets-dashboard', title: 'IPFS Datasets Dashboard', file: 'ipfs_datasets_dashboard.html', category: 'MCP Servers', description: 'IPFS Datasets MCP server dashboard and tools.' },
  { id: 'ipfs-accelerate-dashboard', title: 'IPFS Accelerate Dashboard', file: 'ipfs_accelerate_dashboard.html', category: 'MCP Servers', description: 'IPFS Accelerate MCP server dashboard and tools.' },
  { id: 'daemon-manager', title: 'Daemon Manager', file: 'daemon_manager.html', category: 'System Management', description: 'Visual MCP server / daemon lifecycle management.' },
  { id: 'usage-dashboard', title: 'Usage Dashboard', file: 'usage_dashboard.html', category: 'System Management', description: 'Resource usage and consumption monitoring.' },
  { id: 'auth-dashboard', title: 'Auth Dashboard', file: 'auth_dashboard.html', category: 'Security & Auth', description: 'Authentication and identity management.' },
  { id: 'security-test-dashboard', title: 'Security Test Dashboard', file: 'security_test_dashboard.html', category: 'Security & Auth', description: 'Security testing and validation interface.' },
  { id: 'database-backup-dashboard', title: 'Database Backup Dashboard', file: 'database_backup_dashboard.html', category: 'Database & Storage', description: 'Database backup and restore management.' },
  { id: 'pyarrow-content-index', title: 'PyArrow Content Index', file: 'pyarrow_content_index_dashboard.html', category: 'Database & Storage', description: 'PyArrow-backed content index browser.' }
];

/**
 * Heuristics collected in-page for each section. These feed the UI/UX
 * improvement plan generated after the run.
 */
interface SectionMetrics {
  documentTitle: string;
  url: string;
  headings: { level: string; text: string }[];
  counts: {
    buttons: number;
    links: number;
    inputs: number;
    selects: number;
    textareas: number;
    forms: number;
    images: number;
    tables: number;
    iframes: number;
    canvases: number;
  };
  accessibility: {
    imagesMissingAlt: number;
    inputsMissingLabel: number;
    buttonsMissingAccessibleName: number;
    elementsWithAriaLabel: number;
    elementsWithRole: number;
    hasLangAttr: boolean;
    hasViewportMeta: boolean;
    hasMainLandmark: boolean;
    hasNavLandmark: boolean;
    hasH1: boolean;
    h1Count: number;
  };
  hooks: {
    testIds: number;
    idAttributes: number;
  };
  interactivity: {
    disabledControls: number;
    onclickInlineHandlers: number;
  };
  resources: {
    externalStylesheets: string[];
    externalScripts: string[];
    cdnReferences: string[];
  };
  consoleErrors: string[];
  visualSignals: {
    bodyBackground: string;
    usesDarkTheme: boolean;
    documentScrollHeight: number;
    documentScrollWidth: number;
    hasHorizontalOverflow: boolean;
  };
}

interface SectionResult extends SectionDef {
  fileExists: boolean;
  screenshot: string;
  metrics?: SectionMetrics;
  error?: string;
}

let electronApp: ElectronApplication;
let window: Page;

const SURVEY_PATH = path.join(OUTPUT_DIR, 'survey.json');

/**
 * Persist a single section result to disk immediately, merging by id. This keeps
 * the survey complete even if the Electron process crashes on a particular view
 * and Playwright restarts the worker (which would otherwise reset in-memory state).
 */
function persistResult(result: SectionResult) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let report: any = { sections: [] };
  if (fs.existsSync(SURVEY_PATH)) {
    try {
      report = JSON.parse(fs.readFileSync(SURVEY_PATH, 'utf-8'));
    } catch {
      report = { sections: [] };
    }
  }
  const sections: SectionResult[] = Array.isArray(report.sections) ? report.sections : [];
  const idx = sections.findIndex((s) => s.id === result.id);
  if (idx >= 0) {
    sections[idx] = result;
  } else {
    sections.push(result);
  }
  // Preserve the declared section order.
  sections.sort((a, b) => SECTIONS.findIndex((s) => s.id === a.id) - SECTIONS.findIndex((s) => s.id === b.id));
  report = {
    generatedAt: new Date().toISOString(),
    app: 'hallucinate_app',
    viewport: window ? window.viewportSize() : null,
    sectionCount: sections.length,
    sections
  };
  fs.writeFileSync(SURVEY_PATH, JSON.stringify(report, null, 2));
}

async function launchApp() {
  electronApp = await electron.launch({
    args: ['--no-sandbox', path.join(APP_ROOT, 'index.js')],
    env: electronLaunchEnv()
  });
  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(1500);
}

/**
 * Some dashboards can crash the Electron process on load. Relaunch the app if
 * the previous test left it in a dead state so later sections still get captured.
 */
async function ensureAppAlive() {
  const alive = await electronApp
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length > 0)
    .catch(() => false);
  if (!alive) {
    await electronApp?.close().catch(() => undefined);
    await launchApp();
  }
}

async function navigateToFile(target: string) {
  // A few dashboards fire blocking on-load requests to their (possibly offline)
  // MCP server, so loadFile() may never reach 'did-finish-load'. Race it against
  // a stop+timeout so we can still screenshot the rendered DOM.
  await electronApp.evaluate(async ({ BrowserWindow }, filePath) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      throw new Error('No BrowserWindow available');
    }
    const load = win.loadFile(filePath).catch(() => undefined);
    const guard = new Promise<void>((resolve) => {
      setTimeout(() => {
        try {
          win.webContents.stop();
        } catch {
          /* ignore */
        }
        resolve();
      }, 6000);
    });
    await Promise.race([load, guard]);
  }, target);
}

async function collectMetrics(page: Page): Promise<SectionMetrics> {
  return page.evaluate(() => {
    const text = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .slice(0, 40)
      .map((h) => ({ level: h.tagName.toLowerCase(), text: text(h).slice(0, 120) }))
      .filter((h) => h.text.length > 0);

    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    const links = Array.from(document.querySelectorAll('a'));
    const inputs = Array.from(document.querySelectorAll('input'));
    const images = Array.from(document.querySelectorAll('img'));

    const accessibleName = (el: Element) => {
      const aria = el.getAttribute('aria-label');
      if (aria && aria.trim()) return true;
      if ((el as HTMLElement).innerText && (el as HTMLElement).innerText.trim()) return true;
      const title = el.getAttribute('title');
      if (title && title.trim()) return true;
      return false;
    };

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

    const externalStylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((l) => l.getAttribute('href') || '')
      .filter(Boolean);
    const externalScripts = Array.from(document.querySelectorAll('script[src]'))
      .map((s) => s.getAttribute('src') || '')
      .filter(Boolean);
    const cdnReferences = [...externalStylesheets, ...externalScripts].filter((u) =>
      /^https?:\/\//i.test(u)
    );

    const bodyStyle = getComputedStyle(document.body);
    const bg = bodyStyle.backgroundColor || '';
    const parseRgb = (value: string) => {
      const m = value.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
      return parts.length >= 3 ? { r: parts[0], g: parts[1], b: parts[2] } : null;
    };
    const rgb = parseRgb(bg);
    const luminance = rgb ? (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 : 1;

    return {
      documentTitle: document.title || '',
      url: location.href,
      headings,
      counts: {
        buttons: buttons.length,
        links: links.length,
        inputs: inputs.length,
        selects: document.querySelectorAll('select').length,
        textareas: document.querySelectorAll('textarea').length,
        forms: document.querySelectorAll('form').length,
        images: images.length,
        tables: document.querySelectorAll('table').length,
        iframes: document.querySelectorAll('iframe').length,
        canvases: document.querySelectorAll('canvas').length
      },
      accessibility: {
        imagesMissingAlt: images.filter((img) => !img.getAttribute('alt')?.trim()).length,
        inputsMissingLabel: inputs.filter((input) => !inputHasLabel(input as HTMLInputElement)).length,
        buttonsMissingAccessibleName: buttons.filter((b) => !accessibleName(b)).length,
        elementsWithAriaLabel: document.querySelectorAll('[aria-label]').length,
        elementsWithRole: document.querySelectorAll('[role]').length,
        hasLangAttr: Boolean(document.documentElement.getAttribute('lang')),
        hasViewportMeta: Boolean(document.querySelector('meta[name="viewport"]')),
        hasMainLandmark: Boolean(document.querySelector('main, [role="main"]')),
        hasNavLandmark: Boolean(document.querySelector('nav, [role="navigation"]')),
        hasH1: document.querySelectorAll('h1').length > 0,
        h1Count: document.querySelectorAll('h1').length
      },
      hooks: {
        testIds: document.querySelectorAll('[data-testid], [data-test-id], [data-test]').length,
        idAttributes: document.querySelectorAll('[id]').length
      },
      interactivity: {
        disabledControls: document.querySelectorAll('[disabled]').length,
        onclickInlineHandlers: document.querySelectorAll('[onclick]').length
      },
      resources: {
        externalStylesheets,
        externalScripts,
        cdnReferences
      },
      consoleErrors: [],
      visualSignals: {
        bodyBackground: bg,
        usesDarkTheme: luminance < 0.5,
        documentScrollHeight: document.documentElement.scrollHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 4
      }
    };
  });
}

surveyDescribe('Feature Screenshot Survey', () => {
  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    // Start each run from a clean survey so stale sections are not retained.
    if (fs.existsSync(SURVEY_PATH)) {
      fs.rmSync(SURVEY_PATH);
    }
    await launchApp();
  });

  test.afterAll(async () => {
    await electronApp?.close();
    electronApp = undefined as any;
  });

  for (const section of SECTIONS) {
    test(`capture ${section.id} (${section.title})`, async () => {
      const absFile = path.join(VIEWS_DIR, section.file);
      const fileExists = fs.existsSync(absFile);
      const screenshotRel = path.join('screenshots', `${section.id}.png`);
      const result: SectionResult = {
        ...section,
        fileExists,
        screenshot: screenshotRel
      };

      if (!fileExists) {
        result.error = `View file not found: ${section.file}`;
        persistResult(result);
        // Still assert so a missing view is surfaced, but don't abort the run.
        expect(fileExists, result.error).toBe(true);
        return;
      }

      // Capture with one retry: a few dashboards can intermittently crash the
      // Electron process on first load, so relaunch and try again before failing.
      let lastError: any;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        await ensureAppAlive();

        const consoleErrors: string[] = [];
        const onConsole = (msg: any) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
        };
        window.on('console', onConsole);

        try {
          await navigateToFile(absFile);
          await window.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
          // Allow dynamic dashboards to render their first paint of data.
          await window.waitForTimeout(1200);

          await window.screenshot({
            path: path.join(OUTPUT_DIR, screenshotRel),
            fullPage: true
          });

          const metrics = await collectMetrics(window);
          metrics.consoleErrors = consoleErrors.slice(0, 20);
          result.metrics = metrics;
          result.error = undefined;
          lastError = undefined;
          break;
        } catch (err: any) {
          lastError = err;
          result.error = err?.message || String(err);
        } finally {
          window.off('console', onConsole);
        }
      }

      persistResult(result);
      if (lastError) {
        throw lastError;
      }
      expect(result.metrics?.documentTitle || result.metrics?.headings.length).toBeTruthy();
    });
  }
});
