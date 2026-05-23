import sys
import unittest
from dataclasses import replace
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.compute import (  # noqa: E402
    ComputeTaskState,
    ComputeTaskStatus,
    HardwareBackend,
    InferenceOutput,
    InferenceRequest,
    InferenceResult,
    LoadedModel,
    ModelComputeOperation,
    ModelFormat,
    ModelInput,
    ModelLoadMode,
    ModelLoadRequest,
    ModelLoadResult,
    ModelRef,
    ModelRuntimeState,
    ModelTaskKind,
    PrecisionMode,
    token_usage,
)
from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    IdentityRef,
    ResourceKind,
    ResourceRef,
    StorageRef,
    utc_now,
)
from hallucinate_app.virtual_os.knowledge import (  # noqa: E402
    AuditPhase,
    DatasetLoadMode,
    DatasetLoadRequest,
    DatasetLoadResult,
    DatasetRef,
    GraphRAGQuery,
    GraphRAGQueryMode,
    GraphRAGResult,
    KnowledgeAuditContext,
    KnowledgeGraphEntity,
    KnowledgeGraphRelationship,
    KnowledgeOperation,
    KnowledgeSearchHit,
    ProvenanceRecord as KnowledgeProvenanceRecord,
    ProvenanceRecordKind as KnowledgeProvenanceRecordKind,
    knowledge_audit_event,
)
from hallucinate_app.virtual_os.processes import (  # noqa: E402
    AgentProcessKind,
    AgentProcessSpec,
    AgentTaskKind,
    AgentTaskQueueState,
    AgentTaskQueueStatus,
    AgentTaskRequest,
    AgentTaskState,
    SchedulerEventType,
    SchedulerQueueDiscipline,
    TaskSubmissionResult,
    WorkflowDAG,
    WorkflowEdge,
    WorkflowNode,
    WorkflowState,
    WorkflowStatus,
    WorkflowSubmissionResult,
    scheduler_event,
)
from hallucinate_app.virtual_os.provenance import (  # noqa: E402
    ModelOutputRecord,
    PromptRecord,
    ProvenanceLedger,
    ProvenanceLedgerRecord,
    ProvenanceQuery,
    ProvenanceRecordKind as LedgerProvenanceRecordKind,
)


TRACE_ID = "trace-os-026-graphrag-agent-workflow"


def unique_event_ids(*groups):
    event_ids = []
    for group in groups:
        for event_id in group:
            if event_id and event_id not in event_ids:
                event_ids.append(event_id)
    return tuple(event_ids)


def graph_context_resource(result):
    context = result.metadata["graph_context"]
    return ResourceRef(
        uri=f"knowledge://graph/{context['graph_id']}/context/{context['context_id']}",
        kind="knowledge_context",
        component="ipfs_datasets_py",
        name=context["context_id"],
        metadata={
            "graph_id": context["graph_id"],
            "hit_ids": tuple(context["hit_ids"]),
            "entity_ids": tuple(context["entity_ids"]),
            "relationship_ids": tuple(context["relationship_ids"]),
        },
    )


def build_answer_prompt(question, result):
    entity_lines = [
        f"- entity:{hit.entity.entity_id} label:{hit.entity.label} score:{hit.score}"
        for hit in result.hits
        if hit.entity is not None
    ]
    relationship_lines = [
        (
            f"- relationship:{relationship.relationship_id} "
            f"{relationship.source_entity_id}->{relationship.target_entity_id} "
            f"type:{relationship.relationship_type}"
        )
        for relationship in result.relationships
    ]
    return "\n".join(
        (
            f"Question: {question}",
            "Graph context:",
            *entity_lines,
            *relationship_lines,
            "Return an answer grounded only in this graph context.",
        )
    )


