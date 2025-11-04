# Programmatic Menu Generation System

## Overview

The Electron app's menu system has been redesigned to use a programmatic generation approach. This provides better maintainability, testability, and extensibility compared to the previous hardcoded menu structure.

## Architecture

### Components

1. **Menu Configuration** (`hallucinate_app/node/menu_config.js`)
   - Central configuration for all menu items
   - Defines MCP servers with metadata
   - Organizes dashboards by category
   - Specifies tools and keyboard shortcuts
   - Exports testable menu items for the testing framework

2. **Menu Generator** (`hallucinate_app/node/menu_generator.js`)
   - Programmatically builds Electron menu from configuration
   - Handles navigation and actions
   - Manages keyboard shortcuts
   - Integrates with daemon manager for MCP server controls

3. **Testing Framework** (`test/menu_test_framework.js`)
   - Unified testing for all menu items
   - Validates menu structure and accessibility
   - Tests keyboard shortcuts and navigation
   - Provides comprehensive test runner

## Benefits

### 1. Maintainability
- Menu structure defined in configuration, not scattered through code
- Easy to understand and modify
- Single source of truth for menu structure
- Reduced code duplication (~700 lines removed from index.js)

### 2. Testability
- Every menu item automatically testable
- Comprehensive test coverage (25 test cases)
- Validates structure, navigation, and actions
- Easy to add tests for new menu items

### 3. Extensibility
- Simple to add new MCP servers
- Easy to add new dashboard categories
- Tool items can be added without code changes
- Configuration-driven approach supports dynamic menus

### 4. Consistency
- All menu items follow same pattern
- Consistent keyboard shortcut formatting
- Uniform navigation handling
- Standardized action patterns

## Menu Structure

### File Menu
- Home (⌘H)
- Settings (⌘,)
- Quit

### Dashboards Menu
Organized into logical sections:
- **Main Dashboard** (⌘D)
- **IPFS MCP Servers** - Dashboards for all MCP servers
- **Testing & Benchmarks** - Test interface, benchmarks, model tester
- **Security & Authentication** - Auth and security dashboards
- **Database & Storage** - Database and content index dashboards
- **System Management** - Daemon manager and usage dashboards

### MCP Servers Menu
- **Global Controls**:
  - MCP Control Panel (⌘M)
  - Start/Stop/Restart All Servers
- **Per-Server Controls** (IPFS Kit, Datasets, Accelerate, SwissKnife):
  - Start/Stop/Restart
  - Open Dashboard
  - Server-specific Tools
  - View Logs

### Tools Menu
- IPFS Kit Tools (Add, Get, Pin, Status, Configure)
- Dataset Tools (Load, Create, Transform, Export, GraphRAG, Scraper)
- Accelerate Tools (Inference, Batch, Training, GPU Monitor, Metrics)
- SwissKnife Apps (Terminal, Editor, Files, Chat, Music, Video)

### View Menu
- Navigation (Back, Forward)
- Reload/Force Reload
- DevTools
- Zoom Controls
- Fullscreen

### Configuration Menu
- MCP Server Settings
- Network Settings
- Security Settings
- Reset to Defaults

### Help Menu
- Documentation (per MCP server)
- Check for Updates
- Report Issue
- About

## Adding New Menu Items

### Adding a New MCP Server

1. Add server configuration to `mcpServers` array in `menu_config.js`:

```javascript
{
  id: 'new-server',
  name: 'New Server MCP',
  displayName: 'New Server',
  icon: '🆕',
  port: 3005,
  dashboardPath: 'views/new_server_dashboard.html',
  webDashboardUrl: 'http://127.0.0.1:3005/dashboard',
  accelerator: 'CmdOrCtrl+Alt+5',
  tools: [
    { label: 'Tool 1', url: 'http://127.0.0.1:3005/tools/tool1' },
    // ... more tools
  ]
}
```

2. Menu items are automatically generated for:
   - Dashboards menu entry
   - MCP Servers controls
   - Tools submenu
   - All keyboard shortcuts

3. Add server to daemon manager configuration if needed

### Adding a New Dashboard

1. Add to appropriate section in `dashboards` object in `menu_config.js`:

```javascript
// For example, in the testing section:
testing: {
  label: 'Testing & Benchmarks',
  items: [
    {
      label: 'New Test Dashboard',
      path: 'views/new_test_dashboard.html',
      testable: true
    },
    // ... existing items
  ]
}
```

2. The menu generator will automatically add it to the Dashboards menu

### Adding a New Tool

1. Add to `toolsMenu.quickTools` in `menu_config.js`:

```javascript
{
  label: 'New Tool',
  path: 'views/new_tool.html',
  testable: true
}
```

Or add to a server's tools array for server-specific tools.

## Testing

### Running Menu Tests

```bash
# Run all menu tests
npm run test:menu

# Run full test suite including menu tests
npm run test:all
```

### Test Coverage

