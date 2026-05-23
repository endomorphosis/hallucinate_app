import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
SCRIPT = PROJECT_ROOT / "scripts" / "check_nested_submodules.py"
ADR = PROJECT_ROOT / "docs" / "adr" / "ADR-009-nested-submodule-policy.md"

SHA_TOP = "a" * 40
SHA_ROLLBACK = "b" * 40
SHA_MCP = "c" * 40


def load_verifier():
    spec = importlib.util.spec_from_file_location("nested_submodule_policy", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


VERIFIER = load_verifier()
MCP_PATH = sorted(VERIFIER.MCP_PLUS_PLUS_EXCEPTION_PATHS)[0]


def write_json(path, payload):
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_policy_repo(
    root,
    *,
    baseline=None,
    component_path=MCP_PATH,
    component_sha=SHA_MCP,
    nested_declared_path="ipfs_accelerate_py/mcplusplus",
    nested_url="https://github.com/endomorphosis/Mcp-Plus-Plus.git",
):
    config_dir = root / "config"
    config_dir.mkdir(parents=True)
    (root / "ipfs_accelerate_py").mkdir()

    (root / ".gitmodules").write_text(
        "\n".join(
            [
                '[submodule "ipfs_accelerate_py"]',
                "\tpath = ipfs_accelerate_py",
                "\turl = https://github.com/endomorphosis/ipfs_accelerate_py.git",
                "",
            ]
        ),
        encoding="utf-8",
    )
    (root / "ipfs_accelerate_py" / ".gitmodules").write_text(
        "\n".join(
            [
                '[submodule "ipfs_accelerate_py/mcplusplus"]',
                f"\tpath = {nested_declared_path}",
                f"\turl = {nested_url}",
                "",
            ]
        ),
        encoding="utf-8",
    )

    if baseline is None:
        baseline = {
            "ipfs_accelerate_py": {
                "currentSha": SHA_TOP,
                "rollbackSha": SHA_ROLLBACK,
            }
        }
    write_json(
        config_dir / "submodule_integration_baseline.json",
        {
            "version": 1,
            "baseline": baseline,
        },
    )
    write_json(
        config_dir / "virtual_ai_os_components.json",
        {
            "components": [
                {
                    "id": "ipfs_accelerate_py",
                    "path": "ipfs_accelerate_py",
                    "sha": SHA_TOP,
                },
                {
                    "id": "mcp_plus_plus",
                    "path": component_path,
                    "sha": component_sha,
                },
            ]
        },
    )


def issue_codes(report):
    return {issue["code"] for issue in report["issues"]}


class TestNestedSubmodulePolicy(unittest.TestCase):
    def test_policy_document_names_pin_classes_and_mcp_exception(self):
        text = ADR.read_text(encoding="utf-8")

        self.assertIn("top-level integration pin", text)
        self.assertIn("nested reference pin", text)
        self.assertIn(MCP_PATH, text)
        self.assertIn("scripts/check_nested_submodules.py", text)

    def test_valid_repo_distinguishes_top_level_and_nested_pins(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_policy_repo(root)

            report = VERIFIER.build_report(root)

        self.assertTrue(report["ok"], report["issues"])
        self.assertEqual(report["schema_version"], "nested-submodule-policy.v1")

        top_level = {entry["path"]: entry for entry in report["topLevelSubmodules"]}
        nested = {entry["path"]: entry for entry in report["nestedSubmodules"]}

        self.assertEqual(
            top_level["ipfs_accelerate_py"]["classification"],
            "top-level-integration-pin",
        )
        self.assertEqual(nested[MCP_PATH]["classification"], "nested-reference-pin")
        self.assertEqual(
            report["policy"]["mcpPlusPlusException"]["componentPath"],
            MCP_PATH,
        )
        self.assertEqual(report["summary"]["baselineEntryCount"], 1)

    def test_missing_top_level_baseline_is_reported(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_policy_repo(root, baseline={})

            report = VERIFIER.build_report(root)

        self.assertFalse(report["ok"])
        self.assertIn("top_level_missing_baseline", issue_codes(report))

    def test_nested_reference_baseline_entry_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_policy_repo(
                root,
                baseline={
                    "ipfs_accelerate_py": {
                        "currentSha": SHA_TOP,
                        "rollbackSha": SHA_ROLLBACK,
                    },
                    MCP_PATH: {
                        "currentSha": SHA_MCP,
                        "rollbackSha": "d" * 40,
                    },
                },
            )

            report = VERIFIER.build_report(root)

        codes = issue_codes(report)
        self.assertFalse(report["ok"])
        self.assertIn("nested_reference_in_baseline", codes)
        self.assertIn("mcp_exception_in_baseline", codes)

    def test_mcp_exception_path_and_sha_are_verified(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_policy_repo(
                root,
                component_path="ipfs_accelerate_py/wrong/mcplusplus",
                component_sha="not-a-sha",
                nested_declared_path="wrong/mcplusplus",
            )

            report = VERIFIER.build_report(root)

        codes = issue_codes(report)
        self.assertFalse(report["ok"])
        self.assertIn("mcp_exception_missing_nested_submodule", codes)
        self.assertIn("mcp_exception_component_path", codes)
        self.assertIn("mcp_exception_component_sha", codes)
        self.assertIn("unapproved_nested_component", codes)

    def test_cli_emits_json_and_supports_warn_only(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_policy_repo(root, baseline={})

            failing = subprocess.run(
                [sys.executable, str(SCRIPT), "--root", str(root)],
                capture_output=True,
                text=True,
                check=False,
            )
            passing = subprocess.run(
                [sys.executable, str(SCRIPT), "--root", str(root), "--warn-only"],
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(failing.returncode, 1)
        self.assertEqual(passing.returncode, 0)
        payload = json.loads(failing.stdout)
        self.assertFalse(payload["ok"])
        self.assertIn("top_level_missing_baseline", issue_codes(payload))


if __name__ == "__main__":
    unittest.main()
