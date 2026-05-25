import playwrightTest from '@playwright/test';

type JsonMap = Record<string, any>;

const { test, expect } = playwrightTest as unknown as typeof import('@playwright/test');

const CANONICAL_INTENT = 'display.activate';
const CANONICAL_METHOD = 'activate';
const CANONICAL_TARGET_REF = 'widget:primary-action';
const CANONICAL_ARGUMENTS = { widget_id: 'primary-action', source_test: 'HAO-023' };
const POLICY_DECISION_ID = 'policy_decision:hao-023-multimodal-display-activate';
const POLICY_BUNDLE_REF = {
  policy_id: 'policy:hao-023-multimodal-control-surface-e2e',
  policy_cid: 'local:hao-023-multimodal-control-surface-e2e',
  version: '0.1.0',
  scope: 'e2e',
  source: 'test'
};
const COMPILED_POLICY_CID = 'local:compiled-policy:hao-023-multimodal-control-surface-e2e';
const METHOD_GATE = 'hallucinate_app.node.control_surface_invocation.ControlSurfaceInvocationGate.beforeInvoke';
const RECEIPT_GATE = 'hallucinate_app.node.control_surface_invocation';

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
        event_id: 'remote-event:hao-023',
        raw_action: 'display.tap.primary'
      }
    }
  }
];

function policyDecisionFor(request: JsonMap) {
  return {
    decision_id: POLICY_DECISION_ID,
    outcome: 'allow',
    policy_bundle_ref: POLICY_BUNDLE_REF,
    compiled_policy_cid: COMPILED_POLICY_CID,
    matched_norms: [{
      norm_id: 'norm:hao-023-display-activate-shared-method-gate',
      outcome: 'allow',
      priority: 10,
      explanation: 'Equivalent multimodal display.activate intent uses the shared method gate.'
    }],
    effects: [{
      outcome: 'allow',
      method: request.method,
      target_ref: request.target_ref,
      arguments: request.invocation_payload.arguments,
      confirmation_required: false,
      reason: 'Same canonical intent may invoke the shared display activation method.'
    }],
    reasons: ['Same canonical display.activate intent allowed at the control_surface method gate.'],
    explanation: 'E2E multimodal control_surface gate produced a consistent policy_decision before invocation.',
    confidence: 0.99,
    metadata: {
      test_contract: 'HAO-023',
      canonical_intent: CANONICAL_INTENT
    }
  };
}

function comparablePolicyDecision(decision: JsonMap) {
  return {
    decision_id: decision.decision_id,
    outcome: decision.outcome,
    policy_bundle_ref: decision.policy_bundle_ref,
    compiled_policy_cid: decision.compiled_policy_cid,
    matched_norms: decision.matched_norms,
    effects: decision.effects,
    reasons: decision.reasons,
    explanation: decision.explanation,
    confidence: decision.confidence,
    before_invoke_hook: decision.metadata.before_invoke_hook,
    transport: decision.metadata.transport,
    service_id: decision.metadata.service_id,
    source: decision.metadata.source,
    test_contract: decision.metadata.test_contract,
    canonical_intent: decision.metadata.canonical_intent
  };
}

test.describe('multimodal control_surface end-to-end mediation', () => {
  test('voice, gesture, mouse, agent, and remote clients share the method gate and policy_decision', async () => {
    const { default: MCPDaemonManager } = await import('../../hallucinate_app/node/mcp_daemon_manager.js');
    const manager = new MCPDaemonManager();
    const observedGateRequests: JsonMap[] = [];
    const invokedMethods: JsonMap[] = [];

    manager.setControlSurfacePolicyHook(async (request: JsonMap) => {
      observedGateRequests.push({
        client: request.invocation_payload.client_label,
        surface: request.interaction_envelope.surface,
        surface_event: request.interaction_envelope.surface_event,
        method: request.method,
        target_ref: request.target_ref,
        intent: request.interaction_envelope.normalized_intent.intent,
        gate_source: request.source,
        remote_surface: request.interaction_envelope.context?.device_context?.remote_surface || ''
      });

      expect(request.method).toBe(CANONICAL_METHOD);
      expect(request.target_ref).toBe(CANONICAL_TARGET_REF);
      expect(request.interaction_envelope.normalized_intent.intent).toBe(CANONICAL_INTENT);
      expect(request.interaction_envelope.normalized_intent.arguments).toEqual(CANONICAL_ARGUMENTS);

      return policyDecisionFor(request);
    });

    const results: JsonMap[] = [];
    for (const { client, invocation } of CLIENT_INVOCATIONS) {
      const result = await manager.invokeManagedService('ipfs-kit', invocation, async (_payload: JsonMap, mediation: JsonMap) => {
        invokedMethods.push({
          client,
          method: mediation.method,
          target_ref: mediation.target_ref,
          method_gate: mediation.policy_decision.metadata.before_invoke_hook,
          receipt_gate: mediation.mediation_receipt.metadata.before_invoke_hook
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

    expect(observedGateRequests).toHaveLength(CLIENT_INVOCATIONS.length);
    expect(invokedMethods).toHaveLength(CLIENT_INVOCATIONS.length);
    expect(new Set(observedGateRequests.map((request) => request.method))).toEqual(new Set([CANONICAL_METHOD]));
    expect(new Set(observedGateRequests.map((request) => request.target_ref))).toEqual(new Set([CANONICAL_TARGET_REF]));
    expect(new Set(observedGateRequests.map((request) => request.intent))).toEqual(new Set([CANONICAL_INTENT]));
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
      expect(result.mediation_receipt.control_surface_contract_ref).toBe('control_surface_contract:mcp-daemon:ipfs-kit');
      expect(result.mediation_receipt.mediation_result).toMatchObject({
        outcome: 'allow',
        invoked: true,
        final_method: CANONICAL_METHOD,
        final_target_ref: CANONICAL_TARGET_REF,
        confirmation_required: false
      });
      expect(result.mediation_receipt.metadata.schema_refs).toEqual([
        'control_surface_contract',
        'interaction_envelope',
        'policy_decision',
        'mediation_receipt'
      ]);
      expect(result.mediation_receipt.policy_decision.decision_id).toBe(POLICY_DECISION_ID);
    }

    const surfaces = new Set(observedGateRequests.map((request) => request.surface));
    expect(surfaces).toEqual(new Set(['voice', 'gesture', 'mouse', 'agent']));

    const remoteGateRequest = observedGateRequests.find((request) => request.client === 'remote-meta-glasses');
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
  });
});
