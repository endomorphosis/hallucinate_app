# Hallucinate App Architecture

## System Overview

Hallucinate App is an Electron-based desktop application that bridges IPFS and HuggingFace technologies, enabling decentralized AI model serving, dataset management, and inference. The application uses a modular architecture with paired JavaScript and Python implementations, secure UCAN-based authentication, and efficient data exchange mechanisms.

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
