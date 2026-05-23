import sys
import unittest
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    CapabilityAction,
    CapabilityGrant,
    EventSeverity,
    HealthState,
    IdentityRef,
    ProcessState,
    ResourceClaim,
    ResourceKind,
    ResourceRef,
    ResourceUnit,
    ResourceUsage,
    RestartPolicy,
    utc_now,
)
from hallucinate_app.virtual_os.processes import (  # noqa: E402
    AgentProcessKind,
    AgentProcessSpec,
    AgentProcessStatus,
    AgentSchedulerAdapter,
    AgentTaskKind,
    AgentTaskQueueState,
    AgentTaskQueueStatus,
    AgentTaskRequest,
    AgentTaskState,
    AgentTaskStatus,
    CancellationMode,
    ResourceReservation,
    ResourceReservationRequest,
    ResourceReservationResult,
    ResourceReservationState,
    RestartBackoff,
    RestartPolicySpec,
    SchedulerEventType,
    SchedulerQueueDiscipline,
    TaskCancellationRequest,
    TaskCancellationResult,
    TaskDelegationProtocol,
    TaskDelegationReceipt,
    TaskDelegationRequest,
    TaskDelegationTarget,
    TaskSubmissionResult,
    WorkflowCancellationRequest,
    WorkflowCancellationResult,
    WorkflowDAG,
    WorkflowEdge,
    WorkflowNode,
    WorkflowState,
    WorkflowStatus,
    WorkflowSubmissionResult,
    can_transition_task,
    process_uri,
    scheduler_event,
    task_uri,
)


FIXED_TIME = datetime(2026, 5, 22, 12, 0, 0, tzinfo=timezone.utc)


