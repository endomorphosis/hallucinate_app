"""Tests for semantic control-surface descriptor validation."""

from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_schema import (  # noqa: E402
    ControlSurfaceContractValidationError,
    validate_control_surface_contract,
)


RUNTIME_METHODS = {"activate", "focus_next", "send_message"}


class TestControlSurfaceDescriptorValidation(unittest.TestCase):
    def test_valid_descriptor_passes_pre_runtime_contract_validation(self) -> None:
        result = validate_control_surface_contract(
            descriptor_payload(),
            available_methods=RUNTIME_METHODS,
        )

        self.assertEqual(result.surfaces, {"voice", "gesture", "mouse", "agent"})
        self.assertIn("activate", result.methods)
        self.assertIn("voice", result.allowed_surfaces)
        self.assertGreaterEqual(len(result.logic_bindings), 7)
        self.assertTrue(result.policy_hooks["decision_receipt"])

    def test_rejects_missing_runtime_method(self) -> None:
        payload = descriptor_payload()
        payload["control_surface_contract"]["intent_bindings"][0]["method"] = "teleport"
        payload["control_surface_contract"]["intent_bindings"][0]["logic_bindings"][0][
            "method_refs"
        ] = ["teleport"]

        self.assertInvalid(payload, "missing method")

    def test_rejects_intent_binding_without_method(self) -> None:
        payload = descriptor_payload()
        del payload["control_surface_contract"]["intent_bindings"][0]["method"]

        self.assertInvalid(payload, "missing method")

    def test_rejects_unmapped_allowed_surface(self) -> None:
        payload = descriptor_payload()
        payload["control_surface_contract"]["intent_bindings"][0]["allowed_surfaces"].append(
            "orb"
        )

        self.assertInvalid(payload, "unmapped surface")

    def test_rejects_declared_surface_that_no_intent_maps(self) -> None:
        payload = descriptor_payload()
        payload["control_surface_contract"]["intent_bindings"][2]["allowed_surfaces"].remove(
            "agent"
        )
        payload["control_surface_contract"]["intent_bindings"][2]["logic_bindings"][0][
            "surface_refs"
        ] = ["voice"]

        self.assertInvalid(payload, "unmapped surface")

    def test_rejects_invalid_policy_hooks(self) -> None:
        payload = descriptor_payload()
        payload["control_surface_contract"]["policy_hooks"][
            "compile_api"
        ] = "os.system"

        self.assertInvalid(payload, "invalid policy hook")

    def test_rejects_unsupported_event_types(self) -> None:
        payload = descriptor_payload()
        payload["control_surface_contract"]["control_surfaces"][1]["event_types"].append(
            "blink"
        )

        self.assertInvalid(payload, "unsupported event type")

    def test_rejects_logic_binding_surface_and_method_mismatches(self) -> None:
        payload = descriptor_payload()
        logic_binding = payload["control_surface_contract"]["intent_bindings"][0][
            "logic_bindings"
        ][0]
        logic_binding["surface_refs"] = ["voice"]
        logic_binding["method_refs"] = ["focus_next"]

        with self.assertRaises(ControlSurfaceContractValidationError) as ctx:
            validate_control_surface_contract(payload, available_methods=RUNTIME_METHODS)

        message = str(ctx.exception)
        self.assertIn("logic_bindings", message)
        self.assertIn("allowed_surfaces", message)
        self.assertIn("method", message)

    def test_rejects_unsafe_conflict_resolution(self) -> None:
        payload = descriptor_payload()
        payload["control_surface_contract"]["conflict_resolution"][
            "default"
        ] = "highest_priority"

        self.assertInvalid(payload, "unsafe conflict-resolution")

    def test_rejects_risky_intent_without_confirmation_requirement(self) -> None:
        payload = descriptor_payload()
        payload["control_surface_contract"]["conflict_resolution"][
            "requires_user_confirmation_for"
        ] = ["destructive", "financial"]

        self.assertInvalid(payload, "communication.send")

    def test_rejects_receipt_hook_that_does_not_cover_supported_outcomes(self) -> None:
        payload = descriptor_payload()
        payload["control_surface_contract"]["mediation_receipts"][
            "emit_for_outcomes"
        ] = ["allow", "deny"]

        self.assertInvalid(payload, "mediation receipts")

    def assertInvalid(self, payload: dict[str, object], expected: str) -> None:
        with self.assertRaises(ControlSurfaceContractValidationError) as ctx:
            validate_control_surface_contract(payload, available_methods=RUNTIME_METHODS)
        self.assertIn(expected, str(ctx.exception))


