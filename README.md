# hallucinate_app

An Electron application that creates a bridge between IPFS and HuggingFace technologies, enabling decentralized AI model serving, dataset management, and inference.

## Features

- Cross-platform desktop application (Windows, macOS, Linux)
- Decentralized model serving via IPFS
- Integration with HuggingFace transformers ecosystem
- FAISS vector search capabilities
- P2P communication via libp2p
- Decentralized database with OrbitDB

## Quick Start

### Prerequisites

- Node.js 16+
- Python 3.8+
- IPFS (optional, can use HTTP gateways)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/endomorphosis/hallucinate_app.git
cd hallucinate_app
```

2. Install JavaScript dependencies:
```bash
npm install
# or
yarn install
```

3. Install Python dependencies:
```bash
pip install -r hallucinate_app/python/requirements.txt
```

### Running the App

Start the Electron application:
```bash
npm start
```

## Using the IPFS Accelerate Model Server

The hallucinate_app includes an integration with the ipfs_accelerate_py model server for optimized model inference.

### Setting Up the Model Server

1. Make sure Python dependencies are installed:
```bash
pip install -r test/requirements.txt
```

2. Launch the Electron app with the model tester:
```javascript
// In your main Electron file
import { createModelTesterWindow } from './hallucinate_app/node/accelerate_model_tester.js';
createModelTesterWindow();
```

### Working with Models

1. **Start the Server**:
   Click the "Start Server" button in the UI, or programmatically:
   ```javascript
   await pythonBridge.startServer();
   ```

2. **Load a Model**:
   Enter a model ID in the UI, or programmatically:
   ```javascript
   const result = await pythonBridge.loadModel('model-name');
   ```

3. **Run Inference**:
   Enter text in the UI for inference, or programmatically:
   ```javascript
   const result = await pythonBridge.runInference({ 
     text: 'Input text for inference' 
   });
   ```

4. **Stop the Server**:
   Click the "Stop Server" button when finished, or programmatically:
   ```javascript
   await pythonBridge.stopServer();
   ```

## Development

For detailed development guidelines, see [CLAUDE.md](CLAUDE.md).

### Testing

Run the test suite:
```bash
npm test
```

For specific test components:
```bash
npm run test:bridge    # Test Python-JavaScript bridge
npm run test:electron  # Test Electron UI
npm run test:python    # Test Python server
```

### Building Distributables

Create a packaged application:
```bash
npm run package
```

Build installers:
```bash
npm run make
```

## Architecture

The application follows a modular architecture with both JavaScript and Python implementations:

- **IPFS Kit**: Foundation for IPFS interactions
- **Model Manager**: Manages model loading and serving
- **Transformers**: Integration with HuggingFace transformers
- **Datasets**: Dataset management and processing
- **FAISS**: Vector search capabilities
- **Agents**: AI agent functionality
- **Accelerate**: Performance optimizations
- **libp2p**: P2P communication layer
- **OrbitDB**: Decentralized database storage

## License

This project is licensed under the AGPL-3.0 License - see the LICENSE file for details.

## Acknowledgements

- HuggingFace for their transformers ecosystem
- IPFS and libp2p projects
- Electron framework