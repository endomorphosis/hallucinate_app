"""Identity, authorization, credential, and audit contracts for Virtual AI OS.

This module is stdlib-only. It defines the Hallucinate-owned security boundary
that UCAN, DID/key storage, daemon permission checks, submodule credentials, and
audit emitters can implement without importing component submodules.
"""

from __future__ import annotations

import fnmatch
import hashlib
import json
import re
import secrets
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Protocol, runtime_checkable

from .contracts import (
    CapabilityAction,
    CapabilityAuthority,
    CapabilityDenied,
    CapabilityGrant,
    CapabilitySpec,
    EventEnvelope,
    EventSeverity,
    IdentityRef,
    MaybeAwaitable,
    Metadata,
    ResourceKind,
    ResourceRef,
    utc_now,
)


class SecurityContractError(Exception):
    """Base error raised by security contract helpers and adapters."""


class RevokedCapability(SecurityContractError):
    """Raised when a grant or UCAN proof has been revoked."""


class CredentialAccessDenied(CapabilityDenied):
    """Raised when a caller lacks authority to read or lease a credential."""


class IdentityKind(str, Enum):
    """Principal classes that can own keys, grants, credentials, or events."""

    USER = "user"
    AGENT = "agent"
    SERVICE = "service"
    DAEMON = "daemon"
    SUBMODULE = "submodule"
    PEER = "peer"
    SYSTEM = "system"


class KeyAlgorithm(str, Enum):
    """Portable key algorithms referenced by DID/key stores."""

    ED25519 = "Ed25519"
    RSA = "RSA"
    SECP256K1 = "secp256k1"
    UNKNOWN = "unknown"


class KeyStorageState(str, Enum):
    """State of a DID key reference without exposing private material."""

    ACTIVE = "active"
    ROTATED = "rotated"
    REVOKED = "revoked"
    DISABLED = "disabled"
    UNKNOWN = "unknown"


class CapabilityGrantSource(str, Enum):
    """Where an authorization grant originated."""

    LOCAL = "local"
    UCAN = "ucan"
    DAEMON_POLICY = "daemon_policy"
    SUBMODULE = "submodule"
    TEST = "test"


class CapabilityDecisionOutcome(str, Enum):
    """Authorization decision outcome values."""

    ALLOW = "allow"
    DENY = "deny"
    ERROR = "error"


class DaemonPermission(str, Enum):
    """Daemon operations guarded by the security boundary."""

    START = "start"
    STOP = "stop"
    RESTART = "restart"
    STATUS = "status"
    LOGS = "logs"
    CONFIGURE = "configure"
    HEALTH = "health"
    ADMIN = "admin"


class CredentialKind(str, Enum):
    """Credential shapes that may be brokered to submodule adapters."""

    API_KEY = "api_key"
    BEARER_TOKEN = "bearer_token"
    BASIC_AUTH = "basic_auth"
    OAUTH_TOKEN = "oauth_token"
    SSH_KEY = "ssh_key"
    TLS_CERT = "tls_cert"
    DID_KEY = "did_key"
    SERVICE_ACCOUNT = "service_account"
    CONFIG_FILE = "config_file"
    UNKNOWN = "unknown"


class CredentialScope(str, Enum):
    """Intended visibility for a submodule credential."""

    PROCESS = "process"
    DAEMON = "daemon"
    SUBMODULE = "submodule"
    SERVICE = "service"
    USER = "user"
    SYSTEM = "system"


class AuditOutcome(str, Enum):
    """Audit outcome labels used in security event payloads."""

    ALLOW = "allow"
    DENY = "deny"
    REVOKE = "revoke"
    ISSUE = "issue"
    ERROR = "error"
    INFO = "info"


