/**
 * Keystore Integration Layer
 *
 * This module serves as an integration layer for secure storage of API keys and credentials.
 * It integrates with the keystore-js package from npm which provides encrypted storage
 * and secure retrieval of sensitive information with platform-specific secure storage mechanisms.
 *
 * The module's responsibility is to:
 * 1. Import and provide access to keystore functionality from keystore-js
 * 2. Run comprehensive tests to ensure the keystore functionality works
 * 3. Integrate the keystore module with the resource pool
 * 4. Provide a unified interface for other components to securely store and retrieve credentials
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import util from 'util';

// Set up logging
const logger = {
  info: (msg) => console.log(`[INFO] Keystore: ${msg}`),
  warn: (msg) => console.warn(`[WARN] Keystore: ${msg}`),
  error: (msg) => console.error(`[ERROR] Keystore: ${msg}`),
  debug: (msg) => console.debug(`[DEBUG] Keystore: ${msg}`)
};

// Try to import keystore from keystore-js
let HAS_KEYSTORE_JS = false;
let KeystoreManager = null;
let keystore_js = null;

try {
  keystore_js = await import('keystore-js');
  KeystoreManager = keystore_js.KeystoreManager;
  HAS_KEYSTORE_JS = true;
  logger.info("KeyStore library loaded successfully");
} catch (error) {
  logger.warn(`keystore-js package not available, falling back to local implementation: ${error.message}`);
  logger.warn("To enable full keystore support, install: npm install keystore-js");
}

// For backwards compatibility - import platform storage
let HAS_SECURE_STORAGE = false;
let keytar = null;

try {
  keytar = await import('keytar');
  HAS_SECURE_STORAGE = true;
  logger.info("Platform secure storage available (keytar)");
} catch (error) {
  logger.warn("Platform secure storage not available, using file-based encryption only");
  logger.warn("To enable platform secure storage, install: npm install keytar");
}

// Constants
const DEFAULT_ENCRYPTION_ALGO = 'aes-256-gcm';
const KEYSTORE_VERSION = '1.0';
const AUTH_TAG_LENGTH = 16;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const KEY_ITERATIONS = 100000;
const DEFAULT_KEY_DIGEST = 'sha512';

/**
 * Keystore integration layer for secure API key and credential management.
 *
 * This class serves as an integration layer for the keystore-js package,
 * providing secure storage and retrieval of API keys and credentials.
 * If the keystore-js package is not available, it falls back to a local
 * implementation.
 */
export class Keystore {
  /**
   * Create a new Keystore instance
   * @param {object} options - Configuration options
   *    - encryption_key: Master encryption key (or env variable)
   *    - storage_location: Path to store encrypted keys
   *    - algorithm: Encryption algorithm to use
   */
  constructor(options = null) {
    options = options || {};
    this.initialized = false;

    // Common options for both implementations
    this.options = {
      encryption_key: options.encryption_key || process.env.KEYSTORE_MASTER_KEY,
      storage_location: options.storage_location || 
                        path.join(os.homedir(), ".hallucinate_app", "keystore"),
      algorithm: options.algorithm || DEFAULT_ENCRYPTION_ALGO,
      use_platform_storage: options.use_platform_storage !== undefined ? 
                           options.use_platform_storage : HAS_SECURE_STORAGE,
      use_external_implementation: options.use_external_implementation !== undefined ? 
                                  options.use_external_implementation : HAS_KEYSTORE_JS
    };

    // Check if we should use the external implementation
    if (!this.options.use_external_implementation) {
      logger.info("Using local keystore implementation");
      // Storage for keys - only ever stored in memory, never in plaintext on disk
      this.keys = {};

      // Metadata about key usage and rotation
      this.metadata = {
        version: KEYSTORE_VERSION,
        last_updated: null,
        last_rotation: null,
        access_counts: {}
      };

      // For encryption
      this.derivedKey = null;
      this._salt = null;
    } else {
      logger.info("Using keystore-js implementation");
      // Initialize the external implementation
      this.keystoreImpl = new KeystoreManager({
        encryption_key: this.options.encryption_key,
        storage_location: this.options.storage_location,
        algorithm: this.options.algorithm,
        use_platform_storage: this.options.use_platform_storage
      });
    }

    logger.info(`Keystore initialized with storage at ${this.options.storage_location}`);
  }

