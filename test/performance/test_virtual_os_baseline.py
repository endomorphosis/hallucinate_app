import argparse
import asyncio
import json
import math
import statistics
import sys
import time
import unittest
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Callable, Awaitable


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
    EventEnvelope,
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
    KnowledgeAuditContext,
    KnowledgeOperation,
    ProvenanceRecord as KnowledgeProvenanceRecord,
    ProvenanceRecordKind as KnowledgeProvenanceRecordKind,
    knowledge_audit_event,
)
from hallucinate_app.virtual_os.processes import (  # noqa: E402
    AgentTaskKind,
    AgentTaskQueueState,
    AgentTaskQueueStatus,
    AgentTaskRequest,
    AgentTaskState,
    SchedulerEventType,
    SchedulerQueueDiscipline,
    TaskDelegationProtocol,
    TaskDelegationTarget,
    TaskSubmissionResult,
    scheduler_event,
)
from hallucinate_app.virtual_os.vfs import (  # noqa: E402
    IPFSKitVFSAdapter,
    VFSAddRequest,
    VFSCatRequest,
    VFSStatRequest,
    ref_from_path,
)


TRACE_ID = "trace-os-038-performance-baseline"
DEFAULT_ITERATIONS = 5
DEFAULT_WARMUPS = 1
SMOKE_THRESHOLDS_MS = {
    "storage_latency": 500.0,
    "dataset_latency": 500.0,
    "inference_latency": 500.0,
    "mcp_plus_plus_scheduling_latency": 500.0,
}


class BaselineIPFSAPI:
    def __init__(self):
        self.sequence = 0
        self.objects: dict[str, bytes] = {}

    async def add(self, payload, *, pin=True, **_options):
        self.sequence += 1
        cid = f"bafybaseline{self.sequence:04d}"
        self.objects[cid] = bytes(payload)
        return {"Hash": cid, "size": len(payload), "pin": bool(pin)}

    async def cat(self, cid, **_options):
        return self.objects.get(cid)


class BaselineVFSManager:
    def __init__(self):
        self.content_by_path: dict[str, dict[str, Any]] = {}

    async def execute_vfs_operation(self, operation, **kwargs):
        path = kwargs.get("path")
        if operation == "write":
            self.content_by_path[path] = {
                "content": kwargs["content"],
                "mime_type": kwargs.get("mime_type"),
                "metadata": dict(kwargs.get("metadata", {})),
            }
            return {"success": True}
        if operation == "cat":
            stored = self.content_by_path.get(path)
            return None if stored is None else {"content": stored["content"]}
        if operation == "stat":
            stored = self.content_by_path.get(path)
            if stored is None:
                return None
            return {
                "path": path,
                "size": len(stored["content"]),
                "mime_type": stored["mime_type"],
                "metadata": dict(stored["metadata"]),
            }
        return {"success": False, "error": f"unexpected VFS operation: {operation}"}


class BaselineMetadataIndex:
    def __init__(self):
        self.records: list[dict[str, Any]] = []

    async def add(self, record):
        self.records.append(dict(record))
        return {"success": True}

    async def save(self):
        return None

    async def get_by_cid(self, cid):
        return self._find("cid", cid)

    async def lookup_by_path(self, path):
        return self._find("path", path)

    async def query(self, filters=None, limit=1):
        results = self.records
        for field_name, operator, expected in filters or ():
            if operator == "==":
                results = [record for record in results if record.get(field_name) == expected]
        return {"results": results[:limit]}

    def _find(self, key, value):
        for record in reversed(self.records):
            if record.get(key) == value:
                return dict(record)
        return None


class BaselineKnowledgeFabric:
    async def load_dataset(self, request):
        source = request.source if isinstance(request.source, StorageRef) else StorageRef(uri=str(request.source))
        dataset_id = request.dataset_id or "os038-baseline-dataset"
        dataset = DatasetRef(
            dataset_id=dataset_id,
            uri=f"dataset://{dataset_id}",
            name=request.name or dataset_id,
            version=request.version,
            cid=source.cid,
            split=request.split,
            format=request.options.get("format", "jsonl"),
            schema=dict(request.options.get("schema", {})),
            row_count=request.options.get("row_count", 2),
            storage_refs=(source,),
            metadata={
                "source_path": source.path,
                "source_cid": source.cid,
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
            record_id=f"os038-dataset-load-{dataset_id}",
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
            message="baseline dataset metadata loaded",
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
                metadata={"adapter": "mock-ipfs-datasets"},
            ),
            source="mock-ipfs-datasets",
            payload={"dataset_id": dataset_id, "ok": True},
        )
        return replace(result, audit_events=(audit_event,))