@dataclass(frozen=True)
class DIDKeyRef:
    """Reference to key material backing a DID identity.

    Private key bytes never appear in this contract. Adapters store private
    material in a native keystore and expose only references.
    """

    did: str
    key_id: str
    algorithm: KeyAlgorithm | str = KeyAlgorithm.ED25519
    public_key_ref: str | None = None
    private_key_ref: str | None = None
    storage_uri: str | None = None
    state: KeyStorageState | str = KeyStorageState.ACTIVE
    created_at: datetime = field(default_factory=utc_now)
    rotated_at: datetime | None = None
    expires_at: datetime | None = None
    metadata: Metadata = field(default_factory=dict)

    def is_active(self, at: datetime | None = None) -> bool:
        """Return whether this key can be used at ``at``."""
        state = _enum_value(self.state)
        if state != KeyStorageState.ACTIVE.value:
            return False
        if self.expires_at is None:
            return True
        return self.expires_at > (at or utc_now())

    def resource(self) -> ResourceRef:
        """Return this key as a secret capability resource."""
        return ResourceRef(
            uri=f"did-key://{self.did}/{self.key_id}",
            kind=ResourceKind.SECRET,
            component="virtual_os.security",
            name=self.key_id,
            metadata={
                "did": self.did,
                "algorithm": _enum_value(self.algorithm),
                "state": _enum_value(self.state),
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class IdentityRecord:
    """Registered principal plus key storage references."""

    identity: IdentityRef
    kind: IdentityKind | str = IdentityKind.USER
    keys: tuple[DIDKeyRef, ...] = ()
    trust_domain: str = "local"
    storage_uri: str | None = None
    created_at: datetime = field(default_factory=utc_now)
    disabled_at: datetime | None = None
    metadata: Metadata = field(default_factory=dict)

    def is_active(self) -> bool:
        """Return whether this identity is enabled."""
        return self.disabled_at is None

    def active_keys(self, at: datetime | None = None) -> tuple[DIDKeyRef, ...]:
        """Return active key references for this identity."""
        return tuple(key for key in self.keys if key.is_active(at))


@dataclass(frozen=True)
class UCANCapability:
    """UCAN attenuation entry normalized to resource, action, and caveats."""

    resource: str
    action: str
    caveats: Metadata = field(default_factory=dict)

    def to_resource_ref(self) -> ResourceRef:
        """Return this UCAN resource as a Virtual AI OS resource."""
        return ResourceRef(uri=self.resource, kind=_infer_resource_kind(self.resource))


@dataclass(frozen=True)
class UCANProof:
    """Decoded UCAN proof metadata used for execution-time authorization.

    The raw token is intentionally optional. Adapters should prefer stable token
    references or CIDs in audit paths.
    """

    proof_id: str
    issuer: IdentityRef
    audience: IdentityRef
    capabilities: tuple[UCANCapability, ...]
    token_ref: str | None = None
    token_cid: str | None = None
    proof_cid: str | None = None
    issued_at: datetime | None = None
    not_before: datetime | None = None
    expires_at: datetime | None = None
    facts: Metadata = field(default_factory=dict)
    proofs: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    def is_time_valid(self, at: datetime | None = None) -> bool:
        """Return whether this proof is within its validity window."""
        checked_at = at or utc_now()
        if self.not_before is not None and self.not_before > checked_at:
            return False
        if self.expires_at is not None and self.expires_at <= checked_at:
            return False
        return True

    def to_grants(self) -> tuple[CapabilityGrant, ...]:
        """Project UCAN attenuations into ADR-001 capability grants."""
        grants: list[CapabilityGrant] = []
        for index, capability in enumerate(self.capabilities):
            grant_id = stable_security_id(
                "ucan-grant",
                self.proof_id,
                capability.resource,
                capability.action,
                str(index),
            )
            grants.append(
                CapabilityGrant(
                    grant_id=grant_id,
                    action=capability.action,
                    resource=capability.to_resource_ref(),
                    issuer=self.issuer,
                    audience=self.audience,
                    token_ref=self.token_ref or self.token_cid or self.proof_cid,
                    expires_at=self.expires_at,
                    constraints=dict(capability.caveats),
                    delegated_from=self.proofs,
                    metadata={
                        "source": CapabilityGrantSource.UCAN.value,
                        "proof_id": self.proof_id,
                        "proof_cid": self.proof_cid,
                        "token_cid": self.token_cid,
                        **dict(self.metadata),
                    },
                )
            )
        return tuple(grants)


@dataclass(frozen=True)
class RevocationRecord:
    """Revocation entry for a local grant, UCAN token, or proof bundle."""

    grant_id: str | None = None
    issuer_did: str | None = None
    audience_did: str | None = None
    proof_cid: str | None = None
    token_ref: str | None = None
    revoked_by: IdentityRef | None = None
    reason: str = ""
    revoked_at: datetime = field(default_factory=utc_now)
    metadata: Metadata = field(default_factory=dict)

    def matches_grant(self, grant: CapabilityGrant) -> bool:
        """Return whether this revocation invalidates ``grant``."""
        if self.grant_id and self.grant_id == grant.grant_id:
            return True
        if self.token_ref and self.token_ref == grant.token_ref:
            return True
        grant_proof = grant.metadata.get("proof_cid")
        if self.proof_cid and grant_proof and self.proof_cid == grant_proof:
            return True
        if self.issuer_did and self.issuer_did != grant.issuer.did:
            return False
        if self.audience_did and self.audience_did != grant.audience.did:
            return False
        return bool(self.issuer_did or self.audience_did)


@dataclass(frozen=True)
class CapabilityCheck:
    """Request to authorize an actor for one action on one resource."""

    actor: IdentityRef
    action: CapabilityAction | str
    resource: ResourceRef
    capabilities: tuple[CapabilityGrant, ...] = ()
    operation: str = ""
    proofs: tuple[UCANProof, ...] = ()
    service_id: str | None = None
    trace_id: str | None = None
    context: Metadata = field(default_factory=dict)

    def all_grants(self) -> tuple[CapabilityGrant, ...]:
        """Return local grants plus grants projected from UCAN proofs."""
        proof_grants: list[CapabilityGrant] = []
        for proof in self.proofs:
            proof_grants.extend(proof.to_grants())
        return (*self.capabilities, *proof_grants)


@dataclass(frozen=True)
class CapabilityDecision:
    """Authorization decision with enough context for audit and receipts."""

    request: CapabilityCheck
    outcome: CapabilityDecisionOutcome | str
    reason: str = ""
    matched_grant: CapabilityGrant | None = None
    checked_at: datetime = field(default_factory=utc_now)
    obligations: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    @property
    def allowed(self) -> bool:
        """Return ``True`` when the request is authorized."""
        return _enum_value(self.outcome) == CapabilityDecisionOutcome.ALLOW.value

    def audit_event(self, *, source: str = "virtual-os.security") -> EventEnvelope:
        """Build a redacted security audit event for this decision."""
        return security_audit_event(
            event_type=f"security.capability.{_enum_value(self.outcome)}",
            actor=self.request.actor,
            subject=self.request.resource,
            action=self.request.action,
            outcome=AuditOutcome.ALLOW if self.allowed else AuditOutcome.DENY,
            reason=self.reason,
            source=source,
            occurred_at=self.checked_at,
            trace_id=self.request.trace_id,
            payload={
                "operation": self.request.operation,
                "service_id": self.request.service_id,
                "matched_grant_id": self.matched_grant.grant_id if self.matched_grant else None,
                "obligations": self.obligations,
                **dict(self.metadata),
            },
        )


@dataclass(frozen=True)
class DaemonPermissionRequest:
    """Capability-scoped request to control or inspect a daemon."""

    daemon_id: str
    permission: DaemonPermission | str
    actor: IdentityRef
    capabilities: tuple[CapabilityGrant, ...] = ()
    proofs: tuple[UCANProof, ...] = ()
    operation: str = ""
    trace_id: str | None = None
    context: Metadata = field(default_factory=dict)

    def resource(self) -> ResourceRef:
        """Return the daemon as a capability resource."""
        return daemon_resource(self.daemon_id)

    def capability_action(self) -> CapabilityAction | str:
        """Map daemon permission vocabulary onto kernel capability verbs."""
        permission = _enum_value(self.permission)
        if permission in {DaemonPermission.STATUS.value, DaemonPermission.HEALTH.value, DaemonPermission.LOGS.value}:
            return CapabilityAction.READ
        if permission in {DaemonPermission.START.value, DaemonPermission.STOP.value, DaemonPermission.RESTART.value}:
            return CapabilityAction.EXECUTE
        if permission == DaemonPermission.CONFIGURE.value:
            return CapabilityAction.WRITE
        if permission == DaemonPermission.ADMIN.value:
            return CapabilityAction.ADMIN
        return permission

    def to_capability_check(self) -> CapabilityCheck:
        """Return this daemon request as a generic capability check."""
        return CapabilityCheck(
            actor=self.actor,
            action=self.capability_action(),
            resource=self.resource(),
            capabilities=self.capabilities,
            operation=self.operation or f"daemon.{_enum_value(self.permission)}",
            proofs=self.proofs,
            service_id=self.daemon_id,
            trace_id=self.trace_id,
            context={
                "daemon_id": self.daemon_id,
                "daemon_permission": _enum_value(self.permission),
                **dict(self.context),
            },
        )


@dataclass(frozen=True)
class DaemonPermissionDecision:
    """Daemon-specific authorization decision."""

    request: DaemonPermissionRequest
    capability_decision: CapabilityDecision

    @property
    def allowed(self) -> bool:
        """Return ``True`` when daemon operation is authorized."""
        return self.capability_decision.allowed


@dataclass(frozen=True)
class SubmoduleCredentialRef:
    """Reference to a credential used by one or more component submodules."""

    credential_id: str
    component: str
    kind: CredentialKind | str
    scope: CredentialScope | str
    secret_ref: str
    owner: IdentityRef | None = None
    allowed_services: tuple[str, ...] = ()
    created_at: datetime = field(default_factory=utc_now)
    expires_at: datetime | None = None
    labels: Mapping[str, str] = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)

    def is_expired(self, at: datetime | None = None) -> bool:
        """Return whether this credential reference is expired."""
        if self.expires_at is None:
            return False
        return self.expires_at <= (at or utc_now())

    def resource(self) -> ResourceRef:
        """Return this credential as a secret capability resource."""
        return credential_resource(self.component, self.credential_id)

    def redacted(self) -> "SubmoduleCredentialRef":
        """Return a copy safe for audit payloads."""
        return SubmoduleCredentialRef(
            credential_id=self.credential_id,
            component=self.component,
            kind=self.kind,
            scope=self.scope,
            secret_ref=redact_secret_ref(self.secret_ref),
            owner=self.owner,
            allowed_services=self.allowed_services,
            created_at=self.created_at,
            expires_at=self.expires_at,
            labels=self.labels,
            metadata=redact_sensitive_payload(self.metadata).payload,
        )


@dataclass(frozen=True)
class CredentialAccessRequest:
    """Request to resolve or lease a submodule credential."""

    credential: SubmoduleCredentialRef
    actor: IdentityRef
    action: CapabilityAction | str = CapabilityAction.READ
    service_id: str | None = None
    purpose: str = ""
    capabilities: tuple[CapabilityGrant, ...] = ()
    proofs: tuple[UCANProof, ...] = ()
    trace_id: str | None = None
    context: Metadata = field(default_factory=dict)

    def to_capability_check(self) -> CapabilityCheck:
        """Return this credential request as a generic capability check."""
        return CapabilityCheck(
            actor=self.actor,
            action=self.action,
            resource=self.credential.resource(),
            capabilities=self.capabilities,
            operation="credential.access",
            proofs=self.proofs,
            service_id=self.service_id,
            trace_id=self.trace_id,
            context={
                "component": self.credential.component,
                "credential_id": self.credential.credential_id,
                "credential_kind": _enum_value(self.credential.kind),
                "purpose": self.purpose,
                **dict(self.context),
            },
        )


@dataclass(frozen=True)
class CredentialLease:
    """Ephemeral credential lease returned by a credential broker."""

    lease_id: str
    credential: SubmoduleCredentialRef
    audience: IdentityRef
    issued_at: datetime = field(default_factory=utc_now)
    expires_at: datetime | None = None
    secret_ref: str | None = None
    metadata: Metadata = field(default_factory=dict)

    def is_expired(self, at: datetime | None = None) -> bool:
        """Return whether this lease is expired."""
        if self.expires_at is None:
            return False
        return self.expires_at <= (at or utc_now())

    def redacted(self) -> "CredentialLease":
        """Return a copy safe for logs and audit events."""
        return CredentialLease(
            lease_id=self.lease_id,
            credential=self.credential.redacted(),
            audience=self.audience,
            issued_at=self.issued_at,
            expires_at=self.expires_at,
            secret_ref=redact_secret_ref(self.secret_ref) if self.secret_ref else None,
            metadata=redact_sensitive_payload(self.metadata).payload,
        )


@dataclass(frozen=True)
class RedactionResult:
    """Redacted payload plus dotted field paths that were changed."""

    payload: Any
    redacted_fields: tuple[str, ...] = ()


@dataclass(frozen=True)
class SecurityAuditContext:
    """Context for a security audit event before conversion to EventEnvelope."""

    event_type: str
    outcome: AuditOutcome | str
    actor: IdentityRef | None = None
    subject: ResourceRef | None = None
    action: CapabilityAction | str | None = None
    reason: str = ""
    payload: Metadata = field(default_factory=dict)
    source: str = "virtual-os.security"
    occurred_at: datetime = field(default_factory=utc_now)
    severity: EventSeverity | str = EventSeverity.INFO
    trace_id: str | None = None
    correlation_id: str | None = None
    parent_event_ids: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)


