import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import playwrightTest from '@playwright/test';

type JsonMap = Record<string, any>;

const { test, expect } = playwrightTest as unknown as typeof import('@playwright/test');

const APP_ROOT = process.cwd();
const TEST_RESULTS_DIR = path.join(APP_ROOT, 'test-results');
const HAO_039_POLICY_USER_ID = 'hao-039-operator';
const HAO_039_POLICY_PROFILE_ID = 'multimodal-control-surface-e2e';
const ALLOW_POLICY_ID = 'policy:hao-039-allow-display-activation';
const PYTHON_POLICY_EVALUATOR = 'hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction';

const CANONICAL_INTENT = 'display.activate';
const CANONICAL_METHOD = 'activate';
const CANONICAL_TARGET_REF = 'widget:primary-action';
const CANONICAL_ARGUMENTS = { widget_id: 'primary-action', source_test: 'HAO-039' };
const METHOD_GATE = 'hallucinate_app.node.control_surface_invocation.ControlSurfaceInvocationGate.beforeInvoke';
const RECEIPT_GATE = 'hallucinate_app.node.control_surface_invocation';
const EXPECTED_SCHEMA_REFS = [
  'control_surface_contract',
  'interaction_envelope',
  'policy_decision',
  'mediation_receipt'
];

const CLIENT_INVOCATIONS = [
  {
    client: 'voice',
    invocation: {
      client_label: 'voice',
      operation: CANONICAL_METHOD,
      target_ref: CANONICAL_TARGET_REF,
      arguments: CANONICAL_ARGUMENTS,
      control_surface: {
        surface: 'voice',
        surface_event: 'utterance',
        intent: CANONICAL_INTENT,
        confidence: 0.98,
        actor: { type: 'user', id: 'user:operator', delegation_chain: [] }
      },
      transcript: 'activate the primary action'
    }
  },
  {
    client: 'gesture',
    invocation: {
      client_label: 'gesture',
      method: CANONICAL_METHOD,
      target_ref: CANONICAL_TARGET_REF,
      arguments: CANONICAL_ARGUMENTS,
      control_surface: {
        surface: 'gesture',
        surface_event: 'tap',
        intent: CANONICAL_INTENT,
        confidence: 0.96,
        actor: { type: 'user', id: 'user:operator', delegation_chain: [] }
      },
      gesture_token: 'captouch.single_tap'
    }
  },
  {
    client: 'mouse',
    invocation: {
      client_label: 'mouse',
      command: CANONICAL_METHOD,
      target_ref: CANONICAL_TARGET_REF,
      arguments: CANONICAL_ARGUMENTS,
      control_surface: {
        surface: 'mouse',
        surface_event: 'click',
        intent: CANONICAL_INTENT,
        confidence: 1,
        actor: { type: 'user', id: 'user:operator', delegation_chain: [] }
      },
      pointer: { button: 'primary', x: 120, y: 48 }
    }
  },
  {
    client: 'agent',
    invocation: {
      client_label: 'agent',
      tool_name: CANONICAL_METHOD,
      target_ref: CANONICAL_TARGET_REF,
      arguments: CANONICAL_ARGUMENTS,
      control_surface: {
        surface: 'agent',
        surface_event: 'autonomous_invoke',
        intent: CANONICAL_INTENT,
        confidence: 0.99,
        actor: {
          type: 'agent',
          id: 'agent:planner',
          delegation_chain: ['user:operator', 'agent:planner']
        }
      },
      agent_id: 'agent:planner'
    }
  },
  {
    client: 'remote-meta-glasses',
    invocation: {
      client_label: 'remote-meta-glasses',
      remote_client: true,
      method: CANONICAL_METHOD,
      target_ref: CANONICAL_TARGET_REF,
      arguments: CANONICAL_ARGUMENTS,
      control_surface: {
        surface: 'gesture',
        surface_event: 'tap',
        intent: CANONICAL_INTENT,
        confidence: 0.95,
        actor: { type: 'user', id: 'user:operator', delegation_chain: [] }
      },
      context: {
        platform: 'meta_glasses',
        state_frames: [],
        device_mode: 'display_webapp',
        device_context: {
          remote_surface: 'meta-rayban-display-simulator',
          transport_path: 'mobile-orb-publish-glasses-event'
        }
      },
      remote_event: {
        client: 'meta_glasses',
        event_id: 'remote-event:hao-039',
        raw_action: 'display.tap.primary'
      }
    }
  }
];

