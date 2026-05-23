import argparse
import json
import os
import sys
import tempfile
import unittest
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.boot import (  # noqa: E402
    BootConfig,
    DaemonBootRecord,
    DaemonDefinition,
    boot_virtual_os,
)
from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    CapabilityAction,
    CapabilityDenied,
    CapabilitySpec,
    EventEnvelope,
    HealthState,
    IdentityRef,
    ResourceKind,
    ResourceRef,
    ServiceStatus,
    utc_now,
)
from hallucinate_app.virtual_os.events import (  # noqa: E402
    DaemonHeartbeat,
    EventCategory,
    EventSeverity,
    TraceContext,
    daemon_resource,
    dashboard_snapshot,
    heartbeat_event,
    structured_event,
)
from hallucinate_app.virtual_os.offline import (  # noqa: E402
    LocalCacheSpec,
    OfflineBootConfig,
    OfflineCapabilityState,
    boot_virtual_os_offline,
    discover_local_caches,
)
from hallucinate_app.virtual_os.registry import (  # noqa: E402
    DEFAULT_COMPONENT_IDS,
    ComponentAdapterDefinition,
    ComponentAdapterRegistry,
    StaticComponentAdapter,
)
from hallucinate_app.virtual_os.security import (  # noqa: E402
    CapabilityDecisionOutcome,
    emit_denied_event,
    require_capability,
    service_resource,
)


TRACE = TraceContext(
    trace_id="03903903903903903903903903903903",
    span_id="0390390390390390",
    correlation_id="os-039-chaos",
)
SOURCE = "test.virtual_os.chaos"
CHAOS_CONDITIONS = frozenset(
    {
        "daemon_death",
        "missing_submodule",
        "corrupt_descriptor",
        "denied_capability",
        "network_unavailable",
        "stale_cache",
    }
)


@dataclass(frozen=True)
class ChaosIncident:
    condition: str
    health: HealthState
    ok: bool = False
    events: tuple[Any, ...] = ()
    errors: tuple[str, ...] = ()
    notices: tuple[str, ...] = ()
    details: dict[str, Any] = field(default_factory=dict)

    def event_types(self) -> tuple[str, ...]:
        return tuple(
            event.envelope.event_type if hasattr(event, "envelope") else event.event_type
            for event in self.events
        )


class HealthyComponentAdapter:
    def __init__(self, component_id: str):
        self._component_id = component_id

    def component_id(self):
        return self._component_id

    def capabilities(self):
        if self._component_id == "ipfs_kit_py":
            return (
                CapabilitySpec(
                    capability_id="storage.read",
                    action=CapabilityAction.READ,
                    resource_kind=ResourceKind.STORAGE,
                    description="Read local storage.",
                ),
                CapabilitySpec(
                    capability_id="network.route",
                    action=CapabilityAction.READ,
                    resource_kind=ResourceKind.NETWORK,
                    description="Inspect peer routing state.",
                ),
                CapabilitySpec(
                    capability_id="service.mcp",
                    action=CapabilityAction.EXECUTE,
                    resource_kind=ResourceKind.SERVICE,
                    description="Expose MCP service transport.",
                ),
            )
        if self._component_id == "swissknife":
            return (
                CapabilitySpec(
                    capability_id="descriptor.read",
                    action=CapabilityAction.READ,
                    resource_kind=ResourceKind.DESCRIPTOR,
                    description="Read descriptor cache.",
                ),
            )
        return ()

    def services(self):
        return ()

    def health(self):
        return ServiceStatus(
            service_id=f"{self._component_id}.adapter",
            state=HealthState.HEALTHY,
            message="healthy chaos adapter",
        )


class RecordingEventBus:
    def __init__(self):
        self.events: list[EventEnvelope] = []
        self.heartbeats: list[DaemonHeartbeat] = []

    def publish_event(self, request):
        envelope = request.event.envelope if hasattr(request.event, "envelope") else request.event
        self.events.append(envelope)

    def emit_heartbeat(self, heartbeat):
        self.heartbeats.append(heartbeat)


