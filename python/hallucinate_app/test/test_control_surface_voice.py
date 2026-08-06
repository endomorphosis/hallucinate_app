"""Tests for voice-command control-surface resolution."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_policy import compile_strict_template_rule  # noqa: E402
from hallucinate_app.control_surface_voice import (  # noqa: E402
    VoiceResolutionError,
    normalize_voice_interaction,
    resolve_voice_interaction,
)


class TestControlSurfaceVoice(unittest.TestCase):
    def test_wake_word_utterance_normalizes_into_canonical_envelope(self) -> None:
        envelope = normalize_voice_interaction(
            {
                "interaction_id": "voice-wake-activate-001",
                "utterance": "Hey Hallucinate, activate the primary widget",
                "confidence": 0.97,
                "asr": {"confidence": 0.96, "asr_model": "local-asr"},
                "wake": {"detected": True, "wake_word": "hey hallucinate"},
                "microphone_id": "mic-1",
            },
            actor={"type": "user", "id": "operator-7", "delegation_chain": ["operator-7"]},
            context={
                "local_time": "2026-05-24T10:00:00-07:00",
                "state_frames": ["focused"],
                "device_mode": "interactive",
                "platform": "hallucinate_app",
            },
        ).as_dict()

        self.assertEqual(envelope["surface"], "voice")
        self.assertEqual(envelope["surface_event"], "utterance")
        self.assertEqual(envelope["raw_payload"]["resolver"], "nl_policy_compiler")
        self.assertTrue(envelope["raw_payload"]["wake_detected"])
        self.assertEqual(envelope["normalized_intent"]["intent"], "display.activate")
        self.assertEqual(envelope["normalized_intent"]["method"], "activate")
        self.assertEqual(envelope["normalized_intent"]["target_ref"], "widget:primary-action")
        self.assertEqual(envelope["normalized_intent"]["arguments"]["source"], "voice")
        self.assertTrue(envelope["normalized_intent"]["arguments"]["wake_detected"])
        self.assertEqual(envelope["context"]["device_context"]["input_surface"], "voice")
        self.assertEqual(envelope["context"]["device_context"]["microphone_id"], "mic-1")

    def test_low_confidence_utterance_requests_clarification_through_mediator(self) -> None:
        resolution = resolve_voice_interaction(
            {
                "interaction_id": "voice-low-confidence-send-001",
                "utterance": "send message hello",
                "asr_confidence": 0.88,
                "nlu_confidence": 0.89,
                "confidence_policy": {
                    "min_confidence": 0.85,
                    "clarify_below": 0.92,
                },
            },
            actor={"type": "user", "id": "operator-7", "delegation_chain": ["operator-7"]},
            context=_daytime_context(),
            decided_at="2026-05-24T10:00:01Z",
        )
        payload = resolution.as_dict()

        self.assertTrue(payload["clarification_requested"])
        self.assertFalse(payload["can_execute"])
        self.assertEqual(payload["policy_decision"]["outcome"], "defer")
        self.assertEqual(payload["policy_decision"]["matched_norms"][0]["outcome"], "defer")
        self.assertEqual(payload["policy_decision"]["effects"][0]["method"], "send_message")
        self.assertEqual(payload["policy_decision"]["effects"][0]["target_ref"], "service:messaging")
        self.assertIn("clarify_below", payload["clarification"]["reason"])
        self.assertIn("Clarification needed", payload["clarification"]["prompt"])

    def test_below_min_confidence_fails_closed_before_invocation(self) -> None:
        resolution = resolve_voice_interaction(
            {
                "interaction_id": "voice-too-low-confidence-001",
                "utterance": "activate primary",
                "confidence": 0.42,
                "confidence_policy": {
                    "min_confidence": 0.85,
                    "clarify_below": 0.92,
                },
            },
            actor={"type": "user", "id": "operator-7"},
            context=_daytime_context(),
            decided_at="2026-05-24T10:00:01Z",
        )

        self.assertTrue(resolution.clarification_requested)
        self.assertEqual(resolution.decision.outcome, "deny")
        self.assertFalse(resolution.can_execute)
        self.assertIn("min_confidence", resolution.clarification.reason)

    def test_high_confidence_send_uses_same_confirmation_policy_as_other_surfaces(self) -> None:
        policy = compile_strict_template_rule("require confirmation before sending messages")

        resolution = resolve_voice_interaction(
            {
                "interaction_id": "voice-send-message-001",
                "utterance": "send message hello",
                "confidence": 0.97,
            },
            actor={"type": "user", "id": "operator-7", "delegation_chain": ["operator-7"]},
            context=_daytime_context(),
            active_policy_bundles=[policy],
            decided_at="2026-05-24T10:00:01Z",
        )
        payload = resolution.as_dict()

        self.assertFalse(payload["clarification_requested"])
        self.assertEqual(payload["policy_decision"]["outcome"], "require_confirmation")
        self.assertTrue(payload["requires_confirmation"])
        self.assertFalse(payload["can_execute"])
        self.assertEqual(payload["interaction_envelope"]["surface"], "voice")
        self.assertEqual(payload["interaction_envelope"]["surface_event"], "utterance")
        self.assertEqual(payload["interaction_envelope"]["normalized_intent"]["intent"], "communication.send")
        self.assertEqual(payload["interaction_envelope"]["normalized_intent"]["method"], "send_message")
        self.assertEqual(payload["interaction_envelope"]["normalized_intent"]["arguments"]["body"], "hello")
        self.assertEqual(payload["policy_decision"]["effects"][0]["method"], "send_message")
        self.assertTrue(payload["policy_decision"]["effects"][0]["confirmation_required"])

    def test_confirm_and_cancel_utterances_map_to_control_events(self) -> None:
        cases = (
            ("yes", "confirm", "control.confirm", "confirm_pending"),
            ("cancel that", "cancel", "control.cancel", "cancel_pending"),
        )

        for utterance, expected_event, expected_intent, expected_method in cases:
            with self.subTest(utterance=utterance):
                envelope = normalize_voice_interaction(
                    {
                        "interaction_id": f"voice-{expected_event}-001",
                        "utterance": utterance,
                        "confidence": 0.99,
                        "confirmation_id": "confirm-7",
                    }
                ).as_dict()

                self.assertEqual(envelope["surface_event"], expected_event)
                self.assertEqual(envelope["normalized_intent"]["intent"], expected_intent)
                self.assertEqual(envelope["normalized_intent"]["method"], expected_method)
                self.assertEqual(envelope["normalized_intent"]["target_ref"], "confirmation:pending")
                self.assertEqual(
                    envelope["normalized_intent"]["arguments"]["confirmation_id"],
                    "confirm-7",
                )

    def test_wake_event_without_command_still_normalizes(self) -> None:
        envelope = normalize_voice_interaction(
            {
                "interaction_id": "voice-wake-only-001",
                "event_type": "wake",
                "utterance": "hey hallucinate",
                "confidence": 0.99,
            }
        ).as_dict()

        self.assertEqual(envelope["surface_event"], "utterance")
        self.assertEqual(envelope["normalized_intent"]["intent"], "control.wake")
        self.assertEqual(envelope["normalized_intent"]["method"], "wake")
        self.assertEqual(envelope["normalized_intent"]["target_ref"], "voice:wake")
        self.assertTrue(envelope["normalized_intent"]["arguments"]["wake"])

    def test_custom_confidence_policy_can_allow_lower_confidence_commands(self) -> None:
        resolution = resolve_voice_interaction(
            {
                "interaction_id": "voice-custom-confidence-001",
                "utterance": "focus next",
                "confidence": 0.74,
                "confidence_policy": {
                    "min_confidence": 0.60,
                    "clarify_below": 0.70,
                },
            },
            actor={"type": "user", "id": "operator-7"},
            context=_daytime_context(),
            decided_at="2026-05-24T10:00:01Z",
        )

        self.assertFalse(resolution.clarification_requested)
        # Confidence gate passes; mediation still fail-closes without a matching norm.
        self.assertEqual(resolution.decision.outcome, "require_confirmation")
        self.assertFalse(resolution.can_execute)
        self.assertEqual(resolution.envelope.normalized_intent.method, "focus_next")

    def test_unknown_utterance_fails_closed_before_mediation(self) -> None:
        with self.assertRaises(VoiceResolutionError):
            normalize_voice_interaction({"utterance": "make it sparkle", "confidence": 0.99})


def _daytime_context() -> dict[str, object]:
    return {
        "local_time": "2026-05-24T10:00:00-07:00",
        "state_frames": [],
        "device_mode": "interactive",
        "platform": "hallucinate_app",
        "device_context": {"surface": "desktop-shell"},
    }


if __name__ == "__main__":
    unittest.main()
