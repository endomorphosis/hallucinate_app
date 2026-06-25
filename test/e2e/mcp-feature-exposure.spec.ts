import playwrightTest from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { mcpServers } from '../../hallucinate_app/node/menu_config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { test, expect, _electron: electron } = playwrightTest as unknown as typeof import('@playwright/test');

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

test.describe('MCP Feature Exposure - Hallucinate Dashboard', () => {
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
    expect(catalog?.control_surface_route).toContain('mediation_receipt');
    expect(catalog?.servers).toHaveLength(3);

    const byId = new Map((catalog?.servers || []).map((entry: any) => [entry.daemon_id, entry]));
    const menuById = new Map(mcpServers.map((server: any) => [server.id, server]));

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

    await installFetchStub(window);
    await window.locator('#btn-test-connection').click();
    await expectStubbedFetchCall(window, /localhost:3002\/health\/ready/);

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

    await installFetchStub(window);
    await window.locator('#btn-test-connection').click();
    await expectStubbedFetchCall(window, /localhost:3003\/health/);

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

    await installFetchStub(window);
    await window.locator('#btn-test-connection').click();
    await expectStubbedFetchCall(window, /127\.0\.0\.1:8004\/api\/mcp\/status/);

    await window.locator('#btn-open-daemon-manager').click();
    await expect(window.locator('h1')).toContainText('MCP Daemon Manager');
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

  test('IPFS Kit web dashboard button opens the live MCP dashboard URL', async () => {
    await openDashboardFromMenu(electronApp, window, 'IPFS Kit Dashboard');
    await installWindowOpenStub(window);
    await window.locator('#btn-open-web-dashboard').click();
    await waitForWindowOpenCall(window, /127\.0\.0\.1:8004\/dashboard/);
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
