# Hallucinate App Architecture

## System Overview

Hallucinate App is an **Electron-based wrapper and orchestration platform** that integrates multiple powerful tools into a unified desktop application. The application serves as a **comprehensive container** that packages SwissKnife Virtual Desktop and three IPFS MCP servers into distributable formats for Windows, macOS, and Linux.

### The Wrapper Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│              Hallucinate Electron App (Main Wrapper)                │
│                                                                       │
│  Packages and Orchestrates:                                          │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 1. SwissKnife Virtual Desktop (User Interface)                 │ │
│  │    - 27+ Professional Applications                             │ │
│  │    - P2P Collaboration Features                                │ │
│  │    - AI Integration (HuggingFace, OpenRouter)                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 2. IPFS Kit MCP Server (Port 3001)                             │ │
│  │    - IPFS Operations & Cluster Management                      │ │
│  │    - Storage Backends & Content Addressing                     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 3. IPFS Datasets MCP Server (Port 3002)                        │ │
│  │    - GraphRAG & Document Intelligence                          │ │
│  │    - 200+ Tools for Data Processing                            │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 4. IPFS Accelerate MCP Server (Port 3003)                      │ │
│  │    - Hardware-Accelerated ML Inference                         │ │
│  │    - Distributed AI Computing                                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
           ↓
    Distributes As
           ↓
  .exe, .dmg, .rpm, .deb, tar.gz
```

**Key Insight:** Hallucinate App **wraps around** these components, managing their lifecycle and providing a unified interface. Users install **one application** and get access to **all components** seamlessly integrated.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Electron Main Process                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Menu System  │  │ IPC Manager  │  │  Process Manager    │  │
│  └──────────────┘  └──────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐   ┌────────▼────────┐   ┌──────▼──────────┐
│   Renderer     │   │  Python Server  │   │  MCP Daemons    │
│   Processes    │   │   Processes     │   │                 │
├────────────────┤   ├─────────────────┤   ├─────────────────┤
│ • Dashboard    │   │ • IPFS Kit      │   │ • IPFS Accel    │
│ • Auth UI      │   │ • Model Manager │   │ • SwissKnife    │
│ • Settings     │   │ • Transformers  │   │ • HuggingFace   │
└────────────────┘   └─────────────────┘   └─────────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   Resource Pool    │
                    │  (Shared Services) │
                    └────────────────────┘
```

## Core Components

### 1. Electron Application Layer

**Main Process (index.js)**
- Application lifecycle management
- Window creation and management
- Menu system with dynamic items
- IPC communication coordination
- Process spawning and monitoring

**Renderer Processes**
- Dashboard UI (HTML/CSS/JavaScript)
- Security management interface
- Model testing interface
- Configuration panels

### 2. Python Service Layer

**IPFS Integration**
- `ipfs_kit_py`: Core IPFS operations
- `ipfs_datasets_py`: Dataset management with GraphRAG
- `ipfs_accelerate_py`: Model serving and inference
- `ipfs_faiss_py`: Vector search
- `ipfs_embeddings_py`: Embedding generation

**Authentication & Security**
- `ucan_auth_py`: UCAN-based authentication
- `keystore_py`: Encrypted credential storage
- `auth_keystore_py`: Capability-based API access

### 3. Data Storage Layer

**Multi-Database System**
- **OrbitDB**: Peer-to-peer event-based storage
- **FireproofDB**: CRDT-based serverless database
- **DuckDB**: Analytical SQL database with IPLD support

**Content Management**
- PyArrow Content Index: Metadata management
- IPFS pinning: Content persistence
- Vector storage: FAISS indexes

### 4. MCP Daemon System

**Daemon Manager**
- Lifecycle control (start/stop/restart)
- Health monitoring
- Auto-restart capabilities
- Event logging

**MCP Servers**
1. IPFS Accelerate MCP: AI/ML operations
2. SwissKnife MCP: CLI tools and vibecoding
3. HuggingFace MCP: Model and dataset management

## Key Design Patterns

### Module Pattern

Each module follows a consistent structure:

```javascript
class Module {
  constructor(resources, metadata) {
    this.resources = resources;  // Shared resource pool
    this.metadata = metadata;    // Configuration
  }
  
  async init() {
    // Initialize module
  }
  
  async test() {
    // Self-test functionality
  }
}
```

### Resource Pool Pattern

Modules access shared services through a resource pool:

```javascript
const resourcePool = {
  ipfsKit: ipfsKitInstance,
  authManager: authManagerInstance,
  keystore: keystoreInstance,
  orbitDb: orbitDbInstance,
  fireproofDb: fireproofDbInstance,
  duckDb: duckDbInstance,
  contentIndex: contentIndexInstance
};
```

### Integration Layer Pattern

External packages are wrapped with integration layers:

