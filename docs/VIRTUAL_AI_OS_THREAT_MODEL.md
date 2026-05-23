# Virtual AI OS Security Threat Model

- Status: initial
- Date: 2026-05-22
- Task: OS-034
- Depends on: OS-017
- Primary references:
  - `docs/adr/ADR-001-virtual-ai-os-kernel-contract.md`
  - `docs/adr/ADR-002-mcp-plus-plus-service-mesh.md`
  - `docs/adr/ADR-003-virtual-filesystem-and-content-addressing.md`
  - `docs/adr/ADR-004-knowledge-fabric-contract.md`
  - `docs/adr/ADR-007-identity-auth-capabilities.md`
  - `config/mcp_plus_plus_profile.json`
  - `docs/SUBMODULE_INTEGRATION_BASELINE.md`

## Scope

This threat model covers the Virtual AI OS integration boundary owned by
Hallucinate App. The protected boundary includes:

- Electron main and renderer processes, including dashboard windows.
- MCP daemon lifecycle management for `ipfs_kit_py`, `ipfs_datasets_py`, and
  `ipfs_accelerate_py`.
- MCP++ service mesh descriptors, transports, execution envelopes, receipts,
  event DAG nodes, and scheduler inputs.
- Virtual filesystem and content-addressed IO through IPFS, IPLD, metadata
  indexes, and dataset artifacts.
- Model loading, inference, plugin/tool descriptor execution, and generated UI
  descriptor ingestion from SwissKnife and MCP++ surfaces.
- DID identities, UCAN proof chains, local grants, credential leases, daemon
  permissions, revocation records, and redacted security audit events from
  OS-017.

Out of scope for this document: a new cryptographic UCAN verifier, a durable
credential vault, live libp2p deployment policy, cloud IAM policy, and detailed
incident response runbooks. Those remain implementation or operations tasks.

## Security Objectives

- Execute only explicitly authorized operations for the active actor, resource,
  action, and context.
- Keep private keys, raw UCAN tokens, bearer tokens, API keys, credential files,
  and proof bundles out of logs, descriptor metadata, UI state, crash reports,
  and event streams.
- Preserve content integrity across IPFS, IPLD, model artifacts, descriptor
  packs, dataset artifacts, and MCP++ execution envelopes.
- Treat submodules, plugins, models, descriptor packs, IPFS content, and remote
  peers as untrusted until pinned, validated, and authorized at the Hallucinate
  App boundary.
- Isolate local code execution so a compromised model, plugin, descriptor,
  renderer, or daemon cannot silently expand to host filesystem, process, key,
  credential, or network control.
- Produce enough redacted audit evidence to reconstruct security decisions,
  revocations, daemon actions, transport failures, and dashboard-initiated
  operations.

## Trust Boundaries

| Boundary | Trusted side | Untrusted or mixed side | Required control |
|---|---|---|---|
| Electron main to renderer | Main process and preload APIs | Dashboard DOM, generated UI, user content, remote previews | Context-isolated IPC, allowlisted channels, no secret-bearing renderer globals |
| Renderer to daemon manager | Authorized UI command intent | IPC messages and dashboard controls | OS-017 daemon permission decision before start, stop, restart, config, logs, or health actions |
| Daemon manager to submodule processes | Repository-owned daemon config | Python submodule code, inherited environment, stdout/stderr | Fixed command allowlist, least-privilege environment, redacted logs, resource quotas |
| MCP++ service mesh | Repository profile and adapter contracts | Peer endpoints, descriptor packs, envelopes, receipts | Descriptor schema validation, UCAN proof validation, envelope canonicalization, receipt binding |
| VFS/content addressing | Normalized Virtual AI OS VFS contract | IPFS network, gateways, mutable path metadata, imported CARs | CID verification, codec/schema checks, pin policy, provenance records |
| Identity and credentials | OS-017 contract payloads and broker references | Native keystores, submodule credentials, local test grants | Key references only, credential leases, revocation lookup, audit redaction |
| Dashboard data rendering | Sanitized view models | Content metadata, daemon logs, error messages, descriptor text | DOM escaping, CSP, sanitized previews, no `innerHTML` with untrusted fields |

## Key Assets

- DID private key material and key references.
- UCAN proofs, revocation records, local grants, and daemon permission grants.
- Submodule credentials for IPFS clusters, model providers, dataset sources,
  object stores, GitHub reporting, and service accounts.
