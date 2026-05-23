# Playwright E2E Testing for MCP Daemon Manager

## Overview

Comprehensive Playwright test harness for the MCP Daemon Manager and SwissKnife integration. This test suite enables:

- **Screenshot capture** for documentation
- **CI/CD automation** via GitHub Actions
- **Cross-platform testing** (Linux, macOS, Windows)
- **Automated validation** of all features
- **Visual regression testing** capabilities

For the virtual AI OS integration work, this E2E area complements the hardware-free backend and mobile harnesses that already validate task-state-to-display-widget emission without paired hardware:

- backend: `tests/test_virtual_ai_os_end_to_end.py`
- mobile: `mobile/src/utils/__tests__/displayWidgetHarness.test.js`
- desktop/operator shell: this Playwright suite for Hallucinate App + SwissKnife + daemon-manager workflows

Taken together, these harnesses give operators one repeatable path from daemon task progress to desktop/mobile/glasses fallback rendering.

For physical-device readiness, this desktop operator suite should also capture evidence for degraded display handling, rollback behavior, and the operator-visible state that accompanies a mobile or glasses fallback.

## Quick Start

### Install Dependencies

```bash
# Install Playwright
npm install -D @playwright/test playwright

# Install Playwright browsers
npx playwright install --with-deps
```

### Run Tests

```bash
# Run all tests
./test/e2e/run-tests.sh

# Run with visible windows
./test/e2e/run-tests.sh all headed

# Run in debug mode
./test/e2e/run-tests.sh debug

# Run in UI mode (interactive)
./test/e2e/run-tests.sh ui

# CI/CD mode
./test/e2e/run-tests.sh ci
```

### Direct Playwright Commands

```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test test/e2e/mcp-daemon-manager.spec.ts

# Run with UI mode
npx playwright test --ui

# Debug mode
npx playwright test --debug

# Generate HTML report
npx playwright show-report
```

## Test Structure

### Test Files

```
test/e2e/
├── mcp-daemon-manager.spec.ts  # Main test suite
├── global-setup.ts             # Pre-test setup
├── global-teardown.ts          # Post-test cleanup
└── run-tests.sh                # Test runner script

playwright.config.ts             # Playwright configuration
```

### Test Coverage

**Application Launch Tests:**
- ✅ App launches successfully
- ✅ Menu system is present
- ✅ Main window loads correctly

**MCP Daemon Tests:**
- ✅ Daemons auto-start after delay
- ✅ Daemon Manager window opens
- ✅ Daemon status is displayed
- ✅ All 3 MCP servers are shown (Kit, Datasets, Accelerate)

**SwissKnife Integration Tests:**
- ✅ SwissKnife window opens
- ✅ Content loads correctly
- ✅ MCP integration verified

**UI Component Tests:**
- ✅ Control buttons present (Start/Stop/Restart)
- ✅ Event log is functional
- ✅ All windows accessible via menu

**Shutdown Tests:**
- ✅ Graceful shutdown
- ✅ Daemon cleanup on exit

## Screenshot Capture

### Automatic Screenshots

Tests automatically capture screenshots at key points:

1. `01-app-launch.png` - Initial app startup
2. `02-app-launched.png` - After successful launch
3. `03-main-window.png` - Main window view
4. `04-after-daemon-start.png` - After MCP daemons start
5. `05-daemon-manager.png` - Daemon Manager dashboard
6. `06-daemon-status.png` - Daemon status display
7. `07-swissknife-window.png` - SwissKnife virtual desktop
8. `08-control-buttons.png` - Control interface
9. `09-event-log.png` - Event log view
10. `10+` - Additional windows (Test Interface, Benchmark, etc.)

### Screenshot Location

```
test-results/
├── screenshots/          # All captured screenshots
├── videos/              # Test execution videos (on failure)
├── traces/              # Playwright traces (on failure)
├── html-report/         # Interactive HTML report
├── junit.xml            # JUnit format results
├── test-results.json    # JSON format results
└── summary.json         # Test summary
```

### Manual Screenshot Capture

```typescript
// In tests
await page.screenshot({
  path: 'test-results/screenshots/my-screenshot.png',
  fullPage: true
});
```

## CI/CD Integration

### GitHub Actions Workflow

The `.github/workflows/mcp-daemon-e2e.yml` workflow:

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests
- Manual workflow dispatch

**Test Matrix:**
- **OS:** Ubuntu, macOS, Windows
- **Node:** 18.x, 20.x
- **Python:** 3.12

**Outputs:**
- Screenshots uploaded as artifacts
- HTML test reports
- JUnit XML results
- Automatic documentation generation

### Running in CI

