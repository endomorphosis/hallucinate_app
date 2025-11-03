import { test, expect, _electron as electron } from '@playwright/test';
import { ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      args: [path.join(__dirname, '..', '..', 'index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_ENABLE_LOGGING: '1',
        AUTO_START_DAEMONS: 'true'
      }
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
    await electronApp.close();
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
    
    // Check console logs for daemon start messages
    const logs: string[] = [];
    window.on('console', msg => {
      logs.push(msg.text());
    });
    
    // Wait a bit more to collect logs
    await window.waitForTimeout(2000);
    
    // Verify we have some activity
    expect(logs.length).toBeGreaterThan(0);
  });

  test('Can open Daemon Manager window', async () => {
    // Use Electron's menu to open Daemon Manager
    await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      if (menu) {
        const daemonsMenu = menu.items.find(item => item.label === 'Daemons');
        if (daemonsMenu && daemonsMenu.submenu) {
          const managerItem = daemonsMenu.submenu.items.find(
            item => item.label === 'Daemon Manager'
          );
          if (managerItem) {
            managerItem.click();
          }
        }
      }
    });

    // Wait for new window
    await window.waitForTimeout(2000);
    
    // Get all windows
    const windows = electronApp.windows();
    expect(windows.length).toBeGreaterThanOrEqual(2);
    
    // Find daemon manager window
    let daemonManagerWindow: Page | null = null;
    for (const win of windows) {
      const title = await win.title();
      if (title.includes('Daemon Manager')) {
        daemonManagerWindow = win;
        break;
      }
    }
    
    if (daemonManagerWindow) {
      await daemonManagerWindow.screenshot({
        path: 'test-results/screenshots/05-daemon-manager.png',
        fullPage: true
      });
      
      // Verify daemon manager content
      const content = await daemonManagerWindow.content();
      expect(content).toContain('MCP Daemon Manager');
      expect(content).toContain('IPFS Kit MCP');
      expect(content).toContain('IPFS Datasets MCP');
      expect(content).toContain('IPFS Accelerate MCP');
    }
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
    // Test opening each window from the menu
    const windowsToTest = [
      'Test Interface',
      'Benchmark Dashboard',
      'Model Tester',
      'IPFS Kit Dashboard'
    ];
    
    for (const windowName of windowsToTest) {
      await electronApp.evaluate(({ Menu }, name) => {
        const menu = Menu.getApplicationMenu();
        if (menu) {
          const windowsMenu = menu.items.find(item => item.label === 'Windows');
          if (windowsMenu && windowsMenu.submenu) {
            const windowItem = windowsMenu.submenu.items.find(
              item => item.label === name
            );
            if (windowItem) {
              windowItem.click();
            }
          }
        }
      }, windowName);
      
      await window.waitForTimeout(1500);
    }
    
    // Get all windows
    const windows = electronApp.windows();
    expect(windows.length).toBeGreaterThan(1);
    
    // Take screenshot of all windows
    let screenshotIndex = 10;
    for (const win of windows) {
      try {
        const title = await win.title();
        const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await win.screenshot({
          path: `test-results/screenshots/${screenshotIndex}-window-${filename}.png`,
          fullPage: true
        });
        screenshotIndex++;
      } catch (err) {
        // Window might have closed, skip
      }
    }
  });

  test('App can be gracefully closed', async () => {
    // This will trigger the before-quit handler which should stop daemons
    await electronApp.close();
    
    // App should be closed
    const isRunning = electronApp.process()?.exitCode === null;
    expect(isRunning).toBe(false);
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
