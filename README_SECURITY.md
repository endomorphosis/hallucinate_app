# hallucinate_app Security Components

This document provides an overview of the security components implemented in the hallucinate_app project, focusing on authentication, keystore, and database synchronization.

## Components Overview

### 1. Authentication System (UCAN-based)

The authentication system uses User Controlled Authorization Networks (UCAN) to provide a decentralized, capability-based security model.

#### Key Features:
- DIDs (Decentralized Identifiers) for principals
- Ed25519 cryptography for secure signatures
- Capability-based security for fine-grained permissions
- Token issuance and verification
- Support for delegation chains
- Self-signed tokens for system operations

#### Implementation Files:
- Python:
  - `hallucinate_app/python/hallucinate_app/auth.py` - Main authentication module
  - `hallucinate_app/python/ucan_auth_py/` - UCAN implementation package
- JavaScript:
  - `hallucinate_app/node/auth.js` - Main authentication module
  - `ucan-auth-js/` - UCAN implementation package

### 2. Keystore System

The keystore system provides secure storage for API keys and credentials with encryption and platform-specific integration.

#### Key Features:
- AES-256-GCM encryption for stored keys
- Integration with platform-specific secure storage (keyring/keytar)
- Key rotation and expiration management
- Usage tracking and statistics
- Fall-back to file-based secure storage when platform storage is unavailable

#### Implementation Files:
- Python:
  - `hallucinate_app/python/hallucinate_app/keystore.py` - Main keystore module
- JavaScript:
  - `hallucinate_app/node/keystore.js` - Main keystore module

### 3. Auth-Keystore Integration

This integration layer combines UCAN authentication with keystore functionality to provide capability-based access control for API keys.

#### Key Features:
- Capability verification for key operations
- Authorized key management (set, get, delete, list)
- Delegation of key access capabilities
- Secure key rotation with authorization

#### Implementation Files:
- Python:
  - `hallucinate_app/python/hallucinate_app/auth_keystore_integration.py` - Integration module
- JavaScript:
  - `hallucinate_app/node/auth_keystore_integration.js` - Integration module

### 4. Database Synchronization

The database sync manager provides bidirectional synchronization between OrbitDB, FireproofDB, and DuckDB-IPLD databases with security controls.

#### Key Features:
- Capability-based access control for sync operations
- Event-driven updates for real-time synchronization
- CRDT-based conflict resolution
- Selective mirroring based on rules
- Differential updates for efficiency
- IPLD export/import for DuckDB for P2P exchange

#### Implementation Files:
- Python:
  - `hallucinate_app/python/hallucinate_app/database_sync_manager.py` - Sync manager module
- JavaScript:
  - `hallucinate_app/node/database_sync_manager.js` - Sync manager module (planned)

### 5. PyArrow Content Index Secure Manager

The PyArrow Content Index Secure Manager provides capability-based security for accessing and manipulating the PyArrow Content Index, which stores metadata about content in the system.

#### Key Features:
- Capability verification for all index operations (read, write, delete, sync, import, export)
- Fine-grained access control for specific resources and operations
- Secure integration with UCAN authentication system
- Comprehensive audit logging and observability metrics
- Security status visualization in dashboard UI
- User-friendly capability management interface

#### Implementation Files:
- Python:
  - `hallucinate_app/python/hallucinate_app/secure_pyarrow_index_manager.py` - Secure manager module
- JavaScript:
  - `hallucinate_app/node/secure_pyarrow_index_manager.js` - Secure manager module
  - `hallucinate_app/node/views/pyarrow_content_index_dashboard.html` - Dashboard UI

## Usage Examples

### Python Examples

#### Using the Keystore

```python
from hallucinate_app.keystore import Keystore

# Create and initialize a keystore
keystore = await Keystore.create({
    'encryption_key': 'your-master-encryption-key',
    'storage_location': '/path/to/keystore',
    'use_platform_storage': True
})

# Store an API key
await keystore.set_key('openai', 'sk-abcdef123456')

# Retrieve an API key
api_key = await keystore.get_key('openai')

# Rotate an API key
await keystore.rotate_key('openai', 'sk-newkey789012')
```

#### Using the Auth Manager

```python
from hallucinate_app.auth import AuthManager

# Create and initialize an auth manager
auth_manager = AuthManager()
await auth_manager.init()

# Create a principal
await auth_manager.create_principal('user123')

# Issue a capability token
token_data = await auth_manager.issue_capability('root', 'user123', {
    'can': 'read',
    'with': 'document:123'
})

# Verify a capability
is_authorized = await auth_manager.verify_capability(token_data['token'], 'read:document:123')
```

#### Using the Auth-Keystore Integration

