/**
 * Auth and Keystore Integration Module
 *
 * This module serves as an integration layer for the auth-keystore-js package from npm.
 * The auth-keystore-js package provides capability-based access control for API keys,
 * integrating UCAN-based authentication with encrypted keystore functionality.
 *
 * The module's responsibility is to:
 * 1. Import and provide access to auth-keystore integration from auth-keystore-js
 * 2. Run comprehensive tests to ensure the integration functionality works
 * 3. Integrate the auth and keystore modules with the resource pool
 * 4. Provide a unified interface for other components to use UCAN-based API key management
 */

import { getAuthManager } from './auth.js';
import { getKeystore } from './keystore.js';

// Set up logging
const logger = {
  info: (msg) => console.log(`[INFO] AuthKeystore: ${msg}`),
  warn: (msg) => console.warn(`[WARN] AuthKeystore: ${msg}`),
  error: (msg) => console.error(`[ERROR] AuthKeystore: ${msg}`),
  debug: (msg) => console.debug(`[DEBUG] AuthKeystore: ${msg}`)
};

// Try to import auth-keystore integration from auth-keystore-js
let HAS_AUTH_KEYSTORE_JS = false;
let AuthKeystoreManager = null;
let auth_keystore_js = null;

try {
  auth_keystore_js = await import('auth-keystore-js');
  AuthKeystoreManager = auth_keystore_js.AuthKeystoreManager;
  HAS_AUTH_KEYSTORE_JS = true;
  logger.info("Auth-Keystore integration library loaded successfully");
} catch (error) {
  logger.warn(`auth-keystore-js package not available, falling back to local implementation: ${error.message}`);
  logger.warn("To enable full auth-keystore integration support, install: npm install auth-keystore-js");
}

/**
 * Auth-Keystore integration layer for secure API key management with capability-based access.
 *
 * This class serves as an integration layer for the auth-keystore-js package,
 * providing capability-based access control for API keys. If the auth-keystore-js 
 * package is not available, it falls back to a local implementation.
 */
export class AuthKeystoreIntegration {
  /**
   * Create a new AuthKeystoreIntegration instance
   * @param {object} resources - Resource pool for accessing other modules
   * @param {object} metadata - Configuration metadata
   */
  constructor(resources = null, metadata = null) {
    this.resources = resources || {};
    this.metadata = metadata || {};

    // Get resources from the resource pool
    this.auth = this.resources.auth || getAuthManager();
    this.keystore = this.resources.keystore || getKeystore();

    // Check if we should use the external implementation
    this.useExternalImplementation = this.metadata.use_external_implementation !== undefined ? 
                                   this.metadata.use_external_implementation : HAS_AUTH_KEYSTORE_JS;

    // Constants for capability namespaces (used by local implementation)
    this.CAPABILITIES = {
      KEY_ACCESS: "key:access",
      KEY_MANAGE: "key:manage",
      KEY_ROTATE: "key:rotate",
      KEY_LIST: "key:list"
    };

    if (this.useExternalImplementation && HAS_AUTH_KEYSTORE_JS) {
      // Use the external implementation
      logger.info("Using auth-keystore-js implementation");
      // Initialize the external implementation
      this.authKeystoreImpl = new AuthKeystoreManager({
        authManager: this.auth,
        keystore: this.keystore,
        resources: this.resources,
        metadata: this.metadata
      });
    } else {
      // Using local implementation
      logger.info("Using local auth-keystore integration implementation");
    }

    this.initialized = false;

    logger.info("AuthKeystoreIntegration initialized");
  }

  /**
   * Initialize the integration module
   * @returns {Promise<boolean>} - True if initialization successful
   */
  async init() {
    try {
      if (this.useExternalImplementation && HAS_AUTH_KEYSTORE_JS) {
        // Use the external implementation
        this.initialized = await this.authKeystoreImpl.init();
        return this.initialized;
      } else {
        // Use the local implementation
        // Ensure auth manager is initialized
        if (!this.auth.initialized) {
          await this.auth.init();
        }

        // Ensure keystore is initialized
        if (!this.keystore.initialized) {
          await this.keystore.init();
        }

        this.initialized = true;
        return true;
      }
    } catch (error) {
      logger.error(`Failed to initialize auth/keystore integration: ${error.message}`);
      return false;
    }
  }

