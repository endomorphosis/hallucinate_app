"""AI-agent control-surface resolver with delegation-aware mediation.

This adapter turns structured agent proposals, autonomous invocations, and
scheduled actions into the shared interaction envelope, routes them through the
same policy mediator as voice, gesture, and pointer events, and applies an
extra UCAN/delegation check before any agent-originated invocation can execute.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping

from hallucinate_app.control_surface_context import ActorIdentity, RuntimeContext
from hallucinate_app.control_surface_intents import InteractionEnvelope, normalize_interaction
from hallucinate_app.control_surface_logic_ir import (
    DeonticOutcome,
    InvocationEffect,
    stable_control_surface_id,
)
from hallucinate_app.control_surface_mediator import (
    DEFAULT_CONFLICT_RESOLUTION,
    ActivePolicyBundle,
    ControlSurfaceMediator,
    PolicyDecision,
    evaluate_control_surface_interaction,
    normalize_active_policy_bundles,
)


AGENT_RESOLVER_VERSION = "0.1.0"
DEFAULT_AGENT_SURFACE = "agent"
AGENT_EVENT_TYPES = ("proposal", "autonomous_invoke", "scheduled_action")
AGENT_DELEGATION_POLICY_BUNDLE_REF = {
    "policy_id": "policy:agent-delegation-gate",
    "policy_cid": "local:agent-delegation-gate",
    "version": AGENT_RESOLVER_VERSION,
    "scope": "runtime",
    "source": "system_default",
}
AGENT_DELEGATION_COMPILED_POLICY_CID = "local:agent-delegation-gate"

_EVENT_FIELD_NAMES = (
    "surface_event",
    "agent_event",
    "event_type",
    "eventType",
    "type",
)
_METHOD_FIELD_NAMES = (
    "method",
    "operation",
    "action",
    "command",
    "tool",
    "tool_name",
    "method_ref",
)
_INTENT_FIELD_NAMES = ("intent", "intent_ref", "intentRef", "capability")
_TARGET_FIELD_NAMES = (
    "target_ref",
    "targetRef",
    "target_id",
    "targetId",
    "resource",
    "resource_ref",
    "service",
    "entity_ref",
)
_AGENT_ID_FIELDS = ("agent_id", "agentId", "actor_id", "actorId", "delegate", "audience")
_AGENT_CONTEXT_FIELDS = (
    "agent_id",
    "agentId",
    "model",
    "model_id",
    "modelId",
    "task_id",
    "taskId",
    "proposal_id",
    "proposalId",
    "schedule_id",
    "scheduleId",
    "scheduled_for",
    "scheduledFor",
    "run_at",
    "runAt",
    "ucan_cid",
    "ucanCid",
    "delegation_cid",
    "delegationCid",
    "risk_class",
)
_AGENT_EVENT_ALIASES = {
    "proposal": "proposal",
    "propose": "proposal",
    "plan": "proposal",
    "recommendation": "proposal",
    "autonomous_invoke": "autonomous_invoke",
    "autonomous_invoke_request": "autonomous_invoke",
    "autonomous_action": "autonomous_invoke",
    "invoke": "autonomous_invoke",
    "tool_call": "autonomous_invoke",
    "toolcall": "autonomous_invoke",
    "scheduled_action": "scheduled_action",
    "scheduled": "scheduled_action",
    "schedule": "scheduled_action",
    "cron": "scheduled_action",
}
_GRANT_CONTAINER_FIELDS = (
    "delegation",
    "delegations",
    "delegation_grants",
    "agent_delegation",
    "agent_delegations",
    "ucan",
    "UCAN",
    "ucan_policy",
    "ucan_policies",
    "ucan_tokens",
    "grants",
    "ipfs_result",
)
_GRANT_SCOPE_FIELDS = (
    "allows",
    "scope",
    "capability",
    "capabilities",
    "can",
    "methods",
    "method",
    "allowed_methods",
    "actions",
    "action",
    "intents",
    "intent",
    "surfaces",
    "surface",
    "allowed_surfaces",
    "events",
    "surface_events",
    "event_types",
    "targets",
    "target_refs",
    "resources",
    "resource",
    "with",
    "delegation_chain",
)
_METHOD_GRANT_FIELDS = (
    "methods",
    "method",
    "allowed_methods",
    "actions",
    "action",
    "operations",
    "operation",
)
_CAPABILITY_GRANT_FIELDS = ("capability", "capabilities", "can", "intents", "intent")
_SURFACE_GRANT_FIELDS = ("surfaces", "surface", "allowed_surfaces")
_EVENT_GRANT_FIELDS = ("events", "surface_events", "event_types", "allowed_events")
_TARGET_GRANT_FIELDS = ("targets", "target_refs", "target_ref", "resources", "resource", "with")


class AgentResolutionError(ValueError):
    """Raised when an agent payload cannot be normalized safely."""


@dataclass(frozen=True)
class AgentDelegationEvaluation:
    """Delegation evidence used to cap agent authority before invocation."""

    required: bool
    authorized: bool
    reason: str
    delegation_chain: list[str]
    grant_ref: str = ""
    ucan_cid: str = ""
    policy_bundle_ref: dict[str, str] = field(default_factory=dict)
    compiled_policy_cid: str = ""
    considered_grants: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "required": self.required,
            "authorized": self.authorized,
            "reason": self.reason,
            "delegation_chain": list(self.delegation_chain),
            "grant_ref": self.grant_ref,
            "ucan_cid": self.ucan_cid,
            "policy_bundle_ref": dict(self.policy_bundle_ref),
            "compiled_policy_cid": self.compiled_policy_cid,
            "considered_grants": [dict(grant) for grant in self.considered_grants],
        }


@dataclass(frozen=True)
class AgentResolution:
    """Agent normalization, delegation evidence, and shared policy decision."""

    envelope: InteractionEnvelope
    decision: PolicyDecision
    delegation: AgentDelegationEvaluation

    @property
    def can_execute(self) -> bool:
        return self.decision.can_execute and self.delegation.authorized

    @property
    def requires_confirmation(self) -> bool:
        return self.decision.requires_confirmation

    def as_dict(self) -> dict[str, Any]:
        return {
            "resolver_version": AGENT_RESOLVER_VERSION,
            "interaction_envelope": self.envelope.as_dict(),
            "policy_decision": self.decision.as_dict(),
            "delegation": self.delegation.as_dict(),
            "can_execute": self.can_execute,
            "requires_confirmation": self.requires_confirmation,
        }


class AgentIntentResolver:
    """Resolve structured agent actions into mediated control-surface decisions."""

    def __init__(
        self,
        *,
        surface: str = DEFAULT_AGENT_SURFACE,
        mediator: ControlSurfaceMediator | None = None,
    ) -> None:
        self.surface = surface or DEFAULT_AGENT_SURFACE
        self.mediator = mediator

    def normalize(
        self,
        raw_payload: Mapping[str, Any] | None,
        *,
        actor: Mapping[str, Any] | ActorIdentity | None = None,
        context: Mapping[str, Any] | RuntimeContext | None = None,
        interaction_id: str | None = None,
        surface: str | None = None,
    ) -> InteractionEnvelope:
        """Return a canonical envelope for one structured agent action."""

        payload = _payload_copy(raw_payload)
        surface_event = _resolve_surface_event(payload)
        normalized_intent = _normalized_intent(payload, surface_event=surface_event)
        resolved_actor = _actor_payload(payload, actor)
        actor_mapping = resolved_actor.as_dict() if isinstance(resolved_actor, ActorIdentity) else dict(resolved_actor)
        resolved_context = _context_payload(
            payload,
            context,
            surface_event=surface_event,
            actor=actor_mapping,
        )
        resolved_surface = _first_text(
            surface,
            payload.get("surface"),
            payload.get("surface_ref"),
            self.surface,
            DEFAULT_AGENT_SURFACE,
        )
        resolved_interaction_id = interaction_id or _interaction_id(
            payload,
            resolved_surface,
            surface_event,
            actor_mapping,
            normalized_intent,
        )

        delegation_chain = [str(item) for item in actor_mapping.get("delegation_chain", []) or []]
        payload.setdefault("surface_event", surface_event)
        payload.setdefault("agent_id", actor_mapping.get("id", ""))
        payload.setdefault("delegation_chain", delegation_chain)
        payload.setdefault("resolver", "structured_agent_intent")

        return normalize_interaction(
            interaction_id=resolved_interaction_id,
            surface=resolved_surface,
            surface_event=surface_event,
            raw_payload=payload,
            normalized_intent=normalized_intent,
            actor=resolved_actor,
            context=resolved_context,
        )

    def resolve(
        self,
        raw_payload: Mapping[str, Any] | None,
        *,
        actor: Mapping[str, Any] | ActorIdentity | None = None,
        context: Mapping[str, Any] | RuntimeContext | None = None,
        active_policy_bundles: list[Any] | tuple[Any, ...] | None = None,
        conflict_resolution: str = DEFAULT_CONFLICT_RESOLUTION,
        decided_at: str | None = None,
        interaction_id: str | None = None,
        surface: str | None = None,
    ) -> AgentResolution:
        """Normalize, mediate, and delegation-check an agent action."""

        envelope = self.normalize(
            raw_payload,
            actor=actor,
            context=context,
            interaction_id=interaction_id,
            surface=surface,
        )
        bundles = _active_bundles_for_resolution(self.mediator, active_policy_bundles)
        if self.mediator is not None:
            decision = self.mediator.evaluate(
                envelope,
                active_policy_bundles=bundles if active_policy_bundles is not None else None,
                conflict_resolution=conflict_resolution,
                decided_at=decided_at,
            )
        else:
            decision = evaluate_control_surface_interaction(
                envelope,
                active_policy_bundles=bundles,
                conflict_resolution=conflict_resolution,
                decided_at=decided_at,
            )

        delegation = evaluate_agent_delegation(envelope, bundles)
        if not delegation.authorized:
            decision = _delegation_denial_decision(decision, envelope, delegation)
        return AgentResolution(envelope=envelope, decision=decision, delegation=delegation)


def normalize_agent_interaction(
    raw_payload: Mapping[str, Any] | None,
    *,
    actor: Mapping[str, Any] | ActorIdentity | None = None,
    context: Mapping[str, Any] | RuntimeContext | None = None,
    interaction_id: str | None = None,
    surface: str = DEFAULT_AGENT_SURFACE,
) -> InteractionEnvelope:
    """Normalize an AI-agent event into the canonical interaction envelope."""

    return AgentIntentResolver(surface=surface).normalize(
        raw_payload,
        actor=actor,
        context=context,
        interaction_id=interaction_id,
    )


def resolve_agent_interaction(
    raw_payload: Mapping[str, Any] | None,
    *,
    actor: Mapping[str, Any] | ActorIdentity | None = None,
    context: Mapping[str, Any] | RuntimeContext | None = None,
    active_policy_bundles: list[Any] | tuple[Any, ...] | None = None,
    conflict_resolution: str = DEFAULT_CONFLICT_RESOLUTION,
    decided_at: str | None = None,
    interaction_id: str | None = None,
    surface: str = DEFAULT_AGENT_SURFACE,
    mediator: ControlSurfaceMediator | None = None,
) -> AgentResolution:
    """Normalize an agent event and return its mediated delegation decision."""

    return AgentIntentResolver(surface=surface, mediator=mediator).resolve(
        raw_payload,
        actor=actor,
        context=context,
        active_policy_bundles=active_policy_bundles,
        conflict_resolution=conflict_resolution,
        decided_at=decided_at,
        interaction_id=interaction_id,
    )


def evaluate_agent_delegation(
    envelope: InteractionEnvelope | Mapping[str, Any],
    active_policy_bundles: list[Any] | tuple[Any, ...] | None = None,
) -> AgentDelegationEvaluation:
    """Evaluate whether compiled delegation grants cover an agent invocation."""

    resolved = _coerce_envelope(envelope)
    required = _requires_delegation_authority(resolved.surface_event)
    actor = resolved.actor
    chain = list(actor.delegation_chain)
    bundles = normalize_active_policy_bundles(active_policy_bundles or [])
    grants = _delegation_grants_from_bundles(bundles)
    default_ref, default_cid = _default_delegation_policy_ref(bundles, grants)

    if actor.type != "agent":
        return AgentDelegationEvaluation(
            required=required,
            authorized=False,
            reason="Agent surface actions must use actor.type 'agent'.",
            delegation_chain=chain,
            policy_bundle_ref=default_ref,
            compiled_policy_cid=default_cid,
            considered_grants=_grant_summaries(grants),
        )
    if not actor.id:
        return AgentDelegationEvaluation(
            required=required,
            authorized=False,
            reason="Agent surface actions require an agent actor id.",
            delegation_chain=chain,
            policy_bundle_ref=default_ref,
            compiled_policy_cid=default_cid,
            considered_grants=_grant_summaries(grants),
        )
    if not chain:
        return AgentDelegationEvaluation(
            required=required,
            authorized=False,
            reason="Agent surface actions must carry a delegation_chain.",
            delegation_chain=chain,
            policy_bundle_ref=default_ref,
            compiled_policy_cid=default_cid,
            considered_grants=_grant_summaries(grants),
        )
    if chain[-1] != actor.id:
        return AgentDelegationEvaluation(
            required=required,
            authorized=False,
            reason="Agent delegation_chain must terminate at the invoking agent id.",
            delegation_chain=chain,
            policy_bundle_ref=default_ref,
            compiled_policy_cid=default_cid,
            considered_grants=_grant_summaries(grants),
        )
    if not required:
        return AgentDelegationEvaluation(
            required=False,
            authorized=True,
            reason="Agent proposal carries delegation metadata and is mediated by policy.",
            delegation_chain=chain,
            ucan_cid=_ucan_cid(_mapping(resolved.raw_payload)),
            policy_bundle_ref=default_ref,
            compiled_policy_cid=default_cid,
            considered_grants=_grant_summaries(grants),
        )

    for grant in grants:
        if not _grant_authorizes(grant, resolved):
            continue
        return AgentDelegationEvaluation(
            required=True,
            authorized=True,
            reason=(
                "Compiled UCAN/delegation grant authorizes "
                f"{resolved.surface_event} for {resolved.normalized_intent.method}."
            ),
            delegation_chain=chain,
            grant_ref=str(grant.get("grant_ref") or ""),
            ucan_cid=_ucan_cid(grant),
            policy_bundle_ref=dict(_mapping(grant.get("policy_bundle_ref"))),
            compiled_policy_cid=str(grant.get("compiled_policy_cid") or ""),
            considered_grants=_grant_summaries(grants),
        )

    return AgentDelegationEvaluation(
        required=True,
        authorized=False,
        reason=(
            "No compiled UCAN/delegation grant matched the agent delegation_chain, "
            f"event {resolved.surface_event!r}, method {resolved.normalized_intent.method!r}, "
            f"and target {resolved.normalized_intent.target_ref!r}."
        ),
        delegation_chain=chain,
        ucan_cid=_ucan_cid(_mapping(resolved.raw_payload)),
        policy_bundle_ref=default_ref,
        compiled_policy_cid=default_cid,
        considered_grants=_grant_summaries(grants),
    )


def _payload_copy(raw_payload: Mapping[str, Any] | None) -> dict[str, Any]:
    payload = dict(raw_payload or {})
    for key in (
        "actor",
        "agent",
        "context",
        "delegation",
        "normalized_intent",
        "proposal",
        "schedule",
        "tool_call",
        "ucan",
        "UCAN",
    ):
        if isinstance(payload.get(key), Mapping):
            payload[key] = dict(payload[key])
    return payload


def _resolve_surface_event(payload: Mapping[str, Any]) -> str:
    raw_event = _first_top_level_text(payload, _EVENT_FIELD_NAMES)
    if not raw_event:
        if payload.get("proposal") or payload.get("proposal_id") or payload.get("proposalId"):
            raw_event = "proposal"
        elif payload.get("schedule") or payload.get("scheduled_for") or payload.get("run_at"):
            raw_event = "scheduled_action"
        else:
            raw_event = "proposal"

    normalized = _AGENT_EVENT_ALIASES.get(_normalize_token(raw_event), _normalize_token(raw_event))
    if normalized not in AGENT_EVENT_TYPES:
        raise AgentResolutionError(f"Unsupported agent event {raw_event!r}.")
    return normalized


def _normalized_intent(payload: Mapping[str, Any], *, surface_event: str) -> dict[str, Any]:
    explicit = _mapping(payload.get("normalized_intent"))
    method = _first_text(
        explicit.get("method"),
        _first_payload_text(payload, _METHOD_FIELD_NAMES),
        _first_payload_text(_mapping(payload.get("tool_call")), _METHOD_FIELD_NAMES),
    )
    if not method:
        raise AgentResolutionError("Agent actions require a target method before mediation.")

    intent = _first_text(
        explicit.get("intent"),
        _first_payload_text(payload, _INTENT_FIELD_NAMES),
        _intent_for_method(method),
    )
    target_ref = _normalize_target_ref(
        _first_text(
            explicit.get("target_ref"),
            _first_payload_text(payload, _TARGET_FIELD_NAMES),
            _first_payload_text(_mapping(payload.get("tool_call")), _TARGET_FIELD_NAMES),
            "target:unknown",
        )
    )
    arguments = dict(_mapping(explicit.get("arguments")))
    arguments.update(dict(_mapping(payload.get("arguments"))))
    arguments.update(dict(_mapping(_mapping(payload.get("tool_call")).get("arguments"))))
    arguments.setdefault("source", "agent")
    arguments.setdefault("surface_event", surface_event)
    for key in (
        "proposal_id",
        "proposalId",
        "task_id",
        "taskId",
        "schedule_id",
        "scheduleId",
        "scheduled_for",
        "scheduledFor",
        "run_at",
        "runAt",
        "risk_class",
    ):
        _copy_argument_if_present(arguments, payload, key)

    return {
        "intent": intent,
        "method": method,
        "target_ref": target_ref,
        "arguments": arguments,
        "confidence": _confidence(
            explicit.get("confidence"),
            payload.get("confidence"),
            payload.get("planner_confidence"),
            1.0,
        ),
    }


def _actor_payload(
    payload: Mapping[str, Any],
    actor: Mapping[str, Any] | ActorIdentity | None,
) -> Mapping[str, Any] | ActorIdentity:
    if isinstance(actor, ActorIdentity):
        return actor
    if actor is not None:
        return _coerce_agent_actor(dict(actor), payload)

    embedded = payload.get("actor")
    if isinstance(embedded, Mapping):
        return _coerce_agent_actor(embedded, payload)

    nested_agent = _mapping(payload.get("agent"))
    agent_id = _first_text(
        _first_top_level_text(payload, _AGENT_ID_FIELDS),
        nested_agent.get("id"),
        nested_agent.get("agent_id"),
    )
    chain = _delegation_chain_from_payload(payload)
    if not chain and agent_id:
        chain = [agent_id]
    return {"type": "agent", "id": agent_id, "delegation_chain": chain}


def _coerce_agent_actor(actor: Mapping[str, Any], payload: Mapping[str, Any]) -> dict[str, Any]:
    actor_id = _first_text(
        actor.get("id"),
        actor.get("agent_id"),
        actor.get("agentId"),
        _first_top_level_text(payload, _AGENT_ID_FIELDS),
    )
    chain = _string_list(actor.get("delegation_chain"))
    if not chain:
        chain = _delegation_chain_from_payload(payload)
    if not chain and actor_id:
        chain = [actor_id]
    return {
        "type": _first_text(actor.get("type"), "agent"),
        "id": actor_id,
        "delegation_chain": chain,
    }


def _context_payload(
    payload: Mapping[str, Any],
    context: Mapping[str, Any] | RuntimeContext | None,
    *,
    surface_event: str,
    actor: Mapping[str, Any],
) -> Mapping[str, Any] | RuntimeContext:
    if isinstance(context, RuntimeContext):
        return context

    resolved = dict(_mapping(context))
    embedded = payload.get("context")
    if isinstance(embedded, Mapping):
        resolved = {**dict(embedded), **resolved}

    device_context = dict(_mapping(resolved.get("device_context")))
    device_context.setdefault("input_surface", "agent")
    device_context.setdefault("agent_event", surface_event)
    device_context.setdefault("agent_id", actor.get("id", ""))
    device_context.setdefault("delegation_chain", list(actor.get("delegation_chain", []) or []))
    for key in _AGENT_CONTEXT_FIELDS:
        if key in payload:
            device_context.setdefault(_normalize_device_context_key(key), payload[key])
    for nested_key in ("agent", "delegation", "schedule", "proposal", "ucan", "UCAN"):
        nested = payload.get(nested_key)
        if isinstance(nested, Mapping):
            device_context.setdefault(_normalize_device_context_key(nested_key), dict(nested))

    resolved.setdefault(
        "local_time",
        _first_text(payload.get("local_time"), payload.get("timestamp"), payload.get("observed_at")),
    )
    resolved.setdefault("state_frames", _string_list(payload.get("state_frames", []) or []))
    resolved.setdefault("device_mode", str(payload.get("device_mode") or ""))
    resolved.setdefault("platform", str(payload.get("platform") or "hallucinate_app"))
    resolved.setdefault("location_context", dict(_mapping(payload.get("location_context"))))
    resolved["device_context"] = device_context
    return resolved


def _interaction_id(
    payload: Mapping[str, Any],
    surface: str,
    surface_event: str,
    actor: Mapping[str, Any],
    normalized_intent: Mapping[str, Any],
) -> str:
    supplied = _first_text(payload.get("interaction_id"), payload.get("event_id"), payload.get("idempotency_key"))
    if supplied:
        return supplied
    return stable_control_surface_id(
        "agent",
        surface,
        surface_event,
        actor.get("id", ""),
        normalized_intent.get("method", ""),
        normalized_intent.get("target_ref", ""),
        payload.get("timestamp") or payload.get("local_time") or payload.get("proposal_id") or "",
    )


def _active_bundles_for_resolution(
    mediator: ControlSurfaceMediator | None,
    active_policy_bundles: list[Any] | tuple[Any, ...] | None,
) -> list[ActivePolicyBundle]:
    if active_policy_bundles is not None:
        return normalize_active_policy_bundles(active_policy_bundles)
    if mediator is not None:
        return list(getattr(mediator, "active_policy_bundles", []) or [])
    return []


def _requires_delegation_authority(surface_event: str) -> bool:
    return surface_event in {"autonomous_invoke", "scheduled_action"}


def _delegation_denial_decision(
    base: PolicyDecision,
    envelope: InteractionEnvelope,
    delegation: AgentDelegationEvaluation,
) -> PolicyDecision:
    intent = envelope.normalized_intent
    policy_bundle_ref = delegation.policy_bundle_ref or dict(AGENT_DELEGATION_POLICY_BUNDLE_REF)
    compiled_policy_cid = delegation.compiled_policy_cid or AGENT_DELEGATION_COMPILED_POLICY_CID
    metadata = dict(base.metadata)
    metadata.update(
        {
            "can_execute": False,
            "requires_confirmation": False,
            "agent_delegation_required": delegation.required,
            "agent_delegation_authorized": False,
            "agent_delegation_reason": delegation.reason,
            "agent_delegation_chain": list(delegation.delegation_chain),
            "agent_delegation_grant_ref": delegation.grant_ref,
            "agent_delegation_ucan_cid": delegation.ucan_cid,
            "agent_delegation_considered_grants": list(delegation.considered_grants),
            "base_decision_id": base.decision_id,
            "base_outcome": base.outcome,
        }
    )
    return PolicyDecision(
        decision_id=stable_control_surface_id(
            "decision",
            envelope.interaction_id,
            "agent_delegation_deny",
            compiled_policy_cid,
        ),
        interaction_id=envelope.interaction_id,
        outcome=DeonticOutcome.DENY.value,
        policy_bundle_ref=policy_bundle_ref,
        compiled_policy_cid=compiled_policy_cid,
        decided_at=base.decided_at,
        interaction_envelope=base.interaction_envelope,
        matched_norms=list(base.matched_norms),
        effects=[
            InvocationEffect.from_intent(
                outcome=DeonticOutcome.DENY,
                method=intent.method,
                target_ref=intent.target_ref,
                arguments=intent.arguments,
                reason=delegation.reason,
            )
        ],
        frame_facts=list(base.frame_facts),
        reasons=_dedupe_strings([delegation.reason, *base.reasons]),
        explanation=" ".join(_dedupe_strings([delegation.reason, base.explanation])),
        confidence=min(base.confidence, 1.0),
        metadata=metadata,
    )


def _delegation_grants_from_bundles(bundles: list[ActivePolicyBundle]) -> list[dict[str, Any]]:
    grants: list[dict[str, Any]] = []
    for bundle in bundles:
        sources: list[Mapping[str, Any]] = [bundle.policy.compiled_artifacts]
        sources.extend(norm.metadata for norm in bundle.policy.norms)
        for source in sources:
            for grant in _extract_grant_payloads(source):
                resolved = dict(grant)
                resolved.setdefault("policy_bundle_ref", dict(bundle.policy_bundle_ref))
                resolved.setdefault("compiled_policy_cid", bundle.compiled_policy_cid)
                resolved.setdefault(
                    "grant_ref",
                    _first_text(
                        resolved.get("grant_ref"),
                        resolved.get("delegation_cid"),
                        resolved.get("ucan_cid"),
                        resolved.get("cid"),
                        stable_control_surface_id(
                            "delegation",
                            bundle.compiled_policy_cid,
                            len(grants),
                        ),
                    ),
                )
                grants.append(resolved)
    return grants


def _extract_grant_payloads(value: Any, *, depth: int = 0) -> list[dict[str, Any]]:
    if depth > 3:
        return []
    data = _mapping(value)
    if not data:
        if isinstance(value, (list, tuple)):
            grants: list[dict[str, Any]] = []
            for item in value:
                grants.extend(_extract_grant_payloads(item, depth=depth + 1))
            return grants
        return []

    grants = [dict(data)] if _looks_like_grant(data) else []
    for key in _GRANT_CONTAINER_FIELDS:
        nested = data.get(key)
        if nested is None:
            continue
        if isinstance(nested, Mapping):
            grants.extend(_extract_grant_payloads(nested, depth=depth + 1))
        elif isinstance(nested, (list, tuple)):
            for item in nested:
                grants.extend(_extract_grant_payloads(item, depth=depth + 1))
    return grants


def _looks_like_grant(data: Mapping[str, Any]) -> bool:
    if isinstance(data.get("allows"), Mapping):
        return True
    return any(key in data and data.get(key) not in (None, "", [], {}) for key in _GRANT_SCOPE_FIELDS)


def _grant_authorizes(grant: Mapping[str, Any], envelope: InteractionEnvelope) -> bool:
    scope = _grant_scope(grant)
    if not _chain_authorized(scope, envelope.actor.delegation_chain):
        return False
    if not _actor_authorized(scope, envelope.actor.id):
        return False
    if not _values_allow(_field_values(scope, _SURFACE_GRANT_FIELDS), envelope.surface):
        return False
    if not _values_allow(_field_values(scope, _EVENT_GRANT_FIELDS), envelope.surface_event):
        return False
    if not _method_authorized(scope, envelope):
        return False
    target_patterns = _field_values(scope, _TARGET_GRANT_FIELDS)
    if target_patterns and not _values_allow(target_patterns, envelope.normalized_intent.target_ref):
        return False
    if not _time_window_authorized(scope, envelope):
        return False
    return True


def _grant_scope(grant: Mapping[str, Any]) -> dict[str, Any]:
    scope = dict(grant)
    allows = grant.get("allows")
    if isinstance(allows, Mapping):
        scope.update(dict(allows))
    nested_scope = grant.get("scope")
    if isinstance(nested_scope, Mapping):
        scope.update(dict(nested_scope))
    return scope


def _chain_authorized(scope: Mapping[str, Any], chain: list[str]) -> bool:
    grant_chain = _string_list(
        _first_present(
            scope.get("delegation_chain"),
            scope.get("chain"),
            scope.get("delegation_path"),
            scope.get("delegationPath"),
        )
    )
    if grant_chain and grant_chain != list(chain):
        return False
    max_depth = _first_present(scope.get("max_chain_depth"), scope.get("max_delegation_depth"))
    if max_depth not in (None, ""):
        try:
            if len(chain) > int(max_depth):
                return False
        except (TypeError, ValueError):
            return False
    return True


def _actor_authorized(scope: Mapping[str, Any], actor_id: str) -> bool:
    values = _field_values(
        scope,
        ("agent_id", "agent", "delegate", "audience", "with_actor", "subject"),
    )
    if not values:
        return True
    return _values_allow(values, actor_id) or _values_allow(values, f"agent:{actor_id}")


def _method_authorized(scope: Mapping[str, Any], envelope: InteractionEnvelope) -> bool:
    method_values = _field_values(scope, _METHOD_GRANT_FIELDS)
    capability_values = _field_values(scope, _CAPABILITY_GRANT_FIELDS)
    patterns = method_values + capability_values
    if not patterns:
        return False

    intent = envelope.normalized_intent
    candidates = [
        intent.method,
        intent.intent,
        f"method:{intent.method}",
        f"intent:{intent.intent}",
        f"{envelope.surface_event}:{intent.method}",
        f"{envelope.surface}:{envelope.surface_event}:{intent.method}",
        f"{envelope.surface}/{envelope.surface_event}/{intent.method}",
    ]
    for pattern in patterns:
        if any(_pattern_matches(pattern, candidate) for candidate in candidates):
            return True
        text = str(pattern or "")
        if text.startswith("capability:") and any(_pattern_matches(text.split(":", 1)[1], candidate) for candidate in candidates):
            return True
    return False


def _time_window_authorized(scope: Mapping[str, Any], envelope: InteractionEnvelope) -> bool:
    not_before = _first_text(scope.get("not_before"), scope.get("nbf"))
    expires_at = _first_text(scope.get("expires_at"), scope.get("expiration"), scope.get("exp"))
    now = envelope.context.parsed_local_time()
    if not_before:
        start = _parse_time(not_before)
        if start is None or now is None:
            return False
        if _align_timezones(now, start) < start:
            return False
    if expires_at:
        end = _parse_time(expires_at)
        if end is None or now is None:
            return False
        if _align_timezones(now, end) >= end:
            return False
    return True


def _default_delegation_policy_ref(
    bundles: list[ActivePolicyBundle],
    grants: list[Mapping[str, Any]],
) -> tuple[dict[str, str], str]:
    if grants:
        first = grants[0]
        return (
            dict(_mapping(first.get("policy_bundle_ref"))) or dict(AGENT_DELEGATION_POLICY_BUNDLE_REF),
            str(first.get("compiled_policy_cid") or AGENT_DELEGATION_COMPILED_POLICY_CID),
        )
    if bundles:
        first_bundle = bundles[0]
        return dict(first_bundle.policy_bundle_ref), first_bundle.compiled_policy_cid
    return dict(AGENT_DELEGATION_POLICY_BUNDLE_REF), AGENT_DELEGATION_COMPILED_POLICY_CID


def _grant_summaries(grants: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for grant in grants:
        summaries.append(
            {
                "grant_ref": str(grant.get("grant_ref") or ""),
                "ucan_cid": _ucan_cid(grant),
                "compiled_policy_cid": str(grant.get("compiled_policy_cid") or ""),
                "policy_bundle_ref": dict(_mapping(grant.get("policy_bundle_ref"))),
            }
        )
    return summaries


def _coerce_envelope(envelope: InteractionEnvelope | Mapping[str, Any]) -> InteractionEnvelope:
    if isinstance(envelope, InteractionEnvelope):
        return envelope
    data = _mapping(envelope)
    return normalize_interaction(
        interaction_id=str(data.get("interaction_id") or ""),
        surface=str(data.get("surface") or DEFAULT_AGENT_SURFACE),
        surface_event=str(data.get("surface_event") or "proposal"),
        raw_payload=dict(_mapping(data.get("raw_payload"))),
        normalized_intent=dict(_mapping(data.get("normalized_intent"))),
        actor=dict(_mapping(data.get("actor"))),
        context=dict(_mapping(data.get("context"))),
    )


def _intent_for_method(method: str) -> str:
    normalized = _normalize_token(method)
    if normalized in {"focus_next", "focus_previous", "activate", "preview_activate", "select"}:
        return f"display.{normalized}"
    if normalized == "send_message":
        return "communication.send"
    if any(token in normalized for token in ("delete", "destroy", "remove")):
        return f"destructive.{normalized}"
    return f"agent.{normalized}" if normalized else ""


def _delegation_chain_from_payload(payload: Mapping[str, Any]) -> list[str]:
    chain = _string_list(payload.get("delegation_chain"))
    if chain:
        return chain
    for key in ("delegation", "ucan", "UCAN"):
        nested = _mapping(payload.get(key))
        chain = _string_list(
            _first_present(
                nested.get("delegation_chain"),
                nested.get("chain"),
                nested.get("delegation_path"),
                nested.get("delegationPath"),
            )
        )
        if chain:
            return chain
    return []


def _ucan_cid(payload: Mapping[str, Any]) -> str:
    return _first_text(
        payload.get("ucan_cid"),
        payload.get("ucanCid"),
        payload.get("delegation_cid"),
        payload.get("delegationCid"),
        payload.get("cid"),
        _mapping(payload.get("ucan")).get("cid"),
        _mapping(payload.get("UCAN")).get("cid"),
    )


def _field_values(payload: Mapping[str, Any], keys: tuple[str, ...]) -> list[str]:
    values: list[str] = []
    for key in keys:
        if key not in payload:
            continue
        value = payload.get(key)
        if isinstance(value, Mapping):
            for nested_key in keys:
                values.extend(_string_list(value.get(nested_key)))
        else:
            values.extend(_string_list(value))
    return _dedupe_strings(values)


def _values_allow(patterns: list[str], actual: str) -> bool:
    if not patterns:
        return True
    return any(_pattern_matches(pattern, actual) for pattern in patterns)


def _pattern_matches(pattern: Any, actual: str) -> bool:
    expected = str(pattern or "").strip()
    value = str(actual or "").strip()
    if expected in {"", "*"}:
        return True
    if expected == value:
        return True
    if expected.endswith(":*"):
        return value.startswith(expected[:-1])
    if expected.endswith("/*"):
        return value.startswith(expected[:-1])
    if expected.endswith("*"):
        return value.startswith(expected[:-1])
    return False


def _normalize_target_ref(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return "target:unknown"
    if ":" in text:
        return text
    return f"target:{text}"


def _copy_argument_if_present(arguments: dict[str, Any], payload: Mapping[str, Any], key: str) -> None:
    if key in payload and key not in arguments:
        arguments[key] = payload[key]


def _first_payload_text(payload: Mapping[str, Any], keys: tuple[str, ...]) -> str:
    value = _first_top_level_text(payload, keys)
    if value:
        return value
    for nested_key in ("agent", "proposal", "schedule", "action"):
        nested = payload.get(nested_key)
        if isinstance(nested, Mapping):
            value = _first_top_level_text(nested, keys)
            if value:
                return value
    return ""


def _first_top_level_text(payload: Mapping[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = payload.get(key)
        if value not in ("", None):
            return str(value)
    return ""


def _first_text(*values: Any) -> str:
    for value in values:
        if value not in ("", None):
            return str(value)
    return ""


def _first_present(*values: Any) -> Any:
    for value in values:
        if value not in ("", None, [], {}):
            return value
    return None


def _confidence(*values: Any) -> float:
    for value in values:
        if value in ("", None):
            continue
        try:
            confidence = float(value)
        except (TypeError, ValueError):
            continue
        return max(0.0, min(1.0, confidence))
    return 1.0


def _mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    if hasattr(value, "as_dict"):
        mapped = value.as_dict()
        if isinstance(mapped, Mapping):
            return mapped
    return {}


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (str, bytes)):
        return [str(value)] if str(value) else []
    if isinstance(value, Mapping):
        return []
    try:
        return [str(item) for item in value if str(item)]
    except TypeError:
        text = str(value)
        return [text] if text else []


def _dedupe_strings(values: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "")
        if text and text not in seen:
            seen.add(text)
            deduped.append(text)
    return deduped


def _normalize_token(value: Any) -> str:
    return str(value or "").strip().casefold().replace("-", "_").replace(" ", "_")


def _normalize_device_context_key(value: str) -> str:
    return _normalize_token(value).replace("__", "_")


def _parse_time(value: str) -> datetime | None:
    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _align_timezones(now: datetime, reference: datetime) -> datetime:
    if now.tzinfo is None and reference.tzinfo is not None:
        return now.replace(tzinfo=reference.tzinfo)
    if now.tzinfo is not None and reference.tzinfo is None:
        return now.astimezone(timezone.utc).replace(tzinfo=None)
    return now