const DENIED_GESTURE_INVOCATION = {
  client_label: 'gesture-sleeping',
  method: CANONICAL_METHOD,
  target_ref: CANONICAL_TARGET_REF,
  arguments: { ...CANONICAL_ARGUMENTS, source_test: 'HAO-039-deny' },
  control_surface: {
    surface: 'gesture',
    surface_event: 'tap',
    intent: CANONICAL_INTENT,
    confidence: 0.97,
    actor: { type: 'user', id: 'user:operator', delegation_chain: [] }
  },
  context: {
    local_time: '2026-05-23T23:15:00-07:00',
    state_frames: ['sleeping'],
    device_mode: 'quiet_hours',
    platform: 'hallucinate_app',
    device_context: { timezone: 'America/Los_Angeles' }
  },
  gesture_token: 'captouch.single_tap'
};

const CONFIRMATION_INVOCATION = {
  client_label: 'voice-confirmation',
  operation: 'send_message',
  target_ref: 'service:messaging',
  arguments: {
    recipient: 'operator-review@example.local',
    body: 'confirmation-gated HAO-039 message'
  },
  control_surface: {
    surface: 'voice',
    surface_event: 'utterance',
    intent: 'communication.send',
    confidence: 0.95,
    actor: { type: 'user', id: 'user:operator', delegation_chain: [] }
  },
  transcript: 'send a message to the operator review channel'
};

const SEED_POLICY_BUNDLE_STORE_PY = String.raw`
import json
import sys

from hallucinate_app.control_surface_logic_ir import (
    ControlSurfaceNorm,
    ControlSurfacePolicy,
    DeonticOutcome,
    InvocationEffect,
    stable_control_surface_id,
)
from hallucinate_app.control_surface_mediator import load_active_policy_bundles
from hallucinate_app.control_surface_policy import compile_strict_template_rule
from hallucinate_app.control_surface_store import PolicyBundleStore

payload = json.loads(sys.stdin.read() or "{}")
store = PolicyBundleStore(payload["store_dir"])
user_id = payload["user_id"]
profile_id = payload["profile_id"]

allow_effect = InvocationEffect(
    outcome=DeonticOutcome.ALLOW,
    method="activate",
    target_ref="widget:primary-action",
    reason="HAO-039 persisted allow policy permits the shared display activation method.",
)
allow_norm = ControlSurfaceNorm(
    norm_id=stable_control_surface_id("norm", "hao-039", "allow", "display.activate"),
    outcome=DeonticOutcome.ALLOW,
    effect=allow_effect,
    actor="*",
    surface="*",
    surface_event="*",
    method="activate",
    target_ref="widget:primary-action",
    priority=40,
    source_text="Allow display activation from voice, gesture, mouse, agent, and remote clients.",
    explanation="HAO-039 persisted allow policy permits equivalent multimodal display.activate requests.",
    metadata={"test_contract": "HAO-039", "compiler_lane": "e2e_policy_bundle"},
)
allow_policy = ControlSurfacePolicy(
    policy_id=payload["allow_policy_id"],
    source_text=allow_norm.source_text,
    norms=[allow_norm],
    compiled_artifacts={
        "compiler_lane": "e2e_policy_bundle",
        "confidence": 1.0,
        "deontic_outcomes": ["allow"],
    },
    explanations=[allow_norm.explanation],
)
deny_policy = compile_strict_template_rule(
    "Ignore my gestures at night, because I'm sleeping.",
    policy_id="policy:hao-039-deny-sleeping-gestures",
    actor="user:*",
    timezone="America/Los_Angeles",
)
confirmation_policy = compile_strict_template_rule(
    "require confirmation before sending messages",
    policy_id="policy:hao-039-require-confirmation-send-message",
    actor="user:*",
)

records = []
for policy in (allow_policy, deny_policy, confirmation_policy):
    record = store.persist_policy_bundle(
        policy,
        user_id=user_id,
        profile_id=profile_id,
        source="operator_profile",
        explanation="HAO-039 E2E policy_bundle persisted through PolicyBundleStore.",
    )
    records.append(record.as_dict())

active = load_active_policy_bundles(store, user_id=user_id, profile_id=profile_id)
print(json.dumps({
    "store_dir": payload["store_dir"],
    "user_id": user_id,
    "profile_id": profile_id,
    "policy_bundle_records": records,
    "active_policy_bundles": [bundle.as_dict() for bundle in active],
}, sort_keys=True))
`;

