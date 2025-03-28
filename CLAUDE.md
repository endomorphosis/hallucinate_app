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
- Implementation of UCAN (User Controlled Authorization Networks) for decentralized auth
- Preferred implementation follows storacha/w3up command pattern
- Delegated capabilities ensure secure access control across decentralized services
- Support for capability-based security in distributed model and data access
- Secure keystore for managing third-party API keys (OpenAI, HuggingFace, etc.)
- Encrypted storage of sensitive credentials with secure access control
- Integration with platform-specific secure storage mechanisms (Keychain, TPM, etc.)
- API key rotation and lifecycle management

### Module Pattern
Each module follows a consistent pattern:
1. Constructor-based initialization with resources and metadata
2. Implementation of standard methods: init(), test()
3. Error handling with specific exception types
4. Both JavaScript (ESM) and Python implementations
5. Access to other modules through a resource pool passed during initialization

### Threading and Concurrency Model
- **IPFS Kit Python Implementation**: Must be run in a separate thread to avoid blocking
  - The `ipfs_kit_py` module runs as a non-blocking server in its own thread
  - This prevents IPFS operations from blocking machine learning model execution in `ipfs_accelerate_py`
  - Communication with the IPFS kit happens via thread-safe queues and message passing
  - Asynchronous I/O operations ensure high throughput for both IPFS and ML workloads
  - Example implementation:
  
  ```python
  import threading
  from queue import Queue
  from ipfs_kit_py import IPFSKitServer
  
  # Message queues for thread communication
  request_queue = Queue()
  response_queue = Queue()
  
  # IPFS Kit server thread
  def ipfs_server_thread():
      server = IPFSKitServer(request_queue, response_queue)
      server.start()
  
  # Start IPFS kit in separate thread
  ipfs_thread = threading.Thread(target=ipfs_server_thread, daemon=True)
  ipfs_thread.start()
  
  # Main thread continues with ML operations in ipfs_accelerate_py
  # while communicating with IPFS kit via queues
  ```

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
1. Follow the module pattern for any new functionality
2. Implement both JavaScript and Python versions when applicable
3. Use the resource pool pattern for module interdependencies
4. Add test methods for new modules in the appropriate test directory
5. Ensure proper error handling throughout
6. Implement UCAN capability checks where appropriate for secure operations
7. Use the keystore for all external API key storage and retrieval
8. Never hardcode API keys or sensitive credentials in the codebase
9. Implement credential rotation mechanisms for API keys
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
  
- **FireproofDB**: Secondary serverless database for mirroring and backup
  - CRDT-based for conflict-free replication
  - Offline-first capabilities with automatic sync
  - Browser and Node.js compatibility
  - IPFS-based persistence layer
  - Provides redundancy and additional availability

- **DuckDB-IPLD**: Analytical SQL database with IPLD integration
  - High-performance columnar analytics engine
  - SQL interface for complex queries and data transformation
  - Conversion to/from IPLD for P2P exchange via libp2p
  - Parquet and Arrow integration for efficient data processing
  - Ideal for ML feature engineering and dataset analysis

### PyArrow Index Structure
The system maintains a comprehensive PyArrow index with the following structure:

- **Primary Key**: IPFS PinSet CID
  - Content-addressable identifier for all indexed data
  - Ensures unique identification based on content hash
  - Enables direct IPFS retrieval of any indexed item

- **Secondary Key**: UnixFS / fsspec Virtual Filesystem Location
  - Path within the virtual filesystem representation
  - Enables hierarchical organization and navigational access
  - Supports standard filesystem operations across distributed content

- **Metadata Schema**:
  ```python
  metadata_schema = pa.schema([
    ('mimetype', pa.string()),              # Content MIME type
    ('size', pa.int64()),                   # Size in bytes
    ('md5', pa.binary(16)),                 # MD5 hash
    ('sha256', pa.binary(32)),              # SHA-256 hash
    ('created_at', pa.timestamp('us')),     # Creation timestamp
    ('updated_at', pa.timestamp('us')),     # Last update timestamp
    ('locations', pa.struct([
      ('filecoin', pa.list_(pa.string())),  # Filecoin storage locations
      ('storacha', pa.string()),            # Storacha W3UP location
      ('libp2p', pa.list_(pa.string())),    # libp2p peer IDs storing content
      ('ipfs', pa.list_(pa.string())),      # IPFS gateway URLs
      ('ipfs_cluster', pa.list_(pa.string())), # IPFS cluster pins
      ('s3', pa.struct([                    # S3-compatible storage
        ('bucket', pa.string()),
        ('key', pa.string()),
        ('region', pa.string()),
        ('endpoint', pa.string())
      ])),
      ('huggingface', pa.struct([           # Hugging Face Hub storage
        ('repo_id', pa.string()),
        ('path', pa.string()),
        ('revision', pa.string())
      ]))
    ]))
  ])
  ```

