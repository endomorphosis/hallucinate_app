# MCP Daemon Architecture

## Overview

The Electron application now includes a comprehensive daemon management system that controls three IPFS MCP servers and integrates them with the SwissKnife virtual desktop.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Electron Application                          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              MCP Daemon Manager                            │ │
│  │  - Process lifecycle management                            │ │
│  │  - Health monitoring (30s interval)                        │ │
│  │  - Auto-restart (up to 3 attempts)                         │ │
│  │  - Event logging and status tracking                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                             │                                    │
│         ┌───────────────────┼───────────────────┐               │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │  IPFS Kit   │    │   IPFS      │    │    IPFS     │        │
│  │  MCP Server │    │  Datasets   │    │  Accelerate │        │
│  │  Port 3001  │    │  MCP Server │    │  MCP Server │        │
│  └─────────────┘    │  Port 3002  │    │  Port 3003  │        │
│         │            └─────────────┘    └─────────────┘        │
│         │                   │                   │               │
│         └───────────────────┴───────────────────┘               │
│                             │                                    │
│                             ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │          SwissKnife Virtual Desktop                        │ │
│  │  - Integrates with all 3 MCP servers                       │ │
│  │  - Provides unified development environment                │ │
│  │  - 157+ tools across 8+ categories                         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## MCP Servers

### 1. IPFS Kit MCP (Port 3001)
**Command:** `python -m ipfs_kit_py.cli mcp start`
**Directory:** `ipfs_kit_py/`

**Features:**
- IPFS node management and operations
- Storage backend integration
- Cluster management
- High-level IPFS API

### 2. IPFS Datasets MCP (Port 3002)
**Command:** `python -m ipfs_datasets_py.mcp_server --http --port 3002`
**Directory:** `ipfs_datasets_py/`

**Features:**
- 200+ MCP tools across 49+ categories
- Dataset loading and management
- PDF processing with GraphRAG
- Vector store operations (FAISS, Qdrant, Elasticsearch)
- Legal dataset scraping
- Web archiving and Common Crawl integration
- Multimedia processing (FFmpeg, yt-dlp)
- Theorem proving and logic integration

### 3. IPFS Accelerate MCP (Port 3003)
**Command:** `python -m ipfs_accelerate_py.cli mcp start --port 3003`
**Directory:** `ipfs_accelerate_py/`

**Features:**
- Distributed AI/ML operations
- Model inference acceleration
- GPU/WebGPU integration
- Queue management for async tasks
- Dashboard for monitoring

## SwissKnife Virtual Desktop

The SwissKnife virtual desktop is the primary user interface that integrates with all three MCP servers.

**Access Methods:**
1. **Electron Integration** (Primary): `Windows → SwissKnife Virtual Desktop`
2. **Development Server**: `./scripts/start-swissknife.sh`
3. **Built Version**: Available after running `cd swissknife && npm run build`

**Features:**
- Unified terminal interface
- Quick action buttons for common tasks
- Real-time MCP connection status
- 157+ development tools
- AI-powered development assistance

## Daemon Manager Features

### Automatic Startup
- All MCP daemons auto-start 2 seconds after app launch
- Configurable via environment variable (future)

### Health Monitoring
- Health checks every 30 seconds
- Automatic detection of crashed processes
- Auto-restart with exponential backoff (max 3 attempts)

### Process Management
- Individual daemon control (start/stop/restart)
- Bulk operations (start all/stop all)
- Graceful shutdown with 5-second timeout
- Force kill if graceful shutdown fails

### Logging
- Real-time log capture from stdout/stderr
- Circular buffer (last 100 entries per daemon)
- Event log for manager-level events
- Log filtering (excludes non-critical warnings)

### Status Tracking
- Real-time status: `starting`, `running`, `stopped`, `error`
- Uptime tracking
- Restart count
- Last error message
- PID and port information

## GUI Features

### Daemon Manager Dashboard
**Access:** `Windows → Daemon Manager` or `Daemons → Daemon Manager`

**Features:**
- Status cards for each daemon
- Individual control buttons
- Global control panel
- Real-time event log
- Auto-refresh every 10 seconds
- Modern gradient UI with glassmorphism

### Control Surface Operator Console
**Access:** `Control Surface → Operator Console`

The Hallucinate App shell includes an operator-facing `control_surface` console
for multimodal policy operations and diagnostics. It is intentionally scoped to
the desktop shell: operators can create strict-template policy rules, inspect the
compiled policy artifact payloads, review confirmation-gated mediation requests,
and approve or reject those requests before a receipt is emitted.
The console keeps this diagnostic state in the Electron session; daemon service
invocation can consume the same policy, mediation, and receipt shapes when the
service path is connected.

**Policy controls:**
- Compiles strict natural-language rules such as `ignore my wrist gestures at night`
  and `require confirmation before sending messages`.
- Shows the resulting `policy_bundle_ref`, `compiled_policy_cid`, frame-logic
  facts, event-calculus guard atoms, deontic norms, and operator explanations.
- Tracks active policy refs considered by the mediation path so UI diagnostics
  line up with the Python `control_surface_policy` and `control_surface_mediator`
  data model.

**Confirmation and receipt diagnostics:**
- Queues sample confirmation-gated actions from compiled policies for operator
  approval testing.
