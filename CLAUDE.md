# hallucinate_app Development Guide

## Project Overview

hallucinate_app is an Electron-based desktop application that creates a bridge between IPFS and HuggingFace technologies, enabling decentralized AI model serving, dataset management, and inference. The application leverages a modular architecture with paired JavaScript and Python implementations, secure UCAN-based authentication, efficient Apache Arrow data exchange, and a resource pool pattern for module interdependencies. The system uses multiple database technologies including OrbitDB for peer-to-peer data storage, FireproofDB for serverless database mirroring with CRDT capabilities, and DuckDB for analytical SQL queries with IPLD conversion for peer-to-peer exchange via libp2p.

### Key Technologies
- **Frontend**: Electron (cross-platform desktop application)
- **JavaScript**: ES Modules, Node.js
- **Python**: Python 3.8+ with HuggingFace ecosystem 
- **AI/ML**: Transformers, PyTorch, FAISS vector database
- **Decentralized**: IPFS, libp2p, OrbitDB, FireproofDB, DuckDB-IPLD
- **Database**: 
  - OrbitDB (P2P event-based)
  - FireproofDB (serverless CRDT)
  - DuckDB (analytical SQL with IPLD conversion for P2P exchange)
- **Build**: Electron Forge
- **Data Exchange**: Apache Arrow C Data Interface, PyBridge
- **Security**: UCAN authentication, capability-based security

## Project Architecture

### Dashboard Integration
The application includes a comprehensive testing dashboard that provides a unified interface for testing and monitoring all modules:

- **Module Testing Panel**: Visual interface for running tests on individual modules
- **Real-time Status Monitoring**: Live status indicators for all core modules
- **Test Orchestration**: Run coordinated tests across multiple modules
- **Database Visualization**: Query and visualize data across all database systems
- **Performance Metrics**: Track performance metrics for all modules
- **Resource Monitoring**: Monitor resource usage across the application
- **Dependency Graph**: Visual representation of module dependencies
- **Test History**: Historical test results with filtering and analysis
- **Security Dashboard**: Manage authentication, capabilities, and API keys
- **Security Status**: Real-time monitoring of authentication and security components
- **Security Testing**: Dedicated tests for auth, keystore, and secured modules

The dashboard provides specialized views for different system aspects:
- **Overview**: System-wide statistics and quick actions
- **Module-specific panels**: Detailed control for individual modules
- **Authentication panel**: Manage principals, capabilities, and API keys
- **Security status section**: Monitor overall system security

The dashboard is accessible both through the Electron application interface and as a standalone web application when running in development mode.

### Core Modules
- **IPFS Kit**: Foundation for IPFS interactions
- **Model Manager**: Manages model loading and serving
- **Transformers**: Integration with HuggingFace transformers
- **Datasets**: Dataset management and processing
- **FAISS**: Vector search capabilities
- **Agents**: AI agent functionality
- **Accelerate**: Performance optimizations
- **libp2p**: P2P communication layer
- **OrbitDB**: Decentralized database storage
- **FireproofDB**: Serverless database mirror/backup with CRDT support
- **DuckDB-IPLD**: Analytical SQL database with IPLD conversion for P2P exchange
- **Authentication**: UCAN-based decentralized authorization
- **Keystore**: Secure storage for API keys and credentials

### Authentication & Security
- ✅ Implementation of UCAN (User Controlled Authorization Networks) for decentralized auth
  - ✅ Custom `ucan_auth_py` package with comprehensive UCAN implementation
  - ✅ Principal, Capability, and Token classes for UCAN operations
  - ✅ Cryptographic functions for secure operations (Ed25519)
  - ✅ DID (Decentralized Identifier) creation and resolution
  - ✅ JavaScript counterpart in `auth.js` with equivalent functionality
- ✅ Three-tier architecture with AuthManager, Keystore, and Integration layers
  - ✅ Python implementation in `auth.py`, `keystore.py`, and `auth_keystore_integration.py`
  - ✅ JavaScript implementation in `auth.js`, `keystore.js`, and `auth_keystore_integration.js`
- ✅ Capability-based security model with principals, permissions, and resources
- ✅ Mock implementation option for development environments
- ✅ Delegated capabilities ensure secure access control across decentralized services
- ✅ Integrated security testing in main testing framework
- ✅ Comprehensive dashboard for managing security components and visualizing status
  - ✅ Security test dashboard UI for running and analyzing security tests
  - ✅ Test history tracking and visualization for security components
  - ✅ Detailed test result display with pass/fail indicators
  - ✅ Integration with notification system for real-time feedback
- ✅ Develop test suites for security validation
  - ✅ Comprehensive test suite for auth, keystore, and secure managers
  - ✅ Visual test runner for security components
  - ✅ Test result history and export capabilities
- ✅ Secure keystore for managing third-party API keys (OpenAI, HuggingFace, etc.)
  - ✅ AES-256-GCM encryption for stored keys in both Python and JavaScript
  - ✅ Cross-language compatible storage format
- ✅ Encrypted storage of sensitive credentials with secure access control
- ✅ Integration with platform-specific secure storage mechanisms
  - ✅ Python: keyring integration for system-specific credential storage
  - ✅ JavaScript: keytar integration for system-specific credential storage
- ✅ API key rotation and lifecycle management
  - ✅ Implemented in both Python and JavaScript with identical interfaces
- ✅ Real-time security status monitoring and visualization

## Development Priorities and Roadmap

The following represents the prioritized development roadmap for the hallucinate_app project, ordered by dependency and importance.

### 1. Core Infrastructure (Immediate Priority)

#### 1.1 UCAN Python Implementation (Highest Priority)
The immediate high-priority task is to implement the `ucan_auth_py` package which is referenced by the code but not yet fully implemented. This functionality is needed for the authentication system to work properly, which in turn is required by most of the secure manager components.

Specifically, we need to:
- Create a Python package implementation of the UCAN specification
- Implement the core UCAN features (principals, capabilities, token issuance/verification)
- Build the cryptographic functions needed for UCAN (primarily Ed25519)
- Complete a comprehensive test suite to ensure reliability
- Ensure the API matches what's expected by the existing integration layer

This is the highest priority task because many other components depend on having authentication functionality available.

#### 1.2 Multi-Process Architecture (High Priority)
Continue developing the multi-process architecture for Python components:
- Complete the IPC mechanism for efficient communication between processes
- Implement shared memory using PyArrow Plasma store
- Ensure proper process management and resource cleanup
- Add robust error handling for process failures
- Test with large data transfers between processes

#### 1.3 PyArrow Content Index Integration (High Priority)
Enhance the PyArrow Content Index integration:
- Complete the JavaScript bridge for the PyArrow Content Index
- Add efficient search and update capabilities
- Implement proper index serialization/deserialization
- Ensure thread-safety for concurrent access
- Test with large datasets and concurrent operations

### 2. Security Framework (High Priority)

#### 2.1 Authentication System
Once the UCAN Python library is available, complete the authentication system:
- Finalize the auth.py integration layer with the new UCAN implementation
- Implement the auth_keystore_integration.py for secure API key management
- Add the AuthDashboard component for the user interface
- Create a comprehensive testing framework for security components
- Implement proper error handling and security logging

#### 2.2 Keystore Implementation
Implement the secure keystore for API credentials:
- Complete the keystore.py integration layer
- Add encryption for sensitive credentials
- Implement rotation policies for API keys
- Create a user interface for managing credentials
- Add secure storage adapters for different platforms (keychain, etc.)

### 3. Core Module Implementations (Medium Priority)

