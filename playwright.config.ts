import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for MCP Daemon Manager Tests
 * 
 * See https://playwright.dev/docs/test-configuration
 */

export default defineConfig({
  testDir: './test/e2e',
  
  // Maximum time one test can run
  timeout: 60 * 1000,
  
  // Test execution settings
  fullyParallel: false, // Run tests serially for Electron
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for Electron tests
  
  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/test-results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],
  
  // Screenshot and video settings
  use: {
    // Take screenshot on failure
    screenshot: 'only-on-failure',
    
    // Record video on first retry
    video: 'retain-on-failure',
    
    // Collect trace on failure
    trace: 'retain-on-failure',
    
    // Base URL for any web content
    baseURL: 'http://localhost:5173',
  },

  // Output directory
  outputDir: 'test-results/artifacts',

  // Global setup/teardown
  globalSetup: './test/e2e/global-setup.ts',
  globalTeardown: './test/e2e/global-teardown.ts',

  // Projects - Electron doesn't use browser projects
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.ts',
    },
  ],

  // Web server for SwissKnife (optional)
  webServer: process.env.START_SWISSKNIFE ? {
    command: 'cd swissknife && npm run dev',
    port: 5173,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  } : undefined,
});