class KillableDaemonSupervisor:
    def __init__(self, *, killed_daemon_id: str):
        self.killed_daemon_id = killed_daemon_id
        self.started: list[str] = []
        self.health_checked: list[str] = []

    def start_daemon(self, daemon: DaemonDefinition):
        self.started.append(daemon.daemon_id)
        return DaemonBootRecord(
            daemon_id=daemon.daemon_id,
            component_id=daemon.component_id,
            state=HealthState.STARTING,
            status="running",
            ok=True,
            pid=7300 + len(self.started),
            endpoint=daemon.endpoint_url,
            message="chaos daemon started",
            started_at=utc_now(),
            metadata={"supervisor": self.__class__.__name__},
        )

    def health_daemon(self, daemon: DaemonDefinition, prior: DaemonBootRecord | None = None):
        self.health_checked.append(daemon.daemon_id)
        if daemon.daemon_id == self.killed_daemon_id:
            return DaemonBootRecord(
                daemon_id=daemon.daemon_id,
                component_id=daemon.component_id,
                state=HealthState.UNHEALTHY,
                status="exited",
                ok=False,
                pid=prior.pid if prior else None,
                endpoint=daemon.endpoint_url,
                message="daemon process died during chaos probe",
                error="process exited with signal SIGKILL",
                started_at=prior.started_at if prior else None,
                metadata={
                    "supervisor": self.__class__.__name__,
                    "failure_mode": "daemon_death",
                },
            )
        return DaemonBootRecord(
            daemon_id=daemon.daemon_id,
            component_id=daemon.component_id,
            state=HealthState.HEALTHY,
            status="running",
            ok=True,
            pid=prior.pid if prior else None,
            endpoint=daemon.endpoint_url,
            message="chaos daemon healthy",
            started_at=prior.started_at if prior else None,
            metadata={"supervisor": self.__class__.__name__},
        )


class FailIfStartedSupervisor:
    def __init__(self):
        self.started: list[str] = []

    def start_daemon(self, daemon):
        self.started.append(daemon.daemon_id)
        raise AssertionError("chaos offline scenario must not start daemons")


