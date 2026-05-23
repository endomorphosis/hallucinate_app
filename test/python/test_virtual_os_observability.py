import json
import sys
import unittest
from datetime import timedelta
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    EventEnvelope,
    EventSeverity,
    HealthState,
    IdentityRef,
    ResourceKind,
    ResourceRef,
    utc_now,
)
from hallucinate_app.virtual_os.events import (  # noqa: E402
    DashboardComponentHealth,
    DashboardQuery,
    DaemonHeartbeat,
    EventCategory,
    EventPublishReceipt,
    EventPublishRequest,
    EventReplayQuery,
    EventSubscriptionSpec,
    MetricKind,
    MetricPoint,
    MetricUnit,
    OBSERVABILITY_SCHEMA_VERSION,
    ObservabilityEventBus,
    ObservabilityEventType,
    StructuredEvent,
    TraceContext,
    TraceSpan,
    TraceStatus,
    dashboard_safe,
    dashboard_snapshot as build_dashboard_snapshot,
    heartbeat_event,
    mcp_event_dag_mapping,
    metric_event,
    rollup_health,
    structured_event,
)


SEVERITY_ORDER = {
    EventSeverity.DEBUG.value: 10,
    EventSeverity.INFO.value: 20,
    EventSeverity.WARNING.value: 30,
    EventSeverity.ERROR.value: 40,
    EventSeverity.CRITICAL.value: 50,
}


def enum_value(value):
    return value.value if hasattr(value, "value") else value


class InMemoryObservabilityBus:
    """Small protocol fixture for exercising event, metric, and heartbeat flow."""

    def __init__(self):
        self.events = []
        self.metrics = []
        self.heartbeats = []
        self.subscriptions = []

    def publish_event(self, request):
        event = self._coerce_event(request.event, delivery_mode=request.delivery_mode)
        self.events.append(event)

        delivered = 0
        for spec, handler in self.subscriptions:
            if self._matches_event(event, spec):
                handler(event.envelope)
                delivered += 1

        return EventPublishReceipt(
            event_id=event.event_id,
            ok=True,
            stored=True,
            delivered_count=delivered,
        )

    def subscribe_events(self, spec, handler):
        self.subscriptions.append((spec, handler))
        return spec.subscriber_id

    def replay_events(self, query):
        events = [event for event in self.events if self._matches_query(event, query)]
        if query.limit is not None:
            events = events[: query.limit]
        return tuple(events)

    def record_metric(self, metric):
        self.metrics.append(metric)
        return self.publish_event(EventPublishRequest(event=metric_event(metric)))

    def emit_heartbeat(self, heartbeat):
        self.heartbeats.append(heartbeat)
        return self.publish_event(EventPublishRequest(event=heartbeat_event(heartbeat)))

    def event_dag(self, query):
        return mcp_event_dag_mapping(self.replay_events(query), trace_id=query.trace_id)

    def dashboard_snapshot(self, query):
        components = self._latest_component_health(query)
        events = self.replay_events(
            EventReplayQuery(trace_id=query.trace_id, limit=query.event_limit)
        )
        metrics = [
            metric
            for metric in self.metrics
            if not query.components or metric.component in query.components
        ][: query.metric_limit]
        return build_dashboard_snapshot(
            components=components,
            daemons=tuple(self.heartbeats),
            metrics=metrics,
            events=events,
            include_mcp_dag=True,
            metadata={
                "sections": [enum_value(section) for section in query.sections],
                "components": list(query.components),
            },
        )

    def _coerce_event(self, event, *, delivery_mode):
        if isinstance(event, StructuredEvent):
            return event
        category = dict(event.metadata).get("category") or EventCategory.SYSTEM.value
        return StructuredEvent(event, category=category, delivery_mode=delivery_mode)

    def _matches_event(self, event, spec):
        envelope = event.envelope
        if spec.event_types and envelope.event_type not in spec.event_types:
            return False
        if spec.categories:
            wanted = {enum_value(category) for category in spec.categories}
            if enum_value(event.category) not in wanted:
                return False
        if spec.sources and envelope.source not in spec.sources:
            return False
        if spec.trace_id and envelope.trace_id != spec.trace_id:
            return False
        if spec.severity_at_least:
            minimum = SEVERITY_ORDER[enum_value(spec.severity_at_least)]
            current = SEVERITY_ORDER[enum_value(envelope.severity)]
            if current < minimum:
                return False
        return True

    def _matches_query(self, event, query):
        envelope = event.envelope
        if query.event_types and envelope.event_type not in query.event_types:
            return False
        if query.categories:
            wanted = {enum_value(category) for category in query.categories}
            if enum_value(event.category) not in wanted:
                return False
        if query.sources and envelope.source not in query.sources:
            return False
        if query.trace_id and envelope.trace_id != query.trace_id:
            return False
        if query.correlation_id and envelope.correlation_id != query.correlation_id:
            return False
        if query.subject_uri and (not envelope.subject or envelope.subject.uri != query.subject_uri):
            return False
        if query.after and envelope.occurred_at <= query.after:
            return False
        if query.before and envelope.occurred_at >= query.before:
            return False
        return True

    def _latest_component_health(self, query):
        by_component = {}
        checked_at = utc_now()
        for heartbeat in self.heartbeats:
            if query.components and heartbeat.component not in query.components:
                continue
            by_component[heartbeat.component] = DashboardComponentHealth(
                component=heartbeat.component,
                state=heartbeat.effective_state(checked_at),
                daemon_id=heartbeat.daemon_id,
                last_heartbeat_at=heartbeat.observed_at,
                stale=heartbeat.is_stale(checked_at),
                message=heartbeat.last_error,
                metrics=heartbeat.metrics,
                metadata={"source": "heartbeat"},
            )
        return tuple(by_component.values())


