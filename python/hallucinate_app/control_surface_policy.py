"""Strict natural-language policy templates for control-surface rules.

This module intentionally stays deterministic. It recognizes a small set of
operator-facing rule templates and compiles them directly into the
Hallucinate-owned control-surface IR without invoking an LLM.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from hallucinate_app.control_surface_logic_ir import (
    ControlSurfaceNorm,
    ControlSurfacePolicy,
    DeonticOutcome,
    FrameFact,
    InvocationEffect,
    TemporalGuard,
    TemporalGuardKind,
    stable_control_surface_id,
)


STRICT_TEMPLATE_COMPILER_LANE = "strict_template"
STRICT_TEMPLATE_CONFIDENCE = 1.0

IGNORE_SURFACE_AT_TIME_TEMPLATE = "ignore my {surface} at {time_window}"
REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE = "require confirmation before {method}"

_IGNORE_SURFACE_AT_TIME_RE = re.compile(
    r"^ignore my (?P<surface>[a-z0-9_. -]+?) at (?P<time_window>[a-z0-9_. -]+?)"
    r"(?:,? because (?P<because>[a-z0-9_' .-]+))?$"
)
_REQUIRE_CONFIRMATION_BEFORE_METHOD_RE = re.compile(
    r"^require confirmation before (?P<method>[a-z0-9_. -]+)$"
)
_DOTTED_METHOD_RE = re.compile(r"^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$")


class StrictTemplatePolicyError(ValueError):
    """Raised when a rule does not match the strict-template compiler."""


@dataclass(frozen=True)
class SurfaceSlot:
    """Resolved surface slot captured by a strict template."""

    phrase: str
    surface: str
    surface_event: str


@dataclass(frozen=True)
class TimeWindowSlot:
    """Resolved time-window slot captured by a strict template."""

    phrase: str
    predicate: str
    start: str
    end: str


@dataclass(frozen=True)
class MethodSlot:
    """Resolved method slot captured by a strict template."""

    phrase: str
    method: str
    target_ref: str
    intent: str = ""


@dataclass(frozen=True)
class StrictTemplateCompilation:
    """Compiled policy plus the deterministic template evidence that produced it."""

    policy: ControlSurfacePolicy
    matched_template: str
    confidence: float
    slots: dict[str, str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "compiler_lane": STRICT_TEMPLATE_COMPILER_LANE,
            "matched_template": self.matched_template,
            "confidence": self.confidence,
            "slots": dict(self.slots),
            "policy": self.policy.as_dict(),
        }


_SURFACE_ALIASES: dict[str, SurfaceSlot] = {
    "wrist gesture": SurfaceSlot("wrist gesture", "gesture", "wrist_raise"),
    "wrist gestures": SurfaceSlot("wrist gestures", "gesture", "wrist_raise"),
    "gesture": SurfaceSlot("gesture", "gesture", "*"),
    "gestures": SurfaceSlot("gestures", "gesture", "*"),
    "voice": SurfaceSlot("voice", "voice", "utterance"),
    "voice command": SurfaceSlot("voice command", "voice", "utterance"),
    "voice commands": SurfaceSlot("voice commands", "voice", "utterance"),
    "mouse click": SurfaceSlot("mouse click", "mouse", "click"),
    "mouse clicks": SurfaceSlot("mouse clicks", "mouse", "click"),
    "pointer click": SurfaceSlot("pointer click", "pointer", "click"),
    "pointer clicks": SurfaceSlot("pointer clicks", "pointer", "click"),
}

_TIME_WINDOW_ALIASES: dict[str, TimeWindowSlot] = {
    "night": TimeWindowSlot("night", "quiet_hours", "22:00", "07:00"),
    "overnight": TimeWindowSlot("overnight", "quiet_hours", "22:00", "07:00"),
    "quiet hours": TimeWindowSlot("quiet hours", "quiet_hours", "22:00", "07:00"),
}

_METHOD_ALIASES: dict[str, MethodSlot] = {
    "send message": MethodSlot("send message", "send_message", "service:messaging", "communication.send"),
    "send messages": MethodSlot("send messages", "send_message", "service:messaging", "communication.send"),
    "sending": MethodSlot("sending", "send_message", "service:messaging", "communication.send"),
    "sending message": MethodSlot("sending message", "send_message", "service:messaging", "communication.send"),
    "sending messages": MethodSlot("sending messages", "send_message", "service:messaging", "communication.send"),
    "sending a message": MethodSlot("sending a message", "send_message", "service:messaging", "communication.send"),
    "activate": MethodSlot("activate", "activate", "target:*", "display.activate"),
    "activation": MethodSlot("activation", "activate", "target:*", "display.activate"),
    "display activate": MethodSlot("display activate", "activate", "target:*", "display.activate"),
    "display activation": MethodSlot("display activation", "activate", "target:*", "display.activate"),
}

_STATE_MARKERS: tuple[tuple[str, str], ...] = (
    ("sleep", "sleeping"),
    ("driving", "driving"),
    ("meeting", "meeting"),
    ("screen locked", "screen_locked"),
    ("locked", "screen_locked"),
)


def compile_strict_template_rule(
    source_text: str,
    *,
    policy_id: str | None = None,
    actor: str = "user:*",
    timezone: str = "UTC",
) -> ControlSurfacePolicy:
    """Compile a supported strict-template rule into a ControlSurfacePolicy.

    Supported templates are:
    - ignore my {surface} at {time_window}
    - require confirmation before {method}

    The compiler is intentionally closed-world. Unsupported surface, method,
    and time-window slots raise StrictTemplatePolicyError instead of being
    guessed by a language model.
    """

    return compile_strict_template_rule_result(
        source_text,
        policy_id=policy_id,
        actor=actor,
        timezone=timezone,
    ).policy


def compile_strict_template_rule_result(
    source_text: str,
    *,
    policy_id: str | None = None,
    actor: str = "user:*",
    timezone: str = "UTC",
) -> StrictTemplateCompilation:
    """Compile a strict-template rule and return template metadata."""

    normalized = _normalize_rule_text(source_text)
    if not normalized:
        raise StrictTemplatePolicyError("Rule text is required.")

    ignore_match = _IGNORE_SURFACE_AT_TIME_RE.match(normalized)
    if ignore_match:
        return _compile_ignore_surface_at_time(
            source_text=source_text,
            normalized_text=normalized,
            match=ignore_match,
            policy_id=policy_id,
            actor=actor,
            timezone=timezone,
        )

    confirmation_match = _REQUIRE_CONFIRMATION_BEFORE_METHOD_RE.match(normalized)
    if confirmation_match:
        return _compile_require_confirmation_before_method(
            source_text=source_text,
            normalized_text=normalized,
            match=confirmation_match,
            policy_id=policy_id,
            actor=actor,
        )

    raise StrictTemplatePolicyError(
        "Rule does not match a strict control-surface policy template."
    )


def _compile_ignore_surface_at_time(
    *,
    source_text: str,
    normalized_text: str,
    match: re.Match[str],
    policy_id: str | None,
    actor: str,
    timezone: str,
) -> StrictTemplateCompilation:
    surface_phrase = _normalize_slot_phrase(match.group("surface"))
    time_window_phrase = _normalize_slot_phrase(match.group("time_window"))
    because = _normalize_slot_phrase(match.group("because") or "")
    surface_slot = _resolve_surface(surface_phrase)
    time_window_slot = _resolve_time_window(time_window_phrase)

    guards: list[TemporalGuard] = [
        TemporalGuard.time_window(
            time_window_slot.predicate,
            start=time_window_slot.start,
            end=time_window_slot.end,
            timezone=timezone,
        )
    ]
    state_frame = _state_frame_from_reason(because)
    if state_frame:
        guards.insert(0, TemporalGuard.state_frame(state_frame))

    slots = {
        "surface": surface_phrase,
        "surface_ref": surface_slot.surface,
        "surface_event": surface_slot.surface_event,
        "time_window": time_window_phrase,
        "time_window_ref": time_window_slot.predicate,
    }
    if state_frame:
        slots["state_frame"] = state_frame

    effect = InvocationEffect.from_intent(
        outcome=DeonticOutcome.DENY,
        method="*",
        target_ref="*",
        reason=f"Ignore {surface_phrase} while {time_window_phrase} holds.",
    )
    norm = ControlSurfaceNorm(
        norm_id=stable_control_surface_id(
            "norm",
            STRICT_TEMPLATE_COMPILER_LANE,
            IGNORE_SURFACE_AT_TIME_TEMPLATE,
            surface_slot.surface,
            surface_slot.surface_event,
            time_window_slot.predicate,
            state_frame or "",
        ),
        outcome=DeonticOutcome.DENY,
        effect=effect,
        actor=actor,
        surface=surface_slot.surface,
        surface_event=surface_slot.surface_event,
        method="*",
        target_ref="*",
        guards=guards,
        priority=100,
        source_text=source_text.strip(),
        explanation=(
            f"Compiled '{IGNORE_SURFACE_AT_TIME_TEMPLATE}' as a deny norm for "
            f"{surface_slot.surface}:{surface_slot.surface_event} during "
            f"{time_window_slot.predicate}."
        ),
        metadata=_norm_metadata(
            template=IGNORE_SURFACE_AT_TIME_TEMPLATE,
            slots=slots,
        ),
    )
    policy = _policy_from_norm(
        source_text=source_text,
        normalized_text=normalized_text,
        policy_id=policy_id,
        matched_template=IGNORE_SURFACE_AT_TIME_TEMPLATE,
        slots=slots,
        norms=[norm],
        facts=_facts_for_actor(actor)
        + _facts_for_surface(surface_slot)
        + _facts_for_guards(guards),
    )

    return StrictTemplateCompilation(
        policy=policy,
        matched_template=IGNORE_SURFACE_AT_TIME_TEMPLATE,
        confidence=STRICT_TEMPLATE_CONFIDENCE,
        slots=slots,
    )


def _compile_require_confirmation_before_method(
    *,
    source_text: str,
    normalized_text: str,
    match: re.Match[str],
    policy_id: str | None,
    actor: str,
) -> StrictTemplateCompilation:
    method_phrase = _normalize_slot_phrase(match.group("method"))
    method_slot = _resolve_method(method_phrase)
    slots = {
        "method": method_phrase,
        "method_ref": method_slot.method,
        "target_ref": method_slot.target_ref,
    }
    if method_slot.intent:
        slots["intent"] = method_slot.intent

    effect = InvocationEffect.from_intent(
        outcome=DeonticOutcome.REQUIRE_CONFIRMATION,
        method=method_slot.method,
        target_ref=method_slot.target_ref,
        reason=f"Require user confirmation before {method_phrase}.",
    )
    norm = ControlSurfaceNorm(
        norm_id=stable_control_surface_id(
            "norm",
            STRICT_TEMPLATE_COMPILER_LANE,
            REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE,
            method_slot.method,
            method_slot.target_ref,
        ),
        outcome=DeonticOutcome.REQUIRE_CONFIRMATION,
        effect=effect,
        actor=actor,
        surface="*",
        surface_event="*",
        method=method_slot.method,
        target_ref=method_slot.target_ref,
        guards=[],
        priority=90,
        source_text=source_text.strip(),
        explanation=(
            f"Compiled '{REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE}' as a "
            f"confirmation norm for {method_slot.method}."
        ),
        metadata=_norm_metadata(
            template=REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE,
            slots=slots,
        ),
    )
    policy = _policy_from_norm(
        source_text=source_text,
        normalized_text=normalized_text,
        policy_id=policy_id,
        matched_template=REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE,
        slots=slots,
        norms=[norm],
        facts=_facts_for_actor(actor) + _facts_for_method(method_slot),
    )

    return StrictTemplateCompilation(
        policy=policy,
        matched_template=REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE,
        confidence=STRICT_TEMPLATE_CONFIDENCE,
        slots=slots,
    )


def _policy_from_norm(
    *,
    source_text: str,
    normalized_text: str,
    policy_id: str | None,
    matched_template: str,
    slots: dict[str, str],
    norms: list[ControlSurfaceNorm],
    facts: list[FrameFact],
) -> ControlSurfacePolicy:
    event_calculus = [
        atom
        for norm in norms
        for guard in norm.guards
        for atom in guard.event_calculus_atoms()
    ]
    return ControlSurfacePolicy(
        policy_id=policy_id
        or stable_control_surface_id("policy", STRICT_TEMPLATE_COMPILER_LANE, normalized_text),
        facts=facts,
        norms=norms,
        source_text=source_text.strip(),
        compiled_artifacts={
            "compiler_lane": STRICT_TEMPLATE_COMPILER_LANE,
            "matched_template": matched_template,
            "confidence": STRICT_TEMPLATE_CONFIDENCE,
            "llm_used": False,
            "slots": dict(slots),
            "event_calculus": event_calculus,
            "deontic_outcomes": [_value(norm.outcome) for norm in norms],
        },
        explanations=[norm.explanation for norm in norms],
    )


def _norm_metadata(*, template: str, slots: dict[str, str]) -> dict[str, Any]:
    return {
        "compiler_lane": STRICT_TEMPLATE_COMPILER_LANE,
        "matched_template": template,
        "confidence": STRICT_TEMPLATE_CONFIDENCE,
        "llm_used": False,
        "slots": dict(slots),
    }


def _facts_for_actor(actor: str) -> list[FrameFact]:
    actor_type, actor_id = _split_actor(actor)
    return [FrameFact.actor(actor_type=actor_type, actor_id=actor_id)]


def _facts_for_surface(surface_slot: SurfaceSlot) -> list[FrameFact]:
    facts = [FrameFact.surface(surface_slot.surface)]
    if surface_slot.surface_event != "*":
        facts.append(FrameFact.event(surface_slot.surface_event, surface_slot.surface))
    return facts


def _facts_for_guards(guards: list[TemporalGuard]) -> list[FrameFact]:
    facts: list[FrameFact] = []
    for guard in guards:
        kind = guard.kind.value if hasattr(guard.kind, "value") else str(guard.kind)
        if kind == TemporalGuardKind.STATE_FRAME.value:
            facts.append(
                FrameFact.context(
                    "state_frame",
                    guard.expected,
                    subject="context:state_frames",
                )
            )
        elif kind == TemporalGuardKind.TIME_WINDOW.value:
            facts.append(FrameFact.context("time_window", guard.predicate, subject="context:time"))
    return facts


def _facts_for_method(method_slot: MethodSlot) -> list[FrameFact]:
    return [
        FrameFact.method(method_slot.method, method_slot.intent),
        FrameFact.target(method_slot.target_ref, method_slot.method),
    ]


def _resolve_surface(phrase: str) -> SurfaceSlot:
    try:
        return _SURFACE_ALIASES[phrase]
    except KeyError as exc:
        raise StrictTemplatePolicyError(f"Unsupported control surface slot: {phrase}") from exc


def _resolve_time_window(phrase: str) -> TimeWindowSlot:
    try:
        return _TIME_WINDOW_ALIASES[phrase]
    except KeyError as exc:
        raise StrictTemplatePolicyError(f"Unsupported time-window slot: {phrase}") from exc


def _resolve_method(phrase: str) -> MethodSlot:
    if phrase in _METHOD_ALIASES:
        return _METHOD_ALIASES[phrase]

    method_text = phrase.replace(" ", "_")
    if _DOTTED_METHOD_RE.match(method_text):
        method = method_text.rsplit(".", 1)[-1]
        return MethodSlot(
            phrase=phrase,
            method=method,
            target_ref=f"method:{method_text}",
            intent=method_text if "." in method_text else "",
        )

    raise StrictTemplatePolicyError(f"Unsupported method slot: {phrase}")


def _state_frame_from_reason(reason: str) -> str:
    if not reason:
        return ""
    for marker, state_frame in _STATE_MARKERS:
        if marker in reason:
            return state_frame
    return ""


def _split_actor(actor: str) -> tuple[str, str]:
    if ":" not in actor:
        return actor or "user", ""
    actor_type, actor_id = actor.split(":", 1)
    return actor_type or "user", actor_id


def _value(value: Any) -> str:
    return str(value.value if hasattr(value, "value") else value)


def _normalize_rule_text(source_text: str) -> str:
    normalized = source_text.strip().casefold().replace("`", "")
    normalized = normalized.replace("’", "'").replace("‘", "'")
    normalized = re.sub(r"[.!?]+$", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def _normalize_slot_phrase(value: str) -> str:
    normalized = _normalize_rule_text(value)
    normalized = re.sub(r"^(a|an|the) ", "", normalized)
    return normalized.strip()
