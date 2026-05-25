"""Pre-invocation mediation for daemon-managed service calls.

MCP daemon transports and ORB service adapters enter Hallucinate App below the
human-facing voice, gesture, pointer, and agent resolvers. This module gives
those paths the same single before invoke policy hook: normalize the attempted
service call, evaluate it with the shared control-surface mediator, and return a
receipt before the underlying transport can execute.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from inspect import isawaitable
from typing import Any, Callable, Mapping

from hallucinate_app.control_surface_context import ActorIdentity, RuntimeContext
from hallucinate_app.control_surface_intents import InteractionEnvelope, normalize_interaction
from hallucinate_app.control_surface_mediator import (
    DEFAULT_CONFLICT_RESOLUTION,
    ControlSurfaceMediator,
    PolicyDecision,
    evaluate_control_surface_interaction,
)
from hallucinate_app.control_surface_receipts import MediationReceipt, build_mediation_receipt


DEFAULT_SERVICE_INVOCATION_SURFACE = "agent"
DEFAULT_SERVICE_INVOCATION_EVENT = "autonomous_invoke"
DEFAULT_MCP_TRANSPORT = "mcp-server"
DEFAULT_CONTROL_SURFACE_CONTRACT_REF = "control_surface_contract:mcp-daemon-service-invocation"
BLOCKING_POLICY_OUTCOMES = {"deny", "require_confirmation", "defer", "rate_limit"}


class ServiceInvocationMediationError(RuntimeError):
    """Raised when a service transport attempts to invoke after a blocking policy."""

    def __init__(self, mediation: "MediatedServiceInvocation") -> None:
        self.mediation = mediation
        decision = mediation.policy_decision
        message = (
            f"Service invocation blocked by control_surface mediation: "
            f"{decision.outcome} for {mediation.method} on {mediation.service_id}"
        )
        super().__init__(message)


@dataclass(frozen=True)
class MediatedServiceInvocation:
    """Normalized daemon/ORB invocation plus its pre-invocation policy decision."""

    interaction_envelope: InteractionEnvelope
    policy_decision: PolicyDecision
    mediation_receipt: MediationReceipt
    invocation_payload: dict[str, Any]
    transport: str
    service_id: str
    method: str
    target_ref: str

    @property
    def can_invoke(self) -> bool:
        """Whether the daemon-managed transport may call the underlying service."""

        return self.policy_decision.can_execute

    def as_dict(self) -> dict[str, Any]:
        return {
            "can_invoke": self.can_invoke,
            "transport": self.transport,
            "service_id": self.service_id,
            "method": self.method,
            "target_ref": self.target_ref,
            "invocation_payload": dict(self.invocation_payload),
            "interaction_envelope": self.interaction_envelope.as_dict(),
            "policy_decision": self.policy_decision.as_dict(),
            "mediation_receipt": self.mediation_receipt.as_dict(),
        }


def normalize_service_invocation(
    invocation: Mapping[str, Any] | InteractionEnvelope | None,
    *,
    interaction_id: str | None = None,
    surface: str | None = None,
    surface_event: str | None = None,
    actor: Mapping[str, Any] | ActorIdentity | None = None,
    context: Mapping[str, Any] | RuntimeContext | None = None,
    control_surface_contract_ref: str = "",
) -> InteractionEnvelope:
    """Normalize one MCP/ORB service invocation into the canonical envelope."""

    if isinstance(invocation, InteractionEnvelope):
        return invocation

    payload = _payload_copy(invocation)
    existing_envelope = _mapping(payload.get("interaction_envelope"))
    if existing_envelope:
        return normalize_interaction(
            interaction_id=str(
                interaction_id
                or existing_envelope.get("interaction_id")
                or payload.get("interaction_id")
                or payload.get("correlation_id")
                or ""
            )
            or None,
            surface=str(surface or existing_envelope.get("surface") or DEFAULT_SERVICE_INVOCATION_SURFACE),
            surface_event=str(
                surface_event
                or existing_envelope.get("surface_event")
                or DEFAULT_SERVICE_INVOCATION_EVENT
            ),
            raw_payload=dict(_mapping(existing_envelope.get("raw_payload")) or payload),
            normalized_intent=_mapping(existing_envelope.get("normalized_intent")),
            actor=actor or _mapping(existing_envelope.get("actor")),
            context=context or _mapping(existing_envelope.get("context")),
        )

    control_surface = _mapping(payload.get("control_surface"))
    transport = _transport(payload)
    service_id = _service_id(payload)
    method = _method(payload)
    arguments = _arguments(payload)
    target_ref = _target_ref(payload, control_surface, method)
    contract_ref = (
        control_surface_contract_ref
        or _text(payload.get("control_surface_contract_ref"))
        or _text(control_surface.get("control_surface_contract_ref"))
        or DEFAULT_CONTROL_SURFACE_CONTRACT_REF
    )

    resolved_surface = (
        surface
        or _text(control_surface.get("surface"))
        or _text(payload.get("surface"))
        or DEFAULT_SERVICE_INVOCATION_SURFACE
    )
    resolved_surface_event = (
        surface_event
        or _text(control_surface.get("surface_event"))
        or _text(control_surface.get("event"))
        or _text(payload.get("surface_event"))
        or _text(payload.get("event"))
        or _default_surface_event(resolved_surface)
    )
    resolved_interaction_id = (
        interaction_id
        or _text(control_surface.get("interaction_id"))
        or _text(payload.get("interaction_id"))
        or _text(payload.get("correlation_id"))
        or _text(payload.get("request_id"))
        or None
    )
    normalized_intent = {
        "intent": _text(control_surface.get("intent")) or _text(payload.get("intent")) or f"{transport}.invoke.{method}",
        "method": method,
        "target_ref": target_ref,
        "arguments": arguments,
        "confidence": _number(control_surface.get("confidence"), payload.get("confidence"), default=1.0),
    }
    raw_payload = dict(payload)
    raw_payload.setdefault("transport", transport)
    raw_payload.setdefault("service_id", service_id)
    raw_payload.setdefault("method", method)
    raw_payload.setdefault("arguments", arguments)
    raw_payload.setdefault("control_surface_contract_ref", contract_ref)

    return normalize_interaction(
        interaction_id=resolved_interaction_id,
        surface=resolved_surface,
        surface_event=resolved_surface_event,
        raw_payload=raw_payload,
        normalized_intent=normalized_intent,
        actor=actor or _actor(payload, control_surface),
        context=context or _context(payload, control_surface, transport, service_id, contract_ref),
    )


def before_invoke_service(
    invocation: Mapping[str, Any] | InteractionEnvelope | None,
    *,
    active_policy_bundles: list[Any] | tuple[Any, ...] | None = None,
    mediator: ControlSurfaceMediator | None = None,
    conflict_resolution: str = DEFAULT_CONFLICT_RESOLUTION,
    decided_at: str | None = None,
    emitted_at: str | None = None,
    control_surface_contract_ref: str = "",
    receipt_metadata: Mapping[str, Any] | None = None,
) -> MediatedServiceInvocation:
    """Run the single control_surface before invoke hook for a service call."""

    envelope = normalize_service_invocation(
        invocation,
        control_surface_contract_ref=control_surface_contract_ref,
    )
    if mediator is not None:
        decision = mediator.evaluate(
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

    payload = _payload_copy(invocation)
    service_payload = _service_payload(payload)
    transport = _transport(service_payload)
    service_id = _service_id(service_payload)
    method = envelope.normalized_intent.method or _method(service_payload)
    target_ref = envelope.normalized_intent.target_ref
    contract_ref = (
        control_surface_contract_ref
        or str(envelope.raw_payload.get("control_surface_contract_ref") or "")
        or DEFAULT_CONTROL_SURFACE_CONTRACT_REF
    )
    receipt = build_mediation_receipt(
        decision,
        emitted_at=emitted_at,
        control_surface_contract_ref=contract_ref,
        invoked=decision.can_execute,
        metadata={
            "service_invocation": {
                "transport": transport,
                "service_id": service_id,
                "method": method,
                "target_ref": target_ref,
                "before_invoke_hook": "hallucinate_app.control_surface_service_invocation.before_invoke_service",
            },
            **dict(receipt_metadata or {}),
        },
    )

    return MediatedServiceInvocation(
        interaction_envelope=envelope,
        policy_decision=decision,
        mediation_receipt=receipt,
        invocation_payload=_invocation_payload(service_payload, method, target_ref),
        transport=transport,
        service_id=service_id,
        method=method,
        target_ref=target_ref,
    )


def require_service_invocation_allowed(
    invocation: Mapping[str, Any] | InteractionEnvelope | None,
    **kwargs: Any,
) -> MediatedServiceInvocation:
    """Return mediation or raise before a daemon-managed transport can invoke."""

    mediation = before_invoke_service(invocation, **kwargs)
    if not mediation.can_invoke:
        raise ServiceInvocationMediationError(mediation)
    return mediation


def invoke_service_after_mediation(
    invocation: Mapping[str, Any] | InteractionEnvelope | None,
    invoker: Callable[[dict[str, Any], MediatedServiceInvocation], Any],
    **kwargs: Any,
) -> Any:
    """Apply mediation, then invoke the supplied transport callback if allowed."""

    mediation = require_service_invocation_allowed(invocation, **kwargs)
    return invoker(mediation.invocation_payload, mediation)


async def invoke_service_after_mediation_async(
    invocation: Mapping[str, Any] | InteractionEnvelope | None,
    invoker: Callable[[dict[str, Any], MediatedServiceInvocation], Any],
    **kwargs: Any,
) -> Any:
    """Async variant for ORB/MCP clients that await their transport invocation."""

    result = invoke_service_after_mediation(invocation, invoker, **kwargs)
    if isawaitable(result):
        return await result
    return result


def _payload_copy(value: Mapping[str, Any] | InteractionEnvelope | None) -> dict[str, Any]:
    if isinstance(value, InteractionEnvelope):
        return value.as_dict()
    return dict(value or {})


def _service_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    raw_payload = _mapping(payload.get("raw_payload"))
    merged = dict(raw_payload)
    merged.update(dict(payload))
    return merged


def _mapping(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _transport(payload: Mapping[str, Any]) -> str:
    return (
        _text(payload.get("transport"))
        or _text(payload.get("transport_kind"))
        or _text(payload.get("adapter"))
        or DEFAULT_MCP_TRANSPORT
    )


def _service_id(payload: Mapping[str, Any]) -> str:
    return (
        _text(payload.get("service_id"))
        or _text(payload.get("daemon_id"))
        or _text(payload.get("server_id"))
        or _text(payload.get("server_family"))
        or _text(payload.get("provider"))
        or "service"
    )


def _method(payload: Mapping[str, Any]) -> str:
    return (
        _text(payload.get("method"))
        or _text(payload.get("operation"))
        or _text(payload.get("tool_name"))
        or _text(payload.get("command"))
        or "invoke"
    )


def _arguments(payload: Mapping[str, Any]) -> dict[str, Any]:
    for key in ("arguments", "args", "params", "input", "payload"):
        value = payload.get(key)
        if isinstance(value, Mapping):
            return dict(value)
    return {}


def _target_ref(payload: Mapping[str, Any], control_surface: Mapping[str, Any], method: str) -> str:
    return (
        _text(control_surface.get("target_ref"))
        or _text(payload.get("target_ref"))
        or _text(payload.get("resource"))
        or f"method:{method}"
    )


def _actor(payload: Mapping[str, Any], control_surface: Mapping[str, Any]) -> dict[str, Any]:
    actor = _mapping(control_surface.get("actor")) or _mapping(payload.get("actor"))
    if actor:
        chain = actor.get("delegation_chain") or actor.get("delegationChain") or []
        return {
            "type": _text(actor.get("type")) or "user",
            "id": _text(actor.get("id")) or _text(actor.get("actor_id")) or _text(payload.get("caller_did")),
            "delegation_chain": [str(item) for item in chain],
        }

    actor_type = _text(payload.get("actor_type")) or ("agent" if _text(payload.get("agent_id")) else "user")
    actor_id = (
        _text(payload.get("actor_id"))
        or _text(payload.get("agent_id"))
        or _text(payload.get("caller_did"))
        or "daemon-managed-service"
    )
    chain = payload.get("delegation_chain") or []
    return {
        "type": actor_type,
        "id": actor_id,
        "delegation_chain": [str(item) for item in chain],
    }


def _context(
    payload: Mapping[str, Any],
    control_surface: Mapping[str, Any],
    transport: str,
    service_id: str,
    contract_ref: str,
) -> dict[str, Any]:
    context = _mapping(control_surface.get("context")) or _mapping(payload.get("context"))
    local_time = _text(context.get("local_time")) or _text(payload.get("local_time")) or _utc_now()
    device_context = dict(_mapping(context.get("device_context")))
    device_context.setdefault("transport", transport)
    device_context.setdefault("service_id", service_id)
    device_context.setdefault("daemon_id", _text(payload.get("daemon_id")))
    device_context.setdefault("orb_binding_handle", _text(payload.get("handle")))
    device_context.setdefault("control_surface_contract_ref", contract_ref)

    return {
        "local_time": local_time,
        "state_frames": [str(item) for item in context.get("state_frames", []) or []],
        "device_mode": _text(context.get("device_mode")) or _text(payload.get("device_mode")),
        "platform": _text(context.get("platform")) or "hallucinate_app",
        "location_context": dict(_mapping(context.get("location_context"))),
        "device_context": device_context,
    }


def _invocation_payload(payload: Mapping[str, Any], method: str, target_ref: str) -> dict[str, Any]:
    invocation_payload = dict(payload)
    invocation_payload.setdefault("method", method)
    invocation_payload.setdefault("target_ref", target_ref)
    invocation_payload.setdefault("arguments", _arguments(payload))
    return invocation_payload


def _default_surface_event(surface: str) -> str:
    if surface == "voice":
        return "utterance"
    if surface == "gesture":
        return "tap"
    if surface in {"mouse", "pointer"}:
        return "click"
    return DEFAULT_SERVICE_INVOCATION_EVENT


def _number(*values: Any, default: float) -> float:
    for value in values:
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return default


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
