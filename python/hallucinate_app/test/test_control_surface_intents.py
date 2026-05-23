"""Tests for multimodal control-surface interaction normalization."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_intents import normalize_interaction


class TestControlSurfaceIntents(unittest.TestCase):
    def test_voice_event_normalizes_into_canonical_envelope(self) -> None:
        envelope = normalize_interaction(
            interaction_id="voice-001",
            surface="voice",
            surface_event="utterance",
            raw_payload={"text": "activate the primary widget"},
            normalized_intent={
                "intent": "display.activate",
                "method": "activate",
                "target_ref": "widget:primary-action",
                "arguments": {},
                "confidence": 0.94,
            },
            actor={"type": "user", "id": "operator-7", "delegation_chain": []},
            context={
                "local_time": "2026-05-23T23:15:00-07:00",
                "state_frames": ["awake", "focused"],
                "device_mode": "interactive",
                "platform": "hallucinate_app",
            },
        )

        payload = envelope.as_dict()
        self.assertEqual(payload["surface"], "voice")
        self.assertEqual(payload["surface_event"], "utterance")
        self.assertEqual(payload["normalized_intent"]["intent"], "display.activate")
        self.assertEqual(payload["actor"]["id"], "operator-7")
        self.assertEqual(payload["context"]["state_frames"], ["awake", "focused"])

    def test_agent_event_preserves_delegation_chain_and_context(self) -> None:
        envelope = normalize_interaction(
            interaction_id="agent-002",
            surface="agent",
            surface_event="proposal",
            raw_payload={"proposal_id": "p-17", "requested_by": "planner"},
            normalized_intent={
                "intent": "display.focus_next",
                "method": "focus_next",
                "target_ref": "workspace:main",
                "arguments": {"direction": "forward"},
                "confidence": 0.88,
            },
            actor={
                "type": "agent",
                "id": "planner-agent",
                "delegation_chain": ["operator-7", "scheduler", "planner-agent"],
            },
            context={
                "local_time": "2026-05-24T07:00:00+00:00",
                "state_frames": ["meeting"],
                "device_mode": "quiet_hours",
                "platform": "hallucinate_app",
                "device_context": {"surface": "desktop-shell"},
            },
        )

        payload = envelope.as_dict()
        self.assertEqual(payload["surface"], "agent")
        self.assertEqual(payload["normalized_intent"]["method"], "focus_next")
        self.assertEqual(
            payload["actor"]["delegation_chain"],
            ["operator-7", "scheduler", "planner-agent"],
        )
        self.assertEqual(payload["context"]["device_mode"], "quiet_hours")
        self.assertEqual(payload["context"]["device_context"]["surface"], "desktop-shell")


if __name__ == "__main__":
    unittest.main()