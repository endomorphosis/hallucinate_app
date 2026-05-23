"""Core contracts for the Hallucinate Virtual AI OS.

This module is intentionally stdlib-only. Component adapters from
``ipfs_kit_py``, ``ipfs_datasets_py``, ``ipfs_accelerate_py``, SwissKnife,
and MCP++ should depend on these shapes instead of importing each other.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Awaitable, Protocol, TypeAlias, TypeVar, runtime_checkable


T = TypeVar("T")
MaybeAwaitable: TypeAlias = T | Awaitable[T]
Metadata: TypeAlias = Mapping[str, Any]
Labels: TypeAlias = Mapping[str, str]


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp for contract records."""
    return datetime.now(timezone.utc)


class ContractError(Exception):
    """Base error raised by Virtual AI OS contract adapters."""


class CapabilityDenied(ContractError):
    """Raised when an identity lacks a required capability grant."""


class ProcessState(str, Enum):
    """Lifecycle states shared by process and task scheduler adapters."""

    PENDING = "pending"
    STARTING = "starting"
    RUNNING = "running"
    WAITING = "waiting"
    STOPPING = "stopping"
    STOPPED = "stopped"
    FAILED = "failed"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"


class RestartPolicy(str, Enum):
    """Restart behavior requested for an OS-managed process."""

    NEVER = "never"
    ON_FAILURE = "on_failure"
    ALWAYS = "always"


class HealthState(str, Enum):
    """Health state used by daemon, service, and component checks."""

    UNKNOWN = "unknown"
    STARTING = "starting"
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    STOPPED = "stopped"


class CapabilityAction(str, Enum):
    """Canonical capability verbs used across submodule adapters."""

    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"
    LIST = "list"
    DELETE = "delete"
    ADMIN = "admin"
    DELEGATE = "delegate"
    EMIT = "emit"
    SUBSCRIBE = "subscribe"


class ResourceKind(str, Enum):
    """Top-level resource classes guarded or accounted by the kernel."""

    ANY = "any"
    STORAGE = "storage"
    DATASET = "dataset"
    MODEL = "model"
    SERVICE = "service"
    PROCESS = "process"
    EVENT_STREAM = "event_stream"
    DESCRIPTOR = "descriptor"
    DAEMON = "daemon"
    NETWORK = "network"
    SECRET = "secret"
    HARDWARE = "hardware"


class ResourceUnit(str, Enum):
    """Units for scheduler and adapter resource claims."""

    COUNT = "count"
    BYTES = "bytes"
    MILLICORES = "millicores"
    SECONDS = "seconds"
    TOKENS = "tokens"
    REQUESTS = "requests"
    PERCENT = "percent"


class StorageOperation(str, Enum):
    """Storage verbs common to IPFS, virtual filesystems, and caches."""

    ADD = "add"
    READ = "read"
    STAT = "stat"
    LIST = "list"
    DELETE = "delete"
    PIN = "pin"
    UNPIN = "unpin"


class EventSeverity(str, Enum):
    """Severity values for event and audit envelopes."""

    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass(frozen=True)
class IdentityRef:
    """Stable identity reference for users, agents, services, and daemons."""

    did: str
    display_name: str | None = None
    roles: tuple[str, ...] = ()
    public_key_refs: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    @property
    def principal_id(self) -> str:
        return self.did


@dataclass(frozen=True)
class ResourceRef:
    """A resource address independent of the component that serves it."""

    uri: str
    kind: ResourceKind | str = ResourceKind.ANY
    component: str | None = None
    name: str | None = None
    labels: Labels = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)

    def is_wildcard(self) -> bool:
        return self.uri in {"*", "virtual-os://*"}


@dataclass(frozen=True)
class ResourceClaim:
    """Scheduler claim for finite local or remote resources."""

    resource: ResourceRef
    amount: float = 1
    unit: ResourceUnit | str = ResourceUnit.COUNT
    hard_limit: bool = True
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ResourceUsage:
    """Observed resource use reported by adapters and process monitors."""

    resource: ResourceRef
    amount: float
    unit: ResourceUnit | str = ResourceUnit.COUNT
    measured_at: datetime = field(default_factory=utc_now)
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class CapabilitySpec:
    """A capability a component can provide or require."""

    capability_id: str
    action: CapabilityAction | str
    resource_kind: ResourceKind | str = ResourceKind.ANY
    description: str = ""
    constraints_schema: Metadata = field(default_factory=dict)
    destructive: bool = False
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class CapabilityGrant:
    """A scoped authorization grant, optionally backed by UCAN or a local token."""

    grant_id: str
    action: CapabilityAction | str
    resource: ResourceRef
    issuer: IdentityRef
    audience: IdentityRef
    token_ref: str | None = None
    expires_at: datetime | None = None
    constraints: Metadata = field(default_factory=dict)
    delegated_from: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    def is_expired(self, at: datetime | None = None) -> bool:
        if self.expires_at is None:
            return False
        return self.expires_at <= (at or utc_now())

    def matches(self, action: CapabilityAction | str, resource: ResourceRef) -> bool:
        action_value = action.value if isinstance(action, CapabilityAction) else action
        grant_action = self.action.value if isinstance(self.action, CapabilityAction) else self.action
        if grant_action not in {action_value, CapabilityAction.ADMIN.value, "*"}:
            return False
        return self.resource.is_wildcard() or self.resource.uri == resource.uri


