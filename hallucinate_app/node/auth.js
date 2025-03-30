/**
 * UCAN Authentication Integration Layer
 *
 * This module serves as an integration layer for the UCAN authentication functionality
 * provided by the ucan-auth-js package from npm. It does not implement any core functionality
 * itself but provides standardized testing and access to the external module implementations.
 *
 * The module's responsibility is to:
 * 1. Import and provide access to UCAN auth from ucan-auth-js
 * 2. Run comprehensive tests to ensure the auth functionality works
 * 3. Integrate the auth module with the resource pool
 * 4. Provide a unified interface for other components to use UCAN authentication
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Set up logging
const logger = {
  info: (msg) => console.log(`[INFO] Auth: ${msg}`),
  warn: (msg) => console.warn(`[WARN] Auth: ${msg}`),
  error: (msg) => console.error(`[ERROR] Auth: ${msg}`),
  debug: (msg) => console.debug(`[DEBUG] Auth: ${msg}`)
};

// Try to import UCAN authentication from ucan-auth-js
let HAS_UCAN_AUTH = false;
let UCANAuthManager = null;
let ucan_auth_js = null;

try {
  // First try npm package
  ucan_auth_js = await import('ucan-auth-js');
  UCANAuthManager = ucan_auth_js.AuthManager;
  HAS_UCAN_AUTH = true;
  logger.info("UCAN Auth library loaded successfully from npm");
} catch (error) {
  // Then try local import
  try {
    // Check if local file exists
    const modulePath = path.resolve('./ucan_auth_js/index.js');
    if (fs.existsSync(modulePath)) {
      ucan_auth_js = await import(modulePath);
      UCANAuthManager = ucan_auth_js.AuthManager;
      HAS_UCAN_AUTH = true;
      logger.info("UCAN Auth library loaded successfully from local directory");
    } else {
      logger.warn(`ucan-auth-js package not available, falling back to mock implementation: ${error.message}`);
      logger.warn("To enable UCAN support, install: npm install ucan-auth-js");
    }
  } catch (localError) {
    logger.warn(`ucan-auth-js package not available, falling back to mock implementation: ${localError.message}`);
    logger.warn("To enable UCAN support, install: npm install ucan-auth-js");
  }
}

// For backwards compatibility with existing code
// Try to import UCAN libraries directly (deprecated approach)
let HAS_UCAN_LIBS = false;
try {
  const ucans = await import('ucans');
  HAS_UCAN_LIBS = true;
  logger.info("UCAN libraries loaded successfully (deprecated direct import)");
} catch (error) {
  logger.debug("Direct UCAN libraries not available (this is normal when using ucan-auth-js)");
}

/**
 * Mock implementation of a UCAN principal
 */
class MockUcanPrincipal {
  /**
   * Create a new mock principal
   * @param {string} did - DID identifier
   * @param {object} signer - Optional signer object
   */
  constructor(did, signer = null) {
    this.did = did;
    this.signer = signer || {};
  }

  /**
   * Mock signature generation
   * @param {Buffer} data - Data to sign
   * @returns {string} - Mock signature
   */
  async sign(data) {
    return `mock_signature_${Date.now()}`;
  }

  /**
   * Serialize to object
   * @returns {object} - Object representation
   */
  toObject() {
    return {
      did: this.did,
      mock: true
    };
  }
}

/**
 * Mock capability representation
 */
class MockUcanCapability {
  /**
   * Create a new mock capability
   * @param {string} capability - Capability action
   * @param {string} resource - Resource identifier
   * @param {object} limitations - Optional capability limitations
   */
  constructor(capability, resource, limitations = null) {
    this.can = capability;
    this.with = resource;
    this.limits = limitations || {};
  }

  /**
   * String representation
   * @returns {string} - String representation
   */
  toString() {
    return `${this.can}/${this.with}`;
  }

