import json
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.compute import (  # noqa: E402
    ComputeTaskState,
    ComputeTaskStatus,
    Embedding,
    EmbeddingRequest,
    EmbeddingResult,
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
from hallucinate_app.virtual_os.processes import AgentProcessKind, AgentProcessSpec  # noqa: E402
from hallucinate_app.virtual_os.provenance import (  # noqa: E402
    ModelOutputRecord,
    PromptRecord,
    ProvenanceLedger,
    ProvenanceLedgerRecord,
    ProvenanceQuery,
    ProvenanceRecordKind as LedgerProvenanceRecordKind,
)
from hallucinate_app.virtual_os.vfs import (  # noqa: E402
    IPFSKitVFSAdapter,
    VFSAddRequest,
    VFSOperation,
    VFSStatRequest,
    VFSCatRequest,
    ref_from_path,
)


TRACE_ID = "trace-os-025-storage-dataset-compute"


class MockIPFSAPI:
    def __init__(self):
        self.sequence = 0
        self.objects = {}
        self.add = AsyncMock(side_effect=self._add)
        self.cat = AsyncMock(side_effect=self._cat)

    def _add(self, payload, *, pin=True, **options):
        self.sequence += 1
        cid = f"bafyworkflow{self.sequence:04d}"
        self.objects[cid] = {
            "payload": payload,
            "pin": pin,
            "options": dict(options),
        }
        return {"Hash": cid, "size": len(payload), "pin": pin}

    def _cat(self, cid, **_options):
        stored = self.objects.get(cid)
        return None if stored is None else stored["payload"]


class MockVFSManager:
    def __init__(self):
        self.content_by_path = {}
        self.execute_vfs_operation = AsyncMock(side_effect=self._execute_vfs_operation)

    def _execute_vfs_operation(self, operation, **kwargs):
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
        return {"success": False, "error": f"unexpected operation: {operation}"}


class MockMetadataIndex:
    def __init__(self):
        self.records = []
        self.add = AsyncMock(side_effect=self._add)
        self.save = AsyncMock(return_value=None)
        self.get_by_cid = AsyncMock(side_effect=self._get_by_cid)
        self.lookup_by_path = AsyncMock(side_effect=self._lookup_by_path)
        self.query = AsyncMock(side_effect=self._query)

    def _add(self, record):
        self.records.append(dict(record))
        return {"success": True}

    def _get_by_cid(self, cid):
        return self._find("cid", cid)

    def _lookup_by_path(self, path):
        return self._find("path", path)

    def _query(self, filters=None, limit=1):
        results = self.records
        for field, operator, expected in filters or ():
            if operator == "==":
                results = [record for record in results if record.get(field) == expected]
        return {"results": results[:limit]}

    def _find(self, key, value):
        for record in reversed(self.records):
            if record.get(key) == value:
                return dict(record)
        return None


class MockKnowledgeFabric:
    def __init__(self):
        self.datasets = {}

    async def load_dataset(self, request):
        source = request.source
        if not isinstance(source, StorageRef):
            source = StorageRef(uri=str(source))
        dataset_id = request.dataset_id or "workflow-dataset"
        dataset = DatasetRef(
            dataset_id=dataset_id,
            uri=f"dataset://{dataset_id}",
            name=request.name or dataset_id,
            version=request.version,
            cid=source.cid,
            split=request.split,
            format=request.options.get("format"),
            schema=dict(request.options.get("schema", {})),
            row_count=request.options.get("row_count"),
            storage_refs=(source,),
            metadata={
                "source_path": source.path,
                "source_cid": source.cid,
                "loaded_from_metadata": True,
            },
        )
        self.datasets[dataset_id] = dataset

        source_resource = ResourceRef(
            uri=source.uri,
            kind=ResourceKind.STORAGE,
            component="ipfs_kit_py",
            metadata={"cid": source.cid, "path": source.path},
        )
        provenance = KnowledgeProvenanceRecord(
            record_id=f"knowledge-load-{dataset_id}",
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
            message="dataset metadata loaded",
            graph_id=request.options.get("graph_id"),
            vector_index_ids=tuple(request.options.get("vector_index_ids", ())),
            provenance=(provenance,),
            metadata={"backend": "mock-ipfs-datasets", "loaded_from_metadata": True},
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
            payload={"dataset_id": dataset_id, "cid": source.cid, "ok": True},
        )
        return DatasetLoadResult(
            dataset=result.dataset,
            ok=result.ok,
            message=result.message,
            graph_id=result.graph_id,
            vector_index_ids=result.vector_index_ids,
            provenance=result.provenance,
            audit_events=(audit_event,),
            metadata=result.metadata,
        )


class MockModelComputeRuntime:
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

    async def embed(self, request):
        self.sequence += 1
        model = request.model.model if isinstance(request.model, LoadedModel) else request.model
        if not isinstance(model, ModelRef):
            model = ModelRef(model_id=str(model))
        dimensions = request.dimensions or 4
        embeddings = []
        for index, item in enumerate(request.inputs):
            seed = sum(ord(char) for char in item.text or "") + index
            vector = tuple(round(((seed + offset * 17) % 101) / 100.0, 4) for offset in range(dimensions))
            embeddings.append(
                Embedding(
                    embedding_id=f"embedding-{self.sequence}-{item.input_id or index}",
                    vector=vector,
                    input_id=item.input_id,
                    text=item.text,
                    model=model,
                    normalized=request.normalize,
                    metadata={"dataset_id": item.metadata.get("dataset_id")},
                )
            )
        usage = token_usage(
            sum(max(1, len((item.text or "").split())) for item in request.inputs),
            task_id=f"embedding-{self.sequence}",
            model=model,
            metadata={"phase": "embedding"},
        )
        status = ComputeTaskStatus(
            task_id=f"embedding-{self.sequence}",
            operation=ModelComputeOperation.EMBEDDING,
            state=ComputeTaskState.COMPLETED,
            model=model,
            actor=request.actor,
            queue_id=request.queue_id,
            progress=1.0,
            resource_usage=(usage,),
        )
        event = EventEnvelope(
            event_id=f"{request.trace_id}:compute:embedding:{self.sequence}",
            event_type="virtual_os.compute.embedding.completed",
            source="ipfs_accelerate_py",
            actor=request.actor,
            subject=model.resource(),
            trace_id=request.trace_id,
            payload={"embedding_count": len(embeddings), "dimensions": dimensions},
        )
        return EmbeddingResult(
            request=request,
            ok=True,
            embeddings=tuple(embeddings),
            task_id=status.task_id,
            task_status=status,
            resource_usage=(usage,),
            events=(event,),
            stats={"input_count": len(request.inputs), "dimensions": dimensions},
            metadata={"backend": "mock-ipfs-accelerate"},
        )

    async def run_inference(self, request):
        self.sequence += 1
        model = request.model.model if isinstance(request.model, LoadedModel) else request.model
        if not isinstance(model, ModelRef):
            model = ModelRef(model_id=str(model))
        dataset = request.options["dataset"]
        embeddings = request.options["embeddings"]
        prompt = " ".join(item.text or "" for item in request.inputs).strip()
        text = (
            f"{dataset.dataset_id} has {dataset.row_count} rows; "
            f"{len(embeddings)} embeddings support the answer."
        )
        usage = token_usage(
            max(1, len(prompt.split())) + len(text.split()),
            task_id=f"inference-{self.sequence}",
            model=model,
            metadata={"phase": "inference"},
        )
        output = InferenceOutput(
            output_id=f"inference-{self.sequence}-output",
            text=text,
            input_id=request.inputs[0].input_id if request.inputs else None,
            finish_reason="stop",
            resource_usage=(usage,),
            metadata={
                "dataset_id": dataset.dataset_id,
                "embedding_ids": tuple(embedding.embedding_id for embedding in embeddings),
                "parameters": dict(request.parameters),
            },
        )
        status = ComputeTaskStatus(
            task_id=f"inference-{self.sequence}",
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
            parent_event_ids=tuple(event.event_id for event in request.options.get("parent_events", ())),
            payload={"output_id": output.output_id, "dataset_id": dataset.dataset_id, "ok": True},
        )
        return InferenceResult(
            request=request,
            ok=True,
            outputs=(output,),
            task_id=status.task_id,
            task_status=status,
            resource_usage=(usage,),
            events=(event,),
            stats={"input_count": len(request.inputs)},
            metadata={"backend": "mock-ipfs-accelerate"},
        )


def workflow_event(stage, *, actor, subject, payload, parent_event_ids=()):
    return EventEnvelope(
        event_id=f"{TRACE_ID}:{stage}",
        event_type=f"virtual_os.workflow.{stage}.completed",
        source="virtual_os.workflow_test",
        actor=actor,
        subject=subject,
        trace_id=TRACE_ID,
        parent_event_ids=tuple(parent_event_ids),
        payload=dict(payload),
    )


class TestVirtualOSStorageDatasetComputeWorkflow(unittest.IsolatedAsyncioTestCase):
    async def test_mocked_storage_dataset_compute_flow_writes_artifact_and_provenance(self):
        actor = IdentityRef(did="did:example:os-025-agent", roles=("agent", "tester"))
        ipfs_api = MockIPFSAPI()
        metadata_index = MockMetadataIndex()
        vfs = IPFSKitVFSAdapter(
            vfs_manager=MockVFSManager(),
            ipfs_api=ipfs_api,
            metadata_index=metadata_index,
        )

        dataset_payload = (
            b'{"id":"row-1","text":"IPFS stores content by CID."}\n'
            b'{"id":"row-2","text":"Accelerate runs mocked inference."}\n'
        )
        dataset_metadata = {
            "dataset_id": "os025-dataset",
            "split": "train",
            "format": "jsonl",
            "row_count": 2,
            "schema": {"id": "string", "text": "string"},
            "trace_id": TRACE_ID,
        }

        stored = await vfs.add(
            VFSAddRequest(
                ref=ref_from_path("/datasets/os025/train.jsonl"),
                actor=actor,
                payload=dataset_payload,
                options={
                    "mime_type": "application/jsonl",
                    "metadata": dataset_metadata,
                },
            )
        )
        self.assertTrue(stored.ok)
        self.assertEqual(stored.operation, VFSOperation.ADD)
        self.assertEqual(stored.ref.cid, "bafyworkflow0001")
        self.assertEqual(stored.node.to_storage_ref().path, "/datasets/os025/train.jsonl")
        self.assertEqual(metadata_index.records[0]["metadata"]["dataset_id"], "os025-dataset")

        stat = await vfs.stat(VFSStatRequest(ref=ref_from_path("/datasets/os025/train.jsonl"), actor=actor))
        self.assertTrue(stat.ok)
        self.assertEqual(stat.node.metadata_row.metadata["row_count"], 2)

        content = await vfs.cat(VFSCatRequest(ref=ref_from_path("/datasets/os025/train.jsonl"), actor=actor))
        self.assertTrue(content.ok)
        rows = [json.loads(line) for line in content.data.decode("utf-8").splitlines()]
        self.assertEqual([row["id"] for row in rows], ["row-1", "row-2"])

        source_storage_ref = stored.node.to_storage_ref()
        knowledge = MockKnowledgeFabric()
        dataset_result = await knowledge.load_dataset(
            DatasetLoadRequest(
                source=source_storage_ref,
                actor=actor,
                dataset_id=dataset_metadata["dataset_id"],
                name="OS-025 Dataset",
                split=dataset_metadata["split"],
                mode=DatasetLoadMode.METADATA_ONLY,
                options={
                    "format": dataset_metadata["format"],
                    "row_count": dataset_metadata["row_count"],
                    "schema": dataset_metadata["schema"],
                    "graph_id": "os025-graph",
                    "vector_index_ids": ("os025-vectors",),
                },
                audit={"trace_id": TRACE_ID},
            )
        )
        self.assertTrue(dataset_result.ok)
        self.assertEqual(dataset_result.dataset.cid, stored.ref.cid)
        self.assertEqual(dataset_result.dataset.row_count, 2)
        self.assertEqual(dataset_result.dataset.storage_refs[0].path, "/datasets/os025/train.jsonl")
        self.assertEqual(dataset_result.provenance[0].kind, KnowledgeProvenanceRecordKind.DATASET_LOAD)
        self.assertEqual(dataset_result.audit_events[0].event_type, "knowledge.load_dataset.after")

        compute = MockModelComputeRuntime()
        model = ModelRef(
            model_id="mock-os025-llm",
            revision="main",
            provider="ipfs_accelerate_py",
            format=ModelFormat.HUGGINGFACE,
            task=ModelTaskKind.TEXT_GENERATION,
        )
        model_result = await compute.load_model(
            ModelLoadRequest(
                model=model,
                actor=actor,
                mode=ModelLoadMode.WARM,
                task=ModelTaskKind.TEXT_GENERATION,
                target_backend=HardwareBackend.CPU,
                precision=PrecisionMode.FP32,
                trace_id=TRACE_ID,
            )
        )
        self.assertTrue(model_result.ok)
        self.assertEqual(model_result.model.state, ModelRuntimeState.READY)

        embedding_result = await compute.embed(
            EmbeddingRequest(
                model=model_result.model,
                actor=actor,
                inputs=tuple(
                    ModelInput(
                        input_id=row["id"],
                        text=row["text"],
                        metadata={"dataset_id": dataset_result.dataset.dataset_id},
                    )
                    for row in rows
                ),
                dimensions=4,
                target_backend=HardwareBackend.CPU,
                trace_id=TRACE_ID,
                parameters={"source_cid": stored.ref.cid},
            )
        )
        self.assertTrue(embedding_result.ok)
        self.assertEqual(len(embedding_result.embeddings), dataset_result.dataset.row_count)
        self.assertEqual(embedding_result.embeddings[0].dimensions, 4)
        self.assertEqual(embedding_result.task_status.state, ComputeTaskState.COMPLETED)

        inference_result = await compute.run_inference(
            InferenceRequest(
                model=model_result.model,
                actor=actor,
                inputs=(
                    ModelInput(
                        input_id="prompt",
                        text="Summarize the loaded dataset metadata.",
                        metadata={"dataset_id": dataset_result.dataset.dataset_id},
                    ),
                ),
                task=ModelTaskKind.TEXT_GENERATION,
                parameters={"temperature": 0.0, "max_new_tokens": 64},
                target_backend=HardwareBackend.CPU,
                trace_id=TRACE_ID,
                options={
                    "dataset": dataset_result.dataset,
                    "embeddings": embedding_result.embeddings,
                    "parent_events": embedding_result.events,
                },
            )
        )
        self.assertTrue(inference_result.ok)
        self.assertIn("os025-dataset has 2 rows", inference_result.outputs[0].text)
        self.assertEqual(inference_result.task_status.operation, ModelComputeOperation.INFERENCE)

        artifact_payload = json.dumps(
            {
                "answer": inference_result.outputs[0].text,
                "dataset_id": dataset_result.dataset.dataset_id,
                "embedding_ids": [embedding.embedding_id for embedding in embedding_result.embeddings],
                "model_id": model.model_id,
                "source_cid": stored.ref.cid,
                "trace_id": TRACE_ID,
            },
            sort_keys=True,
        ).encode("utf-8")
        artifact = await vfs.add(
            VFSAddRequest(
                ref=ref_from_path("/artifacts/os025/result.json"),
                actor=actor,
                payload=artifact_payload,
                options={
                    "mime_type": "application/json",
                    "metadata": {
                        "artifact_type": "workflow_result",
                        "dataset_id": dataset_result.dataset.dataset_id,
                        "model_id": model.model_id,
                        "trace_id": TRACE_ID,
                    },
                },
            )
        )
        self.assertTrue(artifact.ok)
        self.assertEqual(artifact.ref.cid, "bafyworkflow0002")
        self.assertEqual(metadata_index.records[-1]["metadata"]["artifact_type"], "workflow_result")

        artifact_content = await vfs.cat(VFSCatRequest(ref=ref_from_path("/artifacts/os025/result.json"), actor=actor))
        self.assertTrue(artifact_content.ok)
        artifact_json = json.loads(artifact_content.data.decode("utf-8"))
        self.assertEqual(artifact_json["source_cid"], stored.ref.cid)
        self.assertEqual(artifact_json["embedding_ids"], [embedding.embedding_id for embedding in embedding_result.embeddings])

        source_event = workflow_event(
            "storage-source-add",
            actor=actor,
            subject=stored.ref.resource(),
            payload={"cid": stored.ref.cid, "path": stored.ref.path},
        )
        artifact_event = workflow_event(
            "storage-artifact-add",
            actor=actor,
            subject=artifact.ref.resource(),
            payload={"cid": artifact.ref.cid, "path": artifact.ref.path},
            parent_event_ids=(
                dataset_result.audit_events[0].event_id,
                embedding_result.events[0].event_id,
                inference_result.events[0].event_id,
            ),
        )
        process = AgentProcessSpec(
            process_id="os-025-workflow",
            component="virtual_os.workflow_test",
            entrypoint="test_virtual_os_storage_dataset_compute",
            identity=actor,
            kind=AgentProcessKind.WORKFLOW,
            workflow_id="os-025",
            metadata={"trace_id": TRACE_ID},
        )
        output_record = ModelOutputRecord(
            output_id=inference_result.outputs[0].output_id,
            text=inference_result.outputs[0].text,
            artifact=artifact.node.to_storage_ref(),
            cid=artifact.ref.cid,
            media_type="application/json",
            finish_reason=inference_result.outputs[0].finish_reason,
            metadata={"embedding_ids": artifact_json["embedding_ids"]},
        )
        ledger_record = ProvenanceLedgerRecord(
            kind=LedgerProvenanceRecordKind.OUTPUT_ARTIFACT,
            operation="storage.dataset.compute.workflow",
            cid=artifact.ref.cid,
            dataset=dataset_result.dataset,
            model=model_result.model,
            prompt=PromptRecord(
                prompt_id="os-025-prompt",
                text="Summarize the loaded dataset metadata.",
                input_refs=(source_storage_ref,),
                cid=stored.ref.cid,
            ),
            output=output_record,
            agent_process=process,
            events=(
                source_event,
                dataset_result.audit_events[0],
                embedding_result.events[0],
                inference_result.events[0],
                artifact_event,
            ),
            actor=actor,
            subject=StorageRef(
                uri=artifact.ref.uri,
                cid=artifact.ref.cid,
                path=artifact.ref.path,
                media_type="application/json",
            ),
            trace_id=TRACE_ID,
            metadata={
                "dataset_load_provenance_id": dataset_result.provenance[0].record_id,
                "embedding_task_id": embedding_result.task_id,
                "inference_task_id": inference_result.task_id,
            },
        )
        ledger = ProvenanceLedger()
        receipt = ledger.record(ledger_record)
        provenance_event = ledger_record.to_event()

        self.assertTrue(receipt.ok)
        self.assertEqual(receipt.cid, ledger_record.record_cid)
        self.assertEqual(ledger.query(ProvenanceQuery(dataset_id="os025-dataset")), (ledger_record,))
        self.assertEqual(ledger.query(model_id="mock-os025-llm"), (ledger_record,))
        self.assertEqual(ledger.query(event_id=artifact_event.event_id), (ledger_record,))
        self.assertEqual(provenance_event.event_type, "virtual_os.provenance.recorded")
        self.assertEqual(provenance_event.trace_id, TRACE_ID)
        self.assertIn(inference_result.events[0].event_id, provenance_event.parent_event_ids)
        self.assertEqual(provenance_event.payload["cid"], artifact.ref.cid)
        self.assertEqual(provenance_event.payload["dataset"]["dataset_id"], "os025-dataset")
        self.assertEqual(provenance_event.payload["output"]["artifact"]["cid"], artifact.ref.cid)


if __name__ == "__main__":
    unittest.main()
