# Menu System Visual Tests

This directory contains Playwright tests that capture screenshots of the programmatically generated menu system.

## Purpose

These tests provide visual documentation for PR reviews by:
- Capturing screenshots of all menu navigations
- Testing keyboard shortcuts functionality
- Validating all MCP dashboard accessibility
- Documenting the menu system visually

## Tests Included

### `menu-system.spec.ts`

Comprehensive test suite that:
1. Launches Electron app
2. Tests all keyboard shortcuts (⌘H, ⌘D, ⌘M, ⌘⌥1-4, etc.)
3. Navigates to all MCP dashboards
4. Tests back/forward navigation
5. Captures 11 screenshots of the menu system

## Running the Tests

### Run menu tests specifically:
```bash
# Run menu visual tests
npm run test:e2e:menu

# Run in headed mode to watch tests execute
npm run test:e2e:menu:headed

# Debug tests interactively
npm run test:e2e:menu:debug
```

### Run all E2E tests:
```bash
# Run all Playwright tests
npm run test:e2e

# Run with UI mode
npm run test:e2e:ui

# View test report
npm run test:e2e:report
```

## Screenshots Captured

All screenshots are saved to `test-results/screenshots/` with descriptive names:

1. `menu-01-initial-window.png` - Initial app window
2. `menu-02-home-navigation.png` - Home navigation (⌘H)
3. `menu-03-dashboard-shortcut.png` - Main Dashboard (⌘D)
4. `menu-04-ipfs-kit-dashboard.png` - IPFS Kit Dashboard (⌘⌥1)
5. `menu-05-ipfs-datasets-dashboard.png` - IPFS Datasets Dashboard (⌘⌥2)
6. `menu-06-ipfs-accelerate-dashboard.png` - IPFS Accelerate Dashboard (⌘⌥3)
7. `menu-07-swissknife-dashboard.png` - SwissKnife Dashboard (⌘⌥4)
8. `menu-08-mcp-control-panel.png` - MCP Control Panel (⌘M)
9. `menu-09-navigation-back.png` - Back navigation (Alt+←)
10. `menu-10-navigation-forward.png` - Forward navigation (Alt+→)
11. `menu-11-final-state.png` - Final state

A `SCREENSHOTS.md` summary document is also generated in the screenshots directory.

## GitHub Actions Integration

When run in CI/CD:
- Screenshots are automatically uploaded as artifacts
- Available in the Actions tab under "Artifacts"
- Retained for 30 days
- Generated on all platforms (Ubuntu, macOS, Windows)

To view screenshots from a PR:
1. Go to the PR's "Checks" tab
2. Click on "MCP Daemon Manager E2E Tests"
3. Scroll to the bottom to find artifacts
4. Download "screenshots-{os}-node-{version}"

## What's Being Tested

### Menu Structure
- ✅ Programmatically generated from `menu_config.js`
- ✅ All 4 MCP servers integrated
- ✅ 8 dashboard sections organized
- ✅ 50+ menu items defined

### Keyboard Shortcuts
- ✅ Navigation shortcuts (Home, Dashboard, MCP Control)
- ✅ MCP dashboard shortcuts (⌘⌥1-4)
- ✅ Back/Forward navigation (Alt+← / Alt+→)
- ✅ All shortcuts defined in configuration

### Dashboard Access
- ✅ IPFS Kit Dashboard
- ✅ IPFS Datasets Dashboard
- ✅ IPFS Accelerate Dashboard
- ✅ SwissKnife Dashboard
- ✅ MCP Control Panel

### Navigation System
- ✅ Single-window navigation
- ✅ Browser-style back/forward
- ✅ Keyboard shortcut support
- ✅ Smooth transitions

## Test Configuration

Tests are configured in `playwright.config.ts`:
- Single worker (serial execution)
- Screenshots on test execution
- Full-page captures
- Test timeout: 60 seconds
- Screenshots saved to `test-results/screenshots/`

## Platform Support

Tests run on:
- **Ubuntu** (latest)
- **macOS** (latest)
- **Windows** (latest)

With Node.js versions:
- 18.x
- 20.x

## Notes

- Tests execute quickly (< 30 seconds total)
- No MCP daemons needed (AUTO_START_DAEMONS=false)
- Keyboard shortcuts are platform-aware (⌘ on Mac, Ctrl on Windows/Linux)
- Screenshots are full-page captures showing entire application window
- Tests validate menu functionality, not visual regression

## Troubleshooting

### Tests fail to launch Electron
- Ensure Node.js and npm dependencies are installed
- Check that Electron is available: `npx electron --version`
- Try running in headed mode: `npm run test:e2e:menu:headed`

### Screenshots not captured
- Check `test-results/screenshots/` directory exists
- Verify write permissions
- Review test output for errors

### Keyboard shortcuts don't work
- This is expected behavior in some environments
- Tests handle platform differences automatically
- Check console output for navigation confirmations

## Contributing

When adding new menu items:
1. Add to `menu_config.js`
2. If it has a keyboard shortcut, add a test here
3. Capture a screenshot of the new navigation
4. Update this README with the new screenshot

## Related Documentation

- `MENU_SYSTEM.md` - Complete menu system documentation
- `MENU_VISUAL.md` - Visual menu structure reference
- `test/test_programmatic_menu.js` - Unit tests for menu configuration
- `test/menu_test_framework.js` - Menu testing framework
