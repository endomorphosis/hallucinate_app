from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from hallucinate_app.control_surface_context import ActorIdentity, RuntimeContext


@dataclass(frozen=True)
class NormalizedIntent:
    """Canonical intent shape emitted before policy evaluation."""

    intent: str
    method: str
    target_ref: str
    arguments: dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0

    @classmethod
    def from_mapping(cls, payload: dict[str, Any] | None) -> "NormalizedIntent":
        data = payload or {}
        return cls(
            intent=str(data.get("intent") or ""),
            method=str(data.get("method") or ""),
            target_ref=str(data.get("target_ref") or ""),
            arguments=dict(data.get("arguments") or {}),
            confidence=float(data.get("confidence") or 0.0),
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "intent": self.intent,
            "method": self.method,
            "target_ref": self.target_ref,
            "arguments": dict(self.arguments),
            "confidence": self.confidence,
        }


@dataclass(frozen=True)
class InteractionEnvelope:
    """Single normalized interaction envelope shared across all control surfaces."""

    interaction_id: str
    surface: str
    surface_event: str
    raw_payload: dict[str, Any]
    normalized_intent: NormalizedIntent
    actor: ActorIdentity
    context: RuntimeContext

    def as_dict(self) -> dict[str, Any]:
        return {
            "interaction_id": self.interaction_id,
            "surface": self.surface,
            "surface_event": self.surface_event,
            "raw_payload": dict(self.raw_payload),
            "normalized_intent": self.normalized_intent.as_dict(),
            "actor": self.actor.as_dict(),
            "context": self.context.as_dict(),
        }


def normalize_interaction(
    *,
    surface: str,
    surface_event: str,
    raw_payload: dict[str, Any] | None = None,
    normalized_intent: dict[str, Any] | NormalizedIntent | None = None,
    actor: dict[str, Any] | ActorIdentity | None = None,
    context: dict[str, Any] | RuntimeContext | None = None,
    interaction_id: str | None = None,
) -> InteractionEnvelope:
    """Build the canonical interaction envelope used before policy evaluation."""

    resolved_payload = dict(raw_payload or {})
    resolved_intent = (
        normalized_intent
        if isinstance(normalized_intent, NormalizedIntent)
        else NormalizedIntent.from_mapping(normalized_intent)
    )
    resolved_actor = actor if isinstance(actor, ActorIdentity) else ActorIdentity.from_mapping(actor)
    resolved_context = context if isinstance(context, RuntimeContext) else RuntimeContext.from_mapping(context)
    resolved_interaction_id = interaction_id or str(resolved_payload.get("interaction_id") or uuid4())

    return InteractionEnvelope(
        interaction_id=resolved_interaction_id,
        surface=str(surface),
        surface_event=str(surface_event),
        raw_payload=resolved_payload,
        normalized_intent=resolved_intent,
        actor=resolved_actor,
        context=resolved_context,
    )