```bash
# Set CI environment variable
CI=true npx playwright test

# Or use the script
./test/e2e/run-tests.sh ci
```

### Artifacts

GitHub Actions uploads:
- `screenshots-{os}-node-{version}` - Screenshot artifacts
- `test-results-{os}-node-{version}` - Test results
- `html-report-{os}-node-{version}` - HTML reports
- `screenshot-documentation` - Generated documentation

## Configuration

### Playwright Config (`playwright.config.ts`)

```typescript
{
  timeout: 60000,           // 60s per test
  workers: 1,               // Serial execution for Electron
  retries: 2,              // Retry on CI
  reporter: [              // Multiple reporters
    'html',
    'json',
    'junit',
    'list'
  ],
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure'
  }
}
```

### Environment Variables

- `CI=true` - Enable CI mode
- `NODE_ENV=test` - Test environment
- `START_SWISSKNIFE=true` - Auto-start SwissKnife dev server
- `ELECTRON_ENABLE_LOGGING=1` - Enable Electron logging

## Advanced Usage

### Debug Mode

```bash
# Interactive debugging
npx playwright test --debug

# Step through tests
npx playwright test --headed --slowMo=1000
```

### UI Mode

```bash
# Interactive test runner
npx playwright test --ui
```

### Headed Mode

```bash
# Watch tests execute
npx playwright test --headed
```

### Specific Tests

```bash
# Run single test
npx playwright test -g "App launches successfully"

# Run specific file
npx playwright test test/e2e/mcp-daemon-manager.spec.ts
```

### Update Snapshots

```bash
# Update visual snapshots
npx playwright test --update-snapshots
```

## Troubleshooting

### Electron Not Found

```bash
# Install Electron
npm install electron
```

### Display Issues (Linux)

```bash
# Install X11 dependencies
sudo apt-get install xvfb libgtk-3-0

# Run with xvfb
xvfb-run npx playwright test
```

### Permission Issues

```bash
# Make script executable
chmod +x test/e2e/run-tests.sh
```

### Python MCP Servers Not Starting

```bash
# Install MCP dependencies
cd ipfs_kit_py && pip install -e .
cd ipfs_datasets_py && pip install -e .
cd ipfs_accelerate_py && pip install -e .
```

### Port Conflicts

```bash
# Check for processes on MCP ports
lsof -i :3001
lsof -i :3002
lsof -i :3003

# Kill if necessary
kill -9 <PID>
```

## Best Practices

### Writing Tests

1. **Use descriptive test names**
2. **Wait for elements properly** - Use `waitForSelector()` not `setTimeout()`
3. **Take screenshots at key points**
4. **Clean up resources** in `afterAll()`
5. **Use page object pattern** for complex UIs

### Screenshot Guidelines

1. **Capture full page** - Use `fullPage: true`
2. **Meaningful names** - Use descriptive filenames
3. **Consistent timing** - Wait for animations to complete
4. **High quality** - Default PNG format

### CI/CD Best Practices

1. **Fast feedback** - Run critical tests first
2. **Parallel where possible** - But not for Electron
3. **Retry flaky tests** - But investigate root cause
4. **Upload artifacts** - Always preserve screenshots
5. **Clear reporting** - Use multiple reporter formats

## Example Test

```typescript
test('Daemon Manager shows all MCP servers', async () => {
  // Open Daemon Manager via menu
  await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const daemonsMenu = menu.items.find(item => item.label === 'Daemons');
    const managerItem = daemonsMenu.submenu.items.find(
      item => item.label === 'Daemon Manager'
    );
    managerItem.click();
  });

  // Wait for window
  await window.waitForTimeout(2000);
  
  // Find daemon manager window
  const windows = electronApp.windows();
  const dmWindow = windows.find(w => w.title().includes('Daemon Manager'));
  
  // Capture screenshot
  await dmWindow.screenshot({
    path: 'test-results/screenshots/daemon-manager.png',
    fullPage: true
  });
  
  // Verify content
  const content = await dmWindow.content();
  expect(content).toContain('IPFS Kit MCP');
  expect(content).toContain('IPFS Datasets MCP');
  expect(content).toContain('IPFS Accelerate MCP');
});
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [GitHub Actions](https://docs.github.com/en/actions)

## Contributing

When adding new tests:

1. Follow existing test structure
2. Add descriptive comments
3. Capture screenshots for documentation
4. Update this README if needed
5. Test locally before committing
6. Verify CI passes

## Support

For issues or questions:

1. Check test output in `test-results/html-report/`
2. Review screenshots in `test-results/screenshots/`
3. Check traces in `test-results/traces/`
4. Review GitHub Actions logs for CI failures
