# Authentication and Security Modules

## Overview

The authentication system in Hallucinate App is built around UCAN (User Controlled Authorization Networks) principles, providing a decentralized and capability-based security model. This enables secure access control across all decentralized components.

## Key Components

### `auth.js`
Implements UCAN-based authentication with principals, capabilities, and delegations.

```javascript
// Importing the auth manager
import { authManager } from './auth.js';

// Initialize auth manager
await authManager.init();

// Create a principal
const principalId = 'user1';
await authManager.createPrincipal(principalId);

// Issue a capability
const capability = { can: 'model:load', with: 'bert-base-uncased' };
const token = await authManager.issueCapability('root', principalId, capability);

// Verify a capability token
const isValid = await authManager.verifyCapability(token, { can: 'model:load', with: 'bert-base-uncased' });
```

### `keystore.js`
Provides secure storage for API keys with encryption and lifecycle management.

```javascript
// Importing the keystore
import { keystore } from './keystore.js';

// Initialize keystore
await keystore.init();

// Store a key
await keystore.setKey('openai', 'sk-abcdef1234567890', {
  name: 'Production',
  expires_at: new Date('2025-01-01').toISOString()
});

// Get a key
const apiKey = await keystore.getKey('openai');

// Delete a key
await keystore.deleteKey('openai');
```

### `auth_keystore_integration.js`
Integrates authentication with keystore for capability-based API key access.

```javascript
// Importing the integration module
import { authKeystoreIntegration } from './auth_keystore_integration.js';
import { authManager } from './auth.js';

// Initialize the integration
await authKeystoreIntegration.init();

// Get a capability token for key access
const keyAccessToken = await authManager.getCapabilityToken(`${authKeystoreIntegration.CAPABILITIES.KEY_ACCESS}:openai`);

// Get a key using a capability token
const apiKey = await authKeystoreIntegration.getAuthorizedKey('openai', keyAccessToken);

// Rotate a key
const rotateToken = await authManager.getCapabilityToken(`${authKeystoreIntegration.CAPABILITIES.KEY_ROTATE}:openai`);
await authKeystoreIntegration.rotateAuthorizedKey('openai', 'new-key-value', rotateToken);
```

## Security Dashboard

The security dashboard provides a visual interface for managing authentication components:

```javascript
// Import dashboard components
import AuthDashboard from './dashboard/auth_dashboard.js';
import { authManager } from './auth.js';
import { keystore } from './keystore.js';
import { authKeystoreIntegration } from './auth_keystore_integration.js';

// Create event bus
const eventBus = {
  listeners: {},
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  },
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
};

// Initialize the dashboard
const authDashboard = new AuthDashboard({
  element: document.getElementById('auth-dashboard-container'),
  auth: authManager,
  keystore: keystore,
  integration: authKeystoreIntegration,
  eventBus: eventBus
});

// Initialize and render
await authDashboard.init();
await authDashboard.render();
```

## Testing

Each security module includes a test() method for verification:

```javascript
// Test auth manager
const authTestResult = await authManager.test();
console.log(`Auth test success: ${authTestResult.success}`);

// Test keystore
const keystoreTestResult = await keystore.test();
console.log(`Keystore test success: ${keystoreTestResult.success}`);

// Test integration
const integrationTestResult = await authKeystoreIntegration.test();
console.log(`Integration test success: ${integrationTestResult.success}`);
```

## Best Practices

1. **Always verify capabilities** before allowing access to protected resources
2. **Never hardcode API keys** - always use the keystore with proper capability verification
3. **Follow the principle of least privilege** when issuing capabilities
4. **Implement audit logging** for all security-sensitive operations
5. **Regularly rotate credentials** using the secure rotation workflows

## Example Integration with Secure Modules

For a module that requires authentication:

```javascript
class SecureModule {
  constructor(options = {}) {
    this.auth = options.auth || authManager;
    this.initialized = false;
  }
  
  async init() {
    // Ensure auth is initialized
    if (!this.auth.initialized) {
      await this.auth.init();
    }
    this.initialized = true;
    return true;
  }
  
  async secureOperation(resourceId, options = {}) {
    // Verify capability token
    if (!options.authToken) {
      throw new Error('Authentication required');
    }
    
    const hasCapability = await this.auth.verifyCapability(
      options.authToken, 
      { can: 'operation:execute', with: resourceId }
    );
    
    if (!hasCapability) {
      throw new Error('Unauthorized: missing required capability');
    }
    
    // Continue with authorized operation
    return { success: true, result: "Operation completed" };
  }
  
  async test() {
    try {
      // Test initialization
      if (!this.initialized) {
        await this.init();
      }
      
      // Test capability verification
      const principal = await this.auth.createPrincipal('test-principal');
      const capability = { can: 'operation:execute', with: 'test-resource' };
      const token = await this.auth.issueCapability('root', 'test-principal', capability);
      
      // Test secure operation with valid token
      const result = await this.secureOperation('test-resource', { authToken: token });
      
      return {
        success: true,
        initialization: true,
        capability_verification: true,
        secure_operation: result.success
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
```