def descriptor_payload() -> dict[str, object]:
    surfaces = [
        ("voice", "voice_command", ["utterance", "confirm", "cancel"], "nl_policy_compiler"),
        (
            "gesture",
            "captouch_or_wrist",
            ["tap", "swipe", "hold", "wrist_raise"],
            "gesture_mapping_table",
        ),
        ("mouse", "pointer", ["click", "double_click", "hover", "focus"], "pointer_mapping_table"),
        (
            "agent",
            "ai_agent",
            ["proposal", "autonomous_invoke", "scheduled_action"],
            "structured_agent_intent",
        ),
    ]
    contract_logic = logic_binding(
        "binding:contract-all",
        surface_refs=["voice", "gesture", "mouse", "agent"],
        method_refs=["activate", "focus_next", "send_message"],
        artifact_types=["event_calculus", "deontic_policy", "explanation"],
    )
    return {
        "control_surface_contract": {
            "version": "0.1.0",
            "control_surfaces": [
                {
                    "id": surface_id,
                    "kind": kind,
                    "event_types": event_types,
                    "intent_resolver": resolver,
                    "logic_bindings": [
                        logic_binding(
                            f"binding:surface-{surface_id}",
                            surface_refs=[surface_id],
                            method_refs=["activate", "focus_next", "send_message"],
                        )
                    ],
                }
                for surface_id, kind, event_types, resolver in surfaces
            ],
            "intent_bindings": [
                {
                    "intent": "display.activate",
                    "method": "activate",
                    "target_ref": "widget:primary-action",
                    "allowed_surfaces": ["gesture", "mouse"],
                    "required_context_facts": ["state_frame"],
                    "logic_bindings": [
                        logic_binding(
                            "binding:intent-activate",
                            surface_refs=["gesture", "mouse"],
                            method_refs=["activate"],
                        )
                    ],
                },
                {
                    "intent": "display.focus_next",
                    "method": "focus_next",
                    "target_ref": "widget:list",
                    "allowed_surfaces": ["gesture", "mouse", "voice"],
                    "required_context_facts": ["state_frame"],
                    "logic_bindings": [
                        logic_binding(
                            "binding:intent-focus-next",
                            surface_refs=["gesture", "mouse", "voice"],
                            method_refs=["focus_next"],
                        )
                    ],
                },
                {
                    "intent": "communication.send",
                    "method": "send_message",
                    "target_ref": "service:messaging",
                    "allowed_surfaces": ["voice", "agent"],
                    "required_context_facts": ["agent_identity"],
                    "logic_bindings": [
                        logic_binding(
                            "binding:intent-send-message",
                            surface_refs=["voice", "agent"],
                            method_refs=["send_message"],
                            artifact_types=["deontic_policy", "explanation"],
                        )
                    ],
                },
            ],
            "policy_hooks": {
                "compile_api": "ipfs_datasets_py.logic.api.compile_nl_to_policy",
                "evaluate_api": "ipfs_datasets_py.logic.api.evaluate_nl_policy",
                "decision_receipt": True,
                "compiled_artifact_types": [
                    "event_calculus",
                    "deontic_policy",
                    "explanation",
                ],
            },
            "context_schema": {
                "state_frames": ["sleeping", "driving", "meeting", "screen_locked"],
                "time_context": True,
                "location_context": True,
                "device_context": True,
                "agent_identity": True,
            },
            "conflict_resolution": {
                "default": "deny_over_permit",
                "requires_explanation": True,
                "requires_user_confirmation_for": [
                    "destructive",
                    "financial",
                    "communication.send",
                ],
            },
            "logic_bindings": [contract_logic],
            "mediation_receipts": {
                "decision_schema_ref": "policy_decision",
                "receipt_schema_ref": "mediation_receipt",
                "emit_for_outcomes": [
                    "allow",
                    "deny",
                    "require_confirmation",
                    "defer",
                    "rewrite",
                    "fallback_surface",
                    "rate_limit",
                ],
                "store": "audit_log",
            },
        }
    }


def logic_binding(
    binding_id: str,
    *,
    surface_refs: list[str],
    method_refs: list[str],
    artifact_types: list[str] | None = None,
) -> dict[str, object]:
    artifact_types = artifact_types or ["event_calculus", "explanation"]
    binding = {
        "binding_id": binding_id,
        "policy_bundle_ref": {
            "policy_id": "policy:quiet-hours-gestures",
            "policy_cid": "bafy-policy-bundle-quiet-hours",
            "version": "0.1.0",
            "scope": "operator:operator-7",
            "source": "operator_profile",
        },
        "compiled_policy_cid": "bafy-policy-quiet-hours",
        "ir_version": "0.1.0",
        "frame_fact_kinds": [
            "actor",
            "surface",
            "event",
            "method",
            "target",
            "context",
            "device",
        ],
        "surface_refs": list(surface_refs),
        "method_refs": list(method_refs),
        "norm_refs": [f"norm:{binding_id.removeprefix('binding:')}"],
        "compiled_artifact_refs": [
            {
                "artifact_type": artifact_type,
                "cid": f"bafy-{artifact_type}-{binding_id.removeprefix('binding:')}",
                "media_type": "application/json",
            }
            for artifact_type in artifact_types
        ],
        "interaction_envelope_schema_ref": "interaction_envelope",
        "policy_decision_schema_ref": "policy_decision",
        "mediation_receipt_schema_ref": "mediation_receipt",
        "mediation_required": True,
    }
    return copy.deepcopy(binding)


if __name__ == "__main__":
    unittest.main()