@runtime_checkable
class DIDKeyStore(Protocol):
    """DID and key storage boundary implemented by native keystores."""

    def register_identity(self, record: IdentityRecord) -> MaybeAwaitable[IdentityRecord]:
        """Store or update an identity record."""

    def resolve_identity(self, did: str) -> MaybeAwaitable[IdentityRecord | None]:
        """Resolve one identity record by DID."""

    def list_identities(self, kind: IdentityKind | str | None = None) -> MaybeAwaitable[Sequence[IdentityRecord]]:
        """List identities, optionally filtered by kind."""

    def disable_identity(
        self,
        did: str,
        *,
        actor: IdentityRef,
        reason: str = "",
    ) -> MaybeAwaitable[EventEnvelope]:
        """Disable an identity and emit an audit event."""


@runtime_checkable
class UCANVerifier(Protocol):
    """UCAN verifier boundary for SwissKnife or MCP++ implementations."""

    def validate_proof(
        self,
        proof: UCANProof,
        *,
        action: CapabilityAction | str,
        resource: ResourceRef,
        actor: IdentityRef,
    ) -> MaybeAwaitable[CapabilityDecision]:
        """Validate proof signatures, caveats, attenuation, expiry, and revocation."""

    def is_revoked(self, proof: UCANProof) -> MaybeAwaitable[bool]:
        """Return whether a proof or token CID has been revoked."""


