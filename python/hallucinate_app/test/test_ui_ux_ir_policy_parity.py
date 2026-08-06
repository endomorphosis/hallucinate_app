"""UIR-034: Python/TypeScript mediation fail-closed policy parity.

Aligns Hallucinate ``control_surface_mediator`` with SwissKnife
``mcp-control-surface-mediator`` so no-match / missing / invalid policy never
allows, and shared outcome vectors stay executor-spy safe.
"""

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
)
from hallucinate_app.control_surface_mediator import (  # noqa: E402
    DEFAULT_MISSING_POLICY_OUTCOME,
    SUPPORTED_OUTCOMES,
    evaluate_control_surface_interaction,
)
from hallucinate_app.control_surface_policy import compile_strict_template_rule  # noqa: E402

# Shared closed outcome catalogue (TS ControlSurfaceOutcome + Python SUPPORTED_OUTCOMES).
SHARED_OUTCOMES = (
    "allow",
    "deny",
    "require_confirmation",
    "defer",
    "rewrite",
    "fallback_surface",
    "rate_limit",
)

# SwissKnife DEFAULT_FAIL_CLOSED_OUTCOME
TS_FAIL_CLOSED_DEFAULT = "require_confirmation"


def _envelope(
    *,
    interaction_id: str = "parity-001",
    method: str = "send_message",
    confidence: float = 0.95,
):
    return normalize_interaction(
        interaction_id=interaction_id,
        surface="voice",
        surface_event="utterance",
        raw_payload={"text": "send it"},
        normalized_intent={
            "intent": "communication.send",
            "method": method,
            "target_ref": "service:messaging",
            "arguments": {"body": "hello"},
            "confidence": confidence,
        },
        actor={"type": "user", "id": "operator-7", "delegation_chain": ["operator-7"]},
        context={
            "local_time": "2026-05-24T10:00:00-07:00",
            "state_frames": [],
            "device_mode": "",
            "platform": "hallucinate_app",
        },
    )


def _allow_norm(method: str = "send_message") -> ControlSurfacePolicy:
    return ControlSurfacePolicy(
        policy_id="policy:parity-allow",
        compiled_policy_cid="compiled:parity-allow",
        norms=(
            ControlSurfaceNorm(
                norm_id="norm:parity-allow",
                outcome=DeonticOutcome.ALLOW,
                priority=50,
                actor="user:*",
                surface="*",
                surface_event="*",
                method=method,
                target_ref="target:*",
                effect=InvocationEffect(
                    outcome=DeonticOutcome.ALLOW,
                    method=method,
                    target_ref="target:*",
                    reason="parity allow",
                ),
                explanation="parity allow",
            ),
        ),
    )


