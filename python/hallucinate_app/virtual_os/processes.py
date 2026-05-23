"""Agent process and scheduler contracts for the Hallucinate Virtual AI OS.

The contract is intentionally stdlib-only. Adapters for SwissKnife agent
shells, MCP++ task queues, daemon supervisors, and ``ipfs_accelerate_py``
workflow queues should normalize native objects into these payloads at the
component boundary.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Protocol, TypeAlias, runtime_checkable

from .contracts import (
    CapabilityGrant,
    EventEnvelope,
    EventSeverity,
    HealthState,
    IdentityRef,
    Labels,
    MaybeAwaitable,
    Metadata,
    ProcessSpec,
    ProcessState,
    ProcessStatus,
    ResourceClaim,
    ResourceKind,
    ResourceRef,
    ResourceUsage,
    RestartPolicy,
    utc_now,
)


SchedulerPayload: TypeAlias = Metadata | Sequence[Metadata] | str | bytes | None
MCP_PLUS_PLUS_COMPONENT = "mcp_plus_plus"
VIRTUAL_OS_SCHEDULER_COMPONENT = "virtual_os.scheduler"


class SchedulerOperation(str, Enum):
    """Capability-scoped operations exposed by process schedulers."""

    CREATE_PROCESS = "create_process"
    START_PROCESS = "start_process"
    STOP_PROCESS = "stop_process"
    RESTART_PROCESS = "restart_process"
    SUBMIT_TASK = "submit_task"
    CLAIM_TASK = "claim_task"
    COMPLETE_TASK = "complete_task"
    FAIL_TASK = "fail_task"
    CANCEL_TASK = "cancel_task"
    SUBMIT_WORKFLOW = "submit_workflow"
    DISPATCH_WORKFLOW = "dispatch_workflow"
    CANCEL_WORKFLOW = "cancel_workflow"
    DELEGATE_TASK = "delegate_task"
    EMIT_EVENT = "emit_event"
    RESERVE_RESOURCES = "reserve_resources"
    RELEASE_RESOURCES = "release_resources"


class AgentProcessKind(str, Enum):
    """Classes of OS-managed process records used by the agent scheduler."""

    AGENT = "agent"
    WORKER = "worker"
    SERVICE = "service"
    DAEMON = "daemon"
    TOOL = "tool"
    WORKFLOW = "workflow"
    SUBPROCESS = "subprocess"
    CUSTOM = "custom"


class AgentTaskKind(str, Enum):
    """Portable task kinds scheduled by agents and service workflows."""

    MCP_INVOCATION = "mcp_invocation"
    MCP_PLUS_PLUS_INVOCATION = "mcp_plus_plus_invocation"
    MODEL_LOAD = "model_load"
    MODEL_INFERENCE = "model_inference"
    MODEL_EMBEDDING = "model_embedding"
    KNOWLEDGE_QUERY = "knowledge_query"
    DATASET_LOAD = "dataset_load"
    STORAGE_IO = "storage_io"
    TOOL_CALL = "tool_call"
    WORKFLOW_STEP = "workflow_step"
    HUMAN_GATE = "human_gate"
    CUSTOM = "custom"


class AgentTaskState(str, Enum):
    """Task lifecycle states normalized across local and MCP++ queues."""

    UNKNOWN = "unknown"
    PENDING = "pending"
    BLOCKED = "blocked"
    READY = "ready"
    QUEUED = "queued"
    CLAIMED = "claimed"
    RUNNING = "running"
    RETRY_WAITING = "retry_waiting"
    COMPLETING = "completing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCEL_REQUESTED = "cancel_requested"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"
    SKIPPED = "skipped"


class AgentTaskQueueStatus(str, Enum):
    """Queue service states for local, daemon, and peer task queues."""

    UNKNOWN = "unknown"
    ACTIVE = "active"
    PAUSED = "paused"
    DRAINING = "draining"
    DEGRADED = "degraded"
    STOPPED = "stopped"


class SchedulerQueueDiscipline(str, Enum):
    """Scheduling discipline used by an agent task queue."""

    FIFO = "fifo"
    PRIORITY = "priority"
    FAIR = "fair"
    WEIGHTED = "weighted"
    RESOURCE_AWARE = "resource_aware"
    RISK_ADJUSTED_PRIORITY = "risk_adjusted_priority"


class WorkflowState(str, Enum):
    """Workflow DAG lifecycle states."""

    UNKNOWN = "unknown"
    PENDING = "pending"
    READY = "ready"
    RUNNING = "running"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCEL_REQUESTED = "cancel_requested"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"


class DependencyCondition(str, Enum):
    """Condition that satisfies a task or workflow edge dependency."""

    COMPLETED = "completed"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EVENT_RECORDED = "event_recorded"
    RESOURCE_AVAILABLE = "resource_available"
    CAPABILITY_GRANTED = "capability_granted"
    ALWAYS = "always"


class TaskDelegationProtocol(str, Enum):
    """Transport or queue protocol used to delegate task execution."""

    LOCAL = "local"
    MCP_JSON_RPC = "mcp_json_rpc"
    MCP_PLUS_PLUS = "mcp_plus_plus"
    MCP_P2P = "mcp_p2p"
    COMPUTE_QUEUE = "compute_queue"
    CUSTOM = "custom"


class SchedulerEventType(str, Enum):
    """Event types emitted by process, task, and workflow schedulers."""

    PROCESS_CREATED = "virtual_os.scheduler.process.created"
    PROCESS_STARTED = "virtual_os.scheduler.process.started"
    PROCESS_STOPPED = "virtual_os.scheduler.process.stopped"
    PROCESS_FAILED = "virtual_os.scheduler.process.failed"
    PROCESS_RESTARTED = "virtual_os.scheduler.process.restarted"
    TASK_ENQUEUED = "virtual_os.scheduler.task.enqueued"
    TASK_STARTED = "virtual_os.scheduler.task.started"
    TASK_COMPLETED = "virtual_os.scheduler.task.completed"
    TASK_FAILED = "virtual_os.scheduler.task.failed"
    TASK_CANCELLED = "virtual_os.scheduler.task.cancelled"
    TASK_DELEGATED = "virtual_os.scheduler.task.delegated"
    WORKFLOW_SUBMITTED = "virtual_os.scheduler.workflow.submitted"
    WORKFLOW_STARTED = "virtual_os.scheduler.workflow.started"
    WORKFLOW_COMPLETED = "virtual_os.scheduler.workflow.completed"
    WORKFLOW_FAILED = "virtual_os.scheduler.workflow.failed"
    WORKFLOW_CANCELLED = "virtual_os.scheduler.workflow.cancelled"
    RESOURCES_RESERVED = "virtual_os.scheduler.resources.reserved"
    RESOURCES_RELEASED = "virtual_os.scheduler.resources.released"
    MCP_PLUS_PLUS_RESCHEDULED = "mcp_plus_plus.scheduler.rescheduled"


class ResourceReservationState(str, Enum):
    """State of resources reserved for a process, task, or workflow."""

    REQUESTED = "requested"
    RESERVED = "reserved"
    ALLOCATED = "allocated"
    RELEASED = "released"
    DENIED = "denied"
    EXPIRED = "expired"


class RestartBackoff(str, Enum):
    """Backoff strategies for restart policy evaluation."""

    NONE = "none"
    FIXED = "fixed"
    EXPONENTIAL = "exponential"


class CancellationMode(str, Enum):
    """Cancellation behavior requested for running work."""

    BEST_EFFORT = "best_effort"
    COOPERATIVE = "cooperative"
    FORCE = "force"


TERMINAL_PROCESS_STATES: tuple[ProcessState, ...] = (
    ProcessState.STOPPED,
    ProcessState.FAILED,
    ProcessState.CANCELLED,
)

TERMINAL_TASK_STATES: tuple[AgentTaskState, ...] = (
    AgentTaskState.COMPLETED,
    AgentTaskState.FAILED,
    AgentTaskState.CANCELLED,
    AgentTaskState.TIMED_OUT,
    AgentTaskState.SKIPPED,
)

TERMINAL_WORKFLOW_STATES: tuple[WorkflowState, ...] = (
    WorkflowState.COMPLETED,
    WorkflowState.FAILED,
    WorkflowState.CANCELLED,
    WorkflowState.TIMED_OUT,
)

PROCESS_TRANSITIONS: dict[ProcessState, tuple[ProcessState, ...]] = {
    ProcessState.PENDING: (ProcessState.STARTING, ProcessState.CANCELLED, ProcessState.FAILED),
    ProcessState.STARTING: (ProcessState.RUNNING, ProcessState.WAITING, ProcessState.STOPPING, ProcessState.FAILED),
    ProcessState.RUNNING: (ProcessState.WAITING, ProcessState.STOPPING, ProcessState.STOPPED, ProcessState.FAILED),
    ProcessState.WAITING: (ProcessState.RUNNING, ProcessState.STOPPING, ProcessState.STOPPED, ProcessState.FAILED),
    ProcessState.STOPPING: (ProcessState.STOPPED, ProcessState.FAILED, ProcessState.CANCELLED),
    ProcessState.STOPPED: (ProcessState.STARTING,),
    ProcessState.FAILED: (ProcessState.STARTING, ProcessState.STOPPED),
    ProcessState.CANCELLED: (),
    ProcessState.UNKNOWN: (
        ProcessState.PENDING,
        ProcessState.STARTING,
        ProcessState.RUNNING,
        ProcessState.WAITING,
        ProcessState.STOPPING,
        ProcessState.STOPPED,
        ProcessState.FAILED,
        ProcessState.CANCELLED,
    ),
}

TASK_TRANSITIONS: dict[AgentTaskState, tuple[AgentTaskState, ...]] = {
    AgentTaskState.UNKNOWN: (
        AgentTaskState.PENDING,
        AgentTaskState.BLOCKED,
        AgentTaskState.READY,
        AgentTaskState.QUEUED,
    ),
    AgentTaskState.PENDING: (AgentTaskState.BLOCKED, AgentTaskState.READY, AgentTaskState.QUEUED, AgentTaskState.CANCELLED),
    AgentTaskState.BLOCKED: (AgentTaskState.READY, AgentTaskState.QUEUED, AgentTaskState.CANCELLED, AgentTaskState.FAILED),
    AgentTaskState.READY: (AgentTaskState.QUEUED, AgentTaskState.CLAIMED, AgentTaskState.RUNNING, AgentTaskState.CANCELLED),
    AgentTaskState.QUEUED: (AgentTaskState.CLAIMED, AgentTaskState.RUNNING, AgentTaskState.CANCEL_REQUESTED, AgentTaskState.CANCELLED),
    AgentTaskState.CLAIMED: (AgentTaskState.RUNNING, AgentTaskState.RETRY_WAITING, AgentTaskState.CANCEL_REQUESTED, AgentTaskState.FAILED),
    AgentTaskState.RUNNING: (
        AgentTaskState.COMPLETING,
        AgentTaskState.COMPLETED,
        AgentTaskState.RETRY_WAITING,
        AgentTaskState.CANCEL_REQUESTED,
        AgentTaskState.FAILED,
        AgentTaskState.TIMED_OUT,
    ),
    AgentTaskState.RETRY_WAITING: (AgentTaskState.READY, AgentTaskState.QUEUED, AgentTaskState.CANCELLED, AgentTaskState.FAILED),
    AgentTaskState.COMPLETING: (AgentTaskState.COMPLETED, AgentTaskState.FAILED),
    AgentTaskState.CANCEL_REQUESTED: (AgentTaskState.CANCELLED, AgentTaskState.FAILED),
    AgentTaskState.COMPLETED: (),
    AgentTaskState.FAILED: (AgentTaskState.RETRY_WAITING,),
    AgentTaskState.CANCELLED: (),
    AgentTaskState.TIMED_OUT: (AgentTaskState.RETRY_WAITING,),
    AgentTaskState.SKIPPED: (),
}


def _enum_value(value: Enum | str) -> str:
    return value.value if isinstance(value, Enum) else str(value)


def _clean_id(value: str, field_name: str) -> str:
    cleaned = str(value).strip()
    if not cleaned:
        raise ValueError(f"{field_name} cannot be empty")
    return cleaned


def scheduler_id(prefix: str, *parts: str) -> str:
    """Return a compact stable id for scheduler records."""
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:24]
    return f"{prefix}:{digest}"


def process_uri(process_id: str) -> str:
    """Return the canonical resource URI for an OS process."""
    return f"virtual-os://processes/{_clean_id(process_id, 'process_id')}"


def task_uri(task_id: str, *, queue_id: str | None = None) -> str:
    """Return the canonical resource URI for a scheduled task."""
    task = _clean_id(task_id, "task_id")
    if queue_id:
        return f"virtual-os://queues/{_clean_id(queue_id, 'queue_id')}/tasks/{task}"
    return f"virtual-os://tasks/{task}"


def queue_uri(queue_id: str) -> str:
    """Return the canonical resource URI for a task queue."""
    return f"virtual-os://queues/{_clean_id(queue_id, 'queue_id')}"


def workflow_uri(workflow_id: str) -> str:
    """Return the canonical resource URI for a workflow DAG."""
    return f"virtual-os://workflows/{_clean_id(workflow_id, 'workflow_id')}"


def process_resource(process_id: str, *, component: str | None = None) -> ResourceRef:
    """Return an OS process as a capability and accounting resource."""
    return ResourceRef(
        uri=process_uri(process_id),
        kind=ResourceKind.PROCESS,
        component=component or VIRTUAL_OS_SCHEDULER_COMPONENT,
        name=process_id,
    )


def task_resource(task_id: str, *, queue_id: str | None = None, component: str | None = None) -> ResourceRef:
    """Return a scheduled task as a capability and accounting resource."""
    return ResourceRef(
        uri=task_uri(task_id, queue_id=queue_id),
        kind=ResourceKind.PROCESS,
        component=component or VIRTUAL_OS_SCHEDULER_COMPONENT,
        name=task_id,
        labels={"queue_id": queue_id} if queue_id else {},
    )


def queue_resource(queue_id: str, *, component: str | None = None) -> ResourceRef:
    """Return a task queue as a capability and accounting resource."""
    return ResourceRef(
        uri=queue_uri(queue_id),
        kind=ResourceKind.PROCESS,
        component=component or VIRTUAL_OS_SCHEDULER_COMPONENT,
        name=queue_id,
    )


def workflow_resource(workflow_id: str, *, component: str | None = None) -> ResourceRef:
    """Return a workflow DAG as a capability and accounting resource."""
    return ResourceRef(
        uri=workflow_uri(workflow_id),
        kind=ResourceKind.PROCESS,
        component=component or VIRTUAL_OS_SCHEDULER_COMPONENT,
        name=workflow_id,
    )


def can_transition_process(current: ProcessState | str, target: ProcessState | str) -> bool:
    """Return whether a process lifecycle transition is allowed."""
    if _enum_value(current) == _enum_value(target):
        return True
    try:
        current_state = ProcessState(_enum_value(current))
        target_state = ProcessState(_enum_value(target))
    except ValueError:
        return False
    return target_state in PROCESS_TRANSITIONS[current_state]


def can_transition_task(current: AgentTaskState | str, target: AgentTaskState | str) -> bool:
    """Return whether a task lifecycle transition is allowed."""
    if _enum_value(current) == _enum_value(target):
        return True
    try:
        current_state = AgentTaskState(_enum_value(current))
        target_state = AgentTaskState(_enum_value(target))
    except ValueError:
        return False
    return target_state in TASK_TRANSITIONS[current_state]


@dataclass(frozen=True)
class RestartPolicySpec:
    """Restart behavior for an OS-managed process."""

    policy: RestartPolicy | str = RestartPolicy.NEVER
    max_attempts: int | None = 3
    initial_delay_s: float = 0
    max_delay_s: float | None = 60
    backoff: RestartBackoff | str = RestartBackoff.FIXED
    restart_on_exit_codes: tuple[int, ...] = ()
    no_restart_exit_codes: tuple[int, ...] = (0,)
    window_s: float | None = None
    metadata: Metadata = field(default_factory=dict)

    def evaluate(
        self,
        status: ProcessStatus | "AgentProcessStatus",
        *,
        restart_count: int | None = None,
    ) -> "RestartDecision":
        """Return whether ``status`` should be restarted under this policy."""
        state_value = _enum_value(status.state)
        policy_value = _enum_value(self.policy)
        observed_restarts = restart_count
        if observed_restarts is None:
            observed_restarts = getattr(status, "restart_count", 0)
        exit_code = getattr(status, "exit_code", None)

        if policy_value == RestartPolicy.NEVER.value:
            return RestartDecision(False, reason="restart policy is never")
        if state_value == ProcessState.CANCELLED.value:
            return RestartDecision(False, reason="process was cancelled")
        if self.max_attempts is not None and observed_restarts >= self.max_attempts:
            return RestartDecision(False, reason="restart attempt limit reached")
        if exit_code is not None and exit_code in self.no_restart_exit_codes:
            return RestartDecision(False, reason="exit code is excluded from restart")
        if self.restart_on_exit_codes and exit_code not in self.restart_on_exit_codes:
            return RestartDecision(False, reason="exit code is not included in restart set")

        failed = state_value == ProcessState.FAILED.value or (exit_code is not None and exit_code != 0)
        stopped = state_value == ProcessState.STOPPED.value
        if policy_value == RestartPolicy.ON_FAILURE.value and not failed:
            return RestartDecision(False, reason="process did not fail")
        if policy_value == RestartPolicy.ALWAYS.value and not (failed or stopped):
            return RestartDecision(False, reason="process is not in a restartable terminal state")

        return RestartDecision(
            True,
            delay_s=self.delay_for_attempt(observed_restarts),
            reason="restart policy matched",
            policy=self,
        )

    def delay_for_attempt(self, restart_count: int) -> float:
        """Return restart delay for the next attempt."""
        delay = max(0.0, float(self.initial_delay_s))
        if _enum_value(self.backoff) == RestartBackoff.EXPONENTIAL.value:
            delay = delay * (2 ** max(0, restart_count))
        if self.max_delay_s is not None:
            delay = min(delay, float(self.max_delay_s))
        return delay


@dataclass(frozen=True)
class RestartDecision:
    """Decision returned after evaluating a restart policy."""

    should_restart: bool
    delay_s: float = 0
    reason: str = ""
    policy: RestartPolicySpec | None = None
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class AgentProcessSpec:
    """Request to create an agent, worker, daemon, service, or workflow process."""

    process_id: str
    component: str
    entrypoint: str
    identity: IdentityRef
    kind: AgentProcessKind | str = AgentProcessKind.AGENT
    args: Metadata = field(default_factory=dict)
    env: dict[str, str] = field(default_factory=dict)
    capabilities: tuple[CapabilityGrant, ...] = ()
    resource_claims: tuple[ResourceClaim, ...] = ()
    restart_policy: RestartPolicySpec = field(default_factory=RestartPolicySpec)
    parent_process_id: str | None = None
    workflow_id: str | None = None
    queue_id: str | None = None
    service_id: str | None = None
    labels: Labels = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)

    @property
    def capability_grants(self) -> tuple[CapabilityGrant, ...]:
        """Return capability grants carried by this process spec."""
        return self.capabilities

    def resource(self) -> ResourceRef:
        """Return this process as a capability and scheduler resource."""
        return ResourceRef(
            uri=process_uri(self.process_id),
            kind=ResourceKind.PROCESS,
            component=self.component,
            name=self.process_id,
            labels=dict(self.labels),
            metadata={
                "process_kind": _enum_value(self.kind),
                "workflow_id": self.workflow_id,
                "queue_id": self.queue_id,
                "service_id": self.service_id,
                **dict(self.metadata),
            },
        )

    def to_process_spec(self) -> ProcessSpec:
        """Project this agent process spec into the ADR-001 process contract."""
        return ProcessSpec(
            process_id=self.process_id,
            component=self.component,
            entrypoint=self.entrypoint,
            identity=self.identity,
            args=dict(self.args),
            env=dict(self.env),
            capabilities=self.capabilities,
            resources=self.resource_claims,
            restart_policy=self.restart_policy.policy,
            labels=self.labels,
            metadata={
                "process_kind": _enum_value(self.kind),
                "parent_process_id": self.parent_process_id,
                "workflow_id": self.workflow_id,
                "queue_id": self.queue_id,
                "service_id": self.service_id,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class AgentProcessStatus:
    """Observed lifecycle and restart state for an agent process."""

    process_id: str
    state: ProcessState | str
    component: str
    identity: IdentityRef | None = None
    kind: AgentProcessKind | str = AgentProcessKind.AGENT
    health: HealthState | str = HealthState.UNKNOWN
    pid: int | None = None
    worker_id: str | None = None
    workflow_id: str | None = None
    queue_id: str | None = None
    started_at: datetime | None = None
    stopped_at: datetime | None = None
    updated_at: datetime = field(default_factory=utc_now)
    exit_code: int | None = None
    restart_count: int = 0
    restart_policy: RestartPolicySpec = field(default_factory=RestartPolicySpec)
    message: str = ""
    resource_claims: tuple[ResourceClaim, ...] = ()
    resource_usage: tuple[ResourceUsage, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    @property
    def is_terminal(self) -> bool:
        """Return whether the process is in a terminal lifecycle state."""
        return _enum_value(self.state) in {state.value for state in TERMINAL_PROCESS_STATES}

    def restart_decision(self) -> RestartDecision:
        """Evaluate this status against its restart policy."""
        return self.restart_policy.evaluate(self, restart_count=self.restart_count)

    def resource(self) -> ResourceRef:
        """Return this process as a capability and scheduler resource."""
        return process_resource(self.process_id, component=self.component)

    def to_process_status(self) -> ProcessStatus:
        """Project this status into the ADR-001 process status contract."""
        return ProcessStatus(
            process_id=self.process_id,
            state=ProcessState(_enum_value(self.state)),
            health=HealthState(_enum_value(self.health)),
            pid=self.pid,
            started_at=self.started_at,
            stopped_at=self.stopped_at,
            exit_code=self.exit_code,
            message=self.message,
            resources=self.resource_usage,
            metadata={
                "process_kind": _enum_value(self.kind),
                "component": self.component,
                "worker_id": self.worker_id,
                "workflow_id": self.workflow_id,
                "queue_id": self.queue_id,
                "restart_count": self.restart_count,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class TaskDependency:
    """Dependency that must be satisfied before a task can run."""

    dependency_id: str
    task_id: str | None = None
    node_id: str | None = None
    event_id: str | None = None
    resource: ResourceRef | None = None
    capability: CapabilityGrant | None = None
    condition: DependencyCondition | str = DependencyCondition.COMPLETED
    optional: bool = False
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class TaskDelegationTarget:
    """Destination queue or service for delegated task execution."""

    target_id: str
    protocol: TaskDelegationProtocol | str = TaskDelegationProtocol.MCP_PLUS_PLUS
    service_id: str | None = None
    component: str = MCP_PLUS_PLUS_COMPONENT
    queue_id: str | None = None
    interface_cid: str | None = None
    method: str | None = None
    peer_id: str | None = None
    endpoint: str | None = None
    capabilities: tuple[CapabilityGrant, ...] = ()
    resource_claims: tuple[ResourceClaim, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    @property
    def capability_grants(self) -> tuple[CapabilityGrant, ...]:
        """Return capability grants available for this delegation target."""
        return self.capabilities

    def resource(self) -> ResourceRef:
        """Return this delegation target as a service or queue resource."""
        if self.queue_id:
            return queue_resource(self.queue_id, component=self.component)
        service = self.service_id or self.target_id
        return ResourceRef(
            uri=f"virtual-os://services/{service}",
            kind=ResourceKind.SERVICE,
            component=self.component,
            name=service,
            metadata={
                "target_id": self.target_id,
                "protocol": _enum_value(self.protocol),
                "interface_cid": self.interface_cid,
                "method": self.method,
                "peer_id": self.peer_id,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class AgentTaskRequest:
    """Request to submit work to an agent scheduler queue."""

    task_id: str
    kind: AgentTaskKind | str
    actor: IdentityRef
    payload: SchedulerPayload = None
    queue_id: str | None = None
    process_id: str | None = None
    workflow_id: str | None = None
    workflow_node_id: str | None = None
    priority: int = 0
    risk_score: float = 0
    depends_on: tuple[str, ...] = ()
    dependencies: tuple[TaskDependency, ...] = ()
    parent_event_ids: tuple[str, ...] = ()
    capabilities: tuple[CapabilityGrant, ...] = ()
    resource_claims: tuple[ResourceClaim, ...] = ()
    delegation: TaskDelegationTarget | None = None
    idempotency_key: str | None = None
    deadline_at: datetime | None = None
    timeout_s: float | None = None
    max_attempts: int = 1
    trace_id: str | None = None
    labels: Labels = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)

    @property
    def capability_grants(self) -> tuple[CapabilityGrant, ...]:
        """Return capability grants carried by this task request."""
        return self.capabilities

    @property
    def effective_priority(self) -> float:
        """Return priority adjusted by the MCP++ risk scheduler score."""
        return float(self.priority) + float(self.risk_score)

    def resource(self) -> ResourceRef:
        """Return this task as a capability and scheduler resource."""
        return ResourceRef(
            uri=task_uri(self.task_id, queue_id=self.queue_id),
            kind=ResourceKind.PROCESS,
            component=VIRTUAL_OS_SCHEDULER_COMPONENT,
            name=self.task_id,
            labels=dict(self.labels),
            metadata={
                "task_kind": _enum_value(self.kind),
                "queue_id": self.queue_id,
                "workflow_id": self.workflow_id,
                "workflow_node_id": self.workflow_node_id,
                "process_id": self.process_id,
                **dict(self.metadata),
            },
        )

    def initial_status(self, state: AgentTaskState | str = AgentTaskState.PENDING) -> "AgentTaskStatus":
        """Return the initial status record for this task request."""
        return AgentTaskStatus(
            task_id=self.task_id,
            kind=self.kind,
            state=state,
            actor=self.actor,
            queue_id=self.queue_id,
            process_id=self.process_id,
            workflow_id=self.workflow_id,
            workflow_node_id=self.workflow_node_id,
            priority=self.priority,
            risk_score=self.risk_score,
            submitted_at=utc_now(),
            attempts=0,
            max_attempts=self.max_attempts,
            resource_claims=self.resource_claims,
            parent_event_ids=self.parent_event_ids,
            metadata=dict(self.metadata),
        )


@dataclass(frozen=True)
class AgentTaskStatus:
    """Observed state for queued, running, delegated, or completed agent work."""

    task_id: str
    kind: AgentTaskKind | str
    state: AgentTaskState | str = AgentTaskState.UNKNOWN
    actor: IdentityRef | None = None
    queue_id: str | None = None
    process_id: str | None = None
    workflow_id: str | None = None
    workflow_node_id: str | None = None
    worker_id: str | None = None
    priority: int = 0
    risk_score: float = 0
    submitted_at: datetime | None = None
    queued_at: datetime | None = None
    claimed_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    deadline_at: datetime | None = None
    attempts: int = 0
    max_attempts: int = 1
    progress: float | None = None
    cancellation_reason: str = ""
    result_ref: ResourceRef | None = None
    error: str = ""
    message: str = ""
    resource_claims: tuple[ResourceClaim, ...] = ()
    resource_usage: tuple[ResourceUsage, ...] = ()
    parent_event_ids: tuple[str, ...] = ()
    emitted_event_ids: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    @property
    def is_terminal(self) -> bool:
        """Return whether the task is in a terminal state."""
        return _enum_value(self.state) in {state.value for state in TERMINAL_TASK_STATES}

    @property
    def can_retry(self) -> bool:
        """Return whether the task has retry attempts remaining."""
        state_value = _enum_value(self.state)
        return state_value in {AgentTaskState.FAILED.value, AgentTaskState.TIMED_OUT.value} and (
            self.max_attempts < 0 or self.attempts < self.max_attempts
        )

    @property
    def effective_priority(self) -> float:
        """Return priority adjusted by the MCP++ risk scheduler score."""
        return float(self.priority) + float(self.risk_score)

    def resource(self) -> ResourceRef:
        """Return this task as a capability and scheduler resource."""
        return task_resource(self.task_id, queue_id=self.queue_id)


@dataclass(frozen=True)
class AgentTaskQueueSpec:
    """Task queue definition used by local and MCP++ scheduler adapters."""

    queue_id: str
    component: str = VIRTUAL_OS_SCHEDULER_COMPONENT
    owner: IdentityRef | None = None
    discipline: SchedulerQueueDiscipline | str = SchedulerQueueDiscipline.RISK_ADJUSTED_PRIORITY
    accepted_kinds: tuple[AgentTaskKind | str, ...] = ()
    max_depth: int | None = None
    max_concurrency: int | None = None
    delegation_targets: tuple[TaskDelegationTarget, ...] = ()
    capabilities: tuple[CapabilityGrant, ...] = ()
    resource_claims: tuple[ResourceClaim, ...] = ()
    labels: Labels = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)

    @property
    def capability_grants(self) -> tuple[CapabilityGrant, ...]:
        """Return queue-level capability grants."""
        return self.capabilities

    def accepts(self, task: AgentTaskRequest) -> bool:
        """Return whether this queue accepts ``task`` by kind."""
        if not self.accepted_kinds:
            return True
        accepted = {_enum_value(kind) for kind in self.accepted_kinds}
        return _enum_value(task.kind) in accepted

    def resource(self) -> ResourceRef:
        """Return this queue as a capability and accounting resource."""
        return ResourceRef(
            uri=queue_uri(self.queue_id),
            kind=ResourceKind.PROCESS,
            component=self.component,
            name=self.queue_id,
            labels=dict(self.labels),
            metadata={
                "discipline": _enum_value(self.discipline),
                "max_depth": self.max_depth,
                "max_concurrency": self.max_concurrency,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class AgentTaskQueueState:
    """Snapshot of a task queue used by scheduler and dashboard adapters."""

    queue_id: str
    status: AgentTaskQueueStatus | str = AgentTaskQueueStatus.UNKNOWN
    discipline: SchedulerQueueDiscipline | str = SchedulerQueueDiscipline.RISK_ADJUSTED_PRIORITY
    depth: int = 0
    blocked: int = 0
    ready: int = 0
    pending: int = 0
    running: int = 0
    completed: int = 0
    failed: int = 0
    cancelled: int = 0
    workers: int = 0
    max_concurrency: int | None = None
    tasks: tuple[AgentTaskStatus, ...] = ()
    updated_at: datetime = field(default_factory=utc_now)
    metadata: Metadata = field(default_factory=dict)

    @property
    def available_slots(self) -> int | None:
        """Return currently available concurrency slots when bounded."""
        if self.max_concurrency is None:
            return None
        return max(0, self.max_concurrency - self.running)

    def resource(self) -> ResourceRef:
        """Return this queue as a capability and accounting resource."""
        return ResourceRef(
            uri=queue_uri(self.queue_id),
            kind=ResourceKind.PROCESS,
            component=VIRTUAL_OS_SCHEDULER_COMPONENT,
            name=self.queue_id,
            metadata={
                "status": _enum_value(self.status),
                "discipline": _enum_value(self.discipline),
                "depth": self.depth,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class TaskSubmissionResult:
    """Result returned after submitting a task to a queue."""

    task: AgentTaskStatus
    ok: bool = True
    queue_id: str | None = None
    delegation: "TaskDelegationReceipt | None" = None
    events: tuple[EventEnvelope, ...] = ()
    message: str = ""
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class TaskCancellationRequest:
    """Request to cancel queued or running task work."""

    task_id: str
    actor: IdentityRef
    mode: CancellationMode | str = CancellationMode.COOPERATIVE
    queue_id: str | None = None
    workflow_id: str | None = None
    reason: str = ""
    capabilities: tuple[CapabilityGrant, ...] = ()
    release_resources: bool = True
    trace_id: str | None = None
    parent_event_ids: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    @property
    def capability_grants(self) -> tuple[CapabilityGrant, ...]:
        """Return capability grants carried by this cancellation request."""
        return self.capabilities


@dataclass(frozen=True)
class TaskCancellationResult:
    """Result returned after cancelling task work."""

    task_id: str
    ok: bool = True
    state: AgentTaskState | str = AgentTaskState.CANCELLED
    cancelled_at: datetime | None = None
    released_resources: tuple[ResourceRef, ...] = ()
    task_status: AgentTaskStatus | None = None
    events: tuple[EventEnvelope, ...] = ()
    message: str = ""
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class TaskDelegationRequest:
    """Request to delegate one task to MCP++, MCP, p2p, or a compute queue."""

    task: AgentTaskRequest
    target: TaskDelegationTarget
    actor: IdentityRef
    capabilities: tuple[CapabilityGrant, ...] = ()
    parent_event_ids: tuple[str, ...] = ()
    trace_id: str | None = None
    options: Metadata = field(default_factory=dict)

    @property
    def capability_grants(self) -> tuple[CapabilityGrant, ...]:
        """Return all grants available to the delegation call."""
        return (*self.capabilities, *self.task.capabilities, *self.target.capabilities)


@dataclass(frozen=True)
class TaskDelegationReceipt:
    """Receipt returned by a task delegation target."""

    task_id: str
    target: TaskDelegationTarget
    ok: bool = True
    delegated_task_id: str | None = None
    queue_id: str | None = None
    receipt_cid: str | None = None
    event_id: str | None = None
    state: AgentTaskState | str = AgentTaskState.QUEUED
    message: str = ""
    events: tuple[EventEnvelope, ...] = ()
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class WorkflowNode:
    """A node in a workflow DAG."""

    node_id: str
    task: AgentTaskRequest | None = None
    task_id: str | None = None
    kind: AgentTaskKind | str = AgentTaskKind.WORKFLOW_STEP
    queue_id: str | None = None
    process_id: str | None = None
    resource_claims: tuple[ResourceClaim, ...] = ()
    capabilities: tuple[CapabilityGrant, ...] = ()
    parent_event_ids: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    @property
    def effective_task_id(self) -> str:
        """Return the scheduled task id for this node."""
        if self.task is not None:
            return self.task.task_id
        if self.task_id:
            return self.task_id
        return self.node_id

    @property
    def capability_grants(self) -> tuple[CapabilityGrant, ...]:
        """Return capability grants declared by the node and its task."""
        if self.task is None:
            return self.capabilities
        return (*self.capabilities, *self.task.capabilities)

    def resource(self, workflow_id: str | None = None) -> ResourceRef:
        """Return this workflow node as a process-scoped resource."""
        uri = f"{workflow_uri(workflow_id)}#node={self.node_id}" if workflow_id else f"virtual-os://workflow-nodes/{self.node_id}"
        return ResourceRef(
            uri=uri,
            kind=ResourceKind.PROCESS,
            component=VIRTUAL_OS_SCHEDULER_COMPONENT,
            name=self.node_id,
            metadata={
                "task_id": self.effective_task_id,
                "queue_id": self.queue_id or (self.task.queue_id if self.task else None),
                "process_id": self.process_id,
                "task_kind": _enum_value(self.kind),
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class WorkflowEdge:
    """Causal dependency edge between workflow DAG nodes."""

    source_node_id: str
    target_node_id: str
    condition: DependencyCondition | str = DependencyCondition.COMPLETED
    parent_event_id: str | None = None
    optional: bool = False
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class WorkflowDAG:
    """Workflow graph with deterministic dependency ordering helpers."""

    workflow_id: str
    nodes: tuple[WorkflowNode, ...]
    edges: tuple[WorkflowEdge, ...] = ()
    actor: IdentityRef | None = None
    description: str = ""
    capabilities: tuple[CapabilityGrant, ...] = ()
    resource_claims: tuple[ResourceClaim, ...] = ()
    parent_event_ids: tuple[str, ...] = ()
    trace_id: str | None = None
    labels: Labels = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)

    @property
    def capability_grants(self) -> tuple[CapabilityGrant, ...]:
        """Return workflow-level capability grants."""
        return self.capabilities

    def node_map(self) -> dict[str, WorkflowNode]:
        """Return nodes keyed by id and reject duplicate ids."""
        nodes: dict[str, WorkflowNode] = {}
        for node in self.nodes:
            if node.node_id in nodes:
                raise ValueError(f"duplicate workflow node_id: {node.node_id}")
            nodes[node.node_id] = node
        return nodes

    def validate(self) -> None:
        """Validate node references and cycle-free dependency ordering."""
        self.topological_order()

    def dependencies_for(self, node_id: str, *, include_optional: bool = True) -> tuple[WorkflowEdge, ...]:
        """Return incoming dependency edges for ``node_id``."""
        return tuple(
            edge
            for edge in self.edges
            if edge.target_node_id == node_id and (include_optional or not edge.optional)
        )

    def dependents_for(self, node_id: str) -> tuple[WorkflowEdge, ...]:
        """Return outgoing dependency edges for ``node_id``."""
        return tuple(edge for edge in self.edges if edge.source_node_id == node_id)

    def root_node_ids(self) -> tuple[str, ...]:
        """Return node ids with no required incoming dependencies."""
        blocked = {edge.target_node_id for edge in self.edges if not edge.optional}
        return tuple(node.node_id for node in self.nodes if node.node_id not in blocked)

    def leaf_node_ids(self) -> tuple[str, ...]:
        """Return node ids with no outgoing dependencies."""
        parents = {edge.source_node_id for edge in self.edges}
        return tuple(node.node_id for node in self.nodes if node.node_id not in parents)

    def topological_order(self) -> tuple[str, ...]:
        """Return deterministic Kahn topological order for the workflow DAG."""
        node_map = self.node_map()
        incoming: dict[str, set[str]] = {node_id: set() for node_id in node_map}
        outgoing: dict[str, list[str]] = {node_id: [] for node_id in node_map}

        for edge in self.edges:
            if edge.source_node_id not in node_map:
                raise ValueError(f"unknown workflow edge source: {edge.source_node_id}")
            if edge.target_node_id not in node_map:
                raise ValueError(f"unknown workflow edge target: {edge.target_node_id}")
            if edge.optional:
                continue
            incoming[edge.target_node_id].add(edge.source_node_id)
            outgoing[edge.source_node_id].append(edge.target_node_id)

        order: list[str] = []
        ready = [node.node_id for node in self.nodes if not incoming[node.node_id]]
        while ready:
            node_id = ready.pop(0)
            order.append(node_id)
            for dependent_id in outgoing[node_id]:
                incoming[dependent_id].discard(node_id)
                if not incoming[dependent_id] and dependent_id not in order and dependent_id not in ready:
                    ready.append(dependent_id)

        if len(order) != len(node_map):
            unresolved = tuple(node_id for node_id, dependencies in incoming.items() if dependencies)
            raise ValueError(f"workflow DAG contains a cycle or unresolved dependencies: {unresolved}")
        return tuple(order)

    def task_order(self) -> tuple[str, ...]:
        """Return task ids in topological node order."""
        nodes = self.node_map()
        return tuple(nodes[node_id].effective_task_id for node_id in self.topological_order())

    def ready_node_ids(
        self,
        *,
        completed_node_ids: Sequence[str] = (),
        running_node_ids: Sequence[str] = (),
        failed_node_ids: Sequence[str] = (),
        skipped_node_ids: Sequence[str] = (),
    ) -> tuple[str, ...]:
        """Return nodes whose required dependencies have completed."""
        completed = set(completed_node_ids) | set(skipped_node_ids)
        excluded = completed | set(running_node_ids) | set(failed_node_ids)
        ready: list[str] = []
        for node_id in self.topological_order():
            if node_id in excluded:
                continue
            dependencies = self.dependencies_for(node_id, include_optional=False)
            if all(edge.source_node_id in completed for edge in dependencies):
                ready.append(node_id)
        return tuple(ready)

    def resource(self) -> ResourceRef:
        """Return this workflow as a capability and scheduler resource."""
        return ResourceRef(
            uri=workflow_uri(self.workflow_id),
            kind=ResourceKind.PROCESS,
            component=VIRTUAL_OS_SCHEDULER_COMPONENT,
            name=self.workflow_id,
            labels=dict(self.labels),
            metadata={
                "node_count": len(self.nodes),
                "edge_count": len(self.edges),
                "trace_id": self.trace_id,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class WorkflowStatus:
    """Observed state for a workflow DAG execution."""

    workflow_id: str
    state: WorkflowState | str = WorkflowState.UNKNOWN
    actor: IdentityRef | None = None
    current_node_ids: tuple[str, ...] = ()
    completed_node_ids: tuple[str, ...] = ()
    failed_node_ids: tuple[str, ...] = ()
    skipped_node_ids: tuple[str, ...] = ()
    cancelled_node_ids: tuple[str, ...] = ()
    task_statuses: tuple[AgentTaskStatus, ...] = ()
    process_statuses: tuple[AgentProcessStatus, ...] = ()
    submitted_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    updated_at: datetime = field(default_factory=utc_now)
    resource_usage: tuple[ResourceUsage, ...] = ()
    emitted_event_ids: tuple[str, ...] = ()
    message: str = ""
    metadata: Metadata = field(default_factory=dict)

    @property
    def is_terminal(self) -> bool:
        """Return whether the workflow is in a terminal state."""
        return _enum_value(self.state) in {state.value for state in TERMINAL_WORKFLOW_STATES}

    def resource(self) -> ResourceRef:
        """Return this workflow as a capability and scheduler resource."""
        return workflow_resource(self.workflow_id)


@dataclass(frozen=True)
class WorkflowSubmissionResult:
    """Result returned after submitting a workflow DAG."""

    workflow: WorkflowStatus
    ok: bool = True
    queued_tasks: tuple[AgentTaskStatus, ...] = ()
    events: tuple[EventEnvelope, ...] = ()
    message: str = ""
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class WorkflowCancellationRequest:
    """Request to cancel a workflow DAG and its outstanding work."""

    workflow_id: str
    actor: IdentityRef
    mode: CancellationMode | str = CancellationMode.COOPERATIVE
    reason: str = ""
    capabilities: tuple[CapabilityGrant, ...] = ()
    cancel_running_tasks: bool = True
    release_resources: bool = True
    trace_id: str | None = None
    parent_event_ids: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class WorkflowCancellationResult:
    """Result returned after cancelling a workflow."""

    workflow_id: str
    ok: bool = True
    state: WorkflowState | str = WorkflowState.CANCELLED
    cancelled_tasks: tuple[TaskCancellationResult, ...] = ()
    released_resources: tuple[ResourceRef, ...] = ()
    events: tuple[EventEnvelope, ...] = ()
    message: str = ""
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ResourceReservation:
    """Resource reservation held for a process, task, or workflow."""

    reservation_id: str
    state: ResourceReservationState | str
    actor: IdentityRef | None = None
    process_id: str | None = None
    task_id: str | None = None
    workflow_id: str | None = None
    queue_id: str | None = None
    claims: tuple[ResourceClaim, ...] = ()
    reserved: tuple[ResourceUsage, ...] = ()
    expires_at: datetime | None = None
    created_at: datetime = field(default_factory=utc_now)
    released_at: datetime | None = None
    message: str = ""
    metadata: Metadata = field(default_factory=dict)

    def is_expired(self, at: datetime | None = None) -> bool:
        """Return whether this resource reservation has expired."""
        if self.expires_at is None:
            return False
        return self.expires_at <= (at or utc_now())


@dataclass(frozen=True)
class ResourceReservationRequest:
    """Request to reserve resources before process or task dispatch."""

    actor: IdentityRef
    claims: tuple[ResourceClaim, ...]
    process_id: str | None = None
    task_id: str | None = None
    workflow_id: str | None = None
    queue_id: str | None = None
    capabilities: tuple[CapabilityGrant, ...] = ()
    trace_id: str | None = None
    options: Metadata = field(default_factory=dict)

    @property
    def capability_grants(self) -> tuple[CapabilityGrant, ...]:
        """Return capability grants carried by this reservation request."""
        return self.capabilities


@dataclass(frozen=True)
class ResourceReservationResult:
    """Result returned by scheduler resource reservation adapters."""

    reservation: ResourceReservation | None = None
    ok: bool = True
    events: tuple[EventEnvelope, ...] = ()
    message: str = ""
    metadata: Metadata = field(default_factory=dict)


def scheduler_event(
    event_type: SchedulerEventType | str,
    *,
    source: str = VIRTUAL_OS_SCHEDULER_COMPONENT,
    actor: IdentityRef | None = None,
    subject: ResourceRef | None = None,
    process_id: str | None = None,
    task_id: str | None = None,
    workflow_id: str | None = None,
    queue_id: str | None = None,
    severity: EventSeverity | str = EventSeverity.INFO,
    trace_id: str | None = None,
    correlation_id: str | None = None,
    parent_event_ids: Sequence[str] = (),
    payload: Metadata | None = None,
    metadata: Metadata | None = None,
    occurred_at: datetime | None = None,
) -> EventEnvelope:
    """Build a scheduler event envelope with MCP++ DAG parent links."""
    event_type_value = _enum_value(event_type)
    occurred = occurred_at or utc_now()
    event_subject = subject
    if event_subject is None:
        if task_id:
            event_subject = task_resource(task_id, queue_id=queue_id)
        elif workflow_id:
            event_subject = workflow_resource(workflow_id)
        elif process_id:
            event_subject = process_resource(process_id)
        elif queue_id:
            event_subject = queue_resource(queue_id)

    event_id = scheduler_id(
        "scheduler-event",
        event_type_value,
        source,
        event_subject.uri if event_subject else "",
        trace_id or "",
        correlation_id or "",
        occurred.isoformat(),
    )
    return EventEnvelope(
        event_id=event_id,
        event_type=event_type_value,
        source=source,
        occurred_at=occurred,
        severity=severity,
        actor=actor,
        subject=event_subject,
        trace_id=trace_id,
        correlation_id=correlation_id,
        parent_event_ids=tuple(parent_event_ids),
        payload={
            "process_id": process_id,
            "task_id": task_id,
            "workflow_id": workflow_id,
            "queue_id": queue_id,
            **dict(payload or {}),
        },
        metadata=dict(metadata or {}),
    )


@runtime_checkable
class AgentProcessSupervisor(Protocol):
    """Process lifecycle boundary implemented by daemon and shell adapters."""

    def create_process(self, spec: AgentProcessSpec) -> MaybeAwaitable[AgentProcessStatus]:
        """Create or register a process without necessarily starting work."""

    def start_process(self, process_id: str) -> MaybeAwaitable[AgentProcessStatus]:
        """Start a process and return its observed status."""

    def stop_process(
        self,
        process_id: str,
        *,
        actor: IdentityRef,
        reason: str = "",
        capabilities: Sequence[CapabilityGrant] = (),
    ) -> MaybeAwaitable[AgentProcessStatus]:
        """Stop a process through a capability-scoped boundary."""

    def restart_process(
        self,
        process_id: str,
        *,
        actor: IdentityRef,
        reason: str = "",
        capabilities: Sequence[CapabilityGrant] = (),
    ) -> MaybeAwaitable[AgentProcessStatus]:
        """Restart a process through a capability-scoped boundary."""

    def process_status(self, process_id: str) -> MaybeAwaitable[AgentProcessStatus | None]:
        """Return current process status."""

    def list_processes(
        self,
        *,
        component: str | None = None,
        workflow_id: str | None = None,
    ) -> MaybeAwaitable[Sequence[AgentProcessStatus]]:
        """List process status records with optional filters."""


@runtime_checkable
class AgentTaskQueue(Protocol):
    """Task queue boundary for local, daemon, MCP, and MCP++ work."""

    def submit_task(self, request: AgentTaskRequest) -> MaybeAwaitable[TaskSubmissionResult]:
        """Submit task work to a queue."""

    def queue_state(self, queue_id: str | None = None) -> MaybeAwaitable[AgentTaskQueueState]:
        """Return queue counters and task state."""

    def task_status(self, task_id: str) -> MaybeAwaitable[AgentTaskStatus | None]:
        """Return current task status."""

    def claim_task(
        self,
        queue_id: str,
        *,
        worker_id: str,
        actor: IdentityRef,
        capabilities: Sequence[CapabilityGrant] = (),
    ) -> MaybeAwaitable[AgentTaskStatus | None]:
        """Claim the next dispatchable task for a worker."""

    def cancel_task(self, request: TaskCancellationRequest) -> MaybeAwaitable[TaskCancellationResult]:
        """Cancel queued or running task work."""


@runtime_checkable
class TaskDelegator(Protocol):
    """Delegation boundary for MCP++, MCP JSON-RPC, p2p, or compute queues."""

    def delegate_task(self, request: TaskDelegationRequest) -> MaybeAwaitable[TaskDelegationReceipt]:
        """Delegate task execution to a target queue or service."""


@runtime_checkable
class WorkflowDAGScheduler(Protocol):
    """Workflow DAG scheduling boundary."""

    def submit_workflow(self, workflow: WorkflowDAG) -> MaybeAwaitable[WorkflowSubmissionResult]:
        """Submit a workflow DAG for scheduling."""

    def workflow_status(self, workflow_id: str) -> MaybeAwaitable[WorkflowStatus | None]:
        """Return current workflow status."""

    def ready_tasks(self, workflow_id: str) -> MaybeAwaitable[Sequence[AgentTaskRequest]]:
        """Return workflow tasks whose dependencies are satisfied."""

    def dispatch_workflow(
        self,
        workflow_id: str,
        *,
        actor: IdentityRef,
        capabilities: Sequence[CapabilityGrant] = (),
    ) -> MaybeAwaitable[WorkflowStatus]:
        """Dispatch ready workflow tasks through the scheduler."""

    def cancel_workflow(self, request: WorkflowCancellationRequest) -> MaybeAwaitable[WorkflowCancellationResult]:
        """Cancel a workflow and outstanding task work."""


@runtime_checkable
class SchedulerResourceManager(Protocol):
    """Resource reservation boundary used by process and workflow schedulers."""

    def reserve(self, request: ResourceReservationRequest) -> MaybeAwaitable[ResourceReservationResult]:
        """Reserve resources for a process, task, or workflow before dispatch."""

    def release(
        self,
        reservation_id: str,
        *,
        actor: IdentityRef,
        reason: str = "",
    ) -> MaybeAwaitable[ResourceReservationResult]:
        """Release resources held by a scheduler reservation."""

    def reservations(
        self,
        *,
        process_id: str | None = None,
        task_id: str | None = None,
        workflow_id: str | None = None,
    ) -> MaybeAwaitable[Sequence[ResourceReservation]]:
        """Return resource reservations with optional filters."""


@runtime_checkable
class SchedulerEventEmitter(Protocol):
    """Event publication boundary for scheduler event DAG emission."""

    def emit_scheduler_event(self, event: EventEnvelope) -> MaybeAwaitable[EventEnvelope]:
        """Publish a scheduler event and return the stored envelope."""


@runtime_checkable
class AgentSchedulerAdapter(
    AgentProcessSupervisor,
    AgentTaskQueue,
    TaskDelegator,
    WorkflowDAGScheduler,
    SchedulerResourceManager,
    SchedulerEventEmitter,
    Protocol,
):
    """Complete agent process and workflow scheduler contract."""


__all__ = [
    "AgentProcessKind",
    "AgentProcessSpec",
    "AgentProcessStatus",
    "AgentProcessSupervisor",
    "AgentSchedulerAdapter",
    "AgentTaskKind",
    "AgentTaskQueue",
    "AgentTaskQueueSpec",
    "AgentTaskQueueState",
    "AgentTaskQueueStatus",
    "AgentTaskRequest",
    "AgentTaskState",
    "AgentTaskStatus",
    "CancellationMode",
    "DependencyCondition",
    "MCP_PLUS_PLUS_COMPONENT",
    "PROCESS_TRANSITIONS",
    "ResourceReservation",
    "ResourceReservationRequest",
    "ResourceReservationResult",
    "ResourceReservationState",
    "RestartBackoff",
    "RestartDecision",
    "RestartPolicy",
    "RestartPolicySpec",
    "SchedulerEventEmitter",
    "SchedulerEventType",
    "SchedulerOperation",
    "SchedulerPayload",
    "SchedulerQueueDiscipline",
    "SchedulerResourceManager",
    "TERMINAL_PROCESS_STATES",
    "TERMINAL_TASK_STATES",
    "TERMINAL_WORKFLOW_STATES",
    "TASK_TRANSITIONS",
    "TaskCancellationRequest",
    "TaskCancellationResult",
    "TaskDelegationProtocol",
    "TaskDelegationReceipt",
    "TaskDelegationRequest",
    "TaskDelegationTarget",
    "TaskDelegator",
    "TaskDependency",
    "TaskSubmissionResult",
    "VIRTUAL_OS_SCHEDULER_COMPONENT",
    "WorkflowCancellationRequest",
    "WorkflowCancellationResult",
    "WorkflowDAG",
    "WorkflowDAGScheduler",
    "WorkflowEdge",
    "WorkflowNode",
    "WorkflowState",
    "WorkflowStatus",
    "WorkflowSubmissionResult",
    "can_transition_process",
    "can_transition_task",
    "process_resource",
    "process_uri",
    "queue_resource",
    "queue_uri",
    "scheduler_event",
    "scheduler_id",
    "task_resource",
    "task_uri",
    "workflow_resource",
    "workflow_uri",
]
