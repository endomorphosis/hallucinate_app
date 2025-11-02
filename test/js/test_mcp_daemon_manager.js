/**
 * Test MCP Daemon Manager
 * Simple test to verify daemon manager functionality
 */

import MCPDaemonManager from '../../hallucinate_app/node/mcp_daemon_manager.js';

async function runTests() {
  console.log('🧪 Testing MCP Daemon Manager\n');
  
  const manager = new MCPDaemonManager();
  let testsPassed = 0;
  let testsFailed = 0;
  
  // Test 1: Manager creation
  console.log('Test 1: Manager creation');
  if (manager && manager.daemonConfigs) {
    console.log('✅ Manager created successfully');
    testsPassed++;
  } else {
    console.log('❌ Manager creation failed');
    testsFailed++;
  }
  
  // Test 2: Daemon configs loaded
  console.log('\nTest 2: Daemon configurations');
  if (manager.daemonConfigs.length === 3) {
    console.log(`✅ Found ${manager.daemonConfigs.length} daemon configs`);
    manager.daemonConfigs.forEach(config => {
      console.log(`   - ${config.name} on port ${config.port}`);
    });
    testsPassed++;
  } else {
    console.log(`❌ Expected 3 daemon configs, found ${manager.daemonConfigs.length}`);
    testsFailed++;
  }
  
  // Test 3: Event emitter setup
  console.log('\nTest 3: Event emitter');
  let eventReceived = false;
  manager.once('test-event', () => {
    eventReceived = true;
  });
  manager.emit('test-event');
  
  if (eventReceived) {
    console.log('✅ Event emitter working');
    testsPassed++;
  } else {
    console.log('❌ Event emitter not working');
    testsFailed++;
  }
  
  // Test 4: Status methods
  console.log('\nTest 4: Status methods');
  const status = manager.getAllStatus();
  if (typeof status === 'object') {
    console.log('✅ getAllStatus() works');
    testsPassed++;
  } else {
    console.log('❌ getAllStatus() failed');
    testsFailed++;
  }
  
  // Test 5: Daemon IDs
  console.log('\nTest 5: Daemon IDs');
  const expectedIds = ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'];
  const actualIds = manager.daemonConfigs.map(c => c.id);
  const idsMatch = expectedIds.every(id => actualIds.includes(id));
  
  if (idsMatch) {
    console.log('✅ Daemon IDs correct');
    expectedIds.forEach(id => console.log(`   - ${id}`));
    testsPassed++;
  } else {
    console.log('❌ Daemon IDs mismatch');
    console.log('   Expected:', expectedIds);
    console.log('   Actual:', actualIds);
    testsFailed++;
  }
  
  // Test 6: Commands configured
  console.log('\nTest 6: Commands configured');
  const commandsOk = manager.daemonConfigs.every(c => 
    c.command && c.args && Array.isArray(c.args)
  );
  
  if (commandsOk) {
    console.log('✅ All commands properly configured');
    manager.daemonConfigs.forEach(config => {
      console.log(`   - ${config.id}: ${config.command} ${config.args.join(' ')}`);
    });
    testsPassed++;
  } else {
    console.log('❌ Some commands not properly configured');
    testsFailed++;
  }
  
  // Test 7: Ports configured
  console.log('\nTest 7: Port assignments');
  const expectedPorts = [3001, 3002, 3003];
  const actualPorts = manager.daemonConfigs.map(c => c.port);
  const portsMatch = expectedPorts.every(port => actualPorts.includes(port));
  
  if (portsMatch) {
    console.log('✅ Ports correctly assigned');
    manager.daemonConfigs.forEach(config => {
      console.log(`   - ${config.name}: port ${config.port}`);
    });
    testsPassed++;
  } else {
    console.log('❌ Port assignments incorrect');
    testsFailed++;
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed!');
    return 0;
  } else {
    console.log('\n⚠️  Some tests failed');
    return 1;
  }
}

// Run tests
runTests().then(exitCode => {
  process.exit(exitCode);
}).catch(err => {
  console.error('❌ Test error:', err);
  process.exit(1);
});
