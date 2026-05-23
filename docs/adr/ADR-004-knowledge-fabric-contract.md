# ADR-004: Knowledge Fabric Contract

- Status: accepted
- Date: 2026-05-22
- Task: OS-011

## Context

ADR-001 established that Hallucinate App owns the Virtual AI OS contracts while
submodules keep their native APIs. The next P0 boundary is the knowledge fabric
served by `ipfs_datasets_py`: dataset loading, GraphRAG, knowledge graph
operations, vector search, provenance, and audit logging.

The `ipfs_datasets_py` submodule exposes these capabilities through several
different implementation surfaces: package-level dataset loading, MCP graph
tools, core knowledge graph managers, vector store APIs, GraphRAG processors,
and provenance/audit modules. Those APIs are valuable but not stable enough to
be imported directly by Hallucinate App callers, daemon workflows, or cross
component tests.

## Decision

Define `python/hallucinate_app/virtual_os/knowledge.py` as the repository-owned
knowledge fabric contract. Like the kernel contract, it is a pure Python
standard library module composed from ADR-001 payloads such as `IdentityRef`,
`ResourceRef`, `StorageRef`, `CapabilityGrant`, `EventEnvelope`, and
`MaybeAwaitable`.

The contract defines immutable payloads and runtime-checkable Protocols for:

- Dataset loading: `DatasetRef`, `DatasetLoadRequest`, `DatasetLoadResult`, and
  `DatasetLoader`.
- GraphRAG query: `GraphRAGQuery`, `GraphRAGResult`,
  `GraphRAGQueryAdapter`, query modes, ranked hits, and returned graph context.
- Knowledge graph operations: `KnowledgeGraphEntity`,
  `KnowledgeGraphRelationship`, entity and relationship lookup/mutation
  requests, `GraphMutationResult`, and `KnowledgeGraphAdapter`.
- Vector search: `VectorSearchRequest`, `VectorSearchResult`,
  `VectorDistanceMetric`, and `VectorSearchAdapter`.
- Provenance: `ProvenanceRecord`, `ProvenanceReceipt`,
  `ProvenanceRecordKind`, and `ProvenanceLedger`.
- Audit hooks: `KnowledgeAuditContext`, `KnowledgeAuditHook`,
  `KnowledgeAuditEmitter`, `AuditPhase`, and the `knowledge_audit_event`
  helper.
- Full adapter surface: `KnowledgeFabricAdapter`, which composes dataset,
  GraphRAG, graph, vector search, provenance, and audit Protocols.

All operations carry an actor and capability grants at request boundaries where
authorization matters. Results can return provenance records and audit event
envelopes without requiring a live audit service in fast contract tests.

## Boundaries

This contract does not import `ipfs_datasets_py`, Hugging Face `datasets`,
NetworkX, vector database clients, Neo4j, FAISS, Elasticsearch, or MCP server
tool modules. Adapters must convert native backend objects into the contract
payloads at the boundary.

The contract intentionally avoids:

- Choosing a single GraphRAG backend or graph query language.
- Mandating one vector index implementation or embedding model.
- Defining persistence formats for provenance ledgers.
- Owning daemon launch, MCP++ transport, or UI descriptor behavior.
- Replacing the later dedicated provenance ledger task.

## Consequences

OS-012 can test dataset load, GraphRAG query shape, graph entity CRUD, vector
search, provenance emission, and missing-extra fallback behavior using mocks
against one importable contract module.

Knowledge adapters can support synchronous package APIs, asynchronous MCP tools,
or daemon services behind the same Protocols because methods return
`MaybeAwaitable[T]`. The contract also gives security and workflow tasks a
stable place to attach capability checks, provenance receipts, and audit hooks
before live graph, vector, or dataset dependencies are available.
