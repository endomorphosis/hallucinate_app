import json
import sys
import unittest
from datetime import timedelta
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.boot import (  # noqa: E402
    BootConfig,
    DaemonBootRecord,
    DaemonDefinition,
    boot_virtual_os,
)
from hallucinate_app.virtual_os.contracts import EventEnvelope, EventSeverity, HealthState, ServiceStatus, utc_now  # noqa: E402
from hallucinate_app.virtual_os.events import (  # noqa: E402
    DashboardComponentHealth,
    DaemonHeartbeat,
    EventCategory,
    EventPublishReceipt,
    EventPublishRequest,
    StructuredEvent,
    TraceContext,
    daemon_resource,
    dashboard_snapshot,
    heartbeat_event,
    mcp_event_dag_mapping,
    rollup_health,
    structured_event,
)
from hallucinate_app.virtual_os.registry import DEFAULT_COMPONENT_IDS, ComponentAdapterRegistry  # noqa: E402


TRACE = TraceContext(
    trace_id="02802802802802802802802802802802",
    span_id="0280280280280280",
    correlation_id="os-028-daemon-recovery",
)
RECOVERED_DAEMON_ID = "ipfs_accelerate_py"
SOURCE = "test.virtual_os.daemon_recovery"


class HealthyComponentAdapter:
    def __init__(self, component_id: str):
        self._component_id = component_id

    def component_id(self):
        return self._component_id

    def capabilities(self):
        return ()

    def services(self):
        return ()

    def health(self):
        return ServiceStatus(
            service_id=f"{self._component_id}.adapter",
            state=HealthState.HEALTHY,
            message="healthy test adapter",
        )


class HealthyDaemonSupervisor:
    def __init__(self):
        self.started: list[DaemonDefinition] = []
        self.health_checked: list[str] = []

    def start_daemon(self, daemon: DaemonDefinition):
        self.started.append(daemon)
        return DaemonBootRecord(
            daemon_id=daemon.daemon_id,
            component_id=daemon.component_id,
            state=HealthState.STARTING,
            status="running",
            ok=True,
            pid=4200 + len(self.started),
            endpoint=daemon.endpoint_url,
            message="mock daemon started",
            started_at=utc_now(),
        )

    def health_daemon(self, daemon: DaemonDefinition, prior: DaemonBootRecord | None = None):
        self.health_checked.append(daemon.daemon_id)
        return DaemonBootRecord(
            daemon_id=daemon.daemon_id,
            component_id=daemon.component_id,
            state=HealthState.HEALTHY,
            status="running",
            ok=True,
            pid=prior.pid if prior else None,
            endpoint=daemon.endpoint_url,
            message="mock daemon healthy",
            started_at=prior.started_at if prior else None,
            metadata={"supervisor": "HealthyDaemonSupervisor"},
        )


class RecordingRecoveryBus:
    def __init__(self):
        self.events: list[EventEnvelope] = []
        self.structured_events: list[StructuredEvent] = []
        self.heartbeats: list[DaemonHeartbeat] = []

    def publish_event(self, request: EventPublishRequest):
        event = self._coerce_event(request.event)
        self.structured_events.append(event)
        self.events.append(event.envelope)
        return EventPublishReceipt(
            event_id=event.event_id,
            ok=True,
            stored=True,
            delivered_count=1,
        )

    def emit_heartbeat(self, heartbeat: DaemonHeartbeat):
        self.heartbeats.append(heartbeat)

    def _coerce_event(self, event):
        if isinstance(event, StructuredEvent):
            return event
        category = dict(event.metadata).get("category") or EventCategory.SYSTEM.value
        return StructuredEvent(event, category=category)


