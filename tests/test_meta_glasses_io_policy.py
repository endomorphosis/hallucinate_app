from __future__ import annotations

from hallucinate_app.meta_glasses_io_policy import (
    CAP_AUDIO_OUTPUT,
    CAP_CAMERA,
    CAP_CAPTOUCH,
    CAP_DISPLAY,
    CAP_IPFS_PERSISTENCE,
    CAP_LIBP2P_RELAY,
    CAP_MCP_HANDOFF,
    CAP_MICROPHONE,
    CAP_MOTION_ORIENTATION,
    CAP_NEURAL_BAND,
    CAP_PHONE_GPS,
    CONSENT_SCOPE_BY_CAPABILITY,
    MetaGlassesIOPolicy,
    authorize_meta_glasses_io,
)


ALL_SCOPES = set(CONSENT_SCOPE_BY_CAPABILITY.values())


def _request(**overrides):
    request = {
        "interaction_id": "interaction-1",
        "app_binding_id": "meta-glasses.widget.primary.capture",
        "route_id": "meta-glasses.route.mock",
        "capabilities": [CAP_CAMERA],
        "consent_scopes": [],
        "payload": {},
        "payload_refs": {},
        "route": {
            "selected_surface": "mcp-bridge",
            "libp2p_peer_id": "12D3KooWraw-peer",
            "fallback_route": "mobile-fallback",
        },
        "hardware": {},
        "purpose": "mock-control-plane-route",
        "mcp_receipt": {"receipt_id": "mcp-receipt-1"},
        "replay_nonce": "nonce-1",
        "route_generation": 1,
    }
    request.update(overrides)
    return request


def test_consent_missing_denies_before_route():
    decision = authorize_meta_glasses_io(_request(capabilities=[CAP_CAMERA]))

    assert decision.outcome == "deny"
    assert decision.can_route is False
    assert any(reason.startswith("consent_missing:meta_glasses.camera.photo") for reason in decision.reasons)
    assert decision.mcp_receipt["outcome"] == "deny"


def test_sensitive_capture_without_payload_reference_is_denied_and_redacted():
    policy = MetaGlassesIOPolicy(consent_scopes=ALL_SCOPES)

    decision = policy.authorize(
        _request(
            capabilities=[CAP_CAMERA],
            payload={"camera_frame": "raw-frame-bytes", "label": "preview"},
            payload_refs={},
            replay_nonce="nonce-sensitive",
        )
    )

    assert decision.outcome == "deny"
    assert "sensitive_capture_requires_payload_ref" in decision.reasons
    assert decision.sanitized_envelope["payload"]["camera_frame"] == "[redacted]"
    assert "camera_frame" in decision.redactions


def test_location_context_is_redacted_when_allowed():
    policy = MetaGlassesIOPolicy(consent_scopes=ALL_SCOPES)

    decision = policy.authorize(
        _request(
            interaction_id="gps-1",
            capabilities=[CAP_PHONE_GPS],
            payload={"latitude": 40.7128, "longitude": -74.0060, "accuracy_m": 18},
            payload_refs={"location_context_cid": "bafy-location-context"},
            replay_nonce="nonce-gps",
        )
    )

    assert decision.outcome == "allow"
    assert decision.can_route is True
    assert decision.sanitized_envelope["payload"]["latitude"] == "[redacted]"
    assert decision.sanitized_envelope["payload"]["longitude"] == "[redacted]"
    assert "latitude" in decision.redactions
    assert "longitude" in decision.redactions


def test_denied_audio_capture_blocks_microphone():
    policy = MetaGlassesIOPolicy(consent_scopes=ALL_SCOPES, denied_capabilities={CAP_MICROPHONE})

    decision = policy.authorize(
        _request(
            interaction_id="mic-1",
            capabilities=[CAP_MICROPHONE],
            payload_refs={"audio_cid": "bafy-audio"},
            replay_nonce="nonce-mic",
        )
    )

    assert decision.outcome == "deny"
    assert "capability_denied:microphone" in decision.reasons


def test_denied_display_output_blocks_render():
    policy = MetaGlassesIOPolicy(consent_scopes=ALL_SCOPES, denied_capabilities={CAP_DISPLAY})

    decision = policy.authorize(
        _request(
            interaction_id="display-1",
            capabilities=[CAP_DISPLAY],
            payload={"display_text": "private answer"},
            payload_refs={"display_template_cid": "bafy-display"},
            replay_nonce="nonce-display",
        )
    )

    assert decision.outcome == "deny"
    assert "capability_denied:display" in decision.reasons
    assert decision.sanitized_envelope["payload"]["display_text"] == "[redacted]"


def test_allowed_mock_route_covers_expanded_io_and_handoffs():
    policy = MetaGlassesIOPolicy(consent_scopes=ALL_SCOPES)
    capabilities = [
        CAP_AUDIO_OUTPUT,
        CAP_NEURAL_BAND,
        CAP_CAPTOUCH,
        CAP_MOTION_ORIENTATION,
        CAP_IPFS_PERSISTENCE,
        CAP_LIBP2P_RELAY,
        CAP_MCP_HANDOFF,
    ]

    decision = policy.authorize(
        _request(
            interaction_id="mock-route-1",
            capabilities=capabilities,
            payload={"gesture": "tap", "orientation": "portrait"},
            payload_refs={"event_cid": "bafy-event"},
            replay_nonce="nonce-mock-route",
        )
    )

    assert decision.outcome == "allow"
    assert decision.can_route is True
    assert decision.sanitized_envelope["capabilities"] == capabilities
    assert decision.mcp_receipt["kind"] == "mcp++/policy-decision"
    assert decision.mcp_receipt["receipt_cid"].startswith("sha256:meta_glasses_io_policy_receipt:")


def test_replayed_receipt_is_denied():
    policy = MetaGlassesIOPolicy(consent_scopes=ALL_SCOPES)
    first = policy.authorize(
        _request(
            interaction_id="replay-1",
            capabilities=[CAP_CAPTOUCH],
            replay_nonce="nonce-replay",
        )
    )
    second = policy.authorize(
        _request(
            interaction_id="replay-1",
            capabilities=[CAP_CAPTOUCH],
            replay_nonce="nonce-replay",
        )
    )

    assert first.outcome == "allow"
    assert second.outcome == "deny"
    assert "replayed_interaction_id" in second.reasons
    assert "replayed_receipt" in second.reasons


def test_unsupported_hardware_uses_fallback_without_dispatching_route():
    policy = MetaGlassesIOPolicy(
        consent_scopes=ALL_SCOPES,
        supported_hardware=set(CONSENT_SCOPE_BY_CAPABILITY) - {CAP_NEURAL_BAND},
    )

    decision = policy.authorize(
        _request(
            interaction_id="fallback-1",
            capabilities=[CAP_NEURAL_BAND],
            replay_nonce="nonce-fallback",
        )
    )

    assert decision.outcome == "fallback_surface"
    assert decision.can_route is False
    assert decision.fallback_route == "mobile-fallback"
    assert "unsupported_hardware:neural_band" in decision.reasons
