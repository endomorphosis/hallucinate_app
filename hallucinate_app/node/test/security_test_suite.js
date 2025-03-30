/**
 * Security Test Suite
 * 
 * Comprehensive testing framework for security components in hallucinate_app
 * Tests authentication, keystore, integration layers, and secure managers
 */

import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Import security components
import { authManager } from '../auth.js';
import { keystore } from '../keystore.js';
import { authKeystoreIntegration } from '../auth_keystore_integration.js';
import usageTracker from '../usage_tracker.js';

// Test utilities
const TEST_DIR = path.join(os.tmpdir(), 'hallucinate_app_security_tests');

/**
 * Security Test Suite
 * Runs comprehensive tests for all security components
 */
export class SecurityTestSuite extends EventEmitter {
  /**
   * Create a new security test suite
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    super();
    
    this.options = {
      verbose: false,
      cleanupAfterTests: true,
      timeoutMs: 30000,
      ...options
    };
    
    this.results = {
      success: false,
      modules: {},
      timestamp: new Date().toISOString(),
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      duration: 0
    };
    
    this.testModules = {
      auth: {
        name: 'Authentication System',
        instance: authManager,
        tests: this.getAuthTests()
      },
      keystore: {
        name: 'Keystore',
        instance: keystore,
        tests: this.getKeystoreTests()
      },
      integration: {
        name: 'Auth-Keystore Integration',
        instance: authKeystoreIntegration,
        tests: this.getIntegrationTests()
      },
      secureManagers: {
        name: 'Secure Managers',
        tests: this.getSecureManagerTests()
      },
      usageTracking: {
        name: 'Usage Tracking',
        instance: usageTracker,
        tests: this.getUsageTrackingTests()
      },
      endToEnd: {
        name: 'End-to-End Security',
        tests: this.getEndToEndTests()
      }
    };
    
    // Create test directory
    this.setupTestEnvironment();
  }
  
  /**
   * Set up test environment
   */
  setupTestEnvironment() {
    try {
      // Create test directory if it doesn't exist
      if (!fs.existsSync(TEST_DIR)) {
        fs.mkdirSync(TEST_DIR, { recursive: true });
      }
      
      // Set up test subdirectories
      const subdirs = ['auth', 'keystore', 'integration', 'managers', 'usage'];
      
      for (const dir of subdirs) {
        const dirPath = path.join(TEST_DIR, dir);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      }
    } catch (error) {
      console.error('Failed to set up test environment:', error);
      throw new Error(`Test environment setup failed: ${error.message}`);
    }
  }
  
  /**
   * Clean up test environment
   */
  cleanupTestEnvironment() {
    if (!this.options.cleanupAfterTests) return;
    
    try {
      // Remove test directory
      if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('Failed to clean up test environment:', error);
    }
  }
  
  /**
   * Run all security tests
   * @returns {Promise<Object>} Test results
   */
  async runAllTests() {
    this.log('Starting security test suite');
    
    const startTime = Date.now();
    
    try {
      // Initialize components if needed
      await this.initializeComponents();
      
      // Run tests for each module
      for (const [moduleId, module] of Object.entries(this.testModules)) {
        this.log(`Running tests for ${module.name}`);
        this.emit('module-start', { moduleId, name: module.name });
        
        this.results.modules[moduleId] = await this.runModuleTests(moduleId, module);
        
        this.emit('module-complete', { 
          moduleId, 
          name: module.name, 
          results: this.results.modules[moduleId] 
        });
      }
      
      // Calculate overall results
      const duration = Date.now() - startTime;
      
      this.results.duration = duration;
      this.results.totalTests = Object.values(this.results.modules)
        .reduce((sum, mod) => sum + mod.totalTests, 0);
        
      this.results.passedTests = Object.values(this.results.modules)
        .reduce((sum, mod) => sum + mod.passedTests, 0);
        
      this.results.failedTests = Object.values(this.results.modules)
        .reduce((sum, mod) => sum + mod.failedTests, 0);
        
      this.results.skippedTests = Object.values(this.results.modules)
        .reduce((sum, mod) => sum + mod.skippedTests, 0);
        
      this.results.success = this.results.failedTests === 0;
      
      this.log(`Test suite completed in ${duration}ms`);
      this.log(`${this.results.passedTests} passed, ${this.results.failedTests} failed, ${this.results.skippedTests} skipped`);
      
      // Clean up test environment
      this.cleanupTestEnvironment();
      
      this.emit('suite-complete', this.results);
      
      return this.results;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.results.success = false;
      this.results.duration = duration;
      this.results.error = error.message;
      this.results.errorStack = error.stack;
      
      this.log(`Test suite failed: ${error.message}`, 'error');
      
      // Clean up test environment
      this.cleanupTestEnvironment();
      
      this.emit('suite-error', { error, results: this.results });
      
      return this.results;
    }
  }
  
