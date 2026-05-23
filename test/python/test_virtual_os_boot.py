import json
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.boot import (  # noqa: E402
    BootConfig,
    DaemonDefinition,
    boot_virtual_os,
    load_daemon_definitions,
)
from hallucinate_app.virtual_os.contracts import EventEnvelope, HealthState, ServiceStatus  # noqa: E402
from hallucinate_app.virtual_os.events import DaemonHeartbeat  # noqa: E402
from hallucinate_app.virtual_os.registry import DEFAULT_COMPONENT_IDS, ComponentAdapterRegistry  # noqa: E402


class FakeDaemonSupervisor:
    def __init__(self, *, fail_start=(), fail_health=()):
        self.fail_start = set(fail_start)
        self.fail_health = set(fail_health)
        self.started = []
        self.health_checked = []

    def start_daemon(self, daemon):
        self.started.append(daemon)
        if daemon.daemon_id in self.fail_start:
            raise RuntimeError(f"start failed for {daemon.daemon_id}")
        return {
            "id": daemon.daemon_id,
            "componentId": daemon.component_id,
            "status": "running",
            "ok": True,
            "pid": 1000 + len(self.started),
            "endpoint": daemon.endpoint,
            "message": "started",
        }

    def health_daemon(self, daemon, prior=None):
        self.health_checked.append(daemon.daemon_id)
        if daemon.daemon_id in self.fail_health:
            return {
                "id": daemon.daemon_id,
                "componentId": daemon.component_id,
                "status": "failed",
                "ok": False,
                "endpoint": daemon.endpoint,
                "health": {
                    "state": "unhealthy",
                    "error": f"probe failed for {daemon.daemon_id}",
                },
            }
        return {
            "id": daemon.daemon_id,
            "componentId": daemon.component_id,
            "status": "running",
            "ok": True,
            "pid": prior.pid if prior else None,
            "endpoint": daemon.endpoint,
            "health": {
                "state": "healthy",
                "ok": True,
            },
        }


class RecordingEventBus:
    def __init__(self):
        self.events = []
        self.heartbeats = []

    def publish(self, event):
        self.events.append(event)

    def emit_heartbeat(self, heartbeat):
        self.heartbeats.append(heartbeat)


class UnhealthyOptionalAdapter:
    def component_id(self):
        return "ipfs_kit_py"

    def capabilities(self):
        return ()

    def services(self):
        return ()

    def health(self):
        return ServiceStatus(
            service_id="ipfs_kit_py.adapter",
            state=HealthState.UNHEALTHY,
            message="optional component unavailable",
        )