```python
from hallucinate_app.auth import AuthManager
from hallucinate_app.keystore import Keystore
from hallucinate_app.auth_keystore_integration import AuthKeystoreIntegration

# Create and initialize components
auth_manager = AuthManager()
await auth_manager.init()

keystore = await Keystore.create({'encryption_key': 'master-key'})

# Create integration
integration = AuthKeystoreIntegration({
    'auth': auth_manager,
    'keystore': keystore
})
await integration.init()

# Issue capability for key management
admin_token = await auth_manager.issue_capability('root', 'admin', {
    'can': integration.CAPABILITIES['KEY_MANAGE'],
    'with': '*'
})

# Set a key with authorization
await integration.set_authorized_key('openai', 'sk-abcdef123456', admin_token['token'])

# Issue capability for key access
access_token = await auth_manager.issue_capability('root', 'user', {
    'can': integration.CAPABILITIES['KEY_ACCESS'],
    'with': 'openai'
})

# Get a key with authorization
api_key = await integration.get_authorized_key('openai', access_token['token'])
```

### JavaScript Examples

#### Using the Keystore

```javascript
import { Keystore } from './hallucinate_app/node/keystore.js';

// Create and initialize a keystore
const keystore = await Keystore.create({
  encryption_key: 'your-master-encryption-key',
  storage_location: '/path/to/keystore',
  use_platform_storage: true
});

// Store an API key
await keystore.setKey('openai', 'sk-abcdef123456');

// Retrieve an API key
const apiKey = await keystore.getKey('openai');

// Rotate an API key
await keystore.rotateKey('openai', 'sk-newkey789012');
```

#### Using the Auth Manager

```javascript
import { AuthManager } from './hallucinate_app/node/auth.js';

// Create and initialize an auth manager
const authManager = new AuthManager();
await authManager.init();

// Create a principal
await authManager.createPrincipal('user123');

// Issue a capability token
const tokenData = await authManager.issueCapability('root', 'user123', {
  can: 'read',
  with: 'document:123'
});

// Verify a capability
const isAuthorized = await authManager.verifyCapability(tokenData.token, 'read:document:123');
```

#### Using the Auth-Keystore Integration

```javascript
import { AuthManager } from './hallucinate_app/node/auth.js';
import { Keystore } from './hallucinate_app/node/keystore.js';
import { AuthKeystoreIntegration } from './hallucinate_app/node/auth_keystore_integration.js';

// Create and initialize components
const authManager = new AuthManager();
await authManager.init();

const keystore = await Keystore.create({encryption_key: 'master-key'});

// Create integration
const integration = new AuthKeystoreIntegration({
  auth: authManager,
  keystore: keystore
});
await integration.init();

// Issue capability for key management
const adminToken = await authManager.issueCapability('root', 'admin', {
  can: integration.CAPABILITIES.KEY_MANAGE,
  with: '*'
});

// Set a key with authorization
await integration.setAuthorizedKey('openai', 'sk-abcdef123456', adminToken.token);

// Issue capability for key access
const accessToken = await authManager.issueCapability('root', 'user', {
  can: integration.CAPABILITIES.KEY_ACCESS,
  with: 'openai'
});

// Get a key with authorization
const apiKey = await integration.getAuthorizedKey('openai', accessToken.token);
```

#### Using the Database Sync Manager

```python
from hallucinate_app.database_sync_manager import DatabaseSyncManager, SYNC_CAPABILITIES

# Create and initialize the sync manager with resources
sync_manager = DatabaseSyncManager(resources={
    'orbitDb': orbit_db,
    'fireproofDb': fireproof_db,
    'duckDb': duck_db,
    'authManager': auth_manager,
    'ipfsKit': ipfs_kit,
    'libp2pKit': libp2p_kit
})
await sync_manager.init()

# Get admin capability token
admin_token = auth_manager.get_self_signed_token(SYNC_CAPABILITIES['SYNC_ADMIN'])

# Synchronize OrbitDB to FireproofDB
result = await sync_manager.sync_orbitdb_to_fireproofdb(auth_token=admin_token)

# Export DuckDB tables to IPLD
export_result = await sync_manager.export_duckdb_to_ipld(
    auth_token=admin_token,
    tables=['analytics', 'metrics'],
    differential=True
)
```

#### Using the PyArrow Content Index Secure Manager

```python
from hallucinate_app.secure_pyarrow_index_manager import SecurePyArrowIndexManager, PYARROW_INDEX_CAPABILITIES

# Create and initialize the secure manager with resources
secure_manager = SecurePyArrowIndexManager(resources={
    'auth': auth_manager,
    'pythonBridge': python_bridge
}, metadata={
    'indexPath': '/path/to/content_index.arrow',
    'useArrow': True
})
await secure_manager.init()

# Get read capability token
read_token = auth_manager.get_self_signed_token(PYARROW_INDEX_CAPABILITIES['READ'])

# Look up content by CID with capability verification
content = await secure_manager.lookupByCid('Qmabcdef123456789', read_token)

# Get write capability token
write_token = auth_manager.get_self_signed_token(PYARROW_INDEX_CAPABILITIES['WRITE'])

# Add a new entry with capability verification
result = await secure_manager.addEntry({
    'cid': 'Qmnewentry123456',
    'path': '/datasets/new_data.parquet',
    'mimetype': 'application/octet-stream',
    'size': 1024,
    'metadata': {
        'description': 'Example dataset',
        'tags': ['dataset', 'example']
    }
}, write_token)

# Get security status
status = secure_manager.getSecurityStatus()
```

