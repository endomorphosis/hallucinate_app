/**
 * Comprehensive Menu Structure Tests
 * 
 * Tests the programmatically generated menu structure using the
 * menu configuration and testing framework.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runMenuStructureTests, getAllTestableItems } from './menu_test_framework.js';
import { mcpServers } from '../hallucinate_app/node/menu_config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Programmatic Menu Structure Tests', () => {
  let indexContent;
  let menuGeneratorContent;

  // Read the index.js file
  try {
    indexContent = readFileSync(join(__dirname, '..', 'index.js'), 'utf-8');
    menuGeneratorContent = readFileSync(
      join(__dirname, '..', 'hallucinate_app', 'node', 'menu_generator.js'),
      'utf-8'
    );
  } catch (err) {
    throw new Error(`Failed to read menu sources: ${err.message}`);
  }

  it('should import MenuGenerator', () => {
    assert.ok(indexContent.includes("import MenuGenerator from './hallucinate_app/node/menu_generator.js'"),
      'MenuGenerator should be imported');
  });

  it('should have menuGenerator instance variable', () => {
    assert.ok(indexContent.includes('let menuGenerator'), 'menuGenerator variable should exist');
  });

  it('should initialize MenuGenerator with proper context', () => {
    assert.ok(indexContent.includes('new MenuGenerator({'), 'MenuGenerator should be instantiated');
    assert.ok(indexContent.includes('daemonManager: daemonManager'), 'Should pass daemonManager');
    assert.ok(indexContent.includes('navigateToView: navigateToView'), 'Should pass navigateToView');
    assert.ok(indexContent.includes('createSwissKnifeWindow: createSwissKnifeWindow'), 'Should pass createSwissKnifeWindow');
    assert.ok(indexContent.includes('createMCPDashboardWindow: createMCPDashboardWindow'), 'Should pass createMCPDashboardWindow');
  });

  it('should call menuGenerator.generate()', () => {
    assert.ok(indexContent.includes('menuGenerator.generate()'), 'Should call generate method');
  });

  it('should create window before menu', () => {
    const createWindowIndex = indexContent.indexOf('createWindow()');
    const createMenuIndex = indexContent.indexOf('createAppMenu()');
    assert.ok(createWindowIndex < createMenuIndex, 'Window should be created before menu');
  });

  it('should have mainWindow variable for navigation', () => {
    assert.ok(indexContent.includes('let mainWindow = null'), 'mainWindow variable should exist');
  });

  it('should have navigateToView function', () => {
    assert.ok(indexContent.includes('const navigateToView'), 'navigateToView function should exist');
  });

  it('should set mainWindow in createWindow function', () => {
    assert.ok(indexContent.includes('mainWindow = createSwissKnifeWindow()'), 
      'createWindow should set global mainWindow');
  });

  it('should have IPC handlers for navigation', () => {
    assert.ok(indexContent.includes("ipcMain.on('open-daemon-manager'"), 
      'open-daemon-manager IPC handler should exist');
    assert.ok(indexContent.includes("ipcMain.on('open-model-tester'"), 
      'open-model-tester IPC handler should exist');
    assert.ok(indexContent.includes("ipcMain.on('open-security-test-dashboard'"), 
      'open-security-test-dashboard IPC handler should exist');
    assert.ok(indexContent.includes("ipcMain.on('open-database-backup-dashboard'"), 
      'open-database-backup-dashboard IPC handler should exist');
  });

  it('should not retain the SwissKnife app launch TODO annotation', () => {
    assert.ok(
      !menuGeneratorContent.includes('TODO: Launch specific app within SwissKnife'),
      'SwissKnife app launch TODO should be resolved'
    );
  });
});

describe('SwissKnife App Menu Action Tests', () => {
  it('should configure app ids for each SwissKnife app menu item', () => {
    const swissKnifeServer = mcpServers.find(server => server.id === 'swissknife');
    assert.ok(swissKnifeServer, 'SwissKnife MCP server should exist');

    const appTools = swissKnifeServer.tools.filter(tool => tool.action === 'openSwissKnifeApp');
    assert.deepStrictEqual(
      appTools.map(tool => tool.app),
      ['terminal', 'editor', 'files', 'chat', 'music', 'video'],
      'SwissKnife app menu items should expose stable app ids'
    );
  });

  it('should forward the selected SwissKnife app id to the window factory', () => {
    const menuGeneratorContent = readFileSync(
      join(__dirname, '..', 'hallucinate_app', 'node', 'menu_generator.js'),
      'utf-8'
    );

    assert.ok(
      menuGeneratorContent.includes("case 'openSwissKnifeApp':") &&
        menuGeneratorContent.includes('this.openSwissKnifeApp(item);'),
      'openSwissKnifeApp action should delegate through the app-aware launcher'
    );
    assert.ok(
      /openSwissKnifeApp\(item\)[\s\S]*const appName[\s\S]*item\.app[\s\S]*this\.createSwissKnifeWindow\(appName\);/.test(menuGeneratorContent),
      'app-aware launcher should pass the selected app id to createSwissKnifeWindow'
    );
  });
});

describe('Menu Configuration Tests', () => {
  it('should have all testable menu items defined', () => {
    const testableItems = getAllTestableItems();
    assert.ok(testableItems.length > 0, 'Should have testable menu items');
    assert.ok(testableItems.length >= 20, 'Should have at least 20 testable items');
  });

  it('should have all menu categories', () => {
    const testableItems = getAllTestableItems();
    const menus = new Set(testableItems.map(item => item.menu));
    
    assert.ok(menus.has('File'), 'Should have File menu');
    assert.ok(menus.has('Dashboards'), 'Should have Dashboards menu');
    assert.ok(menus.has('MCP Servers'), 'Should have MCP Servers menu');
    assert.ok(menus.has('Tools'), 'Should have Tools menu');
    assert.ok(menus.has('View'), 'Should have View menu');
  });

  it('should have MCP server controls for all servers', () => {
    const testableItems = getAllTestableItems();
    const mcpItems = testableItems.filter(item => item.menu === 'MCP Servers');
    
    // Should have controls for each server
    const serverIds = ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'];
    serverIds.forEach(serverId => {
      const serverItems = mcpItems.filter(item => item.serverId === serverId);
      assert.ok(serverItems.length >= 4, 
        `${serverId} should have at least 4 controls (start, stop, restart, dashboard)`);
    });
  });

  it('should have all dashboard sections', () => {
    const testableItems = getAllTestableItems();
    const dashboardItems = testableItems.filter(item => item.menu === 'Dashboards');
    
    const sections = new Set(dashboardItems.map(item => item.section).filter(Boolean));
    assert.ok(sections.has('IPFS MCP Servers'), 'Should have IPFS MCP Servers section');
    assert.ok(sections.has('Testing & Benchmarks'), 'Should have Testing & Benchmarks section');
    assert.ok(sections.has('Security & Authentication'), 'Should have Security & Authentication section');
    assert.ok(sections.has('Database & Storage'), 'Should have Database & Storage section');
    assert.ok(sections.has('System Management'), 'Should have System Management section');
  });

  it('should have keyboard shortcuts for main actions', () => {
    const testableItems = getAllTestableItems();
    const itemsWithShortcuts = testableItems.filter(item => item.accelerator);
    
    // Check for important shortcuts
    const shortcuts = itemsWithShortcuts.map(item => item.accelerator);
    assert.ok(shortcuts.includes('CommandOrControl+H'), 'Should have Home shortcut');
    assert.ok(shortcuts.includes('CmdOrCtrl+D'), 'Should have Dashboard shortcut');
    assert.ok(shortcuts.includes('CmdOrCtrl+M'), 'Should have MCP Control Panel shortcut');
  });

  it('should have navigation items', () => {
    const testableItems = getAllTestableItems();
    const navItems = testableItems.filter(item => item.menu === 'View');
    
    const labels = navItems.map(item => item.label);
    assert.ok(labels.includes('Back'), 'Should have Back navigation');
    assert.ok(labels.includes('Forward'), 'Should have Forward navigation');
  });

  it('should have valid paths for navigation items', () => {
    const testableItems = getAllTestableItems();
    const pathItems = testableItems.filter(item => item.path);
    
    pathItems.forEach(item => {
      assert.ok(
        item.path.includes('views/') || item.path.includes('dashboard/'),
        `${item.label} should have valid path directory`
      );
      assert.ok(
        item.path.endsWith('.html'),
        `${item.label} path should end with .html`
      );
    });
  });
});

// Run integrated menu structure tests
await runMenuStructureTests();

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('\n✅ All programmatic menu structure tests completed!\n');
}