class DaemonRecoveryScenario:
    def __init__(self, *, daemon: DaemonDefinition, event_bus: RecordingRecoveryBus):
        self.daemon = daemon
        self.event_bus = event_bus
        self.sequence = 100
        self.restart_count = 0

    def crash(self):
        crashed_at = utc_now()
        stale_heartbeat = DaemonHeartbeat(
            daemon_id=self.daemon.daemon_id,
            component=self.daemon.component_id,
            state=HealthState.HEALTHY,
            observed_at=crashed_at - timedelta(seconds=90),
            sequence=self.sequence,
            pid=5101,
            endpoint=self.daemon.endpoint_url,
            stale_after_seconds=30,
            trace_id=TRACE.trace_id,
            correlation_id=TRACE.correlation_id,
            metadata={"phase": "before_crash"},
        )
        self._record_heartbeat(stale_heartbeat)

        event = structured_event(
            "virtual_os.daemon.crashed",
            source=SOURCE,
            category=EventCategory.DAEMON,
            severity=EventSeverity.ERROR,
            trace=TRACE,
            subject=daemon_resource(self.daemon.daemon_id, component=self.daemon.component_id),
            occurred_at=crashed_at,
            payload={
                "daemon_id": self.daemon.daemon_id,
                "component": self.daemon.component_id,
                "status": "crashed",
                "exit_code": 137,
                "signal": "SIGKILL",
                "last_heartbeat_at": stale_heartbeat.observed_at.isoformat(),
                "heartbeat_stale_after_seconds": stale_heartbeat.stale_after_seconds,
            },
        )
        self._publish(event)
        return event, stale_heartbeat, crashed_at

    def restart(self, crash_event: StructuredEvent):
        self.restart_count += 1
        restarted_at = utc_now()
        event = structured_event(
            "virtual_os.daemon.restart_requested",
            source=SOURCE,
            category=EventCategory.DAEMON,
            severity=EventSeverity.WARNING,
            trace=TRACE,
            subject=daemon_resource(self.daemon.daemon_id, component=self.daemon.component_id),
            parent_event_ids=(crash_event.event_id,),
            occurred_at=restarted_at,
            payload={
                "daemon_id": self.daemon.daemon_id,
                "component": self.daemon.component_id,
                "restart_count": self.restart_count,
                "previous_event_id": crash_event.event_id,
            },
        )
        self._publish(event)

        self.sequence += 1
        heartbeat = DaemonHeartbeat(
            daemon_id=self.daemon.daemon_id,
            component=self.daemon.component_id,
            state=HealthState.DEGRADED,
            observed_at=restarted_at,
            sequence=self.sequence,
            pid=6101,
            endpoint=self.daemon.endpoint_url,
            stale_after_seconds=30,
            last_error="restarting after crash; health probe not yet green",
            trace_id=TRACE.trace_id,
            correlation_id=TRACE.correlation_id,
            metadata={
                "phase": "restart",
                "restart_count": self.restart_count,
                "previous_event_id": crash_event.event_id,
            },
        )
        self._record_heartbeat(heartbeat)
        component = DashboardComponentHealth(
            component=self.daemon.component_id,
            state=HealthState.DEGRADED,
            daemon_id=self.daemon.daemon_id,
            last_heartbeat_at=heartbeat.observed_at,
            stale=False,
            message=heartbeat.last_error,
            metadata={"restart_count": self.restart_count},
        )
        return event, heartbeat, component

    def recover(self, restart_event: StructuredEvent):
        recovered_at = utc_now()
        self.sequence += 1
        heartbeat = DaemonHeartbeat(
            daemon_id=self.daemon.daemon_id,
            component=self.daemon.component_id,
            state=HealthState.HEALTHY,
            observed_at=recovered_at,
            sequence=self.sequence,
            pid=6101,
            endpoint=self.daemon.endpoint_url,
            stale_after_seconds=30,
            trace_id=TRACE.trace_id,
            correlation_id=TRACE.correlation_id,
            metadata={
                "phase": "recovered",
                "restart_count": self.restart_count,
                "previous_event_id": restart_event.event_id,
            },
        )
        self._record_heartbeat(heartbeat)

        event = structured_event(
            "virtual_os.daemon.recovered",
            source=SOURCE,
            category=EventCategory.DAEMON,
            severity=EventSeverity.INFO,
            trace=TRACE,
            subject=daemon_resource(self.daemon.daemon_id, component=self.daemon.component_id),
            parent_event_ids=(restart_event.event_id,),
            occurred_at=recovered_at,
            payload={
                "daemon_id": self.daemon.daemon_id,
                "component": self.daemon.component_id,
                "status": "running",
                "state": HealthState.HEALTHY.value,
                "restart_count": self.restart_count,
                "recovered": True,
            },
        )
        self._publish(event)
        return event, heartbeat

    def _record_heartbeat(self, heartbeat: DaemonHeartbeat):
        self.event_bus.emit_heartbeat(heartbeat)
        self.event_bus.publish_event(EventPublishRequest(event=heartbeat_event(heartbeat, source=SOURCE)))

    def _publish(self, event: StructuredEvent):
        self.event_bus.publish_event(EventPublishRequest(event=event))


