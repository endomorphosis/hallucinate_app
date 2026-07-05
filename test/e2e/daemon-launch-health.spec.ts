import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import playwrightTest from '@playwright/test';
import MCPDaemonManager from '../../hallucinate_app/node/mcp_daemon_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const { test, expect } = playwrightTest as unknown as typeof import('@playwright/test');

const GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-535-daemon-launch-health-gate.json');
const MGW_551_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-551-daemon-launch-health-gate.json');
const MGW_556_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'mgw-556-daemon-launch-health-gate.json');
const VAI_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-519-daemon-launch-health-gate.json');
const HAO_713_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'hao-713-daemon-launch-health-gate.json');
const VAI_530_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-530-daemon-launch-health-gate.json');
const VAI_536_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-536-daemon-launch-health-gate.json');
const VAI_538_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-538-daemon-launch-health-gate.json');
const VAI_540_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-540-daemon-launch-health-gate.json');
const VAI_549_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-549-daemon-launch-health-gate.json');
const VAI_555_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-555-daemon-launch-health-gate.json');
const VAI_557_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-557-daemon-launch-health-gate.json');
const VAI_565_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-565-daemon-launch-health-gate.json');
const VAI_568_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-568-daemon-launch-health-gate.json');
const VAI_574_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-574-daemon-launch-health-gate.json');
const VAI_577_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-577-daemon-launch-health-gate.json');
const VAI_580_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-580-daemon-launch-health-gate.json');
const VAI_583_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-583-daemon-launch-health-gate.json');
const VAI_586_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-586-daemon-launch-health-gate.json');
const VAI_589_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-589-daemon-launch-health-gate.json');
const VAI_593_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-593-daemon-launch-health-gate.json');
const VAI_596_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-596-daemon-launch-health-gate.json');
const VAI_599_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-599-daemon-launch-health-gate.json');
const VAI_602_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-602-daemon-launch-health-gate.json');
const VAI_605_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-605-daemon-launch-health-gate.json');
const VAI_608_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-608-daemon-launch-health-gate.json');
const VAI_612_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-612-daemon-launch-health-gate.json');
const VAI_615_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-615-daemon-launch-health-gate.json');
const VAI_618_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-618-daemon-launch-health-gate.json');
const VAI_621_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-621-daemon-launch-health-gate.json');
const VAI_624_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-624-daemon-launch-health-gate.json');
const VAI_627_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-627-daemon-launch-health-gate.json');
const VAI_630_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-630-daemon-launch-health-gate.json');
const VAI_633_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-633-daemon-launch-health-gate.json');
const VAI_636_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-636-daemon-launch-health-gate.json');
const VAI_639_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-639-daemon-launch-health-gate.json');
const VAI_641_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-641-daemon-launch-health-gate.json');
const VAI_643_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-643-daemon-launch-health-gate.json');
const VAI_645_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-645-daemon-launch-health-gate.json');
const VAI_648_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-648-daemon-launch-health-gate.json');
const VAI_650_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-650-daemon-launch-health-gate.json');
const HAO_719_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'hao-719-daemon-launch-health-gate.json');
const HAO_721_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'hao-721-daemon-launch-health-gate.json');
const HAO_715_REPAIR_RECEIPT = path.join(
  repoRoot,
  'data',
  'hallucinate_multimodal_control',
  'discovery',
  '2026-06-27-hao-715-hao-713-retry-budget-repair.md'
);
const DAEMON_IDS = ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'];
const BACKEND_PACKAGES = ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'];

function jsonBlockAfter(source: string, marker: string) {
  const start = source.indexOf(marker);
  const fenceStart = source.indexOf('```json', start);
  const payloadStart = source.indexOf('\n', fenceStart) + 1;
  const payloadEnd = source.indexOf('\n```', payloadStart);
  return JSON.parse(source.slice(payloadStart, payloadEnd));
}