@dataclass(frozen=True)
class ServiceEndpoint:
    """Transport endpoint advertised by a service adapter."""

    protocol: str
    address: str
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ServiceDescriptor:
    """Static service declaration consumed by the registry and UI shell."""

    service_id: str
    component: str
    title: str
    version: str | None = None
    endpoints: tuple[ServiceEndpoint, ...] = ()
    capabilities: tuple[CapabilitySpec, ...] = ()
    resources: tuple[ResourceClaim, ...] = ()
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ServiceStatus:
    """Runtime service state shared by daemon and dashboard adapters."""

    service_id: str
    state: HealthState = HealthState.UNKNOWN
    message: str = ""
    checked_at: datetime = field(default_factory=utc_now)
    endpoints: tuple[ServiceEndpoint, ...] = ()
    details: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ProcessSpec:
    """Request to start or register a process managed by the Virtual AI OS."""

    process_id: str
    component: str
    entrypoint: str
    identity: IdentityRef
    args: Metadata = field(default_factory=dict)
    env: Mapping[str, str] = field(default_factory=dict)
    capabilities: tuple[CapabilityGrant, ...] = ()
    resources: tuple[ResourceClaim, ...] = ()
    restart_policy: RestartPolicy | str = RestartPolicy.NEVER
    labels: Labels = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ProcessStatus:
    """Observed process lifecycle state."""

    process_id: str
    state: ProcessState
    health: HealthState = HealthState.UNKNOWN
    pid: int | None = None
    started_at: datetime | None = None
    stopped_at: datetime | None = None
    exit_code: int | None = None
    message: str = ""
    resources: tuple[ResourceUsage, ...] = ()
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class StorageRef:
    """Content or path reference in storage-backed components."""

    uri: str
    cid: str | None = None
    path: str | None = None
    size_bytes: int | None = None
    media_type: str | None = None
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class StorageRequest:
    """Capability-scoped storage operation request."""

    operation: StorageOperation | str
    ref: StorageRef
    actor: IdentityRef
    capabilities: tuple[CapabilityGrant, ...] = ()
    payload: bytes | None = None
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class StorageResult:
    """Storage operation result with normalized addressing metadata."""

    ref: StorageRef
    ok: bool = True
    data: bytes | None = None
    entries: tuple[StorageRef, ...] = ()
    message: str = ""
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class EventEnvelope:
    """Structured event envelope for audit, telemetry, and MCP++ event DAGs."""

    event_id: str
    event_type: str
    source: str
    occurred_at: datetime = field(default_factory=utc_now)
    severity: EventSeverity | str = EventSeverity.INFO
    actor: IdentityRef | None = None
    subject: ResourceRef | None = None
    trace_id: str | None = None
    correlation_id: str | None = None
    parent_event_ids: tuple[str, ...] = ()
    payload: Metadata = field(default_factory=dict)
    redacted_fields: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)


EventHandler: TypeAlias = Callable[[EventEnvelope], MaybeAwaitable[None]]


@runtime_checkable
class ComponentAdapter(Protocol):
    """Minimum adapter surface every Virtual AI OS component exposes."""

    def component_id(self) -> str:
        """Return the stable component identifier, such as ``ipfs_kit_py``."""

    def capabilities(self) -> Sequence[CapabilitySpec]:
        """Return component-level capabilities without starting heavy services."""

    def services(self) -> Sequence[ServiceDescriptor]:
        """Return service descriptors owned by this component."""

    def health(self) -> MaybeAwaitable[ServiceStatus]:
        """Return the component's aggregate health."""


@runtime_checkable
class ProcessAdapter(Protocol):
    """Process lifecycle contract for daemon and scheduler integrations."""

    def spawn(self, spec: ProcessSpec) -> MaybeAwaitable[ProcessStatus]:
        """Start or register a process."""

    def stop(self, process_id: str, reason: str | None = None) -> MaybeAwaitable[ProcessStatus]:
        """Stop a process and return its final observed state."""

    def status(self, process_id: str) -> MaybeAwaitable[ProcessStatus]:
        """Return the current state for one process."""

    def list_processes(self, component: str | None = None) -> MaybeAwaitable[Sequence[ProcessStatus]]:
        """List processes, optionally filtered by component id."""