The testing framework validates:
- ✅ Menu structure (all required categories exist)
- ✅ MCP server controls (start/stop/restart/dashboard for each server)
- ✅ Dashboard sections (all categories present)
- ✅ Keyboard shortcuts (correct format and no conflicts)
- ✅ Tool items (all tools accessible)
- ✅ Navigation items (back/forward)
- ✅ Valid paths (all navigation targets exist)
- ✅ Testable flags (all items properly marked)

Current test results: **25/25 tests passing** ✅

### Writing New Tests

Tests automatically run for all items marked as `testable: true` in the configuration. To add a new test:

1. Items are automatically tested when added to configuration
2. Add custom validation to `test/menu_test_framework.js` if needed
3. Add integration tests to `test/test_programmatic_menu.js` for complex scenarios

## Implementation Details

### Menu Generation Process

1. **Initialization** (in `index.js` `app.on('ready')`):
   ```javascript
   createWindow();  // Create main window first
   createAppMenu(); // Generate menu with access to mainWindow
   ```

2. **Menu Generator Construction**:
   ```javascript
   menuGenerator = new MenuGenerator({
     daemonManager: daemonManager,
     navigateToView: navigateToView,
     createSwissKnifeWindow: createSwissKnifeWindow,
     createMCPDashboardWindow: createMCPDashboardWindow,
     mainWindow: mainWindow
   });
   ```

3. **Menu Generation**:
   - Generator reads configuration
   - Builds menu template
   - Attaches action handlers
   - Sets keyboard accelerators
   - Registers with Electron

### Navigation System

The app uses a single-window navigation model:

- `mainWindow` - Global reference to main application window
- `navigateToView(viewPath)` - Loads view in main window
- Back/Forward navigation supported
- All menu items navigate within same window

### Action Handling

Menu actions are handled by the `MenuGenerator.handleAction()` method:

- **Navigation actions**: Load views in main window
- **MCP server actions**: Call daemon manager methods
- **Tool actions**: Open external URLs or launch apps
- **System actions**: Settings, about, quit, etc.

## Keyboard Shortcuts

### Global Shortcuts
- `⌘H` - Home
- `⌘D` - Main Dashboard
- `⌘M` - MCP Control Panel
- `⌘,` - Settings

### MCP Server Shortcuts
- `⌘⇧S` - Start All MCP Servers
- `⌘⇧X` - Stop All MCP Servers
- `⌘⇧R` - Restart All MCP Servers
- `⌘⌥1` - IPFS Kit Dashboard
- `⌘⌥2` - IPFS Datasets Dashboard
- `⌘⌥3` - IPFS Accelerate Dashboard
- `⌘⌥4` - SwissKnife Dashboard

### Navigation Shortcuts
- `Alt+←` - Back
- `Alt+→` - Forward

### View Shortcuts
- `⌘R` - Reload
- `⌘⇧R` - Force Reload
- `⌘⇧I` - Toggle DevTools
- `⌘0` - Reset Zoom
- `⌘+` - Zoom In
- `⌘-` - Zoom Out
- `F11` - Toggle Fullscreen

## File Structure

```
hallucinate_app/
├── hallucinate_app/node/
│   ├── menu_config.js       # Menu configuration
│   └── menu_generator.js    # Menu generation logic
├── test/
│   ├── menu_test_framework.js      # Testing framework
│   └── test_programmatic_menu.js   # Integration tests
├── index.js                 # Main Electron file (uses menu generator)
└── package.json            # Includes test:menu script
```

## Migration from Old System

The previous hardcoded menu (lines 649-1362 in old index.js) has been replaced with:
- ~50 lines of menu generator initialization
- Configuration-driven menu structure
- Unified testing framework

This represents a **~700 line reduction** in `index.js` while adding comprehensive testing and better maintainability.

## Future Enhancements

Potential improvements for the menu system:

1. **Dynamic Menu Updates**
   - Real-time status indicators for MCP servers
   - Recent files/views menu
   - Contextual menu items based on state

2. **User Customization**
   - User-defined keyboard shortcuts
   - Custom menu organization
   - Favorites/bookmarks system

3. **Internationalization**
   - Multi-language support
   - Localized menu labels
   - Region-specific defaults

4. **Advanced Features**
   - Menu search/command palette
   - Quick action shortcuts
   - Workflow automation via menu

## Troubleshooting

### Menu Not Appearing
- Check that `createWindow()` is called before `createAppMenu()`
- Verify `mainWindow` is properly set
- Check console for menu generation errors

### Menu Item Not Working
- Verify item is in configuration
- Check action handler exists in menu generator
- Ensure view file exists for navigation items
- Verify daemon manager is initialized for MCP actions

### Tests Failing
- Run `npm run test:menu` to see specific failures
- Check that new items have `testable: true` flag
- Verify paths and accelerators are correct
- Ensure all required categories exist

### Keyboard Shortcut Conflicts
- Check configuration for duplicate accelerators
- Review Electron's standard shortcuts
- Test on all platforms (Mac/Windows/Linux)

## Support

For issues or questions about the menu system:
1. Check this documentation
2. Review test output: `npm run test:menu`
3. Check menu configuration: `hallucinate_app/node/menu_config.js`
4. Review generated menu: `hallucinate_app/node/menu_generator.js`
5. Open an issue on GitHub with test results and error messages
