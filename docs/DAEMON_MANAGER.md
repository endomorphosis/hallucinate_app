# MCP Daemon Manager Documentation

## Overview

The MCP Daemon Manager is a comprehensive process management system for Model Context Protocol (MCP) servers in the Hallucinate App. It provides lifecycle management, health monitoring, auto-restart capabilities, and a beautiful web-based dashboard for controlling and monitoring all MCP server instances.

## Architecture

### Components

1. **MCPDaemon Class** (`daemon_manager.js`)
   - Manages individual daemon lifecycle
   - Handles process spawning and monitoring
   - Implements health checks and auto-restart
   - Emits events for status changes

2. **DaemonManager Class** (`daemon_manager.js`)
   - Singleton manager for all daemons
   - Provides unified API for daemon control
   - Forwards events from individual daemons
   - Manages daemon registry

3. **Dashboard UI** (`views/daemon_manager.html`)
   - Real-time status visualization
   - Individual and bulk daemon controls
   - Event log with filtering
   - Auto-refresh capability

4. **IPC Integration** (`index.js`)
   - Electron IPC handlers for daemon operations
   - Event forwarding to renderer processes
   - Menu integration for quick access

## Default MCP Servers

The daemon manager comes pre-configured with 3 MCP servers:

### 1. IPFS Accelerate MCP
- **Purpose**: Distributed AI/ML operations and inference
- **Port**: 3001
- **Location**: `swissknife/src/patches/mcp/mcp-server-controller.ts`
- **Features**:
  - AI model inference across distributed networks
  - IPFS-based model storage and retrieval
  - Collaborative ML computing

### 2. SwissKnife MCP
- **Purpose**: CLI tools and vibecoding assistance
- **Port**: 3002
- **Location**: `swissknife/cli.mjs`
- **Features**:
  - AI-powered terminal assistance
  - Code generation and editing
  - Task automation and workflow management

### 3. HuggingFace MCP
- **Purpose**: Model and dataset management
- **Port**: 3003
- **Location**: `hallucinate_app/node/ipfs_model_manager.js`
- **Features**:
  - Access to 100,000+ HuggingFace models
  - Dataset browsing and management
  - Model caching and version control

## API Reference

### DaemonManager Methods

#### `registerDaemon(config)`
Register a new daemon with the manager.

**Parameters:**
- `config.name` (string): Unique daemon identifier
- `config.command` (string): Command to execute
- `config.args` (array): Command arguments
- `config.cwd` (string): Working directory
- `config.env` (object): Environment variables
- `config.autoRestart` (boolean): Enable auto-restart (default: true)
- `config.maxRestarts` (number): Max restart attempts (default: 5)
- `config.restartDelay` (number): Delay between restarts in ms (default: 5000)
- `config.healthCheckInterval` (number): Health check interval in ms (default: 30000)

**Example:**
```javascript
daemonManager.registerDaemon({
  name: 'my-mcp-server',
  command: 'node',
  args: ['server.js'],
  cwd: '/path/to/server',
  env: { PORT: '3000' },
  autoRestart: true,
  maxRestarts: 3
});
```

#### `startDaemon(name)`
Start a specific daemon by name.

**Returns:** Promise<void>

**Example:**
```javascript
await daemonManager.startDaemon('ipfs-accelerate-mcp');
```

#### `stopDaemon(name)`
Stop a specific daemon by name.

**Returns:** Promise<void>

**Example:**
```javascript
await daemonManager.stopDaemon('swissknife-mcp');
```

#### `restartDaemon(name)`
Restart a specific daemon by name.

**Returns:** Promise<void>

**Example:**
```javascript
await daemonManager.restartDaemon('huggingface-mcp');
```

#### `startAll()`
Start all registered daemons.

**Returns:** Promise<void>

**Example:**
```javascript
await daemonManager.startAll();
```

#### `stopAll()`
Stop all registered daemons.

**Returns:** Promise<void>

**Example:**
```javascript
await daemonManager.stopAll();
```

#### `getStatus()`
Get status of all daemons.

**Returns:** Object with daemon statuses

**Example:**
```javascript
const status = daemonManager.getStatus();
console.log(status);
// {
//   'ipfs-accelerate-mcp': {
//     name: 'ipfs-accelerate-mcp',
//     status: 'running',
//     pid: 12345,
//     restartCount: 0,
//     lastStartTime: 1699000000000,
//     uptime: 120000
//   },
//   ...
// }
```