This index enables:
- Content discovery across multiple storage backends
- Efficient retrieval based on content identity or virtual path
- Seamless migration between storage providers
- Comprehensive metadata for content verification and management
- Resilient data availability with multiple retrieval options

### Synchronization Patterns
- Bidirectional sync between OrbitDB and FireproofDB
- IPLD conversion for DuckDB database exchange over libp2p
- Event-driven updates to maintain consistency
- Conflict resolution strategies using CRDTs
- Selective mirroring for bandwidth and storage optimization
- Differential updates for DuckDB database snapshots

## Testing

### Testing Structure
- All tests must be located in the dedicated `test` directory
- JavaScript tests are in `test/js/`, Python tests in `test/python/`
- Main test runner is `test/test.js`
- Each test file should be able to run independently
- Resource pools should be mockable for isolated module testing
- Database tests should verify persistence across all database systems (OrbitDB, FireproofDB, DuckDB)
- IPLD conversion tests should validate DuckDB data can be exchanged via libp2p

### Testing Approaches
- **Unit Testing**: Tests for individual modules and components
- **Integration Testing**: Tests for interactions between modules
- **End-to-End Testing**: Tests for complete workflows
- **Mock Testing**: Tests with mock implementations for external dependencies
- **Security Testing**: Tests for UCAN capability delegation and verification
- **Data Exchange Testing**: Tests for Apache Arrow and PyBridge data transfer
- **Keystore Testing**: Tests for secure API key storage and retrieval
- **Credential Rotation Testing**: Tests for API key rotation and lifecycle management
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
- Authentication tests should verify proper UCAN capability checking
- Resource pool access tests should validate correct module interactions
- Keystore tests should validate secure API key management without exposing keys
- Tests should use mock API keys for external service integration
- API key rotation should be tested for proper credential management
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
The project includes a comprehensive testing dashboard that simplifies module testing:

```javascript
// Import testing framework and dashboard
import testHandler from './test_handler.js';
import { Dashboard } from './dashboard.js';

// Initialize the dashboard with test handler integration
const dashboard = new Dashboard({
  element: document.getElementById('dashboard-container'),
  testHandler: testHandler
});

// Connect test events to dashboard
testHandler.on('test-result', (result) => {
  dashboard.updateModuleStatus(result.module, result.success);
  dashboard.logTestResult(result);
});

// Setup quick-test buttons for all modules
Object.keys(testHandler.modules).forEach(moduleId => {
  dashboard.createTestButton(moduleId, async () => {
    const config = { environment: 'local', metadata: { triggered: 'dashboard' } };
    return await testHandler.testModule(moduleId, config);
  });
});

// Initialize database visualizations
dashboard.setupDatabasePanels(['orbitdb', 'fireproofdb', 'duckdb']);

// Setup module dependency visualization
dashboard.renderModuleDependencies(testHandler.modules);

// Launch the dashboard
dashboard.render();
```

The dashboard provides:
- One-click testing for all modules
- Real-time test results visualization
- Module dependency graphs
- Database content browsing for all database systems
- Historical test result tracking
- Performance metrics monitoring
- Resource usage visualization

### IPFS Accelerate Model Server Testing
The project includes a dedicated testing environment for the ipfs_accelerate_py model server:

1. **Python Server Component**:
   - FastAPI server in `test/python/ipfs_accelerate_server.py`
   - RESTful API for model loading and inference
   - Mock implementation for offline testing
   - UCAN capability verification for authenticated access
   - DuckDB integration for analytics on model performance
   - Non-blocking IPFS operations via threaded `ipfs_kit_py` server
   - Parallel processing of ML model inference and IPFS operations
   - Thread-safe message passing between ML and IPFS components