class MockAgentScheduler:
    """Small in-memory scheduler used to exercise the public contract surface."""

    def __init__(self):
        self.processes = {}
        self.task_requests = {}
        self.tasks = {}
        self.task_history = {}
        self.workflows = {}
        self.workflow_statuses = {}
        self.reservations_by_id = {}
        self.events = []
        self.sequence = 0

    def _next_id(self, prefix):
        self.sequence += 1
        return f"{prefix}-{self.sequence}"

    def _emit(
        self,
        event_type,
        *,
        actor=None,
        process_id=None,
        task_id=None,
        workflow_id=None,
        queue_id=None,
        parent_event_ids=(),
        payload=None,
        source="virtual_os.scheduler",
        trace_id=None,
    ):
        event = scheduler_event(
            event_type,
            source=source,
            actor=actor,
            process_id=process_id,
            task_id=task_id,
            workflow_id=workflow_id,
            queue_id=queue_id,
            parent_event_ids=parent_event_ids,
            payload=payload or {},
            trace_id=trace_id,
            correlation_id=self._next_id("correlation"),
        )
        return self.emit_scheduler_event(event)

    def _remember_task(self, status):
        self.tasks[status.task_id] = status
        self.task_history.setdefault(status.task_id, []).append(status)
        return status

    def create_process(self, spec):
        status = AgentProcessStatus(
            process_id=spec.process_id,
            state=ProcessState.PENDING,
            component=spec.component,
            identity=spec.identity,
            kind=spec.kind,
            health=HealthState.STARTING,
            workflow_id=spec.workflow_id,
            queue_id=spec.queue_id,
            restart_policy=spec.restart_policy,
            resource_claims=spec.resource_claims,
            metadata={"entrypoint": spec.entrypoint, **dict(spec.metadata)},
        )
        self.processes[spec.process_id] = status
        self._emit(
            SchedulerEventType.PROCESS_CREATED,
            actor=spec.identity,
            process_id=spec.process_id,
            payload={"process_kind": spec.kind.value if hasattr(spec.kind, "value") else spec.kind},
        )
        return status

    def start_process(self, process_id):
        current = self.processes[process_id]
        status = replace(current, state=ProcessState.RUNNING, health=HealthState.HEALTHY, started_at=utc_now())
        self.processes[process_id] = status
        self._emit(SchedulerEventType.PROCESS_STARTED, actor=status.identity, process_id=process_id)
        return status

    def stop_process(self, process_id, *, actor, reason="", capabilities=()):
        current = self.processes[process_id]
        status = replace(
            current,
            state=ProcessState.STOPPED,
            health=HealthState.STOPPED,
            stopped_at=utc_now(),
            message=reason,
        )
        self.processes[process_id] = status
        self._emit(SchedulerEventType.PROCESS_STOPPED, actor=actor, process_id=process_id, payload={"reason": reason})
        return status

    def restart_process(self, process_id, *, actor, reason="", capabilities=()):
        current = self.processes[process_id]
        status = replace(
            current,
            state=ProcessState.STARTING,
            health=HealthState.STARTING,
            restart_count=current.restart_count + 1,
            message=reason,
        )
        self.processes[process_id] = status
        self._emit(SchedulerEventType.PROCESS_RESTARTED, actor=actor, process_id=process_id, payload={"reason": reason})
        return status

    def process_status(self, process_id):
        return self.processes.get(process_id)

    def list_processes(self, *, component=None, workflow_id=None):
        statuses = tuple(self.processes.values())
        if component is not None:
            statuses = tuple(status for status in statuses if status.component == component)
        if workflow_id is not None:
            statuses = tuple(status for status in statuses if status.workflow_id == workflow_id)
        return statuses

    def submit_task(self, request):
        state = AgentTaskState.BLOCKED if request.depends_on else AgentTaskState.QUEUED
        status = replace(request.initial_status(state), queued_at=utc_now())
        self.task_requests[request.task_id] = request
        self._remember_task(status)

        enqueue_event = self._emit(
            SchedulerEventType.TASK_ENQUEUED,
            actor=request.actor,
            task_id=request.task_id,
            queue_id=request.queue_id,
            parent_event_ids=request.parent_event_ids,
            payload={"effective_priority": request.effective_priority},
            trace_id=request.trace_id,
        )
        event_ids = [enqueue_event.event_id]
        events = [enqueue_event]
        delegation = None

        if request.delegation is not None:
            delegation = self.delegate_task(
                TaskDelegationRequest(
                    task=request,
                    target=request.delegation,
                    actor=request.actor,
                    capabilities=request.capabilities,
                    parent_event_ids=(*request.parent_event_ids, enqueue_event.event_id),
                    trace_id=request.trace_id,
                )
            )
            events.extend(delegation.events)
            if delegation.event_id:
                event_ids.append(delegation.event_id)
            status = replace(
                status,
                state=delegation.state,
                emitted_event_ids=tuple(event_ids),
                metadata={**dict(status.metadata), "delegated_task_id": delegation.delegated_task_id},
            )
            self._remember_task(status)
        else:
            status = replace(status, emitted_event_ids=tuple(event_ids))
            self._remember_task(status)

        return TaskSubmissionResult(
            task=status,
            ok=True,
            queue_id=request.queue_id,
            delegation=delegation,
            events=tuple(events),
        )

    def queue_state(self, queue_id=None):
        tasks = tuple(
            status for status in self.tasks.values() if queue_id is None or status.queue_id == queue_id
        )
        counts = {}
        for state in AgentTaskState:
            counts[state.value] = sum(1 for status in tasks if (status.state.value if hasattr(status.state, "value") else status.state) == state.value)
        return AgentTaskQueueState(
            queue_id=queue_id or "all",
            status=AgentTaskQueueStatus.ACTIVE,
            discipline=SchedulerQueueDiscipline.RISK_ADJUSTED_PRIORITY,
            depth=sum(1 for status in tasks if not status.is_terminal),
            blocked=counts[AgentTaskState.BLOCKED.value],
            ready=counts[AgentTaskState.READY.value],
            pending=counts[AgentTaskState.PENDING.value],
            running=counts[AgentTaskState.RUNNING.value],
            completed=counts[AgentTaskState.COMPLETED.value],
            failed=counts[AgentTaskState.FAILED.value],
            cancelled=counts[AgentTaskState.CANCELLED.value],
            tasks=tasks,
        )

    def task_status(self, task_id):
        return self.tasks.get(task_id)

    def claim_task(self, queue_id, *, worker_id, actor, capabilities=()):
        candidates = [
            status
            for status in self.tasks.values()
            if status.queue_id == queue_id and status.state in {AgentTaskState.READY, AgentTaskState.QUEUED}
        ]
        if not candidates:
            return None
        selected = sorted(candidates, key=lambda status: (-status.effective_priority, status.task_id))[0]
        claimed = replace(selected, state=AgentTaskState.CLAIMED, worker_id=worker_id, claimed_at=utc_now())
        self._remember_task(claimed)
        self._emit(
            SchedulerEventType.TASK_STARTED,
            actor=actor,
            task_id=claimed.task_id,
            queue_id=claimed.queue_id,
            parent_event_ids=claimed.parent_event_ids,
            payload={"worker_id": worker_id},
        )
        return claimed

    def cancel_task(self, request):
        current = self.tasks[request.task_id]
        parent_event_ids = request.parent_event_ids or current.parent_event_ids
        event = self._emit(
            SchedulerEventType.TASK_CANCELLED,
            actor=request.actor,
            task_id=request.task_id,
            queue_id=request.queue_id or current.queue_id,
            parent_event_ids=parent_event_ids,
            payload={"reason": request.reason, "mode": request.mode.value if hasattr(request.mode, "value") else request.mode},
            trace_id=request.trace_id,
        )
        released = tuple(claim.resource for claim in current.resource_claims) if request.release_resources else ()
        status = replace(
            current,
            state=AgentTaskState.CANCELLED,
            cancelled_at=utc_now(),
            cancellation_reason=request.reason,
            emitted_event_ids=(*current.emitted_event_ids, event.event_id),
        )
        self._remember_task(status)
        return TaskCancellationResult(
            task_id=request.task_id,
            ok=True,
            state=AgentTaskState.CANCELLED,
            cancelled_at=status.cancelled_at,
            released_resources=released,
            task_status=status,
            events=(event,),
        )

    def delegate_task(self, request):
        event = self._emit(
            SchedulerEventType.TASK_DELEGATED,
            source=request.target.component,
            actor=request.actor,
            task_id=request.task.task_id,
            queue_id=request.target.queue_id or request.task.queue_id,
            parent_event_ids=request.parent_event_ids or request.task.parent_event_ids,
            payload={
                "target_id": request.target.target_id,
                "protocol": request.target.protocol.value if hasattr(request.target.protocol, "value") else request.target.protocol,
                "method": request.target.method,
            },
            trace_id=request.trace_id,
        )
        return TaskDelegationReceipt(
            task_id=request.task.task_id,
            target=request.target,
            ok=True,
            delegated_task_id=f"{request.target.target_id}:{request.task.task_id}",
            queue_id=request.target.queue_id,
            receipt_cid=f"bafy{request.task.task_id.replace('-', '')}",
            event_id=event.event_id,
            state=AgentTaskState.QUEUED,
            events=(event,),
            metadata={"capability_grant_count": len(request.capability_grants)},
        )

    def submit_workflow(self, workflow):
        workflow.validate()
        event = self._emit(
            SchedulerEventType.WORKFLOW_SUBMITTED,
            actor=workflow.actor,
            workflow_id=workflow.workflow_id,
            parent_event_ids=workflow.parent_event_ids,
            trace_id=workflow.trace_id,
            payload={"node_count": len(workflow.nodes)},
        )
        status = WorkflowStatus(
            workflow_id=workflow.workflow_id,
            state=WorkflowState.READY,
            actor=workflow.actor,
            submitted_at=utc_now(),
            emitted_event_ids=(event.event_id,),
        )
        self.workflows[workflow.workflow_id] = workflow
        self.workflow_statuses[workflow.workflow_id] = status
        return WorkflowSubmissionResult(workflow=status, ok=True, events=(event,))

    def workflow_status(self, workflow_id):
        return self.workflow_statuses.get(workflow_id)

    def ready_tasks(self, workflow_id):
        workflow = self.workflows[workflow_id]
        status = self.workflow_statuses[workflow_id]
        nodes = workflow.node_map()
        ready_node_ids = workflow.ready_node_ids(
            completed_node_ids=status.completed_node_ids,
            running_node_ids=status.current_node_ids,
            failed_node_ids=status.failed_node_ids,
            skipped_node_ids=status.skipped_node_ids,
        )
        return tuple(nodes[node_id].task for node_id in ready_node_ids if nodes[node_id].task is not None)

    def dispatch_workflow(self, workflow_id, *, actor, capabilities=()):
        workflow = self.workflows[workflow_id]
        status = self.workflow_statuses[workflow_id]
        nodes = workflow.node_map()
        ready_node_ids = workflow.ready_node_ids(
            completed_node_ids=status.completed_node_ids,
            running_node_ids=status.current_node_ids,
            failed_node_ids=status.failed_node_ids,
            skipped_node_ids=status.skipped_node_ids,
        )
        queued = []
        for node_id in ready_node_ids:
            node = nodes[node_id]
            if node.task is not None:
                queued.append(self.submit_task(node.task).task)
        event = self._emit(
            SchedulerEventType.WORKFLOW_STARTED,
            actor=actor,
            workflow_id=workflow_id,
            parent_event_ids=status.emitted_event_ids,
            trace_id=workflow.trace_id,
            payload={"ready_node_ids": ready_node_ids},
        )
        updated = replace(
            status,
            state=WorkflowState.RUNNING,
            current_node_ids=tuple(ready_node_ids),
            task_statuses=(*status.task_statuses, *queued),
            started_at=status.started_at or utc_now(),
            emitted_event_ids=(*status.emitted_event_ids, event.event_id),
        )
        self.workflow_statuses[workflow_id] = updated
        return updated

    def cancel_workflow(self, request):
        current = self.workflow_statuses[request.workflow_id]
        cancelled_tasks = []
        if request.cancel_running_tasks:
            for task_status in current.task_statuses:
                if not task_status.is_terminal:
                    cancelled_tasks.append(
                        self.cancel_task(
                            TaskCancellationRequest(
                                task_id=task_status.task_id,
                                actor=request.actor,
                                mode=request.mode,
                                queue_id=task_status.queue_id,
                                workflow_id=request.workflow_id,
                                reason=request.reason,
                                release_resources=request.release_resources,
                                trace_id=request.trace_id,
                                parent_event_ids=request.parent_event_ids,
                            )
                        )
                    )
        event = self._emit(
            SchedulerEventType.WORKFLOW_CANCELLED,
            actor=request.actor,
            workflow_id=request.workflow_id,
            parent_event_ids=request.parent_event_ids or current.emitted_event_ids,
            trace_id=request.trace_id,
            payload={"reason": request.reason},
        )
        updated = replace(
            current,
            state=WorkflowState.CANCELLED,
            current_node_ids=(),
            cancelled_node_ids=(*current.cancelled_node_ids, *current.current_node_ids),
            emitted_event_ids=(*current.emitted_event_ids, event.event_id),
        )
        self.workflow_statuses[request.workflow_id] = updated
        return WorkflowCancellationResult(
            workflow_id=request.workflow_id,
            ok=True,
            state=WorkflowState.CANCELLED,
            cancelled_tasks=tuple(cancelled_tasks),
            events=(event,),
        )

    def reserve(self, request):
        reservation = ResourceReservation(
            reservation_id=self._next_id("reservation"),
            state=ResourceReservationState.RESERVED,
            actor=request.actor,
            process_id=request.process_id,
            task_id=request.task_id,
            workflow_id=request.workflow_id,
            queue_id=request.queue_id,
            claims=request.claims,
            reserved=tuple(
                ResourceUsage(resource=claim.resource, amount=claim.amount, unit=claim.unit)
                for claim in request.claims
            ),
        )
        self.reservations_by_id[reservation.reservation_id] = reservation
        event = self._emit(
            SchedulerEventType.RESOURCES_RESERVED,
            actor=request.actor,
            process_id=request.process_id,
            task_id=request.task_id,
            workflow_id=request.workflow_id,
            queue_id=request.queue_id,
            trace_id=request.trace_id,
            payload={"reservation_id": reservation.reservation_id},
        )
        return ResourceReservationResult(reservation=reservation, ok=True, events=(event,))

    def release(self, reservation_id, *, actor, reason=""):
        current = self.reservations_by_id[reservation_id]
        reservation = replace(current, state=ResourceReservationState.RELEASED, released_at=utc_now(), message=reason)
        self.reservations_by_id[reservation_id] = reservation
        event = self._emit(
            SchedulerEventType.RESOURCES_RELEASED,
            actor=actor,
            process_id=reservation.process_id,
            task_id=reservation.task_id,
            workflow_id=reservation.workflow_id,
            queue_id=reservation.queue_id,
            payload={"reservation_id": reservation_id, "reason": reason},
        )
        return ResourceReservationResult(reservation=reservation, ok=True, events=(event,))

    def reservations(self, *, process_id=None, task_id=None, workflow_id=None):
        reservations = tuple(self.reservations_by_id.values())
        if process_id is not None:
            reservations = tuple(reservation for reservation in reservations if reservation.process_id == process_id)
        if task_id is not None:
            reservations = tuple(reservation for reservation in reservations if reservation.task_id == task_id)
        if workflow_id is not None:
            reservations = tuple(reservation for reservation in reservations if reservation.workflow_id == workflow_id)
        return reservations

    def emit_scheduler_event(self, event):
        self.events.append(event)
        return event

    def record_task_failure(self, task_id, error):
        current = self.tasks[task_id]
        failed = replace(
            current,
            state=AgentTaskState.FAILED,
            attempts=current.attempts + 1,
            error=error,
            message=error,
        )
        self._remember_task(failed)
        event = self._emit(
            SchedulerEventType.TASK_FAILED,
            actor=failed.actor,
            task_id=task_id,
            queue_id=failed.queue_id,
            parent_event_ids=failed.parent_event_ids,
            payload={"will_retry": failed.can_retry, "attempts": failed.attempts},
        )
        if failed.can_retry:
            retrying = replace(
                failed,
                state=AgentTaskState.RETRY_WAITING,
                emitted_event_ids=(*failed.emitted_event_ids, event.event_id),
            )
            self._remember_task(retrying)
            ready = replace(retrying, state=AgentTaskState.READY, message="retry scheduled")
            return self._remember_task(ready)
        final = replace(failed, emitted_event_ids=(*failed.emitted_event_ids, event.event_id))
        return self._remember_task(final)

    def complete_task(self, task_id, result_ref=None):
        current = self.tasks[task_id]
        event = self._emit(
            SchedulerEventType.TASK_COMPLETED,
            actor=current.actor,
            task_id=task_id,
            queue_id=current.queue_id,
            parent_event_ids=current.parent_event_ids,
        )
        return self._remember_task(
            replace(
                current,
                state=AgentTaskState.COMPLETED,
                completed_at=utc_now(),
                result_ref=result_ref,
                emitted_event_ids=(*current.emitted_event_ids, event.event_id),
            )
        )

    def mark_workflow_node_completed(self, workflow_id, node_id):
        workflow = self.workflows[workflow_id]
        status = self.workflow_statuses[workflow_id]
        node = workflow.node_map()[node_id]
        self.complete_task(node.effective_task_id)
        updated = replace(
            status,
            current_node_ids=tuple(value for value in status.current_node_ids if value != node_id),
            completed_node_ids=(*status.completed_node_ids, node_id),
        )
        self.workflow_statuses[workflow_id] = updated
        return updated