```javascript
// Integration layer for external package
class ExternalPackageIntegration {
  constructor(resources, metadata) {
    this.external = new ExternalPackage(); // From PyPI/npm
    this.resources = resources;
  }
  
  // Provide consistent interface
  async operation() {
    return await this.external.operation();
  }
}
```

## Process Architecture

### Multi-Process Design

The application uses multiple processes to prevent blocking:

```
Main Process
├── Python Process Pool
│   ├── IPFS Kit Server (dedicated process)
│   ├── Model Server 1 (dedicated process)
│   ├── Model Server 2 (dedicated process)
│   └── ... (N model processes)
├── MCP Daemon Processes
│   ├── IPFS Accelerate MCP
│   ├── SwissKnife MCP
│   └── HuggingFace MCP
└── Renderer Processes
    ├── Dashboard Window
    ├── Settings Window
    └── ... (N windows)
```

### Inter-Process Communication

**Methods:**
1. **IPC Channels**: Electron's IPC for renderer ↔ main
2. **Message Queues**: Python multiprocessing queues
3. **Apache Arrow**: Zero-copy data transfer via Plasma store
4. **HTTP/REST**: Python servers expose REST APIs
5. **ZeroRPC**: RPC for structured communication

**Data Exchange:**
- Small messages: JSON serialization
- Large data: Apache Arrow format
- Shared memory: PyArrow Plasma store
- Streaming: Async iterators/generators

## Security Architecture

### UCAN-Based Authentication

```
Principal (DID)
    │
    ├── Capability 1 (resource:action)
    ├── Capability 2 (resource:action)
    └── ...
         │
         └── Delegation Chain
              ├── Token 1 (time-limited)
              └── Token 2 (time-limited)
```

**Key Components:**
- Principals: Decentralized identifiers (DIDs)
- Capabilities: Fine-grained permissions
- Tokens: Time-limited authorization
- Delegation: Chain of authority

### Secure Credential Storage

- Encrypted keystore for API keys
- Platform-specific secure storage (keychain)
- Key rotation mechanisms
- Audit logging

## Data Flow

### Model Inference Flow

```
1. User Request
   │
   ├→ Dashboard UI
   │    │
   │    └→ IPC to Main Process
   │         │
   │         └→ HTTP Request to Python Server
   │              │
   │              ├→ Check UCAN Capability
   │              │
   │              ├→ Retrieve Model from IPFS
   │              │   (via IPFS Kit Process)
   │              │
   │              ├→ Load Model in Dedicated Process
   │              │
   │              └→ Run Inference
   │                   │
   │                   └→ Return Results via Arrow
   │
   └→ Display Results
```

### Data Synchronization Flow

```
1. Data Update
   │
   ├→ OrbitDB (P2P Event Storage)
   │    │
   │    └→ Sync Event Emitted
   │         │
   │         ├→ FireproofDB (CRDT Replication)
   │         │
   │         └→ DuckDB (SQL Analytics)
   │              │
   │              └→ IPLD Export (for P2P exchange)
   │
   └→ PyArrow Content Index (Metadata Update)
```

## Observability

### Metrics Collection

- **Prometheus**: Metrics exposition
- **Structured Logging**: Context-aware logs
- **Performance Tracking**: Operation timing
- **Error Tracking**: Detailed error information

### Multimodal Control Plane Operations

The multimodal control plane extends the existing observability and security
model with rollout-safe feature flag controls around the
`control_surface_contract`, `interaction_envelope`, `policy_decision`, and
`mediation_receipt` path. Rollouts must start in non-enforcing shadow mode, emit
the same metrics and audit receipts as enforcement, and only then move to
blocking runtime mediation.

Required feature flag gates:
- `CONTROL_SURFACE_SCHEMA_MODE=off|shadow|enforce` controls descriptor and
  envelope schema validation.
- `CONTROL_SURFACE_POLICY_MODE=off|shadow|enforce` controls policy decision
  evaluation and whether blocking outcomes can stop invocation.
- `CONTROL_SURFACE_RUNTIME_MEDIATION=off|shadow|enforce` controls local desktop
  and Swissknife ORB before-invoke mediation.
- `CONTROL_SURFACE_DAEMON_MEDIATION=off|shadow|enforce` controls the MCP
  before-invoke hook for daemon-managed transports.
- `CONTROL_SURFACE_REMOTE_CLIENTS=off|shadow|enforce` controls Meta-glasses,
  mobile, and simulator event adoption.
- `CONTROL_SURFACE_AUDIT_PAYLOADS=metadata|full-local` controls whether audit
  storage keeps only redacted payload metadata or the full local raw payload.