class MockKnowledgeFabric:
    def __init__(self):
        self.entities = {
            "os026-graph": (
                KnowledgeGraphEntity(
                    entity_id="graphrag",
                    entity_type="workflow_capability",
                    label="GraphRAG",
                    graph_id="os026-graph",
                    properties={"purpose": "retrieve graph context for questions"},
                ),
                KnowledgeGraphEntity(
                    entity_id="vector-search",
                    entity_type="retrieval_method",
                    label="Vector Search",
                    graph_id="os026-graph",
                    properties={"purpose": "rank semantically similar evidence"},
                ),
                KnowledgeGraphEntity(
                    entity_id="provenance-ledger",
                    entity_type="audit_store",
                    label="Provenance Ledger",
                    graph_id="os026-graph",
                    properties={"purpose": "store answer lineage and event receipts"},
                ),
            )
        }
        self.relationships = {
            "os026-graph": (
                KnowledgeGraphRelationship(
                    relationship_id="graphrag-uses-vector-search",
                    source_entity_id="graphrag",
                    target_entity_id="vector-search",
                    relationship_type="USES",
                    graph_id="os026-graph",
                    properties={"confidence": 0.93},
                ),
                KnowledgeGraphRelationship(
                    relationship_id="graphrag-records-provenance",
                    source_entity_id="graphrag",
                    target_entity_id="provenance-ledger",
                    relationship_type="RECORDS_PROVENANCE_IN",
                    graph_id="os026-graph",
                    properties={"confidence": 0.91},
                ),
            )
        }

    async def load_dataset(self, request):
        source = request.source if isinstance(request.source, StorageRef) else StorageRef(uri=str(request.source))
        dataset = DatasetRef(
            dataset_id=request.dataset_id or "os026-knowledge",
            uri=f"dataset://{request.dataset_id or 'os026-knowledge'}",
            name=request.name or "OS-026 Knowledge Dataset",
            cid=source.cid,
            split=request.split,
            format=request.options.get("format"),
            row_count=request.options.get("row_count", 3),
            storage_refs=(source,),
            metadata={
                "graph_id": request.options.get("graph_id"),
                "source_path": source.path,
                "trace_id": request.audit.get("trace_id"),
            },
        )
        source_resource = ResourceRef(
            uri=source.uri,
            kind=ResourceKind.STORAGE,
            component="ipfs_kit_py",
            metadata={"cid": source.cid, "path": source.path},
        )
        provenance = KnowledgeProvenanceRecord(
            record_id=f"knowledge-load-{dataset.dataset_id}",
            kind=KnowledgeProvenanceRecordKind.DATASET_LOAD,
            operation=KnowledgeOperation.LOAD_DATASET,
            actor=request.actor,
            subject=dataset.resource(),
            inputs=(source_resource,),
            outputs=(dataset.resource(),),
            parameters=dict(request.options),
            cid=source.cid,
            metadata={"trace_id": request.audit.get("trace_id")},
        )
        result = DatasetLoadResult(
            dataset=dataset,
            ok=True,
            message="GraphRAG dataset metadata registered",
            graph_id=request.options.get("graph_id"),
            vector_index_ids=tuple(request.options.get("vector_index_ids", ())),
            provenance=(provenance,),
            metadata={"backend": "mock-ipfs-datasets", "mode": request.mode},
        )
        audit_event = knowledge_audit_event(
            KnowledgeAuditContext(
                phase=AuditPhase.AFTER,
                operation=KnowledgeOperation.LOAD_DATASET,
                actor=request.actor,
                subject=dataset.resource(),
                result=result,
                trace_id=request.audit.get("trace_id"),
                metadata={"graph_id": result.graph_id, "adapter": "mock-ipfs-datasets"},
            ),
            source="mock-ipfs-datasets",
            payload={"dataset_id": dataset.dataset_id, "graph_id": result.graph_id, "ok": True},
        )
        return replace(result, audit_events=(audit_event,))

    async def query_graphrag(self, query):
        graph_id = query.graph_id or query.dataset.metadata["graph_id"]
        entities = self.entities[graph_id][: query.top_k]
        relationships = self.relationships[graph_id]
        context_id = "os026-context-graph-answer"
        hits = tuple(
            KnowledgeSearchHit(
                hit_id=f"os026-hit-{entity.entity_id}",
                score=round(0.97 - index * 0.04, 2),
                text=entity.label,
                ref=entity.resource(),
                entity=entity,
                rank=index + 1,
                provenance_ids=(f"knowledge-query-{context_id}",),
                metadata={"graph_id": graph_id, "context_id": context_id},
            )
            for index, entity in enumerate(entities)
        )
        provenance = KnowledgeProvenanceRecord(
            record_id=f"knowledge-query-{context_id}",
            kind=KnowledgeProvenanceRecordKind.QUERY,
            operation=KnowledgeOperation.QUERY_GRAPHRAG,
            actor=query.actor,
            subject=query.dataset.resource(),
            inputs=(query.dataset.resource(),),
            outputs=tuple(hit.ref for hit in hits if hit.ref is not None),
            parameters={
                "query": query.query,
                "mode": query.mode.value if isinstance(query.mode, GraphRAGQueryMode) else query.mode,
                "top_k": query.top_k,
            },
            cid="bafy-os026-graph-context",
            metadata={"trace_id": query.trace_id, "graph_id": graph_id, "context_id": context_id},
        )
        result = GraphRAGResult(
            query=query,
            ok=True,
            answer=(
                "GraphRAG retrieves graph context, combines it with vector-ranked evidence, "
                "and keeps answer provenance in a ledger."
            ),
            hits=hits,
            entities=entities if query.include_entities else (),
            relationships=relationships if query.include_relationships else (),
            provenance=(provenance,) if query.include_provenance else (),
            stats={"top_k": query.top_k, "hit_count": len(hits), "relationship_count": len(relationships)},
            metadata={
                "backend": "mock-ipfs-datasets",
                "graph_context": {
                    "context_id": context_id,
                    "graph_id": graph_id,
                    "hit_ids": tuple(hit.hit_id for hit in hits),
                    "entity_ids": tuple(entity.entity_id for entity in entities),
                    "relationship_ids": tuple(relationship.relationship_id for relationship in relationships),
                    "provenance_ids": (provenance.record_id,),
                },
            },
        )
        audit_event = knowledge_audit_event(
            KnowledgeAuditContext(
                phase=AuditPhase.AFTER,
                operation=KnowledgeOperation.QUERY_GRAPHRAG,
                actor=query.actor,
                subject=query.dataset.resource(),
                result=result,
                trace_id=query.trace_id,
                metadata={"graph_id": graph_id, "context_id": context_id},
            ),
            source="mock-ipfs-datasets",
            payload={
                "graph_id": graph_id,
                "context_id": context_id,
                "hit_count": len(hits),
                "relationship_count": len(relationships),
                "provenance_ids": (provenance.record_id,),
                "ok": True,
            },
        )
        return replace(result, audit_events=(audit_event,))


