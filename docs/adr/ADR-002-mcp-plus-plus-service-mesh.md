# ADR-002: MCP++ Service Mesh Profile

- Status: accepted
- Date: 2026-05-22
- Task: OS-007

## Context

ADR-001 defined the Virtual AI OS kernel contract and kept component adapters
behind Hallucinate-owned process, service, capability, storage, event, identity,
and resource abstractions. The next runtime boundary is the service mesh used by
agents and services that need to invoke each other without importing across
submodules.

The nested MCP++ reference implementation in
`ipfs_accelerate_py/ipfs_accelerate_py/mcplusplus` defines draft profiles for
transport, MCP-IDL interface contracts, CID-native execution artifacts, UCAN
delegation, temporal policy evaluation, event DAG ordering, and risk-aware
scheduling. SwissKnife also contains an MCP++ implementation for descriptor
runtime, UI generation, envelope handling, UCAN auth, and scheduler behavior.

The top-level repository still needs a stable profile that all Virtual AI OS
services can target before conformance tests are added. That profile must cover:

- Transport and session rules.
- IDL and descriptor discovery.
- Execution envelopes and receipts.
- UCAN delegation and revocation.
- Event DAG ordering and provenance.
- Scheduler and resource-accounting inputs.
- Descriptor requirements for every service boundary.

## Decision

Define `config/mcp_plus_plus_profile.json` as the repository-owned MCP++ service
mesh profile. The profile is a contract document, not a daemon launcher. Daemon
ports and process management remain owned by daemon configuration tasks.

Every Virtual AI OS service that participates in cross-component invocation must
advertise the following MCP++ capabilities through its service descriptor:

- `mcp++/idl`
- `mcp++/cid-envelope`
- `mcp++/ucan`
- `mcp++/event-dag`
- `mcp++/risk-scheduler`

The baseline transport remains standard MCP JSON-RPC semantics over the
configured daemon endpoint. Services may also advertise `mcp+p2p` when peer
networking is enabled, but point-to-point request/response correctness must not
depend on pubsub dissemination.

The mesh profile requires:

- Deterministic canonicalization before any object is converted into a CID.
- Runtime-queryable interface descriptors with `name`, `namespace`, `version`,
  `methods`, `errors`, `requires`, and `compatibility`.
- Execution envelopes that bind `interface_cid`, `input_cid`, `intent_cid`,
  optional `policy_cid`, optional `proof_cid`, and causal `parents`.
- Receipts that bind outputs to checked proofs, policy decisions, and the
  envelope or intent they satisfy.
- UCAN proof validation at execution time, including issuer/audience bindings,
  signatures, attenuation, caveats, expiry, and revocation checks.
- Event nodes that link intents, interfaces, proofs, decisions, outputs,
  receipts, peers, timestamps, and parent event CIDs into a strict partial
  order.
- Scheduler inputs for dependency readiness, priority hints, risk evidence,
  resource claims, capability grants, and peer-cluster hints.
- Service descriptors that declare endpoints, IDL descriptors, required
  capabilities, resource claims, emitted event types, scheduler class, and UI
  descriptor metadata when a service has a user-facing surface.

## Service Coverage

The profile applies to the following Virtual AI OS service boundaries:

- `ipfs-kit-mcp`: storage and content-addressed IO.
- `ipfs-datasets-mcp`: datasets, knowledge fabric, GraphRAG, and MCP tools.
- `ipfs-accelerate-mcp`: model compute, inference jobs, hardware profiles, and
  workflow scheduling.
- `swissknife-mcp`: agent shell, descriptor runtime, UI generation, auth, and
  tool routing.
- `mcp-plus-plus-reference`: reference profile, descriptor, envelope, UCAN,
  event DAG, and scheduler semantics.

Each service can choose its native implementation, but adapters must normalize
service metadata to the profile before another component invokes it.

## Boundaries

This ADR does not define concrete service launch commands, live peer discovery,
model inference APIs, VFS semantics, or UI layout. It also does not make the
nested MCP++ draft specs the source of truth for Hallucinate App behavior. The
top-level profile owns the interoperability contract, while nested docs remain
reference material and implementation guidance.

MCP++ descriptors are not authorization. Descriptors describe a service and its
interfaces; UCAN proofs and policy decisions authorize execution.

## Consequences

OS-008 can add offline conformance tests against one JSON profile instead of
deriving requirements from multiple nested docs. Component adapters can expose
MCP++ metadata incrementally while preserving baseline MCP behavior. The profile
also gives daemon, scheduler, UI, and security tasks one shared vocabulary for
capabilities, event provenance, and descriptor validation.

The profile intentionally keeps `mcp+p2p` optional until peer networking is
needed. Local daemon and mocked conformance tests can validate the required
contract without live libp2p, DHT, relay, or pubsub dependencies.