#### 3.1 Secure Managers
Implement the secure manager components that integrate with the auth system:
- ✅ secure_faiss_manager.py - For vector database operations
- ✅ secure_model_manager.py - For ML model management
- ✅ secure_transformers_manager.py - For HuggingFace integration
- ✅ secure_datasets_manager.py - For dataset management
- ✅ Add comprehensive tests for each manager
- ✅ Develop comprehensive security test dashboard
  - ✅ Visual test runner for all security components
  - ✅ Detailed test result visualization
  - ✅ Test result export and history tracking

#### 3.2 GraphRAG Implementation
✅ Implement the GraphRAG functionality for enhanced retrieval:
- ✅ Complete the graphrag.py module
- ✅ Complete the graphrag.js module
- ✅ Add graph database integration
- ✅ Implement efficient vector embedding storage
- ✅ Create optimized retrieval algorithms
- ✅ Test with complex document structures
- ✅ Create dashboard component for graph visualization
- ✅ Add comprehensive examples for GraphRAG usage

### 4. Database Integration (Medium Priority)

#### 4.1 Multi-Database System
Implement the integration with multiple database systems:
- secure_duckdb_ipld_manager.py - For analytical SQL capabilities
- secure_orbitdb_manager.py - For P2P data storage
- secure_fireproofdb_manager.py - For CRDT-based replication
- Implement proper synchronization between database systems
- Add database visualization in the dashboard

#### 4.2 Data Exchange Layer
Enhance the data exchange capabilities:
- Optimize Arrow-based data transfer
- Implement efficient serialization/deserialization
- Add shared memory management
- Implement proper cleanup of shared resources
- Test with large dataset transfers

### 5. Dashboard and UI Enhancements (Lower Priority)

#### 5.1 Dashboard Components
Enhance the dashboard with additional components:
- Add security status visualization
- Implement database query interfaces
- Create model management UI components
- Add performance monitoring visualizations
- Implement user preference management

#### 5.2 Testing Framework UI
Enhance the testing framework UI:
- Add detailed test result visualization
- Implement test history tracking
- Create test configuration interfaces
- Add automated test scheduling
- Implement test coverage reporting

### Future UCAN Implementation Enhancements
After completing the initial UCAN implementation, future enhancements will include:

- Further refinement of the Python implementation of the UCAN protocol
- Advanced cryptographic operations support (multiple signature schemes)
- Enhanced tools for delegation chain verification and capability attestation
- Deeper integration with Python web frameworks (FastAPI, Flask)
- Compatibility with existing UCAN ecosystems and tools
- Expanded test suite and comprehensive documentation
- Performance optimizations for large-scale deployment

This enhanced Python UCAN implementation will build on the initial implementation and ensure that Python components can operate independently of any JavaScript dependencies while maintaining full UCAN compatibility with the broader ecosystem.

### Module Pattern
Each module follows a consistent pattern:
1. Constructor-based initialization with resources and metadata
2. Implementation of standard methods: init(), test()
3. Error handling with specific exception types
4. Both JavaScript (ESM) and Python implementations
5. Access to other modules through a resource pool passed during initialization

### Process and Concurrency Model
- **IPFS Kit Python Implementation**: Must run in a separate process (not just thread) to avoid blocking
  - ✅ The `ipfs_kit_server.py` module implements a non-blocking server in a separate thread
  - ✅ The `ipfs_accelerate_server_mp.py` module implements a multi-process architecture
  - ✅ This prevents IPFS operations from blocking machine learning model execution
  - ✅ Communication happens via Apache Arrow IPC (Inter-Process Communication) and thread-safe queues
  - ✅ Shared memory regions enable zero-copy data transfer between processes
  - Example implementation:
  
  ```python
  import multiprocessing as mp
  import pyarrow as pa
  import pyarrow.plasma as plasma
  
  # Create/connect to plasma store for shared memory
  plasma_store_socket = "/tmp/plasma"
  plasma_client = plasma.connect(plasma_store_socket)
  
  # Inter-process communication queues
  command_queue = mp.Queue()
  result_queue = mp.Queue()
  
  # IPFS Kit server process
  def ipfs_server_process(cmd_queue, res_queue, plasma_socket):
      # Connect to the plasma store from this process
      p_client = plasma.connect(plasma_socket)
      
      # Initialize IPFS Kit
      from ipfs_kit_py import IPFSKit
      ipfs_kit = IPFSKit()
      
      # Process commands
      while True:
          cmd = cmd_queue.get()
          if cmd.get("action") == "exit":
              break
              
          # Handle IPFS operations
          if cmd.get("action") == "fetch":
              # Fetch data from IPFS
              data = ipfs_kit.fetch(cmd.get("cid"))
              
              # Store large data in plasma store (shared memory)
              object_id = p_client.put(pa.py_buffer(data))
              
              # Return only a reference to the data
              res_queue.put({
                  "status": "success",
                  "data_ref": object_id.binary().hex()
              })
  
  # Start IPFS kit in separate process
  ipfs_process = mp.Process(
      target=ipfs_server_process, 
      args=(command_queue, result_queue, plasma_store_socket),
      daemon=True
  )
  ipfs_process.start()
  
  # Main process continues with ML operations in ipfs_accelerate_py
  # Accessing data via shared memory without copying
  cmd = {"action": "fetch", "cid": "Qm..."}
  command_queue.put(cmd)
  result = result_queue.get()
  
  # Get the data from shared memory (zero-copy)
  object_id = plasma.ObjectID.from_hex(result["data_ref"])
  actual_data = plasma_client.get(object_id)
  
  # Process the data with ML models without additional copying
  ```
  
- **Multi-process Architecture Benefits**:
  - Bypasses Python's Global Interpreter Lock (GIL)
  - Enables true parallel processing across CPU cores
  - Prevents compute-intensive ML tasks from blocking I/O operations
  - Zero-copy data sharing via shared memory reduces overhead
  - Improves resource utilization and responsiveness

## Build & Run Commands
- **Start app**: `npm start` or `electron-forge start`
- **Package app**: `npm run package`
- **Build distributable**: `npm run make`
- **Run all tests**: `npm test`
- **Run bridge tests**: `npm run test:bridge`
- **Run electron tests**: `npm run test:electron`
- **Run Python tests**: `npm run test:python`
- **Launch dashboard**: `npm run dashboard`
- **Start dashboard server**: `npm run dashboard:server`
- **Run tests with dashboard**: `npm run test:dashboard`
- **Install dependencies**: `npm install` or `yarn install`

## Development Priorities and Roadmap

### 1. Core Infrastructure (Immediate Priority)
1. **UCAN Authentication System**
   - ✅ Implement the `ucan_auth_py` package for Python components
   - ✅ Develop the UCAN capability management system for all secure operations
   - ✅ Set up proper delegation chains for decentralized auth
   - ✅ Implement cryptographic functions for UCAN (primarily Ed25519)
   - ✅ Add capability issuance, verification, and revocation
   - ✅ Create a test suite for the UCAN implementation

2. **Multi-Process Architecture**
   - ✅ Implement the non-blocking IPFS Kit in a separate thread pattern (as in `ipfs_kit_server.py`)
   - ✅ Set up PyArrow Plasma store for efficient memory sharing between processes
   - ✅ Develop message queue communication patterns for inter-process operations
   - ✅ Implement process isolation for IPFS and ML operations
   - ✅ Create zero-copy data transfer between processes
   - ✅ Implement fallback mechanisms for systems without PyArrow
   - ✅ Add comprehensive test suite for multi-process operations
   - Use multiple thread pools for parallel processing

### 2. Security Framework (High Priority)
1. **Authentication System**
   - ✅ Implement the `auth.py` module with full UCAN integration
   - ✅ Set up capability-based security for all operations
   - ✅ Create proper delegation mechanisms for peer authorization
   - ✅ Implement authentication dashboard components
   - ✅ Add user interface for security management

2. **Keystore Module**
   - ✅ Implement secure API key storage with encryption
   - ✅ Develop credential rotation mechanisms
   - ✅ Set up platform-specific secure storage integrations