  /**
   * Serialize to object
   * @returns {object} - Object representation
   */
  toObject() {
    return {
      can: this.can,
      with: this.with,
      limits: this.limits
    };
  }
}

/**
 * Mock token representation
 */
class MockUcanToken {
  /**
   * Create a new mock token
   * @param {MockUcanPrincipal} issuer - Token issuer
   * @param {MockUcanPrincipal} audience - Token audience
   * @param {Array<MockUcanCapability>} capabilities - Token capabilities
   * @param {number} expiration - Expiration timestamp
   * @param {Array<string>} proofs - Optional proof tokens
   */
  constructor(issuer, audience, capabilities, expiration, proofs = null) {
    this.issuer = issuer;
    this.audience = audience;
    this.capabilities = capabilities;
    this.expiration = expiration;
    this.proofs = proofs || [];
    this.signature = `mock_token_signature_${Date.now()}`;
  }

  /**
   * Export token as string
   * @returns {string} - Token string
   */
  export() {
    return `mock_ucan_token_${Date.now()}`;
  }

  /**
   * Serialize to object
   * @returns {object} - Object representation
   */
  toObject() {
    return {
      issuer: this.issuer.did,
      audience: this.audience.did,
      capabilities: this.capabilities.map(cap => cap.toObject()),
      expiration: this.expiration,
      proofs: this.proofs,
      signature: this.signature
    };
  }
}

/**
 * AuthManager serves as an integration layer for the ucan-auth-js package.
 *
 * This class provides UCAN-based authentication and capability verification
 * by forwarding calls to the ucan-auth-js implementation (when available) or
 * falling back to a mock implementation if the package is not installed.
 */
export class AuthManager {
  /**
   * Initialize the auth manager
   * @param {object} resources - Resource pool for accessing other modules
   * @param {object} metadata - Configuration metadata
   */
  constructor(resources = null, metadata = null) {
    this.resources = resources || {};
    this.metadata = metadata || {};

    // Configuration
    this.options = {
      storage_location: this.metadata.storage_location || 
                         path.join(os.homedir(), '.hallucinate_app', 'auth'),
      use_mock_implementation: this.metadata.use_mock_implementation !== undefined ? 
                              this.metadata.use_mock_implementation : !HAS_UCAN_AUTH
    };

    // Initialize the core implementation
    if (!this.options.use_mock_implementation && HAS_UCAN_AUTH) {
      // Use the actual ucan-auth-js implementation
      this.auth_impl = new UCANAuthManager({
        storage_location: this.options.storage_location,
        resources: this.resources,
        metadata: this.metadata
      });
      logger.info("Using ucan-auth-js implementation for UCAN authentication");
    } else {
      // We'll use the mock implementation
      // Keep this for backward compatibility and testing purposes
      logger.info("Using mock implementation for UCAN authentication");
      // Store for principals, tokens, and delegations
      this.principals = {};
      this.tokens = {};
      this.delegations = {};
    }

    // Track initialization
    this.initialized = false;

    logger.info(`AuthManager initialized with storage at ${this.options.storage_location}`);
  }

  /**
   * Initialize the auth manager
   * @returns {Promise<boolean>} - True if initialization successful
   */
  async init() {
    try {
      if (!this.options.use_mock_implementation && HAS_UCAN_AUTH) {
        // Initialize the ucan-auth-js implementation
        this.initialized = await this.auth_impl.init();
        return this.initialized;
      } else {
        // Use the mock implementation
        // Create storage directory if needed
        fs.mkdirSync(this.options.storage_location, { recursive: true });

        // Load existing keys and tokens
        await this._loadState();

        // Initialize root principal if none exists
        if (Object.keys(this.principals).length === 0) {
          await this.createRootPrincipal();
        }

        this.initialized = true;
        return true;
      }
    } catch (error) {
      logger.error(`Failed to initialize auth manager: ${error.message}`);
      return false;
    }
  }

