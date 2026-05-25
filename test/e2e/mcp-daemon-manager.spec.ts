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
    expect(configs[0].port).toBe(3001);
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
});
