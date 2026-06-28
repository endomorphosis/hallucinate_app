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
  const expectedPorts = [8004, 3002, 3003];
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

  // Test 8: Launch plan exposes current endpoint contracts
  console.log('\nTest 8: Launch plan endpoint contracts');
  const launchPlan = manager.getLaunchPlan();
  const launchPlanById = new Map(launchPlan.map(entry => [entry.daemon_id, entry]));
  const launchPlanOk =
    launchPlan.length === 3 &&
    launchPlanById.get('ipfs-kit')?.endpoint === 'http://127.0.0.1:8004' &&
    launchPlanById.get('ipfs-kit')?.health_path === '/api/mcp/status' &&
    launchPlanById.get('ipfs-kit')?.rpc_path === '/mcp/tools/call' &&
    launchPlanById.get('ipfs-datasets')?.endpoint === 'http://127.0.0.1:3002' &&
    launchPlanById.get('ipfs-accelerate')?.endpoint === 'http://127.0.0.1:3003';

  if (launchPlanOk) {
    console.log('✅ Launch plan endpoint contracts current');
    testsPassed++;
  } else {
    console.log('❌ Launch plan endpoint contracts stale');
    console.log('   Launch plan:', launchPlan);
    testsFailed++;
  }

  // Test 9: Dashboard capability catalog reconciles menus, daemon transport, and MCP++
  console.log('\nTest 9: Dashboard capability catalog');
  const catalog = manager.getDashboardCapabilityCatalog();
  const catalogById = new Map((catalog.servers || []).map(entry => [entry.daemon_id, entry]));
  const requiredIds = ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'];
  const catalogBaseOk =
    catalog.schema === 'hallucinate_app.mcp_dashboard_capability_catalog.v1' &&
    catalog.task_id === 'HAO-677' &&
    catalog.goal_id === 'VAIOS-G723' &&
    requiredIds.every(id => catalogById.has(id));
  const catalogEntriesOk = requiredIds.every(id => {
    const entry = catalogById.get(id);
    return (
      entry.tool_protocols?.tools_list?.operation === 'tools/list' &&
      entry.tool_protocols?.tools_call?.operation === 'tools/call' &&
      entry.tool_protocols?.tools_call?.safeProbe?.mutation === false &&
      entry.control_surface_mediation_contract?.startsWith('control_surface_contract:mcp-daemon:') &&
      entry.menu_dashboard_url?.startsWith('http://127.0.0.1:')
    );
  });
  const catalogSpecificsOk =
    catalogById.get('ipfs-kit')?.port === 8004 &&
    catalogById.get('ipfs-kit')?.menu_dashboard_url === 'http://127.0.0.1:8004/dashboard' &&
    catalogById.get('ipfs-datasets')?.native_dashboard_catalog_url === 'http://127.0.0.1:8899/api/hallucinate/dashboard-catalog' &&
    catalogById.get('ipfs-datasets')?.mcpplusplus?.mode === 'optional_bridge' &&
    catalogById.get('ipfs-accelerate')?.mcpplusplus?.profiles?.includes('mcp++/profile-e-mcp-p2p');

  if (catalogBaseOk && catalogEntriesOk && catalogSpecificsOk) {
    console.log('✅ Dashboard capability catalog reconciles all MCP servers');
    testsPassed++;
  } else {
    console.log('❌ Dashboard capability catalog incomplete');
    console.log('   Catalog:', catalog);
    testsFailed++;
  }

  // Test 10: MGW-535 daemon launch validation gate
  console.log('\nTest 10: MGW-535, MGW-551, and MGW-556 daemon launch validation gates');
  const launchGate = manager.getDaemonLaunchValidationGate();
  const launchGates = manager.getDaemonLaunchValidationGates();
  const launchGateOk =
    launchGate.schema === 'hallucinate_app.daemon_launch_validation_gate.v1' &&
    launchGate.task_id === 'MGW-535' &&
    launchGate.goal_id === 'VAIOS-G728' &&
    launchGate.evidence_term === 'launch Playwright validation gate' &&
    launchGate.vai_task_ids?.includes('VAI-530') &&
    launchGate.vai_task_ids?.includes('VAI-536') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-06-27-vai-530-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-06-28-vai-536-daemon-launch-health-gate.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-06-27-vai-530-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-06-28-vai-536-objective-gap-b023c8de5b69.md') &&
    launchGate.packet_goals?.includes('VAIOS-G724') &&
    launchGate.packet_goals?.includes('VAIOS-G728') &&
    launchGate.backlog_task_ids?.includes('HAO-713') &&
    launchGate.supervisor_gap_receipts?.includes('data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-objective-gap-b023c8de5b69.md') &&
    launchGate.hallucinate_backlog_receipts?.includes('data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-daemon-launch-health-gate.md') &&
    launchGate.playwright_specs?.includes('hallucinate_app/test/e2e/daemon-launch-health.spec.ts') &&
    launchGate.required_backends?.join(',') === 'ipfs_kit_py,ipfs_datasets_py,ipfs_accelerate_py' &&
    launchGate.daemon_health_paths?.length === 3 &&
    launchGate.swissknife_handoff?.every(entry => entry.swissknife_consumer?.includes('Swissknife')) &&
    launchGates.some(gate =>
      gate.task_id === 'MGW-551' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-551-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-551-daemon-launch-health-gate.md' &&
      gate.validation_commands?.includes('npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'MGW-556' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.supervisor_gap_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-556-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-556-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/mgw-556-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-536' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-536-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-536-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-536-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    );

  if (launchGateOk) {
    console.log('✅ MGW-535, MGW-551, and MGW-556 daemon launch validation gates are scanner-visible');
    testsPassed++;
  } else {
    console.log('❌ Daemon launch validation gate incomplete');
    console.log('   Launch gate:', launchGate);
    console.log('   Launch gates:', launchGates);
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
