# UCAN Auth Python Library

This package provides a Python implementation of the UCAN (User Controlled Authorization Networks) protocol specification. It enables decentralized, capability-based security for applications.

## Features

- **DIDs (Decentralized Identifiers)**: Create and resolve DIDs for principals
- **Ed25519 Cryptography**: Secure key generation and signature verification
- **Capability-based Security**: Define fine-grained permissions
- **Token Issuance and Verification**: Create and validate capability tokens
- **Delegation Chains**: Support for capability delegation between principals
- **Storage Management**: Persistent storage of keys, tokens, and delegations

## Components

- **Principal**: Represents an entity that can issue or receive capabilities
- **Capability**: Defines a permission to perform an action on a resource
- **Token**: Contains capabilities granted by an issuer to an audience
- **AuthManager**: High-level API for managing authentication

## Example Usage

```python
from ucan_auth_py import AuthManager
from ucan_auth_py.core import Principal, Capability, Token

# Initialize auth manager
auth_manager = AuthManager()
await auth_manager.init()

# Create principals
root = await auth_manager.create_root_principal()
user = await auth_manager.create_principal("user")

# Issue capabilities
capability = {
    "can": "read",
    "with": "document:1",
    "limits": {"max_size": 1024}
}
token_data = await auth_manager.issue_capability("root", "user", capability)

# Get a capability token
token = await auth_manager.get_capability_token("read:document:1")

# Verify a capability
verified = await auth_manager.verify_capability(token, "read:document:1")
```

## Integration

This library is designed to integrate with the hallucinate_app ecosystem but can be used independently. It provides mock implementations for development and can be used with real UCAN libraries for production.

## Development Status

This package is currently in development and is a simplified implementation of the UCAN protocol for educational and development purposes. For production usage, additional features and security measures would be required.