- Approval or rejection records the mediated outcome and emits a structured
  `mediation_receipt` with the interaction envelope, policy decision, policy
  refs, invocation result, and receipt CID.
- The preload bridge exposes `window.electronAPI.controlSurface` methods for
  snapshots, policy creation, confirmation approval/rejection, and receipt
  viewing without enabling renderer Node integration.

### Daemon-Managed Invocation Mediation

`HAO-020` connects daemon-managed service calls to the same `control_surface`
pre-invocation mediation model used by ORB surfaces. The shared Node hook lives
in `hallucinate_app/node/control_surface_invocation.js`; both
`MCPDaemonManager` and the legacy `DaemonManager` expose:

- `setControlSurfacePolicyHook(policyHook)` to install the active runtime
  policy evaluator.
- `beforeInvoke(daemonId, invocation)` to return the normalized
  `interaction_envelope`, `policy_decision`, and `mediation_receipt`.
- `invokeManagedService(daemonId, invocation, invoker)` to run the same before
  invoke hook and only call the supplied transport invoker when the policy
  outcome is executable.

The matching Python helper is
`hallucinate_app.control_surface_service_invocation.before_invoke_service`.
It normalizes MCP and ORB service attempts into the canonical interaction
envelope, calls `control_surface_mediator.evaluate_control_surface_interaction`,
and builds the standard `mediation_receipt`.

Daemon-managed transports must use this hook before dispatching to local, HTTP,
websocket, or `mcp-server` adapters. Blocking outcomes such as `deny`,
`require_confirmation`, `defer`, and `rate_limit` return a denial result and
the underlying transport callback is not invoked. Direct calls to daemon ports
or ORB transport adapters are not a policy-aware service path.

### Menu System

**Daemons Menu:**
- Daemon Manager window
- Start/Stop/Restart All
- Individual daemon controls for each MCP server

**Windows Menu:**
- SwissKnife Virtual Desktop
- Daemon Manager
- Test Interface
- Benchmark Dashboard
- Model Tester
- IPFS Kit Dashboard

**Control Surface Menu:**
- Operator Console
- Queue Confirmation Demo

## Usage

### Starting the Application

```bash
cd /home/barberb/hallucinate_app
npm start
```

The app will:
1. Launch the Electron window
2. Wait 2 seconds
3. Auto-start all 3 MCP daemons
4. Ready for SwissKnife integration

### Starting SwissKnife Development Server

```bash
./scripts/start-swissknife.sh
```

This will:
1. Install dependencies if needed
2. Start the Vite dev server on port 5173
3. Make SwissKnife available to the Electron app

### Accessing Features

1. **Via Menu:**
   - `Windows → SwissKnife Virtual Desktop`
   - `Daemons → Daemon Manager`

2. **Via Keyboard:**
   - SwissKnife loads automatically if dev server is running
   - Daemon controls accessible via menu shortcuts

## Development

### Adding a New MCP Server

Edit `hallucinate_app/node/mcp_daemon_manager.js`:

```javascript
this.daemonConfigs = [
  // ... existing configs ...
  {
    id: 'my-new-mcp',
    name: 'My New MCP Server',
    command: 'python',
    args: ['-m', 'my_package.mcp_server'],
    cwd: path.join(this.baseDir, 'my_package'),
    port: 3004,
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  }
];
```

### Debugging

**Enable development mode:**
```bash
NODE_ENV=development npm start
```

This will:
- Open DevTools automatically
- Show verbose logging
- Enable live reload

**Check daemon logs:**
- Access via Daemon Manager dashboard
- Or check terminal output from Electron

### Graceful Shutdown

The app automatically stops all daemons when closing:
1. User clicks quit or closes all windows
2. App emits `before-quit` event
3. Daemon manager stops all processes
4. 5-second grace period for shutdown
5. Force kill any remaining processes
6. App exits

## Troubleshooting

### SwissKnife Not Loading

**Solution 1:** Start dev server
```bash
./scripts/start-swissknife.sh
```

**Solution 2:** Build SwissKnife
```bash
cd swissknife
npm run build
```

### MCP Server Not Starting

**Check logs:**
1. Open Daemon Manager
2. Check event log for errors
3. Look for missing dependencies

**Common issues:**
- Missing Python dependencies
- Port already in use
- Python not in PATH
- Virtual environment not activated

### Daemon Keeps Restarting

**Check:**
1. Python dependencies installed
2. Correct Python version (3.12+)
3. Configuration files present
4. No port conflicts

**Auto-restart limit:** 3 attempts before giving up

## Environment Variables

- `NODE_ENV=development` - Enable development mode
- `PYTHONUNBUFFERED=1` - Automatic (unbuffered Python output)
- Future: `AUTO_START_DAEMONS=false` - Disable auto-start

## Security Considerations

- Daemons run in local user context
- No external network exposure by default
- Logs filtered to prevent sensitive data leakage
- Graceful shutdown prevents orphaned processes

## Performance

- Minimal resource overhead (~50MB per MCP server)
- Health checks every 30 seconds (configurable)
- Log rotation keeps memory usage bounded
- Efficient process spawning with Node.js child_process

## Future Enhancements

- [ ] Configuration file support
- [ ] Custom port configuration
- [ ] Advanced health check strategies
- [ ] Performance metrics dashboard
- [ ] Log export functionality
- [ ] Remote MCP server support
- [ ] Docker container integration
- [ ] Multi-instance support
