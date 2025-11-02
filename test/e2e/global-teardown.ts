/**
 * Global Teardown for Playwright Tests
 * Runs once after all tests
 */

import { FullConfig } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

async function globalTeardown(config: FullConfig) {
  console.log('\n🧹 Running global teardown...');
  
  // Generate test summary
  try {
    const resultsPath = 'test-results/test-results.json';
    const results = JSON.parse(await fs.readFile(resultsPath, 'utf-8'));
    
    const summary = {
      timestamp: new Date().toISOString(),
      total: results.suites?.reduce((acc: number, suite: any) => 
        acc + (suite.specs?.length || 0), 0) || 0,
      passed: results.suites?.reduce((acc: number, suite: any) => 
        acc + (suite.specs?.filter((s: any) => s.ok).length || 0), 0) || 0,
      failed: results.suites?.reduce((acc: number, suite: any) => 
        acc + (suite.specs?.filter((s: any) => !s.ok).length || 0), 0) || 0,
      screenshots_captured: 0
    };
    
    // Count screenshots
    try {
      const screenshots = await fs.readdir('test-results/screenshots');
      summary.screenshots_captured = screenshots.length;
    } catch (err) {
      // No screenshots directory yet
    }
    
    await fs.writeFile(
      'test-results/summary.json',
      JSON.stringify(summary, null, 2)
    );
    
    console.log('📊 Test Summary:');
    console.log(`   Total: ${summary.total}`);
    console.log(`   Passed: ${summary.passed}`);
    console.log(`   Failed: ${summary.failed}`);
    console.log(`   Screenshots: ${summary.screenshots_captured}`);
    
  } catch (err) {
    console.warn('⚠️  Could not generate test summary:', err);
  }
  
  console.log('✅ Global teardown complete');
}

export default globalTeardown;
