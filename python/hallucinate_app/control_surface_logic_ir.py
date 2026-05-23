"""Frame-first policy IR for multimodal control-surface mediation.

The classes in this module are Hallucinate-owned data structures. They keep UI
and device concepts out of the upstream logic dependency while preserving clear
hooks for later conversion into frame logic, event_calculus terms, and deontic
policy clauses.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import hashlib
from typing import Any, Mapping


IR_VERSION = "0.1.0"


class FrameFactKind(str, Enum):
    """Frame categories carried into policy evaluation."""

    ACTOR = "actor"
    SURFACE = "surface"
    EVENT = "event"
    METHOD = "method"
    TARGET = "target"
    CONTEXT = "context"
    DEVICE = "device"


class TemporalGuardKind(str, Enum):
    """Temporal and contextual guard shapes used by deontic norms."""

    STATE_FRAME = "state_frame"
    TIME_WINDOW = "time_window"
    EVENT_WINDOW = "event_window"
    EXPIRY = "expiry"
    CONTEXT_FACT = "context_fact"


class DeonticOutcome(str, Enum):
    """Runtime outcomes supported by the control-surface policy layer."""

    ALLOW = "allow"
    DENY = "deny"
    REQUIRE_CONFIRMATION = "require_confirmation"
    DEFER = "defer"
    REWRITE = "rewrite"
    FALLBACK_SURFACE = "fallback_surface"
    RATE_LIMIT = "rate_limit"


def stable_control_surface_id(prefix: str, *parts: Any) -> str:
    """Return a deterministic ID for stable policy and frame references."""

    normalized = "|".join(str(part).strip().lower() for part in parts if part is not None)
    digest = hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}:{digest}"


def _enum_value(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    return value


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if value is None:
        return {}
    if hasattr(value, "as_dict"):
        return value.as_dict()
    if isinstance(value, Mapping):
        return value
    return {}


@dataclass(frozen=True)
class FrameFact:
    """A single frame-logic fact about an attempted control-surface action."""

    fact_id: str
    kind: FrameFactKind | str
    subject: str
    predicate: str
    value: Any = True
    attrs: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def actor(
        cls,
        actor_type: str,
        actor_id: str,
        delegation_chain: list[str] | None = None,
    ) -> "FrameFact":
        subject = f"actor:{actor_id or actor_type or 'unknown'}"
        return cls(
            fact_id=stable_control_surface_id("fact", "actor", actor_type, actor_id),
            kind=FrameFactKind.ACTOR,
            subject=subject,
            predicate="actor.type",
            value=actor_type or "unknown",
            attrs={"actor_id": actor_id or "", "delegation_chain": list(delegation_chain or [])},
        )

    @classmethod
    def surface(cls, surface: str) -> "FrameFact":
        return cls(
            fact_id=stable_control_surface_id("fact", "surface", surface),
            kind=FrameFactKind.SURFACE,
            subject=f"surface:{surface}",
            predicate="surface.id",
            value=surface,
        )

    @classmethod
    def event(cls, surface_event: str, surface: str = "") -> "FrameFact":
        return cls(
            fact_id=stable_control_surface_id("fact", "event", surface, surface_event),
            kind=FrameFactKind.EVENT,
            subject=f"event:{surface_event}",
            predicate="surface_event",
            value=surface_event,
            attrs={"surface": surface},
        )

    @classmethod
    def method(cls, method: str, intent: str = "") -> "FrameFact":
        return cls(
            fact_id=stable_control_surface_id("fact", "method", method, intent),
            kind=FrameFactKind.METHOD,
            subject=f"method:{method}",
            predicate="intent.method",
            value=method,
            attrs={"intent": intent},
        )

    @classmethod
    def target(cls, target_ref: str, method: str = "") -> "FrameFact":
        return cls(
            fact_id=stable_control_surface_id("fact", "target", target_ref, method),
            kind=FrameFactKind.TARGET,
            subject=target_ref or "target:unknown",
            predicate="intent.target_ref",
            value=target_ref,
            attrs={"method": method},
        )

    @classmethod
    def context(cls, name: str, value: Any, *, subject: str = "context") -> "FrameFact":
        return cls(
            fact_id=stable_control_surface_id("fact", "context", subject, name, value),
            kind=FrameFactKind.CONTEXT,
            subject=subject,
            predicate=name,
            value=value,
        )

    @classmethod
    def device(cls, name: str, value: Any) -> "FrameFact":
        return cls(
            fact_id=stable_control_surface_id("fact", "device", name, value),
            kind=FrameFactKind.DEVICE,
            subject="device",
            predicate=name,
            value=value,
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "fact_id": self.fact_id,
            "kind": _enum_value(self.kind),
            "subject": self.subject,
            "predicate": self.predicate,
            "value": self.value,
            "attrs": dict(self.attrs),
        }


@dataclass(frozen=True)
class TemporalGuard:
    """A temporal or contextual activation guard for a deontic norm."""

    guard_id: str
    kind: TemporalGuardKind | str
    predicate: str
    expected: Any = True
    relation: str = "holds"
    start: str = ""
    end: str = ""
    timezone: str = "UTC"
    event_refs: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def state_frame(cls, state: str, *, guard_id: str | None = None) -> "TemporalGuard":
        return cls(
            guard_id=guard_id or stable_control_surface_id("guard", "state_frame", state),
            kind=TemporalGuardKind.STATE_FRAME,
            predicate="state_frame",
            expected=state,
            relation="holds",
        )

    @classmethod
    def time_window(
        cls,
        name: str,
        *,
        start: str,
        end: str,
        timezone: str = "UTC",
        guard_id: str | None = None,
    ) -> "TemporalGuard":
        return cls(
            guard_id=guard_id or stable_control_surface_id("guard", "time_window", name, start, end, timezone),
            kind=TemporalGuardKind.TIME_WINDOW,
            predicate=name,
            expected=True,
            relation="during",
            start=start,
            end=end,
            timezone=timezone,
        )

    @classmethod
    def event_window(
        cls,
        name: str,
        *,
        event_refs: list[str],
        guard_id: str | None = None,
    ) -> "TemporalGuard":
        return cls(
            guard_id=guard_id or stable_control_surface_id("guard", "event_window", name, *event_refs),
            kind=TemporalGuardKind.EVENT_WINDOW,
            predicate=name,
            relation="after_event",
            event_refs=list(event_refs),
        )

    @classmethod
    def context_fact(
        cls,
        predicate: str,
        expected: Any = True,
        *,
        relation: str = "equals",
        guard_id: str | None = None,
    ) -> "TemporalGuard":
        return cls(
            guard_id=guard_id or stable_control_surface_id("guard", "context_fact", predicate, expected),
            kind=TemporalGuardKind.CONTEXT_FACT,
            predicate=predicate,
            expected=expected,
            relation=relation,
        )

    def event_calculus_atoms(self) -> list[str]:
        """Return symbolic event_calculus atoms for guarded adapters.

        These strings are intentionally declarative. Runtime adapters can map
        them to the optional `ipfs_datasets_py.logic.CEC.native.event_calculus`
        helper once concrete context extraction lands.
        """

        atoms: list[str] = []
        kind = _enum_value(self.kind)
        if kind == TemporalGuardKind.STATE_FRAME.value:
            atoms.append(f"holds_at({self.predicate}:{self.expected})")
        elif kind == TemporalGuardKind.TIME_WINDOW.value:
            atoms.append(f"holds_at(time_window:{self.predicate},{self.start},{self.end},{self.timezone})")
        elif kind == TemporalGuardKind.EXPIRY.value:
            atoms.append(f"clipped({self.predicate},{self.end})")
        else:
            atoms.append(f"holds_at({self.predicate}:{self.expected})")

        atoms.extend(f"happens({event_ref})" for event_ref in self.event_refs)
        return atoms

    def as_dict(self) -> dict[str, Any]:
        return {
            "guard_id": self.guard_id,
            "kind": _enum_value(self.kind),
            "predicate": self.predicate,
            "expected": self.expected,
            "relation": self.relation,
            "start": self.start,
            "end": self.end,
            "timezone": self.timezone,
            "event_refs": list(self.event_refs),
            "event_calculus": self.event_calculus_atoms(),
            "metadata": dict(self.metadata),
        }


@dataclass(frozen=True)
class InvocationEffect:
    """Target invocation effect produced by a matched deontic norm."""

    outcome: DeonticOutcome | str
    method: str
    target_ref: str
    arguments: dict[str, Any] = field(default_factory=dict)
    rewrite_method: str = ""
    fallback_surface: str = ""
    confirmation_required: bool = False
    rate_limit_key: str = ""
    reason: str = ""

    @classmethod
    def from_intent(
        cls,
        *,
        outcome: DeonticOutcome | str,
        method: str,
        target_ref: str,
        arguments: dict[str, Any] | None = None,
        reason: str = "",
    ) -> "InvocationEffect":
        return cls(
            outcome=outcome,
            method=method,
            target_ref=target_ref,
            arguments=dict(arguments or {}),
            confirmation_required=_enum_value(outcome) == DeonticOutcome.REQUIRE_CONFIRMATION.value,
            reason=reason,
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "outcome": _enum_value(self.outcome),
            "method": self.method,
            "target_ref": self.target_ref,
            "arguments": dict(self.arguments),
            "rewrite_method": self.rewrite_method,
            "fallback_surface": self.fallback_surface,
            "confirmation_required": self.confirmation_required,
            "rate_limit_key": self.rate_limit_key,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class ControlSurfaceNorm:
    """A deontic norm scoped to actor, surface, event, method, and target."""

    norm_id: str
    outcome: DeonticOutcome | str
    effect: InvocationEffect
    actor: str = "*"
    surface: str = "*"
    surface_event: str = "*"
    method: str = "*"
    target_ref: str = "*"
    guards: list[TemporalGuard] = field(default_factory=list)
    priority: int = 0
    source_text: str = ""
    explanation: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "norm_id": self.norm_id,
            "outcome": _enum_value(self.outcome),
            "actor": self.actor,
            "surface": self.surface,
            "surface_event": self.surface_event,
            "method": self.method,
            "target_ref": self.target_ref,
            "guards": [guard.as_dict() for guard in self.guards],
            "effect": self.effect.as_dict(),
            "priority": self.priority,
            "source_text": self.source_text,
            "explanation": self.explanation,
            "metadata": dict(self.metadata),
        }


@dataclass(frozen=True)
class ControlSurfacePolicy:
    """A policy bundle containing frame facts, temporal guards, and norms."""

    policy_id: str
    facts: list[FrameFact] = field(default_factory=list)
    norms: list[ControlSurfaceNorm] = field(default_factory=list)
    version: str = IR_VERSION
    source_text: str = ""
    compiled_policy_cid: str = ""
    compiled_artifacts: dict[str, Any] = field(default_factory=dict)
    explanations: list[str] = field(default_factory=list)

    def facts_by_kind(self, kind: FrameFactKind | str) -> list[FrameFact]:
        target_kind = _enum_value(kind)
        return [fact for fact in self.facts if _enum_value(fact.kind) == target_kind]

    def norms_by_outcome(self, outcome: DeonticOutcome | str) -> list[ControlSurfaceNorm]:
        target_outcome = _enum_value(outcome)
        return [norm for norm in self.norms if _enum_value(norm.outcome) == target_outcome]

    def ordered_norms(self) -> list[ControlSurfaceNorm]:
        return sorted(self.norms, key=lambda norm: (-norm.priority, norm.norm_id))

    def as_dict(self) -> dict[str, Any]:
        return {
            "policy_id": self.policy_id,
            "version": self.version,
            "source_text": self.source_text,
            "facts": [fact.as_dict() for fact in self.facts],
            "norms": [norm.as_dict() for norm in self.ordered_norms()],
            "compiled_policy_cid": self.compiled_policy_cid,
            "compiled_artifacts": dict(self.compiled_artifacts),
            "explanations": list(self.explanations),
        }


def frame_facts_from_interaction(envelope: Any) -> list[FrameFact]:
    """Build frame facts from a normalized interaction envelope or mapping."""

    payload = _as_mapping(envelope)
    intent = _as_mapping(payload.get("normalized_intent"))
    actor = _as_mapping(payload.get("actor"))
    context = _as_mapping(payload.get("context"))

    surface = str(payload.get("surface") or "")
    surface_event = str(payload.get("surface_event") or "")
    method = str(intent.get("method") or "")
    target_ref = str(intent.get("target_ref") or "")

    facts = [
        FrameFact.actor(
            actor_type=str(actor.get("type") or "user"),
            actor_id=str(actor.get("id") or ""),
            delegation_chain=[str(item) for item in actor.get("delegation_chain", []) or []],
        ),
        FrameFact.surface(surface),
        FrameFact.event(surface_event, surface),
        FrameFact.method(method, str(intent.get("intent") or "")),
        FrameFact.target(target_ref, method),
    ]

    for state_frame in context.get("state_frames", []) or []:
        facts.append(FrameFact.context("state_frame", str(state_frame), subject="context:state_frames"))

    if context.get("local_time"):
        facts.append(FrameFact.context("local_time", str(context.get("local_time"))))
    if context.get("platform"):
        facts.append(FrameFact.context("platform", str(context.get("platform"))))
    if context.get("device_mode"):
        facts.append(FrameFact.device("device_mode", str(context.get("device_mode"))))

    for name, value in _as_mapping(context.get("location_context")).items():
        facts.append(FrameFact.context(f"location.{name}", value, subject="context:location"))
    for name, value in _as_mapping(context.get("device_context")).items():
        facts.append(FrameFact.device(f"device_context.{name}", value))

    return facts


def policy_from_interaction(
    *,
    policy_id: str,
    envelope: Any,
    norms: list[ControlSurfaceNorm] | None = None,
    source_text: str = "",
    compiled_policy_cid: str = "",
    explanations: list[str] | None = None,
) -> ControlSurfacePolicy:
    """Create a ControlSurfacePolicy snapshot for one attempted invocation."""

    return ControlSurfacePolicy(
        policy_id=policy_id,
        facts=frame_facts_from_interaction(envelope),
        norms=list(norms or []),
        source_text=source_text,
        compiled_policy_cid=compiled_policy_cid,
        explanations=list(explanations or []),
    )