@runtime_checkable
class RevocationRegistry(Protocol):
    """Revocation lookup boundary for local grants and UCAN proofs."""

    def record_revocation(self, revocation: RevocationRecord) -> MaybeAwaitable[EventEnvelope]:
        """Record a revocation and emit an audit event."""

    def find_revocation(self, grant: CapabilityGrant) -> MaybeAwaitable[RevocationRecord | None]:
        """Return a matching revocation for a grant when present."""

    def list_revocations(self) -> MaybeAwaitable[Sequence[RevocationRecord]]:
        """List revocation records."""


@runtime_checkable
class LocalGrantStore(Protocol):
    """Storage boundary for locally issued capability grants."""

    def add_grant(self, grant: CapabilityGrant) -> MaybeAwaitable[CapabilityGrant]:
        """Persist a local grant."""

    def get_grant(self, grant_id: str) -> MaybeAwaitable[CapabilityGrant | None]:
        """Resolve a grant by id."""

    def list_grants(
        self,
        *,
        audience: IdentityRef | None = None,
        resource: ResourceRef | None = None,
    ) -> MaybeAwaitable[Sequence[CapabilityGrant]]:
        """List grants, optionally filtered by audience or resource."""


@runtime_checkable
class DaemonPermissionAuthorizer(Protocol):
    """Authorization boundary for daemon manager controls."""

    def authorize_daemon(self, request: DaemonPermissionRequest) -> MaybeAwaitable[DaemonPermissionDecision]:
        """Return whether a daemon operation is allowed."""


@runtime_checkable
class CredentialBroker(Protocol):
    """Credential lookup and lease boundary for component submodules."""

    def resolve_credential(self, request: CredentialAccessRequest) -> MaybeAwaitable[SubmoduleCredentialRef | None]:
        """Resolve credential metadata when the caller is authorized."""

    def lease_credential(self, request: CredentialAccessRequest) -> MaybeAwaitable[CredentialLease]:
        """Issue a short-lived credential lease without logging secret material."""

    def revoke_credential_lease(
        self,
        lease_id: str,
        *,
        actor: IdentityRef,
        reason: str = "",
    ) -> MaybeAwaitable[EventEnvelope]:
        """Revoke one credential lease and emit an audit event."""


@runtime_checkable
class SecurityAuditEmitter(Protocol):
    """Security audit publication boundary."""

    def emit_security_audit(self, context: SecurityAuditContext) -> MaybeAwaitable[EventEnvelope]:
        """Emit a redacted audit event."""


@runtime_checkable
class SecurityAuthority(
    CapabilityAuthority,
    LocalGrantStore,
    RevocationRegistry,
    DaemonPermissionAuthorizer,
    Protocol,
):
    """Complete local security authority surface for offline contract tests."""


class InMemoryRevocationRegistry:
    """Small offline revocation registry for contract tests and local adapters."""

    def __init__(self) -> None:
        self._revocations: dict[str, RevocationRecord] = {}

    def record_revocation(self, revocation: RevocationRecord) -> EventEnvelope:
        """Record a revocation and return its audit event."""
        key = self._revocation_key(revocation)
        self._revocations[key] = revocation
        return security_audit_event(
            event_type="security.capability.revoked",
            actor=revocation.revoked_by,
            subject=ResourceRef(
                uri=f"capability://{revocation.grant_id or revocation.proof_cid or revocation.token_ref or key}",
                kind="capability_grant",
            ),
            action="revoke",
            outcome=AuditOutcome.REVOKE,
            reason=revocation.reason,
            occurred_at=revocation.revoked_at,
            payload={
                "grant_id": revocation.grant_id,
                "issuer_did": revocation.issuer_did,
                "audience_did": revocation.audience_did,
                "proof_cid": revocation.proof_cid,
                "token_ref": revocation.token_ref,
                **dict(revocation.metadata),
            },
        )

    def find_revocation(self, grant: CapabilityGrant) -> RevocationRecord | None:
        """Return a matching revocation for ``grant`` when present."""
        for revocation in self._revocations.values():
            if revocation.matches_grant(grant):
                return revocation
        return None

    def list_revocations(self) -> Sequence[RevocationRecord]:
        """Return all revocations in insertion order."""
        return tuple(self._revocations.values())

    def revoke_grant(
        self,
        grant: CapabilityGrant,
        *,
        actor: IdentityRef | None = None,
        reason: str = "",
    ) -> EventEnvelope:
        """Convenience helper to revoke a grant by id and token reference."""
        return self.record_revocation(
            RevocationRecord(
                grant_id=grant.grant_id,
                issuer_did=grant.issuer.did,
                audience_did=grant.audience.did,
                proof_cid=grant.metadata.get("proof_cid"),
                token_ref=grant.token_ref,
                revoked_by=actor,
                reason=reason,
            )
        )

    def _revocation_key(self, revocation: RevocationRecord) -> str:
        return (
            revocation.grant_id
            or revocation.proof_cid
            or revocation.token_ref
            or stable_security_id(
                "revocation",
                revocation.issuer_did or "",
                revocation.audience_did or "",
                revocation.revoked_at.isoformat(),
            )
        )


