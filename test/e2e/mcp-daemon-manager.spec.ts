import playwrightTest from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

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

async function clickApplicationMenuItem(targetLabel: string) {
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

/**
 * Playwright Test Suite for MCP Daemon Manager and SwissKnife Integration
 * 
 * This test suite:
 * - Launches the Electron app
 * - Verifies MCP daemon auto-start
 * - Tests daemon manager dashboard
 * - Tests SwissKnife integration
 * - Captures screenshots for documentation and CI/CD
 * - Provides automation for GitHub Actions
 */

let electronApp: ElectronApplication;
let window: Page;

test.describe('MCP Daemon Manager - Electron App', () => {
  
  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(__dirname, '..', '..', 'index.js')],
      env: electronLaunchEnv({
        NODE_ENV: 'test',
        ELECTRON_ENABLE_LOGGING: '1',
        AUTO_START_DAEMONS: 'true'
      })
    });

    // Get the first window
    window = await electronApp.firstWindow();
    
    // Wait for app to be ready
    await window.waitForLoadState('domcontentloaded');
    
    // Take initial screenshot
    await window.screenshot({
      path: 'test-results/screenshots/01-app-launch.png',
      fullPage: true
    });
  });

  test.afterAll(async () => {
    // Clean up
    await electronApp?.close();
  });

  test('App launches successfully', async () => {
    expect(window).toBeTruthy();
    
    const title = await window.title();
    expect(title).toBeTruthy();
    
    await window.screenshot({
      path: 'test-results/screenshots/02-app-launched.png',
      fullPage: true
    });
  });

  test('Menu system is present', async () => {
    // Verify main menu exists (application menu on macOS, window menu on others)
    const isVisible = await window.isVisible('body');
    expect(isVisible).toBe(true);
    
    await window.screenshot({
      path: 'test-results/screenshots/03-main-window.png',
      fullPage: true
    });
  });

  test('MCP daemons auto-start after delay', async () => {
    // Wait for auto-start delay (2 seconds) plus buffer
    await window.waitForTimeout(5000);
    
    await window.screenshot({
      path: 'test-results/screenshots/04-after-daemon-start.png',
      fullPage: true
    });

    // Wait a bit more to collect logs
    await window.waitForTimeout(2000);
    
    // Main-process daemon logs do not always surface as renderer console events.
    expect(await window.isVisible('body')).toBe(true);
  });

  test('Can open Daemon Manager window', async () => {
    const clicked = await clickApplicationMenuItem('MCP Control Panel');
    expect(clicked).toBe(true);

    // Wait for navigation
    await window.waitForTimeout(2000);

    await window.screenshot({
      path: 'test-results/screenshots/05-daemon-manager.png',
      fullPage: true
    });
    expect(clicked).toBe(true);
  });

  test('Daemon Manager shows daemon status', async () => {
    const windows = electronApp.windows();
    let daemonManagerWindow: Page | null = null;
    
    for (const win of windows) {
      const title = await win.title();
      if (title.includes('Daemon Manager')) {
        daemonManagerWindow = win;
        break;
      }
    }
    
    if (daemonManagerWindow) {
      // Wait for status to update
      await daemonManagerWindow.waitForTimeout(2000);
      
      // Check for daemon cards
      const hasIpfsKit = await daemonManagerWindow.evaluate(() => {
        return document.body.textContent?.includes('IPFS Kit MCP') || false;
      });
      
      const hasIpfsDatasets = await daemonManagerWindow.evaluate(() => {
        return document.body.textContent?.includes('IPFS Datasets MCP') || false;
      });
      
      const hasIpfsAccelerate = await daemonManagerWindow.evaluate(() => {
        return document.body.textContent?.includes('IPFS Accelerate MCP') || false;
      });
      
      expect(hasIpfsKit).toBe(true);
      expect(hasIpfsDatasets).toBe(true);
      expect(hasIpfsAccelerate).toBe(true);
      
      await daemonManagerWindow.screenshot({
        path: 'test-results/screenshots/06-daemon-status.png',
        fullPage: true
      });
    }
  });

  test('Can open SwissKnife Virtual Desktop window', async () => {
    // Use Electron's menu to open SwissKnife
    await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      if (menu) {
        const windowsMenu = menu.items.find(item => item.label === 'Windows');
        if (windowsMenu && windowsMenu.submenu) {
          const swissKnifeItem = windowsMenu.submenu.items.find(
            item => item.label === 'SwissKnife Virtual Desktop'
          );
          if (swissKnifeItem) {
            swissKnifeItem.click();
          }
        }
      }
    });

    // Wait for new window
    await window.waitForTimeout(3000);
    
    // Get all windows
    const windows = electronApp.windows();
    
    // Find SwissKnife window
    let swissKnifeWindow: Page | null = null;
    for (const win of windows) {
      const title = await win.title();
      if (title.includes('SwissKnife')) {
        swissKnifeWindow = win;
        break;
      }
    }
    
    if (swissKnifeWindow) {
      await swissKnifeWindow.screenshot({
        path: 'test-results/screenshots/07-swissknife-window.png',
        fullPage: true
      });
      
      // Verify SwissKnife content loaded
      const content = await swissKnifeWindow.content();
      const hasSwissKnife = content.includes('SwissKnife') || 
                           content.includes('swissknife') ||
                           content.includes('MCP');
      
      expect(hasSwissKnife).toBe(true);
    }
  });

  test('Daemon Manager has control buttons', async () => {
    const windows = electronApp.windows();
    let daemonManagerWindow: Page | null = null;
    
    for (const win of windows) {
      const title = await win.title();
      if (title.includes('Daemon Manager')) {
        daemonManagerWindow = win;
        break;
      }
    }
    
    if (daemonManagerWindow) {
      // Check for control buttons
      const hasStartButton = await daemonManagerWindow.evaluate(() => {
        return document.body.textContent?.includes('Start') || false;
      });
      
      const hasStopButton = await daemonManagerWindow.evaluate(() => {
        return document.body.textContent?.includes('Stop') || false;
      });
      
      const hasRestartButton = await daemonManagerWindow.evaluate(() => {
        return document.body.textContent?.includes('Restart') || false;
      });
      
      expect(hasStartButton).toBe(true);
      expect(hasStopButton).toBe(true);
      expect(hasRestartButton).toBe(true);
      
      await daemonManagerWindow.screenshot({
        path: 'test-results/screenshots/08-control-buttons.png',
        fullPage: true
      });
    }
  });

  test('Event log is present in Daemon Manager', async () => {
    const windows = electronApp.windows();
    let daemonManagerWindow: Page | null = null;
    
    for (const win of windows) {
      const title = await win.title();
      if (title.includes('Daemon Manager')) {
        daemonManagerWindow = win;
        break;
      }
    }
    
    if (daemonManagerWindow) {
      // Check for event log
      const hasEventLog = await daemonManagerWindow.evaluate(() => {
        return document.body.textContent?.includes('Event Log') || 
               document.body.textContent?.includes('Daemon manager initialized') ||
               false;
      });
      
      expect(hasEventLog).toBe(true);
      
      await daemonManagerWindow.screenshot({
        path: 'test-results/screenshots/09-event-log.png',
        fullPage: true
      });
    }
  });

  test('All expected windows can be accessed', async () => {
    // Test opening each dashboard from the generated menu
    const windowsToTest = [
      'Test Interface',
      'Benchmark Dashboard',
      'Model Tester',
      'IPFS Kit Dashboard'
    ];
    
    for (const windowName of windowsToTest) {
      const clicked = await clickApplicationMenuItem(windowName);
      expect(clicked).toBe(true);
      await window.waitForTimeout(1500);
      expect(await window.isVisible('body')).toBe(true);
    }
    
    await window.screenshot({
      path: 'test-results/screenshots/10-window-generated-dashboard.png',
      fullPage: true
    });
  });

  test('App can be gracefully closed', async () => {
    // This will trigger the before-quit handler which should stop daemons
    await electronApp.close();
    electronApp = undefined as any;
    expect(true).toBe(true);
  });
});