class BaselineModelRuntime:
    def __init__(self):
        self.sequence = 0

    async def load_model(self, request):
        model = request.model if isinstance(request.model, ModelRef) else ModelRef(model_id=str(request.model))
        loaded = LoadedModel(
            handle_id=f"handle-{model.model_id}",
            model=model,
            state=ModelRuntimeState.READY,
            backend=request.target_backend,
            precision=request.precision,
            metadata={"load_mode": request.mode.value if isinstance(request.mode, ModelLoadMode) else request.mode},
        )
        return ModelLoadResult(request=request, model=loaded, ok=True, metadata={"backend": "mock-ipfs-accelerate"})

    async def run_inference(self, request):
        self.sequence += 1
        model = request.model.model if isinstance(request.model, LoadedModel) else request.model
        if not isinstance(model, ModelRef):
            model = ModelRef(model_id=str(model))
        dataset = request.options["dataset"]
        prompt = " ".join(item.text or "" for item in request.inputs).strip()
        text = f"{dataset.dataset_id} baseline response from {model.model_id}: {prompt[:48]}"
        task_id = f"os038-inference-{self.sequence}"
        usage = token_usage(
            max(1, len(prompt.split())) + len(text.split()),
            task_id=task_id,
            model=model,
            metadata={"phase": "performance-baseline"},
        )
        output = InferenceOutput(
            output_id=f"{task_id}-output",
            text=text,
            input_id=request.inputs[0].input_id if request.inputs else None,
            finish_reason="stop",
            resource_usage=(usage,),
            metadata={"dataset_id": dataset.dataset_id},
        )
        status = ComputeTaskStatus(
            task_id=task_id,
            operation=ModelComputeOperation.INFERENCE,
            state=ComputeTaskState.COMPLETED,
            model=model,
            actor=request.actor,
            queue_id=request.queue_id,
            progress=1.0,
            resource_usage=(usage,),
        )
        event = EventEnvelope(
            event_id=f"{request.trace_id}:compute:inference:{self.sequence}",
            event_type="virtual_os.compute.inference.completed",
            source="ipfs_accelerate_py",
            actor=request.actor,
            subject=model.resource(),
            trace_id=request.trace_id,
            payload={"task_id": task_id, "dataset_id": dataset.dataset_id, "ok": True},
        )
        return InferenceResult(
            request=request,
            ok=True,
            outputs=(output,),
            task_id=task_id,
            task_status=status,
            resource_usage=(usage,),
            events=(event,),
            stats={"input_count": len(request.inputs)},
            metadata={"backend": "mock-ipfs-accelerate"},
        )