3. **Secure Managers**
   - ✅ Implement the secure manager pattern for all modules
   - ✅ Add proper capability verification for all operations
   - ✅ Add usage tracking for resource monitoring
   - Develop test suites for security validation

### 3. Core Module Implementations
1. **PyArrow Content Index** (OUT OF SCOPE)
   - This module is considered out of scope for current development efforts
   - Future consideration only if project requirements change

2. **GraphRAG Framework**
   - ✅ Implemented GraphRAG integration layer in both Python and JavaScript
   - ✅ Added integration with the ipfs_datasets_py/js GraphRAG implementations
   - ✅ Created document and node/edge management functionality
   - ✅ Implemented vector and hybrid search capabilities
   - ✅ Added persistence to disk and IPFS
   - ✅ Created comprehensive test suite for GraphRAG functionality
   - ✅ Added dashboard component for visualizing and interacting with graphs
   - ✅ Created documentation with examples for GraphRAG usage

3. **Model Manager**
   - Complete the model downloading and serving capabilities
   - Add model verification and integrity checking
   - Implement model caching strategies

4. **Transformers Integration**
   - Enhance the transformers module with streaming outputs
   - Implement the model acceleration techniques

### 4. Database Integration (Medium Priority)
1. **Multi-Database System**
   - ✅ Complete the OrbitDB, FireproofDB, and DuckDB integration
   - ✅ Implement bidirectional sync between databases
   - ✅ Develop the IPLD conversion for DuckDB database exchange
   - Create robust conflict resolution strategies

2. **Database Sync Manager**
   - ✅ Implement event-driven updates for database consistency
   - ✅ Add selective mirroring for bandwidth optimization
   - ✅ Create differential updates for database snapshots
   - Develop monitoring tools for synchronization status

3. **Query System**
   - Implement the cross-database query capabilities
   - Add query optimization for distributed execution
   - Develop analysis tools for query performance

### 5. Dashboard and UI Enhancements (Lower Priority)
1. **Dashboard Components**
   - ✅ Complete integration of module testing dashboard
   - ✅ Add visualization components for database content
   - ✅ Create performance metrics displays
   - Enhance resource monitoring tools

2. **User Interface**
   - Develop the responsive layout for dashboard
   - Add theme support for light and dark modes
   - Create accessibility enhancements

## Development Workflow

### Setting Up Development Environment
1. Clone the repository
2. Run `npm install` or `yarn install` to install JavaScript dependencies
3. Set up Python environment with `pip install -r hallucinate_app/python/requirements.txt`
4. Install test dependencies with `pip install -r test/requirements.txt`
5. Install PyBridge and Apache Arrow for data exchange between JavaScript and Python
6. Install DuckDB and related libraries:
   ```bash
   npm install duckdb duckdb-async ipld-duckdb
   pip install duckdb pyarrow
   ```
7. Configure IPFS if needed (see Configuration section)
8. Set up UCAN development environment with w3up CLI tools

### Making Changes
1. Focus on creating integration layers for external packages from PyPI
2. For any new functionality, check if it's already available in external packages
3. Follow the module pattern for integration layers
4. Implement both JavaScript and Python integration versions when applicable
5. Use the resource pool pattern for module interdependencies
6. Add test methods for integration layers in the appropriate test directory
7. Ensure proper error handling throughout integration layers
8. Integrate with UCAN capability verification mechanisms from external packages
9. Use the keystore integration for external API key storage and retrieval
10. Never hardcode API keys or sensitive credentials in the codebase
11. Integrate with credential rotation mechanisms from external packages
10. For database operations:
    - Consider which database system is most appropriate for the specific data
    - Use OrbitDB for event-based P2P data that needs immediate replication
    - Use FireproofDB for data that requires CRDT-based conflict resolution
    - Use DuckDB for analytical workloads with SQL query requirements
    - Implement IPLD conversion for DuckDB data that needs P2P exchange
11. Dashboard integration:
    - Register new modules with the testing dashboard
    - Implement dashboard panels for new functionality
    - Add appropriate visualization components
    - Ensure real-time updates of module status
    - Document dashboard integration in module documentation

## Code Style Guidelines

### JavaScript
- **Modules**: Use ES modules with `import`/`export` (type: module in package.json)
- **File names**: Use snake_case for files/directories
- **Formatting**: 2-space indentation, semicolons, single quotes
- **Error handling**: Use try/catch blocks with specific error messages
- **Version**: Follow ES6+ standards

### Python
- **Imports**: Group standard library, external, and local imports
- **Classes**: PascalCase for class names, snake_case for methods/variables
- **Error handling**: Use try/except with specific exception types
- **Testing**: Tests should handle exceptions and produce JSON output
- **Version**: Python 3.8+ compatibility
- **Data Exchange**: Use Arrow C Data Interface for efficient memory sharing
- **Authentication**: Implement UCAN verification on protected operations
- **SQL Queries**: Use parameterized queries with DuckDB to prevent SQL injection
- **IPLD Integration**: Use Python IPLD libraries for consistent data models
- **Analytics**: Leverage pandas integration with DuckDB for data science workflows

### JavaScript
- **Modules**: Use ES modules with `import`/`export` (type: module in package.json)
- **File names**: Use snake_case for files/directories
- **Formatting**: 2-space indentation, semicolons, single quotes
- **Error handling**: Use try/catch blocks with specific error messages
- **Version**: Follow ES6+ standards
- **Data Exchange**: Use Arrow for high-performance data passing
- **Authentication**: Use UCAN tokens for secure capability management
- **SQL Queries**: Use parameterized queries with DuckDB to prevent SQL injection
- **IPLD Conversion**: Follow standard patterns for converting between JavaScript objects and IPLD

### General
- Maintain modular architecture with IPFS/libp2p kit structure
- Prefer descriptive variable names over comments
- Initialize class resources/metadata via constructor
- Use resource pool pattern for module interdependencies
- Follow existing patterns when extending functionality
- All modules should implement a test() method
- Handle UCAN capability verification consistently across modules
- Database usage patterns:
  - OrbitDB for real-time P2P document/event storage
  - FireproofDB for CRDT-based conflict resolution
  - DuckDB for analytical SQL queries and complex data transformations
  - IPLD conversion for P2P database state exchange via libp2p
  - Use the appropriate database for the data access pattern required

## Database Architecture

### Multi-Database Approach
- **OrbitDB**: Primary peer-to-peer database using IPFS for distributed storage
  - Event-based replication across peers
  - Strong IPFS integration for content-addressed data
  - Support for various database types (documents, key-value, counters)
  - ✅ Implemented with mock capabilities for testing
  - ✅ JavaScript implementation with API
  
- **FireproofDB**: Secondary serverless database for mirroring and backup
  - CRDT-based for conflict-free replication
  - Offline-first capabilities with automatic sync
  - Browser and Node.js compatibility
  - IPFS-based persistence layer
  - Provides redundancy and additional availability
  - ✅ Implemented with mock capabilities for testing
  - ✅ JavaScript implementation with API
  
- **DuckDB-IPLD**: Analytical SQL database with IPLD integration
  - High-performance columnar analytics engine
  - SQL interface for complex queries and data transformation
  - Conversion to/from IPLD for P2P exchange via libp2p
  - Parquet and Arrow integration for efficient data processing
  - Ideal for ML feature engineering and dataset analysis
  - ✅ Implemented complete Python module with DuckDB-IPLD functionality
  - ✅ Implemented complete JavaScript module with DuckDB-IPLD functionality
  - ✅ Added test suites for both implementations
  
