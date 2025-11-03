Hallucinate Electron App:

![357108775-19cd87d5-d049-467c-a5ea-b53a636b6422](https://github.com/user-attachments/assets/72cef41c-3b46-4746-abbb-4cf19625994f)
![357736268-9b1695ee-a3d0-41bf-a010-8757d6138ca1](https://github.com/user-attachments/assets/cc90c796-030a-40a2-8437-a1ea9507e29b)

## Overview

Hallucinate App is an Electron-based desktop application that creates a bridge between IPFS and HuggingFace technologies, enabling decentralized AI model serving, dataset management, and inference. The application leverages a modular architecture with paired JavaScript and Python implementations, secure UCAN-based authentication, efficient Apache Arrow data exchange, and a resource pool pattern for module interdependencies.

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
2. Initializes git submodules (`ipfs_accelerate_py`, `ipfs_datasets_py`, `ipfs_kit_py`, `swissknife`)
3. Installs Python dependencies for all submodules

### Manual Submodule Installation

If you need to install submodule dependencies separately:

```bash
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