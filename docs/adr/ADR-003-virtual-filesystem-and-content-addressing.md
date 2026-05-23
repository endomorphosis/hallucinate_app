# ADR-003: Virtual Filesystem and Content Addressing Contract

- Status: accepted
- Date: 2026-05-22
- Task: OS-009

## Context

ADR-001 defined the Virtual AI OS kernel contract and intentionally left VFS
path, CID, and IPLD semantics to a follow-up task. The storage substrate is
`ipfs_kit_py`, which already exposes POSIX-like VFS operations, IPFS add/cat/ls
operations, IPLD helpers, Arrow and pin metadata indexes, and dataset storage
integration.

Callers need one Hallucinate-owned API that can address the same artifact as:

- A POSIX-like VFS path such as `/datasets/wiki/train.parquet`.
- A content identifier such as `ipfs://<cid>`.
- An IPLD block with codec, bytes, and links.
- A metadata index row that records CID, path, size, MIME type, pin status,
  locations, tags, and properties.
- A dataset artifact with dataset id, version, split, format, schema, row
  counts, and metadata CIDs.

Without a repository-owned contract, agent workflows, dataset loaders, UI
browsers, and tests would have to import unstable or optional `ipfs_kit_py`
objects directly.

## Decision

Define `python/hallucinate_app/virtual_os/vfs.py` as the Virtual AI OS VFS and
content addressing contract. The module remains importable without live IPFS,
PyArrow, or `ipfs_kit_py`; it only composes the stdlib and ADR-001 kernel
payloads.

The contract defines:

- Address and operation enums: `VFSAddressKind`, `VFSNodeKind`,
  `VFSOperation`, and `IPLDCodec`.
- Normalized path and URI helpers: `normalize_vfs_path`, `path_uri`,
  `cid_uri`, `metadata_row_uri`, and `dataset_uri`.
- Content addressing helpers: `raw_cid_v1_sha256` for deterministic local
  fallback CIDs when tests or offline adapters add bytes without a live backend.
- Payloads for every accepted addressing shape: `VFSPath`, `IPLDLink`,
  `IPLDBlock`, `MetadataIndexRow`, `DatasetArtifact`, `VFSRef`, and `VFSNode`.
- Request and result payloads: `VFSAddRequest`, `VFSCatRequest`,
  `VFSStatRequest`, `VFSListRequest`, `VFSLinkRequest`, `VFSDeleteRequest`, and
  `VFSOperationResult`.
- A runtime-checkable `VirtualFilesystem` Protocol with `add`, `cat`, `stat`,
  `list`, `link`, `delete`, and `resolve`.
- `IPFSKitVFSAdapter`, a duck-typed adapter that can be backed by injected
  `ipfs_kit_py` VFS manager, high-level API, metadata index, and dataset manager
  instances.

All concrete operations normalize native backend outputs into `VFSOperationResult`
and can project results back into ADR-001 `StorageRef` and `StorageResult`
objects. Metadata registration supports common `ipfs_kit_py` index surfaces
such as `add`, `add_record`, `add_entry`, `get_by_cid`, `lookup_by_cid`,
`lookup_by_path`, `query`, and `delete_by_cid`.

## Boundaries

The contract does not define a new filesystem implementation, daemon lifecycle,
pin replication policy, CAR import/export format, GraphRAG behavior, or UI
browser state. Those remain owned by `ipfs_kit_py`, daemon tasks, knowledge
fabric tasks, and UI tasks.

Adapters must treat VFS paths as logical POSIX-like names, not host filesystem
paths. `normalize_vfs_path` rejects traversal above `/`. CIDs remain immutable
content identities; path links are mutable metadata bindings to those
identities.

Dataset artifacts are represented as storage artifacts in this module, while
dataset loading, GraphRAG, graph, vector search, provenance, and audit behavior
remain in the dedicated knowledge fabric contract.

## Consequences

OS-010 can add offline tests for add, cat, stat, list, metadata lookup, missing
backend fallback, and content-addressed idempotence using mocks against one
importable module.

Component adapters can continue using native `ipfs_kit_py` VFS, IPFS, IPLD,
Arrow metadata, and dataset APIs internally, but callers receive one stable
Virtual AI OS result shape. The deterministic fallback CID helper lets contract
tests verify content-addressed behavior without starting an IPFS daemon.
