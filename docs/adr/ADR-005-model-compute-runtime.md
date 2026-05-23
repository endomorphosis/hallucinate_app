# ADR-005: Model Compute Runtime Contract

- Status: accepted
- Date: 2026-05-22
- Task: OS-013

## Context

ADR-001 established that Hallucinate App owns the Virtual AI OS contracts while
submodules keep their native APIs. The next P0 runtime boundary is model
compute served by `ipfs_accelerate_py`: model loading, hardware-aware inference,
embedding generation, hardware profile detection, task queues, cancellation, and
resource accounting.

The `ipfs_accelerate_py` submodule exposes this behavior through several native
surfaces, including the Python `IPFSAccelerator` API, model manager metadata,
MCP inference and hardware tools, embedding routers, and p2p TaskQueue tools.
Those surfaces are valuable implementation choices, but Hallucinate App callers
need one stable, lightweight contract that can be tested without model downloads,
GPU libraries, or a live MCP daemon.

## Decision

Define `python/hallucinate_app/virtual_os/compute.py` as the repository-owned
model compute runtime contract. Like the kernel, VFS, and knowledge contracts,
it is a pure Python standard library module composed from ADR-001 payloads such
as `IdentityRef`, `ResourceRef`, `StorageRef`, `CapabilityGrant`,
`ResourceClaim`, `ResourceUsage`, `EventEnvelope`, and `MaybeAwaitable`.

The contract defines immutable payloads and runtime-checkable Protocols for:

- Model lifecycle: `ModelRef`, `ModelLoadRequest`, `LoadedModel`,
  `ModelLoadResult`, `ModelUnloadRequest`, and `ModelLoader`.
- Inference: `ModelInput`, `InferenceRequest`, `InferenceOutput`,
  `InferenceResult`, task kinds, model formats, and `ModelInferenceRuntime`.
- Embeddings: `EmbeddingRequest`, `Embedding`, `EmbeddingResult`, and
  `ModelEmbeddingRuntime`.
- Hardware profile: `HardwareDevice`, `HardwareProfile`,
  `HardwareProfileRequest`, `HardwareRecommendationRequest`,
  `HardwareRecommendation`, hardware backend/availability enums,
  `HardwareProfileProvider`, and a dependency-free `basic_hardware_profile`
  fallback.
- Queue state and cancellation: `ComputeTaskRequest`, `ComputeTaskStatus`,
  `ComputeQueueState`, `CancellationRequest`, `CancellationResult`,
  `ComputeQueueAdapter`, and queue/task state enums.
- Resource accounting: `ResourceAccountingRequest`,
  `ComputeResourceAccounting`, `ResourceAccountingResult`,
  `ComputeResourceAccountant`, plus helpers for token and hardware memory usage.
- Full adapter surface: `ModelComputeRuntimeAdapter`, which composes model
  lifecycle, inference, embedding, hardware profile, queue, cancellation, and
  accounting Protocols.

All capability-scoped requests carry an actor and optional capability grants.
Resource references emitted by the contract identify `ipfs_accelerate_py` as
the serving component so the OS scheduler and security tasks can account for
model, hardware, queue, and task resources consistently.

## Boundaries

This contract does not import `ipfs_accelerate_py`, PyTorch, Transformers,
OpenVINO, CUDA, ROCm, WebGPU, WebNN, DuckDB, or MCP server modules. Adapters
must convert native backend objects and daemon envelopes into the contract
payloads at the boundary.

The contract intentionally avoids:

- Choosing a single model manager, inference backend, or embedding router.
- Downloading, warming, or caching model weights.
- Starting MCP, FastAPI, libp2p, or p2p TaskQueue services.
- Defining GPU probing beyond the stdlib CPU fallback helper.
- Replacing the OS scheduler, resource manager, or later live adapter tests.

## Consequences

OS-014 can test model load, inference, embedding, hardware fallback, queue
state, cancellation, and resource accounting using mocks against one importable
contract module.

Compute adapters can support synchronous Python APIs, asynchronous MCP tools,
or remote p2p TaskQueue services behind the same Protocols because methods
return `MaybeAwaitable[T]`. The contract also gives security, daemon, and
scheduler work a stable place to attach capability checks, queue state,
cancellation receipts, and token or hardware usage records before live
accelerator dependencies are available.
