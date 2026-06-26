"""Pre-route policy decisions for expanded Meta glasses I/O.

Swissknife adapters should call this module before handing camera, audio,
display, sensor, persistence, relay, or MCP++ events into the control plane.
The policy is intentionally deterministic and fail-closed: missing consent,
replay evidence, raw sensitive payloads, and explicit denials stop dispatch and
return a redacted receipt instead of user data.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping

from hallucinate_app.control_surface_logic_ir import stable_control_surface_id
from hallucinate_app.control_surface_store import stable_cid


POLICY_VERSION = "0.1.0"
DEFAULT_CONTROL_SURFACE_CONTRACT_REF = "control_surface_contract:meta-glasses-io"

CAP_CAMERA = "camera"
CAP_MICROPHONE = "microphone"
CAP_AUDIO_OUTPUT = "speaker_headphone"
CAP_DISPLAY = "display"
CAP_NEURAL_BAND = "neural_band"
CAP_CAPTOUCH = "captouch"
CAP_MOTION_ORIENTATION = "motion_orientation"
CAP_PHONE_GPS = "phone_gps"
CAP_IPFS_PERSISTENCE = "ipfs_persistence"
CAP_LIBP2P_RELAY = "libp2p_relay"
CAP_MCP_HANDOFF = "mcp_handoff"

SUPPORTED_CAPABILITIES = frozenset(
    {
        CAP_CAMERA,
        CAP_MICROPHONE,
        CAP_AUDIO_OUTPUT,
        CAP_DISPLAY,
        CAP_NEURAL_BAND,
        CAP_CAPTOUCH,
        CAP_MOTION_ORIENTATION,
        CAP_PHONE_GPS,
        CAP_IPFS_PERSISTENCE,
        CAP_LIBP2P_RELAY,
        CAP_MCP_HANDOFF,
    }
)

CONSENT_SCOPE_BY_CAPABILITY = {
    CAP_CAMERA: "meta_glasses.camera.photo",
    CAP_MICROPHONE: "meta_glasses.microphone.capture",
    CAP_AUDIO_OUTPUT: "meta_glasses.audio.playback",
    CAP_DISPLAY: "meta_glasses.display.render",
    CAP_NEURAL_BAND: "meta_glasses.neural_band.input",
    CAP_CAPTOUCH: "meta_glasses.captouch.input",
    CAP_MOTION_ORIENTATION: "meta_glasses.motion.orientation",
    CAP_PHONE_GPS: "meta_glasses.phone_gps.context",
    CAP_IPFS_PERSISTENCE: "meta_glasses.ipfs.persist",
    CAP_LIBP2P_RELAY: "meta_glasses.libp2p.relay",
    CAP_MCP_HANDOFF: "meta_glasses.mcp.handoff",
}

SENSITIVE_CAPTURE_CAPABILITIES = frozenset(
    {CAP_CAMERA, CAP_MICROPHONE, CAP_DISPLAY, CAP_PHONE_GPS}
)
RAW_PAYLOAD_KEYS = frozenset(
    {
        "audio",
        "audio_bytes",
        "camera_frame",
        "coordinates",
        "display_text",
        "image",
        "lat",
        "latitude",
        "lon",
        "longitude",
        "pixels",
        "raw",
        "transcript",
        "video",
    }
)


@dataclass(frozen=True)
class MetaGlassesIORequest:
    """Normalized pre-route request from a Meta glasses adapter."""

    interaction_id: str
    app_binding_id: str
    route_id: str
    capabilities: tuple[str, ...]
    consent_scopes: tuple[str, ...] = ()
    payload: Mapping[str, Any] = field(default_factory=dict)
    payload_refs: Mapping[str, Any] = field(default_factory=dict)
    route: Mapping[str, Any] = field(default_factory=dict)
    hardware: Mapping[str, bool] = field(default_factory=dict)
    purpose: str = ""
    mcp_receipt: Mapping[str, Any] = field(default_factory=dict)
    parent_receipt_cids: tuple[str, ...] = ()
    replay_nonce: str = ""
    route_generation: int = 1

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "MetaGlassesIORequest":
        return cls(
            interaction_id=str(value.get("interaction_id") or ""),
            app_binding_id=str(value.get("app_binding_id") or ""),
            route_id=str(value.get("route_id") or ""),
            capabilities=tuple(str(item) for item in value.get("capabilities", ()) or ()),
            consent_scopes=tuple(str(item) for item in value.get("consent_scopes", ()) or ()),
            payload=dict(_as_mapping(value.get("payload"))),
            payload_refs=dict(_as_mapping(value.get("payload_refs"))),
            route=dict(_as_mapping(value.get("route"))),
            hardware={str(key): bool(item) for key, item in _as_mapping(value.get("hardware")).items()},
            purpose=str(value.get("purpose") or ""),
            mcp_receipt=dict(_as_mapping(value.get("mcp_receipt"))),
            parent_receipt_cids=tuple(str(item) for item in value.get("parent_receipt_cids", ()) or ()),
            replay_nonce=str(value.get("replay_nonce") or ""),
            route_generation=int(value.get("route_generation") or 1),
        )


@dataclass(frozen=True)
class MetaGlassesPolicyDecision:
    """Redacted policy decision emitted before Swissknife control-plane routing."""

    decision_id: str
    interaction_id: str
    outcome: str
    can_route: bool
    reasons: tuple[str, ...]
    redactions: tuple[str, ...]
    fallback_route: str
    sanitized_envelope: dict[str, Any]
    mcp_receipt: dict[str, Any]
    decided_at: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "interaction_id": self.interaction_id,
            "outcome": self.outcome,
            "can_route": self.can_route,
            "reasons": list(self.reasons),
            "redactions": list(self.redactions),
            "fallback_route": self.fallback_route,
            "sanitized_envelope": dict(self.sanitized_envelope),
            "mcp_receipt": dict(self.mcp_receipt),
            "decided_at": self.decided_at,
        }


class MetaGlassesIOPolicy:
    """Authorize Meta glasses I/O before event routing.

    The policy object carries replay memory for one process. Callers that need
    cross-process replay protection should hydrate ``seen_interaction_ids`` and
    ``seen_replay_nonces`` from their receipt store before evaluation.
    """

    def __init__(
        self,
        *,
        denied_capabilities: set[str] | None = None,
        supported_hardware: set[str] | None = None,
        consent_scopes: set[str] | None = None,
        seen_interaction_ids: set[str] | None = None,
        seen_replay_nonces: set[str] | None = None,
        payload_refs_required: bool = True,
    ) -> None:
        self.denied_capabilities = set(denied_capabilities or set())
        self.supported_hardware = set(supported_hardware or SUPPORTED_CAPABILITIES)
        self.consent_scopes = set(consent_scopes or set())
        self.seen_interaction_ids = set(seen_interaction_ids or set())
        self.seen_replay_nonces = set(seen_replay_nonces or set())
        self.payload_refs_required = payload_refs_required

    def authorize(self, request: MetaGlassesIORequest | Mapping[str, Any]) -> MetaGlassesPolicyDecision:
        req = request if isinstance(request, MetaGlassesIORequest) else MetaGlassesIORequest.from_mapping(request)
        now = _utc_now()
        reasons: list[str] = []
        redactions: list[str] = []
        outcome = "allow"
        fallback_route = ""

        capabilities = tuple(_normalize_capability(item) for item in req.capabilities)
        unsupported = sorted({cap for cap in capabilities if cap not in SUPPORTED_CAPABILITIES})
        unsupported_hardware = sorted({cap for cap in capabilities if cap in SUPPORTED_CAPABILITIES and cap not in self.supported_hardware})
        denied = sorted({cap for cap in capabilities if cap in self.denied_capabilities})
        missing_scopes = sorted(
            {
                CONSENT_SCOPE_BY_CAPABILITY[cap]
                for cap in capabilities
                if cap in CONSENT_SCOPE_BY_CAPABILITY
                and CONSENT_SCOPE_BY_CAPABILITY[cap] not in self.consent_scopes
                and CONSENT_SCOPE_BY_CAPABILITY[cap] not in req.consent_scopes
            }
        )

        if not req.interaction_id:
            reasons.append("missing_interaction_id")
        elif req.interaction_id in self.seen_interaction_ids:
            reasons.append("replayed_interaction_id")

        if req.replay_nonce:
            if req.replay_nonce in self.seen_replay_nonces:
                reasons.append("replayed_receipt")
        else:
            reasons.append("missing_replay_nonce")

        if req.route_generation < 1:
            reasons.append("stale_route_generation")

        if unsupported:
            reasons.append("unsupported_capability:" + ",".join(unsupported))
        if unsupported_hardware:
            reasons.append("unsupported_hardware:" + ",".join(unsupported_hardware))
            fallback_route = str(req.route.get("fallback_route") or "mobile-fallback")
        if denied:
            reasons.append("capability_denied:" + ",".join(denied))
        if missing_scopes:
            reasons.append("consent_missing:" + ",".join(missing_scopes))

        has_sensitive_capture = any(cap in SENSITIVE_CAPTURE_CAPABILITIES for cap in capabilities)
        raw_payload_keys = sorted(key for key in req.payload if _is_raw_payload_key(str(key)))
        if has_sensitive_capture and self.payload_refs_required and raw_payload_keys and not req.payload_refs:
            reasons.append("sensitive_capture_requires_payload_ref")

        sanitized_payload, payload_redactions = _sanitize_payload(req.payload)
        redactions.extend(payload_redactions)
        sanitized_receipt, receipt_redactions = _sanitize_payload(req.mcp_receipt)
        redactions.extend(f"mcp_receipt.{item}" for item in receipt_redactions)

        blocking_reasons = [
            reason
            for reason in reasons
            if not reason.startswith("unsupported_hardware:")
        ]
        if blocking_reasons:
            outcome = "deny"
        elif unsupported_hardware:
            outcome = "fallback_surface"
        else:
            outcome = "allow"

        can_route = outcome == "allow"
        if outcome == "fallback_surface":
            can_route = False

        sanitized_envelope = {
            "version": POLICY_VERSION,
            "interaction_id": req.interaction_id,
            "app_binding_id": req.app_binding_id,
            "route_id": req.route_id,
            "capabilities": list(capabilities),
            "purpose": req.purpose,
            "route": _sanitize_route(req.route),
            "hardware": {cap: cap in self.supported_hardware for cap in capabilities},
            "payload": sanitized_payload,
            "payload_refs": dict(req.payload_refs),
            "parent_receipt_cids": list(req.parent_receipt_cids),
            "route_generation": req.route_generation,
            "control_surface_contract_ref": DEFAULT_CONTROL_SURFACE_CONTRACT_REF,
        }
        decision_id = stable_control_surface_id(
            "meta_glasses_policy_decision",
            req.interaction_id,
            req.app_binding_id,
            req.route_id,
            outcome,
            ",".join(reasons),
        )
        receipt_payload = {
            "kind": "mcp++/policy-decision",
            "version": POLICY_VERSION,
            "decision_id": decision_id,
            "interaction_id": req.interaction_id,
            "outcome": outcome,
            "can_route": can_route,
            "app_binding_id": req.app_binding_id,
            "route_id": req.route_id,
            "capabilities": list(capabilities),
            "reasons": reasons,
            "redactions": sorted(set(redactions)),
            "fallback_route": fallback_route,
            "sanitized_mcp_receipt": sanitized_receipt,
        }
        receipt_payload["receipt_cid"] = stable_cid(receipt_payload, prefix="meta_glasses_io_policy_receipt")

        if outcome in {"allow", "fallback_surface"} and req.interaction_id:
            self.seen_interaction_ids.add(req.interaction_id)
        if outcome in {"allow", "fallback_surface"} and req.replay_nonce:
            self.seen_replay_nonces.add(req.replay_nonce)

        return MetaGlassesPolicyDecision(
            decision_id=decision_id,
            interaction_id=req.interaction_id,
            outcome=outcome,
            can_route=can_route,
            reasons=tuple(reasons),
            redactions=tuple(sorted(set(redactions))),
            fallback_route=fallback_route,
            sanitized_envelope=sanitized_envelope,
            mcp_receipt=receipt_payload,
            decided_at=now,
        )


def authorize_meta_glasses_io(
    request: MetaGlassesIORequest | Mapping[str, Any],
    *,
    policy: MetaGlassesIOPolicy | None = None,
    **policy_kwargs: Any,
) -> MetaGlassesPolicyDecision:
    """Authorize or deny one Meta glasses I/O request."""

    resolved_policy = policy or MetaGlassesIOPolicy(**policy_kwargs)
    return resolved_policy.authorize(request)


def _normalize_capability(value: str) -> str:
    normalized = value.strip().lower().replace("-", "_").replace(".", "_")
    aliases = {
        "audio": CAP_AUDIO_OUTPUT,
        "audio_playback": CAP_AUDIO_OUTPUT,
        "headphone": CAP_AUDIO_OUTPUT,
        "headphones": CAP_AUDIO_OUTPUT,
        "speaker": CAP_AUDIO_OUTPUT,
        "speaker_headphones": CAP_AUDIO_OUTPUT,
        "gps": CAP_PHONE_GPS,
        "location": CAP_PHONE_GPS,
        "mcp": CAP_MCP_HANDOFF,
        "mcp_tool": CAP_MCP_HANDOFF,
        "mcp_event": CAP_MCP_HANDOFF,
        "motion": CAP_MOTION_ORIENTATION,
        "orientation": CAP_MOTION_ORIENTATION,
        "ipfs": CAP_IPFS_PERSISTENCE,
        "libp2p": CAP_LIBP2P_RELAY,
    }
    return aliases.get(normalized, normalized)


def _sanitize_payload(payload: Mapping[str, Any]) -> tuple[dict[str, Any], list[str]]:
    sanitized: dict[str, Any] = {}
    redactions: list[str] = []
    for key, value in payload.items():
        key_str = str(key)
        if _is_raw_payload_key(key_str):
            sanitized[key_str] = "[redacted]"
            redactions.append(key_str)
        elif isinstance(value, Mapping):
            nested, nested_redactions = _sanitize_payload(value)
            sanitized[key_str] = nested
            redactions.extend(f"{key_str}.{item}" for item in nested_redactions)
        elif isinstance(value, list):
            sanitized[key_str] = [
                "[redacted]" if _is_sensitive_scalar(item) else item
                for item in value
            ]
        else:
            sanitized[key_str] = value
    return sanitized, redactions


def _sanitize_route(route: Mapping[str, Any]) -> dict[str, Any]:
    sanitized = dict(route)
    for key in ("libp2p_peer_id", "peer_id", "session_token"):
        if key in sanitized:
            sanitized[key] = stable_cid(str(sanitized[key]), prefix="scoped_session_metadata")
    return sanitized


def _is_raw_payload_key(key: str) -> bool:
    normalized = key.strip().lower()
    return normalized in RAW_PAYLOAD_KEYS or any(part in normalized for part in ("latitude", "longitude", "coordinate"))


def _is_sensitive_scalar(value: Any) -> bool:
    return isinstance(value, (bytes, bytearray))


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


__all__ = [
    "CAP_AUDIO_OUTPUT",
    "CAP_CAMERA",
    "CAP_CAPTOUCH",
    "CAP_DISPLAY",
    "CAP_IPFS_PERSISTENCE",
    "CAP_LIBP2P_RELAY",
    "CAP_MCP_HANDOFF",
    "CAP_MICROPHONE",
    "CAP_MOTION_ORIENTATION",
    "CAP_NEURAL_BAND",
    "CAP_PHONE_GPS",
    "CONSENT_SCOPE_BY_CAPABILITY",
    "MetaGlassesIOPolicy",
    "MetaGlassesIORequest",
    "MetaGlassesPolicyDecision",
    "SUPPORTED_CAPABILITIES",
    "authorize_meta_glasses_io",
]