class VirtualOSChaosHarness:
    def __init__(self, *, project_root: Path = PROJECT_ROOT):
        self.project_root = project_root

    @property
    def conditions(self) -> frozenset[str]:
        return CHAOS_CONDITIONS

    def healthy_registry(self, component_ids=DEFAULT_COMPONENT_IDS) -> ComponentAdapterRegistry:
        return ComponentAdapterRegistry(
            project_root=self.project_root,
            adapters=[HealthyComponentAdapter(component_id) for component_id in component_ids],
        )

    def simulate_daemon_death(self, daemon_id: str = "ipfs_accelerate_py") -> ChaosIncident:
        supervisor = KillableDaemonSupervisor(killed_daemon_id=daemon_id)
        event_bus = RecordingEventBus()
        result = boot_virtual_os(
            BootConfig(
                project_root=self.project_root,
                validate_baseline=False,
                correlation_id=TRACE.correlation_id,
            ),
            daemon_supervisor=supervisor,
            event_bus=event_bus,
            registry=self.healthy_registry(),
        )
        killed = result.daemon_by_id()[daemon_id]
        death_event = structured_event(
            "virtual_os.chaos.daemon_death",
            source=SOURCE,
            category=EventCategory.DAEMON,
            severity=EventSeverity.ERROR,
            trace=TRACE,
            subject=daemon_resource(daemon_id, component=killed.component_id),
            payload={
                "daemon_id": daemon_id,
                "component_id": killed.component_id,
                "status": killed.status,
                "pid": killed.pid,
                "error": killed.error,
                "recovery_expected": True,
            },
        )
        events = (*result.events, death_event)
        return ChaosIncident(
            condition="daemon_death",
            health=result.health,
            ok=result.ok,
            events=events,
            errors=result.errors,
            notices=result.notices,
            details={
                "daemon": killed,
                "dashboard": result.dashboard_dict(),
                "started": tuple(supervisor.started),
                "health_checked": tuple(supervisor.health_checked),
            },
        )

    def simulate_missing_submodule(self) -> ChaosIncident:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            definition = ComponentAdapterDefinition(
                component_id="ipfs_kit_py",
                title="IPFS Kit",
                role="missing submodule chaos probe",
                path="missing_ipfs_kit_py",
                sha="0" * 40,
                package_markers=("pyproject.toml",),
            )
            registry = ComponentAdapterRegistry(
                project_root=root,
                adapters=(StaticComponentAdapter(definition=definition, project_root=root),),
            )
            result = boot_virtual_os(
                BootConfig(
                    project_root=root,
                    validate_baseline=False,
                    start_daemons=False,
                    correlation_id=TRACE.correlation_id,
                ),
                daemon_supervisor=FailIfStartedSupervisor(),
                registry=registry,
            )
            component = result.components[0]
            missing_path = root / definition.path
            event = structured_event(
                "virtual_os.chaos.missing_submodule",
                source=SOURCE,
                category=EventCategory.SYSTEM,
                severity=EventSeverity.ERROR,
                trace=TRACE,
                subject=ResourceRef(
                    uri=f"virtual-os://components/{definition.component_id}",
                    kind=ResourceKind.SERVICE,
                    component=definition.component_id,
                    name=definition.title,
                ),
                payload={
                    "component_id": definition.component_id,
                    "path": str(missing_path),
                    "exists": missing_path.exists(),
                    "health": component.state.value,
                    "message": component.message,
                },
            )
            return ChaosIncident(
                condition="missing_submodule",
                health=result.health,
                ok=result.ok,
                events=(*result.events, event),
                errors=result.errors,
                notices=result.notices,
                details={
                    "component": component,
                    "dashboard": result.dashboard_dict(),
                    "missing_path": str(missing_path),
                },
            )

    def simulate_corrupt_descriptor(self) -> ChaosIncident:
        profile = self.load_mcp_profile()
        descriptor = {
            "name": "broken-storage",
            "namespace": "virtual_ai_os.ipfs_kit",
            "version": profile["profileVersion"],
            "methods": [
                {
                    "name": "storage.add",
                    "input_schema_cid": "not-a-cid",
                }
            ],
            "errors": [],
            "requires": ["mcp++/idl"],
            "compatibility": {
                "compatible": False,
                "reasons": ["chaos descriptor intentionally corrupt"],
            },
        }
        errors = tuple(validate_interface_descriptor(profile, descriptor))
        event = structured_event(
            "virtual_os.chaos.corrupt_descriptor",
            source=SOURCE,
            category=EventCategory.MCP_DAG,
            severity=EventSeverity.ERROR,
            trace=TRACE,
            subject=ResourceRef(
                uri="virtual-os://descriptors/broken-storage",
                kind=ResourceKind.DESCRIPTOR,
                component="mcp_plus_plus",
                name="broken-storage",
            ),
            payload={
                "valid": not errors,
                "error_count": len(errors),
                "errors": list(errors),
            },
        )
        return ChaosIncident(
            condition="corrupt_descriptor",
            health=HealthState.UNHEALTHY,
            ok=False,
            events=(event,),
            errors=errors,
            details={"descriptor": descriptor, "validation_errors": errors},
        )

    def simulate_denied_capability(self) -> ChaosIncident:
        actor = IdentityRef(did="did:example:chaos-agent", roles=("agent",))
        resource = service_resource("ipfs_kit_py/storage.add")
        decision_event = None
        try:
            require_capability(
                actor,
                CapabilityAction.EXECUTE,
                resource,
                (),
                operation="storage.add",
                service_id="ipfs_kit_py",
                trace_id=TRACE.trace_id,
            )
        except CapabilityDenied:
            decision = require_denied_decision(
                actor=actor,
                action=CapabilityAction.EXECUTE,
                resource=resource,
                operation="storage.add",
                service_id="ipfs_kit_py",
            )
            decision_event = emit_denied_event(decision, source=SOURCE)
        if decision_event is None:
            raise AssertionError("denied capability chaos probe unexpectedly authorized")
        return ChaosIncident(
            condition="denied_capability",
            health=HealthState.DEGRADED,
            ok=False,
            events=(decision_event,),
            errors=("missing, expired, revoked, or constrained capability grant",),
            details={"audit_event": decision_event},
        )

    def simulate_network_unavailable(self) -> ChaosIncident:
        with tempfile.TemporaryDirectory() as temp_dir:
            daemon_config = Path(temp_dir) / "daemons.json"
            daemon_config.write_text(json.dumps(network_chaos_daemon_config()), encoding="utf-8")
            supervisor = FailIfStartedSupervisor()
            result = boot_virtual_os_offline(
                OfflineBootConfig(
                    boot_config=BootConfig(
                        project_root=self.project_root,
                        daemon_config_path=daemon_config,
                        validate_baseline=False,
                        correlation_id=TRACE.correlation_id,
                    ),
                    daemon_config_path=daemon_config,
                    cache_specs=(
                        LocalCacheSpec(
                            cache_id="ipfs-kit-cache",
                            component_id="ipfs_kit_py",
                            path=self.project_root,
                            required=False,
                            capabilities=("storage.read",),
                        ),
                    ),
                    metadata={"chaos_condition": "network_unavailable"},
                ),
                daemon_supervisor=supervisor,
                registry=self.healthy_registry(("ipfs_kit_py", "swissknife")),
            )
        return ChaosIncident(
            condition="network_unavailable",
            health=result.health,
            ok=result.ok,
            events=result.events,
            errors=result.errors,
            notices=result.notices,
            details={
                "offline": result,
                "dashboard": result.dashboard_dict(),
                "started": tuple(supervisor.started),
            },
        )

    def simulate_stale_cache(self) -> ChaosIncident:
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_path = Path(temp_dir) / "descriptor-cache"
            cache_path.mkdir()
            stale_at = utc_now() - timedelta(hours=3)
            os.utime(cache_path, (stale_at.timestamp(), stale_at.timestamp()))
            status = discover_local_caches(
                (
                    LocalCacheSpec(
                        cache_id="swissknife-descriptor-cache",
                        component_id="swissknife",
                        path=cache_path,
                        required=False,
                        capabilities=("descriptor.read",),
                    ),
                ),
                project_root=self.project_root,
            )[0]
            age_seconds = utc_now().timestamp() - float(status.metadata["mtime"])
            stale = age_seconds > 60
            event = structured_event(
                "virtual_os.chaos.stale_cache",
                source=SOURCE,
                category=EventCategory.SYSTEM,
                severity=EventSeverity.WARNING,
                trace=TRACE,
                subject=ResourceRef(
                    uri=f"virtual-os://cache/{status.cache_id}",
                    kind=ResourceKind.STORAGE,
                    component=status.component_id,
                    name=status.cache_id,
                ),
                payload={
                    "cache_id": status.cache_id,
                    "component_id": status.component_id,
                    "available": status.available,
                    "stale": stale,
                    "age_seconds": age_seconds,
                    "max_age_seconds": 60,
                },
            )
            heartbeat = DaemonHeartbeat(
                daemon_id="swissknife",
                component="swissknife",
                state=HealthState.DEGRADED,
                sequence=1,
                last_error="local descriptor cache is stale",
                trace_id=TRACE.trace_id,
                correlation_id=TRACE.correlation_id,
                metadata={"cache_id": status.cache_id, "stale": stale},
            )
            snapshot = dashboard_snapshot(
                daemons=(heartbeat,),
                events=(heartbeat_event(heartbeat, source=SOURCE), event),
                notices=("Stale local cache detected: swissknife-descriptor-cache",),
            )
            return ChaosIncident(
                condition="stale_cache",
                health=snapshot.health,
                ok=not stale,
                events=(heartbeat_event(heartbeat, source=SOURCE), event),
                notices=tuple(snapshot.notices),
                details={
                    "cache": status,
                    "stale": stale,
                    "age_seconds": age_seconds,
                    "dashboard": snapshot.dashboard_dict(),
                },
            )

    def load_mcp_profile(self) -> dict[str, Any]:
        with (self.project_root / "config" / "mcp_plus_plus_profile.json").open("r", encoding="utf-8") as handle:
            return json.load(handle)