class LocalCapabilityAuthority:
    """Local grant authority with revocation and daemon authorization helpers."""

    def __init__(
        self,
        *,
        issuer: IdentityRef,
        revocations: InMemoryRevocationRegistry | None = None,
    ) -> None:
        self.issuer = issuer
        self.revocations = revocations or InMemoryRevocationRegistry()
        self._grants: dict[str, CapabilityGrant] = {}

    def issue(
        self,
        spec: CapabilitySpec,
        resource: ResourceRef,
        audience: IdentityRef,
        *,
        issuer: IdentityRef,
        constraints: Metadata | None = None,
        expires_at: datetime | None = None,
    ) -> CapabilityGrant:
        """Issue and store a local capability grant."""
        grant_id = stable_security_id(
            "local-grant",
            issuer.did,
            audience.did,
            spec.capability_id,
            _enum_value(spec.action),
            resource.uri,
            secrets.token_hex(8),
        )
        grant = CapabilityGrant(
            grant_id=grant_id,
            action=spec.action,
            resource=resource,
            issuer=issuer,
            audience=audience,
            expires_at=expires_at,
            constraints=dict(constraints or {}),
            metadata={
                "source": CapabilityGrantSource.LOCAL.value,
                "capability_id": spec.capability_id,
            },
        )
        return self.add_grant(grant)

    def add_grant(self, grant: CapabilityGrant) -> CapabilityGrant:
        """Store a local grant."""
        self._grants[grant.grant_id] = grant
        return grant

    def get_grant(self, grant_id: str) -> CapabilityGrant | None:
        """Resolve a grant by id."""
        return self._grants.get(grant_id)

    def list_grants(
        self,
        *,
        audience: IdentityRef | None = None,
        resource: ResourceRef | None = None,
    ) -> Sequence[CapabilityGrant]:
        """List stored grants, optionally filtered by audience or resource."""
        grants = self._grants.values()
        if audience is not None:
            grants = [grant for grant in grants if grant.audience.did == audience.did]
        if resource is not None:
            grants = [grant for grant in grants if resource_matches(grant.resource, resource)]
        return tuple(grants)

    def verify(
        self,
        grant: CapabilityGrant,
        action: CapabilityAction | str,
        resource: ResourceRef,
    ) -> bool:
        """Return whether one grant authorizes an action on a resource."""
        return grant_allows(
            grant,
            action,
            resource,
            at=utc_now(),
            revocations=self.revocations.list_revocations(),
        )

    def authorize(self, request: CapabilityCheck) -> CapabilityDecision:
        """Evaluate a generic capability check."""
        return authorize_capability(
            request.actor,
            request.action,
            request.resource,
            request.all_grants(),
            operation=request.operation,
            at=utc_now(),
            revocations=self.revocations.list_revocations(),
            service_id=request.service_id,
            trace_id=request.trace_id,
            context=request.context,
        )

    def authorize_daemon(self, request: DaemonPermissionRequest) -> DaemonPermissionDecision:
        """Authorize a daemon operation using local and UCAN grants."""
        return DaemonPermissionDecision(request, self.authorize(request.to_capability_check()))

    def revoke(self, grant_id: str, *, issuer: IdentityRef, reason: str = "") -> EventEnvelope:
        """Revoke a grant and emit an audit event."""
        grant = self._grants.get(grant_id)
        if grant is None:
            revocation = RevocationRecord(grant_id=grant_id, revoked_by=issuer, reason=reason)
            return self.revocations.record_revocation(revocation)
        return self.revocations.revoke_grant(grant, actor=issuer, reason=reason)


InMemoryCapabilityAuthority = LocalCapabilityAuthority


def stable_security_id(prefix: str, *parts: str) -> str:
    """Return a stable, compact identifier for security records."""
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:24]
    return f"{prefix}:{digest}"


def service_resource(service_id: str) -> ResourceRef:
    """Return the canonical resource URI for a service."""
    return ResourceRef(uri=f"virtual-os://services/{service_id}", kind=ResourceKind.SERVICE, name=service_id)


def daemon_resource(daemon_id: str) -> ResourceRef:
    """Return the canonical resource URI for a daemon."""
    return ResourceRef(uri=f"virtual-os://daemons/{daemon_id}", kind=ResourceKind.DAEMON, name=daemon_id)


def event_stream_resource(stream: str) -> ResourceRef:
    """Return the canonical resource URI for an event stream."""
    return ResourceRef(uri=f"virtual-os://events/{stream}", kind=ResourceKind.EVENT_STREAM, name=stream)


def credential_resource(component: str, credential_id: str) -> ResourceRef:
    """Return the canonical resource URI for a submodule credential."""
    return ResourceRef(
        uri=f"credential://{component}/{credential_id}",
        kind=ResourceKind.SECRET,
        component=component,
        name=credential_id,
    )