class TestVirtualOSObservability(unittest.TestCase):
    def setUp(self):
        self.actor = IdentityRef(did="did:example:agent", roles=("agent",))
        self.subject = ResourceRef(
            uri="virtual-os://services/scheduler",
            kind=ResourceKind.SERVICE,
            component="virtual_os.scheduler",
            name="scheduler",
        )

    def test_metric_shape_and_metric_event_are_dashboard_ready(self):
        observed_at = utc_now()
        metric = MetricPoint(
            name="virtual_os.scheduler.queue_depth",
            value=7.0,
            kind=MetricKind.GAUGE,
            unit=MetricUnit.COUNT,
            component="virtual_os.scheduler",
            observed_at=observed_at,
            labels={"queue": "default", "priority": "p1"},
            description="Ready process queue depth",
            trace_id="trace-queue",
            correlation_id="corr-queue",
            exemplar_event_id="event-queue-sample",
            histogram_bounds=(1.0, 5.0, 10.0),
            metadata={"raw_sample": b"queue-depth-binary"},
        )

        metric_payload = metric.dashboard_dict()

        self.assertEqual(metric_payload["name"], "virtual_os.scheduler.queue_depth")
        self.assertEqual(metric_payload["kind"], MetricKind.GAUGE.value)
        self.assertEqual(metric_payload["unit"], MetricUnit.COUNT.value)
        self.assertEqual(metric_payload["component"], "virtual_os.scheduler")
        self.assertEqual(metric_payload["value"], 7.0)
        self.assertEqual(metric_payload["labels"], {"queue": "default", "priority": "p1"})
        self.assertEqual(metric_payload["histogram_bounds"], [1.0, 5.0, 10.0])
        self.assertEqual(metric_payload["observed_at"], observed_at.isoformat())
        self.assertEqual(metric_payload["metadata"]["raw_sample"], {"bytes": 18, "redacted": True})
        json.dumps(metric_payload)

        event = metric_event(metric, source="virtual_os.scheduler", actor=self.actor, subject=self.subject)

        self.assertEqual(event.envelope.event_type, ObservabilityEventType.METRIC_RECORDED.value)
        self.assertEqual(event.category, EventCategory.METRIC)
        self.assertEqual(event.schema.schema_version, OBSERVABILITY_SCHEMA_VERSION)
        self.assertIn("name", event.schema.required_payload_fields)
        self.assertEqual(event.metrics, (metric,))
        self.assertEqual(event.envelope.payload["name"], metric.name)
        self.assertEqual(event.envelope.payload["metadata"]["raw_sample"]["redacted"], True)
        self.assertEqual(event.envelope.metadata["category"], EventCategory.METRIC.value)
        self.assertEqual(event.envelope.trace_id, "trace-queue")
        self.assertEqual(event.envelope.correlation_id, "corr-queue")
        json.dumps(event.dashboard_dict())

    def test_event_bus_emits_events_metrics_heartbeats_and_replays_dag(self):
        bus = InMemoryObservabilityBus()
        self.assertIsInstance(bus, ObservabilityEventBus)
        received = []
        trace = TraceContext(
            trace_id="0123456789abcdef0123456789abcdef",
            span_id="abcdef0123456789",
            correlation_id="corr-observability",
        )
        subscription_id = bus.subscribe_events(
            EventSubscriptionSpec(
                subscriber_id="dashboard",
                categories=(EventCategory.SYSTEM, EventCategory.METRIC, EventCategory.DAEMON),
                trace_id=trace.trace_id,
            ),
            received.append,
        )

        root_event = structured_event(
            "virtual_os.scheduler.tick",
            source="virtual_os.scheduler",
            category=EventCategory.SYSTEM,
            actor=self.actor,
            subject=self.subject,
            trace=trace,
            payload={"ready": True, "raw": b"scheduler-state"},
        )
        child_event = structured_event(
            "virtual_os.scheduler.task_dispatched",
            source="virtual_os.scheduler",
            category=EventCategory.SYSTEM,
            actor=self.actor,
            subject=self.subject,
            trace=trace,
            parent_event_ids=(root_event.event_id,),
            payload={"task_id": "task-1"},
        )
        metric = MetricPoint(
            name="virtual_os.scheduler.dispatch_count",
            value=1,
            kind=MetricKind.COUNTER,
            unit=MetricUnit.EVENTS,
            component="virtual_os.scheduler",
            trace_id=trace.trace_id,
            correlation_id=trace.correlation_id,
        )
        heartbeat = DaemonHeartbeat(
            daemon_id="scheduler",
            component="virtual_os.scheduler",
            state=HealthState.HEALTHY,
            observed_at=utc_now(),
            sequence=3,
            trace_id=trace.trace_id,
            correlation_id=trace.correlation_id,
            metrics=(metric,),
        )

        root_receipt = bus.publish_event(EventPublishRequest(event=root_event, require_ack=True))
        child_receipt = bus.publish_event(EventPublishRequest(event=child_event, require_ack=True))
        metric_receipt = bus.record_metric(metric)
        heartbeat_receipt = bus.emit_heartbeat(heartbeat)

        self.assertEqual(subscription_id, "dashboard")
        self.assertTrue(root_receipt.stored)
        self.assertEqual(root_receipt.delivered_count, 1)
        self.assertEqual(child_receipt.delivered_count, 1)
        self.assertEqual(metric_receipt.delivered_count, 1)
        self.assertEqual(heartbeat_receipt.delivered_count, 1)
        self.assertEqual(len(received), 4)
        self.assertTrue(all(isinstance(event, EventEnvelope) for event in received))
        self.assertEqual(bus.metrics, [metric])
        self.assertEqual(bus.heartbeats, [heartbeat])

        replayed = bus.replay_events(EventReplayQuery(trace_id=trace.trace_id))
        self.assertEqual([event.event_id for event in replayed], [event.event_id for event in bus.events])

        dag = bus.event_dag(EventReplayQuery(trace_id=trace.trace_id))
        self.assertEqual(len(dag.nodes), 4)
        self.assertIn(root_event.event_id, dag.root_event_ids)
        self.assertIn(child_event.event_id, {edge.child_event_id for edge in dag.edges})
        self.assertEqual(dag.orphan_parent_event_ids, ())
        json.dumps(dag.dashboard_dict())

        snapshot = bus.dashboard_snapshot(DashboardQuery(trace_id=trace.trace_id))
        snapshot_payload = snapshot.dashboard_dict()
        self.assertEqual(snapshot_payload["health"], HealthState.HEALTHY.value)
        self.assertEqual(snapshot_payload["components"][0]["component"], "virtual_os.scheduler")
        self.assertEqual(snapshot_payload["events"][0]["payload"]["raw"], {"bytes": 15, "redacted": True})
        json.dumps(snapshot_payload)

    def test_health_rollup_covers_degraded_components_stale_heartbeats_and_stopped_state(self):
        checked_at = utc_now()
        healthy_heartbeat = DaemonHeartbeat(
            daemon_id="ipfs",
            component="ipfs_kit_py",
            state=HealthState.HEALTHY,
            observed_at=checked_at,
            stale_after_seconds=30,
        )
        stale_heartbeat = DaemonHeartbeat(
            daemon_id="mcp-plus-plus",
            component="mcp_plus_plus",
            state=HealthState.HEALTHY,
            observed_at=checked_at - timedelta(seconds=90),
            stale_after_seconds=30,
        )
        degraded_component = DashboardComponentHealth(
            component="ipfs_accelerate_py",
            state=HealthState.DEGRADED,
            message="GPU runtime unavailable; CPU fallback active",
            metadata={"required": False},
        )
        stopped_component = DashboardComponentHealth(
            component="swissknife",
            state=HealthState.STOPPED,
            message="disabled for test",
        )

        self.assertEqual(rollup_health(), HealthState.UNKNOWN)
        self.assertEqual(
            rollup_health((healthy_heartbeat,), (degraded_component,), at=checked_at),
            HealthState.DEGRADED,
        )
        self.assertEqual(stale_heartbeat.effective_state(checked_at), HealthState.UNHEALTHY)
        self.assertEqual(rollup_health((stale_heartbeat,), at=checked_at), HealthState.UNHEALTHY)
        self.assertEqual(rollup_health(component_health=(stopped_component,), at=checked_at), HealthState.STOPPED)

        snapshot = build_dashboard_snapshot(
            components=(degraded_component,),
            daemons=(healthy_heartbeat,),
            generated_at=checked_at,
        )
        payload = snapshot.dashboard_dict()
        self.assertEqual(payload["health"], HealthState.DEGRADED.value)
        self.assertEqual(payload["components"][0]["state"], HealthState.DEGRADED.value)
        self.assertEqual(payload["components"][0]["message"], degraded_component.message)
        json.dumps(payload)

    def test_dashboard_safe_serialization_redacts_binary_payloads(self):
        trace = TraceContext(
            trace_id="fedcba9876543210fedcba9876543210",
            span_id="0123456789abcdef",
            correlation_id="corr-dashboard",
        )
        metric = MetricPoint(
            name="virtual_os.dashboard.render_ms",
            value=12.5,
            kind=MetricKind.TIMER,
            unit=MetricUnit.MILLISECONDS,
            component="virtual_os.dashboard",
            trace_id=trace.trace_id,
            correlation_id=trace.correlation_id,
            metadata={"sample": b"timer-binary"},
        )
        event = structured_event(
            "virtual_os.dashboard.snapshot_ready",
            source="virtual_os.dashboard",
            category=EventCategory.DASHBOARD,
            actor=self.actor,
            subject=self.subject,
            trace=trace,
            payload={
                "snapshot_id": "snapshot-1",
                "raw_payload": b"secret-dashboard-payload",
                "nested": {"model_bytes": b"opaque-model-bytes"},
                "state": HealthState.HEALTHY,
            },
            metadata={"raw_metadata": b"secret-dashboard-metadata"},
            metrics=(metric,),
        )
        heartbeat = DaemonHeartbeat(
            daemon_id="dashboard",
            component="virtual_os.dashboard",
            state=HealthState.HEALTHY,
            observed_at=utc_now(),
            sequence=8,
            endpoint="http://127.0.0.1:3000/health",
            metrics=(metric,),
            metadata={"last_response": b"secret-health-response"},
        )
        component = DashboardComponentHealth(
            component="virtual_os.dashboard",
            state=HealthState.HEALTHY,
            daemon_id="dashboard",
            last_heartbeat_at=heartbeat.observed_at,
            metrics=(metric,),
            metadata={"debug_blob": b"secret-component-debug"},
        )
        span = TraceSpan(
            name="dashboard.snapshot",
            context=trace,
            status=TraceStatus.OK,
            attributes={"prompt": b"secret-trace-attribute"},
            events=(event.event_id,),
        )

        snapshot = build_dashboard_snapshot(
            components=(component,),
            daemons=(heartbeat,),
            metrics=(metric,),
            events=(event,),
            traces=(span,),
            notices=("snapshot-ready",),
            metadata={"binary": b"secret-snapshot-metadata"},
        )
        payload = snapshot.dashboard_dict()
        encoded = json.dumps(payload, sort_keys=True)

        self.assertEqual(payload["events"][0]["payload"]["raw_payload"], {"bytes": 24, "redacted": True})
        self.assertEqual(payload["events"][0]["payload"]["nested"]["model_bytes"]["redacted"], True)
        self.assertEqual(payload["metadata"]["binary"]["redacted"], True)
        self.assertEqual(payload["traces"][0]["attributes"]["prompt"]["redacted"], True)
        self.assertTrue(payload["mcp_dag"]["nodes"])
        self.assertIn('"redacted": true', encoded)
        self.assertNotIn("secret-dashboard-payload", encoded)
        self.assertNotIn("opaque-model-bytes", encoded)
        self.assertNotIn("secret-dashboard-metadata", encoded)
        self.assertNotIn("secret-health-response", encoded)
        self.assertNotIn("secret-component-debug", encoded)
        self.assertNotIn("secret-trace-attribute", encoded)
        self.assertNotIn("secret-snapshot-metadata", encoded)

        safe_actor_and_resource = dashboard_safe(
            {"actor": self.actor, "subject": self.subject, "blob": b"raw-browser-bytes"}
        )
        self.assertEqual(safe_actor_and_resource["actor"]["did"], self.actor.did)
        self.assertEqual(safe_actor_and_resource["subject"]["kind"], ResourceKind.SERVICE.value)
        self.assertEqual(safe_actor_and_resource["blob"], {"bytes": 17, "redacted": True})
        json.dumps(safe_actor_and_resource)


if __name__ == "__main__":
    unittest.main()