def require_denied_decision(
    *,
    actor: IdentityRef,
    action: CapabilityAction,
    resource: ResourceRef,
    operation: str,
    service_id: str,
):
    from hallucinate_app.virtual_os.security import authorize_capability

    decision = authorize_capability(
        actor,
        action,
        resource,
        (),
        operation=operation,
        service_id=service_id,
        trace_id=TRACE.trace_id,
    )
    if decision.outcome != CapabilityDecisionOutcome.DENY:
        raise AssertionError(f"expected denied decision, got {decision.outcome!r}")
    return decision


def validate_interface_descriptor(profile: dict[str, Any], descriptor: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for field_name in profile["idl"]["descriptorRequiredFields"]:
        if field_name not in descriptor:
            errors.append(f"interface descriptor missing required field: {field_name}")

    for index, method in enumerate(descriptor.get("methods", ())):
        if not isinstance(method, dict):
            errors.append(f"interface descriptor method at index {index} must be an object")
            continue
        for field_name in profile["idl"]["methodRequiredFields"]:
            if field_name not in method:
                errors.append(f"interface descriptor method missing required field: {field_name}")
        for cid_field in ("input_schema_cid", "output_schema_cid"):
            if cid_field in method and not cid_like(method[cid_field]):
                errors.append(f"interface descriptor method has invalid CID field: {cid_field}")

    compatibility = descriptor.get("compatibility", {})
    for field_name in profile["idl"]["compatibilityVerdictFields"]:
        if field_name not in compatibility:
            errors.append(f"interface descriptor compatibility missing required field: {field_name}")
    return errors


def cid_like(value: Any) -> bool:
    return isinstance(value, str) and value.startswith(("bafy", "bafk", "Qm")) and len(value) >= 12


def network_chaos_daemon_config() -> dict[str, Any]:
    return {
        "defaults": {
            "host": "127.0.0.1",
            "env": {},
            "launch": {"shell": False},
            "restartPolicy": {"enabled": False},
            "healthCheck": {"enabled": False, "type": "process"},
        },
        "daemons": [
            {
                "id": "remote_mesh",
                "componentId": "ipfs_kit_py",
                "title": "Remote Mesh",
                "endpoint": {
                    "protocol": "http",
                    "host": "127.0.0.1",
                    "port": 3901,
                    "path": "/",
                },
                "launch": {
                    "command": "python",
                    "args": ["-m", "noop"],
                    "cwd": ".",
                },
                "metadata": {
                    "serviceKind": "storage",
                    "mcpTransport": "mcp++",
                    "mcpPlusPlusProfiles": ["mcp+p2p"],
                },
            },
            {
                "id": "local_shell",
                "componentId": "swissknife",
                "title": "Local Shell",
                "endpoint": {
                    "protocol": "stdio",
                    "host": "127.0.0.1",
                    "port": 3902,
                    "path": "/",
                },
                "launch": {
                    "command": "python",
                    "args": ["-m", "noop"],
                    "cwd": ".",
                },
                "metadata": {
                    "serviceKind": "agent-shell",
                    "mcpTransport": "stdio",
                },
            },
        ],
    }


class TestVirtualOSChaosHarness(unittest.TestCase):
    def setUp(self):
        self.harness = VirtualOSChaosHarness()

    def test_harness_declares_required_failure_modes(self):
        self.assertEqual(self.harness.conditions, CHAOS_CONDITIONS)

    def test_simulates_daemon_death(self):
        incident = self.harness.simulate_daemon_death()

        self.assertEqual(incident.condition, "daemon_death")
        self.assertFalse(incident.ok)
        self.assertEqual(incident.health, HealthState.UNHEALTHY)
        daemon = incident.details["daemon"]
        self.assertFalse(daemon.ok)
        self.assertEqual(daemon.status, "exited")
        self.assertEqual(daemon.state, HealthState.UNHEALTHY)
        self.assertIn("process exited with signal SIGKILL", daemon.error)
        self.assertIn("virtual_os.chaos.daemon_death", incident.event_types())
        self.assertIn("Required daemon failed during boot", "\n".join(incident.errors))

    def test_simulates_missing_submodule_without_touching_checkout(self):
        incident = self.harness.simulate_missing_submodule()

        self.assertEqual(incident.condition, "missing_submodule")
        self.assertFalse(incident.ok)
        self.assertEqual(incident.health, HealthState.UNHEALTHY)
        component = incident.details["component"]
        self.assertEqual(component.state, HealthState.UNHEALTHY)
        self.assertIn("Component path is missing", component.message)
        self.assertFalse(Path(incident.details["missing_path"]).exists())
        self.assertIn("virtual_os.chaos.missing_submodule", incident.event_types())

    def test_simulates_corrupt_descriptor_rejection(self):
        incident = self.harness.simulate_corrupt_descriptor()

        self.assertEqual(incident.condition, "corrupt_descriptor")
        self.assertFalse(incident.ok)
        self.assertEqual(incident.health, HealthState.UNHEALTHY)
        self.assertIn("interface descriptor method missing required field: output_schema_cid", incident.errors)
        self.assertIn("interface descriptor method has invalid CID field: input_schema_cid", incident.errors)
        self.assertIn("interface descriptor compatibility missing required field: requires_missing", incident.errors)
        self.assertIn("virtual_os.chaos.corrupt_descriptor", incident.event_types())
        json.dumps(incident.details["descriptor"])

    def test_simulates_denied_capability(self):
        incident = self.harness.simulate_denied_capability()

        self.assertEqual(incident.condition, "denied_capability")
        self.assertFalse(incident.ok)
        self.assertEqual(incident.health, HealthState.DEGRADED)
        event = incident.details["audit_event"]
        self.assertEqual(event.event_type, "security.operation.denied")
        self.assertEqual(event.payload["operation"], "storage.add")
        self.assertEqual(event.payload["service_id"], "ipfs_kit_py")
        self.assertEqual(event.subject.uri, "virtual-os://services/ipfs_kit_py/storage.add")

    def test_simulates_network_unavailable_with_offline_transport_policy(self):
        incident = self.harness.simulate_network_unavailable()

        self.assertEqual(incident.condition, "network_unavailable")
        self.assertTrue(incident.ok, incident.errors)
        self.assertEqual(incident.health, HealthState.DEGRADED)
        offline = incident.details["offline"]
        transports = offline.transport_by_daemon()
        self.assertFalse(transports["remote_mesh"].enabled)
        self.assertTrue(transports["remote_mesh"].network_dependent)
        self.assertTrue(transports["local_shell"].enabled)
        self.assertEqual(incident.details["started"], ())
        capabilities = {capability.capability_id: capability for capability in offline.capabilities}
        self.assertEqual(capabilities["network.route"].state, OfflineCapabilityState.DISABLED)
        self.assertIn("virtual_os.offline.boot.completed", incident.event_types())

    def test_simulates_stale_cache(self):
        incident = self.harness.simulate_stale_cache()

        self.assertEqual(incident.condition, "stale_cache")
        self.assertFalse(incident.ok)
        self.assertEqual(incident.health, HealthState.DEGRADED)
        self.assertTrue(incident.details["cache"].available)
        self.assertTrue(incident.details["stale"])
        self.assertGreater(incident.details["age_seconds"], 60)
        self.assertIn("virtual_os.chaos.stale_cache", incident.event_types())
        dashboard = incident.details["dashboard"]
        self.assertEqual(dashboard["health"], HealthState.DEGRADED.value)
        self.assertEqual(dashboard["daemons"][0]["metadata"]["stale"], True)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--smoke", action="store_true", help="Run the fast mocked chaos suite.")
    _, remaining = parser.parse_known_args(argv)
    unittest.main(argv=[sys.argv[0], *remaining])


if __name__ == "__main__":
    main(sys.argv[1:])
