"""Virtual filesystem and content addressing contract.

This module defines the Hallucinate-owned VFS boundary used by Virtual AI OS
storage callers. It stays importable without ``ipfs_kit_py`` installed, while
``IPFSKitVFSAdapter`` can bind the same payloads to ipfs_kit_py VFS, IPFS,
IPLD, metadata index, and dataset APIs.
"""

from __future__ import annotations

import base64
import hashlib
import inspect
import posixpath
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Protocol, runtime_checkable

from .contracts import (
    CapabilityGrant,
    EventEnvelope,
    IdentityRef,
    MaybeAwaitable,
    Metadata,
    ResourceKind,
    ResourceRef,
    StorageRef,
    StorageResult,
    utc_now,
)


class VFSContractError(Exception):
    """Base error raised by VFS contract helpers and adapters."""


class VFSPathError(VFSContractError):
    """Raised when a virtual path is empty or attempts to escape root."""


class VFSAddressKind(str, Enum):
    """Kinds of addresses normalized by the virtual filesystem."""

    PATH = "path"
    CID = "cid"
    IPLD_BLOCK = "ipld_block"
    METADATA_ROW = "metadata_row"
    DATASET_ARTIFACT = "dataset_artifact"


class VFSNodeKind(str, Enum):
    """Portable node kinds returned by VFS stat and list operations."""

    FILE = "file"
    DIRECTORY = "directory"
    SYMLINK = "symlink"
    IPLD_BLOCK = "ipld_block"
    METADATA_ROW = "metadata_row"
    DATASET = "dataset"
    UNKNOWN = "unknown"


class VFSOperation(str, Enum):
    """Canonical VFS operations exposed to callers and tests."""

    ADD = "add"
    CAT = "cat"
    STAT = "stat"
    LIST = "list"
    LINK = "link"
    DELETE = "delete"
    RESOLVE = "resolve"
    REGISTER_DATASET = "register_dataset"
    PUT_BLOCK = "put_block"


class IPLDCodec(str, Enum):
    """IPLD codecs the contract needs to name before backend adaptation."""

    RAW = "raw"
    DAG_PB = "dag-pb"
    DAG_CBOR = "dag-cbor"
    DAG_JSON = "dag-json"
    UNIXFS = "unixfs"
    CAR = "car"


_CIDV1_CODEC_CODES: Mapping[str, int] = {
    IPLDCodec.RAW.value: 0x55,
    IPLDCodec.DAG_PB.value: 0x70,
    IPLDCodec.DAG_CBOR.value: 0x71,
    IPLDCodec.DAG_JSON.value: 0x0129,
}


def normalize_vfs_path(path: str) -> str:
    """Normalize a POSIX-like VFS path and reject traversal above root."""
    if path is None:
        raise VFSPathError("VFS path cannot be None")

    raw_path = str(path).strip()
    if not raw_path:
        raise VFSPathError("VFS path cannot be empty")

    if raw_path.startswith("vfs://"):
        raw_path = raw_path[len("vfs://") :]
    if not raw_path.startswith("/"):
        raw_path = f"/{raw_path}"

    parts: list[str] = []
    for part in raw_path.split("/"):
        if part in {"", "."}:
            continue
        if part == "..":
            if not parts:
                raise VFSPathError(f"VFS path escapes root: {path}")
            parts.pop()
            continue
        parts.append(part)

    return "/" + "/".join(parts)


def path_uri(path: str) -> str:
    """Return the canonical URI for a normalized VFS path."""
    return f"vfs://{normalize_vfs_path(path)}"


def cid_uri(cid: str) -> str:
    """Return the canonical URI for a CID reference."""
    cid_value = str(cid).strip()
    if not cid_value:
        raise ValueError("CID cannot be empty")
    return f"ipfs://{cid_value}"


def dataset_uri(dataset_id: str, version: str | None = None) -> str:
    """Return the canonical URI for a dataset artifact."""
    dataset_value = str(dataset_id).strip()
    if not dataset_value:
        raise ValueError("dataset_id cannot be empty")
    if version:
        return f"dataset://{dataset_value}@{version}"
    return f"dataset://{dataset_value}"


def metadata_row_uri(cid: str | None = None, path: str | None = None) -> str:
    """Return a stable URI for a metadata index row."""
    if cid:
        return f"metadata-index://cid/{cid}"
    if path:
        return f"metadata-index://path{normalize_vfs_path(path)}"
    raise ValueError("metadata row URI requires cid or path")


def _unsigned_varint(value: int) -> bytes:
    """Encode a non-negative integer as an unsigned varint."""
    if value < 0:
        raise ValueError("varint value must be non-negative")

    out = bytearray()
    while value >= 0x80:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    out.append(value)
    return bytes(out)


def raw_cid_v1_sha256(payload: bytes, *, codec: IPLDCodec | str = IPLDCodec.RAW) -> str:
    """Create a deterministic CIDv1 string for local fallback content."""
    codec_value = codec.value if isinstance(codec, IPLDCodec) else str(codec)
    codec_code = _CIDV1_CODEC_CODES.get(codec_value, _CIDV1_CODEC_CODES[IPLDCodec.RAW.value])
    digest = hashlib.sha256(payload).digest()
    cid_bytes = (
        _unsigned_varint(1)
        + _unsigned_varint(codec_code)
        + _unsigned_varint(0x12)
        + _unsigned_varint(len(digest))
        + digest
    )
    encoded = base64.b32encode(cid_bytes).decode("ascii").lower().rstrip("=")
    return f"b{encoded}"


@dataclass(frozen=True)
class VFSPath:
    """Normalized POSIX-like path in the virtual filesystem namespace."""

    path: str
    namespace: str = "default"
    mount: str = "/"

    def __post_init__(self) -> None:
        object.__setattr__(self, "path", normalize_vfs_path(self.path))

    @property
    def uri(self) -> str:
        return path_uri(self.path)

    @property
    def name(self) -> str:
        return posixpath.basename(self.path.rstrip("/")) or "/"

    @property
    def parent(self) -> str:
        return normalize_vfs_path(posixpath.dirname(self.path.rstrip("/")) or "/")


