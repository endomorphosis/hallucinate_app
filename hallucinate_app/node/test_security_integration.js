/**
 * Security Integration Tests
 * 
 * Tests the integration between authentication, keystore, and the security dashboard
 */

import { authManager } from './auth.js';
import { keystore } from './keystore.js';
import { authKeystoreIntegration } from './auth_keystore_integration.js';
import testAuthDashboard from './dashboard/test_auth_dashboard.js';

/**
 * Run tests for all security components and their integration
 */
async function testSecurityIntegration() {
  console.log('Testing Security Integration...');
  
  try {
    // Track component test results
    const results = {
      auth: null,
      keystore: null,
      integration: null,
      dashboard: null
    };
    
    // Initialize components if needed
    if (!authManager.initialized) {
      await authManager.init();
    }
    
    if (!keystore.initialized) {
      await keystore.init();
    }
    
    if (!authKeystoreIntegration.initialized) {
      await authKeystoreIntegration.init();
    }
    
    // Test auth manager
    console.log('Testing Auth Manager...');
    results.auth = await authManager.test();
    console.log(`- Auth Manager test ${results.auth.success ? 'passed' : 'failed'}`);
    
    // Test keystore
    console.log('Testing Keystore...');
    results.keystore = await keystore.test();
    console.log(`- Keystore test ${results.keystore.success ? 'passed' : 'failed'}`);
    
    // Test integration
    console.log('Testing Auth-Keystore Integration...');
    results.integration = await authKeystoreIntegration.test();
    console.log(`- Auth-Keystore Integration test ${results.integration.success ? 'passed' : 'failed'}`);
    
    // Test auth dashboard component
    console.log('Testing Auth Dashboard Component...');
    results.dashboard = await testAuthDashboard();
    console.log(`- Auth Dashboard test ${results.dashboard.success ? 'passed' : 'failed'}`);
    
    // Test API key management flow with capability-based security
    console.log('Testing API key management flow with capabilities...');
    let flowTestResult = false;
    
    try {
      // Create test principal
      const principalId = `test-principal-${Date.now()}`;
      await authManager.createPrincipal(principalId);
      console.log(`- Created test principal: ${principalId}`);
      
      // Issue capability for key management
      const capability = {
        can: authKeystoreIntegration.CAPABILITIES.KEY_MANAGE,
        with: 'test-provider'
      };
      
      const keyManageToken = await authManager.issueCapability(
        'root', 
        principalId, 
        capability
      );
      console.log('- Issued key management capability token');
      
      // Set an API key using the capability
      const testKey = 'test-api-key-' + Date.now();
      const setKeyResult = await authKeystoreIntegration.setAuthorizedKey(
        'test-provider',
        testKey,
        keyManageToken.token
      );
      console.log(`- Set API key result: ${setKeyResult}`);
      
      // Issue capability for key access
      const accessCapability = {
        can: authKeystoreIntegration.CAPABILITIES.KEY_ACCESS,
        with: 'test-provider'
      };
      
      const keyAccessToken = await authManager.issueCapability(
        'root', 
        principalId, 
        accessCapability
      );
      console.log('- Issued key access capability token');
      
      // Get the API key using the capability
      const retrievedKey = await authKeystoreIntegration.getAuthorizedKey(
        'test-provider',
        keyAccessToken.token
      );
      console.log(`- Retrieved API key: ${retrievedKey === testKey ? 'Success' : 'Failed'}`);
      
      // Issue capability for key rotation
      const rotateCapability = {
        can: authKeystoreIntegration.CAPABILITIES.KEY_ROTATE,
        with: 'test-provider'
      };
      
      const keyRotateToken = await authManager.issueCapability(
        'root', 
        principalId, 
        rotateCapability
      );
      console.log('- Issued key rotation capability token');
      
      // Rotate the API key using the capability
      const newKey = 'rotated-api-key-' + Date.now();
      const rotateResult = await authKeystoreIntegration.rotateAuthorizedKey(
        'test-provider',
        newKey,
        keyRotateToken.token
      );
      console.log(`- Rotated API key result: ${rotateResult}`);
      
      // Verify the rotated key
      const rotatedKey = await authKeystoreIntegration.getAuthorizedKey(
        'test-provider',
        keyAccessToken.token
      );
      console.log(`- Retrieved rotated API key: ${rotatedKey === newKey ? 'Success' : 'Failed'}`);
      
      // Clean up - delete the test key
      const deleteResult = await authKeystoreIntegration.deleteAuthorizedKey(
        'test-provider',
        keyManageToken.token
      );
      console.log(`- Deleted API key result: ${deleteResult}`);
      
      // All steps succeeded
      flowTestResult = retrievedKey === testKey && 
                       rotatedKey === newKey && 
                       setKeyResult && 
                       rotateResult && 
                       deleteResult;
    } catch (error) {
      console.error('- Error during API key management flow test:', error);
      flowTestResult = false;
    }
    
    console.log(`API key management flow test: ${flowTestResult ? 'Passed' : 'Failed'}`);
    
    // Collect overall test results
    const overallSuccess = results.auth.success && 
                          results.keystore.success && 
                          results.integration.success && 
                          results.dashboard.success &&
                          flowTestResult;
    
    return {
      success: overallSuccess,
      module: 'security_integration',
      results: {
        auth_manager: results.auth.success,
        keystore: results.keystore.success,
        auth_keystore_integration: results.integration.success,
        auth_dashboard: results.dashboard.success,
        api_key_flow: flowTestResult
      },
      implementation_details: {
        auth_using_external: results.auth?.capability?.ucan_available || false,
        keystore_using_external: results.keystore?.external_implementation || false,
        integration_using_external: results.integration?.external_implementation || false
      },
      message: overallSuccess 
        ? 'Security integration tests passed successfully' 
        : 'Some security integration tests failed'
    };
  } catch (error) {
    console.error('Security integration test failed:', error);
    return {
      success: false,
      module: 'security_integration',
      error: error.message
    };
  }
}

// Run tests if executed directly
if (process.argv[1].endsWith('test_security_integration.js')) {
  testSecurityIntegration().then(result => {
    console.log('Test result:', JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
}

export default testSecurityIntegration;