#### Using the PyArrow Content Index Secure Manager (JavaScript)

```javascript
import { SecurePyArrowIndexManager, PYARROW_INDEX_CAPABILITIES } from './hallucinate_app/node/secure_pyarrow_index_manager.js';
import authManager from './hallucinate_app/node/auth.js';

// Create and initialize the secure manager with resources
const secureManager = new SecurePyArrowIndexManager({
  auth: authManager,
  pythonBridge: pythonBridge
}, {
  indexPath: '/path/to/content_index.arrow',
  useArrow: true,
  observabilityOptions: {
    namespace: 'pyarrow_index',
    subsystem: 'secure_manager'
  }
});
await secureManager.init();

// Get read capability token
const readToken = await authManager.getCapabilityToken(PYARROW_INDEX_CAPABILITIES.READ);

// Look up content by CID with capability verification
const content = await secureManager.lookupByCid('Qmabcdef123456789', readToken);

// Get write capability token
const writeToken = await authManager.getCapabilityToken(PYARROW_INDEX_CAPABILITIES.WRITE);

// Add a new entry with capability verification
const result = await secureManager.addEntry({
  cid: 'Qmnewentry123456',
  path: '/datasets/new_data.parquet',
  mimetype: 'application/octet-stream',
  size: 1024,
  metadata: {
    description: 'Example dataset',
    tags: ['dataset', 'example']
  }
}, writeToken);

// Get statistics about a specific capability
const statsResult = await secureManager.getStats(await authManager.getCapabilityToken(PYARROW_INDEX_CAPABILITIES.ADMIN));

// Get security status (no token required)
const securityStatus = secureManager.getSecurityStatus();
```

## Testing

Each component includes comprehensive tests:

### Python Tests
- `hallucinate_app/python/hallucinate_app/test/test_keystore.py` - Tests for the keystore module
- `hallucinate_app/python/hallucinate_app/test/test_auth.py` - Tests for the auth module
- `hallucinate_app/python/hallucinate_app/test/test_auth_keystore_integration.py` - Tests for the integration module
- `hallucinate_app/python/hallucinate_app/test/test_database_sync_manager.py` - Tests for the sync manager

To run the Python tests:
```bash
cd hallucinate_app/python
python -m unittest discover -s hallucinate_app/test
```

### JavaScript Tests
- `test/js/test_keystore.js` - Tests for the keystore module
- `test/js/test_auth.js` - Tests for the auth module
- `test/js/test_auth_keystore_integration.js` - Tests for the integration module
- `test/js/test_pyarrow_index_bridge.js` - Tests for the PyArrow Content Index bridge
- `test/js/test_secure_pyarrow_index_manager.js` - Tests for the PyArrow Content Index secure manager

To run the JavaScript tests:
```bash
npm run test:js
```

### Security Dashboard Tests
- Access the security dashboard through the application menu
- Test capability management by requesting capabilities and verifying they are granted
- Run security tests from the dashboard UI to validate secure manager functionality
- Monitor access control metrics to ensure proper capability verification

## Security Best Practices

1. **Master Keys**: Store the master encryption key securely and never hard-code it in your application.
2. **Capability Delegation**: Only delegate capabilities that are strictly necessary.
3. **Key Rotation**: Regularly rotate API keys, especially for sensitive services.
4. **Expiration**: Set appropriate expiration times for both capabilities and API keys.
5. **Platform Storage**: Use platform-specific secure storage when available.
6. **Audit Logging**: Enable logging for security-critical operations.
7. **Selective Mirroring**: Use selective mirroring rules to prevent synchronizing sensitive data.
8. **Cross-Platform Consistency**: Ensure that security policies are consistently enforced in both Python and JavaScript implementations.

## Implementation Status

| Component | Python | JavaScript |
|-----------|--------|------------|
| Auth System | ✅ | ✅ |
| Keystore | ✅ | ✅ |
| Auth-Keystore Integration | ✅ | ✅ |
| Database Sync Manager | ✅ | 🔄 (In Progress) |
| PyArrow Content Index Secure Manager | ✅ | ✅ |

## Future Enhancements

1. ✅ **JavaScript Counterparts**: Implement JavaScript versions of these security modules for the Electron app.
   - ✅ `auth.js`: Complete UCAN-based authentication system
   - ✅ `keystore.js`: Secure credential storage with encryption and platform integration
   - ✅ `auth_keystore_integration.js`: Capability-based access control for API keys
2. ✅ **Security Dashboard**: Create a UI for monitoring key usage, capability delegations, and security status.
   - ✅ PyArrow Content Index Security UI: Capability management and security status visualization
   - ✅ Security test dashboard: Visual interface for running and analyzing security tests
3. **Enhanced Intrusion Detection**: Add detection for unusual access patterns.
4. **Additional Storage Backends**: Support more secure storage backends.
5. **Hardware Security Integration**: Add support for hardware security modules.
6. **Encrypted P2P Communication**: Implement end-to-end encrypted communication for P2P database exchange.
7. **Selective Database Synchronization**: Implement capability-based rules for selective data synchronization.
8. **Audit Trail**: Implement comprehensive logging for security events across the application.