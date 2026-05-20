import json
import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.submodule_compat import (  # noqa: E402
    build_simple_api,
    call_with_param_fallback,
    instantiate_from_candidates,
)


class TestSubmoduleCompatibility(unittest.TestCase):
    def test_instantiate_from_alternate_candidate_name(self):
        class ModuleStub:
            class IPFSDatasetsPy:
                def __init__(self, resources=None, metadata=None):
                    self.resources = resources or {}
                    self.metadata = metadata or {}

        instance = instantiate_from_candidates(
            ModuleStub,
            ("ipfs_datasets_py", "IPFSDatasetsPy"),
            {"a": 1},
            {"b": 2},
        )
        self.assertEqual(instance.resources.get("a"), 1)
        self.assertEqual(instance.metadata.get("b"), 2)

    def test_call_with_param_fallback_uses_dict_path(self):
        class APIStub:
            def load(self, payload):
                return {"ok": True, "payload": payload}

        result, retry_count = call_with_param_fallback(APIStub().load, {"model": "x"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["payload"]["model"], "x")
        self.assertEqual(retry_count, 1)

    def test_call_with_param_fallback_no_retry_when_kwargs_match(self):
        class APIStub:
            def load(self, model=None):
                return {"ok": True, "model": model}

        result, retry_count = call_with_param_fallback(APIStub().load, {"model": "x"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["model"], "x")
        self.assertEqual(retry_count, 0)

    def test_build_simple_api_falls_back_to_metadata_ctor(self):
        class SimpleAPIStub:
            def __init__(self, metadata=None):
                self.metadata = metadata or {}

        api = build_simple_api(SimpleAPIStub, "/tmp/config", "leecher", {"x": 1})
        self.assertEqual(api.metadata["role"], "leecher")
        self.assertEqual(api.metadata["config_path"], "/tmp/config")

    def test_baseline_manifest_integrity(self):
        baseline_file = PROJECT_ROOT / "config" / "submodule_integration_baseline.json"
        with baseline_file.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        baseline = payload["baseline"]
        self.assertIn("ipfs_accelerate_py", baseline)
        self.assertIn("ipfs_datasets_py", baseline)
        self.assertIn("ipfs_kit_py", baseline)
        for item in baseline.values():
            self.assertEqual(len(item["currentSha"]), 40)
            self.assertEqual(len(item["rollbackSha"]), 40)


if __name__ == "__main__":
    unittest.main()
