# hallucinate_app Development Guide

## Project Overview

hallucinate_app is an Electron-based desktop application that creates a bridge between IPFS and HuggingFace technologies, enabling decentralized AI model serving, dataset management, and inference. The application leverages a modular architecture with paired JavaScript and Python implementations.

### Key Technologies
- **Frontend**: Electron (cross-platform desktop application)
- **JavaScript**: ES Modules, Node.js
- **Python**: Python 3.8+ with HuggingFace ecosystem 
- **AI/ML**: Transformers, PyTorch, FAISS vector database
- **Decentralized**: IPFS, libp2p, OrbitDB
- **Build**: Electron Forge

## Project Architecture

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

### Module Pattern
Each module follows a consistent pattern:
1. Constructor-based initialization with resources and metadata
2. Implementation of standard methods: init(), test()
3. Error handling with specific exception types
4. Both JavaScript (ESM) and Python implementations

## Build & Run Commands
- **Start app**: `npm start` or `electron-forge start`
- **Package app**: `npm run package`
- **Build distributable**: `npm run make`
- **Run all tests**: `npm test`
- **Run bridge tests**: `npm run test:bridge`
- **Run electron tests**: `npm run test:electron`
- **Run Python tests**: `npm run test:python`
- **Install dependencies**: `npm install` or `yarn install`

## Development Workflow

### Setting Up Development Environment
1. Clone the repository
2. Run `npm install` or `yarn install` to install JavaScript dependencies
3. Set up Python environment with `pip install -r hallucinate_app/python/requirements.txt`
4. Install test dependencies with `pip install -r test/requirements.txt`
5. Configure IPFS if needed (see Configuration section)

### Making Changes
1. Follow the module pattern for any new functionality
2. Implement both JavaScript and Python versions when applicable
3. Add test methods for new modules in the appropriate test directory
4. Ensure proper error handling throughout

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

### General
- Maintain modular architecture with IPFS/libp2p kit structure
- Prefer descriptive variable names over comments
- Initialize class resources/metadata via constructor
- Follow existing patterns when extending functionality
- All modules should implement a test() method

## Testing

### Testing Structure
- All tests must be located in the dedicated `test` directory
- JavaScript tests are in `test/js/`, Python tests in `test/python/`
- Main test runner is `test/test.js`
- Each test file should be able to run independently

### Testing Approaches
- **Unit Testing**: Tests for individual modules and components
- **Integration Testing**: Tests for interactions between modules
- **End-to-End Testing**: Tests for complete workflows
- **Mock Testing**: Tests with mock implementations for external dependencies

### Module Tests
- Each module must include a test() method that validates core functionality
- Tests should handle exceptions gracefully and return informative messages
- Python tests should output results in JSON format
- Run the comprehensive test suite before submitting changes

### IPFS Accelerate Model Server Testing
The project includes a dedicated testing environment for the ipfs_accelerate_py model server:

1. **Python Server Component**:
   - FastAPI server in `test/python/ipfs_accelerate_server.py`
   - RESTful API for model loading and inference
   - Mock implementation for offline testing

2. **JavaScript Bridge**:
   - Python process management in `test/js/python_bridge.js`
   - API client for server communication
   - Error handling for robustness

3. **Electron Integration**:
   - UI component in `hallucinate_app/node/views/model_tester.html`
   - IPC handlers in `hallucinate_app/node/accelerate_model_tester.js`
   - Event-based communication flow

To manually test the model server:
```javascript
// In your main Electron file
import { createModelTesterWindow } from './hallucinate_app/node/accelerate_model_tester.js';
createModelTesterWindow();
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

## Python-JavaScript Integration

### Communication Methods
- **Child Process**: Spawn Python processes from Node.js
- **RESTful API**: Python servers with JavaScript clients
- **File-based**: Shared file access for data exchange

### Model Server Integration
1. **Server Initialization**:
   ```javascript
   // Start the Python model server
   await pythonBridge.startServer();
   ```

2. **Model Loading**:
   ```javascript
   // Load a model by ID
   const result = await pythonBridge.loadModel('model-name');
   ```

3. **Inference**:
   ```javascript
   // Run inference with loaded model
   const result = await pythonBridge.runInference({ 
     text: 'Input text for inference' 
   });
   ```

4. **Cleanup**:
   ```javascript
   // Stop the server when done
   await pythonBridge.stopServer();
   ```

## Electron App Packaging
- The application uses Electron Forge for packaging
- Supports multiple platforms: Windows, macOS, Linux
- Configuration for packaging is in forge.config.cjs
- Custom installers available in the install/ directory

## Contributing
- Create a feature branch for new work
- Ensure code passes all tests before submitting
- Follow the module pattern and code style guidelines
- Include updates to documentation when appropriate
- Add tests for new functionality in the test directory