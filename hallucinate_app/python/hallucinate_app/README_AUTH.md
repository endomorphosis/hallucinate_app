# Authentication and Security Architecture

This document describes the authentication and security architecture for hallucinate_app, specifically focusing on the authentication, keystore, and integration components.

## Overview

The security system is built on three main components:

1. **Authentication (auth.py)** - UCAN-based decentralized authentication
2. **Keystore (keystore.py)** - Secure storage for API keys and credentials
3. **Integration (auth_keystore_integration.py)** - Connects auth and keystore with capability-based access control

These components work together to ensure:
- Secure access to APIs and third-party services
- Decentralized capability-based security
- Proper access control for sensitive operations

## Process and Threading Model

The security components use an **asynchronous** model with `async/await` for I/O-bound operations like:
- File access
- Token validation
- API key management

For compute-intensive operations in `ipfs_kit_py` and `ipfs_accelerate_py`, we use a **multiprocessing** model:

- Each module runs in its own separate process (not just a thread)
- Communication happens via Apache Arrow IPC (Inter-Process Communication)
- Data is exchanged using shared memory regions for zero-copy transfers
- This approach prevents GIL limitations when processing large datasets

```python
# Example of process-based setup with Arrow IPC
import multiprocessing as mp
import pyarrow as pa
import pyarrow.plasma as plasma
from pyarrow.ipc import RecordBatchStreamWriter

# Create a plasma store for shared memory
plasma_store_socket = "/tmp/plasma"
plasma_client = plasma.connect(plasma_store_socket)

# Process 1: IPFS Kit
def ipfs_kit_process(command_queue, result_queue):
    # Initialize IPFS kit
    ipfs_kit = IPFSKit()
    
    while True:
        # Get command from queue
        cmd = command_queue.get()
        if cmd["type"] == "exit":
            break
            
        # Process command (e.g., fetch data from IPFS)
        data = ipfs_kit.fetch_data(cmd["cid"])
        
        # Store data in plasma store for zero-copy sharing
        object_id = plasma_client.put(data)
        
        # Send reference, not actual data
        result_queue.put({"status": "success", "data_ref": object_id.binary()})

# Process 2: Accelerate ML
def accelerate_process(command_queue, result_queue):
    # Initialize ML models
    model = load_model()
    
    while True:
        # Get command with data reference
        cmd = command_queue.get()
        if cmd["type"] == "exit":
            break
            
        # Get data from plasma store using reference (zero-copy)
        data_ref = plasma.ObjectID(cmd["data_ref"])
        data = plasma_client.get(data_ref)
        
        # Run inference on data without copying
        result = model.infer(data)
        
        # Store result in plasma store
        result_id = plasma_client.put(result)
        
        # Return reference to result
        result_queue.put({"status": "success", "result_ref": result_id.binary()})

# Main process: Coordinate and manage processes
if __name__ == "__main__":
    # Create communication queues
    ipfs_cmd_queue = mp.Queue()
    ipfs_result_queue = mp.Queue()
    accel_cmd_queue = mp.Queue()
    accel_result_queue = mp.Queue()
    
    # Start processes
    ipfs_process = mp.Process(target=ipfs_kit_process, args=(ipfs_cmd_queue, ipfs_result_queue))
    accel_process = mp.Process(target=accelerate_process, args=(accel_cmd_queue, accel_result_queue))
    
    ipfs_process.start()
    accel_process.start()
    
    # Use the processes...
    
    # Cleanup
    ipfs_cmd_queue.put({"type": "exit"})
    accel_cmd_queue.put({"type": "exit"})
    ipfs_process.join()
    accel_process.join()
```

This process-based approach with Apache Arrow IPC is crucial for handling large datasets and compute-intensive ML workloads while maintaining responsiveness.

## Authentication Component (auth.py)

The Authentication component uses User Controlled Authorization Networks (UCAN) for decentralized authentication:

- **Principals**: Entities that can issue or receive capabilities
- **Capabilities**: Permissions to perform specific actions on specific resources
- **Tokens**: Signed proofs of capabilities that can be verified

Key features:
- Support for both real UCAN implementation and mock implementation
- Capability issuance, verification, and revocation
- Delegation of capabilities between principals
- Persistent storage of principals and tokens

## Keystore Component (keystore.py)

The Keystore securely manages API keys and sensitive credentials:

- **Encryption**: AES-256-GCM encryption for all stored keys
- **Key Management**: Store, retrieve, rotate, and delete API keys
- **Expiration**: Support for key expiration
- **Platform Integration**: Optional integration with platform keychain

Features:
- PBKDF2 key derivation with configurable iterations
- Secure in-memory key handling
- Metadata tracking for key usage and rotation
- Access tracking and auto-save functionality

## Integration Component (auth_keystore_integration.py)

The Integration component connects the auth and keystore systems:

- **Capability-Based Access**: Authorization required for key operations
- **Secure API Access**: Get API keys only with proper authorization
- **Capability Management**: Issue key access capabilities to principals

Capabilities defined:
- `key:access`: Ability to retrieve a key
- `key:manage`: Ability to add/remove keys
- `key:rotate`: Ability to update keys
- `key:list`: Ability to list available keys

## Multiprocess Integration

When the security components interact with the multiprocess components:

1. Authentication tokens are passed through the process boundaries
2. Capability verification happens in the security process
3. Data is exchanged using Arrow IPC mechanisms

Example:
```python
# In main process
auth_token = await auth_manager.get_capability_token("model:inference")

# Send command to accelerate process
command = {
    "type": "inference",
    "auth_token": auth_token,
    "data_ref": data_object_id.binary()
}
accel_cmd_queue.put(command)

# In accelerate process
async def process_command(cmd):
    # Verify token has proper capability
    if not await auth_manager.verify_capability(cmd["auth_token"], "model:inference"):
        return {"status": "error", "message": "Unauthorized"}
    
    # Proceed with authorized operation
    # ...
```

## Testing

Each component includes comprehensive test coverage:

- Unit tests for individual functionality
- Integration tests for component interaction
- Test implementations using asyncio for async methods
- Mocked dependencies for isolated testing

## Security Considerations

- Master keys and encryption keys must be properly managed
- UCAN libraries should be used in production (mock is for development only)
- API keys should have proper rotation and expiration policies
- Authentication tokens should be short-lived and scoped to specific capabilities