- **Database Sync Manager**: Synchronization between database systems
  - ✅ Bidirectional sync between OrbitDB and FireproofDB
  - ✅ IPLD conversion for DuckDB database exchange over libp2p
  - ✅ Event-driven updates to maintain consistency
  - ✅ Conflict resolution strategies using CRDTs
  - ✅ Selective mirroring for bandwidth and storage optimization
  - ✅ Differential updates for DuckDB database snapshots
  - ✅ Comprehensive test suite for all synchronization patterns

### PyArrow Index Structure (OUT OF SCOPE)
Note: The PyArrow Content Index is now considered OUT OF SCOPE for current development efforts.

The information below is retained for reference only but will not be actively implemented:

This component was initially intended to maintain a comprehensive PyArrow index with the following structure:

- Content-addressable identifiers using IPFS PinSet CIDs
- UnixFS / fsspec Virtual Filesystem path-based organization
- Extensive metadata schema for content tracking
- Bidirectional JavaScript/Python access

The functionality would have enabled content discovery across storage backends, efficient retrieval, and comprehensive metadata management. However, this is no longer an active development priority.

### Synchronization Patterns
- ✅ Bidirectional sync between OrbitDB and FireproofDB
  - ✅ Implemented in DatabaseSyncManager
  - ✅ Support for both push and pull operations
  - ✅ Tracking of sync origin to prevent loops
  
- ✅ IPLD conversion for DuckDB database exchange over libp2p
  - ✅ Implemented in DuckDB-IPLD Kit (Python and JavaScript)
  - ✅ Table-level and database-level export/import
  - ✅ CID-based content addressing for P2P exchange
  
- ✅ Event-driven updates to maintain consistency
  - ✅ EventEmitter pattern for JavaScript implementation
  - ✅ Async event handling for database operations
  - ✅ Operation tracking for synchronization

- ✅ Conflict resolution strategies using CRDTs
  - ✅ Multiple resolution strategies (newest, CRDT, custom)
  - ✅ Timestamp-based conflict detection
  - ✅ Three-way merge capabilities
  
- ✅ Selective mirroring for bandwidth and storage optimization
  - ✅ Rule-based filtering for sync operations
  - ✅ Support for inclusion/exclusion patterns
  - ✅ Priority-based synchronization

- ✅ Differential updates for DuckDB database snapshots
  - ✅ Change tracking for efficient updates
  - ✅ Partial database updates via IPLD
  - ✅ Patch-based synchronization

## Testing

### Testing Structure and Architecture
- All tests must be located in the dedicated `test` directory
- JavaScript tests are in `test/js/`, Python tests in `test/python/`
- Main test runner is `test/test.js`
- Each test file should be able to run independently
- Resource pools should be mockable for isolated module testing
- Database tests should verify persistence across all database systems (OrbitDB, FireproofDB, DuckDB)
- IPLD conversion tests should validate DuckDB data can be exchanged via libp2p

### Enhanced Testing Framework

#### Module Testing Pattern
Each module in the system MUST implement a standardized testing interface:

1. **Self-contained test() Method**:
   ```python
   def test(self, verbose=False) -> Dict[str, Any]:
       """Test the module functionality with detailed diagnostics
       
       Args:
           verbose: Whether to output detailed logs during testing
           
       Returns:
           Dict with test results including:
           - success: Overall test success status (boolean)
           - steps: Individual test steps with success/failure status
           - diagnostics: Diagnostic information including dependency status
           - logs: Detailed logs when verbose=True
       """
   ```

2. **Test Output Format**:
   ```python
   {
       "success": True/False,  # Overall test result
       "module": "module_name",
       "timestamp": "ISO timestamp",
       "steps": {
           "step1": {"success": True, "message": "...", "data": {...}},
           "step2": {"success": False, "message": "...", "error": "..."}
       },
       "diagnostics": {
           "dependencies": {
               "dep1": {"available": True, "version": "..."},
               "dep2": {"available": False, "error": "..."}
           },
           "environment": {
               "python_version": "...",
               "platform": "...",
               "memory_usage": "..."
           }
       },
       "logs": ["log entry 1", "log entry 2", ...] # Only when verbose=True
   }
   ```

3. **Testing States**:
   - Each module should implement standard test states:
     - `SETUP`: Configure testing environment
     - `DEPENDENCIES`: Check that dependencies are available
     - `INITIALIZATION`: Test module initialization
     - `CORE_FUNCTIONS`: Test primary module functionality
     - `EDGE_CASES`: Test error handling and edge cases
     - `CLEANUP`: Clean up after tests

4. **In-module Test Environment**:
   ```python
   class TestEnvironment:
       """Test environment for isolated module testing"""
       def __init__(self):
           self.mock_resources = {
               "auth": MockAuth(),
               "faiss": MockFaiss(),
               # Other mock dependencies
           }
           self.test_data = {...}
           self.logs = []
           
       def log(self, message):
           """Add log message"""
           self.logs.append(message)
           
       def create_test_instance(self, module_class):
           """Create a test instance of the module"""
           return module_class(resources=self.mock_resources)
   ```

#### Mock Implementation System

To address dependency challenges, we're implementing a comprehensive mocking system:

1. **Automatic Mock Generation**:
   - Each core module should include a corresponding mock implementation
   - Mocks should implement the same interface but return predictable test data
   
   ```python
   # Example: ipfs_kit_mock.py 
   class IPFSKitMock:
       """Mock implementation of IPFSKit"""
       def __init__(self, *args, **kwargs):
           self.initialized = False
           self.test_cids = {
               "test_file": "Qmabcdef1234567890",
               "test_dir": "Qm1234567890abcdef"
           }
           
       async def init(self):
           self.initialized = True
           return True
           
       async def add_file(self, path, *args, **kwargs):
           return {"cid": self.test_cids["test_file"]}
   ```

2. **Dependency Injection System**:
   ```python
   # module_loader.py
   def load_module(module_name, use_mock=False):
       """Load a module or its mock implementation"""
       try:
           if use_mock:
               # Try to import mock version first
               mock_module_name = f"{module_name}_mock"
               return importlib.import_module(mock_module_name)
           else:
               # Try real implementation
               return importlib.import_module(module_name)
       except ImportError as e:
           if not use_mock:
               # Fall back to mock if real implementation unavailable
               return load_module(module_name, use_mock=True)
           else:
               raise ImportError(f"Neither {module_name} nor mock available: {e}")
   ```

3. **Resource Pool Factory**:
   ```python
   def create_test_resource_pool(mock_list=None):
       """Create resource pool with specified modules mocked"""
       mock_list = mock_list or []
       pool = {}
       
       # Core modules
       for module_name in ["ipfs_kit", "auth", "keystore", "faiss", ...]:
           use_mock = module_name in mock_list
           try:
               module = load_module(module_name, use_mock)
               pool[module_name] = module.get_instance()
           except Exception as e:
               pool[module_name] = None
               
       return pool
   ```

#### Diagnostic Testing Tools

New diagnostic tools for improved test visibility:

1. **Dependency Checker**:
   ```python
   def check_dependencies(required_modules):
       """Check status of required dependencies"""
       results = {}
       for module_name in required_modules:
           try:
               module = importlib.import_module(module_name)
               version = getattr(module, "__version__", "unknown")
               results[module_name] = {
                   "available": True,
                   "version": version,
                   "path": module.__file__
               }
           except ImportError as e:
               results[module_name] = {
                   "available": False,
                   "error": str(e)
               }
       return results
   ```

