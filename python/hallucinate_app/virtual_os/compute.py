"""Model compute runtime contracts for the Hallucinate Virtual AI OS.

The contract is intentionally stdlib-only. Adapters for ``ipfs_accelerate_py``
model loading, inference, embeddings, hardware profiling, task queues,
cancellation, and resource accounting should normalize native objects into
these payloads at the component boundary.
"""

from __future__ import annotations

import os
import platform
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Protocol, TypeAlias, runtime_checkable

from .contracts import (
    CapabilityGrant,
    EventEnvelope,
    IdentityRef,
    MaybeAwaitable,
    Metadata,
    ResourceClaim,
    ResourceKind,
    ResourceRef,
    ResourceUnit,
    ResourceUsage,
    StorageRef,
    utc_now,
)


IPFS_ACCELERATE_COMPONENT = "ipfs_accelerate_py"
EmbeddingVector: TypeAlias = tuple[float, ...]
ModelPayload: TypeAlias = Any


class ModelComputeOperation(str, Enum):
    """Capability-scoped operations exposed by the model compute runtime."""

    LOAD_MODEL = "load_model"
    UNLOAD_MODEL = "unload_model"
    INFERENCE = "inference"
    EMBEDDING = "embedding"
    HARDWARE_PROFILE = "hardware_profile"
    RECOMMEND_HARDWARE = "recommend_hardware"
    SUBMIT_TASK = "submit_task"
    QUEUE_STATE = "queue_state"
    CANCEL_TASK = "cancel_task"
    RESOURCE_RESERVE = "resource_reserve"
    RESOURCE_USAGE = "resource_usage"
    RESOURCE_RELEASE = "resource_release"


class ModelLoadMode(str, Enum):
    """Model load strategies an accelerate adapter may support."""

    METADATA_ONLY = "metadata_only"
    LAZY = "lazy"
    WARM = "warm"
    MATERIALIZE = "materialize"


class ModelRuntimeState(str, Enum):
    """Lifecycle state for a loaded model handle."""

    UNKNOWN = "unknown"
    LOADING = "loading"
    LOADED = "loaded"
    WARMING = "warming"
    READY = "ready"
    UNLOADING = "unloading"
    UNLOADED = "unloaded"
    FAILED = "failed"


class ModelFormat(str, Enum):
    """Portable model artifact formats named at the contract boundary."""

    HUGGINGFACE = "huggingface"
    SAFETENSORS = "safetensors"
    PYTORCH = "pytorch"
    ONNX = "onnx"
    TENSORFLOW = "tensorflow"
    GGUF = "gguf"
    OPENVINO = "openvino"
    IPFS = "ipfs"
    CUSTOM = "custom"
    UNKNOWN = "unknown"


class ModelTaskKind(str, Enum):
    """Normalized model task kinds used for inference and embedding dispatch."""

    TEXT_GENERATION = "text_generation"
    TEXT_CLASSIFICATION = "text_classification"
    CHAT = "chat"
    EMBEDDING = "embedding"
    FEATURE_EXTRACTION = "feature_extraction"
    RERANK = "rerank"
    VISION_CLASSIFICATION = "vision_classification"
    IMAGE_TO_TEXT = "image_to_text"
    AUDIO_TRANSCRIPTION = "audio_transcription"
    MULTIMODAL = "multimodal"
    CUSTOM = "custom"


class HardwareBackend(str, Enum):
    """Hardware backends named by ``ipfs_accelerate_py`` and browser runtimes."""

    AUTO = "auto"
    CPU = "cpu"
    CUDA = "cuda"
    ROCM = "rocm"
    MPS = "mps"
    OPENVINO = "openvino"
    WEBGPU = "webgpu"
    WEBNN = "webnn"
    QUALCOMM = "qualcomm"
    QNN = "qnn"
    PROVIDER = "provider"
    REMOTE = "remote"
    UNKNOWN = "unknown"


class HardwareAvailability(str, Enum):
    """Availability state for a hardware device or accelerator backend."""

    UNKNOWN = "unknown"
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"
    DEGRADED = "degraded"
    RESERVED = "reserved"


