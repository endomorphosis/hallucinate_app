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
const VAI_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'vai-519-daemon-launch-health-gate.json');
const HAO_713_GATE_FIXTURE = path.join(__dirname, 'fixtures', 'hao-713-daemon-launch-health-gate.json');
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
    expect(gate.goal_id).toBe('VAIOS-G728');
    expect(gate.goal_packet).toBe('goal_packet/launch/hallucinate_app/44dceea6bc53');
    expect(gate.packet_goals).toEqual(['VAIOS-G724', 'VAIOS-G728']);
    expect(gate.backlog_task_ids).toEqual(['HAO-702', 'HAO-713']);
    expect(gate.evidence_term).toBe('launch Playwright validation gate');
    expect(gate.objective_gap_receipt).toBe('data/virtual_ai_os/discovery/2026-06-26-vai-519-objective-gap-b023c8de5b69.md');
    expect(gate.discovery_receipts).toContain('data/virtual_ai_os/discovery/2026-06-26-vai-519-daemon-launch-health-gate.md');
    expect(gate.supervisor_gap_receipts).toContain('data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-objective-gap-b023c8de5b69.md');
    expect(gate.hallucinate_backlog_receipts).toContain('data/hallucinate_multimodal_control/discovery/2026-06-27-hao-713-daemon-launch-health-gate.md');
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
