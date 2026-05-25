"""Voice command control-surface resolver.

This adapter turns speech recognizer and voice-command payloads into the same
canonical interaction envelope used by gesture, pointer, and agent surfaces,
then routes the envelope through the shared control-surface mediator before a
target method can be invoked. Voice adds one extra gate: low-confidence
utterances become mediator-evaluated clarification decisions instead of ad hoc
adapter-side allows.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any, Mapping

from hallucinate_app.control_surface_context import ActorIdentity, RuntimeContext
from hallucinate_app.control_surface_intents import InteractionEnvelope, normalize_interaction
from hallucinate_app.control_surface_logic_ir import (
    ControlSurfaceNorm,
    ControlSurfacePolicy,
    DeonticOutcome,
    InvocationEffect,
    stable_control_surface_id,
)
from hallucinate_app.control_surface_mediator import (
    DEFAULT_CONFLICT_RESOLUTION,
    ControlSurfaceMediator,
    PolicyDecision,
    evaluate_control_surface_interaction,
)


VOICE_RESOLVER_VERSION = "0.1.0"
DEFAULT_VOICE_SURFACE = "voice"
VOICE_EVENT_TYPES = ("utterance", "confirm", "cancel")
DEFAULT_MIN_CONFIDENCE = 0.85
DEFAULT_CLARIFY_BELOW = 0.92

WAKE_WORDS = (
    "hey hallucinate",
    "ok hallucinate",
    "okay hallucinate",
    "hallucinate",
)
CONFIRM_UTTERANCES = (
    "yes",
    "yeah",
    "yep",
    "confirm",
    "confirmed",
    "approve",
    "approve it",
    "go ahead",
    "do it",
)
CANCEL_UTTERANCES = (
    "no",
    "nope",
    "cancel",
    "cancel it",
    "stop",
    "never mind",
    "nevermind",
    "abort",
)

_EVENT_FIELD_NAMES = (
    "surface_event",
    "voice_event",
    "event_type",
    "eventType",
    "type",
)
_UTTERANCE_FIELD_NAMES = (
    "utterance",
    "text",
    "transcript",
    "speech",
    "command",
    "recognized_text",
)
_TARGET_FIELD_NAMES = (
    "target_ref",
    "targetRef",
    "target_id",
    "targetId",
    "entity_ref",
    "entityRef",
    "id",
)
_METHOD_FIELD_NAMES = ("method", "operation", "action", "intent_method", "tool", "tool_name")
_INTENT_FIELD_NAMES = ("intent", "intent_ref", "intentRef")
_CONFIDENCE_FIELD_NAMES = (
    "confidence",
    "intent_confidence",
    "intentConfidence",
    "nlu_confidence",
    "nluConfidence",
    "asr_confidence",
    "asrConfidence",
    "transcript_confidence",
    "transcriptConfidence",
    "score",
)
_VOICE_CONTEXT_FIELDS = (
    "locale",
    "language",
    "microphone_id",
    "microphoneId",
    "audio_device_id",
    "audioDeviceId",
    "asr_model",
    "asrModel",
    "wake_word",
    "wakeWord",
    "wake_detected",
    "wakeDetected",
    "confidence",
    "asr_confidence",
    "nlu_confidence",
    "confirmation_id",
    "confirmationId",
)
_VOICE_EVENT_ALIASES = {
    "utterance": "utterance",
    "voice": "utterance",
    "voice_command": "utterance",
    "command": "utterance",
    "speech": "utterance",
    "transcript": "utterance",
    "wake": "utterance",
    "wake_word": "utterance",
    "wakeword": "utterance",
    "confirm": "confirm",
    "confirmation": "confirm",
    "confirmed": "confirm",
    "approve": "confirm",
    "cancel": "cancel",
    "cancellation": "cancel",
    "abort": "cancel",
}


class VoiceResolutionError(ValueError):
    """Raised when a voice payload cannot be normalized safely."""


@dataclass(frozen=True)
class VoiceConfidencePolicy:
    """Confidence thresholds for safe voice-command execution."""

    min_confidence: float = DEFAULT_MIN_CONFIDENCE
    clarify_below: float = DEFAULT_CLARIFY_BELOW

    @classmethod
    def from_mapping(
        cls,
        payload: Mapping[str, Any] | None,
        *,
        default: "VoiceConfidencePolicy | None" = None,
    ) -> "VoiceConfidencePolicy":
        base = default or cls()
        data = _mapping(payload)
        min_confidence = _bounded_float(data.get("min_confidence"), base.min_confidence)
        clarify_below = _bounded_float(data.get("clarify_below"), base.clarify_below)
        if clarify_below < min_confidence:
            clarify_below = min_confidence
        return cls(min_confidence=min_confidence, clarify_below=clarify_below)

    def outcome_for(self, confidence: float) -> str:
        if confidence < self.min_confidence:
            return DeonticOutcome.DENY.value
        if confidence < self.clarify_below:
            return DeonticOutcome.DEFER.value
        return ""

    def requires_clarification(self, confidence: float) -> bool:
        return bool(self.outcome_for(confidence))

    def as_dict(self) -> dict[str, float]:
        return {
            "min_confidence": self.min_confidence,
            "clarify_below": self.clarify_below,
        }


@dataclass(frozen=True)
class VoiceIntentBinding:
    """Declarative mapping from a spoken command to a canonical intent."""

    surface_event: str
    intent: str
    method: str
    target_ref: str = "target:unknown"
    phrases: tuple[str, ...] = ()
    arguments: dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.96

    def match_score(self, surface_event: str, utterance: str) -> int:
        if self.surface_event != surface_event:
            return -1
        if not self.phrases and surface_event in {"confirm", "cancel"}:
            return 1

        spoken = _normalize_spoken(utterance)
        if not spoken:
            return -1
        best = -1
        for phrase in self.phrases:
            normalized_phrase = _normalize_spoken(phrase)
            if not normalized_phrase:
                continue
            if spoken == normalized_phrase:
                best = max(best, 100 + len(normalized_phrase))
            elif spoken.startswith(f"{normalized_phrase} "):
                best = max(best, 80 + len(normalized_phrase))
            elif f" {normalized_phrase} " in f" {spoken} ":
                best = max(best, 60 + len(normalized_phrase))
        return best


@dataclass(frozen=True)
class VoiceClarificationRequest:
    """Clarification metadata emitted when voice confidence is not sufficient."""

    utterance: str
    confidence: float
    min_confidence: float
    clarify_below: float
    outcome: str
    reason: str
    prompt: str
    candidates: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "utterance": self.utterance,
            "confidence": self.confidence,
            "min_confidence": self.min_confidence,
            "clarify_below": self.clarify_below,
            "outcome": self.outcome,
            "reason": self.reason,
            "prompt": self.prompt,
            "candidates": list(self.candidates),
        }


@dataclass(frozen=True)
class VoiceResolution:
    """Voice normalization plus the shared policy decision."""

    envelope: InteractionEnvelope
    decision: PolicyDecision
    confidence_policy: VoiceConfidencePolicy
    clarification: VoiceClarificationRequest | None = None

    @property
    def can_execute(self) -> bool:
        return self.decision.can_execute and self.clarification is None

    @property
    def requires_confirmation(self) -> bool:
        return self.decision.requires_confirmation

    @property
    def clarification_requested(self) -> bool:
        return self.clarification is not None

    def as_dict(self) -> dict[str, Any]:
        return {
            "resolver_version": VOICE_RESOLVER_VERSION,
            "interaction_envelope": self.envelope.as_dict(),
            "policy_decision": self.decision.as_dict(),
            "confidence_policy": self.confidence_policy.as_dict(),
            "clarification_requested": self.clarification_requested,
            "clarification": self.clarification.as_dict() if self.clarification else None,
            "can_execute": self.can_execute,
            "requires_confirmation": self.requires_confirmation,
        }


DEFAULT_VOICE_BINDINGS: tuple[VoiceIntentBinding, ...] = (
    VoiceIntentBinding(
        surface_event="utterance",
        intent="control.wake",
        method="wake",
        target_ref="voice:wake",
        phrases=WAKE_WORDS + ("wake", "wake up"),
        arguments={"source": "voice", "wake": True},
        confidence=0.98,
    ),
    VoiceIntentBinding(
        surface_event="utterance",
        intent="display.activate",
        method="activate",
        target_ref="widget:primary-action",
        phrases=(
            "activate",
            "activate primary",
            "activate the primary widget",
            "open",
            "open primary",
            "select",
            "select primary",
            "click primary",
            "launch",
        ),
        arguments={"source": "voice"},
        confidence=0.95,
    ),
    VoiceIntentBinding(
        surface_event="utterance",
        intent="display.focus_next",
        method="focus_next",
        target_ref="widget:list",
        phrases=(
            "next",
            "focus next",
            "move next",
            "go next",
            "next item",
            "focus the next item",
        ),
        arguments={"source": "voice", "focus_reason": "voice_next"},
        confidence=0.96,
    ),
    VoiceIntentBinding(
        surface_event="utterance",
        intent="display.focus_previous",
        method="focus_previous",
        target_ref="widget:list",
        phrases=(
            "previous",
            "focus previous",
            "move previous",
            "go back",
            "previous item",
            "focus the previous item",
        ),
        arguments={"source": "voice", "focus_reason": "voice_previous"},
        confidence=0.96,
    ),
    VoiceIntentBinding(
        surface_event="utterance",
        intent="communication.send",
        method="send_message",
        target_ref="service:messaging",
        phrases=(
            "send message",
            "send a message",
            "send the message",
            "send it",
            "send",
            "message",
        ),
        arguments={"source": "voice"},
        confidence=0.94,
    ),
    VoiceIntentBinding(
        surface_event="confirm",
        intent="control.confirm",
        method="confirm_pending",
        target_ref="confirmation:pending",
        phrases=CONFIRM_UTTERANCES,
        arguments={"source": "voice", "confirmation": True},
        confidence=0.98,
    ),
    VoiceIntentBinding(
        surface_event="cancel",
        intent="control.cancel",
        method="cancel_pending",
        target_ref="confirmation:pending",
        phrases=CANCEL_UTTERANCES,
        arguments={"source": "voice", "cancel": True},
        confidence=0.98,
    ),
)


class VoiceIntentResolver:
    """Resolve voice utterances into mediated control-surface decisions."""

    def __init__(
        self,
        *,
        bindings: tuple[VoiceIntentBinding, ...] | list[VoiceIntentBinding] | None = None,
        confidence_policy: VoiceConfidencePolicy | Mapping[str, Any] | None = None,
        surface: str = DEFAULT_VOICE_SURFACE,
        mediator: ControlSurfaceMediator | None = None,
    ) -> None:
        self.bindings = tuple(bindings or DEFAULT_VOICE_BINDINGS)
        self.confidence_policy = (
            confidence_policy
            if isinstance(confidence_policy, VoiceConfidencePolicy)
            else VoiceConfidencePolicy.from_mapping(confidence_policy)
        )
        self.surface = surface or DEFAULT_VOICE_SURFACE
        self.mediator = mediator

    def normalize(
        self,
        raw_payload: Mapping[str, Any] | None,
        *,
        actor: Mapping[str, Any] | ActorIdentity | None = None,
        context: Mapping[str, Any] | RuntimeContext | None = None,
        interaction_id: str | None = None,
        surface: str | None = None,
        confidence_policy: VoiceConfidencePolicy | Mapping[str, Any] | None = None,
    ) -> InteractionEnvelope:
        """Return a canonical envelope for one voice utterance."""

        payload = _payload_copy(raw_payload)
        utterance = _utterance_text(payload)
        surface_event = _resolve_surface_event(payload, utterance)
        wake_detected = _wake_detected(payload, utterance)
        command_text = _command_text(utterance)
        binding = _binding_for_voice(payload, surface_event, command_text, self.bindings)
        target_ref = _target_ref(payload, binding, command_text)
        policy = _confidence_policy(payload, confidence_policy, self.confidence_policy)
        normalized_intent = _normalized_intent(
            payload,
            binding=binding,
            surface_event=surface_event,
            utterance=utterance,
            command_text=command_text,
            wake_detected=wake_detected,
            target_ref=target_ref,
        )
        resolved_actor = _actor_payload(payload, actor)
        resolved_context = _context_payload(
            payload,
            context,
            surface_event=surface_event,
            wake_detected=wake_detected,
        )
        resolved_surface = _first_text(
            surface,
            payload.get("surface"),
            payload.get("surface_ref"),
            self.surface,
            DEFAULT_VOICE_SURFACE,
        )
        resolved_interaction_id = interaction_id or _interaction_id(
            payload,
            resolved_surface,
            surface_event,
            utterance,
            target_ref,
        )

        payload.setdefault("surface_event", surface_event)
        payload.setdefault("utterance", utterance)
        payload.setdefault("voice_event", surface_event)
        payload.setdefault("wake_detected", wake_detected)
        payload.setdefault("resolver", "nl_policy_compiler")
        payload.setdefault("confidence_policy", policy.as_dict())

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
        confidence_policy: VoiceConfidencePolicy | Mapping[str, Any] | None = None,
    ) -> VoiceResolution:
        """Normalize and evaluate a voice utterance through the shared mediator."""

        envelope = self.normalize(
            raw_payload,
            actor=actor,
            context=context,
            interaction_id=interaction_id,
            surface=surface,
            confidence_policy=confidence_policy,
        )
        policy = VoiceConfidencePolicy.from_mapping(
            envelope.raw_payload.get("confidence_policy"),
            default=self.confidence_policy,
        )
        clarification = _clarification_request(envelope, policy)
        bundles: list[Any] | tuple[Any, ...] | None
        if clarification is not None:
            bundles = [_confidence_policy_bundle(envelope, clarification)]
        else:
            bundles = active_policy_bundles

        if self.mediator is not None:
            decision = self.mediator.evaluate(
                envelope,
                active_policy_bundles=bundles,
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
        return VoiceResolution(
            envelope=envelope,
            decision=decision,
            confidence_policy=policy,
            clarification=clarification,
        )


def normalize_voice_interaction(
    raw_payload: Mapping[str, Any] | None,
    *,
    actor: Mapping[str, Any] | ActorIdentity | None = None,
    context: Mapping[str, Any] | RuntimeContext | None = None,
    interaction_id: str | None = None,
    surface: str = DEFAULT_VOICE_SURFACE,
    bindings: tuple[VoiceIntentBinding, ...] | list[VoiceIntentBinding] | None = None,
    confidence_policy: VoiceConfidencePolicy | Mapping[str, Any] | None = None,
) -> InteractionEnvelope:
    """Normalize an utterance, confirm, or cancel event into the canonical envelope."""

    return VoiceIntentResolver(
        bindings=bindings,
        surface=surface,
        confidence_policy=confidence_policy,
    ).normalize(
        raw_payload,
        actor=actor,
        context=context,
        interaction_id=interaction_id,
    )


def resolve_voice_interaction(
    raw_payload: Mapping[str, Any] | None,
    *,
    actor: Mapping[str, Any] | ActorIdentity | None = None,
    context: Mapping[str, Any] | RuntimeContext | None = None,
    active_policy_bundles: list[Any] | tuple[Any, ...] | None = None,
    conflict_resolution: str = DEFAULT_CONFLICT_RESOLUTION,
    decided_at: str | None = None,
    interaction_id: str | None = None,
    surface: str = DEFAULT_VOICE_SURFACE,
    bindings: tuple[VoiceIntentBinding, ...] | list[VoiceIntentBinding] | None = None,
    confidence_policy: VoiceConfidencePolicy | Mapping[str, Any] | None = None,
    mediator: ControlSurfaceMediator | None = None,
) -> VoiceResolution:
    """Normalize a voice event and return its shared policy decision."""

    return VoiceIntentResolver(
        bindings=bindings,
        surface=surface,
        confidence_policy=confidence_policy,
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
        "asr",
        "nlu",
        "speech",
        "transcript",
        "wake",
        "target",
        "message",
        "normalized_intent",
        "context",
        "actor",
        "confidence_policy",
    ):
        if isinstance(payload.get(key), Mapping):
            payload[key] = dict(payload[key])
    return payload


def _resolve_surface_event(payload: Mapping[str, Any], utterance: str) -> str:
    raw_event = _first_payload_text(payload, _EVENT_FIELD_NAMES)
    if raw_event:
        normalized = _VOICE_EVENT_ALIASES.get(_normalize_token(raw_event), _normalize_token(raw_event))
    else:
        spoken = _normalize_spoken(_command_text(utterance))
        if _is_cancel_utterance(spoken):
            normalized = "cancel"
        elif _is_confirm_utterance(spoken):
            normalized = "confirm"
        else:
            normalized = "utterance"

    if normalized not in VOICE_EVENT_TYPES:
        raise VoiceResolutionError(f"Unsupported voice event {raw_event!r}.")
    return normalized


def _binding_for_voice(
    payload: Mapping[str, Any],
    surface_event: str,
    command_text: str,
    bindings: tuple[VoiceIntentBinding, ...],
) -> VoiceIntentBinding:
    explicit = _mapping(payload.get("normalized_intent"))
    method = _first_text(explicit.get("method"), _first_payload_text(payload, _METHOD_FIELD_NAMES))
    intent = _first_text(explicit.get("intent"), _first_payload_text(payload, _INTENT_FIELD_NAMES))
    if method or intent:
        return _explicit_binding(surface_event, method=method, intent=intent, bindings=bindings)

    scored: list[tuple[int, VoiceIntentBinding]] = []
    spoken_text = command_text or _utterance_text(payload)
    for binding in bindings:
        score = binding.match_score(surface_event, spoken_text)
        if score >= 0:
            scored.append((score, binding))
    if scored:
        return max(scored, key=lambda item: item[0])[1]

    raise VoiceResolutionError(
        "Could not resolve voice utterance into a supported intent."
    )


def _explicit_binding(
    surface_event: str,
    *,
    method: str,
    intent: str,
    bindings: tuple[VoiceIntentBinding, ...],
) -> VoiceIntentBinding:
    normalized_intent = str(intent or "").strip()
    normalized_method = _normalize_token(method or _method_for_intent(normalized_intent))
    for binding in bindings:
        if binding.surface_event == surface_event and binding.method == normalized_method:
            return binding
    for binding in bindings:
        if binding.surface_event == surface_event and binding.intent == normalized_intent:
            return binding
    for binding in bindings:
        if binding.surface_event == surface_event:
            return binding
    return VoiceIntentBinding(
        surface_event=surface_event,
        intent=intent or _intent_for_method(normalized_method),
        method=normalized_method,
        target_ref="target:unknown",
        arguments={"source": "voice"},
    )


def _normalized_intent(
    payload: Mapping[str, Any],
    *,
    binding: VoiceIntentBinding,
    surface_event: str,
    utterance: str,
    command_text: str,
    wake_detected: bool,
    target_ref: str,
) -> dict[str, Any]:
    explicit = payload.get("normalized_intent")
    explicit_payload = dict(explicit) if isinstance(explicit, Mapping) else {}
    method = _first_text(
        explicit_payload.get("method"),
        _first_payload_text(payload, _METHOD_FIELD_NAMES),
        binding.method,
    )
    method = _normalize_token(method)
    intent = _first_text(
        explicit_payload.get("intent"),
        _first_payload_text(payload, _INTENT_FIELD_NAMES),
        _intent_for_method(method),
        binding.intent,
    )
    arguments = dict(binding.arguments)
    arguments.update(dict(_mapping(explicit_payload.get("arguments"))))
    arguments.update(dict(_mapping(payload.get("arguments"))))
    arguments.setdefault("source", "voice")
    arguments.setdefault("surface_event", surface_event)
    arguments.setdefault("utterance", utterance)
    arguments.setdefault("wake_detected", wake_detected)
    for key in ("locale", "language", "confirmation_id", "risk_class"):
        _copy_argument_if_present(arguments, payload, key)

    if method == "send_message":
        body = _message_body(payload, command_text)
        if body:
            arguments.setdefault("body", body)

    return {
        "intent": intent,
        "method": method,
        "target_ref": _first_text(explicit_payload.get("target_ref"), target_ref),
        "arguments": arguments,
        "confidence": _voice_confidence(explicit_payload, payload, binding.confidence),
    }


def _target_ref(payload: Mapping[str, Any], binding: VoiceIntentBinding, command_text: str) -> str:
    explicit = payload.get("normalized_intent")
    if isinstance(explicit, Mapping):
        target_ref = explicit.get("target_ref")
        if target_ref:
            return _normalize_target_ref(target_ref)

    target_ref = _first_payload_text(payload, _TARGET_FIELD_NAMES)
    if target_ref:
        return _normalize_target_ref(target_ref)

    for nested_key in ("target", "message"):
        nested = payload.get(nested_key)
        if isinstance(nested, Mapping):
            target_ref = _first_payload_text(nested, _TARGET_FIELD_NAMES)
            if target_ref:
                return _normalize_target_ref(target_ref)

    spoken = _normalize_spoken(command_text)
    if "message" in spoken or spoken.startswith("send "):
        return "service:messaging"
    if "list" in spoken or "next" in spoken or "previous" in spoken:
        return "widget:list"
    if "primary" in spoken or "activate" in spoken or "open" in spoken:
        return "widget:primary-action"
    return binding.target_ref or "target:unknown"


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
    wake_detected: bool,
) -> Mapping[str, Any] | RuntimeContext:
    if isinstance(context, RuntimeContext):
        return context

    resolved = dict(_mapping(context))
    embedded = payload.get("context")
    if isinstance(embedded, Mapping):
        resolved = {**dict(embedded), **resolved}

    device_context = dict(_mapping(resolved.get("device_context")))
    device_context.setdefault("input_surface", "voice")
    device_context.setdefault("voice_event", surface_event)
    device_context.setdefault("wake_detected", wake_detected)
    for key in _VOICE_CONTEXT_FIELDS:
        if key in payload:
            device_context.setdefault(_normalize_device_context_key(key), payload[key])
    for nested_key in ("asr", "nlu", "speech", "wake"):
        nested = payload.get(nested_key)
        if isinstance(nested, Mapping):
            device_context.setdefault(nested_key, dict(nested))
            for key in _VOICE_CONTEXT_FIELDS:
                if key in nested:
                    device_context.setdefault(_normalize_device_context_key(key), nested[key])

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


def _confidence_policy(
    payload: Mapping[str, Any],
    supplied: VoiceConfidencePolicy | Mapping[str, Any] | None,
    default: VoiceConfidencePolicy,
) -> VoiceConfidencePolicy:
    if isinstance(supplied, VoiceConfidencePolicy):
        return supplied
    if supplied is not None:
        return VoiceConfidencePolicy.from_mapping(supplied, default=default)
    return VoiceConfidencePolicy.from_mapping(payload.get("confidence_policy"), default=default)


def _clarification_request(
    envelope: InteractionEnvelope,
    policy: VoiceConfidencePolicy,
) -> VoiceClarificationRequest | None:
    confidence = envelope.normalized_intent.confidence
    outcome = policy.outcome_for(confidence)
    if not outcome:
        return None

    utterance = str(envelope.raw_payload.get("utterance") or "")
    method = envelope.normalized_intent.method or "the requested action"
    if outcome == DeonticOutcome.DENY.value:
        reason = (
            f"Voice confidence {confidence:.2f} is below min_confidence "
            f"{policy.min_confidence:.2f}."
        )
    else:
        reason = (
            f"Voice confidence {confidence:.2f} is below clarify_below "
            f"{policy.clarify_below:.2f}."
        )
    prompt = f"Clarification needed before invoking {method}: please repeat or confirm the command."
    candidates = tuple(
        item
        for item in (envelope.normalized_intent.intent, envelope.normalized_intent.method)
        if item
    )
    return VoiceClarificationRequest(
        utterance=utterance,
        confidence=confidence,
        min_confidence=policy.min_confidence,
        clarify_below=policy.clarify_below,
        outcome=outcome,
        reason=reason,
        prompt=prompt,
        candidates=candidates,
    )


def _confidence_policy_bundle(
    envelope: InteractionEnvelope,
    clarification: VoiceClarificationRequest,
) -> ControlSurfacePolicy:
    reason = f"{clarification.prompt} {clarification.reason}"
    outcome = DeonticOutcome(clarification.outcome)
    norm = ControlSurfaceNorm(
        norm_id=stable_control_surface_id(
            "norm",
            "voice-confidence",
            envelope.surface,
            envelope.surface_event,
            envelope.normalized_intent.method,
            clarification.outcome,
            clarification.min_confidence,
            clarification.clarify_below,
        ),
        outcome=outcome,
        effect=InvocationEffect.from_intent(
            outcome=outcome,
            method="*",
            target_ref="*",
            reason=reason,
        ),
        actor="*",
        surface=envelope.surface,
        surface_event=envelope.surface_event,
        method=envelope.normalized_intent.method or "*",
        target_ref="*",
        priority=1000,
        source_text=reason,
        explanation=reason,
        metadata={
            "surface": "voice",
            "confidence": clarification.confidence,
            "min_confidence": clarification.min_confidence,
            "clarify_below": clarification.clarify_below,
            "clarification_required": True,
            "utterance": clarification.utterance,
        },
    )
    policy_id = stable_control_surface_id(
        "policy",
        "voice-confidence",
        clarification.min_confidence,
        clarification.clarify_below,
    )
    return ControlSurfacePolicy(
        policy_id=policy_id,
        norms=[norm],
        source_text=reason,
        compiled_policy_cid=stable_control_surface_id("compiled", policy_id),
        compiled_artifacts={
            "resolver": "voice",
            "confidence_policy": {
                "min_confidence": clarification.min_confidence,
                "clarify_below": clarification.clarify_below,
            },
            "clarification_required": True,
        },
        explanations=[reason],
    )


def _interaction_id(
    payload: Mapping[str, Any],
    surface: str,
    surface_event: str,
    utterance: str,
    target_ref: str,
) -> str:
    supplied = _first_text(payload.get("interaction_id"), payload.get("event_id"), payload.get("idempotency_key"))
    if supplied:
        return supplied
    return stable_control_surface_id(
        "voice",
        surface,
        surface_event,
        utterance,
        target_ref,
        payload.get("timestamp") or payload.get("local_time") or "",
    )


def _utterance_text(payload: Mapping[str, Any]) -> str:
    value = _first_payload_text(payload, _UTTERANCE_FIELD_NAMES)
    if value:
        return value.strip()
    for nested_key in ("asr", "nlu", "speech", "transcript"):
        nested = payload.get(nested_key)
        if isinstance(nested, Mapping):
            value = _first_payload_text(nested, _UTTERANCE_FIELD_NAMES)
            if value:
                return value.strip()
    return ""


def _command_text(utterance: str) -> str:
    spoken = _normalize_spoken(utterance)
    for wake_word in WAKE_WORDS:
        normalized_wake = _normalize_spoken(wake_word)
        if spoken == normalized_wake:
            return ""
        if spoken.startswith(f"{normalized_wake} "):
            spoken = spoken[len(normalized_wake) + 1 :]
            break
    for prefix in ("please ", "could you ", "can you "):
        if spoken.startswith(prefix):
            spoken = spoken[len(prefix) :]
    return spoken.strip()


def _wake_detected(payload: Mapping[str, Any], utterance: str) -> bool:
    if _truthy(payload.get("wake_detected")) or _truthy(payload.get("wakeDetected")):
        return True
    wake = payload.get("wake")
    if isinstance(wake, Mapping) and (
        _truthy(wake.get("detected")) or _truthy(wake.get("wake_detected"))
    ):
        return True
    raw_event = _normalize_token(_first_payload_text(payload, _EVENT_FIELD_NAMES))
    if raw_event in {"wake", "wake_word", "wakeword"}:
        return True
    spoken = _normalize_spoken(utterance)
    return any(spoken == _normalize_spoken(word) or spoken.startswith(f"{_normalize_spoken(word)} ") for word in WAKE_WORDS)


def _is_confirm_utterance(spoken: str) -> bool:
    return spoken in {_normalize_spoken(item) for item in CONFIRM_UTTERANCES}


def _is_cancel_utterance(spoken: str) -> bool:
    cancel_phrases = {_normalize_spoken(item) for item in CANCEL_UTTERANCES}
    return spoken in cancel_phrases or spoken.startswith("cancel ")


def _message_body(payload: Mapping[str, Any], command_text: str) -> str:
    for key in ("message_body", "body", "content"):
        value = payload.get(key)
        if value not in ("", None):
            return str(value)
    message = payload.get("message")
    if isinstance(message, Mapping):
        for key in ("body", "content", "text"):
            value = message.get(key)
            if value not in ("", None):
                return str(value)

    spoken = _normalize_spoken(command_text)
    for prefix in (
        "send a message that says",
        "send message that says",
        "send a message saying",
        "send message saying",
        "send a message",
        "send message",
        "send",
    ):
        if spoken.startswith(f"{prefix} "):
            return spoken[len(prefix) + 1 :].strip()
    return ""


def _intent_for_method(method: str) -> str:
    normalized = _normalize_token(method)
    if normalized in {"focus_next", "focus_previous", "select"}:
        return f"display.{normalized}"
    if normalized in {"activate", "preview_activate"}:
        return "display.activate"
    if normalized == "send_message":
        return "communication.send"
    if normalized == "wake":
        return "control.wake"
    if normalized == "confirm_pending":
        return "control.confirm"
    if normalized == "cancel_pending":
        return "control.cancel"
    if any(token in normalized for token in ("delete", "destroy", "remove")):
        return f"destructive.{normalized}"
    return f"voice.{normalized}" if normalized else ""


def _method_for_intent(intent: str) -> str:
    normalized = str(intent or "").strip()
    mapping = {
        "display.activate": "activate",
        "display.focus_next": "focus_next",
        "display.focus_previous": "focus_previous",
        "communication.send": "send_message",
        "control.wake": "wake",
        "control.confirm": "confirm_pending",
        "control.cancel": "cancel_pending",
    }
    if normalized in mapping:
        return mapping[normalized]
    if "." in normalized:
        return normalized.rsplit(".", 1)[-1]
    return ""


def _voice_confidence(
    explicit_payload: Mapping[str, Any],
    payload: Mapping[str, Any],
    binding_confidence: float,
) -> float:
    values: list[float] = []
    for value in (explicit_payload.get("confidence"),):
        maybe = _optional_float(value)
        if maybe is not None:
            values.append(maybe)
    for key in _CONFIDENCE_FIELD_NAMES:
        maybe = _optional_float(payload.get(key))
        if maybe is not None:
            values.append(maybe)
    for nested_key in ("asr", "nlu", "speech", "transcript"):
        nested = payload.get(nested_key)
        if isinstance(nested, Mapping):
            for key in _CONFIDENCE_FIELD_NAMES:
                maybe = _optional_float(nested.get(key))
                if maybe is not None:
                    values.append(maybe)
    values.append(binding_confidence)
    return max(0.0, min(1.0, min(values) if values else 1.0))


def _normalize_target_ref(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return "target:unknown"
    if ":" in text:
        return text
    return f"target:{text}"


def _normalize_device_context_key(key: str) -> str:
    if key in {"microphoneId", "microphone_id"}:
        return "microphone_id"
    if key in {"audioDeviceId", "audio_device_id"}:
        return "audio_device_id"
    if key in {"asrModel", "asr_model"}:
        return "asr_model"
    if key in {"wakeWord", "wake_word"}:
        return "wake_word"
    if key in {"wakeDetected", "wake_detected"}:
        return "wake_detected"
    if key in {"confirmationId", "confirmation_id"}:
        return "confirmation_id"
    return _normalize_token(key)


def _copy_argument_if_present(arguments: dict[str, Any], payload: Mapping[str, Any], key: str) -> None:
    if key in payload and key not in arguments:
        arguments[key] = payload[key]


def _first_payload_text(payload: Mapping[str, Any], keys: tuple[str, ...]) -> str:
    value = _first_top_level_text(payload, keys)
    if value:
        return value
    for nested_key in ("asr", "nlu", "speech", "transcript", "target", "message"):
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


def _truthy(value: Any) -> bool:
    if isinstance(value, str):
        return _normalize_token(value) in {"1", "true", "yes", "on", "wake", "detected"}
    return bool(value)


def _bounded_float(value: Any, default: float) -> float:
    maybe = _optional_float(value)
    if maybe is None:
        return default
    return max(0.0, min(1.0, maybe))


def _optional_float(value: Any) -> float | None:
    if value in ("", None):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_token(value: Any) -> str:
    return str(value or "").strip().casefold().replace("-", "_").replace(" ", "_")


def _normalize_spoken(value: Any) -> str:
    text = str(value or "").strip().casefold()
    text = text.replace("-", " ").replace("_", " ")
    text = re.sub(r"[^a-z0-9. ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()