class BaselineMCPPlusPlusScheduler:
    def __init__(self):
        self.sequence = 0
        self.events: list[EventEnvelope] = []
        self.completed: list[Any] = []

    def schedule_invocation(self, actor):
        self.sequence += 1
        queue_id = "mcp-plus-plus-baseline"
        task_id = f"os038-mcp-schedule-{self.sequence}"
        target = TaskDelegationTarget(
            target_id="mcp-plus-plus-local-mesh",
            protocol=TaskDelegationProtocol.MCP_PLUS_PLUS,
            service_id="ipfs-accelerate-mcp",
            queue_id=queue_id,
            interface_cid="bafybaselineinterface",
            method="scheduler.invoke",
            metadata={"profile": "hallucinate-mcp-plus-plus"},
        )
        request = AgentTaskRequest(
            task_id=task_id,
            kind=AgentTaskKind.MCP_PLUS_PLUS_INVOCATION,
            actor=actor,
            queue_id=queue_id,
            priority=4,
            risk_score=0.25,
            payload={"method": target.method, "service_id": target.service_id},
            delegation=target,
            trace_id=TRACE_ID,
            metadata={"scheduler": "mcp_plus_plus"},
        )
        enqueued = scheduler_event(
            SchedulerEventType.TASK_ENQUEUED,
            actor=actor,
            task_id=task_id,
            queue_id=queue_id,
            trace_id=TRACE_ID,
            correlation_id=f"os038-{self.sequence}-enqueue",
            payload={"effective_priority": request.effective_priority, "protocol": target.protocol.value},
        )
        started = scheduler_event(
            SchedulerEventType.TASK_STARTED,
            actor=actor,
            task_id=task_id,
            queue_id=queue_id,
            trace_id=TRACE_ID,
            correlation_id=f"os038-{self.sequence}-start",
            parent_event_ids=(enqueued.event_id,),
            payload={"target_id": target.target_id, "method": target.method},
        )
        completed = scheduler_event(
            SchedulerEventType.TASK_COMPLETED,
            actor=actor,
            task_id=task_id,
            queue_id=queue_id,
            trace_id=TRACE_ID,
            correlation_id=f"os038-{self.sequence}-complete",
            parent_event_ids=(started.event_id,),
            payload={"receipt_cid": f"bafyreceipt{self.sequence:04d}", "ok": True},
        )
        status = replace(
            request.initial_status(AgentTaskState.QUEUED),
            state=AgentTaskState.COMPLETED,
            queued_at=enqueued.occurred_at,
            started_at=started.occurred_at,
            completed_at=completed.occurred_at,
            emitted_event_ids=(enqueued.event_id, started.event_id, completed.event_id),
            result_ref=ResourceRef(
                uri=f"mcp++://receipts/bafyreceipt{self.sequence:04d}",
                kind=ResourceKind.SERVICE,
                component="mcp_plus_plus",
                name="scheduler-receipt",
            ),
        )
        self.events.extend((enqueued, started, completed))
        self.completed.append(status)
        queue = AgentTaskQueueState(
            queue_id=queue_id,
            status=AgentTaskQueueStatus.ACTIVE,
            discipline=SchedulerQueueDiscipline.RISK_ADJUSTED_PRIORITY,
            completed=len(self.completed),
            tasks=tuple(self.completed),
            metadata={"event_count": len(self.events)},
        )
        return TaskSubmissionResult(
            task=status,
            ok=True,
            queue_id=queue_id,
            events=(enqueued, started, completed),
            metadata={"queue_state": queue, "delegation_protocol": target.protocol.value},
        )


@dataclass
class BaselineContext:
    actor: IdentityRef
    vfs: IPFSKitVFSAdapter
    knowledge: BaselineKnowledgeFabric
    compute: BaselineModelRuntime
    scheduler: BaselineMCPPlusPlusScheduler
    source_ref: StorageRef
    dataset: DatasetLoadResult
    model: LoadedModel


@dataclass(frozen=True)
class LatencyMetric:
    name: str
    component: str
    operation: str
    threshold_ms: float
    samples_ms: tuple[float, ...]
    details: dict[str, Any] = field(default_factory=dict)

    @property
    def median_ms(self):
        return statistics.median(self.samples_ms)

    @property
    def p95_ms(self):
        ordered = sorted(self.samples_ms)
        index = max(0, min(len(ordered) - 1, math.ceil(0.95 * len(ordered)) - 1))
        return ordered[index]

    @property
    def max_ms(self):
        return max(self.samples_ms)

    @property
    def ok(self):
        return self.p95_ms <= self.threshold_ms

    def to_record(self):
        return {
            "name": self.name,
            "component": self.component,
            "operation": self.operation,
            "threshold_ms": self.threshold_ms,
            "threshold_stat": "p95_ms",
            "ok": self.ok,
            "sample_count": len(self.samples_ms),
            "median_ms": round(self.median_ms, 4),
            "p95_ms": round(self.p95_ms, 4),
            "max_ms": round(self.max_ms, 4),
            "samples_ms": [round(sample, 4) for sample in self.samples_ms],
            "details": self.details,
        }


