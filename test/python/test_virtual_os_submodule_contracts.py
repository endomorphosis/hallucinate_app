import builtins
import importlib.util
import json
import re
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python < 3.11 fallback.
    tomllib = None


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    ComponentAdapter,
    HealthState,
    ServiceDescriptor,
    ServiceStatus,
)
from hallucinate_app.virtual_os.registry import (  # noqa: E402
    DEFAULT_COMPONENT_IDS,
    ComponentAdapterDefinition,
    ComponentAdapterRegistry,
    StaticComponentAdapter,
    discover_component_adapters,
    load_component_definitions,
)


SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")

PYTHON_IMPORT_ROOTS = {
    "ipfs_kit_py": PROJECT_ROOT / "ipfs_kit_py",
    "ipfs_datasets_py": PROJECT_ROOT / "ipfs_datasets_py",
    "ipfs_accelerate_py": PROJECT_ROOT / "ipfs_accelerate_py",
}

DECLARED_VERSION_FILES = {
    "ipfs_kit_py": PROJECT_ROOT / "ipfs_kit_py" / "pyproject.toml",
    "ipfs_datasets_py": PROJECT_ROOT / "ipfs_datasets_py" / "pyproject.toml",
    "ipfs_accelerate_py": PROJECT_ROOT / "ipfs_accelerate_py" / "pyproject.toml",
    "swissknife": PROJECT_ROOT / "swissknife" / "package.json",
}

OPTIONAL_DEPENDENCY_PREFIXES = (
    "aiosqlite",
    "cloudscraper",
    "datasets",
    "ipfs_faiss_py",
    "ipfs_model_manager_py",
    "ipfshttpclient",
    "ipfsspec",
    "libipld",
    "orbitdb_kit_py",
    "pypdf",
    "PyPDF2",
    "pysbd",
    "seaborn",
    "torch",
    "transformers",
)


@contextmanager
def import_root(path):
    sys.path.insert(0, str(path))
    try:
        yield
    finally:
        sys.path.remove(str(path))


def read_declared_version(path):
    if path.suffix == ".json":
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle).get("version")

    if tomllib is not None:
        with path.open("rb") as handle:
            payload = tomllib.load(handle)
        return payload.get("project", {}).get("version")

    for line in path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if key.strip() == "version" and separator:
            return value.strip().strip('"')
    return None


def make_blocked_importer(blocked_prefixes):
    real_import = builtins.__import__

    def blocked_import(name, globals=None, locals=None, fromlist=(), level=0):
        if any(name == prefix or name.startswith(f"{prefix}.") for prefix in blocked_prefixes):
            raise ModuleNotFoundError(f"optional dependency blocked for smoke test: {name}")
        return real_import(name, globals, locals, fromlist, level)

    return blocked_import