def ucan_capability_to_grant(
    proof: UCANProof,
    capability: UCANCapability,
    *,
    grant_id: str | None = None,
) -> CapabilityGrant:
    """Convert one UCAN attenuation into a kernel capability grant."""
    return CapabilityGrant(
        grant_id=grant_id
        or stable_security_id("ucan-grant", proof.proof_id, capability.resource, capability.action),
        action=capability.action,
        resource=capability.to_resource_ref(),
        issuer=proof.issuer,
        audience=proof.audience,
        token_ref=proof.token_ref or proof.token_cid or proof.proof_cid,
        expires_at=proof.expires_at,
        constraints=dict(capability.caveats),
        delegated_from=proof.proofs,
        metadata={
            "source": CapabilityGrantSource.UCAN.value,
            "proof_id": proof.proof_id,
            "proof_cid": proof.proof_cid,
            "token_cid": proof.token_cid,
        },
    )


def action_matches(granted: CapabilityAction | str, requested: CapabilityAction | str) -> bool:
    """Return whether a granted action covers a requested action."""
    granted_value = _enum_value(granted)
    requested_value = _enum_value(requested)
    return granted_value in {requested_value, CapabilityAction.ADMIN.value, "*"}


def resource_matches(granted: ResourceRef, requested: ResourceRef) -> bool:
    """Return whether a granted resource covers a requested resource."""
    granted_uri = granted.uri
    requested_uri = requested.uri
    if granted.is_wildcard() or granted_uri == "*":
        return True
    if granted_uri == requested_uri:
        return True
    if granted_uri.endswith("/*") and requested_uri.startswith(granted_uri[:-1]):
        return True
    if "*" in granted_uri:
        return fnmatch.fnmatchcase(requested_uri, granted_uri)
    return False


def grant_allows(
    grant: CapabilityGrant,
    action: CapabilityAction | str,
    resource: ResourceRef,
    *,
    actor: IdentityRef | None = None,
    at: datetime | None = None,
    context: Metadata | None = None,
    revocations: Sequence[RevocationRecord] = (),
) -> bool:
    """Return whether ``grant`` authorizes ``actor`` for action/resource."""
    checked_at = at or utc_now()
    if grant.is_expired(checked_at):
        return False
    if actor is not None and grant.audience.did != actor.did:
        return False
    if any(revocation.matches_grant(grant) for revocation in revocations):
        return False
    if not action_matches(grant.action, action):
        return False
    if not resource_matches(grant.resource, resource):
        return False
    return constraints_satisfied(grant.constraints, context or {}, at=checked_at)


def constraints_satisfied(
    constraints: Mapping[str, Any],
    context: Mapping[str, Any],
    *,
    at: datetime | None = None,
) -> bool:
    """Evaluate simple local caveats used by offline contract tests.

    Rich policy engines can replace this at the adapter layer. The local helper
    supports common exact-match caveats, time windows, and membership lists.
    """
    if not constraints:
        return True

    checked_at = at or utc_now()
    not_before = _parse_datetime(constraints.get("not_before"))
    if not_before is not None and not_before > checked_at:
        return False
    expires_at = _parse_datetime(constraints.get("expires_at"))
    if expires_at is not None and expires_at <= checked_at:
        return False

    for key in ("service_id", "daemon_id", "component", "method", "operation"):
        expected = constraints.get(key)
        if expected is None:
            continue
        actual = context.get(key)
        if isinstance(expected, Sequence) and not isinstance(expected, (str, bytes, bytearray)):
            if actual not in expected:
                return False
        elif actual != expected:
            return False

    required_context = constraints.get("required_context")
    if isinstance(required_context, Mapping):
        for key, expected in required_context.items():
            if context.get(key) != expected:
                return False

    return True


def find_authorizing_grant(
    grants: Sequence[CapabilityGrant],
    action: CapabilityAction | str,
    resource: ResourceRef,
    *,
    actor: IdentityRef | None = None,
    at: datetime | None = None,
    context: Metadata | None = None,
    revocations: Sequence[RevocationRecord] = (),
) -> CapabilityGrant | None:
    """Return the first grant that authorizes the requested operation."""
    for grant in grants:
        if grant_allows(
            grant,
            action,
            resource,
            actor=actor,
            at=at,
            context=context,
            revocations=revocations,
        ):
            return grant
    return None


def authorize_capability(
    actor: IdentityRef,
    action: CapabilityAction | str,
    resource: ResourceRef,
    capabilities: Sequence[CapabilityGrant],
    *,
    operation: str = "",
    at: datetime | None = None,
    context: Metadata | None = None,
    revocations: Sequence[RevocationRecord] = (),
    service_id: str | None = None,
    trace_id: str | None = None,
) -> CapabilityDecision:
    """Evaluate local capability grants and return an auditable decision."""
    request = CapabilityCheck(
        actor=actor,
        action=action,
        resource=resource,
        capabilities=tuple(capabilities),
        operation=operation,
        service_id=service_id,
        trace_id=trace_id,
        context=dict(context or {}),
    )
    matched = find_authorizing_grant(
        request.capabilities,
        action,
        resource,
        actor=actor,
        at=at,
        context=request.context,
        revocations=revocations,
    )
    if matched is not None:
        return CapabilityDecision(
            request=request,
            outcome=CapabilityDecisionOutcome.ALLOW,
            reason="authorized by capability grant",
            matched_grant=matched,
            checked_at=at or utc_now(),
        )

    return CapabilityDecision(
        request=request,
        outcome=CapabilityDecisionOutcome.DENY,
        reason="missing, expired, revoked, or constrained capability grant",
        checked_at=at or utc_now(),
    )


def require_capability(
    actor: IdentityRef,
    action: CapabilityAction | str,
    resource: ResourceRef,
    capabilities: Sequence[CapabilityGrant],
    *,
    operation: str = "",
    context: Metadata | None = None,
    revocations: Sequence[RevocationRecord] = (),
    service_id: str | None = None,
    trace_id: str | None = None,
) -> CapabilityDecision:
    """Return an allow decision or raise ``CapabilityDenied``."""
    decision = authorize_capability(
        actor,
        action,
        resource,
        capabilities,
        operation=operation,
        context=context,
        revocations=revocations,
        service_id=service_id,
        trace_id=trace_id,
    )
    if not decision.allowed:
        raise CapabilityDenied(redact_error(decision.reason))
    return decision


