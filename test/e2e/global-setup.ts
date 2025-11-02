/**
 * Global Setup for Playwright Tests
 * Runs once before all tests
 */

import { FullConfig } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function globalSetup(config: FullConfig) {
  console.log('🔧 Running global setup...');
  
  // Create test-results directory structure
  const dirs = [
    'test-results',
    'test-results/screenshots',
    'test-results/videos',
    'test-results/traces',
    'test-results/artifacts',
    'test-results/html-report'
  ];
  
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
  
  console.log('✅ Created test output directories');
  
  // Verify Electron is available
  try {
    const { stdout } = await execAsync('npx electron --version');
    console.log(`✅ Electron version: ${stdout.trim()}`);
  } catch (err) {
    console.error('❌ Electron not available:', err);
    throw err;
  }
  
  // Check if Python is available for MCP servers
  try {
    const { stdout } = await execAsync('python --version');
    console.log(`✅ Python version: ${stdout.trim()}`);
  } catch (err) {
    console.warn('⚠️  Python not available - MCP servers may not start');
  }
  
  // Create test configuration
  const testConfig = {
    timestamp: new Date().toISOString(),
    ci: !!process.env.CI,
    environment: process.env.NODE_ENV || 'test',
    screenshot_dir: 'test-results/screenshots'
  };
  
  await fs.writeFile(
    'test-results/test-config.json',
    JSON.stringify(testConfig, null, 2)
  );
  
  console.log('✅ Global setup complete\n');
}

export default globalSetup;