class MockModelToolchainRuntime:
    async def load_model(self, request):
        model = request.model if isinstance(request.model, ModelRef) else ModelRef(model_id=str(request.model))
        loaded = LoadedModel(
            handle_id=f"handle-{model.model_id}",
            model=model,
            state=ModelRuntimeState.READY,
            backend=request.target_backend,
            precision=request.precision,
            worker_id=request.options.get("worker_id"),
            metadata={
                "load_mode": request.mode.value if isinstance(request.mode, ModelLoadMode) else request.mode,
                "trace_id": request.trace_id,
            },
        )
        return ModelLoadResult(
            request=request,
            model=loaded,
            ok=True,
            metadata={"backend": "mock-ipfs-accelerate"},
        )

    async def run_inference(self, request):
        model = request.model.model if isinstance(request.model, LoadedModel) else request.model
        if not isinstance(model, ModelRef):
            model = ModelRef(model_id=str(model))
        graph_context = request.options["graph_context"]
        prompt = " ".join(item.text or "" for item in request.inputs)
        labels = tuple(graph_context["entity_labels"])
        relationship_ids = tuple(graph_context["relationship_ids"])
        knowledge_provenance_ids = tuple(graph_context["provenance_ids"])
        scheduler_task_id = request.options["scheduler_task_id"]
        answer = (
            f"{labels[0]} should retrieve context from {labels[1]} and store answer lineage in "
            f"{labels[2]}; scheduler task {scheduler_task_id} produced this grounded response."
        )
        usage = token_usage(
            max(1, len(prompt.split())) + len(answer.split()),
            task_id=scheduler_task_id,
            model=model,
            metadata={"phase": "graphrag-answer"},
        )
        output = InferenceOutput(
            output_id=f"{scheduler_task_id}-answer",
            text=answer,
            input_id=request.inputs[0].input_id if request.inputs else None,
            finish_reason="stop",
            resource_usage=(usage,),
            metadata={
                "graph_id": graph_context["graph_id"],
                "context_id": graph_context["context_id"],
                "entity_ids": tuple(graph_context["entity_ids"]),
                "relationship_ids": relationship_ids,
                "knowledge_provenance_ids": knowledge_provenance_ids,
                "scheduler_task_id": scheduler_task_id,
                "parameters": dict(request.parameters),
            },
        )
        status = ComputeTaskStatus(
            task_id=scheduler_task_id,
            operation=ModelComputeOperation.INFERENCE,
            state=ComputeTaskState.COMPLETED,
            model=model,
            actor=request.actor,
            queue_id=request.queue_id,
            progress=1.0,
            resource_usage=(usage,),
            result_ref=ResourceRef(
                uri=f"model-output://{output.output_id}",
                kind=ResourceKind.MODEL,
                component="ipfs_accelerate_py",
                metadata={"graph_id": graph_context["graph_id"]},
            ),
            metadata={"trace_id": request.trace_id, "context_id": graph_context["context_id"]},
        )
        event = scheduler_event(
            "virtual_os.compute.inference.completed",
            source="ipfs_accelerate_py",
            actor=request.actor,
            subject=status.resource(),
            task_id=scheduler_task_id,
            queue_id=request.queue_id,
            trace_id=request.trace_id,
            parent_event_ids=request.options.get("parent_event_ids", ()),
            payload={
                "output_id": output.output_id,
                "graph_id": graph_context["graph_id"],
                "knowledge_provenance_ids": knowledge_provenance_ids,
                "ok": True,
            },
            metadata={"operation": ModelComputeOperation.INFERENCE.value},
        )
        return InferenceResult(
            request=request,
            ok=True,
            outputs=(output,),
            task_id=scheduler_task_id,
            task_status=status,
            resource_usage=(usage,),
            events=(event,),
            stats={"input_count": len(request.inputs), "graph_hit_count": len(graph_context["hit_ids"])},
            metadata={"backend": "mock-ipfs-accelerate", "scheduled": True},
        )


