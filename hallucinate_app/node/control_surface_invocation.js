/**
 * Shared control_surface pre-invocation mediation for daemon-managed services.
 *
 * MCP daemons and ORB adapters should call this single before invoke hook before
 * dispatching to HTTP, websocket, local, or mcp-server transports. Blocking
 * policy_decision outcomes return a denial response and the transport callback
 * is not called.
 */

import { createHash, randomUUID } from 'crypto';

export const DEFAULT_CONTROL_SURFACE_CONTRACT_REF = 'control_surface_contract:mcp-daemon-service-invocation';
export const DEFAULT_MCP_TRANSPORT = 'mcp-server';
export const DEFAULT_SERVICE_SURFACE = 'agent';
export const DEFAULT_SERVICE_SURFACE_EVENT = 'autonomous_invoke';
export const BLOCKING_POLICY_OUTCOMES = new Set(['deny', 'require_confirmation', 'defer', 'rate_limit']);
export const SUPPORTED_POLICY_OUTCOMES = new Set(['allow', 'deny', 'require_confirmation', 'defer', 'rewrite', 'fallback_surface', 'rate_limit']);
export const FAIL_CLOSED_POLICY_OUTCOME = 'deny';

const DEFAULT_POLICY_BUNDLE_REF = {
  policy_id: 'policy:daemon-managed-service-default',
  policy_cid: 'local:daemon-managed-service-default',
  version: '0.1.0',
  scope: 'runtime',
  source: 'system_default'
};
const DEFAULT_COMPILED_POLICY_CID = 'local:daemon-managed-service-default';

export class ControlSurfaceMediationError extends Error {
  constructor(mediation) {
    const decision = mediation?.policy_decision || {};
    super(`Service invocation blocked by control_surface mediation: ${decision.outcome || 'deny'}`);
    this.name = 'ControlSurfaceMediationError';
    this.mediation = mediation;
  }
}

export class ControlSurfaceInvocationGate {
  constructor(options = {}) {
    this.policyHook = typeof options.policyHook === 'function' ? options.policyHook : null;
    this.contractRef = options.controlSurfaceContractRef || DEFAULT_CONTROL_SURFACE_CONTRACT_REF;
    this.source = options.source || 'hallucinate_app.node.control_surface_invocation';
  }

  setPolicyHook(policyHook) {
    this.policyHook = typeof policyHook === 'function' ? policyHook : null;
  }

  hasPolicyHook() {
    return typeof this.policyHook === 'function';
  }

  async beforeInvoke(invocation = {}) {
    const request = normalizeManagedServiceInvocation(invocation, {
      controlSurfaceContractRef: this.contractRef,
      source: this.source
    });
    const hookDecision = await this.evaluatePolicyHook(request);
    const policy_decision = normalizePolicyDecision(hookDecision, request, this.source);
    const mediation_receipt = buildMediationReceipt(policy_decision, request, this.source);
    const can_invoke = !BLOCKING_POLICY_OUTCOMES.has(policy_decision.outcome);

    return {
      can_invoke,
      canInvoke: can_invoke,
      transport: request.transport,
      service_id: request.service_id,
      method: request.method,
      target_ref: request.target_ref,
      invocation_payload: request.invocation_payload,
      control_surface_contract_ref: request.control_surface_contract_ref,
      interaction_envelope: request.interaction_envelope,
      policy_decision,
      mediation_receipt
    };
  }

  async evaluatePolicyHook(request) {
    if (!this.policyHook) {
      return failClosedPolicyDecision(
        request,
        this.source,
        'Default daemon-managed service mediation fail_closed: no runtime control_surface policy evaluator is registered.'
      );
    }

    try {
      const decision = await this.policyHook(request);
      const rawDecision = objectPayload(decision?.policy_decision || decision);
      if (Object.keys(rawDecision).length === 0) {
        return failClosedPolicyDecision(
          request,
          this.source,
          'Default daemon-managed service mediation fail_closed: runtime control_surface policy evaluator returned no decision.'
        );
      }
      if (!text(rawDecision.outcome || rawDecision.result || rawDecision.effect)) {
        return failClosedPolicyDecision(
          request,
          this.source,
          'Default daemon-managed service mediation fail_closed: runtime control_surface policy evaluator returned a decision without an outcome.'
        );
      }
      if (!isSupportedOutcomeValue(rawDecision.outcome || rawDecision.result || rawDecision.effect)) {
        return failClosedPolicyDecision(
          request,
          this.source,
          'Default daemon-managed service mediation fail_closed: runtime control_surface policy evaluator returned an unsupported outcome.'
        );
      }
      return decision;
    } catch (error) {
      return failClosedPolicyDecision(
        request,
        this.source,
        `Default daemon-managed service mediation fail_closed: runtime control_surface policy evaluator failed: ${errorMessage(error)}.`,
        { evaluator_error: errorMessage(error) }
      );
    }
  }

