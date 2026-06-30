import playwrightTest from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import MCPDaemonManager from '../../hallucinate_app/node/mcp_daemon_manager.js';
import { mcpServers } from '../../hallucinate_app/node/menu_config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { test, expect, _electron: electron } = playwrightTest as unknown as typeof import('@playwright/test');
const hasElectronDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const electronDescribe = hasElectronDisplay ? test.describe : test.describe.skip;

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
      String(value || String()).replace(/[^\x20-\x7E]/g, String()).trim();
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

async function openDashboardFromMenu(electronApp: ElectronApplication, window: Page, label: string) {
  const clicked = await clickApplicationMenuItem(electronApp, label);
  expect(clicked).toBe(true);
  await window.waitForTimeout(800);
}

async function waitForDaemonHealthy(window: Page, daemonId: string, attempts = 15, delayMs = 1000) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const health = await window.evaluate(async (id) => {
      return window?.electronAPI?.daemon?.checkHealth?.(id);
    }, daemonId);

    if (health?.healthy === true) {
      return health;
    }
    await window.waitForTimeout(delayMs);
  }

  throw new Error(`Daemon ${daemonId} did not become healthy within timeout`);
}

async function waitForDaemonStatus(window: Page, daemonId: string, expectedStatus: string, attempts = 20, delayMs = 500) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await window.evaluate(async (id) => {
      return window?.electronAPI?.daemon?.getAll?.().then((all: any) => all?.[id]?.status);
    }, daemonId);

    if (status === expectedStatus) {
      return;
    }
    await window.waitForTimeout(delayMs);
  }

  throw new Error(`Daemon ${daemonId} did not reach status ${expectedStatus}`);
}

async function waitForDaemonMcpPlusPlus(window: Page, daemonId: string, attempts = 20, delayMs = 500) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await window.evaluate(async (id) => {
      return window?.electronAPI?.daemon?.getAll?.().then((all: any) => all?.[id]?.mcpPlusPlus ?? null);
    }, daemonId);

    if (status) {
      return status;
    }
    await window.waitForTimeout(delayMs);
  }

  throw new Error(`Daemon ${daemonId} did not expose MCP++ telemetry within timeout`);
}

async function waitForTextInSelector(window: Page, selector: string, matcher: RegExp, attempts = 20, delayMs = 500) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const text = await window.locator(selector).innerText().catch(() => '');
    if (matcher.test(text)) {
      return text;
    }
    await window.waitForTimeout(delayMs);
  }

  throw new Error(`Selector ${selector} did not match ${matcher}`);
}

async function waitForWindowUrl(electronApp: ElectronApplication, matcher: RegExp, attempts = 20, delayMs = 500) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const windows = electronApp.windows();
    for (const candidate of windows) {
      const currentUrl = candidate.url();
      if (matcher.test(currentUrl)) {
        return candidate;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`No window URL matched ${matcher}`);
}

async function installFetchStub(window: Page) {
  await window.evaluate(() => {
    (window as any).__fetchCalls = [];
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : String(args[0]);
      (window as any).__fetchCalls.push(url);
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };
  });
}

async function installAccelerateMetricsStub(window: Page) {
  await window.evaluate(() => {
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : String(args[0]);
      if (url.includes('/metrics')) {
        return new Response(JSON.stringify({
          models_loaded: 7,
          inference_count: 42,
          avg_response_time: 18
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };
  });
}

async function expectStubbedFetchCall(window: Page, urlPattern: RegExp, attempts = 20, delayMs = 250) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const calls = await window.evaluate(() => (window as any).__fetchCalls || []);
    if (calls.some((url: string) => urlPattern.test(url))) {
      return;
    }
    await window.waitForTimeout(delayMs);
  }
  throw new Error(`Expected stubbed fetch call matching ${urlPattern} was not observed`);
}

async function installAlertStub(window: Page) {
  await window.evaluate(() => {
    (window as any).__alertCalls = [];
    window.alert = (message?: string) => {
      (window as any).__alertCalls.push(String(message || ''));
    };
  });
}

async function waitForAlertCall(window: Page, matcher: RegExp, attempts = 20, delayMs = 250) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const alerts = await window.evaluate(() => (window as any).__alertCalls || []);
    if (alerts.some((message: string) => matcher.test(message))) {
      return;
    }
    await window.waitForTimeout(delayMs);
  }

  throw new Error(`Expected alert matching ${matcher} was not observed`);
}

async function installWindowOpenStub(window: Page) {
  await window.evaluate(() => {
    (window as any).__windowOpenCalls = [];
    window.open = ((url?: string | URL) => {
      (window as any).__windowOpenCalls.push(String(url || ''));
      return null;
    }) as typeof window.open;
  });
}

async function waitForWindowOpenCall(window: Page, matcher: RegExp, attempts = 20, delayMs = 250) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const calls = await window.evaluate(() => (window as any).__windowOpenCalls || []);
    if (calls.some((url: string) => matcher.test(url))) {
      return;
    }
    await window.waitForTimeout(delayMs);
  }

  throw new Error(`Expected window.open call matching ${matcher} was not observed`);
}