- MCP++ descriptors, interface CIDs, execution envelopes, policy CIDs, proof
  CIDs, receipts, event DAG nodes, and scheduler decisions.
- IPFS CIDs, IPLD blocks, pins, metadata indexes, dataset artifacts, provenance
  records, and model artifacts.
- Local host resources: filesystem paths, processes, ports, GPUs, shared memory,
  caches, package managers, and shell execution.
- Dashboard IPC channels, saved dashboard state, localStorage search history,
  logs, error reports, and rendered previews.

## Threat Actors

- A local user or process that can write files, set environment variables, send
  IPC messages, or interact with dashboard windows.
- A malicious model, plugin, MCP tool, descriptor pack, dataset, or IPFS object.
- A compromised or drifted submodule release.
- A remote MCP++ peer, relay, gateway, or pubsub publisher.
- A compromised DID key, stolen UCAN proof, leaked credential, or stale local
  grant.
- A benign developer running mock implementations that accidentally become
  trusted in production.

## Threats and Required Controls

| Area | Threat | Impact | Required controls |
|---|---|---|---|
| Local code execution | A descriptor, plugin, model loader, dataset tool, or dashboard IPC path starts arbitrary commands or accesses host paths. | Host compromise, credential theft, persistence, data deletion. | Keep daemon commands in a static allowlist; require OS-017 capability decisions for daemon and command operations; pass logical VFS paths instead of host paths; execute submodule work in dedicated processes with cwd, env, port, CPU, memory, GPU, and timeout limits; deny shell interpolation and user-controlled command args; emit redacted audit events for starts, stops, crashes, denials, and force kills. |
| Local code execution | A Python submodule process inherits broad environment secrets or logs them through stdout/stderr, daemon status, or GitHub issue reporting. | Credential disclosure through dashboard logs, crash reports, or event streams. | Build a minimal environment per daemon; broker credentials as scoped leases; redact token-like fields before logs and issue reports; cap retained daemon logs; classify raw logs as sensitive until scrubbed; do not expose raw proof bundles or credential file paths to renderers. |
| Model and plugin supply chain | Updated submodule SHAs, model artifacts, plugin descriptors, or generated UI packs introduce malicious behavior after baseline drift. | Unauthorized tool execution, model poisoning, prompt/data exfiltration, UI compromise. | Enforce `config/submodule_integration_baseline.json`; require rollback SHAs; validate descriptor schema and compatibility fields; require signed or pinned descriptor/model manifests before promotion; record source repo, commit, CID, digest, and reviewer in provenance; quarantine unpinned or newly discovered plugins until reviewed. |
| Model and plugin supply chain | Model files, tokenizer files, Python wheels, npm packages, or plugin assets execute install-time or load-time code. | Arbitrary code execution under the app user. | Prefer data-only model formats where available; isolate model loading from UI and credential brokers; disable automatic dependency installation in runtime paths; run package changes through lockfile review and CI; restrict dynamic imports to allowlisted adapters; scan descriptor-declared side effects before scheduling. |
| IPFS content trust | A fetched CID contains malicious, oversized, mislabeled, or decompression-bomb content. | Memory exhaustion, parser exploit, unsafe previews, model or dataset poisoning. | Verify bytes against requested CID; enforce size, codec, MIME, schema, and recursion limits before parsing; stream large reads; sandbox previews; never execute content solely because it is content-addressed; keep content trust separate from content integrity. |
| IPFS content trust | Mutable VFS path metadata, gateway responses, provider records, or pin references point to unexpected CIDs. | Stale data, downgrade, substitution, data loss. | Resolve logical paths to immutable `ipfs://{cid}` or metadata row URIs before execution; record path-to-CID decisions in provenance; require explicit capability for pin, unpin, delete, link, and derive operations; verify pin policy distinguishes top-level integration pins from nested reference pins. |
| UCAN and DID compromise | DID private keys, raw UCAN proofs, or local grants are stolen, logged, replayed, or over-delegated. | Unauthorized service invocation, content access, daemon control, or credential leasing. | Store private material only behind key references; require issuer, audience, signature, attenuation, caveat, expiry, and revocation checks at execution time; prefer short-lived attenuated proofs; reject stale local grants; rotate compromised keys; revoke proof CIDs and grant IDs; audit allow, deny, issue, revoke, and error outcomes with sensitive fields redacted. |
| UCAN and DID compromise | Mock UCAN managers or permissive local authorities are used outside tests. | False authorization success in developer or production builds. | Gate mock authorities behind explicit test/development flags; fail closed when verifier or revocation registry is unavailable in protected paths; label mock events; include a startup health signal for verifier, keystore, broker, and revocation backend state. |
| MCP++ transport | A remote peer or local service forges descriptors, replays envelopes, injects oversized frames, or abuses pubsub. | Cross-service invocation spoofing, denial of service, incorrect event DAG, false receipts. | Follow `config/mcp_plus_plus_profile.json`: preserve JSON-RPC ID correlation, run initialize before traffic, separate transport identity from execution authority, authenticate and encrypt p2p channels, validate frame length before allocation, rate-limit sessions, and never depend on pubsub for request/response correctness. |
| MCP++ transport | Receipts, event DAG nodes, scheduler inputs, or policy decisions are not bound to the checked proof and envelope. | Confused-deputy execution, untraceable side effects, forged provenance. | Canonicalize envelope, descriptor, input, policy, proof, decision, output, receipt, and event bytes before CID derivation; require parent event CIDs for dependent invocations; bind receipts to proofs checked and policy decisions; reject descriptors that declare capabilities without matching grants. |
| Dashboard surfaces | Dashboard windows run with Node integration, disabled context isolation, broad IPC listeners, or unescaped `innerHTML` for logs, metadata, CIDs, model results, and descriptor text. | Renderer XSS becomes Node code execution, secret exfiltration, daemon control, or filesystem access. | Move dashboard windows to context isolation and preload-mediated APIs; disable Node integration for renderer content; allowlist IPC channels by window and actor; sanitize all untrusted DOM fields; apply a restrictive CSP; treat daemon logs and descriptor text as untrusted; avoid persisting secrets or tokens in localStorage. |
| Dashboard surfaces | Security, auth, model, IPFS, and content index dashboards expose admin actions, raw tokens, saved searches, previews, or error details to the wrong actor. | Privilege escalation, sensitive metadata disclosure, confused operations. | Require OS-017 capability checks for dashboard actions; split read, write, execute, delegate, and admin controls; filter dashboard data through safe serialization; redact errors before display; mark degraded or mock auth states visibly; clear sensitive UI state on identity change, revoke, logout, or renderer reload. |