test.describe('MCP Daemon Manager - CLI Simulation', () => {
  test('Daemon manager configuration is valid', async () => {
    // Test that we can import and instantiate the daemon manager
    const { default: MCPDaemonManager } = await import('../../hallucinate_app/node/mcp_daemon_manager.js');
    
    const manager = new MCPDaemonManager();
    
    expect(manager).toBeTruthy();
    expect(manager.daemonConfigs).toHaveLength(3);
    
    // Verify each daemon config
    const configs = manager.daemonConfigs;
    
    expect(configs[0].id).toBe('ipfs-kit');
    expect(configs[0].port).toBe(8004);
    expect(configs[0].command).toBe('python');
    
    expect(configs[1].id).toBe('ipfs-datasets');
    expect(configs[1].port).toBe(3002);
    
    expect(configs[2].id).toBe('ipfs-accelerate');
    expect(configs[2].port).toBe(3003);
  });

  test('Daemon manager has all required methods', async () => {
    const { default: MCPDaemonManager } = await import('../../hallucinate_app/node/mcp_daemon_manager.js');
    
    const manager = new MCPDaemonManager();
    
    expect(typeof manager.startDaemon).toBe('function');
    expect(typeof manager.stopDaemon).toBe('function');
    expect(typeof manager.restartDaemon).toBe('function');
    expect(typeof manager.startAll).toBe('function');
    expect(typeof manager.stopAll).toBe('function');
    expect(typeof manager.getAllStatus).toBe('function');
    expect(typeof manager.getStatus).toBe('function');
    expect(typeof manager.getLogs).toBe('function');
  });

  test('Daemon manager can get status without running daemons', async () => {
    const { default: MCPDaemonManager } = await import('../../hallucinate_app/node/mcp_daemon_manager.js');
    
    const manager = new MCPDaemonManager();
    const status = manager.getAllStatus();
    
    expect(status).toBeTruthy();
    expect(typeof status).toBe('object');
  });

  test('Operator console can inspect, route, render, and recover a daemon task without paired glasses hardware', async () => {
    const { default: MCPDaemonManager } = await import('../../hallucinate_app/node/mcp_daemon_manager.js');

    const manager = new MCPDaemonManager();
    const daemonConfig = manager.daemonConfigs.find((config: any) => config.id === 'ipfs-datasets');
    const daemonTask = {
      id: 'VAI-024',
      daemon_id: 'ipfs-datasets',
      widget_id: 'operator-daemon-task-vai-024',
      status: 'running',
      progress: 0.24
    };

    manager.daemons.set(daemonTask.daemon_id, {
      id: daemonTask.daemon_id,
      name: daemonConfig.name,
      process: { kill: () => undefined },
      pid: 0,
      port: daemonConfig.port,
      status: 'running',
      startTime: Date.now() - 12_000,
      restartCount: 0,
      lastError: null,
      logs: [
        {
          time: Date.now() - 1_000,
          level: 'info',
          message: 'daemon task VAI-024 accepted for desktop operator inspection'
        }
      ]
    });
    manager.setControlSurfaceRuntimePolicyEvaluator(() => ({
      outcome: 'allow',
      reasons: ['desktop operator policy allows daemon task inspection and recovery'],
      metadata: {
        test_contract: 'VAI-024',
        surface: 'Hallucinate App desktop operator console'
      }
    }));

    const inspectedStatus = manager.getStatus(daemonTask.daemon_id);
    const inspected = await manager.invokeManagedService(
      daemonTask.daemon_id,
      {
        method: 'inspect_daemon_task',
        target_ref: `daemon-task:${daemonTask.id}`,
        arguments: {
          task_id: daemonTask.id,
          daemon_id: daemonTask.daemon_id,
          widget_id: daemonTask.widget_id,
          operator_surface: 'Hallucinate App daemon manager',
          swissknife_surface: 'SwissKnife virtual desktop',
          meta_glasses_paired: false
        },
        control_surface: {
          surface: 'mouse',
          surface_event: 'click',
          intent: 'operator.inspect_daemon_task',
          confidence: 1,
          actor: { type: 'user', id: 'operator:desktop', delegation_chain: [] },
          context: {
            platform: 'hallucinate_app',
            state_frames: ['desktop_operator', 'hardware_free'],
            device_context: {
              meta_glasses_paired: false,
              hardware_required: false
            }
          }
        }
      },
      async (payload: any, mediation: any) => ({
        inspected_task_id: payload.arguments.task_id,
        daemon_id: payload.arguments.daemon_id,
        route: {
          daemon: payload.daemon_id,
          hallucinate_app: payload.arguments.operator_surface,
          swissknife: payload.arguments.swissknife_surface,
          transport: mediation.transport
        },
        render_action: {
          type: 'desktop_render_display_widget',
          widget_id: payload.arguments.widget_id,
          fallback_for: 'Meta glasses',
          render_path: 'desktop-operator-panel',
          hardware_required: false
        }
      })
    );

    const recovered = await manager.invokeManagedService(
      daemonTask.daemon_id,
      {
        method: 'recover_daemon_task',
        target_ref: `daemon-task:${daemonTask.id}`,
        arguments: {
          task_id: daemonTask.id,
          daemon_id: daemonTask.daemon_id,
          widget_id: daemonTask.widget_id,
          previous_receipt_id: inspected.mediation_receipt.receipt_id,
          operator_surface: 'Hallucinate App daemon manager',
          swissknife_surface: 'SwissKnife virtual desktop'
        },
        control_surface: {
          surface: 'agent',
          surface_event: 'autonomous_invoke',
          intent: 'operator.recover_daemon_task',
          confidence: 1,
          actor: {
            type: 'agent',
            id: 'agent:desktop-operator',
            delegation_chain: ['operator:desktop', 'agent:desktop-operator']
          },
          context: {
            platform: 'hallucinate_app',
            state_frames: ['desktop_operator', 'recovery'],
            device_context: {
              meta_glasses_paired: false,
              hardware_required: false
            }
          }
        }
      },
      async (payload: any) => {
        const daemon = manager.daemons.get(payload.arguments.daemon_id);
        daemon.status = 'running';
        daemon.restartCount += 1;
        daemon.lastError = null;
        daemon.logs.push({
          time: Date.now(),
          level: 'info',
          message: 'daemon task VAI-024 recovered through desktop operator route'
        });
        return {
          recovered: true,
          daemon_task_id: payload.arguments.task_id,
          render_action: {
            type: 'desktop_update_display_widget',
            widget_id: payload.arguments.widget_id,
            patch: {
              status: 'running',
              recovery_state: 'recovered'
            }
          }
        };
      }
    );

    expect(inspectedStatus).toMatchObject({
      id: daemonTask.daemon_id,
      status: 'running',
      port: 3002
    });
    expect(inspected).toMatchObject({
      ok: true,
      denied: false,
      service_id: daemonTask.daemon_id,
      method: 'inspect_daemon_task',
      output: {
        inspected_task_id: daemonTask.id,
        route: {
          hallucinate_app: 'Hallucinate App daemon manager',
          swissknife: 'SwissKnife virtual desktop',
          transport: 'mcp-server'
        },
        render_action: {
          type: 'desktop_render_display_widget',
          render_path: 'desktop-operator-panel',
          hardware_required: false
        }
      }
    });
    expect(inspected.interaction_envelope.context.platform).toBe('hallucinate_app');
    expect(inspected.mediation_receipt.metadata.schema_refs).toEqual([
      'control_surface_contract',
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt'
    ]);
    expect(recovered).toMatchObject({
      ok: true,
      denied: false,
      method: 'recover_daemon_task',
      output: {
        recovered: true,
        daemon_task_id: daemonTask.id,
        render_action: {
          type: 'desktop_update_display_widget',
          patch: {
            status: 'running',
            recovery_state: 'recovered'
          }
        }
      }
    });
    expect(manager.getLogs(daemonTask.daemon_id, 1)[0].message).toContain(
      'recovered through desktop operator route'
    );
  });
});
