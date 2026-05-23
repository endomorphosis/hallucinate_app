"""Tests for multimodal control-surface JSON schema contracts."""

from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError
from referencing import Registry, Resource


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_intents import normalize_interaction
from hallucinate_app.control_surface_logic_ir import frame_facts_from_interaction


CONTRACT_ROOT = Path(__file__).resolve().parents[3] / "swissknife" / "contracts"
SCHEMA_NAMES = [
    "control_surface_contract.schema.json",
    "interaction_envelope.schema.json",
    "policy_decision.schema.json",
    "mediation_receipt.schema.json",
]


class TestControlSurfaceSchemas(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.schemas = {
            name: json.loads((CONTRACT_ROOT / name).read_text(encoding="utf-8"))
            for name in SCHEMA_NAMES
        }
        cls.registry = Registry().with_resources(
            (schema["$id"], Resource.from_contents(schema)) for schema in cls.schemas.values()
        )

    def validator_for(self, schema_name: str) -> Draft202012Validator:
        return Draft202012Validator(self.schemas[schema_name], registry=self.registry)

    def policy_bundle_ref(self) -> dict[str, str]:
        return {
            "policy_id": "policy:quiet-hours-gestures",
            "policy_cid": "bafy-policy-bundle-quiet-hours",
            "version": "0.1.0",
            "scope": "operator:operator-7",
            "source": "operator_profile",
        }

    def logic_binding(self) -> dict[str, object]:
        return {
            "binding_id": "binding:gesture-activate-quiet-hours",
            "policy_bundle_ref": self.policy_bundle_ref(),
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
            "surface_refs": ["gesture"],
            "method_refs": ["activate"],
            "norm_refs": ["norm:quiet-hours-gesture-deny"],
            "compiled_artifact_refs": [
                {
                    "artifact_type": "event_calculus",
                    "cid": "bafy-event-calculus-quiet-hours",
                    "media_type": "application/json",
                    "description": "holds_at(state_frame:sleeping) and quiet-hours window atoms",
                }
            ],
            "interaction_envelope_schema_ref": "interaction_envelope",
            "policy_decision_schema_ref": "policy_decision",
            "mediation_receipt_schema_ref": "mediation_receipt",
            "mediation_required": True,
        }

    def contract_payload(self) -> dict[str, object]:
        binding = self.logic_binding()
        return {
            "control_surface_contract": {
                "version": "0.1.0",
                "control_surfaces": [
                    {
                        "id": "gesture",
                        "kind": "captouch_or_wrist",
                        "event_types": ["tap", "swipe", "hold", "wrist_raise"],
                        "intent_resolver": "gesture_mapping_table",
                        "logic_bindings": [binding],
                    }
                ],
                "intent_bindings": [
                    {
                        "intent": "display.activate",
                        "method": "activate",
                        "target_ref": "widget:primary-action",
                        "allowed_surfaces": ["gesture", "mouse", "voice", "agent"],
                        "required_context_facts": ["state_frame"],
                        "logic_bindings": [binding],
                    }
                ],
                "policy_hooks": {
                    "compile_api": "ipfs_datasets_py.logic.api.compile_nl_to_policy",
                    "evaluate_api": "ipfs_datasets_py.logic.api.evaluate_nl_policy",
                    "decision_receipt": True,
                    "compiled_artifact_types": ["event_calculus", "deontic_policy", "explanation"],
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
                "logic_bindings": [binding],
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

    def interaction_envelope(self) -> dict[str, object]:
        envelope = normalize_interaction(
            interaction_id="gesture-quiet-hours-001",
            surface="gesture",
            surface_event="wrist_raise",
            raw_payload={"sensor": "captouch", "gesture": "wrist_raise"},
            normalized_intent={
                "intent": "display.activate",
                "method": "activate",
                "target_ref": "widget:primary-action",
                "arguments": {"source": "gesture"},
                "confidence": 0.91,
            },
            actor={
                "type": "user",
                "id": "operator-7",
                "delegation_chain": ["operator-7"],
            },
            context={
                "local_time": "2026-05-23T23:15:00-07:00",
                "state_frames": ["sleeping", "quiet_hours"],
                "device_mode": "quiet_hours",
                "platform": "hallucinate_app",
                "device_context": {"surface": "desktop-shell"},
            },
        ).as_dict()
        envelope["control_surface_contract_ref"] = "control_surface_contract:desktop-shell-v0"
        envelope["policy_bundle_ref"] = self.policy_bundle_ref()
        envelope["compiled_policy_cid"] = "bafy-policy-quiet-hours"
        envelope["logic_bindings"] = [
            {
                "binding_id": "binding:gesture-activate-quiet-hours",
                "policy_bundle_ref": self.policy_bundle_ref(),
                "compiled_policy_cid": "bafy-policy-quiet-hours",
                "surface_ref": "gesture",
                "method_ref": "activate",
                "norm_refs": ["norm:quiet-hours-gesture-deny"],
            }
        ]
        return envelope

    def policy_decision(self, envelope: dict[str, object]) -> dict[str, object]:
        return {
            "decision_id": "decision:gesture-quiet-hours-001",
            "interaction_id": envelope["interaction_id"],
            "interaction_envelope": envelope,
            "outcome": "deny",
            "policy_bundle_ref": self.policy_bundle_ref(),
            "compiled_policy_cid": "bafy-policy-quiet-hours",
            "decided_at": "2026-05-23T23:15:02-07:00",
            "matched_norms": [
                {
                    "norm_id": "norm:quiet-hours-gesture-deny",
                    "outcome": "deny",
                    "priority": 100,
                    "policy_bundle_ref": self.policy_bundle_ref(),
                    "logic_clause_refs": ["holds_at(state_frame:sleeping)"],
                    "guard_refs": ["guard:state-frame-sleeping", "guard:quiet-hours"],
                    "explanation": "Deny wrist gesture activation while sleeping.",
                }
            ],
            "effects": [
                {
                    "outcome": "deny",
                    "method": "activate",
                    "target_ref": "widget:primary-action",
                    "arguments": {"source": "gesture"},
                    "rewrite_method": "",
                    "fallback_surface": "",
                    "confirmation_required": False,
                    "rate_limit_key": "",
                    "reason": "Gesture activation is suppressed while sleeping.",
                }
            ],
            "frame_facts": [fact.as_dict() for fact in frame_facts_from_interaction(envelope)],
            "reasons": ["Gesture activation is suppressed while sleeping."],
            "explanation": "Compiled quiet-hours policy matched the gesture surface and activate method.",
            "confidence": 0.98,
            "metadata": {"conflict_resolution": "deny_over_permit"},
        }

    def mediation_receipt(
        self,
        envelope: dict[str, object],
        decision: dict[str, object],
    ) -> dict[str, object]:
        return {
            "receipt_id": "receipt:gesture-quiet-hours-001",
            "emitted_at": "2026-05-23T23:15:02-07:00",
            "control_surface_contract_ref": "control_surface_contract:desktop-shell-v0",
            "interaction_envelope": envelope,
            "policy_decision": decision,
            "policy_refs": [
                {
                    "policy_bundle_ref": self.policy_bundle_ref(),
                    "compiled_policy_cid": "bafy-policy-quiet-hours",
                    "matched_norm_refs": ["norm:quiet-hours-gesture-deny"],
                    "compiled_artifact_refs": [
                        {
                            "artifact_type": "event_calculus",
                            "cid": "bafy-event-calculus-quiet-hours",
                            "media_type": "application/json",
                        }
                    ],
                }
            ],
            "mediation_result": {
                "outcome": "deny",
                "invoked": False,
                "final_method": "activate",
                "final_target_ref": "widget:primary-action",
                "confirmation_required": False,
            },
            "explanation": "The matched policy denied gesture activation before invocation.",
            "receipt_links": {"followup_receipt_ids": []},
            "metadata": {"surface": "gesture"},
        }

    def test_schema_files_are_valid_draft_2020_12(self) -> None:
        for schema in self.schemas.values():
            Draft202012Validator.check_schema(schema)

    def test_contract_requires_policy_bindings_on_surfaces_and_methods(self) -> None:
        payload = self.contract_payload()
        self.validator_for("control_surface_contract.schema.json").validate(payload)

        missing_surface_binding = copy.deepcopy(payload)
        del missing_surface_binding["control_surface_contract"]["control_surfaces"][0][
            "logic_bindings"
        ]

        with self.assertRaises(ValidationError) as ctx:
            self.validator_for("control_surface_contract.schema.json").validate(
                missing_surface_binding
            )

        self.assertIn("logic_bindings", str(ctx.exception))

    def test_runtime_envelope_decision_and_receipt_validate_policy_links(self) -> None:
        envelope = self.interaction_envelope()
        decision = self.policy_decision(envelope)
        receipt = self.mediation_receipt(envelope, decision)

        self.validator_for("interaction_envelope.schema.json").validate(envelope)
        self.validator_for("policy_decision.schema.json").validate(decision)
        self.validator_for("mediation_receipt.schema.json").validate(receipt)

        self.assertEqual(envelope["policy_bundle_ref"]["policy_id"], "policy:quiet-hours-gestures")
        self.assertEqual(decision["compiled_policy_cid"], "bafy-policy-quiet-hours")
        self.assertEqual(receipt["policy_decision"]["outcome"], "deny")

    def test_expected_binding_terms_are_present_in_contracts(self) -> None:
        aggregate = "\n".join(
            (CONTRACT_ROOT / name).read_text(encoding="utf-8") for name in SCHEMA_NAMES
        )
        for term in [
            "logic_bindings",
            "policy_bundle_ref",
            "compiled_policy_cid",
            "interaction_envelope",
            "policy_decision",
            "mediation_receipt",
        ]:
            self.assertIn(term, aggregate)


if __name__ == "__main__":
    unittest.main()
