# PyArrow Content Index Security Capabilities

## Overview

The PyArrow Content Index Dashboard implements a comprehensive security model based on UCAN (User Controlled Authorization Networks) for fine-grained access control. This document outlines the security architecture, capability model, implementation details, and best practices for secure operations.

## UCAN-based Security Model

### Core Concepts

1. **UCAN (User Controlled Authorization Networks)**:
   - Decentralized authentication and authorization
   - Capability-based security with delegated permissions
   - Cryptographically verifiable capability chains
   - Self-contained tokens with proof of authorization

2. **Capabilities**:
   - Discrete permissions representing what actions can be performed
   - Hierarchical structure with inheritance
   - Resource-scoped permissions for fine-grained control
   - Delegatable from one principal to another

3. **Principals**:
   - Entities with cryptographic identities (DIDs)
   - Can issue and verify capabilities
   - Can delegate capabilities to other principals
   - Can act as both issuers and recipients

4. **Resources**:
   - Targets of capabilities (content paths, CIDs, etc.)
   - Can be specified with exact paths or patterns
   - Support hierarchical structure (parent paths grant access to children)
   - Can include metadata requirements for conditional access

## Capability Hierarchy

The PyArrow Content Index implements a structured capability hierarchy:

```
pyarrow:index:admin
  ├─ pyarrow:index:write
  │    └─ pyarrow:index:read
  ├─ pyarrow:index:metadata:write
  │    └─ pyarrow:index:metadata:read
  └─ pyarrow:index:config:write
       └─ pyarrow:index:config:read
```

### Capability Definitions

1. **pyarrow:index:read**
   - Basic read access to content in the index
   - Can retrieve content metadata and perform queries
   - Required for all read operations on indexed content
   - Can be scoped to specific content paths or CIDs

2. **pyarrow:index:write**
   - Allows adding, updating, or removing content from the index
   - Includes all read capabilities
   - Required for modifying indexed content
   - Can be scoped to specific content paths

3. **pyarrow:index:admin**
   - Full administrative control over the index
   - Includes all read and write capabilities
   - Can manage index configuration and maintenance
   - Can delegate capabilities to other principals
   - Typically not scoped to specific resources

4. **pyarrow:index:metadata:read**
   - Can read metadata associated with content
   - More limited than full read capability
   - Can be granted for metadata-only access
   - Often used for search and discovery without content access

5. **pyarrow:index:metadata:write**
   - Can modify metadata associated with content
   - Does not include ability to modify content itself
   - Used for tagging, categorization, and organization
   - Includes metadata read capability

6. **pyarrow:index:config:read**
   - Can view index configuration settings
   - Does not allow modification of configuration
   - Used for monitoring and reporting
   - Often granted to monitoring systems

7. **pyarrow:index:config:write**
   - Can modify index configuration settings
   - Includes configuration read capability
   - Used for index tuning and optimization
   - Typically restricted to administrators

### Resource Scoping

Capabilities can be scoped to specific resources:

1. **Path-based Scoping**:
   ```javascript
   // Grant read access only to content in the datasets directory
   {
     capability: 'pyarrow:index:read',
     resource: {
       path: '/datasets'
     }
   }
   ```

2. **CID-based Scoping**:
   ```javascript
   // Grant write access only to a specific content item
   {
     capability: 'pyarrow:index:write',
     resource: {
       cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
     }
   }
   ```

3. **Pattern-based Scoping**:
   ```javascript
   // Grant read access to all PDF files
   {
     capability: 'pyarrow:index:read',
     resource: {
       pattern: '**/*.pdf'
     }
   }
   ```

4. **Type-based Scoping**:
   ```javascript
   // Grant read access to all image files
   {
     capability: 'pyarrow:index:read',
     resource: {
       mimeTypePattern: 'image/*'
     }
   }
   ```

## Implementation Architecture

The security implementation consists of several integrated components:

### 1. UCAN Manager

Responsible for UCAN token issuance, verification, and management:

