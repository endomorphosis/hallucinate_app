"""Tests for mouse, touch, and pointer control-surface resolution."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_intents import normalize_interaction  # noqa: E402
from hallucinate_app.control_surface_logic_ir import (  # noqa: E402
    ControlSurfaceNorm,
    ControlSurfacePolicy,
    DeonticOutcome,
    InvocationEffect,
    stable_control_surface_id,
)
from hallucinate_app.control_surface_mediator import evaluate_control_surface_interaction  # noqa: E402
from hallucinate_app.control_surface_pointer import (  # noqa: E402
    PointerResolutionError,
    normalize_pointer_interaction,
    resolve_pointer_interaction,
)
from hallucinate_app.control_surface_policy import compile_strict_template_rule  # noqa: E402


class TestControlSurfacePointer(unittest.TestCase):
    def test_mouse_click_normalizes_into_canonical_envelope_and_allows_by_default(self) -> None:
        resolution = resolve_pointer_interaction(
            {
                "interaction_id": "mouse-click-001",
                "event_type": "click",
                "pointer_type": "mouse",
                "target_ref": "widget:primary-action",
                "button": 0,
            },
            actor={"type": "user", "id": "operator-7", "delegation_chain": ["operator-7"]},
            context={
                "local_time": "2026-05-24T10:00:00-07:00",
                "state_frames": ["focused"],
                "device_mode": "interactive",
                "platform": "hallucinate_app",
            },
            decided_at="2026-05-24T10:00:01Z",
        )

        envelope = resolution.envelope.as_dict()
        decision = resolution.decision.as_dict()

        self.assertEqual(envelope["surface"], "mouse")
        self.assertEqual(envelope["surface_event"], "click")
        self.assertEqual(envelope["raw_payload"]["pointer_type"], "mouse")
        self.assertEqual(envelope["normalized_intent"]["intent"], "display.activate")
        self.assertEqual(envelope["normalized_intent"]["method"], "activate")
        self.assertEqual(envelope["normalized_intent"]["target_ref"], "widget:primary-action")
        self.assertEqual(envelope["normalized_intent"]["arguments"]["button"], 0)
        self.assertEqual(decision["outcome"], "allow")
        self.assertTrue(resolution.can_execute)
        self.assertEqual(decision["effects"][0]["target_ref"], "widget:primary-action")
        self.assertEqual(decision["metadata"]["mediator_version"], "0.1.0")

    def test_touch_event_alias_resolves_to_click_with_touch_pointer_metadata(self) -> None:
        envelope = normalize_pointer_interaction(
            {
                "interaction_id": "touch-click-001",
                "type": "touchend",
                "target": {"targetRef": "widget:primary-action"},
                "arguments": {"touch_id": "touch-9"},
                "platform": "hallucinate_app",
            },
            actor={"type": "user", "id": "operator-7", "delegation_chain": ["operator-7"]},
        ).as_dict()

        self.assertEqual(envelope["surface"], "mouse")
        self.assertEqual(envelope["surface_event"], "click")
        self.assertEqual(envelope["raw_payload"]["pointer_type"], "touch")
        self.assertEqual(envelope["normalized_intent"]["target_ref"], "widget:primary-action")
        self.assertEqual(envelope["normalized_intent"]["arguments"]["pointer_type"], "touch")
        self.assertEqual(envelope["normalized_intent"]["arguments"]["touch_id"], "touch-9")
        self.assertEqual(envelope["context"]["device_context"]["pointer_type"], "touch")

    def test_hover_and_focus_pointer_events_map_to_focus_next_intent(self) -> None:
        for raw_event, expected_event in (("mouseenter", "hover"), ("focusin", "focus")):
            with self.subTest(raw_event=raw_event):
                envelope = normalize_pointer_interaction(
                    {
                        "interaction_id": f"pointer-{expected_event}-001",
                        "event_type": raw_event,
                        "pointerType": "mouse",
                        "target_ref": "widget:list",
                    }
                ).as_dict()

                self.assertEqual(envelope["surface_event"], expected_event)
                self.assertEqual(envelope["normalized_intent"]["intent"], "display.focus_next")
                self.assertEqual(envelope["normalized_intent"]["method"], "focus_next")
                self.assertEqual(envelope["normalized_intent"]["target_ref"], "widget:list")
                self.assertEqual(
                    envelope["normalized_intent"]["arguments"]["focus_reason"],
                    expected_event,
                )

    def test_pointer_send_message_uses_same_confirmation_policy_as_voice(self) -> None:
        policy = compile_strict_template_rule("require confirmation before sending messages")
        pointer = resolve_pointer_interaction(
            {
                "interaction_id": "pointer-send-message-001",
                "event_type": "click",
                "target_ref": "service:messaging",
                "intent": "communication.send",
                "method": "send_message",
                "arguments": {"body": "hello"},
            },
            actor={"type": "user", "id": "operator-7", "delegation_chain": ["operator-7"]},
            context=_daytime_context(),
            active_policy_bundles=[policy],
            decided_at="2026-05-24T10:00:01Z",
        )
        voice = evaluate_control_surface_interaction(
            normalize_interaction(
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
                context=_daytime_context(),
            ),
            active_policy_bundles=[policy],
            decided_at="2026-05-24T10:00:01Z",
        )

        self.assertEqual(pointer.decision.outcome, "require_confirmation")
        self.assertEqual(voice.outcome, "require_confirmation")
        self.assertTrue(pointer.requires_confirmation)
        self.assertFalse(pointer.can_execute)
        self.assertEqual(pointer.decision.effects[0].method, voice.effects[0].method)
        self.assertEqual(pointer.decision.effects[0].target_ref, voice.effects[0].target_ref)
        self.assertEqual(pointer.envelope.surface, "mouse")
        self.assertEqual(pointer.envelope.surface_event, "click")

    def test_destructive_pointer_click_hits_confirmation_gate_before_invoke(self) -> None:
        resolution = resolve_pointer_interaction(
            {
                "interaction_id": "pointer-delete-item-001",
                "event_type": "click",
                "pointer_type": "mouse",
                "target_ref": "item:message-7",
                "intent": "destructive.delete_item",
                "method": "delete_item",
                "arguments": {"item_id": "message-7"},
                "risk_class": "destructive",
            },
            actor={"type": "user", "id": "operator-7", "delegation_chain": ["operator-7"]},
            context=_daytime_context(),
            active_policy_bundles=[_destructive_confirmation_policy()],
            decided_at="2026-05-24T10:00:01Z",
        )
        payload = resolution.as_dict()

        self.assertEqual(payload["policy_decision"]["outcome"], "require_confirmation")
        self.assertFalse(payload["can_execute"])
        self.assertTrue(payload["requires_confirmation"])
        self.assertEqual(payload["policy_decision"]["effects"][0]["method"], "delete_item")
        self.assertEqual(payload["policy_decision"]["effects"][0]["target_ref"], "item:message-7")
        self.assertTrue(payload["policy_decision"]["effects"][0]["confirmation_required"])
        self.assertEqual(
            payload["interaction_envelope"]["normalized_intent"]["arguments"]["risk_class"],
            "destructive",
        )

    def test_unsupported_pointer_event_fails_closed_before_mediation(self) -> None:
        with self.assertRaises(PointerResolutionError):
            normalize_pointer_interaction({"event_type": "wheel", "target_ref": "widget:list"})


def _daytime_context() -> dict[str, object]:
    return {
        "local_time": "2026-05-24T10:00:00-07:00",
        "state_frames": [],
        "device_mode": "interactive",
        "platform": "hallucinate_app",
        "device_context": {"surface": "desktop-shell"},
    }


def _destructive_confirmation_policy() -> ControlSurfacePolicy:
    outcome = DeonticOutcome.REQUIRE_CONFIRMATION
    reason = "Destructive pointer actions require user confirmation."
    return ControlSurfacePolicy(
        policy_id="policy:destructive-pointer-confirmation",
        norms=[
            ControlSurfaceNorm(
                norm_id=stable_control_surface_id(
                    "norm",
                    "destructive-pointer-confirmation",
                    "delete_item",
                ),
                outcome=outcome,
                effect=InvocationEffect.from_intent(
                    outcome=outcome,
                    method="delete_item",
                    target_ref="target:*",
                    reason=reason,
                ),
                actor="user:*",
                surface="mouse",
                surface_event="click",
                method="delete_item",
                target_ref="item:*",
                priority=100,
                source_text=reason,
                explanation=reason,
                metadata={"risk_class": "destructive"},
            )
        ],
        compiled_policy_cid="compiled:destructive-pointer-confirmation",
        explanations=[reason],
    )


if __name__ == "__main__":
    unittest.main()