@dataclass(frozen=True)
class IPLDLink:
    """A link from one IPLD block to another CID."""

    cid: str
    name: str | None = None
    size_bytes: int | None = None
    codec: IPLDCodec | str | None = None
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class IPLDBlock:
    """A normalized IPLD block reference and optional bytes payload."""

    cid: str | None = None
    codec: IPLDCodec | str = IPLDCodec.RAW
    data: bytes | None = None
    links: tuple[IPLDLink, ...] = ()
    size_bytes: int | None = None
    multihash: str | None = None
    metadata: Metadata = field(default_factory=dict)

    def with_computed_cid(self) -> "IPLDBlock":
        """Return this block with a deterministic CID when bytes are available."""
        if self.cid or self.data is None:
            return self
        return IPLDBlock(
            cid=raw_cid_v1_sha256(self.data, codec=self.codec),
            codec=self.codec,
            data=self.data,
            links=self.links,
            size_bytes=self.size_bytes if self.size_bytes is not None else len(self.data),
            multihash=self.multihash,
            metadata=self.metadata,
        )


@dataclass(frozen=True)
class MetadataIndexRow:
    """Portable row shape for ipfs_kit_py Arrow or pin metadata indexes."""

    cid: str
    path: str | None = None
    size_bytes: int | None = None
    mime_type: str | None = None
    blocks: int | None = None
    links: int | None = None
    local: bool | None = None
    pinned: bool | None = None
    pin_types: tuple[str, ...] = ()
    replication: int | None = None
    created_at: datetime | None = None
    last_accessed: datetime | None = None
    access_count: int | None = None
    tags: tuple[str, ...] = ()
    storage_locations: Metadata = field(default_factory=dict)
    properties: Metadata = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.cid:
            raise ValueError("metadata index row requires a CID")
        if self.path is not None:
            object.__setattr__(self, "path", normalize_vfs_path(self.path))

    @property
    def uri(self) -> str:
        return metadata_row_uri(cid=self.cid)

    def to_mapping(self) -> dict[str, Any]:
        """Return a dict compatible with common ipfs_kit_py metadata indexes."""
        return {
            "cid": self.cid,
            "path": self.path,
            "size_bytes": self.size_bytes,
            "mime_type": self.mime_type,
            "mimetype": self.mime_type,
            "blocks": self.blocks,
            "links": self.links,
            "local": self.local,
            "pinned": self.pinned,
            "pin_types": list(self.pin_types),
            "replication": self.replication,
            "created_at": self.created_at,
            "last_accessed": self.last_accessed,
            "access_count": self.access_count,
            "tags": list(self.tags),
            "storage_locations": dict(self.storage_locations),
            "locations": dict(self.storage_locations),
            "properties": dict(self.properties),
            "metadata": dict(self.metadata),
        }