```javascript
/**
 * UCAN Manager for PyArrow Content Index
 * @class UCANManager
 */
class UCANManager {
  /**
   * Create a new UCAN Manager
   * @param {Object} options - Configuration options
   * @param {KeyManager} options.keyManager - Key manager for cryptographic operations
   * @param {Storage} options.storage - Storage for UCAN tokens
   */
  constructor(options = {}) {
    this.keyManager = options.keyManager;
    this.storage = options.storage;
    this.principals = new Map();
    this.capabilities = new Map();
  }
  
  /**
   * Issue a new capability token
   * @param {string} capability - The capability to grant
   * @param {Object} resource - The resource to scope the capability to
   * @param {string} audience - The recipient DID
   * @param {number} expiration - Expiration time in seconds
   * @returns {Promise<string>} The UCAN token
   */
  async issueCapability(capability, resource, audience, expiration) {
    // Implementation
  }
  
  /**
   * Verify a capability token
   * @param {string} token - The UCAN token
   * @param {string} capability - The capability to verify
   * @param {Object} resource - The resource to verify against
   * @returns {Promise<boolean>} Whether the token grants the capability
   */
  async verifyCapability(token, capability, resource) {
    // Implementation
  }
  
  /**
   * Delegate a capability to another principal
   * @param {string} fromToken - The source token
   * @param {string} capability - The capability to delegate
   * @param {Object} resource - The resource to scope the capability to
   * @param {string} audience - The recipient DID
   * @returns {Promise<string>} The delegated UCAN token
   */
  async delegateCapability(fromToken, capability, resource, audience) {
    // Implementation
  }
  
  /**
   * Revoke a capability token
   * @param {string} token - The UCAN token to revoke
   * @returns {Promise<boolean>} Whether revocation was successful
   */
  async revokeCapability(token) {
    // Implementation
  }
}
```

### 2. Secure PyArrow Index Manager

Implements capability verification for all index operations:

```javascript
/**
 * Secure PyArrow Index Manager
 * @class SecurePyArrowIndexManager
 */
class SecurePyArrowIndexManager {
  /**
   * Create a new Secure PyArrow Index Manager
   * @param {Object} options - Configuration options
   * @param {PyArrowIndex} options.index - The underlying PyArrow index
   * @param {UCANManager} options.ucanManager - UCAN manager for capability verification
   */
  constructor(options = {}) {
    this.index = options.index;
    this.ucanManager = options.ucanManager;
  }
  
  /**
   * Get content by CID with capability verification
   * @param {string} cid - The content identifier
   * @param {string} token - The UCAN token
   * @returns {Promise<Object>} The content data
   * @throws {SecurityError} If capability verification fails
   */
  async getContent(cid, token) {
    // Verify capability
    const hasCapability = await this.ucanManager.verifyCapability(
      token,
      'pyarrow:index:read',
      { cid }
    );
    
    if (!hasCapability) {
      throw new SecurityError('Unauthorized: Missing read capability for this content');
    }
    
    // Proceed with operation
    return this.index.getContent(cid);
  }
  
  /**
   * Add content to the index with capability verification
   * @param {Object} content - The content to add
   * @param {string} token - The UCAN token
   * @returns {Promise<string>} The content CID
   * @throws {SecurityError} If capability verification fails
   */
  async addContent(content, token) {
    // Verify capability
    const hasCapability = await this.ucanManager.verifyCapability(
      token,
      'pyarrow:index:write',
      { path: content.path }
    );
    
    if (!hasCapability) {
      throw new SecurityError('Unauthorized: Missing write capability for this path');
    }
    
    // Proceed with operation
    return this.index.addContent(content);
  }
  
  // Other secured operations...
}
```

### 3. Security Dashboard Component

Provides UI for managing security capabilities:

```javascript
/**
 * Security Dashboard Component
 * @class SecurityDashboard
 */
class SecurityDashboard {
  /**
   * Create a new Security Dashboard
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.container - Container element
   * @param {UCANManager} options.ucanManager - UCAN manager
   * @param {EventBus} options.eventBus - Event bus for communication
   */
  constructor(options = {}) {
    this.container = options.container;
    this.ucanManager = options.ucanManager;
    this.eventBus = options.eventBus;
  }
  
  /**
   * Initialize the security dashboard
   * @returns {Promise<void>}
   */
  async init() {
    // Create UI components
    this._createComponents();
    
    // Set up event listeners
    this._setupEventListeners();
    
    // Load initial data
    await this._loadData();
  }
  
  /**
   * Create a new capability token
   * @param {string} capability - The capability to grant
   * @param {Object} resource - The resource to scope to
   * @param {string} recipientDid - The recipient DID
   * @returns {Promise<string>} The UCAN token
   */
  async createCapability(capability, resource, recipientDid) {
    // Implementation
  }
  
  /**
   * Render the principals list
   * @param {Array<Object>} principals - List of principals
   * @returns {void}
   */
  _renderPrincipals(principals) {
    // Implementation
  }
  
  /**
   * Render the capabilities list
   * @param {Array<Object>} capabilities - List of capabilities
   * @returns {void}
   */
  _renderCapabilities(capabilities) {
    // Implementation
  }
  
  /**
   * Display capability details
   * @param {string} token - The UCAN token
   * @returns {Promise<void>}
   */
  async _showCapabilityDetails(token) {
    // Implementation
  }
  
  /**
   * Dispose and clean up resources
   * @returns {Promise<void>}
   */
  async dispose() {
    // Implementation
  }
}
```