  /**
   * Get an API key with capability verification
   * @param {string} provider - Service provider to get key for
   * @param {string} authToken - UCAN capability token
   * @returns {Promise<string|null>} - API key if authorized, null otherwise
   */
  async getAuthorizedKey(provider, authToken) {
    if (!this.initialized) {
      throw new Error("Integration module not initialized. Call init() first");
    }

    try {
      if (this.useExternalImplementation && HAS_AUTH_KEYSTORE_JS) {
        // Use the external implementation
        return await this.authKeystoreImpl.getAuthorizedKey(provider, authToken);
      } else {
        // Use the local implementation
        // Verify capability token for key access
        const capabilityString = `${this.CAPABILITIES.KEY_ACCESS}:${provider}`;
        const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);

        if (!isAuthorized) {
          logger.warn(`Unauthorized key access attempt for ${provider}`);
          return null;
        }

        // Get the key from keystore
        return await this.keystore.getKey(provider);
      }
    } catch (error) {
      logger.error(`Failed to get authorized key for ${provider}: ${error.message}`);
      return null;
    }
  }

  /**
   * Set an API key with capability verification
   * @param {string} provider - Service provider
   * @param {string} key - API key to store
   * @param {string} authToken - UCAN capability token
   * @param {object} options - Additional options
   * @returns {Promise<boolean>} - True if key was stored successfully
   */
  async setAuthorizedKey(provider, key, authToken, options = null) {
    if (!this.initialized) {
      throw new Error("Integration module not initialized. Call init() first");
    }

    try {
      if (this.useExternalImplementation && HAS_AUTH_KEYSTORE_JS) {
        // Use the external implementation
        return await this.authKeystoreImpl.setAuthorizedKey(provider, key, authToken, options);
      } else {
        // Use the local implementation
        // Verify capability token for key management
        const capabilityString = `${this.CAPABILITIES.KEY_MANAGE}:${provider}`;
        const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);

        if (!isAuthorized) {
          logger.warn(`Unauthorized key management attempt for ${provider}`);
          return false;
        }

        // Set the key in keystore
        return await this.keystore.setKey(provider, key, options);
      }
    } catch (error) {
      logger.error(`Failed to set authorized key for ${provider}: ${error.message}`);
      return false;
    }
  }

  /**
   * Delete an API key with capability verification
   * @param {string} provider - Service provider
   * @param {string} authToken - UCAN capability token
   * @returns {Promise<boolean>} - True if key was deleted successfully
   */
  async deleteAuthorizedKey(provider, authToken) {
    if (!this.initialized) {
      throw new Error("Integration module not initialized. Call init() first");
    }

    try {
      if (this.useExternalImplementation && HAS_AUTH_KEYSTORE_JS) {
        // Use the external implementation
        return await this.authKeystoreImpl.deleteAuthorizedKey(provider, authToken);
      } else {
        // Use the local implementation
        // Verify capability token for key management
        const capabilityString = `${this.CAPABILITIES.KEY_MANAGE}:${provider}`;
        const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);

        if (!isAuthorized) {
          logger.warn(`Unauthorized key deletion attempt for ${provider}`);
          return false;
        }

        // Delete the key from keystore
        return await this.keystore.deleteKey(provider);
      }
    } catch (error) {
      logger.error(`Failed to delete authorized key for ${provider}: ${error.message}`);
      return false;
    }
  }

  /**
   * List available API key providers with capability verification
   * @param {string} authToken - UCAN capability token
   * @returns {Promise<string[]|null>} - Array of provider names if authorized, null otherwise
   */
  async listAuthorizedProviders(authToken) {
    if (!this.initialized) {
      throw new Error("Integration module not initialized. Call init() first");
    }

    try {
      if (this.useExternalImplementation && HAS_AUTH_KEYSTORE_JS) {
        // Use the external implementation
        return await this.authKeystoreImpl.listAuthorizedProviders(authToken);
      } else {
        // Use the local implementation
        // Verify capability token for key listing
        const capabilityString = `${this.CAPABILITIES.KEY_LIST}:*`;
        const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);

        if (!isAuthorized) {
          logger.warn("Unauthorized key listing attempt");
          return null;
        }

        // Get providers from keystore
        return await this.keystore.listProviders();
      }
    } catch (error) {
      logger.error(`Failed to list authorized providers: ${error.message}`);
      return null;
    }
  }

  /**
   * Get API key information with capability verification
   * @param {string} provider - Service provider
   * @param {string} authToken - UCAN capability token
   * @returns {Promise<object|null>} - Key information if authorized, null otherwise
   */
  async getAuthorizedKeyInfo(provider, authToken) {
    if (!this.initialized) {
      throw new Error("Integration module not initialized. Call init() first");
    }

    try {
      if (this.useExternalImplementation && HAS_AUTH_KEYSTORE_JS) {
        // Use the external implementation
        return await this.authKeystoreImpl.getAuthorizedKeyInfo(provider, authToken);
      } else {
        // Use the local implementation
        // Verify capability token for key listing
        const capabilityString = `${this.CAPABILITIES.KEY_LIST}:${provider}`;
        const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);

        if (!isAuthorized) {
          logger.warn(`Unauthorized key info access attempt for ${provider}`);
          return null;
        }

        // Get key info from keystore
        return await this.keystore.getKeyInfo(provider);
      }
    } catch (error) {
      logger.error(`Failed to get authorized key info for ${provider}: ${error.message}`);
      return null;
    }
  }

  /**
   * Rotate an API key with capability verification
   * @param {string} provider - Service provider
   * @param {string} newKey - New API key
   * @param {string} authToken - UCAN capability token
   * @param {object} options - Additional options
   * @returns {Promise<boolean>} - True if key was rotated successfully
   */
  async rotateAuthorizedKey(provider, newKey, authToken, options = null) {
    if (!this.initialized) {
      throw new Error("Integration module not initialized. Call init() first");
    }

    try {
      if (this.useExternalImplementation && HAS_AUTH_KEYSTORE_JS) {
        // Use the external implementation
        return await this.authKeystoreImpl.rotateAuthorizedKey(provider, newKey, authToken, options);
      } else {
        // Use the local implementation
        // Verify capability token for key rotation
        const capabilityString = `${this.CAPABILITIES.KEY_ROTATE}:${provider}`;
        const isAuthorized = await this.auth.verifyCapability(authToken, capabilityString);

        if (!isAuthorized) {
          logger.warn(`Unauthorized key rotation attempt for ${provider}`);
          return false;
        }

        // Rotate the key in keystore
        return await this.keystore.rotateKey(provider, newKey, options);
      }
    } catch (error) {
      logger.error(`Failed to rotate authorized key for ${provider}: ${error.message}`);
      return false;
    }
  }

  /**
   * Issue API key access capability to a principal
   * @param {string} providerId - The provider to issue access for
   * @param {string} principalId - The principal to grant access to
   * @param {string} adminAuthToken - Admin capability token
   * @returns {Promise<object|null>} - The issued capability token, null if not authorized
   */
  async issueKeyAccessCapability(providerId, principalId, adminAuthToken) {
    if (!this.initialized) {
      throw new Error("Integration module not initialized. Call init() first");
    }

    try {
      if (this.useExternalImplementation && HAS_AUTH_KEYSTORE_JS) {
        // Use the external implementation
        return await this.authKeystoreImpl.issueKeyAccessCapability(
          providerId, principalId, adminAuthToken
        );
      } else {
        // Use the local implementation
        // Verify admin has management capability for provider
        const adminCapability = `${this.CAPABILITIES.KEY_MANAGE}:${providerId}`;
        const isAuthorized = await this.auth.verifyCapability(adminAuthToken, adminCapability);

        if (!isAuthorized) {
          logger.warn(`Unauthorized capability issuance attempt for ${providerId}`);
          return null;
        }

        // Issue key access capability to principal
        return await this.auth.issueCapability("root", principalId, {
          can: this.CAPABILITIES.KEY_ACCESS,
          with: providerId
        });
      }
    } catch (error) {
      logger.error(`Failed to issue key access capability for ${providerId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Run test method
   * @returns {Promise<object>} - Test results
   */
  async test() {
    logger.info("Testing auth/keystore integration module");

    try {
      if (this.useExternalImplementation && HAS_AUTH_KEYSTORE_JS) {
        // Use the external implementation but add integration info
        const testResults = await this.authKeystoreImpl.test();
        testResults.integration = {
          module: "auth_keystore_integration",
          package: "auth-keystore-js",
          integration_type: "wrapper",
          direct_implementation: false
        };
        return testResults;
      } else {
        // Use the local implementation
        const testResults = {
          success: true,
          module: "auth_keystore_integration",
          initialization: false,
          capabilities: false,
          authorized_operations: {
            get_key: false,
            set_key: false,
            delete_key: false,
            list_providers: false,
            get_info: false,
            rotate_key: false,
            issue_capability: false
          },
          integration: {
            module: "auth_keystore_integration",
            package: "auth-keystore-js",
            integration_type: "mock",
            direct_implementation: true,
            note: "Using local implementation because auth-keystore-js is not available"
          }
        };

        // Test initialization if not already initialized
        if (!this.initialized) {
          const initResult = await this.init();
          testResults.initialization = initResult;
        } else {
          testResults.initialization = true;
        }

        if (testResults.initialization) {
          // Create a test principal
          await this.auth.createPrincipal("test-user");

          // Issue admin capabilities to test user
          const adminToken = await this.auth.issueCapability("root", "test-user", {
            can: this.CAPABILITIES.KEY_MANAGE,
            with: "*"
          });

          // Verify admin token is valid
          const isAdmin = await this.auth.verifyCapability(
            adminToken.token,
            `${this.CAPABILITIES.KEY_MANAGE}:*`
          );

          testResults.capabilities = isAdmin;

          if (isAdmin) {
            // Test setting a key
            const testProvider = `test_provider_${Date.now()}`;
            const testKey = `test_api_key_${Date.now()}`;

            const setResult = await this.setAuthorizedKey(
              testProvider,
              testKey,
              adminToken.token
            );
            testResults.authorized_operations.set_key = setResult;

            if (setResult) {
              // Issue listing capability
              const listToken = await this.auth.issueCapability("root", "test-user", {
                can: this.CAPABILITIES.KEY_LIST,
                with: "*"
              });

              // Test listing providers
              const providers = await this.listAuthorizedProviders(listToken.token);
              testResults.authorized_operations.list_providers = (
                providers !== null &&
                Array.isArray(providers) &&
                providers.includes(testProvider)
              );

              // Test getting key info
              const keyInfo = await this.getAuthorizedKeyInfo(testProvider, listToken.token);
              testResults.authorized_operations.get_info = (
                keyInfo !== null &&
                keyInfo.provider === testProvider
              );

              // Issue access capability
              const accessToken = await this.auth.issueCapability("root", "test-user", {
                can: this.CAPABILITIES.KEY_ACCESS,
                with: testProvider
              });

              // Test getting a key
              const key = await this.getAuthorizedKey(testProvider, accessToken.token);
              testResults.authorized_operations.get_key = key === testKey;

              // Issue rotation capability
              const rotateToken = await this.auth.issueCapability("root", "test-user", {
                can: this.CAPABILITIES.KEY_ROTATE,
                with: testProvider
              });

              // Test rotating a key
              const newKey = `rotated_key_${Date.now()}`;
              const rotateResult = await this.rotateAuthorizedKey(
                testProvider,
                newKey,
                rotateToken.token
              );
              testResults.authorized_operations.rotate_key = rotateResult;

              // Issue a key access capability to another principal
              await this.auth.createPrincipal("another-user");

              const issuanceResult = await this.issueKeyAccessCapability(
                testProvider,
                "another-user",
                adminToken.token
              );
              testResults.authorized_operations.issue_capability = issuanceResult !== null;

              // Test deleting a key
              const deleteResult = await this.deleteAuthorizedKey(
                testProvider,
                adminToken.token
              );
              testResults.authorized_operations.delete_key = deleteResult;
            }
          }

          // Overall success
          testResults.success = (
            testResults.initialization &&
            testResults.capabilities &&
            Object.values(testResults.authorized_operations).every(Boolean)
          );
        }

        return testResults;
      }
    } catch (error) {
      logger.error(`Auth/keystore integration test failed: ${error.message}`);
      return {
        success: false,
        module: "auth_keystore_integration",
        error: error.message,
        integration: {
          module: "auth_keystore_integration",
          package: "auth-keystore-js",
          integration_type: "failed"
        }
      };
    }
  }
}

// Create default instance
const authKeystoreIntegration = new AuthKeystoreIntegration();

// For API compatibility with Python version
export function getAuthKeystoreIntegration() {
  return authKeystoreIntegration;
}

export default authKeystoreIntegration;