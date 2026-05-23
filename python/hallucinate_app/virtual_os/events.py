"""Event bus and observability contracts for the Hallucinate Virtual AI OS.

The contract is intentionally stdlib-only. Adapters for daemon managers,
MCP++ event DAG services, Prometheus/Grafana exporters, and dashboard runtimes
should normalize native telemetry into these payloads at the component
boundary.
"""

from __future__ import annotations

import hashlib
import json
import secrets
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Protocol, runtime_checkable

from .contracts import (
    EventEnvelope,
    EventHandler,
    EventSeverity,
    HealthState,
    IdentityRef,
    Labels,
    MaybeAwaitable,
    Metadata,
    ResourceKind,
    ResourceRef,
    ServiceStatus,
    utc_now,
)


VIRTUAL_OS_OBSERVABILITY_COMPONENT = "virtual_os.observability"
OBSERVABILITY_SCHEMA_VERSION = "virtual-os.events.v1"


class ObservabilityContractError(Exception):
    """Base error raised by observability contract helpers and adapters."""


class EventCategory(str, Enum):
    """High-level event classes consumed by sinks and dashboards."""

    AUDIT = "audit"
    SECURITY = "security"
    DAEMON = "daemon"
    SERVICE = "service"
    SCHEDULER = "scheduler"
    STORAGE = "storage"
    KNOWLEDGE = "knowledge"
    COMPUTE = "compute"
    MCP_DAG = "mcp_dag"
    METRIC = "metric"
    TRACE = "trace"
    DASHBOARD = "dashboard"
    SYSTEM = "system"
    CUSTOM = "custom"


class ObservabilityEventType(str, Enum):
    """Canonical event types emitted by the observability boundary."""

    EVENT_PUBLISHED = "virtual_os.events.published"
    EVENT_DROPPED = "virtual_os.events.dropped"
    METRIC_RECORDED = "virtual_os.metrics.recorded"
    TRACE_STARTED = "virtual_os.trace.started"
    TRACE_ENDED = "virtual_os.trace.ended"
    DAEMON_HEARTBEAT = "virtual_os.daemon.heartbeat"
    DAEMON_HEALTH_CHANGED = "virtual_os.daemon.health_changed"
    COMPONENT_HEALTH_ROLLUP = "virtual_os.health.rollup"
    MCP_DAG_NODE_RECORDED = "mcp_plus_plus.event_dag.node_recorded"
    MCP_DAG_EDGE_RECORDED = "mcp_plus_plus.event_dag.edge_recorded"
    DASHBOARD_SNAPSHOT_READY = "virtual_os.dashboard.snapshot_ready"


class EventDeliveryMode(str, Enum):
    """Delivery behavior requested by event publishers and subscribers."""

    BEST_EFFORT = "best_effort"
    AT_LEAST_ONCE = "at_least_once"
    DURABLE = "durable"
    REPLAY_ONLY = "replay_only"


class MetricKind(str, Enum):
    """Metric shapes adapters can expose without binding to one backend."""

    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"
    TIMER = "timer"


class MetricUnit(str, Enum):
    """Common metric units used by OS adapters and dashboards."""

    COUNT = "count"
    BYTES = "bytes"
    SECONDS = "seconds"
    MILLISECONDS = "milliseconds"
    PERCENT = "percent"
    RATIO = "ratio"
    TOKENS = "tokens"
    REQUESTS = "requests"
    EVENTS = "events"
    NONE = "none"


class TraceSpanKind(str, Enum):
    """Portable span kinds compatible with local and remote tracing systems."""

    INTERNAL = "internal"
    SERVER = "server"
    CLIENT = "client"
    PRODUCER = "producer"
    CONSUMER = "consumer"


class TraceStatus(str, Enum):
    """Trace or span completion state."""

    OK = "ok"
    ERROR = "error"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"


class MCPDAGNodeKind(str, Enum):
    """MCP++ event DAG node classes projected from OS event envelopes."""

    EVENT = "event"
    INTENT = "intent"
    INTERFACE = "interface"
    PROOF = "proof"
    POLICY_DECISION = "policy_decision"
    OUTPUT = "output"
    RECEIPT = "receipt"
    PEER = "peer"
    METRIC = "metric"
    HEARTBEAT = "heartbeat"


class DashboardSection(str, Enum):
    """Dashboard sections fed by the observability snapshot contract."""

    OVERVIEW = "overview"
    COMPONENTS = "components"
    DAEMONS = "daemons"
    METRICS = "metrics"
    EVENTS = "events"
    TRACES = "traces"
    MCP_DAG = "mcp_dag"