class MockAgentWorkflowScheduler:
    def __init__(self):
        self.workflows = {}
        self.workflow_statuses = {}
        self.task_requests = {}
        self.tasks = {}
        self.events = []
        self.sequence = 0

    def _correlation_id(self):
        self.sequence += 1
        return f"correlation-os026-{self.sequence}"

    def _emit(
        self,
        event_type,
        *,
        actor,
        workflow_id=None,
        task_id=None,
        queue_id=None,
        subject=None,
        parent_event_ids=(),
        payload=None,
        trace_id=TRACE_ID,
    ):
        event = scheduler_event(
            event_type,
            actor=actor,
            subject=subject,
            workflow_id=workflow_id,
            task_id=task_id,
            queue_id=queue_id,
            trace_id=trace_id,
            correlation_id=self._correlation_id(),
            parent_event_ids=parent_event_ids,
            payload=payload or {},
        )
        self.events.append(event)
        return event

    def submit_workflow(self, workflow):
        workflow.validate()
        event = self._emit(
            SchedulerEventType.WORKFLOW_SUBMITTED,
            actor=workflow.actor,
            workflow_id=workflow.workflow_id,
            parent_event_ids=workflow.parent_event_ids,
            payload={"node_count": len(workflow.nodes), "task_order": workflow.task_order()},
            trace_id=workflow.trace_id,
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

    def submit_task(self, request):
        event = self._emit(
            SchedulerEventType.TASK_ENQUEUED,
            actor=request.actor,
            task_id=request.task_id,
            queue_id=request.queue_id,
            parent_event_ids=request.parent_event_ids,
            payload={
                "effective_priority": request.effective_priority,
                "task_kind": request.kind.value if isinstance(request.kind, AgentTaskKind) else request.kind,
            },
            trace_id=request.trace_id,
        )
        status = replace(
            request.initial_status(AgentTaskState.QUEUED),
            queued_at=utc_now(),
            emitted_event_ids=(event.event_id,),
        )
        self.task_requests[request.task_id] = request
        self.tasks[request.task_id] = status
        return TaskSubmissionResult(task=status, ok=True, queue_id=request.queue_id, events=(event,))

    def start_task(self, task_id, *, worker_id, actor):
        current = self.tasks[task_id]
        event = self._emit(
            SchedulerEventType.TASK_STARTED,
            actor=actor,
            task_id=task_id,
            queue_id=current.queue_id,
            parent_event_ids=unique_event_ids(current.parent_event_ids, current.emitted_event_ids),
            payload={"worker_id": worker_id},
            trace_id=current.metadata.get("trace_id") or TRACE_ID,
        )
        started = replace(
            current,
            state=AgentTaskState.RUNNING,
            worker_id=worker_id,
            started_at=utc_now(),
            emitted_event_ids=(*current.emitted_event_ids, event.event_id),
        )
        self.tasks[task_id] = started
        return started

    def complete_task(self, task_id, *, result_ref=None, actor=None, parent_event_ids=()):
        current = self.tasks[task_id]
        event = self._emit(
            SchedulerEventType.TASK_COMPLETED,
            actor=actor or current.actor,
            task_id=task_id,
            queue_id=current.queue_id,
            parent_event_ids=unique_event_ids(current.emitted_event_ids, parent_event_ids),
            payload={"result_ref": result_ref.uri if result_ref else None},
            trace_id=current.metadata.get("trace_id") or TRACE_ID,
        )
        completed = replace(
            current,
            state=AgentTaskState.COMPLETED,
            completed_at=utc_now(),
            result_ref=result_ref,
            emitted_event_ids=(*current.emitted_event_ids, event.event_id),
        )
        self.tasks[task_id] = completed
        return completed

    def complete_workflow(self, workflow_id, *, actor, completed_node_ids, parent_event_ids=()):
        current = self.workflow_statuses[workflow_id]
        event = self._emit(
            SchedulerEventType.WORKFLOW_COMPLETED,
            actor=actor,
            workflow_id=workflow_id,
            parent_event_ids=parent_event_ids,
            payload={"completed_node_ids": tuple(completed_node_ids)},
            trace_id=TRACE_ID,
        )
        updated = replace(
            current,
            state=WorkflowState.COMPLETED,
            current_node_ids=(),
            completed_node_ids=tuple(completed_node_ids),
            completed_at=utc_now(),
            task_statuses=tuple(self.tasks.values()),
            emitted_event_ids=(*current.emitted_event_ids, event.event_id),
        )
        self.workflow_statuses[workflow_id] = updated
        return updated

    def queue_state(self, queue_id=None):
        tasks = tuple(
            task
            for task in self.tasks.values()
            if queue_id is None or task.queue_id == queue_id
        )
        state_values = [
            task.state.value if isinstance(task.state, AgentTaskState) else task.state
            for task in tasks
        ]
        active_states = {
            AgentTaskState.PENDING.value,
            AgentTaskState.READY.value,
            AgentTaskState.QUEUED.value,
            AgentTaskState.RUNNING.value,
        }
        return AgentTaskQueueState(
            queue_id=queue_id or "all",
            status=AgentTaskQueueStatus.ACTIVE,
            discipline=SchedulerQueueDiscipline.RISK_ADJUSTED_PRIORITY,
            depth=sum(state in active_states for state in state_values),
            ready=state_values.count(AgentTaskState.READY.value),
            pending=state_values.count(AgentTaskState.PENDING.value) + state_values.count(AgentTaskState.QUEUED.value),
            running=state_values.count(AgentTaskState.RUNNING.value),
            completed=state_values.count(AgentTaskState.COMPLETED.value),
            failed=state_values.count(AgentTaskState.FAILED.value),
            cancelled=state_values.count(AgentTaskState.CANCELLED.value),
            workers=1,
            tasks=tasks,
        )

    def ordering_errors(self, *, known_external_event_ids=()):
        observed = set()
        known_external = set(known_external_event_ids)
        errors = []
        for event in self.events:
            if event.event_id in observed:
                errors.append(f"duplicate scheduler event: {event.event_id}")
            for parent_id in event.parent_event_ids:
                if parent_id == event.event_id:
                    errors.append(f"event cannot parent itself: {event.event_id}")
                if parent_id not in observed and parent_id not in known_external:
                    errors.append(f"parent must appear before child: {parent_id} -> {event.event_id}")
            observed.add(event.event_id)
        return errors


class TestVirtualOSGraphRAGAgentWorkflow(unittest.IsolatedAsyncioTestCase):
    async def test_graphrag_context_scheduled_model_answer_and_provenance(self):
        actor = IdentityRef(did="did:example:os-026-agent", roles=("agent", "tester"))
        workflow_id = "os-026-graphrag-agent-workflow"
        queue_id = "agent-model-toolchain"
        question = "How should a GraphRAG agent ground model answers?"

        knowledge = MockKnowledgeFabric()
        dataset_result = await knowledge.load_dataset(
            DatasetLoadRequest(
                source=StorageRef(
                    uri="ipfs://bafy-os026-knowledge",
                    cid="bafy-os026-knowledge",
                    path="/datasets/os026/knowledge.jsonl",
                    media_type="application/jsonl",
                ),
                actor=actor,
                dataset_id="os026-knowledge",
                name="OS-026 GraphRAG Knowledge",
                split="test",
                mode=DatasetLoadMode.METADATA_ONLY,
                options={
                    "format": "jsonl",
                    "row_count": 3,
                    "graph_id": "os026-graph",
                    "vector_index_ids": ("os026-vectors",),
                },
                audit={"trace_id": TRACE_ID},
            )
        )
        self.assertTrue(dataset_result.ok)
        self.assertEqual(dataset_result.graph_id, "os026-graph")
        self.assertEqual(dataset_result.provenance[0].kind, KnowledgeProvenanceRecordKind.DATASET_LOAD)

        query_task_base = AgentTaskRequest(
            task_id="task-os026-query-graphrag",
            kind=AgentTaskKind.KNOWLEDGE_QUERY,
            actor=actor,
            queue_id=queue_id,
            workflow_id=workflow_id,
            workflow_node_id="graph-context",
            priority=6,
            risk_score=0.5,
            payload={"operation": KnowledgeOperation.QUERY_GRAPHRAG.value, "question": question},
            trace_id=TRACE_ID,
            metadata={"trace_id": TRACE_ID, "graph_id": "os026-graph"},
        )
        model_task_base = AgentTaskRequest(
            task_id="task-os026-model-inference",
            kind=AgentTaskKind.MODEL_INFERENCE,
            actor=actor,
            queue_id=queue_id,
            workflow_id=workflow_id,
            workflow_node_id="model-inference",
            priority=8,
            risk_score=1.5,
            depends_on=(query_task_base.task_id,),
            payload={"operation": ModelComputeOperation.INFERENCE.value},
            trace_id=TRACE_ID,
            metadata={"trace_id": TRACE_ID},
        )
        provenance_task_base = AgentTaskRequest(
            task_id="task-os026-store-provenance",
            kind=AgentTaskKind.WORKFLOW_STEP,
            actor=actor,
            queue_id=queue_id,
            workflow_id=workflow_id,
            workflow_node_id="answer-provenance",
            priority=5,
            risk_score=0.25,
            depends_on=(model_task_base.task_id,),
            payload={"operation": "store_answer_provenance"},
            trace_id=TRACE_ID,
            metadata={"trace_id": TRACE_ID},
        )
        workflow = WorkflowDAG(
            workflow_id=workflow_id,
            actor=actor,
            trace_id=TRACE_ID,
            nodes=(
                WorkflowNode(node_id="graph-context", task=query_task_base),
                WorkflowNode(node_id="model-inference", task=model_task_base),
                WorkflowNode(node_id="answer-provenance", task=provenance_task_base),
            ),
            edges=(
                WorkflowEdge(source_node_id="graph-context", target_node_id="model-inference"),
                WorkflowEdge(source_node_id="model-inference", target_node_id="answer-provenance"),
            ),
        )
        self.assertEqual(workflow.task_order(), (
            query_task_base.task_id,
            model_task_base.task_id,
            provenance_task_base.task_id,
        ))
        self.assertEqual(workflow.ready_node_ids(), ("graph-context",))

        scheduler = MockAgentWorkflowScheduler()
        submission = scheduler.submit_workflow(workflow)
        self.assertTrue(submission.ok)
        workflow_submitted_event = submission.events[0]

        query_task = replace(query_task_base, parent_event_ids=submission.workflow.emitted_event_ids)
        scheduler.submit_task(query_task)
        scheduler.start_task(query_task.task_id, worker_id="worker-graphrag", actor=actor)
        query_started_event = scheduler.events[-1]
        graph_result = await knowledge.query_graphrag(
            GraphRAGQuery(
                query=question,
                actor=actor,
                dataset=dataset_result.dataset,
                graph_id=dataset_result.graph_id,
                mode=GraphRAGQueryMode.HYBRID,
                top_k=3,
                trace_id=TRACE_ID,
                parameters={"source": "agent-workflow"},
            )
        )
        context_ref = graph_context_resource(graph_result)
        scheduler.complete_task(
            query_task.task_id,
            result_ref=context_ref,
            actor=actor,
            parent_event_ids=(graph_result.audit_events[0].event_id,),
        )
        query_completed_event = scheduler.events[-1]

        self.assertTrue(graph_result.ok)
        self.assertIsInstance(graph_result, GraphRAGResult)
        self.assertEqual(graph_result.metadata["graph_context"]["entity_ids"], (
            "graphrag",
            "vector-search",
            "provenance-ledger",
        ))
        self.assertEqual(graph_result.relationships[0].relationship_id, "graphrag-uses-vector-search")
        self.assertEqual(graph_result.provenance[0].kind, KnowledgeProvenanceRecordKind.QUERY)
        self.assertEqual(graph_result.audit_events[0].event_type, "knowledge.query_graphrag.after")
        self.assertEqual(workflow.ready_node_ids(completed_node_ids=("graph-context",)), ("model-inference",))

        model_runtime = MockModelToolchainRuntime()
        model = ModelRef(
            model_id="mock-os026-agent-llm",
            revision="main",
            provider="ipfs_accelerate_py",
            format=ModelFormat.HUGGINGFACE,
            task=ModelTaskKind.TEXT_GENERATION,
        )
        model_result = await model_runtime.load_model(
            ModelLoadRequest(
                model=model,
                actor=actor,
                mode=ModelLoadMode.WARM,
                task=ModelTaskKind.TEXT_GENERATION,
                target_backend=HardwareBackend.CPU,
                precision=PrecisionMode.FP32,
                queue_id=queue_id,
                trace_id=TRACE_ID,
                options={"worker_id": "worker-model"},
            )
        )
        self.assertTrue(model_result.ok)
        self.assertEqual(model_result.model.state, ModelRuntimeState.READY)

        graph_context = graph_result.metadata["graph_context"]
        inference_context = {
            **graph_context,
            "entity_labels": tuple(entity.label for entity in graph_result.entities),
        }
        prompt_text = build_answer_prompt(question, graph_result)
        self.assertIn("entity:graphrag", prompt_text)
        self.assertIn("relationship:graphrag-records-provenance", prompt_text)

        model_task = replace(
            model_task_base,
            payload={
                "operation": ModelComputeOperation.INFERENCE.value,
                "graph_context_id": graph_context["context_id"],
                "model_id": model.model_id,
            },
            parent_event_ids=(query_completed_event.event_id, graph_result.audit_events[0].event_id),
        )
        model_submission = scheduler.submit_task(model_task)
        scheduler.start_task(model_task.task_id, worker_id="worker-model", actor=actor)
        model_started_event = scheduler.events[-1]

        inference_result = await model_runtime.run_inference(
            InferenceRequest(
                model=model_result.model,
                actor=actor,
                inputs=(
                    ModelInput(
                        input_id="question",
                        text=prompt_text,
                        metadata={"context_id": graph_context["context_id"]},
                    ),
                ),
                task=ModelTaskKind.TEXT_GENERATION,
                parameters={"temperature": 0.0, "max_new_tokens": 96},
                target_backend=HardwareBackend.CPU,
                queue_id=queue_id,
                trace_id=TRACE_ID,
                options={
                    "scheduler_task_id": model_task.task_id,
                    "graph_context": inference_context,
                    "parent_event_ids": (
                        model_started_event.event_id,
                        graph_result.audit_events[0].event_id,
                    ),
                },
            )
        )
        scheduler.complete_task(
            model_task.task_id,
            result_ref=inference_result.task_status.result_ref,
            actor=actor,
            parent_event_ids=(inference_result.events[0].event_id,),
        )
        model_completed_event = scheduler.events[-1]

        self.assertTrue(model_submission.ok)
        self.assertTrue(inference_result.ok)
        self.assertEqual(inference_result.task_id, model_task.task_id)
        self.assertEqual(inference_result.task_status.operation, ModelComputeOperation.INFERENCE)
        self.assertEqual(inference_result.task_status.state, ComputeTaskState.COMPLETED)
        self.assertIn("GraphRAG should retrieve context", inference_result.outputs[0].text)
        self.assertEqual(
            inference_result.outputs[0].metadata["knowledge_provenance_ids"],
            (graph_result.provenance[0].record_id,),
        )
        self.assertIn(model_started_event.event_id, inference_result.events[0].parent_event_ids)
        self.assertEqual(
            workflow.ready_node_ids(completed_node_ids=("graph-context", "model-inference")),
            ("answer-provenance",),
        )

        provenance_task = replace(
            provenance_task_base,
            payload={
                "operation": "store_answer_provenance",
                "output_id": inference_result.outputs[0].output_id,
                "model_task_id": inference_result.task_id,
            },
            parent_event_ids=(model_completed_event.event_id, inference_result.events[0].event_id),
        )
        scheduler.submit_task(provenance_task)
        scheduler.start_task(provenance_task.task_id, worker_id="worker-provenance", actor=actor)

        answer_subject = ResourceRef(
            uri=f"answer://{inference_result.outputs[0].output_id}",
            kind=ResourceKind.MODEL,
            component="virtual_os.workflow_test",
            name=inference_result.outputs[0].output_id,
            metadata={"graph_id": graph_context["graph_id"], "context_id": graph_context["context_id"]},
        )
        process = AgentProcessSpec(
            process_id="os-026-agent-workflow",
            component="virtual_os.workflow_test",
            entrypoint="test_virtual_os_graphrag_agent_workflow",
            identity=actor,
            kind=AgentProcessKind.WORKFLOW,
            workflow_id=workflow_id,
            queue_id=queue_id,
            metadata={"trace_id": TRACE_ID},
        )
        ledger_record = ProvenanceLedgerRecord(
            kind=LedgerProvenanceRecordKind.GRAPHRAG_QUERY,
            operation="graphrag.agent.model.workflow",
            dataset=dataset_result.dataset,
            model=model_result.model,
            prompt=PromptRecord(
                prompt_id="os-026-graphrag-prompt",
                text=prompt_text,
                input_refs=(dataset_result.dataset.resource(), context_ref),
                metadata={
                    "graph_id": graph_context["graph_id"],
                    "context_id": graph_context["context_id"],
                    "hit_ids": graph_context["hit_ids"],
                },
            ),
            output=ModelOutputRecord(
                output_id=inference_result.outputs[0].output_id,
                text=inference_result.outputs[0].text,
                artifact=answer_subject,
                media_type="text/plain",
                finish_reason=inference_result.outputs[0].finish_reason,
                metadata={
                    "scheduler_task_id": inference_result.task_id,
                    "knowledge_provenance_ids": inference_result.outputs[0].metadata["knowledge_provenance_ids"],
                    "relationship_ids": inference_result.outputs[0].metadata["relationship_ids"],
                },
            ),
            agent_process=process,
            events=(
                workflow_submitted_event,
                query_started_event,
                graph_result.audit_events[0],
                query_completed_event,
                model_started_event,
                inference_result.events[0],
                model_completed_event,
            ),
            actor=actor,
            subject=answer_subject,
            trace_id=TRACE_ID,
            metadata={
                "dataset_load_provenance_id": dataset_result.provenance[0].record_id,
                "graph_query_provenance_id": graph_result.provenance[0].record_id,
                "context_id": graph_context["context_id"],
                "model_task_id": inference_result.task_id,
            },
        )
        ledger = ProvenanceLedger()
        receipt = ledger.record(ledger_record)
        provenance_event = ledger_record.to_event()
        self.assertTrue(receipt.ok)
        self.assertEqual(receipt.cid, ledger_record.record_cid)

        scheduler.complete_task(
            provenance_task.task_id,
            result_ref=answer_subject,
            actor=actor,
            parent_event_ids=(provenance_event.event_id,),
        )
        provenance_completed_event = scheduler.events[-1]
        workflow_status = scheduler.complete_workflow(
            workflow_id,
            actor=actor,
            completed_node_ids=("graph-context", "model-inference", "answer-provenance"),
            parent_event_ids=(provenance_completed_event.event_id, provenance_event.event_id),
        )
        workflow_completed_event = scheduler.events[-1]

        self.assertEqual(workflow_status.state, WorkflowState.COMPLETED)
        self.assertEqual(workflow.ready_node_ids(completed_node_ids=workflow_status.completed_node_ids), ())
        self.assertEqual(scheduler.queue_state(queue_id).completed, 3)
        self.assertEqual(scheduler.queue_state(queue_id).depth, 0)

        self.assertEqual(ledger.query(ProvenanceQuery(dataset_id="os026-knowledge")), (ledger_record,))
        self.assertEqual(ledger.query(model_id=model.model_id), (ledger_record,))
        self.assertEqual(ledger.query(event_id=inference_result.events[0].event_id), (ledger_record,))
        self.assertEqual(provenance_event.event_type, "virtual_os.provenance.recorded")
        self.assertEqual(provenance_event.trace_id, TRACE_ID)
        self.assertIn(model_completed_event.event_id, provenance_event.parent_event_ids)
        self.assertEqual(
            provenance_event.payload["output"]["metadata"]["knowledge_provenance_ids"],
            [graph_result.provenance[0].record_id],
        )
        self.assertEqual(
            provenance_event.payload["metadata"]["graph_query_provenance_id"],
            graph_result.provenance[0].record_id,
        )

        event_types = [event.event_type for event in scheduler.events]
        self.assertEqual(
            event_types,
            [
                SchedulerEventType.WORKFLOW_SUBMITTED.value,
                SchedulerEventType.TASK_ENQUEUED.value,
                SchedulerEventType.TASK_STARTED.value,
                SchedulerEventType.TASK_COMPLETED.value,
                SchedulerEventType.TASK_ENQUEUED.value,
                SchedulerEventType.TASK_STARTED.value,
                SchedulerEventType.TASK_COMPLETED.value,
                SchedulerEventType.TASK_ENQUEUED.value,
                SchedulerEventType.TASK_STARTED.value,
                SchedulerEventType.TASK_COMPLETED.value,
                SchedulerEventType.WORKFLOW_COMPLETED.value,
            ],
        )
        model_enqueued_event = scheduler.events[4]
        self.assertIn(query_completed_event.event_id, model_enqueued_event.parent_event_ids)
        self.assertIn(graph_result.audit_events[0].event_id, model_enqueued_event.parent_event_ids)
        self.assertIn(model_enqueued_event.event_id, model_started_event.parent_event_ids)
        self.assertIn(inference_result.events[0].event_id, model_completed_event.parent_event_ids)
        self.assertIn(provenance_completed_event.event_id, workflow_completed_event.parent_event_ids)
        self.assertEqual(
            scheduler.ordering_errors(
                known_external_event_ids=(
                    graph_result.audit_events[0].event_id,
                    inference_result.events[0].event_id,
                    provenance_event.event_id,
                )
            ),
            [],
        )


if __name__ == "__main__":
    unittest.main()
