import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import playwrightTest from '@playwright/test';
import MCPDaemonManager from '../../hallucinate_app/node/mcp_daemon_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { test, expect } = playwrightTest as unknown as typeof import('@playwright/test');

const GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-535-daemon-launch-health-gate.json');
const DAEMON_IDS = ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'];
const BACKEND_PACKAGES = ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'];

test.describe('MGW-535 daemon launch health Playwright gate', () => {
  test('keeps the daemon launch validation gate fixture in parity with the manager', () => {
    const manager = new MCPDaemonManager();
    const gate = manager.getDaemonLaunchValidationGate();
    const fixture = JSON.parse(fs.readFileSync(GATE_FIXTURE, 'utf8'));

    expect(gate).toEqual(fixture);
    expect(gate.task_id).toBe('MGW-535');
    expect(gate.goal_id).toBe('VAIOS-G728');
    expect(gate.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(gate.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(gate.evidence_term).toBe('launch Playwright validation gate');
    expect(gate.playwright_specs).toContain('hallucinate_app/test/e2e/daemon-launch-health.spec.ts');
    expect(gate.validation_commands).toContain('npm --prefix swissknife run test:e2e:meta-glasses');
    expect(gate.validation_commands).toContain('npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts');
  });

  test('binds each launch-plan daemon to health, MCP, dashboard, and Swissknife evidence', () => {
    const manager = new MCPDaemonManager();
    const launchPlan = manager.getLaunchPlan();
    const gate = manager.getDaemonLaunchValidationGate();
    const byId = new Map(launchPlan.map((entry: any) => [entry.daemon_id, entry]));

    expect(launchPlan.map((entry: any) => entry.daemon_id)).toEqual(DAEMON_IDS);
    expect(gate.required_backends).toEqual(BACKEND_PACKAGES);
    expect(gate.required_evidence).toEqual(expect.arrayContaining([
      'Hallucinate App daemon health',
      'daemon launcher',
      'MCP server',
      'MCP dashboard',
      'dashboard capability catalog',
      'Swissknife applications',
      'launch Playwright validation gate'
    ]));

    for (const daemonId of DAEMON_IDS) {
      const entry = byId.get(daemonId) as any;
      const healthPath = gate.daemon_health_paths.find((candidate: any) => candidate.daemon_id === daemonId);
      const handoff = gate.swissknife_handoff.find((candidate: any) => candidate.daemon_id === daemonId);

      expect(entry.launch_objective_ids).toEqual(['VAIOS-G724', 'VAIOS-G728']);
      expect(entry.launch_validation_gate).toMatchObject({
        task_id: 'MGW-535',
        goal_id: 'VAIOS-G728',
        evidence_term: 'launch Playwright validation gate',
        playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts'
      });
      expect(healthPath).toMatchObject({
        server_package: entry.server_package,
        endpoint: entry.endpoint,
        health_path: entry.health_path,
        rpc_path: entry.rpc_path,
        startup_order: entry.startup_order
      });
      expect(handoff).toMatchObject({
        server_package: entry.server_package,
        swissknife_consumer: entry.swissknife_consumer,
        mediation_contract_ref: entry.mediation_contract_ref
      });
      expect(handoff.swissknife_consumer).toContain('Swissknife');
    }
  });
});