2. **Test State Tracker**:
   ```python
   class TestStateTracker:
       """Track progress of test execution with detailed logs"""
       def __init__(self, module_name):
           self.module_name = module_name
           self.start_time = time.time()
           self.steps = {}
           self.current_step = None
           self.logs = []
           
       def start_step(self, step_name, description=""):
           """Start a new test step"""
           self.current_step = step_name
           self.steps[step_name] = {
               "status": "running",
               "description": description,
               "start_time": time.time(),
               "logs": []
           }
           self.log(f"Starting: {description}")
           
       def end_step(self, success=True, message="", data=None):
           """End the current test step"""
           if self.current_step:
               self.steps[self.current_step].update({
                   "status": "complete",
                   "success": success,
                   "message": message,
                   "duration": time.time() - self.steps[self.current_step]["start_time"],
                   "data": data
               })
               status = "SUCCESS" if success else "FAILED"
               self.log(f"{status}: {message}")
           
       def log(self, message):
           """Add log message to current step and global logs"""
           timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
           formatted = f"[{timestamp}] {message}"
           self.logs.append(formatted)
           
           if self.current_step:
               self.steps[self.current_step]["logs"].append(formatted)
   ```

3. **Verbose Module Test Runner**:
   ```python
   def run_module_test(module_name, verbose=False):
       """Run a module's test method with enhanced output"""
       try:
           # Import module
           module = importlib.import_module(module_name)
           instance = getattr(module, module_name.split('.')[-1])
           
           # Check if test method exists
           if not hasattr(instance, 'test'):
               return {
                   "success": False,
                   "module": module_name,
                   "error": "No test method available"
               }
           
           # Set up logging if verbose
           if verbose:
               log_handler = logging.StreamHandler()
               log_handler.setFormatter(logging.Formatter(
                   '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
               ))
               module_logger = logging.getLogger(module_name)
               module_logger.setLevel(logging.DEBUG)
               module_logger.addHandler(log_handler)
               
           # Run the test
           test_result = instance.test(verbose=verbose)
           
           # Enhance output with dependency information
           if not hasattr(test_result, 'diagnostics'):
               test_result['diagnostics'] = {}
               
           # Add dependency information
           module_dependencies = getattr(instance, 'DEPENDENCIES', [])
           test_result['diagnostics']['dependencies'] = check_dependencies(module_dependencies)
           
           return test_result
       except Exception as e:
           return {
               "success": False,
               "module": module_name,
               "error": str(e),
               "traceback": traceback.format_exc()
           }
   ```

#### Test Execution System

1. **Standalone Testing**:

   Each test file should have a standard `if __name__ == "__main__"` section that enables standalone testing:

   ```python
   if __name__ == "__main__":
       import argparse
       
       parser = argparse.ArgumentParser(description=f"Test {__file__} module")
       parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose output")
       parser.add_argument("--mock", "-m", action="store_true", help="Use mock dependencies")
       args = parser.parse_args()
       
       if args.mock:
           print("Using mock implementations for dependencies")
           # Set up mock environment
           
       # Initialize the module instance
       instance = SecureFaissManager()
       
       # Run test with requested verbosity
       result = instance.test(verbose=args.verbose)
       
       # Print results
       print(json.dumps(result, indent=2))
       
       # Exit with appropriate code
       sys.exit(0 if result.get("success", False) else 1)
   ```

2. **Suite Runner with Dependency Graph**:

   ```python
   def run_test_suite(modules, verbose=False, use_mocks=False):
       """Run tests for multiple modules in dependency order"""
       # Define module dependencies
       dependency_graph = {
           "auth": [],
           "keystore": [],
           "ipfs_kit": [],
           "ipfs_faiss": ["ipfs_kit"],
           "auth_keystore_integration": ["auth", "keystore"],
           "secure_faiss_manager": ["ipfs_faiss", "auth"]
       }
       
       # Determine execution order
       execution_order = []
       visited = set()
       
       def visit(module):
           if module in visited:
               return
           visited.add(module)
           for dep in dependency_graph.get(module, []):
               visit(dep)
           execution_order.append(module)
       
       for module in modules:
           visit(module)
       
       # Run tests in dependency order
       results = {}
       for module in execution_order:
           if module in modules:
               print(f"Testing {module}...")
               results[module] = run_module_test(module, verbose)
               
       return results
   ```

### Testing Externally-Dependent Modules

For modules that depend on external Python packages or native libraries:

1. **Dependency Management**:
   - Each module should include a `DEPENDENCIES` attribute listing required packages
   - Test code should check for dependency availability at runtime
   - Fall back to mock implementations when dependencies are unavailable

2. **Isolation Testing**:
   - Create a separate virtual environment for testing dependencies:
   
   ```bash
   # Create isolated test environment script
   #!/bin/bash
   # test_isolated.sh
   
   MODULE=$1
   python -m venv test_venv
   source test_venv/bin/activate
   pip install -r requirements.txt
   python -m hallucinate_app.test.${MODULE} --verbose
   deactivate
   ```

3. **Pre-Test Component Validation**:
   ```python
   def validate_faiss_installation():
       """Check if FAISS is properly installed and functioning"""
       try:
           import faiss
           # Create a tiny index to validate installation
           dimension = 4
           index = faiss.IndexFlatL2(dimension)
           vectors = np.random.random((5, dimension)).astype('float32')
           index.add(vectors)
           query = np.random.random((1, dimension)).astype('float32')
           distances, indices = index.search(query, k=3)
           return {
               "available": True,
               "version": getattr(faiss, "__version__", "unknown"),
               "validation": {
                   "success": True,
                   "dimensions": dimension,
                   "results_shape": indices.shape
               }
           }
       except Exception as e:
           return {
               "available": False,
               "error": str(e),
               "traceback": traceback.format_exc()
           }
   ```

### Practical Testing Examples

1. **Running a Single Module Test**:
   ```bash
   cd hallucinate_app/python
   python -m hallucinate_app.secure_faiss_manager --verbose
   ```

2. **Testing with Mocked Dependencies**:
   ```bash
   python -m hallucinate_app.test.test_secure_faiss_manager --mock --verbose
   ```

3. **Testing in Dependency Order**:
   ```bash
   python -m hallucinate_app.test.test \
     --modules auth,keystore,ipfs_kit,ipfs_faiss,secure_faiss_manager \
     --verbose
   ```

4. **Generating a Test Coverage Report**:
   ```bash
   python -m coverage run -m hallucinate_app.test.test
   python -m coverage report
   python -m coverage html  # Generates HTML report
   ```

5. **Debugging a Failed Test**:
   ```bash
   # Export detailed logs
   PYTHONPATH=. pytest hallucinate_app/test/test_secure_faiss_manager.py -v \
     --log-cli-level=DEBUG \
     --log-file=debug.log
   ```

### Testing Approaches
- **Unit Testing**: Tests for individual modules and components
- **Integration Testing**: Tests for interactions between modules
- **End-to-End Testing**: Tests for complete workflows
- **Mock Testing**: Tests with mock implementations for external dependencies
- **Security Testing**: 
  - UCAN capability delegation and verification
  - Authentication token validation
  - Security component initialization
  - Secure access to protected resources
  - Dashboard-integrated security test suite
  - Comprehensive authentication component tests
  - Mock implementation for development testing
  
- **Data Exchange Testing**: Tests for Apache Arrow and PyBridge data transfer
- **Keystore Testing**: 
  - Secure API key storage and retrieval
  - Encrypted storage mechanisms
  - Access control via capability tokens
  - Key metadata management
  - Security boundary enforcement
  
- **Credential Rotation Testing**: 
  - API key rotation workflows
  - Secure lifecycle management
  - History tracking for rotated credentials
  - Capability verification for rotation operations
- **Database Testing**:
  - Redundancy Testing: Persistence across all database systems
  - CRDT Testing: Conflict-free replicated data types in FireproofDB
  - IPLD Conversion Testing: DuckDB to IPLD transformation and exchange
  - SQL Query Testing: Analytical capabilities of DuckDB
  - Offline Resilience Testing: Database functionality without network connectivity
  - P2P Exchange Testing: Database state sharing via libp2p

