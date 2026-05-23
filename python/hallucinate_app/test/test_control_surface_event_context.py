"""Tests for runtime context event-calculus extraction."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_context import RuntimeContext  # noqa: E402
from hallucinate_app.control_surface_intents import normalize_interaction  # noqa: E402
from hallucinate_app.control_surface_logic_ir import (  # noqa: E402
    context_facts_from_runtime_context,
    event_calculus_facts_from_interaction,
    frame_facts_from_interaction,
)


class TestControlSurfaceEventContext(unittest.TestCase):
    def test_quiet_hours_sleeping_context_yields_frame_and_event_calculus_facts(self) -> None:
        context = RuntimeContext.from_mapping(
            {
                "local_time": "2026-05-23T23:15:00-07:00",
                "state_frames": ["sleeping"],
                "device_mode": "quiet_hours",
                "platform": "hallucinate_app",
                "device_context": {"timezone": "America/Los_Angeles"},
            }
        )

        extraction = context_facts_from_runtime_context(context)
        facts = [fact.as_dict() for fact in extraction.frame_facts]
        atoms = extraction.event_calculus_atoms()

        self.assertTrue(_has_fact(facts, "context", "sleeping", True))
        self.assertTrue(_has_fact(facts, "context", "quiet_hours", True))
        self.assertTrue(_has_fact(facts, "context", "at_night", True))
        self.assertTrue(_has_fact(facts, "device", "device_mode.quiet_hours", True))

        self.assertIn(
            "holds_at(state_frame:sleeping,2026-05-23T23:15:00-07:00)",
            atoms,
        )
        self.assertIn(
            "initiates(context_state_observed,state_frame:sleeping,2026-05-23T23:15:00-07:00)",
            atoms,
        )
        self.assertIn(
            "holds_at(time_window:quiet_hours,2026-05-23T23:15:00-07:00)",
            atoms,
        )
        self.assertIn(
            "initiates(context_time_observed,time_window:at_night,2026-05-23T23:15:00-07:00)",
            atoms,
        )
        self.assertIn(
            "holds_at(device_mode:quiet_hours,2026-05-23T23:15:00-07:00)",
            atoms,
        )

    def test_daytime_driving_meeting_context_terminates_prior_night_fluents(self) -> None:
        context = RuntimeContext.from_mapping(
            {
                "local_time": "2026-05-24T11:30:00-07:00",
                "state_frames": ["driving", "meeting"],
                "device_mode": "car_mode",
                "platform": "hallucinate_app",
                "device_context": {
                    "previous_state_frames": ["sleeping"],
                    "previous_device_mode": "quiet_hours",
                    "calendar_status": "meeting",
                },
            }
        )

        extraction = context_facts_from_runtime_context(context)
        facts = [fact.as_dict() for fact in extraction.frame_facts]
        atoms = extraction.event_calculus_atoms()

        self.assertTrue(_has_fact(facts, "context", "driving", True))
        self.assertTrue(_has_fact(facts, "context", "meeting", True))
        self.assertTrue(_has_fact(facts, "device", "device_mode.car_mode", True))

        self.assertIn(
            "holds_at(state_frame:driving,2026-05-24T11:30:00-07:00)",
            atoms,
        )
        self.assertIn(
            "holds_at(state_frame:meeting,2026-05-24T11:30:00-07:00)",
            atoms,
        )
        self.assertIn(
            "terminates(context_state_observed,state_frame:sleeping,2026-05-24T11:30:00-07:00)",
            atoms,
        )
        self.assertIn(
            "terminates(context_time_observed,time_window:quiet_hours,2026-05-24T11:30:00-07:00)",
            atoms,
        )
        self.assertIn(
            "terminates(context_device_mode_observed,device_mode:quiet_hours,2026-05-24T11:30:00-07:00)",
            atoms,
        )

    def test_interaction_envelope_includes_derived_context_for_gating(self) -> None:
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
                "state_frames": ["sleeping"],
                "device_mode": "quiet_hours",
                "platform": "hallucinate_app",
                "device_context": {"surface": "desktop-shell"},
            },
        )

        frame_facts = [fact.as_dict() for fact in frame_facts_from_interaction(envelope)]
        event_atoms = [fact.atom() for fact in event_calculus_facts_from_interaction(envelope)]

        self.assertTrue(_has_fact(frame_facts, "context", "sleeping", True))
        self.assertTrue(_has_fact(frame_facts, "context", "quiet_hours", True))
        self.assertTrue(_has_fact(frame_facts, "context", "at_night", True))
        self.assertTrue(_has_fact(frame_facts, "device", "device_mode", "quiet_hours"))
        self.assertIn(
            "holds_at(time_window:quiet_hours,2026-05-23T23:15:00-07:00)",
            event_atoms,
        )
        self.assertIn(
            "holds_at(device_mode:quiet_hours,2026-05-23T23:15:00-07:00)",
            event_atoms,
        )


def _has_fact(facts: list[dict[str, object]], kind: str, predicate: str, value: object) -> bool:
    return any(
        fact["kind"] == kind
        and fact["predicate"] == predicate
        and fact["value"] == value
        for fact in facts
    )


if __name__ == "__main__":
    unittest.main()