  requireAllowed(mediation) {
    if (!mediation?.can_invoke) {
      throw new ControlSurfaceMediationError(mediation);
    }
    return mediation;
  }

  async invoke(invocation = {}, invoker = null) {
    const mediation = await this.beforeInvoke(invocation);
    if (!mediation.can_invoke) {
      return mediationDeniedResponse(mediation);
    }
    if (typeof invoker !== 'function') {
      return mediation;
    }

    const output = await invoker(mediation.invocation_payload, mediation);
    return {
      ok: true,
      denied: false,
      output,
      transport: mediation.transport,
      service_id: mediation.service_id,
      method: mediation.method,
      interaction_envelope: mediation.interaction_envelope,
      policy_decision: mediation.policy_decision,
      mediation_receipt: mediation.mediation_receipt
    };
  }
}

export const defaultControlSurfaceInvocationGate = new ControlSurfaceInvocationGate();

export async function beforeInvokeManagedService(invocation = {}, options = {}) {
  const gate = options.gate || defaultControlSurfaceInvocationGate;
  return gate.beforeInvoke(invocation);
}

export async function invokeManagedServiceAfterMediation(invocation = {}, invoker, options = {}) {
  const gate = options.gate || defaultControlSurfaceInvocationGate;
  return gate.invoke(invocation, invoker);
}

export function normalizeManagedServiceInvocation(invocation = {}, options = {}) {
  const payload = objectPayload(invocation);
  const existingEnvelope = objectPayload(payload.interaction_envelope);
  const existingIntent = objectPayload(existingEnvelope.normalized_intent);
  const controlSurface = objectPayload(payload.control_surface || payload.controlSurface);
  const transport = text(payload.transport || payload.transport_kind || payload.adapter) || DEFAULT_MCP_TRANSPORT;
  const service_id = text(
    payload.service_id ||
    payload.daemon_id ||
    payload.server_id ||
    payload.server_family ||
    payload.provider
  ) || 'service';
  const method = text(payload.method || payload.operation || payload.tool_name || payload.command || existingIntent.method) || 'invoke';
  const target_ref = text(controlSurface.target_ref || payload.target_ref || payload.resource || existingIntent.target_ref) || `method:${method}`;
  const argumentsPayload = firstObject(invocationArguments(payload), existingIntent.arguments);
  const now = new Date().toISOString();
  const control_surface_contract_ref = text(
    payload.control_surface_contract_ref ||
    controlSurface.control_surface_contract_ref ||
    options.controlSurfaceContractRef
  ) || DEFAULT_CONTROL_SURFACE_CONTRACT_REF;

  const interaction_envelope = Object.keys(existingEnvelope).length > 0
    ? normalizeExistingEnvelope(existingEnvelope, payload, {
      control_surface_contract_ref,
      target_ref,
      method,
      argumentsPayload,
      now
    })
    : {
      interaction_id: text(
        controlSurface.interaction_id ||
        payload.interaction_id ||
        payload.correlation_id ||
        payload.request_id
      ) || stableControlSurfaceId('interaction', transport, service_id, method, now),
      surface: text(controlSurface.surface || payload.surface) || DEFAULT_SERVICE_SURFACE,
      surface_event: text(
        controlSurface.surface_event ||
        controlSurface.event ||
        payload.surface_event ||
        payload.event
      ) || defaultSurfaceEvent(text(controlSurface.surface || payload.surface) || DEFAULT_SERVICE_SURFACE),
      raw_payload: {
        ...payload,
        transport,
        service_id,
        method,
        arguments: argumentsPayload,
        control_surface_contract_ref
      },
      normalized_intent: {
        intent: text(controlSurface.intent || payload.intent) || `${transport}.invoke.${method}`,
        method,
        target_ref,
        arguments: argumentsPayload,
        confidence: number(controlSurface.confidence, payload.confidence, 1)
      },
      actor: actorPayload(payload, controlSurface),
      context: contextPayload(payload, controlSurface, {
        transport,
        service_id,
        control_surface_contract_ref,
        now
      }),
      control_surface_contract_ref,
      policy_bundle_ref: policyRefFrom(payload, controlSurface),
      compiled_policy_cid: text(payload.compiled_policy_cid || controlSurface.compiled_policy_cid) || DEFAULT_COMPILED_POLICY_CID,
      logic_bindings: arrayPayload(payload.logic_bindings || controlSurface.logic_bindings)
    };

  const invocation_payload = {
    ...payload,
    method,
    target_ref,
    arguments: argumentsPayload
  };

  return {
    transport,
    service_id,
    method,
    target_ref,
    invocation_payload,
    control_surface_contract_ref,
    interaction_envelope,
    source: options.source || 'hallucinate_app.node.control_surface_invocation'
  };
}