## Security Flow Diagrams

### Authentication Flow

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│            │     │            │     │            │     │            │
│   Client   │─────│  Auth UI   │─────│ UCAN Mgr   │─────│ Key Store  │
│            │     │            │     │            │     │            │
└────────────┘     └────────────┘     └────────────┘     └────────────┘
       │                 │                  │                  │
       │  1. Request     │                  │                  │
       │  Authentication │                  │                  │
       │────────────────>│                  │                  │
       │                 │  2. Generate     │                  │
       │                 │  Keys (if new)   │                  │
       │                 │─────────────────>│                  │
       │                 │                  │  3. Store Keys   │
       │                 │                  │─────────────────>│
       │                 │                  │<─────────────────│
       │                 │                  │  4. Create       │
       │                 │                  │  Root Token      │
       │                 │<─────────────────│                  │
       │  5. Return      │                  │                  │
       │  UCAN Token     │                  │                  │
       │<────────────────│                  │                  │
       │                 │                  │                  │
```

### Authorization Flow

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│            │     │            │     │            │
│   Client   │─────│ Secure Mgr │─────│ UCAN Mgr   │
│            │     │            │     │            │
└────────────┘     └────────────┘     └────────────┘
       │                 │                  │
       │  1. Request     │                  │
       │  with Token     │                  │
       │────────────────>│                  │
       │                 │  2. Verify       │
       │                 │  Capability      │
       │                 │─────────────────>│
       │                 │                  │
       │                 │  3. Verify       │
       │                 │  Token Chain     │
       │                 │<─────────────────│
       │                 │                  │
       │  4. Response    │                  │
       │  or Error       │                  │
       │<────────────────│                  │
       │                 │                  │
```

### Capability Delegation Flow

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│            │     │            │     │            │     │            │
│  Admin UI  │─────│ Security   │─────│ UCAN Mgr   │─────│ Recipient  │
│            │     │ Dashboard  │     │            │     │            │
└────────────┘     └────────────┘     └────────────┘     └────────────┘
       │                 │                  │                  │
       │  1. Delegate    │                  │                  │
       │  Capability     │                  │                  │
       │────────────────>│                  │                  │
       │                 │  2. Request      │                  │
       │                 │  Delegation      │                  │
       │                 │─────────────────>│                  │
       │                 │                  │  3. Create       │
       │                 │                  │  Derived Token   │
       │                 │                  │─────────────────>│
       │                 │                  │<─────────────────│
       │                 │                  │  4. Confirm      │
       │                 │<─────────────────│  Delegation      │
       │  5. Delegation  │                  │                  │
       │  Complete       │                  │                  │
       │<────────────────│                  │                  │
       │                 │                  │                  │
```

## Security Dashboard UI

The Security Dashboard provides a user interface for managing capabilities:

### 1. Principals Management

The Principals tab shows all known principals and their basic information:

```html
<div class="security-tab" id="tab-principals">
  <div class="toolbar">
    <button id="btn-add-principal">Add Principal</button>
    <button id="btn-import-principal">Import</button>
    <input type="text" id="principal-search" placeholder="Search principals...">
  </div>
  
  <table class="principals-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>DID</th>
        <th>Type</th>
        <th>Created</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="principals-list">
      <!-- Principal rows inserted here -->
    </tbody>
  </table>
  
  <div id="principal-details" class="details-panel">
    <!-- Principal details shown here -->
  </div>
</div>
```

### 2. Capabilities Management

The Capabilities tab shows all issued capabilities:

```html
<div class="security-tab" id="tab-capabilities">
  <div class="toolbar">
    <button id="btn-create-capability">Create Capability</button>
    <button id="btn-revoke-selected">Revoke Selected</button>
    <select id="capability-filter">
      <option value="">All Capabilities</option>
      <option value="pyarrow:index:read">Read</option>
      <option value="pyarrow:index:write">Write</option>
      <option value="pyarrow:index:admin">Admin</option>
    </select>
  </div>
  
  <table class="capabilities-table">
    <thead>
      <tr>
        <th><input type="checkbox" id="select-all-capabilities"></th>
        <th>Capability</th>
        <th>Resource</th>
        <th>Issuer</th>
        <th>Recipient</th>
        <th>Expiration</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="capabilities-list">
      <!-- Capability rows inserted here -->
    </tbody>
  </table>
  
  <div id="capability-details" class="details-panel">
    <!-- Capability details shown here -->
  </div>