@dataclass(frozen=True)
class BaselineRunResult:
    smoke: bool
    iterations: int
    warmups: int
    generated_at: str
    metrics: tuple[LatencyMetric, ...]

    @property
    def failures(self):
        return tuple(metric.name for metric in self.metrics if not metric.ok)

    @property
    def ok(self):
        return not self.failures

    def to_record(self):
        return {
            "harness": "virtual_os_performance_baseline",
            "task_id": "OS-038",
            "mode": "smoke" if self.smoke else "baseline",
            "generated_at": self.generated_at,
            "iterations": self.iterations,
            "warmups": self.warmups,
            "summary": {"ok": self.ok, "failed_metrics": list(self.failures)},
            "metrics": [metric.to_record() for metric in self.metrics],
        }


class VirtualOSPerformanceBaselineHarness:
    def __init__(
        self,
        *,
        smoke: bool = True,
        iterations: int = DEFAULT_ITERATIONS,
        warmups: int = DEFAULT_WARMUPS,
        thresholds_ms: dict[str, float] | None = None,
    ):
        self.smoke = smoke
        self.iterations = max(1, int(iterations))
        self.warmups = max(0, int(warmups))
        self.thresholds_ms = dict(thresholds_ms or SMOKE_THRESHOLDS_MS)
        self.storage_sequence = 0

    async def run(self):
        context = await self._prepare_context()
        metrics = (
            await self._measure(
                "storage_latency",
                "ipfs_kit_py",
                "vfs.add_stat_cat",
                lambda: self._storage_round_trip(context),
                self._storage_details,
            ),
            await self._measure(
                "dataset_latency",
                "ipfs_datasets_py",
                "dataset.load_metadata",
                lambda: self._dataset_load(context),
                self._dataset_details,
            ),
            await self._measure(
                "inference_latency",
                "ipfs_accelerate_py",
                "model.run_inference",
                lambda: self._run_inference(context),
                self._inference_details,
            ),
            await self._measure(
                "mcp_plus_plus_scheduling_latency",
                "mcp_plus_plus",
                "scheduler.enqueue_start_complete",
                lambda: self._schedule_mcp_plus_plus(context),
                self._scheduler_details,
            ),
        )
        return BaselineRunResult(
            smoke=self.smoke,
            iterations=self.iterations,
            warmups=self.warmups,
            generated_at=utc_now().isoformat(),
            metrics=metrics,
        )

    async def _prepare_context(self):
        actor = IdentityRef(did="did:example:os-038-baseline-agent", roles=("agent", "tester"))
        vfs = IPFSKitVFSAdapter(
            vfs_manager=BaselineVFSManager(),
            ipfs_api=BaselineIPFSAPI(),
            metadata_index=BaselineMetadataIndex(),
        )
        knowledge = BaselineKnowledgeFabric()
        compute = BaselineModelRuntime()
        scheduler = BaselineMCPPlusPlusScheduler()
        payload = (
            b'{"id":"row-1","text":"Storage writes content for a baseline."}\n'
            b'{"id":"row-2","text":"Dataset metadata feeds inference."}\n'
        )
        stored = await vfs.add(
            VFSAddRequest(
                ref=ref_from_path("/datasets/os038/baseline.jsonl"),
                actor=actor,
                payload=payload,
                options={
                    "mime_type": "application/jsonl",
                    "metadata": {
                        "dataset_id": "os038-baseline-dataset",
                        "row_count": 2,
                        "trace_id": TRACE_ID,
                    },
                },
            )
        )
        if not stored.ok or stored.node is None:
            raise AssertionError("baseline storage setup failed")
        source_ref = stored.node.to_storage_ref()
        dataset = await knowledge.load_dataset(
            DatasetLoadRequest(
                source=source_ref,
                actor=actor,
                dataset_id="os038-baseline-dataset",
                name="OS-038 Baseline Dataset",
                split="smoke",
                mode=DatasetLoadMode.METADATA_ONLY,
                options={
                    "format": "jsonl",
                    "row_count": 2,
                    "schema": {"id": "string", "text": "string"},
                    "graph_id": "os038-baseline-graph",
                    "vector_index_ids": ("os038-vectors",),
                },
                audit={"trace_id": TRACE_ID},
            )
        )
        model_ref = ModelRef(
            model_id="mock-os038-baseline-llm",
            revision="main",
            provider="ipfs_accelerate_py",
            format=ModelFormat.HUGGINGFACE,
            task=ModelTaskKind.TEXT_GENERATION,
        )
        model_result = await compute.load_model(
            ModelLoadRequest(
                model=model_ref,
                actor=actor,
                mode=ModelLoadMode.WARM,
                task=ModelTaskKind.TEXT_GENERATION,
                target_backend=HardwareBackend.CPU,
                precision=PrecisionMode.FP32,
                queue_id="os038-compute",
                trace_id=TRACE_ID,
            )
        )
        if not dataset.ok or model_result.model is None:
            raise AssertionError("baseline dataset/model setup failed")
        return BaselineContext(
            actor=actor,
            vfs=vfs,
            knowledge=knowledge,
            compute=compute,
            scheduler=scheduler,
            source_ref=source_ref,
            dataset=dataset,
            model=model_result.model,
        )

    async def _measure(
        self,
        name: str,
        component: str,
        operation: str,
        func: Callable[[], Awaitable[Any]],
        details: Callable[[Any], dict[str, Any]],
    ):
        last_result = None
        for _ in range(self.warmups):
            last_result = await func()

        samples = []
        for _ in range(self.iterations):
            started = time.perf_counter_ns()
            last_result = await func()
            elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000
            samples.append(elapsed_ms)

        return LatencyMetric(
            name=name,
            component=component,
            operation=operation,
            threshold_ms=self.thresholds_ms[name],
            samples_ms=tuple(samples),
            details=details(last_result),
        )

    async def _storage_round_trip(self, context):
        self.storage_sequence += 1
        path = f"/benchmarks/os038/storage-{self.storage_sequence}.jsonl"
        payload = (
            f'{{"id":"sample-{self.storage_sequence}","text":"baseline storage sample"}}\n'
        ).encode("utf-8")
        added = await context.vfs.add(
            VFSAddRequest(
                ref=ref_from_path(path),
                actor=context.actor,
                payload=payload,
                options={
                    "mime_type": "application/jsonl",
                    "metadata": {"benchmark": "storage", "trace_id": TRACE_ID},
                },
            )
        )
        stated = await context.vfs.stat(VFSStatRequest(ref=added.ref, actor=context.actor))
        content = await context.vfs.cat(VFSCatRequest(ref=added.ref, actor=context.actor))
        if not added.ok or not stated.ok or not content.ok or content.data != payload:
            raise AssertionError("storage latency sample did not complete round trip")
        return {
            "cid": added.ref.cid,
            "path": path,
            "size_bytes": len(payload),
            "operation_count": 3,
        }

    async def _dataset_load(self, context):
        result = await context.knowledge.load_dataset(
            DatasetLoadRequest(
                source=context.source_ref,
                actor=context.actor,
                dataset_id="os038-baseline-dataset",
                name="OS-038 Baseline Dataset",
                split="smoke",
                mode=DatasetLoadMode.METADATA_ONLY,
                options={
                    "format": "jsonl",
                    "row_count": 2,
                    "schema": {"id": "string", "text": "string"},
                    "graph_id": "os038-baseline-graph",
                    "vector_index_ids": ("os038-vectors",),
                },
                audit={"trace_id": TRACE_ID},
            )
        )
        if not result.ok or not result.provenance or not result.audit_events:
            raise AssertionError("dataset latency sample did not emit provenance and audit")
        return result

    async def _run_inference(self, context):
        result = await context.compute.run_inference(
            InferenceRequest(
                model=context.model,
                actor=context.actor,
                inputs=(
                    ModelInput(
                        input_id="prompt",
                        text="Summarize the OS-038 baseline dataset metadata.",
                        metadata={"dataset_id": context.dataset.dataset.dataset_id},
                    ),
                ),
                task=ModelTaskKind.TEXT_GENERATION,
                parameters={"temperature": 0.0, "max_new_tokens": 48},
                target_backend=HardwareBackend.CPU,
                queue_id="os038-compute",
                trace_id=TRACE_ID,
                options={"dataset": context.dataset.dataset},
            )
        )
        if not result.ok or not result.outputs or result.task_status.state != ComputeTaskState.COMPLETED:
            raise AssertionError("inference latency sample did not complete")
        return result

    async def _schedule_mcp_plus_plus(self, context):
        result = context.scheduler.schedule_invocation(context.actor)
        if not result.ok or len(result.events) != 3:
            raise AssertionError("MCP++ scheduling latency sample did not emit expected events")
        return result

    def _storage_details(self, result):
        return {
            "last_cid": result["cid"],
            "last_path": result["path"],
            "size_bytes": result["size_bytes"],
            "operation_count": result["operation_count"],
        }

    def _dataset_details(self, result):
        return {
            "dataset_id": result.dataset.dataset_id,
            "row_count": result.dataset.row_count,
            "graph_id": result.graph_id,
            "provenance_records": len(result.provenance),
            "audit_events": [event.event_type for event in result.audit_events],
        }

    def _inference_details(self, result):
        return {
            "task_id": result.task_id,
            "output_count": len(result.outputs),
            "model_id": result.task_status.model.model_id,
            "state": result.task_status.state.value,
            "events": [event.event_type for event in result.events],
        }

    def _scheduler_details(self, result):
        queue = result.metadata["queue_state"]
        return {
            "task_id": result.task.task_id,
            "queue_id": result.queue_id,
            "state": result.task.state.value,
            "delegation_protocol": result.metadata["delegation_protocol"],
            "completed": queue.completed,
            "events": [event.event_type for event in result.events],
        }