export function normalizePolicyDecision(rawDecision, request, source = 'hallucinate_app.node.control_surface_invocation') {
  const raw = objectPayload(rawDecision?.policy_decision || rawDecision);
  const outcome = normalizeOutcome(raw.outcome || raw.result || raw.effect || FAIL_CLOSED_POLICY_OUTCOME);
  const reasons = arrayPayload(raw.reasons).map(String);
  const explanation = text(raw.explanation) || (
    reasons.length > 0
      ? reasons.join('; ')
      : outcome === 'allow'
        ? `control_surface mediation allowed ${request.method} before invoke.`
        : `Default daemon-managed service mediation fail_closed before ${request.method}.`
  );
  const policy_bundle_ref = firstObject(raw.policy_bundle_ref, request.interaction_envelope.policy_bundle_ref, DEFAULT_POLICY_BUNDLE_REF);
  const compiled_policy_cid = text(raw.compiled_policy_cid) || request.interaction_envelope.compiled_policy_cid;
  const decision_id = text(raw.decision_id || raw.decision_cid) || stableControlSurfaceId(
    'decision',
    request.interaction_envelope.interaction_id,
    outcome,
    compiled_policy_cid
  );

  return {
    decision_id,
    interaction_id: request.interaction_envelope.interaction_id,
    interaction_envelope: request.interaction_envelope,
    outcome,
    policy_bundle_ref,
    compiled_policy_cid,
    decided_at: text(raw.decided_at) || new Date().toISOString(),
    matched_norms: arrayPayload(raw.matched_norms),
    effects: arrayPayload(raw.effects).length > 0
      ? arrayPayload(raw.effects)
      : [{
        outcome,
        method: request.method,
        target_ref: request.target_ref,
        arguments: request.invocation_payload.arguments,
        confirmation_required: outcome === 'require_confirmation',
        reason: explanation
      }],
    frame_facts: arrayPayload(raw.frame_facts).length > 0
      ? arrayPayload(raw.frame_facts)
      : [
        frameFact(request.interaction_envelope.interaction_id, 'surface', 'surface.id', request.interaction_envelope.surface),
        frameFact(request.interaction_envelope.interaction_id, 'event', 'surface_event', request.interaction_envelope.surface_event),
        frameFact(request.interaction_envelope.interaction_id, 'method', 'intent.method', request.method)
      ],
    reasons: reasons.length > 0
      ? reasons
      : [`Default daemon-managed service mediation fail_closed before ${request.method}.`],
    explanation,
    confidence: number(raw.confidence, request.interaction_envelope.normalized_intent.confidence, 1),
    metadata: {
      before_invoke_hook: 'hallucinate_app.node.control_surface_invocation.ControlSurfaceInvocationGate.beforeInvoke',
      transport: request.transport,
      service_id: request.service_id,
      evaluate_api: 'hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction',
      ...objectPayload(raw.metadata),
      fail_closed: outcome !== 'allow' && objectPayload(raw.metadata).fail_closed === true,
      source,
    }
  };
}

