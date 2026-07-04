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
  const expectedPorts = [8014, 3002, 3003];
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
    launchPlanById.get('ipfs-kit')?.endpoint === 'http://127.0.0.1:8014' &&
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
    catalogById.get('ipfs-kit')?.port === 8014 &&
    catalogById.get('ipfs-kit')?.menu_dashboard_url === 'http://127.0.0.1:8014/dashboard' &&
    catalogById.get('ipfs-datasets')?.native_dashboard_catalog_url === 'http://127.0.0.1:8899/api/hallucinate/dashboard-catalog' &&
    catalogById.get('ipfs-datasets')?.mcpplusplus?.mode === 'optional_bridge' &&
    catalogById.get('ipfs-accelerate')?.mcpplusplus?.profiles?.includes('mcp++/profile-e-mcp-p2p') &&
    catalog.launch_validation_gates?.some(gate =>
      gate.task_id === 'VAI-622' &&
      gate.goal_id === 'VAIOS-G723' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-622-mcp-dashboard-launch-gate.json' &&
      gate.attempt_receipts?.includes('data/hallucinate_multimodal_control/discovery/2026-07-04-vai-622-attempt-1-validation.md')
    ) &&
    catalog.launch_validation_gates?.some(gate =>
      gate.task_id === 'VAI-625' &&
      gate.goal_id === 'VAIOS-G723' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-625-mcp-dashboard-launch-gate.json' &&
      gate.attempt_receipts?.includes('data/hallucinate_multimodal_control/discovery/2026-07-04-vai-625-attempt-1-validation.md')
    ) &&
    catalog.launch_validation_gates?.some(gate =>
      gate.task_id === 'VAI-628' &&
      gate.goal_id === 'VAIOS-G723' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-628-mcp-dashboard-launch-gate.json' &&
      gate.attempt_receipts?.includes('data/hallucinate_multimodal_control/discovery/2026-07-04-vai-628-attempt-1-validation.md')
    ) &&
    catalog.launch_validation_gates?.some(gate =>
      gate.task_id === 'VAI-632' &&
      gate.goal_id === 'VAIOS-G724' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-632-mcp-dashboard-launch-gate.json' &&
      gate.packet_sibling_task_id === 'VAI-633' &&
      gate.packet_sibling_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-633-daemon-launch-health-gate.md'
    );

  if (catalogBaseOk && catalogEntriesOk && catalogSpecificsOk) {
    console.log('✅ Dashboard capability catalog reconciles all MCP servers');
    testsPassed++;
  } else {
    console.log('❌ Dashboard capability catalog incomplete');
    console.log('   Catalog:', catalog);
    testsFailed++;
  }

  // Test 10: MGW-535 daemon launch validation gate
  console.log('\nTest 10: MGW-535, MGW-551, MGW-556, VAI-568, VAI-580, VAI-586, VAI-593, VAI-596, VAI-599, VAI-602, VAI-615, and VAI-618 daemon launch validation gates');
  const launchGate = manager.getDaemonLaunchValidationGate();
  const launchGates = manager.getDaemonLaunchValidationGates();
  const launchGateOk =
    launchGate.schema === 'hallucinate_app.daemon_launch_validation_gate.v1' &&
    launchGate.task_id === 'MGW-535' &&
    launchGate.goal_id === 'VAIOS-G728' &&
    launchGate.evidence_term === 'launch Playwright validation gate' &&
    launchGate.vai_task_ids?.includes('VAI-530') &&
    launchGate.vai_task_ids?.includes('VAI-536') &&
    launchGate.vai_task_ids?.includes('VAI-538') &&
    launchGate.vai_task_ids?.includes('VAI-540') &&
    launchGate.vai_task_ids?.includes('VAI-549') &&
    launchGate.vai_task_ids?.includes('VAI-555') &&
    launchGate.vai_task_ids?.includes('VAI-557') &&
    launchGate.vai_task_ids?.includes('VAI-565') &&
    launchGate.vai_task_ids?.includes('VAI-568') &&
    launchGate.vai_task_ids?.includes('VAI-574') &&
    launchGate.vai_task_ids?.includes('VAI-577') &&
    launchGate.vai_task_ids?.includes('VAI-580') &&
    launchGate.vai_task_ids?.includes('VAI-583') &&
    launchGate.vai_task_ids?.includes('VAI-586') &&
    launchGate.vai_task_ids?.includes('VAI-589') &&
    launchGate.vai_task_ids?.includes('VAI-593') &&
    launchGate.vai_task_ids?.includes('VAI-596') &&
    launchGate.vai_task_ids?.includes('VAI-599') &&
    launchGate.vai_task_ids?.includes('VAI-602') &&
    launchGate.vai_task_ids?.includes('VAI-615') &&
    launchGate.vai_task_ids?.includes('VAI-618') &&
    launchGate.vai_task_ids?.includes('VAI-639') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-06-27-vai-530-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-06-28-vai-536-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-06-28-vai-538-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-06-28-vai-540-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-02-vai-549-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-02-vai-555-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-02-vai-557-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-03-vai-565-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-568-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-574-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-577-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-580-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-583-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-586-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-589-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-593-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-596-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-599-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-602-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-615-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-618-daemon-launch-health-gate.md') &&
    launchGate.discovery_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-639-daemon-launch-health-gate.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-06-27-vai-530-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-06-28-vai-536-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-06-28-vai-538-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-06-28-vai-540-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-02-vai-549-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-02-vai-555-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-02-vai-557-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-03-vai-565-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-568-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-574-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-577-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-580-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-583-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-586-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-589-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-593-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-596-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-599-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-602-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-615-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-618-objective-gap-b023c8de5b69.md') &&
    launchGate.objective_gap_receipts?.includes('data/virtual_ai_os/discovery/2026-07-04-vai-639-objective-gap-b023c8de5b69.md') &&
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
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-538' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-538-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-538-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-538-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-540' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-540-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-06-28-vai-540-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-540-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-549' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-02-vai-549-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-02-vai-549-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-549-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-555' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-02-vai-555-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-02-vai-555-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-555-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-557' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-02-vai-557-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-02-vai-557-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-557-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-565' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-03-vai-565-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-03-vai-565-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-565-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-568' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-568-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-568-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-568-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-574' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-574-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-574-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-574-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-577' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-577-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-577-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-577-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-580' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-580-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-580-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-580-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-583' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-583-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-583-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-583-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-586' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-586-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-586-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-586-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-589' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-589-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-589-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-589-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-593' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-593-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-593-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-593-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-596' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-596-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-596-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-596-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-599' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.gate_state === 'gate_closed_by_playwright_validation' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-599-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-599-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-599-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-602' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.gate_state === 'gate_closed_by_playwright_validation' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-602-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-602-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-602-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-615' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.gate_state === 'gate_closed_by_playwright_validation' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-615-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-615-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-615-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-618' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.gate_state === 'gate_closed_by_playwright_validation' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-618-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-618-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-618-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    ) &&
    launchGates.some(gate =>
      gate.task_id === 'VAI-633' &&
      gate.goal_id === 'VAIOS-G728' &&
      gate.gate_state === 'gate_closed_by_playwright_validation' &&
      gate.objective_gap_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-633-objective-gap-b023c8de5b69.md' &&
      gate.launch_gate_receipt === 'data/virtual_ai_os/discovery/2026-07-04-vai-633-daemon-launch-health-gate.md' &&
      gate.receipt_fixture === 'hallucinate_app/test/e2e/fixtures/vai-633-daemon-launch-health-gate.json' &&
      gate.validation_commands?.includes('test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts')
    );

  if (launchGateOk) {
    console.log('✅ MGW-535, MGW-551, MGW-556, VAI-568, VAI-580, VAI-586, VAI-593, VAI-596, VAI-599, VAI-602, VAI-615, and VAI-618 daemon launch validation gates are scanner-visible');
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
