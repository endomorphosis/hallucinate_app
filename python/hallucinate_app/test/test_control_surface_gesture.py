"""Tests for gesture and wearable control-surface resolution."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_gesture import (  # noqa: E402
    GestureResolutionError,
    normalize_gesture_interaction,
    resolve_gesture_interaction,
)
from hallucinate_app.control_surface_policy import compile_strict_template_rule  # noqa: E402


class TestControlSurfaceGesture(unittest.TestCase):
    def test_wearable_wrist_raise_denies_before_invoke_during_sleep_quiet_hours(self) -> None:
        policy = compile_strict_template_rule(
            "Ignore my wrist gestures at night, because I'm sleeping.",
            actor="user:*",
            timezone="America/Los_Angeles",
        )

        resolution = resolve_gesture_interaction(
            {
                "interaction_id": "wearable-wrist-raise-001",
                "eventType": "raiseToWake",
                "wearable": {
                    "wearable_type": "smartwatch",
                    "device_id": "watch-42",
                    "sensor": "imu",
                },
                "target_ref": "widget:primary-action",
                "timestamp": "2026-05-23T23:15:00-07:00",
                "sleeping": True,
                "quiet_hours": True,
            },
            actor={"type": "user", "id": "operator-7", "delegation_chain": ["operator-7"]},
            active_policy_bundles=[policy],
            decided_at="2026-05-23T23:15:01Z",
        )
        payload = resolution.as_dict()
        envelope = payload["interaction_envelope"]
        decision = payload["policy_decision"]

        self.assertEqual(envelope["surface"], "gesture")
        self.assertEqual(envelope["surface_event"], "wrist_raise")
        self.assertEqual(envelope["raw_payload"]["resolver"], "gesture_mapping_table")
        self.assertEqual(envelope["normalized_intent"]["intent"], "display.activate")
        self.assertEqual(envelope["normalized_intent"]["method"], "activate")
        self.assertEqual(envelope["normalized_intent"]["target_ref"], "widget:primary-action")
        self.assertEqual(envelope["context"]["state_frames"], ["sleeping"])
        self.assertEqual(envelope["context"]["device_mode"], "quiet_hours")
        self.assertEqual(envelope["context"]["device_context"]["wearable_type"], "smartwatch")
        self.assertEqual(envelope["context"]["device_context"]["device_id"], "watch-42")

        self.assertEqual(decision["outcome"], "deny")
        self.assertFalse(payload["can_execute"])
        self.assertFalse(resolution.can_execute)
        self.assertEqual(decision["matched_norms"][0]["outcome"], "deny")
        self.assertEqual(decision["effects"][0]["method"], "activate")
        self.assertEqual(decision["effects"][0]["target_ref"], "widget:primary-action")
        self.assertTrue(
            any(
                fact["predicate"] == "quiet_hours" and fact["value"] is True
                for fact in decision["frame_facts"]
            )
        )

    def test_tap_swipe_and_hold_aliases_normalize_into_canonical_envelope(self) -> None:
        cases = (
            ("singleTap", "tap", "activate", "widget:primary-action"),
            ("swipeLeft", "swipe", "focus_next", "widget:list"),
            ("longPress", "hold", "activate", "widget:primary-action"),
        )

        for raw_event, expected_event, expected_method, expected_target in cases:
            with self.subTest(raw_event=raw_event):
                envelope = normalize_gesture_interaction(
                    {
                        "interaction_id": f"gesture-{expected_event}-001",
                        "gesture_event": raw_event,
                        "duration_ms": 650,
                    },
                    actor={"type": "user", "id": "operator-7"},
                ).as_dict()

                self.assertEqual(envelope["surface"], "gesture")
                self.assertEqual(envelope["surface_event"], expected_event)
                self.assertEqual(envelope["normalized_intent"]["method"], expected_method)
                self.assertEqual(envelope["normalized_intent"]["target_ref"], expected_target)
                self.assertEqual(
                    envelope["normalized_intent"]["arguments"]["surface_event"],
                    expected_event,
                )
                self.assertEqual(envelope["normalized_intent"]["arguments"]["duration_ms"], 650)

        swipe = normalize_gesture_interaction(
            {"gesture_event": "swipeLeft"},
        ).as_dict()
        self.assertEqual(swipe["normalized_intent"]["arguments"]["direction"], "left")

    def test_explicit_intent_actor_and_context_are_preserved(self) -> None:
        envelope = normalize_gesture_interaction(
            {
                "interaction_id": "gesture-send-message-001",
                "gesture_event": "tap",
                "normalized_intent": {
                    "intent": "communication.send",
                    "method": "send_message",
                    "target_ref": "service:messaging",
                    "arguments": {"body": "hello"},
                    "confidence": 0.88,
                },
                "actor": {
                    "type": "user",
                    "id": "operator-7",
                    "delegation_chain": ["operator-7"],
                },
                "context": {
                    "local_time": "2026-05-24T10:00:00-07:00",
                    "state_frames": ["meeting"],
                    "device_mode": "interactive",
                    "platform": "hallucinate_app",
                },
            }
        ).as_dict()

        self.assertEqual(envelope["normalized_intent"]["intent"], "communication.send")
        self.assertEqual(envelope["normalized_intent"]["method"], "send_message")
        self.assertEqual(envelope["normalized_intent"]["target_ref"], "service:messaging")
        self.assertEqual(envelope["normalized_intent"]["arguments"]["body"], "hello")
        self.assertEqual(envelope["normalized_intent"]["confidence"], 0.88)
        self.assertEqual(envelope["actor"]["delegation_chain"], ["operator-7"])
        self.assertEqual(envelope["context"]["state_frames"], ["meeting"])

    def test_unsupported_gesture_event_fails_closed_before_mediation(self) -> None:
        with self.assertRaises(GestureResolutionError):
            normalize_gesture_interaction({"gesture_event": "shake"})


if __name__ == "__main__":
    unittest.main()