export function failClosedPolicyDecision(request, source, reason, metadata = {}) {
  return {
    outcome: FAIL_CLOSED_POLICY_OUTCOME,
    policy_bundle_ref: request.interaction_envelope.policy_bundle_ref || DEFAULT_POLICY_BUNDLE_REF,
    compiled_policy_cid: request.interaction_envelope.compiled_policy_cid || DEFAULT_COMPILED_POLICY_CID,
    matched_norms: [],
    effects: [{
      outcome: FAIL_CLOSED_POLICY_OUTCOME,
      method: request.method,
      target_ref: request.target_ref,
      arguments: request.invocation_payload.arguments,
      confirmation_required: false,
      reason
    }],
    reasons: [reason],
    explanation: reason,
    confidence: request.interaction_envelope.normalized_intent.confidence,
    metadata: {
      fail_closed: true,
      evaluate_api: 'hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction',
      source,
      ...objectPayload(metadata)
    }
  };
}

export function buildMediationReceipt(policy_decision, request, source = 'hallucinate_app.node.control_surface_invocation') {
  const invoked = !BLOCKING_POLICY_OUTCOMES.has(policy_decision.outcome);
  const receipt_id = stableControlSurfaceId(
    'receipt',
    policy_decision.decision_id,
    request.interaction_envelope.interaction_id,
    policy_decision.outcome
  );
  return {
    receipt_id,
    emitted_at: new Date().toISOString(),
    control_surface_contract_ref: request.control_surface_contract_ref,
    interaction_envelope: request.interaction_envelope,
    policy_decision,
    policy_refs: [{
      policy_bundle_ref: policy_decision.policy_bundle_ref,
      compiled_policy_cid: policy_decision.compiled_policy_cid,
      matched_norm_refs: policy_decision.matched_norms.map((match) => match.norm_id).filter(Boolean)
    }],
    mediation_result: {
      outcome: policy_decision.outcome,
      invoked,
      final_method: policy_decision.effects[0]?.method || request.method,
      final_target_ref: policy_decision.effects[0]?.target_ref || request.target_ref,
      confirmation_required: policy_decision.outcome === 'require_confirmation',
      rate_limit_key: policy_decision.effects[0]?.rate_limit_key || ''
    },
    explanation: policy_decision.explanation,
    metadata: {
      source,
      transport: request.transport,
      service_id: request.service_id,
      before_invoke_hook: 'hallucinate_app.node.control_surface_invocation',
      schema_refs: ['control_surface_contract', 'interaction_envelope', 'policy_decision', 'mediation_receipt']
    }
  };
}

export function mediationDeniedResponse(mediation) {
  return {
    ok: false,
    denied: true,
    error: 'CONTROL_SURFACE_MEDIATION_DENIED',
    reasons: mediation.policy_decision.reasons,
    transport: mediation.transport,
    service_id: mediation.service_id,
    method: mediation.method,
    interaction_envelope: mediation.interaction_envelope,
    policy_decision: mediation.policy_decision,
    mediation_receipt: mediation.mediation_receipt
  };
}

function normalizeExistingEnvelope(existingEnvelope, payload, defaults) {
  const normalizedIntent = objectPayload(existingEnvelope.normalized_intent);
  return {
    ...existingEnvelope,
    raw_payload: {
      ...objectPayload(existingEnvelope.raw_payload),
      ...payload,
      control_surface_contract_ref: defaults.control_surface_contract_ref
    },
    normalized_intent: {
      intent: text(normalizedIntent.intent) || `${DEFAULT_MCP_TRANSPORT}.invoke.${defaults.method}`,
      method: text(normalizedIntent.method) || defaults.method,
      target_ref: text(normalizedIntent.target_ref) || defaults.target_ref,
      arguments: firstObject(normalizedIntent.arguments, defaults.argumentsPayload),
      confidence: number(normalizedIntent.confidence, 1)
    },
    actor: objectPayload(existingEnvelope.actor),
    context: objectPayload(existingEnvelope.context),
    control_surface_contract_ref: text(existingEnvelope.control_surface_contract_ref) || defaults.control_surface_contract_ref,
    policy_bundle_ref: firstObject(existingEnvelope.policy_bundle_ref, DEFAULT_POLICY_BUNDLE_REF),
    compiled_policy_cid: text(existingEnvelope.compiled_policy_cid) || DEFAULT_COMPILED_POLICY_CID,
    logic_bindings: arrayPayload(existingEnvelope.logic_bindings)
  };
}