@runtime_checkable
class ServiceAdapter(Protocol):
    """Service contract shared by daemon, MCP, compute, and UI adapters."""

    def describe(self) -> ServiceDescriptor:
        """Return the static service descriptor."""

    def start(self) -> MaybeAwaitable[ServiceStatus]:
        """Start the service if it is not already running."""

    def stop(self, reason: str | None = None) -> MaybeAwaitable[ServiceStatus]:
        """Stop the service."""

    def health(self) -> MaybeAwaitable[ServiceStatus]:
        """Return the current service health."""

    def invoke(
        self,
        operation: str,
        payload: Metadata,
        *,
        identity: IdentityRef,
        capabilities: Sequence[CapabilityGrant] = (),
    ) -> MaybeAwaitable[Metadata]:
        """Invoke a service operation through a capability-scoped boundary."""


@runtime_checkable
class CapabilityAuthority(Protocol):
    """Authority contract for UCAN-backed or local capability engines."""

    def issue(
        self,
        spec: CapabilitySpec,
        resource: ResourceRef,
        audience: IdentityRef,
        *,
        issuer: IdentityRef,
        constraints: Metadata | None = None,
        expires_at: datetime | None = None,
    ) -> MaybeAwaitable[CapabilityGrant]:
        """Issue a scoped grant."""

    def verify(
        self,
        grant: CapabilityGrant,
        action: CapabilityAction | str,
        resource: ResourceRef,
    ) -> MaybeAwaitable[bool]:
        """Return whether a grant authorizes an action on a resource."""

    def revoke(self, grant_id: str, *, issuer: IdentityRef, reason: str = "") -> MaybeAwaitable[EventEnvelope]:
        """Revoke a grant and emit an audit event."""


@runtime_checkable
class StorageAdapter(Protocol):
    """Storage boundary implemented by VFS, IPFS, cache, and dataset adapters."""

    def put(self, request: StorageRequest) -> MaybeAwaitable[StorageResult]:
        """Write bytes or register content addressed by ``request.ref``."""

    def get(self, request: StorageRequest) -> MaybeAwaitable[StorageResult]:
        """Read bytes addressed by ``request.ref``."""

    def stat(self, request: StorageRequest) -> MaybeAwaitable[StorageResult]:
        """Return metadata for ``request.ref`` without requiring payload bytes."""

    def list_refs(self, request: StorageRequest) -> MaybeAwaitable[StorageResult]:
        """List children or related refs under ``request.ref``."""

    def delete(self, request: StorageRequest) -> MaybeAwaitable[StorageResult]:
        """Delete or unpin content when authorized."""


@runtime_checkable
class EventBus(Protocol):
    """Event publication and replay contract for observability and audit."""

    def publish(self, event: EventEnvelope) -> MaybeAwaitable[None]:
        """Publish one event envelope."""

    def subscribe(
        self,
        handler: EventHandler,
        *,
        event_types: Sequence[str] = (),
        source: str | None = None,
    ) -> MaybeAwaitable[str]:
        """Subscribe a handler and return a subscription id."""

    def replay(
        self,
        *,
        event_types: Sequence[str] = (),
        after: datetime | None = None,
        limit: int | None = None,
    ) -> MaybeAwaitable[Sequence[EventEnvelope]]:
        """Replay stored events for dashboards, tests, or recovery."""


@runtime_checkable
class IdentityProvider(Protocol):
    """Identity lookup and current-principal contract."""

    def current(self) -> MaybeAwaitable[IdentityRef]:
        """Return the identity used by the current adapter context."""

    def resolve(self, principal_id: str) -> MaybeAwaitable[IdentityRef | None]:
        """Resolve a DID, service id, or local principal id."""


@runtime_checkable
class ResourceManager(Protocol):
    """Resource accounting contract for schedulers and heavy services."""

    def reserve(self, process_id: str, claims: Sequence[ResourceClaim]) -> MaybeAwaitable[Sequence[ResourceUsage]]:
        """Reserve resources for a process or task."""

    def release(self, process_id: str, resources: Sequence[ResourceRef] = ()) -> MaybeAwaitable[None]:
        """Release resources held by a process or task."""

    def usage(self, process_id: str | None = None) -> MaybeAwaitable[Sequence[ResourceUsage]]:
        """Return current resource usage for one process or the whole OS."""


__all__ = [
    "CapabilityAction",
    "CapabilityAuthority",
    "CapabilityDenied",
    "CapabilityGrant",
    "CapabilitySpec",
    "ComponentAdapter",
    "ContractError",
    "EventBus",
    "EventEnvelope",
    "EventHandler",
    "EventSeverity",
    "HealthState",
    "IdentityProvider",
    "IdentityRef",
    "Labels",
    "MaybeAwaitable",
    "Metadata",
    "ProcessAdapter",
    "ProcessSpec",
    "ProcessState",
    "ProcessStatus",
    "ResourceClaim",
    "ResourceKind",
    "ResourceManager",
    "ResourceRef",
    "ResourceUnit",
    "ResourceUsage",
    "RestartPolicy",
    "ServiceAdapter",
    "ServiceDescriptor",
    "ServiceEndpoint",
    "ServiceStatus",
    "StorageAdapter",
    "StorageOperation",
    "StorageRef",
    "StorageRequest",
    "StorageResult",
    "utc_now",
]
