"""Natural-language policy compilers for control-surface rules.

The strict lane recognizes a small set of operator-facing rule templates and
compiles them directly into the Hallucinate-owned control-surface IR. The
general lane is an optional adapter over ``ipfs_datasets_py.logic.api`` for
freeform user rules.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import datetime, timezone
from functools import wraps
from inspect import Parameter, signature
import re
from threading import RLock
from collections.abc import Mapping
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
IPFS_LOGIC_COMPILER_LANE = "ipfs_datasets_py_logic"
IPFS_LOGIC_COMPILE_API = "ipfs_datasets_py.logic.api.compile_nl_to_policy"
IPFS_LOGIC_EVALUATE_API = "ipfs_datasets_py.logic.api.evaluate_nl_policy"
IPFS_LOGIC_COMPILER_CLASS = "ipfs_datasets_py.logic.api.NLUCANPolicyCompiler"
DEFAULT_IPFS_MIN_CONFIDENCE = 0.72
DEFAULT_IPFS_CLARIFY_BELOW = 0.85
_REQUIRED_IPFS_LOGIC_SYMBOLS = (
    "compile_nl_to_policy",
    "evaluate_nl_policy",
    "NLUCANPolicyCompiler",
    "evaluate_with_manager",
)
_IPFS_EVALUATE_COMPAT_LOCK = RLock()

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


class NLPolicyCompilationError(ValueError):
    """Raised when natural-language policy compilation cannot produce a policy."""


class NLPolicyClarificationRequired(NLPolicyCompilationError):
    """Raised when the general compiler needs a safer or more specific rule."""

    def __init__(self, clarification: str, *, result: "NLPolicyCompilation | None" = None) -> None:
        super().__init__(clarification)
        self.clarification = clarification
        self.result = result


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


@dataclass(frozen=True)
class NLPolicyCompilation:
    """Result envelope for strict and general natural-language policy compilers."""

    policy: ControlSurfacePolicy | None
    compiler_lane: str
    confidence: float
    accepted: bool
    clarification: str = ""
    errors: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
    artifacts: dict[str, Any] = field(default_factory=dict)

    @property
    def requires_clarification(self) -> bool:
        return bool(self.clarification) and not self.accepted

    def as_dict(self) -> dict[str, Any]:
        return {
            "compiler_lane": self.compiler_lane,
            "confidence": self.confidence,
            "accepted": self.accepted,
            "clarification": self.clarification,
            "errors": list(self.errors),
            "warnings": list(self.warnings),
            "artifacts": dict(self.artifacts),
            "policy": self.policy.as_dict() if self.policy else None,
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


def compile_control_surface_policy_rule(
    source_text: str,
    *,
    policy_id: str | None = None,
    actor: str = "user:*",
    timezone: str = "UTC",
    min_confidence: float = DEFAULT_IPFS_MIN_CONFIDENCE,
    clarify_below: float = DEFAULT_IPFS_CLARIFY_BELOW,
    logic_api: Any = None,
    general_enabled: bool = True,
) -> ControlSurfacePolicy:
    """Compile a user rule through strict templates or the optional IPFS logic lane.

    Strict templates remain the first lane. Unsupported freeform rules are sent
    to ``ipfs_datasets_py.logic.api.compile_nl_to_policy`` when the public logic
    API is available. Low-confidence or low-coverage general results raise a
    clarification exception instead of activating an ambiguous policy.
    """

    result = compile_control_surface_policy_rule_result(
        source_text,
        policy_id=policy_id,
        actor=actor,
        timezone=timezone,
        min_confidence=min_confidence,
        clarify_below=clarify_below,
        logic_api=logic_api,
        general_enabled=general_enabled,
    )
    if result.policy and result.accepted:
        return result.policy
    if result.requires_clarification:
        raise NLPolicyClarificationRequired(result.clarification, result=result)
    raise StrictTemplatePolicyError("; ".join(result.errors) or "Rule could not be compiled.")


def compile_control_surface_policy_rule_result(
    source_text: str,
    *,
    policy_id: str | None = None,
    actor: str = "user:*",
    timezone: str = "UTC",
    min_confidence: float = DEFAULT_IPFS_MIN_CONFIDENCE,
    clarify_below: float = DEFAULT_IPFS_CLARIFY_BELOW,
    logic_api: Any = None,
    general_enabled: bool = True,
) -> NLPolicyCompilation:
    """Return a compile result from the strict or general natural-language lane."""

    try:
        strict_result = compile_strict_template_rule_result(
            source_text,
            policy_id=policy_id,
            actor=actor,
            timezone=timezone,
        )
        return NLPolicyCompilation(
            policy=strict_result.policy,
            compiler_lane=STRICT_TEMPLATE_COMPILER_LANE,
            confidence=strict_result.confidence,
            accepted=True,
            artifacts=strict_result.as_dict(),
        )
    except StrictTemplatePolicyError as strict_exc:
        strict_error = str(strict_exc)

    if not general_enabled:
        return _strict_rejection_result(source_text, strict_error, "general compiler lane is disabled")

    api, missing = _resolve_ipfs_logic_api(logic_api)
    if api is None:
        return _strict_rejection_result(source_text, strict_error, "ipfs_datasets_py.logic.api is unavailable")
    if missing:
        return _strict_rejection_result(
            source_text,
            strict_error,
            f"ipfs_datasets_py.logic.api is missing: {', '.join(missing)}",
        )

    return _compile_ipfs_logic_policy_result(
        source_text,
        policy_id=policy_id,
        actor=actor,
        min_confidence=min_confidence,
        clarify_below=clarify_below,
        logic_api=api,
        strict_error=strict_error,
    )


def evaluate_ipfs_nl_policy(
    nl_text: str,
    *,
    tool: str,
    actor: str | None = None,
    logic_api: Any = None,
    **kwargs: Any,
) -> dict[str, Any]:
    """Evaluate a natural-language policy with ``evaluate_nl_policy`` if present.

    This helper fails closed. It returns a deny-shaped payload when the optional
    upstream evaluator is absent or raises.
    """

    api, missing = _resolve_ipfs_logic_api(logic_api)
    if api is None or missing:
        return {
            "decision": DeonticOutcome.DENY.value,
            "reason": "ipfs_datasets_py.logic.api.evaluate_nl_policy is unavailable",
            "compiler_lane": IPFS_LOGIC_COMPILER_LANE,
            "missing": list(missing),
        }

    compat_shims: tuple[str, ...] = ()
    compat_context = (
        _ipfs_logic_evaluation_compat_shims()
        if _is_real_ipfs_logic_api(api)
        else _no_ipfs_logic_evaluation_compat_shims()
    )
    try:
        with compat_context as applied_shims:
            compat_shims = applied_shims
            result = api.evaluate_nl_policy(nl_text, tool=tool, actor=actor, **kwargs)
    except Exception as exc:  # pragma: no cover - exact upstream failures vary.
        payload = {
            "decision": DeonticOutcome.DENY.value,
            "reason": f"evaluate_nl_policy failed: {exc}",
            "compiler_lane": IPFS_LOGIC_COMPILER_LANE,
        }
        if compat_shims:
            payload["compat_shims"] = list(compat_shims)
        return payload

    payload = _serialize_ipfs_value(result)
    if isinstance(payload, dict):
        payload.setdefault("compiler_lane", IPFS_LOGIC_COMPILER_LANE)
        _record_ipfs_compat_shims(payload, compat_shims)
        return payload
    payload = {
        "decision": str(payload),
        "compiler_lane": IPFS_LOGIC_COMPILER_LANE,
    }
    _record_ipfs_compat_shims(payload, compat_shims)
    return payload


def _is_real_ipfs_logic_api(api: Any) -> bool:
    return getattr(api, "__name__", "") == "ipfs_datasets_py.logic.api"


@contextmanager
def _no_ipfs_logic_evaluation_compat_shims() -> Any:
    yield ()


@contextmanager
def _ipfs_logic_evaluation_compat_shims() -> Any:
    """Apply temporary adapters for audited upstream logic API drift."""

    patches: list[tuple[Any, str, Any, bool]] = []
    applied: list[str] = []
    with _IPFS_EVALUATE_COMPAT_LOCK:
        try:
            _install_ipfs_policy_evaluator_at_time_compat(patches, applied)
            _install_ipfs_compile_and_evaluate_input_compat(patches, applied)
            _install_ipfs_bridge_result_alias_compat(patches, applied)
            yield tuple(applied)
        finally:
            for target, name, original, had_attr in reversed(patches):
                if had_attr:
                    setattr(target, name, original)
                else:
                    try:
                        delattr(target, name)
                    except AttributeError:
                        pass


def _install_ipfs_policy_evaluator_at_time_compat(
    patches: list[tuple[Any, str, Any, bool]],
    applied: list[str],
) -> None:
    try:
        from ipfs_datasets_py.mcp_server import temporal_policy  # type: ignore
    except Exception:
        return

    evaluator_cls = getattr(temporal_policy, "PolicyEvaluator", None)
    original = getattr(evaluator_cls, "evaluate", None)
    if evaluator_cls is None or not callable(original):
        return
    try:
        params = signature(original).parameters
    except (TypeError, ValueError):
        return
    if "at_time" in params or "now" not in params:
        return

    @wraps(original)
    def evaluate_with_at_time(self: Any, intent: Any, policy: Any, *args: Any, at_time: Any = None, **kwargs: Any) -> Any:
        if at_time is not None and "now" not in kwargs:
            kwargs["now"] = _coerce_ipfs_evaluation_now(at_time)
        return original(self, intent, policy, *args, **kwargs)

    _patch_attr(patches, evaluator_cls, "evaluate", evaluate_with_at_time)
    applied.append("PolicyEvaluator.evaluate_at_time_to_now")


def _install_ipfs_compile_and_evaluate_input_compat(
    patches: list[tuple[Any, str, Any, bool]],
    applied: list[str],
) -> None:
    try:
        from ipfs_datasets_py.logic.integration import nl_ucan_policy_compiler  # type: ignore
    except Exception:
        return

    original = getattr(nl_ucan_policy_compiler, "compile_nl_to_ucan_policy", None)
    if not callable(original):
        return
    try:
        params = signature(original).parameters
    except (TypeError, ValueError):
        return
    accepts_audience_did = "audience_did" in params or any(
        param.kind == Parameter.VAR_KEYWORD for param in params.values()
    )
    if accepts_audience_did:
        return

    @wraps(original)
    def compile_with_bridge_kwargs(sentences: Any, *args: Any, audience_did: Any = None, **kwargs: Any) -> Any:
        if isinstance(sentences, str):
            sentences = [sentences]
        return original(sentences, *args, **kwargs)

    _patch_attr(patches, nl_ucan_policy_compiler, "compile_nl_to_ucan_policy", compile_with_bridge_kwargs)
    applied.append("compile_nl_to_ucan_policy_bridge_input")


def _install_ipfs_bridge_result_alias_compat(
    patches: list[tuple[Any, str, Any, bool]],
    applied: list[str],
) -> None:
    try:
        from ipfs_datasets_py.logic.CEC.nl import dcec_to_ucan_bridge  # type: ignore
    except Exception:
        return

    bridge_result_cls = getattr(dcec_to_ucan_bridge, "BridgeResult", None)
    if bridge_result_cls is None or hasattr(bridge_result_cls, "deny_capabilities"):
        return

    _patch_attr(
        patches,
        bridge_result_cls,
        "deny_capabilities",
        property(lambda self: getattr(self, "denials", [])),
    )
    applied.append("BridgeResult.deny_capabilities_alias")


def _patch_attr(
    patches: list[tuple[Any, str, Any, bool]],
    target: Any,
    name: str,
    value: Any,
) -> None:
    had_attr = hasattr(target, name)
    original = getattr(target, name, None)
    setattr(target, name, value)
    patches.append((target, name, original, had_attr))


def _coerce_ipfs_evaluation_now(value: Any) -> Any:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    return value


def _record_ipfs_compat_shims(payload: dict[str, Any], shims: tuple[str, ...]) -> None:
    if not shims:
        return
    existing = _string_list(payload.get("compat_shims")) if "compat_shims" in payload else []
    payload["compat_shims"] = list(dict.fromkeys(existing + list(shims)))


def _strict_rejection_result(source_text: str, strict_error: str, reason: str) -> NLPolicyCompilation:
    return NLPolicyCompilation(
        policy=None,
        compiler_lane=STRICT_TEMPLATE_COMPILER_LANE,
        confidence=0.0,
        accepted=False,
        errors=(strict_error, reason),
        artifacts={
            "compiler_lane": STRICT_TEMPLATE_COMPILER_LANE,
            "source_text": source_text.strip(),
            "fallback_reason": reason,
        },
    )


def _resolve_ipfs_logic_api(logic_api: Any = None) -> tuple[Any | None, tuple[str, ...]]:
    api = logic_api
    if api is None:
        try:
            from ipfs_datasets_py.logic import api as loaded_api  # type: ignore
        except Exception:
            return None, _REQUIRED_IPFS_LOGIC_SYMBOLS
        api = loaded_api

    missing = tuple(name for name in _REQUIRED_IPFS_LOGIC_SYMBOLS if not hasattr(api, name))
    return api, missing


def _compile_ipfs_logic_policy_result(
    source_text: str,
    *,
    policy_id: str | None,
    actor: str,
    min_confidence: float,
    clarify_below: float,
    logic_api: Any,
    strict_error: str,
) -> NLPolicyCompilation:
    normalized = _normalize_rule_text(source_text)
    if not normalized:
        return NLPolicyCompilation(
            policy=None,
            compiler_lane=IPFS_LOGIC_COMPILER_LANE,
            confidence=0.0,
            accepted=False,
            clarification="Clarification needed: please provide a policy rule.",
            errors=("Rule text is required.",),
        )

    try:
        compile_result = _call_compile_nl_to_policy(
            logic_api,
            source_text,
            policy_id=policy_id,
            actor=actor,
        )
    except Exception as exc:
        clarification = _clarification_prompt(
            source_text,
            reason=f"compile_nl_to_policy failed: {exc}",
        )
        return NLPolicyCompilation(
            policy=None,
            compiler_lane=IPFS_LOGIC_COMPILER_LANE,
            confidence=0.0,
            accepted=False,
            clarification=clarification,
            errors=(strict_error, f"compile_nl_to_policy failed: {exc}"),
        )

    serialized = _serialize_ipfs_value(compile_result)
    success = _ipfs_success(compile_result)
    has_coverage = _ipfs_has_compiled_policy(compile_result)
    confidence = _ipfs_confidence(compile_result, success=success, has_coverage=has_coverage)
    errors = tuple(_string_list(_ipfs_field(compile_result, "errors")))
    warnings = tuple(_string_list(_ipfs_field(compile_result, "warnings")))

    threshold = max(min_confidence, clarify_below)
    if not success or not has_coverage or confidence < threshold:
        reason = _low_confidence_reason(
            success=success,
            has_coverage=has_coverage,
            confidence=confidence,
            threshold=threshold,
            errors=errors,
        )
        return NLPolicyCompilation(
            policy=None,
            compiler_lane=IPFS_LOGIC_COMPILER_LANE,
            confidence=confidence,
            accepted=False,
            clarification=_clarification_prompt(source_text, reason=reason),
            errors=errors or (strict_error, reason),
            warnings=warnings,
            artifacts={
                "compiler_lane": IPFS_LOGIC_COMPILER_LANE,
                "compile_api": IPFS_LOGIC_COMPILE_API,
                "evaluate_api": IPFS_LOGIC_EVALUATE_API,
                "compiler_class": IPFS_LOGIC_COMPILER_CLASS,
                "confidence": confidence,
                "clarification_required": True,
                "ipfs_result": serialized,
            },
        )

    explanations = _ipfs_explanations(logic_api, source_text, compile_result)
    policy = _policy_from_ipfs_logic_result(
        source_text=source_text,
        normalized_text=normalized,
        policy_id=policy_id,
        actor=actor,
        confidence=confidence,
        compile_result=compile_result,
        serialized_result=serialized,
        explanations=explanations,
        errors=errors,
        warnings=warnings,
    )
    return NLPolicyCompilation(
        policy=policy,
        compiler_lane=IPFS_LOGIC_COMPILER_LANE,
        confidence=confidence,
        accepted=True,
        errors=errors,
        warnings=warnings,
        artifacts=policy.compiled_artifacts,
    )


def _call_compile_nl_to_policy(
    logic_api: Any,
    source_text: str,
    *,
    policy_id: str | None,
    actor: str,
) -> Any:
    compile_nl_to_policy = getattr(logic_api, "compile_nl_to_policy")
    sentences = [source_text.strip()]
    keyword_sets: tuple[dict[str, Any], ...] = (
        {"policy_id": policy_id, "default_actor": actor},
        {"policy_id": policy_id},
        {},
    )
    last_error: TypeError | None = None
    for kwargs in keyword_sets:
        clean_kwargs = {key: value for key, value in kwargs.items() if value is not None}
        try:
            return compile_nl_to_policy(sentences, **clean_kwargs)
        except TypeError as exc:
            last_error = exc
    if last_error is not None:
        raise last_error
    return compile_nl_to_policy(sentences)


def _policy_from_ipfs_logic_result(
    *,
    source_text: str,
    normalized_text: str,
    policy_id: str | None,
    actor: str,
    confidence: float,
    compile_result: Any,
    serialized_result: Any,
    explanations: list[str],
    errors: tuple[str, ...],
    warnings: tuple[str, ...],
) -> ControlSurfacePolicy:
    metadata = _as_plain_mapping(_ipfs_field(compile_result, "metadata"))
    policy_cid = _first_text(
        _ipfs_field(compile_result, "policy_cid"),
        metadata.get("policy_cid"),
        metadata.get("compiled_policy_cid"),
        _ipfs_field(_ipfs_field(compile_result, "bridge_result"), "policy_cid"),
    )
    norms = _norms_from_ipfs_logic_result(
        source_text=source_text,
        actor=actor,
        confidence=confidence,
        compile_result=compile_result,
        metadata=metadata,
        explanations=explanations,
    )
    facts = _facts_for_actor(actor) + _facts_from_norms(norms)
    event_calculus = [
        atom
        for norm in norms
        for guard in norm.guards
        for atom in guard.event_calculus_atoms()
    ]
    if not explanations:
        explanations = [
            "Compiled freeform rule with ipfs_datasets_py.logic.api and retained upstream artifacts."
        ]

    artifacts = {
        "compiler_lane": IPFS_LOGIC_COMPILER_LANE,
        "compile_api": IPFS_LOGIC_COMPILE_API,
        "evaluate_api": IPFS_LOGIC_EVALUATE_API,
        "compiler_class": IPFS_LOGIC_COMPILER_CLASS,
        "confidence": confidence,
        "llm_used": bool(metadata.get("llm_used", False)),
        "source_sentences": [source_text.strip()],
        "policy_cid": policy_cid,
        "errors": list(errors),
        "warnings": list(warnings),
        "event_calculus": event_calculus,
        "deontic_outcomes": [_value(norm.outcome) for norm in norms],
        "ipfs_result": serialized_result,
    }
    return ControlSurfacePolicy(
        policy_id=policy_id
        or stable_control_surface_id("policy", IPFS_LOGIC_COMPILER_LANE, normalized_text),
        facts=facts,
        norms=norms,
        source_text=source_text.strip(),
        compiled_policy_cid=policy_cid,
        compiled_artifacts=artifacts,
        explanations=explanations,
    )


def _norms_from_ipfs_logic_result(
    *,
    source_text: str,
    actor: str,
    confidence: float,
    compile_result: Any,
    metadata: Mapping[str, Any],
    explanations: list[str],
) -> list[ControlSurfaceNorm]:
    outcome = _infer_outcome(source_text, metadata)
    method = _first_text(metadata.get("method"), metadata.get("action"), metadata.get("tool"), "*")
    if method != "*":
        method = method.rsplit(".", 1)[-1].replace(" ", "_")
    target_ref = _first_text(
        metadata.get("target_ref"),
        metadata.get("resource"),
        metadata.get("tool"),
        f"method:{method}" if method != "*" else "*",
    )
    surface = _first_text(metadata.get("surface"), _surface_from_text(source_text), "*")
    surface_event = _first_text(metadata.get("surface_event"), "*")
    guards = _guards_from_text(source_text, metadata)
    reason = explanations[0] if explanations else f"Compiled by {IPFS_LOGIC_COMPILE_API}."

    effect = InvocationEffect.from_intent(
        outcome=outcome,
        method=method,
        target_ref=target_ref,
        reason=reason,
    )
    norm = ControlSurfaceNorm(
        norm_id=stable_control_surface_id(
            "norm",
            IPFS_LOGIC_COMPILER_LANE,
            source_text,
            _value(outcome),
            actor,
            surface,
            surface_event,
            method,
            target_ref,
        ),
        outcome=outcome,
        effect=effect,
        actor=actor,
        surface=surface,
        surface_event=surface_event,
        method=method,
        target_ref=target_ref,
        guards=guards,
        priority=70,
        source_text=source_text.strip(),
        explanation=reason,
        metadata={
            "compiler_lane": IPFS_LOGIC_COMPILER_LANE,
            "compile_api": IPFS_LOGIC_COMPILE_API,
            "evaluate_api": IPFS_LOGIC_EVALUATE_API,
            "compiler_class": IPFS_LOGIC_COMPILER_CLASS,
            "confidence": confidence,
            "ipfs_metadata": _serialize_ipfs_value(metadata),
            "ipfs_clauses": _serialize_ipfs_value(_ipfs_field(compile_result, "clauses")),
        },
    )
    return [norm]


def _facts_from_norms(norms: list[ControlSurfaceNorm]) -> list[FrameFact]:
    facts: list[FrameFact] = []
    seen: set[str] = set()
    for norm in norms:
        if norm.surface and norm.surface != "*":
            for fact in _facts_for_surface(SurfaceSlot(norm.surface, norm.surface, norm.surface_event)):
                if fact.fact_id not in seen:
                    seen.add(fact.fact_id)
                    facts.append(fact)
        if norm.method and norm.method != "*":
            for fact in _facts_for_method(MethodSlot(norm.method, norm.method, norm.target_ref)):
                if fact.fact_id not in seen:
                    seen.add(fact.fact_id)
                    facts.append(fact)
        for fact in _facts_for_guards(norm.guards):
            if fact.fact_id not in seen:
                seen.add(fact.fact_id)
                facts.append(fact)
    return facts


def _ipfs_explanations(logic_api: Any, source_text: str, compile_result: Any) -> list[str]:
    explanations: list[str] = []
    explain_iter = getattr(logic_api, "compile_explain_iter", None)
    if callable(explain_iter):
        try:
            explanations.extend(_string_list(explain_iter([source_text.strip()])))
        except Exception:
            pass

    if not explanations:
        compiler_cls = getattr(logic_api, "NLUCANPolicyCompiler", None)
        if compiler_cls is not None:
            try:
                compiler = compiler_cls(strict=False)
                compile_explain = getattr(compiler, "compile_explain", None)
                if callable(compile_explain):
                    explanations.extend(_string_list(compile_explain([source_text.strip()])))
            except Exception:
                pass

    metadata = _as_plain_mapping(_ipfs_field(compile_result, "metadata"))
    for value in (
        _ipfs_field(compile_result, "explanation"),
        _ipfs_field(compile_result, "explanations"),
        metadata.get("explanation"),
        metadata.get("explanations"),
    ):
        explanations.extend(_string_list(value))

    deduped: list[str] = []
    seen: set[str] = set()
    for explanation in explanations:
        text = explanation.strip()
        if text and text not in seen:
            seen.add(text)
            deduped.append(text)
    return deduped


def _ipfs_success(result: Any) -> bool:
    value = _ipfs_field(result, "success", None)
    if value is None:
        return _ipfs_has_compiled_policy(result)
    return bool(value)


def _ipfs_has_compiled_policy(result: Any) -> bool:
    if _ipfs_field(result, "policy", None) is not None:
        return True
    for name in ("clauses", "dcec_formulas", "ucan_policies", "rules"):
        if _as_list(_ipfs_field(result, name)):
            return True
    bridge_result = _ipfs_field(result, "bridge_result", None)
    return bool(_ipfs_field(bridge_result, "policy_cid", ""))


def _ipfs_confidence(result: Any, *, success: bool, has_coverage: bool) -> float:
    metadata = _as_plain_mapping(_ipfs_field(result, "metadata"))
    candidates = (
        _ipfs_field(result, "confidence", None),
        _ipfs_field(result, "parse_confidence", None),
        metadata.get("confidence"),
        metadata.get("parse_confidence"),
        metadata.get("coverage"),
        metadata.get("parse_coverage"),
    )
    confidence_values = [_coerce_confidence(value) for value in candidates]
    confidence_values = [value for value in confidence_values if value is not None]
    if confidence_values:
        return min(confidence_values)
    if success and has_coverage:
        return 0.88
    if success:
        return 0.45
    return 0.0


def _coerce_confidence(value: Any) -> float | None:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return None
    if confidence > 1.0 and confidence <= 100.0:
        confidence = confidence / 100.0
    if confidence < 0.0:
        return 0.0
    if confidence > 1.0:
        return 1.0
    return confidence


def _low_confidence_reason(
    *,
    success: bool,
    has_coverage: bool,
    confidence: float,
    threshold: float,
    errors: tuple[str, ...],
) -> str:
    if errors:
        return errors[0]
    if not success:
        return "the upstream compiler rejected the rule"
    if not has_coverage:
        return "the upstream compiler did not return policy clauses or a policy object"
    return f"confidence {confidence:.2f} is below the required threshold {threshold:.2f}"


def _clarification_prompt(source_text: str, *, reason: str) -> str:
    return (
        "Clarification needed: rewrite the rule with the actor, control surface, "
        f"target action, and condition. The current rule '{source_text.strip()}' "
        f"was not activated because {reason}."
    )


def _infer_outcome(source_text: str, metadata: Mapping[str, Any]) -> DeonticOutcome:
    explicit = _first_text(metadata.get("outcome"), metadata.get("decision"), metadata.get("deontic_outcome"))
    explicit = explicit.replace("prohibit", "deny").replace("forbid", "deny")
    if explicit:
        try:
            return DeonticOutcome(explicit)
        except ValueError:
            pass

    normalized = _normalize_rule_text(source_text)
    if "confirmation" in normalized or "confirm" in normalized:
        return DeonticOutcome.REQUIRE_CONFIRMATION
    deny_markers = ("must not", "never", "do not", "don't", "block", "deny", "ignore", "forbid")
    if any(marker in normalized for marker in deny_markers):
        return DeonticOutcome.DENY
    if "defer" in normalized or "later" in normalized:
        return DeonticOutcome.DEFER
    if "rate limit" in normalized or "limit" in normalized:
        return DeonticOutcome.RATE_LIMIT
    if "allow" in normalized or "may" in normalized or "permit" in normalized:
        return DeonticOutcome.ALLOW
    return DeonticOutcome.REQUIRE_CONFIRMATION


def _surface_from_text(source_text: str) -> str:
    normalized = _normalize_rule_text(source_text)
    for marker, surface in (
        ("agent", "agent"),
        ("voice", "voice"),
        ("gesture", "gesture"),
        ("wrist", "gesture"),
        ("mouse", "mouse"),
        ("pointer", "pointer"),
        ("touch", "touch"),
    ):
        if marker in normalized:
            return surface
    return ""


def _guards_from_text(source_text: str, metadata: Mapping[str, Any]) -> list[TemporalGuard]:
    guards: list[TemporalGuard] = []
    state_frame = _first_text(metadata.get("state_frame"), metadata.get("state"))
    if not state_frame:
        state_frame = _state_frame_from_reason(_normalize_rule_text(source_text))
    if state_frame:
        guards.append(TemporalGuard.state_frame(state_frame))

    normalized = _normalize_rule_text(source_text)
    time_window = _first_text(metadata.get("time_window"), metadata.get("time_window_ref"))
    time_window_slot = _TIME_WINDOW_ALIASES.get(time_window)
    if not time_window:
        for phrase, slot in _TIME_WINDOW_ALIASES.items():
            if phrase in normalized:
                time_window = slot.predicate
                time_window_slot = slot
                break
    if time_window:
        slot = time_window_slot or TimeWindowSlot(time_window, time_window, "", "")
        if slot.start and slot.end:
            guards.append(
                TemporalGuard.time_window(
                    slot.predicate,
                    start=slot.start,
                    end=slot.end,
                    timezone=_first_text(metadata.get("timezone"), "UTC"),
                )
            )
        else:
            guards.append(TemporalGuard.context_fact("time_window", slot.predicate))
    return guards


def _ipfs_field(value: Any, name: str, default: Any = None) -> Any:
    if value is None:
        return default
    if isinstance(value, Mapping):
        return value.get(name, default)
    return getattr(value, name, default)


def _as_plain_mapping(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, Mapping):
        return {str(key): item for key, item in value.items()}
    if hasattr(value, "as_dict"):
        mapped = value.as_dict()
        if isinstance(mapped, Mapping):
            return {str(key): item for key, item in mapped.items()}
    if is_dataclass(value):
        mapped = asdict(value)
        return {str(key): item for key, item in mapped.items()}
    return {}


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, set):
        return sorted(value, key=str)
    if isinstance(value, str):
        return [value]
    try:
        return list(value)
    except TypeError:
        return [value]


def _string_list(value: Any) -> list[str]:
    return [str(item) for item in _as_list(value) if str(item)]


def _first_text(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _serialize_ipfs_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Mapping):
        return {str(key): _serialize_ipfs_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_serialize_ipfs_value(item) for item in value]
    if hasattr(value, "as_dict"):
        try:
            return _serialize_ipfs_value(value.as_dict())
        except Exception:
            pass
    if hasattr(value, "to_dict"):
        try:
            return _serialize_ipfs_value(value.to_dict())
        except Exception:
            pass
    if is_dataclass(value):
        try:
            return _serialize_ipfs_value(asdict(value))
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        public_attrs = {
            key: item
            for key, item in vars(value).items()
            if not key.startswith("_") and not callable(item)
        }
        if public_attrs:
            return _serialize_ipfs_value(public_attrs)
    return repr(value)


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