  /**
   * Initialize components for testing
   */
  async initializeComponents() {
    this.log('Initializing components for testing');
    
    // Initialize auth manager if needed
    if (!authManager.initialized) {
      await authManager.init();
    }
    
    // Initialize keystore if needed
    if (!keystore.initialized) {
      await keystore.init();
    }
    
    // Initialize integration if needed
    if (!authKeystoreIntegration.initialized) {
      await authKeystoreIntegration.init();
    }
  }
  
  /**
   * Run tests for a specific module
   * @param {string} moduleId Module ID
   * @param {Object} module Module configuration
   * @returns {Promise<Object>} Module test results
   */
  async runModuleTests(moduleId, module) {
    const moduleResults = {
      name: module.name,
      success: true,
      totalTests: module.tests.length,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      tests: {}
    };
    
    for (const test of module.tests) {
      this.log(`Running test: ${test.name}`);
      this.emit('test-start', { moduleId, testName: test.name });
      
      // Skip test if needed
      if (test.skip) {
        this.log(`Skipping test: ${test.name}`);
        moduleResults.tests[test.id] = {
          name: test.name,
          status: 'skipped',
          message: test.skipReason || 'Test skipped'
        };
        moduleResults.skippedTests++;
        
        this.emit('test-skip', { moduleId, testName: test.name, reason: test.skipReason });
        continue;
      }
      
      // Run test with timeout
      try {
        const result = await this.runTestWithTimeout(test, module.instance);
        
        if (result.success) {
          moduleResults.passedTests++;
          moduleResults.tests[test.id] = {
            name: test.name,
            status: 'passed',
            duration: result.duration
          };
          
          this.log(`Test passed: ${test.name} (${result.duration}ms)`);
          this.emit('test-pass', { moduleId, testName: test.name, duration: result.duration });
        } else {
          moduleResults.failedTests++;
          moduleResults.success = false;
          moduleResults.tests[test.id] = {
            name: test.name,
            status: 'failed',
            error: result.error,
            errorStack: result.errorStack,
            duration: result.duration
          };
          
          this.log(`Test failed: ${test.name} - ${result.error}`, 'error');
          this.emit('test-fail', { 
            moduleId, 
            testName: test.name, 
            error: result.error,
            duration: result.duration
          });
        }
      } catch (error) {
        moduleResults.failedTests++;
        moduleResults.success = false;
        moduleResults.tests[test.id] = {
          name: test.name,
          status: 'error',
          error: error.message,
          errorStack: error.stack
        };
        
        this.log(`Test error: ${test.name} - ${error.message}`, 'error');
        this.emit('test-error', { moduleId, testName: test.name, error });
      }
    }
    
    return moduleResults;
  }
  
