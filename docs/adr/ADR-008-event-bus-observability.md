# ADR-008: Event Bus and Observability Model

- Status: accepted
- Date: 2026-05-22
- Task: OS-019

## Context

ADR-001 defined the kernel `EventEnvelope` and `EventBus` primitives. ADR-002
required MCP++ event DAG ordering. ADR-006 added scheduler events with parent
event ids, and ADR-007 added redacted security audit events.

The repository now needs one observability vocabulary for:

- Structured event publication and replay across daemons, adapters, audit paths,
  schedulers, and MCP++ services.
- Metrics that can be exported to Prometheus/Grafana or rendered directly in
  the local dashboard.
- Trace ids, span ids, correlation ids, and parent event ids that survive
  daemon, MCP, MCP++, and browser boundaries.
- Daemon heartbeat events with stale detection and health rollup inputs.
- MCP++ event DAG mapping from OS events to node and edge projections.
- Dashboard-safe snapshots that avoid backend-specific objects and binary
  payloads.

The existing top-level `hallucinate_app.observability` module can remain an
implementation/export layer. Virtual AI OS adapters need a small stdlib-only
contract they can import without starting Prometheus, Grafana, daemons, browser
code, or optional submodules.

## Decision

Define `python/hallucinate_app/virtual_os/events.py` as the repository-owned
event bus and observability model. The module composes ADR-001 payloads instead
of replacing them. `EventEnvelope` remains the canonical wire envelope; the new
model adds typed projections for observability consumers.

The contract defines:

- Structured events: `StructuredEvent`, `EventSchema`, `EventCategory`,
  `ObservabilityEventType`, publication requests, subscription filters, replay
  queries, and publish receipts.
- Metrics: `MetricPoint`, `MetricKind`, `MetricUnit`, `metric_event`, and
  `MetricsSink`.
- Tracing: `TraceContext`, `TraceSpan`, span kind/status enums, trace metadata
  helpers, and `TraceSink`.
- Daemon heartbeat: `DaemonHeartbeat`, `heartbeat_event`,
  `DaemonHeartbeatSink`, canonical daemon resources, stale detection, and health
  rollup helpers.
- MCP++ event DAG mapping: `MCPEventDAGNode`, `MCPEventDAGEdge`,
  `MCPEventDAGMapping`, deterministic event digest helpers, and conversion from
  `EventEnvelope.parent_event_ids` into DAG edges.
- Dashboard consumption: `DashboardComponentHealth`, `DashboardQuery`,
  `DashboardSnapshot`, `dashboard_snapshot`, and `dashboard_safe` serialization.
- Adapter contracts: `ObservabilityEventBus` for publishing, subscribing,
  replaying, recording metrics, emitting heartbeats, returning DAG projections,
  and serving dashboard snapshots.

All payloads are immutable dataclasses or enums and remain pure Python standard
library code. Protocol methods return `MaybeAwaitable[T]` so synchronous tests,
local daemon managers, async MCP services, and future remote collectors can
implement the same surface.

## Event Model

Events are emitted as `EventEnvelope` values with these observability rules:

1. `event_id`, `event_type`, `source`, `occurred_at`, and `severity` identify the
   event.
2. `trace_id` and `correlation_id` bind events, metrics, spans, and heartbeats
   for request-level debugging.
3. `parent_event_ids` preserve causal ordering and are the source of MCP++ DAG
   edges.
4. `metadata.category` and `metadata.schema_version` classify the event for
   routing and dashboard display.
5. `payload` is structured metadata. Binary values are redacted by
   dashboard-safe serialization.

Metrics are first-class samples, not log strings. A metric has a stable name,
kind, unit, component, value, labels, timestamp, optional exemplar event id, and
trace/correlation ids. Exporters can convert the same `MetricPoint` into
Prometheus samples, log records, dashboard rows, or metric events.

Tracing is intentionally minimal: `TraceContext` carries W3C-compatible
traceparent fields, plus local baggage. It is enough for adapters to propagate
ids through MCP JSON-RPC, MCP++ envelopes, local daemon IPC, and browser
dashboard messages without choosing one tracing backend.

## Heartbeat and Health

Daemon supervisors and service adapters emit `DaemonHeartbeat` samples. A
heartbeat records daemon id, component, health state, sequence, endpoint, pid,
uptime, dependencies, metrics, stale threshold, and recent error text. Stale
heartbeats are treated as unhealthy in rollups.

Dashboards should consume the latest heartbeat per daemon plus
`DashboardComponentHealth` rows. The rollup helper reports:

- `unhealthy` when any daemon or component is unhealthy.
- `degraded` when any daemon or component is degraded, starting, or unknown.
- `stopped` when every known daemon or component is stopped.
- `healthy` only when all known rows are healthy.

## MCP++ DAG Mapping

MCP++ event DAG projection is derived from the kernel event envelope:

- Every event becomes an `MCPEventDAGNode`.
- Every `parent_event_ids` entry becomes an `MCPEventDAGEdge`.
- Missing parent ids are reported as orphan parent ids so replay consumers can
  request older events or remote DAG nodes.
- `event_cid`, `payload_cid`, `proof_cid`, `receipt_cid`, and `peer_id` are read
  from event metadata or payload when adapters already have MCP++ artifacts.
- When an event CID is absent, the contract creates a deterministic
  `sha256:{digest}` placeholder from canonical dashboard-safe JSON. Adapters
  with real IPLD/CID implementations may replace it.

The DAG projection is descriptive. It does not enforce persistence, consensus,
signature verification, or remote peer synchronization.

## Dashboard Consumption

`DashboardSnapshot` is the only shape dashboard code should need for a health
view. It contains generated time, aggregate health, component health rows,
daemon heartbeats, metric samples, recent events, trace spans, MCP++ DAG
projection, notices, and metadata.

`dashboard_safe` converts dataclasses, enums, datetimes, resources, identities,
events, mappings, and sequences into JSON-friendly values. Bytes are represented
by size and redaction flags so dashboard payloads do not accidentally carry raw
content or binary model data.

## Boundaries

This ADR does not define a durable broker, Prometheus registry, Grafana
dashboard, OpenTelemetry exporter, daemon launcher, browser component, MCP++
transport, UCAN verifier, or IPLD/CID implementation.

Adapters must bridge this contract to existing implementation layers:

- `hallucinate_app.observability` can export metrics/logs/spans using the new
  payloads.
- Daemon manager code can emit `DaemonHeartbeat` and health events.
- Scheduler and security modules can publish their existing `EventEnvelope`
  values through `ObservabilityEventBus`.
- MCP++ adapters can enrich DAG nodes with real CIDs, proofs, receipts, and
  peer ids.
- Dashboard code can consume `DashboardSnapshot.dashboard_dict()` without
  importing Python-only objects.

## Consequences

OS-020 can test event emission, metric shape, health rollup, degraded component
state, heartbeat staleness, MCP++ DAG projection, and dashboard-safe
serialization against one importable module without starting live daemons,
MCP++ transports, Prometheus, Grafana, or browser runtimes.

Future adapters can adopt the model incrementally because the kernel
`EventEnvelope` remains the stable base envelope and the observability-specific
classes are additive projections.