class TestVirtualOSPerformanceBaselineHarness(unittest.TestCase):
    def test_smoke_harness_records_required_latency_metrics(self):
        result = asyncio.run(
            VirtualOSPerformanceBaselineHarness(iterations=3, warmups=1).run()
        )

        self.assertTrue(result.ok, result.to_record())
        self.assertEqual(
            {metric.name for metric in result.metrics},
            set(SMOKE_THRESHOLDS_MS),
        )
        for metric in result.metrics:
            self.assertEqual(len(metric.samples_ms), 3)
            self.assertLessEqual(metric.p95_ms, metric.threshold_ms)
            self.assertGreaterEqual(metric.median_ms, 0)
            self.assertTrue(metric.details)

    def test_smoke_report_is_json_serializable(self):
        result = asyncio.run(
            VirtualOSPerformanceBaselineHarness(iterations=2, warmups=0).run()
        )

        record = result.to_record()
        encoded = json.dumps(record, sort_keys=True)
        self.assertIn("storage_latency", encoded)
        self.assertIn("dataset_latency", encoded)
        self.assertIn("inference_latency", encoded)
        self.assertIn("mcp_plus_plus_scheduling_latency", encoded)


async def run_smoke(iterations: int, warmups: int):
    return await VirtualOSPerformanceBaselineHarness(
        smoke=True,
        iterations=iterations,
        warmups=warmups,
    ).run()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Virtual AI OS performance baseline harness")
    parser.add_argument("--smoke", action="store_true", help="Run the mocked CI smoke baseline and emit JSON.")
    parser.add_argument("--iterations", type=int, default=DEFAULT_ITERATIONS, help="Measured samples per metric.")
    parser.add_argument("--warmups", type=int, default=DEFAULT_WARMUPS, help="Warmup samples per metric.")
    parser.add_argument("--output", type=Path, help="Optional path for the JSON baseline report.")
    parser.add_argument("--quiet", action="store_true", help="Do not print the JSON report to stdout.")
    args, remaining = parser.parse_known_args(argv)

    if not args.smoke:
        unittest.main(argv=[sys.argv[0], *remaining])
        return

    result = asyncio.run(run_smoke(args.iterations, args.warmups))
    record = result.to_record()
    encoded = json.dumps(record, indent=2, sort_keys=True)
    if args.output:
        args.output.write_text(encoded + "\n", encoding="utf-8")
    if not args.quiet:
        print(encoded)
    if not result.ok:
        failures = ", ".join(result.failures)
        raise SystemExit(f"Virtual AI OS performance smoke thresholds failed: {failures}")


if __name__ == "__main__":
    main(sys.argv[1:])