  /**
   * Run a test with timeout
   * @param {Object} test Test configuration
   * @param {Object} instance Module instance
   * @returns {Promise<Object>} Test result
   */
  async runTestWithTimeout(test, instance) {
    return new Promise((resolve) => {
      let timeoutId;
      let completed = false;
      
      // Create timeout
      if (this.options.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          if (completed) return;
          completed = true;
          
          resolve({
            success: false,
            error: `Test timed out after ${this.options.timeoutMs}ms`,
            duration: this.options.timeoutMs
          });
        }, this.options.timeoutMs);
      }
      
      // Run test
      const startTime = Date.now();
      
      // Track the test with usage tracker
      usageTracker.trackEvent('security_test_suite', `test_${test.id}`, {
        name: test.name,
        module: test.module
      });
      
      Promise.resolve().then(() => {
        return test.test(instance);
      }).then(result => {
        if (completed) return;
        completed = true;
        
        // Clear timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        const duration = Date.now() - startTime;
        
        resolve({
          success: true,
          duration,
          result
        });
      }).catch(error => {
        if (completed) return;
        completed = true;
        
        // Clear timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        const duration = Date.now() - startTime;
        
        resolve({
          success: false,
          error: error.message,
          errorStack: error.stack,
          duration
        });
      });
    });
  }
  
  /**
   * Get auth tests
   * @returns {Array} Auth tests
   */
  getAuthTests() {
    return [
      {
        id: 'auth_init',
        name: 'Auth Manager Initialization',
        module: 'auth',
        test: async (auth) => {
          // Verify auth is initialized
          if (!auth.initialized) {
            await auth.init();
          }
          
          if (!auth.initialized) {
            throw new Error('Auth manager failed to initialize');
          }
          
          return true;
        }
      },
      {
        id: 'auth_create_principal',
        name: 'Create Principal',
        module: 'auth',
        test: async (auth) => {
          const principalId = `test_principal_${Date.now()}`;
          
          // Create principal
          await auth.createPrincipal(principalId);
          
          // Verify principal exists
          if (!auth.principals[principalId]) {
            throw new Error(`Principal ${principalId} not found after creation`);
          }
          
          return true;
        }
      },
      {
        id: 'auth_issue_capability',
        name: 'Issue Capability Token',
        module: 'auth',
        test: async (auth) => {
          const issuerId = 'root';
          const audienceId = `test_principal_${Date.now()}`;
          
          // Create audience principal if it doesn't exist
          if (!auth.principals[audienceId]) {
            await auth.createPrincipal(audienceId);
          }
          
          // Create capability
          const capability = {
            can: 'test:action',
            with: 'test:resource'
          };
          
          // Issue capability
          const token = await auth.issueCapability(issuerId, audienceId, capability);
          
          // Verify token exists
          if (!token) {
            throw new Error('Failed to issue capability token');
          }
          
          // Verify token
          const isValid = await auth.verifyCapability(token, 'test:action:test:resource');
          
          if (!isValid) {
            throw new Error('Capability token verification failed');
          }
          
          return true;
        }
      },
      {
        id: 'auth_verify_capability',
        name: 'Verify Capability',
        module: 'auth',
        test: async (auth) => {
          const issuerId = 'root';
          const audienceId = `test_principal_${Date.now()}`;
          
          // Create audience principal if it doesn't exist
          if (!auth.principals[audienceId]) {
            await auth.createPrincipal(audienceId);
          }
          
          // Create capability
          const capability = {
            can: 'test:read',
            with: 'test:document'
          };
          
          // Issue capability
          const token = await auth.issueCapability(issuerId, audienceId, capability);
          
          // Test verification
          const validResult = await auth.verifyCapability(token, 'test:read:test:document');
          if (!validResult) {
            throw new Error('Capability verification failed for valid token');
          }
          
          // Test invalid verification
          const invalidResult = await auth.verifyCapability(token, 'test:write:test:document');
          if (invalidResult) {
            throw new Error('Capability verification passed for invalid action');
          }
          
          return true;
        }
      },
      {
        id: 'auth_revoke_capability',
        name: 'Revoke Capability',
        module: 'auth',
        test: async (auth) => {
          const issuerId = 'root';
          const audienceId = `test_principal_${Date.now()}`;
          
          // Create audience principal if it doesn't exist
          if (!auth.principals[audienceId]) {
            await auth.createPrincipal(audienceId);
          }
          
          // Create capability
          const capability = {
            can: 'test:delete',
            with: 'test:resource'
          };
          
          // Issue capability
          const token = await auth.issueCapability(issuerId, audienceId, capability);
          
          // Get token ID
          const tokenId = Object.keys(auth.tokens).find(id => auth.tokens[id].token === token);
          
          if (!tokenId) {
            throw new Error('Token ID not found');
          }
          
          // Verify token works before revocation
          const validBeforeRevoke = await auth.verifyCapability(token, 'test:delete:test:resource');
          if (!validBeforeRevoke) {
            throw new Error('Token should be valid before revocation');
          }
          
          // Revoke capability
          await auth.revokeCapability(tokenId);
          
          // Verify token doesn't work after revocation
          const validAfterRevoke = await auth.verifyCapability(token, 'test:delete:test:resource');
          if (validAfterRevoke) {
            throw new Error('Token should be invalid after revocation');
          }
          
          return true;
        }
      },
      {
        id: 'auth_wildcards',
        name: 'Capability Wildcards',
        module: 'auth',
        test: async (auth) => {
          const issuerId = 'root';
          const audienceId = `test_principal_${Date.now()}`;
          
          // Create audience principal if it doesn't exist
          if (!auth.principals[audienceId]) {
            await auth.createPrincipal(audienceId);
          }
          
          // Create wildcard capability
          const capability = {
            can: 'test:action',
            with: '*'
          };
          
          // Issue capability
          const token = await auth.issueCapability(issuerId, audienceId, capability);
          
          // Test wildcard verification
          const resources = [
            'test:resource1',
            'test:resource2',
            'other:resource'
          ];
          
          for (const resource of resources) {
            const capString = `test:action:${resource}`;
            const valid = await auth.verifyCapability(token, capString);
            
            if (!valid) {
              throw new Error(`Wildcard capability failed for ${capString}`);
            }
          }
          
          return true;
        }
      }
    ];
  }
  
  /**
   * Get keystore tests
   * @returns {Array} Keystore tests
   */
  getKeystoreTests() {
    return [
      {
        id: 'keystore_init',
        name: 'Keystore Initialization',
        module: 'keystore',
        test: async (keystore) => {
          // Verify keystore is initialized
          if (!keystore.initialized) {
            await keystore.init();
          }
          
          if (!keystore.initialized) {
            throw new Error('Keystore failed to initialize');
          }
          
          return true;
        }
      },
      {
        id: 'keystore_set_get_key',
        name: 'Set and Get API Key',
        module: 'keystore',
        test: async (keystore) => {
          const provider = `test_provider_${Date.now()}`;
          const key = `test_key_${Date.now()}`;
          
          // Set key
          await keystore.setKey(provider, key);
          
          // Get key
          const retrievedKey = await keystore.getKey(provider);
          
          if (retrievedKey !== key) {
            throw new Error('Retrieved key does not match set key');
          }
          
          return true;
        }
      },
      {
        id: 'keystore_delete_key',
        name: 'Delete API Key',
        module: 'keystore',
        test: async (keystore) => {
          const provider = `test_provider_${Date.now()}`;
          const key = `test_key_${Date.now()}`;
          
          // Set key
          await keystore.setKey(provider, key);
          
          // Delete key
          await keystore.deleteKey(provider);
          
          // Verify key is deleted
          try {
            const retrievedKey = await keystore.getKey(provider);
            
            if (retrievedKey) {
              throw new Error('Key should be deleted');
            }
          } catch (error) {
            // Expected error when key doesn't exist
            if (!error.message.includes('not found')) {
              throw error;
            }
          }
          
          return true;
        }
      },
      {
        id: 'keystore_set_with_options',
        name: 'Set Key with Options',
        module: 'keystore',
        test: async (keystore) => {
          const provider = `test_provider_${Date.now()}`;
          const key = `test_key_${Date.now()}`;
          
          const options = {
            name: 'Test Key',
            expires_at: new Date(Date.now() + 86400000).toISOString() // 1 day
          };
          
          // Set key with options
          await keystore.setKey(provider, key, options);
          
          // Get key info
          const keyInfo = await keystore.getKeyInfo(provider);
          
          // Verify options were saved
          if (!keyInfo) {
            throw new Error('Key info not found');
          }
          
          if (keyInfo.name !== options.name) {
            throw new Error('Key name does not match');
          }
          
          if (keyInfo.expires_at !== options.expires_at) {
            throw new Error('Key expiration does not match');
          }
          
          return true;
        }
      },
      {
        id: 'keystore_key_expiration',
        name: 'Key Expiration',
        module: 'keystore',
        test: async (keystore) => {
          const provider = `test_provider_${Date.now()}`;
          const key = `test_key_${Date.now()}`;
          
          // Set expired key
          const expiredDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
          
          await keystore.setKey(provider, key, {
            expires_at: expiredDate
          });
          
          // Get key info
          const keyInfo = await keystore.getKeyInfo(provider);
          
          // Verify key is marked as expired
          if (!keyInfo.is_expired) {
            throw new Error('Key should be marked as expired');
          }
          
          return true;
        }
      },
      {
        id: 'keystore_rotate_key',
        name: 'Rotate API Key',
        module: 'keystore',
        test: async (keystore) => {
          const provider = `test_provider_${Date.now()}`;
          const originalKey = `original_key_${Date.now()}`;
          const newKey = `new_key_${Date.now()}`;
          
          // Set original key
          await keystore.setKey(provider, originalKey, {
            name: 'Original Key'
          });
          
          // Rotate key
          await keystore.rotateKey(provider, newKey);
          
          // Get key
          const retrievedKey = await keystore.getKey(provider);
          
          if (retrievedKey !== newKey) {
            throw new Error('Key was not rotated correctly');
          }
          
          // Get key info
          const keyInfo = await keystore.getKeyInfo(provider);
          
          // Verify rotation history
          if (!keyInfo.rotated_from) {
            throw new Error('Rotation history not recorded');
          }
          
          if (!keyInfo.rotated_from.created_at) {
            throw new Error('Original key creation time not recorded');
          }
          
          return true;
        }
      }
    ];
  }
  
  /**
   * Get integration tests
   * @returns {Array} Integration tests
   */
  getIntegrationTests() {
    return [
      {
        id: 'integration_init',
        name: 'Auth-Keystore Integration Initialization',
        module: 'integration',
        test: async (integration) => {
          // Verify integration is initialized
          if (!integration.initialized) {
            await integration.init();
          }
          
          if (!integration.initialized) {
            throw new Error('Auth-Keystore integration failed to initialize');
          }
          
          return true;
        }
      },
      {
        id: 'integration_authorized_key',
        name: 'Get Authorized Key',
        module: 'integration',
        test: async (integration) => {
          // Set up test
          const provider = `test_provider_${Date.now()}`;
          const key = `test_key_${Date.now()}`;
          
          // Set key in keystore
          await keystore.setKey(provider, key);
          
          // Get token for key access
          const token = await authManager.getCapabilityToken(`${integration.CAPABILITIES.KEY_ACCESS}:${provider}`);
          
          // Get authorized key
          const retrievedKey = await integration.getAuthorizedKey(provider, token);
          
          if (retrievedKey !== key) {
            throw new Error('Retrieved key does not match set key');
          }
          
          return true;
        }
      },
      {
        id: 'integration_unauthorized_key',
        name: 'Unauthorized Key Access',
        module: 'integration',
        test: async (integration) => {
          // Set up test
          const provider = `test_provider_${Date.now()}`;
          const key = `test_key_${Date.now()}`;
          
          // Set key in keystore
          await keystore.setKey(provider, key);
          
          // Get token for different provider
          const token = await authManager.getCapabilityToken(`${integration.CAPABILITIES.KEY_ACCESS}:different_provider`);
          
          // Try to get unauthorized key
          try {
            await integration.getAuthorizedKey(provider, token);
            throw new Error('Should not be able to access unauthorized key');
          } catch (error) {
            // Expected error
            if (!error.message.includes('Unauthorized')) {
              throw error;
            }
          }
          
          return true;
        }
      },
      {
        id: 'integration_key_management',
        name: 'Authorized Key Management',
        module: 'integration',
        test: async (integration) => {
          // Set up test
          const provider = `test_provider_${Date.now()}`;
          const key = `test_key_${Date.now()}`;
          
          // Get management token
          const token = await authManager.getCapabilityToken(`${integration.CAPABILITIES.KEY_MANAGE}:${provider}`);
          
          // Set authorized key
          await integration.setAuthorizedKey(provider, key, token);
          
          // Get authorized key info
          const keyInfo = await integration.getAuthorizedKeyInfo(provider, token);
          
          if (!keyInfo) {
            throw new Error('Key info not found');
          }
          
          // Delete authorized key
          await integration.deleteAuthorizedKey(provider, token);
          
          // Verify key is deleted
          try {
            await keystore.getKey(provider);
            throw new Error('Key should be deleted');
          } catch (error) {
            // Expected error when key doesn't exist
            if (!error.message.includes('not found')) {
              throw error;
            }
          }
          
          return true;
        }
      },
      {
        id: 'integration_key_rotation',
        name: 'Authorized Key Rotation',
        module: 'integration',
        test: async (integration) => {
          // Set up test
          const provider = `test_provider_${Date.now()}`;
          const originalKey = `original_key_${Date.now()}`;
          const newKey = `new_key_${Date.now()}`;
          
          // Get tokens
          const manageToken = await authManager.getCapabilityToken(`${integration.CAPABILITIES.KEY_MANAGE}:${provider}`);
          const rotateToken = await authManager.getCapabilityToken(`${integration.CAPABILITIES.KEY_ROTATE}:${provider}`);
          
          // Set original key
          await integration.setAuthorizedKey(provider, originalKey, manageToken);
          
          // Rotate key
          await integration.rotateAuthorizedKey(provider, newKey, rotateToken);
          
          // Get key
          const accessToken = await authManager.getCapabilityToken(`${integration.CAPABILITIES.KEY_ACCESS}:${provider}`);
          const retrievedKey = await integration.getAuthorizedKey(provider, accessToken);
          
          if (retrievedKey !== newKey) {
            throw new Error('Key was not rotated correctly');
          }
          
          return true;
        }
      },
      {
        id: 'integration_provider_listing',
        name: 'List Authorized Providers',
        module: 'integration',
        test: async (integration) => {
          // Set up test
          const providers = [
            `test_provider1_${Date.now()}`,
            `test_provider2_${Date.now()}`
          ];
          
          // Get tokens
          const manageToken = await authManager.getCapabilityToken(`${integration.CAPABILITIES.KEY_MANAGE}:*`);
          const listToken = await authManager.getCapabilityToken(`${integration.CAPABILITIES.KEY_LIST}:*`);
          
          // Add keys
          for (const provider of providers) {
            await integration.setAuthorizedKey(provider, `key_${provider}`, manageToken);
          }
          
          // List providers
          const listedProviders = await integration.listAuthorizedProviders(listToken);
          
          // Verify all test providers are in the list
          for (const provider of providers) {
            if (!listedProviders.includes(provider)) {
              throw new Error(`Provider ${provider} not found in list`);
            }
          }
          
          return true;
        }
      }
    ];
  }
  
  /**
   * Get secure manager tests
   * @returns {Array} Secure manager tests
   */
  getSecureManagerTests() {
    return [
      {
        id: 'secure_manager_pattern',
        name: 'Secure Manager Pattern',
        module: 'secureManagers',
        test: async () => {
          // Create a test secure manager
          class TestSecureManager {
            constructor(resources = null, metadata = null) {
              this.resources = resources || {};
              this.metadata = metadata || {};
              this.initialized = false;
              this.auth = this.resources.auth || authManager;
            }
            
            async init() {
              if (this.initialized) return true;
              
              // Initialize dependencies
              if (this.auth && !this.auth.initialized) {
                await this.auth.init();
              }
              
              this.initialized = true;
              return true;
            }
            
            async secureOperation(authToken, data) {
              // Verify capability
              const isAuthorized = await this.auth.verifyCapability(
                authToken, 
                'test:secureOperation:*'
              );
              
              if (!isAuthorized) {
                throw new Error('Unauthorized operation');
              }
              
              // Perform operation
              return { success: true, data };
            }
            
            test() {
              return {
                success: true,
                module: 'test_secure_manager'
              };
            }
          }
          
          // Create instance
          const testManager = new TestSecureManager({
            auth: authManager
          });
          
          // Initialize
          await testManager.init();
          
          if (!testManager.initialized) {
            throw new Error('Test manager failed to initialize');
          }
          
          // Test unauthorized access
          try {
            const testData = { value: 'test' };
            
            // Get token with wrong capability
            const wrongToken = await authManager.getCapabilityToken('wrong:capability:*');
            
            await testManager.secureOperation(wrongToken, testData);
            throw new Error('Should not be able to access secure operation with wrong token');
          } catch (error) {
            // Expected error
            if (!error.message.includes('Unauthorized')) {
              throw error;
            }
          }
          
          // Test authorized access
          const testData = { value: 'test' };
          
          // Get token with correct capability
          const correctToken = await authManager.getCapabilityToken('test:secureOperation:*');
          
          const result = await testManager.secureOperation(correctToken, testData);
          
          if (!result.success) {
            throw new Error('Secure operation failed');
          }
          
          if (result.data !== testData) {
            throw new Error('Secure operation returned incorrect data');
          }
          
          return true;
        }
      },
      {
        id: 'secure_manager_resource_pool',
        name: 'Secure Manager Resource Pool',
        module: 'secureManagers',
        test: async () => {
          // Create resource pool
          const resourcePool = {
            auth: authManager,
            keystore: keystore,
            integration: authKeystoreIntegration,
            // Add more resources as needed
          };
          
          // Create test secure managers
          class TestManager1 {
            constructor(resources = null) {
              this.resources = resources || {};
              this.initialized = false;
              this.auth = this.resources.auth;
              this.keystore = this.resources.keystore;
            }
            
            async init() {
              if (this.initialized) return true;
              
              if (!this.auth) {
                throw new Error('Auth required');
              }
              
              if (!this.keystore) {
                throw new Error('Keystore required');
              }
              
              this.initialized = true;
              return true;
            }
          }
          
          class TestManager2 {
            constructor(resources = null) {
              this.resources = resources || {};
              this.initialized = false;
              this.manager1 = this.resources.manager1;
            }
            
            async init() {
              if (this.initialized) return true;
              
              if (!this.manager1) {
                throw new Error('Manager1 required');
              }
              
              if (!this.manager1.initialized) {
                await this.manager1.init();
              }
              
              this.initialized = true;
              return true;
            }
          }
          
          // Create manager 1
          const manager1 = new TestManager1(resourcePool);
          await manager1.init();
          
          if (!manager1.initialized) {
            throw new Error('Manager1 failed to initialize');
          }
          
          // Add manager1 to resource pool
          resourcePool.manager1 = manager1;
          
          // Create manager 2 with dependency on manager 1
          const manager2 = new TestManager2(resourcePool);
          await manager2.init();
          
          if (!manager2.initialized) {
            throw new Error('Manager2 failed to initialize');
          }
          
          return true;
        }
      },
      {
        id: 'secure_manager_capability_verification',
        name: 'Secure Manager Capability Verification',
        module: 'secureManagers',
        test: async () => {
          // Create a mock secure manager
          class MockSecureManager {
            constructor() {
              this.auth = authManager;
              this.initialized = true;
              this.operations = {
                read: new Set(),
                write: new Set(),
                delete: new Set()
              };
            }
            
            async verifyAccess(token, operation, resourceId) {
              const capabilityString = `mock:${operation}:${resourceId}`;
              return await this.auth.verifyCapability(token, capabilityString);
            }
            
            async read(token, resourceId) {
              if (!await this.verifyAccess(token, 'read', resourceId)) {
                throw new Error('Unauthorized read access');
              }
              
              this.operations.read.add(resourceId);
              return { id: resourceId, data: `Resource ${resourceId}` };
            }
            
            async write(token, resourceId, data) {
              if (!await this.verifyAccess(token, 'write', resourceId)) {
                throw new Error('Unauthorized write access');
              }
              
              this.operations.write.add(resourceId);
              return { success: true, id: resourceId };
            }
            
            async delete(token, resourceId) {
              if (!await this.verifyAccess(token, 'delete', resourceId)) {
                throw new Error('Unauthorized delete access');
              }
              
              this.operations.delete.add(resourceId);
              return { success: true, id: resourceId };
            }
          }
          
          // Create secure manager
          const secureManager = new MockSecureManager();
          
          // Create test resource
          const resourceId = `resource_${Date.now()}`;
          
          // Test read access
          const readToken = await authManager.getCapabilityToken('mock:read:*');
          const readResult = await secureManager.read(readToken, resourceId);
          
          if (!readResult || readResult.id !== resourceId) {
            throw new Error('Read operation failed');
          }
          
          // Test read-only token can't write
          try {
            await secureManager.write(readToken, resourceId, { test: true });
            throw new Error('Should not be able to write with read-only token');
          } catch (error) {
            // Expected error
            if (!error.message.includes('Unauthorized write')) {
              throw error;
            }
          }
          
          // Test write access
          const writeToken = await authManager.getCapabilityToken('mock:write:*');
          const writeResult = await secureManager.write(writeToken, resourceId, { test: true });
          
          if (!writeResult || !writeResult.success) {
            throw new Error('Write operation failed');
          }
          
          // Test write token can't delete
          try {
            await secureManager.delete(writeToken, resourceId);
            throw new Error('Should not be able to delete with write-only token');
          } catch (error) {
            // Expected error
            if (!error.message.includes('Unauthorized delete')) {
              throw error;
            }
          }
          
          // Test admin token can do everything
          const adminToken = await authManager.getCapabilityToken('mock:*:*');
          
          const adminRead = await secureManager.read(adminToken, resourceId);
          const adminWrite = await secureManager.write(adminToken, resourceId, { test: true });
          const adminDelete = await secureManager.delete(adminToken, resourceId);
          
          if (!adminRead || !adminWrite || !adminDelete) {
            throw new Error('Admin token should have access to all operations');
          }
          
          return true;
        }
      }
    ];
  }
  
  /**
   * Get usage tracking tests
   * @returns {Array} Usage tracking tests
   */
  getUsageTrackingTests() {
    return [
      {
        id: 'usage_tracking_events',
        name: 'Usage Tracking Events',
        module: 'usageTracking',
        test: async (tracker) => {
          // Track an event
          const moduleId = 'test_module';
          const operation = 'test_operation';
          const details = { test: true };
          const metrics = { duration: 100, memory: 1024 };
          
          const event = tracker.trackEvent(moduleId, operation, details, metrics);
          
          // Verify event was created
          if (!event || !event.id) {
            throw new Error('Event not created');
          }
          
          // Find event in storage
          const storedEvent = tracker.storage.events.find(e => e.id === event.id);
          
          if (!storedEvent) {
            throw new Error('Event not found in storage');
          }
          
          // Verify event properties
          if (storedEvent.module !== moduleId) {
            throw new Error('Event module does not match');
          }
          
          if (storedEvent.operation !== operation) {
            throw new Error('Event operation does not match');
          }
          
          if (storedEvent.metrics.duration !== metrics.duration) {
            throw new Error('Event metrics do not match');
          }
          
          return true;
        }
      },
      {
        id: 'usage_tracking_function',
        name: 'Track Function Execution',
        module: 'usageTracking',
        test: async (tracker) => {
          // Define test function
          const testFunction = async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return 'test result';
          };
          
          // Track function execution
          const result = await tracker.trackFunction(
            'test_module',
            'test_function',
            testFunction
          );
          
          // Verify function result
          if (result !== 'test result') {
            throw new Error('Function result does not match');
          }
          
          // Verify event was created
          const events = tracker.storage.events.filter(
            e => e.module === 'test_module' && e.operation === 'test_function'
          );
          
          if (events.length === 0) {
            throw new Error('Function tracking event not found');
          }
          
          // Verify metrics
          const event = events[0];
          
          if (!event.metrics || typeof event.metrics.duration !== 'number') {
            throw new Error('Function tracking metrics not found');
          }
          
          if (!event.metrics.success) {
            throw new Error('Function should be marked as successful');
          }
          
          return true;
        }
      },
      {
        id: 'usage_tracking_error',
        name: 'Track Function Error',
        module: 'usageTracking',
        test: async (tracker) => {
          // Define test function that throws
          const testFunction = async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            throw new Error('Test error');
          };
          
          // Track function execution
          try {
            await tracker.trackFunction(
              'test_module',
              'test_error_function',
              testFunction
            );
            
            throw new Error('Function should have thrown');
          } catch (error) {
            // Expected error
            if (error.message !== 'Test error') {
              throw error;
            }
          }
          
          // Verify error event was created
          const events = tracker.storage.events.filter(
            e => e.module === 'test_module' && e.operation === 'test_error_function_error'
          );
          
          if (events.length === 0) {
            throw new Error('Function error tracking event not found');
          }
          
          // Verify error details
          const event = events[0];
          
          if (!event.details || event.details.error !== 'Test error') {
            throw new Error('Function error details not found');
          }
          
          if (!event.metrics || event.metrics.success !== false) {
            throw new Error('Function should be marked as failed');
          }
          
          return true;
        }
      },
      {
        id: 'usage_tracking_aggregation',
        name: 'Metrics Aggregation',
        module: 'usageTracking',
        test: async (tracker) => {
          // Generate multiple events
          const moduleId = 'test_module';
          const operations = ['op1', 'op2', 'op3'];
          
          for (let i = 0; i < 10; i++) {
            const operation = operations[i % operations.length];
            
            tracker.trackEvent(moduleId, operation, {
              iteration: i
            }, {
              duration: 50 + i * 10,
              memory: 1024 * i
            });
          }
          
          // Manually trigger aggregation
          tracker.aggregateMetrics();
          
          // Get module stats
          const stats = tracker.getModuleStats(moduleId);
          
          // Verify stats
          if (!stats) {
            throw new Error('Module stats not found');
          }
          
          if (stats.count !== 10) {
            throw new Error('Incorrect event count');
          }
          
          if (stats.operations.length < operations.length) {
            throw new Error('Not all operations found in stats');
          }
          
          return true;
        }
      },
      {
        id: 'usage_tracking_module_specific',
        name: 'Module-Specific Tracker',
        module: 'usageTracking',
        test: async (tracker) => {
          // Create module-specific tracker
          const moduleId = 'specific_module';
          const moduleTracker = tracker.forModule(moduleId);
          
          // Track event
          moduleTracker.trackEvent('op1', { test: true });
          
          // Get module stats
          const stats = moduleTracker.getStats();
          
          // Verify stats
          if (!stats || stats.count === 0) {
            throw new Error('Module stats not found or empty');
          }
          
          // Get events
          const events = moduleTracker.getEvents();
          
          // Verify events
          if (!events || events.length === 0) {
            throw new Error('Module events not found or empty');
          }
          
          if (events[0].module !== moduleId) {
            throw new Error('Event module does not match');
          }
          
          return true;
        }
      }
    ];
  }
  
  /**
   * Get end-to-end security tests
   * @returns {Array} End-to-end tests
   */
  getEndToEndTests() {
    return [
      {
        id: 'e2e_auth_keystore_usage',
        name: 'Auth, Keystore, and Usage Tracking',
        module: 'endToEnd',
        test: async () => {
          // Test integrated flow across components
          
          // Create a test principal
          const principalId = `test_principal_${Date.now()}`;
          await authManager.createPrincipal(principalId);
          
          // Create capability
          const provider = `test_provider_${Date.now()}`;
          const capability = {
            can: authKeystoreIntegration.CAPABILITIES.KEY_MANAGE,
            with: provider
          };
          
          // Issue capability
          const token = await authManager.issueCapability('root', principalId, capability);
          
          // Track the operation with usage tracker
          const moduleTracker = usageTracker.forModule('e2e_test');
          
          await moduleTracker.trackFunction('secure_key_operation', async () => {
            // Set a key using integration layer
            const apiKey = `test_key_${Date.now()}`;
            
            await authKeystoreIntegration.setAuthorizedKey(
              provider,
              apiKey,
              token,
              { name: 'Test E2E Key' }
            );
            
            // Get key info
            const keyInfo = await authKeystoreIntegration.getAuthorizedKeyInfo(
              provider,
              token
            );
            
            if (!keyInfo || keyInfo.name !== 'Test E2E Key') {
              throw new Error('Key info mismatch');
            }
            
            return keyInfo;
          });
          
          // Verify usage tracking recorded the operation
          const events = moduleTracker.getEvents();
          
          if (events.length === 0) {
            throw new Error('No tracking events found');
          }
          
          const op = events.find(e => e.operation === 'secure_key_operation');
          
          if (!op) {
            throw new Error('Key operation not tracked');
          }
          
          return true;
        }
      },
      {
        id: 'e2e_security_layer_integration',
        name: 'Security Layer Integration',
        module: 'endToEnd',
        test: async () => {
          // Create a test secure component
          class SecureComponent {
            constructor() {
              this.auth = authManager;
              this.keystore = keystore;
              this.integration = authKeystoreIntegration;
              this.tracker = usageTracker.forModule('secure_component');
              this.initialized = true;
            }
            
            async performSecureOperation(authToken, provider) {
              // Track the operation
              return await this.tracker.trackFunction('secure_operation', async () => {
                // Verify capability
                const isAuthorized = await this.auth.verifyCapability(
                  authToken,
                  `secure:operation:${provider}`
                );
                
                if (!isAuthorized) {
                  throw new Error('Unauthorized operation');
                }
                
                // Get authorized key (if needed)
                const apiToken = await this.auth.getCapabilityToken(
                  `${this.integration.CAPABILITIES.KEY_ACCESS}:${provider}`
                );
                
                const apiKey = await this.integration.getAuthorizedKey(provider, apiToken);
                
                // Simulate using the API key
                return {
                  success: true,
                  provider,
                  keyLength: apiKey.length,
                  timestamp: Date.now()
                };
              });
            }
          }
          
          // Set up test
          const secureComponent = new SecureComponent();
          const provider = `test_provider_${Date.now()}`;
          
          // Set API key
          const manageToken = await authManager.getCapabilityToken(
            `${authKeystoreIntegration.CAPABILITIES.KEY_MANAGE}:${provider}`
          );
          
          await authKeystoreIntegration.setAuthorizedKey(
            provider,
            `test_api_key_${Date.now()}`,
            manageToken
          );
          
          // Set up capability
          const principalId = `test_principal_${Date.now()}`;
          await authManager.createPrincipal(principalId);
          
          const capability = {
            can: 'secure:operation',
            with: provider
          };
          
          const token = await authManager.issueCapability('root', principalId, capability);
          
          // Perform secure operation
          const result = await secureComponent.performSecureOperation(token, provider);
          
          // Verify result
          if (!result || !result.success) {
            throw new Error('Secure operation failed');
          }
          
          // Verify event was tracked
          const events = secureComponent.tracker.getEvents();
          
          if (events.length === 0) {
            throw new Error('No tracking events found');
          }
          
          const operationEvent = events.find(e => e.operation === 'secure_operation');
          
          if (!operationEvent) {
            throw new Error('Operation not tracked');
          }
          
          return true;
        }
      }
    ];
  }
  
  /**
   * Log a message
   * @param {string} message Message to log
   * @param {string} level Log level
   */
  log(message, level = 'info') {
    if (!this.options.verbose && level !== 'error') {
      return;
    }
    
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (level === 'error') {
      console.error(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

// Create default instance for direct usage
const securityTestSuite = new SecurityTestSuite();

export default securityTestSuite;