def authorize_daemon_permission(
    request: DaemonPermissionRequest,
    *,
    revocations: Sequence[RevocationRecord] = (),
) -> DaemonPermissionDecision:
    """Authorize a daemon permission request with local grant semantics."""
    check = request.to_capability_check()
    decision = authorize_capability(
        check.actor,
        check.action,
        check.resource,
        check.all_grants(),
        operation=check.operation,
        context=check.context,
        revocations=revocations,
        service_id=check.service_id,
        trace_id=check.trace_id,
    )
    return DaemonPermissionDecision(request, decision)


def authorize_credential_access(
    request: CredentialAccessRequest,
    *,
    revocations: Sequence[RevocationRecord] = (),
) -> CapabilityDecision:
    """Authorize access to submodule credential metadata or a lease."""
    if request.credential.is_expired():
        return CapabilityDecision(
            request=request.to_capability_check(),
            outcome=CapabilityDecisionOutcome.DENY,
            reason="credential is expired",
        )
    if request.service_id and request.credential.allowed_services:
        if request.service_id not in request.credential.allowed_services:
            return CapabilityDecision(
                request=request.to_capability_check(),
                outcome=CapabilityDecisionOutcome.DENY,
                reason="credential is not allowed for requested service",
            )
    check = request.to_capability_check()
    return authorize_capability(
        check.actor,
        check.action,
        check.resource,
        check.all_grants(),
        operation=check.operation,
        context=check.context,
        revocations=revocations,
        service_id=check.service_id,
        trace_id=check.trace_id,
    )


def security_audit_event(
    *,
    event_type: str,
    outcome: AuditOutcome | str,
    actor: IdentityRef | None = None,
    subject: ResourceRef | None = None,
    action: CapabilityAction | str | None = None,
    reason: str = "",
    payload: Metadata | None = None,
    source: str = "virtual-os.security",
    occurred_at: datetime | None = None,
    severity: EventSeverity | str = EventSeverity.INFO,
    trace_id: str | None = None,
    correlation_id: str | None = None,
    parent_event_ids: Sequence[str] = (),
    metadata: Metadata | None = None,
) -> EventEnvelope:
    """Build a redacted security audit event envelope."""
    timestamp = occurred_at or utc_now()
    redacted = redact_sensitive_payload(
        {
            "outcome": _enum_value(outcome),
            "action": _enum_value(action) if action is not None else None,
            "reason": redact_error(reason),
            **dict(payload or {}),
        }
    )
    event_id = stable_security_id(
        "security-event",
        event_type,
        actor.did if actor else "",
        subject.uri if subject else "",
        timestamp.isoformat(),
    )
    return EventEnvelope(
        event_id=event_id,
        event_type=event_type,
        source=source,
        occurred_at=timestamp,
        severity=severity,
        actor=actor,
        subject=subject,
        trace_id=trace_id,
        correlation_id=correlation_id,
        parent_event_ids=tuple(parent_event_ids),
        payload=redacted.payload,
        redacted_fields=redacted.redacted_fields,
        metadata=dict(metadata or {}),
    )


def emit_denied_event(
    decision: CapabilityDecision,
    *,
    source: str = "virtual-os.security",
) -> EventEnvelope:
    """Build a standard denied-operation audit event."""
    return security_audit_event(
        event_type="security.operation.denied",
        actor=decision.request.actor,
        subject=decision.request.resource,
        action=decision.request.action,
        outcome=AuditOutcome.DENY,
        reason=decision.reason,
        source=source,
        trace_id=decision.request.trace_id,
        payload={
            "operation": decision.request.operation,
            "service_id": decision.request.service_id,
            **dict(decision.metadata),
        },
    )


def redact_sensitive_payload(payload: Any) -> RedactionResult:
    """Recursively redact secrets and return changed field paths."""
    redacted_fields: list[str] = []
    redacted_payload = _redact_value(payload, (), redacted_fields)
    return RedactionResult(redacted_payload, tuple(redacted_fields))


def redact_error(message: str) -> str:
    """Redact common credential fragments in error text."""
    redacted = str(message)
    redacted = _PRIVATE_KEY_RE.sub("[REDACTED_PRIVATE_KEY]", redacted)
    for pattern in _SECRET_VALUE_PATTERNS:
        redacted = pattern.sub(lambda match: f"{match.group(1)}[REDACTED]", redacted)
    redacted = _JWT_LIKE_RE.sub("[REDACTED_TOKEN]", redacted)
    return redacted


def redact_secret_ref(secret_ref: str) -> str:
    """Return a non-reversible display form for a secret reference."""
    if not secret_ref:
        return secret_ref
    digest = hashlib.sha256(secret_ref.encode("utf-8")).hexdigest()[:12]
    return f"redacted:{digest}"


def _redact_value(value: Any, path: tuple[str, ...], redacted_fields: list[str]) -> Any:
    if isinstance(value, Mapping):
        output: dict[Any, Any] = {}
        for key, child in value.items():
            key_text = str(key)
            child_path = (*path, key_text)
            if _is_sensitive_key(key_text):
                output[key] = "[REDACTED]"
                redacted_fields.append(".".join(child_path))
            else:
                output[key] = _redact_value(child, child_path, redacted_fields)
        return output
    if isinstance(value, tuple):
        return tuple(_redact_value(item, (*path, str(index)), redacted_fields) for index, item in enumerate(value))
    if isinstance(value, list):
        return [_redact_value(item, (*path, str(index)), redacted_fields) for index, item in enumerate(value)]
    if isinstance(value, str):
        redacted = redact_error(value)
        if redacted != value:
            redacted_fields.append(".".join(path) or "$")
        return redacted
    return value


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    if normalized in _NON_SECRET_REFERENCE_KEYS:
        return False
    if normalized.endswith(_NON_SECRET_REFERENCE_SUFFIXES):
        return False
    if normalized in _SENSITIVE_EXACT_KEYS:
        return True
    if normalized.endswith(_SENSITIVE_SUFFIXES):
        return True
    return any(pattern in normalized for pattern in _SENSITIVE_KEY_SUBSTRINGS)