@dataclass(frozen=True)
class DatasetArtifact:
    """Dataset artifact stored by IPFS and registered for AI/ML workflows."""

    dataset_id: str
    cid: str | None = None
    name: str | None = None
    version: str | None = None
    path: str | None = None
    split: str | None = None
    format: str | None = None
    schema: Metadata = field(default_factory=dict)
    row_count: int | None = None
    column_count: int | None = None
    size_bytes: int | None = None
    metadata_cid: str | None = None
    metadata: Metadata = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.dataset_id:
            raise ValueError("dataset artifact requires dataset_id")
        if self.path is not None:
            object.__setattr__(self, "path", normalize_vfs_path(self.path))

    @property
    def uri(self) -> str:
        return dataset_uri(self.dataset_id, self.version)

    def to_metadata(self) -> dict[str, Any]:
        """Return metadata suitable for ipfs_kit_py dataset registration."""
        metadata = {
            "name": self.name or self.dataset_id,
            "version": self.version,
            "split": self.split,
            "format": self.format,
            "schema": dict(self.schema),
            "rows": self.row_count,
            "columns": self.column_count,
            "size_bytes": self.size_bytes,
            "metadata_cid": self.metadata_cid,
            **dict(self.metadata),
        }
        return {key: value for key, value in metadata.items() if value is not None}

    def to_storage_ref(self) -> StorageRef:
        """Return this dataset as a storage reference."""
        return StorageRef(
            uri=self.uri,
            cid=self.cid,
            path=self.path,
            size_bytes=self.size_bytes,
            media_type=self.format,
            metadata={
                "dataset_id": self.dataset_id,
                "name": self.name,
                "version": self.version,
                "split": self.split,
                "metadata_cid": self.metadata_cid,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class VFSRef:
    """One reference type for paths, CIDs, blocks, index rows, and datasets."""

    kind: VFSAddressKind | str
    uri: str
    path: str | None = None
    cid: str | None = None
    block: IPLDBlock | None = None
    metadata_row: MetadataIndexRow | None = None
    dataset: DatasetArtifact | None = None
    metadata: Metadata = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.path is not None:
            object.__setattr__(self, "path", normalize_vfs_path(self.path))

    def to_storage_ref(self) -> StorageRef:
        """Project this VFS ref into the kernel storage contract."""
        dataset = self.dataset
        if dataset is not None:
            return dataset.to_storage_ref()
        return StorageRef(
            uri=self.uri,
            cid=self.cid,
            path=self.path,
            size_bytes=self.block.size_bytes if self.block else None,
            media_type=self.block.codec if self.block else None,
            metadata=dict(self.metadata),
        )

    def resource(self) -> ResourceRef:
        """Return a resource reference for capability and provenance checks."""
        return ResourceRef(
            uri=self.uri,
            kind=ResourceKind.STORAGE,
            component="ipfs_kit_py",
            name=self.path or self.cid or (self.dataset.dataset_id if self.dataset else None),
            metadata={
                "vfs_kind": self.kind.value if isinstance(self.kind, VFSAddressKind) else self.kind,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class VFSNode:
    """Resolved VFS node with content addressing and metadata index context."""

    ref: VFSRef
    node_kind: VFSNodeKind | str = VFSNodeKind.UNKNOWN
    size_bytes: int | None = None
    name: str | None = None
    media_type: str | None = None
    created_at: datetime | None = None
    modified_at: datetime | None = None
    metadata_row: MetadataIndexRow | None = None
    dataset: DatasetArtifact | None = None
    links: tuple[IPLDLink, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    def to_storage_ref(self) -> StorageRef:
        """Return this node as a kernel storage reference."""
        ref = self.ref.to_storage_ref()
        return StorageRef(
            uri=ref.uri,
            cid=ref.cid,
            path=ref.path,
            size_bytes=self.size_bytes if self.size_bytes is not None else ref.size_bytes,
            media_type=self.media_type or ref.media_type,
            metadata={
                **dict(ref.metadata),
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class VFSAddRequest:
    """Write bytes, an IPLD block, metadata row, or dataset artifact."""

    ref: VFSRef
    actor: IdentityRef
    payload: bytes | None = None
    capabilities: tuple[CapabilityGrant, ...] = ()
    pin: bool = True
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class VFSCatRequest:
    """Read bytes from a path, CID, block, or dataset artifact."""

    ref: VFSRef
    actor: IdentityRef
    capabilities: tuple[CapabilityGrant, ...] = ()
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class VFSStatRequest:
    """Resolve metadata for a VFS reference without requiring payload bytes."""

    ref: VFSRef
    actor: IdentityRef
    capabilities: tuple[CapabilityGrant, ...] = ()
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class VFSListRequest:
    """List child nodes under a path or CID."""

    ref: VFSRef
    actor: IdentityRef
    capabilities: tuple[CapabilityGrant, ...] = ()
    recursive: bool = False
    limit: int | None = None
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class VFSLinkRequest:
    """Bind a path or dataset artifact to content-addressed metadata."""

    source: VFSRef
    target: VFSRef
    actor: IdentityRef
    capabilities: tuple[CapabilityGrant, ...] = ()
    replace: bool = False
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class VFSDeleteRequest:
    """Delete, unpin, or unlink a VFS reference."""

    ref: VFSRef
    actor: IdentityRef
    capabilities: tuple[CapabilityGrant, ...] = ()
    recursive: bool = False
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class VFSOperationResult:
    """Normalized VFS operation result."""

    operation: VFSOperation | str
    ok: bool = True
    ref: VFSRef | None = None
    node: VFSNode | None = None
    data: bytes | None = None
    entries: tuple[VFSNode, ...] = ()
    events: tuple[EventEnvelope, ...] = ()
    backend: str = "ipfs_kit_py"
    message: str = ""
    metadata: Metadata = field(default_factory=dict)

    def to_storage_result(self) -> StorageResult:
        """Project this VFS result into the kernel storage contract."""
        ref = self.node.to_storage_ref() if self.node else self.ref.to_storage_ref() if self.ref else StorageRef(uri="")
        return StorageResult(
            ref=ref,
            ok=self.ok,
            data=self.data,
            entries=tuple(entry.to_storage_ref() for entry in self.entries),
            message=self.message,
            metadata={
                "operation": self.operation.value if isinstance(self.operation, VFSOperation) else self.operation,
                "backend": self.backend,
                **dict(self.metadata),
            },
        )


def ref_from_path(path: str, *, metadata: Metadata | None = None) -> VFSRef:
    """Create a VFS reference from a POSIX-like path."""
    normalized = normalize_vfs_path(path)
    return VFSRef(
        kind=VFSAddressKind.PATH,
        uri=path_uri(normalized),
        path=normalized,
        metadata=dict(metadata or {}),
    )


def ref_from_cid(cid: str, *, path: str | None = None, metadata: Metadata | None = None) -> VFSRef:
    """Create a VFS reference from a CID."""
    return VFSRef(
        kind=VFSAddressKind.CID,
        uri=cid_uri(cid),
        path=path,
        cid=str(cid),
        metadata=dict(metadata or {}),
    )


def ref_from_ipld_block(block: IPLDBlock, *, path: str | None = None, metadata: Metadata | None = None) -> VFSRef:
    """Create a VFS reference from an IPLD block."""
    block = block.with_computed_cid()
    uri = cid_uri(block.cid) if block.cid else "ipld://block"
    return VFSRef(
        kind=VFSAddressKind.IPLD_BLOCK,
        uri=uri,
        path=path,
        cid=block.cid,
        block=block,
        metadata=dict(metadata or {}),
    )


def ref_from_metadata_row(row: MetadataIndexRow, *, metadata: Metadata | None = None) -> VFSRef:
    """Create a VFS reference from a metadata index row."""
    return VFSRef(
        kind=VFSAddressKind.METADATA_ROW,
        uri=row.uri,
        path=row.path,
        cid=row.cid,
        metadata_row=row,
        metadata=dict(metadata or {}),
    )


def ref_from_dataset_artifact(artifact: DatasetArtifact, *, metadata: Metadata | None = None) -> VFSRef:
    """Create a VFS reference from a dataset artifact."""
    return VFSRef(
        kind=VFSAddressKind.DATASET_ARTIFACT,
        uri=artifact.uri,
        path=artifact.path,
        cid=artifact.cid,
        dataset=artifact,
        metadata=dict(metadata or {}),
    )


def _first_present(mapping: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in mapping and mapping[key] is not None:
            return mapping[key]
    return None


def _native_to_mapping(value: Any) -> dict[str, Any]:
    """Best-effort conversion of native backend rows or objects to a dict."""
    if value is None:
        return {}
    if isinstance(value, Mapping):
        return dict(value)
    if hasattr(value, "to_dict"):
        converted = value.to_dict()
        return dict(converted) if isinstance(converted, Mapping) else {"value": converted}
    if hasattr(value, "_fields"):
        return {field_name: getattr(value, field_name) for field_name in value._fields}
    if hasattr(value, "as_py"):
        converted = value.as_py()
        return dict(converted) if isinstance(converted, Mapping) else {"value": converted}
    return {
        key: getattr(value, key)
        for key in dir(value)
        if not key.startswith("_") and not callable(getattr(value, key))
    }


def metadata_row_from_mapping(value: Mapping[str, Any]) -> MetadataIndexRow:
    """Normalize an ipfs_kit_py metadata row mapping."""
    cid = str(_first_present(value, "cid", "CID"))
    raw_tags = _first_present(value, "tags", "tag") or ()
    if isinstance(raw_tags, str):
        tags = (raw_tags,)
    else:
        tags = tuple(str(tag) for tag in raw_tags)
    raw_pin_types = _first_present(value, "pin_types", "pins") or ()
    if isinstance(raw_pin_types, str):
        pin_types = (raw_pin_types,)
    else:
        pin_types = tuple(str(pin_type) for pin_type in raw_pin_types)

    return MetadataIndexRow(
        cid=cid,
        path=_first_present(value, "path", "vfs_path"),
        size_bytes=_first_present(value, "size_bytes", "size"),
        mime_type=_first_present(value, "mime_type", "mimetype", "media_type"),
        blocks=_first_present(value, "blocks"),
        links=_first_present(value, "links"),
        local=_first_present(value, "local"),
        pinned=_first_present(value, "pinned"),
        pin_types=pin_types,
        replication=_first_present(value, "replication", "replication_factor"),
        created_at=_first_present(value, "created_at"),
        last_accessed=_first_present(value, "last_accessed"),
        access_count=_first_present(value, "access_count"),
        tags=tags,
        storage_locations=_first_present(value, "storage_locations", "locations") or {},
        properties=_first_present(value, "properties") or {},
        metadata=_first_present(value, "metadata") or {},
    )


def dataset_artifact_from_mapping(value: Mapping[str, Any]) -> DatasetArtifact:
    """Normalize an ipfs_kit_py dataset result mapping."""
    dataset_id = str(_first_present(value, "dataset_id", "id", "name", "dataset_name") or _first_present(value, "cid"))
    return DatasetArtifact(
        dataset_id=dataset_id,
        cid=_first_present(value, "cid", "dataset_cid"),
        name=_first_present(value, "name", "dataset_name"),
        version=_first_present(value, "version"),
        path=_first_present(value, "path", "local_path"),
        split=_first_present(value, "split"),
        format=_first_present(value, "format", "format_hint"),
        schema=_first_present(value, "schema", "features") or {},
        row_count=_first_present(value, "row_count", "rows", "num_rows"),
        column_count=_first_present(value, "column_count", "columns", "num_columns"),
        size_bytes=_first_present(value, "size_bytes", "size"),
        metadata_cid=_first_present(value, "metadata_cid"),
        metadata=_first_present(value, "metadata") or {},
    )


def _node_from_metadata_row(row: MetadataIndexRow) -> VFSNode:
    ref = ref_from_metadata_row(row)
    if row.path and row.path.endswith("/"):
        node_kind: VFSNodeKind | str = VFSNodeKind.DIRECTORY
    else:
        node_kind = VFSNodeKind.FILE
    return VFSNode(
        ref=ref,
        node_kind=node_kind,
        size_bytes=row.size_bytes,
        name=posixpath.basename(row.path) if row.path else row.cid,
        media_type=row.mime_type,
        created_at=row.created_at,
        metadata_row=row,
        metadata={
            "pinned": row.pinned,
            "local": row.local,
            "tags": row.tags,
            **dict(row.metadata),
        },
    )


async def _maybe_await(value: MaybeAwaitable[Any]) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


@runtime_checkable
class VirtualFilesystem(Protocol):
    """Unified VFS API for paths, CIDs, IPLD blocks, index rows, and datasets."""

    def add(self, request: VFSAddRequest) -> MaybeAwaitable[VFSOperationResult]:
        """Add content or register a content-addressed artifact."""

    def cat(self, request: VFSCatRequest) -> MaybeAwaitable[VFSOperationResult]:
        """Read content bytes by path, CID, block, or dataset reference."""

    def stat(self, request: VFSStatRequest) -> MaybeAwaitable[VFSOperationResult]:
        """Return metadata for one VFS reference."""

    def list(self, request: VFSListRequest) -> MaybeAwaitable[VFSOperationResult]:
        """List children below a path or CID."""

    def link(self, request: VFSLinkRequest) -> MaybeAwaitable[VFSOperationResult]:
        """Create or update a path-to-CID or dataset-to-CID binding."""

    def delete(self, request: VFSDeleteRequest) -> MaybeAwaitable[VFSOperationResult]:
        """Delete, unlink, or unpin a VFS reference."""

    def resolve(self, ref: VFSRef, *, actor: IdentityRef) -> MaybeAwaitable[VFSNode | None]:
        """Resolve any accepted reference into a VFS node."""


class IPFSKitVFSAdapter:
    """ipfs_kit_py-backed adapter for the Virtual AI OS VFS contract.

    The adapter accepts injected manager/API/index objects so tests can use
    mocks. ``from_ipfs_kit`` lazily imports ipfs_kit_py for runtime wiring.
    """

    backend = "ipfs_kit_py"

    def __init__(
        self,
        *,
        vfs_manager: Any | None = None,
        ipfs_api: Any | None = None,
        metadata_index: Any | None = None,
        dataset_manager: Any | None = None,
    ) -> None:
        self.vfs_manager = vfs_manager
        self.ipfs_api = ipfs_api if ipfs_api is not None else getattr(vfs_manager, "api", None)
        self.metadata_index = (
            metadata_index
            if metadata_index is not None
            else getattr(vfs_manager, "arrow_metadata_index", None)
        )
        self.dataset_manager = (
            dataset_manager
            if dataset_manager is not None
            else getattr(vfs_manager, "dataset_manager", None)
        )

    @classmethod
    def from_ipfs_kit(
        cls,
        *,
        enable_dataset_storage: bool = False,
        enable_compute_layer: bool = False,
        dataset_batch_size: int = 100,
    ) -> "IPFSKitVFSAdapter":
        """Create an adapter using ipfs_kit_py globals when available."""
        try:
            from ipfs_kit_py.vfs_manager import get_global_vfs_manager
        except ImportError as exc:
            raise VFSContractError("ipfs_kit_py.vfs_manager is not importable") from exc

        manager = get_global_vfs_manager()
        manager.enable_dataset_storage = bool(enable_dataset_storage)
        manager.enable_compute_layer = bool(enable_compute_layer)
        manager.dataset_batch_size = int(dataset_batch_size)
        return cls(
            vfs_manager=manager,
            ipfs_api=getattr(manager, "api", None),
            metadata_index=getattr(manager, "arrow_metadata_index", None),
            dataset_manager=getattr(manager, "dataset_manager", None),
        )

    async def add(self, request: VFSAddRequest) -> VFSOperationResult:
        """Add bytes, an IPLD block, metadata row, or dataset artifact."""
        if request.ref.dataset is not None:
            return await self._add_dataset(request)

        payload = request.payload
        block = request.ref.block
        if payload is None and block is not None:
            payload = block.data

        cid = request.ref.cid
        add_result: dict[str, Any] = {}
        if payload is not None and self.ipfs_api is not None:
            method = getattr(self.ipfs_api, "add", None)
            if method is not None:
                add_result = _native_to_mapping(
                    await _maybe_await(method(payload, pin=request.pin, **dict(request.options)))
                )
                cid = _first_present(add_result, "cid", "Hash", "hash") or cid

        if payload is not None and cid is None:
            codec = block.codec if block is not None else request.options.get("codec", IPLDCodec.RAW)
            cid = raw_cid_v1_sha256(payload, codec=codec)

        ref = request.ref
        if cid and request.ref.cid != cid:
            if block is not None:
                ref = ref_from_ipld_block(
                    IPLDBlock(
                        cid=str(cid),
                        codec=block.codec,
                        data=payload,
                        links=block.links,
                        size_bytes=block.size_bytes if block.size_bytes is not None else len(payload or b""),
                        multihash=block.multihash,
                        metadata=block.metadata,
                    ),
                    path=request.ref.path,
                    metadata=request.ref.metadata,
                )
            elif request.ref.path:
                ref = VFSRef(
                    kind=request.ref.kind,
                    uri=request.ref.uri,
                    path=request.ref.path,
                    cid=str(cid),
                    metadata=request.ref.metadata,
                )
            else:
                ref = ref_from_cid(str(cid), metadata=request.ref.metadata)

        if request.ref.path and payload is not None and self.vfs_manager is not None:
            await self._execute_vfs("write", path=request.ref.path, content=payload, **dict(request.options))

        row = None
        if ref.cid:
            row = MetadataIndexRow(
                cid=ref.cid,
                path=ref.path,
                size_bytes=len(payload) if payload is not None else _first_present(add_result, "size", "size_bytes"),
                mime_type=request.options.get("mime_type") or request.options.get("mimetype"),
                pinned=request.pin,
                metadata={
                    "source_kind": ref.kind.value if isinstance(ref.kind, VFSAddressKind) else ref.kind,
                    **dict(request.options.get("metadata", {})),
                },
            )
            await self._register_metadata_row(row)

        node = VFSNode(
            ref=ref,
            node_kind=VFSNodeKind.IPLD_BLOCK if ref.block else VFSNodeKind.FILE,
            size_bytes=row.size_bytes if row else len(payload) if payload is not None else None,
            name=posixpath.basename(ref.path) if ref.path else ref.cid,
            media_type=row.mime_type if row else None,
            metadata_row=row,
            metadata={"add_result": add_result},
        )
        return VFSOperationResult(
            operation=VFSOperation.ADD,
            ok=True,
            ref=ref,
            node=node,
            backend=self.backend,
            metadata={"cid": ref.cid, "fallback_cid": bool(payload is not None and not add_result)},
        )

    async def cat(self, request: VFSCatRequest) -> VFSOperationResult:
        """Read bytes by path, CID, block, or dataset reference."""
        if request.ref.block and request.ref.block.data is not None:
            return VFSOperationResult(
                operation=VFSOperation.CAT,
                ok=True,
                ref=request.ref,
                data=request.ref.block.data,
                node=VFSNode(
                    ref=request.ref,
                    node_kind=VFSNodeKind.IPLD_BLOCK,
                    size_bytes=len(request.ref.block.data),
                    links=request.ref.block.links,
                ),
                backend=self.backend,
            )

        if request.ref.dataset is not None:
            return await self._cat_dataset(request)

        data: bytes | None = None
        native: Any = None
        if request.ref.path and self.vfs_manager is not None:
            native = await self._execute_vfs("cat", path=request.ref.path, **dict(request.options))
            data = self._extract_bytes(native)

        if data is None and self.ipfs_api is not None:
            identifier = request.ref.cid or request.ref.path
            for name in ("get", "cat", "read"):
                method = getattr(self.ipfs_api, name, None)
                if method is None or identifier is None:
                    continue
                native = await _maybe_await(method(identifier, **dict(request.options)))
                data = self._extract_bytes(native)
                if data is not None:
                    break

        ok = data is not None
        return VFSOperationResult(
            operation=VFSOperation.CAT,
            ok=ok,
            ref=request.ref,
            data=data,
            node=await self._stat_node(request.ref),
            backend=self.backend,
            message="" if ok else "content not found",
            metadata={"native": _native_to_mapping(native) if isinstance(native, Mapping) else {}},
        )

    async def stat(self, request: VFSStatRequest) -> VFSOperationResult:
        """Return metadata for one VFS reference."""
        node = await self._stat_node(request.ref)
        return VFSOperationResult(
            operation=VFSOperation.STAT,
            ok=node is not None,
            ref=request.ref,
            node=node,
            backend=self.backend,
            message="" if node else "metadata not found",
        )

    async def list(self, request: VFSListRequest) -> VFSOperationResult:
        """List path or CID children."""
        native: Any = None
        entries: tuple[VFSNode, ...] = ()

        if request.ref.path and self.vfs_manager is not None:
            if hasattr(self.vfs_manager, "list_files"):
                native = await _maybe_await(self.vfs_manager.list_files(request.ref.path))
            else:
                native = await self._execute_vfs("ls", path=request.ref.path, **dict(request.options))
            entries = self._nodes_from_list_result(native, parent_path=request.ref.path)

        if not entries and self.ipfs_api is not None:
            identifier = request.ref.cid or request.ref.path
            method = getattr(self.ipfs_api, "ls", None)
            if method is not None and identifier is not None:
                native = await _maybe_await(method(identifier, **dict(request.options)))
                entries = self._nodes_from_list_result(native, parent_path=request.ref.path)

        if request.limit is not None:
            entries = entries[: request.limit]

        return VFSOperationResult(
            operation=VFSOperation.LIST,
            ok=bool(entries) or native is not None,
            ref=request.ref,
            node=await self._stat_node(request.ref),
            entries=entries,
            backend=self.backend,
        )

    async def link(self, request: VFSLinkRequest) -> VFSOperationResult:
        """Register a path or dataset binding to a content CID."""
        path = request.source.path or request.target.path
        cid = request.target.cid or request.source.cid
        if not cid:
            return VFSOperationResult(
                operation=VFSOperation.LINK,
                ok=False,
                ref=request.source,
                backend=self.backend,
                message="link target does not include a CID",
            )

        row = MetadataIndexRow(
            cid=cid,
            path=path,
            size_bytes=request.target.block.size_bytes if request.target.block else None,
            mime_type=request.options.get("mime_type"),
            metadata={
                "source_uri": request.source.uri,
                "target_uri": request.target.uri,
                "replace": request.replace,
                **dict(request.options.get("metadata", {})),
            },
        )
        await self._register_metadata_row(row)
        node = _node_from_metadata_row(row)
        return VFSOperationResult(
            operation=VFSOperation.LINK,
            ok=True,
            ref=node.ref,
            node=node,
            backend=self.backend,
        )

    async def delete(self, request: VFSDeleteRequest) -> VFSOperationResult:
        """Delete a path, remove metadata, or unpin a CID."""
        ok = False
        message = ""
        if request.ref.path and self.vfs_manager is not None:
            native = await self._execute_vfs(
                "rm",
                path=request.ref.path,
                recursive=request.recursive,
                **dict(request.options),
            )
            native_mapping = _native_to_mapping(native)
            ok = native_mapping.get("success", True) and "error" not in native_mapping
            message = str(native_mapping.get("error") or "")

        if request.ref.cid:
            ok = await self._delete_metadata_row(request.ref.cid) or ok
            if self.ipfs_api is not None:
                method = getattr(self.ipfs_api, "unpin", None) or getattr(self.ipfs_api, "pin_rm", None)
                if method is not None:
                    native = _native_to_mapping(await _maybe_await(method(request.ref.cid, **dict(request.options))))
                    ok = native.get("success", True) and "error" not in native
                    message = str(native.get("error") or message)

        return VFSOperationResult(
            operation=VFSOperation.DELETE,
            ok=ok,
            ref=request.ref,
            backend=self.backend,
            message=message,
        )

    async def resolve(self, ref: VFSRef, *, actor: IdentityRef) -> VFSNode | None:
        """Resolve any accepted reference into a VFS node."""
        result = await self.stat(VFSStatRequest(ref=ref, actor=actor))
        return result.node

    async def _add_dataset(self, request: VFSAddRequest) -> VFSOperationResult:
        artifact = request.ref.dataset
        if artifact is None:
            raise VFSContractError("dataset add requested without dataset artifact")

        native: dict[str, Any] = {}
        if self.ipfs_api is not None and artifact.cid is None:
            method = getattr(self.ipfs_api, "ai_dataset_add", None)
            if method is not None:
                source = artifact.path or request.payload or artifact.to_metadata()
                native = _native_to_mapping(
                    await _maybe_await(
                        method(source, metadata=artifact.to_metadata(), pin=request.pin, **dict(request.options))
                    )
                )

        if self.dataset_manager is not None and not native:
            method = getattr(self.dataset_manager, "store_dataset", None) or getattr(self.dataset_manager, "store", None)
            if method is not None and artifact.path:
                native = _native_to_mapping(
                    await _maybe_await(method(artifact.path, metadata=artifact.to_metadata()))
                )

        cid = _first_present(native, "cid", "dataset_cid") or artifact.cid
        if cid and self.ipfs_api is not None:
            register = getattr(self.ipfs_api, "ai_register_dataset", None)
            if register is not None:
                await _maybe_await(
                    register(str(cid), artifact.to_metadata(), pin=request.pin, **dict(request.options))
                )

        final_artifact = DatasetArtifact(
            dataset_id=artifact.dataset_id,
            cid=str(cid) if cid else None,
            name=artifact.name,
            version=artifact.version,
            path=artifact.path,
            split=artifact.split,
            format=artifact.format,
            schema=artifact.schema,
            row_count=artifact.row_count,
            column_count=artifact.column_count,
            size_bytes=artifact.size_bytes,
            metadata_cid=_first_present(native, "metadata_cid") or artifact.metadata_cid,
            metadata={**dict(artifact.metadata), "native": native},
        )
        ref = ref_from_dataset_artifact(final_artifact)
        if final_artifact.cid:
            await self._register_metadata_row(
                MetadataIndexRow(
                    cid=final_artifact.cid,
                    path=final_artifact.path,
                    size_bytes=final_artifact.size_bytes,
                    mime_type=final_artifact.format,
                    metadata={
                        "artifact_type": "dataset",
                        "dataset_id": final_artifact.dataset_id,
                        "version": final_artifact.version,
                    },
                )
            )
        node = VFSNode(
            ref=ref,
            node_kind=VFSNodeKind.DATASET,
            size_bytes=final_artifact.size_bytes,
            name=final_artifact.name or final_artifact.dataset_id,
            media_type=final_artifact.format,
            dataset=final_artifact,
            metadata={"native": native},
        )
        return VFSOperationResult(
            operation=VFSOperation.REGISTER_DATASET,
            ok=bool(final_artifact.cid or native.get("success", False) or artifact.path),
            ref=ref,
            node=node,
            backend=self.backend,
            metadata={"dataset_id": final_artifact.dataset_id},
        )

    async def _cat_dataset(self, request: VFSCatRequest) -> VFSOperationResult:
        artifact = request.ref.dataset
        if artifact is None:
            raise VFSContractError("dataset read requested without dataset artifact")

        native: Any = None
        if self.ipfs_api is not None:
            method = getattr(self.ipfs_api, "ai_dataset_get", None)
            if method is not None:
                native = await _maybe_await(
                    method(artifact.cid or artifact.dataset_id, **dict(request.options))
                )
        if native is None and self.dataset_manager is not None:
            method = getattr(self.dataset_manager, "load_dataset", None) or getattr(self.dataset_manager, "load", None)
            if method is not None:
                native = await _maybe_await(method(artifact.cid or artifact.path or artifact.dataset_id))

        data = self._extract_bytes(native)
        mapping = _native_to_mapping(native)
        loaded_artifact = dataset_artifact_from_mapping(mapping) if mapping else artifact
        node = VFSNode(
            ref=ref_from_dataset_artifact(loaded_artifact),
            node_kind=VFSNodeKind.DATASET,
            dataset=loaded_artifact,
            metadata={"native": mapping},
        )
        return VFSOperationResult(
            operation=VFSOperation.CAT,
            ok=bool(data is not None or mapping),
            ref=node.ref,
            node=node,
            data=data,
            backend=self.backend,
        )

    async def _execute_vfs(self, operation: str, **kwargs: Any) -> Any:
        if self.vfs_manager is None:
            return None
        method = getattr(self.vfs_manager, "execute_vfs_operation", None)
        if method is not None:
            result = await _maybe_await(method(operation, **kwargs))
            self.ipfs_api = self.ipfs_api or getattr(self.vfs_manager, "api", None)
            self.metadata_index = (
                self.metadata_index or getattr(self.vfs_manager, "arrow_metadata_index", None)
            )
            self.dataset_manager = self.dataset_manager or getattr(self.vfs_manager, "dataset_manager", None)
            return result
        operation_method = getattr(self.vfs_manager, operation, None)
        if operation_method is not None:
            return await _maybe_await(operation_method(**kwargs))
        return None

    async def _stat_node(self, ref: VFSRef) -> VFSNode | None:
        if ref.metadata_row is not None:
            return _node_from_metadata_row(ref.metadata_row)
        if ref.dataset is not None:
            return VFSNode(
                ref=ref,
                node_kind=VFSNodeKind.DATASET,
                size_bytes=ref.dataset.size_bytes,
                name=ref.dataset.name or ref.dataset.dataset_id,
                media_type=ref.dataset.format,
                dataset=ref.dataset,
            )
        if ref.block is not None:
            block = ref.block.with_computed_cid()
            block_ref = ref_from_ipld_block(block, path=ref.path, metadata=ref.metadata)
            return VFSNode(
                ref=block_ref,
                node_kind=VFSNodeKind.IPLD_BLOCK,
                size_bytes=block.size_bytes if block.size_bytes is not None else len(block.data or b""),
                name=ref.path.rsplit("/", 1)[-1] if ref.path else block.cid,
                media_type=block.codec.value if isinstance(block.codec, IPLDCodec) else str(block.codec),
                links=block.links,
                metadata=block.metadata,
            )

        row = await self._lookup_metadata_row(ref)
        if row is not None:
            return _node_from_metadata_row(row)

        native: Any = None
        if ref.path and self.vfs_manager is not None:
            native = await self._execute_vfs("stat", path=ref.path)
        elif ref.cid and self.ipfs_api is not None:
            for name in ("stat", "ipfs_stat"):
                method = getattr(self.ipfs_api, name, None)
                if method is not None:
                    native = await _maybe_await(method(ref.cid))
                    break

        mapping = _native_to_mapping(native)
        if not mapping:
            return None
        row_cid = _first_present(mapping, "cid", "Hash", "hash") or ref.cid
        if row_cid:
            row = metadata_row_from_mapping({**mapping, "cid": row_cid, "path": ref.path or mapping.get("path")})
            return _node_from_metadata_row(row)

        return VFSNode(
            ref=ref,
            node_kind=mapping.get("type", VFSNodeKind.UNKNOWN),
            size_bytes=_first_present(mapping, "size", "size_bytes"),
            name=mapping.get("name") or (posixpath.basename(ref.path) if ref.path else ref.cid),
            media_type=_first_present(mapping, "mime_type", "mimetype", "media_type"),
            metadata=mapping,
        )

    async def _lookup_metadata_row(self, ref: VFSRef) -> MetadataIndexRow | None:
        if self.metadata_index is None:
            return None

        native: Any = None
        if ref.cid:
            for name in ("get_by_cid", "lookup_by_cid"):
                method = getattr(self.metadata_index, name, None)
                if method is not None:
                    native = await _maybe_await(method(ref.cid))
                    if native:
                        break

        if not native and ref.path:
            method = getattr(self.metadata_index, "lookup_by_path", None)
            if method is not None:
                native = await _maybe_await(method(ref.path))

        if not native and ref.path:
            native = await self._query_metadata_index([("path", "==", ref.path)], limit=1)
        if not native and ref.cid:
            native = await self._query_metadata_index([("cid", "==", ref.cid)], limit=1)

        mapping = self._first_query_row(native)
        if not mapping:
            return None
        return metadata_row_from_mapping(mapping)

    async def _query_metadata_index(self, filters: Sequence[tuple[str, str, Any]], *, limit: int = 1) -> Any:
        if self.metadata_index is None:
            return None
        method = getattr(self.metadata_index, "query", None)
        if method is None:
            return None
        try:
            return await _maybe_await(method(filters=filters, limit=limit))
        except TypeError:
            return await _maybe_await(method(filters, limit=limit))

    def _first_query_row(self, native: Any) -> dict[str, Any]:
        if native is None:
            return {}
        if isinstance(native, Mapping):
            if "results" in native and native["results"]:
                return _native_to_mapping(native["results"][0])
            if "rows" in native and native["rows"]:
                return _native_to_mapping(native["rows"][0])
            if "cid" in native:
                return dict(native)
            return {}
        if isinstance(native, Sequence) and not isinstance(native, (str, bytes, bytearray)):
            return _native_to_mapping(native[0]) if native else {}
        if hasattr(native, "num_rows") and native.num_rows:
            return {
                field.name: native.column(index)[0].as_py()
                for index, field in enumerate(native.schema)
            }
        return _native_to_mapping(native)

    async def _register_metadata_row(self, row: MetadataIndexRow) -> bool:
        if self.metadata_index is None:
            return False
        record = row.to_mapping()
        for name in ("add", "add_record"):
            method = getattr(self.metadata_index, name, None)
            if method is not None:
                native = _native_to_mapping(await _maybe_await(method(record)))
                await self._save_metadata_index()
                return native.get("success", True) and "error" not in native

        method = getattr(self.metadata_index, "add_entry", None)
        if method is not None:
            native = _native_to_mapping(
                await _maybe_await(
                    method(
                        cid=row.cid,
                        path=row.path,
                        mimetype=row.mime_type,
                        size=row.size_bytes,
                        locations=dict(row.storage_locations),
                        metadata=dict(row.metadata),
                    )
                )
            )
            await self._save_metadata_index()
            return native.get("success", True) and "error" not in native
        return False

    async def _delete_metadata_row(self, cid: str) -> bool:
        if self.metadata_index is None:
            return False
        for name in ("delete_by_cid", "delete_entry"):
            method = getattr(self.metadata_index, name, None)
            if method is not None:
                native = await _maybe_await(method(cid))
                await self._save_metadata_index()
                return bool(native)
        return False

    async def _save_metadata_index(self) -> None:
        if self.metadata_index is not None and hasattr(self.metadata_index, "save"):
            await _maybe_await(self.metadata_index.save())

    def _nodes_from_list_result(self, native: Any, *, parent_path: str | None = None) -> tuple[VFSNode, ...]:
        mapping = _native_to_mapping(native)
        items: Any = None
        if mapping:
            items = _first_present(mapping, "items", "entries", "files", "results")
        if items is None:
            items = native
        if isinstance(items, Mapping):
            items = items.values()
        if not isinstance(items, Sequence) or isinstance(items, (str, bytes, bytearray)):
            return ()

        nodes: list[VFSNode] = []
        for item in items:
            item_map = _native_to_mapping(item)
            if not item_map:
                continue
            item_path = _first_present(item_map, "path", "name")
            if parent_path and item_path and not str(item_path).startswith("/"):
                item_path = normalize_vfs_path(f"{parent_path.rstrip('/')}/{item_path}")
            item_cid = _first_present(item_map, "cid", "Hash", "hash")
            if item_cid:
                ref = ref_from_cid(str(item_cid), path=item_path, metadata=item_map)
            elif item_path:
                ref = ref_from_path(str(item_path), metadata=item_map)
            else:
                continue
            nodes.append(
                VFSNode(
                    ref=ref,
                    node_kind=_first_present(item_map, "type", "node_kind") or VFSNodeKind.UNKNOWN,
                    size_bytes=_first_present(item_map, "size", "size_bytes"),
                    name=_first_present(item_map, "name") or (posixpath.basename(str(item_path)) if item_path else item_cid),
                    media_type=_first_present(item_map, "mime_type", "mimetype", "media_type"),
                    metadata=item_map,
                )
            )
        return tuple(nodes)

    def _extract_bytes(self, native: Any) -> bytes | None:
        if native is None:
            return None
        if isinstance(native, bytes):
            return native
        if isinstance(native, bytearray):
            return bytes(native)
        if isinstance(native, str):
            return native.encode("utf-8")
        if isinstance(native, Mapping):
            if native.get("success") is False:
                return None
            for key in ("data", "content", "payload", "bytes"):
                value = native.get(key)
                if isinstance(value, bytes):
                    return value
                if isinstance(value, bytearray):
                    return bytes(value)
                if isinstance(value, str):
                    return value.encode("utf-8")
        return None


IPFSKitVirtualFilesystem = IPFSKitVFSAdapter
VFSAdapter = VirtualFilesystem
VirtualFileSystem = VirtualFilesystem


__all__ = [
    "DatasetArtifact",
    "IPFSKitVFSAdapter",
    "IPFSKitVirtualFilesystem",
    "IPLDBlock",
    "IPLDCodec",
    "IPLDLink",
    "MetadataIndexRow",
    "VFSAdapter",
    "VFSAddRequest",
    "VFSAddressKind",
    "VFSCatRequest",
    "VFSContractError",
    "VFSDeleteRequest",
    "VFSLinkRequest",
    "VFSListRequest",
    "VFSNode",
    "VFSNodeKind",
    "VFSOperation",
    "VFSOperationResult",
    "VFSPath",
    "VFSPathError",
    "VFSRef",
    "VFSStatRequest",
    "VirtualFileSystem",
    "VirtualFilesystem",
    "cid_uri",
    "dataset_artifact_from_mapping",
    "dataset_uri",
    "metadata_row_from_mapping",
    "metadata_row_uri",
    "normalize_vfs_path",
    "path_uri",
    "raw_cid_v1_sha256",
    "ref_from_cid",
    "ref_from_dataset_artifact",
    "ref_from_ipld_block",
    "ref_from_metadata_row",
    "ref_from_path",
    "utc_now",
]