### Module Tests
- Each module must include a test() method that validates core functionality
- Tests should handle exceptions gracefully and return informative messages
- Python tests should output results in JSON format
- Authentication tests should verify proper UCAN capability checking:
  - Authentication module initialization
  - Principal creation and management
  - Capability issuance and verification
  - Token validation and expiration
  - Capability delegation chains
  - Revocation mechanisms
  
- Security dashboard tests should validate:
  - UI component initialization and rendering
  - Security status indicators updating correctly
  - Principal management operations
  - Capability management workflows
  - API key management and rotation
  - Security event logging and reporting
  
- Resource pool access tests should validate correct module interactions with security components
- Keystore tests should validate secure API key management without exposing keys
- Tests should use mock API keys for external service integration
- API key rotation should be tested for proper credential management including history tracking
- Database tests should verify:
  - Data persistence across OrbitDB, FireproofDB, and DuckDB
  - Proper synchronization between databases
  - Conflict resolution capabilities
  - IPLD conversion and P2P exchange of DuckDB data
  - SQL analytics functionality of DuckDB
  - Arrow data format compatibility with DuckDB
  - Offline operation and reconnection
  - PyArrow content index functionality:
    - CID-based primary key lookups
    - Virtual filesystem path-based secondary key lookups
    - Complete metadata schema validation
    - Storage location registration across all backends
    - IPFS pinset synchronization
    - Index export to parquet format
- Run the comprehensive test suite before submitting changes

### Dashboard Integration with Testing Framework
The project includes a comprehensive testing dashboard that simplifies module testing, with significant enhancements for security components:

```javascript
// Import testing framework and dashboard components
import testHandler from './test_handler.js';
import { Dashboard } from './dashboard.js';
import AuthDashboard from './dashboard/auth_dashboard.js';
import { authManager } from './auth.js';
import { keystore } from './keystore.js';
import { authKeystoreIntegration } from './auth_keystore_integration.js';

// Initialize event bus for dashboard communication
const eventBus = {
  listeners: {},
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  },
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
};

// Initialize the main dashboard with test handler integration
const dashboard = new Dashboard({
  element: document.getElementById('dashboard-container'),
  testHandler: testHandler,
  eventBus: eventBus
});

// Initialize Auth Dashboard with dependencies
const authDashboardContainer = document.getElementById('auth-dashboard-container');
const authDashboard = new AuthDashboard({
  element: authDashboardContainer,
  auth: authManager,
  keystore: keystore,
  integration: authKeystoreIntegration,
  eventBus: eventBus
});

// Connect test events to dashboard
testHandler.on('test-result', (result) => {
  dashboard.updateModuleStatus(result.module, result.success);
  dashboard.logTestResult(result);
  
  // Special handling for security module results
  if (['auth', 'keystore', 'auth-keystore', 'secure-faiss'].includes(result.module)) {
    eventBus.emit('security-test-result', result);
  }
});

// Setup security status monitoring
const updateSecurityStatus = () => {
  const securityStatus = document.getElementById('stats-security-status');
  if (authManager.initialized && keystore.initialized) {
    securityStatus.textContent = authManager.options.useMockImplementation ? 
      'Mock Mode' : 'Secured';
  } else {
    securityStatus.textContent = 'Inactive';
  }
};

// Setup security testing button
dashboard.createTestButton('security', async () => {
  const promises = [
    testHandler.testModule('auth'),
    testHandler.testModule('keystore'),
    testHandler.testModule('auth-keystore'),
    testHandler.testModule('secure-faiss')
  ];
  
  return Promise.allSettled(promises);
});

// Initialize database visualizations
dashboard.setupDatabasePanels(['orbitdb', 'fireproofdb', 'duckdb']);

// Setup module dependency visualization
dashboard.renderModuleDependencies(testHandler.modules);

// Launch the dashboard
dashboard.render();
authDashboard.render();

// Update security status periodically
setInterval(updateSecurityStatus, 10000);
```

The dashboard provides:
- One-click testing for all modules
- Real-time test results visualization
- Module dependency graphs
- Database content browsing for all database systems
- Historical test result tracking
- Performance metrics monitoring
- Resource usage visualization

### IPFS Accelerate Model Server Integration
The project integrates with the `ipfs_accelerate_py` package from PyPI for model server functionality:

1. **External Package Integration**:
   - Import the `ipfs_accelerate_py` PyPI package for core model server functionality
   - Integration layer in hallucinate_app connects to this external package
   - RESTful API for model loading and inference
   - UCAN capability verification for authenticated access
   - DuckDB integration for analytics on model performance
   - Multi-process architecture with separate processes for:
     - IPFS operations
     - ML model inference (separate process per model)
     - API server (main process)
   - Apache Arrow Plasma store for zero-copy data sharing
   - IPC-based communication between processes
   - Parallel processing of ML model inference and IPFS operations

2. **JavaScript Bridge**:
   - Python process management in `test/js/python_bridge.js`
   - API client for server communication
   - Error handling for robustness
   - Apache Arrow and PyBridge for efficient data exchange
   - Resource pool integration for module access
   - IPLD conversion utilities for P2P database exchange
   - Process management for isolated, parallel execution
   - Arrow IPC for communicating with Python processes

3. **Electron Integration**:
   - UI component in `hallucinate_app/node/views/model_tester.html`
   - IPC handlers in `hallucinate_app/node/accelerate_model_tester.js`
   - Event-based communication flow
   - Authentication flow for capability verification
   - Database visualization components for SQL analytics

To manually test the model server:
```javascript
// In your main Electron file
import { createModelTesterWindow } from './hallucinate_app/node/accelerate_model_tester.js';
import { createDashboardWindow } from './hallucinate_app/node/dashboard/dashboard_window.js';

// Create both windows
const modelTesterWindow = createModelTesterWindow();
const dashboardWindow = createDashboardWindow();

// Connect the model tester to the dashboard for visualization
dashboardWindow.webContents.once('dom-ready', () => {
  dashboardWindow.webContents.send('register-external-tester', {
    name: 'accelerate-model-tester',
    windowId: modelTesterWindow.id
  });
});

// Send test results to dashboard
modelTesterWindow.webContents.on('test-result', (result) => {
  dashboardWindow.webContents.send('external-test-result', result);
});
```

## Dependency Management
- JavaScript dependencies are managed via package.json with yarn
- Python dependencies are specified in requirements.txt
- Testing dependencies in test/requirements.txt
- When updating dependencies, ensure compatibility across modules
- Follow semantic versioning for all dependencies

## Configuration
- Configuration files are available in both JavaScript and Python formats
- Use the template files as a starting point for custom configurations
- Store environment-specific settings in appropriate config files
- Avoid hardcoding configuration values in application code
- UCAN configurations should manage delegation chains and capabilities
- Resource pool configurations define available shared resources
- Apache Arrow memory management configurations for efficient data exchange
- PyBridge serialization options for cross-language communication
- Dashboard configuration:
  - Theme and layout settings
  - Module test configurations
  - Visualization preferences
  - Refresh intervals and polling settings
  - Panel layouts and visibility
  - User preferences and saved views
- Database configuration:
  - OrbitDB and FireproofDB:
    - Synchronization intervals and strategies
    - Replication peers and connection settings
    - CRDT conflict resolution policies
    - Offline operation parameters
    - Data expiration and retention policies
  - DuckDB with IPLD:
    - SQL schema definitions and migrations
    - IPLD conversion settings for P2P exchange
    - libp2p pubsub topics for database updates
    - Analytical query optimization parameters
    - Columnar storage configuration

## Python-JavaScript Integration

### Communication Methods
- **Child Process**: Spawn Python processes from Node.js
  - ✅ Implemented for IPFS kit and model server
  - ✅ IPC communication with message queues
  - ✅ Error handling and process lifecycle management
  
