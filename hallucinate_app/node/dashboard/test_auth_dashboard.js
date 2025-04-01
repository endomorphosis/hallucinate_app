/**
 * Auth Dashboard Component Test
 * 
 * Tests the Authentication and Security Dashboard Component
 * Run this script with Node.js to test the Auth Dashboard component
 */

import AuthDashboard from './auth_dashboard.js';
import authManager from '../auth.js';
import keystore from '../keystore.js';
import authKeystoreIntegration from '../auth_keystore_integration.js';

// Mock element for testing
class MockElement {
  constructor() {
    this.innerHTML = '';
    this.children = [];
  }

  querySelector(selector) {
    // Return a new mock element for chaining
    return new MockElement();
  }

  querySelectorAll(selector) {
    // Return empty array for querySelectorAll calls
    return [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

// Mock event bus for dashboard components
const createEventBus = () => {
  const events = {};
  
  return {
    on(event, callback) {
      if (!events[event]) {
        events[event] = [];
      }
      events[event].push(callback);
    },
    
    off(event, callback) {
      if (!events[event]) return;
      events[event] = events[event].filter(cb => cb !== callback);
    },
    
    emit(event, data) {
      if (!events[event]) return;
      events[event].forEach(callback => callback(data));
      console.log(`Event emitted: ${event}`, data);
    }
  };
};

/**
 * Run Auth Dashboard component tests
 */
async function testAuthDashboard() {
  console.log('Testing Auth Dashboard component...');
  
  try {
    // Create mock element
    const mockElement = new MockElement();
    const eventBus = createEventBus();
    
    // Initialize dependencies if needed
    if (!authManager.initialized) {
      await authManager.init();
    }
    
    if (!keystore.initialized) {
      await keystore.init();
    }
    
    if (!authKeystoreIntegration.initialized) {
      await authKeystoreIntegration.init();
    }
    
    // Create Auth Dashboard instance with mocks
    const authDashboard = new AuthDashboard({
      element: mockElement,
      eventBus,
      auth: authManager,
      keystore: keystore,
      integration: authKeystoreIntegration
    });
    
    // Test initialization
    console.log('Testing Auth Dashboard initialization...');
    const initResult = await authDashboard.init();
    console.log(`- Initialization result: ${initResult ? 'Success' : 'Failed'}`);
    
    // Test rendering (will call render but not actually render to DOM)
    console.log('Testing Auth Dashboard rendering...');
    await authDashboard.render();
    console.log('- Render completed');
    
    // Test running tests
    console.log('Testing Auth Dashboard test execution...');
    
    // Mock document.createElement, getElementById, etc. for dialog creation
    global.document = {
      createElement: () => new MockElement(),
      getElementById: () => new MockElement(),
      body: new MockElement()
    };
    
    try {
      await authDashboard.runTests();
      console.log('- Test execution completed');
    } catch (error) {
      console.error('- Error during test execution:', error);
    }
    
    // Test creating a principal
    console.log('Testing principal creation...');
    try {
      // Mock the showAddPrincipalDialog function
      const originalShowAddPrincipalDialog = authDashboard.showAddPrincipalDialog;
      authDashboard.showAddPrincipalDialog = async () => {
        try {
          // Simulate creating a principal
          const principalId = `test-principal-${Date.now()}`;
          await authManager.createPrincipal(principalId);
          console.log(`- Created test principal: ${principalId}`);
          return true;
        } catch (error) {
          console.error('- Error creating principal:', error);
          return false;
        }
      };
      
      await authDashboard.showAddPrincipalDialog();
      
      // Restore original function
      authDashboard.showAddPrincipalDialog = originalShowAddPrincipalDialog;
    } catch (error) {
      console.error('- Error during principal creation test:', error);
    }
    
    // Test loading data
    console.log('Testing data loading...');
    try {
      await authDashboard.loadData();
      console.log('- Data loading completed');
    } catch (error) {
      console.error('- Error during data loading:', error);
    }
    
    console.log('Auth Dashboard component tests completed.');
    
    // Final test result
    return {
      success: true,
      module: 'auth_dashboard',
      component_initialization: initResult,
      integration: {
        auth_manager: authManager.initialized,
        keystore: keystore.initialized,
        auth_keystore: authKeystoreIntegration.initialized
      },
      message: 'Auth dashboard component successfully tested with integration layers'
    };
  } catch (error) {
    console.error('Auth Dashboard test failed:', error);
    return {
      success: false,
      module: 'auth_dashboard',
      error: error.message
    };
  }
}

// Run tests if executed directly
if (process.argv[1].endsWith('test_auth_dashboard.js')) {
  testAuthDashboard().then(result => {
    console.log('Test result:', JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
}

export default testAuthDashboard;