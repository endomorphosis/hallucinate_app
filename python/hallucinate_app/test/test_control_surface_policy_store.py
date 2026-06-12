"""Tests for control-surface policy bundle persistence."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.control_surface_policy import (  # noqa: E402
    IPFS_LOGIC_COMPILER_LANE,
    compile_strict_template_rule,
)
from hallucinate_app.control_surface_store import (  # noqa: E402
    POLICY_BUNDLE_KIND,
    PolicyBundleStore,
    _json_safe,
    stable_cid,
)


class TestControlSurfacePolicyStore(unittest.TestCase):
    def test_policy_bundle_persists_source_ir_explanations_and_profile_ref(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            store = PolicyBundleStore(tmpdir)
            policy = compile_strict_template_rule(
                "Ignore my wrist gestures at night, because I'm sleeping.",
                actor="user:operator-7",
                timezone="America/Los_Angeles",
            )

            record = store.persist_policy_bundle(
                policy,
                user_id="operator-7",
                profile_id="desktop",
            )

            self.assertTrue(record.policy_cid.startswith("sha256:policy_bundle:"))
            self.assertTrue(record.compiled_policy_cid.startswith("sha256:compiled_policy:"))
            self.assertTrue(record.bundle_path.exists())
            self.assertTrue(record.compiled_policy_path.exists())
            self.assertTrue(record.attachment_path and record.attachment_path.exists())
            self.assertEqual(record.policy_bundle_ref["scope"], "profile:operator-7:desktop")
            self.assertEqual(record.policy_bundle_ref["source"], "operator_profile")

            loaded = store.load_policy_bundle(record.policy_cid)
            policy_bundle = loaded["policy_bundle"]
            self.assertEqual(policy_bundle["kind"], POLICY_BUNDLE_KIND)
            self.assertEqual(stable_cid(policy_bundle, prefix="policy_bundle"), record.policy_cid)
            self.assertEqual(policy_bundle["natural_language_rules"], [policy.source_text])
            self.assertEqual(
                policy_bundle["compiled_policy"]["compiled_policy_cid"],
                record.compiled_policy_cid,
            )
            self.assertEqual(policy_bundle["compiled_policy"]["norms"][0]["outcome"], "deny")
            self.assertIn("Compiled", policy_bundle["explanation"])

            compiled = store.load_compiled_policy(record.compiled_policy_cid)
            self.assertEqual(compiled["policy_id"], policy.policy_id)
            self.assertEqual(compiled["source_text"], policy.source_text)

            attachment = store.load_profile_attachment(
                user_id="operator-7",
                profile_id="desktop",
            )
            attached_ref = attachment["attachment"]["policy_refs"][0]
            self.assertEqual(
                attached_ref["policy_bundle_ref"]["policy_cid"],
                record.policy_cid,
            )
            self.assertEqual(attached_ref["compiled_policy_cid"], record.compiled_policy_cid)

    def test_ipfs_artifacts_and_upstream_policy_cid_are_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            store = PolicyBundleStore(tmpdir)
            policy = compile_strict_template_rule("require confirmation before sending messages")
            policy = type(policy)(
                policy_id=policy.policy_id,
                facts=policy.facts,
                norms=policy.norms,
                version=policy.version,
                source_text=policy.source_text,
                compiled_policy_cid="bafy-upstream-policy",
                compiled_artifacts={
                    **policy.compiled_artifacts,
                    "compiler_lane": IPFS_LOGIC_COMPILER_LANE,
                    "policy_cid": "bafy-upstream-policy",
                    "ipfs_result": {"policy": {"id": "upstream"}, "clauses": ["permit"]},
                },
                explanations=["Upstream explanation survived persistence."],
            )

            record = store.persist_policy_bundle(
                policy,
                user_id="operator-7",
                profile_id="desktop",
                ipfs_artifacts={"delegation_cid": "bafy-delegation"},
            )

            self.assertEqual(record.compiled_policy_cid, "bafy-upstream-policy")
            loaded = store.load_policy_bundle(record.policy_cid)
            policy_bundle = loaded["policy_bundle"]
            self.assertEqual(policy_bundle["compiled_policy_cid"], "bafy-upstream-policy")
            self.assertEqual(
                policy_bundle["ipfs_datasets_py_artifacts"]["policy_cid"],
                "bafy-upstream-policy",
            )
            self.assertEqual(
                policy_bundle["ipfs_datasets_py_artifacts"]["delegation_cid"],
                "bafy-delegation",
            )
            self.assertTrue(
                any(
                    ref["artifact_type"] == "ucan"
                    for ref in policy_bundle["compiled_artifact_refs"]
                )
            )
            self.assertIn("Upstream explanation", policy_bundle["explanation"])

    def test_persisting_same_bundle_twice_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            store = PolicyBundleStore(tmpdir)
            policy = compile_strict_template_rule("ignore my wrist gestures at night")

            first = store.persist_policy_bundle(policy, user_id="operator-7")
            second = store.persist_policy_bundle(policy, user_id="operator-7")

            self.assertEqual(first.policy_cid, second.policy_cid)
            self.assertEqual(first.compiled_policy_cid, second.compiled_policy_cid)
            attachment = store.load_profile_attachment(user_id="operator-7")
            self.assertEqual(len(attachment["attachment"]["policy_refs"]), 1)

    def test_json_safe_logs_as_dict_failure_and_uses_fallback(self) -> None:
        class BrokenAsDict:
            def __init__(self) -> None:
                self.fallback = "preserved"

            def as_dict(self) -> dict[str, str]:
                raise RuntimeError("as_dict unavailable")

        with self.assertLogs("hallucinate_app.control_surface_store", level="WARNING") as logs:
            payload = _json_safe(BrokenAsDict())

        self.assertEqual(payload, {"fallback": "preserved"})
        self.assertTrue(
            any("as_dict() failed" in message for message in logs.output),
            logs.output,
        )


if __name__ == "__main__":
    unittest.main()