test.describe('MGW-535 daemon launch health Playwright gate', () => {
  test('keeps the daemon launch validation gate fixture in parity with the manager', () => {
    const manager = new MCPDaemonManager();
    const gate = manager.getDaemonLaunchValidationGate();
    const fixture = JSON.parse(fs.readFileSync(GATE_FIXTURE, 'utf8'));

    expect(gate).toEqual(fixture);
    expect(gate.task_id).toBe('MGW-535');
    expect(gate.vai_task_id).toBe('VAI-519');
    expect(gate.vai_task_ids).toEqual([
      'VAI-519',
      'VAI-530',
      'VAI-536',
      'VAI-538',
      'VAI-540',
      'VAI-549',
      'VAI-555',
      'VAI-557',
      'VAI-565',
      'VAI-568',
      'VAI-574',
      'VAI-577',
      'VAI-580',
      'VAI-583',
      'VAI-586',
      'VAI-589',
      'VAI-593',
      'VAI-596',
      'VAI-599',
      'VAI-602',
      'VAI-605',
      'VAI-608',
      'VAI-612',
      'VAI-615',
      'VAI-618',
      'VAI-621',
      'VAI-624',
      'VAI-627',
      'VAI-630',
      'VAI-633',
      'VAI-636',
      'VAI-639',
      'VAI-641'
    ]);
    expect(gate.backlog_task_ids).toEqual(['HAO-702', 'HAO-713', 'HAO-719', 'HAO-721']);
    expect(gate.goal_id).toBe('VAIOS-G728');
    expect(gate.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(gate.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(gate.evidence_term).toBe('launch Playwright validation gate');
    expect(gate.objective_gap_receipt).toBe('data/virtual_ai_os/discovery/2026-06-26-vai-519-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-06-27-vai-530-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-06-28-vai-536-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-06-28-vai-538-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-06-28-vai-540-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-02-vai-549-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-02-vai-555-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-02-vai-557-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-03-vai-565-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-568-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-574-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-577-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-580-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-583-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-586-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-589-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-593-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-596-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-599-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-602-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-605-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-608-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-612-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-615-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-618-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-621-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-624-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-627-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-630-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-633-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-636-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-639-objective-gap-b023c8de5b69.md');
    expect(gate.objective_gap_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-641-objective-gap-b023c8de5b69.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-06-26-vai-519-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-06-27-vai-530-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-06-28-vai-536-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-06-28-vai-538-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-06-28-vai-540-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-02-vai-549-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-02-vai-555-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-02-vai-557-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-03-vai-565-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-568-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-574-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-577-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-580-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-583-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-586-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-589-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-593-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-596-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-599-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-602-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-605-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-608-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-615-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-618-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-621-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-624-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-627-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-630-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-633-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-636-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-639-daemon-launch-health-gate.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-07-04-vai-641-daemon-launch-health-gate.md');
    expect(gate.supervisor_gap_receipts).toContain('data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-objective-gap-b023c8de5b69.md');
    expect(gate.supervisor_gap_receipts).toContain('data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-objective-gap-b023c8de5b69.md');
    expect(gate.supervisor_gap_receipts).toContain('data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-objective-gap-b023c8de5b69.md');
    expect(gate.hallucinate_backlog_receipts).toContain('data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-daemon-launch-health-gate.md');
    expect(gate.hallucinate_backlog_receipts).toContain('data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-daemon-launch-health-gate.md');
    expect(gate.hallucinate_backlog_receipts).toContain('data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-daemon-launch-health-gate.md');
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

  test('closes the MGW-551 daemon launch objective gap with the current Playwright gate', () => {
    const manager = new MCPDaemonManager();
    const fixture = JSON.parse(fs.readFileSync(MGW_551_GATE_FIXTURE, 'utf8'));
    const gates = manager.getDaemonLaunchValidationGates();
    const gate = gates.find((candidate: any) => candidate.task_id === 'MGW-551') as any;
    const launchPlan = manager.getLaunchPlan();

    expect(gate).toBeTruthy();
    expect(gate).toEqual(fixture);
    expect(gates.map((candidate: any) => candidate.task_id)).toEqual([
      'MGW-535',
      'MGW-551',
      'MGW-556',
      'VAI-536',
      'VAI-538',
      'VAI-540',
      'VAI-549',
      'VAI-555',
      'VAI-557',
      'VAI-565',
      'VAI-568',
      'VAI-574',
      'VAI-577',
      'VAI-580',
      'VAI-583',
      'VAI-586',
      'VAI-589',
      'VAI-593',
      'VAI-596',
      'VAI-599',
      'VAI-602',
      'VAI-605',
      'VAI-608',
      'VAI-612',
      'VAI-615',
      'VAI-618',
      'VAI-621',
      'VAI-624',
      'VAI-627',
      'VAI-630',
      'VAI-633',
      'VAI-636',
      'VAI-639',
      'VAI-641',
      'VAI-643',
      'VAI-645',
      'VAI-648',
      'VAI-650',
      'HAO-719',
      'HAO-721'
    ]);
    expect(gate.goal_id).toBe('VAIOS-G728');
    expect(gate.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(gate.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(gate.evidence_term).toBe('launch Playwright validation gate');
    expect(gate.supervisor_gap_receipt).toBe(
      'data/meta_glasses_display_widgets/discovery/2026-06-27-mgw-551-objective-gap-b023c8de5b69.md'
    );
    expect(gate.launch_gate_receipt).toBe(
      'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-551-daemon-launch-health-gate.md'
    );
    expect(gate.validation_commands).toEqual(expect.arrayContaining([
      'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
      'npm --prefix swissknife run test:e2e:meta-glasses',
      'npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts',
      'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
    ]));
    expect(gate.required_evidence).toEqual(expect.arrayContaining([
      'Hallucinate App daemon health',
      'daemon launcher',
      'MCP server',
      'MCP dashboard',
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py',
      'dashboard capability catalog',
      'Swissknife applications',
      'launch Playwright validation gate'
    ]));
    const expectedLaunchGateIds = gates.map((candidate: any) => candidate.task_id);
    expect(launchPlan.every((entry: any) => (
      expectedLaunchGateIds.every((taskId: string) => (
        entry.launch_validation_gates.some((candidate: any) => candidate.task_id === taskId)
      ))
    ))).toBe(true);
    expect(gate.daemon_health_paths.map((entry: any) => entry.daemon_id)).toEqual(DAEMON_IDS);
    expect(gate.required_backends).toEqual(BACKEND_PACKAGES);
    expect(gate.swissknife_handoff.every((entry: any) => entry.swissknife_consumer.includes('Swissknife'))).toBe(true);
  });

  test('closes the MGW-556 daemon launch objective gap with the current Playwright gate', () => {
    const manager = new MCPDaemonManager();
    const fixture = JSON.parse(fs.readFileSync(MGW_556_GATE_FIXTURE, 'utf8'));
    const gates = manager.getDaemonLaunchValidationGates();
    const gate = gates.find((candidate: any) => candidate.task_id === 'MGW-556') as any;
    const launchPlan = manager.getLaunchPlan();

    expect(gate).toBeTruthy();
    expect(gate).toEqual(fixture);
    expect(gate.goal_id).toBe('VAIOS-G728');
    expect(gate.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(gate.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(gate.evidence_term).toBe('launch Playwright validation gate');
    expect(gate.supervisor_gap_receipt).toBe(
      'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-556-objective-gap-b023c8de5b69.md'
    );
    expect(gate.objective_gap_receipt).toBe(gate.supervisor_gap_receipt);
    expect(gate.objective_gap_receipts).toContain(gate.supervisor_gap_receipt);
    expect(gate.launch_gate_receipt).toBe(
      'data/meta_glasses_display_widgets/discovery/2026-06-28-mgw-556-daemon-launch-health-gate.md'
    );
    expect(gate.discovery_receipts).toContain(gate.launch_gate_receipt);
    expect(gate.validation_commands).toEqual([
      'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts'
    ]);
    expect(gate.playwright_specs).toContain('hallucinate_app/test/e2e/daemon-launch-health.spec.ts');
    expect(gate.required_backends).toEqual(BACKEND_PACKAGES);
    expect(gate.required_evidence).toEqual(expect.arrayContaining([
      'Hallucinate App daemon health',
      'daemon launcher',
      'MCP server',
      'MCP dashboard',
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py',
      'dashboard capability catalog',
      'Swissknife applications',
      'launch Playwright validation gate'
    ]));
    expect(launchPlan.every((entry: any) => (
      entry.launch_validation_gates.some((candidate: any) => (
        candidate.task_id === 'MGW-556' &&
        candidate.supervisor_gap_receipt === gate.supervisor_gap_receipt &&
        candidate.launch_gate_receipt === gate.launch_gate_receipt
      ))
    ))).toBe(true);
    expect(gate.daemon_health_paths.map((entry: any) => entry.daemon_id)).toEqual(DAEMON_IDS);
    expect(gate.swissknife_handoff.every((entry: any) => entry.swissknife_consumer.includes('Swissknife'))).toBe(true);
  });

  test('binds the VAI-519 objective gap receipt to the daemon launch health gate', () => {
    const manager = new MCPDaemonManager();
    const gate = manager.getDaemonLaunchValidationGate();
    const receipt = JSON.parse(fs.readFileSync(VAI_GATE_FIXTURE, 'utf8'));

    expect(receipt.schema).toBe('virtual_ai_os.daemon_launch_validation_gate.v1');
    expect(receipt.task_id).toBe('VAI-519');
    expect(receipt.goal_id).toBe('VAIOS-G728');
    expect(receipt.goal_packet).toBe(gate.goal_packet);
    expect(receipt.packet_goals).toEqual(gate.packet_goals);
    expect(receipt.evidence_term).toBe(gate.evidence_term);
    expect(receipt.objective_gap_receipt).toBe(gate.objective_gap_receipt);
    expect(receipt.daemon_gate_task_id).toBe(gate.task_id);
    expect(receipt.playwright_specs).toEqual(gate.playwright_specs);
    expect(receipt.validation_commands).toEqual(gate.validation_commands);
    expect(receipt.required_backends).toEqual(gate.required_backends);
    expect(receipt.required_evidence).toEqual(gate.required_evidence);
    expect(receipt.daemon_health_paths).toEqual(gate.daemon_health_paths);
    expect(receipt.swissknife_handoff).toEqual(gate.swissknife_handoff);
  });

  test('binds the VAI-530 objective gap receipt to the daemon launch health gate', () => {
    const manager = new MCPDaemonManager();
    const gate = manager.getDaemonLaunchValidationGate();
    const receipt = JSON.parse(fs.readFileSync(VAI_530_GATE_FIXTURE, 'utf8'));

    expect(receipt.schema).toBe('virtual_ai_os.daemon_launch_validation_gate.v1');
    expect(receipt.task_id).toBe('VAI-530');
    expect(receipt.goal_id).toBe('VAIOS-G728');
    expect(receipt.goal_packet).toBe(gate.goal_packet);
    expect(receipt.packet_goals).toEqual(gate.packet_goals);
    expect(receipt.evidence_term).toBe(gate.evidence_term);
    expect(receipt.objective_gap_receipt).toBe('data/virtual_ai_os/discovery/2026-06-27-vai-530-objective-gap-b023c8de5b69.md');
    expect(gate.vai_task_ids).toContain(receipt.task_id);
    expect(gate.discovery_receipts).toContain(receipt.receipt_path);
    expect(gate.objective_gap_receipts).toContain(receipt.objective_gap_receipt);
    expect(receipt.daemon_gate_task_id).toBe(gate.task_id);
    expect(receipt.playwright_specs).toEqual(gate.playwright_specs);
    expect(receipt.validation_commands).toEqual(gate.validation_commands);
    expect(receipt.required_backends).toEqual(gate.required_backends);
    expect(receipt.required_evidence).toEqual(gate.required_evidence);
    expect(receipt.daemon_health_paths).toEqual(gate.daemon_health_paths);
    expect(receipt.swissknife_handoff).toEqual(gate.swissknife_handoff);
    expect(receipt.playwright_gate).toMatchObject({
      surface: 'hallucinate_app',
      command: 'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
      spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts'
    });
    expect(receipt.supervisor_alignment).toMatchObject({
      objective_heap_goal: 'VAIOS-G728',
      packet_sibling_goal: 'VAIOS-G724',
      backlog_task: 'VAI-530',
      shared_packet_task: 'MGW-535',
      keeps_supervisor_fed_backlog_aligned: true
    });
    expect(receipt.failure_rule).toBe(gate.failure_rule);
  });

  test('binds the VAI-536 objective gap receipt to the daemon launch health gate', () => {
    const manager = new MCPDaemonManager();
    const gate = manager.getDaemonLaunchValidationGate();
    const gates = manager.getDaemonLaunchValidationGates();
    const receipt = JSON.parse(fs.readFileSync(VAI_536_GATE_FIXTURE, 'utf8'));
    const vai536Gate = gates.find((candidate: any) => candidate.task_id === 'VAI-536') as any;

    expect(vai536Gate).toBeTruthy();
    expect(vai536Gate).toEqual(receipt);
    expect(receipt.schema).toBe('hallucinate_app.daemon_launch_validation_gate.v1');
    expect(receipt.receipt_schema).toBe('launch_readiness_receipt_v1');
    expect(receipt.task_id).toBe('VAI-536');
    expect(receipt.goal_id).toBe('VAIOS-G728');
    expect(receipt.goal_packet).toBe(gate.goal_packet);
    expect(receipt.packet_goals).toEqual(gate.packet_goals);
    expect(receipt.evidence_term).toBe(gate.evidence_term);
    expect(receipt.objective_gap_receipt).toBe('data/virtual_ai_os/discovery/2026-06-28-vai-536-objective-gap-b023c8de5b69.md');
    expect(receipt.launch_gate_receipt).toBe('data/virtual_ai_os/discovery/2026-06-28-vai-536-daemon-launch-health-gate.md');
    expect(gate.vai_task_ids).toContain(receipt.task_id);
    expect(gate.discovery_receipts).toContain(receipt.launch_gate_receipt);
    expect(gate.objective_gap_receipts).toContain(receipt.objective_gap_receipt);
    expect(receipt.shared_packet_task_id).toBe(gate.task_id);
    expect(receipt.playwright_specs).toEqual(gate.playwright_specs);
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
      'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
      'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts',
      'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
    ]));
    expect(receipt.required_backends).toEqual(gate.required_backends);
    expect(receipt.required_evidence).toEqual(gate.required_evidence);
    expect(receipt.daemon_health_paths).toEqual(gate.daemon_health_paths);
    expect(receipt.swissknife_handoff).toEqual(gate.swissknife_handoff);
    expect(receipt.failure_rule).toBe(gate.failure_rule);
  });

  test('binds the rolling VAI daemon objective gap receipts through VAI-645 to the daemon launch Playwright gate', () => {
    const manager = new MCPDaemonManager();
    const gate = manager.getDaemonLaunchValidationGate();
    const gates = manager.getDaemonLaunchValidationGates();
    const launchPlan = manager.getLaunchPlan();
    const fixtures = [
      {
        taskId: 'VAI-538',
        fixturePath: VAI_538_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-538-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-538-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-540',
        fixturePath: VAI_540_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-540-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-06-28-vai-540-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-549',
        fixturePath: VAI_549_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-549-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-549-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-555',
        fixturePath: VAI_555_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-555-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-555-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-557',
        fixturePath: VAI_557_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-557-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-02-vai-557-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-565',
        fixturePath: VAI_565_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-565-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-03-vai-565-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-568',
        fixturePath: VAI_568_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-568-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-568-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-574',
        fixturePath: VAI_574_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-574-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-574-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-577',
        fixturePath: VAI_577_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-577-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-577-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-580',
        fixturePath: VAI_580_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-580-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-580-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-583',
        fixturePath: VAI_583_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-583-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-583-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-586',
        fixturePath: VAI_586_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-586-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-586-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-589',
        fixturePath: VAI_589_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-589-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-589-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-593',
        fixturePath: VAI_593_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-593-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-593-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-596',
        fixturePath: VAI_596_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-596-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-596-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-599',
        fixturePath: VAI_599_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-599-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-599-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-602',
        fixturePath: VAI_602_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-602-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-602-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-605',
        fixturePath: VAI_605_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-605-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-605-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-608',
        fixturePath: VAI_608_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-608-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-608-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-612',
        fixturePath: VAI_612_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-612-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-612-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-615',
        fixturePath: VAI_615_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-615-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-615-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-618',
        fixturePath: VAI_618_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-618-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-618-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-621',
        fixturePath: VAI_621_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-621-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-621-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-624',
        fixturePath: VAI_624_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-624-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-624-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-627',
        fixturePath: VAI_627_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-627-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-627-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-630',
        fixturePath: VAI_630_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-630-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-630-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-633',
        fixturePath: VAI_633_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-633-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-633-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-636',
        fixturePath: VAI_636_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-636-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-636-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-639',
        fixturePath: VAI_639_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-639-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-639-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-641',
        fixturePath: VAI_641_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-641-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-641-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-643',
        fixturePath: VAI_643_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-643-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-643-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-645',
        fixturePath: VAI_645_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-645-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-04-vai-645-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-648',
        fixturePath: VAI_648_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-648-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-648-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      },
      {
        taskId: 'VAI-650',
        fixturePath: VAI_650_GATE_FIXTURE,
        gapReceipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-650-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/virtual_ai_os/discovery/2026-07-05-vai-650-daemon-launch-health-gate.md',
        daemonLaunchCommand: 'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      }
    ];

    for (const fixture of fixtures) {
      const receipt = JSON.parse(fs.readFileSync(fixture.fixturePath, 'utf8'));
      const vaiGate = gates.find((candidate: any) => candidate.task_id === fixture.taskId) as any;

      expect(vaiGate).toBeTruthy();
      expect(vaiGate).toEqual(receipt);
      expect(receipt.schema).toBe('hallucinate_app.daemon_launch_validation_gate.v1');
      expect(receipt.receipt_schema).toBe('launch_readiness_receipt_v1');
      expect(receipt.task_id).toBe(fixture.taskId);
      expect(receipt.goal_id).toBe('VAIOS-G728');
      expect(receipt.goal_packet).toBe(gate.goal_packet);
      expect(receipt.packet_goals).toEqual(gate.packet_goals);
      expect(receipt.evidence_term).toBe(gate.evidence_term);
      expect(receipt.objective_gap_receipt).toBe(fixture.gapReceipt);
      expect(receipt.launch_gate_receipt).toBe(fixture.launchReceipt);
      expect(vaiGate.vai_task_ids).toContain(receipt.task_id);
      expect(vaiGate.discovery_receipts).toContain(receipt.launch_gate_receipt);
      expect(vaiGate.objective_gap_receipts).toContain(receipt.objective_gap_receipt);
      expect(receipt.shared_packet_task_id).toBe(gate.task_id);
      expect(receipt.playwright_specs).toEqual(gate.playwright_specs);
      expect(receipt.validation_commands).toEqual(expect.arrayContaining([
        'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
        'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
        'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts',
        fixture.daemonLaunchCommand
      ]));
      expect(receipt.required_backends).toEqual(gate.required_backends);
      expect(receipt.required_evidence).toEqual(gate.required_evidence);
      expect(receipt.daemon_health_paths).toEqual(gate.daemon_health_paths);
      expect(receipt.swissknife_handoff).toEqual(gate.swissknife_handoff);
      expect(receipt.failure_rule).toBe(gate.failure_rule);

      for (const entry of launchPlan) {
        const launchPlanGate = entry.launch_validation_gates.find(
          (candidate: any) => candidate.task_id === fixture.taskId
        );
        expect(launchPlanGate).toMatchObject({
          task_id: receipt.task_id,
          goal_id: receipt.goal_id,
          evidence_term: receipt.evidence_term,
          playwright_spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts',
          objective_gap_receipt: receipt.objective_gap_receipt,
          launch_gate_receipt: receipt.launch_gate_receipt
        });
      }
    }
  });

  test('binds the HAO-719 and HAO-721 objective gaps to the daemon launch Playwright gate', () => {
    const manager = new MCPDaemonManager();
    const gate = manager.getDaemonLaunchValidationGate();
    const gates = manager.getDaemonLaunchValidationGates();
    const fixtures = [
      {
        taskId: 'HAO-719',
        fixturePath: HAO_719_GATE_FIXTURE,
        gapReceipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-719-daemon-launch-health-gate.md'
      },
      {
        taskId: 'HAO-721',
        fixturePath: HAO_721_GATE_FIXTURE,
        gapReceipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-objective-gap-b023c8de5b69.md',
        launchReceipt: 'data/hallucinate_multimodal_control/discovery/2026-06-28-hao-721-daemon-launch-health-gate.md'
      }
    ];

    for (const fixture of fixtures) {
      const haoGate = gates.find((candidate: any) => candidate.task_id === fixture.taskId) as any;
      const receipt = JSON.parse(fs.readFileSync(fixture.fixturePath, 'utf8'));

      expect(haoGate).toBeTruthy();
      expect(haoGate).toEqual(receipt);
      expect(receipt.schema).toBe('hallucinate_app.daemon_launch_validation_gate.v1');
      expect(receipt.task_id).toBe(fixture.taskId);
      expect(receipt.goal_id).toBe(gate.goal_id);
      expect(receipt.goal_packet).toBe(gate.goal_packet);
      expect(receipt.packet_goals).toEqual(gate.packet_goals);
      expect(receipt.evidence_term).toBe(gate.evidence_term);
      expect(receipt.objective_gap_receipt).toBe(fixture.gapReceipt);
      expect(receipt.objective_gap_receipts).toContain(fixture.gapReceipt);
      expect(receipt.supervisor_gap_receipt).toBe(fixture.gapReceipt);
      expect(receipt.launch_gate_receipt).toBe(fixture.launchReceipt);
      expect(receipt.hallucinate_backlog_receipt).toBe(fixture.launchReceipt);
      expect(receipt.shared_packet_task_id).toBe(gate.task_id);
      expect(gate.backlog_task_ids).toContain(fixture.taskId);
      expect(gate.supervisor_gap_receipts).toContain(fixture.gapReceipt);
      expect(gate.hallucinate_backlog_receipts).toContain(fixture.launchReceipt);
      expect(receipt.playwright_specs).toEqual(gate.playwright_specs);
      expect(receipt.validation_commands).toEqual(expect.arrayContaining([
        'PYTHONPATH=external/ipfs_accelerate:external/ipfs_datasets pytest tests/test_hallucinate_multimodal_control_todo_queue.py -q',
        'test ! -f swissknife/package.json || npm --prefix swissknife run test:e2e:meta-glasses',
        'test ! -f hallucinate_app/package.json || npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts',
        'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts'
      ]));
      expect(receipt.required_backends).toEqual(gate.required_backends);
      expect(receipt.required_evidence).toEqual(gate.required_evidence);
      expect(receipt.daemon_health_paths).toEqual(gate.daemon_health_paths);
      expect(receipt.swissknife_handoff).toEqual(gate.swissknife_handoff);
      expect(receipt.failure_rule).toBe(gate.failure_rule);
    }
  });

  test('keeps HAO-715 retry-budget repair aligned with headless-safe launch specs', () => {
    const receiptSource = fs.readFileSync(HAO_715_REPAIR_RECEIPT, 'utf8');
    const receipt = jsonBlockAfter(receiptSource, '## Repair Fixture');

    expect(receipt.task_id).toBe('HAO-715');
    expect(receipt.source_task_id).toBe('HAO-713');
    expect(receipt.blocked_validation_diagnostic).toBe('missing_xvfb_for_electron_playwright');
    expect(receipt.blocked_validation_exit_code).toBe(78);
    expect(receipt.preserves_launch_playwright_validation_gate).toBe(true);
    expect(receipt.headless_safe_specs).toContain(
      'hallucinate_app/test/e2e/multimodal-control-surface.spec.ts'
    );
    expect(receipt.headless_safe_specs).toContain(
      'hallucinate_app/test/e2e/daemon-launch-health.spec.ts'
    );
  });

  test('closes the HAO-713 objective gap with the daemon launch Playwright gate', () => {
    const manager = new MCPDaemonManager();
    const gate = manager.getDaemonLaunchValidationGate();
    const receipt = JSON.parse(fs.readFileSync(HAO_713_GATE_FIXTURE, 'utf8'));

    expect(receipt.schema).toBe('hao_daemon_launch_health_gate_v1');
    expect(receipt.task_id).toBe('HAO-713');
    expect(receipt.shared_packet_task_id).toBe(gate.task_id);
    expect(receipt.goal_id).toBe(gate.goal_id);
    expect(receipt.goal_packet).toBe(gate.goal_packet);
    expect(receipt.packet_goals).toEqual(gate.packet_goals);
    expect(receipt.evidence_term).toBe(gate.evidence_term);
    expect(receipt.missing_evidence_source).toBe('data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-objective-gap-b023c8de5b69.md');
    expect(receipt.receipt_path).toBe('data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-daemon-launch-health-gate.md');
    expect(gate.backlog_task_ids).toContain(receipt.task_id);
    expect(gate.supervisor_gap_receipts).toContain(receipt.missing_evidence_source);
    expect(gate.hallucinate_backlog_receipts).toContain(receipt.receipt_path);
    expect(receipt.playwright_gate).toMatchObject({
      surface: 'hallucinate_app',
      command: 'npm --prefix hallucinate_app run test:e2e -- daemon-launch-health.spec.ts',
      spec: 'hallucinate_app/test/e2e/daemon-launch-health.spec.ts'
    });
    expect(receipt.playwright_specs).toEqual(gate.playwright_specs);
    expect(receipt.validation_commands).toEqual(gate.validation_commands);
    expect(receipt.required_backends).toEqual(gate.required_backends);
    expect(receipt.required_evidence).toEqual(gate.required_evidence);
    expect(receipt.daemon_health_paths).toEqual(gate.daemon_health_paths);
    expect(receipt.swissknife_handoff).toEqual(gate.swissknife_handoff);
    expect(receipt.supervisor_alignment).toMatchObject({
      objective_heap_goal: 'VAIOS-G728',
      packet_sibling_goal: 'VAIOS-G724',
      backlog_task: 'HAO-713',
      shared_packet_task: 'MGW-535',
      keeps_supervisor_fed_backlog_aligned: true
    });
  });
});