async function installFailClosedDashboardBridgeStub(window: Page, daemonId: string) {
  await window.evaluate((id) => {
    const api = window?.electronAPI;
    if (!api?.test?.setDashboardBridgeHealthOverride || !api?.test?.resetDashboardBridgeCallLog) {
      throw new Error('electronAPI dashboard bridge is unavailable');
    }

    api.test.setDashboardBridgeHealthOverride({
      daemon_id: id,
      daemonStatus: { status: 'stopped' },
      health: { healthy: false },
      message: `${id} daemon is down for fail-closed dashboard validation.`
    });
    api.test.resetDashboardBridgeCallLog();
  }, daemonId);
}

async function expectDashboardBridgeCall(window: Page, matcher: RegExp, attempts = 20, delayMs = 250) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const calls = await window.evaluate(() => window?.electronAPI?.test?.getDashboardBridgeCallLog?.() || []);
    if (calls.some((call: string) => matcher.test(call))) {
      return;
    }
    await window.waitForTimeout(delayMs);
  }

  throw new Error(`Expected dashboard bridge call matching ${matcher} was not observed`);
}

async function installOpenExternalSpy(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ shell }) => {
    (globalThis as any).__openExternalCalls = [];
    shell.openExternal = async (url: string) => {
      (globalThis as any).__openExternalCalls.push(String(url || ''));
      return '' as any;
    };
  });
}

async function getOpenExternalCalls(electronApp: ElectronApplication) {
  return electronApp.evaluate(() => {
    return (globalThis as any).__openExternalCalls || [];
  });
}