  /**
   * Load stored state (principals, tokens, delegations) for mock implementation
   * @returns {Promise<boolean>} - True if loading successful
   */
  async _loadState() {
    try {
      // Only used by the mock implementation
      // Load principals
      const principalsPath = path.join(this.options.storage_location, "principals.json");
      if (fs.existsSync(principalsPath)) {
        const principalsData = JSON.parse(fs.readFileSync(principalsPath, 'utf8'));

        for (const [id, data] of Object.entries(principalsData)) {
          // Recreate principals from stored data
          this.principals[id] = new MockUcanPrincipal(data.did || `did:key:${id}`);
        }
      }

      // Load tokens
      const tokensPath = path.join(this.options.storage_location, "tokens.json");
      if (fs.existsSync(tokensPath)) {
        this.tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
      }

      // Load delegations
      const delegationsPath = path.join(this.options.storage_location, "delegations.json");
      if (fs.existsSync(delegationsPath)) {
        this.delegations = JSON.parse(fs.readFileSync(delegationsPath, 'utf8'));
      }

      return true;
    } catch (error) {
      logger.error(`Failed to load auth state: ${error.message}`);
      // Initialize with empty state
      this.principals = {};
      this.tokens = {};
      this.delegations = {};
      return false;
    }
  }

  /**
   * Save current state to storage for mock implementation
   * @returns {Promise<boolean>} - True if saving successful
   */
  async _saveState() {
    try {
      // Only used by the mock implementation
      // Save principals (serialize as needed)
      const principalsData = {};
      for (const [id, principal] of Object.entries(this.principals)) {
        // Convert principals to serializable form
        if (principal.toObject) {
          principalsData[id] = principal.toObject();
        } else {
          principalsData[id] = {
            did: principal.did || `did:key:${id}`,
            mock: true
          };
        }
      }

      const principalsPath = path.join(this.options.storage_location, "principals.json");
      fs.writeFileSync(principalsPath, JSON.stringify(principalsData, null, 2));

      // Save tokens
      const tokensPath = path.join(this.options.storage_location, "tokens.json");
      fs.writeFileSync(tokensPath, JSON.stringify(this.tokens, null, 2));

      // Save delegations
      const delegationsPath = path.join(this.options.storage_location, "delegations.json");
      fs.writeFileSync(delegationsPath, JSON.stringify(this.delegations, null, 2));

      return true;
    } catch (error) {
      logger.error(`Failed to save auth state: ${error.message}`);
      return false;
    }
  }