class TestVirtualOSSubmoduleContracts(unittest.TestCase):
    def setUp(self):
        self.definitions = {
            definition.component_id: definition
            for definition in load_component_definitions(PROJECT_ROOT / "config" / "virtual_ai_os_components.json")
        }
        self.registry = discover_component_adapters(project_root=PROJECT_ROOT)

    def test_component_entrypoints_are_discoverable_without_heavy_imports(self):
        for component_id, import_root_path in PYTHON_IMPORT_ROOTS.items():
            with self.subTest(component_id=component_id), import_root(import_root_path):
                spec = importlib.util.find_spec(component_id)

                self.assertIsNotNone(spec, component_id)
                self.assertIsNotNone(spec.origin, component_id)
                self.assertTrue(Path(spec.origin).is_relative_to(import_root_path), spec.origin)

        swissknife_manifest = PROJECT_ROOT / "swissknife" / "package.json"
        mcp_readme = PROJECT_ROOT / "ipfs_accelerate_py" / "ipfs_accelerate_py" / "mcplusplus" / "README.md"

        self.assertTrue(swissknife_manifest.exists())
        self.assertEqual(json.loads(swissknife_manifest.read_text(encoding="utf-8"))["name"], "swissknife")
        self.assertTrue(mcp_readme.exists())
        self.assertIn("MCP", mcp_readme.read_text(encoding="utf-8", errors="ignore")[:4096])

    def test_components_declare_versions_or_pinned_shas(self):
        baseline_file = PROJECT_ROOT / "config" / "submodule_integration_baseline.json"
        with baseline_file.open("r", encoding="utf-8") as handle:
            baseline = json.load(handle)["baseline"]

        for component_id in DEFAULT_COMPONENT_IDS:
            with self.subTest(component_id=component_id):
                definition = self.definitions[component_id]

                self.assertIsNotNone(definition.sha, component_id)
                self.assertRegex(definition.sha, SHA_PATTERN)

                status = self.registry.health(component_id)[component_id]
                self.assertEqual(status.details["expected_sha"], definition.sha)
                self.assertEqual(status.details["current_sha"], definition.sha)

                for service in self.registry.services(component_id)[component_id]:
                    self.assertEqual(service.version, definition.sha)

                if component_id in baseline:
                    self.assertEqual(baseline[component_id]["currentSha"], definition.sha)

                version_file = DECLARED_VERSION_FILES.get(component_id)
                if version_file is not None:
                    self.assertTrue(version_file.exists(), version_file)
                    self.assertRegex(str(read_declared_version(version_file)), r"^\d+\.\d+\.\d+")

    def test_required_adapters_are_registered_with_contract_services(self):
        self.assertEqual(set(self.registry.component_ids()), set(DEFAULT_COMPONENT_IDS))

        for component_id in DEFAULT_COMPONENT_IDS:
            with self.subTest(component_id=component_id):
                adapter = self.registry.require(component_id)
                self.assertIsInstance(adapter, ComponentAdapter)
                self.assertEqual(adapter.component_id(), component_id)

                capabilities = tuple(adapter.capabilities())
                services = tuple(adapter.services())
                self.assertGreater(len(capabilities), 0)
                self.assertEqual(len(services), 1)

                service = services[0]
                self.assertIsInstance(service, ServiceDescriptor)
                self.assertEqual(service.service_id, f"{component_id}.adapter")
                self.assertEqual(service.component, component_id)
                self.assertEqual(tuple(service.capabilities), capabilities)
                self.assertEqual(service.metadata["registry_source"], "virtual_os.registry")

    def test_health_statuses_have_stable_contract_shape(self):
        for component_id, status in self.registry.health().items():
            with self.subTest(component_id=component_id):
                self.assertIsInstance(status, ServiceStatus)
                self.assertEqual(status.service_id, f"{component_id}.adapter")
                self.assertIsInstance(status.state, HealthState)
                self.assertEqual(status.state, HealthState.HEALTHY)
                self.assertTrue(status.message)
                self.assertIsNotNone(status.checked_at)

                details = status.details
                self.assertEqual(details["component_id"], component_id)
                self.assertTrue(details["component_title"])
                self.assertTrue(details["path"])
                self.assertTrue(details["absolute_path"])
                self.assertIsInstance(details["available"], bool)
                self.assertTrue(details["available"])
                self.assertGreater(len(details["expected_markers"]), 0)
                self.assertGreater(len(details["present_markers"]), 0)
                self.assertRegex(details["expected_sha"], SHA_PATTERN)
                self.assertRegex(details["current_sha"], SHA_PATTERN)
                self.assertTrue(details["role"])

    def test_registry_degrades_when_optional_markers_are_absent(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            component_path = project_root / "optional_component"
            component_path.mkdir()
            definition = ComponentAdapterDefinition(
                component_id="ipfs_kit_py",
                title="IPFS Kit",
                role="optional dependency probe",
                path="optional_component",
                sha="0" * 40,
                package_markers=("optional_dependency.marker",),
            )
            registry = ComponentAdapterRegistry(
                project_root=project_root,
                adapters=(StaticComponentAdapter(definition=definition, project_root=project_root),),
            )

            status = registry.health("ipfs_kit_py")["ipfs_kit_py"]

            self.assertEqual(status.state, HealthState.DEGRADED)
            self.assertTrue(status.details["available"])
            self.assertEqual(status.details["expected_markers"], ("optional_dependency.marker",))
            self.assertEqual(status.details["present_markers"], ())
            self.assertIn("no expected marker", status.message)

    def test_registry_smoke_does_not_require_optional_dependencies(self):
        with patch("builtins.__import__", make_blocked_importer(OPTIONAL_DEPENDENCY_PREFIXES)):
            registry = discover_component_adapters(project_root=PROJECT_ROOT)
            snapshot = registry.snapshot()

        self.assertEqual(set(snapshot), set(DEFAULT_COMPONENT_IDS))
        for component_id, component in snapshot.items():
            with self.subTest(component_id=component_id):
                self.assertEqual(component["component_id"], component_id)
                self.assertGreater(len(component["capabilities"]), 0)
                self.assertEqual(component["health"], HealthState.HEALTHY.value)


if __name__ == "__main__":
    unittest.main()