#### `getDaemonStatus(name)`
Get status of a specific daemon.

**Returns:** Object with daemon status

**Example:**
```javascript
const status = daemonManager.getDaemonStatus('ipfs-accelerate-mcp');
```

### MCPDaemon Events

The daemon manager emits the following events:

- `daemon-starting`: Daemon is starting
- `daemon-started`: Daemon started successfully
- `daemon-stopping`: Daemon is stopping
- `daemon-stopped`: Daemon stopped successfully
- `daemon-crashed`: Daemon process crashed
- `daemon-failed`: Daemon failed to start
- `daemon-error`: Daemon encountered an error
- `daemon-health-check`: Health check passed
- `daemon-health-check-failed`: Health check failed

**Example:**
```javascript
daemonManager.on('daemon-started', ({ name, pid }) => {
  console.log(`${name} started with PID ${pid}`);
});

daemonManager.on('daemon-crashed', ({ name, code, signal }) => {
  console.error(`${name} crashed with code ${code}`);
});
```

## IPC API (Electron)

The daemon manager provides IPC handlers for Electron renderer processes:

### `daemon:get-status`
Get status of all daemons.

**Example:**
```javascript
const status = await ipcRenderer.invoke('daemon:get-status');
```

### `daemon:start-all`
Start all daemons.

**Example:**
```javascript
const status = await ipcRenderer.invoke('daemon:start-all');
```

### `daemon:stop-all`
Stop all daemons.

**Example:**
```javascript
const status = await ipcRenderer.invoke('daemon:stop-all');
```

### `daemon:start`
Start a specific daemon.

**Example:**
```javascript
const status = await ipcRenderer.invoke('daemon:start', 'ipfs-accelerate-mcp');
```

### `daemon:stop`
Stop a specific daemon.

**Example:**
```javascript
const status = await ipcRenderer.invoke('daemon:stop', 'swissknife-mcp');
```

### `daemon:restart`
Restart a specific daemon.

**Example:**
```javascript
const status = await ipcRenderer.invoke('daemon:restart', 'huggingface-mcp');
```

### Event: `daemon-event`
Receive daemon events in renderer process.

**Example:**
```javascript
ipcRenderer.on('daemon-event', (event, { type, data }) => {
  console.log(`Event: ${type}`, data);
});
```

## Dashboard Features

### Status Cards
- Real-time status for each daemon (running, stopped, starting, failed)
- Process ID (PID) display
- Uptime tracking
- Restart count

