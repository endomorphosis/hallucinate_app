"""Tests for AI-agent control-surface delegation-aware mediation."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_agents import (  # noqa: E402
    AgentResolutionError,
    normalize_agent_interaction,
    resolve_agent_interaction,
)
from hallucinate_app.control_surface_logic_ir import (  # noqa: E402
    ControlSurfaceNorm,
    ControlSurfacePolicy,
    DeonticOutcome,
    InvocationEffect,
    stable_control_surface_id,
)


class TestControlSurfaceAgents(unittest.TestCase):
    def test_agent_proposal_preserves_delegation_metadata_and_hits_confirmation_gate(self) -> None:
        policy = _agent_confirmation_policy(surface_event="proposal", method="send_message")

        resolution = resolve_agent_interaction(
            {
                "interaction_id": "agent-proposal-001",
                "surface_event": "proposal",
                "proposal_id": "proposal-17",
                "method": "send_message",
                "intent": "communication.send",
                "target_ref": "service:messaging",
                "arguments": {"body": "status update"},
                "actor": {
                    "type": "agent",
                    "id": "planner-agent",
                    "delegation_chain": ["operator-7", "scheduler-agent", "planner-agent"],
                },
                "ucan": {"cid": "bafy-proposal-ucan"},
            },
            context=_runtime_context(),
            active_policy_bundles=[policy],
            decided_at="2026-05-24T17:00:01Z",
        )
        payload = resolution.as_dict()

        self.assertEqual(payload["interaction_envelope"]["surface"], "agent")
        self.assertEqual(payload["interaction_envelope"]["surface_event"], "proposal")
        self.assertEqual(
            payload["interaction_envelope"]["actor"]["delegation_chain"],
            ["operator-7", "scheduler-agent", "planner-agent"],
        )
        self.assertEqual(
            payload["interaction_envelope"]["context"]["device_context"]["agent_event"],
            "proposal",
        )
        self.assertEqual(payload["policy_decision"]["outcome"], "require_confirmation")
        self.assertTrue(payload["requires_confirmation"])
        self.assertFalse(payload["can_execute"])
        self.assertFalse(payload["delegation"]["required"])
        self.assertTrue(payload["delegation"]["authorized"])
        self.assertEqual(payload["delegation"]["ucan_cid"], "bafy-proposal-ucan")

    def test_autonomous_invoke_with_matching_ucan_delegation_can_execute(self) -> None:
        policy = _agent_allow_policy(
            method="send_message",
            target_ref="service:messaging",
            delegation=_message_delegation_grant(),
        )

        resolution = resolve_agent_interaction(
            _autonomous_payload(
                interaction_id="agent-autonomous-send-001",
                method="send_message",
                intent="communication.send",
                target_ref="service:messaging",
                arguments={"body": "daily summary"},
            ),
            context=_runtime_context(),
            active_policy_bundles=[policy],
            decided_at="2026-05-24T17:00:01Z",
        )
        payload = resolution.as_dict()

        self.assertEqual(payload["policy_decision"]["outcome"], "allow")
        self.assertTrue(payload["can_execute"])
        self.assertFalse(payload["requires_confirmation"])
        self.assertTrue(payload["delegation"]["required"])
        self.assertTrue(payload["delegation"]["authorized"])
        self.assertEqual(payload["delegation"]["grant_ref"], "delegation:message-send")
        self.assertEqual(payload["delegation"]["ucan_cid"], "bafy-ucan-message")
        self.assertEqual(
            payload["policy_decision"]["compiled_policy_cid"],
            "compiled:agent-send_message",
        )
        self.assertEqual(payload["policy_decision"]["effects"][0]["method"], "send_message")

    def test_autonomous_invoke_cannot_expand_beyond_compiled_delegation(self) -> None:
        policy = _agent_allow_policy(
            method="*",
            target_ref="*",
            delegation=_message_delegation_grant(),
            policy_id="policy:permissive-agent-runtime",
            compiled_policy_cid="compiled:permissive-agent-runtime",
        )

        resolution = resolve_agent_interaction(
            _autonomous_payload(
                interaction_id="agent-autonomous-delete-001",
                method="delete_record",
                intent="destructive.delete_record",
                target_ref="service:records",
                arguments={"record_id": "rec-7"},
            ),
            context=_runtime_context(),
            active_policy_bundles=[policy],
            decided_at="2026-05-24T17:00:01Z",
        )
        payload = resolution.as_dict()

        self.assertEqual(payload["policy_decision"]["outcome"], "deny")
        self.assertFalse(payload["can_execute"])
        self.assertTrue(payload["delegation"]["required"])
        self.assertFalse(payload["delegation"]["authorized"])
        self.assertEqual(payload["policy_decision"]["metadata"]["base_outcome"], "allow")
        self.assertFalse(payload["policy_decision"]["metadata"]["agent_delegation_authorized"])
        self.assertIn("No compiled UCAN/delegation grant matched", payload["policy_decision"]["explanation"])
        self.assertEqual(payload["policy_decision"]["effects"][0]["method"], "delete_record")
        self.assertEqual(payload["policy_decision"]["effects"][0]["target_ref"], "service:records")
        self.assertEqual(
            payload["policy_decision"]["compiled_policy_cid"],
            "compiled:permissive-agent-runtime",
        )

    def test_scheduled_action_with_invalid_delegation_chain_fails_closed(self) -> None:
        policy = _agent_allow_policy(
            method="send_message",
            target_ref="service:messaging",
            delegation=_message_delegation_grant(),
        )

        resolution = resolve_agent_interaction(
            {
                "interaction_id": "agent-scheduled-invalid-chain-001",
                "surface_event": "scheduled_action",
                "method": "send_message",
                "target_ref": "service:messaging",
                "scheduled_for": "2026-05-24T18:00:00Z",
                "actor": {
                    "type": "agent",
                    "id": "planner-agent",
                    "delegation_chain": ["operator-7", "scheduler-agent"],
                },
            },
            context=_runtime_context(),
            active_policy_bundles=[policy],
            decided_at="2026-05-24T17:00:01Z",
        )

        self.assertEqual(resolution.decision.outcome, "deny")
        self.assertFalse(resolution.can_execute)
        self.assertIn("terminate at the invoking agent", resolution.delegation.reason)

    def test_missing_agent_method_fails_before_mediation(self) -> None:
        with self.assertRaises(AgentResolutionError):
            normalize_agent_interaction({"surface_event": "autonomous_invoke"})


def _runtime_context() -> dict[str, object]:
    return {
        "local_time": "2026-05-24T17:00:00+00:00",
        "state_frames": [],
        "device_mode": "interactive",
        "platform": "hallucinate_app",
        "device_context": {"surface": "desktop-shell"},
    }


def _agent_actor() -> dict[str, object]:
    return {
        "type": "agent",
        "id": "planner-agent",
        "delegation_chain": ["operator-7", "scheduler-agent", "planner-agent"],
    }


def _autonomous_payload(
    *,
    interaction_id: str,
    method: str,
    intent: str,
    target_ref: str,
    arguments: dict[str, object],
) -> dict[str, object]:
    return {
        "interaction_id": interaction_id,
        "surface_event": "autonomous_invoke",
        "method": method,
        "intent": intent,
        "target_ref": target_ref,
        "arguments": arguments,
        "actor": _agent_actor(),
        "ucan_cid": "bafy-ucan-message",
    }


def _message_delegation_grant() -> dict[str, object]:
    return {
        "grant_ref": "delegation:message-send",
        "ucan_cid": "bafy-ucan-message",
        "delegation_chain": ["operator-7", "scheduler-agent", "planner-agent"],
        "agent_id": "planner-agent",
        "surfaces": ["agent"],
        "events": ["autonomous_invoke", "scheduled_action"],
        "methods": ["send_message"],
        "target_refs": ["service:messaging"],
        "expires_at": "2026-05-25T00:00:00Z",
    }


def _agent_allow_policy(
    *,
    method: str,
    target_ref: str,
    delegation: dict[str, object],
    policy_id: str | None = None,
    compiled_policy_cid: str | None = None,
) -> ControlSurfacePolicy:
    policy_id = policy_id or f"policy:agent-{method}"
    compiled_policy_cid = compiled_policy_cid or f"compiled:agent-{method}"
    reason = f"Allow delegated agent {method}."
    return ControlSurfacePolicy(
        policy_id=policy_id,
        norms=[
            ControlSurfaceNorm(
                norm_id=stable_control_surface_id("norm", policy_id, method, target_ref),
                outcome=DeonticOutcome.ALLOW,
                effect=InvocationEffect.from_intent(
                    outcome=DeonticOutcome.ALLOW,
                    method=method,
                    target_ref=target_ref,
                    reason=reason,
                ),
                actor="agent:*",
                surface="agent",
                surface_event="*",
                method=method,
                target_ref=target_ref,
                priority=80,
                explanation=reason,
            )
        ],
        compiled_policy_cid=compiled_policy_cid,
        compiled_artifacts={
            "compiler_lane": "NLUCANPolicyCompiler",
            "delegations": [delegation],
        },
        explanations=[reason],
    )


def _agent_confirmation_policy(*, surface_event: str, method: str) -> ControlSurfacePolicy:
    reason = f"Agent {method} proposals require confirmation."
    return ControlSurfacePolicy(
        policy_id="policy:agent-proposal-confirmation",
        norms=[
            ControlSurfaceNorm(
                norm_id=stable_control_surface_id("norm", "agent-proposal-confirmation", method),
                outcome=DeonticOutcome.REQUIRE_CONFIRMATION,
                effect=InvocationEffect.from_intent(
                    outcome=DeonticOutcome.REQUIRE_CONFIRMATION,
                    method=method,
                    target_ref="service:messaging",
                    reason=reason,
                ),
                actor="agent:*",
                surface="agent",
                surface_event=surface_event,
                method=method,
                target_ref="service:messaging",
                priority=100,
                explanation=reason,
            )
        ],
        compiled_policy_cid="compiled:agent-proposal-confirmation",
        compiled_artifacts={"compiler_lane": "strict_template", "deontic_outcomes": ["require_confirmation"]},
        explanations=[reason],
    )


if __name__ == "__main__":
    unittest.main()