class PrecisionMode(str, Enum):
    """Compute precision preference for model execution."""

    AUTO = "auto"
    FP32 = "fp32"
    FP16 = "fp16"
    BF16 = "bf16"
    INT8 = "int8"
    INT4 = "int4"
    MIXED = "mixed"


class ComputeTaskState(str, Enum):
    """Task states normalized across local, daemon, and p2p queues."""

    UNKNOWN = "unknown"
    PENDING = "pending"
    QUEUED = "queued"
    CLAIMED = "claimed"
    RUNNING = "running"
    COMPLETING = "completing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCEL_REQUESTED = "cancel_requested"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"


class ComputeQueueStatus(str, Enum):
    """Queue service state for local and remote compute queues."""

    UNKNOWN = "unknown"
    ACTIVE = "active"
    PAUSED = "paused"
    DRAINING = "draining"
    DEGRADED = "degraded"
    STOPPED = "stopped"


class QueueDiscipline(str, Enum):
    """Scheduling discipline used by a compute queue."""

    FIFO = "fifo"
    PRIORITY = "priority"
    FAIR = "fair"
    WEIGHTED = "weighted"
    RESOURCE_AWARE = "resource_aware"


class CancellationMode(str, Enum):
    """Cancellation behavior requested for a queued or running task."""

    BEST_EFFORT = "best_effort"
    COOPERATIVE = "cooperative"
    FORCE = "force"


class ResourceAccountingPhase(str, Enum):
    """Resource accounting phase reported by a compute adapter."""

    RESERVED = "reserved"
    ALLOCATED = "allocated"
    CONSUMED = "consumed"
    RELEASED = "released"
    BILLED = "billed"


def model_uri(model_id: str, *, revision: str | None = None) -> str:
    """Return a stable model URI for a Hugging Face, IPFS, local, or named model."""
    value = str(model_id).strip()
    if not value:
        raise ValueError("model_id cannot be empty")
    uri = value if "://" in value else f"model://{value}"
    return f"{uri}@{revision}" if revision else uri


def compute_task_uri(task_id: str, *, queue_id: str | None = None) -> str:
    """Return the canonical resource URI for a compute task."""
    value = str(task_id).strip()
    if not value:
        raise ValueError("task_id cannot be empty")
    if queue_id:
        return f"compute://queue/{queue_id}/task/{value}"
    return f"compute://task/{value}"


def compute_queue_uri(queue_id: str) -> str:
    """Return the canonical resource URI for a compute queue."""
    value = str(queue_id).strip()
    if not value:
        raise ValueError("queue_id cannot be empty")
    return f"compute://queue/{value}"


def hardware_uri(backend: HardwareBackend | str, device_id: str | None = None) -> str:
    """Return the canonical resource URI for an accelerate hardware device."""
    backend_value = backend.value if isinstance(backend, HardwareBackend) else str(backend)
    if not backend_value:
        backend_value = HardwareBackend.UNKNOWN.value
    if device_id:
        return f"hardware://{IPFS_ACCELERATE_COMPONENT}/{backend_value}/{device_id}"
    return f"hardware://{IPFS_ACCELERATE_COMPONENT}/{backend_value}"


