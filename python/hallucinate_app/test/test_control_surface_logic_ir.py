"""Tests for the multimodal control-surface policy IR."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_intents import normalize_interaction
from hallucinate_app.control_surface_logic_ir import (
    ControlSurfaceNorm,
    DeonticOutcome,
    FrameFactKind,
    InvocationEffect,
    TemporalGuard,
    frame_facts_from_interaction,
    policy_from_interaction,
    stable_control_surface_id,
)


class TestControlSurfaceLogicIR(unittest.TestCase):
    def _sample_envelope(self):
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
        )

    def test_interaction_envelope_becomes_frame_first_facts(self) -> None:
        facts = frame_facts_from_interaction(self._sample_envelope())
        payloads = [fact.as_dict() for fact in facts]
        kinds = {payload["kind"] for payload in payloads}

        self.assertIn(FrameFactKind.ACTOR.value, kinds)
        self.assertIn(FrameFactKind.SURFACE.value, kinds)
        self.assertIn(FrameFactKind.EVENT.value, kinds)
        self.assertIn(FrameFactKind.METHOD.value, kinds)
        self.assertIn(FrameFactKind.TARGET.value, kinds)
        self.assertIn(FrameFactKind.CONTEXT.value, kinds)
        self.assertIn(FrameFactKind.DEVICE.value, kinds)

        actor_fact = next(payload for payload in payloads if payload["kind"] == "actor")
        self.assertEqual(actor_fact["value"], "user")
        self.assertEqual(actor_fact["attrs"]["delegation_chain"], ["operator-7"])

        method_fact = next(payload for payload in payloads if payload["kind"] == "method")
        self.assertEqual(method_fact["value"], "activate")
        self.assertEqual(method_fact["attrs"]["intent"], "display.activate")

        self.assertTrue(
            any(
                payload["predicate"] == "state_frame" and payload["value"] == "sleeping"
                for payload in payloads
            )
        )
        self.assertTrue(
            any(
                payload["predicate"] == "device_context.surface"
                and payload["value"] == "desktop-shell"
                for payload in payloads
            )
        )

    def test_deontic_norm_carries_temporal_guards_and_invocation_effect(self) -> None:
        envelope = self._sample_envelope()
        sleeping = TemporalGuard.state_frame("sleeping")
        quiet_hours = TemporalGuard.time_window(
            "quiet_hours",
            start="22:00",
            end="07:00",
            timezone="America/Los_Angeles",
        )
        effect = InvocationEffect.from_intent(
            outcome=DeonticOutcome.DENY,
            method="activate",
            target_ref="widget:primary-action",
            arguments={"source": "gesture"},
            reason="Gesture activation is suppressed while sleeping.",
        )
        norm = ControlSurfaceNorm(
            norm_id=stable_control_surface_id("norm", "ignore wrist gestures at night"),
            outcome=DeonticOutcome.DENY,
            effect=effect,
            actor="user:operator-7",
            surface="gesture",
            surface_event="wrist_raise",
            method="activate",
            target_ref="widget:primary-action",
            guards=[sleeping, quiet_hours],
            priority=100,
            source_text="Ignore my wrist gestures at night, because I'm sleeping.",
            explanation="Deny wrist gesture activation when sleeping and quiet hours hold.",
        )

        policy = policy_from_interaction(
            policy_id="policy:quiet-hours-gestures",
            envelope=envelope,
            norms=[norm],
            source_text="Ignore my wrist gestures at night, because I'm sleeping.",
            compiled_policy_cid="bafy-policy-quiet-hours",
            explanations=["Compiled as a prohibition over gesture-originated activation."],
        )
        payload = policy.as_dict()

        self.assertEqual(payload["compiled_policy_cid"], "bafy-policy-quiet-hours")
        self.assertEqual(payload["norms"][0]["outcome"], "deny")
        self.assertEqual(payload["norms"][0]["surface"], "gesture")
        self.assertEqual(payload["norms"][0]["surface_event"], "wrist_raise")
        self.assertEqual(payload["norms"][0]["effect"]["method"], "activate")
        self.assertEqual(payload["norms"][0]["effect"]["target_ref"], "widget:primary-action")
        self.assertIn("holds_at(state_frame:sleeping)", payload["norms"][0]["guards"][0]["event_calculus"])
        self.assertIn("time_window:quiet_hours", payload["norms"][0]["guards"][1]["event_calculus"][0])

        self.assertEqual(policy.norms_by_outcome(DeonticOutcome.DENY), [norm])
        self.assertGreaterEqual(len(policy.facts_by_kind(FrameFactKind.CONTEXT)), 3)

    def test_confirmation_outcome_marks_target_effect_as_confirmable(self) -> None:
        effect = InvocationEffect.from_intent(
            outcome="require_confirmation",
            method="send_message",
            target_ref="service:messaging",
            arguments={"body": "hello"},
        )

        self.assertTrue(effect.confirmation_required)
        self.assertEqual(effect.as_dict()["outcome"], "require_confirmation")

    def test_stable_ids_are_deterministic(self) -> None:
        first = stable_control_surface_id("fact", "gesture", "wrist_raise")
        second = stable_control_surface_id("fact", "Gesture", " wrist_raise ")

        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()