const EVALUATE_POLICY_BUNDLE_STORE_PY = String.raw`
import json
import sys

from hallucinate_app.control_surface_mediator import ControlSurfaceMediator
from hallucinate_app.control_surface_store import PolicyBundleStore

payload = json.loads(sys.stdin.read() or "{}")
store = PolicyBundleStore(payload["store_dir"])
mediator = ControlSurfaceMediator.from_profile(
    store=store,
    user_id=payload["user_id"],
    profile_id=payload["profile_id"],
)
decision = mediator.evaluate(payload["request"]["interaction_envelope"])
result = decision.as_dict()
result.setdefault("metadata", {})
result["metadata"]["policy_bundle_store"] = payload["store_dir"]
result["metadata"]["runtime_policy_evaluator"] = "hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction"
print(json.dumps(result, sort_keys=True))
`;

type SeededPolicyRuntime = {
  seed: JsonMap;
  storeDir: string;
  evaluate: (request: JsonMap) => JsonMap;
};

function comparablePolicyDecision(decision: JsonMap) {
  return {
    outcome: decision.outcome,
    policy_bundle_ref: decision.policy_bundle_ref,
    compiled_policy_cid: decision.compiled_policy_cid,
    matched_norms: decision.matched_norms.map((match: JsonMap) => ({
      norm_id: match.norm_id,
      outcome: match.outcome,
      priority: match.priority,
      policy_bundle_ref: match.policy_bundle_ref,
      compiled_policy_cid: match.compiled_policy_cid
    })),
    effects: decision.effects.map((effect: JsonMap) => ({
      outcome: effect.outcome,
      method: effect.method,
      target_ref: effect.target_ref,
      confirmation_required: effect.confirmation_required,
      rate_limit_key: effect.rate_limit_key
    })),
    before_invoke_hook: decision.metadata.before_invoke_hook,
    runtime_policy_evaluator: decision.metadata.runtime_policy_evaluator,
    fail_closed: decision.metadata.fail_closed,
    active_policy_count: decision.metadata.active_policy_count,
    selected_norm_id: decision.metadata.selected_norm_id,
    source: decision.metadata.source,
    service_id: decision.metadata.service_id,
    transport: decision.metadata.transport
  };
}

async function createPersistedPolicyManager(evaluatedRequests: JsonMap[] = []) {
  const { default: MCPDaemonManager } = await import('../../hallucinate_app/node/mcp_daemon_manager.js');
  const { ControlSurfaceInvocationGate } = await import('../../hallucinate_app/node/control_surface_invocation.js');
  const policyRuntime = await seedPersistedPolicyRuntime();
  const controlSurfaceInvocationGate = new ControlSurfaceInvocationGate({
    source: 'hallucinate_app.node.mcp_daemon_manager',
    policyEvaluator: async (request: JsonMap) => {
      evaluatedRequests.push({
        client: request.invocation_payload.client_label,
        surface: request.interaction_envelope.surface,
        surface_event: request.interaction_envelope.surface_event,
        method: request.method,
        target_ref: request.target_ref,
        intent: request.interaction_envelope.normalized_intent.intent,
        gate_source: request.source,
        remote_surface: request.interaction_envelope.context?.device_context?.remote_surface || ''
      });
      return policyRuntime.evaluate(request);
    }
  });

  return {
    manager: new MCPDaemonManager({ controlSurfaceInvocationGate }),
    policyRuntime
  };
}

async function seedPersistedPolicyRuntime(): Promise<SeededPolicyRuntime> {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const storeDir = path.join(TEST_RESULTS_DIR, 'hao-039-policy-bundles', suffix);
  await fs.mkdir(storeDir, { recursive: true });
  const seed = runPythonJson(SEED_POLICY_BUNDLE_STORE_PY, {
    store_dir: storeDir,
    user_id: HAO_039_POLICY_USER_ID,
    profile_id: HAO_039_POLICY_PROFILE_ID,
    allow_policy_id: ALLOW_POLICY_ID
  });

  return {
    seed,
    storeDir,
    evaluate: (request: JsonMap) => runPythonJson(EVALUATE_POLICY_BUNDLE_STORE_PY, {
      store_dir: storeDir,
      user_id: HAO_039_POLICY_USER_ID,
      profile_id: HAO_039_POLICY_PROFILE_ID,
      request
    })
  };
}

