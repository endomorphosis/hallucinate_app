import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    CapabilitySpec,
    ComponentAdapter,
    HealthState,
    ServiceDescriptor,
    ServiceStatus,
)
from hallucinate_app.virtual_os.registry import (  # noqa: E402
    DEFAULT_COMPONENT_IDS,
    ComponentAdapterRegistry,
    discover_component_adapters,
    normalize_component_id,
)


class TestVirtualOSRegistry(unittest.TestCase):
    def setUp(self):
        self.registry = discover_component_adapters(project_root=PROJECT_ROOT)

    def test_discovers_all_required_component_adapters(self):
        self.assertEqual(set(self.registry.component_ids()), set(DEFAULT_COMPONENT_IDS))

        for component_id in DEFAULT_COMPONENT_IDS:
            adapter = self.registry.require(component_id)
            self.assertIsInstance(adapter, ComponentAdapter)
            self.assertEqual(adapter.component_id(), component_id)

    def test_supports_mcp_plus_plus_aliases(self):
        self.assertEqual(normalize_component_id("MCP++"), "mcp_plus_plus")
        self.assertEqual(normalize_component_id("mcp-plus-plus"), "mcp_plus_plus")
        self.assertIs(self.registry.require("MCP++"), self.registry.require("mcp_plus_plus"))

    def test_adapters_expose_explicit_capability_metadata(self):
        for component_id, capabilities in self.registry.capabilities().items():
            self.assertGreater(len(capabilities), 0, component_id)
            capability_ids = {capability.capability_id for capability in capabilities}
            self.assertEqual(len(capability_ids), len(capabilities))

            for index, capability in enumerate(capabilities):
                self.assertIsInstance(capability, CapabilitySpec)
                self.assertTrue(capability.capability_id.startswith(f"{component_id}."))
                self.assertTrue(capability.description)
                self.assertTrue(capability.action)
                self.assertTrue(capability.resource_kind)
                self.assertEqual(capability.metadata["component_id"], component_id)
                self.assertEqual(capability.metadata["capability_index"], index)
                self.assertIn("component_path", capability.metadata)
                self.assertIn("component_role", capability.metadata)
                self.assertIn("component_sha", capability.metadata)
                self.assertGreater(len(capability.metadata["source_capabilities"]), 0)
                self.assertGreater(len(capability.metadata["integration_contracts"]), 0)

    def test_adapters_expose_service_descriptors_with_capabilities(self):
        for component_id, services in self.registry.services().items():
            self.assertEqual(len(services), 1)
            service = services[0]
            self.assertIsInstance(service, ServiceDescriptor)
            self.assertEqual(service.service_id, f"{component_id}.adapter")
            self.assertEqual(service.component, component_id)
            self.assertTrue(service.title)
            self.assertGreater(len(service.capabilities), 0)
            self.assertEqual(service.metadata["registry_source"], "virtual_os.registry")
            self.assertGreater(len(service.metadata["integration_contracts"]), 0)

    def test_health_states_report_local_component_availability(self):
        statuses = self.registry.health()
        self.assertEqual(set(statuses), set(DEFAULT_COMPONENT_IDS))

        for component_id, status in statuses.items():
            self.assertIsInstance(status, ServiceStatus)
            self.assertEqual(status.service_id, f"{component_id}.adapter")
            self.assertIsInstance(status.state, HealthState)
            self.assertEqual(status.state, HealthState.HEALTHY)
            self.assertTrue(status.message)
            self.assertTrue(status.details["available"])
            self.assertEqual(status.details["component_id"], component_id)
            self.assertTrue(status.details["path"])
            self.assertGreater(len(status.details["present_markers"]), 0)

    def test_registry_snapshot_is_json_friendly(self):
        snapshot = self.registry.snapshot()
        self.assertEqual(set(snapshot), set(DEFAULT_COMPONENT_IDS))

        mcp = snapshot["mcp_plus_plus"]
        self.assertEqual(mcp["health"], HealthState.HEALTHY.value)
        self.assertGreater(len(mcp["capabilities"]), 0)
        self.assertEqual(mcp["health_details"]["component_title"], "MCP++")

        for component_id, component in snapshot.items():
            self.assertEqual(component["component_id"], component_id)
            self.assertIn(f"{component_id}.adapter", component["services"])
            for capability in component["capabilities"]:
                self.assertIsInstance(capability["action"], str)
                self.assertIsInstance(capability["resource_kind"], str)
                self.assertEqual(capability["metadata"]["component_id"], component_id)

    def test_can_register_injected_adapter_without_discovery(self):
        class InjectedAdapter:
            def component_id(self):
                return "mcp++"

            def capabilities(self):
                return ()

            def services(self):
                return ()

            def health(self):
                return ServiceStatus(service_id="mcp_plus_plus.injected", state=HealthState.DEGRADED)

        registry = ComponentAdapterRegistry(project_root=PROJECT_ROOT, adapters=(InjectedAdapter(),))
        self.assertEqual(registry.component_ids(), ("mcp_plus_plus",))
        self.assertEqual(registry.health("MCP++")["mcp_plus_plus"].state, HealthState.DEGRADED)


if __name__ == "__main__":
    unittest.main()
