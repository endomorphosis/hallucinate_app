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

### HAO-441 Launch Feature Contracts

`HAO-441` records the launch-scoped MCP server feature inventory for
Swissknife integration in
`data/hallucinate_multimodal_control/discovery/2026-06-23-hao-441-mcp-server-feature-inventory.md`.
The contract is intentionally explicit:

- `ipfs_datasets_py` exposes hierarchical MCP meta-tools:
  `tools_list_categories`, `tools_list_tools`, `tools_get_schema`, and
  `tools_dispatch`. Swissknife dataset surfaces use `tools_dispatch` with
  categories such as `dataset_tools`, `ipfs_tools`,
  `index_management_tools`, `background_task_tools`, and
  `provenance_tools`.
- `ipfs_accelerate_py` exposes the canonical MCP++ runtime with
  `tools_list_categories`, `tools_list_tools`, `tools_get_schema`,
  `tools_dispatch`, and `tools_runtime_metrics`. Swissknife compute surfaces
  consume hardware profile, inference job, job status, and telemetry bindings.
- `ipfs_kit_py` exposes concrete IPFS, pin-management, storage, migration,
  search, streaming, and system-health tools such as `ipfs_add`,
  `ipfs_cat`, `ipfs_pin_add`, `list_pins`, `get_pin_stats`,
  `system_health`, and `list_backends`. It does not provide a launch contract
  for generic `tools_dispatch` task delegation; Swissknife and Hallucinate App
  must name the concrete tool or endpoint.

All three daemon paths must pass through the Hallucinate App pre-invocation
mediation hook before transport dispatch. Receipts for launch evidence need the
daemon id, package name, entrypoint, transport, protocol path, tool name,
category where applicable, Swissknife consumer, policy decision, mediation
receipt id, descriptor/interface CIDs, argument hash, redaction profile,
upstream status, artifact/event/decision/receipt CIDs, and parent receipt CID.

### HAO-445 Mcp-Plus-Plus Compatibility

`HAO-445` validates the Mcp-Plus-Plus launch compatibility contract for
Hallucinate App and Swissknife without changing the Python daemon command
surface documented by `HAO-441`. The compatibility evidence lives in
`Mcp-Plus-Plus/docs/compatibility/HAO-445-hallucinate-swissknife.md`,
`swissknife/contracts/mcp_plus_plus_compatibility_receipt.schema.json`, and
`data/hallucinate_multimodal_control/discovery/2026-06-23-hao-445-mcp-plus-plus-compatibility.md`.

The compatible protocol negotiation path is:

1. Swissknife or Hallucinate App opens the configured transport and sends MCP
   `initialize` with `protocolVersion`, `clientInfo`, and
   `capabilities.mcpPlusPlusProfiles`.
2. The daemon or adapter returns standard MCP capabilities plus accepted
   MCP++ profiles. The client records the negotiated profile set and sends
   `notifications/initialized`.
3. Swissknife resolves the capability descriptor through MCP++ Profile A
   semantics: descriptor/interface CID, `interfaces/list`, `interfaces/get`,
   `interfaces/compat`, methods, schemas, `requires[]`, compatibility metadata,
   error definitions, and event stream declarations.
4. Hallucinate App builds the normal interaction envelope and policy decision
   before any `tools/call`, `tools_dispatch`, concrete `ipfs_kit_py` tool, or
   REST endpoint is dispatched.
5. The final tool receipt links the protocol negotiation, capability descriptor,
   transport, policy outcome, daemon response or error, lifecycle events,
   descriptor/interface CID, argument hash, decision CID, event CID, receipt
   CID, and parent receipt CID.

Launch-compatible transports are `mcp-server`, `http`, `stdio`, `websocket`,
`local`, `orb`, and optional MCP+p2p `/mcp+p2p/1.0.0`. Peer identity,
descriptor trust, UCAN checks, and upstream MCP++ policy controls can strengthen
the request, but they do not replace Hallucinate App mediation. Swissknife
capability descriptors describe the operation; Hallucinate App remains the
policy and command authority; Python daemon commands remain the execution
authority.

Errors must preserve both layers. Policy failures use the existing outcomes
`deny`, `require_confirmation`, `defer`, `rewrite`, `fallback_surface`, and
`rate_limit`; daemon failures preserve JSON-RPC codes, transport timeouts,
unavailable health, schema mismatch, and upstream execution errors. Compatible
launch receipts never include raw payload bodies, credentials, media, prompts,
transcripts, or bearer tokens; they carry CIDs, hashes, schema ids, status,
redacted auth context, and a tool receipt lineage.

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

### HAO-442 Launch Path

`HAO-442` makes Hallucinate App the owner of the Python MCP daemon lifecycle.
Swissknife and Meta glasses surfaces consume daemon state and launch receipts,
but they must not spawn unmanaged `ipfs_accelerate_py`, `ipfs_datasets_py`, or
`ipfs_kit_py` server processes.

Startup order is deterministic:

1. launch `ipfs_kit_py` as daemon id `ipfs-kit` on `127.0.0.1:3001`
2. launch `ipfs_datasets_py` as daemon id `ipfs-datasets` on `127.0.0.1:3002`
3. launch `ipfs_accelerate_py` as daemon id `ipfs-accelerate` on `127.0.0.1:3003`

The ordered launch path lives in `hallucinate_app/node/mcp_daemon_manager.js`
and is triggered from `hallucinate_app/index.js` after Electron startup. The
preload bridge exposes renderer-safe methods for Swissknife and glasses
renderers:

