import inspect
import subprocess
import sys
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import AsyncMock


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

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
    EntityLookupRequest,
    EntityMutationRequest,
    GraphMutationResult,
    GraphRAGQuery,
    GraphRAGQueryMode,
    GraphRAGResult,
    KnowledgeAuditContext,
    KnowledgeFabricAdapter,
    KnowledgeGraphEntity,
    KnowledgeGraphRelationship,
    KnowledgeOperation,
    KnowledgeSearchHit,
    ProvenanceReceipt,
    ProvenanceRecord,
    ProvenanceRecordKind,
    RelationshipLookupRequest,
    RelationshipMutationRequest,
    VectorDistanceMetric,
    VectorSearchRequest,
    VectorSearchResult,
    knowledge_audit_event,
)


def source_to_resource(source):
    if isinstance(source, ResourceRef):
        return source
    if isinstance(source, StorageRef):
        return ResourceRef(
            uri=source.uri,
            kind=ResourceKind.STORAGE,
            component="ipfs_kit_py",
            metadata=dict(source.metadata),
        )
    return ResourceRef(
        uri=str(source),
        kind=ResourceKind.DATASET,
        component="ipfs_datasets_py",
    )


class MockKnowledgeFabricAdapter:
    """Small in-memory adapter used to validate the knowledge fabric contract."""

    def __init__(self, *, ipfs_datasets_available=True):
        self.ipfs_datasets_available = ipfs_datasets_available
        self.datasets = {}
        self.entities = {}
        self.relationships = {}
        self.provenance = {}
        self.audit_hooks = {}
        self._sequence = 0

    def _record(
        self,
        *,
        kind,
        operation,
        actor,
        subject=None,
        inputs=(),
        outputs=(),
        parameters=None,
        description="",
    ):
        self._sequence += 1
        record = ProvenanceRecord(
            record_id=f"prov-{self._sequence}",
            kind=kind,
            operation=operation,
            actor=actor,
            subject=subject,
            inputs=tuple(inputs),
            outputs=tuple(outputs),
            description=description,
            parameters=dict(parameters or {}),
        )
        self.provenance[record.record_id] = record
        return record

    def _event(self, *, operation, actor, subject=None, result=None, metadata=None):
        context = KnowledgeAuditContext(
            phase=AuditPhase.AFTER,
            operation=operation,
            actor=actor,
            subject=subject,
            result=result,
            metadata={"adapter": "mock-ipfs-datasets", **dict(metadata or {})},
        )
        return knowledge_audit_event(
            context,
            source="mock-ipfs-datasets",
            payload={
                "operation": operation.value if isinstance(operation, KnowledgeOperation) else operation,
                "ok": getattr(result, "ok", True),
            },
        )

    async def load_dataset(self, request):
        source_resource = source_to_resource(request.source)
        dataset_id = request.dataset_id or source_resource.uri.rstrip("/").rsplit("/", 1)[-1] or "dataset"
        fallback = not self.ipfs_datasets_available
        row_count = 0 if fallback else int(request.options.get("row_count", 3))
        dataset = DatasetRef(
            dataset_id=dataset_id,
            uri=f"dataset://{dataset_id}",
            name=request.name or dataset_id,
            version=request.version,
            cid=getattr(request.source, "cid", None),
            split=request.split,
            format=request.options.get("format"),
            schema=dict(request.options.get("schema", {})),
            row_count=row_count,
            storage_refs=(request.source,) if isinstance(request.source, StorageRef) else (),
            loaded_at=utc_now(),
            metadata={
                "source_uri": source_resource.uri,
                "mode": request.mode.value if isinstance(request.mode, DatasetLoadMode) else request.mode,
                "fallback": fallback,
            },
        )
        self.datasets[dataset.dataset_id] = dataset
        record = self._record(
            kind=ProvenanceRecordKind.DATASET_LOAD,
            operation=KnowledgeOperation.LOAD_DATASET,
            actor=request.actor,
            subject=dataset.resource(),
            inputs=(source_resource,),
            outputs=(dataset.resource(),),
            parameters=request.options,
            description="dataset load registered through knowledge adapter",
        )
        result = DatasetLoadResult(
            dataset=dataset,
            ok=True,
            message=(
                "ipfs_datasets_py extras unavailable; registered metadata-only dataset"
                if fallback
                else "dataset loaded"
            ),
            graph_id=request.options.get("graph_id"),
            vector_index_ids=tuple(request.options.get("vector_index_ids", ())),
            provenance=(record,),
            metadata={
                "backend": "fallback" if fallback else "ipfs_datasets_py",
                "fallback": fallback,
            },
        )
        return replace(
            result,
            audit_events=(
                self._event(
                    operation=KnowledgeOperation.LOAD_DATASET,
                    actor=request.actor,
                    subject=dataset.resource(),
                    result=result,
                    metadata={"fallback": fallback},
                ),
            ),
        )

    async def query_graphrag(self, query):
        graph_id = query.graph_id or "default"
        fallback = not self.ipfs_datasets_available
        subject = query.dataset.resource() if query.dataset else None
        record = self._record(
            kind=ProvenanceRecordKind.QUERY,
            operation=KnowledgeOperation.QUERY_GRAPHRAG,
            actor=query.actor,
            subject=subject,
            inputs=(subject,) if subject else (),
            parameters={"query": query.query, "mode": query.mode},
            description="GraphRAG query executed through knowledge adapter",
        )

        if fallback:
            result = GraphRAGResult(
                query=query,
                ok=False,
                hits=(),
                provenance=(record,) if query.include_provenance else (),
                message="ipfs_datasets_py extras unavailable; GraphRAG query degraded",
                metadata={"fallback": True},
            )
            return replace(
                result,
                audit_events=(
                    self._event(
                        operation=KnowledgeOperation.QUERY_GRAPHRAG,
                        actor=query.actor,
                        subject=subject,
                        result=result,
                        metadata={"fallback": True},
                    ),
                ),
            )

        selected_entities = tuple(self.entities.get(graph_id, {}).values())[: query.top_k]
        selected_relationships = tuple(self.relationships.get(graph_id, {}).values())[: query.top_k]
        hits = tuple(
            KnowledgeSearchHit(
                hit_id=f"hit-{entity.entity_id}",
                score=0.95 - (index * 0.05),
                text=entity.label or entity.entity_id,
                ref=entity.resource(),
                entity=entity,
                rank=index + 1,
                provenance_ids=(record.record_id,),
            )
            for index, entity in enumerate(selected_entities)
        )
        answer = None
        if query.include_answer:
            answer = f"{hits[0].text} is the top GraphRAG match for {query.query}" if hits else ""
        result = GraphRAGResult(
            query=query,
            ok=True,
            answer=answer,
            hits=hits,
            entities=selected_entities if query.include_entities else (),
            relationships=selected_relationships if query.include_relationships else (),
            provenance=(record,) if query.include_provenance else (),
            stats={"top_k": query.top_k, "hit_count": len(hits)},
            metadata={"backend": "ipfs_datasets_py"},
        )
        return replace(
            result,
            audit_events=(
                self._event(
                    operation=KnowledgeOperation.QUERY_GRAPHRAG,
                    actor=query.actor,
                    subject=subject,
                    result=result,
                ),
            ),
        )

    async def add_entity(self, request):
        entity = replace(
            request.entity,
            graph_id=request.graph_id,
            created_at=request.entity.created_at or utc_now(),
            updated_at=utc_now(),
        )
        self.entities.setdefault(request.graph_id, {})[entity.entity_id] = entity
        return self._mutation_result(
            request=request,
            operation=KnowledgeOperation.ADD_ENTITY,
            entity=entity,
        )

    async def get_entity(self, request):
        return self.entities.get(request.graph_id, {}).get(request.entity_id)

    async def list_entities(self, request):
        entities = list(self.entities.get(request.graph_id, {}).values())
        if request.entity_id:
            entities = [entity for entity in entities if entity.entity_id == request.entity_id]
        if request.entity_type:
            entities = [entity for entity in entities if entity.entity_type == request.entity_type]
        for key, expected in request.filters.items():
            entities = [
                entity
                for entity in entities
                if entity.properties.get(key) == expected or entity.metadata.get(key) == expected
            ]
        if request.limit is not None:
            entities = entities[: request.limit]
        return tuple(entities)

    async def update_entity(self, request):
        current = self.entities.setdefault(request.graph_id, {}).get(request.entity.entity_id)
        entity = request.entity
        if request.merge and current is not None:
            entity = replace(
                entity,
                properties={**dict(current.properties), **dict(entity.properties)},
                aliases=entity.aliases or current.aliases,
                created_at=current.created_at,
            )
        entity = replace(entity, graph_id=request.graph_id, updated_at=utc_now())
        self.entities[request.graph_id][entity.entity_id] = entity
        return self._mutation_result(
            request=request,
            operation=KnowledgeOperation.UPDATE_ENTITY,
            entity=entity,
        )

    async def delete_entity(self, request):
        entity = self.entities.get(request.graph_id, {}).pop(request.entity_id, None)
        return self._lookup_mutation_result(
            request=request,
            operation=KnowledgeOperation.DELETE_ENTITY,
            entity=entity,
            subject=entity.resource() if entity else None,
        )

    async def add_relationship(self, request):
        relationship = replace(
            request.relationship,
            graph_id=request.graph_id,
            created_at=request.relationship.created_at or utc_now(),
            updated_at=utc_now(),
        )
        self.relationships.setdefault(request.graph_id, {})[relationship.relationship_id] = relationship
        return self._mutation_result(
            request=request,
            operation=KnowledgeOperation.ADD_RELATIONSHIP,
            relationship=relationship,
        )

    async def get_relationship(self, request):
        return self.relationships.get(request.graph_id, {}).get(request.relationship_id)

    async def list_relationships(self, request):
        relationships = list(self.relationships.get(request.graph_id, {}).values())
        if request.relationship_id:
            relationships = [
                relationship
                for relationship in relationships
                if relationship.relationship_id == request.relationship_id
            ]
        if request.source_entity_id:
            relationships = [
                relationship
                for relationship in relationships
                if relationship.source_entity_id == request.source_entity_id
            ]
        if request.target_entity_id:
            relationships = [
                relationship
                for relationship in relationships
                if relationship.target_entity_id == request.target_entity_id
            ]
        if request.relationship_type:
            relationships = [
                relationship
                for relationship in relationships
                if relationship.relationship_type == request.relationship_type
            ]
        for key, expected in request.filters.items():
            relationships = [
                relationship
                for relationship in relationships
                if relationship.properties.get(key) == expected or relationship.metadata.get(key) == expected
            ]
        if request.limit is not None:
            relationships = relationships[: request.limit]
        return tuple(relationships)

    async def update_relationship(self, request):
        current = self.relationships.setdefault(request.graph_id, {}).get(
            request.relationship.relationship_id
        )
        relationship = request.relationship
        if request.merge and current is not None:
            relationship = replace(
                relationship,
                properties={**dict(current.properties), **dict(relationship.properties)},
                created_at=current.created_at,
            )
        relationship = replace(relationship, graph_id=request.graph_id, updated_at=utc_now())
        self.relationships[request.graph_id][relationship.relationship_id] = relationship
        return self._mutation_result(
            request=request,
            operation=KnowledgeOperation.UPDATE_RELATIONSHIP,
            relationship=relationship,
        )

    async def delete_relationship(self, request):
        relationship = self.relationships.get(request.graph_id, {}).pop(
            request.relationship_id, None
        )
        return self._lookup_mutation_result(
            request=request,
            operation=KnowledgeOperation.DELETE_RELATIONSHIP,
            relationship=relationship,
            subject=relationship.resource() if relationship else None,
        )

    def _mutation_result(self, *, request, operation, entity=None, relationship=None):
        subject = entity.resource() if entity is not None else relationship.resource()
        record = self._record(
            kind=ProvenanceRecordKind.GRAPH_MUTATION,
            operation=operation,
            actor=request.actor,
            subject=subject,
            outputs=(subject,),
            description=f"{operation.value} graph mutation",
        )
        result = GraphMutationResult(
            ok=True,
            operation=operation,
            graph_id=request.graph_id,
            entity=entity,
            relationship=relationship,
            provenance=(record,),
            metadata={"merge": getattr(request, "merge", None)},
        )
        return replace(
            result,
            audit_events=(
                self._event(
                    operation=operation,
                    actor=request.actor,
                    subject=subject,
                    result=result,
                ),
            ),
        )

    def _lookup_mutation_result(self, *, request, operation, entity=None, relationship=None, subject=None):
        record = self._record(
            kind=ProvenanceRecordKind.GRAPH_MUTATION,
            operation=operation,
            actor=request.actor,
            subject=subject,
            description=f"{operation.value} graph mutation",
        )
        result = GraphMutationResult(
            ok=subject is not None,
            operation=operation,
            graph_id=request.graph_id,
            entity=entity,
            relationship=relationship,
            message="" if subject is not None else "not found",
            provenance=(record,),
        )
        return replace(
            result,
            audit_events=(
                self._event(
                    operation=operation,
                    actor=request.actor,
                    subject=subject,
                    result=result,
                ),
            ),
        )

    async def vector_search(self, request):
        fallback = not self.ipfs_datasets_available
        record = self._record(
            kind=ProvenanceRecordKind.VECTOR_SEARCH,
            operation=KnowledgeOperation.VECTOR_SEARCH,
            actor=request.actor,
            parameters={
                "index_id": request.index_id,
                "metric": request.metric,
                "query_text": request.query_text,
            },
            description="vector search executed through knowledge adapter",
        )
        if fallback:
            return VectorSearchResult(
                request=request,
                ok=False,
                hits=(),
                message="ipfs_datasets_py extras unavailable; vector search degraded",
                provenance=(record,),
                metadata={"fallback": True},
            )
        entities = tuple(
            entity
            for graph_entities in self.entities.values()
            for entity in graph_entities.values()
        )[: request.top_k]
        hits = tuple(
            KnowledgeSearchHit(
                hit_id=f"vector-hit-{entity.entity_id}",
                score=0.9 - (index * 0.05),
                text=entity.label,
                ref=entity.resource(),
                entity=entity,
                vector_id=f"vec-{entity.entity_id}",
                rank=index + 1,
                distance=0.1 + (index * 0.05),
                provenance_ids=(record.record_id,),
            )
            for index, entity in enumerate(entities)
        )
        return VectorSearchResult(
            request=request,
            ok=True,
            hits=hits,
            provenance=(record,),
            stats={"hit_count": len(hits), "metric": request.metric},
            metadata={"backend": "ipfs_datasets_py"},
        )

    async def record_provenance(self, record):
        self.provenance[record.record_id] = record
        return ProvenanceReceipt(record=record, ok=True, cid=f"bafy{record.record_id}")

    async def get_provenance(self, record_id):
        return self.provenance.get(record_id)

    async def trace_provenance(self, subject, *, depth=None):
        def touches(record):
            refs = (record.subject, *record.inputs, *record.outputs)
            return any(ref is not None and ref.uri == subject.uri for ref in refs)

        return tuple(record for record in self.provenance.values() if touches(record))

    async def register_audit_hook(self, hook):
        self._sequence += 1
        hook_id = f"hook-{self._sequence}"
        self.audit_hooks[hook_id] = hook
        return hook_id

    async def unregister_audit_hook(self, hook_id):
        self.audit_hooks.pop(hook_id, None)

    async def emit_audit(self, context):
        for hook in tuple(self.audit_hooks.values()):
            result = hook(context)
            if inspect.isawaitable(result):
                await result
        return knowledge_audit_event(
            context,
            source="mock-ipfs-datasets",
            payload={
                "phase": context.phase.value if isinstance(context.phase, AuditPhase) else context.phase,
                "operation": (
                    context.operation.value
                    if isinstance(context.operation, KnowledgeOperation)
                    else context.operation
                ),
            },
        )