</div>
```

### 3. Create Capability Dialog

Dialog for creating new capabilities:

```html
<div id="create-capability-dialog" class="dialog">
  <div class="dialog-header">
    <h3>Create New Capability</h3>
    <button class="close-button">&times;</button>
  </div>
  
  <div class="dialog-body">
    <form id="create-capability-form">
      <div class="form-group">
        <label for="capability-type">Capability Type</label>
        <select id="capability-type" required>
          <option value="pyarrow:index:read">Read Access</option>
          <option value="pyarrow:index:write">Write Access</option>
          <option value="pyarrow:index:admin">Admin Access</option>
          <option value="pyarrow:index:metadata:read">Metadata Read</option>
          <option value="pyarrow:index:metadata:write">Metadata Write</option>
        </select>
      </div>
      
      <div class="form-group">
        <label for="resource-type">Resource Type</label>
        <select id="resource-type">
          <option value="path">Path</option>
          <option value="cid">Content ID</option>
          <option value="pattern">Pattern</option>
          <option value="mimeType">MIME Type</option>
        </select>
      </div>
      
      <div class="form-group">
        <label for="resource-value">Resource Value</label>
        <input type="text" id="resource-value" placeholder="/path/to/resource">
      </div>
      
      <div class="form-group">
        <label for="recipient-did">Recipient DID</label>
        <input type="text" id="recipient-did" required placeholder="did:key:...">
        <button type="button" id="select-recipient">Select</button>
      </div>
      
      <div class="form-group">
        <label for="expiration">Expiration (days)</label>
        <input type="number" id="expiration" min="1" max="365" value="30">
      </div>
    </form>
  </div>
  
  <div class="dialog-footer">
    <button type="button" id="btn-cancel-capability">Cancel</button>
    <button type="button" id="btn-create-capability-confirm">Create</button>
  </div>
</div>
```

### 4. Capability Details View

Detailed view of a capability token:

```html
<div class="capability-detail-view">
  <div class="token-header">
    <h4>Capability Token</h4>
    <div class="token-actions">
      <button class="btn-copy-token">Copy Token</button>
      <button class="btn-revoke-token">Revoke</button>
    </div>
  </div>
  
  <div class="token-sections">
    <div class="token-section">
      <h5>Basic Information</h5>
      <table class="token-info">
        <tr>
          <th>Capability:</th>
          <td><span class="capability-badge">pyarrow:index:read</span></td>
        </tr>
        <tr>
          <th>Issuer:</th>
          <td>did:key:z6MkgYrkCkqA...</td>
        </tr>
        <tr>
          <th>Audience:</th>
          <td>did:key:z6MkhGtFL9DX...</td>
        </tr>
        <tr>
          <th>Issued:</th>
          <td>2025-04-02T15:23:17Z</td>
        </tr>
        <tr>
          <th>Expires:</th>
          <td>2025-05-02T15:23:17Z</td>
        </tr>
      </table>
    </div>
    
    <div class="token-section">
      <h5>Resource Scope</h5>
      <table class="token-info">
        <tr>
          <th>Type:</th>
          <td>Path</td>
        </tr>
        <tr>
          <th>Value:</th>
          <td>/datasets/public</td>
        </tr>
        <tr>
          <th>Inherited:</th>
          <td>No</td>
        </tr>
      </table>
    </div>
    
    <div class="token-section">
      <h5>Proof Chain</h5>
      <div class="proof-chain">
        <!-- Visualization of delegation chain -->
      </div>
    </div>
  </div>
  
  <div class="token-raw">
    <h5>Raw Token</h5>
    <pre><code>{...}</code></pre>
  </div>
</div>
```

## Security Implementation Best Practices

### 1. Capability Verification

Always verify capabilities before performing operations:

```javascript
/**
 * Example capability verification pattern
 */
async function performProtectedOperation(params, token) {
  try {
    // 1. Extract the required capability and resource
    const capability = 'pyarrow:index:write';
    const resource = { path: params.path };
    
    // 2. Verify the capability
    const hasCapability = await ucanManager.verifyCapability(
      token,
      capability,
      resource
    );
    
    // 3. Handle verification result
    if (!hasCapability) {
      throw new SecurityError(
        `Unauthorized: Missing capability ${capability} for resource ${params.path}`
      );
    }
    
    // 4. Proceed with operation
    return await actualOperation(params);
    
  } catch (error) {
    // 5. Handle and log security errors
    if (error instanceof SecurityError) {
      logger.warn('Security violation', {
        operation: 'performProtectedOperation',
        error: error.message,
        resource: params.path
      });
    }
    throw error;
  }
}
```

### 2. Secure Dashboard Integration

Integrate security components with the dashboard:

```javascript
/**
 * Initialize security dashboard
 */
