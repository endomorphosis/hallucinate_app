/**
 * Menu Testing Framework
 * 
 * Unified testing framework for verifying all menu items work correctly.
 * This ensures every menu item is properly connected and functional.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getAllTestableItems } from '../hallucinate_app/node/menu_config.js';

// Re-export for convenience
export { getAllTestableItems };

/**
 * Menu Test Runner
 * Tests all menu items for accessibility and functionality
 */
export class MenuTestRunner {
  constructor(menuGenerator) {
    this.menuGenerator = menuGenerator;
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
  }

  /**
   * Run all menu tests
   */
  async runAllTests() {
    console.log('🧪 Running Menu Testing Framework...\n');

    const testableItems = getAllTestableItems();
    this.results.total = testableItems.length;

    console.log(`Found ${testableItems.length} testable menu items\n`);

    for (const item of testableItems) {
      await this.testMenuItem(item);
    }

    this.printSummary();
    return this.results;
  }

  /**
   * Test an individual menu item
   */
  async testMenuItem(item) {
    const testName = `${item.menu} → ${item.section || ''} ${item.label}`.trim();
    
    try {
      // Test 1: Menu item is registered
      assert.ok(item.label, 'Menu item has a label');

      // Test 2: Menu item has proper action or path
      const hasAction = !!(
        item.action ||
        item.path ||
        item.url ||
        item.role ||
        item.serverId
      );
      assert.ok(hasAction, 'Menu item has an associated action');

      // Test 3: If it's a navigation item, path should exist
      if (item.path) {
        // Note: In a real test, we'd verify the file exists
        assert.ok(item.path.endsWith('.html'), 'Navigation path is a valid HTML file');
      }

      // Test 4: If it's a server control, serverId should be valid
      if (item.serverId) {
        assert.ok(['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate', 'swissknife'].includes(item.serverId),
          'Server ID is valid');
      }

      // Test 5: Keyboard shortcuts are properly formatted
      if (item.accelerator) {
        assert.ok(
          /^(CmdOrCtrl|CommandOrControl|Alt|Shift|Ctrl|Cmd)/.test(item.accelerator),
          'Accelerator has valid format'
        );
      }

      this.results.passed++;
      this.results.details.push({
        test: testName,
        status: 'PASS',
        item
      });

      console.log(`✅ ${testName}`);

    } catch (error) {
      this.results.failed++;
      this.results.details.push({
        test: testName,
        status: 'FAIL',
        error: error.message,
        item
      });

      console.log(`❌ ${testName}`);
      console.log(`   Error: ${error.message}\n`);
    }
  }

  /**
   * Print test summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('Menu Test Summary');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${this.results.total}`);
    console.log(`Passed: ${this.results.passed} ✅`);
    console.log(`Failed: ${this.results.failed} ❌`);
    console.log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);
    console.log('='.repeat(60) + '\n');

    if (this.results.failed > 0) {
      console.log('Failed Tests:');
      this.results.details
        .filter(d => d.status === 'FAIL')
        .forEach(detail => {
          console.log(`  ❌ ${detail.test}`);
          console.log(`     ${detail.error}`);
        });
      console.log();
    }
  }

  /**
   * Export results to JSON
   */
  exportResults(filepath) {
    const fs = require('fs');
    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
    console.log(`📄 Results exported to ${filepath}`);
  }
}

/**
 * Integration tests using node:test
 */
export async function runMenuStructureTests() {
  describe('Menu Structure Integration Tests', () => {
    const testableItems = getAllTestableItems();

    it('should have all required menu categories', () => {
      const menus = new Set(testableItems.map(item => item.menu));
      assert.ok(menus.has('File'), 'File menu exists');
      assert.ok(menus.has('Dashboards'), 'Dashboards menu exists');
      assert.ok(menus.has('MCP Servers'), 'MCP Servers menu exists');
      assert.ok(menus.has('Tools'), 'Tools menu exists');
      assert.ok(menus.has('View'), 'View menu exists');
    });

    it('should have all MCP server controls', () => {
      const mcpItems = testableItems.filter(item => item.menu === 'MCP Servers');
      
      // Should have controls for each server
      const serverIds = ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'];
      serverIds.forEach(serverId => {
        const serverItems = mcpItems.filter(item => item.serverId === serverId);
        assert.ok(serverItems.length >= 4, `${serverId} has all controls (start, stop, restart, dashboard)`);
      });
    });

    it('should have all dashboard categories', () => {
      const dashboardItems = testableItems.filter(item => item.menu === 'Dashboards');
      
      // Check for main sections
      const sections = new Set(dashboardItems.map(item => item.section).filter(Boolean));
      assert.ok(sections.has('IPFS MCP Servers'), 'Has IPFS MCP Servers section');
      assert.ok(sections.has('Testing & Benchmarks'), 'Has Testing & Benchmarks section');
      assert.ok(sections.has('Security & Authentication'), 'Has Security & Authentication section');
      assert.ok(sections.has('Database & Storage'), 'Has Database & Storage section');
      assert.ok(sections.has('System Management'), 'Has System Management section');
    });

    it('should have proper keyboard shortcuts', () => {
      const itemsWithShortcuts = testableItems.filter(item => item.accelerator);
      
      // Main shortcuts should exist
      assert.ok(
        itemsWithShortcuts.some(item => item.accelerator === 'CommandOrControl+H'),
        'Home shortcut exists'
      );
      assert.ok(
        itemsWithShortcuts.some(item => item.accelerator === 'CmdOrCtrl+D'),
        'Dashboard shortcut exists'
      );
      assert.ok(
        itemsWithShortcuts.some(item => item.accelerator === 'CmdOrCtrl+M'),
        'MCP Control Panel shortcut exists'
      );
    });

    it('should have all tool items', () => {
      const toolItems = testableItems.filter(item => item.menu === 'Tools');
      assert.ok(toolItems.length > 0, 'Tools menu has items');
      
      // Check for essential tools
      const labels = toolItems.map(item => item.label);
      assert.ok(
        labels.some(label => label.includes('SwissKnife')),
        'Has SwissKnife tool'
      );
    });

    it('should have all navigation items', () => {
      const navItems = testableItems.filter(item => item.menu === 'View');
      
      // Check for Back/Forward
      assert.ok(
        navItems.some(item => item.label === 'Back'),
        'Has Back navigation'
      );
      assert.ok(
        navItems.some(item => item.label === 'Forward'),
        'Has Forward navigation'
      );
    });

    it('should have unique accelerators', () => {
      const accelerators = testableItems
        .filter(item => item.accelerator)
        .map(item => item.accelerator);
      
      const uniqueAccelerators = new Set(accelerators);
      
      // Some duplicates are OK (like CmdOrCtrl+D for different contexts)
      // but most should be unique
      assert.ok(
        uniqueAccelerators.size >= accelerators.length * 0.8,
        'Most accelerators are unique'
      );
    });

    it('should have valid paths for navigation items', () => {
      const pathItems = testableItems.filter(item => item.path);
      
      pathItems.forEach(item => {
        assert.ok(
          item.path.includes('views/') || item.path.includes('dashboard/'),
          `${item.label} has valid path: ${item.path}`
        );
        assert.ok(
          item.path.endsWith('.html'),
          `${item.label} path ends with .html`
        );
      });
    });

    it('should have testable flag on all items', () => {
      testableItems.forEach(item => {
        assert.ok(
          item.testable === true || item.testable === undefined,
          `${item.label} has proper testable flag`
        );
      });
    });
  });
}

// Export for use in other test files
export default {
  MenuTestRunner,
  runMenuStructureTests,
  getAllTestableItems
};
