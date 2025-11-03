/**
 * Menu Structure Validation Test
 * 
 * This test validates that the menu structure in index.js is correctly
 * organized and includes all required items.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Menu Structure Tests', () => {
  let indexContent;

  // Read the index.js file
  try {
    indexContent = readFileSync(join(__dirname, '..', 'index.js'), 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read index.js: ${err.message}`);
  }

  it('should have File menu with required items', () => {
    assert.ok(indexContent.includes("label: 'File'"), 'File menu should exist');
    assert.ok(indexContent.includes("label: 'Home'"), 'Home menu item should exist');
    assert.ok(indexContent.includes("label: 'Settings'"), 'Settings menu item should exist');
    assert.ok(indexContent.includes("role: 'quit'"), 'Quit menu item should exist');
  });

  it('should have Dashboards menu with all required sections', () => {
    assert.ok(indexContent.includes("label: 'Dashboards'"), 'Dashboards menu should exist');
    assert.ok(indexContent.includes("label: 'Main Dashboard'"), 'Main Dashboard should exist');
    assert.ok(indexContent.includes("label: 'IPFS MCP Servers'"), 'IPFS MCP Servers section should exist');
    assert.ok(indexContent.includes("label: 'Testing & Benchmarks'"), 'Testing & Benchmarks section should exist');
    assert.ok(indexContent.includes("label: 'Security & Authentication'"), 'Security & Authentication section should exist');
    assert.ok(indexContent.includes("label: 'Database & Storage'"), 'Database & Storage section should exist');
    assert.ok(indexContent.includes("label: 'System Management'"), 'System Management section should exist');
  });

  it('should have all three IPFS MCP dashboards', () => {
    assert.ok(indexContent.includes("label: 'IPFS Kit Dashboard'"), 'IPFS Kit Dashboard should exist');
    assert.ok(indexContent.includes("label: 'IPFS Datasets Dashboard'"), 'IPFS Datasets Dashboard should exist');
    assert.ok(indexContent.includes("label: 'IPFS Accelerate Dashboard'"), 'IPFS Accelerate Dashboard should exist');
  });

  it('should have MCP Servers menu with all three servers', () => {
    assert.ok(indexContent.includes("label: 'MCP Servers'"), 'MCP Servers menu should exist');
    assert.ok(indexContent.includes("label: 'IPFS Kit MCP'"), 'IPFS Kit MCP should exist');
    assert.ok(indexContent.includes("label: 'IPFS Datasets MCP'"), 'IPFS Datasets MCP should exist');
    assert.ok(indexContent.includes("label: 'IPFS Accelerate MCP'"), 'IPFS Accelerate MCP should exist');
  });

  it('should have Tools menu', () => {
    assert.ok(indexContent.includes("label: 'Tools'"), 'Tools menu should exist');
    assert.ok(indexContent.includes("label: 'SwissKnife Virtual Desktop'"), 'SwissKnife should be in Tools menu');
    assert.ok(indexContent.includes("label: 'Model Tester'"), 'Model Tester should be in Tools menu');
  });

  it('should have View menu with navigation controls', () => {
    assert.ok(indexContent.includes("label: 'View'"), 'View menu should exist');
    assert.ok(indexContent.includes("label: 'Back'"), 'Back navigation should exist');
    assert.ok(indexContent.includes("label: 'Forward'"), 'Forward navigation should exist');
    assert.ok(indexContent.includes("role: 'reload'"), 'Reload should exist');
    assert.ok(indexContent.includes("role: 'toggleDevTools'"), 'DevTools toggle should exist');
  });

  it('should have Help menu', () => {
    assert.ok(indexContent.includes("label: 'Help'"), 'Help menu should exist');
    assert.ok(indexContent.includes("label: 'Documentation'"), 'Documentation should exist');
    assert.ok(indexContent.includes("label: 'Report Issue'"), 'Report Issue should exist');
    assert.ok(indexContent.includes("label: 'About'"), 'About should exist');
  });

  it('should have mainWindow variable for single-window navigation', () => {
    assert.ok(indexContent.includes('let mainWindow = null'), 'mainWindow variable should exist');
  });

  it('should have navigateToView function', () => {
    assert.ok(indexContent.includes('const navigateToView'), 'navigateToView function should exist');
    assert.ok(indexContent.includes('mainWindow.loadFile(viewPath)'), 'navigateToView should load file in main window');
  });

  it('should have IPC handlers for navigation', () => {
    assert.ok(indexContent.includes("ipcMain.on('open-daemon-manager'"), 'open-daemon-manager IPC handler should exist');
    assert.ok(indexContent.includes("ipcMain.on('open-model-tester'"), 'open-model-tester IPC handler should exist');
    assert.ok(indexContent.includes("ipcMain.on('open-security-test-dashboard'"), 'open-security-test-dashboard IPC handler should exist');
    assert.ok(indexContent.includes("ipcMain.on('open-database-backup-dashboard'"), 'open-database-backup-dashboard IPC handler should exist');
  });

  it('should reference the new dashboard HTML files', () => {
    assert.ok(indexContent.includes('ipfs_datasets_dashboard.html'), 'Should reference IPFS Datasets dashboard HTML');
    assert.ok(indexContent.includes('ipfs_accelerate_dashboard.html'), 'Should reference IPFS Accelerate dashboard HTML');
  });

  it('should have keyboard shortcuts for main actions', () => {
    assert.ok(indexContent.includes("accelerator: 'CommandOrControl+H'"), 'Home keyboard shortcut should exist');
    assert.ok(indexContent.includes("accelerator: 'CommandOrControl+D'"), 'Dashboard keyboard shortcut should exist');
    assert.ok(indexContent.includes("accelerator: 'Alt+Left'"), 'Back keyboard shortcut should exist');
    assert.ok(indexContent.includes("accelerator: 'Alt+Right'"), 'Forward keyboard shortcut should exist');
  });

  it('should not have duplicate Daemons menu', () => {
    const daemonsCount = (indexContent.match(/label: 'Daemons'/g) || []).length;
    assert.strictEqual(daemonsCount, 0, 'Old Daemons menu should be removed (replaced by MCP Servers)');
  });

  it('should not have old window creation functions', () => {
    assert.ok(!indexContent.includes('const createBenchmarkWindow'), 'createBenchmarkWindow should be removed');
    assert.ok(!indexContent.includes('const createTestWindow'), 'createTestWindow should be removed');
    assert.ok(!indexContent.includes('const createIPFSKitDashboardWindow'), 'createIPFSKitDashboardWindow should be removed');
    assert.ok(!indexContent.includes('const createDaemonManagerWindow'), 'createDaemonManagerWindow should be removed (inline HTML removed)');
    assert.ok(!indexContent.includes('const createSwissKnifeWindow'), 'createSwissKnifeWindow should be removed (inline HTML removed)');
  });

  it('should have only one createWindow function', () => {
    const createWindowCount = (indexContent.match(/const createWindow = /g) || []).length;
    assert.strictEqual(createWindowCount, 1, 'Should have exactly one createWindow function');
  });

  it('should set mainWindow in createWindow function', () => {
    assert.ok(indexContent.includes('mainWindow = new BrowserWindow'), 'createWindow should set mainWindow');
    assert.ok(indexContent.includes("mainWindow.on('closed'"), 'createWindow should handle window close');
  });
});

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running menu structure validation tests...\n');
}