function initializeSecurityDashboard() {
  // Create the security dashboard component
  const securityDashboard = new SecurityDashboard({
    container: document.getElementById('security-container'),
    ucanManager: ucanManager,
    eventBus: globalEventBus
  });
  
  // Initialize the dashboard
  securityDashboard.init()
    .then(() => {
      console.log('Security dashboard initialized');
    })
    .catch(error => {
      console.error('Failed to initialize security dashboard', error);
    });
  
  // Set up event listeners for integration with main dashboard
  globalEventBus.on('content-selected', async (content) => {
    // Update security panel with content-specific information
    await securityDashboard.showResourceCapabilities(content.cid);
  });
  
  globalEventBus.on('principal-selected', async (principal) => {
    // Update security panel with principal-specific information
    await securityDashboard.showPrincipalCapabilities(principal.did);
  });
  
  return securityDashboard;
}
```

### 3. Error Handling for Security

Implement proper error handling for security issues:

```javascript
/**
 * SecurityError class
 */
class SecurityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SecurityError';
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
  
  // Allow conversion to JSON for logging
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

/**
 * Security error handler
 */
function handleSecurityError(error, ui) {
  if (error instanceof SecurityError) {
    // Log the security violation
    logger.warn('Security violation', error.toJSON());
    
    // Update UI
    ui.showError('Access Denied', error.message);
    
    // Optionally track security incidents
    metrics.incrementCounter('security_violations', {
      operation: error.details.operation,
      resource_type: error.details.resourceType
    });
    
    return true; // Error was handled
  }
  return false; // Not a security error
}
```

### 4. Token Management and Storage

Securely manage UCAN tokens:

```javascript
/**
 * UCAN Token Storage
 */
class UCANTokenStorage {
  constructor(options = {}) {
    this.storage = options.persistentStorage || localStorage;
    this.namespace = options.namespace || 'ucan_tokens';
    this.encryptionKey = options.encryptionKey;
  }
  
  /**
   * Store a token
   * @param {string} id - Token identifier
   * @param {string} token - UCAN token
   * @returns {Promise<void>}
   */
  async storeToken(id, token) {
    // Optionally encrypt the token for storage
    const storedValue = this.encryptionKey
      ? await this._encrypt(token)
      : token;
      
    // Store with metadata
    const entry = {
      token: storedValue,
      stored_at: new Date().toISOString(),
      encrypted: !!this.encryptionKey
    };
    
    // Save to storage
    this.storage.setItem(
      `${this.namespace}_${id}`,
      JSON.stringify(entry)
    );
  }
  
  /**
   * Retrieve a token
   * @param {string} id - Token identifier
   * @returns {Promise<string>} The UCAN token
   */
  async retrieveToken(id) {
    const item = this.storage.getItem(`${this.namespace}_${id}`);
    if (!item) return null;
    
    const entry = JSON.parse(item);
    
    // Decrypt if needed
    if (entry.encrypted) {
      return await this._decrypt(entry.token);
    }
    
    return entry.token;
  }
  
  /**
   * List all stored tokens
   * @returns {Promise<Array<Object>>} List of token entries
   */
  async listTokens() {
    const tokens = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key.startsWith(this.namespace)) {
        const id = key.substring(this.namespace.length + 1);
        const item = JSON.parse(this.storage.getItem(key));
        tokens.push({
          id,
          stored_at: item.stored_at,
          encrypted: item.encrypted
        });
      }
    }
    return tokens;
  }
  
  /**
   * Remove a token
   * @param {string} id - Token identifier
   * @returns {Promise<boolean>} Whether the token was removed
   */
  async removeToken(id) {
    const key = `${this.namespace}_${id}`;
    if (this.storage.getItem(key)) {
      this.storage.removeItem(key);
      return true;
    }
    return false;
  }
  
  // Private encryption methods
  async _encrypt(data) {
    // Implementation details depend on encryption library
  }
  
  async _decrypt(data) {
    // Implementation details depend on encryption library
  }
}
```

### 5. Security Monitoring and Metrics

Implement comprehensive security monitoring:

```javascript
/**
 * Security metrics collector
 */
class SecurityMetrics {
  constructor(options = {}) {
    this.metricsCollector = options.metricsCollector;
    this.prefix = options.prefix || 'security';
  }
  