class TestVirtualOSKnowledgeAdapter(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.actor = IdentityRef(did="did:example:knowledge-agent", roles=("agent",))

    async def test_dataset_load_normalizes_result_provenance_and_audit_event(self):
        adapter = MockKnowledgeFabricAdapter()
        self.assertIsInstance(adapter, KnowledgeFabricAdapter)

        result = await adapter.load_dataset(
            DatasetLoadRequest(
                source=StorageRef(
                    uri="ipfs://bafywiki",
                    cid="bafywiki",
                    path="/datasets/wiki/train.jsonl",
                    media_type="application/jsonl",
                ),
                actor=self.actor,
                dataset_id="wiki",
                name="Wiki Train",
                split="train",
                mode=DatasetLoadMode.MATERIALIZE,
                options={
                    "format": "jsonl",
                    "row_count": 42,
                    "schema": {"text": "string"},
                    "graph_id": "wiki-graph",
                    "vector_index_ids": ("wiki-vectors",),
                },
            )
        )

        self.assertTrue(result.ok)
        self.assertIsInstance(result, DatasetLoadResult)
        self.assertEqual(result.dataset.dataset_id, "wiki")
        self.assertEqual(result.dataset.uri, "dataset://wiki")
        self.assertEqual(result.dataset.cid, "bafywiki")
        self.assertEqual(result.dataset.row_count, 42)
        self.assertEqual(result.dataset.format, "jsonl")
        self.assertEqual(result.dataset.storage_refs[0].path, "/datasets/wiki/train.jsonl")
        self.assertEqual(result.graph_id, "wiki-graph")
        self.assertEqual(result.vector_index_ids, ("wiki-vectors",))
        self.assertFalse(result.metadata["fallback"])

        provenance = result.provenance[0]
        self.assertEqual(provenance.kind, ProvenanceRecordKind.DATASET_LOAD)
        self.assertEqual(provenance.operation, KnowledgeOperation.LOAD_DATASET)
        self.assertEqual(provenance.actor, self.actor)
        self.assertEqual(provenance.inputs[0].uri, "ipfs://bafywiki")
        self.assertEqual(provenance.outputs[0].uri, "dataset://wiki")

        audit_event = result.audit_events[0]
        self.assertEqual(audit_event.event_type, "knowledge.load_dataset.after")
        self.assertEqual(audit_event.actor, self.actor)
        self.assertEqual(audit_event.subject.uri, "dataset://wiki")

    async def test_graphrag_query_and_vector_search_return_contract_shapes(self):
        adapter = MockKnowledgeFabricAdapter()
        dataset_result = await adapter.load_dataset(
            DatasetLoadRequest(
                source="hf://datasets/wiki",
                actor=self.actor,
                dataset_id="wiki",
                options={"graph_id": "wiki-graph", "vector_index_ids": ("wiki-vectors",)},
            )
        )
        await adapter.add_entity(
            EntityMutationRequest(
                graph_id="wiki-graph",
                actor=self.actor,
                entity=KnowledgeGraphEntity(
                    entity_id="python",
                    entity_type="technology",
                    label="Python",
                    properties={"runtime": "cpython"},
                ),
            )
        )
        await adapter.add_entity(
            EntityMutationRequest(
                graph_id="wiki-graph",
                actor=self.actor,
                entity=KnowledgeGraphEntity(
                    entity_id="ipfs",
                    entity_type="technology",
                    label="IPFS",
                    properties={"network": "content-addressed"},
                ),
            )
        )
        await adapter.add_relationship(
            RelationshipMutationRequest(
                graph_id="wiki-graph",
                actor=self.actor,
                relationship=KnowledgeGraphRelationship(
                    relationship_id="python-uses-ipfs",
                    source_entity_id="python",
                    target_entity_id="ipfs",
                    relationship_type="USES",
                    properties={"confidence": 0.8},
                ),
            )
        )

        query_result = await adapter.query_graphrag(
            GraphRAGQuery(
                query="How does Python use IPFS?",
                actor=self.actor,
                dataset=dataset_result.dataset,
                graph_id="wiki-graph",
                mode=GraphRAGQueryMode.HYBRID,
                top_k=1,
            )
        )

        self.assertTrue(query_result.ok)
        self.assertIsInstance(query_result, GraphRAGResult)
        self.assertIn("Python", query_result.answer)
        self.assertEqual(len(query_result.hits), 1)
        self.assertEqual(query_result.hits[0].entity.entity_id, "python")
        self.assertEqual(query_result.hits[0].rank, 1)
        self.assertEqual(query_result.relationships[0].relationship_id, "python-uses-ipfs")
        self.assertEqual(query_result.provenance[0].kind, ProvenanceRecordKind.QUERY)
        self.assertEqual(query_result.audit_events[0].event_type, "knowledge.query_graphrag.after")

        vector_result = await adapter.vector_search(
            VectorSearchRequest(
                index_id="wiki-vectors",
                actor=self.actor,
                dataset=dataset_result.dataset,
                query_text="content addressed Python runtime",
                top_k=1,
                metric=VectorDistanceMetric.COSINE,
            )
        )

        self.assertTrue(vector_result.ok)
        self.assertIsInstance(vector_result, VectorSearchResult)
        self.assertEqual(vector_result.hits[0].vector_id, "vec-python")
        self.assertEqual(vector_result.hits[0].entity.label, "Python")
        self.assertEqual(vector_result.provenance[0].kind, ProvenanceRecordKind.VECTOR_SEARCH)

    async def test_graph_entity_and_relationship_crud(self):
        adapter = MockKnowledgeFabricAdapter()
        graph_id = "knowledge-graph"
        python = KnowledgeGraphEntity(
            entity_id="python",
            entity_type="language",
            label="Python",
            aliases=("py",),
            properties={"runtime": "cpython"},
        )
        ipfs = KnowledgeGraphEntity(
            entity_id="ipfs",
            entity_type="protocol",
            label="IPFS",
            properties={"addressing": "content"},
        )

        add_python = await adapter.add_entity(
            EntityMutationRequest(graph_id=graph_id, entity=python, actor=self.actor)
        )
        await adapter.add_entity(
            EntityMutationRequest(graph_id=graph_id, entity=ipfs, actor=self.actor)
        )
        self.assertTrue(add_python.ok)
        self.assertIsInstance(add_python, GraphMutationResult)
        self.assertEqual(add_python.operation, KnowledgeOperation.ADD_ENTITY)
        self.assertEqual(add_python.entity.graph_id, graph_id)

        fetched = await adapter.get_entity(
            EntityLookupRequest(graph_id=graph_id, entity_id="python", actor=self.actor)
        )
        self.assertEqual(fetched.label, "Python")

        listed = await adapter.list_entities(
            EntityLookupRequest(
                graph_id=graph_id,
                actor=self.actor,
                entity_type="language",
                filters={"runtime": "cpython"},
            )
        )
        self.assertEqual([entity.entity_id for entity in listed], ["python"])

        update = await adapter.update_entity(
            EntityMutationRequest(
                graph_id=graph_id,
                actor=self.actor,
                entity=replace(
                    python,
                    properties={"runtime": "pyodide", "year": 1991},
                ),
            )
        )
        self.assertEqual(update.operation, KnowledgeOperation.UPDATE_ENTITY)
        self.assertEqual(update.entity.properties["runtime"], "pyodide")
        self.assertEqual(update.entity.properties["year"], 1991)
        self.assertEqual(update.entity.aliases, ("py",))

        relationship = KnowledgeGraphRelationship(
            relationship_id="python-stores-ipfs",
            source_entity_id="python",
            target_entity_id="ipfs",
            relationship_type="STORES_WITH",
            properties={"confidence": 0.75},
        )
        add_relationship = await adapter.add_relationship(
            RelationshipMutationRequest(
                graph_id=graph_id,
                relationship=relationship,
                actor=self.actor,
            )
        )
        self.assertEqual(add_relationship.operation, KnowledgeOperation.ADD_RELATIONSHIP)
        self.assertEqual(add_relationship.relationship.graph_id, graph_id)

        fetched_relationship = await adapter.get_relationship(
            RelationshipLookupRequest(
                graph_id=graph_id,
                actor=self.actor,
                relationship_id="python-stores-ipfs",
            )
        )
        self.assertEqual(fetched_relationship.relationship_type, "STORES_WITH")

        listed_relationships = await adapter.list_relationships(
            RelationshipLookupRequest(
                graph_id=graph_id,
                actor=self.actor,
                source_entity_id="python",
                filters={"confidence": 0.75},
            )
        )
        self.assertEqual([relationship.relationship_id for relationship in listed_relationships], ["python-stores-ipfs"])

        update_relationship = await adapter.update_relationship(
            RelationshipMutationRequest(
                graph_id=graph_id,
                actor=self.actor,
                relationship=replace(relationship, properties={"confidence": 0.9}),
            )
        )
        self.assertEqual(update_relationship.operation, KnowledgeOperation.UPDATE_RELATIONSHIP)
        self.assertEqual(update_relationship.relationship.properties["confidence"], 0.9)

        delete_relationship = await adapter.delete_relationship(
            RelationshipLookupRequest(
                graph_id=graph_id,
                actor=self.actor,
                relationship_id="python-stores-ipfs",
            )
        )
        self.assertTrue(delete_relationship.ok)
        self.assertIsNone(
            await adapter.get_relationship(
                RelationshipLookupRequest(
                    graph_id=graph_id,
                    actor=self.actor,
                    relationship_id="python-stores-ipfs",
                )
            )
        )

        delete_entity = await adapter.delete_entity(
            EntityLookupRequest(graph_id=graph_id, entity_id="python", actor=self.actor)
        )
        self.assertTrue(delete_entity.ok)
        self.assertEqual(delete_entity.operation, KnowledgeOperation.DELETE_ENTITY)
        self.assertIsNone(
            await adapter.get_entity(
                EntityLookupRequest(graph_id=graph_id, entity_id="python", actor=self.actor)
            )
        )

    async def test_provenance_ledger_and_audit_hooks(self):
        adapter = MockKnowledgeFabricAdapter()
        subject = ResourceRef(
            uri="dataset://manual",
            kind=ResourceKind.DATASET,
            component="ipfs_datasets_py",
        )
        record = ProvenanceRecord(
            record_id="manual-record",
            kind=ProvenanceRecordKind.SOURCE,
            operation=KnowledgeOperation.RECORD_PROVENANCE,
            actor=self.actor,
            subject=subject,
            outputs=(subject,),
            description="manual source imported",
        )

        receipt = await adapter.record_provenance(record)
        self.assertTrue(receipt.ok)
        self.assertIsInstance(receipt, ProvenanceReceipt)
        self.assertEqual(receipt.cid, "bafymanual-record")
        self.assertEqual(await adapter.get_provenance("manual-record"), record)
        self.assertEqual(await adapter.get_provenance("missing"), None)

        trace = await adapter.trace_provenance(subject, depth=2)
        self.assertEqual([item.record_id for item in trace], ["manual-record"])

        hook = AsyncMock()
        hook_id = await adapter.register_audit_hook(hook)
        context = KnowledgeAuditContext(
            phase=AuditPhase.AFTER,
            operation=KnowledgeOperation.RECORD_PROVENANCE,
            actor=self.actor,
            subject=subject,
            result=receipt,
        )
        event = await adapter.emit_audit(context)

        hook.assert_awaited_once_with(context)
        self.assertEqual(event.event_type, "knowledge.record_provenance.after")
        self.assertEqual(event.subject, subject)
        self.assertEqual(event.payload["operation"], "record_provenance")

        await adapter.unregister_audit_hook(hook_id)
        await adapter.emit_audit(context)
        hook.assert_awaited_once()

    async def test_fallback_when_ipfs_datasets_extras_are_unavailable(self):
        import_probe = """
import builtins
import sys
from pathlib import Path

project_root = Path.cwd()
sys.path.insert(0, str(project_root / "python"))
blocked_prefixes = (
    "datasets",
    "faiss",
    "ipfs_datasets_py",
    "networkx",
    "neo4j",
    "numpy",
    "pandas",
    "sentence_transformers",
)
real_import = builtins.__import__

def blocked_import(name, globals=None, locals=None, fromlist=(), level=0):
    if any(name == prefix or name.startswith(f"{prefix}.") for prefix in blocked_prefixes):
        raise ModuleNotFoundError(f"optional dependency blocked for contract test: {name}")
    return real_import(name, globals, locals, fromlist, level)

builtins.__import__ = blocked_import
from hallucinate_app.virtual_os import knowledge

assert hasattr(knowledge, "KnowledgeFabricAdapter")
assert hasattr(knowledge, "DatasetLoadRequest")
"""
        completed = subprocess.run(
            [sys.executable, "-c", import_probe],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)

        adapter = MockKnowledgeFabricAdapter(ipfs_datasets_available=False)
        load_result = await adapter.load_dataset(
            DatasetLoadRequest(
                source="hf://datasets/offline-wiki",
                actor=self.actor,
                dataset_id="offline-wiki",
                mode=DatasetLoadMode.METADATA_ONLY,
            )
        )

        self.assertTrue(load_result.ok)
        self.assertEqual(load_result.dataset.row_count, 0)
        self.assertTrue(load_result.dataset.metadata["fallback"])
        self.assertEqual(load_result.metadata["backend"], "fallback")
        self.assertIn("metadata-only", load_result.message)
        self.assertEqual(load_result.provenance[0].kind, ProvenanceRecordKind.DATASET_LOAD)

        query_result = await adapter.query_graphrag(
            GraphRAGQuery(
                query="What facts are available?",
                actor=self.actor,
                dataset=load_result.dataset,
            )
        )
        self.assertFalse(query_result.ok)
        self.assertEqual(query_result.hits, ())
        self.assertTrue(query_result.metadata["fallback"])
        self.assertIn("extras unavailable", query_result.message)

        vector_result = await adapter.vector_search(
            VectorSearchRequest(
                index_id="offline-wiki-vectors",
                actor=self.actor,
                query_text="offline facts",
            )
        )
        self.assertFalse(vector_result.ok)
        self.assertEqual(vector_result.hits, ())
        self.assertTrue(vector_result.metadata["fallback"])
        self.assertEqual(vector_result.provenance[0].operation, KnowledgeOperation.VECTOR_SEARCH)


if __name__ == "__main__":
    unittest.main()