### Controls
- **Bulk Operations**: Start All, Stop All, Refresh Status
- **Individual Controls**: Start, Stop, Restart for each daemon
- Disabled state for inappropriate actions (e.g., can't start a running daemon)

### Event Log
- Chronological event history
- Color-coded events (success, error, info)
- Auto-scroll to latest events
- Keeps last 50 events
- Timestamps for all events

### Auto-Refresh
- Status updates every 10 seconds
- Manual refresh button available
- Real-time event updates via IPC

## Configuration

### Environment Variables

- `AUTO_START_DAEMONS`: Set to `false` to disable auto-start on app launch (default: true)
- `NODE_ENV`: Set to `development` to open DevTools automatically

### Customizing Default Daemons

Edit the `setupDefaultDaemons()` method in `daemon_manager.js`:

```javascript
setupDefaultDaemons() {
  const rootDir = path.join(__dirname, '../..');
  
  // Add your custom daemon
  this.registerDaemon({
    name: 'my-custom-mcp',
    command: 'node',
    args: ['path/to/server.js'],
    cwd: rootDir,
    env: {
      MCP_SERVER_NAME: 'custom',
      MCP_SERVER_PORT: '3004'
    },
    autoRestart: true,
    maxRestarts: 5
  });
}
```

## Health Monitoring

### Default Behavior
- Health checks run every 30 seconds (configurable)
- Basic check verifies process is alive
- Failed checks emit `health-check-failed` event

### Custom Health Checks

To implement custom health checks, extend the `performHealthCheck()` method:

```javascript
performHealthCheck() {
  if (!this.process || this.process.killed) {
    this.emit('health-check-failed', { 
      name: this.name, 
      reason: 'process_not_running' 
    });
    return;
  }

  // Custom HTTP ping
  fetch(`http://localhost:${this.port}/health`)
    .then(response => {
      if (response.ok) {
        this.emit('health-check', { 
          name: this.name, 
          status: 'healthy' 
        });
      } else {
        this.emit('health-check-failed', { 
          name: this.name, 
          reason: 'http_error' 
        });
      }
    })
    .catch(error => {
      this.emit('health-check-failed', { 
        name: this.name, 
        reason: 'http_timeout',
        error 
      });
    });
}
```

## Auto-Restart Behavior

### Default Configuration
- Auto-restart enabled by default
- Maximum 5 restart attempts
- 5 second delay between restarts
- Restart count resets after successful run

### Restart Triggers
- Process crashes (exit code != 0)
- Process killed by signal
- Health check failures (if configured)

### Restart Limits
When max restarts exceeded:
- Daemon status changes to `failed`
- `daemon-failed` event emitted
- Manual intervention required
- Restart count can be reset by stopping daemon

## Troubleshooting

### Daemon Won't Start

1. **Check the command and arguments**:
   - Verify the command exists and is executable
   - Check that arguments are correct
   - Ensure working directory exists

2. **Check the logs**:
   - Look at stdout/stderr in the event log
   - Check Electron console for errors

3. **Verify environment**:
   - Ensure required environment variables are set
   - Check for port conflicts

### Daemon Keeps Restarting

1. **Check health monitoring**:
   - Disable auto-restart temporarily
   - Review health check logic
   - Verify daemon is actually healthy

2. **Increase restart delay**:
   - Give daemon more time to stabilize
   - Increase `restartDelay` config

3. **Check max restarts**:
   - Increase `maxRestarts` if legitimate
   - Review why daemon is failing

### Dashboard Not Updating

1. **Check IPC connection**:
   - Verify IPC handlers are registered
   - Check for IPC errors in console

2. **Force refresh**:
   - Click refresh button
   - Reload the dashboard window

3. **Check event forwarding**:
   - Verify daemon events are being emitted
   - Check event listeners are registered

## Best Practices

### Development
- Set `NODE_ENV=development` for debugging
- Use `AUTO_START_DAEMONS=false` to start manually
- Monitor event log for issues
- Test health checks thoroughly

### Production
- Set appropriate restart limits
- Implement robust health checks
- Monitor daemon status
- Set up external monitoring
- Log to files for audit trail

### Security
- Validate all daemon configurations
- Use environment variables for sensitive data
- Implement proper authentication for MCP servers
- Monitor for suspicious behavior
- Limit restart attempts to prevent DoS

## Integration Examples

### Using with Existing Windows

```javascript
// In your Electron main process
import { getDaemonManager } from './hallucinate_app/node/daemon_manager.js';

const daemonManager = getDaemonManager();

// Show status in existing window
function updateDaemonStatus(window) {
  const status = daemonManager.getStatus();
  window.webContents.send('daemon-status-update', status);
}

// Forward events
daemonManager.on('daemon-started', (data) => {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('notification', {
      type: 'success',
      message: `${data.name} started successfully`
    });
  });
});
```

### Custom Daemon Registration

```javascript
// Register a custom MCP server at runtime
daemonManager.registerDaemon({
  name: 'research-assistant-mcp',
  command: 'python',
  args: ['-m', 'research_assistant.server'],
  cwd: '/path/to/research_assistant',
  env: {
    MCP_SERVER_PORT: '3005',
    API_KEY: process.env.RESEARCH_API_KEY
  },
  autoRestart: true,
  maxRestarts: 3,
  healthCheckInterval: 60000 // 1 minute
});

// Start the custom daemon
await daemonManager.startDaemon('research-assistant-mcp');
```

## Future Enhancements

Planned improvements for the daemon manager:

- [ ] Process resource monitoring (CPU, memory)
- [ ] Configurable restart strategies (exponential backoff, etc.)
- [ ] Log file management and rotation
- [ ] Daemon dependency chains
- [ ] Scheduled restarts for maintenance
- [ ] Advanced health check protocols (HTTP, TCP, custom)
- [ ] Metrics export for monitoring systems
- [ ] Daemon grouping and batch operations
- [ ] Configuration file support
- [ ] Hot reload of daemon configurations

## Contributing

When contributing to the daemon manager:

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Test with all three default daemons
5. Verify auto-restart behavior
6. Check health monitoring works correctly

## License

Same as Hallucinate App (AGPL-3.0-only)
