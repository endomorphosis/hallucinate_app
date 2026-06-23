#!/usr/bin/env node

import assert from 'assert/strict';
import MCPDaemonManager from '../hallucinate_app/node/mcp_daemon_manager.js';

const manager = new MCPDaemonManager({
  healthIntervalMs: 60000,
  startupTimeoutMs: 10,
  maxRestarts: 3
});

const plan = manager.getLaunchPlan();
const expectedOrder = ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'];
const expectedPackages = ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'];

assert.equal(plan.length, 3, 'expected three MCP daemon launch entries');
assert.deepEqual(plan.map((entry) => entry.daemon_id), expectedOrder);
assert.deepEqual(plan.map((entry) => entry.server_package), expectedPackages);

for (const entry of plan) {
  assert.equal(entry.task_id, 'HAO-442');
  assert.match(entry.entrypoint, /^python -m /);
  assert.match(entry.endpoint, /^http:\/\/127\.0\.0\.1:300[1-3]$/);
  assert.ok(entry.health_path, `${entry.daemon_id} needs a daemon health path`);
  assert.ok(entry.mediation_contract_ref.includes(entry.daemon_id));
  assert.ok(entry.swissknife_consumer.includes('Swissknife'));
  assert.ok(entry.restart_behavior.includes('auto-restart'));
}

console.log('HAO-442 MCP daemon launch plan verified');
console.log(JSON.stringify(plan, null, 2));
