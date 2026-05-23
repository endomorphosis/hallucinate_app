# ADR-006: Agent Process and Scheduler Model

- Status: accepted
- Date: 2026-05-22
- Task: OS-015

## Context

ADR-001 defined the Virtual AI OS kernel process, identity, capability,
resource, and event primitives. ADR-002 defined the MCP++ service mesh profile,
including risk-adjusted scheduling inputs, task dependency readiness, resource
claims, capability grants, and event DAG ordering. ADR-005 defined the model
compute runtime and queue contract for `ipfs_accelerate_py`. ADR-007 defined
DID/UCAN/local capability semantics for execution-time authorization.

The next P0 boundary is the agent process scheduler. It must describe how
SwissKnife agent shells, daemon-managed workers, MCP++ task queues, and
accelerate-backed compute queues can be scheduled without directly importing
each other's native implementations. The model needs to cover:

- Process lifecycle, identity, resource claims, capabilities, and restart
  behavior.
- Task queue submission, claim, retry, cancellation, delegation, and state
  reporting.
- Workflow DAG dependency ordering across storage, knowledge, model, tool, and
  MCP++ invocations.
- Resource reservations before heavy dispatch and release after receipts or
  cancellation.
- Event envelopes with parent event ids so scheduler activity can participate
  in the MCP++ event DAG.

## Decision

Define `python/hallucinate_app/virtual_os/processes.py` as the repository-owned
agent process and scheduler contract. The module remains pure Python standard
library code and composes ADR-001 payloads such as `IdentityRef`,
`CapabilityGrant`, `ResourceClaim`, `ResourceUsage`, `ProcessState`,
`RestartPolicy`, `ProcessSpec`, `ProcessStatus`, `ResourceRef`, and
`EventEnvelope`.

The contract defines immutable payloads and runtime-checkable Protocols for:

- Process lifecycle: `AgentProcessSpec`, `AgentProcessStatus`,
  `AgentProcessKind`, lifecycle transition helpers, and
  `AgentProcessSupervisor`.
- Restart behavior: `RestartPolicySpec`, `RestartBackoff`, and
  `RestartDecision`, layered over the ADR-001 `RestartPolicy` enum.
- Task queues: `AgentTaskRequest`, `AgentTaskStatus`,
  `AgentTaskQueueSpec`, `AgentTaskQueueState`, `AgentTaskState`,
  `SchedulerQueueDiscipline`, submission/cancellation results, and
  `AgentTaskQueue`.
- Workflow DAGs: `WorkflowNode`, `WorkflowEdge`, `WorkflowDAG`,
  `WorkflowStatus`, workflow submission/cancellation results, and
  `WorkflowDAGScheduler`. `WorkflowDAG` validates node references, detects
  cycles, returns deterministic topological task order, and reports ready
  nodes from completed dependency state.
- MCP++ and queue delegation: `TaskDelegationTarget`,
  `TaskDelegationRequest`, `TaskDelegationReceipt`,
  `TaskDelegationProtocol`, and `TaskDelegator`.
- Resource reservation: `ResourceReservationRequest`,
  `ResourceReservation`, `ResourceReservationResult`,
  `ResourceReservationState`, and `SchedulerResourceManager`.
- Event DAG emission: `SchedulerEventType`, `scheduler_event`, and
  `SchedulerEventEmitter`, using `EventEnvelope.parent_event_ids` for causal
  links.
- Full adapter surface: `AgentSchedulerAdapter`, which composes process,
  queue, delegation, workflow, resource, and event Protocols.

All process, task, workflow, delegation, cancellation, and resource reservation
requests carry an actor identity and optional capability grants at the boundary
where authorization matters. Resource references use stable URI helpers:
`virtual-os://processes/{process_id}`, `virtual-os://queues/{queue_id}`,
`virtual-os://queues/{queue_id}/tasks/{task_id}`, and
`virtual-os://workflows/{workflow_id}`.

## Scheduling Model

The scheduler frontier is a risk-adjusted priority queue by default, matching
the MCP++ profile. A task exposes a priority hint, risk score, dependencies,
resource claims, capability grants, parent event ids, optional deadline,
idempotency key, retry budget, and optional delegation target.

Dispatch is valid only when:

1. Required task or workflow dependencies are ready.
2. Capability grants or UCAN-derived grants authorize the target operation.
3. Resource claims have been reserved for heavy work.
4. Parent event ids are preserved in emitted scheduler events.
5. Cancellation and retry policy are reflected in task state transitions.

Workflow DAGs are strict partial orders. Independent nodes remain concurrent;
the contract does not impose a global total ordering. Optional edges can be
recorded for provenance without blocking dispatch.

## Restart Model

`RestartPolicySpec` extends ADR-001 `RestartPolicy` with attempt limits,
fixed or exponential backoff, included and excluded exit-code sets, and
restart-window metadata. Cancelled processes do not restart automatically.
`on_failure` restarts failed or non-zero-exit processes, while `always`
restarts stopped or failed terminal processes subject to attempt and exit-code
constraints.

## Boundaries

This ADR does not define a concrete daemon launcher, local thread pool, durable
queue store, live MCP++ transport, libp2p peer scheduler, model runtime, or
policy engine. Adapters must normalize native SwissKnife, MCP++,
`ipfs_accelerate_py`, daemon, or task-board objects into the contract payloads
at the boundary.

Descriptors remain descriptive metadata. Execution still requires matching
capability grants or UCAN proofs as defined by ADR-007. Resource claims are
contract inputs; actual enforcement remains with scheduler and resource manager
adapters.

## Consequences

OS-016 can test process creation, dependency ordering, MCP++ task queue
delegation, retry, cancellation, and event DAG emission using mocks against one
importable contract module. Cross-component workflow tests can build storage to
dataset to model pipelines without starting live daemon, MCP++, model, IPFS, or
browser services.

The contract gives future adapters one stable scheduler vocabulary while
allowing existing synchronous APIs, asynchronous MCP tools, daemon processes,
and peer queues to implement the same Protocols through `MaybeAwaitable[T]`.