function actorPayload(payload, controlSurface) {
  const actor = objectPayload(controlSurface.actor || payload.actor);
  if (Object.keys(actor).length > 0) {
    return {
      type: text(actor.type) || 'user',
      id: text(actor.id || actor.actor_id || payload.caller_did),
      delegation_chain: arrayPayload(actor.delegation_chain || actor.delegationChain).map(String)
    };
  }

  return {
    type: text(payload.actor_type) || (payload.agent_id ? 'agent' : 'user'),
    id: text(payload.actor_id || payload.agent_id || payload.caller_did) || 'daemon-managed-service',
    delegation_chain: arrayPayload(payload.delegation_chain).map(String)
  };
}

function contextPayload(payload, controlSurface, defaults) {
  const context = objectPayload(controlSurface.context || payload.context);
  const deviceContext = {
    ...objectPayload(context.device_context),
    transport: defaults.transport,
    service_id: defaults.service_id,
    daemon_id: text(payload.daemon_id),
    orb_binding_handle: text(payload.handle),
    control_surface_contract_ref: defaults.control_surface_contract_ref
  };
  return {
    local_time: text(context.local_time || payload.local_time) || defaults.now,
    state_frames: arrayPayload(context.state_frames).map(String),
    device_mode: text(context.device_mode || payload.device_mode),
    platform: text(context.platform) || 'hallucinate_app',
    location_context: objectPayload(context.location_context),
    device_context: deviceContext
  };
}

function invocationArguments(payload) {
  for (const key of ['arguments', 'args', 'params', 'input', 'payload']) {
    if (payload[key] && typeof payload[key] === 'object' && !Array.isArray(payload[key])) {
      return { ...payload[key] };
    }
  }
  return {};
}

function policyRefFrom(payload, controlSurface) {
  const policyRef = objectPayload(payload.policy_bundle_ref || controlSurface.policy_bundle_ref);
  return Object.keys(policyRef).length > 0 ? policyRef : { ...DEFAULT_POLICY_BUNDLE_REF };
}

function normalizeOutcome(value) {
  const outcome = text(value).toLowerCase();
  if (outcome === 'permit' || outcome === 'permitted') {
    return 'allow';
  }
  if (outcome === 'block' || outcome === 'blocked') {
    return 'deny';
  }
  return SUPPORTED_POLICY_OUTCOMES.has(outcome) ? outcome : FAIL_CLOSED_POLICY_OUTCOME;
}

function isSupportedOutcomeValue(value) {
  const outcome = text(value).toLowerCase();
  return outcome === 'permit'
    || outcome === 'permitted'
    || outcome === 'block'
    || outcome === 'blocked'
    || SUPPORTED_POLICY_OUTCOMES.has(outcome);
}

function defaultSurfaceEvent(surface) {
  if (surface === 'voice') {
    return 'utterance';
  }
  if (surface === 'gesture') {
    return 'tap';
  }
  if (surface === 'mouse' || surface === 'pointer') {
    return 'click';
  }
  return DEFAULT_SERVICE_SURFACE_EVENT;
}

function frameFact(interactionId, kind, predicate, value) {
  return {
    fact_id: stableControlSurfaceId('fact', interactionId, kind, predicate, value),
    kind,
    subject: `${kind}:${String(value || 'unknown')}`,
    predicate,
    value,
    attrs: {}
  };
}

function stableControlSurfaceId(prefix, ...parts) {
  const normalized = parts
    .filter((part) => part !== undefined && part !== null)
    .map((part) => typeof part === 'string' ? part : JSON.stringify(part))
    .join('|');
  const digest = createHash('sha1').update(normalized).digest('hex').slice(0, 16);
  return `${prefix}:${digest}`;
}

function objectPayload(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function firstObject(...values) {
  for (const value of values) {
    const payload = objectPayload(value);
    if (Object.keys(payload).length > 0) {
      return payload;
    }
  }
  return {};
}

function arrayPayload(value) {
  return Array.isArray(value) ? [...value] : [];
}

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function number(...values) {
  const fallback = Number(values.pop());
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Number.isFinite(fallback) ? fallback : 0;
}

function errorMessage(error) {
  return error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : String(error);
}

export function createInvocationCorrelationId(scope = 'service-invoke') {
  return `${scope}-${randomUUID()}`;
}
