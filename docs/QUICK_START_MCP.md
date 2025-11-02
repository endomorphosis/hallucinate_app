# Quick Start Guide - MCP Daemon System

## Overview

The Hallucinate App now features an integrated daemon management system that automatically starts three MCP servers and provides a SwissKnife virtual desktop for unified development.

## Quick Start

### 1. Start the Application

```bash
cd /home/barberb/hallucinate_app
npm start
```

**What happens:**
- ✅ Electron app launches
- ✅ Wait 2 seconds
- ✅ Auto-starts 3 MCP daemons:
  - IPFS Kit MCP (port 3001)
  - IPFS Datasets MCP (port 3002)
  - IPFS Accelerate MCP (port 3003)

### 2. Access SwissKnife Virtual Desktop

**Option A: Using Built Version (if available)**
```bash
# Build SwissKnife first
cd swissknife
npm install
npm run build
cd ..

# Start Electron app
npm start

# Then in app menu:
Windows → SwissKnife Virtual Desktop
```

**Option B: Using Development Server**
```bash
# Terminal 1: Start SwissKnife dev server
./scripts/start-swissknife.sh

# Terminal 2: Start Electron app
npm start

# Then in app menu:
Windows → SwissKnife Virtual Desktop
```

### 3. Monitor Daemons

In the Electron app menu:
```
Daemons → Daemon Manager
```

This opens a dashboard showing:
- Real-time status of all 3 MCP servers
- Individual control buttons (Start/Stop/Restart)
- Event log with system messages
- Resource usage and uptime

## Menu Navigation

### Daemons Menu
- **Daemon Manager** - Open monitoring dashboard
- **Start All Daemons** - Start all MCP servers
- **Stop All Daemons** - Stop all MCP servers
- **IPFS Kit MCP** - Individual controls
- **IPFS Datasets MCP** - Individual controls
- **IPFS Accelerate MCP** - Individual controls

### Windows Menu
- **SwissKnife Virtual Desktop** - Main development interface
- **Daemon Manager** - MCP monitoring and control
- **Test Interface** - Module testing
- **Benchmark Dashboard** - Performance testing
- **Model Tester** - AI model testing
- **IPFS Kit Dashboard** - IPFS operations

## MCP Server Details

### IPFS Kit MCP (Port 3001)
**Command:** `python -m ipfs_kit_py.cli mcp start`

Provides:
- IPFS node operations
- Storage backend management
- Cluster coordination

### IPFS Datasets MCP (Port 3002)
**Command:** `python -m ipfs_datasets_py.mcp_server --http --port 3002`

Provides:
- 200+ MCP tools in 49+ categories
- Dataset management
- PDF processing with GraphRAG
- Vector stores (FAISS, Qdrant)
- Legal dataset scraping
- Multimedia processing

### IPFS Accelerate MCP (Port 3003)
**Command:** `python -m ipfs_accelerate_py.cli mcp start --port 3003`

Provides:
- Distributed AI/ML operations
- Model inference acceleration
- GPU/WebGPU integration
- Queue management

## Daemon Management Features

### Auto-Start
- All daemons start automatically 2 seconds after app launch
- No manual intervention needed

### Health Monitoring
- Health checks every 30 seconds
- Automatic detection of crashed processes
- Visual status indicators in dashboard

### Auto-Restart
- Failed daemons automatically restart
- Up to 3 restart attempts
- Exponential backoff between attempts

### Graceful Shutdown
- Clean shutdown when app closes
- 5-second grace period for each daemon
- Force kill if necessary

## Troubleshooting

### SwissKnife Shows "Not Available"

**Problem:** SwissKnife virtual desktop shows placeholder message

**Solution 1 - Start Dev Server:**
```bash
./scripts/start-swissknife.sh
```

**Solution 2 - Build SwissKnife:**
```bash
cd swissknife
npm install
npm run build
```

Then reload the SwissKnife window (View → Reload)

### MCP Server Won't Start

