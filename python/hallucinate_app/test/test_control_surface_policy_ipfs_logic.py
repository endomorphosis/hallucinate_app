"""Tests for the optional ipfs_datasets_py control-surface policy lane."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_logic_ir import DeonticOutcome  # noqa: E402
from hallucinate_app.control_surface_policy import (  # noqa: E402
    IPFS_LOGIC_COMPILER_LANE,
    STRICT_TEMPLATE_COMPILER_LANE,
    NLPolicyClarificationRequired,
    StrictTemplatePolicyError,
    compile_control_surface_policy_rule,
    compile_control_surface_policy_rule_result,
    evaluate_ipfs_nl_policy,
)


class _FakeNLUCANPolicyCompiler:
    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs

    def compile_explain(self, sentences: list[str]) -> list[str]:
        return [f"NLUCANPolicyCompiler explained: {sentences[0]}"]


class _RecordingLogicAPI:
    NLUCANPolicyCompiler = _FakeNLUCANPolicyCompiler

    def __init__(
        self,
        *,
        confidence: float = 0.93,
        success: bool = True,
        clauses: list[dict[str, str]] | None = None,
    ) -> None:
        self.confidence = confidence
        self.success = success
        self.clauses = clauses if clauses is not None else [{"effect": "prohibit"}]
        self.compile_calls: list[tuple[list[str], dict[str, object]]] = []
        self.evaluate_calls: list[tuple[str, str, str | None]] = []

    def compile_nl_to_policy(self, sentences: list[str], **kwargs: object) -> object:
        self.compile_calls.append((sentences, dict(kwargs)))
        return SimpleNamespace(
            success=self.success,
            policy={"id": "upstream-policy"},
            clauses=self.clauses,
            dcec_formulas=["prohibited(agent, delete_record)"],
            errors=[] if self.success else ["parse failed"],
            warnings=["review upstream freeform parse"],
            metadata={
                "confidence": self.confidence,
                "policy_cid": "bafy-test-policy",
                "method": "delete_record",
                "target_ref": "service:records",
                "surface": "agent",
                "explanation": "Upstream compiler produced a deny norm.",
            },
        )

    def compile_explain_iter(self, sentences: list[str]) -> list[str]:
        return [f"Upstream explanation for {sentences[0]}"]

    def evaluate_nl_policy(self, nl_text: str, *, tool: str, actor: str | None = None, **_: object) -> object:
        self.evaluate_calls.append((nl_text, tool, actor))
        return SimpleNamespace(decision="deny", policy_cid="bafy-test-policy", reason="matched policy")

    def evaluate_with_manager(self, *_: object, **__: object) -> object:
        return SimpleNamespace(decision="deny")


class TestControlSurfacePolicyIpfsLogic(unittest.TestCase):
    def test_freeform_rule_routes_through_ipfs_logic_api(self) -> None:
        api = _RecordingLogicAPI()

        result = compile_control_surface_policy_rule_result(
            "Never let agents delete records after midnight",
            actor="user:alice",
            logic_api=api,
        )

        self.assertTrue(result.accepted)
        self.assertEqual(result.compiler_lane, IPFS_LOGIC_COMPILER_LANE)
        self.assertEqual(api.compile_calls[0][0], ["Never let agents delete records after midnight"])
        self.assertEqual(api.compile_calls[0][1]["default_actor"], "user:alice")

        policy = result.policy
        self.assertIsNotNone(policy)
        assert policy is not None
        self.assertEqual(policy.compiled_policy_cid, "bafy-test-policy")
        self.assertEqual(policy.compiled_artifacts["compiler_lane"], IPFS_LOGIC_COMPILER_LANE)
        self.assertIn("compile_nl_to_policy", policy.compiled_artifacts["compile_api"])
        self.assertIn("evaluate_nl_policy", policy.compiled_artifacts["evaluate_api"])
        self.assertIn("NLUCANPolicyCompiler", policy.compiled_artifacts["compiler_class"])
        self.assertIn("Upstream explanation", policy.explanations[0])

        norm = policy.norms[0]
        self.assertEqual(norm.outcome, DeonticOutcome.DENY)
        self.assertEqual(norm.surface, "agent")
        self.assertEqual(norm.method, "delete_record")
        self.assertEqual(norm.target_ref, "service:records")
        self.assertEqual(norm.metadata["compiler_lane"], IPFS_LOGIC_COMPILER_LANE)

    def test_low_confidence_result_requests_clarification(self) -> None:
        api = _RecordingLogicAPI(confidence=0.42)

        result = compile_control_surface_policy_rule_result(
            "Be careful with records",
            logic_api=api,
            min_confidence=0.7,
            clarify_below=0.8,
        )

        self.assertFalse(result.accepted)
        self.assertIsNone(result.policy)
        self.assertTrue(result.requires_clarification)
        self.assertEqual(result.compiler_lane, IPFS_LOGIC_COMPILER_LANE)
        self.assertIn("Clarification needed", result.clarification)
        self.assertTrue(result.artifacts["clarification_required"])

        with self.assertRaises(NLPolicyClarificationRequired):
            compile_control_surface_policy_rule(
                "Be careful with records",
                logic_api=api,
                min_confidence=0.7,
                clarify_below=0.8,
            )

    def test_missing_ipfs_lane_falls_back_to_strict_template_rejection(self) -> None:
        result = compile_control_surface_policy_rule_result(
            "Please be careful with messages",
            logic_api=object(),
        )

        self.assertFalse(result.accepted)
        self.assertEqual(result.compiler_lane, STRICT_TEMPLATE_COMPILER_LANE)
        self.assertFalse(result.clarification)
        self.assertIn("strict control-surface policy template", result.errors[0])

        with self.assertRaises(StrictTemplatePolicyError):
            compile_control_surface_policy_rule(
                "Please be careful with messages",
                logic_api=object(),
            )

    def test_strict_template_lane_still_wins_when_it_matches(self) -> None:
        api = _RecordingLogicAPI()

        result = compile_control_surface_policy_rule_result(
            "ignore my wrist gestures at night",
            logic_api=api,
        )

        self.assertTrue(result.accepted)
        self.assertEqual(result.compiler_lane, STRICT_TEMPLATE_COMPILER_LANE)
        self.assertEqual(api.compile_calls, [])

    def test_evaluate_wrapper_uses_ipfs_evaluate_nl_policy(self) -> None:
        api = _RecordingLogicAPI()

        result = evaluate_ipfs_nl_policy(
            "Never let agents delete records",
            tool="delete_record",
            actor="user:alice",
            logic_api=api,
        )

        self.assertEqual(api.evaluate_calls, [("Never let agents delete records", "delete_record", "user:alice")])
        self.assertEqual(result["decision"], "deny")
        self.assertEqual(result["compiler_lane"], IPFS_LOGIC_COMPILER_LANE)


if __name__ == "__main__":
    unittest.main()