class TestUIUXIRPolicyParity(unittest.TestCase):
    """Shared policy vectors and executor-spy fail-closed receipt."""

    def test_supported_outcomes_match_typescript_catalogue(self) -> None:
        self.assertEqual(tuple(SUPPORTED_OUTCOMES), SHARED_OUTCOMES)
        self.assertEqual(DEFAULT_MISSING_POLICY_OUTCOME, TS_FAIL_CLOSED_DEFAULT)

    def test_no_match_and_missing_policy_cannot_allow(self) -> None:
        empty = evaluate_control_surface_interaction(
            _envelope(interaction_id="parity-empty"),
            active_policy_bundles=[],
            decided_at="2026-05-24T10:00:01Z",
        )
        self.assertEqual(empty.outcome, "require_confirmation")
        self.assertFalse(empty.can_execute)
        self.assertTrue(empty.metadata.get("fail_closed"))
        self.assertEqual(empty.metadata.get("fail_closed_reason"), "missing_policy_bundle")

        # Policy present but no norm matches the method.
        quiet = compile_strict_template_rule(
            "Ignore my wrist gestures at night, because I'm sleeping.",
            timezone="America/Los_Angeles",
        )
        no_match = evaluate_control_surface_interaction(
            _envelope(interaction_id="parity-no-match"),
            active_policy_bundles=[quiet],
            decided_at="2026-05-24T10:00:01Z",
        )
        self.assertNotEqual(no_match.outcome, "allow")
        self.assertFalse(no_match.can_execute)
        self.assertTrue(no_match.metadata.get("fail_closed"))

    def test_invalid_missing_policy_outcome_config_fails_closed(self) -> None:
        decision = evaluate_control_surface_interaction(
            _envelope(interaction_id="parity-invalid-cfg"),
            active_policy_bundles=[],
            missing_policy_outcome="allow",  # invalid — must not honor
            decided_at="2026-05-24T10:00:01Z",
        )
        self.assertEqual(decision.outcome, "require_confirmation")
        self.assertFalse(decision.can_execute)

    def test_missing_policy_outcome_deny_vector(self) -> None:
        decision = evaluate_control_surface_interaction(
            _envelope(interaction_id="parity-deny-cfg"),
            active_policy_bundles=[],
            missing_policy_outcome="deny",
            decided_at="2026-05-24T10:00:01Z",
        )
        self.assertEqual(decision.outcome, "deny")
        self.assertFalse(decision.can_execute)

    def test_shared_outcome_vectors_with_executor_spy(self) -> None:
        vectors = [
            ("require confirmation before sending messages", "require_confirmation"),
            ("Ignore my wrist gestures at night, because I'm sleeping.", "require_confirmation"),
        ]
        for rule, expected in vectors:
            with self.subTest(rule=rule, expected=expected):
                policy = compile_strict_template_rule(rule, timezone="America/Los_Angeles")
                decision = evaluate_control_surface_interaction(
                    _envelope(interaction_id=f"parity-{expected}"),
                    active_policy_bundles=[policy],
                    decided_at="2026-05-24T10:00:01Z",
                )
                # Confirmation template matches send_message; quiet-hours does not.
                if "sending messages" in rule:
                    self.assertEqual(decision.outcome, "require_confirmation")
                else:
                    # No match → fail closed (not allow).
                    self.assertNotEqual(decision.outcome, "allow")
                self.assertFalse(decision.can_execute)

                calls: list = []

                def spy(_req=None, **_kwargs):  # type: ignore[no-untyped-def]
                    calls.append(True)
                    return "executed"

                if decision.can_execute:
                    spy()
                self.assertEqual(calls, [])

    def test_explicit_allow_reaches_executor_spy_once(self) -> None:
        decision = evaluate_control_surface_interaction(
            _envelope(interaction_id="parity-allow"),
            active_policy_bundles=[_allow_norm()],
            decided_at="2026-05-24T10:00:01Z",
        )
        self.assertEqual(decision.outcome, "allow")
        self.assertTrue(decision.can_execute)

        calls: list = []

        def spy():  # type: ignore[no-untyped-def]
            calls.append(decision.decision_id)
            return {"ok": True}

        if decision.can_execute:
            result = spy()
        else:
            result = None
        self.assertEqual(result, {"ok": True})
        self.assertEqual(len(calls), 1)

    def test_decision_identities_remain_compatible(self) -> None:
        decision = evaluate_control_surface_interaction(
            _envelope(interaction_id="parity-identity"),
            active_policy_bundles=[],
            decided_at="2026-05-24T10:00:01Z",
        )
        payload = decision.as_dict()
        self.assertTrue(payload["decision_id"])
        self.assertEqual(payload["interaction_id"], "parity-identity")
        self.assertIn("policy_bundle_ref", payload)
        self.assertIn("compiled_policy_cid", payload)
        self.assertIn("reasons", payload)
        self.assertIn("explanation", payload)
        self.assertIn("effects", payload)
        self.assertFalse(payload["metadata"]["can_execute"])
        self.assertEqual(payload["policy_bundle_ref"]["source"], "system_fail_closed")


if __name__ == "__main__":
    unittest.main()