**Check Python dependencies:**
```bash
# For IPFS Kit
cd ipfs_kit_py
pip install -e .

# For IPFS Datasets
cd ../ipfs_datasets_py
pip install -e .

# For IPFS Accelerate
cd ../ipfs_accelerate_py
pip install -e .
```

**Check logs:**
1. Open Daemon Manager
2. Look at Event Log for error messages
3. Check terminal output from Electron

### Port Already in Use

**Check what's using the port:**
```bash
# Check port 3001
lsof -i :3001

# Check port 3002
lsof -i :3002

# Check port 3003
lsof -i :3003
```

**Kill the process:**
```bash
kill -9 <PID>
```

Then restart the daemon from the Daemon Manager.

### Daemon Keeps Restarting

**Common causes:**
1. Missing Python dependencies
2. Configuration file issues
3. Port conflicts
4. Python version mismatch (requires 3.12+)

**Check logs:**
- Open Daemon Manager
- View recent logs for the specific daemon
- Look for error messages

**Manual start (for debugging):**
```bash
# IPFS Kit
cd ipfs_kit_py
python -m ipfs_kit_py.cli mcp start

# IPFS Datasets
cd ipfs_datasets_py
python -m ipfs_datasets_py.mcp_server --http --port 3002

# IPFS Accelerate
cd ipfs_accelerate_py
python -m ipfs_accelerate_py.cli mcp start --port 3003
```

## Development Mode

### Enable Debug Mode

```bash
NODE_ENV=development npm start
```

**Features:**
- DevTools open automatically
- Verbose logging
- Live reload on changes

### Manual Daemon Control

**Start specific daemon:**
```javascript
// In DevTools console
daemonManager.startDaemon('ipfs-kit')
daemonManager.startDaemon('ipfs-datasets')
daemonManager.startDaemon('ipfs-accelerate')
```

**Get status:**
```javascript
// In DevTools console
daemonManager.getAllStatus()
daemonManager.getStatus('ipfs-kit')
```

**View logs:**
```javascript
// In DevTools console
daemonManager.getLogs('ipfs-kit', 50)
```

## SwissKnife Integration

### Connecting to MCP Servers

SwissKnife automatically connects to all three MCP servers when loaded:

- `localhost:3001` - IPFS Kit
- `localhost:3002` - IPFS Datasets
- `localhost:3003` - IPFS Accelerate

### Available Tools

SwissKnife provides access to 157+ tools across categories:
- 🔧 Tool Management
- 🌐 Web Development
- 📱 Mobile Development
- 🤖 AI/ML Assistance
- 📊 Data Processing
- 🔒 Security Scanning
- 🎨 Design Utilities
- ⚡ Performance Optimization

## Architecture Overview

```
Electron App
    ├── MCP Daemon Manager
    │   ├── IPFS Kit MCP (3001)
    │   ├── IPFS Datasets MCP (3002)
    │   └── IPFS Accelerate MCP (3003)
    └── SwissKnife Virtual Desktop
        └── Connects to all 3 MCP servers
```

## Next Steps

1. ✅ Start the app: `npm start`
2. ✅ Verify daemons running: `Daemons → Daemon Manager`
3. ✅ Start SwissKnife: `./scripts/start-swissknife.sh`
4. ✅ Access virtual desktop: `Windows → SwissKnife Virtual Desktop`
5. ✅ Start developing!

## Additional Resources

- **Architecture Documentation:** `docs/MCP_DAEMON_ARCHITECTURE.md`
- **SwissKnife Script:** `scripts/start-swissknife.sh`
- **Demo Script:** `scripts/demo-swissknife.sh`

## Support

If you encounter issues:

1. Check the Daemon Manager event log
2. Review terminal output from Electron
3. Verify Python dependencies are installed
4. Ensure ports 3001-3003 are available
5. Check Python version (3.12+ required)

For detailed architecture information, see `docs/MCP_DAEMON_ARCHITECTURE.md`.