function runPythonJson(script: string, payload: JsonMap): JsonMap {
  const result = spawnSync(resolvePythonBinary(), ['-c', script], {
    cwd: APP_ROOT,
    env: pythonEnv(),
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Python control_surface policy evaluator failed (${result.status}): ${result.stderr}`);
  }

  const stdout = String(result.stdout || '').trim();
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Python control_surface policy evaluator returned non-JSON output: ${stdout}\n${error}`);
  }
}

let cachedPythonBinary = '';

function resolvePythonBinary() {
  if (cachedPythonBinary) {
    return cachedPythonBinary;
  }

  const candidates = [
    process.env.PYTHON,
    process.env.PYTHON_PATH,
    'python3',
    'python'
  ].filter(Boolean) as string[];

  for (const candidate of [...new Set(candidates)]) {
    const result = spawnSync(candidate, ['--version'], {
      cwd: APP_ROOT,
      encoding: 'utf-8'
    });
    if (!result.error && result.status === 0) {
      cachedPythonBinary = candidate;
      return cachedPythonBinary;
    }
  }

  throw new Error('No Python executable found for HAO-039 control_surface E2E policy evaluation.');
}

function pythonEnv() {
  const pythonPath = path.join(APP_ROOT, 'python');
  return {
    ...process.env,
    PYTHONPATH: process.env.PYTHONPATH
      ? `${pythonPath}${path.delimiter}${process.env.PYTHONPATH}`
      : pythonPath
  };
}

function expectPersistedPolicyDecision(result: JsonMap, outcome: string) {
  expect(result.policy_decision.outcome).toBe(outcome);
  expect(result.policy_decision.metadata.fail_closed).toBe(false);
  expect(result.policy_decision.metadata.runtime_policy_evaluator).toBe(PYTHON_POLICY_EVALUATOR);
  expect(result.policy_decision.metadata.policy_bundle_store).toContain('hao-039-policy-bundles');
  expect(result.policy_decision.metadata.active_policy_count).toBe(3);
  expect(result.policy_decision.policy_bundle_ref.source).toBe('operator_profile');
  expect(result.policy_decision.policy_bundle_ref.policy_cid).toMatch(/^sha256:policy_bundle:/);
}

function expectNodeMediationReceipt(result: JsonMap, outcome: string, invoked: boolean) {
  expect(result.mediation_receipt.control_surface_contract_ref).toBe('control_surface_contract:mcp-daemon:ipfs-kit');
  expect(result.mediation_receipt.metadata.before_invoke_hook).toBe(RECEIPT_GATE);
  expect(result.mediation_receipt.metadata.schema_refs).toEqual(EXPECTED_SCHEMA_REFS);
  expect(result.mediation_receipt.policy_decision.decision_id).toBe(result.policy_decision.decision_id);
  expect(result.mediation_receipt.mediation_result).toMatchObject({
    outcome,
    invoked,
    confirmation_required: outcome === 'require_confirmation'
  });
}

async function writeHao039Evidence(name: string, payload: JsonMap) {
  await fs.mkdir(TEST_RESULTS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(TEST_RESULTS_DIR, `hao-039-${name}.json`),
    JSON.stringify({
      task: 'HAO-039',
      generated_at: new Date().toISOString(),
      ...payload
    }, null, 2) + '\n',
    'utf-8'
  );
}

function receiptEvidence(result: JsonMap) {
  return {
    client: result.client,
    outcome: result.policy_decision.outcome,
    policy_bundle_ref: result.policy_decision.policy_bundle_ref,
    compiled_policy_cid: result.policy_decision.compiled_policy_cid,
    mediation_receipt: {
      receipt_id: result.mediation_receipt.receipt_id,
      before_invoke_hook: result.mediation_receipt.metadata.before_invoke_hook,
      source: result.mediation_receipt.metadata.source,
      mediation_result: result.mediation_receipt.mediation_result
    },
    interaction_envelope: {
      surface: result.interaction_envelope.surface,
      surface_event: result.interaction_envelope.surface_event,
      normalized_intent: result.interaction_envelope.normalized_intent,
      context: result.interaction_envelope.context
    }
  };
}