class TestVirtualOSBoot(unittest.TestCase):
    def test_daemon_config_normalizes_required_launch_contracts(self):
        definitions = load_daemon_definitions(project_root=PROJECT_ROOT)

        self.assertEqual({daemon.daemon_id for daemon in definitions}, set(DEFAULT_COMPONENT_IDS))
        for daemon in definitions:
            self.assertIsInstance(daemon, DaemonDefinition)
            self.assertEqual(daemon.component_id, daemon.daemon_id)
            self.assertTrue(daemon.title)
            self.assertTrue(daemon.endpoint["url"].startswith("http://127.0.0.1:"))
            self.assertTrue(Path(daemon.launch["cwd"]).is_absolute())
            self.assertNotIn("${", json.dumps(daemon.launch))
            self.assertTrue(daemon.health_check["enabled"])
            self.assertIn(daemon.health_check["type"], {"http", "tcp", "process"})

    def test_boot_initializes_registry_validates_shas_and_records_health(self):
        supervisor = FakeDaemonSupervisor()
        event_bus = RecordingEventBus()

        result = boot_virtual_os(
            BootConfig(project_root=PROJECT_ROOT, correlation_id="test-boot"),
            daemon_supervisor=supervisor,
            event_bus=event_bus,
        )

        self.assertTrue(result.ok, result.errors)
        self.assertEqual(result.health, HealthState.HEALTHY)
        self.assertEqual(set(result.registry.component_ids()), set(DEFAULT_COMPONENT_IDS))
        self.assertEqual({check.component_id for check in result.baseline}, set(DEFAULT_COMPONENT_IDS))
        self.assertTrue(all(check.ok for check in result.baseline))
        self.assertEqual({daemon.daemon_id for daemon in result.daemons}, set(DEFAULT_COMPONENT_IDS))
        self.assertTrue(all(daemon.ok for daemon in result.daemons))
        self.assertTrue(all(daemon.state == HealthState.HEALTHY for daemon in result.daemons))
        self.assertEqual([daemon.daemon_id for daemon in supervisor.started], list(DEFAULT_COMPONENT_IDS))
        self.assertEqual(set(supervisor.health_checked), set(DEFAULT_COMPONENT_IDS))
        self.assertEqual(len(result.heartbeats), len(DEFAULT_COMPONENT_IDS))
        self.assertTrue(all(isinstance(heartbeat, DaemonHeartbeat) for heartbeat in result.heartbeats))
        self.assertGreaterEqual(len(event_bus.heartbeats), len(DEFAULT_COMPONENT_IDS))
        self.assertTrue(all(isinstance(event, EventEnvelope) for event in event_bus.events))

        dashboard = result.dashboard_dict()
        json.dumps(dashboard)
        self.assertEqual(dashboard["boot"]["ok"], True)
        self.assertEqual(dashboard["health"], HealthState.HEALTHY.value)

    def test_required_baseline_drift_fails_boot_without_starting_daemons(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            baseline_path = Path(temp_dir) / "baseline.json"
            baseline_path.write_text(
                json.dumps(
                    {
                        "baseline": {
                            "ipfs_kit_py": {
                                "currentSha": "0" * 40,
                                "rollbackSha": "1" * 40,
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            result = boot_virtual_os(
                BootConfig(
                    project_root=PROJECT_ROOT,
                    baseline_path=baseline_path,
                    start_daemons=False,
                ),
                daemon_supervisor=FakeDaemonSupervisor(),
            )

        self.assertFalse(result.ok)
        self.assertEqual(result.health, HealthState.UNHEALTHY)
        self.assertFalse(result.baseline_by_component()["ipfs_kit_py"].ok)
        component = {row.component: row for row in result.components}["ipfs_kit_py"]
        self.assertEqual(component.state, HealthState.UNHEALTHY)
        self.assertEqual(result.daemons, ())

    def test_optional_daemon_failure_is_recorded_as_degraded_not_fatal(self):
        supervisor = FakeDaemonSupervisor(fail_start={"swissknife"})

        result = boot_virtual_os(
            BootConfig(
                project_root=PROJECT_ROOT,
                optional_daemon_ids=("swissknife",),
            ),
            daemon_supervisor=supervisor,
        )

        self.assertTrue(result.ok, result.errors)
        self.assertEqual(result.health, HealthState.DEGRADED)
        swissknife = result.daemon_by_id()["swissknife"]
        self.assertFalse(swissknife.ok)
        self.assertFalse(swissknife.required)
        self.assertEqual(swissknife.state, HealthState.DEGRADED)
        self.assertIn("Optional daemon failed during boot: swissknife", "\n".join(result.notices))

        required_daemons = [daemon for daemon in result.daemons if daemon.daemon_id != "swissknife"]
        self.assertTrue(all(daemon.required and daemon.ok for daemon in required_daemons))

    def test_optional_component_baseline_drift_is_degraded_not_fatal(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            baseline_path = Path(temp_dir) / "baseline.json"
            baseline_path.write_text(
                json.dumps(
                    {
                        "baseline": {
                            "ipfs_kit_py": {
                                "currentSha": "0" * 40,
                                "rollbackSha": "1" * 40,
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            result = boot_virtual_os(
                BootConfig(
                    project_root=PROJECT_ROOT,
                    baseline_path=baseline_path,
                    optional_component_ids=("ipfs_kit_py",),
                    start_daemons=False,
                ),
                daemon_supervisor=FakeDaemonSupervisor(),
            )

        self.assertTrue(result.ok, result.errors)
        self.assertEqual(result.health, HealthState.DEGRADED)
        check = result.baseline_by_component()["ipfs_kit_py"]
        self.assertFalse(check.ok)
        self.assertFalse(check.required)
        component = {row.component: row for row in result.components}["ipfs_kit_py"]
        self.assertEqual(component.state, HealthState.DEGRADED)

    def test_optional_component_health_failure_is_degraded_not_fatal(self):
        registry = ComponentAdapterRegistry(
            project_root=PROJECT_ROOT,
            adapters=(UnhealthyOptionalAdapter(),),
        )

        result = boot_virtual_os(
            BootConfig(
                project_root=PROJECT_ROOT,
                optional_component_ids=("ipfs_kit_py",),
                validate_baseline=False,
                start_daemons=False,
            ),
            daemon_supervisor=FakeDaemonSupervisor(),
            registry=registry,
        )

        self.assertTrue(result.ok, result.errors)
        self.assertEqual(result.health, HealthState.DEGRADED)
        component = {row.component: row for row in result.components}["ipfs_kit_py"]
        self.assertEqual(component.state, HealthState.DEGRADED)


if __name__ == "__main__":
    unittest.main()