@dataclass(frozen=True)
class TraceContext:
    """Trace identifiers propagated through events, metrics, and heartbeats."""

    trace_id: str = field(default_factory=lambda: secrets.token_hex(16))
    span_id: str = field(default_factory=lambda: secrets.token_hex(8))
    parent_span_id: str | None = None
    correlation_id: str | None = None
    sampled: bool = True
    baggage: Metadata = field(default_factory=dict)

    def child(self, *, correlation_id: str | None = None, baggage: Metadata | None = None) -> "TraceContext":
        """Return a child span that preserves the trace id."""
        return TraceContext(
            trace_id=self.trace_id,
            span_id=secrets.token_hex(8),
            parent_span_id=self.span_id,
            correlation_id=correlation_id if correlation_id is not None else self.correlation_id,
            sampled=self.sampled,
            baggage={**dict(self.baggage), **dict(baggage or {})},
        )

    def traceparent(self) -> str:
        """Return a W3C traceparent header value when ids are already hex."""
        flags = "01" if self.sampled else "00"
        return f"00-{self.trace_id[:32]}-{self.span_id[:16]}-{flags}"

    def event_metadata(self) -> dict[str, Any]:
        """Return trace fields suitable for ``EventEnvelope.metadata``."""
        return {
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "parent_span_id": self.parent_span_id,
            "correlation_id": self.correlation_id,
            "sampled": self.sampled,
            "traceparent": self.traceparent(),
            "baggage": dashboard_safe(self.baggage),
        }


@dataclass(frozen=True)
class EventSchema:
    """Schema metadata attached to a structured event envelope."""

    event_type: str
    category: EventCategory | str
    schema_version: str = OBSERVABILITY_SCHEMA_VERSION
    description: str = ""
    required_payload_fields: tuple[str, ...] = ()
    optional_payload_fields: tuple[str, ...] = ()
    redacted_payload_fields: tuple[str, ...] = ()
    labels: Labels = field(default_factory=dict)

    def dashboard_dict(self) -> dict[str, Any]:
        """Return dashboard-safe schema metadata."""
        return {
            "event_type": self.event_type,
            "category": _enum_value(self.category),
            "schema_version": self.schema_version,
            "description": self.description,
            "required_payload_fields": list(self.required_payload_fields),
            "optional_payload_fields": list(self.optional_payload_fields),
            "redacted_payload_fields": list(self.redacted_payload_fields),
            "labels": dict(self.labels),
        }


@dataclass(frozen=True)
class StructuredEvent:
    """A typed projection of ``EventEnvelope`` for event bus adapters."""

    envelope: EventEnvelope
    category: EventCategory | str = EventCategory.SYSTEM
    schema_version: str = OBSERVABILITY_SCHEMA_VERSION
    schema: EventSchema | None = None
    delivery_mode: EventDeliveryMode | str = EventDeliveryMode.BEST_EFFORT
    labels: Labels = field(default_factory=dict)
    metrics: tuple["MetricPoint", ...] = ()
    mcp_dag: "MCPEventDAGNode | None" = None

    @property
    def event_id(self) -> str:
        return self.envelope.event_id

    @property
    def trace_id(self) -> str | None:
        return self.envelope.trace_id

    def dashboard_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly event view for dashboard consumers."""
        return {
            "event_id": self.envelope.event_id,
            "event_type": self.envelope.event_type,
            "category": _enum_value(self.category),
            "schema_version": self.schema_version,
            "source": self.envelope.source,
            "occurred_at": self.envelope.occurred_at.isoformat(),
            "severity": _enum_value(self.envelope.severity),
            "actor": dashboard_safe(self.envelope.actor),
            "subject": dashboard_safe(self.envelope.subject),
            "trace_id": self.envelope.trace_id,
            "correlation_id": self.envelope.correlation_id,
            "parent_event_ids": list(self.envelope.parent_event_ids),
            "payload": dashboard_safe(self.envelope.payload),
            "redacted_fields": list(self.envelope.redacted_fields),
            "metadata": dashboard_safe(self.envelope.metadata),
            "delivery_mode": _enum_value(self.delivery_mode),
            "labels": dict(self.labels),
            "metrics": [metric.dashboard_dict() for metric in self.metrics],
            "mcp_dag": self.mcp_dag.dashboard_dict() if self.mcp_dag else None,
        }


@dataclass(frozen=True)
class EventPublishRequest:
    """Request to publish a structured event through an observability bus."""

    event: StructuredEvent | EventEnvelope
    actor: IdentityRef | None = None
    trace: TraceContext | None = None
    delivery_mode: EventDeliveryMode | str = EventDeliveryMode.BEST_EFFORT
    require_ack: bool = False
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class EventPublishReceipt:
    """Acknowledgement returned by event bus adapters."""

    event_id: str
    ok: bool = True
    stored: bool = False
    delivered_count: int = 0
    dropped_count: int = 0
    bus_offset: str | None = None
    occurred_at: datetime = field(default_factory=utc_now)
    message: str = ""
    metadata: Metadata = field(default_factory=dict)

    def dashboard_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly publish receipt."""
        return {
            "event_id": self.event_id,
            "ok": self.ok,
            "stored": self.stored,
            "delivered_count": self.delivered_count,
            "dropped_count": self.dropped_count,
            "bus_offset": self.bus_offset,
            "occurred_at": self.occurred_at.isoformat(),
            "message": self.message,
            "metadata": dashboard_safe(self.metadata),
        }


