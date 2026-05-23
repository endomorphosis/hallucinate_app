import json
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.boot import BootConfig  # noqa: E402
from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    CapabilityAction,
    CapabilitySpec,
    HealthState,
    ResourceKind,
    ServiceStatus,
)
from hallucinate_app.virtual_os.offline import (  # noqa: E402
    LocalCacheSpec,
    OfflineBootConfig,
    OfflineCapabilityState,
    boot_virtual_os_offline,
    offline_transport_records,
)
from hallucinate_app.virtual_os.provenance import ProvenanceLedger  # noqa: E402
from hallucinate_app.virtual_os.registry import ComponentAdapterRegistry  # noqa: E402


class FailIfStartedSupervisor:
    def __init__(self):
        self.started = []

    def start_daemon(self, daemon):
        self.started.append(daemon.daemon_id)
        raise AssertionError("offline mode must not start daemon transports")


class OfflineCapabilityAdapter:
    def component_id(self):
        return "ipfs_kit_py"

    def capabilities(self):
        return (
            CapabilitySpec(
                capability_id="storage.read",
                action=CapabilityAction.READ,
                resource_kind=ResourceKind.STORAGE,
                description="Read from local cache.",
            ),
            CapabilitySpec(
                capability_id="service.mcp",
                action=CapabilityAction.EXECUTE,
                resource_kind=ResourceKind.SERVICE,
                description="Expose service over MCP transport.",
            ),
            CapabilitySpec(
                capability_id="network.route",
                action=CapabilityAction.READ,
                resource_kind=ResourceKind.NETWORK,
                description="Inspect peer routing state.",
            ),
        )

    def services(self):
        return ()

    def health(self):
        return ServiceStatus(
            service_id="ipfs_kit_py.adapter",
            state=HealthState.HEALTHY,
            message="adapter ready",
        )


class TestVirtualOSOfflineMode(unittest.TestCase):
    def make_registry(self):
        return ComponentAdapterRegistry(
            project_root=PROJECT_ROOT,
            adapters=(OfflineCapabilityAdapter(),),
        )

    def test_offline_boot_uses_local_cache_and_disables_network_transports(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_path = Path(temp_dir) / "ipfs-cache"
            cache_path.mkdir()
            cache_specs = (
                LocalCacheSpec(
                    cache_id="test-ipfs-cache",
                    component_id="ipfs_kit_py",
                    path=cache_path,
                    capabilities=("storage.read",),
                ),
            )
            supervisor = FailIfStartedSupervisor()
            ledger = ProvenanceLedger()

            result = boot_virtual_os_offline(
                OfflineBootConfig(
                    boot_config=BootConfig(
                        project_root=PROJECT_ROOT,
                        validate_baseline=False,
                        start_daemons=True,
                        correlation_id="offline-test",
                    ),
                    cache_specs=cache_specs,
                ),
                daemon_supervisor=supervisor,
                registry=self.make_registry(),
                provenance_ledger=ledger,
            )

        self.assertTrue(result.ok, result.errors)
        self.assertEqual(result.health, HealthState.DEGRADED)
        self.assertEqual(result.boot.daemons, ())
        self.assertEqual(supervisor.started, [])
        self.assertTrue(result.cache_by_id()["test-ipfs-cache"].available)

        disabled_transports = result.disabled_transports()
        self.assertGreaterEqual(len(disabled_transports), 1)
        self.assertFalse(result.transport_by_daemon()["ipfs_kit_py"].enabled)
        self.assertIn("network-dependent transport", result.transport_by_daemon()["ipfs_kit_py"].reason)

        capabilities = {capability.capability_id: capability for capability in result.capabilities}
        self.assertEqual(capabilities["storage.read"].state, OfflineCapabilityState.AVAILABLE)
        self.assertEqual(capabilities["service.mcp"].state, OfflineCapabilityState.DEGRADED)
        self.assertEqual(capabilities["network.route"].state, OfflineCapabilityState.DISABLED)
        self.assertGreaterEqual(len(result.degraded_capabilities()), 2)

        self.assertEqual(len(ledger.records()), 1)
        record = ledger.records()[0]
        payload = record.to_json_dict()
        self.assertEqual(record.operation, "offline.boot")
        self.assertEqual(payload["metadata"]["disabled_transport_count"], len(disabled_transports))
        self.assertGreaterEqual(payload["metadata"]["degraded_capability_count"], 2)
        self.assertEqual(payload["output"]["data"]["health"], HealthState.DEGRADED.value)

        dashboard = result.dashboard_dict()
        json.dumps(dashboard)
        self.assertEqual(dashboard["health"], HealthState.DEGRADED.value)
        self.assertEqual(dashboard["offline"]["disabled_transport_count"], len(disabled_transports))
        self.assertGreaterEqual(dashboard["offline"]["degraded_capability_count"], 2)

    def test_missing_required_local_cache_fails_offline_boot(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            missing_cache = Path(temp_dir) / "missing-cache"
            result = boot_virtual_os_offline(
                OfflineBootConfig(
                    boot_config=BootConfig(
                        project_root=PROJECT_ROOT,
                        validate_baseline=False,
                    ),
                    cache_specs=(
                        LocalCacheSpec(
                            cache_id="required-cache",
                            component_id="ipfs_kit_py",
                            path=missing_cache,
                            required=True,
                        ),
                    ),
                ),
                daemon_supervisor=FailIfStartedSupervisor(),
                registry=self.make_registry(),
            )

        self.assertFalse(result.ok)
        self.assertEqual(result.health, HealthState.UNHEALTHY)
        self.assertIn("Required local cache is unavailable: required-cache", "\n".join(result.errors))
        self.assertFalse(result.cache_by_id()["required-cache"].available)

    def test_transport_policy_leaves_local_only_transport_available(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            daemon_config = Path(temp_dir) / "daemons.json"
            daemon_config.write_text(
                json.dumps(
                    {
                        "defaults": {
                            "host": "127.0.0.1",
                            "env": {},
                            "launch": {"shell": False},
                            "healthCheck": {"enabled": False, "type": "process"},
                            "restartPolicy": {},
                        },
                        "daemons": [
                            {
                                "id": "local_tool",
                                "componentId": "swissknife",
                                "title": "Local Tool",
                                "endpoint": {
                                    "protocol": "stdio",
                                    "host": "127.0.0.1",
                                    "port": 1,
                                    "path": "/",
                                },
                                "launch": {
                                    "command": "python",
                                    "args": ["-m", "noop"],
                                    "cwd": ".",
                                },
                                "metadata": {"mcpTransport": "stdio"},
                            },
                            {
                                "id": "remote_mesh",
                                "componentId": "mcp_plus_plus",
                                "title": "Remote Mesh",
                                "endpoint": {
                                    "protocol": "http",
                                    "host": "127.0.0.1",
                                    "port": 2,
                                    "path": "/",
                                },
                                "launch": {
                                    "command": "python",
                                    "args": ["-m", "noop"],
                                    "cwd": ".",
                                },
                                "metadata": {
                                    "mcpTransport": "mcp++",
                                    "mcpPlusPlusProfiles": ["mcp+p2p"],
                                },
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            records = offline_transport_records(
                daemon_config_path=daemon_config,
                project_root=PROJECT_ROOT,
            )

        by_daemon = {record.daemon_id: record for record in records}
        self.assertTrue(by_daemon["local_tool"].enabled)
        self.assertFalse(by_daemon["local_tool"].network_dependent)
        self.assertFalse(by_daemon["remote_mesh"].enabled)
        self.assertTrue(by_daemon["remote_mesh"].network_dependent)


if __name__ == "__main__":
    unittest.main()
