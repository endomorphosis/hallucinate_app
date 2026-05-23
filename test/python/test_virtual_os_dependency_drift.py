import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
SCRIPT = PROJECT_ROOT / "scripts" / "check_virtual_os_dependency_drift.py"


def load_detector():
    spec = importlib.util.spec_from_file_location("virtual_os_dependency_drift", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


DETECTOR = load_detector()


def write_json(path, payload):
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_components(root, components):
    config_dir = root / "config"
    config_dir.mkdir(parents=True)
    write_json(config_dir / "virtual_ai_os_components.json", {"components": components})


class TestVirtualOSDependencyDrift(unittest.TestCase):
    def test_reports_python_and_node_conflicts_as_actionable_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_components(
                root,
                [
                    {"id": "alpha", "path": "alpha"},
                    {"id": "beta", "path": "beta"},
                ],
            )
            alpha = root / "alpha"
            beta = root / "beta"
            alpha.mkdir()
            beta.mkdir()
            (alpha / "requirements.txt").write_text(
                "requests==2.31.0\nnumpy>=1.24,<2\n",
                encoding="utf-8",
            )
            (beta / "pyproject.toml").write_text(
                "\n".join(
                    [
                        "[project]",
                        'dependencies = ["requests==2.30.0", "numpy>=1.25,<2"]',
                    ]
                ),
                encoding="utf-8",
            )
            write_json(
                alpha / "package.json",
                {"dependencies": {"lodash": "^4.17.21", "react": "^18.2.0"}},
            )
            write_json(
                beta / "package.json",
                {"dependencies": {"lodash": "^3.10.1", "react": ">=18.0.0 <19.0.0"}},
            )

            report = DETECTOR.build_report(root)

        self.assertFalse(report["ok"])
        self.assertEqual(report["schema_version"], "virtual-ai-os-dependency-drift.v1")
        conflicts = {(item["ecosystem"], item["dependency"]): item for item in report["conflicts"]}
        self.assertIn(("python", "requests"), conflicts)
        self.assertIn(("node", "lodash"), conflicts)
        self.assertNotIn(("python", "numpy"), conflicts)
        self.assertNotIn(("node", "react"), conflicts)
        for conflict in conflicts.values():
            self.assertTrue(conflict["action"])
            self.assertGreaterEqual(len(conflict["occurrences"]), 2)
            self.assertGreaterEqual(len(conflict["conflictingPairs"]), 1)

    def test_nested_component_manifests_are_not_attributed_to_parent(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_components(
                root,
                [
                    {"id": "parent", "path": "parent"},
                    {"id": "nested", "path": "parent/nested"},
                ],
            )
            (root / "parent" / "nested").mkdir(parents=True)
            (root / "parent" / "requirements.txt").write_text("shared==1.0.0\n", encoding="utf-8")
            (root / "parent" / "nested" / "requirements.txt").write_text("shared==2.0.0\n", encoding="utf-8")

            report = DETECTOR.build_report(root)

        self.assertEqual(report["summary"]["manifestCount"], 2)
        [conflict] = report["conflicts"]
        self.assertEqual(conflict["dependency"], "shared")
        components = [occurrence["component"] for occurrence in conflict["occurrences"]]
        self.assertEqual(sorted(components), ["nested", "parent"])

    def test_cli_emits_json_and_supports_warn_only(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_components(
                root,
                [
                    {"id": "alpha", "path": "alpha"},
                    {"id": "beta", "path": "beta"},
                ],
            )
            (root / "alpha").mkdir()
            (root / "beta").mkdir()
            (root / "alpha" / "requirements.txt").write_text("urllib3==2.0.0\n", encoding="utf-8")
            (root / "beta" / "requirements.txt").write_text("urllib3==1.26.0\n", encoding="utf-8")

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
        self.assertEqual(payload["summary"]["conflictCount"], 1)


if __name__ == "__main__":
    unittest.main()
