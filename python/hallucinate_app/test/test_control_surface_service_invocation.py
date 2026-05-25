"""Tests for MCP/ORB service invocation mediation."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_policy import compile_strict_template_rule  # noqa: E402
from hallucinate_app.control_surface_service_invocation import (  # noqa: E402
    ServiceInvocationMediationError,
    before_invoke_service,
    invoke_service_after_mediation,
    require_service_invocation_allowed,
)


class TestControlSurfaceServiceInvocation(unittest.TestCase):
    def test_mcp_service_invocation_requires_confirmation_before_invoke(self) -> None:
        policy = compile_strict_template_rule("require confirmation before delete content")

        mediation = before_invoke_service(
            {
                "transport": "mcp-server",
                "daemon_id": "ipfs-kit",
                "method": "delete_content",
                "arguments": {"cid": "bafy-test"},
                "correlation_id": "mcp-delete-001",
                "actor": {"type": "user", "id": "operator-7"},
            },
            active_policy_bundles=[policy],
            decided_at="2026-05-24T10:00:01Z",
            emitted_at="2026-05-24T10:00:02Z",
            control_surface_contract_ref="control_surface_contract:mcp-daemon:ipfs-kit",
        )
        payload = mediation.as_dict()

        self.assertFalse(mediation.can_invoke)
        self.assertEqual(payload["interaction_envelope"]["surface"], "agent")
        self.assertEqual(payload["interaction_envelope"]["surface_event"], "autonomous_invoke")
        self.assertEqual(payload["interaction_envelope"]["normalized_intent"]["method"], "delete_content")
        self.assertEqual(payload["policy_decision"]["outcome"], "require_confirmation")
        self.assertFalse(payload["mediation_receipt"]["mediation_result"]["invoked"])
        self.assertEqual(
            payload["mediation_receipt"]["metadata"]["service_invocation"]["before_invoke_hook"],
            "hallucinate_app.control_surface_service_invocation.before_invoke_service",
        )

    def test_blocking_policy_raises_before_transport_callback_runs(self) -> None:
        policy = compile_strict_template_rule("require confirmation before delete content")

        with self.assertRaises(ServiceInvocationMediationError) as raised:
            require_service_invocation_allowed(
                {
                    "transport": "orb",
                    "service_id": "display-widget",
                    "operation": "delete_content",
                    "actor": {"type": "user", "id": "operator-7"},
                },
                active_policy_bundles=[policy],
            )

        self.assertEqual(raised.exception.mediation.transport, "orb")
        self.assertEqual(raised.exception.mediation.policy_decision.outcome, "require_confirmation")

    def test_allowed_invocation_calls_transport_after_mediation(self) -> None:
        observed: dict[str, object] = {}

        def invoke(payload, mediation):
            observed["payload"] = payload
            observed["decision"] = mediation.policy_decision.as_dict()
            return {"ok": True, "method": payload["method"]}

        result = invoke_service_after_mediation(
            {
                "transport": "mcp-server",
                "daemon_id": "ipfs-datasets",
                "tool_name": "list_datasets",
                "params": {"limit": 5},
                "actor": {"type": "user", "id": "operator-7"},
            },
            invoke,
            decided_at="2026-05-24T10:00:01Z",
            emitted_at="2026-05-24T10:00:02Z",
        )

        self.assertEqual(result, {"ok": True, "method": "list_datasets"})
        self.assertEqual(observed["payload"]["method"], "list_datasets")
        self.assertEqual(observed["payload"]["arguments"], {"limit": 5})
        self.assertEqual(observed["decision"]["outcome"], "allow")


if __name__ == "__main__":
    unittest.main()