Audit metrics must be low-cardinality and must not expose raw payload fields,
arguments, actor identifiers, transcripts, images, sensor samples, or delegation
tokens as labels. The baseline metrics are
`control_surface_interactions_total`,
`control_surface_policy_decisions_total`,
`control_surface_policy_decision_latency_ms`,
`control_surface_mediation_receipts_total`,
`control_surface_schema_validation_failures_total`,
`control_surface_raw_payload_redactions_total`, and
`control_surface_rollback_events_total`. Labels are limited to stable categories
such as `surface`, `surface_event`, `method`, `outcome`, `source`, `schema`,
`mode`, and `rollback_type`.

Raw payload privacy boundaries:
- `raw_payload` is runtime evidence for mediation and operator audit, not a
  metrics, log, or remote telemetry payload.
- Media bytes, audio frames, images, location traces, DOM snapshots, secrets,
  credentials, and delegation tokens must be replaced with a CID, correlation
  handle, or redacted summary before any non-local export.
- Persistent audit receipts may retain full raw payloads only in the local
  user-context receipt store when `CONTROL_SURFACE_AUDIT_PAYLOADS=full-local`;
  dashboards and exported reports use redacted receipt views.
- Security review for new adapters must verify envelope schema validation,
  redaction coverage, permission scope, confirmation gates for destructive
  actions, and denial behavior before enforcement mode is enabled.

Rollback controls are part of the architecture, not an incident afterthought:
- Schema rollback: set `CONTROL_SURFACE_SCHEMA_MODE=shadow` or `off`, restore
  the previous descriptor schema and contract version, keep dual-read validators
  for receipts already emitted, and record a `schema` rollback audit event.
- Policy rollback: detach the active `policy_bundle_ref`, restore the previous
  `compiled_policy_cid`, clear evaluator caches, force
  `CONTROL_SURFACE_POLICY_MODE=shadow`, and record the operator and reason in
  the audit trail.
- Runtime mediation rollback: set `CONTROL_SURFACE_RUNTIME_MEDIATION=shadow`
  and `CONTROL_SURFACE_DAEMON_MEDIATION=shadow`, or set either to `off` if the
  mediator is unhealthy, remove the active policy hook from daemon managers,
  restart affected MCP daemons if needed, and verify that blocking policy
  decision counts drop while shadow receipts continue.

### Dashboard Integration

- Real-time status monitoring
- Performance visualizations
- Error analytics
- Resource usage tracking

## Extensibility

### Adding New Modules

1. Create integration layer for external package
2. Implement standard module interface
3. Register with resource pool
4. Add dashboard component (optional)
5. Implement test method
6. Update documentation

### Adding New Databases

1. Create database adapter
2. Implement sync manager integration
3. Add IPLD conversion (if needed)
4. Update resource pool
5. Create visualization components

## Performance Considerations

### Optimization Strategies

1. **Process Isolation**: Prevent blocking operations
2. **Zero-Copy Transfer**: Apache Arrow for large data
3. **Lazy Loading**: Load resources on demand
4. **Caching**: Multi-level cache hierarchy
5. **Parallel Processing**: Utilize multiple CPU cores

### Resource Management

- Process pool size limits
- Memory allocation controls
- Connection pooling
- Automatic resource cleanup

## Deployment Architecture

### Development Mode
```
localhost:3000 (Electron)
  ├── localhost:8000 (Python API)
  ├── localhost:9090 (Prometheus)
  ├── localhost:3001 (SwissKnife)
  └── IPFS daemon (local)
```

### Production Mode
```
Electron App (packaged)
  ├── Embedded Python runtime
  ├── Bundled dependencies
  ├── Local IPFS node
  └── Configuration files
```

### Kubernetes Deployment
```
Namespace: hallucinate-app
  ├── IPFS Kit Pods (StatefulSet)
  ├── Model Server Pods (Deployment)
  ├── Database Pods (StatefulSet)
  ├── Ingress (External access)
  └── Services (Internal communication)
```

## Technology Stack

### Frontend
- Electron 32.x
- HTML5/CSS3
- Vanilla JavaScript (ES Modules)
- Chart.js for visualizations

### Backend
- Python 3.8+
- Node.js 18.x+
- FastAPI for REST APIs
- AsyncIO for concurrency

### Storage & Data
- IPFS (Kubo)
- OrbitDB
- FireproofDB
- DuckDB
- PyArrow/Plasma

### Security
- UCAN protocol
- Ed25519 cryptography
- AES-256-GCM encryption
- Keytar/Keyring

### Observability
- Prometheus
- Grafana
- Structured logging (structlog)

## References

- [Multi-Process Architecture](../hallucinate_app/python/hallucinate_app/README_MULTIPROCESS.md)
- [Security Overview](../README_SECURITY.md)
- [MCP Daemon Architecture](MCP_DAEMON_ARCHITECTURE.md)
- [Multi-Database System](../hallucinate_app/python/hallucinate_app/README_MULTIDB.md)

---

*Last Updated: Automatically via GitHub Actions*