def _enum_value(value: Any) -> str:
    if isinstance(value, Enum):
        return str(value.value)
    return str(value)


def _infer_resource_kind(uri: str) -> ResourceKind | str:
    if uri.startswith("credential://") or uri.startswith("did-key://"):
        return ResourceKind.SECRET
    if uri.startswith("virtual-os://services/"):
        return ResourceKind.SERVICE
    if uri.startswith("virtual-os://daemons/"):
        return ResourceKind.DAEMON
    if uri.startswith("virtual-os://events/"):
        return ResourceKind.EVENT_STREAM
    if uri.startswith("mcp++/content/") or uri.startswith("ipfs://") or uri.startswith("sha256:"):
        return ResourceKind.STORAGE
    if uri.startswith("dataset://"):
        return ResourceKind.DATASET
    return ResourceKind.ANY


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=utc_now().tzinfo)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=utc_now().tzinfo)
        return parsed
    return None


def canonical_security_json(payload: Mapping[str, Any]) -> str:
    """Return canonical JSON used before hashing security descriptors."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


_NON_SECRET_REFERENCE_KEYS = {
    "audience_did",
    "component",
    "credential_id",
    "daemon_id",
    "event_id",
    "grant_id",
    "issuer_did",
    "key_id",
    "matched_grant_id",
    "proof_cid",
    "public_key_ref",
    "service_id",
    "token_cid",
}
_NON_SECRET_REFERENCE_SUFFIXES = (
    "_cid",
    "_cids",
    "_count",
    "_did",
    "_id",
    "_ids",
    "_kind",
    "_type",
)
_SENSITIVE_EXACT_KEYS = {
    "access_token",
    "api_key",
    "auth",
    "authorization",
    "bearer",
    "bearer_token",
    "client_secret",
    "credential",
    "id_token",
    "jwt",
    "passphrase",
    "password",
    "private",
    "private_key",
    "private_key_pem",
    "proof",
    "proof_bundle",
    "secret",
    "secret_key",
    "secret_ref",
    "signature",
    "ssh_key",
    "token",
    "token_ref",
    "ucan",
    "ucan_proofs",
    "ucan_token",
}
_SENSITIVE_SUFFIXES = (
    "_access_token",
    "_api_key",
    "_auth",
    "_bearer_token",
    "_client_secret",
    "_credential",
    "_id_token",
    "_jwt",
    "_passphrase",
    "_password",
    "_private",
    "_private_key",
    "_proof",
    "_secret",
    "_secret_key",
    "_secret_ref",
    "_signature",
    "_ssh_key",
    "_token",
    "_token_ref",
    "_ucan",
)
_SENSITIVE_KEY_SUBSTRINGS = (
    "private_key",
    "secret_key",
    "access_token",
    "refresh_token",
)

_PRIVATE_KEY_RE = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
    re.DOTALL,
)
_SECRET_VALUE_PATTERNS = (
    re.compile(r"(?i)\b(bearer\s+)([a-z0-9._~+/=-]{12,})"),
    re.compile(r"(?i)\b(api[_-]?key\s*[:=]\s*)([^\s,;]+)"),
    re.compile(r"(?i)\b(token\s*[:=]\s*)([^\s,;]+)"),
    re.compile(r"(?i)\b(password\s*[:=]\s*)([^\s,;]+)"),
    re.compile(r"(?i)\b(secret\s*[:=]\s*)([^\s,;]+)"),
)
_JWT_LIKE_RE = re.compile(r"\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b")


AuthorizationDecision = CapabilityDecision
CapabilityRequest = CapabilityCheck


__all__ = [
    "AuditOutcome",
    "AuthorizationDecision",
    "CapabilityCheck",
    "CapabilityDecision",
    "CapabilityDecisionOutcome",
    "CapabilityGrantSource",
    "CapabilityRequest",
    "CredentialAccessDenied",
    "CredentialAccessRequest",
    "CredentialBroker",
    "CredentialKind",
    "CredentialLease",
    "CredentialScope",
    "DIDKeyRef",
    "DIDKeyStore",
    "DaemonPermission",
    "DaemonPermissionAuthorizer",
    "DaemonPermissionDecision",
    "DaemonPermissionRequest",
    "IdentityKind",
    "IdentityRecord",
    "InMemoryCapabilityAuthority",
    "InMemoryRevocationRegistry",
    "KeyAlgorithm",
    "KeyStorageState",
    "LocalCapabilityAuthority",
    "LocalGrantStore",
    "RedactionResult",
    "RevocationRecord",
    "RevocationRegistry",
    "RevokedCapability",
    "SecurityAuditContext",
    "SecurityAuditEmitter",
    "SecurityAuthority",
    "SecurityContractError",
    "SubmoduleCredentialRef",
    "UCANCapability",
    "UCANProof",
    "UCANVerifier",
    "action_matches",
    "authorize_capability",
    "authorize_credential_access",
    "authorize_daemon_permission",
    "canonical_security_json",
    "credential_resource",
    "daemon_resource",
    "emit_denied_event",
    "event_stream_resource",
    "find_authorizing_grant",
    "grant_allows",
    "redact_error",
    "redact_secret_ref",
    "redact_sensitive_payload",
    "require_capability",
    "resource_matches",
    "security_audit_event",
    "service_resource",
    "stable_security_id",
    "ucan_capability_to_grant",
]