2. **JavaScript Bridge**:
   - Python process management in `test/js/python_bridge.js`
   - API client for server communication
   - Error handling for robustness
   - Apache Arrow and PyBridge for efficient data exchange
   - Resource pool integration for module access
   - IPLD conversion utilities for P2P database exchange
   - Non-blocking communication with threaded `ipfs_kit_py` server
   - Parallel request handling for IPFS and ML operations

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
- **RESTful API**: Python servers with JavaScript clients
- **File-based**: Shared file access for data exchange
- **Apache Arrow C Data Interface**: Efficient shared data layer between JavaScript and Python
- **PyBridge**: Serialized/deserialized data using the 'pybridge' package by mwni

### PyArrow Index Integration
The PyArrow index serves as a critical shared data structure between Python and JavaScript components:

```javascript
// JavaScript access to PyArrow index
import { PyArrowIndex } from '../python_bridge/pyarrow_index.js';

// Initialize the index with connection to Python backend
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
import pyarrow as pa
from pyarrow import parquet
import fsspec
from fsspec.implementations.ipfs import IPFSFileSystem

class PyArrowContentIndex:
    def __init__(self, index_path, ipfs_client=None):
        self.index_path = index_path
        self.ipfs = ipfs_client or IPFSFileSystem()
        self._load_index()
    
    def _load_index(self):
        try:
            self.table = parquet.read_table(self.index_path)
        except:
            # Create new index with schema
            self.table = pa.Table.from_pydict({}, schema=metadata_schema)
    
    def lookup_by_cid(self, cid):
        mask = self.table['cid'] == cid
        result = self.table.filter(mask)
        return result.to_pydict() if len(result) > 0 else None
    
    # Additional methods for querying and updating the index
```

### Non-Blocking IPFS Kit Implementation

The `ipfs_accelerate_py` module interacts with the threaded `ipfs_kit_py` server:

```python
import threading
import queue
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from transformers import AutoModel
import torch

from ipfs_kit_py import IPFSKitServer
from ipfs_kit_py.client import IPFSKitClient

class AccelerateServer:
    def __init__(self, config=None):
        self.app = FastAPI(title="IPFS Accelerate Server")
        self.models = {}
        self.config = config or {}
        
        # Start IPFS Kit in a separate thread to avoid blocking ML operations
        self.ipfs_request_queue = queue.Queue()
        self.ipfs_response_queue = queue.Queue()
        self.ipfs_server_thread = threading.Thread(
            target=self._run_ipfs_server,
            daemon=True
        )
        self.ipfs_server_thread.start()
        
        # Create client for communicating with the IPFS server thread
        self.ipfs_client = IPFSKitClient(
            self.ipfs_request_queue, 
            self.ipfs_response_queue
        )
        
    def _run_ipfs_server(self):
        """Run IPFS Kit server in a separate thread"""
        server = IPFSKitServer(
            self.ipfs_request_queue,
            self.ipfs_response_queue
        )
        server.start()
        
    async def load_model_from_ipfs(self, model_id, cid):
        """Load model from IPFS without blocking the main thread"""
        # Submit IPFS download request to the separate thread
        download_task = self.ipfs_client.async_download(
            cid=cid,
            dest_path=f"./models/{model_id}"
        )
        
        # Continue processing while IPFS operations happen in background
        # This allows for concurrent ML and IPFS operations
        model = AutoModel.from_pretrained(f"./models/{model_id}")
        self.models[model_id] = model
        
        # Wait for IPFS operation to complete if needed
        await download_task
        
        return {"status": "success", "model_id": model_id}
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
- UCAN capabilities should be properly delegated and verified
- Clear separation between public and protected IPFS content
- Secure model distribution using capability-based access
- Secure embeddings generation with appropriate authorization
- Defense-in-depth approach with multiple security layers
- Secure API key management using an encrypted keystore
- Implement a secure keystore for third-party API keys (OpenAI, HuggingFace, etc.)
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
- Create a feature branch for new work
- Ensure code passes all tests before submitting
- Follow the module pattern and code style guidelines
- Include updates to documentation when appropriate
- Add tests for new functionality in the test directory
- Ensure UCAN authentication is implemented for protected resources
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