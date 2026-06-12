"""Tests for structured control-surface mediation receipts."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_intents import normalize_interaction  # noqa: E402
from hallucinate_app.control_surface_logic_ir import (  # noqa: E402
    ControlSurfacePolicy,
)
from hallucinate_app.control_surface_mediator import (  # noqa: E402
    ControlSurfaceMediator,
    evaluate_control_surface_interaction,
    load_active_policy_bundles,
)
from hallucinate_app.control_surface_policy import compile_strict_template_rule  # noqa: E402
from hallucinate_app.control_surface_receipts import (  # noqa: E402
    MediationReceiptStore,
    _json_safe,
    build_mediation_receipt,
    emit_mediation_receipt,
    mediate_and_emit_receipt,
)
from hallucinate_app.control_surface_store import PolicyBundleStore  # noqa: E402


CONTRACT_ROOT = Path(__file__).resolve().parents[3] / "swissknife" / "contracts"
SCHEMA_NAMES = (
    "interaction_envelope.schema.json",
    "policy_decision.schema.json",
    "mediation_receipt.schema.json",
)


class TestControlSurfaceReceipts(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.schemas = {
            name: json.loads((CONTRACT_ROOT / name).read_text(encoding="utf-8"))
            for name in SCHEMA_NAMES
        }
        cls.registry = Registry().with_resources(
            (schema["$id"], Resource.from_contents(schema))
            for schema in cls.schemas.values()
        )
        cls.receipt_validator = Draft202012Validator(
            cls.schemas["mediation_receipt.schema.json"],
            registry=cls.registry,
        )

    def test_denied_decision_emits_schema_receipt_with_audit_facts(self) -> None:
        with tempfile.TemporaryDirectory() as policy_dir, tempfile.TemporaryDirectory() as receipt_dir:
            policy_store = PolicyBundleStore(policy_dir)
            policy = compile_strict_template_rule(
                "Ignore my wrist gestures at night, because I'm sleeping.",
                actor="user:*",
                timezone="America/Los_Angeles",
            )
            policy_record = policy_store.persist_policy_bundle(
                policy,
                user_id="operator-7",
                profile_id="desktop",
            )
            active = load_active_policy_bundles(
                policy_store,
                user_id="operator-7",
                profile_id="desktop",
            )
            decision = ControlSurfaceMediator(active).evaluate(
                _gesture_envelope(),
                decided_at="2026-05-23T23:15:01Z",
            )
            attachment = policy_store.load_profile_attachment(
                user_id="operator-7",
                profile_id="desktop",
            )

            record = emit_mediation_receipt(
                decision,
                root_dir=receipt_dir,
                emitted_at="2026-05-23T23:15:02Z",
                control_surface_contract_ref="control_surface_contract:desktop-shell-v0",
                policy_refs=attachment["attachment"]["policy_refs"],
            )
            receipt = record.mediation_receipt.as_dict()

            self.receipt_validator.validate(receipt)
            self.assertTrue(record.receipt_path.exists())
            self.assertTrue(record.receipt_cid.startswith("sha256:mediation_receipt:"))
            self.assertEqual(receipt["policy_decision"]["decision_id"], decision.decision_id)
            self.assertEqual(receipt["interaction_envelope"]["surface"], "gesture")
            self.assertEqual(receipt["interaction_envelope"]["raw_payload"]["gesture"], "wrist_raise")
            self.assertEqual(receipt["metadata"]["normalized_intent"]["method"], "activate")
            self.assertEqual(receipt["metadata"]["actor"]["id"], "operator-7")
            self.assertEqual(receipt["metadata"]["context"]["device_mode"], "quiet_hours")
            self.assertEqual(receipt["policy_refs"][0]["policy_bundle_ref"]["policy_cid"], policy_record.policy_cid)
            self.assertIn(decision.matched_norms[0].norm.norm_id, receipt["policy_refs"][0]["matched_norm_refs"])
            self.assertFalse(receipt["mediation_result"]["invoked"])
            self.assertEqual(receipt["mediation_result"]["outcome"], "deny")
            self.assertTrue(
                any(
                    fact["predicate"] == "state_frame" and fact["value"] == "sleeping"
                    for fact in receipt["metadata"]["context_facts"]
                )
            )
            self.assertNotIn(
                "description",
                receipt["policy_refs"][0]["compiled_artifact_refs"][0],
            )

            loaded = MediationReceiptStore(receipt_dir).load_receipt(record.receipt_cid)
            self.assertEqual(loaded["mediation_receipt"], receipt)

    def test_default_allow_receipt_has_policy_ref_outcome_and_explanation(self) -> None:
        decision = evaluate_control_surface_interaction(
            _message_envelope(),
            active_policy_bundles=[],
            decided_at="2026-05-24T10:00:01Z",
        )

        first = build_mediation_receipt(
            decision,
            emitted_at="2026-05-24T10:00:02Z",
        )
        second = build_mediation_receipt(
            decision,
            emitted_at="2026-05-24T10:00:02Z",
        )
        receipt = first.as_dict()

        self.receipt_validator.validate(receipt)
        self.assertEqual(first.receipt_id, second.receipt_id)
        self.assertEqual(receipt["policy_refs"][0]["policy_bundle_ref"]["source"], "system_default")
        self.assertEqual(receipt["mediation_result"]["outcome"], "allow")
        self.assertTrue(receipt["mediation_result"]["invoked"])
        self.assertIn("default allow", receipt["explanation"])
        self.assertEqual(receipt["metadata"]["surface"], "voice")
        self.assertEqual(receipt["metadata"]["normalized_intent"]["method"], "send_message")

    def test_receipt_tracks_all_policy_refs_considered_by_mediation(self) -> None:
        denied = compile_strict_template_rule(
            "Ignore my wrist gestures at night, because I'm sleeping.",
            timezone="America/Los_Angeles",
        )
        observed = ControlSurfacePolicy(
            policy_id="policy:observed-but-unmatched",
            compiled_policy_cid="compiled:observed-but-unmatched",
        )

        with tempfile.TemporaryDirectory() as receipt_dir:
            record = mediate_and_emit_receipt(
                _gesture_envelope(),
                active_policy_bundles=[denied, observed],
                root_dir=receipt_dir,
                decided_at="2026-05-23T23:15:01Z",
                emitted_at="2026-05-23T23:15:02Z",
                metadata={"test_case": "all_policy_refs"},
            )
        receipt = record.mediation_receipt.as_dict()
        policy_ids = {
            ref["policy_bundle_ref"]["policy_id"]
            for ref in receipt["policy_refs"]
        }

        self.receipt_validator.validate(receipt)
        self.assertIn(denied.policy_id, policy_ids)
        self.assertIn("policy:observed-but-unmatched", policy_ids)
        self.assertEqual(receipt["metadata"]["policy_ref_count"], 2)
        self.assertEqual(receipt["metadata"]["test_case"], "all_policy_refs")


def _gesture_envelope():
    return normalize_interaction(
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
        actor={"type": "user", "id": "operator-7", "delegation_chain": ["operator-7"]},
        context={
            "local_time": "2026-05-23T23:15:00-07:00",
            "state_frames": ["sleeping"],
            "device_mode": "quiet_hours",
            "platform": "hallucinate_app",
            "device_context": {"timezone": "America/Los_Angeles"},
        },
    )


class TestControlSurfaceReceiptJsonSafe(unittest.TestCase):
    def test_json_safe_logs_as_dict_hook_failure_without_masking_nested_errors(self) -> None:
        class BrokenAsDict:
            def as_dict(self) -> dict[str, str]:
                raise ValueError("hook failed")

        class BrokenString:
            def __str__(self) -> str:
                raise RuntimeError("nested serialization failed")

        class NestedFailure:
            def as_dict(self) -> dict[str, object]:
                return {"nested": BrokenString()}

        with self.assertLogs("hallucinate_app.control_surface_receipts", level="WARNING") as logs:
            self.assertIn("BrokenAsDict", _json_safe(BrokenAsDict()))

        self.assertTrue(
            any("as_dict() failed for 'BrokenAsDict'" in message for message in logs.output)
        )
        with self.assertRaisesRegex(RuntimeError, "nested serialization failed"):
            _json_safe(NestedFailure())


def _message_envelope():
    return normalize_interaction(
        interaction_id="voice-send-message-001",
        surface="voice",
        surface_event="utterance",
        raw_payload={"text": "send it"},
        normalized_intent={
            "intent": "communication.send",
            "method": "send_message",
            "target_ref": "service:messaging",
            "arguments": {"body": "hello"},
            "confidence": 0.96,
        },
        actor={"type": "user", "id": "operator-7", "delegation_chain": ["operator-7"]},
        context={
            "local_time": "2026-05-24T10:00:00-07:00",
            "state_frames": [],
            "device_mode": "",
            "platform": "hallucinate_app",
        },
    )


if __name__ == "__main__":
    unittest.main()
