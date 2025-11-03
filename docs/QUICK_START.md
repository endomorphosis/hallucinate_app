# Quick Start Guide - Hallucinate App with MCP Daemon Manager

## Prerequisites

- Node.js 18.0.0 or higher
- Git
- npm or yarn

## Installation

1. **Clone the repository**:
```bash
git clone https://github.com/endomorphosis/hallucinate_app.git
cd hallucinate_app
```

2. **Initialize submodules**:
```bash
git submodule update --init --recursive
```

3. **Install dependencies**:
```bash
npm install
```

4. **(Optional) Install SwissKnife dependencies**:
```bash
cd swissknife
npm install --legacy-peer-deps
cd ..
```

## Running the Application

### Start the Electron App

```bash
npm start
```

This will:
- Launch the Electron application
- Automatically start all 3 MCP daemon servers (unless `AUTO_START_DAEMONS=false`)
- Open the main test interface window

### Access Different Windows

From the application menu bar:

**Windows Menu:**
- **Test Interface** - Main testing dashboard
- **Benchmark Dashboard** - Performance benchmarking
- **Model Tester** - AI model testing interface
- **IPFS Kit Dashboard** - IPFS operations dashboard
- **SwissKnife Virtual Desktop** - Collaborative development environment
- **Daemon Manager** - MCP server control panel

**Daemons Menu:**
- **Start All MCP Servers** - Launch all three daemon servers
- **Stop All MCP Servers** - Shutdown all daemon servers
- Individual daemon controls for each server

## Using the MCP Daemon Manager

### Access the Dashboard

1. Click **Windows → Daemon Manager** in the menu bar
2. The Daemon Manager dashboard will open

### Controlling Daemons

**Bulk Operations:**
- Click **Start All Daemons** to start all MCP servers
- Click **Stop All Daemons** to stop all MCP servers
- Click **Refresh Status** to update the status display

**Individual Controls:**
Each daemon card has three buttons:
- **Start** - Launch the daemon
- **Stop** - Shutdown the daemon
- **Restart** - Restart the daemon

### Monitoring Status

The dashboard displays:
- **Status Badge** - Current state (Running, Stopped, Starting, Failed)
- **PID** - Process ID when running
- **Uptime** - How long the daemon has been running
- **Restart Count** - Number of automatic restarts

### Event Log

The event log shows:
- Daemon lifecycle events (started, stopped, crashed)
- Health check results
- Error messages
- Timestamps for all events

## Using SwissKnife Virtual Desktop

### Option 1: Use Development Server (Recommended for Development)

1. **Start SwissKnife server**:
```bash
./scripts/start-swissknife.sh
```
Or manually:
```bash
cd swissknife
npm run desktop:collaborative
```

2. **Open in Electron**:
   - Launch the Electron app
   - Click **Windows → SwissKnife Virtual Desktop**
   - The window will connect to `http://localhost:3001`

### Option 2: Use Built Version

1. **Build SwissKnife**:
```bash
cd swissknife
npm run build
cd ..
```

2. **Open in Electron**:
   - The built files will be automatically detected
   - Click **Windows → SwissKnife Virtual Desktop**

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Disable auto-start of daemons
AUTO_START_DAEMONS=false

# Enable development mode
NODE_ENV=development

# Custom MCP server ports (optional)
IPFS_ACCELERATE_PORT=3001
SWISSKNIFE_MCP_PORT=3002
HUGGINGFACE_MCP_PORT=3003
```

### Daemon Configuration

Edit `hallucinate_app/node/daemon_manager.js` to customize daemon settings:

```javascript
this.registerDaemon({
  name: 'my-custom-daemon',
  command: 'node',
  args: ['server.js'],
  cwd: '/path/to/server',
  autoRestart: true,
  maxRestarts: 5,
  restartDelay: 5000,
  healthCheckInterval: 30000
});
```

## Troubleshooting

### Daemons Won't Start

1. **Check the Event Log** in the Daemon Manager dashboard
2. **Verify the command paths** in `daemon_manager.js`
3. **Check port availability** - ensure ports 3001-3003 are not in use
4. **Review Electron console** for error messages

### SwissKnife Window Shows Error

1. **Ensure SwissKnife server is running**:
```bash
cd swissknife && npm run desktop:collaborative
```

2. **Check port 3001** is accessible:
```bash
curl http://localhost:3001
```

3. **Rebuild SwissKnife** if using built version:
```bash
cd swissknife && npm run build
```

### Dashboard Not Updating

1. Click the **Refresh Status** button
2. Close and reopen the Daemon Manager window
3. Check the Electron console for IPC errors

## Development Workflow

### 1. Start in Development Mode

```bash
NODE_ENV=development npm start
```

This will:
- Open DevTools automatically
- Enable detailed logging
- Allow hot-reload of changes

### 2. Test Daemon Manager

1. Open Daemon Manager dashboard
2. Try starting/stopping individual daemons
3. Monitor the event log for issues
4. Test auto-restart by killing a process

### 3. Test SwissKnife Integration

1. Start SwissKnife dev server
2. Open SwissKnife window in Electron
3. Test the virtual desktop features
4. Verify P2P collaboration works

### 4. Run Tests

```bash
# Run all tests
npm test

# Run daemon manager test
node test/js/test_daemon_manager.js

# Run specific test suite
npm run test:bridge
npm run test:electron
```

## Production Build

### 1. Build the Application

```bash
npm run package
```

This creates a packaged version in the `out` directory.

### 2. Create Installers

```bash
npm run make
```

This creates platform-specific installers.

## Common Commands

```bash
# Install dependencies
npm install

# Start application
npm start

# Run tests
npm test

# Build for production
npm run package

# Create installers
npm run make

# Start SwissKnife dev server
./scripts/start-swissknife.sh

# Test daemon manager
node test/js/test_daemon_manager.js
```

## Next Steps

1. **Explore the Dashboards**: Try each window from the Windows menu
2. **Configure Daemons**: Customize daemon settings for your needs
3. **Test MCP Servers**: Start the daemons and test their functionality
4. **Try SwissKnife**: Explore the virtual desktop features
5. **Read the Docs**: Check `docs/DAEMON_MANAGER.md` for detailed documentation

## Resources

- [Main README](README.md) - Full documentation
- [Daemon Manager Documentation](docs/DAEMON_MANAGER.md) - Detailed API reference
- [SwissKnife README](swissknife/README.md) - SwissKnife documentation
- [Security Documentation](README_SECURITY.md) - Security features
- [GraphRAG Documentation](README_GRAPHRAG.md) - GraphRAG integration

## Getting Help

- **Issues**: https://github.com/endomorphosis/hallucinate_app/issues
- **Discussions**: https://github.com/endomorphosis/hallucinate_app/discussions

## License

AGPL-3.0-only
