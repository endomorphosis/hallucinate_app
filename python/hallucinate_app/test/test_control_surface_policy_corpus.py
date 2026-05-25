"""Regression harness for the multimodal control-surface policy corpus."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Mapping


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_agents import normalize_agent_interaction  # noqa: E402
from hallucinate_app.control_surface_gesture import normalize_gesture_interaction  # noqa: E402
from hallucinate_app.control_surface_logic_ir import (  # noqa: E402
    ControlSurfaceNorm,
    ControlSurfacePolicy,
    DeonticOutcome,
    InvocationEffect,
    TemporalGuard,
    stable_control_surface_id,
)
from hallucinate_app.control_surface_mediator import evaluate_control_surface_interaction  # noqa: E402
from hallucinate_app.control_surface_pointer import normalize_pointer_interaction  # noqa: E402
from hallucinate_app.control_surface_policy import (  # noqa: E402
    IPFS_LOGIC_COMPILER_LANE,
    STRICT_TEMPLATE_COMPILER_LANE,
    compile_control_surface_policy_rule_result,
    compile_strict_template_rule_result,
)
from hallucinate_app.control_surface_voice import normalize_voice_interaction  # noqa: E402


FIXTURE_PATH = Path(__file__).with_name("fixtures") / "control_surface_policy_corpus.json"


class _CorpusNLUCANPolicyCompiler:
    def __init__(self, **_: object) -> None:
        pass

    def compile_explain(self, sentences: list[str]) -> list[str]:
        return [f"Corpus NLUCAN explanation for {sentences[0]}"]


class _CorpusLogicAPI:
    NLUCANPolicyCompiler = _CorpusNLUCANPolicyCompiler

    def __init__(self, entry: Mapping[str, Any]) -> None:
        self.entry = entry
        self.compile_calls: list[tuple[list[str], dict[str, object]]] = []
        self.evaluate_calls: list[tuple[str, str, str | None]] = []

    def compile_nl_to_policy(self, sentences: list[str], **kwargs: object) -> object:
        self.compile_calls.append((list(sentences), dict(kwargs)))
        return SimpleNamespace(**dict(self.entry["fake_logic_result"]))

    def compile_explain_iter(self, sentences: list[str]) -> list[str]:
        result = self.entry["fake_logic_result"]
        metadata = dict(result.get("metadata") or {})
        explanation = str(metadata.get("explanation") or "").strip()
        if explanation:
            return [f"Corpus explanation: {explanation}"]
        return [f"Corpus explanation for {sentences[0]}"]

    def evaluate_nl_policy(self, nl_text: str, *, tool: str, actor: str | None = None, **_: object) -> object:
        self.evaluate_calls.append((nl_text, tool, actor))
        return SimpleNamespace(decision="deny", reason="corpus fake evaluator")

    def evaluate_with_manager(self, *_: object, **__: object) -> object:
        return SimpleNamespace(decision="deny", reason="corpus fake manager")


class TestControlSurfacePolicyCorpus(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.corpus = _load_corpus()
        cls.policy_entries = {entry["id"]: entry for entry in cls.corpus["policies"]}

    def test_strict_policy_rules_compile_to_expected_ir(self) -> None:
        for entry in self.corpus["policies"]:
            if entry["compiler"] != STRICT_TEMPLATE_COMPILER_LANE:
                continue
            with self.subTest(policy=entry["id"]):
                result = compile_strict_template_rule_result(
                    entry["source_text"],
                    policy_id=f"policy:{entry['id']}",
                    actor=entry.get("actor", "user:*"),
                    timezone=entry.get("timezone", "UTC"),
                )
                expected = entry["expected"]
                policy = result.policy
                norm = policy.norms[0]

                self.assertEqual(result.as_dict()["compiler_lane"], STRICT_TEMPLATE_COMPILER_LANE)
                self.assertEqual(policy.compiled_artifacts["compiler_lane"], expected["compiler_lane"])
                self.assertEqual(policy.compiled_artifacts["matched_template"], expected["matched_template"])
                self.assertEqual(policy.compiled_artifacts["confidence"], 1.0)
                self.assertFalse(policy.compiled_artifacts["llm_used"])
                self.assertEqual(_value(norm.outcome), expected["outcome"])
                self.assertEqual(norm.surface, expected.get("surface", norm.surface))
                self.assertEqual(norm.surface_event, expected.get("surface_event", norm.surface_event))
                self.assertEqual(norm.method, expected["method"])
                self.assertEqual(norm.target_ref, expected["target_ref"])
                self.assertIn(expected["explanation_contains"], norm.explanation)
                if expected.get("intent"):
                    self.assertEqual(norm.metadata["slots"]["intent"], expected["intent"])
                self.assertEqual(
                    [_guard_expectation(guard) for guard in norm.guards],
                    expected["guards"],
                )

    def test_nl_policy_fallback_compiles_or_clarifies_from_corpus(self) -> None:
        for entry in self.corpus["policies"]:
            if entry["compiler"] != IPFS_LOGIC_COMPILER_LANE:
                continue
            with self.subTest(policy=entry["id"]):
                api = _CorpusLogicAPI(entry)
                result = compile_control_surface_policy_rule_result(
                    entry["source_text"],
                    policy_id=f"policy:{entry['id']}",
                    actor=entry.get("actor", "user:*"),
                    min_confidence=float(entry.get("min_confidence", 0.7)),
                    clarify_below=float(entry.get("clarify_below", 0.85)),
                    logic_api=api,
                )
                expected = entry["expected"]

                self.assertEqual(api.compile_calls[0][0], [entry["source_text"]])
                self.assertEqual(api.compile_calls[0][1]["default_actor"], entry["actor"])
                self.assertEqual(result.compiler_lane, expected["compiler_lane"])

                if expected["accepted"]:
                    self.assertTrue(result.accepted)
                    self.assertIsNotNone(result.policy)
                    assert result.policy is not None
                    norm = result.policy.norms[0]
                    self.assertEqual(result.policy.compiled_policy_cid, expected["compiled_policy_cid"])
                    self.assertEqual(_value(norm.outcome), expected["outcome"])
                    self.assertEqual(norm.surface, expected["surface"])
                    self.assertEqual(norm.surface_event, expected["surface_event"])
                    self.assertEqual(norm.method, expected["method"])
                    self.assertEqual(norm.target_ref, expected["target_ref"])
                    self.assertIn(expected["explanation_contains"], norm.explanation)
                    self.assertEqual(norm.metadata["compiler_lane"], IPFS_LOGIC_COMPILER_LANE)
                else:
                    self.assertFalse(result.accepted)
                    self.assertIsNone(result.policy)
                    self.assertTrue(result.requires_clarification)
                    self.assertIn(expected["clarification_contains"], result.clarification)
                    self.assertTrue(
                        any(expected["errors_contain"] in error for error in result.errors),
                        result.errors,
                    )

    def test_equivalent_surface_intents_share_policy_decisions_and_explanations(self) -> None:
        for group in self.corpus["equivalent_intent_groups"]:
            with self.subTest(group=group["id"]):
                policies = self._policies_for_ids(group["policy_ids"])
                explanations: list[str] = []
                outcomes: list[str] = []
                effects: list[tuple[str, str]] = []

                for case in group["cases"]:
                    envelope = _normalize_case(self.corpus, case)
                    intent = envelope.as_dict()["normalized_intent"]
                    expected_intent = group["expected_intent"]
                    self.assertEqual(intent["intent"], expected_intent["intent"])
                    self.assertEqual(intent["method"], expected_intent["method"])
                    self.assertEqual(intent["target_ref"], expected_intent["target_ref"])

                    decision = evaluate_control_surface_interaction(
                        envelope,
                        active_policy_bundles=policies,
                        decided_at=group["decided_at"],
                    )
                    payload = decision.as_dict()
                    expected_decision = group["expected_decision"]
                    effect = payload["effects"][0]

                    self.assertEqual(payload["outcome"], expected_decision["outcome"])
                    self.assertEqual(effect["method"], expected_decision["effect_method"])
                    self.assertEqual(effect["target_ref"], expected_decision["effect_target_ref"])
                    self.assertIn(expected_decision["explanation"], payload["explanation"])
                    outcomes.append(payload["outcome"])
                    effects.append((effect["method"], effect["target_ref"]))
                    explanations.append(payload["explanation"])

                self.assertEqual(set(outcomes), {group["expected_decision"]["outcome"]})
                self.assertEqual(
                    set(effects),
                    {
                        (
                            group["expected_decision"]["effect_method"],
                            group["expected_decision"]["effect_target_ref"],
                        )
                    },
                )
                self.assertEqual(len(set(explanations)), 1)

    def test_mediation_cases_capture_denial_and_conflict_precedence(self) -> None:
        for case in self.corpus["mediation_cases"]:
            with self.subTest(case=case["id"]):
                envelope = _normalize_case(self.corpus, case)
                policies = self._policies_for_ids(case.get("policy_ids", []))
                policies.extend(_inline_policy(policy) for policy in case.get("inline_policies", []))
                decision = evaluate_control_surface_interaction(
                    envelope,
                    active_policy_bundles=policies,
                    decided_at=case["decided_at"],
                )
                payload = decision.as_dict()
                effect = payload["effects"][0]
                expected = case["expected_decision"]

                self.assertEqual(payload["outcome"], expected["outcome"])
                self.assertEqual(effect["method"], expected["effect_method"])
                self.assertEqual(effect["target_ref"], expected["effect_target_ref"])
                self.assertEqual(payload["matched_norms"][0]["outcome"], expected["matched_norm_outcome"])
                self.assertIn(expected["explanation_contains"], payload["explanation"])
                if "confidence" in expected:
                    self.assertEqual(payload["confidence"], expected["confidence"])

    def _policies_for_ids(self, policy_ids: list[str]) -> list[ControlSurfacePolicy]:
        return [_compile_policy(self.policy_entries[policy_id]) for policy_id in policy_ids]


def _load_corpus() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def _compile_policy(entry: Mapping[str, Any]) -> ControlSurfacePolicy:
    if entry["compiler"] == STRICT_TEMPLATE_COMPILER_LANE:
        return compile_strict_template_rule_result(
            entry["source_text"],
            policy_id=f"policy:{entry['id']}",
            actor=entry.get("actor", "user:*"),
            timezone=entry.get("timezone", "UTC"),
        ).policy

    api = _CorpusLogicAPI(entry)
    result = compile_control_surface_policy_rule_result(
        entry["source_text"],
        policy_id=f"policy:{entry['id']}",
        actor=entry.get("actor", "user:*"),
        min_confidence=float(entry.get("min_confidence", 0.7)),
        clarify_below=float(entry.get("clarify_below", 0.85)),
        logic_api=api,
    )
    if not result.policy:
        raise AssertionError(f"Corpus policy {entry['id']} did not compile.")
    return result.policy


def _normalize_case(corpus: Mapping[str, Any], case: Mapping[str, Any]):
    common = dict(corpus["common"])
    actor = common.get(case["actor_ref"]) if case.get("actor_ref") else None
    context = common.get(case["context_ref"]) if case.get("context_ref") else None
    raw_payload = dict(case["raw_payload"])
    resolver = case["resolver"]
    if resolver == "voice":
        return normalize_voice_interaction(raw_payload, actor=actor, context=context)
    if resolver == "gesture":
        return normalize_gesture_interaction(raw_payload, actor=actor, context=context)
    if resolver == "pointer":
        return normalize_pointer_interaction(raw_payload, actor=actor, context=context)
    if resolver == "agent":
        return normalize_agent_interaction(raw_payload, actor=actor, context=context)
    raise AssertionError(f"Unsupported corpus resolver {resolver!r}.")


def _inline_policy(entry: Mapping[str, Any]) -> ControlSurfacePolicy:
    norms = [_inline_norm(entry, norm) for norm in entry["norms"]]
    return ControlSurfacePolicy(
        policy_id=str(entry["policy_id"]),
        norms=norms,
        compiled_policy_cid=str(entry["compiled_policy_cid"]),
        compiled_artifacts={
            "compiler_lane": "corpus_inline",
            "confidence": float(entry.get("confidence", 1.0)),
        },
        explanations=[norm.explanation for norm in norms],
    )


def _inline_norm(policy_entry: Mapping[str, Any], norm_entry: Mapping[str, Any]) -> ControlSurfaceNorm:
    outcome = DeonticOutcome(str(norm_entry["outcome"]))
    reason = str(norm_entry["reason"])
    return ControlSurfaceNorm(
        norm_id=stable_control_surface_id(
            "norm",
            policy_entry["policy_id"],
            norm_entry["id"],
            norm_entry["outcome"],
        ),
        outcome=outcome,
        effect=InvocationEffect.from_intent(
            outcome=outcome,
            method=str(norm_entry["method"]),
            target_ref=str(norm_entry["target_ref"]),
            reason=reason,
        ),
        actor=str(norm_entry.get("actor", "*")),
        surface=str(norm_entry.get("surface", "*")),
        surface_event=str(norm_entry.get("surface_event", "*")),
        method=str(norm_entry.get("method", "*")),
        target_ref=str(norm_entry.get("target_ref", "*")),
        guards=[_inline_guard(guard) for guard in norm_entry.get("guards", [])],
        priority=int(norm_entry.get("priority", 0)),
        source_text=reason,
        explanation=reason,
        metadata={"corpus_norm_id": str(norm_entry["id"])},
    )


def _inline_guard(entry: Mapping[str, Any]) -> TemporalGuard:
    if entry["kind"] == "state_frame":
        return TemporalGuard.state_frame(str(entry["expected"]))
    if entry["kind"] == "time_window":
        return TemporalGuard.time_window(
            str(entry["predicate"]),
            start=str(entry["start"]),
            end=str(entry["end"]),
            timezone=str(entry.get("timezone", "UTC")),
        )
    raise AssertionError(f"Unsupported inline guard {entry['kind']!r}.")


def _guard_expectation(guard: TemporalGuard) -> dict[str, Any]:
    payload = guard.as_dict()
    expected = {
        "kind": payload["kind"],
        "predicate": payload["predicate"],
    }
    if payload["kind"] == "state_frame":
        expected["expected"] = payload["expected"]
    return expected


def _value(value: Any) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


if __name__ == "__main__":
    unittest.main()
