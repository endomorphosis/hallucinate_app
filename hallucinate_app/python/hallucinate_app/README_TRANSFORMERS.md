# IPFS Transformers Module

## Overview

The IPFS Transformers module provides integration between IPFS, HuggingFace Transformers, and ipfs_accelerate_py for hardware-accelerated ML inference. This module enables loading transformer models from either HuggingFace Hub or IPFS, and running inference with automatic hardware acceleration across multiple backends.

## Features

- Hardware-accelerated inference via ipfs_accelerate_py
- Support for multiple hardware backends (CPU, CUDA/GPU, OpenVINO, WebNN, WebGPU)
- Streaming responses for real-time model outputs
- Automatic model registry for loaded models
- Authentication integration with UCAN-based capabilities
- Non-blocking IPFS operations via separate threads
- Comprehensive dashboard for monitoring and control

## Installation

The IPFS Transformers module is included with the hallucinate_app package. For hardware acceleration, install ipfs_accelerate_py:

```bash
pip install ipfs_accelerate_py
```

## Usage

### Basic Usage

```python
from hallucinate_app.ipfs_transformers import ipfs_transformers
import asyncio

async def main():
    # Initialize transformers module
    await ipfs_transformers.init()
    
    # Load a model
    result = await ipfs_transformers.load_model(
        model_id="gpt2",
        task="text-generation"
    )
    
    if result["success"]:
        print(f"Model loaded successfully: {result}")
        
        # Run inference
        inference_result = await ipfs_transformers.run_inference(
            inputs="Once upon a time",
            options={"max_length": 50}
        )
        
        print(f"Inference result: {inference_result}")

# Run the example
asyncio.run(main())
```

### Loading Models from IPFS

```python
# Load model from IPFS with CID
model_result = await ipfs_transformers.load_model(
    model_id="my-custom-model",
    task="text-generation",
    options={
        "from_ipfs": True,
        "cid": "bafybeicgmdpvw4duutrmdxl4a7gc52sxyuk7nz5gby77afwdteh3jc5bqa"
    }
)
```

### Hardware-Accelerated Inference

```python
# Run inference with specified device
inference_result = await ipfs_transformers.run_inference(
    inputs="Translate this to French: Hello, how are you?",
    model_id="t5-small",
    options={
        "device": "cuda:0",  # or "openvino:0", "webgpu", etc.
        "use_accelerate": True
    }
)
```

### Streaming Responses

```python
# Run inference with streaming
stream_result = await ipfs_transformers.run_inference(
    inputs="Write a short story about a robot learning to paint.",
    model_id="gpt2-medium",
    options={
        "stream": True,
        "max_length": 200
    }
)

# Process streaming output
if stream_result["success"] and "stream" in stream_result:
    async for chunk in stream_result["stream"]:
        print(chunk, end="", flush=True)
```

### Authenticated Access

```python
# Get UCAN capability token for model loading
from hallucinate_app.auth import auth_manager

token = await auth_manager.create_capability_token(
    capability="model:load",
    resource={
        "model_id": "gpt2"
    }
)

# Load model with authentication
result = await ipfs_transformers.load_model(
    model_id="gpt2",
    options={
        "auth_token": token
    }
)
```

## Dashboard Integration

The IPFS Transformers module includes a comprehensive dashboard for monitoring and controlling transformer models:

```javascript
// Import the dashboard registration function
import { registerIPFSTransformersDashboard } from './dashboard/register_ipfs_transformers_dashboard.js';

// Get the main dashboard instance
import { Dashboard } from './dashboard/dashboard.js';
const dashboard = new Dashboard({
  element: document.getElementById('dashboard-container')
});

// Register the transformers dashboard
const transformersDashboard = registerIPFSTransformersDashboard(dashboard, {
  bridge: pythonBridge,
  autoRefresh: true,
  refreshInterval: 5000
});
```

The dashboard provides:

- Real-time model monitoring
- Hardware capability visualization
- Model loading interface
- Interactive inference testing
- Streaming response visualization
- Operation history and stats

## Architecture

### Components

1. **IPFSTransformers Class**
   - Core implementation for transformers functionality
   - Handles model loading, inference, and management
   - Integrates with ipfs_accelerate_py for hardware acceleration

2. **Hardware Backends**
   - CPU: Default fallback for all models
   - CUDA/GPU: Hardware acceleration via CUDA
   - OpenVINO: Intel acceleration via OpenVINO
   - WebNN: Web Neural Network API acceleration
   - WebGPU: Web GPU acceleration
   - Additional backends via ipfs_accelerate_py

3. **Dashboard Components**
   - Python Panel: Server-side dashboard component
   - JavaScript UI: Client-side interface
   - Bridge: Communication between JavaScript and Python
   - Registration: Integration with main dashboard

### Workflow

1. **Initialization**
   - Load configuration
   - Detect hardware capabilities
   - Initialize ipfs_accelerate_py if available
   - Set up model registry

2. **Model Loading**
   - Direct loading from HuggingFace
   - Loading from IPFS via model manager
   - Hardware-accelerated loading via ipfs_accelerate_py
   - Fallback paths for missing components

3. **Inference**
   - Hardware detection and optimal backend selection
   - Streaming support for real-time outputs
   - Authentication via UCAN capabilities
   - Multiple model type support (text, vision, audio)

## Testing

Run tests for the transformers module:

```python
from hallucinate_app.ipfs_transformers import ipfs_transformers
import asyncio

# Run self-test
test_results = ipfs_transformers.test()
print(test_results)

# Run dashboard tests
from hallucinate_app.test.test_ipfs_transformers_dashboard import run_tests

async def run_dashboard_tests():
    results = await run_tests()
    print(results)

asyncio.run(run_dashboard_tests())
```

## API Reference

### IPFSTransformers Class

#### `__init__(resources=None, metadata=None)`
Initialize the transformers module.

#### `async init()`
Initialize the module and load default model if specified.

#### `async load_model(model_id, task=None, options=None)`
Load a transformer model.

#### `async run_inference(inputs, model_id=None, options=None)`
Run inference with a transformer model.

#### `test()`
Run self-tests for the transformers module.

### Dashboard Components

#### IPFSTransformersPanel
Server-side dashboard panel for transformers management.

#### IPFSTransformersDashboard
Client-side dashboard UI for transformers visualization.

#### IPFSTransformersBridge
Bridge for JavaScript-Python communication.

## Troubleshooting

### Common Issues

1. **Missing ipfs_accelerate_py**
   - Install with `pip install ipfs_accelerate_py`
   - Module will fall back to direct transformers usage

2. **GPU Acceleration Not Working**
   - Verify CUDA is installed and visible to Python
   - Check `nvidia-smi` to confirm GPU is available
   - Update GPU drivers if needed

3. **Model Loading Failures**
   - Check internet connection for HuggingFace access
   - Verify IPFS daemon is running for IPFS models
   - Ensure sufficient disk space for model storage

4. **Streaming Not Working**
   - Confirm model supports streaming
   - Verify event loop is running in async context
   - Check for proper async iterator handling