  /**
   * Create a root principal for this application
   * @returns {Promise<object>} - The created principal
   */
  async createRootPrincipal() {
    try {
      if (!this.options.use_mock_implementation && HAS_UCAN_AUTH) {
        // Use the actual implementation
        return await this.auth_impl.createRootPrincipal();
      } else {
        // Use the mock implementation
        // Generate a mock DID
        const did = `did:key:mock_${crypto.randomBytes(16).toString('hex')}`;
        const signer = {
          id: crypto.randomBytes(32).toString('hex'),
          sign: (data) => `mock_signature_${Date.now()}`
        };

        this.principals["root"] = new MockUcanPrincipal(did, signer);

        // Save state
        await this._saveState();

        return this.principals["root"];
      }
    } catch (error) {
      logger.error(`Failed to create root principal: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new principal
   * @param {string} id - Identifier for the principal
   * @returns {Promise<object>} - The created principal
   */
  async createPrincipal(id) {
    try {
      if (!this.options.use_mock_implementation && HAS_UCAN_AUTH) {
        // Use the actual implementation
        return await this.auth_impl.createPrincipal(id);
      } else {
        // Use the mock implementation
        if (this.principals[id]) {
          return this.principals[id];
        }

        // Generate a mock DID
        const did = `did:key:${id}_${crypto.randomBytes(16).toString('hex')}`;
        const signer = {
          id: crypto.randomBytes(32).toString('hex'),
          sign: (data) => `mock_signature_${Date.now()}`
        };

        this.principals[id] = new MockUcanPrincipal(did, signer);

        // Save state
        await this._saveState();

        return this.principals[id];
      }
    } catch (error) {
      logger.error(`Failed to create principal ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Issue a capability token
   * @param {string} issuerId - Principal ID of the issuer
   * @param {string} audienceId - Principal ID of the audience
   * @param {object} capability - Capability details (can, with, limits)
   * @param {object} options - Additional options (expiration, proofs)
   * @returns {Promise<object>} - The created token
   */
  async issueCapability(issuerId, audienceId, capability, options = null) {
    try {
      if (!this.initialized) {
        throw new Error("AuthManager not initialized. Call init() first");
      }

      if (!this.options.use_mock_implementation && HAS_UCAN_AUTH) {
        // Use the actual implementation
        return await this.auth_impl.issueCapability(
          issuerId, audienceId, capability, options
        );
      } else {
        // Use the mock implementation
        options = options || {};

        // Ensure principals exist
        if (!this.principals[issuerId]) {
          throw new Error(`Issuer principal ${issuerId} not found`);
        }

        if (!this.principals[audienceId]) {
          throw new Error(`Audience principal ${audienceId} not found`);
        }

        // Get the principals
        const issuer = this.principals[issuerId];
        const audience = this.principals[audienceId];

        // Create a mock capability
        const mockCapability = new MockUcanCapability(
          capability.can,
          capability.with,
          capability.limits
        );

        // Set expiration time
        let expiration = options.expiration;
        if (!expiration) {
          // Default: 1 day from now
          expiration = Math.floor(Date.now() / 1000) + 86400;
        } else if (typeof expiration === 'string') {
          // Parse ISO string
          expiration = Math.floor(new Date(expiration).getTime() / 1000);
        }

        // Create a mock token
        const token = new MockUcanToken(
          issuer,
          audience,
          [mockCapability],
          expiration,
          options.proofs || []
        );

        // Store the token
        const tokenId = `${issuerId}->${audienceId}:${capability.can}/${capability.with}`;
        this.tokens[tokenId] = {
          issuer: issuerId,
          audience: audienceId,
          capability: {
            can: capability.can,
            with: capability.with,
            limits: capability.limits || {}
          },
          expiration: expiration,
          token: token.export()
        };

        // Update delegations
        if (!this.delegations[issuerId]) {
          this.delegations[issuerId] = {};
        }
        if (!this.delegations[issuerId][audienceId]) {
          this.delegations[issuerId][audienceId] = [];
        }

        this.delegations[issuerId][audienceId].push({
          token_id: tokenId,
          capability: {
            can: capability.can,
            with: capability.with,
            limits: capability.limits || {}
          },
          expiration: expiration,
          issued_at: Math.floor(Date.now() / 1000)
        });

        // Save state
        await this._saveState();

        return this.tokens[tokenId];
      }
    } catch (error) {
      logger.error(`Failed to issue capability: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a capability token for a specific action
   * @param {string} capabilityString - The capability string (e.g., 'model:load')
   * @param {object} options - Additional options
   * @returns {Promise<string>} - The capability token
   */
  async getCapabilityToken(capabilityString, options = null) {
    try {
      if (!this.initialized) {
        throw new Error("AuthManager not initialized. Call init() first");
      }

      if (!this.options.use_mock_implementation && HAS_UCAN_AUTH) {
        // Use the actual implementation
        return await this.auth_impl.getCapabilityToken(capabilityString, options);
      } else {
        // Use the mock implementation
        options = options || {};

        // Parse capability string
        const parts = capabilityString.split(":", 2);
        const capability = parts[0];
        const resource = parts.length > 1 ? parts[1] : "*";

        // Look for existing token
        const validTokens = [];
        const currentTime = Math.floor(Date.now() / 1000);

        for (const [tokenId, token] of Object.entries(this.tokens)) {
          if (token.capability.can === capability &&
              (resource === "*" || token.capability.with === resource) &&
              token.expiration > currentTime) {
            validTokens.push(token);
          }
        }

        if (validTokens.length > 0) {
          // Return the first valid token
          return validTokens[0].token;
        }

        // No valid token found, create a new one
        // For simplicity, we'll issue from root to 'app' principal
        if (!this.principals["app"]) {
          await this.createPrincipal("app");
        }

        const token = await this.issueCapability("root", "app", {
          can: capability,
          with: resource,
          limits: options.limits || {}
        }, {
          expiration: options.expiration
        });

        return token.token;
      }
    } catch (error) {
      logger.error(`Failed to get capability token for ${capabilityString}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a self-signed token with specified capability for internal operations
   * @param {string} capability - Capability to include in the token
   * @returns {string} - The generated token
   */
  getSelfSignedToken(capability) {
    try {
      if (!this.options.use_mock_implementation && HAS_UCAN_AUTH) {
        // Use the actual implementation
        return this.auth_impl.getSelfSignedToken(capability);
      } else {
        // Use the mock implementation
        // Generate a mock token
        const token = `self-signed-mock-${capability}-${Date.now()}`;
        return token;
      }
    } catch (error) {
      logger.error(`Failed to generate self-signed token: ${error.message}`);
      return `emergency-token-${capability}`;
    }
  }

  /**
   * Verify a capability token
   * @param {string} token - The capability token
   * @param {string} capabilityString - The required capability string
   * @returns {Promise<boolean>} - True if token is valid and has required capability
   */
  async verifyCapability(token, capabilityString) {
    try {
      if (!this.initialized) {
        throw new Error("AuthManager not initialized. Call init() first");
      }

      if (!this.options.use_mock_implementation && HAS_UCAN_AUTH) {
        // Use the actual implementation
        return await this.auth_impl.verifyCapability(token, capabilityString);
      } else {
        // Use the mock implementation
        // For mock implementation, just check if token exists and is valid
        let tokenEntry = null;
        for (const t of Object.values(this.tokens)) {
          if (t.token === token) {
            tokenEntry = t;
            break;
          }
        }

        if (!tokenEntry) {
          return false;
        }

        // Check expiration
        if (tokenEntry.expiration <= Math.floor(Date.now() / 1000)) {
          return false;
        }

        // Parse capability string
        const parts = capabilityString.split(":", 2);
        const capability = parts[0];
        const resource = parts.length > 1 ? parts[1] : null;

        // Check if token has required capability
        return (tokenEntry.capability.can === capability &&
                (!resource || tokenEntry.capability.with === resource));
      }
    } catch (error) {
      logger.error(`Failed to verify capability token for ${capabilityString}: ${error.message}`);
      return false;
    }
  }

  /**
   * Revoke a capability token
   * @param {string} tokenId - The token ID to revoke
   * @returns {Promise<boolean>} - True if token was revoked
   */
  async revokeCapability(tokenId) {
    try {
      if (!this.initialized) {
        throw new Error("AuthManager not initialized. Call init() first");
      }

      if (!this.options.use_mock_implementation && HAS_UCAN_AUTH) {
        // Use the actual implementation
        return await this.auth_impl.revokeCapability(tokenId);
      } else {
        // Use the mock implementation
        if (!this.tokens[tokenId]) {
          return false;
        }

        // Get token details before removing
        const token = this.tokens[tokenId];
        const issuer = token.issuer;
        const audience = token.audience;

        // Remove the token
        delete this.tokens[tokenId];

        // Update delegations
        if (this.delegations[issuer] && this.delegations[issuer][audience]) {
          this.delegations[issuer][audience] = this.delegations[issuer][audience].filter(
            d => d.token_id !== tokenId
          );

          // Clean up empty arrays
          if (this.delegations[issuer][audience].length === 0) {
            delete this.delegations[issuer][audience];
          }

          if (Object.keys(this.delegations[issuer]).length === 0) {
            delete this.delegations[issuer];
          }
        }

        // Save state
        await this._saveState();

        return true;
      }
    } catch (error) {
      logger.error(`Failed to revoke capability token ${tokenId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get all delegations issued by a principal
   * @param {string} issuerId - The principal ID of the issuer
   * @returns {Promise<object>} - Delegations issued by the principal
   */
  async getDelegations(issuerId) {
    try {
      if (!this.initialized) {
        throw new Error("AuthManager not initialized. Call init() first");
      }

      if (!this.options.use_mock_implementation && HAS_UCAN_AUTH) {
        // Use the actual implementation
        return await this.auth_impl.getDelegations(issuerId);
      } else {
        // Use the mock implementation
        return this.delegations[issuerId] || {};
      }
    } catch (error) {
      logger.error(`Failed to get delegations for ${issuerId}: ${error.message}`);
      return {};
    }
  }

  /**
   * Run module tests
   * @returns {Promise<object>} - Test results
   */
  async test() {
    logger.info("Testing auth module");

    try {
      if (!this.options.use_mock_implementation && HAS_UCAN_AUTH) {
        // Use the actual implementation but add integration info
        const testResults = await this.auth_impl.test();
        testResults.integration = {
          module: "auth",
          package: "ucan-auth-js",
          integration_type: "wrapper",
          direct_implementation: false
        };
        return testResults;
      } else {
        // Use the mock implementation
        const testResults = {
          success: true,
          module: "auth",
          initialization: false,
          principal_creation: false,
          capability_issuance: false,
          capability_verification: false,
          capability_revocation: false,
          capability: {
            ucan_available: !this.options.use_mock_implementation
          },
          integration: {
            module: "auth",
            package: "ucan-auth-js",
            integration_type: "mock",
            direct_implementation: true,
            note: "Using mock implementation because ucan-auth-js is not available"
          }
        };

        // Test initialization
        if (!this.initialized) {
          const initResult = await this.init();
          testResults.initialization = initResult;
        } else {
          testResults.initialization = true;
        }

        if (testResults.initialization) {
          // Test principal creation
          const testPrincipalId = `test-principal-${Date.now()}`;
          const principal = await this.createPrincipal(testPrincipalId);
          testResults.principal_creation = Boolean(principal) && principal.did !== undefined;

          if (testResults.principal_creation) {
            // Test capability issuance
            const testCapability = {
              can: "test",
              with: `resource-${Date.now()}`
            };

            const token = await this.issueCapability("root", testPrincipalId, testCapability);
            testResults.capability_issuance = Boolean(token) && token.token !== undefined;

            if (testResults.capability_issuance) {
              // Test capability verification
              const verifyResult = await this.verifyCapability(
                token.token,
                `${testCapability.can}:${testCapability.with}`
              );
              testResults.capability_verification = verifyResult === true;

              // Test capability revocation
              let tokenId = null;
              for (const [tid, t] of Object.entries(this.tokens)) {
                if (t.token === token.token) {
                  tokenId = tid;
                  break;
                }
              }

              if (tokenId) {
                const revokeResult = await this.revokeCapability(tokenId);
                testResults.capability_revocation = revokeResult === true;
              }
            }
          }
        }

        // Overall success
        testResults.success = (
          testResults.initialization &&
          testResults.principal_creation &&
          testResults.capability_issuance &&
          testResults.capability_verification &&
          testResults.capability_revocation
        );

        return testResults;
      }
    } catch (error) {
      logger.error(`Auth test failed: ${error.message}`);
      return {
        success: false,
        module: "auth",
        error: error.message,
        integration: {
          module: "auth",
          package: "ucan-auth-js",
          integration_type: "failed"
        }
      };
    }
  }
}

// Create default instance
const authManager = new AuthManager();

// For API compatibility
export function getAuthManager() {
  return authManager;
}

export default authManager;