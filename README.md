Hallucinate Electron App:

![357108775-19cd87d5-d049-467c-a5ea-b53a636b6422](https://github.com/user-attachments/assets/72cef41c-3b46-4746-abbb-4cf19625994f)
![357736268-9b1695ee-a3d0-41bf-a010-8757d6138ca1](https://github.com/user-attachments/assets/cc90c796-030a-40a2-8437-a1ea9507e29b)

## Overview

**Hallucinate App is a comprehensive wrapper and orchestration platform** that packages multiple powerful tools into a single, distributable desktop application. It serves as the **container** that brings together:

1. **SwissKnife Virtual Desktop** - Revolutionary collaborative development environment with 27+ professional applications
2. **IPFS Kit MCP Server** - IPFS operations, cluster management, and distributed storage
3. **IPFS Datasets MCP Server** - AI data processing with 200+ tools, GraphRAG, and document intelligence
4. **IPFS Accelerate MCP Server** - Hardware-accelerated ML inference and distributed computing

All of these components are **packaged together into distributable formats** (`.exe`, `.dmg`, `.rpm`, `.deb`, `tar.gz`) providing users with a complete decentralized AI desktop environment in a single installation.

### How It Works

Hallucinate App is an **Electron-based wrapper application** that:
- **Orchestrates** all submodule services through a unified MCP Daemon Manager
- **Provides** a desktop interface that integrates SwissKnife Virtual Desktop
- **Manages** three Python-based MCP servers running in the background
- **Packages** everything into platform-specific installers for easy distribution
- **Enables** users to access all functionality through a single application

Think of it as a **fully containerized AI desktop** - everything you need for decentralized AI development, pre-integrated and ready to run.

## 📱 Mobile Support (NEW - Capacitor)

Hallucinate App now supports iOS and Android through **Capacitor**, enabling full platform coverage across desktop and mobile:

### Supported Platforms

- **Desktop**: Windows, macOS, Linux, RHEL (via Electron)
- **Mobile**: iOS, Android (via Capacitor)

### Mobile Features

- ✅ Native iOS and Android apps from shared web codebase
- ✅ WebGPU hardware acceleration (iOS 18+, Android Chrome 121+)
- ✅ WebNN support (experimental on Android)
- ✅ ONNX model inference in browser
- ✅ Model collection viewer
- ✅ Experimental features (Gradio Lite, Jupyter Lite, Streamlit Lite)

### Quick Start - Mobile

```bash
# Build web assets for mobile
npm run build:web

# Add iOS platform
npm run cap:add:ios

# Add Android platform  
npm run cap:add:android

# Open in native IDE
npm run cap:open:ios      # Opens Xcode
npm run cap:open:android  # Opens Android Studio
```

For detailed mobile setup instructions, see [CAPACITOR_SETUP.md](CAPACITOR_SETUP.md).

For WebNN/WebGPU hardware acceleration details, see [Mobile Platform Guide](.github/workflows/MOBILE_PLATFORM_GUIDE.md).

## 📚 Documentation

For comprehensive documentation, see:
- **[Platform Overview](docs/PLATFORM_OVERVIEW.md)** - 🆕 Complete platform architecture and how everything fits together
- **[Visual Architecture](docs/VISUAL_ARCHITECTURE.md)** - 🆕 Diagrams showing how the wrapper orchestrates all components
- **[Submodules Guide](docs/SUBMODULES.md)** - 🆕 Detailed documentation for SwissKnife, IPFS Kit, Datasets, and Accelerate
- **[Containerization Guide](docs/CONTAINERIZATION.md)** - 🆕 Packaging and distribution details (.exe, .dmg, .rpm, .deb)
- **[Documentation Index](docs/INDEX.md)** - Complete documentation structure
- **[Architecture Guide](docs/ARCHITECTURE.md)** - System design and architecture
- **[Quick Start Guide](docs/QUICK_START.md)** - Get started quickly
- **[Quick Start: Building](docs/QUICK_START_BUILD.md)** - Build and deploy in minutes
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Changelog](CHANGELOG.md)** - Version history

> 💡 **Tip:** Documentation is automatically updated weekly via GitHub Actions based on code changes.

## Installation

For detailed installation instructions, see [docs/INSTALLATION.md](docs/INSTALLATION.md).

### Quick Start

```bash
# Clone the repository
git clone https://github.com/endomorphosis/hallucinate_app.git
cd hallucinate_app

# Install all dependencies (JavaScript + Python + submodules)
npm install

# Or use Make
make install-all-deps
```

The `npm install` command automatically:
1. Installs Node.js/JavaScript dependencies
2. Checks if submodules need initialization
3. Initializes git submodules (if needed)
4. Installs Python dependencies for all submodules (if needed)

**Note:** The postinstall script only runs when needed. To skip it:
```bash
SKIP_SUBMODULE_INSTALL=true npm install
```

### Manual Submodule Installation

If you need to install submodule dependencies separately:

```bash
# Using npm script
npm run install:submodules

# Using Make
make install-submodule-deps

# Using the installation script directly
bash scripts/install_submodule_deps.sh
# or
python scripts/install_submodule_deps.py
```

### Key Features

- **Decentralized AI**: Access and serve AI models through IPFS and libp2p networks
- **Secure Authentication**: UCAN-based capability verification for all operations
- **Secure Keystore**: Encrypted storage for API keys and credentials
- **Distributed Databases**: OrbitDB, FireproofDB, and DuckDB with IPLD support
- **Dashboard**: Comprehensive testing and monitoring interface for all modules
- **Error Handling**: Advanced error monitoring, analysis, and automatic recovery system
- **GraphRAG**: Graph-based Retrieval Augmented Generation for knowledge management
- **MCP Daemon Manager**: Lifecycle management for Model Context Protocol servers
- **SwissKnife Integration**: Web-based virtual desktop and AI-powered CLI tools

## NEW: MCP Daemon Manager

Hallucinate App now includes a comprehensive daemon manager for managing Model Context Protocol (MCP) servers:

### Features

- **Multi-Daemon Management**: Control 3 MCP servers simultaneously:
  1. **IPFS Accelerate MCP**: Distributed AI/ML operations and inference
  2. **SwissKnife MCP**: CLI tools and vibecoding assistance
  3. **HuggingFace MCP**: Model and dataset management

- **Lifecycle Control**: Start, stop, and restart individual or all daemons
- **Health Monitoring**: Automatic health checks with configurable intervals
- **Auto-Restart**: Intelligent auto-restart with max attempt limits
- **Process Management**: Clean process spawning and graceful shutdown
- **Event Logging**: Real-time event tracking for all daemon activities
- **Dashboard UI**: Beautiful web interface for daemon control and monitoring

### Usage

Access the Daemon Manager through the application menu:
- **Menu Bar → Daemons**: Control individual or all MCP servers
- **Menu Bar → Windows → Daemon Manager**: Open the management dashboard

The daemon manager automatically starts all MCP servers on app launch (configurable via `AUTO_START_DAEMONS` environment variable).

## NEW: SwissKnife Virtual Desktop Integration

The application now integrates SwissKnife, a revolutionary collaborative virtual desktop environment:

### SwissKnife Features

- **27+ Professional Applications**: Terminal, VibeCode IDE, AI Chat, File Manager, and more
- **Real-time P2P Collaboration**: Multi-user workspaces with live cursor tracking
- **Distributed Computing**: Share computational resources across peer networks
- **AI Integration**: Access to 100,000+ HuggingFace models and 100+ premium LLMs via OpenRouter
- **IPFS-Powered File Sharing**: Decentralized file storage and collaboration
- **Professional Development Environment**: Monaco editor, AI assistance, live preview

### Launching SwissKnife

Access SwissKnife through:
- **Menu Bar → Windows → SwissKnife Virtual Desktop**

The SwissKnife window will load the collaborative virtual desktop interface, connecting to the development server on `http://localhost:3001` or using the built distribution.

## Dashboard, Security, and Error Handling Features

The application includes a comprehensive dashboard that provides:

- **Authentication & Security Dashboard**: Complete interface for managing UCAN principals, capabilities, and API keys with tabbed sections for each component
- **API Key Management**: Secure storage, rotation, and lifecycle management of third-party API credentials
- **Capability Management**: Create, verify, and revoke capability tokens with fine-grained permissions
- **Principal Management**: Create and manage principals with decentralized identifiers (DIDs)
- **Security Status Monitoring**: Real-time view of authentication system status with detailed component health indicators
- **Security Testing**: Built-in tests for all security components with detailed results reporting
- **Integration Testing**: End-to-end tests for verifying correct integration between authentication components
- **Error Monitoring**: Advanced error monitoring, analysis, and recovery system
- **Component Status**: Real-time health status for all application components
- **Visual Analytics**: Error trends, patterns, and recovery statistics

## Comprehensive Error Handling System

Hallucinate App includes a sophisticated error handling system that ensures reliability across all components:

### Key Components

- **Custom Error Classes**: Specialized error types for different scenarios
- **Error Monitor**: Central system for error tracking, analysis, and recovery
- **Dashboard Integration**: Visual interfaces for error monitoring and management
- **Recovery Strategies**: Automatic recovery from common error types
- **Component Status Tracking**: Real-time health monitoring of all modules

### Features

1. **Error Classification**: Multi-level categorization by severity, source, and type
2. **Error Analysis**: Pattern detection and correlation between errors
3. **Automatic Recovery**: Self-healing capabilities for common error scenarios
4. **Alert System**: Configurable rules for error alerting and notification
5. **Visual Analytics**: Real-time dashboards showing error trends and system health

See the [Error Handling Documentation](hallucinate_app/python/hallucinate_app/README_ERROR_HANDLING.md) for complete details.

## GraphRAG Integration

Hallucinate App integrates Graph-based Retrieval Augmented Generation (GraphRAG) capabilities from the `ipfs_datasets_py` package, which combines vector embeddings with graph databases for advanced knowledge management:

### Features

- **Knowledge Graph Construction**: Build knowledge graphs from documents with automatic entity extraction
- **Hybrid Search**: Combine semantic similarity with graph traversal for more relevant results
- **Persistent Storage**: Save and load knowledge graphs from disk or IPFS
- **IPFS Integration**: Store and retrieve knowledge graphs in a decentralized way
- **Vector Search**: Semantic search with FAISS integration

### GraphRAG Use Cases

- **Document Analysis**: Extract knowledge from documents and create interconnected knowledge bases
- **Context-Aware Search**: Find information based on both semantic similarity and relationship context
- **Knowledge Discovery**: Uncover connections between concepts that aren't obvious in text search
- **Decentralized Knowledge Bases**: Build and share knowledge graphs via IPFS

The GraphRAG integration follows the project's module pattern, providing a clean interface while delegating implementation to the `ipfs_datasets_py` package. See the [GraphRAG Documentation](hallucinate_app/python/hallucinate_app/README_GRAPHRAG.md) for details.

## Authentication and Security Integration

Hallucinate App implements a comprehensive security system through integration with specialized packages:

### Components

- **UCAN Authentication**: Integration with `ucan_auth_py` package for User Controlled Authorization Networks
- **Encrypted Keystore**: Integration with `keystore_py` package for secure API key and credential management
- **Capability-Based API Access**: Integration with `auth_keystore_py` package for fine-grained access control
- **Security Dashboard**: Interactive UI component for managing authentication, API keys, and capabilities
- **Testing Framework**: Comprehensive test suite for security components with integration testing

### Key Security Features

- **Decentralized Authentication**: No central authority required for identity verification
- **Capability Delegation**: Granular permission control through delegation chains
- **Encrypted Credential Storage**: Secure storage for API keys with optional platform keychain integration
- **Key Rotation**: Scheduled and on-demand rotation of sensitive credentials
- **Capability Verification**: Runtime verification of authorization for all sensitive operations
- **Secure API Access**: Capability-based access control for all third-party APIs
- **Integration with Resource Pool**: Secure access to shared resources across the application

Each security component follows the project's integration layer pattern, providing a consistent interface while delegating implementation to specialized external packages. The local implementation acts as a fallback when external packages are unavailable.

## Architecture Components

Contains: 

Chat Interface:

-- ipfs_transformers_cjs client libray

-- ipfs_datasets_cjs client library

-- helia ipfs cjs external library

-- ipfs_cluster cjs external library (against 127.0.0.1 REST interfaces)

-- gradio.cjs client external library 

-- faiss-wasm client external library

-- orbitdb_kit_cjs client library

-- libp2p_kit_cjs client library

NodeJS server:

-- ipfs_model_manager_js nodejs library

-- ipfs_kit_js node js library

-- pyarrow_index_bridge.js for PyArrow Content Index integration

-- Kubo / ipfs_cluster external Go library

-- faiss system external library

-- neural compressor external library

-- huggingface Transformers_js wrapper

-- huggingface_datasets_js wrapper

-- orbitdb_kit_js node.js wrapper

-- huggingface scraper library

Python server:

-- ipfs_model_manager_py package (from PyPI)

-- ipfs_kit_py package (from PyPI, includes PyArrow content index)

-- ipfs_datasets_py package (from PyPI, includes GraphRAG implementation)

-- ipfs_accelerate_py package (from PyPI, provides model server functionality with multi-process architecture)

-- ipfs_faiss_py package (from PyPI)

-- ipfs_embeddings_py package (from PyPI)

-- ucan_auth_py package (from PyPI, provides UCAN-based authentication)

-- keystore_py package (from PyPI, provides secure credential storage)

-- auth_keystore_py package (from PyPI, provides capability-based access to APIs)

-- pyarrow_content_index_bridge.py for JavaScript-Python communication

-- Integration layers for all external packages

-- Kubo / ipfs_cluster external Go library

-- faiss system external library

-- neural compressor external library

-- huggingface Transformers wrapper

-- huggingface_datasets wrapper

-- orbitdb_kit_py node.js wrapper

## PyArrow Content Index Bridge

Hallucinate App includes a comprehensive JavaScript bridge for the PyArrow Content Index, enabling efficient metadata management with observability integration:

### Key Features

- **Bidirectional Communication**: Seamless interaction between JavaScript and Python components
- **Apache Arrow Integration**: Efficient data transfer using the Arrow columnar memory format
- **Observability Integration**: Comprehensive metrics tracking for all operations
- **Dashboard Integration**: Visual interface for content index management
- **Error Handling**: Robust error management with detailed diagnostics

### Components

1. **JavaScript Bridge (`pyarrow_index_bridge.js`)**: Core implementation providing all Content Index operations
2. **Dashboard Registration (`register_pyarrow_content_index_dashboard.js`)**: UI integration component
3. **Python Bridge Module (`pyarrow_content_index_bridge.py`)**: Python-side counterpart

### Use Cases

- **Content Discovery**: Find resources by CID, path, or metadata criteria
- **Metadata Management**: Store and retrieve metadata for IPFS content
- **IPFS Pinset Synchronization**: Keep index in sync with IPFS pins
- **Analytics**: Track content usage and distribution
- **Visual Exploration**: Browse content through the dashboard interface

For complete details, see the [PyArrow Content Index Bridge Documentation](docs/PYARROW_CONTENT_INDEX_BRIDGE.md).

## Multi-Process Architecture

Hallucinate App implements a parallel processing architecture to ensure optimal performance for AI workloads:

### Key Components

1. **IPFS Kit Server**: Runs in a separate process to handle IPFS operations without blocking ML model execution
2. **ML Model Processes**: Each model runs in its own dedicated process with separate memory space
3. **PyArrow Plasma Store**: Provides zero-copy shared memory for efficient data exchange between processes
4. **Asynchronous Communication**: Uses message queues and non-blocking I/O for inter-process communication
5. **Process Lifecycle Management**: Proper resource initialization, monitoring, and cleanup

### Benefits

- **Non-Blocking Operations**: IPFS operations don't block ML model inference
- **Parallel Processing**: Multiple operations can run simultaneously across different processes
- **Memory Isolation**: Ensures model crashes don't affect other components
- **Resource Efficiency**: Better utilization of multi-core systems
- **Scalability**: Easy to scale across available CPU cores

### Implementation Details

The implementation follows a specialized architecture where:

1. The main process manages lifecycle and coordinates between components
2. IPFS operations run in a dedicated process through `IPFSKitServer` 
3. ML models are loaded in separate processes with `ProcessPoolExecutor`
4. Data exchange happens through message queues and shared memory
5. Every process has proper resource cleanup on shutdown

This design ensures high performance for AI model serving from decentralized IPFS storage,
allowing model inference to proceed without being blocked by potentially slow IPFS 
content retrieval operations.

## Building and Packaging

The Hallucinate App can be built and packaged for multiple platforms (macOS, Windows, Ubuntu, RedHat).

### Quick Build

```bash
# Build for your current platform
make build

# Or use the npm script
npm run package
```

### Platform-Specific Builds

#### Linux (Ubuntu/Debian)
```bash
# Create DEB package
make make-deb
# Or
npm run make -- --platform=linux
```

Generates `.deb` packages in `out/make/deb/`

#### Linux (RedHat/Fedora/Rocky)
```bash
# Create RPM package
make make-rpm
# Or
npm run make -- --platform=linux
```

Generates `.rpm` packages in `out/make/rpm/`

#### macOS
```bash
# Create macOS ZIP archive
make make-dmg
# Or
npm run make -- --platform=darwin
```

Generates `.zip` archive with `.app` bundle in `out/make/zip/darwin/`

#### Windows
```bash
# Create Windows installer
make make-exe
# Or
npm run make -- --platform=win32
```

Generates `.exe` installer in `out/make/squirrel.windows/`

### Using Build Scripts

Platform-specific build scripts are available in the `scripts/` directory:

**Linux/macOS:**
```bash
bash scripts/build.sh
```

**Windows:**
```cmd
scripts\build.bat
```

### CI/CD Workflows

Automated builds run on GitHub Actions for all platforms:

- **electron-build.yml**: Main build and release workflow
  - Builds for Ubuntu, macOS, and Windows
  - Tests on Node.js 18.x and 20.x
  - Automatically creates releases for version tags
  
- **platform-tests.yml**: Platform-specific hardware tests
  - Tests on Ubuntu 20.04, 22.04, 24.04
  - Tests on RedHat/Rocky Linux 8, 9
  - Tests on macOS 12, 13, 14
  - Tests on Windows Server 2019, 2022

To trigger a release build, push a version tag:
```bash
git tag v1.0.4
git push origin v1.0.4
```

For more details, see:
- [Platform Installation Guide](docs/INSTALLATION_PLATFORMS.md)
- [CI/CD Workflows README](.github/workflows/README.md)

### System Requirements

**All Platforms:**
- Node.js 18.x or 20.x
- Python 3.8 or higher
- At least 4GB RAM
- At least 2GB free disk space

**Platform-Specific:**
- **Ubuntu/Debian**: Build tools, libx11-dev, libgtk-3-0
- **RedHat/Rocky**: gcc, gtk3, rpm-build
- **macOS**: Xcode Command Line Tools
- **Windows**: Visual Studio Build Tools

### Cleaning Build Artifacts

```bash
make clean-build
# Or
rm -rf out/
```