  /**
   * Track capability verification
   * @param {string} capability - The capability being verified
   * @param {boolean} success - Whether verification succeeded
   * @param {Object} context - Additional context
   */
  trackVerification(capability, success, context = {}) {
    // Track verification attempt
    this.metricsCollector.incrementCounter(`${this.prefix}_verification_attempts`, {
      capability,
      result: success ? 'success' : 'failure',
      ...context
    });
    
    // Track verification timing
    if (context.duration) {
      this.metricsCollector.recordHistogram(
        `${this.prefix}_verification_duration`,
        context.duration,
        {
          capability,
          result: success ? 'success' : 'failure'
        }
      );
    }
  }
  
  /**
   * Track token operations
   * @param {string} operation - Token operation (create, verify, revoke)
   * @param {boolean} success - Whether operation succeeded
   * @param {Object} context - Additional context
   */
  trackTokenOperation(operation, success, context = {}) {
    this.metricsCollector.incrementCounter(`${this.prefix}_token_operations`, {
      operation,
      result: success ? 'success' : 'failure',
      ...context
    });
  }
  
  /**
   * Track security violations
   * @param {string} type - Violation type
   * @param {Object} context - Additional context
   */
  trackViolation(type, context = {}) {
    this.metricsCollector.incrementCounter(`${this.prefix}_violations`, {
      violation_type: type,
      ...context
    });
  }
  
  /**
   * Get current security status metrics
   * @returns {Object} Security metrics
   */
  getSecurityStatus() {
    return {
      active_principals: this.metricsCollector.getGauge(`${this.prefix}_active_principals`),
      active_capabilities: this.metricsCollector.getGauge(`${this.prefix}_active_capabilities`),
      verification_success_rate: this.metricsCollector.getSummary(`${this.prefix}_verification_success_rate`),
      violation_count: this.metricsCollector.getCounter(`${this.prefix}_violations_total`)
    };
  }
}
```

## Security Testing

The PyArrow Content Index security implementation includes comprehensive tests:

### 1. Capability Verification Tests

```javascript
/**
 * Test capability verification
 */
describe('Capability Verification', () => {
  let ucanManager;
  let securePyArrowIndex;
  let rootToken;
  
  beforeEach(async () => {
    // Set up test environment
    ucanManager = new UCANManager({ useMockImplementation: true });
    await ucanManager.init();
    
    // Create root token with admin capability
    rootToken = await ucanManager.issueCapability(
      'pyarrow:index:admin',
      {},
      'did:key:test-recipient',
      3600 // 1 hour expiration
    );
    
    // Initialize secure manager
    securePyArrowIndex = new SecurePyArrowIndexManager({
      index: new MockPyArrowIndex(),
      ucanManager
    });
  });
  
  it('should verify admin capability correctly', async () => {
    // Admin capability should grant all capabilities
    expect(await ucanManager.verifyCapability(
      rootToken,
      'pyarrow:index:read',
      { path: '/any/path' }
    )).toBe(true);
    
    expect(await ucanManager.verifyCapability(
      rootToken,
      'pyarrow:index:write',
      { path: '/any/path' }
    )).toBe(true);
  });
  
  it('should verify resource-specific capabilities', async () => {
    // Create token with specific path
    const pathToken = await ucanManager.issueCapability(
      'pyarrow:index:read',
      { path: '/public' },
      'did:key:test-recipient',
      3600
    );
    
    // Should allow access to the specified path
    expect(await ucanManager.verifyCapability(
      pathToken,
      'pyarrow:index:read',
      { path: '/public' }
    )).toBe(true);
    
    // Should allow access to child paths
    expect(await ucanManager.verifyCapability(
      pathToken,
      'pyarrow:index:read',
      { path: '/public/images/test.jpg' }
    )).toBe(true);
    
    // Should deny access to other paths
    expect(await ucanManager.verifyCapability(
      pathToken,
      'pyarrow:index:read',
      { path: '/private/data.txt' }
    )).toBe(false);
  });
  
  it('should enforce capability hierarchy', async () => {
    // Create token with write capability
    const writeToken = await ucanManager.issueCapability(
      'pyarrow:index:write',
      { path: '/data' },
      'did:key:test-recipient',
      3600
    );
    
    // Write capability should include read
    expect(await ucanManager.verifyCapability(
      writeToken,
      'pyarrow:index:read',
      { path: '/data' }
    )).toBe(true);
    
    // But read capability should not include write
    const readToken = await ucanManager.issueCapability(
      'pyarrow:index:read',
      { path: '/data' },
      'did:key:test-recipient',
      3600
    );
    
    expect(await ucanManager.verifyCapability(
      readToken,
      'pyarrow:index:write',
      { path: '/data' }
    )).toBe(false);
  });
  
  it('should handle expired tokens', async () => {
    // Create token with short expiration
    const expiredToken = await ucanManager.issueCapability(
      'pyarrow:index:read',
      { path: '/data' },
      'did:key:test-recipient',
      -1 // Already expired
    );
    
    // Should reject expired token
    expect(await ucanManager.verifyCapability(
      expiredToken,
      'pyarrow:index:read',
      { path: '/data' }
    )).toBe(false);
  });
});
```

### 2. Secure Operations Tests

```javascript
/**
 * Test secure operations
 */