electronDescribe('MCP Feature Exposure - Hallucinate Dashboard', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(__dirname, '..', '..', 'index.js')],
      env: electronLaunchEnv({
        NODE_ENV: 'test',
        ELECTRON_ENABLE_LOGGING: '1',
        AUTO_START_DAEMONS: 'true'
      })
    });

    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(2500);
    window.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('launch plan exposes all MCP daemons with expected endpoints and health paths', async () => {
    const launchPlan = await window.evaluate(async () => {
      return window?.electronAPI?.daemon?.getLaunchPlan?.();
    });

    expect(Array.isArray(launchPlan)).toBe(true);
    expect(launchPlan).toHaveLength(3);

    const byId = new Map((launchPlan || []).map((entry: any) => [entry.daemon_id, entry]));

    expect(byId.get('ipfs-kit')).toMatchObject({
      endpoint: 'http://127.0.0.1:8004',
      health_path: '/api/mcp/status',
      rpc_path: '/mcp/tools/call'
    });
    expect(byId.get('ipfs-datasets')).toMatchObject({
      endpoint: 'http://127.0.0.1:3002',
      health_path: '/health/ready',
      rpc_path: '/datasets/load'
    });
    expect(byId.get('ipfs-accelerate')).toMatchObject({
      endpoint: 'http://127.0.0.1:3003',
      health_path: '/api/mcp/status',
      rpc_path: '/mcp'
    });
  });

  test('dashboard capability catalog reconciles menu URLs, safe probes, and MCP++ telemetry', async () => {
    const catalog = await window.evaluate(async () => {
      return window?.electronAPI?.daemon?.getDashboardCapabilityCatalog?.();
    });

    expect(catalog?.schema).toBe('hallucinate_app.mcp_dashboard_capability_catalog.v1');
    expect(catalog?.task_id).toBe('HAO-677');
    expect(catalog?.goal_id).toBe('VAIOS-G723');
    expect(catalog?.launch_objective_ids).toEqual(['VAIOS-G723', 'VAIOS-G724', 'VAIOS-G728']);
    expect(catalog?.launch_validation_gate).toMatchObject({
      task_id: 'MGW-533',
      goal_id: 'VAIOS-G724',
      goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
      packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
      evidence_term: 'launch Playwright validation gate'
    });
    expect(catalog?.launch_validation_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: 'MGW-547',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-547-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-547-launch-playwright-validation-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-547-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'MGW-550',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-550-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'HAO-712',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-712-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'HAO-720',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-720-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'HAO-724',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'HAO-727',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-727-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'MGW-558',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-558-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-558-launch-playwright-validation-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-558-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'MGW-559',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-559-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-29-mgw-559-launch-playwright-validation-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-559-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'MGW-561',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-561-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-30-mgw-561-launch-playwright-validation-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-561-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'VAI-529',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-27-vai-529-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'VAI-535',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-535-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'VAI-537',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-537-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'MGW-555',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-555-objective-gap-3e00ad2a0074.md'
      })
    ]));
    expect(catalog?.control_surface_route).toContain('mediation_receipt');
    expect(catalog?.servers).toHaveLength(3);

    const byId = new Map((catalog?.servers || []).map((entry: any) => [entry.daemon_id, entry]));
    const menuById = new Map(mcpServers.map((server: any) => [server.id, server]));

    for (const daemonId of ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate']) {
      const entry = byId.get(daemonId) as any;
      const menuEntry = menuById.get(daemonId) as any;
      expect(entry).toBeTruthy();
      expect(entry.launch_objective_ids).toEqual(['VAIOS-G723', 'VAIOS-G724', 'VAIOS-G728']);
      expect(entry.menu_dashboard_url).toBe(menuEntry.webDashboardUrl);
      expect(entry.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(entry.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(entry.tool_protocols.tools_call.safeProbe.mutation).toBe(false);
      expect(entry.control_surface_mediation_contract).toContain(`mcp-daemon:${daemonId}`);
      expect(entry.control_surface_receipt_requirements).toContain('receipt_cid');
    }

    expect((byId.get('ipfs-kit') as any)?.port).toBe(8004);
    expect((byId.get('ipfs-datasets') as any)?.native_dashboard_catalog_url).toBe(
      'http://127.0.0.1:8899/api/hallucinate/dashboard-catalog'
    );
    expect((byId.get('ipfs-datasets') as any)?.mcpplusplus.mode).toBe('optional_bridge');
    expect((byId.get('ipfs-accelerate') as any)?.mcpplusplus.profiles).toContain('mcp++/profile-e-mcp-p2p');
  });

  test('daemon status payload exposes MCP++ capability telemetry for accelerate and datasets', async () => {
    await waitForDaemonHealthy(window, 'ipfs-datasets');
    await waitForDaemonHealthy(window, 'ipfs-accelerate');
    await waitForDaemonMcpPlusPlus(window, 'ipfs-datasets');
    await waitForDaemonMcpPlusPlus(window, 'ipfs-accelerate');

    const allStatus = await window.evaluate(async () => {
      return window?.electronAPI?.daemon?.getAll?.();
    });

    expect(allStatus?.['ipfs-accelerate']?.mcpPlusPlus).toBeTruthy();
    expect(allStatus?.['ipfs-accelerate']?.mcpPlusPlus?.available).toBe(true);
    expect(allStatus?.['ipfs-accelerate']?.mcpPlusPlus?.supports_profile_negotiation).toBe(true);
    expect(Array.isArray(allStatus?.['ipfs-accelerate']?.mcpPlusPlus?.profiles)).toBe(true);
    expect(allStatus?.['ipfs-accelerate']?.mcpPlusPlus?.profiles).toContain('mcp++/profile-e-mcp-p2p');

    expect(allStatus?.['ipfs-datasets']?.mcpPlusPlus).toBeTruthy();
    expect(typeof allStatus?.['ipfs-datasets']?.mcpPlusPlus?.available).toBe('boolean');
    expect(allStatus?.['ipfs-datasets']?.mcpPlusPlus?.mode).toBe('optional_bridge');
  });

  test('launch receipts expose daemon startup telemetry for all MCP servers', async () => {
    await waitForDaemonHealthy(window, 'ipfs-kit');
    await waitForDaemonHealthy(window, 'ipfs-datasets');
    await waitForDaemonHealthy(window, 'ipfs-accelerate');

    const receipts = await window.evaluate(async () => {
      return window?.electronAPI?.daemon?.getLaunchReceipts?.(500);
    });

    expect(Array.isArray(receipts)).toBe(true);
    const daemonIds = new Set((receipts || []).map((receipt: any) => receipt.daemon_id));
    expect(daemonIds.has('ipfs-kit')).toBe(true);
    expect(daemonIds.has('ipfs-datasets')).toBe(true);
    expect(daemonIds.has('ipfs-accelerate')).toBe(true);

    const startEvents = (receipts || []).filter((receipt: any) => receipt.event_type === 'launch_spawned');
    expect(startEvents.length).toBeGreaterThanOrEqual(3);
    expect(startEvents.some((receipt: any) => receipt.health_path === '/health/ready')).toBe(true);
    expect(startEvents.some((receipt: any) => receipt.rpc_path === '/mcp/tools/call')).toBe(true);
  });

  test('daemon manager view renders all MCP cards with live endpoint exposure', async () => {
    await openDashboardFromMenu(electronApp, window, 'MCP Control Panel');

    await expect(window.locator('h1')).toContainText('MCP Daemon Manager');
    await expect(window.locator('#daemonGrid .daemon-card')).toHaveCount(3);

    const bodyText = await window.locator('body').innerText();
    expect(bodyText).toContain('IPFS Kit MCP');
    expect(bodyText).toContain('IPFS Datasets MCP');
    expect(bodyText).toContain('IPFS Accelerate MCP');

    expect(bodyText).toContain('http://127.0.0.1:8004');
    expect(bodyText).toContain('http://127.0.0.1:3002');
    expect(bodyText).toContain('http://127.0.0.1:3003');
  });

  test('daemon manager event log surface is present and initialized', async () => {
    await openDashboardFromMenu(electronApp, window, 'MCP Control Panel');
    await expect(window.locator('#eventLog')).toBeVisible();
    await expect(window.locator('#eventLog')).toContainText('Daemon Manager initialized');
  });

  test('IPFS Datasets dashboard exposes MCP features and quick actions', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Datasets Dashboard');

    await expect(window.locator('h1')).toContainText('IPFS Datasets Dashboard');
    await expect(window.locator('#btn-test-connection')).toBeVisible();
    await expect(window.locator('#btn-view-logs')).toBeVisible();
    await expect(window.locator('#btn-open-daemon-manager')).toBeVisible();

    const text = await window.locator('body').innerText();
    expect(text).toContain('/health/ready');
    expect(text).toContain('/datasets/list');
    expect(text).toContain('/datasets/load');
    expect(text).toContain('Server Status:');
    expect(text).toContain('native package MCP dashboard is launched as a companion service');
    expect(text).toContain('MCP++ Bridge Status');
    await expect(window.locator('#package-dashboard-frame')).toHaveAttribute('src', 'http://127.0.0.1:8899/mcp');

    const datasetsMcpStatus = await window.locator('#mcpplusplus-status').innerText();
    expect(/Available|Unavailable|Unknown|Checking/i.test(datasetsMcpStatus)).toBe(true);
  });

  test('IPFS Datasets daemon health endpoint is reachable when dashboard is exposed', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Datasets Dashboard');
    await waitForDaemonHealthy(window, 'ipfs-datasets');

    const response = await window.request.get('http://127.0.0.1:3002/health/ready');
    expect(response.ok()).toBe(true);
  });

  test('IPFS Datasets quick actions are functional', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Datasets Dashboard');
    await waitForDaemonHealthy(window, 'ipfs-datasets');

    await window.locator('#btn-test-connection').click();
    await waitForTextInSelector(window, '#health-receipt', /daemon\/health|ipfs-datasets|HAO-678/);

    await window.locator('#btn-open-daemon-manager').click();
    await expect(window.locator('h1')).toContainText('MCP Daemon Manager');
  });

  test('IPFS Accelerate dashboard exposes MCP features, metrics, and model actions', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Accelerate Dashboard');

    await expect(window.locator('h1')).toContainText('IPFS Accelerate Dashboard');
    await expect(window.locator('#btn-test-connection')).toBeVisible();
    await expect(window.locator('#btn-open-model-tester')).toBeVisible();
    await expect(window.locator('#btn-view-logs')).toBeVisible();
    await expect(window.locator('#btn-open-daemon-manager')).toBeVisible();

    await expect(window.locator('#models-loaded')).toBeVisible();
    await expect(window.locator('#inference-count')).toBeVisible();
    await expect(window.locator('#avg-response')).toBeVisible();

    const text = await window.locator('body').innerText();
    expect(text).toContain('/models/load');
    expect(text).toContain('/models/list');
    expect(text).toContain('/inference');
    expect(text).toContain('/metrics');
    expect(text).toContain('MCP++ Runtime Capability');
    expect(text).toContain('mcp++/profile-e-mcp-p2p');

    await expect(window.locator('#package-dashboard-frame')).toHaveAttribute('src', 'http://127.0.0.1:3003/dashboard');
  });

  test('IPFS Accelerate dashboard updates metrics widgets from the MCP metrics surface', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Accelerate Dashboard');
    await installAccelerateMetricsStub(window);

    await window.waitForTimeout(10500);

    await expect(window.locator('#models-loaded')).toHaveText('7');
    await expect(window.locator('#inference-count')).toHaveText('42');
    await expect(window.locator('#avg-response')).toContainText('18 ms');
  });

  test('IPFS Accelerate daemon health endpoint is reachable when dashboard is exposed', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Accelerate Dashboard');
    await waitForDaemonHealthy(window, 'ipfs-accelerate');

    const response = await window.request.get('http://127.0.0.1:3003/api/mcp/status');
    expect(response.ok()).toBe(true);
  });

  test('IPFS Accelerate quick actions are functional', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Accelerate Dashboard');
    await waitForDaemonHealthy(window, 'ipfs-accelerate');

    await window.locator('#btn-test-connection').click();
    await waitForTextInSelector(window, '#health-receipt', /daemon\/health|ipfs-accelerate|HAO-678/);

    await window.locator('#btn-open-daemon-manager').click();
    await expect(window.locator('h1')).toContainText('MCP Daemon Manager');

    await openDashboardFromMenu(electronApp, window, 'IPFS Accelerate Dashboard');
    await window.locator('#btn-open-model-tester').click();
    await expect(window.locator('h1')).toContainText('IPFS Accelerate Model Tester');
  });

  test('IPFS Kit dashboard remains reachable from the generated menu', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Kit Dashboard');

    await expect(window.locator('h1')).toContainText('IPFS Kit Dashboard');
    await expect(window.locator('#dashboard-container')).toBeVisible();
    await expect(window.locator('#package-dashboard-frame')).toHaveAttribute('src', 'http://127.0.0.1:8004/dashboard');
  });

  test('embedded native package dashboards are present for kit and accelerate', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Kit Dashboard');
    await expect(window.locator('text=Native Package Dashboard')).toBeVisible();
    await expect(window.locator('#btn-reload-native-dashboard')).toBeVisible();
    await expect(window.locator('#package-dashboard-frame')).toHaveAttribute('title', 'IPFS Kit Native Dashboard');

    await openDashboardFromMenu(electronApp, window, 'IPFS Accelerate Dashboard');
    await expect(window.locator('text=Native Package Dashboard')).toBeVisible();
    await expect(window.locator('#btn-reload-native-dashboard')).toBeVisible();
    await expect(window.locator('#package-dashboard-frame')).toHaveAttribute('title', 'IPFS Accelerate Native Dashboard');
  });

  test('embedded native package dashboard is present for datasets', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Datasets Dashboard');
    await expect(window.locator('text=Native Package Dashboard')).toBeVisible();
    await expect(window.locator('#btn-reload-native-dashboard')).toBeVisible();
    await expect(window.locator('#package-dashboard-frame')).toHaveAttribute('title', 'IPFS Datasets Native Dashboard');
  });

  test('IPFS Kit quick actions are functional', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Kit Dashboard');
    await waitForDaemonHealthy(window, 'ipfs-kit');

    const response = await window.request.get('http://127.0.0.1:8004/api/mcp/status');
    expect(response.ok()).toBe(true);

    await window.locator('#btn-test-connection').click();
    await waitForTextInSelector(window, '#health-receipt', /daemon\/health|ipfs-kit|HAO-678/);

    await window.locator('#btn-open-daemon-manager').click();
    await expect(window.locator('h1')).toContainText('MCP Daemon Manager');
  });

  test('IPFS dashboards render catalog-backed health, endpoints, native dashboard, and tool controls', async () => {
    const dashboards = [
      {
        label: 'IPFS Kit Dashboard',
        daemonId: 'ipfs-kit',
        endpoint: 'http://127.0.0.1:8004',
        toolsList: 'http://127.0.0.1:8004/mcp/tools/list',
        safeProbe: 'ipfs_status'
      },
      {
        label: 'IPFS Datasets Dashboard',
        daemonId: 'ipfs-datasets',
        endpoint: 'http://127.0.0.1:3002',
        toolsList: 'http://127.0.0.1:3002/datasets/list',
        safeProbe: 'datasets_list'
      },
      {
        label: 'IPFS Accelerate Dashboard',
        daemonId: 'ipfs-accelerate',
        endpoint: 'http://127.0.0.1:3003',
        toolsList: 'http://127.0.0.1:3003/models/list',
        safeProbe: 'hardware_profile'
      },
    ];

    for (const dashboard of dashboards) {
      await openDashboardFromMenu(electronApp, window, dashboard.label);
      await waitForDaemonHealthy(window, dashboard.daemonId);
      await expect(window.locator('#endpoint-status')).toContainText(dashboard.endpoint);
      await expect(window.locator('#health-status')).toContainText(/Healthy|Degraded|Unknown/);
      await expect(window.locator('#tools-list-url')).toContainText(dashboard.toolsList);
      await expect(window.locator('#tools-call-probe')).toContainText(dashboard.safeProbe);
      await expect(window.locator('#control-surface-contract')).toContainText(`mcp-daemon:${dashboard.daemonId}`);
      await expect(window.locator('#native-dashboard-url')).toContainText(/dashboard|mcp/i);
      await waitForTextInSelector(window, '#health-receipt', /HAO-678|daemon\/health/);
    }
  });

  test('IPFS dashboard tool controls produce visible preload bridge receipts', async () => {
    const dashboards = [
      { label: 'IPFS Kit Dashboard', daemonId: 'ipfs-kit' },
      { label: 'IPFS Datasets Dashboard', daemonId: 'ipfs-datasets' },
      { label: 'IPFS Accelerate Dashboard', daemonId: 'ipfs-accelerate' },
    ];

    for (const dashboard of dashboards) {
      await openDashboardFromMenu(electronApp, window, dashboard.label);
      await waitForDaemonHealthy(window, dashboard.daemonId);
      await window.locator('#btn-tools-list').click();
      await waitForTextInSelector(window, '#tool-receipt', /tools\/list/);
      await expect(window.locator('#tool-receipt')).toContainText(dashboard.daemonId);
      await expect(window.locator('#tool-receipt')).toContainText(/mediation_receipt|policy_decision|control_surface/i);

      await window.locator('#btn-tools-call').click();
      await waitForTextInSelector(window, '#tool-receipt', /tools\/call/);
      await expect(window.locator('#tool-receipt')).toContainText('safe_probe');
      await expect(window.locator('#tool-receipt')).toContainText(/mediation_receipt|policy_decision|control_surface/i);
    }
  });

  test('dashboard log actions surface MCP daemon logs for all three dashboards', async () => {
    const dashboards = [
      { label: 'IPFS Kit Dashboard', daemonId: 'ipfs-kit' },
      { label: 'IPFS Datasets Dashboard', daemonId: 'ipfs-datasets' },
      { label: 'IPFS Accelerate Dashboard', daemonId: 'ipfs-accelerate' },
    ];

    for (const dashboard of dashboards) {
      await openDashboardFromMenu(electronApp, window, dashboard.label);
      await waitForDaemonHealthy(window, dashboard.daemonId);
      await installAlertStub(window);
      await window.locator('#btn-view-logs').click();
      await waitForAlertCall(window, /Recent Logs|No logs available/i);
    }
  });

  test('IPFS dashboard web buttons open catalog-backed native dashboard URLs', async () => {
    const dashboards = [
      { label: 'IPFS Kit Dashboard', daemonId: 'ipfs-kit', urlPattern: /127\.0\.0\.1:8004\/dashboard/ },
      { label: 'IPFS Datasets Dashboard', daemonId: 'ipfs-datasets', urlPattern: /127\.0\.0\.1:8899\/mcp/ },
      { label: 'IPFS Accelerate Dashboard', daemonId: 'ipfs-accelerate', urlPattern: /127\.0\.0\.1:3003\/dashboard/ },
    ];

    for (const dashboard of dashboards) {
      await openDashboardFromMenu(electronApp, window, dashboard.label);
      await waitForDaemonHealthy(window, dashboard.daemonId);
      await window.locator('#btn-open-web-dashboard').click();
      await waitForTextInSelector(window, '#health-receipt', /navigation\/openDashboard/);
      await expect(window.locator('#health-receipt')).toContainText(dashboard.urlPattern);
    }
  });

  test('IPFS dashboard controls fail closed with visible receipts when daemon bridge reports down', async () => {
    const dashboards = [
      { label: 'IPFS Kit Dashboard', daemonId: 'ipfs-kit' },
      { label: 'IPFS Datasets Dashboard', daemonId: 'ipfs-datasets' },
      { label: 'IPFS Accelerate Dashboard', daemonId: 'ipfs-accelerate' },
    ];

    for (const dashboard of dashboards) {
      await openDashboardFromMenu(electronApp, window, dashboard.label);
      await installFailClosedDashboardBridgeStub(window, dashboard.daemonId);

      await window.locator('#btn-tools-list').click();
      await waitForTextInSelector(window, '#tool-receipt', /tools\/list[\s\S]*fail_closed/);
      await expectDashboardBridgeCall(window, new RegExp(`daemon\\.dashboardToolsList:${dashboard.daemonId}`));

      await window.locator('#btn-tools-call').click();
      await waitForTextInSelector(window, '#tool-receipt', /tools\/call[\s\S]*fail_closed/);
      await expect(window.locator('#tool-receipt')).toContainText('safe_probe');
      await expectDashboardBridgeCall(window, new RegExp(`daemon\\.dashboardToolsCall:${dashboard.daemonId}`));

      await window.locator('#btn-open-web-dashboard').click();
      await waitForTextInSelector(window, '#health-receipt', /navigation\/openDashboard[\s\S]*fail_closed/);
      await expectDashboardBridgeCall(window, new RegExp(`navigation\\.openDashboard:${dashboard.daemonId}`));

      await window.locator('#btn-reload-native-dashboard').click();
      await waitForTextInSelector(window, '#health-receipt', /daemon\/health[\s\S]*fail_closed/);
      await expectDashboardBridgeCall(window, new RegExp(`daemon\\.dashboardHealth:${dashboard.daemonId}`));
    }

    await window.evaluate(() => {
      window?.electronAPI?.test?.setDashboardBridgeHealthOverride?.(null);
      window?.electronAPI?.test?.resetDashboardBridgeCallLog?.();
    });
  });

  test('Tools menu exposes the configured MCP tool URLs for kit, datasets, and accelerate', async () => {
    await installOpenExternalSpy(electronApp);

    for (const server of mcpServers.filter((server) => ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'].includes(server.id))) {
      for (const tool of server.tools.filter((tool: any) => tool.url)) {
        const clicked = await clickApplicationMenuPath(electronApp, ['Tools', `${server.displayName} Tools`, tool.label]);
        expect(clicked).toBe(true);

        const calls = await getOpenExternalCalls(electronApp);
        expect(calls[calls.length - 1]).toBe(tool.url);
      }
    }
  });

  test('MCP Servers browser entries use the live dashboard URLs', async () => {
    await installOpenExternalSpy(electronApp);

    for (const server of mcpServers.filter((server) => ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'].includes(server.id))) {
      const clicked = await clickApplicationMenuPath(electronApp, [
        'MCP Servers',
        `${server.displayName} MCP (Port ${server.port})`,
        'Open in Browser'
      ]);
      expect(clicked).toBe(true);

      const calls = await getOpenExternalCalls(electronApp);
      expect(calls[calls.length - 1]).toBe(server.webDashboardUrl);
    }
  });

  test('MCP Servers embedded web dashboard entries launch MCP dashboard windows', async () => {
    const targets = mcpServers.filter((server) => ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'].includes(server.id));

    for (const target of targets) {
      expect(await clickApplicationMenuPath(electronApp, [
        'MCP Servers',
        `${target.displayName} MCP (Port ${target.port})`,
        'Open Web Dashboard'
      ])).toBe(true);

      await waitForWindowUrl(
        electronApp,
        new RegExp(target.webDashboardUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      );
    }
  });

  test('MCP Servers menu can stop, start, and restart the datasets daemon', async () => {
    await openDashboardFromMenu(electronApp, window, 'MCP Control Panel');
    await waitForDaemonHealthy(window, 'ipfs-datasets');

    expect(await clickApplicationMenuPath(electronApp, [
      'MCP Servers',
      'IPFS Datasets MCP (Port 3002)',
      'Stop Server'
    ])).toBe(true);
    await waitForDaemonStatus(window, 'ipfs-datasets', 'stopped');

    expect(await clickApplicationMenuPath(electronApp, [
      'MCP Servers',
      'IPFS Datasets MCP (Port 3002)',
      'Start Server'
    ])).toBe(true);
    await waitForDaemonHealthy(window, 'ipfs-datasets');

    expect(await clickApplicationMenuPath(electronApp, [
      'MCP Servers',
      'IPFS Datasets MCP (Port 3002)',
      'Restart Server'
    ])).toBe(true);
    await waitForDaemonHealthy(window, 'ipfs-datasets');
  });

  test('datasets dashboard status follows daemon stop/start transitions', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Datasets Dashboard');
    await waitForDaemonHealthy(window, 'ipfs-datasets');

    expect(await clickApplicationMenuPath(electronApp, [
      'MCP Servers',
      'IPFS Datasets MCP (Port 3002)',
      'Stop Server'
    ])).toBe(true);
    await waitForDaemonStatus(window, 'ipfs-datasets', 'stopped');
    await waitForTextInSelector(window, '#server-status', /Stopped/i);
    await window.locator('#btn-tools-list').click();
    await waitForTextInSelector(window, '#tool-receipt', /fail_closed|blocked because ipfs-datasets is not healthy/i);

    expect(await clickApplicationMenuPath(electronApp, [
      'MCP Servers',
      'IPFS Datasets MCP (Port 3002)',
      'Start Server'
    ])).toBe(true);
    await waitForDaemonHealthy(window, 'ipfs-datasets');
    await waitForTextInSelector(window, '#server-status', /Running/i);
  });

  test('accelerate dashboard status follows daemon stop/start transitions', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Accelerate Dashboard');
    await waitForDaemonHealthy(window, 'ipfs-accelerate');

    expect(await clickApplicationMenuPath(electronApp, [
      'MCP Servers',
      'IPFS Accelerate MCP (Port 3003)',
      'Stop Server'
    ])).toBe(true);
    await waitForDaemonStatus(window, 'ipfs-accelerate', 'stopped');
    await waitForTextInSelector(window, '#server-status', /Stopped/i);

    expect(await clickApplicationMenuPath(electronApp, [
      'MCP Servers',
      'IPFS Accelerate MCP (Port 3003)',
      'Start Server'
    ])).toBe(true);
    await waitForDaemonHealthy(window, 'ipfs-accelerate');
    await waitForTextInSelector(window, '#server-status', /Running/i);
  });
});

