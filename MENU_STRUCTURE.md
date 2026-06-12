# hallucinate_app Menu Structure

This document describes the comprehensive menu structure implemented for the Electron application.

## Menu Organization

The application menu is organized into six main sections for easy navigation:

### 1. File Menu
- **Home** (Ctrl/Cmd+H) - Return to main dashboard
- **Settings** (Ctrl/Cmd+,) - Open the application settings view
- **Quit** - Exit the application

### 2. Dashboards Menu
Organized into logical subsections:

#### Main Dashboard
- **Main Dashboard** (Ctrl/Cmd+D) - Primary application dashboard

#### IPFS MCP Servers
- **IPFS Kit Dashboard** - IPFS Kit MCP server dashboard
- **IPFS Datasets Dashboard** - IPFS Datasets MCP server dashboard *(NEW)*
- **IPFS Accelerate Dashboard** - IPFS Accelerate MCP server dashboard *(NEW)*

#### Testing & Benchmarks
- **Test Interface** - Module testing interface
- **Benchmark Dashboard** - Performance benchmarking
- **Model Tester** - AI model testing interface

#### Security & Authentication
- **Auth Dashboard** - Authentication management
- **Security Test Dashboard** - Security testing interface

#### Database & Storage
- **Database Backup Dashboard** - Database backup management
- **PyArrow Content Index** - Content index browser

#### System Management
- **Daemon Manager** - MCP server management
- **Usage Dashboard** - Resource usage monitoring

### 3. MCP Servers Menu
Control and manage Model Context Protocol (MCP) servers:

#### General Controls
- **Daemon Manager** - Visual MCP server management interface
- **Start All MCP Servers** - Start all configured MCP servers
- **Stop All MCP Servers** - Stop all running MCP servers

#### IPFS Kit MCP
- Start/Stop/Restart controls
- **Open Dashboard** - Navigate to IPFS Kit dashboard

#### IPFS Datasets MCP
- Start/Stop/Restart controls
- **Open Dashboard** - Navigate to IPFS Datasets dashboard *(NEW)*

#### IPFS Accelerate MCP
- Start/Stop/Restart controls
- **Open Dashboard** - Navigate to IPFS Accelerate dashboard *(NEW)*

### 4. Tools Menu
Quick access to utility tools:
- **SwissKnife Virtual Desktop** - Comprehensive development environment
- **Model Tester** - AI model testing
- **Test Interface** - Module testing
- **Benchmark Dashboard** - Performance testing

### 5. View Menu
Standard view controls:
- **Back** (Alt+Left) - Navigate backward
- **Forward** (Alt+Right) - Navigate forward
- Reload/Force Reload
- Toggle DevTools
- Zoom controls (Reset/In/Out)
- Toggle Fullscreen

### 6. Help Menu
- **Documentation** - Open GitHub repository
- **Report Issue** - Submit GitHub issue
- **About** - Application information

## Single-Window Navigation

The application now uses a single-window navigation system instead of opening multiple windows:

- All menu items navigate within the same window
- Browser-style back/forward navigation supported
- Previous behavior of opening new windows has been removed
- Smoother, more integrated user experience

## New Dashboard HTML Files

Two new dashboard views were created:

1. **ipfs_datasets_dashboard.html**
   - Information about IPFS Datasets module
   - MCP server status monitoring
   - Quick actions for testing connection
   - Documentation and API endpoints

2. **ipfs_accelerate_dashboard.html**
   - Information about IPFS Accelerate module
   - Performance metrics display
   - MCP server status monitoring
   - Model management quick actions

## Keyboard Shortcuts

The following keyboard shortcuts are available:

- `Ctrl/Cmd + H` - Go to Home (Main Dashboard)
- `Ctrl/Cmd + D` - Open Main Dashboard
- `Ctrl/Cmd + ,` - Settings
- `Alt + Left` - Navigate Back
- `Alt + Right` - Navigate Forward
- Standard Electron shortcuts (Reload, DevTools, Zoom, etc.)

## Technical Implementation

### Navigation System
- Main window reference stored globally
- `navigateToView()` helper function for loading views
- IPC handlers for navigation messages from renderers
- Menu items use `click` handlers to trigger navigation

### Menu Structure
- Organized using nested submenus
- Consistent naming and icon usage
- Separator lines for visual grouping
- Accelerator keys for common actions

### IPC Handlers
The following IPC message handlers were added:
- `open-daemon-manager` - Navigate to Daemon Manager
- `open-model-tester` - Navigate to Model Tester
- `open-security-test-dashboard` - Navigate to Security Test Dashboard
- `open-database-backup-dashboard` - Navigate to Database Backup Dashboard

## Migration Notes

### Removed Functions
The following window creation functions were removed:
- `createBenchmarkWindow()`
- `createTestWindow()`
- `createIPFSKitDashboardWindow()`
- `createDaemonManagerWindow()`
- `createSwissKnifeWindow()`

These have been replaced with single-window navigation to their respective views.

### Changed Behavior
- Clicking menu items no longer opens new windows
- All views load in the main application window
- Back/forward navigation is supported
- Window management is simplified

## Future Improvements

Potential enhancements to consider:
- [ ] Implement Settings page
- [ ] Add recent views history menu
- [ ] Add bookmark/favorites system
- [ ] Implement tabbed interface option
- [ ] Add customizable keyboard shortcuts
- [ ] Add search in menu items
