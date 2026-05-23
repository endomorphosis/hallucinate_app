"""Tests for strict-template control-surface policy compilation."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_logic_ir import (  # noqa: E402
    ControlSurfaceNorm,
    DeonticOutcome,
    TemporalGuard,
)
from hallucinate_app.control_surface_policy import (  # noqa: E402
    IGNORE_SURFACE_AT_TIME_TEMPLATE,
    REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE,
    STRICT_TEMPLATE_COMPILER_LANE,
    StrictTemplatePolicyError,
    compile_strict_template_rule,
    compile_strict_template_rule_result,
)


class TestControlSurfacePolicyTemplates(unittest.TestCase):
    def test_ignore_wrist_gestures_at_night_compiles_to_deny_norm(self) -> None:
        policy = compile_strict_template_rule(
            "ignore my wrist gestures at night",
            timezone="America/Los_Angeles",
        )

        self.assertEqual(policy.source_text, "ignore my wrist gestures at night")
        self.assertEqual(policy.compiled_artifacts["compiler_lane"], STRICT_TEMPLATE_COMPILER_LANE)
        self.assertEqual(policy.compiled_artifacts["matched_template"], IGNORE_SURFACE_AT_TIME_TEMPLATE)
        self.assertFalse(policy.compiled_artifacts["llm_used"])
        self.assertEqual(policy.compiled_artifacts["confidence"], 1.0)

        self.assertEqual(len(policy.norms), 1)
        norm = policy.norms[0]
        self.assertIsInstance(norm, ControlSurfaceNorm)
        self.assertEqual(norm.outcome, DeonticOutcome.DENY)
        self.assertEqual(norm.surface, "gesture")
        self.assertEqual(norm.surface_event, "wrist_raise")
        self.assertEqual(norm.method, "*")
        self.assertEqual(norm.target_ref, "*")
        self.assertEqual(norm.metadata["matched_template"], "ignore my {surface} at {time_window}")

        self.assertEqual(len(norm.guards), 1)
        night_guard = norm.guards[0]
        self.assertIsInstance(night_guard, TemporalGuard)
        self.assertEqual(night_guard.predicate, "quiet_hours")
        self.assertEqual(night_guard.start, "22:00")
        self.assertEqual(night_guard.end, "07:00")
        self.assertEqual(night_guard.timezone, "America/Los_Angeles")
        self.assertIn("time_window:quiet_hours", night_guard.event_calculus_atoms()[0])

    def test_ignore_template_can_capture_state_frame_from_because_clause(self) -> None:
        result = compile_strict_template_rule_result(
            "Ignore my wrist gestures at night, because I'm sleeping.",
            timezone="America/Los_Angeles",
        )

        self.assertEqual(result.matched_template, IGNORE_SURFACE_AT_TIME_TEMPLATE)
        self.assertEqual(result.confidence, 1.0)
        self.assertEqual(result.slots["state_frame"], "sleeping")

        guards = result.policy.norms[0].guards
        self.assertEqual([guard.predicate for guard in guards], ["state_frame", "quiet_hours"])
        self.assertEqual(guards[0].expected, "sleeping")
        self.assertIn("holds_at(state_frame:sleeping)", guards[0].event_calculus_atoms())

    def test_require_confirmation_before_sending_messages_compiles_to_confirmation_norm(self) -> None:
        policy = compile_strict_template_rule("require confirmation before sending messages")

        self.assertEqual(policy.compiled_artifacts["matched_template"], REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE)
        self.assertFalse(policy.compiled_artifacts["llm_used"])
        self.assertEqual(policy.explanations, [policy.norms[0].explanation])

        norm = policy.norms[0]
        self.assertEqual(norm.outcome, DeonticOutcome.REQUIRE_CONFIRMATION)
        self.assertEqual(norm.surface, "*")
        self.assertEqual(norm.surface_event, "*")
        self.assertEqual(norm.method, "send_message")
        self.assertEqual(norm.target_ref, "service:messaging")
        self.assertEqual(norm.metadata["matched_template"], "require confirmation before {method}")
        self.assertEqual(norm.metadata["slots"]["intent"], "communication.send")

        self.assertEqual(norm.effect.outcome, DeonticOutcome.REQUIRE_CONFIRMATION)
        self.assertEqual(norm.effect.method, "send_message")
        self.assertEqual(norm.effect.target_ref, "service:messaging")
        self.assertTrue(norm.effect.confirmation_required)

    def test_strict_templates_reject_unsupported_rules(self) -> None:
        with self.assertRaises(StrictTemplatePolicyError):
            compile_strict_template_rule("please be careful with messages")

        with self.assertRaises(StrictTemplatePolicyError):
            compile_strict_template_rule("ignore my elbow gestures at night")


if __name__ == "__main__":
    unittest.main()