describe('Secure PyArrow Index Operations', () => {
  let ucanManager;
  let securePyArrowIndex;
  let adminToken;
  let readToken;
  let writeToken;
  
  beforeEach(async () => {
    // Set up test environment
    ucanManager = new UCANManager({ useMockImplementation: true });
    await ucanManager.init();
    
    // Create tokens with different capabilities
    adminToken = await ucanManager.issueCapability(
      'pyarrow:index:admin',
      {},
      'did:key:test-admin',
      3600
    );
    
    readToken = await ucanManager.issueCapability(
      'pyarrow:index:read',
      { path: '/public' },
      'did:key:test-reader',
      3600
    );
    
    writeToken = await ucanManager.issueCapability(
      'pyarrow:index:write',
      { path: '/public/uploads' },
      'did:key:test-writer',
      3600
    );
    
    // Initialize secure manager with mock index
    const mockIndex = {
      getContent: jest.fn().mockResolvedValue({ data: 'test content' }),
      addContent: jest.fn().mockResolvedValue('test-cid'),
      deleteContent: jest.fn().mockResolvedValue(true),
      queryContent: jest.fn().mockResolvedValue([{ cid: 'test-cid' }])
    };
    
    securePyArrowIndex = new SecurePyArrowIndexManager({
      index: mockIndex,
      ucanManager
    });
  });
  
  it('should allow read operations with read token', async () => {
    // Should succeed with read token
    await expect(
      securePyArrowIndex.getContent('test-cid', readToken)
    ).resolves.toEqual({ data: 'test content' });
    
    // Should also succeed with admin token
    await expect(
      securePyArrowIndex.getContent('test-cid', adminToken)
    ).resolves.toEqual({ data: 'test content' });
  });
  
  it('should allow write operations with write token', async () => {
    const content = {
      path: '/public/uploads/test.txt',
      data: 'New content'
    };
    
    // Should succeed with write token
    await expect(
      securePyArrowIndex.addContent(content, writeToken)
    ).resolves.toBe('test-cid');
    
    // Should also succeed with admin token
    await expect(
      securePyArrowIndex.addContent(content, adminToken)
    ).resolves.toBe('test-cid');
  });
  
  it('should reject write operations with read token', async () => {
    const content = {
      path: '/public/uploads/test.txt',
      data: 'New content'
    };
    
    // Should fail with read token
    await expect(
      securePyArrowIndex.addContent(content, readToken)
    ).rejects.toThrow('Unauthorized');
  });
  
  it('should reject operations outside resource scope', async () => {
    const content = {
      path: '/private/test.txt', // Outside the /public/uploads scope
      data: 'Private content'
    };
    
    // Should fail with write token scoped to /public/uploads
    await expect(
      securePyArrowIndex.addContent(content, writeToken)
    ).rejects.toThrow('Unauthorized');
  });
  
  it('should properly handle missing tokens', async () => {
    // Should reject undefined token
    await expect(
      securePyArrowIndex.getContent('test-cid', undefined)
    ).rejects.toThrow('No token provided');
    
    // Should reject null token
    await expect(
      securePyArrowIndex.getContent('test-cid', null)
    ).rejects.toThrow('No token provided');
    
    // Should reject empty token
    await expect(
      securePyArrowIndex.getContent('test-cid', '')
    ).rejects.toThrow('Invalid token');
  });
});
```

### 3. Security Dashboard Tests

```javascript
/**
 * Test security dashboard
 */
