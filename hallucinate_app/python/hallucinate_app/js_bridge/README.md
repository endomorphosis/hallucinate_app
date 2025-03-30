# JavaScript-Python Bridge Components

This directory contains bridge modules for communication between JavaScript and Python components in the Hallucinate App.

## Components Overview

### IPFS Kit Dashboard Bridge

The IPFS Kit Dashboard Bridge provides a JSON-RPC interface for the dashboard to communicate with the Python IPFS Kit implementation. It enables:

- Status monitoring of IPFS nodes
- Control of IPFS operations (add, retrieve, pin, unpin)
- Test execution and result reporting

#### Files:
- `ipfs_kit_dashboard.py`: The main bridge module with RPC handler

#### API:

The bridge exposes the following RPC methods:
- `init`: Initialize the IPFS Kit panel
- `get_status`: Get current IPFS status
- `get_updates`: Get pending status updates
- `execute_operation`: Execute an IPFS operation
- `test`: Run a self-test
- `stop`: Stop the IPFS Kit panel

Example usage from JavaScript:
```javascript
const result = await callPythonBridge('ipfs_kit_rpc', {
  method: 'get_status',
  params: {}
});
```

### PyArrow Content Index Bridge

The PyArrow Content Index Bridge provides an interface for JavaScript to interact with the PyArrow-based content index.

#### Files:
- `pyarrow_content_index_bridge.py`: The bridge module for PyArrow content index

## Architecture

The bridge components follow a consistent architecture:

1. **Request Handling**: JSON-RPC interface for method calls
2. **Parameter Validation**: Validation of incoming parameters
3. **Bridge Implementation**: Python implementation of the bridge functionality
4. **Result Formatting**: JSON formatting of results for JavaScript consumption

## Adding New Bridge Components

To add a new bridge component:

1. Create a Python bridge module with RPC handlers
2. Implement the bridge functionality
3. Register the bridge with the dashboard bridge registry
4. Add tests for the bridge functionality

## Testing

Tests for bridge components are in the `test/` directory. Bridge-specific tests can be found in:

- `test_ipfs_kit_integration.py`: Tests for the IPFS Kit bridge
- Other test files for specific bridge components

Run tests with:

```bash
python test/test_ipfs_kit_integration.py
```