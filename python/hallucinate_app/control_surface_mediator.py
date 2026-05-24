"""Runtime mediation for normalized multimodal control-surface interactions.

The mediator is the pre-invocation policy decision point for Hallucinate-owned
control surfaces. It evaluates a normalized interaction envelope against active
``ControlSurfacePolicy`` bundles and returns a schema-compatible rich decision
before the target interface method is allowed to execute.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Mapping

from hallucinate_app.control_surface_intents import InteractionEnvelope, normalize_interaction
from hallucinate_app.control_surface_logic_ir import (
    ControlSurfaceNorm,
    ControlSurfacePolicy,
    DeonticOutcome,
    FrameFact,
    InvocationEffect,
    TemporalGuard,
    TemporalGuardKind,
    event_calculus_facts_from_interaction,
    frame_facts_from_interaction,
    stable_control_surface_id,
)
from hallucinate_app.control_surface_store import PolicyBundleStore, stable_cid


MEDIATOR_VERSION = "0.1.0"
DEFAULT_CONFLICT_RESOLUTION = "deny_over_permit"
DEFAULT_POLICY_BUNDLE_REF = {
    "policy_id": "policy:default-runtime-allow",
    "policy_cid": "local:default-runtime-allow",
    "version": MEDIATOR_VERSION,
    "scope": "runtime",
    "source": "system_default",
}
DEFAULT_COMPILED_POLICY_CID = "local:default-runtime-allow"

SUPPORTED_OUTCOMES = (
    "allow",
    "deny",
    "require_confirmation",
    "defer",
    "rewrite",
    "fallback_surface",
    "rate_limit",
)
_ALL_OUTCOMES = set(SUPPORTED_OUTCOMES)
_DENY_OVER_PERMIT_PRECEDENCE = {
    DeonticOutcome.DENY.value: 700,
    DeonticOutcome.RATE_LIMIT.value: 600,
    DeonticOutcome.REQUIRE_CONFIRMATION.value: 500,
    DeonticOutcome.FALLBACK_SURFACE.value: 400,
    DeonticOutcome.REWRITE.value: 300,
    DeonticOutcome.DEFER.value: 200,
    DeonticOutcome.ALLOW.value: 100,
}
_BLOCKING_OUTCOMES = {
    DeonticOutcome.DENY.value,
    DeonticOutcome.REQUIRE_CONFIRMATION.value,
    DeonticOutcome.DEFER.value,
    DeonticOutcome.RATE_LIMIT.value,
}


@dataclass(frozen=True)
class ActivePolicyBundle:
    """Loaded policy bundle plus the stable refs used in decisions."""

    policy: ControlSurfacePolicy
    policy_bundle_ref: dict[str, str]
    compiled_policy_cid: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "policy_bundle_ref": dict(self.policy_bundle_ref),
            "compiled_policy_cid": self.compiled_policy_cid,
            "policy": self.policy.as_dict(),
        }


@dataclass(frozen=True)
class MatchedNorm:
    """Runtime evidence for one norm that matched an interaction."""

    norm: ControlSurfaceNorm
    policy_bundle_ref: dict[str, str]
    compiled_policy_cid: str
    specificity: int
    guard_refs: list[str] = field(default_factory=list)
    logic_clause_refs: list[str] = field(default_factory=list)

    @property
    def outcome(self) -> str:
        return _value(self.norm.outcome)

    @property
    def priority(self) -> int:
        return int(self.norm.priority)

    def as_dict(self) -> dict[str, Any]:
        return {
            "norm_id": self.norm.norm_id,
            "outcome": self.outcome,
            "priority": self.priority,
            "policy_bundle_ref": dict(self.policy_bundle_ref),
            "logic_clause_refs": list(self.logic_clause_refs),
            "guard_refs": list(self.guard_refs),
            "explanation": self.norm.explanation,
        }


@dataclass(frozen=True)
class PolicyDecision:
    """Schema-compatible runtime decision emitted before method invocation."""

    decision_id: str
    interaction_id: str
    outcome: str
    policy_bundle_ref: dict[str, str]
    compiled_policy_cid: str
    decided_at: str
    interaction_envelope: dict[str, Any]
    matched_norms: list[MatchedNorm]
    effects: list[InvocationEffect]
    frame_facts: list[FrameFact]
    reasons: list[str]
    explanation: str
    confidence: float = 1.0
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def can_execute(self) -> bool:
        """Whether the target invocation can proceed without another gate."""

        return self.outcome not in _BLOCKING_OUTCOMES

    @property
    def requires_confirmation(self) -> bool:
        return self.outcome == DeonticOutcome.REQUIRE_CONFIRMATION.value

    def as_dict(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "interaction_id": self.interaction_id,
            "interaction_envelope": dict(self.interaction_envelope),
            "outcome": self.outcome,
            "policy_bundle_ref": dict(self.policy_bundle_ref),
            "compiled_policy_cid": self.compiled_policy_cid,
            "decided_at": self.decided_at,
            "matched_norms": [match.as_dict() for match in self.matched_norms],
            "effects": [effect.as_dict() for effect in self.effects],
            "frame_facts": [fact.as_dict() for fact in self.frame_facts],
            "reasons": list(self.reasons),
            "explanation": self.explanation,
            "confidence": self.confidence,
            "metadata": dict(self.metadata),
        }


class ControlSurfaceMediator:
    """Evaluate normalized interactions against active policy bundles."""

    def __init__(
        self,
        active_policy_bundles: list[Any] | tuple[Any, ...] | None = None,
        *,
        store: PolicyBundleStore | str | Path | None = None,
        conflict_resolution: str = DEFAULT_CONFLICT_RESOLUTION,
    ) -> None:
        self.store = _coerce_store(store)
        self.conflict_resolution = conflict_resolution or DEFAULT_CONFLICT_RESOLUTION
        self.active_policy_bundles = normalize_active_policy_bundles(active_policy_bundles or [])

    @classmethod
    def from_profile(
        cls,
        *,
        store: PolicyBundleStore | str | Path | None = None,
        user_id: str = "",
        profile_id: str = "",
        scope: str = "",
        conflict_resolution: str = DEFAULT_CONFLICT_RESOLUTION,
    ) -> "ControlSurfaceMediator":
        """Load active policy refs from a persisted user/profile attachment."""

        resolved_store = _coerce_store(store) or PolicyBundleStore()
        return cls(
            load_active_policy_bundles(
                resolved_store,
                user_id=user_id,
                profile_id=profile_id,
                scope=scope,
            ),
            store=resolved_store,
            conflict_resolution=conflict_resolution,
        )

    def evaluate(
        self,
        envelope: InteractionEnvelope | Mapping[str, Any],
        *,
        active_policy_bundles: list[Any] | tuple[Any, ...] | None = None,
        conflict_resolution: str | None = None,
        decided_at: str | None = None,
    ) -> PolicyDecision:
        """Return a rich policy decision for a normalized interaction envelope."""

        resolved_envelope = _coerce_envelope(envelope)
        bundles = (
            normalize_active_policy_bundles(active_policy_bundles)
            if active_policy_bundles is not None
            else self.active_policy_bundles
        )
        return evaluate_control_surface_interaction(
            resolved_envelope,
            active_policy_bundles=bundles,
            conflict_resolution=conflict_resolution or self.conflict_resolution,
            decided_at=decided_at,
        )


def evaluate_control_surface_interaction(
    envelope: InteractionEnvelope | Mapping[str, Any],
    *,
    active_policy_bundles: list[Any] | tuple[Any, ...] | None = None,
    conflict_resolution: str = DEFAULT_CONFLICT_RESOLUTION,
    decided_at: str | None = None,
) -> PolicyDecision:
    """Evaluate one normalized interaction before the target method executes."""

    resolved_envelope = _coerce_envelope(envelope)
    envelope_payload = _decision_envelope_payload(envelope, resolved_envelope)
    bundles = normalize_active_policy_bundles(active_policy_bundles or [])
    frame_facts = frame_facts_from_interaction(resolved_envelope)
    event_facts = event_calculus_facts_from_interaction(resolved_envelope)
    matched = _matched_norms(resolved_envelope, bundles, frame_facts)
    selected = _select_match(matched, conflict_resolution)
    event_atoms = [fact.atom() for fact in event_facts]

    if selected is None:
        effect = _default_allow_effect(resolved_envelope)
        reasons = [_default_allow_reason(bundles)]
        explanation = reasons[0]
        policy_bundle_ref = dict(DEFAULT_POLICY_BUNDLE_REF)
        compiled_policy_cid = DEFAULT_COMPILED_POLICY_CID
        outcome = DeonticOutcome.ALLOW.value
        confidence = 1.0
        selected_norm_id = "default_allow"
    else:
        outcome = selected.outcome
        effect = _effect_for_decision(selected.norm, resolved_envelope)
        policy_bundle_ref = dict(selected.policy_bundle_ref)
        compiled_policy_cid = selected.compiled_policy_cid
        reasons = _decision_reasons(selected, matched, conflict_resolution)
        explanation = _explanation(reasons)
        confidence = _policy_confidence(selected, bundles)
        selected_norm_id = selected.norm.norm_id

    decided = decided_at or _utc_now()
    decision_id = stable_control_surface_id(
        "decision",
        resolved_envelope.interaction_id,
        outcome,
        selected_norm_id,
        compiled_policy_cid,
    )
    metadata = {
        "mediator_version": MEDIATOR_VERSION,
        "conflict_resolution": conflict_resolution or DEFAULT_CONFLICT_RESOLUTION,
        "can_execute": outcome not in _BLOCKING_OUTCOMES,
        "requires_confirmation": outcome == DeonticOutcome.REQUIRE_CONFIRMATION.value,
        "active_policy_count": len(bundles),
        "matched_norm_count": len(matched),
        "selected_norm_id": "" if selected is None else selected.norm.norm_id,
        "event_calculus": [fact.as_dict() for fact in event_facts],
        "event_calculus_atoms": event_atoms,
        "policy_refs_considered": [
            {
                "policy_bundle_ref": dict(bundle.policy_bundle_ref),
                "compiled_policy_cid": bundle.compiled_policy_cid,
            }
            for bundle in bundles
        ],
    }

    return PolicyDecision(
        decision_id=decision_id,
        interaction_id=resolved_envelope.interaction_id,
        outcome=outcome,
        policy_bundle_ref=policy_bundle_ref,
        compiled_policy_cid=compiled_policy_cid,
        decided_at=decided,
        interaction_envelope=envelope_payload,
        matched_norms=matched,
        effects=[effect],
        frame_facts=frame_facts,
        reasons=reasons,
        explanation=explanation,
        confidence=confidence,
        metadata=metadata,
    )


def mediate_interaction(
    envelope: InteractionEnvelope | Mapping[str, Any],
    active_policy_bundles: list[Any] | tuple[Any, ...] | None = None,
    *,
    conflict_resolution: str = DEFAULT_CONFLICT_RESOLUTION,
) -> PolicyDecision:
    """Convenience wrapper used by pre-invocation adapters."""

    return evaluate_control_surface_interaction(
        envelope,
        active_policy_bundles=active_policy_bundles,
        conflict_resolution=conflict_resolution,
    )


def load_active_policy_bundles(
    store: PolicyBundleStore | str | Path | None = None,
    *,
    user_id: str = "",
    profile_id: str = "",
    scope: str = "",
) -> list[ActivePolicyBundle]:
    """Load active policy bundles from a profile attachment in the policy store."""

    resolved_store = _coerce_store(store) or PolicyBundleStore()
    try:
        attachment_record = resolved_store.load_profile_attachment(
            user_id=user_id,
            profile_id=profile_id,
            scope=scope,
        )
    except FileNotFoundError:
        return []
    attachment = _as_mapping(attachment_record.get("attachment"))
    refs = attachment.get("policy_refs", []) or []
    bundles: list[ActivePolicyBundle] = []
    for ref in refs:
        ref_payload = _as_mapping(ref)
        bundle_ref = _as_string_mapping(ref_payload.get("policy_bundle_ref"))
        policy_cid = bundle_ref.get("policy_cid", "")
        if not policy_cid:
            continue
        compiled_policy_cid = str(ref_payload.get("compiled_policy_cid") or "")
        try:
            bundle_record = resolved_store.load_policy_bundle(policy_cid)
        except FileNotFoundError:
            continue
        bundles.append(
            _active_bundle_from_record(
                bundle_record,
                policy_bundle_ref=bundle_ref,
                compiled_policy_cid=compiled_policy_cid,
            )
        )
    return bundles


def normalize_active_policy_bundles(
    active_policy_bundles: list[Any] | tuple[Any, ...] | None,
) -> list[ActivePolicyBundle]:
    """Coerce supported active bundle shapes into ``ActivePolicyBundle`` values."""

    bundles: list[ActivePolicyBundle] = []
    for item in active_policy_bundles or []:
        if isinstance(item, ActivePolicyBundle):
            bundles.append(item)
        elif isinstance(item, ControlSurfacePolicy):
            bundles.append(_active_bundle_from_policy(item))
        else:
            bundles.append(_active_bundle_from_record(_as_mapping(item)))
    return bundles


def policy_from_mapping(payload: Mapping[str, Any]) -> ControlSurfacePolicy:
    """Rehydrate a ``ControlSurfacePolicy`` from persisted compiled-policy JSON."""

    return ControlSurfacePolicy(
        policy_id=str(payload.get("policy_id") or "policy:inline"),
        facts=[_frame_fact_from_mapping(item) for item in payload.get("facts", []) or []],
        norms=[_norm_from_mapping(item) for item in payload.get("norms", []) or []],
        version=str(payload.get("version") or ""),
        source_text=str(payload.get("source_text") or ""),
        compiled_policy_cid=str(payload.get("compiled_policy_cid") or ""),
        compiled_artifacts=dict(_as_mapping(payload.get("compiled_artifacts"))),
        explanations=[str(item) for item in payload.get("explanations", []) or []],
    )


def _matched_norms(
    envelope: InteractionEnvelope,
    bundles: list[ActivePolicyBundle],
    frame_facts: list[FrameFact],
) -> list[MatchedNorm]:
    matched: list[MatchedNorm] = []
    for bundle in bundles:
        for norm in bundle.policy.ordered_norms():
            specificity = _norm_specificity(norm, envelope)
            if specificity < 0:
                continue
            guard_refs = _satisfied_guard_refs(norm.guards, frame_facts, envelope)
            if len(guard_refs) != len(norm.guards):
                continue
            logic_clause_refs = _logic_clause_refs(norm, bundle)
            matched.append(
                MatchedNorm(
                    norm=norm,
                    policy_bundle_ref=dict(bundle.policy_bundle_ref),
                    compiled_policy_cid=bundle.compiled_policy_cid,
                    specificity=specificity + len(guard_refs),
                    guard_refs=guard_refs,
                    logic_clause_refs=logic_clause_refs,
                )
            )
    return sorted(matched, key=_match_sort_key, reverse=True)


def _select_match(
    matches: list[MatchedNorm],
    conflict_resolution: str,
) -> MatchedNorm | None:
    if not matches:
        return None

    mode = conflict_resolution or DEFAULT_CONFLICT_RESOLUTION
    if mode == "highest_priority":
        return max(matches, key=lambda match: (match.priority, _outcome_precedence(match.outcome), match.specificity))
    if mode == "most_specific_binding":
        return max(matches, key=lambda match: (match.specificity, match.priority, _outcome_precedence(match.outcome)))
    if mode == "require_confirmation":
        confirmations = [
            match
            for match in matches
            if match.outcome == DeonticOutcome.REQUIRE_CONFIRMATION.value
        ]
        if confirmations:
            return max(confirmations, key=lambda match: (match.priority, match.specificity))

    return max(matches, key=lambda match: (_outcome_precedence(match.outcome), match.priority, match.specificity))


def _match_sort_key(match: MatchedNorm) -> tuple[int, int, int, str]:
    return (
        _outcome_precedence(match.outcome),
        match.priority,
        match.specificity,
        match.norm.norm_id,
    )


def _outcome_precedence(outcome: str) -> int:
    return _DENY_OVER_PERMIT_PRECEDENCE.get(outcome, 0)


def _norm_specificity(norm: ControlSurfaceNorm, envelope: InteractionEnvelope) -> int:
    intent = envelope.normalized_intent
    checks = [
        _actor_match_score(norm.actor, envelope.actor.type, envelope.actor.id),
        _pattern_match_score(norm.surface, envelope.surface),
        _pattern_match_score(norm.surface_event, envelope.surface_event),
        _pattern_match_score(norm.method, intent.method, intent.intent),
        _pattern_match_score(norm.target_ref, intent.target_ref),
    ]
    if any(score < 0 for score in checks):
        return -1
    return sum(checks)


def _actor_match_score(pattern: str, actor_type: str, actor_id: str) -> int:
    actor_type = actor_type or "user"
    actor_id = actor_id or ""
    if _is_wildcard(pattern):
        return 0
    normalized = str(pattern or "").strip()
    if normalized == actor_type:
        return 1
    if normalized == actor_id:
        return 2
    if ":" in normalized:
        expected_type, expected_id = normalized.split(":", 1)
        if expected_type and expected_type != actor_type:
            return -1
        if _is_wildcard(expected_id):
            return 1
        return 3 if expected_id == actor_id else -1
    return -1


def _pattern_match_score(pattern: str, actual: str, alias: str = "") -> int:
    if _is_wildcard(pattern):
        return 0
    expected = str(pattern or "").strip()
    values = {str(actual or "").strip()}
    if alias:
        values.add(str(alias).strip())
    if expected in values:
        return 2
    if expected == "target:*":
        return 1 if any(value for value in values) else -1
    if expected.endswith(":*"):
        prefix = expected[:-1]
        return 1 if any(value.startswith(prefix) for value in values if value) else -1
    if expected.endswith("*"):
        prefix = expected[:-1]
        return 1 if any(value.startswith(prefix) for value in values if value) else -1
    return -1


def _is_wildcard(value: Any) -> bool:
    return str(value or "").strip() in {"", "*"}


def _satisfied_guard_refs(
    guards: list[TemporalGuard],
    frame_facts: list[FrameFact],
    envelope: InteractionEnvelope,
) -> list[str]:
    refs: list[str] = []
    for guard in guards:
        if _guard_satisfied(guard, frame_facts, envelope):
            refs.append(guard.guard_id)
    return refs


def _guard_satisfied(
    guard: TemporalGuard,
    frame_facts: list[FrameFact],
    envelope: InteractionEnvelope,
) -> bool:
    kind = _value(guard.kind)
    if kind == TemporalGuardKind.STATE_FRAME.value:
        expected = str(guard.expected or "")
        return _has_fact(frame_facts, "state_frame", expected) or _has_fact(
            frame_facts,
            expected,
            True,
        )
    if kind == TemporalGuardKind.TIME_WINDOW.value:
        return _has_fact(frame_facts, "time_window", guard.predicate) or _has_fact(
            frame_facts,
            guard.predicate,
            True,
        )
    if kind == TemporalGuardKind.CONTEXT_FACT.value:
        return _context_guard_satisfied(guard, frame_facts)
    if kind == TemporalGuardKind.EVENT_WINDOW.value:
        if not guard.event_refs:
            return False
        observed = {envelope.surface_event, f"{envelope.surface}:{envelope.surface_event}"}
        return all(event_ref in observed for event_ref in guard.event_refs)
    if kind == TemporalGuardKind.EXPIRY.value:
        return _expiry_guard_satisfied(guard, envelope)
    return _context_guard_satisfied(guard, frame_facts)


def _context_guard_satisfied(guard: TemporalGuard, frame_facts: list[FrameFact]) -> bool:
    relation = str(guard.relation or "equals").strip()
    if relation in {"holds", "equals", "during"}:
        return _has_fact(frame_facts, guard.predicate, guard.expected)
    if relation == "not_equals":
        return not _has_fact(frame_facts, guard.predicate, guard.expected)
    if relation == "exists":
        return any(fact.predicate == guard.predicate for fact in frame_facts)
    return _has_fact(frame_facts, guard.predicate, guard.expected)


def _expiry_guard_satisfied(guard: TemporalGuard, envelope: InteractionEnvelope) -> bool:
    if not guard.end:
        return True
    now = envelope.context.parsed_local_time()
    if now is None:
        return False
    end = guard.end.strip()
    if end.endswith("Z"):
        end = f"{end[:-1]}+00:00"
    try:
        expires_at = datetime.fromisoformat(end)
    except ValueError:
        return False
    if now.tzinfo is None and expires_at.tzinfo is not None:
        now = now.replace(tzinfo=expires_at.tzinfo)
    elif now.tzinfo is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=now.tzinfo)
    return now < expires_at


def _has_fact(frame_facts: list[FrameFact], predicate: str, expected: Any) -> bool:
    return any(fact.predicate == predicate and fact.value == expected for fact in frame_facts)


def _logic_clause_refs(norm: ControlSurfaceNorm, bundle: ActivePolicyBundle) -> list[str]:
    refs: list[str] = []
    for key in ("logic_clause_refs", "clause_refs", "norm_refs"):
        values = norm.metadata.get(key)
        if isinstance(values, str):
            refs.append(values)
        elif values:
            refs.extend(str(item) for item in values)
    if not refs and bundle.compiled_policy_cid:
        refs.append(bundle.compiled_policy_cid)
    return sorted(dict.fromkeys(ref for ref in refs if ref))


def _default_allow_effect(envelope: InteractionEnvelope) -> InvocationEffect:
    intent = envelope.normalized_intent
    return InvocationEffect.from_intent(
        outcome=DeonticOutcome.ALLOW,
        method=intent.method,
        target_ref=intent.target_ref,
        arguments=intent.arguments,
        reason="No matching active policy blocked the invocation.",
    )


def _effect_for_decision(norm: ControlSurfaceNorm, envelope: InteractionEnvelope) -> InvocationEffect:
    intent = envelope.normalized_intent
    base = norm.effect
    outcome = _value(norm.outcome)
    method = _resolved_effect_method(base, intent.method)
    target_ref = _resolved_effect_target(base, intent.target_ref)
    arguments = dict(intent.arguments)
    arguments.update(dict(base.arguments or {}))
    return InvocationEffect(
        outcome=outcome,
        method=method,
        target_ref=target_ref,
        arguments=arguments,
        rewrite_method=base.rewrite_method,
        fallback_surface=base.fallback_surface,
        confirmation_required=bool(
            base.confirmation_required or outcome == DeonticOutcome.REQUIRE_CONFIRMATION.value
        ),
        rate_limit_key=base.rate_limit_key,
        reason=base.reason or norm.explanation or norm.source_text,
    )


def _resolved_effect_method(effect: InvocationEffect, attempted_method: str) -> str:
    if _is_wildcard(effect.method):
        return attempted_method
    if _value(effect.outcome) == DeonticOutcome.REWRITE.value and effect.rewrite_method:
        return effect.rewrite_method
    return effect.method


def _resolved_effect_target(effect: InvocationEffect, attempted_target: str) -> str:
    if _is_wildcard(effect.target_ref) or effect.target_ref == "target:*":
        return attempted_target
    return effect.target_ref


def _decision_reasons(
    selected: MatchedNorm,
    matches: list[MatchedNorm],
    conflict_resolution: str,
) -> list[str]:
    reasons: list[str] = []
    reason = selected.norm.effect.reason or selected.norm.explanation or selected.norm.source_text
    if reason:
        reasons.append(reason)
    reasons.append(
        f"Matched norm {selected.norm.norm_id} from policy {selected.policy_bundle_ref.get('policy_id', '')}."
    )
    conflicting_outcomes = sorted({match.outcome for match in matches if match.outcome != selected.outcome})
    if conflicting_outcomes:
        reasons.append(
            f"Conflict resolution {conflict_resolution or DEFAULT_CONFLICT_RESOLUTION} selected "
            f"{selected.outcome} over {', '.join(conflicting_outcomes)}."
        )
    return _dedupe_strings(reasons)


def _default_allow_reason(bundles: list[ActivePolicyBundle]) -> str:
    if bundles:
        return "No active policy norm matched; default allow permits the invocation."
    return "No active policy bundles were supplied; default allow permits the invocation."


def _explanation(reasons: list[str]) -> str:
    return " ".join(reason.strip() for reason in reasons if reason.strip())


def _policy_confidence(selected: MatchedNorm, bundles: list[ActivePolicyBundle]) -> float:
    for bundle in bundles:
        if bundle.compiled_policy_cid != selected.compiled_policy_cid:
            continue
        value = bundle.policy.compiled_artifacts.get("confidence", 1.0)
        try:
            return max(0.0, min(1.0, float(value)))
        except (TypeError, ValueError):
            return 1.0
    return 1.0


def _active_bundle_from_record(
    record: Mapping[str, Any],
    *,
    policy_bundle_ref: Mapping[str, Any] | None = None,
    compiled_policy_cid: str = "",
) -> ActivePolicyBundle:
    payload = _as_mapping(record)
    policy_payload: Mapping[str, Any]
    bundle_payload = _as_mapping(payload.get("policy_bundle"))
    if bundle_payload:
        policy_payload = _as_mapping(bundle_payload.get("compiled_policy"))
        record_ref = _as_string_mapping(payload.get("policy_bundle_ref"))
        if not record_ref:
            record_ref = _as_string_mapping(bundle_payload.get("policy_bundle_ref"))
    elif "compiled_policy" in payload:
        policy_payload = _as_mapping(payload.get("compiled_policy"))
        record_ref = _as_string_mapping(payload.get("policy_bundle_ref"))
    elif "policy" in payload:
        policy_payload = _as_mapping(payload.get("policy"))
        record_ref = _as_string_mapping(payload.get("policy_bundle_ref"))
    else:
        policy_payload = payload
        record_ref = _as_string_mapping(payload.get("policy_bundle_ref"))

    policy = policy_from_mapping(policy_payload)
    resolved_compiled_cid = (
        str(compiled_policy_cid or "")
        or str(payload.get("compiled_policy_cid") or "")
        or str(bundle_payload.get("compiled_policy_cid") or "")
        or policy.compiled_policy_cid
        or stable_cid(policy.as_dict(), prefix="compiled_policy")
    )
    resolved_ref = _policy_bundle_ref(
        policy,
        policy_bundle_ref=policy_bundle_ref or record_ref,
        compiled_policy_cid=resolved_compiled_cid,
    )
    return ActivePolicyBundle(
        policy=policy,
        policy_bundle_ref=resolved_ref,
        compiled_policy_cid=resolved_compiled_cid,
    )


def _active_bundle_from_policy(policy: ControlSurfacePolicy) -> ActivePolicyBundle:
    compiled_policy_cid = policy.compiled_policy_cid or stable_cid(
        policy.as_dict(),
        prefix="compiled_policy",
    )
    return ActivePolicyBundle(
        policy=policy,
        policy_bundle_ref=_policy_bundle_ref(policy, compiled_policy_cid=compiled_policy_cid),
        compiled_policy_cid=compiled_policy_cid,
    )


def _policy_bundle_ref(
    policy: ControlSurfacePolicy,
    *,
    policy_bundle_ref: Mapping[str, Any] | None = None,
    compiled_policy_cid: str = "",
) -> dict[str, str]:
    supplied = _as_string_mapping(policy_bundle_ref)
    if supplied.get("policy_id") and supplied.get("policy_cid"):
        ref = {
            "policy_id": supplied["policy_id"],
            "policy_cid": supplied["policy_cid"],
            "version": supplied.get("version") or policy.version or MEDIATOR_VERSION,
            "scope": supplied.get("scope") or "runtime",
            "source": supplied.get("source") or "runtime_override",
        }
        return ref

    policy_cid = supplied.get("policy_cid") or stable_cid(
        {"compiled_policy_cid": compiled_policy_cid, "policy": policy.as_dict()},
        prefix="policy_bundle",
    )
    return {
        "policy_id": supplied.get("policy_id") or policy.policy_id,
        "policy_cid": policy_cid,
        "version": supplied.get("version") or policy.version or MEDIATOR_VERSION,
        "scope": supplied.get("scope") or "runtime",
        "source": supplied.get("source") or "runtime_override",
    }


def _frame_fact_from_mapping(payload: Any) -> FrameFact:
    data = _as_mapping(payload)
    return FrameFact(
        fact_id=str(data.get("fact_id") or stable_control_surface_id("fact", data.get("kind"), data.get("predicate"), data.get("value"))),
        kind=str(data.get("kind") or ""),
        subject=str(data.get("subject") or ""),
        predicate=str(data.get("predicate") or ""),
        value=data.get("value"),
        attrs=dict(_as_mapping(data.get("attrs"))),
    )


def _norm_from_mapping(payload: Any) -> ControlSurfaceNorm:
    data = _as_mapping(payload)
    effect = _effect_from_mapping(data.get("effect"))
    return ControlSurfaceNorm(
        norm_id=str(data.get("norm_id") or stable_control_surface_id("norm", data.get("source_text"), data.get("outcome"))),
        outcome=_outcome_value(data.get("outcome") or effect.outcome, DeonticOutcome.REQUIRE_CONFIRMATION.value),
        effect=effect,
        actor=str(data.get("actor") or "*"),
        surface=str(data.get("surface") or "*"),
        surface_event=str(data.get("surface_event") or "*"),
        method=str(data.get("method") or "*"),
        target_ref=str(data.get("target_ref") or "*"),
        guards=[_guard_from_mapping(item) for item in data.get("guards", []) or []],
        priority=int(data.get("priority") or 0),
        source_text=str(data.get("source_text") or ""),
        explanation=str(data.get("explanation") or ""),
        metadata=dict(_as_mapping(data.get("metadata"))),
    )


def _guard_from_mapping(payload: Any) -> TemporalGuard:
    data = _as_mapping(payload)
    return TemporalGuard(
        guard_id=str(data.get("guard_id") or stable_control_surface_id("guard", data.get("kind"), data.get("predicate"), data.get("expected"))),
        kind=str(data.get("kind") or TemporalGuardKind.CONTEXT_FACT.value),
        predicate=str(data.get("predicate") or ""),
        expected=data.get("expected", True),
        relation=str(data.get("relation") or "holds"),
        start=str(data.get("start") or ""),
        end=str(data.get("end") or ""),
        timezone=str(data.get("timezone") or "UTC"),
        event_refs=[str(item) for item in data.get("event_refs", []) or []],
        metadata=dict(_as_mapping(data.get("metadata"))),
    )


def _effect_from_mapping(payload: Any) -> InvocationEffect:
    data = _as_mapping(payload)
    return InvocationEffect(
        outcome=_outcome_value(data.get("outcome"), DeonticOutcome.REQUIRE_CONFIRMATION.value),
        method=str(data.get("method") or "*"),
        target_ref=str(data.get("target_ref") or "*"),
        arguments=dict(_as_mapping(data.get("arguments"))),
        rewrite_method=str(data.get("rewrite_method") or ""),
        fallback_surface=str(data.get("fallback_surface") or ""),
        confirmation_required=bool(data.get("confirmation_required") or False),
        rate_limit_key=str(data.get("rate_limit_key") or ""),
        reason=str(data.get("reason") or ""),
    )


def _coerce_envelope(envelope: InteractionEnvelope | Mapping[str, Any]) -> InteractionEnvelope:
    if isinstance(envelope, InteractionEnvelope):
        return envelope
    data = _as_mapping(envelope)
    return normalize_interaction(
        interaction_id=str(data.get("interaction_id") or ""),
        surface=str(data.get("surface") or ""),
        surface_event=str(data.get("surface_event") or ""),
        raw_payload=dict(_as_mapping(data.get("raw_payload"))),
        normalized_intent=dict(_as_mapping(data.get("normalized_intent"))),
        actor=dict(_as_mapping(data.get("actor"))),
        context=dict(_as_mapping(data.get("context"))),
    )


def _decision_envelope_payload(
    source: InteractionEnvelope | Mapping[str, Any],
    envelope: InteractionEnvelope,
) -> dict[str, Any]:
    payload = envelope.as_dict()
    source_payload = _as_mapping(source)
    for key in (
        "control_surface_contract_ref",
        "policy_bundle_ref",
        "compiled_policy_cid",
        "logic_bindings",
    ):
        if key in source_payload:
            payload[key] = source_payload[key]
    return payload


def _coerce_store(store: PolicyBundleStore | str | Path | None) -> PolicyBundleStore | None:
    if store is None:
        return None
    if isinstance(store, PolicyBundleStore):
        return store
    return PolicyBundleStore(store)


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if value is None:
        return {}
    if isinstance(value, Mapping):
        return value
    if hasattr(value, "as_dict"):
        mapped = value.as_dict()
        if isinstance(mapped, Mapping):
            return mapped
    return {}


def _as_string_mapping(value: Any) -> dict[str, str]:
    return {str(key): str(item) for key, item in _as_mapping(value).items() if item is not None}


def _value(value: Any) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def _outcome_value(value: Any, default: str) -> str:
    outcome = _value(value or default)
    return outcome if outcome in _ALL_OUTCOMES else default


def _dedupe_strings(values: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value).strip()
        if text and text not in seen:
            seen.add(text)
            deduped.append(text)
    return deduped


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