  /**
   * Initialize the keystore and load any existing keys
   * @returns {Promise<boolean>} - True if initialization successful
   */
  async init() {
    try {
      // Ensure master key exists
      if (!this.options.encryption_key) {
        throw new Error("No master encryption key provided. Set KEYSTORE_MASTER_KEY " +
                      "environment variable or pass encryption_key option");
      }

      if (this.options.use_external_implementation) {
        // Use the external implementation
        this.initialized = await this.keystoreImpl.init();
        return this.initialized;
      } else {
        // Use the local implementation
        // Create storage directory if needed
        fs.mkdirSync(this.options.storage_location, { recursive: true });

        // Derive a key from the master key for encryption
        await this._deriveEncryptionKey();

        // Try to load existing keystore
        await this._loadKeys();

        this.initialized = true;
        return true;
      }
    } catch (error) {
      logger.error(`Failed to initialize keystore: ${error.message}`);
      return false;
    }
  }

  /**
   * Derive encryption key from master key
   * @returns {Promise<boolean>} - True if key derivation successful
   */
  async _deriveEncryptionKey() {
    try {
      // Either use the provided key or derive one
      if (this.options.encryption_key.length >= 32) {
        // Use the raw key if it's long enough
        this.derivedKey = Buffer.from(this.options.encryption_key).slice(0, 32);
      } else {
        // Try to load the salt first
        this._loadSalt();

        // Generate a salt if we don't have one
        if (!this._salt) {
          this._salt = crypto.randomBytes(SALT_LENGTH);

          // Store the salt in the keystore directory
          const saltPath = path.join(this.options.storage_location, ".salt");
          fs.writeFileSync(saltPath, this._salt);
        }

        // Derive a key using PBKDF2
        this.derivedKey = crypto.pbkdf2Sync(
          this.options.encryption_key,
          this._salt,
          KEY_ITERATIONS,
          32,
          DEFAULT_KEY_DIGEST
        );
      }

      return true;
    } catch (error) {
      logger.error(`Failed to derive encryption key: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load the salt if it exists
   * @returns {boolean} - True if salt was loaded
   */
  _loadSalt() {
    const saltPath = path.join(this.options.storage_location, ".salt");
    if (fs.existsSync(saltPath)) {
      this._salt = fs.readFileSync(saltPath);
      return true;
    }
    return false;
  }

  /**
   * Load keys from storage
   * @returns {Promise<boolean>} - True if keys were loaded successfully
   */
  async _loadKeys() {
    const keystorePath = path.join(this.options.storage_location, "keystore.enc");

    try {
      // Try to load salt first
      this._loadSalt();

      // Check if keystore file exists
      if (!fs.existsSync(keystorePath)) {
        // No existing keystore, initialize with empty state
        this.keys = {};
        this.metadata = {
          version: KEYSTORE_VERSION,
          last_updated: new Date().toISOString(),
          last_rotation: null,
          access_counts: {}
        };
        return true;
      }

      // Read and decrypt the keystore
      const encryptedData = fs.readFileSync(keystorePath);

      // First 12 bytes are IV, next 16 bytes are auth tag, rest is ciphertext
      const iv = encryptedData.slice(0, IV_LENGTH);
      const authTag = encryptedData.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const ciphertext = encryptedData.slice(IV_LENGTH + AUTH_TAG_LENGTH);

      // Create cipher
      const decipher = crypto.createDecipheriv(
        DEFAULT_ENCRYPTION_ALGO,
        this.derivedKey,
        iv
      );
      
      // Set auth tag
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(ciphertext);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      // Parse the JSON
      const keystoreData = JSON.parse(decrypted.toString('utf8'));

      // Load into memory
      this.keys = keystoreData.keys || {};
      this.metadata = keystoreData.metadata || {
        version: KEYSTORE_VERSION,
        last_updated: new Date().toISOString(),
        last_rotation: null,
        access_counts: {}
      };

      return true;
    } catch (error) {
      logger.error(`Failed to load keystore: ${error.message}`);

      // Initialize with empty state on error
      this.keys = {};
      this.metadata = {
        version: KEYSTORE_VERSION,
        last_updated: new Date().toISOString(),
        last_rotation: null,
        access_counts: {}
      };

      return false;
    }
  }

  /**
   * Save keys to storage
   * @returns {Promise<boolean>} - True if keys were saved successfully
   */
  async _saveKeys() {
    const keystorePath = path.join(this.options.storage_location, "keystore.enc");

    try {
      // Update metadata
      this.metadata.last_updated = new Date().toISOString();

      // Create the keystore data object
      const keystoreData = {
        keys: this.keys,
        metadata: this.metadata
      };

      // Stringify the data
      const keystoreString = JSON.stringify(keystoreData);

      // Generate a random IV
      const iv = crypto.randomBytes(IV_LENGTH);

      // Create cipher
      const cipher = crypto.createCipheriv(
        DEFAULT_ENCRYPTION_ALGO,
        this.derivedKey,
        iv
      );

      // Encrypt the data
      let encrypted = cipher.update(keystoreString, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      // Get auth tag
      const authTag = cipher.getAuthTag();

      // Combine IV, auth tag and encrypted data
      const encryptedData = Buffer.concat([iv, authTag, encrypted]);

      // Write to disk
      fs.writeFileSync(keystorePath, encryptedData);

      return true;
    } catch (error) {
      logger.error(`Failed to save keystore: ${error.message}`);
      return false;
    }
  }

  /**
   * Store a key in the keystore
   * @param {string} provider - Service provider (e.g., 'openai', 'huggingface')
   * @param {string} key - API key to store
   * @param {object} options - Additional options
   *    - name: Optional name for the key
   *    - expires_at: Optional expiration date
   * @returns {Promise<boolean>} - True if key was stored successfully
   */
  async setKey(provider, key, options = null) {
    if (!this.initialized) {
      throw new Error("Keystore not initialized. Call init() first");
    }

    options = options || {};

    try {
      if (this.options.use_external_implementation) {
        // Use the external implementation
        return await this.keystoreImpl.setKey(provider, key, options);
      } else {
        // Use the local implementation
        // If using platform storage, also store there as backup
        if (this.options.use_platform_storage && keytar) {
          const serviceName = `hallucinate_app_${provider}`;
          await keytar.setPassword(serviceName, "apikey", key);
        }

        // Create or update the key entry
        this.keys[provider] = {
          key: key,
          name: options.name || "default",
          created_at: new Date().toISOString(),
          expires_at: options.expires_at ? new Date(options.expires_at).toISOString() : null,
          last_used: null,
          use_count: 0
        };

        // Initialize access count
        if (!this.metadata.access_counts[provider]) {
          this.metadata.access_counts[provider] = 0;
        }

        // Save to disk
        await this._saveKeys();

        return true;
      }
    } catch (error) {
      logger.error(`Failed to set key for ${provider}: ${error.message}`);
      return false;
    }
  }

  /**
   * Retrieve a key from the keystore
   * @param {string} provider - Service provider to get key for
   * @returns {Promise<string|null>} - The API key or null if not found or expired
   */
  async getKey(provider) {
    if (!this.initialized) {
      throw new Error("Keystore not initialized. Call init() first");
    }

    try {
      if (this.options.use_external_implementation) {
        // Use the external implementation
        return await this.keystoreImpl.getKey(provider);
      } else {
        // Use the local implementation
        // Check if key exists
        if (!this.keys[provider]) {
          // Try platform storage as fallback
          if (this.options.use_platform_storage && keytar) {
            try {
              const serviceName = `hallucinate_app_${provider}`;
              const key = await keytar.getPassword(serviceName, "apikey");
              if (key) {
                // Add it to our store for future use
                await this.setKey(provider, key);
                return key;
              }
            } catch (e) {
              logger.warn(`Failed to retrieve key from platform storage: ${e.message}`);
            }
          }
          return null;
        }

        // Check expiration
        if (this.keys[provider].expires_at) {
          const expiresAt = new Date(this.keys[provider].expires_at);
          if (expiresAt < new Date()) {
            logger.warn(`Key for ${provider} has expired`);
            return null;
          }
        }

        // Update usage stats
        this.keys[provider].last_used = new Date().toISOString();
        this.keys[provider].use_count += 1;
        this.metadata.access_counts[provider] += 1;

        // Autosave after every 10 accesses
        if (this.metadata.access_counts[provider] % 10 === 0) {
          await this._saveKeys();
        }

        return this.keys[provider].key;
      }
    } catch (error) {
      logger.error(`Failed to get key for ${provider}: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete a key from the keystore
   * @param {string} provider - Service provider to delete key for
   * @returns {Promise<boolean>} - True if key was deleted successfully
   */
  async deleteKey(provider) {
    if (!this.initialized) {
      throw new Error("Keystore not initialized. Call init() first");
    }

    try {
      if (this.options.use_external_implementation) {
        // Use the external implementation
        return await this.keystoreImpl.deleteKey(provider);
      } else {
        // Use the local implementation
        // Check if key exists
        if (!this.keys[provider]) {
          return false;
        }

        // Delete from platform storage if used
        if (this.options.use_platform_storage && keytar) {
          try {
            const serviceName = `hallucinate_app_${provider}`;
            await keytar.deletePassword(serviceName, "apikey");
          } catch (e) {
            logger.warn(`Failed to delete from platform storage: ${e.message}`);
          }
        }

        // Delete the key
        delete this.keys[provider];

        // Save to disk
        await this._saveKeys();

        return true;
      }
    } catch (error) {
      logger.error(`Failed to delete key for ${provider}: ${error.message}`);
      return false;
    }
  }

  /**
   * List all providers with stored keys
   * @returns {Promise<string[]>} - Array of provider names
   */
  async listProviders() {
    if (!this.initialized) {
      throw new Error("Keystore not initialized. Call init() first");
    }

    if (this.options.use_external_implementation) {
      // Use the external implementation
      return await this.keystoreImpl.listProviders();
    } else {
      // Use the local implementation
      return Object.keys(this.keys);
    }
  }

  /**
   * Get information about a key without exposing the key itself
   * @param {string} provider - Service provider to get info for
   * @returns {Promise<object|null>} - Key information or null if not found
   */
  async getKeyInfo(provider) {
    if (!this.initialized) {
      throw new Error("Keystore not initialized. Call init() first");
    }

    try {
      if (this.options.use_external_implementation) {
        // Use the external implementation
        return await this.keystoreImpl.getKeyInfo(provider);
      } else {
        // Use the local implementation
        // Check if key exists
        if (!this.keys[provider]) {
          return null;
        }

        // Return key info without the actual key
        const keyInfo = { ...this.keys[provider] };
        delete keyInfo.key;

        // Add additional processed information
        let isExpired = false;
        if (keyInfo.expires_at) {
          const expiresAt = new Date(keyInfo.expires_at);
          isExpired = expiresAt < new Date();
        }

        return {
          provider: provider,
          ...keyInfo,
          is_expired: isExpired
        };
      }
    } catch (error) {
      logger.error(`Failed to get key info for ${provider}: ${error.message}`);
      return null;
    }
  }

  /**
   * Rotate a key (update to a new value)
   * @param {string} provider - Service provider to rotate key for
   * @param {string} newKey - New API key
   * @param {object} options - Additional options
   * @returns {Promise<boolean>} - True if key was rotated successfully
   */
  async rotateKey(provider, newKey, options = null) {
    if (!this.initialized) {
      throw new Error("Keystore not initialized. Call init() first");
    }

    options = options || {};

    try {
      if (this.options.use_external_implementation) {
        // Use the external implementation
        return await this.keystoreImpl.rotateKey(provider, newKey, options);
      } else {
        // Use the local implementation
        // Check if key exists
        if (!this.keys[provider]) {
          return false;
        }

        // Get current key info
        const currentKeyInfo = { ...this.keys[provider] };
        delete currentKeyInfo.key;

        // Rotate in platform storage if used
        if (this.options.use_platform_storage && keytar) {
          try {
            const serviceName = `hallucinate_app_${provider}`;
            await keytar.setPassword(serviceName, "apikey", newKey);
          } catch (e) {
            logger.warn(`Failed to update platform storage: ${e.message}`);
          }
        }

        // Create updated key entry
        this.keys[provider] = {
          key: newKey,
          name: options.name || currentKeyInfo.name || "default",
          created_at: new Date().toISOString(),
          expires_at: options.expires_at ? new Date(options.expires_at).toISOString() : currentKeyInfo.expires_at,
          last_used: null,
          use_count: 0,
          rotated_from: {
            created_at: currentKeyInfo.created_at,
            rotated_at: new Date().toISOString()
          }
        };

        // Update metadata
        this.metadata.last_rotation = new Date().toISOString();

        // Save to disk
        await this._saveKeys();

        return true;
      }
    } catch (error) {
      logger.error(`Failed to rotate key for ${provider}: ${error.message}`);
      return false;
    }
  }

  /**
   * Run a self-test on the keystore
   * @returns {Promise<object>} - Test results
   */
  async test() {
    logger.info("Testing keystore module");

    try {
      if (this.options.use_external_implementation) {
        // Use the external implementation but add integration info
        const testResults = await this.keystoreImpl.test();
        testResults.integration = {
          module: "keystore",
          package: "keystore-js",
          integration_type: "wrapper",
          direct_implementation: false
        };
        return testResults;
      } else {
        // Use the local implementation
        const testResults = {
          success: true,
          module: "keystore",
          initialization: false,
          key_operations: {
            set: false,
            get: false,
            info: false,
            delete: false,
            rotate: false
          },
          persistence: false,
          integration: {
            module: "keystore",
            package: "keystore-js",
            integration_type: "mock",
            direct_implementation: true,
            note: "Using local implementation because keystore-js is not available"
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
          // Test key operations with a test provider
          const testProvider = `test_provider_${Date.now()}`;
          const testKey = `test_api_key_${Date.now()}`;

          // Test setting a key
          const setResult = await this.setKey(testProvider, testKey);
          testResults.key_operations.set = setResult;

          if (setResult) {
            // Test getting key info
            const infoResult = await this.getKeyInfo(testProvider);
            testResults.key_operations.info = infoResult !== null;

            // Test getting a key
            const getResult = await this.getKey(testProvider);
            testResults.key_operations.get = getResult === testKey;

            // Test rotating a key
            const rotateKey = `rotated_key_${Date.now()}`;
            const rotateResult = await this.rotateKey(testProvider, rotateKey);
            testResults.key_operations.rotate = rotateResult;

            // Verify rotation worked
            const getRotatedResult = await this.getKey(testProvider);
            const rotationVerified = getRotatedResult === rotateKey;

            // Test deleting a key
            const deleteResult = await this.deleteKey(testProvider);
            testResults.key_operations.delete = deleteResult;
          }

          // Test persistence by saving and reloading
          const testProvider2 = `test_provider_persistence_${Date.now()}`;
          const testKey2 = `test_persistence_key_${Date.now()}`;

          await this.setKey(testProvider2, testKey2);
          await this._saveKeys();

          // Create a new instance to test loading
          const tempKeystore = new Keystore(this.options);
          await tempKeystore.init();

          const persistedKey = await tempKeystore.getKey(testProvider2);
          testResults.persistence = persistedKey === testKey2;

          // Clean up
          await this.deleteKey(testProvider2);
        }

        // Update overall success
        testResults.success = (
          testResults.initialization &&
          Object.values(testResults.key_operations).every(Boolean) &&
          testResults.persistence
        );

        return testResults;
      }
    } catch (error) {
      logger.error(`Keystore test failed: ${error.message}`);
      return {
        success: false,
        module: "keystore",
        error: error.message,
        integration: {
          module: "keystore",
          package: "keystore-js",
          integration_type: "failed"
        }
      };
    }
  }

  /**
   * Factory method to create and initialize a keystore instance
   * @param {object} options - Configuration options
   * @returns {Promise<Keystore>} - Initialized keystore instance
   */
  static async create(options = null) {
    // Check if we should use the external implementation
    options = options || {};

    const useExternal = options.use_external_implementation !== undefined ? 
                        options.use_external_implementation : HAS_KEYSTORE_JS;

    // Log which implementation we're using
    if (useExternal && HAS_KEYSTORE_JS) {
      logger.info("Using keystore-js implementation for keystore (factory method)");
    } else {
      logger.info("Using local implementation for keystore (factory method)");
    }

    // Create and initialize the keystore
    const keystore = new Keystore(options);
    await keystore.init();
    return keystore;
  }
}

// Create default instance
const keystore = new Keystore();

// For API compatibility with Python version
export function getKeystore() {
  return keystore;
}

export default keystore;