class TestVirtualOSProcessScheduler(unittest.TestCase):
    def setUp(self):
        self.actor = IdentityRef(did="did:example:agent", display_name="Scheduler Agent", roles=("agent",))
        self.system = IdentityRef(did="did:example:system", display_name="Virtual OS", roles=("system",))
        self.queue_resource = ResourceRef(
            uri="virtual-os://queues/agent-q",
            kind=ResourceKind.PROCESS,
            component="virtual_os.scheduler",
            name="agent-q",
        )
        self.cpu = ResourceRef(
            uri="hardware://local/cpu",
            kind=ResourceKind.HARDWARE,
            component="local",
            name="cpu",
        )

    def make_grant(self, grant_id="grant-scheduler", *, action=CapabilityAction.EXECUTE, resource=None):
        return CapabilityGrant(
            grant_id=grant_id,
            action=action,
            resource=resource or self.queue_resource,
            issuer=self.system,
            audience=self.actor,
        )

    def make_cpu_claim(self, amount=250):
        return ResourceClaim(resource=self.cpu, amount=amount, unit=ResourceUnit.MILLICORES)

    def make_task(self, task_id, *, kind=AgentTaskKind.WORKFLOW_STEP, queue_id="agent-q", workflow_id=None, **kwargs):
        return AgentTaskRequest(
            task_id=task_id,
            kind=kind,
            actor=self.actor,
            queue_id=queue_id,
            workflow_id=workflow_id,
            capabilities=(self.make_grant(f"grant-{task_id}"),),
            **kwargs,
        )

    def test_process_creation_records_lifecycle_identity_resources_and_event(self):
        scheduler = MockAgentScheduler()
        self.assertIsInstance(scheduler, AgentSchedulerAdapter)

        spec = AgentProcessSpec(
            process_id="agent-process-1",
            component="swissknife",
            entrypoint="agents.chat",
            identity=self.actor,
            kind=AgentProcessKind.AGENT,
            queue_id="agent-q",
            capabilities=(self.make_grant(),),
            resource_claims=(self.make_cpu_claim(),),
            restart_policy=RestartPolicySpec(
                policy=RestartPolicy.ON_FAILURE,
                max_attempts=2,
                initial_delay_s=0.5,
                backoff=RestartBackoff.EXPONENTIAL,
            ),
            labels={"role": "planner"},
            metadata={"profile": "chat"},
        )

        created = scheduler.create_process(spec)
        started = scheduler.start_process(spec.process_id)

        self.assertEqual(created.state, ProcessState.PENDING)
        self.assertEqual(started.state, ProcessState.RUNNING)
        self.assertEqual(started.identity, self.actor)
        self.assertEqual(started.resource_claims[0].unit, ResourceUnit.MILLICORES)
        self.assertEqual(spec.resource().uri, process_uri("agent-process-1"))
        self.assertEqual(spec.to_process_spec().metadata["process_kind"], AgentProcessKind.AGENT.value)
        self.assertEqual(spec.to_process_spec().restart_policy, RestartPolicy.ON_FAILURE)
        self.assertEqual([status.process_id for status in scheduler.list_processes(component="swissknife")], [spec.process_id])

        created_event = scheduler.events[0]
        self.assertEqual(created_event.event_type, SchedulerEventType.PROCESS_CREATED.value)
        self.assertEqual(created_event.subject.uri, process_uri(spec.process_id))
        self.assertEqual(created_event.actor, self.actor)
        self.assertEqual(created_event.payload["process_id"], spec.process_id)

    def test_workflow_dependency_ordering_dispatches_only_ready_nodes(self):
        scheduler = MockAgentScheduler()
        workflow = WorkflowDAG(
            workflow_id="workflow-alpha",
            actor=self.actor,
            trace_id="trace-workflow-alpha",
            nodes=(
                WorkflowNode(node_id="load", task=self.make_task("task-load", workflow_id="workflow-alpha")),
                WorkflowNode(node_id="embed", task=self.make_task("task-embed", workflow_id="workflow-alpha")),
                WorkflowNode(node_id="answer", task=self.make_task("task-answer", workflow_id="workflow-alpha")),
            ),
            edges=(
                WorkflowEdge(source_node_id="load", target_node_id="embed"),
                WorkflowEdge(source_node_id="embed", target_node_id="answer"),
            ),
        )

        self.assertEqual(workflow.topological_order(), ("load", "embed", "answer"))
        self.assertEqual(workflow.task_order(), ("task-load", "task-embed", "task-answer"))
        self.assertEqual(workflow.root_node_ids(), ("load",))
        self.assertEqual(workflow.leaf_node_ids(), ("answer",))

        submission = scheduler.submit_workflow(workflow)
        self.assertTrue(submission.ok)
        self.assertEqual([task.task_id for task in scheduler.ready_tasks("workflow-alpha")], ["task-load"])

        first_dispatch = scheduler.dispatch_workflow("workflow-alpha", actor=self.actor)
        self.assertEqual(first_dispatch.current_node_ids, ("load",))
        self.assertEqual([status.task_id for status in first_dispatch.task_statuses], ["task-load"])

        scheduler.mark_workflow_node_completed("workflow-alpha", "load")
        self.assertEqual([task.task_id for task in scheduler.ready_tasks("workflow-alpha")], ["task-embed"])

        second_dispatch = scheduler.dispatch_workflow("workflow-alpha", actor=self.actor)
        self.assertEqual(second_dispatch.current_node_ids, ("embed",))
        self.assertEqual(second_dispatch.task_statuses[-1].task_id, "task-embed")

        scheduler.mark_workflow_node_completed("workflow-alpha", "embed")
        self.assertEqual([task.task_id for task in scheduler.ready_tasks("workflow-alpha")], ["task-answer"])

        cyclic = replace(
            workflow,
            edges=(
                WorkflowEdge(source_node_id="load", target_node_id="embed"),
                WorkflowEdge(source_node_id="embed", target_node_id="answer"),
                WorkflowEdge(source_node_id="answer", target_node_id="load"),
            ),
        )
        with self.assertRaises(ValueError):
            cyclic.validate()

    def test_mcp_plus_plus_task_queue_delegation_preserves_capabilities_and_event_parents(self):
        scheduler = MockAgentScheduler()
        target_grant = self.make_grant("grant-mcp-target", action=CapabilityAction.DELEGATE)
        task_grant = self.make_grant("grant-task-execute")
        target = TaskDelegationTarget(
            target_id="mcp-peer-1",
            protocol=TaskDelegationProtocol.MCP_PLUS_PLUS,
            service_id="mcp-plus-plus.scheduler",
            component="mcp_plus_plus",
            queue_id="mcp++:agent-q",
            interface_cid="bafyinterface",
            method="tools.invoke",
            peer_id="peer-1",
            capabilities=(target_grant,),
        )
        task = AgentTaskRequest(
            task_id="task-mcp-plus-plus",
            kind=AgentTaskKind.MCP_PLUS_PLUS_INVOCATION,
            actor=self.actor,
            payload={"tool": "ipfs.add"},
            queue_id="agent-q",
            priority=10,
            risk_score=2.5,
            parent_event_ids=("event-root",),
            capabilities=(task_grant,),
            delegation=target,
            trace_id="trace-mcp",
        )

        delegation_request = TaskDelegationRequest(
            task=task,
            target=target,
            actor=self.actor,
            capabilities=(self.make_grant("grant-call-delegate", action=CapabilityAction.DELEGATE),),
        )
        self.assertEqual(
            {grant.grant_id for grant in delegation_request.capability_grants},
            {"grant-call-delegate", "grant-task-execute", "grant-mcp-target"},
        )

        result = scheduler.submit_task(task)

        self.assertTrue(result.ok)
        self.assertIsNotNone(result.delegation)
        self.assertEqual(result.delegation.target.protocol, TaskDelegationProtocol.MCP_PLUS_PLUS)
        self.assertEqual(result.delegation.queue_id, "mcp++:agent-q")
        self.assertEqual(result.delegation.delegated_task_id, "mcp-peer-1:task-mcp-plus-plus")
        self.assertEqual(result.task.effective_priority, 12.5)
        self.assertEqual(result.task.metadata["delegated_task_id"], "mcp-peer-1:task-mcp-plus-plus")
        self.assertEqual([event.event_type for event in result.events], [
            SchedulerEventType.TASK_ENQUEUED.value,
            SchedulerEventType.TASK_DELEGATED.value,
        ])

        delegated_event = result.delegation.events[0]
        self.assertEqual(delegated_event.source, "mcp_plus_plus")
        self.assertIn("event-root", delegated_event.parent_event_ids)
        self.assertIn(result.events[0].event_id, delegated_event.parent_event_ids)
        self.assertEqual(delegated_event.payload["protocol"], TaskDelegationProtocol.MCP_PLUS_PLUS.value)

    def test_retry_requeues_until_attempt_budget_is_exhausted(self):
        scheduler = MockAgentScheduler()
        task = self.make_task(
            "task-retry",
            priority=1,
            risk_score=4,
            max_attempts=2,
            parent_event_ids=("event-task-submitted",),
        )
        scheduler.submit_task(task)

        claimed = scheduler.claim_task("agent-q", worker_id="worker-1", actor=self.actor)
        self.assertEqual(claimed.task_id, "task-retry")
        self.assertEqual(claimed.state, AgentTaskState.CLAIMED)

        retry_ready = scheduler.record_task_failure("task-retry", "transient peer error")
        first_failed = [status for status in scheduler.task_history["task-retry"] if status.state == AgentTaskState.FAILED][0]
        self.assertTrue(first_failed.can_retry)
        self.assertTrue(can_transition_task(AgentTaskState.FAILED, AgentTaskState.RETRY_WAITING))
        self.assertTrue(can_transition_task(AgentTaskState.RETRY_WAITING, AgentTaskState.READY))
        self.assertEqual(retry_ready.state, AgentTaskState.READY)
        self.assertEqual(retry_ready.attempts, 1)

        claimed_again = scheduler.claim_task("agent-q", worker_id="worker-1", actor=self.actor)
        self.assertEqual(claimed_again.state, AgentTaskState.CLAIMED)
        final = scheduler.record_task_failure("task-retry", "peer still unavailable")

        self.assertEqual(final.state, AgentTaskState.FAILED)
        self.assertEqual(final.attempts, 2)
        self.assertFalse(final.can_retry)
        self.assertTrue(final.is_terminal)

    def test_task_cancellation_releases_claimed_resources_and_updates_queue_state(self):
        scheduler = MockAgentScheduler()
        claim = self.make_cpu_claim(amount=500)
        task = self.make_task(
            "task-cancel",
            resource_claims=(claim,),
            parent_event_ids=("event-dispatch",),
            trace_id="trace-cancel",
        )
        reservation = scheduler.reserve(
            ResourceReservationRequest(
                actor=self.actor,
                task_id=task.task_id,
                queue_id=task.queue_id,
                claims=task.resource_claims,
                trace_id=task.trace_id,
            )
        )
        scheduler.submit_task(task)

        cancellation = scheduler.cancel_task(
            TaskCancellationRequest(
                task_id=task.task_id,
                actor=self.actor,
                mode=CancellationMode.FORCE,
                queue_id=task.queue_id,
                reason="user cancelled workflow",
                trace_id=task.trace_id,
                parent_event_ids=("event-cancel-request",),
            )
        )
        released = scheduler.release(
            reservation.reservation.reservation_id,
            actor=self.actor,
            reason="task cancelled",
        )

        self.assertTrue(cancellation.ok)
        self.assertEqual(cancellation.state, AgentTaskState.CANCELLED)
        self.assertEqual(cancellation.released_resources, (self.cpu,))
        self.assertTrue(cancellation.task_status.is_terminal)
        self.assertEqual(cancellation.events[0].event_type, SchedulerEventType.TASK_CANCELLED.value)
        self.assertEqual(cancellation.events[0].parent_event_ids, ("event-cancel-request",))
        self.assertEqual(scheduler.queue_state("agent-q").cancelled, 1)
        self.assertEqual(released.reservation.state, ResourceReservationState.RELEASED)

    def test_scheduler_event_dag_uses_parent_links_and_stable_subjects(self):
        parent = scheduler_event(
            SchedulerEventType.PROCESS_STARTED,
            actor=self.actor,
            process_id="agent-process-1",
            trace_id="trace-event-dag",
            occurred_at=FIXED_TIME,
        )
        child = scheduler_event(
            SchedulerEventType.TASK_STARTED,
            actor=self.actor,
            task_id="task-event-dag",
            queue_id="agent-q",
            severity=EventSeverity.INFO,
            trace_id="trace-event-dag",
            correlation_id="correlation-event-dag",
            parent_event_ids=(parent.event_id,),
            payload={"worker_id": "worker-1"},
            occurred_at=FIXED_TIME,
        )
        same_child = scheduler_event(
            SchedulerEventType.TASK_STARTED,
            actor=self.actor,
            task_id="task-event-dag",
            queue_id="agent-q",
            severity=EventSeverity.INFO,
            trace_id="trace-event-dag",
            correlation_id="correlation-event-dag",
            parent_event_ids=(parent.event_id,),
            payload={"worker_id": "worker-1"},
            occurred_at=FIXED_TIME,
        )

        scheduler = MockAgentScheduler()
        emitted = scheduler.emit_scheduler_event(child)

        self.assertEqual(child.event_id, same_child.event_id)
        self.assertEqual(emitted.parent_event_ids, (parent.event_id,))
        self.assertEqual(emitted.subject.uri, task_uri("task-event-dag", queue_id="agent-q"))
        self.assertEqual(emitted.payload["task_id"], "task-event-dag")
        self.assertEqual(emitted.payload["queue_id"], "agent-q")
        self.assertEqual(emitted.payload["worker_id"], "worker-1")
        self.assertEqual([event.event_id for event in scheduler.events], [child.event_id])


if __name__ == "__main__":
    unittest.main()
