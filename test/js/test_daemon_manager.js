/**
 * Daemon Manager Test
 * 
 * Basic tests for the daemon manager functionality
 */

import { DaemonManager, MCPDaemon } from '../../hallucinate_app/node/daemon_manager.js';

console.log('Testing Daemon Manager...\n');

// Test 1: Create daemon manager instance
console.log('Test 1: Creating daemon manager instance...');
const manager = new DaemonManager();
console.log('✓ Daemon manager created\n');

// Test 2: Check default daemons are registered
console.log('Test 2: Checking default daemon registration...');
const status = manager.getStatus();
const expectedDaemons = ['ipfs-accelerate-mcp', 'swissknife-mcp', 'huggingface-mcp'];
const registeredDaemons = Object.keys(status);

console.log(`Expected: ${expectedDaemons.length} daemons`);
console.log(`Found: ${registeredDaemons.length} daemons`);

const allRegistered = expectedDaemons.every(name => registeredDaemons.includes(name));
if (allRegistered) {
  console.log('✓ All default daemons registered correctly');
  console.log('  Registered daemons:', registeredDaemons.join(', '));
} else {
  console.log('✗ Some daemons missing');
  const missing = expectedDaemons.filter(name => !registeredDaemons.includes(name));
  console.log('  Missing:', missing.join(', '));
}
console.log();

// Test 3: Check initial status
console.log('Test 3: Checking initial daemon status...');
let allStopped = true;
for (const [name, info] of Object.entries(status)) {
  console.log(`  ${name}: ${info.status}`);
  if (info.status !== 'stopped') {
    allStopped = false;
  }
}
if (allStopped) {
  console.log('✓ All daemons in stopped state initially');
} else {
  console.log('✗ Some daemons not in stopped state');
}
console.log();

// Test 4: Register custom daemon
console.log('Test 4: Registering custom test daemon...');
try {
  manager.registerDaemon({
    name: 'test-daemon',
    command: 'echo',
    args: ['test'],
    autoRestart: false
  });
  
  const updatedStatus = manager.getStatus();
  if (updatedStatus['test-daemon']) {
    console.log('✓ Custom daemon registered successfully');
  } else {
    console.log('✗ Custom daemon registration failed');
  }
} catch (error) {
  console.log('✗ Error registering custom daemon:', error.message);
}
console.log();

// Test 5: Event handling
console.log('Test 5: Testing event handling...');
let eventReceived = false;
manager.once('daemon-starting', (data) => {
  eventReceived = true;
  console.log(`✓ Received 'daemon-starting' event for ${data.name}`);
});

// Don't actually start daemons in test (would require real MCP servers)
// Instead just verify the event system is set up
console.log('✓ Event system configured (actual daemon start not tested)');
console.log();

// Test 6: Individual daemon status
console.log('Test 6: Getting individual daemon status...');
try {
  const daemonStatus = manager.getDaemonStatus('ipfs-accelerate-mcp');
  console.log('✓ Individual status retrieval works');
  console.log(`  Status:`, daemonStatus);
} catch (error) {
  console.log('✗ Error getting daemon status:', error.message);
}
console.log();

// Test 7: Error handling for non-existent daemon
console.log('Test 7: Testing error handling for non-existent daemon...');
try {
  manager.getDaemonStatus('non-existent-daemon');
  console.log('✗ Should have thrown error for non-existent daemon');
} catch (error) {
  console.log('✓ Correctly throws error for non-existent daemon');
  console.log(`  Error: ${error.message}`);
}
console.log();

// Summary
console.log('='.repeat(50));
console.log('Daemon Manager Tests Complete');
console.log('='.repeat(50));
console.log('\nNote: Full integration tests require running MCP servers.');
console.log('These tests verify the basic daemon manager structure and API.');
console.log('\nTo test with real daemons, run the Electron app and use the');
console.log('Daemon Manager dashboard (Menu → Windows → Daemon Manager).');