- **RESTful API**: Python servers with JavaScript clients
  - ✅ FastAPI server for model inference
  - ✅ Async communication patterns
  - ✅ Status monitoring and health checks
  
- **File-based**: Shared file access for data exchange
  - ✅ Used for large data transfers
  - ✅ Temporary file management with cleanup
  
- **Apache Arrow C Data Interface**: Efficient shared data layer
  - ✅ Implemented for PyArrow content index
  - ✅ Zero-copy data sharing with Plasma store
  - ✅ Memory-efficient transfers of large datasets
  
- **PyBridge**: Serialized/deserialized data exchange
  - ✅ Used for structured data communication
  - ✅ Bidirectional method calling
  - ✅ Error propagation between languages

### PyArrow Index Integration
The PyArrow index from the `ipfs_kit_py` package serves as a critical shared data structure between Python and JavaScript components:

```javascript
// JavaScript access to PyArrow index from ipfs_kit_py
import { PyArrowIndex } from '../python_bridge/pyarrow_index.js';

// Initialize the index with connection to Python backend that uses ipfs_kit_py
const index = new PyArrowIndex({
  pythonBridge: pythonBridge,
  indexPath: path.join(os.homedir(), '.hallucinate_app', 'content_index.arrow')
});

// Look up content by CID
const contentInfo = await index.lookupByCid('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');

// Look up content by virtual filesystem path
const contentByCid = await index.lookupByPath('/datasets/common_voice/en/train.parquet');

// Query content by metadata attributes
const videoFiles = await index.query({
  filter: "mimetype LIKE 'video/%'",
  sort: "size DESC",
  limit: 10
});

// Add new content to the index
await index.addEntry({
  cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
  path: '/models/stable-diffusion/v1.5/model.ckpt',
  metadata: {
    mimetype: 'application/octet-stream',
    size: 4229191690,
    locations: {
      huggingface: {
        repo_id: 'runwayml/stable-diffusion-v1-5',
        path: 'v1-5-pruned-emaonly.ckpt',
        revision: 'main'
      },
      ipfs: ['https://ipfs.io', 'https://dweb.link']
    }
  }
});
```

The Python implementation manages the underlying Arrow data:

```python
# Import the PyArrowContentIndex from ipfs_kit_py package
from ipfs_kit_py import PyArrowContentIndex, IPFSFileSystem

# Create integration layer in hallucinate_app
class ContentIndexIntegration:
    def __init__(self, resources=None, metadata=None):
        # Initialize connection to the external implementation
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Get IPFS client from resources or create new one
        ipfs_client = self.resources.get('ipfs_client') or IPFSFileSystem()
        
        # Get index path from metadata
        index_path = self.metadata.get('index_path', '~/.cache/hallucinate_app/content_index.arrow')
        
        # Initialize the PyArrowContentIndex from ipfs_kit_py
        self.index = PyArrowContentIndex(index_path, ipfs_client)
    
    # Forward methods to the implementation
    def lookup_by_cid(self, cid):
        return self.index.lookup_by_cid(cid)
    
    def lookup_by_path(self, path):
        return self.index.lookup_by_path(path)
    
    # All other methods forward to the external implementation
```

### Multi-Process Implementation

The `ipfs_accelerate_py` package includes a multi-process architecture and interacts with the `ipfs_kit_py` package for IPFS operations through efficient IPC:

```python
import multiprocessing as mp
import pyarrow as pa
import pyarrow.plasma as plasma
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from transformers import AutoModel
import torch
import os
import asyncio
from concurrent.futures import ProcessPoolExecutor

# Plasma store for shared memory between processes
plasma_store_path = "/tmp/plasma_store"
plasma_store_size = 10 * 1024 * 1024 * 1024  # 10GB

# Start plasma store
import subprocess
plasma_server_process = subprocess.Popen([
    "plasma_store",
    "-m", str(plasma_store_size),
    "-s", plasma_store_path
])

# Import the actual implementation from the PyPI package
from ipfs_accelerate_py import AccelerateServer

# Create an integration layer in hallucinate_app
class AccelerateServerIntegration:
    def __init__(self, config=None):
        self.config = config or {}
        
        # Initialize the external AccelerateServer from ipfs_accelerate_py package
        # This will automatically set up all of the following:
        # - FastAPI server initialization
        # - Plasma store connection for shared memory
        # - Inter-process communication queues
        # - IPFS Kit integration via the ipfs_kit_py package
        # - Process pool for ML model inference
        self.server = AccelerateServer(self.config)
        
        # Expose the same interface for hallucinate_app
        self.app = self.server.app
        self.models = self.server.models
        
    async def load_model_from_ipfs(self, model_id, cid):
        """Forward the model loading request to the actual implementation"""
        # The ipfs_accelerate_py package will handle all of the following:
        # - Sending commands to the IPFS process (from ipfs_kit_py)
        # - Processing ML model loading in parallel
        # - Managing inter-process communication
        # - Storing model information
        return await self.server.load_model_from_ipfs(model_id, cid)
        
    async def run_inference(self, model_id, input_data):
        """Forward inference request to the actual implementation"""
        # The ipfs_accelerate_py package will handle:
        # - Checking if the model is loaded
        # - Serializing input data to shared memory
        # - Sending inference request to the model's process
        # - Managing inter-process communication
        # - Processing results
        return await self.server.run_inference(model_id, input_data)
        
    def cleanup(self):
        """Clean up resources by forwarding to the implementation"""
        # The ipfs_accelerate_py package will handle:
        # - Stopping the IPFS process (from ipfs_kit_py)
        # - Shutting down the process executor
        # - Disconnecting from the plasma store
        # - Releasing any other resources
        return self.server.cleanup()
```

### Resource Pooling
- Modules should use a shared resource pool passed during initialization
- The resource pool enables modules to access services from other modules
- Prevents circular dependencies while maintaining modular architecture
- Facilitates testing by allowing resource mocking

### Dashboard Implementation
1. **Dashboard Initialization**:
   ```javascript
   // Import dashboard components
   import { Dashboard } from '../node/dashboard.js';
   import { ModuleTestPanel } from '../node/dashboard/module_test_panel.js';
   import { DatabasePanel } from '../node/dashboard/database_panel.js';
   import { PerformancePanel } from '../node/dashboard/performance_panel.js';
   
   // Initialize the dashboard with configuration
   const dashboard = new Dashboard({
     element: document.getElementById('dashboard-container'),
     config: {
       refreshInterval: 5000,
       theme: 'dark',
       defaultView: 'modules'
     }
   });
   
   // Add module testing panels for each core module
   dashboard.addPanel(new ModuleTestPanel('ipfs-kit'));
   dashboard.addPanel(new ModuleTestPanel('model-manager'));
   dashboard.addPanel(new ModuleTestPanel('transformers'));
   dashboard.addPanel(new ModuleTestPanel('datasets'));
   dashboard.addPanel(new ModuleTestPanel('faiss'));
   dashboard.addPanel(new ModuleTestPanel('embeddings'));
   dashboard.addPanel(new ModuleTestPanel('agents'));
   dashboard.addPanel(new ModuleTestPanel('accelerate'));
   
   // Add database panels
   dashboard.addPanel(new DatabasePanel('orbitdb'));
   dashboard.addPanel(new DatabasePanel('fireproofdb'));
   dashboard.addPanel(new DatabasePanel('duckdb', {
     enableSQL: true,
     enableIPLDExport: true
   }));
   
   // Add performance monitoring
   dashboard.addPanel(new PerformancePanel());
   
   // Render the dashboard
   dashboard.render();
   ```