## Control Baseline by Component

### Electron and Dashboards

- Default target for new dashboard windows: `nodeIntegration: false`,
  `contextIsolation: true`, preload-only IPC, and a restrictive Content Security
  Policy.
- Dashboard IPC channels must be namespaced, allowlisted, and mapped to an
  actor identity before dispatch.
- Renderer code must treat daemon logs, descriptor metadata, model output,
  dataset metadata, CID details, and error messages as attacker-controlled
  strings.
- Dashboard state may store preferences, filters, and non-sensitive history in
  localStorage. It must not store UCAN tokens, private key references,
  credential leases, bearer tokens, raw proofs, or daemon environment values.
- Dashboard health views should show degraded states for missing verifier,
  missing revocation registry, mock UCAN manager, baseline drift, unsigned
  descriptor, unpinned model, and disabled transport encryption.

### Daemon Manager and Local Processes

- Daemon launch commands must come from repository-owned config or static
  allowlists, not descriptor text or user input.
- Start, stop, restart, status, health, logs, and configure actions require
  `DaemonPermissionRequest` authorization.
- Daemon stdout/stderr must pass through redaction before entering UI status,
  retained log buffers, issue reports, metrics, or event streams.
- Environment variables should be minimized per daemon. Secrets should flow by
  credential lease references where possible.
- Auto-restart should preserve crash evidence, enforce restart limits, and
  surface repeated crashes as degraded rather than silently looping.

### Model, Plugin, and Descriptor Supply Chain

- Submodule SHAs must match the integration baseline before promotion.
- Model and plugin artifacts must carry immutable identifiers: repo, commit,
  package version, CID, digest, descriptor CID, and source trust tier.
- Descriptor packs are metadata, not authority. Invocation requires matching
  UCAN proof or local grant.
- Any descriptor-declared side effect, resource claim, install hook, native
  binding, shell action, network access, file write, or credential access must
  be reviewed and authorized before execution.
- New or drifted descriptors should be handled as quarantine candidates until
  schema validation, compatibility checks, and security review pass.

### IPFS and VFS

- CID verification establishes integrity, not safety or trust.
- Mutable path links must be resolved to immutable content identifiers before
  model load, dataset load, tool execution, or dashboard preview.
- Parsers and previewers need content-size, recursion, type, and timeout limits.
- Pin, unpin, delete, link, import, export, and derive operations require
  resource-scoped capabilities and provenance records.