class TestVirtualOSDaemonRecovery(unittest.TestCase):
    def test_crash_stale_heartbeat_restart_degraded_status_and_recovery_event(self):
        registry = ComponentAdapterRegistry(
            project_root=PROJECT_ROOT,
            adapters=[HealthyComponentAdapter(component_id) for component_id in DEFAULT_COMPONENT_IDS],
        )
        supervisor = HealthyDaemonSupervisor()
        event_bus = RecordingRecoveryBus()

        result = boot_virtual_os(
            BootConfig(
                project_root=PROJECT_ROOT,
                validate_baseline=False,
                wait_for_daemon_health=True,
                correlation_id=TRACE.correlation_id,
            ),
            daemon_supervisor=supervisor,
            event_bus=event_bus,
            registry=registry,
        )

        self.assertTrue(result.ok, result.errors)
        self.assertEqual(result.health, HealthState.HEALTHY)
        self.assertEqual({daemon.daemon_id for daemon in result.daemons}, set(DEFAULT_COMPONENT_IDS))
        self.assertEqual(set(supervisor.health_checked), set(DEFAULT_COMPONENT_IDS))

        target_daemon = next(daemon for daemon in supervisor.started if daemon.daemon_id == RECOVERED_DAEMON_ID)
        scenario = DaemonRecoveryScenario(daemon=target_daemon, event_bus=event_bus)

        crash_event, stale_heartbeat, crashed_at = scenario.crash()
        self.assertTrue(stale_heartbeat.is_stale(crashed_at))
        self.assertEqual(stale_heartbeat.effective_state(crashed_at), HealthState.UNHEALTHY)
        self.assertEqual(rollup_health((stale_heartbeat,), at=crashed_at), HealthState.UNHEALTHY)

        restart_event, degraded_heartbeat, degraded_component = scenario.restart(crash_event)
        degraded = dashboard_snapshot(
            components=(degraded_component,),
            daemons=(degraded_heartbeat,),
            events=(crash_event, restart_event),
        )
        self.assertEqual(degraded.health, HealthState.DEGRADED)
        self.assertEqual(degraded.dashboard_dict()["components"][0]["state"], HealthState.DEGRADED.value)
        self.assertEqual(degraded.dashboard_dict()["daemons"][0]["state"], HealthState.DEGRADED.value)

        recovered_event, recovered_heartbeat = scenario.recover(restart_event)
        recovered = dashboard_snapshot(
            daemons=(recovered_heartbeat,),
            events=(crash_event, restart_event, recovered_event),
        )

        event_types = [event.event_type for event in event_bus.events]
        self.assertIn("virtual_os.daemon.crashed", event_types)
        self.assertIn("virtual_os.daemon.restart_requested", event_types)
        self.assertIn("virtual_os.daemon.recovered", event_types)
        self.assertEqual(recovered_event.envelope.payload["recovered"], True)
        self.assertEqual(recovered_event.envelope.parent_event_ids, (restart_event.event_id,))
        self.assertEqual(recovered.health, HealthState.HEALTHY)

        dag = mcp_event_dag_mapping((crash_event, restart_event, recovered_event), trace_id=TRACE.trace_id)
        self.assertEqual(dag.orphan_parent_event_ids, ())
        self.assertEqual(
            {(edge.parent_event_id, edge.child_event_id) for edge in dag.edges},
            {
                (crash_event.event_id, restart_event.event_id),
                (restart_event.event_id, recovered_event.event_id),
            },
        )
        json.dumps(degraded.dashboard_dict())
        json.dumps(recovered.dashboard_dict())


if __name__ == "__main__":
    unittest.main()
