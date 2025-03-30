# IPFS Model Manager

The IPFS Model Manager provides a comprehensive solution for managing AI models with IPFS integration, enabling decentralized model storage, version control, and efficient distribution.

## Overview

IPFS Model Manager connects HuggingFace Hub with IPFS to create a resilient system for AI model distribution and versioning. It allows models to be:

1. Imported from HuggingFace Hub and stored in IPFS
2. Retrieved directly from IPFS using content-addressing
3. Managed with comprehensive metadata and versioning
4. Distributed across IPFS nodes for resilience and locality

## Key Features

- **Cross-Platform Model Storage**: Store models on IPFS for distribution across any platform
- **Content-Addressed Models**: Use IPFS CIDs for reliable model identification and retrieval
- **HuggingFace Integration**: Seamless import from and synchronization with HuggingFace Hub
- **Role-Based Operations**: Support for master, worker, and leecher nodes
- **Detailed Metadata**: Track model type, task, size, and configuration details
- **Decentralized Distribution**: Share models across the IPFS network
- **Dashboard Integration**: Visual monitoring and management interface

## Installation

The IPFS Model Manager is included with hallucinate_app and has the following dependencies:

- IPFS Kit (for IPFS operations)
- HuggingFace Hub library (optional, for HuggingFace integration)

Additional dependencies can be installed with:

```bash
pip install huggingface_hub
```

## Usage

### Basic Usage

```python
import asyncio
from hallucinate_app.ipfs_model_manager import IPFSModelManager

async def main():
    # Initialize the model manager
    model_manager = IPFSModelManager()
    await model_manager.init()
    
    # Import a model from HuggingFace
    model_id = "bert-base-uncased"
    model_metadata = await model_manager.import_model_from_huggingface(model_id)
    
    # List available models
    models = await model_manager.list_models()
    
    # Get information about a specific model
    model_info = await model_manager.get_model_info(model_id)
    
    # Remove a model
    await model_manager.remove_model(model_id)

# Run the example
asyncio.run(main())
```

### Advanced Usage with IPFS

```python
import asyncio
from hallucinate_app.ipfs_model_manager import IPFSModelManager
from hallucinate_app.ipfs_kit import IPFSKit

async def main():
    # Initialize IPFS Kit
    ipfs_kit = IPFSKit()
    await ipfs_kit.init()
    
    # Create model manager with IPFS Kit and master role
    model_manager = IPFSModelManager(
        resources={"ipfsKit": ipfs_kit},
        metadata={"role": "master"}
    )
    await model_manager.init()
    
    # Import from HuggingFace (will automatically add to IPFS)
    model_id = "bert-base-uncased"
    model_metadata = await model_manager.import_model_from_huggingface(model_id)
    
    # Print the CIDs for the model files
    for filename, cid in model_metadata.cids.items():
        print(f"{filename}: {cid}")
    
    # Import a model directly from IPFS (using CID)
    cid = "bafybeihkqbx3t767ze2ob3acdl3xn5t4s7uhbjbfhgskgqgjblqykmh57q"  # example CID
    custom_model = await model_manager.import_model_from_ipfs("my-custom-model", cid)

# Run the example
asyncio.run(main())
```

## Dashboard Integration

The IPFS Model Manager includes a comprehensive dashboard component that integrates with the hallucinate_app dashboard system, providing:

1. Real-time model monitoring
2. Model import interface (HuggingFace and IPFS)
3. Model listing and management
4. Operation history and logs
5. Status metrics and visualizations

To enable the dashboard, register the components with the main dashboard:

```javascript
// In your dashboard JavaScript
import { registerIPFSModelManagerDashboard } from './dashboard/register_ipfs_model_manager_dashboard.js';

// Register when dashboard is ready
window.addEventListener('DashboardReady', (event) => {
  const dashboard = event.detail.dashboard;
  if (dashboard) {
    registerIPFSModelManagerDashboard(dashboard);
  }
});
```

## Architecture

The IPFS Model Manager follows the resource pool pattern from hallucinate_app, with the following components:

### Core Components

- **IPFSModelManager**: Main class for model management
- **ModelMetadata**: Data container for model information
- **IPFSModelManagerPanel**: Dashboard backend
- **IPFSModelManagerBridge**: JavaScript-Python communication bridge

### Integration Points

- **IPFS Kit**: For IPFS operations (add content, fetch, pin)
- **HuggingFace Hub**: For model discovery and initial import
- **Dashboard**: Visual interface for model management
- **Resource Pool**: For accessing other hallucinate_app modules

## Testing

The IPFS Model Manager includes comprehensive testing through:

```python
# Run model manager tests
from hallucinate_app.test.test_ipfs_model_manager import run_tests

# Run with mock implementation (default)
results = run_tests(use_mock=True)

# Run with actual implementations
results = run_tests(use_mock=False)
```

You can also use the `test()` method directly on the IPFSModelManager instance:

```python
model_manager = IPFSModelManager()
test_results = model_manager.test()
```

## Security Considerations

- Model distribution permissions are controlled by IPFS node configuration
- When using with the secure_model_manager, UCAN authentication is required for model operations
- API keys for HuggingFace should be secured through the keystore module
- Access to private models should be managed through proper authentication

## Future Development

- Integration with the hallucinate_app Secure Model Manager for UCAN-based authorization
- Support for model fine-tuning and versioning
- Advanced model search and recommendation
- Multi-modal model support
- Integration with model inference engines
- Model card generation and documentation