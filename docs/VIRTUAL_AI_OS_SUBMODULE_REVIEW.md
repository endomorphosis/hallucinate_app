# Virtual AI OS Submodule Review

Generated: 2026-05-22T15:25:59+00:00

## Architecture Target

The monorepo should treat the submodules as components of a virtualized AI operating system:

- `ipfs_kit_py`: storage kernel and content-addressed filesystem substrate.
- `ipfs_datasets_py`: knowledge fabric, dataset runtime, GraphRAG, MCP tools, and autonomous todo daemon.
- `ipfs_accelerate_py`: model compute runtime, hardware-aware inference, and task scheduling.
- `swissknife`: user and agent shell with descriptor-driven UI and MCP++ UX.
- `mcp_plus_plus`: protocol profile for service mesh, identity, transport, and workflow semantics.

## Component Inventory

### ipfs_kit_py

- Path: `ipfs_kit_py`
- SHA: `3133d4fdc85a885ba7d776465bdee48f7a867e01`
- OS role: storage kernel and content-addressed IO substrate
- Capabilities: IPFS operations, IPLD and CAR-adjacent content handling, metadata and cache primitives, MCP server surfaces, libp2p and routing scaffolding
- Integration contracts: Virtual filesystem adapter, content metadata index adapter, daemon health and lifecycle adapter, capability-scoped storage operations
- Test seams: mocked add/cat/stat/list operations, metadata lookup contract tests, daemon launch smoke, offline cache behavior
- Major gaps: single stable VFS facade for monorepo consumers, explicit capability checks around destructive storage operations, typed error normalization for dashboard and agent callers

### ipfs_datasets_py

- Path: `ipfs_datasets_py`
- SHA: `14755236c1831a028ac8dc2cfcbfaa0aa5870bf4`
- OS role: knowledge fabric, dataset runtime, GraphRAG, MCP tools, and autonomous todo daemon
- Capabilities: dataset loading and processing, knowledge graph and GraphRAG services, MCP server and tool registry, legal and web data processors, todo implementation supervisor and daemon
- Integration contracts: knowledge fabric adapter, GraphRAG query adapter, MCP tool namespace contract, daemon task board contract, provenance and audit event contract
- Test seams: dataset load with mocked backend, GraphRAG query shape, MCP tool import and registry tests, todo daemon selection and artifact completion
- Major gaps: curated monorepo test subset for high-signal CI, stable GraphRAG service boundary independent of optional extras, documented daemon-safe task authoring rules for this repo

### ipfs_accelerate_py

- Path: `ipfs_accelerate_py`
- SHA: `ff61c14b4df44529ff6f73efa5e26fadeda649d5`
- OS role: model compute runtime, hardware-aware inference, task queues, and MCP++ reference implementation host
- Capabilities: model server and inference APIs, hardware backend detection, worker/task scheduling, MCP server tools, MCP++ module and nested reference submodule
- Integration contracts: compute adapter, model lifecycle and inference request contract, hardware profile contract, task queue and workflow scheduler contract, MCP++ service mesh contract
- Test seams: mocked inference and embedding calls, hardware profile fallback, daemon launch smoke, MCP++ task queue and workflow adapter tests
- Major gaps: stable lightweight contract tests that avoid heavy model downloads, consistent async/sync behavior across inference endpoints, resource accounting surfaced to the OS scheduler

### swissknife

- Path: `swissknife`
- SHA: `5b4598e15709203c0fe2265fdab2f51ea822b0f2`
- OS role: agent shell, descriptor-driven UI, CLI, web runtime, and MCP++ UX layer
- Capabilities: agent CLI and tools, MCP tool UI surfaces, descriptor runtime, schema-driven UI generation, UCAN auth and MCP++ transport services
- Integration contracts: descriptor pack ingestion, dashboard launcher adapter, agent tool bridge, auth and revocation adapter, generated UI quality gates
- Test seams: descriptor schema validation, generated UI runtime tests, transport and revocation unit tests, dashboard launcher smoke
- Major gaps: monorepo-owned descriptor launcher in Hallucinate shell, contract tests between SwissKnife descriptors and Python MCP services, clear boundary between reference UI assets and production shell assets

### mcp_plus_plus

- Path: `ipfs_accelerate_py/ipfs_accelerate_py/mcplusplus`
- SHA: `29343be704da4e193ff143bac7daae9b0f98435d`
- OS role: MCP++ protocol reference for service mesh semantics
- Capabilities: transport profiles, IDL and descriptor specifications, event DAG semantics, policy, scheduling, and UCAN delegation references
- Integration contracts: service mesh profile, descriptor conformance matrix, event envelope contract, capability delegation contract
- Test seams: schema conformance tests, event DAG ordering tests, transport fallback tests, UCAN grant and revocation tests
- Major gaps: requested underscore repository URL is not accessible, top-level repo needs an explicit policy for nested MCP++ pin ownership, wire protocol tests should run without requiring live peer networking

## Integration Boundary Rules

1. Hallucinate App owns the Virtual AI OS contracts and adapters.
2. Submodules keep their native APIs; adapters absorb constructor, CLI, and optional dependency drift.
3. All cross-component calls flow through typed contracts, daemon configs, or MCP++ descriptors.
4. Heavy model, network, and browser dependencies stay out of fast contract tests.
5. Every OS feature must have a mocked contract test before live daemon or e2e coverage is required.

## Immediate Risks

- Nested submodule recursion is noisy and needs an explicit policy.
- MCP++ is accessible as `Mcp-Plus-Plus` or `mcp-plus-plus`, not the requested underscore URL.
- The OS scheduler needs resource accounting before model workloads can be safely virtualized.
- The dashboard needs descriptor contract tests before SwissKnife UI assets are promoted.
- Security and capability boundaries need to be explicit before autonomous agents can mutate storage or run tools.
