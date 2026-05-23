# ADR-001: Virtual AI OS Kernel Contract

- Status: accepted
- Date: 2026-05-22
- Task: OS-003

## Context

The Virtual AI OS integration backlog treats the repository submodules as OS
components:

- `ipfs_kit_py` provides the storage kernel and content-addressed IO substrate.
- `ipfs_datasets_py` provides the knowledge fabric, dataset runtime, GraphRAG,
  MCP tools, and todo daemon.
- `ipfs_accelerate_py` provides model compute, hardware-aware inference, task
  queues, and the MCP++ reference host.
- `swissknife` provides the agent shell, descriptor-driven UI, CLI, web
  runtime, and MCP++ UX layer.
- `mcp_plus_plus` provides service mesh semantics, identity, transport, and
  workflow references.

OS-001 and OS-002 established two constraints for the first runtime boundary:
Hallucinate App owns the contracts and adapters, and all cross-component calls
must flow through typed contracts, daemon configs, or MCP++ descriptors. Direct
imports between submodules would make optional dependencies, daemon startup, and
baseline SHA drift leak across component boundaries.

## Decision

Define the first kernel contract in
`python/hallucinate_app/virtual_os/contracts.py` as a pure Python standard
library module. The contract exports immutable payload dataclasses, enum values,
and `typing.Protocol` interfaces. It does not import any component submodule.

The contract defines these abstractions:

- Process: `ProcessSpec`, `ProcessStatus`, `ProcessState`, `RestartPolicy`, and
  `ProcessAdapter`.
- Service: `ServiceDescriptor`, `ServiceEndpoint`, `ServiceStatus`,
  `HealthState`, and `ServiceAdapter`.
- Capability: `CapabilitySpec`, `CapabilityGrant`, `CapabilityAction`,
  `CapabilityAuthority`, and `CapabilityDenied`.
- Storage: `StorageRef`, `StorageRequest`, `StorageResult`,
  `StorageOperation`, and `StorageAdapter`.
- Event: `EventEnvelope`, `EventSeverity`, `EventHandler`, and `EventBus`.
- Identity: `IdentityRef` and `IdentityProvider`.
- Resource: `ResourceRef`, `ResourceClaim`, `ResourceUsage`, `ResourceKind`,
  `ResourceUnit`, and `ResourceManager`.
- Component registry seam: `ComponentAdapter` for later adapter discovery.

Protocol methods return `MaybeAwaitable[T]` so existing synchronous APIs and
future asynchronous daemon or MCP++ APIs can implement the same interface
without wrapper-only churn.

## Boundaries

Submodules may implement these Protocols in their own adapters, but contract
payloads must remain owned by Hallucinate App. Component adapters should convert
native component objects into these payloads at the boundary.

The kernel contract intentionally avoids:

- Concrete daemon launch behavior.
- VFS path and CID semantics beyond normalized storage references.
- GraphRAG, model inference, MCP++ wire format, descriptor, and scheduler
  details that have dedicated follow-up ADRs in the backlog.
- Pydantic or third-party dependencies.

## Consequences

Adapters for storage, knowledge, compute, MCP++, daemon management, and UI can
be tested with mocks against a single importable contract module. Security gates
can also check capabilities and event redaction before live network, model, or
browser dependencies are required.

The contract is intentionally broad but shallow. Follow-up tasks should add
domain-specific modules such as `vfs.py`, `knowledge.py`, `compute.py`,
`processes.py`, `security.py`, and `events.py` by composing these kernel
payloads rather than replacing them.
