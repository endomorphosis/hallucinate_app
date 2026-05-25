"""Gesture and wearable control-surface resolver.

This adapter turns captouch and wearable gesture events into the same canonical
interaction envelope used by voice, mouse, and agent surfaces, then routes that
envelope through the shared control-surface mediator before invocation.
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


GESTURE_RESOLVER_VERSION = "0.1.0"
DEFAULT_GESTURE_SURFACE = "gesture"
GESTURE_EVENT_TYPES = ("tap", "swipe", "hold", "wrist_raise")
WEARABLE_SOURCE_FIELDS = (
    "wearable_type",
    "wearable",
    "device_kind",
    "device_type",
    "source_device",
    "input_type",
    "sensor",
    "device",
)

_EVENT_FIELD_NAMES = (
    "surface_event",
    "gesture_event",
    "gesture",
    "event_type",
    "eventType",
    "type",
    "name",
)
_TARGET_FIELD_NAMES = (
    "target_ref",
    "targetRef",
    "element_ref",
    "elementRef",
    "target_id",
    "targetId",
    "id",
)
_METHOD_FIELD_NAMES = ("method", "operation", "action", "command")
_INTENT_FIELD_NAMES = ("intent", "intent_ref", "intentRef")
_DIRECTION_FIELD_NAMES = ("direction", "swipe_direction", "swipeDirection", "axis")

_GESTURE_EVENT_ALIASES = {
    "tap": "tap",
    "single_tap": "tap",
    "singletap": "tap",
    "double_tap": "tap",
    "doubletap": "tap",
    "touch": "tap",
    "press": "tap",
    "captouch_tap": "tap",
    "swipe": "swipe",
    "swipe_left": "swipe",
    "swipe_right": "swipe",
    "swipe_up": "swipe",
    "swipe_down": "swipe",
    "swipeleft": "swipe",
    "swiperight": "swipe",
    "swipeup": "swipe",
    "swipedown": "swipe",
    "left_swipe": "swipe",
    "right_swipe": "swipe",
    "up_swipe": "swipe",
    "down_swipe": "swipe",
    "hold": "hold",
    "long_press": "hold",
    "longpress": "hold",
    "press_and_hold": "hold",
    "pressandhold": "hold",
    "touch_hold": "hold",
    "dwell": "hold",
    "wrist_raise": "wrist_raise",
    "wrist_raised": "wrist_raise",
    "wristraise": "wrist_raise",
    "wristraised": "wrist_raise",
    "raise_wrist": "wrist_raise",
    "raise_to_wake": "wrist_raise",
    "raisetowake": "wrist_raise",
    "wrist_up": "wrist_raise",
    "watch_raise": "wrist_raise",
    "tilt_to_wake": "wrist_raise",
    "wearable_wrist_raise": "wrist_raise",
    "motion_wrist_raise": "wrist_raise",
}

_DEFAULT_METHOD_EVENT = {
    "activate": "tap",
    "preview_activate": "hold",
    "select": "tap",
    "focus_next": "swipe",
    "focus_previous": "swipe",
}

_BOOLEAN_EVENT_FIELDS = (
    ("wrist_raise", "wrist_raise"),
    ("wristRaised", "wrist_raise"),
    ("raise_to_wake", "wrist_raise"),
    ("tap", "tap"),
    ("swipe", "swipe"),
    ("hold", "hold"),
)

_DEVICE_CONTEXT_FIELDS = (
    "device_id",
    "deviceId",
    "wearable",
    "device",
    "device_kind",
    "input_type",
    "sensor",
    "sensor_id",
    "sensorId",
    "confidence",
    "wearable_type",
    "device_type",
    "source_device",
    "sleeping",
    "asleep",
    "activity",
    "motion",
    "status",
    "focus",
    "quiet_hours",
)


class GestureResolutionError(ValueError):
    """Raised when a gesture payload cannot be normalized safely."""


@dataclass(frozen=True)
class GestureIntentBinding:
    """Declarative mapping from a gesture event to a default target intent."""

    surface_event: str
    intent: str
    method: str
    target_ref: str = "target:unknown"
    arguments: dict[str, Any] = field(default_factory=dict)
    confidence: float = 1.0

    def matches(self, surface_event: str) -> bool:
        return self.surface_event == surface_event


@dataclass(frozen=True)
class GestureResolution:
    """Gesture normalization plus the shared policy decision."""

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
            "resolver_version": GESTURE_RESOLVER_VERSION,
            "interaction_envelope": self.envelope.as_dict(),
            "policy_decision": self.decision.as_dict(),
            "can_execute": self.can_execute,
            "requires_confirmation": self.requires_confirmation,
        }


DEFAULT_GESTURE_BINDINGS: tuple[GestureIntentBinding, ...] = (
    GestureIntentBinding(
        surface_event="tap",
        intent="display.activate",
        method="activate",
        target_ref="widget:primary-action",
        arguments={"source": "gesture"},
    ),
    GestureIntentBinding(
        surface_event="swipe",
        intent="display.focus_next",
        method="focus_next",
        target_ref="widget:list",
        arguments={"source": "gesture", "focus_reason": "swipe"},
        confidence=0.96,
    ),
    GestureIntentBinding(
        surface_event="hold",
        intent="display.activate",
        method="activate",
        target_ref="widget:primary-action",
        arguments={"source": "gesture", "activation_mode": "hold"},
        confidence=0.98,
    ),
    GestureIntentBinding(
        surface_event="wrist_raise",
        intent="display.activate",
        method="activate",
        target_ref="widget:primary-action",
        arguments={"source": "gesture", "wearable_event": "wrist_raise"},
        confidence=0.91,
    ),
)


class GestureIntentResolver:
    """Resolve captouch and wearable gestures into mediated decisions."""

    def __init__(
        self,
        *,
        bindings: tuple[GestureIntentBinding, ...] | list[GestureIntentBinding] | None = None,
        surface: str = DEFAULT_GESTURE_SURFACE,
        mediator: ControlSurfaceMediator | None = None,
    ) -> None:
        self.bindings = tuple(bindings or DEFAULT_GESTURE_BINDINGS)
        self.surface = surface or DEFAULT_GESTURE_SURFACE
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
        """Return a canonical envelope for one gesture or wearable event."""

        payload = _payload_copy(raw_payload)
        surface_event = _resolve_surface_event(payload)
        binding = _binding_for_event(surface_event, self.bindings)
        gesture_source = _gesture_source(payload, surface_event)
        direction = _gesture_direction(payload)
        target_ref = _target_ref(payload, binding)
        normalized_intent = _normalized_intent(
            payload,
            binding=binding,
            surface_event=surface_event,
            gesture_source=gesture_source,
            direction=direction,
            target_ref=target_ref,
        )
        resolved_actor = _actor_payload(payload, actor)
        resolved_context = _context_payload(
            payload,
            context,
            surface_event=surface_event,
            gesture_source=gesture_source,
        )
        resolved_surface = _first_text(
            surface,
            payload.get("surface"),
            payload.get("surface_ref"),
            self.surface,
            DEFAULT_GESTURE_SURFACE,
        )
        resolved_interaction_id = (
            interaction_id
            or _interaction_id(payload, resolved_surface, surface_event, target_ref)
        )

        payload.setdefault("surface_event", surface_event)
        payload.setdefault("gesture", surface_event)
        payload.setdefault("gesture_source", gesture_source)
        if direction:
            payload.setdefault("direction", direction)
        payload.setdefault("resolver", "gesture_mapping_table")

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
    ) -> GestureResolution:
        """Normalize and evaluate a gesture through the shared mediator."""

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
        return GestureResolution(envelope=envelope, decision=decision)


def normalize_gesture_interaction(
    raw_payload: Mapping[str, Any] | None,
    *,
    actor: Mapping[str, Any] | ActorIdentity | None = None,
    context: Mapping[str, Any] | RuntimeContext | None = None,
    interaction_id: str | None = None,
    surface: str = DEFAULT_GESTURE_SURFACE,
    bindings: tuple[GestureIntentBinding, ...] | list[GestureIntentBinding] | None = None,
) -> InteractionEnvelope:
    """Normalize a tap, swipe, hold, or wrist_raise into the canonical envelope."""

    return GestureIntentResolver(bindings=bindings, surface=surface).normalize(
        raw_payload,
        actor=actor,
        context=context,
        interaction_id=interaction_id,
    )


def resolve_gesture_interaction(
    raw_payload: Mapping[str, Any] | None,
    *,
    actor: Mapping[str, Any] | ActorIdentity | None = None,
    context: Mapping[str, Any] | RuntimeContext | None = None,
    active_policy_bundles: list[Any] | tuple[Any, ...] | None = None,
    conflict_resolution: str = DEFAULT_CONFLICT_RESOLUTION,
    decided_at: str | None = None,
    interaction_id: str | None = None,
    surface: str = DEFAULT_GESTURE_SURFACE,
    bindings: tuple[GestureIntentBinding, ...] | list[GestureIntentBinding] | None = None,
    mediator: ControlSurfaceMediator | None = None,
) -> GestureResolution:
    """Normalize a gesture event and return its shared policy decision."""

    return GestureIntentResolver(
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
    for key in (
        "dataset",
        "target",
        "wearable",
        "device",
        "sensor_context",
        "gesture",
        "normalized_intent",
        "context",
        "actor",
    ):
        if isinstance(payload.get(key), Mapping):
            payload[key] = dict(payload[key])
    return payload


def _resolve_surface_event(payload: Mapping[str, Any]) -> str:
    raw_event = _first_payload_text(payload, _EVENT_FIELD_NAMES)
    if not raw_event:
        raw_event = _boolean_surface_event(payload)
    if not raw_event:
        explicit = _mapping(payload.get("normalized_intent"))
        raw_method = _first_text(
            _first_payload_text(payload, _METHOD_FIELD_NAMES),
            explicit.get("method"),
        )
        raw_event = _DEFAULT_METHOD_EVENT.get(_normalize_token(raw_method), "")
    if not raw_event:
        raw_event = "tap"

    token = _normalize_token(raw_event)
    normalized = _GESTURE_EVENT_ALIASES.get(token, token)
    if normalized not in GESTURE_EVENT_TYPES:
        raise GestureResolutionError(f"Unsupported gesture event {raw_event!r}.")
    return normalized


def _binding_for_event(
    surface_event: str,
    bindings: tuple[GestureIntentBinding, ...],
) -> GestureIntentBinding:
    for binding in bindings:
        if binding.matches(surface_event):
            return binding
    raise GestureResolutionError(f"No gesture intent binding for {surface_event!r}.")


def _normalized_intent(
    payload: Mapping[str, Any],
    *,
    binding: GestureIntentBinding,
    surface_event: str,
    gesture_source: str,
    direction: str,
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
    arguments.setdefault("source", "gesture")
    arguments.setdefault("surface_event", surface_event)
    arguments.setdefault("gesture_source", gesture_source)
    if direction:
        arguments.setdefault("direction", direction)
    for key in (
        "duration_ms",
        "duration",
        "force",
        "hand",
        "sensor",
        "device_id",
        "risk_class",
    ):
        _copy_argument_if_present(arguments, payload, key)

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


def _target_ref(payload: Mapping[str, Any], binding: GestureIntentBinding) -> str:
    explicit = payload.get("normalized_intent")
    if isinstance(explicit, Mapping):
        target_ref = explicit.get("target_ref")
        if target_ref:
            return _normalize_target_ref(target_ref)

    target_ref = _first_payload_text(payload, _TARGET_FIELD_NAMES)
    if target_ref:
        return _normalize_target_ref(target_ref)

    for nested_key in ("dataset", "target", "wearable", "device"):
        nested = payload.get(nested_key)
        if isinstance(nested, Mapping):
            target_ref = _first_payload_text(nested, _TARGET_FIELD_NAMES)
            if target_ref:
                return _normalize_target_ref(target_ref)

    return binding.target_ref or "target:unknown"


def _gesture_source(payload: Mapping[str, Any], surface_event: str) -> str:
    value = _first_payload_text(payload, WEARABLE_SOURCE_FIELDS)
    if value:
        return _normalize_token(value)

    for nested_key in ("wearable", "device", "sensor_context"):
        nested = payload.get(nested_key)
        if isinstance(nested, Mapping):
            value = _first_payload_text(nested, WEARABLE_SOURCE_FIELDS)
            if value:
                return _normalize_token(value)

    if surface_event == "wrist_raise":
        return "wearable"
    return "captouch"


def _gesture_direction(payload: Mapping[str, Any]) -> str:
    direction = _first_payload_text(payload, _DIRECTION_FIELD_NAMES)
    if direction:
        return _normalize_token(direction)

    token = _normalize_token(_first_payload_text(payload, _EVENT_FIELD_NAMES))
    for candidate in ("left", "right", "up", "down", "next", "previous", "forward", "back"):
        if candidate in token:
            return candidate
    return ""


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
    surface_event: str,
    gesture_source: str,
) -> Mapping[str, Any] | RuntimeContext:
    if isinstance(context, RuntimeContext):
        return context

    resolved = dict(_mapping(context))
    embedded = payload.get("context")
    if isinstance(embedded, Mapping):
        resolved = {**dict(embedded), **resolved}

    device_context = dict(_mapping(resolved.get("device_context")))
    device_context.setdefault("input_surface", "gesture")
    device_context.setdefault("gesture_event", surface_event)
    device_context.setdefault("gesture_source", gesture_source)
    for key in _DEVICE_CONTEXT_FIELDS:
        if key in payload:
            device_context.setdefault(_normalize_device_context_key(key), payload[key])
    for nested_key in ("wearable", "device", "sensor_context"):
        nested = payload.get(nested_key)
        if isinstance(nested, Mapping):
            device_context.setdefault(nested_key, dict(nested))
            for key in _DEVICE_CONTEXT_FIELDS:
                if key in nested:
                    device_context.setdefault(_normalize_device_context_key(key), nested[key])

    if not resolved.get("local_time"):
        resolved["local_time"] = _first_text(
            payload.get("local_time"),
            payload.get("timestamp"),
            payload.get("observed_at"),
            payload.get("created_at"),
        )
    if "state_frames" not in resolved or not resolved.get("state_frames"):
        resolved["state_frames"] = _derived_state_frames(payload)
    else:
        resolved["state_frames"] = _string_list(resolved.get("state_frames"))
    device_mode = _first_text(payload.get("device_mode"), payload.get("mode"))
    if not device_mode and _truthy(payload.get("quiet_hours")):
        device_mode = "quiet_hours"
    if not device_mode and (_truthy(payload.get("sleeping")) or _truthy(payload.get("asleep"))):
        device_mode = "sleeping"
    if not resolved.get("device_mode"):
        resolved["device_mode"] = device_mode
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
        "gesture",
        surface,
        surface_event,
        target_ref,
        payload.get("timestamp") or payload.get("local_time") or "",
        payload.get("device_id") or "",
    )


def _boolean_surface_event(payload: Mapping[str, Any]) -> str:
    for key, surface_event in _BOOLEAN_EVENT_FIELDS:
        if _truthy(payload.get(key)):
            return surface_event
    return ""


def _derived_state_frames(payload: Mapping[str, Any]) -> list[str]:
    frames = _string_list(payload.get("state_frames", []) or [])
    if _truthy(payload.get("sleeping")) or _truthy(payload.get("asleep")):
        _append_unique(frames, "sleeping")
    return frames


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
    return f"gesture.{normalized}" if normalized else ""


def _normalize_target_ref(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return "target:unknown"
    if ":" in text:
        return text
    return f"target:{text}"


def _normalize_device_context_key(key: str) -> str:
    if key == "deviceId":
        return "device_id"
    if key == "sensorId":
        return "sensor_id"
    return _normalize_token(key)


def _copy_argument_if_present(arguments: dict[str, Any], payload: Mapping[str, Any], key: str) -> None:
    if key in payload and key not in arguments:
        arguments[key] = payload[key]


def _first_payload_text(payload: Mapping[str, Any], keys: tuple[str, ...]) -> str:
    value = _first_top_level_text(payload, keys)
    if value:
        return value
    for nested_key in ("dataset", "target", "wearable", "device", "sensor_context", "gesture"):
        nested = payload.get(nested_key)
        if isinstance(nested, Mapping):
            value = _first_top_level_text(nested, keys)
            if value:
                return value
    return ""


def _first_top_level_text(payload: Mapping[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, Mapping):
            continue
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
    if value in (None, ""):
        return []
    if isinstance(value, (str, bytes)):
        return [str(value)]
    try:
        return [str(item) for item in value]
    except TypeError:
        return [str(value)]


def _append_unique(values: list[str], value: str) -> None:
    if value and value not in values:
        values.append(value)


def _truthy(value: Any) -> bool:
    if isinstance(value, str):
        return _normalize_token(value) in {"1", "true", "yes", "on", "sleeping", "asleep"}
    return bool(value)


def _normalize_token(value: Any) -> str:
    return str(value or "").strip().casefold().replace("-", "_").replace(" ", "_")
