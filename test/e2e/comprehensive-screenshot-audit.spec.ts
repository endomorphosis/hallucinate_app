import playwrightTest from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { test, expect, _electron: electron } = playwrightTest as unknown as typeof import('@playwright/test');
const hasElectronDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const electronDescribe = hasElectronDisplay ? test.describe : test.describe.skip;

const SCREENSHOT_DIR = 'test-results/screenshots/comprehensive-audit';
const AUDIT_REPORT_PATH = 'test-results/screenshots/comprehensive-audit/audit-report.json';

function electronLaunchEnv(extra: Record<string, string> = {}) {
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
  return {
    ...env,
    ...extra,
  };
}

interface ScreenshotEntry {
  name: string;
  file: string;
  section: string;
  description: string;
  timestamp: string;
  dimensions: { width: number; height: number };
  elements_found: Record<string, number>;
  issues: string[];
}

interface AuditReport {
  generated_at: string;
  platform: string;
  node_version: string;
  total_screenshots: number;
  sections: Record<string, ScreenshotEntry[]>;
  summary: {
    total_issues: number;
    missing_features: string[];
    ui_gaps: string[];
    mcp_coverage: Record<string, boolean>;
  };
}

/**
 * Comprehensive Screenshot Audit for Hallucinate App
 *
 * This test suite captures every dashboard, panel, and interactive surface
 * in the hallucinate_app Electron application. The screenshots are used to:
 *
 * 1. Document the current state of all UI surfaces
 * 2. Identify gaps in MCP tool exposure
 * 3. Generate a UI/UX improvement plan
 * 4. Validate that all IPFS backend features are accessible
 *
 * Sections captured:
 * - Main window and daemon manager
 * - IPFS Kit Dashboard (storage operations)
 * - IPFS Datasets Dashboard (dataset management)
 * - IPFS Accelerate Dashboard (ML inference)
 * - Settings and configuration
 * - Auth dashboard
 * - Security and benchmark panels
 * - MCP tool invocation surfaces
 */

let electronApp: ElectronApplication;
let window: Page;
const auditEntries: ScreenshotEntry[] = [];