@dataclass(frozen=True)
class EventSubscriptionSpec:
    """Subscription filters for live or replayed event consumption."""

    subscriber_id: str
    event_types: tuple[str, ...] = ()
    categories: tuple[EventCategory | str, ...] = ()
    sources: tuple[str, ...] = ()
    severity_at_least: EventSeverity | str | None = None
    trace_id: str | None = None
    include_replay: bool = False
    delivery_mode: EventDeliveryMode | str = EventDeliveryMode.BEST_EFFORT
    labels: Labels = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class EventReplayQuery:
    """Replay filters used by tests, dashboards, and recovery adapters."""

    event_types: tuple[str, ...] = ()
    categories: tuple[EventCategory | str, ...] = ()
    sources: tuple[str, ...] = ()
    trace_id: str | None = None
    correlation_id: str | None = None
    subject_uri: str | None = None
    after: datetime | None = None
    before: datetime | None = None
    limit: int | None = None
    include_metrics: bool = True
    include_mcp_dag: bool = True


@dataclass(frozen=True)
class MetricPoint:
    """A single metric sample normalized for exporters and dashboards."""

    name: str
    value: float
    kind: MetricKind | str = MetricKind.GAUGE
    unit: MetricUnit | str = MetricUnit.NONE
    component: str = VIRTUAL_OS_OBSERVABILITY_COMPONENT
    observed_at: datetime = field(default_factory=utc_now)
    labels: Labels = field(default_factory=dict)
    description: str = ""
    trace_id: str | None = None
    correlation_id: str | None = None
    exemplar_event_id: str | None = None
    histogram_bounds: tuple[float, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not str(self.name).strip():
            raise ValueError("metric name cannot be empty")

    def to_event(
        self,
        *,
        source: str | None = None,
        actor: IdentityRef | None = None,
        subject: ResourceRef | None = None,
        parent_event_ids: Sequence[str] = (),
        severity: EventSeverity | str = EventSeverity.INFO,
    ) -> EventEnvelope:
        """Return this metric as a structured event envelope."""
        occurred = self.observed_at
        event_id = stable_observability_id(
            "metric",
            self.name,
            self.component,
            occurred.isoformat(),
            self.trace_id or "",
            self.correlation_id or "",
            self.exemplar_event_id or "",
        )
        return EventEnvelope(
            event_id=event_id,
            event_type=ObservabilityEventType.METRIC_RECORDED.value,
            source=source or self.component,
            occurred_at=occurred,
            severity=severity,
            actor=actor,
            subject=subject,
            trace_id=self.trace_id,
            correlation_id=self.correlation_id,
            parent_event_ids=tuple(parent_event_ids),
            payload=self.dashboard_dict(),
            metadata={
                "category": EventCategory.METRIC.value,
                "schema_version": OBSERVABILITY_SCHEMA_VERSION,
            },
        )

    def dashboard_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly metric sample."""
        return {
            "name": self.name,
            "value": self.value,
            "kind": _enum_value(self.kind),
            "unit": _enum_value(self.unit),
            "component": self.component,
            "observed_at": self.observed_at.isoformat(),
            "labels": dict(self.labels),
            "description": self.description,
            "trace_id": self.trace_id,
            "correlation_id": self.correlation_id,
            "exemplar_event_id": self.exemplar_event_id,
            "histogram_bounds": list(self.histogram_bounds),
            "metadata": dashboard_safe(self.metadata),
        }


@dataclass(frozen=True)
class TraceSpan:
    """Span metadata used to correlate OS work with event envelopes."""

    name: str
    context: TraceContext = field(default_factory=TraceContext)
    kind: TraceSpanKind | str = TraceSpanKind.INTERNAL
    status: TraceStatus | str = TraceStatus.UNKNOWN
    source: str = VIRTUAL_OS_OBSERVABILITY_COMPONENT
    actor: IdentityRef | None = None
    subject: ResourceRef | None = None
    started_at: datetime = field(default_factory=utc_now)
    ended_at: datetime | None = None
    attributes: Metadata = field(default_factory=dict)
    events: tuple[str, ...] = ()

    @property
    def duration_ms(self) -> float | None:
        """Return span duration in milliseconds when the span has ended."""
        if self.ended_at is None:
            return None
        return (self.ended_at - self.started_at).total_seconds() * 1000

    def dashboard_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly span view."""
        return {
            "name": self.name,
            "trace_id": self.context.trace_id,
            "span_id": self.context.span_id,
            "parent_span_id": self.context.parent_span_id,
            "correlation_id": self.context.correlation_id,
            "kind": _enum_value(self.kind),
            "status": _enum_value(self.status),
            "source": self.source,
            "actor": dashboard_safe(self.actor),
            "subject": dashboard_safe(self.subject),
            "started_at": self.started_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_ms": self.duration_ms,
            "attributes": dashboard_safe(self.attributes),
            "events": list(self.events),
        }


@dataclass(frozen=True)
class DaemonHeartbeat:
    """Heartbeat sample emitted by daemon supervisors and service adapters."""

    daemon_id: str
    component: str
    state: HealthState | str
    observed_at: datetime = field(default_factory=utc_now)
    sequence: int = 0
    pid: int | None = None
    endpoint: str | None = None
    uptime_seconds: float | None = None
    interval_seconds: float = 10.0
    stale_after_seconds: float = 30.0
    service_status: ServiceStatus | None = None
    metrics: tuple[MetricPoint, ...] = ()
    dependencies: tuple[str, ...] = ()
    last_error: str = ""
    trace_id: str | None = None
    correlation_id: str | None = None
    metadata: Metadata = field(default_factory=dict)

    def resource(self) -> ResourceRef:
        """Return the daemon heartbeat subject resource."""
        return daemon_resource(self.daemon_id, component=self.component)

    def is_stale(self, at: datetime | None = None) -> bool:
        """Return whether this heartbeat is stale at ``at``."""
        checked_at = at or utc_now()
        age = (checked_at - self.observed_at).total_seconds()
        return age > self.stale_after_seconds

    def effective_state(self, at: datetime | None = None) -> HealthState | str:
        """Return ``unhealthy`` when the heartbeat is stale."""
        if self.is_stale(at):
            return HealthState.UNHEALTHY
        return self.state

    def to_event(
        self,
        *,
        source: str | None = None,
        actor: IdentityRef | None = None,
        parent_event_ids: Sequence[str] = (),
        severity: EventSeverity | str = EventSeverity.INFO,
    ) -> EventEnvelope:
        """Return this heartbeat as an event envelope."""
        event_id = stable_observability_id(
            "heartbeat",
            self.daemon_id,
            self.component,
            str(self.sequence),
            self.observed_at.isoformat(),
        )
        return EventEnvelope(
            event_id=event_id,
            event_type=ObservabilityEventType.DAEMON_HEARTBEAT.value,
            source=source or self.component,
            occurred_at=self.observed_at,
            severity=severity,
            actor=actor,
            subject=self.resource(),
            trace_id=self.trace_id,
            correlation_id=self.correlation_id,
            parent_event_ids=tuple(parent_event_ids),
            payload=self.dashboard_dict(),
            metadata={
                "category": EventCategory.DAEMON.value,
                "schema_version": OBSERVABILITY_SCHEMA_VERSION,
            },
        )

    def dashboard_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly heartbeat view."""
        return {
            "daemon_id": self.daemon_id,
            "component": self.component,
            "state": _enum_value(self.state),
            "observed_at": self.observed_at.isoformat(),
            "sequence": self.sequence,
            "pid": self.pid,
            "endpoint": self.endpoint,
            "uptime_seconds": self.uptime_seconds,
            "interval_seconds": self.interval_seconds,
            "stale_after_seconds": self.stale_after_seconds,
            "stale": self.is_stale(),
            "service_status": dashboard_safe(self.service_status),
            "metrics": [metric.dashboard_dict() for metric in self.metrics],
            "dependencies": list(self.dependencies),
            "last_error": self.last_error,
            "trace_id": self.trace_id,
            "correlation_id": self.correlation_id,
            "metadata": dashboard_safe(self.metadata),
        }


@dataclass(frozen=True)
class MCPEventDAGNode:
    """MCP++ event DAG node projected from one OS event or receipt."""

    node_id: str
    event_id: str
    event_type: str
    kind: MCPDAGNodeKind | str = MCPDAGNodeKind.EVENT
    source: str = VIRTUAL_OS_OBSERVABILITY_COMPONENT
    occurred_at: datetime = field(default_factory=utc_now)
    parents: tuple[str, ...] = ()
    event_cid: str | None = None
    payload_cid: str | None = None
    proof_cid: str | None = None
    receipt_cid: str | None = None
    subject_uri: str | None = None
    trace_id: str | None = None
    correlation_id: str | None = None
    peer_id: str | None = None
    labels: Labels = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)

    def dashboard_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly MCP++ event DAG node."""
        return {
            "node_id": self.node_id,
            "event_id": self.event_id,
            "event_type": self.event_type,
            "kind": _enum_value(self.kind),
            "source": self.source,
            "occurred_at": self.occurred_at.isoformat(),
            "parents": list(self.parents),
            "event_cid": self.event_cid,
            "payload_cid": self.payload_cid,
            "proof_cid": self.proof_cid,
            "receipt_cid": self.receipt_cid,
            "subject_uri": self.subject_uri,
            "trace_id": self.trace_id,
            "correlation_id": self.correlation_id,
            "peer_id": self.peer_id,
            "labels": dict(self.labels),
            "metadata": dashboard_safe(self.metadata),
        }


@dataclass(frozen=True)
class MCPEventDAGEdge:
    """Parent-to-child edge in the MCP++ event DAG projection."""

    parent_event_id: str
    child_event_id: str
    relation: str = "causes"
    metadata: Metadata = field(default_factory=dict)

    def dashboard_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly edge."""
        return {
            "parent_event_id": self.parent_event_id,
            "child_event_id": self.child_event_id,
            "relation": self.relation,
            "metadata": dashboard_safe(self.metadata),
        }


@dataclass(frozen=True)
class MCPEventDAGMapping:
    """A dashboard and MCP++ friendly projection of event causal links."""

    nodes: tuple[MCPEventDAGNode, ...] = ()
    edges: tuple[MCPEventDAGEdge, ...] = ()
    root_event_ids: tuple[str, ...] = ()
    orphan_parent_event_ids: tuple[str, ...] = ()
    trace_id: str | None = None
    generated_at: datetime = field(default_factory=utc_now)
    metadata: Metadata = field(default_factory=dict)

    def dashboard_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly DAG mapping."""
        return {
            "nodes": [node.dashboard_dict() for node in self.nodes],
            "edges": [edge.dashboard_dict() for edge in self.edges],
            "root_event_ids": list(self.root_event_ids),
            "orphan_parent_event_ids": list(self.orphan_parent_event_ids),
            "trace_id": self.trace_id,
            "generated_at": self.generated_at.isoformat(),
            "metadata": dashboard_safe(self.metadata),
        }


@dataclass(frozen=True)
class DashboardComponentHealth:
    """Component health row consumed by Virtual AI OS dashboards."""

    component: str
    state: HealthState | str
    daemon_id: str | None = None
    last_heartbeat_at: datetime | None = None
    stale: bool = False
    message: str = ""
    metrics: tuple[MetricPoint, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    def dashboard_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly component health row."""
        return {
            "component": self.component,
            "state": _enum_value(self.state),
            "daemon_id": self.daemon_id,
            "last_heartbeat_at": self.last_heartbeat_at.isoformat() if self.last_heartbeat_at else None,
            "stale": self.stale,
            "message": self.message,
            "metrics": [metric.dashboard_dict() for metric in self.metrics],
            "metadata": dashboard_safe(self.metadata),
        }


@dataclass(frozen=True)
class DashboardQuery:
    """Dashboard snapshot filters and size limits."""

    sections: tuple[DashboardSection | str, ...] = (
        DashboardSection.OVERVIEW,
        DashboardSection.COMPONENTS,
        DashboardSection.DAEMONS,
        DashboardSection.METRICS,
        DashboardSection.EVENTS,
        DashboardSection.TRACES,
        DashboardSection.MCP_DAG,
    )
    components: tuple[str, ...] = ()
    trace_id: str | None = None
    event_limit: int = 100
    metric_limit: int = 200
    include_payloads: bool = False
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class DashboardSnapshot:
    """Complete observability snapshot safe for browser consumption."""

    generated_at: datetime = field(default_factory=utc_now)
    health: HealthState | str = HealthState.UNKNOWN
    components: tuple[DashboardComponentHealth, ...] = ()
    daemons: tuple[DaemonHeartbeat, ...] = ()
    metrics: tuple[MetricPoint, ...] = ()
    events: tuple[StructuredEvent, ...] = ()
    traces: tuple[TraceSpan, ...] = ()
    mcp_dag: MCPEventDAGMapping | None = None
    notices: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    def dashboard_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly dashboard snapshot."""
        return {
            "generated_at": self.generated_at.isoformat(),
            "health": _enum_value(self.health),
            "components": [component.dashboard_dict() for component in self.components],
            "daemons": [daemon.dashboard_dict() for daemon in self.daemons],
            "metrics": [metric.dashboard_dict() for metric in self.metrics],
            "events": [event.dashboard_dict() for event in self.events],
            "traces": [trace.dashboard_dict() for trace in self.traces],
            "mcp_dag": self.mcp_dag.dashboard_dict() if self.mcp_dag else None,
            "notices": list(self.notices),
            "metadata": dashboard_safe(self.metadata),
        }


def trace_context_from_event(event: EventEnvelope) -> TraceContext | None:
    """Return trace context carried by an event envelope, if present."""
    if not event.trace_id:
        return None
    metadata = dict(event.metadata)
    return TraceContext(
        trace_id=event.trace_id,
        span_id=str(metadata.get("span_id") or secrets.token_hex(8)),
        parent_span_id=metadata.get("parent_span_id"),
        correlation_id=event.correlation_id or metadata.get("correlation_id"),
        sampled=bool(metadata.get("sampled", True)),
        baggage=dict(metadata.get("baggage") or {}),
    )


def structured_event(
    event_type: ObservabilityEventType | str,
    *,
    source: str = VIRTUAL_OS_OBSERVABILITY_COMPONENT,
    category: EventCategory | str = EventCategory.SYSTEM,
    actor: IdentityRef | None = None,
    subject: ResourceRef | None = None,
    severity: EventSeverity | str = EventSeverity.INFO,
    trace: TraceContext | None = None,
    trace_id: str | None = None,
    correlation_id: str | None = None,
    parent_event_ids: Sequence[str] = (),
    payload: Metadata | None = None,
    metadata: Metadata | None = None,
    labels: Labels | None = None,
    schema: EventSchema | None = None,
    metrics: Sequence[MetricPoint] = (),
    occurred_at: datetime | None = None,
) -> StructuredEvent:
    """Build a structured event envelope with observability metadata."""
    event_type_value = _enum_value(event_type)
    occurred = occurred_at or utc_now()
    schema_version = schema.schema_version if schema else OBSERVABILITY_SCHEMA_VERSION
    trace_metadata = trace.event_metadata() if trace else {}
    event_trace_id = trace.trace_id if trace else trace_id
    event_correlation_id = trace.correlation_id if trace else correlation_id
    event_id = stable_observability_id(
        "event",
        event_type_value,
        source,
        subject.uri if subject else "",
        event_trace_id or "",
        event_correlation_id or "",
        occurred.isoformat(),
    )
    envelope = EventEnvelope(
        event_id=event_id,
        event_type=event_type_value,
        source=source,
        occurred_at=occurred,
        severity=severity,
        actor=actor,
        subject=subject,
        trace_id=event_trace_id,
        correlation_id=event_correlation_id,
        parent_event_ids=tuple(parent_event_ids),
        payload=dict(payload or {}),
        metadata={
            "category": _enum_value(category),
            "schema_version": schema_version,
            **trace_metadata,
            **dict(metadata or {}),
        },
    )
    dag_node = event_to_mcp_dag_node(envelope) if _enum_value(category) == EventCategory.MCP_DAG.value else None
    return StructuredEvent(
        envelope=envelope,
        category=category,
        schema_version=schema_version,
        schema=schema,
        labels=dict(labels or {}),
        metrics=tuple(metrics),
        mcp_dag=dag_node,
    )


def metric_event(metric: MetricPoint, **kwargs: Any) -> StructuredEvent:
    """Build a structured metric event."""
    envelope = metric.to_event(**kwargs)
    schema = EventSchema(
        event_type=envelope.event_type,
        category=EventCategory.METRIC,
        required_payload_fields=("name", "value", "kind", "unit", "component", "observed_at"),
    )
    return StructuredEvent(
        envelope=envelope,
        category=EventCategory.METRIC,
        schema=schema,
        metrics=(metric,),
    )


def heartbeat_event(heartbeat: DaemonHeartbeat, **kwargs: Any) -> StructuredEvent:
    """Build a structured daemon heartbeat event."""
    envelope = heartbeat.to_event(**kwargs)
    schema = EventSchema(
        event_type=envelope.event_type,
        category=EventCategory.DAEMON,
        required_payload_fields=("daemon_id", "component", "state", "observed_at", "sequence"),
    )
    return StructuredEvent(
        envelope=envelope,
        category=EventCategory.DAEMON,
        schema=schema,
        metrics=heartbeat.metrics,
    )


def event_to_mcp_dag_node(
    event: EventEnvelope,
    *,
    kind: MCPDAGNodeKind | str = MCPDAGNodeKind.EVENT,
    event_cid: str | None = None,
) -> MCPEventDAGNode:
    """Map an OS event envelope to an MCP++ event DAG node."""
    metadata = dict(event.metadata)
    payload = dict(event.payload)
    computed_cid = event_cid or metadata.get("event_cid") or stable_observability_cid(event)
    node_id = str(metadata.get("mcp_dag_node_id") or computed_cid or event.event_id)
    return MCPEventDAGNode(
        node_id=node_id,
        event_id=event.event_id,
        event_type=event.event_type,
        kind=kind,
        source=event.source,
        occurred_at=event.occurred_at,
        parents=tuple(event.parent_event_ids),
        event_cid=computed_cid,
        payload_cid=metadata.get("payload_cid") or payload.get("payload_cid"),
        proof_cid=metadata.get("proof_cid") or payload.get("proof_cid"),
        receipt_cid=metadata.get("receipt_cid") or payload.get("receipt_cid"),
        subject_uri=event.subject.uri if event.subject else None,
        trace_id=event.trace_id,
        correlation_id=event.correlation_id,
        peer_id=metadata.get("peer_id") or payload.get("peer_id"),
        labels=dict(metadata.get("labels") or {}),
        metadata={
            "severity": _enum_value(event.severity),
            "category": metadata.get("category"),
            "schema_version": metadata.get("schema_version"),
        },
    )


def mcp_event_dag_mapping(
    events: Sequence[EventEnvelope | StructuredEvent],
    *,
    trace_id: str | None = None,
    metadata: Metadata | None = None,
) -> MCPEventDAGMapping:
    """Return MCP++ DAG nodes and edges for a collection of events."""
    envelopes = tuple(event.envelope if isinstance(event, StructuredEvent) else event for event in events)
    nodes = tuple(event_to_mcp_dag_node(event) for event in envelopes)
    known_event_ids = {event.event_id for event in envelopes}
    edges: list[MCPEventDAGEdge] = []
    roots: list[str] = []
    orphans: set[str] = set()

    for event in envelopes:
        if not event.parent_event_ids:
            roots.append(event.event_id)
            continue
        for parent_id in event.parent_event_ids:
            edges.append(MCPEventDAGEdge(parent_event_id=parent_id, child_event_id=event.event_id))
            if parent_id not in known_event_ids:
                orphans.add(parent_id)

    return MCPEventDAGMapping(
        nodes=nodes,
        edges=tuple(edges),
        root_event_ids=tuple(roots),
        orphan_parent_event_ids=tuple(sorted(orphans)),
        trace_id=trace_id,
        metadata=dict(metadata or {}),
    )


def daemon_resource(daemon_id: str, *, component: str | None = None) -> ResourceRef:
    """Return the canonical resource URI for an OS-managed daemon."""
    value = str(daemon_id).strip()
    if not value:
        raise ValueError("daemon_id cannot be empty")
    return ResourceRef(
        uri=f"virtual-os://daemons/{value}",
        kind=ResourceKind.DAEMON,
        component=component,
        name=value,
    )


def event_stream_resource(stream_id: str = "default") -> ResourceRef:
    """Return the canonical resource URI for an event stream."""
    value = str(stream_id).strip() or "default"
    return ResourceRef(
        uri=f"virtual-os://events/{value}",
        kind=ResourceKind.EVENT_STREAM,
        component=VIRTUAL_OS_OBSERVABILITY_COMPONENT,
        name=value,
    )


def rollup_health(
    heartbeats: Sequence[DaemonHeartbeat] = (),
    component_health: Sequence[DashboardComponentHealth] = (),
    *,
    at: datetime | None = None,
) -> HealthState:
    """Return aggregate health for dashboard summaries."""
    states: list[str] = []
    for heartbeat in heartbeats:
        states.append(_enum_value(heartbeat.effective_state(at)))
    for component in component_health:
        states.append(HealthState.UNHEALTHY.value if component.stale else _enum_value(component.state))

    if not states:
        return HealthState.UNKNOWN
    if any(state == HealthState.UNHEALTHY.value for state in states):
        return HealthState.UNHEALTHY
    if any(state == HealthState.DEGRADED.value for state in states):
        return HealthState.DEGRADED
    if all(state == HealthState.STOPPED.value for state in states):
        return HealthState.STOPPED
    if any(state in {HealthState.STARTING.value, HealthState.UNKNOWN.value} for state in states):
        return HealthState.DEGRADED
    return HealthState.HEALTHY


def dashboard_snapshot(
    *,
    components: Sequence[DashboardComponentHealth] = (),
    daemons: Sequence[DaemonHeartbeat] = (),
    metrics: Sequence[MetricPoint] = (),
    events: Sequence[StructuredEvent | EventEnvelope] = (),
    traces: Sequence[TraceSpan] = (),
    include_mcp_dag: bool = True,
    notices: Sequence[str] = (),
    metadata: Metadata | None = None,
    generated_at: datetime | None = None,
) -> DashboardSnapshot:
    """Build a dashboard-safe observability snapshot."""
    structured_events = tuple(
        event if isinstance(event, StructuredEvent) else StructuredEvent(event, category=_event_category(event))
        for event in events
    )
    dag = mcp_event_dag_mapping(structured_events) if include_mcp_dag else None
    return DashboardSnapshot(
        generated_at=generated_at or utc_now(),
        health=rollup_health(daemons, components),
        components=tuple(components),
        daemons=tuple(daemons),
        metrics=tuple(metrics),
        events=structured_events,
        traces=tuple(traces),
        mcp_dag=dag,
        notices=tuple(notices),
        metadata=dict(metadata or {}),
    )


def dashboard_safe(value: Any) -> Any:
    """Return a JSON-friendly value safe for browser dashboard payloads."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bytes):
        return {"bytes": len(value), "redacted": True}
    if isinstance(value, EventEnvelope):
        return {
            "event_id": value.event_id,
            "event_type": value.event_type,
            "source": value.source,
            "occurred_at": value.occurred_at.isoformat(),
            "severity": _enum_value(value.severity),
            "actor": dashboard_safe(value.actor),
            "subject": dashboard_safe(value.subject),
            "trace_id": value.trace_id,
            "correlation_id": value.correlation_id,
            "parent_event_ids": list(value.parent_event_ids),
            "payload": dashboard_safe(value.payload),
            "redacted_fields": list(value.redacted_fields),
            "metadata": dashboard_safe(value.metadata),
        }
    if isinstance(value, IdentityRef):
        return {
            "did": value.did,
            "display_name": value.display_name,
            "roles": list(value.roles),
            "public_key_refs": list(value.public_key_refs),
            "metadata": dashboard_safe(value.metadata),
        }
    if isinstance(value, ResourceRef):
        return {
            "uri": value.uri,
            "kind": _enum_value(value.kind),
            "component": value.component,
            "name": value.name,
            "labels": dict(value.labels),
            "metadata": dashboard_safe(value.metadata),
        }
    if hasattr(value, "dashboard_dict"):
        return value.dashboard_dict()
    if hasattr(value, "__dataclass_fields__"):
        return {
            field_name: dashboard_safe(getattr(value, field_name))
            for field_name in value.__dataclass_fields__
        }
    if isinstance(value, Mapping):
        return {str(key): dashboard_safe(item) for key, item in value.items()}
    if isinstance(value, Sequence):
        return [dashboard_safe(item) for item in value]
    return str(value)


def canonical_observability_json(value: Any) -> str:
    """Return deterministic JSON for event ids and MCP++ CID projections."""
    return json.dumps(dashboard_safe(value), sort_keys=True, separators=(",", ":"), default=str)


def stable_observability_id(*parts: object) -> str:
    """Return a deterministic sha256 id for observability records."""
    payload = "\x1f".join(str(part) for part in parts)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def stable_observability_cid(event: EventEnvelope) -> str:
    """Return a deterministic CID-like digest for an event DAG node."""
    digest = stable_observability_id("mcp-event", canonical_observability_json(event))
    return f"sha256:{digest}"


def _event_category(event: EventEnvelope) -> EventCategory | str:
    metadata_category = dict(event.metadata).get("category")
    if metadata_category:
        return str(metadata_category)
    if event.event_type.startswith("mcp_plus_plus."):
        return EventCategory.MCP_DAG
    if ".daemon." in event.event_type:
        return EventCategory.DAEMON
    if ".metric" in event.event_type:
        return EventCategory.METRIC
    if ".trace." in event.event_type:
        return EventCategory.TRACE
    if ".security." in event.event_type or ".audit." in event.event_type:
        return EventCategory.SECURITY
    return EventCategory.SYSTEM


def _enum_value(value: Any) -> Any:
    return value.value if isinstance(value, Enum) else value


@runtime_checkable
class ObservabilityEventBus(Protocol):
    """Event bus contract for observability, audit, metrics, and dashboards."""

    def publish_event(self, request: EventPublishRequest) -> MaybeAwaitable[EventPublishReceipt]:
        """Publish one event envelope or structured event."""

    def subscribe_events(
        self,
        spec: EventSubscriptionSpec,
        handler: EventHandler,
    ) -> MaybeAwaitable[str]:
        """Subscribe to events and return a subscription id."""

    def replay_events(self, query: EventReplayQuery) -> MaybeAwaitable[Sequence[StructuredEvent]]:
        """Replay stored events for dashboards, tests, or recovery."""

    def record_metric(self, metric: MetricPoint) -> MaybeAwaitable[EventPublishReceipt]:
        """Record a metric point and publish the corresponding event."""

    def emit_heartbeat(self, heartbeat: DaemonHeartbeat) -> MaybeAwaitable[EventPublishReceipt]:
        """Record daemon heartbeat state and publish the heartbeat event."""

    def event_dag(self, query: EventReplayQuery) -> MaybeAwaitable[MCPEventDAGMapping]:
        """Return MCP++ DAG projection for matching events."""

    def dashboard_snapshot(self, query: DashboardQuery) -> MaybeAwaitable[DashboardSnapshot]:
        """Return a dashboard-safe observability snapshot."""


@runtime_checkable
class MetricsSink(Protocol):
    """Metric export boundary for Prometheus, logs, or local dashboards."""

    def record_metric(self, metric: MetricPoint) -> MaybeAwaitable[None]:
        """Record one metric sample."""

    def snapshot_metrics(self, query: DashboardQuery | None = None) -> MaybeAwaitable[Sequence[MetricPoint]]:
        """Return recent metric samples."""


@runtime_checkable
class TraceSink(Protocol):
    """Trace export boundary for local spans or external collectors."""

    def start_span(self, span: TraceSpan) -> MaybeAwaitable[TraceSpan]:
        """Start or register a trace span."""

    def end_span(
        self,
        trace_id: str,
        span_id: str,
        *,
        status: TraceStatus | str = TraceStatus.OK,
        ended_at: datetime | None = None,
        attributes: Metadata | None = None,
    ) -> MaybeAwaitable[TraceSpan]:
        """End a span and return its final record."""


@runtime_checkable
class DaemonHeartbeatSink(Protocol):
    """Heartbeat ingestion boundary used by daemon supervisors."""

    def emit_heartbeat(self, heartbeat: DaemonHeartbeat) -> MaybeAwaitable[EventPublishReceipt]:
        """Store and publish one daemon heartbeat."""

    def latest_heartbeats(self, components: Sequence[str] = ()) -> MaybeAwaitable[Sequence[DaemonHeartbeat]]:
        """Return the latest heartbeat per daemon."""


__all__ = [
    "DashboardComponentHealth",
    "DashboardQuery",
    "DashboardSection",
    "DashboardSnapshot",
    "DaemonHeartbeat",
    "DaemonHeartbeatSink",
    "EventCategory",
    "EventDeliveryMode",
    "EventPublishReceipt",
    "EventPublishRequest",
    "EventReplayQuery",
    "EventSchema",
    "EventSubscriptionSpec",
    "MCPDAGNodeKind",
    "MCPEventDAGEdge",
    "MCPEventDAGMapping",
    "MCPEventDAGNode",
    "MetricKind",
    "MetricPoint",
    "MetricUnit",
    "MetricsSink",
    "OBSERVABILITY_SCHEMA_VERSION",
    "ObservabilityContractError",
    "ObservabilityEventBus",
    "ObservabilityEventType",
    "StructuredEvent",
    "TraceContext",
    "TraceSink",
    "TraceSpan",
    "TraceSpanKind",
    "TraceStatus",
    "VIRTUAL_OS_OBSERVABILITY_COMPONENT",
    "canonical_observability_json",
    "daemon_resource",
    "dashboard_safe",
    "dashboard_snapshot",
    "event_stream_resource",
    "event_to_mcp_dag_node",
    "heartbeat_event",
    "mcp_event_dag_mapping",
    "metric_event",
    "rollup_health",
    "stable_observability_cid",
    "stable_observability_id",
    "structured_event",
    "trace_context_from_event",
]