@dataclass(frozen=True)
class ModelRef:
    """Model artifact or runtime model reference."""

    model_id: str
    uri: str | None = None
    name: str | None = None
    version: str | None = None
    revision: str | None = None
    provider: str | None = None
    format: ModelFormat | str = ModelFormat.UNKNOWN
    task: ModelTaskKind | str | None = None
    cid: str | None = None
    storage_refs: tuple[StorageRef, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    def __post_init__(self) -> None:
        model_id = str(self.model_id).strip()
        if not model_id:
            raise ValueError("model_id cannot be empty")
        object.__setattr__(self, "model_id", model_id)
        if self.uri is None:
            object.__setattr__(self, "uri", model_uri(model_id, revision=self.revision))

    def resource(self) -> ResourceRef:
        """Return this model as a capability and accounting resource."""
        return ResourceRef(
            uri=self.uri or model_uri(self.model_id, revision=self.revision),
            kind=ResourceKind.MODEL,
            component=IPFS_ACCELERATE_COMPONENT,
            name=self.name or self.model_id,
            metadata={
                "model_id": self.model_id,
                "version": self.version,
                "revision": self.revision,
                "provider": self.provider,
                "format": self.format.value if isinstance(self.format, ModelFormat) else self.format,
                "task": self.task.value if isinstance(self.task, ModelTaskKind) else self.task,
                "cid": self.cid,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class HardwareDevice:
    """Normalized hardware device or accelerator backend."""

    backend: HardwareBackend | str
    device_id: str | None = None
    name: str | None = None
    availability: HardwareAvailability | str = HardwareAvailability.UNKNOWN
    vendor: str | None = None
    index: int | None = None
    memory_total_bytes: int | None = None
    memory_free_bytes: int | None = None
    compute_units: int | None = None
    driver_version: str | None = None
    runtime_version: str | None = None
    features: tuple[str, ...] = ()
    utilization_percent: float | None = None
    temperature_c: float | None = None
    metadata: Metadata = field(default_factory=dict)

    def resource(self) -> ResourceRef:
        """Return this hardware device as a scheduler/accounting resource."""
        backend_value = self.backend.value if isinstance(self.backend, HardwareBackend) else str(self.backend)
        return ResourceRef(
            uri=hardware_uri(backend_value, self.device_id),
            kind=ResourceKind.HARDWARE,
            component=IPFS_ACCELERATE_COMPONENT,
            name=self.name or self.device_id or backend_value,
            labels={"backend": backend_value},
            metadata={
                "device_id": self.device_id,
                "availability": (
                    self.availability.value
                    if isinstance(self.availability, HardwareAvailability)
                    else self.availability
                ),
                "vendor": self.vendor,
                "index": self.index,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class HardwareProfile:
    """Hardware profile returned by local or remote accelerate runtimes."""

    profile_id: str
    node_id: str | None = None
    collected_at: datetime = field(default_factory=utc_now)
    devices: tuple[HardwareDevice, ...] = ()
    preferred_backend: HardwareBackend | str = HardwareBackend.AUTO
    platform: Metadata = field(default_factory=dict)
    hostname: str | None = None
    accelerator_version: str | None = None
    metadata: Metadata = field(default_factory=dict)

    @property
    def available_backends(self) -> tuple[str, ...]:
        """Return backend names for devices currently marked available."""
        backends: list[str] = []
        for device in self.devices:
            availability = (
                device.availability.value
                if isinstance(device.availability, HardwareAvailability)
                else str(device.availability)
            )
            if availability != HardwareAvailability.AVAILABLE.value:
                continue
            backend = device.backend.value if isinstance(device.backend, HardwareBackend) else str(device.backend)
            backends.append(backend)
        return tuple(backends)

    def best_device(self) -> HardwareDevice | None:
        """Return the preferred available device when one is declared."""
        preferred = (
            self.preferred_backend.value
            if isinstance(self.preferred_backend, HardwareBackend)
            else str(self.preferred_backend)
        )
        available = [
            device
            for device in self.devices
            if (
                device.availability.value
                if isinstance(device.availability, HardwareAvailability)
                else str(device.availability)
            )
            == HardwareAvailability.AVAILABLE.value
        ]
        if preferred and preferred != HardwareBackend.AUTO.value:
            for device in available:
                backend = device.backend.value if isinstance(device.backend, HardwareBackend) else str(device.backend)
                if backend == preferred:
                    return device
        return available[0] if available else None


def basic_hardware_profile(*, profile_id: str = "local-cpu") -> HardwareProfile:
    """Return a dependency-free CPU hardware profile fallback."""
    cpu = HardwareDevice(
        backend=HardwareBackend.CPU,
        device_id="cpu:0",
        name=platform.processor() or platform.machine() or "CPU",
        availability=HardwareAvailability.AVAILABLE,
        compute_units=os.cpu_count(),
        metadata={"architecture": platform.machine()},
    )
    return HardwareProfile(
        profile_id=profile_id,
        node_id=platform.node() or None,
        devices=(cpu,),
        preferred_backend=HardwareBackend.CPU,
        hostname=platform.node() or None,
        platform={
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "python_version": platform.python_version(),
        },
        metadata={"source": "stdlib_fallback"},
    )


@dataclass(frozen=True)
class HardwareProfileRequest:
    """Capability-scoped request to inspect available compute hardware."""

    actor: IdentityRef
    include_detailed: bool = False
    backends: tuple[HardwareBackend | str, ...] = ()
    capabilities: tuple[CapabilityGrant, ...] = ()
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class HardwareRecommendationRequest:
    """Request to choose hardware for a model task."""

    model: ModelRef | str
    actor: IdentityRef
    task: ModelTaskKind | str = ModelTaskKind.TEXT_GENERATION
    profile: HardwareProfile | None = None
    consider_available_only: bool = True
    capabilities: tuple[CapabilityGrant, ...] = ()
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class HardwareRecommendation:
    """Hardware recommendation returned by an accelerate adapter."""

    request: HardwareRecommendationRequest | None = None
    backend: HardwareBackend | str = HardwareBackend.AUTO
    device_id: str | None = None
    device: HardwareDevice | None = None
    score: float | None = None
    reason: str = ""
    alternatives: tuple[HardwareDevice, ...] = ()
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ModelLoadRequest:
    """Capability-scoped request to load or register a model runtime handle."""

    model: ModelRef | ResourceRef | StorageRef | str
    actor: IdentityRef
    mode: ModelLoadMode | str = ModelLoadMode.LAZY
    task: ModelTaskKind | str | None = None
    target_backend: HardwareBackend | str = HardwareBackend.AUTO
    device_id: str | None = None
    precision: PrecisionMode | str = PrecisionMode.AUTO
    capabilities: tuple[CapabilityGrant, ...] = ()
    resource_claims: tuple[ResourceClaim, ...] = ()
    queue_id: str | None = None
    trace_id: str | None = None
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class LoadedModel:
    """Loaded model handle normalized from ``ipfs_accelerate_py`` runtimes."""

    handle_id: str
    model: ModelRef
    state: ModelRuntimeState | str = ModelRuntimeState.READY
    backend: HardwareBackend | str = HardwareBackend.AUTO
    device_id: str | None = None
    precision: PrecisionMode | str = PrecisionMode.AUTO
    loaded_at: datetime = field(default_factory=utc_now)
    endpoint_id: str | None = None
    worker_id: str | None = None
    resource_claims: tuple[ResourceClaim, ...] = ()
    resource_usage: tuple[ResourceUsage, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    def resource(self) -> ResourceRef:
        """Return this loaded handle as a runtime model resource."""
        backend = self.backend.value if isinstance(self.backend, HardwareBackend) else str(self.backend)
        return ResourceRef(
            uri=f"{self.model.resource().uri}#handle={self.handle_id}",
            kind=ResourceKind.MODEL,
            component=IPFS_ACCELERATE_COMPONENT,
            name=self.model.name or self.model.model_id,
            labels={"backend": backend},
            metadata={
                "handle_id": self.handle_id,
                "model_id": self.model.model_id,
                "state": self.state.value if isinstance(self.state, ModelRuntimeState) else self.state,
                "device_id": self.device_id,
                "precision": self.precision.value if isinstance(self.precision, PrecisionMode) else self.precision,
                "endpoint_id": self.endpoint_id,
                "worker_id": self.worker_id,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class ModelLoadResult:
    """Result of loading, resolving, or warming a model."""

    request: ModelLoadRequest | None = None
    model: LoadedModel | None = None
    ok: bool = True
    message: str = ""
    task_id: str | None = None
    hardware: HardwareDevice | None = None
    resource_usage: tuple[ResourceUsage, ...] = ()
    events: tuple[EventEnvelope, ...] = ()
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ModelUnloadRequest:
    """Request to unload a model handle and release held resources."""

    handle_id: str
    actor: IdentityRef
    capabilities: tuple[CapabilityGrant, ...] = ()
    release_resources: bool = True
    reason: str = ""
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ModelInput:
    """A single inference or embedding input."""

    input_id: str | None = None
    text: str | None = None
    data: ModelPayload | None = None
    media: StorageRef | ResourceRef | None = None
    role: str | None = None
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class InferenceRequest:
    """Capability-scoped model inference request."""

    model: LoadedModel | ModelRef | str
    actor: IdentityRef
    inputs: tuple[ModelInput, ...] = ()
    task: ModelTaskKind | str = ModelTaskKind.TEXT_GENERATION
    parameters: Metadata = field(default_factory=dict)
    stream: bool = False
    target_backend: HardwareBackend | str = HardwareBackend.AUTO
    priority: int = 0
    queue_id: str | None = None
    timeout_s: float | None = None
    capabilities: tuple[CapabilityGrant, ...] = ()
    resource_claims: tuple[ResourceClaim, ...] = ()
    trace_id: str | None = None
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class InferenceOutput:
    """One normalized output from a model inference call."""

    output_id: str | None = None
    text: str | None = None
    data: ModelPayload | None = None
    tokens: tuple[int, ...] = ()
    finish_reason: str | None = None
    score: float | None = None
    input_id: str | None = None
    resource_usage: tuple[ResourceUsage, ...] = ()
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class InferenceResult:
    """Normalized model inference response."""

    request: InferenceRequest | None = None
    ok: bool = True
    outputs: tuple[InferenceOutput, ...] = ()
    task_id: str | None = None
    task_status: "ComputeTaskStatus | None" = None
    message: str = ""
    started_at: datetime | None = None
    completed_at: datetime | None = None
    resource_usage: tuple[ResourceUsage, ...] = ()
    events: tuple[EventEnvelope, ...] = ()
    stats: Metadata = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class EmbeddingRequest:
    """Capability-scoped embedding request."""

    model: LoadedModel | ModelRef | str
    actor: IdentityRef
    inputs: tuple[ModelInput, ...] = ()
    dimensions: int | None = None
    normalize: bool = True
    pooling: str | None = None
    target_backend: HardwareBackend | str = HardwareBackend.AUTO
    priority: int = 0
    queue_id: str | None = None
    timeout_s: float | None = None
    capabilities: tuple[CapabilityGrant, ...] = ()
    resource_claims: tuple[ResourceClaim, ...] = ()
    trace_id: str | None = None
    parameters: Metadata = field(default_factory=dict)
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class Embedding:
    """One normalized embedding vector."""

    embedding_id: str | None = None
    vector: EmbeddingVector = ()
    input_id: str | None = None
    text: str | None = None
    model: ModelRef | None = None
    normalized: bool = True
    metadata: Metadata = field(default_factory=dict)

    @property
    def dimensions(self) -> int:
        """Return the vector dimensionality."""
        return len(self.vector)


@dataclass(frozen=True)
class EmbeddingResult:
    """Normalized embedding response."""

    request: EmbeddingRequest | None = None
    ok: bool = True
    embeddings: tuple[Embedding, ...] = ()
    task_id: str | None = None
    task_status: "ComputeTaskStatus | None" = None
    message: str = ""
    started_at: datetime | None = None
    completed_at: datetime | None = None
    resource_usage: tuple[ResourceUsage, ...] = ()
    events: tuple[EventEnvelope, ...] = ()
    stats: Metadata = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ComputeTaskRequest:
    """Request to submit compute work to a local or p2p task queue."""

    operation: ModelComputeOperation | str
    actor: IdentityRef
    payload: ModelLoadRequest | InferenceRequest | EmbeddingRequest | Metadata
    task_id: str | None = None
    model: ModelRef | str | None = None
    queue_id: str | None = None
    priority: int = 0
    depends_on: tuple[str, ...] = ()
    capabilities: tuple[CapabilityGrant, ...] = ()
    resource_claims: tuple[ResourceClaim, ...] = ()
    trace_id: str | None = None
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ComputeTaskStatus:
    """Observed state for queued, running, or completed compute work."""

    task_id: str
    operation: ModelComputeOperation | str
    state: ComputeTaskState | str = ComputeTaskState.UNKNOWN
    model: ModelRef | None = None
    actor: IdentityRef | None = None
    queue_id: str | None = None
    worker_id: str | None = None
    priority: int = 0
    submitted_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancellation_reason: str = ""
    progress: float | None = None
    attempts: int = 0
    resource_claims: tuple[ResourceClaim, ...] = ()
    resource_usage: tuple[ResourceUsage, ...] = ()
    result_ref: ResourceRef | StorageRef | None = None
    message: str = ""
    metadata: Metadata = field(default_factory=dict)

    def resource(self) -> ResourceRef:
        """Return this task as a scheduler/accounting resource."""
        operation = self.operation.value if isinstance(self.operation, ModelComputeOperation) else str(self.operation)
        return ResourceRef(
            uri=compute_task_uri(self.task_id, queue_id=self.queue_id),
            kind=ResourceKind.PROCESS,
            component=IPFS_ACCELERATE_COMPONENT,
            name=self.task_id,
            labels={"operation": operation},
            metadata={
                "task_id": self.task_id,
                "queue_id": self.queue_id,
                "worker_id": self.worker_id,
                "state": self.state.value if isinstance(self.state, ComputeTaskState) else self.state,
                "model_id": self.model.model_id if self.model else None,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class ComputeQueueState:
    """Snapshot of a compute queue such as an accelerate p2p TaskQueue."""

    queue_id: str
    status: ComputeQueueStatus | str = ComputeQueueStatus.UNKNOWN
    discipline: QueueDiscipline | str = QueueDiscipline.PRIORITY
    depth: int = 0
    pending: int = 0
    running: int = 0
    completed: int = 0
    failed: int = 0
    cancelled: int = 0
    workers: int = 0
    max_concurrency: int | None = None
    tasks: tuple[ComputeTaskStatus, ...] = ()
    updated_at: datetime = field(default_factory=utc_now)
    metadata: Metadata = field(default_factory=dict)

    def resource(self) -> ResourceRef:
        """Return this queue as a scheduler/accounting resource."""
        return ResourceRef(
            uri=compute_queue_uri(self.queue_id),
            kind=ResourceKind.PROCESS,
            component=IPFS_ACCELERATE_COMPONENT,
            name=self.queue_id,
            metadata={
                "status": self.status.value if isinstance(self.status, ComputeQueueStatus) else self.status,
                "discipline": (
                    self.discipline.value
                    if isinstance(self.discipline, QueueDiscipline)
                    else self.discipline
                ),
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class CancellationRequest:
    """Capability-scoped request to cancel queued or running compute work."""

    task_id: str
    actor: IdentityRef
    mode: CancellationMode | str = CancellationMode.COOPERATIVE
    queue_id: str | None = None
    reason: str = ""
    capabilities: tuple[CapabilityGrant, ...] = ()
    release_resources: bool = True
    trace_id: str | None = None
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class CancellationResult:
    """Result of a cancellation request."""

    task_id: str
    ok: bool = True
    state: ComputeTaskState | str = ComputeTaskState.CANCELLED
    cancelled_at: datetime | None = None
    released_resources: tuple[ResourceRef, ...] = ()
    task_status: ComputeTaskStatus | None = None
    message: str = ""
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ResourceAccountingRequest:
    """Request to reserve, record, query, or release compute resources."""

    actor: IdentityRef
    phase: ResourceAccountingPhase | str
    task_id: str | None = None
    model: ModelRef | None = None
    queue_id: str | None = None
    claims: tuple[ResourceClaim, ...] = ()
    usage: tuple[ResourceUsage, ...] = ()
    resources: tuple[ResourceRef, ...] = ()
    capabilities: tuple[CapabilityGrant, ...] = ()
    trace_id: str | None = None
    options: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ComputeResourceAccounting:
    """Resource accounting snapshot for accelerate model and queue work."""

    account_id: str
    phase: ResourceAccountingPhase | str
    task_id: str | None = None
    model: ModelRef | None = None
    queue_id: str | None = None
    actor: IdentityRef | None = None
    claims: tuple[ResourceClaim, ...] = ()
    reserved: tuple[ResourceUsage, ...] = ()
    usage: tuple[ResourceUsage, ...] = ()
    released: tuple[ResourceRef, ...] = ()
    measured_at: datetime = field(default_factory=utc_now)
    counters: Metadata = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class ResourceAccountingResult:
    """Result returned from a compute resource accounting operation."""

    request: ResourceAccountingRequest | None = None
    accounting: ComputeResourceAccounting | None = None
    ok: bool = True
    message: str = ""
    events: tuple[EventEnvelope, ...] = ()
    metadata: Metadata = field(default_factory=dict)


def token_usage(
    amount: int,
    *,
    task_id: str | None = None,
    model: ModelRef | None = None,
    measured_at: datetime | None = None,
    metadata: Metadata | None = None,
) -> ResourceUsage:
    """Create a token resource usage record for inference or embedding work."""
    subject = model.resource() if model else ResourceRef(
        uri=compute_task_uri(task_id or "unknown"),
        kind=ResourceKind.PROCESS,
        component=IPFS_ACCELERATE_COMPONENT,
    )
    return ResourceUsage(
        resource=subject,
        amount=float(amount),
        unit=ResourceUnit.TOKENS,
        measured_at=measured_at or utc_now(),
        metadata=dict(metadata or {}),
    )


def hardware_memory_usage(
    amount_bytes: int,
    *,
    backend: HardwareBackend | str = HardwareBackend.AUTO,
    device_id: str | None = None,
    measured_at: datetime | None = None,
    metadata: Metadata | None = None,
) -> ResourceUsage:
    """Create a hardware memory usage record for scheduler accounting."""
    return ResourceUsage(
        resource=ResourceRef(
            uri=hardware_uri(backend, device_id),
            kind=ResourceKind.HARDWARE,
            component=IPFS_ACCELERATE_COMPONENT,
        ),
        amount=float(amount_bytes),
        unit=ResourceUnit.BYTES,
        measured_at=measured_at or utc_now(),
        metadata=dict(metadata or {}),
    )


@runtime_checkable
class ModelLoader(Protocol):
    """Model lifecycle boundary implemented by accelerate adapters."""

    def load_model(self, request: ModelLoadRequest) -> MaybeAwaitable[ModelLoadResult]:
        """Load, resolve, or warm a model for inference."""

    def unload_model(self, request: ModelUnloadRequest) -> MaybeAwaitable[ModelLoadResult]:
        """Unload a model handle and release resources."""

    def get_model(self, handle_id: str) -> MaybeAwaitable[LoadedModel | None]:
        """Return a loaded model handle by id."""

    def list_models(self) -> MaybeAwaitable[Sequence[LoadedModel]]:
        """List loaded model handles known to this runtime."""


@runtime_checkable
class ModelInferenceRuntime(Protocol):
    """Model inference boundary."""

    def run_inference(self, request: InferenceRequest) -> MaybeAwaitable[InferenceResult]:
        """Run a model inference request and return normalized outputs."""


@runtime_checkable
class ModelEmbeddingRuntime(Protocol):
    """Embedding generation boundary."""

    def embed(self, request: EmbeddingRequest) -> MaybeAwaitable[EmbeddingResult]:
        """Generate dense embeddings for text, media, or structured inputs."""


@runtime_checkable
class HardwareProfileProvider(Protocol):
    """Hardware inspection and recommendation boundary."""

    def hardware_profile(self, request: HardwareProfileRequest | None = None) -> MaybeAwaitable[HardwareProfile]:
        """Return current local or remote hardware capabilities."""

    def recommend_hardware(
        self,
        request: HardwareRecommendationRequest,
    ) -> MaybeAwaitable[HardwareRecommendation]:
        """Recommend a backend/device for a model task."""


@runtime_checkable
class ComputeQueueAdapter(Protocol):
    """Task queue boundary for local, daemon, or p2p compute work."""

    def submit_task(self, request: ComputeTaskRequest) -> MaybeAwaitable[ComputeTaskStatus]:
        """Submit compute work and return the initial task status."""

    def queue_state(self, queue_id: str | None = None) -> MaybeAwaitable[ComputeQueueState]:
        """Return queue state and counters."""

    def task_status(self, task_id: str) -> MaybeAwaitable[ComputeTaskStatus | None]:
        """Return the current state for a task."""

    def cancel_task(self, request: CancellationRequest) -> MaybeAwaitable[CancellationResult]:
        """Cancel queued or running compute work."""


@runtime_checkable
class ComputeResourceAccountant(Protocol):
    """Resource accounting boundary for scheduler and runtime adapters."""

    def reserve_resources(self, request: ResourceAccountingRequest) -> MaybeAwaitable[ResourceAccountingResult]:
        """Reserve resources for a model handle or queued task."""

    def record_usage(self, accounting: ComputeResourceAccounting) -> MaybeAwaitable[ResourceAccountingResult]:
        """Record observed resource use."""

    def release_resources(self, request: ResourceAccountingRequest) -> MaybeAwaitable[ResourceAccountingResult]:
        """Release resources held by a model handle or task."""

    def resource_usage(
        self,
        *,
        task_id: str | None = None,
        model_id: str | None = None,
        queue_id: str | None = None,
    ) -> MaybeAwaitable[Sequence[ComputeResourceAccounting]]:
        """Return resource accounting records for compute work."""


@runtime_checkable
class ModelComputeRuntimeAdapter(
    ModelLoader,
    ModelInferenceRuntime,
    ModelEmbeddingRuntime,
    HardwareProfileProvider,
    ComputeQueueAdapter,
    ComputeResourceAccountant,
    Protocol,
):
    """Complete model compute runtime contract for ``ipfs_accelerate_py``."""


__all__ = [
    "CancellationMode",
    "CancellationRequest",
    "CancellationResult",
    "ComputeQueueAdapter",
    "ComputeQueueState",
    "ComputeQueueStatus",
    "ComputeResourceAccountant",
    "ComputeResourceAccounting",
    "ComputeTaskRequest",
    "ComputeTaskState",
    "ComputeTaskStatus",
    "Embedding",
    "EmbeddingRequest",
    "EmbeddingResult",
    "EmbeddingVector",
    "HardwareAvailability",
    "HardwareBackend",
    "HardwareDevice",
    "HardwareProfile",
    "HardwareProfileProvider",
    "HardwareProfileRequest",
    "HardwareRecommendation",
    "HardwareRecommendationRequest",
    "IPFS_ACCELERATE_COMPONENT",
    "InferenceOutput",
    "InferenceRequest",
    "InferenceResult",
    "ModelComputeOperation",
    "ModelComputeRuntimeAdapter",
    "ModelEmbeddingRuntime",
    "ModelFormat",
    "ModelInferenceRuntime",
    "ModelInput",
    "ModelLoadMode",
    "ModelLoadRequest",
    "ModelLoadResult",
    "ModelLoader",
    "ModelPayload",
    "ModelRef",
    "ModelRuntimeState",
    "ModelTaskKind",
    "ModelUnloadRequest",
    "PrecisionMode",
    "QueueDiscipline",
    "ResourceAccountingPhase",
    "ResourceAccountingRequest",
    "ResourceAccountingResult",
    "basic_hardware_profile",
    "compute_queue_uri",
    "compute_task_uri",
    "hardware_memory_usage",
    "hardware_uri",
    "model_uri",
    "token_usage",
]