async function captureScreenshot(
  page: Page,
  name: string,
  section: string,
  description: string,
): Promise<ScreenshotEntry> {
  const filePath = path.join(SCREENSHOT_DIR, `${section}--${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });

  const viewport = page.viewportSize() || { width: 0, height: 0 };

  const entry: ScreenshotEntry = {
    name,
    file: filePath,
    section,
    description,
    timestamp: new Date().toISOString(),
    dimensions: viewport,
    elements_found: {},
    issues: [],
  };

  auditEntries.push(entry);
  return entry;
}

async function countElements(page: Page, selectors: Record<string, string>): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [label, selector] of Object.entries(selectors)) {
    try {
      counts[label] = await page.locator(selector).count();
    } catch {
      counts[label] = 0;
    }
  }
  return counts;
}

async function navigateToDashboard(page: Page, dashboardPath: string): Promise<void> {
  // Use Electron's loadFile or navigate via IPC
  try {
    await page.evaluate((viewPath) => {
      const baseDir = (window as any).__hallucinate_app_base || '';
      window.location.href = `file://${baseDir}/hallucinate_app/node/views/${viewPath}`;
    }, dashboardPath);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);
  } catch {
    // Fallback: try direct file navigation
    const viewsDir = path.join(__dirname, '..', '..', 'hallucinate_app', 'node', 'views');
    const fullPath = path.join(viewsDir, dashboardPath);
    try {
      await page.goto(`file://${fullPath}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
    } catch {
      // If navigation fails, record it as an issue
    }
  }
}

electronDescribe('Comprehensive Screenshot Audit', () => {

  test.beforeAll(async () => {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(__dirname, '..', '..', 'index.js')],
      env: electronLaunchEnv({
        NODE_ENV: 'test',
        ELECTRON_ENABLE_LOGGING: '1',
        AUTO_START_DAEMONS: 'false',
        HALLUCINATE_APP_MANAGED: 'true',
      }),
    });

    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(1500);
  });

  test.afterAll(async () => {
    // Generate audit report
    const report: AuditReport = {
      generated_at: new Date().toISOString(),
      platform: process.platform,
      node_version: process.version,
      total_screenshots: auditEntries.length,
      sections: {},
      summary: {
        total_issues: 0,
        missing_features: [],
        ui_gaps: [],
        mcp_coverage: {
          'ipfs_kit_tools_list': false,
          'ipfs_kit_tools_call': false,
          'ipfs_datasets_tools_list': false,
          'ipfs_datasets_tools_call': false,
          'ipfs_accelerate_tools_list': false,
          'ipfs_accelerate_tools_call': false,
          'daemon_health_monitoring': false,
          'mcp_invocation_receipts': false,
          'control_surface_mediation': false,
        },
      },
    };

    for (const entry of auditEntries) {
      if (!report.sections[entry.section]) {
        report.sections[entry.section] = [];
      }
      report.sections[entry.section].push(entry);
      report.summary.total_issues += entry.issues.length;
    }

    await fs.writeFile(AUDIT_REPORT_PATH, JSON.stringify(report, null, 2));
    await electronApp?.close();
  });

  // ─── Section 1: Main Window & Initial State ──────────────────────────

  test.describe('Section 1: Main Window', () => {

    test('01 - Initial window state', async () => {
      const entry = await captureScreenshot(
        window, 'initial-state', 'main-window',
        'The default landing page when the app first launches',
      );
      entry.elements_found = await countElements(window, {
        buttons: 'button',
        links: 'a',
        headings: 'h1, h2, h3',
        status_indicators: '.status, [data-status], .health-indicator',
        daemon_cards: '.daemon-card, .server-card, [data-daemon-id]',
      });

      if (entry.elements_found.daemon_cards === 0) {
        entry.issues.push('No daemon cards visible on initial load - users cannot see server status');
      }
    });

    test('02 - Window after resize (responsive check)', async () => {
      await window.setViewportSize({ width: 1024, height: 768 });
      await window.waitForTimeout(300);
      await captureScreenshot(
        window, 'responsive-1024x768', 'main-window',
        'App at 1024x768 to check responsive layout',
      );

      await window.setViewportSize({ width: 1440, height: 900 });
      await window.waitForTimeout(300);
      await captureScreenshot(
        window, 'responsive-1440x900', 'main-window',
        'App at 1440x900 (common laptop resolution)',
      );
    });
  });

  // ─── Section 2: Daemon Manager ────────────────────────────────────────

  test.describe('Section 2: Daemon Manager', () => {

    test('01 - Daemon manager view', async () => {
      await navigateToDashboard(window, 'daemon_manager.html');
      const entry = await captureScreenshot(
        window, 'daemon-manager-overview', 'daemon-manager',
        'MCP daemon manager showing all registered IPFS servers',
      );
      entry.elements_found = await countElements(window, {
        daemon_rows: '.daemon-row, tr[data-daemon], .server-entry',
        start_buttons: 'button[data-action="start"], .btn-start',
        stop_buttons: 'button[data-action="stop"], .btn-stop',
        health_badges: '.health-badge, .status-badge, [data-health]',
        port_displays: '.port, [data-port]',
      });

      if (entry.elements_found.health_badges === 0) {
        entry.issues.push('No health badges visible - daemon health status unclear to user');
      }
    });

    test('02 - Daemon control interactions', async () => {
      // Check if there's a "Start All" button
      const startAllBtn = window.locator('button:has-text("Start All"), button:has-text("start all"), [data-action="startAll"]');
      if (await startAllBtn.count() > 0) {
        await captureScreenshot(
          window, 'daemon-start-all-visible', 'daemon-manager',
          'Start All button is accessible for batch daemon control',
        );
      } else {
        const entry = await captureScreenshot(
          window, 'daemon-no-batch-control', 'daemon-manager',
          'Missing batch control buttons',
        );
        entry.issues.push('No "Start All" button found - users must start daemons individually');
      }
    });
  });

  // ─── Section 3: IPFS Kit Dashboard ────────────────────────────────────

  test.describe('Section 3: IPFS Kit Dashboard', () => {

    test('01 - IPFS Kit main view', async () => {
      await navigateToDashboard(window, 'ipfs_kit_dashboard.html');
      const entry = await captureScreenshot(
        window, 'ipfs-kit-main', 'ipfs-kit',
        'IPFS Kit storage console - content management, pin operations',
      );
      entry.elements_found = await countElements(window, {
        upload_inputs: 'input[type="file"], .upload-area, .drop-zone',
        cid_inputs: 'input[placeholder*="cid" i], input[placeholder*="CID"], input[name*="cid"]',
        pin_buttons: 'button:has-text("Pin"), button:has-text("pin"), [data-action="pin"]',
        add_buttons: 'button:has-text("Add"), button:has-text("Upload"), [data-action="add"]',
        cat_buttons: 'button:has-text("Get"), button:has-text("Cat"), button:has-text("Retrieve"), [data-action="cat"]',
        backend_status: '.backend-status, [data-backend], .ipfs-status',
        tool_panels: '.tool-panel, .mcp-tool, [data-tool]',
      });

      // Check MCP tool coverage
      if (entry.elements_found.add_buttons > 0) {
        // Report will mark ipfs_kit add accessible
      }
      if (entry.elements_found.pin_buttons === 0) {
        entry.issues.push('No pin button visible - ipfs_pin capability not exposed in UI');
      }
      if (entry.elements_found.cat_buttons === 0) {
        entry.issues.push('No content retrieval button - ipfs_cat capability not exposed in UI');
      }
      if (entry.elements_found.backend_status === 0) {
        entry.issues.push('No backend status indicator - users cannot verify IPFS daemon connectivity');
      }
    });

    test('02 - IPFS Kit tools list panel', async () => {
      // Look for a tools/list section
      const toolsSection = window.locator('[data-section="tools"], .tools-list, .mcp-tools');
      if (await toolsSection.count() > 0) {
        await toolsSection.first().scrollIntoViewIfNeeded();
        await captureScreenshot(
          window, 'ipfs-kit-tools-list', 'ipfs-kit',
          'MCP tools/list panel showing available IPFS Kit operations',
        );
      } else {
        const entry = await captureScreenshot(
          window, 'ipfs-kit-no-tools-list', 'ipfs-kit',
          'Missing tools/list panel',
        );
        entry.issues.push('No MCP tools/list panel visible - users cannot discover available Kit operations');
      }
    });

    test('03 - IPFS Kit scrolled content', async () => {
      await window.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await window.waitForTimeout(300);
      await captureScreenshot(
        window, 'ipfs-kit-bottom', 'ipfs-kit',
        'Bottom of IPFS Kit dashboard - additional tools and status',
      );
    });
  });

  // ─── Section 4: IPFS Datasets Dashboard ───────────────────────────────

  test.describe('Section 4: IPFS Datasets Dashboard', () => {

    test('01 - Datasets main view', async () => {
      await navigateToDashboard(window, 'ipfs_datasets_dashboard.html');
      const entry = await captureScreenshot(
        window, 'datasets-main', 'ipfs-datasets',
        'IPFS Datasets workbench - dataset browsing, indexing, embedding',
      );
      entry.elements_found = await countElements(window, {
        dataset_list: '.dataset-item, .dataset-row, [data-dataset]',
        search_inputs: 'input[type="search"], input[placeholder*="search" i], .search-bar',
        embed_buttons: 'button:has-text("Embed"), button:has-text("embed"), [data-action="embed"]',
        index_buttons: 'button:has-text("Index"), button:has-text("index"), [data-action="index"]',
        load_buttons: 'button:has-text("Load"), button:has-text("Browse"), [data-action="load"]',
        progress_bars: '.progress, progress, [role="progressbar"]',
        job_status: '.job-status, .task-status, [data-job]',
      });

      if (entry.elements_found.embed_buttons === 0) {
        entry.issues.push('No embed button - embedding capability not directly accessible');
      }
      if (entry.elements_found.search_inputs === 0) {
        entry.issues.push('No search input - dataset discovery requires manual browsing');
      }
    });

    test('02 - Datasets tools invocation', async () => {
      const toolsCallSection = window.locator('[data-section="tools-call"], .tools-call, .invoke-panel');
      if (await toolsCallSection.count() > 0) {
        await captureScreenshot(
          window, 'datasets-tools-call', 'ipfs-datasets',
          'MCP tools/call panel for invoking dataset operations',
        );
      } else {
        const entry = await captureScreenshot(
          window, 'datasets-no-tools-call', 'ipfs-datasets',
          'Missing tools/call invocation panel',
        );
        entry.issues.push('No MCP tools/call panel - cannot invoke dataset tools from dashboard');
      }
    });

    test('03 - Datasets bottom content', async () => {
      await window.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await window.waitForTimeout(300);
      await captureScreenshot(
        window, 'datasets-bottom', 'ipfs-datasets',
        'Bottom of Datasets dashboard - job status, background tasks',
      );
    });
  });

  // ─── Section 5: IPFS Accelerate Dashboard ─────────────────────────────

  test.describe('Section 5: IPFS Accelerate Dashboard', () => {

    test('01 - Accelerate main view', async () => {
      await navigateToDashboard(window, 'ipfs_accelerate_dashboard.html');
      const entry = await captureScreenshot(
        window, 'accelerate-main', 'ipfs-accelerate',
        'IPFS Accelerate console - hardware profile, model inference, telemetry',
      );
      entry.elements_found = await countElements(window, {
        model_selectors: 'select[name*="model"], .model-selector, [data-model]',
        inference_buttons: 'button:has-text("Run"), button:has-text("Infer"), button:has-text("Generate"), [data-action="infer"]',
        hardware_section: '.hardware-profile, .capabilities, [data-section="hardware"]',
        telemetry_displays: '.telemetry, .metrics, .gpu-stats, [data-telemetry]',
        prompt_inputs: 'textarea, input[placeholder*="prompt" i], .prompt-input',
        result_panels: '.result, .output, .inference-result, [data-result]',
      });

      if (entry.elements_found.hardware_section === 0) {
        entry.issues.push('No hardware profile section - users cannot see acceleration capabilities');
      }
      if (entry.elements_found.inference_buttons === 0) {
        entry.issues.push('No inference button - run_model capability not exposed');
      }
      if (entry.elements_found.prompt_inputs === 0) {
        entry.issues.push('No prompt/input area - cannot test text generation from dashboard');
      }
    });

    test('02 - Accelerate hardware capabilities', async () => {
      const hwSection = window.locator('.hardware-profile, [data-section="hardware"], .capabilities-panel');
      if (await hwSection.count() > 0) {
        await hwSection.first().scrollIntoViewIfNeeded();
        await captureScreenshot(
          window, 'accelerate-hardware', 'ipfs-accelerate',
          'Hardware capabilities panel showing WebNN/WebGPU/CUDA status',
        );
      } else {
        const entry = await captureScreenshot(
          window, 'accelerate-no-hardware-panel', 'ipfs-accelerate',
          'Missing hardware capabilities panel',
        );
        entry.issues.push('No hardware capabilities panel - get_capabilities() not surfaced');
      }
    });

    test('03 - Accelerate model tester', async () => {
      await navigateToDashboard(window, 'model_tester.html');
      const entry = await captureScreenshot(
        window, 'model-tester', 'ipfs-accelerate',
        'Model tester interface for running inference jobs',
      );
      entry.elements_found = await countElements(window, {
        model_inputs: 'input[name*="model"], select[name*="model"], .model-picker',
        run_buttons: 'button:has-text("Run"), button:has-text("Test"), [data-action="run"]',
        output_areas: '.output, .result, textarea[readonly], pre',
        timing_displays: '.timing, .latency, [data-timing]',
      });
    });
  });

  // ─── Section 6: Settings & Configuration ──────────────────────────────

  test.describe('Section 6: Settings & Configuration', () => {

    test('01 - Settings panel', async () => {
      await navigateToDashboard(window, 'settings.html');
      const entry = await captureScreenshot(
        window, 'settings-main', 'settings',
        'Application settings - port configuration, auth, MCP server paths',
      );
      entry.elements_found = await countElements(window, {
        port_inputs: 'input[name*="port"], input[placeholder*="port" i]',
        path_inputs: 'input[name*="path"], input[type="text"][placeholder*="path" i]',
        toggles: 'input[type="checkbox"], .toggle, [role="switch"]',
        save_buttons: 'button:has-text("Save"), button[type="submit"]',
        sections: '.settings-section, .config-group, fieldset',
      });

      if (entry.elements_found.port_inputs === 0) {
        entry.issues.push('No port configuration inputs - users cannot customize MCP server ports');
      }
    });
  });

  // ─── Section 7: Auth Dashboard ────────────────────────────────────────

  test.describe('Section 7: Auth Dashboard', () => {

    test('01 - Auth panel', async () => {
      await navigateToDashboard(window, 'auth_dashboard.html');
      const entry = await captureScreenshot(
        window, 'auth-main', 'auth',
        'Authentication dashboard - OAuth, keystore, API keys',
      );
      entry.elements_found = await countElements(window, {
        login_buttons: 'button:has-text("Login"), button:has-text("Connect"), button:has-text("Authenticate")',
        key_displays: '.api-key, .token, [data-key]',
        provider_cards: '.provider, .oauth-provider, [data-provider]',
      });
    });
  });

  // ─── Section 8: Benchmark & Security ──────────────────────────────────

  test.describe('Section 8: Benchmark & Security', () => {

    test('01 - Benchmark dashboard', async () => {
      await navigateToDashboard(window, 'benchmark_dashboard.html');
      await captureScreenshot(
        window, 'benchmark-main', 'benchmark',
        'Benchmark dashboard for performance testing MCP tools',
      );
    });

    test('02 - Security test dashboard', async () => {
      await navigateToDashboard(window, 'security_test_dashboard.html');
      await captureScreenshot(
        window, 'security-main', 'security',
        'Security test dashboard - permission validation, sandboxing',
      );
    });
  });

  // ─── Section 9: Database & Storage ────────────────────────────────────

  test.describe('Section 9: Database & Storage', () => {

    test('01 - Database backup dashboard', async () => {
      await navigateToDashboard(window, 'database_backup_dashboard.html');
      const entry = await captureScreenshot(
        window, 'database-backup', 'database',
        'Database backup dashboard - IPFS-backed data persistence',
      );
      entry.elements_found = await countElements(window, {
        backup_buttons: 'button:has-text("Backup"), button:has-text("Export")',
        restore_buttons: 'button:has-text("Restore"), button:has-text("Import")',
        cid_refs: '.cid, [data-cid], code',
      });
    });

    test('02 - PyArrow content index', async () => {
      await navigateToDashboard(window, 'pyarrow_content_index_dashboard.html');
      await captureScreenshot(
        window, 'pyarrow-index', 'database',
        'PyArrow content index dashboard - vector search, IPLD indexing',
      );
    });
  });

  // ─── Section 10: Usage & Monitoring ───────────────────────────────────

  test.describe('Section 10: Usage & Monitoring', () => {

    test('01 - Usage dashboard', async () => {
      await navigateToDashboard(window, 'usage_dashboard.html');
      const entry = await captureScreenshot(
        window, 'usage-main', 'usage',
        'Usage tracking dashboard - API calls, token consumption, costs',
      );
      entry.elements_found = await countElements(window, {
        charts: 'canvas, svg, .chart, [data-chart]',
        counters: '.counter, .stat, .metric, [data-metric]',
        time_selectors: 'select[name*="period"], .time-range, [data-range]',
      });
    });
  });

  // ─── Section 11: MCP Tool Invocation Testing ──────────────────────────

  test.describe('Section 11: MCP Tool Testing Surface', () => {

    test('01 - Test interface', async () => {
      await navigateToDashboard(window, 'test_interface.html');
      const entry = await captureScreenshot(
        window, 'test-interface-main', 'mcp-testing',
        'Generic test interface for invoking MCP tools interactively',
      );
      entry.elements_found = await countElements(window, {
        tool_selectors: 'select[name*="tool"], .tool-picker, [data-tool-select]',
        argument_inputs: 'textarea[name*="arg"], .arguments-editor, [data-arguments]',
        invoke_buttons: 'button:has-text("Invoke"), button:has-text("Call"), button:has-text("Execute")',
        response_panels: '.response, .result-json, pre, [data-response]',
        history_panels: '.history, .call-log, [data-history]',
      });

      if (entry.elements_found.tool_selectors === 0 && entry.elements_found.invoke_buttons === 0) {
        entry.issues.push('No tool invocation UI - cannot interactively test MCP tools from dashboard');
      }
    });

    test('02 - Dashboard main (SwissKnife entry point)', async () => {
      await navigateToDashboard(window, 'dashboard.html');
      const entry = await captureScreenshot(
        window, 'main-dashboard', 'mcp-testing',
        'Main dashboard entry point - aggregated server status and quick actions',
      );
      entry.elements_found = await countElements(window, {
        server_cards: '.server-card, .daemon-card, [data-server]',
        quick_actions: '.quick-action, .action-button, [data-quick-action]',
        status_summary: '.status-summary, .health-summary',
        navigation_links: 'a[href*="dashboard"], nav a, .nav-link',
      });
    });
  });

  // ─── Section 12: Keyboard Navigation & Accessibility ──────────────────

  test.describe('Section 12: Navigation & Accessibility', () => {

    test('01 - Keyboard shortcut navigation (Ctrl+Alt+1)', async () => {
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await window.keyboard.press(`${modifier}+Alt+1`);
      await window.waitForTimeout(500);
      await captureScreenshot(
        window, 'nav-shortcut-kit', 'accessibility',
        'After Ctrl+Alt+1 keyboard shortcut - should navigate to IPFS Kit',
      );
    });

    test('02 - Keyboard shortcut navigation (Ctrl+Alt+2)', async () => {
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await window.keyboard.press(`${modifier}+Alt+2`);
      await window.waitForTimeout(500);
      await captureScreenshot(
        window, 'nav-shortcut-datasets', 'accessibility',
        'After Ctrl+Alt+2 - should navigate to IPFS Datasets',
      );
    });

    test('03 - Keyboard shortcut navigation (Ctrl+Alt+3)', async () => {
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await window.keyboard.press(`${modifier}+Alt+3`);
      await window.waitForTimeout(500);
      await captureScreenshot(
        window, 'nav-shortcut-accelerate', 'accessibility',
        'After Ctrl+Alt+3 - should navigate to IPFS Accelerate',
      );
    });

    test('04 - Tab focus order check', async () => {
      // Press Tab several times and capture to show focus indicators
      for (let i = 0; i < 5; i++) {
        await window.keyboard.press('Tab');
      }
      await window.waitForTimeout(200);
      await captureScreenshot(
        window, 'tab-focus-order', 'accessibility',
        'After 5 Tab presses - checks visible focus indicators exist',
      );
    });
  });
});

// ─── Non-Electron (headless) static analysis tests ────────────────────────

test.describe('Static Dashboard Analysis (headless)', () => {
  /**
   * These tests load dashboard HTML files directly in a browser context
   * (no Electron needed) to analyze DOM structure and identify missing
   * MCP tool integration points.
   */

  const VIEWS_DIR = path.join(__dirname, '..', '..', 'hallucinate_app', 'node', 'views');

  const dashboards = [
    { file: 'ipfs_kit_dashboard.html', section: 'ipfs-kit', label: 'IPFS Kit' },
    { file: 'ipfs_datasets_dashboard.html', section: 'ipfs-datasets', label: 'IPFS Datasets' },
    { file: 'ipfs_accelerate_dashboard.html', section: 'ipfs-accelerate', label: 'IPFS Accelerate' },
    { file: 'daemon_manager.html', section: 'daemon-manager', label: 'Daemon Manager' },
    { file: 'dashboard.html', section: 'main-dashboard', label: 'Main Dashboard' },
    { file: 'model_tester.html', section: 'model-tester', label: 'Model Tester' },
    { file: 'settings.html', section: 'settings', label: 'Settings' },
    { file: 'auth_dashboard.html', section: 'auth', label: 'Auth' },
    { file: 'benchmark_dashboard.html', section: 'benchmark', label: 'Benchmark' },
    { file: 'database_backup_dashboard.html', section: 'database', label: 'Database Backup' },
    { file: 'usage_dashboard.html', section: 'usage', label: 'Usage' },
    { file: 'test_interface.html', section: 'test-interface', label: 'Test Interface' },
  ];

  for (const dashboard of dashboards) {
    test(`Analyze ${dashboard.label} DOM structure`, async ({ page }) => {
      const filePath = path.join(VIEWS_DIR, dashboard.file);

      // Check file exists
      try {
        await fs.access(filePath);
      } catch {
        test.skip();
        return;
      }

      await page.goto(`file://${filePath}`);
      await page.waitForLoadState('domcontentloaded');

      // Extract structural analysis
      const analysis = await page.evaluate(() => {
        const doc = document;
        return {
          title: doc.title,
          headings: Array.from(doc.querySelectorAll('h1, h2, h3')).map(h => h.textContent?.trim()),
          buttons: Array.from(doc.querySelectorAll('button')).map(b => b.textContent?.trim()),
          inputs: Array.from(doc.querySelectorAll('input, textarea, select')).map(el => ({
            type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
            name: (el as HTMLInputElement).name || '',
            placeholder: (el as HTMLInputElement).placeholder || '',
          })),
          sections: Array.from(doc.querySelectorAll('section, .section, [data-section]')).map(s =>
            (s as HTMLElement).dataset?.section || s.className || s.id || 'unnamed'
          ),
          scripts: Array.from(doc.querySelectorAll('script[src]')).map(s => (s as HTMLScriptElement).src),
          links: Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(l => (l as HTMLLinkElement).href),
          total_elements: doc.querySelectorAll('*').length,
          forms: doc.querySelectorAll('form').length,
          tables: doc.querySelectorAll('table').length,
          data_attributes: Array.from(new Set(
            Array.from(doc.querySelectorAll('[data-action], [data-tool], [data-daemon-id]'))
              .map(el => Object.keys((el as HTMLElement).dataset).join(','))
          )),
        };
      });

      // Write analysis to file
      const analysisPath = path.join(
        SCREENSHOT_DIR,
        `analysis--${dashboard.section}.json`,
      );
      await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
      await fs.writeFile(analysisPath, JSON.stringify(analysis, null, 2));

      // Capture static screenshot
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `static--${dashboard.section}.png`),
        fullPage: true,
      });

      // Basic assertions
      expect(analysis.total_elements).toBeGreaterThan(0);
    });
  }

  test('Generate MCP tool coverage matrix', async () => {
    // Expected MCP tools that should be testable from the dashboard
    const expectedTools = {
      'ipfs-kit': [
        'ipfs_add', 'ipfs_cat', 'ipfs_pin_add', 'ipfs_pin_rm',
        'ipfs_pin_ls', 'get_backend_status', 'ipfs_status',
      ],
      'ipfs-datasets': [
        'tools_dispatch', 'load_dataset', 'get_from_ipfs', 'pin_to_ipfs',
        'save_dataset', 'load_index', 'get_task_status',
      ],
      'ipfs-accelerate': [
        'tools_dispatch', 'hardware_profile', 'run_inference_job',
        'job_status', 'telemetry', 'llm_router.generate_text',
      ],
    };

    const coverageMatrix = {
      generated_at: new Date().toISOString(),
      expected_tools: expectedTools,
      dashboard_coverage: {} as Record<string, { exposed: boolean; surface: string }>,
      recommendations: [] as string[],
    };

    // Check each dashboard HTML for tool references
    for (const [server, tools] of Object.entries(expectedTools)) {
      for (const tool of tools) {
        const dashboardFile = server === 'ipfs-kit'
          ? 'ipfs_kit_dashboard.html'
          : server === 'ipfs-datasets'
            ? 'ipfs_datasets_dashboard.html'
            : 'ipfs_accelerate_dashboard.html';

        const filePath = path.join(VIEWS_DIR, dashboardFile);
        let content = '';
        try {
          content = await fs.readFile(filePath, 'utf-8');
        } catch {
          // File doesn't exist
        }

        const exposed = content.includes(tool) ||
          content.includes(tool.replace(/_/g, '-')) ||
          content.includes(tool.replace(/_/g, ' '));

        coverageMatrix.dashboard_coverage[`${server}/${tool}`] = {
          exposed,
          surface: dashboardFile,
        };

        if (!exposed) {
          coverageMatrix.recommendations.push(
            `Add UI element for "${tool}" in ${dashboardFile} - tool not referenced in dashboard HTML`,
          );
        }
      }
    }

    const matrixPath = path.join(SCREENSHOT_DIR, 'mcp-tool-coverage-matrix.json');
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
    await fs.writeFile(matrixPath, JSON.stringify(coverageMatrix, null, 2));

    // This test always passes - it generates the analysis
    expect(Object.keys(coverageMatrix.dashboard_coverage).length).toBeGreaterThan(0);
  });
});
