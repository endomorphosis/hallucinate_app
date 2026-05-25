"""Pointer, mouse, and touch control-surface resolver.

This adapter turns UI pointer events into the same canonical interaction
envelope used by voice, gesture, and agent surfaces, then routes that envelope
through the shared control-surface mediator before a target method is invoked.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from hallucinate_app.control_surface_context import ActorIdentity, RuntimeContext
from hallucinate_app.control_surface_intents import InteractionEnvelope, normalize_interaction
from hallucinate_app.control_surface_logic_ir import stable_control_surface_id
from hallucinate_app.control_surface_mediator import (
    DEFAULT_CONFLICT_RESOLUTION,
    ControlSurfaceMediator,
    PolicyDecision,
    evaluate_control_surface_interaction,
)


POINTER_RESOLVER_VERSION = "0.1.0"
DEFAULT_POINTER_SURFACE = "mouse"
POINTER_EVENT_TYPES = ("click", "double_click", "hover", "focus")
POINTER_SOURCE_FIELDS = ("pointer_type", "pointerType", "source_device", "input_type", "device")

_EVENT_FIELD_NAMES = (
    "surface_event",
    "pointer_event",
    "event_type",
    "eventType",
    "type",
)
_TARGET_FIELD_NAMES = (
    "target_ref",
    "targetRef",
    "data-target-ref",
    "element_ref",
    "elementRef",
    "target_id",
    "targetId",
    "id",
)
_METHOD_FIELD_NAMES = ("method", "operation", "action", "command")
_INTENT_FIELD_NAMES = ("intent", "intent_ref", "intentRef")

_POINTER_EVENT_ALIASES = {
    "click": "click",
    "mouse_click": "click",
    "mouse_down": "click",
    "mouse_up": "click",
    "mousedown": "click",
    "mouseup": "click",
    "pointer_down": "click",
    "pointer_up": "click",
    "pointerdown": "click",
    "pointerup": "click",
    "tap": "click",
    "touch": "click",
    "touch_start": "click",
    "touch_end": "click",
    "touchstart": "click",
    "touchend": "click",
    "dblclick": "double_click",
    "doubleclick": "double_click",
    "double_click": "double_click",
    "double_tap": "double_click",
    "mouseenter": "hover",
    "mouseover": "hover",
    "pointer_enter": "hover",
    "pointer_over": "hover",
    "pointerenter": "hover",
    "pointerover": "hover",
    "hover": "hover",
    "focus": "focus",
    "focus_in": "focus",
    "focusin": "focus",
}

_DEFAULT_METHOD_EVENT = {
    "activate": "click",
    "delete": "click",
    "delete_item": "click",
    "destroy": "click",
    "remove": "click",
    "remove_item": "click",
    "send_message": "click",
    "focus_next": "focus",
    "focus_previous": "focus",
    "select": "focus",
}


class PointerResolutionError(ValueError):
    """Raised when a pointer payload cannot be normalized safely."""


@dataclass(frozen=True)
class PointerIntentBinding:
    """Declarative mapping from a pointer event to a default target intent."""

    surface_event: str
    intent: str
    method: str
    target_ref: str = "target:unknown"
    arguments: dict[str, Any] = field(default_factory=dict)
    confidence: float = 1.0

    def matches(self, surface_event: str) -> bool:
        return self.surface_event == surface_event


@dataclass(frozen=True)
class PointerResolution:
    """Pointer normalization plus the shared policy decision."""

    envelope: InteractionEnvelope
    decision: PolicyDecision

    @property
    def can_execute(self) -> bool:
        return self.decision.can_execute

    @property
    def requires_confirmation(self) -> bool:
        return self.decision.requires_confirmation

    def as_dict(self) -> dict[str, Any]:
        return {
            "resolver_version": POINTER_RESOLVER_VERSION,
            "interaction_envelope": self.envelope.as_dict(),
            "policy_decision": self.decision.as_dict(),
            "can_execute": self.can_execute,
            "requires_confirmation": self.requires_confirmation,
        }


DEFAULT_POINTER_BINDINGS: tuple[PointerIntentBinding, ...] = (
    PointerIntentBinding(
        surface_event="click",
        intent="display.activate",
        method="activate",
        arguments={"source": "pointer"},
    ),
    PointerIntentBinding(
        surface_event="double_click",
        intent="display.activate",
        method="activate",
        arguments={"source": "pointer", "click_count": 2},
    ),
    PointerIntentBinding(
        surface_event="hover",
        intent="display.focus_next",
        method="focus_next",
        target_ref="widget:list",
        arguments={"source": "pointer", "focus_reason": "hover"},
        confidence=0.96,
    ),
    PointerIntentBinding(
        surface_event="focus",
        intent="display.focus_next",
        method="focus_next",
        target_ref="widget:list",
        arguments={"source": "pointer", "focus_reason": "focus"},
    ),
)


class PointerIntentResolver:
    """Resolve UI pointer events into mediated control-surface decisions."""

    def __init__(
        self,
        *,
        bindings: tuple[PointerIntentBinding, ...] | list[PointerIntentBinding] | None = None,
        surface: str = DEFAULT_POINTER_SURFACE,
        mediator: ControlSurfaceMediator | None = None,
    ) -> None:
        self.bindings = tuple(bindings or DEFAULT_POINTER_BINDINGS)
        self.surface = surface or DEFAULT_POINTER_SURFACE
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
        """Return a canonical envelope for one pointer interaction."""

        payload = _payload_copy(raw_payload)
        surface_event = _resolve_surface_event(payload)
        binding = _binding_for_event(surface_event, self.bindings)
        pointer_type = _pointer_type(payload)
        target_ref = _target_ref(payload, binding)
        normalized_intent = _normalized_intent(
            payload,
            binding=binding,
            surface_event=surface_event,
            pointer_type=pointer_type,
            target_ref=target_ref,
        )
        resolved_actor = _actor_payload(payload, actor)
        resolved_context = _context_payload(payload, context, pointer_type=pointer_type)
        resolved_surface = _first_text(
            surface,
            payload.get("surface"),
            payload.get("surface_ref"),
            self.surface,
            DEFAULT_POINTER_SURFACE,
        )
        resolved_interaction_id = interaction_id or _interaction_id(payload, resolved_surface, surface_event, target_ref)

        payload.setdefault("surface_event", surface_event)
        payload.setdefault("pointer_type", pointer_type)
        payload.setdefault("target_ref", target_ref)
        payload.setdefault("resolver", "pointer_mapping_table")

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
    ) -> PointerResolution:
        """Normalize and evaluate a pointer event through the shared mediator."""

        envelope = self.normalize(
            raw_payload,
            actor=actor,
            context=context,
            interaction_id=interaction_id,
            surface=surface,
        )
        if self.mediator is not None:
            decision = self.mediator.evaluate(
                envelope,
                active_policy_bundles=active_policy_bundles,
                conflict_resolution=conflict_resolution,
                decided_at=decided_at,
            )
        else:
            decision = evaluate_control_surface_interaction(
                envelope,
                active_policy_bundles=active_policy_bundles,
                conflict_resolution=conflict_resolution,
                decided_at=decided_at,
            )
        return PointerResolution(envelope=envelope, decision=decision)


def normalize_pointer_interaction(
    raw_payload: Mapping[str, Any] | None,
    *,
    actor: Mapping[str, Any] | ActorIdentity | None = None,
    context: Mapping[str, Any] | RuntimeContext | None = None,
    interaction_id: str | None = None,
    surface: str = DEFAULT_POINTER_SURFACE,
    bindings: tuple[PointerIntentBinding, ...] | list[PointerIntentBinding] | None = None,
) -> InteractionEnvelope:
    """Normalize a mouse, touch, or pointer event into the canonical envelope."""

    return PointerIntentResolver(bindings=bindings, surface=surface).normalize(
        raw_payload,
        actor=actor,
        context=context,
        interaction_id=interaction_id,
    )


def resolve_pointer_interaction(
    raw_payload: Mapping[str, Any] | None,
    *,
    actor: Mapping[str, Any] | ActorIdentity | None = None,
    context: Mapping[str, Any] | RuntimeContext | None = None,
    active_policy_bundles: list[Any] | tuple[Any, ...] | None = None,
    conflict_resolution: str = DEFAULT_CONFLICT_RESOLUTION,
    decided_at: str | None = None,
    interaction_id: str | None = None,
    surface: str = DEFAULT_POINTER_SURFACE,
    bindings: tuple[PointerIntentBinding, ...] | list[PointerIntentBinding] | None = None,
    mediator: ControlSurfaceMediator | None = None,
) -> PointerResolution:
    """Normalize a pointer event and return its shared policy decision."""

    return PointerIntentResolver(
        bindings=bindings,
        surface=surface,
        mediator=mediator,
    ).resolve(
        raw_payload,
        actor=actor,
        context=context,
        active_policy_bundles=active_policy_bundles,
        conflict_resolution=conflict_resolution,
        decided_at=decided_at,
        interaction_id=interaction_id,
    )


def _payload_copy(raw_payload: Mapping[str, Any] | None) -> dict[str, Any]:
    payload = dict(raw_payload or {})
    for key in ("dataset", "target", "dom_target", "element", "normalized_intent"):
        if isinstance(payload.get(key), Mapping):
            payload[key] = dict(payload[key])
    return payload


def _resolve_surface_event(payload: Mapping[str, Any]) -> str:
    raw_event = _first_top_level_text(payload, _EVENT_FIELD_NAMES)
    if not raw_event:
        explicit = _mapping(payload.get("normalized_intent"))
        raw_method = _first_text(
            _first_payload_text(payload, _METHOD_FIELD_NAMES),
            explicit.get("method"),
        )
        raw_event = _DEFAULT_METHOD_EVENT.get(_normalize_token(raw_method), "")
    if not raw_event:
        raw_event = "click"

    normalized = _POINTER_EVENT_ALIASES.get(_normalize_token(raw_event), _normalize_token(raw_event))
    if normalized not in POINTER_EVENT_TYPES:
        raise PointerResolutionError(f"Unsupported pointer event {raw_event!r}.")
    return normalized


def _binding_for_event(
    surface_event: str,
    bindings: tuple[PointerIntentBinding, ...],
) -> PointerIntentBinding:
    for binding in bindings:
        if binding.matches(surface_event):
            return binding
    raise PointerResolutionError(f"No pointer intent binding for {surface_event!r}.")


def _normalized_intent(
    payload: Mapping[str, Any],
    *,
    binding: PointerIntentBinding,
    surface_event: str,
    pointer_type: str,
    target_ref: str,
) -> dict[str, Any]:
    explicit = payload.get("normalized_intent")
    explicit_payload = dict(explicit) if isinstance(explicit, Mapping) else {}
    method = _first_text(
        explicit_payload.get("method"),
        _first_payload_text(payload, _METHOD_FIELD_NAMES),
        binding.method,
    )
    intent = _first_text(
        explicit_payload.get("intent"),
        _first_payload_text(payload, _INTENT_FIELD_NAMES),
        _intent_for_method(method),
        binding.intent,
    )
    arguments = dict(binding.arguments)
    arguments.update(dict(_mapping(explicit_payload.get("arguments"))))
    arguments.update(dict(_mapping(payload.get("arguments"))))
    arguments.setdefault("source", "pointer")
    arguments.setdefault("surface_event", surface_event)
    arguments.setdefault("pointer_type", pointer_type)
    _copy_argument_if_present(arguments, payload, "button")
    _copy_argument_if_present(arguments, payload, "buttons")
    _copy_argument_if_present(arguments, payload, "click_count")
    _copy_argument_if_present(arguments, payload, "client_x")
    _copy_argument_if_present(arguments, payload, "client_y")
    _copy_argument_if_present(arguments, payload, "screen_x")
    _copy_argument_if_present(arguments, payload, "screen_y")
    _copy_argument_if_present(arguments, payload, "risk_class")

    return {
        "intent": intent,
        "method": method,
        "target_ref": _first_text(explicit_payload.get("target_ref"), target_ref),
        "arguments": arguments,
        "confidence": _confidence(
            explicit_payload.get("confidence"),
            payload.get("confidence"),
            binding.confidence,
        ),
    }


def _target_ref(payload: Mapping[str, Any], binding: PointerIntentBinding) -> str:
    explicit = payload.get("normalized_intent")
    if isinstance(explicit, Mapping):
        target_ref = explicit.get("target_ref")
        if target_ref:
            return _normalize_target_ref(target_ref)

    target_ref = _first_payload_text(payload, _TARGET_FIELD_NAMES)
    if target_ref:
        return _normalize_target_ref(target_ref)

    for nested_key in ("dataset", "target", "dom_target", "element"):
        nested = payload.get(nested_key)
        if isinstance(nested, Mapping):
            target_ref = _first_payload_text(nested, _TARGET_FIELD_NAMES)
            if target_ref:
                return _normalize_target_ref(target_ref)

    return binding.target_ref or "target:unknown"


def _pointer_type(payload: Mapping[str, Any]) -> str:
    value = _first_payload_text(payload, POINTER_SOURCE_FIELDS)
    if value:
        return _normalize_token(value)

    event = _first_top_level_text(payload, _EVENT_FIELD_NAMES)
    normalized_event = _normalize_token(event)
    if normalized_event.startswith("touch"):
        return "touch"
    if normalized_event.startswith("mouse") or normalized_event in {"click", "dblclick", "double_click"}:
        return "mouse"
    return "pointer"


def _actor_payload(
    payload: Mapping[str, Any],
    actor: Mapping[str, Any] | ActorIdentity | None,
) -> Mapping[str, Any] | ActorIdentity:
    if actor is not None:
        return actor
    embedded = payload.get("actor")
    if isinstance(embedded, Mapping):
        return embedded

    actor_id = _first_text(payload.get("actor_id"), payload.get("user_id"), payload.get("operator_id"))
    delegation_chain = [actor_id] if actor_id else []
    return {"type": "user", "id": actor_id, "delegation_chain": delegation_chain}


def _context_payload(
    payload: Mapping[str, Any],
    context: Mapping[str, Any] | RuntimeContext | None,
    *,
    pointer_type: str,
) -> Mapping[str, Any] | RuntimeContext:
    if isinstance(context, RuntimeContext):
        return context

    resolved = dict(_mapping(context))
    embedded = payload.get("context")
    if isinstance(embedded, Mapping):
        resolved = {**dict(embedded), **resolved}

    device_context = dict(_mapping(resolved.get("device_context")))
    device_context.setdefault("input_surface", "pointer")
    device_context.setdefault("pointer_type", pointer_type)
    for key in ("viewport", "screen", "device_pixel_ratio", "component", "surface_ref"):
        if key in payload:
            device_context.setdefault(key, payload[key])

    resolved.setdefault("local_time", _first_text(payload.get("local_time"), payload.get("timestamp")))
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
    target_ref: str,
) -> str:
    supplied = _first_text(payload.get("interaction_id"), payload.get("event_id"), payload.get("idempotency_key"))
    if supplied:
        return supplied
    return stable_control_surface_id(
        "pointer",
        surface,
        surface_event,
        target_ref,
        payload.get("timestamp") or payload.get("local_time") or "",
    )


def _intent_for_method(method: str) -> str:
    normalized = _normalize_token(method)
    if normalized in {"focus_next", "focus_previous", "select"}:
        return f"display.{normalized}"
    if normalized in {"activate", "preview_activate"}:
        return "display.activate"
    if normalized == "send_message":
        return "communication.send"
    if any(token in normalized for token in ("delete", "destroy", "remove")):
        return f"destructive.{normalized}"
    return f"pointer.{normalized}" if normalized else ""


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
    for nested_key in ("dataset", "target", "dom_target", "element"):
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
    if isinstance(value, (str, bytes)):
        return [str(value)]
    return [str(item) for item in value]


def _normalize_token(value: Any) -> str:
    return str(value or "").strip().casefold().replace("-", "_").replace(" ", "_")
