"""Knowledge fabric contracts for the Hallucinate Virtual AI OS.

The contract is intentionally stdlib-only. Adapters for ``ipfs_datasets_py``
GraphRAG, knowledge graph, vector store, provenance, and audit APIs should
normalize native objects into these payloads at the component boundary.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Protocol, TypeAlias, runtime_checkable

from .contracts import (
    CapabilityGrant,
    EventEnvelope,
    EventSeverity,
    IdentityRef,
    MaybeAwaitable,
    Metadata,
    ResourceKind,
    ResourceRef,
    StorageRef,
    utc_now,
)


Vector: TypeAlias = Sequence[float]
GraphProperties: TypeAlias = Mapping[str, Any]


class KnowledgeOperation(str, Enum):
    """Capability-scoped operations exposed by the knowledge fabric."""

    LOAD_DATASET = "load_dataset"
    QUERY_GRAPHRAG = "query_graphrag"
    ADD_ENTITY = "add_entity"
    GET_ENTITY = "get_entity"
    UPDATE_ENTITY = "update_entity"
    DELETE_ENTITY = "delete_entity"
    ADD_RELATIONSHIP = "add_relationship"
    GET_RELATIONSHIP = "get_relationship"
    UPDATE_RELATIONSHIP = "update_relationship"
    DELETE_RELATIONSHIP = "delete_relationship"
    VECTOR_SEARCH = "vector_search"
    RECORD_PROVENANCE = "record_provenance"
    EMIT_AUDIT = "emit_audit"


class DatasetLoadMode(str, Enum):
    """Dataset loading strategies an adapter may support."""

    METADATA_ONLY = "metadata_only"
    LAZY = "lazy"
    MATERIALIZE = "materialize"
    STREAM = "stream"


class GraphRAGQueryMode(str, Enum):
    """Query modes normalized across GraphRAG backends."""

    NATURAL_LANGUAGE = "natural_language"
    IR = "ir"
    CYPHER = "cypher"
    SPARQL = "sparql"
    GREMLIN = "gremlin"
    SEMANTIC = "semantic"
    HYBRID = "hybrid"


class GraphRelationshipDirection(str, Enum):
    """Traversal direction for relationship lookup and GraphRAG expansion."""

    OUTGOING = "outgoing"
    INCOMING = "incoming"
    BOTH = "both"


class VectorDistanceMetric(str, Enum):
    """Distance metrics commonly used by vector indexes."""

    COSINE = "cosine"
    DOT = "dot"
    EUCLIDEAN = "euclidean"
    MANHATTAN = "manhattan"
    HAMMING = "hamming"


class ProvenanceRecordKind(str, Enum):
    """Kinds of provenance records emitted by knowledge fabric operations."""

    SOURCE = "source"
    DATASET_LOAD = "dataset_load"
    GRAPH_MUTATION = "graph_mutation"
    QUERY = "query"
    VECTOR_SEARCH = "vector_search"
    RESULT = "result"
    TRANSFORMATION = "transformation"
    CHECKPOINT = "checkpoint"


class AuditPhase(str, Enum):
    """Phase passed to knowledge audit hooks."""

    BEFORE = "before"
    AFTER = "after"
    ERROR = "error"


@dataclass(frozen=True)
class DatasetRef:
    """Loaded or loadable dataset reference."""

    dataset_id: str
    uri: str
    name: str | None = None
    version: str | None = None
    cid: str | None = None
    split: str | None = None
    format: str | None = None
    schema: Metadata = field(default_factory=dict)
    row_count: int | None = None
    storage_refs: tuple[StorageRef, ...] = ()
    loaded_at: datetime | None = None
    metadata: Metadata = field(default_factory=dict)

    def resource(self) -> ResourceRef:
        """Return the dataset as a capability and provenance resource."""
        return ResourceRef(
            uri=self.uri,
            kind=ResourceKind.DATASET,
            component="ipfs_datasets_py",
            name=self.name or self.dataset_id,
            metadata={
                "dataset_id": self.dataset_id,
                "version": self.version,
                "cid": self.cid,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class DatasetLoadRequest:
    """Capability-scoped request to load or register a dataset."""

    source: ResourceRef | StorageRef | str
    actor: IdentityRef
    dataset_id: str | None = None
    name: str | None = None
    version: str | None = None
    split: str | None = None
    mode: DatasetLoadMode | str = DatasetLoadMode.LAZY
    capabilities: tuple[CapabilityGrant, ...] = ()
    options: Metadata = field(default_factory=dict)
    audit: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ProvenanceRecord:
    """Portable lineage record for dataset, graph, search, and query work."""

    record_id: str
    kind: ProvenanceRecordKind | str
    operation: KnowledgeOperation | str
    actor: IdentityRef | None = None
    subject: ResourceRef | None = None
    inputs: tuple[ResourceRef, ...] = ()
    outputs: tuple[ResourceRef, ...] = ()
    occurred_at: datetime = field(default_factory=utc_now)
    description: str = ""
    parameters: Metadata = field(default_factory=dict)
    parents: tuple[str, ...] = ()
    event_ids: tuple[str, ...] = ()
    cid: str | None = None
    signature: str | None = None
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ProvenanceReceipt:
    """Acknowledgement returned after a provenance record is persisted."""

    record: ProvenanceRecord
    ok: bool = True
    cid: str | None = None
    stored_at: datetime = field(default_factory=utc_now)
    message: str = ""
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class DatasetLoadResult:
    """Result of loading or registering a dataset."""

    dataset: DatasetRef
    ok: bool = True
    message: str = ""
    graph_id: str | None = None
    vector_index_ids: tuple[str, ...] = ()
    provenance: tuple[ProvenanceRecord, ...] = ()
    audit_events: tuple[EventEnvelope, ...] = ()
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class KnowledgeGraphEntity:
    """Normalized knowledge graph node."""

    entity_id: str
    entity_type: str
    label: str | None = None
    graph_id: str | None = None
    aliases: tuple[str, ...] = ()
    properties: GraphProperties = field(default_factory=dict)
    source_refs: tuple[ResourceRef, ...] = ()
    provenance_ids: tuple[str, ...] = ()
    created_at: datetime | None = None
    updated_at: datetime | None = None
    metadata: Metadata = field(default_factory=dict)

    def resource(self) -> ResourceRef:
        """Return this entity as a resource reference."""
        graph_prefix = self.graph_id or "default"
        return ResourceRef(
            uri=f"knowledge://graph/{graph_prefix}/entity/{self.entity_id}",
            kind="knowledge_entity",
            component="ipfs_datasets_py",
            name=self.label or self.entity_id,
            metadata={
                "graph_id": self.graph_id,
                "entity_type": self.entity_type,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class KnowledgeGraphRelationship:
    """Normalized knowledge graph edge."""

    relationship_id: str
    source_entity_id: str
    target_entity_id: str
    relationship_type: str
    graph_id: str | None = None
    properties: GraphProperties = field(default_factory=dict)
    source_refs: tuple[ResourceRef, ...] = ()
    provenance_ids: tuple[str, ...] = ()
    created_at: datetime | None = None
    updated_at: datetime | None = None
    metadata: Metadata = field(default_factory=dict)

    def resource(self) -> ResourceRef:
        """Return this relationship as a resource reference."""
        graph_prefix = self.graph_id or "default"
        return ResourceRef(
            uri=f"knowledge://graph/{graph_prefix}/relationship/{self.relationship_id}",
            kind="knowledge_relationship",
            component="ipfs_datasets_py",
            name=self.relationship_type,
            metadata={
                "graph_id": self.graph_id,
                "source_entity_id": self.source_entity_id,
                "target_entity_id": self.target_entity_id,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class EntityLookupRequest:
    """Request to retrieve, list, or delete knowledge graph entities."""

    graph_id: str
    actor: IdentityRef
    entity_id: str | None = None
    entity_type: str | None = None
    filters: Metadata = field(default_factory=dict)
    limit: int | None = None
    capabilities: tuple[CapabilityGrant, ...] = ()
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class EntityMutationRequest:
    """Request to add or update a knowledge graph entity."""

    graph_id: str
    entity: KnowledgeGraphEntity
    actor: IdentityRef
    capabilities: tuple[CapabilityGrant, ...] = ()
    merge: bool = True
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class RelationshipLookupRequest:
    """Request to retrieve, list, or delete knowledge graph relationships."""

    graph_id: str
    actor: IdentityRef
    relationship_id: str | None = None
    source_entity_id: str | None = None
    target_entity_id: str | None = None
    relationship_type: str | None = None
    direction: GraphRelationshipDirection | str = GraphRelationshipDirection.BOTH
    filters: Metadata = field(default_factory=dict)
    limit: int | None = None
    capabilities: tuple[CapabilityGrant, ...] = ()
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class RelationshipMutationRequest:
    """Request to add or update a knowledge graph relationship."""

    graph_id: str
    relationship: KnowledgeGraphRelationship
    actor: IdentityRef
    capabilities: tuple[CapabilityGrant, ...] = ()
    merge: bool = True
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class GraphMutationResult:
    """Result of a graph entity or relationship mutation."""

    ok: bool
    operation: KnowledgeOperation | str
    graph_id: str
    entity: KnowledgeGraphEntity | None = None
    relationship: KnowledgeGraphRelationship | None = None
    message: str = ""
    provenance: tuple[ProvenanceRecord, ...] = ()
    audit_events: tuple[EventEnvelope, ...] = ()
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class KnowledgeSearchHit:
    """A ranked result from GraphRAG, graph, or vector retrieval."""

    hit_id: str
    score: float | None = None
    text: str | None = None
    ref: ResourceRef | StorageRef | None = None
    entity: KnowledgeGraphEntity | None = None
    relationship: KnowledgeGraphRelationship | None = None
    vector_id: str | None = None
    rank: int | None = None
    distance: float | None = None
    provenance_ids: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class GraphRAGQuery:
    """Capability-scoped GraphRAG query request."""

    query: str
    actor: IdentityRef
    dataset: DatasetRef | None = None
    graph_id: str | None = None
    mode: GraphRAGQueryMode | str = GraphRAGQueryMode.NATURAL_LANGUAGE
    top_k: int = 10
    filters: Metadata = field(default_factory=dict)
    parameters: Metadata = field(default_factory=dict)
    include_answer: bool = True
    include_entities: bool = True
    include_relationships: bool = True
    include_provenance: bool = True
    capabilities: tuple[CapabilityGrant, ...] = ()
    trace_id: str | None = None
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class GraphRAGResult:
    """Normalized GraphRAG query response."""

    query: GraphRAGQuery
    ok: bool = True
    answer: str | None = None
    hits: tuple[KnowledgeSearchHit, ...] = ()
    entities: tuple[KnowledgeGraphEntity, ...] = ()
    relationships: tuple[KnowledgeGraphRelationship, ...] = ()
    provenance: tuple[ProvenanceRecord, ...] = ()
    audit_events: tuple[EventEnvelope, ...] = ()
    message: str = ""
    stats: Metadata = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class VectorSearchRequest:
    """Capability-scoped vector search request."""

    index_id: str
    actor: IdentityRef
    query_vector: tuple[float, ...] = ()
    query_text: str | None = None
    dataset: DatasetRef | None = None
    top_k: int = 10
    metric: VectorDistanceMetric | str = VectorDistanceMetric.COSINE
    min_score: float | None = None
    filters: Metadata = field(default_factory=dict)
    include_vectors: bool = False
    include_metadata: bool = True
    capabilities: tuple[CapabilityGrant, ...] = ()
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class VectorSearchResult:
    """Normalized vector search response."""

    request: VectorSearchRequest
    ok: bool = True
    hits: tuple[KnowledgeSearchHit, ...] = ()
    message: str = ""
    provenance: tuple[ProvenanceRecord, ...] = ()
    audit_events: tuple[EventEnvelope, ...] = ()
    stats: Metadata = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class KnowledgeAuditContext:
    """Context passed to audit hooks before and after knowledge operations."""

    phase: AuditPhase | str
    operation: KnowledgeOperation | str
    actor: IdentityRef
    subject: ResourceRef | None = None
    request: Any | None = None
    result: Any | None = None
    error: str | None = None
    occurred_at: datetime = field(default_factory=utc_now)
    trace_id: str | None = None
    metadata: Metadata = field(default_factory=dict)


KnowledgeAuditHook: TypeAlias = Callable[[KnowledgeAuditContext], MaybeAwaitable[None]]


def knowledge_audit_event(
    context: KnowledgeAuditContext,
    *,
    source: str = "knowledge-fabric",
    severity: EventSeverity | str = EventSeverity.INFO,
    payload: Metadata | None = None,
) -> EventEnvelope:
    """Build a normalized audit event from a knowledge audit context."""
    phase = context.phase.value if isinstance(context.phase, AuditPhase) else context.phase
    operation = (
        context.operation.value
        if isinstance(context.operation, KnowledgeOperation)
        else context.operation
    )
    return EventEnvelope(
        event_id=f"{source}:{operation}:{phase}:{context.occurred_at.isoformat()}",
        event_type=f"knowledge.{operation}.{phase}",
        source=source,
        occurred_at=context.occurred_at,
        severity=severity,
        actor=context.actor,
        subject=context.subject,
        trace_id=context.trace_id,
        payload=dict(payload or {}),
        metadata=dict(context.metadata),
    )


@runtime_checkable
class DatasetLoader(Protocol):
    """Dataset loading boundary implemented by knowledge fabric adapters."""

    def load_dataset(self, request: DatasetLoadRequest) -> MaybeAwaitable[DatasetLoadResult]:
        """Load, register, or resolve a dataset for GraphRAG and vector search."""


@runtime_checkable
class GraphRAGQueryAdapter(Protocol):
    """GraphRAG query boundary."""

    def query_graphrag(self, query: GraphRAGQuery) -> MaybeAwaitable[GraphRAGResult]:
        """Execute a GraphRAG query and return normalized answer, hits, and lineage."""


@runtime_checkable
class KnowledgeGraphAdapter(Protocol):
    """Knowledge graph entity and relationship operation boundary."""

    def add_entity(self, request: EntityMutationRequest) -> MaybeAwaitable[GraphMutationResult]:
        """Add an entity to a graph."""

    def get_entity(self, request: EntityLookupRequest) -> MaybeAwaitable[KnowledgeGraphEntity | None]:
        """Return one entity or ``None`` when it is not found."""

    def list_entities(self, request: EntityLookupRequest) -> MaybeAwaitable[Sequence[KnowledgeGraphEntity]]:
        """List graph entities matching the request filters."""

    def update_entity(self, request: EntityMutationRequest) -> MaybeAwaitable[GraphMutationResult]:
        """Update or merge an existing entity."""

    def delete_entity(self, request: EntityLookupRequest) -> MaybeAwaitable[GraphMutationResult]:
        """Delete an entity when authorized."""

    def add_relationship(
        self,
        request: RelationshipMutationRequest,
    ) -> MaybeAwaitable[GraphMutationResult]:
        """Add a relationship between entities."""

    def get_relationship(
        self,
        request: RelationshipLookupRequest,
    ) -> MaybeAwaitable[KnowledgeGraphRelationship | None]:
        """Return one relationship or ``None`` when it is not found."""

    def list_relationships(
        self,
        request: RelationshipLookupRequest,
    ) -> MaybeAwaitable[Sequence[KnowledgeGraphRelationship]]:
        """List graph relationships matching the request filters."""

    def update_relationship(
        self,
        request: RelationshipMutationRequest,
    ) -> MaybeAwaitable[GraphMutationResult]:
        """Update or merge an existing relationship."""

    def delete_relationship(self, request: RelationshipLookupRequest) -> MaybeAwaitable[GraphMutationResult]:
        """Delete a relationship when authorized."""


@runtime_checkable
class VectorSearchAdapter(Protocol):
    """Vector index lookup boundary."""

    def vector_search(self, request: VectorSearchRequest) -> MaybeAwaitable[VectorSearchResult]:
        """Search a vector index and return normalized hits with provenance."""


@runtime_checkable
class ProvenanceLedger(Protocol):
    """Provenance persistence and traversal boundary."""

    def record_provenance(self, record: ProvenanceRecord) -> MaybeAwaitable[ProvenanceReceipt]:
        """Persist one provenance record."""

    def get_provenance(self, record_id: str) -> MaybeAwaitable[ProvenanceRecord | None]:
        """Resolve one provenance record by id."""

    def trace_provenance(
        self,
        subject: ResourceRef,
        *,
        depth: int | None = None,
    ) -> MaybeAwaitable[Sequence[ProvenanceRecord]]:
        """Return provenance records linked to a resource."""


@runtime_checkable
class KnowledgeAuditEmitter(Protocol):
    """Audit hook boundary for knowledge operations."""

    def register_audit_hook(self, hook: KnowledgeAuditHook) -> MaybeAwaitable[str]:
        """Register an audit hook and return a subscription id."""

    def unregister_audit_hook(self, hook_id: str) -> MaybeAwaitable[None]:
        """Remove a registered audit hook."""

    def emit_audit(self, context: KnowledgeAuditContext) -> MaybeAwaitable[EventEnvelope]:
        """Emit an audit event for a knowledge operation."""


@runtime_checkable
class KnowledgeFabricAdapter(
    DatasetLoader,
    GraphRAGQueryAdapter,
    KnowledgeGraphAdapter,
    VectorSearchAdapter,
    ProvenanceLedger,
    KnowledgeAuditEmitter,
    Protocol,
):
    """Complete knowledge fabric contract implemented by dataset adapters."""


__all__ = [
    "AuditPhase",
    "DatasetLoadMode",
    "DatasetLoadRequest",
    "DatasetLoadResult",
    "DatasetLoader",
    "DatasetRef",
    "EntityLookupRequest",
    "EntityMutationRequest",
    "GraphMutationResult",
    "GraphProperties",
    "GraphRAGQuery",
    "GraphRAGQueryAdapter",
    "GraphRAGQueryMode",
    "GraphRAGResult",
    "GraphRelationshipDirection",
    "KnowledgeAuditContext",
    "KnowledgeAuditEmitter",
    "KnowledgeAuditHook",
    "KnowledgeFabricAdapter",
    "KnowledgeGraphAdapter",
    "KnowledgeGraphEntity",
    "KnowledgeGraphRelationship",
    "KnowledgeOperation",
    "KnowledgeSearchHit",
    "ProvenanceLedger",
    "ProvenanceReceipt",
    "ProvenanceRecord",
    "ProvenanceRecordKind",
    "RelationshipLookupRequest",
    "RelationshipMutationRequest",
    "Vector",
    "VectorDistanceMetric",
    "VectorSearchAdapter",
    "VectorSearchRequest",
    "VectorSearchResult",
    "knowledge_audit_event",
]