test.describe('MCP Feature Exposure - headless backend gate', () => {
  test('launch plan exposes all MCP daemons with expected endpoints and health paths without Electron', () => {
    const manager = new MCPDaemonManager();
    const launchPlan = manager.getLaunchPlan();
    const byId = new Map((launchPlan || []).map((entry: any) => [entry.daemon_id, entry]));

    expect(Array.isArray(launchPlan)).toBe(true);
    expect(launchPlan).toHaveLength(3);
    expect(byId.get('ipfs-kit')).toMatchObject({
      endpoint: 'http://127.0.0.1:8004',
      health_path: '/api/mcp/status',
      rpc_path: '/mcp/tools/call'
    });
    expect(byId.get('ipfs-datasets')).toMatchObject({
      endpoint: 'http://127.0.0.1:3002',
      health_path: '/health/ready',
      rpc_path: '/datasets/load'
    });
    expect(byId.get('ipfs-accelerate')).toMatchObject({
      endpoint: 'http://127.0.0.1:3003',
      health_path: '/api/mcp/status',
      rpc_path: '/mcp'
    });

    for (const entry of launchPlan) {
      expect(entry.launch_validation_gate).toMatchObject({
        task_id: 'MGW-535',
        goal_id: 'VAIOS-G728',
        evidence_term: 'launch Playwright validation gate'
      });
      expect(entry.mediation_contract_ref).toContain(`mcp-daemon:${entry.daemon_id}`);
      expect(entry.swissknife_consumer).toContain('Swissknife');
    }
  });

  test('dashboard capability catalog reconciles menu URLs, safe probes, and MCP++ telemetry without Electron', () => {
    const manager = new MCPDaemonManager();
    const catalog = manager.getDashboardCapabilityCatalog();
    const byId = new Map((catalog?.servers || []).map((entry: any) => [entry.daemon_id, entry]));
    const menuById = new Map(mcpServers.map((server: any) => [server.id, server]));

    expect(catalog?.schema).toBe('hallucinate_app.mcp_dashboard_capability_catalog.v1');
    expect(catalog?.task_id).toBe('HAO-677');
    expect(catalog?.goal_id).toBe('VAIOS-G723');
    expect(catalog?.launch_objective_ids).toEqual(['VAIOS-G723', 'VAIOS-G724', 'VAIOS-G728']);
    expect(catalog?.dashboard_only_mocks).toBe(false);
    expect(catalog?.launch_validation_gate).toMatchObject({
      task_id: 'MGW-533',
      goal_id: 'VAIOS-G724',
      evidence_term: 'launch Playwright validation gate',
      playwright_specs: [
        'hallucinate_app/test/e2e/mcp-feature-exposure.spec.ts',
        'hallucinate_app/test/e2e/mcp-dashboard-interoperability.spec.ts'
      ]
    });
    expect(catalog?.launch_validation_gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: 'MGW-547',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-547-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-547-launch-playwright-validation-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-547-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'MGW-550',
        goal_id: 'VAIOS-G724',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-550-objective-gap-3e00ad2a0074.md'
      }),
      expect.objectContaining({
        task_id: 'HAO-712',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-712-objective-gap-3e00ad2a0074.md',
        launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-27-hao-712-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-712-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'HAO-720',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-720-objective-gap-3e00ad2a0074.md',
        launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-720-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-720-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'HAO-724',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-objective-gap-3e00ad2a0074.md',
        launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-724-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-724-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'HAO-727',
        goal_id: 'VAIOS-G723',
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-objective-gap-7ea369464239.md',
        launch_gate_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-mcp-dashboard-launch-gate.md',
        hallucinate_backlog_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-727-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/hao-727-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'VAI-529',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-27-vai-529-objective-gap-3e00ad2a0074.md',
        launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-529-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-529-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'VAI-535',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-535-objective-gap-3e00ad2a0074.md',
        launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-535-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-535-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'VAI-537',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-537-objective-gap-3e00ad2a0074.md',
        launch_gate_receipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-537-mcp-dashboard-launch-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/vai-537-mcp-dashboard-launch-gate.json'
      }),
      expect.objectContaining({
        task_id: 'MGW-555',
        goal_id: 'VAIOS-G724',
        goal_packet: 'goal_packet/launch/hallucinate_app/44dceea6bc53',
        packet_goal_ids: ['VAIOS-G724', 'VAIOS-G728'],
        evidence_term: 'launch Playwright validation gate',
        supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-555-objective-gap-3e00ad2a0074.md',
        launch_gate_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-555-launch-playwright-validation-gate.md',
        receipt_fixture: 'hallucinate_app/test/e2e/fixtures/mgw-555-mcp-dashboard-launch-gate.json'
      })
    ]));
    expect(catalog?.control_surface_route).toContain('mediation_receipt');
    expect(catalog?.servers).toHaveLength(3);

    for (const daemonId of ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate']) {
      const entry = byId.get(daemonId) as any;
      const menuEntry = menuById.get(daemonId) as any;
      expect(entry).toBeTruthy();
      expect(entry.menu_dashboard_url).toBe(menuEntry.webDashboardUrl);
      expect(entry.tool_protocols.tools_list.operation).toBe('tools/list');
      expect(entry.tool_protocols.tools_call.operation).toBe('tools/call');
      expect(entry.tool_protocols.tools_call.safeProbe.mutation).toBe(false);
      expect(entry.control_surface_mediation_contract).toContain(`mcp-daemon:${daemonId}`);
      expect(entry.control_surface_receipt_requirements).toContain('receipt_cid');
      expect(entry.control_surface_receipt_requirements).toEqual(expect.arrayContaining([
        'interaction_envelope',
        'policy_decision',
        'mediation_receipt',
        'receipt_cid'
      ]));
    }

    expect((byId.get('ipfs-kit') as any)?.port).toBe(8004);
    expect((byId.get('ipfs-datasets') as any)?.native_dashboard_catalog_url).toBe(
      'http://127.0.0.1:8899/api/hallucinate/dashboard-catalog'
    );
    expect((byId.get('ipfs-datasets') as any)?.mcpplusplus.mode).toBe('optional_bridge');
    expect((byId.get('ipfs-accelerate') as any)?.mcpplusplus.profiles).toContain('mcp++/profile-e-mcp-p2p');
  });
});
