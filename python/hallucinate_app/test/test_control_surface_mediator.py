"""Tests for runtime control-surface mediation decisions."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_intents import normalize_interaction  # noqa: E402
from hallucinate_app.control_surface_logic_ir import (  # noqa: E402
    ControlSurfaceNorm,
    ControlSurfacePolicy,
    DeonticOutcome,
    InvocationEffect,
    TemporalGuard,
    stable_control_surface_id,
)
from hallucinate_app.control_surface_mediator import (  # noqa: E402
    ControlSurfaceMediator,
    evaluate_control_surface_interaction,
    load_active_policy_bundles,
)
from hallucinate_app.control_surface_policy import compile_strict_template_rule  # noqa: E402
from hallucinate_app.control_surface_store import PolicyBundleStore  # noqa: E402


class TestControlSurfaceMediator(unittest.TestCase):
    def _gesture_envelope(self, *, local_time: str = "2026-05-23T23:15:00-07:00"):
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
                "local_time": local_time,
                "state_frames": ["sleeping"],
                "device_mode": "quiet_hours",
                "platform": "hallucinate_app",
                "device_context": {"timezone": "America/Los_Angeles"},
            },
        )

    def _message_envelope(self):
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

    def test_persisted_quiet_hours_policy_denies_matching_gesture_before_invoke(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            store = PolicyBundleStore(tmpdir)
            policy = compile_strict_template_rule(
                "Ignore my wrist gestures at night, because I'm sleeping.",
                actor="user:*",
                timezone="America/Los_Angeles",
            )
            record = store.persist_policy_bundle(
                policy,
                user_id="operator-7",
                profile_id="desktop",
            )

            active = load_active_policy_bundles(
                store,
                user_id="operator-7",
                profile_id="desktop",
            )
            decision = ControlSurfaceMediator(active).evaluate(
                self._gesture_envelope(),
                decided_at="2026-05-23T23:15:01Z",
            )
            payload = decision.as_dict()

            self.assertEqual(decision.outcome, "deny")
            self.assertFalse(decision.can_execute)
            self.assertEqual(payload["policy_bundle_ref"]["policy_cid"], record.policy_cid)
            self.assertEqual(payload["compiled_policy_cid"], record.compiled_policy_cid)
            self.assertEqual(payload["matched_norms"][0]["outcome"], "deny")
            self.assertEqual(payload["effects"][0]["method"], "activate")
            self.assertEqual(payload["effects"][0]["target_ref"], "widget:primary-action")
            self.assertIn("deny_over_permit", payload["metadata"]["conflict_resolution"])
            self.assertTrue(
                any(
                    fact["predicate"] == "quiet_hours" and fact["value"] is True
                    for fact in payload["frame_facts"]
                )
            )

    def test_guarded_policy_does_not_match_when_quiet_hours_is_absent(self) -> None:
        policy = compile_strict_template_rule(
            "Ignore my wrist gestures at night, because I'm sleeping.",
            timezone="America/Los_Angeles",
        )

        decision = evaluate_control_surface_interaction(
            self._gesture_envelope(local_time="2026-05-24T12:15:00-07:00"),
            active_policy_bundles=[policy],
            decided_at="2026-05-24T12:15:01Z",
        )

        # UIR-034: no matching norm fails closed (never default-allows).
        self.assertEqual(decision.outcome, "require_confirmation")
        self.assertFalse(decision.can_execute)
        self.assertEqual(decision.matched_norms, [])
        self.assertTrue(decision.metadata.get("fail_closed"))
        self.assertEqual(
            decision.effects[0].outcome,
            DeonticOutcome.REQUIRE_CONFIRMATION.value,
        )

    def test_confirmation_policy_blocks_execution_until_confirmed(self) -> None:
        policy = compile_strict_template_rule("require confirmation before sending messages")

        decision = evaluate_control_surface_interaction(
            self._message_envelope(),
            active_policy_bundles=[policy],
            decided_at="2026-05-24T10:00:01Z",
        )
        payload = decision.as_dict()

        self.assertEqual(decision.outcome, "require_confirmation")
        self.assertTrue(decision.requires_confirmation)
        self.assertFalse(decision.can_execute)
        self.assertTrue(payload["effects"][0]["confirmation_required"])
        self.assertEqual(payload["effects"][0]["method"], "send_message")
        self.assertEqual(payload["effects"][0]["arguments"]["body"], "hello")

    def test_deny_over_permit_selects_deny_even_when_allow_has_higher_priority(self) -> None:
        allow_norm = _norm(
            "allow",
            DeonticOutcome.ALLOW,
            priority=200,
            reason="Mouse or gesture activation is allowed by default.",
        )
        deny_norm = _norm(
            "deny",
            DeonticOutcome.DENY,
            priority=10,
            guards=[TemporalGuard.state_frame("sleeping")],
            reason="Sleeping state suppresses activation.",
        )
        policy = ControlSurfacePolicy(
            policy_id="policy:conflict",
            norms=[allow_norm, deny_norm],
            compiled_policy_cid="compiled:conflict",
            compiled_artifacts={"confidence": 0.88},
        )

        decision = evaluate_control_surface_interaction(
            self._gesture_envelope(),
            active_policy_bundles=[policy],
            decided_at="2026-05-23T23:15:01Z",
        )

        self.assertEqual(decision.outcome, "deny")
        self.assertIn("allow", decision.reasons[-1])
        self.assertEqual(decision.confidence, 0.88)

    def test_rich_effect_outcomes_preserve_rewrite_fallback_and_rate_limit_fields(self) -> None:
        for outcome, kwargs, expected in (
            (
                DeonticOutcome.REWRITE,
                {"rewrite_method": "preview_activate"},
                {"method": "preview_activate", "rewrite_method": "preview_activate"},
            ),
            (
                DeonticOutcome.FALLBACK_SURFACE,
                {"fallback_surface": "voice"},
                {"fallback_surface": "voice"},
            ),
            (
                DeonticOutcome.RATE_LIMIT,
                {"rate_limit_key": "gesture:activate"},
                {"rate_limit_key": "gesture:activate"},
            ),
            (
                DeonticOutcome.DEFER,
                {},
                {"outcome": "defer"},
            ),
        ):
            with self.subTest(outcome=outcome.value):
                policy = ControlSurfacePolicy(
                    policy_id=f"policy:{outcome.value}",
                    norms=[
                        _norm(
                            outcome.value,
                            outcome,
                            priority=50,
                            effect_kwargs=kwargs,
                            reason=f"{outcome.value} activation.",
                        )
                    ],
                    compiled_policy_cid=f"compiled:{outcome.value}",
                )

                decision = evaluate_control_surface_interaction(
                    self._gesture_envelope(),
                    active_policy_bundles=[policy],
                    decided_at="2026-05-23T23:15:01Z",
                )
                effect = decision.as_dict()["effects"][0]

                self.assertEqual(decision.outcome, outcome.value)
                for key, value in expected.items():
                    self.assertEqual(effect[key], value)


def _norm(
    suffix: str,
    outcome: DeonticOutcome,
    *,
    priority: int,
    guards: list[TemporalGuard] | None = None,
    reason: str,
    effect_kwargs: dict[str, str] | None = None,
) -> ControlSurfaceNorm:
    return ControlSurfaceNorm(
        norm_id=stable_control_surface_id("norm", suffix, outcome.value),
        outcome=outcome,
        effect=InvocationEffect(
            outcome=outcome,
            method="activate",
            target_ref="target:*",
            arguments={},
            reason=reason,
            **(effect_kwargs or {}),
        ),
        actor="user:*",
        surface="gesture",
        surface_event="wrist_raise",
        method="activate",
        target_ref="target:*",
        guards=list(guards or []),
        priority=priority,
        explanation=reason,
    )


if __name__ == "__main__":
    unittest.main()