- Gateways and remote peers must not be trusted to supply identity, policy, or
  authorization decisions.

### Identity, UCAN, DID, and Credentials

- DID private material is referenced, not serialized, in Virtual AI OS contract
  payloads.
- Raw UCAN tokens and proof bundles are sensitive. Audit events should use
  token references, proof CIDs, grant IDs, and redacted payloads.
- Execution-time authorization must check audience, issuer, signature,
  attenuation, caveats, expiry, revocation, action, resource, and local policy.
- Credential leases must be short-lived, scoped to component, action, resource,
  and process, and revoked on identity change or daemon shutdown.
- Compromise response requires revocation of grant IDs/proof CIDs, key rotation,
  invalidation of derived credential leases, and audit correlation across event
  DAG parents.

### MCP++ Mesh

- MCP++ descriptors must be validated against the repository profile before
  adapter registration.
- Execution envelopes must bind `interface_cid`, `input_cid`, `intent_cid`,
  optional `policy_cid`, optional `proof_cid`, and causal parents.
- Receipts must bind output, policy decision, checked proofs, signer, and
  envelope or intent.
- P2P transport must enforce authenticated encryption, bounded frames, per-peer
  quotas, keepalive/timeout behavior, replay protection, and rate limits.
- Pubsub announcements are advisory. Correctness must rely on direct
  request/response validation and receipt checks.

## Abuse Cases

1. A malicious descriptor pack declares a harmless UI but routes a button to a
   daemon restart command. The IPC handler must authorize the actor for
   `virtual-os://daemons/{daemon_id}` restart before dispatch and audit a denial
   if no grant matches.
2. A model CID resolves correctly but contains a pickle-style payload that
   executes code during load. The model loader must treat CID match as integrity
   only and enforce an allowlist of safe formats or sandboxed loaders.
3. A renderer XSS in a content metadata table attempts to read Node APIs and
   send daemon control IPC. Context isolation, disabled Node integration,
   sanitized DOM rendering, and IPC actor checks should block escalation.
4. A stolen UCAN proof is replayed over MCP++ WebSocket after revocation. The
   adapter must reject the invocation during execution-time revocation lookup
   and emit a redacted security denial event.
5. A peer publishes a forged receipt on MCP++ pubsub. Consumers must verify the
   receipt CID, signer, proof checks, policy decision, and parent event linkage
   before accepting it as provenance.
6. A gateway serves content for the requested CID but with a misleading MIME
   type and excessive expansion ratio. VFS adapters must verify CID bytes and
   enforce parser limits before preview, indexing, or execution.

## Minimum Validation Gates

- Baseline drift: verify submodule SHAs and nested MCP++ pins against the
  baseline manifest before enabling Virtual AI OS integrations.
- Contract tests: deny storage, daemon, command, credential, and MCP++
  invocation without a matching capability grant.
- Redaction tests: confirm raw UCAN tokens, bearer tokens, API keys, private key
  references, proof bundles, and credential file paths do not appear in events,
  daemon status, dashboard state, or issue reports.
- Descriptor tests: validate MCP++ IDL, descriptor, envelope, receipt, and UI
  descriptor schemas with both accepted and malicious fixtures.
- Dashboard tests: render representative metadata, logs, descriptors, model
  output, and error strings containing HTML/script payloads without execution.
- Transport tests: reject oversized frames, replayed envelopes, invalid
  receipts, missing initialize sessions, unauthenticated p2p peers, and revoked
  UCAN proofs.
- IPFS tests: verify CID mismatch rejection, mutable path-to-CID provenance,
  parser limits, unsafe preview blocking, and capability checks for pin/unpin
  and delete/link operations.

## Open Risks and Follow-Up Work

- Replace current dashboard windows that use renderer Node integration and
  disabled context isolation with preload-mediated, context-isolated windows.
- Add an executable policy for minimal daemon environments and credential lease
  injection.
- Add signed or reviewer-attested manifests for model, plugin, and descriptor
  artifacts.
- Add durable revocation storage and live UCAN signature verification adapters
  for production paths.
- Add sandbox/resource isolation for model loading, plugin execution, dataset
  parsing, and generated UI previews.
- Add dashboard-safe serializers for daemon logs, descriptor metadata, model
  results, and error reports.
- Add chaos fixtures for corrupt descriptors, malicious IPFS content, revoked
  UCAN proofs, compromised peers, and missing verifier backends.