### Model Server Integration
1. **Server Initialization with Non-Blocking IPFS Kit**:
   ```javascript
   // Initialize the server configuration
   const serverConfig = {
     ipfsKitMode: 'threaded',  // Run IPFS kit in a separate thread
     workerThreads: 4,        // Number of worker threads for parallel processing
     nonBlocking: true,       // Enable non-blocking operations for ML models
     maxConcurrent: 10        // Maximum concurrent operations
   };
   
   // Initialize the keystore for secure API access
   const keystore = await Keystore.init({
     encryptionKey: process.env.KEYSTORE_MASTER_KEY,
     storageLocation: path.join(os.homedir(), '.hallucinate_app', 'keystore')
   });
   
   // Initialize the resource pool with keystore, databases, and PyArrow index
   const resourcePool = {
     ipfsKit: ipfsKit,
     authManager: ucanAuthManager,
     keystore: keystore,
     
     // Databases
     orbitDb: await OrbitDB.create(),
     fireproofDb: await FireproofDB.create({
       name: 'hallucinate_app_mirror',
       syncWithIpfs: true
     }),
     duckDb: await DuckDB.create({
       path: path.join(os.homedir(), '.hallucinate_app', 'analytics.db'),
       ipldConverter: new IPLDConverter({
         libp2p: resourcePool.libp2p
       })
     }),
     
     // PyArrow content index
     contentIndex: await PyArrowIndex.create({
       indexPath: path.join(os.homedir(), '.hallucinate_app', 'content_index.arrow'),
       ipfs: ipfsKit.ipfs,
       fsProvider: new UnixFSProvider(ipfsKit.ipfs)
     })
   };
   
   // Start the Python model server with resources
   await pythonBridge.startServer(resourcePool);
   ```

2. **Model Loading with Authentication**:
   ```javascript
   // Get UCAN capabilities token
   const ucanToken = await ucanAuthManager.getCapabilityToken('model:load');
   
   // Load a model by ID with auth
   const result = await pythonBridge.loadModel('model-name', { authToken: ucanToken });
   ```

3. **Inference with Efficient Data Exchange and API Key Access**:
   ```javascript
   // Securely retrieve API key for external service if needed
   const apiKey = await resourcePool.keystore.getKey('openai');
   
   // Run inference with loaded model using Arrow for data transfer
   const result = await pythonBridge.runInference({ 
     text: 'Input text for inference',
     useArrow: true,
     transferMode: 'zero-copy',
     apiCredentials: {
       provider: 'openai',
       key: apiKey,  // Securely retrieved from keystore
       usageTracking: true
     }
   });
   ```

4. **Data Processing with Resource Sharing and Multi-Database Persistence**:
   ```javascript
   // Use shared embeddings module from resource pool
   const embeddings = await resourcePool.embeddings.generateEmbedding(result.text);
   
   // Process with FAISS for similarity search
   const similar = await resourcePool.faiss.findSimilar(embeddings);
   
   // Store results in multiple databases for different access patterns
   const resultData = {
     text: result.text,
     embeddings: embeddings,
     similar: similar,
     timestamp: Date.now()
   };
   
   // If the result is from a file with a CID, update the content index
   if (result.source && result.source.cid) {
     await resourcePool.contentIndex.updateMetadata(result.source.cid, {
       lastProcessed: Date.now(),
       embeddingModel: 'text-embedding-3-large',
       embeddingDimensions: embeddings.length,
       similarityScore: similar[0]?.score || 0
     });
   }
   
   // Store in OrbitDB for P2P availability
   const orbitDbId = await resourcePool.orbitDb.put('embeddings', resultData);
   
   // Mirror to FireproofDB for serverless backup with CRDT features
   const fireproofId = await resourcePool.fireproofDb.put('embeddings', resultData);
   
   // Store in DuckDB for analytical queries and ML feature extraction
   await resourcePool.duckDb.execute(`
     INSERT INTO embeddings_analytics 
     VALUES (
       '${result.text.replace(/'/g, "''")}', 
       '${JSON.stringify(embeddings)}',
       ${Date.now()}
     )
   `);
   
   // Export DuckDB to IPLD for P2P exchange when needed
   if (shouldShareAnalytics) {
     const ipldRepresentation = await resourcePool.duckDb.exportTableToIPLD('embeddings_analytics');
     const cid = await resourcePool.ipfsKit.ipfs.dag.put(ipldRepresentation);
     await resourcePool.libp2p.pubsub.publish('analytics-updates', cid.toString());
     console.log(`Analytics exported as IPLD and shared via libp2p with CID: ${cid}`);
   }
   
   console.log(`Data stored across all database systems for redundancy and analytics`);
   ```

5. **Cleanup**:
   ```javascript
   // Sync databases before shutdown
   await resourcePool.orbitDb.sync();
   await resourcePool.fireproofDb.sync();
   
   // Export final DuckDB state to IPLD if needed
   const finalAnalyticsIPLD = await resourcePool.duckDb.exportDatabaseToIPLD();
   const finalCid = await resourcePool.ipfsKit.ipfs.dag.put(finalAnalyticsIPLD);
   console.log(`Final analytics state preserved with IPLD CID: ${finalCid}`);
   
   // Save PyArrow content index
   await resourcePool.contentIndex.save();
   
   // Export the content index to parquet format
   await resourcePool.contentIndex.exportToParquet(
     path.join(os.homedir(), '.hallucinate_app', 'exports', `content_index_${Date.now()}.parquet`)
   );
   
   // Close DuckDB connection
   await resourcePool.duckDb.close();
   
   // Stop the server when done
   await pythonBridge.stopServer();
   
   // Release Arrow memory buffers
   await arrowMemoryManager.releaseBuffers();
   ```

## Electron App Packaging
- The application uses Electron Forge for packaging
- Supports multiple platforms: Windows, macOS, Linux
- Configuration for packaging is in forge.config.cjs
- Custom installers available in the install/ directory
- UCAN authentication packaged for distribution security
- Arrow and PyBridge libraries included in all distributions
- Database components:
  - DuckDB binary distribution for each platform
  - IPLD conversion libraries for database exchange
  - Initial schema creation and migration scripts
  - SQL query optimizer configurations for performance
  - Platform-specific database file locations

## Security Considerations
- Integration with secure authentication modules from external packages
- UCAN capabilities should be properly delegated and verified through integration layers
- Clear separation between public and protected IPFS content
- Secure model distribution using capability-based access
- Secure embeddings generation with appropriate authorization
- Defense-in-depth approach with multiple security layers
- Secure API key management using encrypted keystore implementations from packages
- Integration with third-party API key management (OpenAI, HuggingFace, etc.)
- Use system keychain or secure storage mechanisms for sensitive credentials
- Support for rotating API keys and credential management
- Audit logging for API key usage and access patterns
- Database security:
  - Use parameterized queries with DuckDB to prevent SQL injection
  - Control access to IPLD-converted database states via UCAN capabilities
  - Implement row-level security for sensitive analytics data
  - Encrypt database files at rest
  - Validate incoming IPLD database snapshots before importing

## Contributing
- Focus on creating integration layers for external packages from PyPI
- Do not implement features directly in this codebase if they are available in external packages
- Create a feature branch for new work
- Ensure code passes all tests before submitting
- Follow the module pattern and code style guidelines
- Include updates to documentation when appropriate, especially regarding external package integration
- Add tests for integration layers in the test directory
- Ensure UCAN authentication is correctly integrated through integration layers
- Verify efficient data exchange with Apache Arrow/PyBridge where appropriate
- Database contributions:
  - Choose the appropriate database system for your implementation
  - Add DuckDB SQL schema migrations for analytical features
  - Include IPLD conversion logic for P2P database exchange
  - Document database usage patterns and performance characteristics
  - Add appropriate tests for database functionality
- Dashboard contributions:
  - Register new modules with the dashboard
  - Create appropriate visualization components
  - Follow the dashboard component pattern
  - Ensure performance optimization for real-time updates
  - Implement both light and dark theme support
  - Add appropriate help text and documentation
  - Include accessibility features