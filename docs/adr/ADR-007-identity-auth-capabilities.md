# ADR-007: Identity, Auth, and Capability Model

- Status: accepted
- Date: 2026-05-22
- Task: OS-017

## Context

ADR-001 defined the Virtual AI OS kernel contract, including `IdentityRef`,
`CapabilityGrant`, `CapabilityAuthority`, `ResourceRef`, and `EventEnvelope`.
ADR-002 defined the MCP++ service mesh profile and made UCAN proof validation an
execution-time requirement for cross-component invocations.

The repository now needs a single security model for:

- DID-backed identities and key storage references.
- UCAN proof bundles, attenuation, expiry, and revocation checks.
- Local capability grants for offline tests and local daemon workflows.
- Daemon permissions for start, stop, restart, status, health, log, and config
  operations.
- Submodule credentials used by `ipfs_kit_py`, `ipfs_datasets_py`,
  `ipfs_accelerate_py`, SwissKnife, and MCP++ adapters.
- Security audit events that redact secrets before publication.

Without a Hallucinate-owned contract, adapters would have to couple directly to
SwissKnife UCAN auth, `ipfs_kit_py` cluster auth, `ipfs_datasets_py` mock UCAN
helpers, or daemon manager internals.

## Decision

Define `python/hallucinate_app/virtual_os/security.py` as the repository-owned
identity, auth, capability, credential, and audit contract. The module remains
stdlib-only and composes ADR-001 payloads instead of importing component
submodules.

The contract defines:

- Identity and key records: `IdentityRecord`, `DIDKeyRef`, `IdentityKind`,
  `KeyAlgorithm`, and `KeyStorageState`.
- UCAN projections: `UCANProof`, `UCANCapability`, `ucan_capability_to_grant`,
  proof-to-grant conversion, proof expiry windows, and `UCANVerifier`.
- Local grants and revocation: `LocalCapabilityAuthority`,
  `InMemoryRevocationRegistry`, `RevocationRecord`, `grant_allows`,
  `authorize_capability`, and `require_capability`.
- Daemon permission checks: `DaemonPermissionRequest`,
  `DaemonPermissionDecision`, `DaemonPermissionAuthorizer`, and canonical
  `virtual-os://daemons/{daemon_id}` resources.
- Submodule credential references and leases: `SubmoduleCredentialRef`,
  `CredentialAccessRequest`, `CredentialLease`, `CredentialBroker`, and
  canonical `credential://{component}/{credential_id}` resources.
- Security audit helpers: `SecurityAuditContext`, `SecurityAuditEmitter`,
  `security_audit_event`, `emit_denied_event`, `redact_sensitive_payload`, and
  `redact_error`.

The local authority is intentionally small and deterministic enough for offline
contract tests. It is not the production cryptographic verifier. Production or
live adapters must plug in native UCAN signature verification, DID key stores,
credential vaults, revocation persistence, and event bus publication through
the Protocols.

## Authorization Model

All protected operations are evaluated as an actor, action, resource, grant set,
and optional context:

1. Local grants and UCAN proofs are normalized into `CapabilityGrant` values.
2. The authorizer checks audience DID, expiry, revocation, action match,
   resource match, and local caveats.
3. A decision records the matched grant or denial reason.
4. A redacted audit event can be emitted for allow, deny, issue, and revoke
   paths.

UCAN remains the cross-component delegation format for MCP++ invocation. DID key
storage is modeled by reference only; private material is never stored in the
contract payloads. Local grants cover daemon controls, test fixtures, and
single-machine workflows where a full UCAN stack is unavailable.

## Resource Vocabulary

Security resources use stable URI forms:

- `virtual-os://services/{service_id}` for service invocation.
- `virtual-os://daemons/{daemon_id}` for daemon control.
- `virtual-os://events/{event_stream}` for audit and event streams.
- `credential://{component}/{credential_id}` for submodule credentials.
- `did-key://{did}/{key_id}` for DID key references.
- MCP++ and content resources retain the profile vocabulary from ADR-002, such
  as `mcp++/interfaces/{interface_cid}`, `mcp++/content/{cid}`, `ipfs://{cid}`,
  and `sha256:{digest}`.

Resource grants may be exact, wildcard, or prefix-pattern scoped. `admin` and
`*` actions cover subordinate actions. Rich policy evaluation remains an adapter
or later policy-engine concern.

## Boundaries

This ADR does not define a new cryptographic UCAN implementation, durable
keystore, credential vault, daemon launcher, policy language, or event bus. It
defines the payloads and checks that adapters must normalize to before invoking
submodule code.

Adapters must not log raw UCAN tokens, bearer tokens, API keys, private keys,
credential files, or proof bundles. Audit helpers redact sensitive fields and
common token fragments before producing `EventEnvelope` payloads.

Descriptors are still not authorization. A service descriptor can declare
required capabilities, but execution requires matching grants or UCAN proofs.

## Consequences

OS-018 can add offline security contract tests for grant validation, revocation
lookup, denied operations, redacted error logging, and credential access without
starting daemons or importing optional crypto libraries.

Component adapters can adopt this model incrementally:

- SwissKnife can map `DIDKeystore`, `UCANAuth`, and its revocation registry into
  `DIDKeyStore`, `UCANVerifier`, and `RevocationRegistry`.
- `ipfs_kit_py` cluster authentication can project node roles, UCAN tokens, and
  pin/config capabilities into `CapabilityGrant` values.
- `ipfs_datasets_py` provenance and audit paths can receive already-redacted
  `EventEnvelope` values.
- Daemon manager code can require `DaemonPermissionRequest` decisions before
  lifecycle operations.
- Submodule adapters can request credential leases without exposing secret
  material to logs or descriptor metadata.