- `window.electronAPI.daemon.getLaunchPlan()`
- `window.electronAPI.daemon.getLaunchReceipts(limit)`
- `window.electronAPI.daemon.checkHealth(daemonId)`
- `window.electronAPI.daemon.startAll()` and `stopAll()`

Each Python process receives a redacted, launch-scoped environment:

- `PYTHONUNBUFFERED=1`
- `PYTHONPATH=<daemon cwd>:<hallucinate_app root>:<existing PYTHONPATH>`
- `HALLUCINATE_APP_MCP_DAEMON_ID`
- `HALLUCINATE_APP_MCP_PACKAGE`
- `HALLUCINATE_APP_MCP_PORT`
- `HALLUCINATE_APP_CONTROL_SURFACE_CONTRACT_REF`
- `CONTROL_SURFACE_DAEMON_MEDIATION`, defaulting to `shadow`

Daemon health combines process liveness with a bounded HTTP probe of the
configured health path. Launch startup waits for an initial daemon health result
and records a `launch_health_checked` receipt. Ongoing daemon health checks run
on the configured interval, default `30000ms`, and emit `daemon_health`
receipts. A process-liveness failure marks the daemon stopped and schedules an
auto-restart when the daemon has not exceeded the configured restart limit.

Restart behavior is capped by `MCP_DAEMON_MAX_RESTARTS`, default `3`. Crash
exits and failed process health checks both emit `restart_scheduled` receipts
before relaunching. App shutdown stops daemons in reverse startup order so the
compute and dataset servers leave before the storage/IPFS server.

Every HAO-442 launch receipt uses
`receipt_schema: mcp_daemon_launch_receipt_v1` and includes `task_id`,
`daemon_id`, `server_package`, `startup_order`, exact `entrypoint`, `cwd`,
`pid`, `port`, `endpoint`, `transport`, `rpc_path`, `health_path`,
`mediation_hook`, `control_surface_contract_ref`, `swissknife_consumer`,
`glasses_render_profile`, restart counters, redaction profile, event details,
and `receipt_cid`. The render profile is `daemon-health-summary`, which gives
Swissknife and Meta glasses enough data to show daemon launch state without raw
payloads, credentials, transcripts, or service arguments.

### Automatic Startup
- All MCP daemons auto-start 2 seconds after app launch in HAO-442 startup
  order: `ipfs_kit_py`, `ipfs_datasets_py`, then `ipfs_accelerate_py`.
- Health and restart timing are configurable with
  `MCP_DAEMON_STARTUP_TIMEOUT_MS`, `MCP_DAEMON_HEALTH_INTERVAL_MS`, and
  `MCP_DAEMON_MAX_RESTARTS`.

### Health Monitoring
- Health checks every 30 seconds
- Daemon health checks record both process liveness and HTTP health probe
  status.
- Automatic detection of crashed or missing processes
- Auto-restart on crash or failed process health, capped at 3 attempts by
  default.

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

### Daemon Mediation Observability, Flags, And Rollback

The daemon before-invoke path is guarded independently from descriptor rollout
so operators can shadow-test policy decisions without breaking MCP availability.
The rollout feature flag is `CONTROL_SURFACE_DAEMON_MEDIATION`:

- `off`: daemon managers install no active control-surface policy hook; service
  invocations proceed through existing transport behavior.
- `shadow`: daemon managers call `beforeInvoke`, emit the normalized
  `interaction_envelope`, `policy_decision`, `mediation_receipt`, metrics, and
  audit records, but still call the transport invoker.
- `enforce`: daemon managers treat blocking policy decision outcomes as
  authoritative and do not invoke the underlying transport callback.

Daemon metrics should be emitted with bounded labels only:
- `mcp_control_surface_before_invoke_total{daemon,transport,mode}`
- `mcp_control_surface_policy_decisions_total{daemon,transport,outcome,mode}`
- `mcp_control_surface_policy_decision_latency_ms{daemon,transport,outcome}`
- `mcp_control_surface_blocked_invocations_total{daemon,transport,outcome}`
- `mcp_control_surface_receipts_total{daemon,persisted,mode}`
- `mcp_control_surface_bypass_attempts_total{daemon,transport}`

Daemon audit records link each mediated invocation to `service_id`, `method`,
`control_surface_contract_ref`, `decision_id`, receipt CID when persisted, and
the final invocation result. They must not log raw payload contents, service
arguments, credentials, bearer tokens, delegation chains, transcripts, images,
or sensor samples. If raw evidence is needed for a local security review, keep
it behind the `CONTROL_SURFACE_AUDIT_PAYLOADS=full-local` boundary and expose
only redacted receipt summaries in daemon dashboards.

Runtime rollback steps for daemon mediation:
1. Change `CONTROL_SURFACE_DAEMON_MEDIATION` from `enforce` to `shadow` to stop
   blocking while preserving metrics and audit receipts.
2. If shadow evaluation is also unhealthy, set the flag to `off` and call
   `setControlSurfacePolicyHook(null)` on `MCPDaemonManager` and
   `DaemonManager`.
3. Restart only the affected daemon processes from the Daemon Manager UI or the
   existing `restartDaemon` path so ports, logs, and process state stay scoped.
4. Confirm that `mcp_control_surface_blocked_invocations_total` is no longer
   increasing, that daemon health checks are green, and that a `runtime` rollback
   audit event was emitted with the operator, reason, old mode, and new mode.

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
