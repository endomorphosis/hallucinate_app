# Playwright E2E Testing - Quick Reference

## Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install --with-deps
```

## Running Tests

### Basic Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run with visible browser
npm run test:e2e:headed

# Interactive UI mode
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug

# CI mode
npm run test:e2e:ci

# Show HTML report
npm run test:e2e:report
```

### Using Test Script

```bash
# All tests (headless)
./test/e2e/run-tests.sh

# All tests (with display)
./test/e2e/run-tests.sh all headed

# Electron tests only
./test/e2e/run-tests.sh electron

# Screenshot capture mode
./test/e2e/run-tests.sh screenshot

# CI/CD mode
./test/e2e/run-tests.sh ci

# Debug mode
./test/e2e/run-tests.sh debug

# UI mode
./test/e2e/run-tests.sh ui
```

## Test Modes

| Mode | Command | Description |
|------|---------|-------------|
| **all** | `./test/e2e/run-tests.sh all` | Run all tests (default) |
| **electron** | `./test/e2e/run-tests.sh electron` | Electron tests only |
| **screenshot** | `./test/e2e/run-tests.sh screenshot` | Capture screenshots |
| **ci** | `./test/e2e/run-tests.sh ci` | CI/CD mode |
| **debug** | `./test/e2e/run-tests.sh debug` | Interactive debugging |
| **ui** | `./test/e2e/run-tests.sh ui` | Visual test runner |

## Display Modes

| Mode | Description |
|------|-------------|
| **headless** | No visible windows (default) |
| **headed** | Show browser windows |

Example: `./test/e2e/run-tests.sh all headed`

## Test Output

### Directory Structure

```
test-results/
├── screenshots/          # PNG screenshots
│   ├── 01-app-launch.png
│   ├── 02-app-launched.png
│   ├── 03-main-window.png
│   ├── 04-after-daemon-start.png
│   ├── 05-daemon-manager.png
│   ├── 06-daemon-status.png
│   ├── 07-swissknife-window.png
│   ├── 08-control-buttons.png
│   ├── 09-event-log.png
│   └── ...
├── videos/               # Test execution videos
├── traces/               # Playwright traces
├── html-report/          # Interactive HTML report
├── junit.xml            # JUnit XML format
├── test-results.json    # JSON format
└── summary.json         # Test summary
```

### Screenshot Naming Convention

- `01-` prefix indicates sequence number
- Descriptive name follows (e.g., `daemon-manager`)
- Always `.png` format
- Full page screenshots by default

## Viewing Results

### HTML Report

```bash
# Generate and open HTML report
npx playwright show-report

# Or open manually
open test-results/html-report/index.html
```

### Screenshots

```bash
# View screenshots
ls test-results/screenshots/

# Open specific screenshot
open test-results/screenshots/05-daemon-manager.png
```

### Traces

```bash
# View trace file
npx playwright show-trace test-results/traces/trace.zip
```

## CI/CD Integration

### GitHub Actions

Workflow: `.github/workflows/mcp-daemon-e2e.yml`

**Triggers:**
- Push to main/develop
- Pull requests
- Manual dispatch

**Matrix:**
- OS: Ubuntu, macOS, Windows
- Node: 18.x, 20.x

**Artifacts:**
- Screenshots (30 days)
- Test results (30 days)
- HTML reports (30 days)
- Documentation (90 days)

### Running Locally Like CI

```bash
CI=true npm run test:e2e
```

## Common Tasks

### Capture Screenshots for Documentation

```bash
# Run tests and capture all screenshots
./test/e2e/run-tests.sh screenshot

# Screenshots saved to test-results/screenshots/
```

### Debug a Failing Test

```bash
# Run in debug mode
npm run test:e2e:debug

# Or use UI mode
npm run test:e2e:ui
```

### Update Test Snapshots

```bash
# Update visual snapshots
npx playwright test --update-snapshots
```

### Run Single Test

```bash
# By name
npx playwright test -g "App launches successfully"

# By file
npx playwright test test/e2e/mcp-daemon-manager.spec.ts
```

### Clean Test Results

```bash
# Remove all test results
rm -rf test-results/

# Directories will be recreated on next run
```

## Troubleshooting

### Playwright Not Installed

```bash
npm install -D @playwright/test playwright
npx playwright install --with-deps
```

### Electron Not Found

```bash
npm install electron
```

### Display Issues (Linux)

```bash
# Install X11 dependencies
sudo apt-get install xvfb libgtk-3-0

# Run with xvfb
xvfb-run npx playwright test
```

### Port Already in Use

```bash
# Check ports 3001-3003
lsof -i :3001 :3002 :3003

# Kill processes
kill -9 <PID>
```

### Python MCP Servers Won't Start

```bash
# Install Python packages
cd ipfs_kit_py && pip install -e . && cd ..
cd ipfs_datasets_py && pip install -e . && cd ..
cd ipfs_accelerate_py && pip install -e . && cd ..
```

### Tests Timeout

```bash
# Increase timeout in playwright.config.ts
timeout: 120 * 1000  // 120 seconds
```

## Test Coverage

### What Gets Tested

✅ Application launch
✅ Menu system
✅ MCP daemon auto-start
✅ Daemon Manager dashboard
✅ SwissKnife integration
✅ UI controls (buttons, logs)
✅ All window types
✅ Graceful shutdown

### What Gets Screenshotted

✅ Initial app state
✅ After daemon startup
✅ Daemon Manager views
✅ SwissKnife window
✅ Control interfaces
✅ Event logs
✅ All accessible windows

## Advanced Usage

### Custom Screenshot

```typescript
// In test file
await page.screenshot({
  path: 'custom-screenshot.png',
  fullPage: true,
  clip: { x: 0, y: 0, width: 800, height: 600 }
});
```

### Record Video

```typescript
// In playwright.config.ts
use: {
  video: 'on'  // Always record
}
```

### Slow Motion

```bash
# Slow down test execution
npx playwright test --headed --slowMo=1000
```

### Filter Tests

```bash
# By tag
npx playwright test --grep @smoke

# Exclude tag
npx playwright test --grep-invert @slow
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CI` | `false` | Enable CI mode |
| `NODE_ENV` | `development` | Environment |
| `START_SWISSKNIFE` | `false` | Auto-start SwissKnife |
| `ELECTRON_ENABLE_LOGGING` | `false` | Enable Electron logs |
| `AUTO_START_DAEMONS` | `true` | Auto-start MCP daemons |

## Resources

- 📚 [Full Documentation](test/e2e/README.md)
- 🎭 [Playwright Docs](https://playwright.dev)
- 🔧 [Config Reference](playwright.config.ts)
- 🧪 [Test Suite](test/e2e/mcp-daemon-manager.spec.ts)

## Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Install browsers: `npx playwright install --with-deps`
3. ✅ Run tests: `npm run test:e2e`
4. ✅ View results: `npm run test:e2e:report`
5. ✅ Check screenshots: `ls test-results/screenshots/`