describe('Security Dashboard Component', () => {
  let securityDashboard;
  let mockUcanManager;
  let mockEventBus;
  let container;
  
  beforeEach(() => {
    // Set up DOM environment
    document.body.innerHTML = '<div id="security-container"></div>';
    container = document.getElementById('security-container');
    
    // Mock dependencies
    mockUcanManager = {
      listPrincipals: jest.fn().mockResolvedValue([
        { did: 'did:key:test1', name: 'Test User 1', type: 'user' },
        { did: 'did:key:test2', name: 'Test User 2', type: 'service' }
      ]),
      listCapabilities: jest.fn().mockResolvedValue([
        {
          id: 'cap1',
          capability: 'pyarrow:index:read',
          resource: { path: '/public' },
          issuer: 'did:key:issuer',
          audience: 'did:key:test1',
          expiration: new Date(Date.now() + 3600000).toISOString()
        }
      ]),
      issueCapability: jest.fn().mockResolvedValue('mock-token'),
      revokeCapability: jest.fn().mockResolvedValue(true)
    };
    
    mockEventBus = {
      on: jest.fn(),
      emit: jest.fn()
    };
    
    // Initialize the component
    securityDashboard = new SecurityDashboard({
      container,
      ucanManager: mockUcanManager,
      eventBus: mockEventBus
    });
  });
  
  it('should initialize correctly', async () => {
    await securityDashboard.init();
    
    // Should render tabs
    expect(container.querySelector('#tab-principals')).not.toBeNull();
    expect(container.querySelector('#tab-capabilities')).not.toBeNull();
    
    // Should register event listeners
    expect(mockEventBus.on).toHaveBeenCalled();
    
    // Should load initial data
    expect(mockUcanManager.listPrincipals).toHaveBeenCalled();
    expect(mockUcanManager.listCapabilities).toHaveBeenCalled();
  });
  
  it('should render principals list', async () => {
    await securityDashboard.init();
    
    // Should render principals in the table
    const principalRows = container.querySelectorAll('#principals-list tr');
    expect(principalRows.length).toBe(2);
    
    // Should display principal information
    expect(principalRows[0].textContent).toContain('Test User 1');
    expect(principalRows[0].textContent).toContain('did:key:test1');
  });
  
  it('should render capabilities list', async () => {
    await securityDashboard.init();
    
    // Click on capabilities tab
    container.querySelector('[data-tab="capabilities"]').click();
    
    // Should render capabilities in the table
    const capabilityRows = container.querySelectorAll('#capabilities-list tr');
    expect(capabilityRows.length).toBe(1);
    
    // Should display capability information
    expect(capabilityRows[0].textContent).toContain('pyarrow:index:read');
    expect(capabilityRows[0].textContent).toContain('/public');
  });
  
  it('should create new capability', async () => {
    await securityDashboard.init();
    
    // Open create capability dialog
    container.querySelector('#btn-create-capability').click();
    
    // Fill the form
    const dialog = container.querySelector('#create-capability-dialog');
    dialog.querySelector('#capability-type').value = 'pyarrow:index:read';
    dialog.querySelector('#resource-type').value = 'path';
    dialog.querySelector('#resource-value').value = '/test/path';
    dialog.querySelector('#recipient-did').value = 'did:key:test1';
    dialog.querySelector('#expiration').value = '7';
    
    // Submit the form
    dialog.querySelector('#btn-create-capability-confirm').click();
    
    // Should call issueCapability with correct parameters
    expect(mockUcanManager.issueCapability).toHaveBeenCalledWith(
      'pyarrow:index:read',
      { path: '/test/path' },
      'did:key:test1',
      7 * 24 * 60 * 60 // 7 days in seconds
    );
  });
  
  it('should revoke capability', async () => {
    await securityDashboard.init();
    
    // Click on capabilities tab
    container.querySelector('[data-tab="capabilities"]').click();
    
    // Click revoke button on the first capability
    container.querySelector('#capabilities-list .btn-revoke').click();
    
    // Confirm revocation
    container.querySelector('#confirm-revoke-dialog .btn-confirm').click();
    
    // Should call revokeCapability
    expect(mockUcanManager.revokeCapability).toHaveBeenCalledWith('cap1');
  });
  
  it('should show capability details', async () => {
    await securityDashboard.init();
    
    // Click on capabilities tab
    container.querySelector('[data-tab="capabilities"]').click();
    
    // Click on the capability to view details
    container.querySelector('#capabilities-list tr').click();
    
    // Should display details panel
    const detailsPanel = container.querySelector('#capability-details');
    expect(detailsPanel.style.display).not.toBe('none');
    
    // Should show capability details
    expect(detailsPanel.textContent).toContain('pyarrow:index:read');
    expect(detailsPanel.textContent).toContain('/public');
    expect(detailsPanel.textContent).toContain('did:key:test1');
  });
});
```

## Conclusion

The PyArrow Content Index Dashboard implements a comprehensive security model based on UCAN capabilities. This model provides fine-grained access control with resource-specific permissions, hierarchical capabilities, and delegation support. The security implementation includes proper verification, secure token management, and a user-friendly dashboard for security administration.

By following the best practices outlined in this document, developers can ensure that their PyArrow Content Index interactions are properly secured and follow the principle of least privilege. The security model enables safe collaboration and content sharing while maintaining control over sensitive resources.