test.describe('multimodal control_surface end-to-end mediation', () => {
  test('voice, gesture, mouse, agent, and remote clients share persisted policy_bundle mediation receipts', async () => {
    const evaluatedRequests: JsonMap[] = [];
    const { manager, policyRuntime } = await createPersistedPolicyManager(evaluatedRequests);
    const invokedMethods: JsonMap[] = [];

    expect(policyRuntime.seed.policy_bundle_records).toHaveLength(3);
    expect(policyRuntime.seed.active_policy_bundles).toHaveLength(3);
    expect(policyRuntime.seed.active_policy_bundles.map((bundle: JsonMap) =>
      bundle.policy_bundle_ref.policy_cid
    )).toEqual(expect.arrayContaining(
      policyRuntime.seed.policy_bundle_records.map((record: JsonMap) => record.policy_cid)
    ));

    const results: JsonMap[] = [];
    for (const { client, invocation } of CLIENT_INVOCATIONS) {
      const result = await manager.invokeManagedService('ipfs-kit', invocation, async (_payload: JsonMap, mediation: JsonMap) => {
        invokedMethods.push({
          client,
          method: mediation.method,
          target_ref: mediation.target_ref,
          method_gate: mediation.policy_decision.metadata.before_invoke_hook,
          receipt_gate: mediation.mediation_receipt.metadata.before_invoke_hook,
          policy_bundle_ref: mediation.policy_decision.policy_bundle_ref
        });
        return {
          client,
          method_gate: mediation.policy_decision.metadata.before_invoke_hook,
          final_method: mediation.method,
          final_target_ref: mediation.target_ref
        };
      });
      results.push({ client, ...result });
    }

    expect(evaluatedRequests).toHaveLength(CLIENT_INVOCATIONS.length);
    expect(invokedMethods).toHaveLength(CLIENT_INVOCATIONS.length);
    expect(new Set(evaluatedRequests.map((request) => request.method))).toEqual(new Set([CANONICAL_METHOD]));
    expect(new Set(evaluatedRequests.map((request) => request.target_ref))).toEqual(new Set([CANONICAL_TARGET_REF]));
    expect(new Set(evaluatedRequests.map((request) => request.intent))).toEqual(new Set([CANONICAL_INTENT]));
    expect(new Set(invokedMethods.map((item) => item.method_gate))).toEqual(new Set([METHOD_GATE]));
    expect(new Set(invokedMethods.map((item) => item.receipt_gate))).toEqual(new Set([RECEIPT_GATE]));

    const baselineDecision = comparablePolicyDecision(results[0].policy_decision);
    for (const result of results) {
      expect(result.ok).toBe(true);
      expect(result.denied).toBe(false);
      expect(result.output).toMatchObject({
        method_gate: METHOD_GATE,
        final_method: CANONICAL_METHOD,
        final_target_ref: CANONICAL_TARGET_REF
      });
      expect(comparablePolicyDecision(result.policy_decision)).toEqual(baselineDecision);
      expectPersistedPolicyDecision(result, 'allow');
      expect(result.policy_decision.policy_bundle_ref.policy_id).toBe(ALLOW_POLICY_ID);
      expect(result.policy_decision.matched_norms[0]).toMatchObject({
        outcome: 'allow',
        policy_bundle_ref: result.policy_decision.policy_bundle_ref
      });
      expectNodeMediationReceipt(result, 'allow', true);
      expect(result.mediation_receipt.mediation_result).toMatchObject({
        final_method: CANONICAL_METHOD,
        final_target_ref: CANONICAL_TARGET_REF
      });
    }

    expect(new Set(results.map((result) => result.policy_decision.metadata.before_invoke_hook))).toEqual(new Set([METHOD_GATE]));
    expect(new Set(results.map((result) => result.policy_decision.metadata.runtime_policy_evaluator))).toEqual(new Set([PYTHON_POLICY_EVALUATOR]));
    expect(new Set(results.map((result) => result.mediation_receipt.metadata.before_invoke_hook))).toEqual(new Set([RECEIPT_GATE]));
    expect(new Set(results.map((result) => result.mediation_receipt.metadata.source))).toEqual(new Set(['hallucinate_app.node.mcp_daemon_manager']));

    const surfaces = new Set(evaluatedRequests.map((request) => request.surface));
    expect(surfaces).toEqual(new Set(['voice', 'gesture', 'mouse', 'agent']));

    const remoteGateRequest = evaluatedRequests.find((request) => request.client === 'remote-meta-glasses');
    expect(remoteGateRequest).toMatchObject({
      surface: 'gesture',
      surface_event: 'tap',
      remote_surface: 'meta-rayban-display-simulator'
    });

    const remoteResult = results.find((result) => result.client === 'remote-meta-glasses');
    expect(remoteResult?.interaction_envelope.context).toMatchObject({
      platform: 'meta_glasses',
      device_mode: 'display_webapp',
      device_context: {
        remote_surface: 'meta-rayban-display-simulator',
        transport_path: 'mobile-orb-publish-glasses-event'
      }
    });

    await writeHao039Evidence('allow-receipts', {
      policy_bundle_store: policyRuntime.seed,
      mediation_receipts: results.map(receiptEvidence)
    });
  });

  test('persisted policy bundles deny quiet-hours gestures and require confirmation before send_message', async () => {
    const { manager, policyRuntime } = await createPersistedPolicyManager();
    let transportInvocations = 0;

    const denied = await manager.invokeManagedService('ipfs-kit', DENIED_GESTURE_INVOCATION, async () => {
      transportInvocations += 1;
      return { invoked: true };
    });
    const confirmation = await manager.invokeManagedService('ipfs-kit', CONFIRMATION_INVOCATION, async () => {
      transportInvocations += 1;
      return { invoked: true };
    });

    expect(transportInvocations).toBe(0);

    expect(denied.ok).toBe(false);
    expect(denied.denied).toBe(true);
    expectPersistedPolicyDecision(denied, 'deny');
    expect(denied.policy_decision.matched_norms[0]).toMatchObject({
      outcome: 'deny',
      policy_bundle_ref: denied.policy_decision.policy_bundle_ref
    });
    expect(denied.policy_decision.reasons.join('\n')).toContain('Ignore');
    expectNodeMediationReceipt(denied, 'deny', false);
    expect(denied.mediation_receipt.mediation_result).toMatchObject({
      final_method: CANONICAL_METHOD,
      final_target_ref: CANONICAL_TARGET_REF
    });

    expect(confirmation.ok).toBe(false);
    expect(confirmation.denied).toBe(true);
    expectPersistedPolicyDecision(confirmation, 'require_confirmation');
    expect(confirmation.policy_decision.matched_norms[0]).toMatchObject({
      outcome: 'require_confirmation',
      policy_bundle_ref: confirmation.policy_decision.policy_bundle_ref
    });
    expect(confirmation.policy_decision.effects[0]).toMatchObject({
      outcome: 'require_confirmation',
      method: 'send_message',
      target_ref: 'service:messaging',
      confirmation_required: true
    });
    expectNodeMediationReceipt(confirmation, 'require_confirmation', false);
    expect(confirmation.mediation_receipt.mediation_result).toMatchObject({
      final_method: 'send_message',
      final_target_ref: 'service:messaging'
    });

    await writeHao039Evidence('blocking-receipts', {
      policy_bundle_store: policyRuntime.seed,
      mediation_receipts: [
        receiptEvidence({ client: 'gesture-sleeping', ...denied }),
        receiptEvidence({ client: 'voice-confirmation', ...confirmation })
      ]
    });
  });

  test('daemon-managed service mediation fails closed when no runtime policy evaluator is registered', async () => {
    const { default: MCPDaemonManager } = await import('../../hallucinate_app/node/mcp_daemon_manager.js');
    const manager = new MCPDaemonManager();
    let transportInvoked = false;

    const result = await manager.invokeManagedService('ipfs-kit', {
      method: CANONICAL_METHOD,
      target_ref: CANONICAL_TARGET_REF,
      arguments: CANONICAL_ARGUMENTS,
      control_surface: {
        surface: 'agent',
        surface_event: 'autonomous_invoke',
        intent: CANONICAL_INTENT,
        confidence: 0.99,
        actor: { type: 'agent', id: 'agent:planner', delegation_chain: [] }
      }
    }, async () => {
      transportInvoked = true;
      return { invoked: true };
    });

    expect(transportInvoked).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.denied).toBe(true);
    expect(result.policy_decision.outcome).toBe('require_confirmation');
    expect(result.policy_decision.metadata.fail_closed).toBe(true);
    expect(result.policy_decision.metadata.runtime_policy_evaluator).toBe(PYTHON_POLICY_EVALUATOR);
    expect(result.reasons.join('\n')).toContain('fail_closed');
    expect(result.mediation_receipt.mediation_result).toMatchObject({
      outcome: 'require_confirmation',
      invoked: false,
      confirmation_required: true
    });
  });
});
