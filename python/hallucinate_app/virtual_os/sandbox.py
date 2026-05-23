"""Sandbox and resource isolation prototype for the Virtual AI OS.

This module is intentionally stdlib-only and does not execute commands. It
normalizes command, storage, and resource requests into deterministic decisions
that future daemon, scheduler, and adapter layers can enforce before crossing
into host processes or submodule runtimes.
"""

from __future__ import annotations

import fnmatch
import os
import shlex
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from .contracts import (
    CapabilityAction,
    CapabilityDenied,
    CapabilityGrant,
    IdentityRef,
    Metadata,
    ResourceClaim,
    ResourceKind,
    ResourceRef,
    ResourceUnit,
    StorageOperation,
    StorageRef,
    StorageRequest,
)
from .security import (
    CapabilityDecision,
    CapabilityDecisionOutcome,
    action_matches,
    authorize_capability,
    resource_matches,
)


VIRTUAL_OS_SANDBOX_COMPONENT = "virtual_os.sandbox"


class SandboxError(Exception):
    """Base error raised by sandbox policy helpers."""


class SandboxDenied(CapabilityDenied):
    """Raised when a sandbox policy denies a request."""


class CommandDenied(SandboxDenied):
    """Raised when a command is not allowlisted for the sandbox."""


class ResourceLimitDenied(SandboxDenied):
    """Raised when requested resources exceed sandbox limits."""


class StorageScopeDenied(SandboxDenied):
    """Raised when storage access is outside sandbox capability scope."""


class UnsafeOperationDenied(SandboxDenied):
    """Raised when a caller asks for an explicitly unsafe operation."""


class SandboxOperation(str, Enum):
    """Sandbox operations that can be authorized without executing work."""

    COMMAND_EXECUTE = "command.execute"
    RESOURCE_RESERVE = "resource.reserve"
    STORAGE_ACCESS = "storage.access"
    UNSAFE_OPERATION = "unsafe.operation"


DEFAULT_UNSAFE_OPERATIONS: tuple[str, ...] = (
    "host_filesystem_write",
    "host_filesystem_delete",
    "privileged_process",
    "network_egress",
    "shell",
    "secret_exfiltration",
    "credential_export",
)

DEFAULT_COMMAND_DENYLIST: tuple[str, ...] = (
    "bash",
    "chmod",
    "chown",
    "dd",
    "fish",
    "mkfs",
    "mount",
    "rm",
    "sh",
    "su",
    "sudo",
    "umount",
    "zsh",
)


def _enum_value(value: Enum | str) -> str:
    return value.value if isinstance(value, Enum) else str(value)


def _resource_kind_value(value: ResourceKind | str) -> str:
    return value.value if isinstance(value, ResourceKind) else str(value)


def _resource_unit_value(value: ResourceUnit | str) -> str:
    return value.value if isinstance(value, ResourceUnit) else str(value)


def _storage_operation_value(value: StorageOperation | str) -> str:
    return value.value if isinstance(value, StorageOperation) else str(value)


def normalize_command(command: str | Sequence[str]) -> tuple[str, ...]:
    """Return a shell-free argv tuple for a command request."""
    if isinstance(command, str):
        argv = tuple(shlex.split(command))
    else:
        argv = tuple(str(part) for part in command)
    if not argv or not argv[0].strip():
        raise ValueError("command argv cannot be empty")
    return argv


def command_name(command: str | Sequence[str]) -> str:
    """Return the executable basename for a command request."""
    argv = normalize_command(command)
    return os.path.basename(argv[0])


def command_resource(command: str | Sequence[str]) -> ResourceRef:
    """Return a command executable as a sandbox resource."""
    argv = normalize_command(command)
    name = os.path.basename(argv[0])
    return ResourceRef(
        uri=f"virtual-os://commands/{name}",
        kind=ResourceKind.PROCESS,
        component=VIRTUAL_OS_SANDBOX_COMPONENT,
        name=name,
        metadata={"argv": argv},
    )


def storage_operation_action(operation: StorageOperation | str) -> CapabilityAction:
    """Map a storage operation to the capability action it requires."""
    value = _storage_operation_value(operation)
    if value in {StorageOperation.READ.value, StorageOperation.STAT.value}:
        return CapabilityAction.READ
    if value == StorageOperation.LIST.value:
        return CapabilityAction.LIST
    if value in {StorageOperation.ADD.value, StorageOperation.PIN.value}:
        return CapabilityAction.WRITE
    if value in {StorageOperation.DELETE.value, StorageOperation.UNPIN.value}:
        return CapabilityAction.DELETE
    return CapabilityAction.ADMIN


def storage_ref_resource(ref: StorageRef) -> ResourceRef:
    """Return a storage reference as a capability resource."""
    uri = ref.uri
    if not uri:
        if ref.cid:
            uri = f"ipfs://{ref.cid}"
        elif ref.path:
            path = ref.path if ref.path.startswith("/") else f"/{ref.path}"
            uri = f"vfs://{path}"
        else:
            raise ValueError("storage ref requires uri, cid, or path")

    return ResourceRef(
        uri=uri,
        kind=ResourceKind.STORAGE,
        component=VIRTUAL_OS_SANDBOX_COMPONENT,
        name=ref.path or ref.cid or uri.rsplit("/", 1)[-1],
        metadata={
            "cid": ref.cid,
            "path": ref.path,
            "size_bytes": ref.size_bytes,
            "media_type": ref.media_type,
            **dict(ref.metadata),
        },
    )


def _claim_dict(claim: ResourceClaim) -> dict[str, Any]:
    return {
        "resource": {
            "uri": claim.resource.uri,
            "kind": _resource_kind_value(claim.resource.kind),
            "component": claim.resource.component,
            "name": claim.resource.name,
            "labels": dict(claim.resource.labels),
            "metadata": dict(claim.resource.metadata),
        },
        "amount": claim.amount,
        "unit": _resource_unit_value(claim.unit),
        "hard_limit": claim.hard_limit,
        "metadata": dict(claim.metadata),
    }


def resource_limits_metadata(limits: Sequence[ResourceClaim]) -> dict[str, Any]:
    """Return JSON-friendly metadata for configured sandbox resource limits."""
    hard_limits = tuple(limit for limit in limits if limit.hard_limit)
    soft_limits = tuple(limit for limit in limits if not limit.hard_limit)
    return {
        "enforced": True,
        "limits": [_claim_dict(limit) for limit in limits],
        "hard_limit_count": len(hard_limits),
        "soft_limit_count": len(soft_limits),
    }


@dataclass(frozen=True)
class SandboxCommand:
    """Command execution request validated by the sandbox prototype."""

    argv: str | Sequence[str]
    actor: IdentityRef | None = None
    resource_claims: tuple[ResourceClaim, ...] = ()
    cwd: str | None = None
    env: Mapping[str, str] = field(default_factory=dict)
    shell: bool = False
    unsafe_operations: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "argv", normalize_command(self.argv))
        object.__setattr__(self, "resource_claims", tuple(self.resource_claims))
        object.__setattr__(self, "unsafe_operations", tuple(str(op) for op in self.unsafe_operations))

    @property
    def executable(self) -> str:
        """Return the executable basename."""
        return os.path.basename(self.argv[0])

    def resource(self) -> ResourceRef:
        """Return this command as a sandbox resource."""
        return command_resource(self.argv)


@dataclass(frozen=True)
class StorageCapabilityScope:
    """Maximum storage resource scope available inside a sandbox policy."""

    scope_id: str
    action: CapabilityAction | str
    resource: ResourceRef
    operations: tuple[StorageOperation | str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    def matches(self, action: CapabilityAction | str, resource: ResourceRef, operation: StorageOperation | str) -> bool:
        """Return whether this scope covers the storage action and resource."""
        if self.operations:
            operation_value = _storage_operation_value(operation)
            allowed_operations = {_storage_operation_value(candidate) for candidate in self.operations}
            if operation_value not in allowed_operations:
                return False
        return action_matches(self.action, action) and resource_matches(self.resource, resource)


@dataclass(frozen=True)
class SandboxPolicy:
    """Static sandbox policy for command, storage, and resource boundaries."""

    policy_id: str = "default"
    command_allowlist: tuple[str, ...] = ()
    command_denylist: tuple[str, ...] = DEFAULT_COMMAND_DENYLIST
    resource_limits: tuple[ResourceClaim, ...] = ()
    storage_capabilities: tuple[CapabilityGrant, ...] = ()
    storage_scopes: tuple[StorageCapabilityScope, ...] = ()
    unsafe_operations: tuple[str, ...] = DEFAULT_UNSAFE_OPERATIONS
    metadata: Metadata = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "command_allowlist", tuple(str(command) for command in self.command_allowlist))
        object.__setattr__(self, "command_denylist", tuple(str(command) for command in self.command_denylist))
        object.__setattr__(self, "resource_limits", tuple(self.resource_limits))
        object.__setattr__(self, "storage_capabilities", tuple(self.storage_capabilities))
        object.__setattr__(self, "storage_scopes", tuple(self.storage_scopes))
        object.__setattr__(self, "unsafe_operations", tuple(str(operation) for operation in self.unsafe_operations))

    def limits_metadata(self) -> dict[str, Any]:
        """Return configured resource limits in a stable metadata shape."""
        return resource_limits_metadata(self.resource_limits)


@dataclass(frozen=True)
class SandboxDecision:
    """Auditable allow or deny decision returned by sandbox checks."""

    operation: SandboxOperation | str
    outcome: CapabilityDecisionOutcome | str
    reason: str
    actor: IdentityRef | None = None
    resource: ResourceRef | None = None
    command: tuple[str, ...] = ()
    resource_claims: tuple[ResourceClaim, ...] = ()
    storage_ref: StorageRef | None = None
    matched_grant: CapabilityGrant | None = None
    capability_decision: CapabilityDecision | None = None
    metadata: Metadata = field(default_factory=dict)

    @property
    def allowed(self) -> bool:
        """Return whether the sandbox allows the operation."""
        return _enum_value(self.outcome) == CapabilityDecisionOutcome.ALLOW.value

    def to_json_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly decision payload for tests and dashboards."""
        return {
            "operation": _enum_value(self.operation),
            "outcome": _enum_value(self.outcome),
            "reason": self.reason,
            "actor": self.actor.did if self.actor else None,
            "resource": {
                "uri": self.resource.uri,
                "kind": _resource_kind_value(self.resource.kind),
                "component": self.resource.component,
                "name": self.resource.name,
            }
            if self.resource
            else None,
            "command": list(self.command),
            "resource_claims": [_claim_dict(claim) for claim in self.resource_claims],
            "storage_ref": {
                "uri": self.storage_ref.uri,
                "cid": self.storage_ref.cid,
                "path": self.storage_ref.path,
            }
            if self.storage_ref
            else None,
            "matched_grant_id": self.matched_grant.grant_id if self.matched_grant else None,
            "metadata": dict(self.metadata),
        }


class VirtualOSSandbox:
    """Policy evaluator for the Virtual AI OS sandbox prototype."""

    def __init__(self, policy: SandboxPolicy | None = None):
        self.policy = policy or SandboxPolicy()

    def authorize_command(self, command: SandboxCommand | str | Sequence[str]) -> SandboxDecision:
        """Validate a command request without executing it."""
        invocation = command if isinstance(command, SandboxCommand) else SandboxCommand(command)
        unsafe = ["shell"] if invocation.shell else []
        unsafe.extend(invocation.unsafe_operations)
        unsafe_decision = self.authorize_safe_operation(
            unsafe,
            actor=invocation.actor,
            resource=invocation.resource(),
            operation=SandboxOperation.COMMAND_EXECUTE,
        )
        if not unsafe_decision.allowed:
            return unsafe_decision

        if self._command_denied(invocation.executable):
            return SandboxDecision(
                operation=SandboxOperation.COMMAND_EXECUTE,
                outcome=CapabilityDecisionOutcome.DENY,
                reason=f"command explicitly denied by sandbox policy: {invocation.executable}",
                actor=invocation.actor,
                resource=invocation.resource(),
                command=tuple(invocation.argv),
                resource_claims=invocation.resource_claims,
                metadata=self._decision_metadata(),
            )

        if not self._command_allowed(invocation.argv):
            return SandboxDecision(
                operation=SandboxOperation.COMMAND_EXECUTE,
                outcome=CapabilityDecisionOutcome.DENY,
                reason=f"command is not in sandbox allowlist: {invocation.executable}",
                actor=invocation.actor,
                resource=invocation.resource(),
                command=tuple(invocation.argv),
                resource_claims=invocation.resource_claims,
                metadata=self._decision_metadata(),
            )

        resource_decision = self.authorize_resources(
            invocation.resource_claims,
            actor=invocation.actor,
            resource=invocation.resource(),
        )
        if not resource_decision.allowed:
            return SandboxDecision(
                operation=SandboxOperation.COMMAND_EXECUTE,
                outcome=resource_decision.outcome,
                reason=resource_decision.reason,
                actor=invocation.actor,
                resource=invocation.resource(),
                command=tuple(invocation.argv),
                resource_claims=invocation.resource_claims,
                metadata={
                    **dict(self._decision_metadata()),
                    "resource_decision": resource_decision.to_json_dict(),
                },
            )

        return SandboxDecision(
            operation=SandboxOperation.COMMAND_EXECUTE,
            outcome=CapabilityDecisionOutcome.ALLOW,
            reason="command allowed by sandbox policy",
            actor=invocation.actor,
            resource=invocation.resource(),
            command=tuple(invocation.argv),
            resource_claims=invocation.resource_claims,
            metadata=self._decision_metadata(),
        )

    def require_command(self, command: SandboxCommand | str | Sequence[str]) -> SandboxDecision:
        """Return an allow decision or raise a specific sandbox denial."""
        decision = self.authorize_command(command)
        if decision.allowed:
            return decision
        if decision.metadata.get("unsafe_operation"):
            raise UnsafeOperationDenied(decision.reason)
        if decision.metadata.get("resource_limit"):
            raise ResourceLimitDenied(decision.reason)
        raise CommandDenied(decision.reason)

    def authorize_resources(
        self,
        claims: Sequence[ResourceClaim],
        *,
        actor: IdentityRef | None = None,
        resource: ResourceRef | None = None,
    ) -> SandboxDecision:
        """Validate requested resource claims against configured limits."""
        claim_tuple = tuple(claims)
        metadata = self._decision_metadata()
        for claim in claim_tuple:
            limit = self._matching_limit(claim)
            if limit is None:
                return SandboxDecision(
                    operation=SandboxOperation.RESOURCE_RESERVE,
                    outcome=CapabilityDecisionOutcome.DENY,
                    reason=f"resource claim has no sandbox limit: {claim.resource.uri}",
                    actor=actor,
                    resource=resource or claim.resource,
                    resource_claims=claim_tuple,
                    metadata={**dict(metadata), "resource_limit": "missing"},
                )
            if _resource_unit_value(limit.unit) != _resource_unit_value(claim.unit):
                return SandboxDecision(
                    operation=SandboxOperation.RESOURCE_RESERVE,
                    outcome=CapabilityDecisionOutcome.DENY,
                    reason=f"resource claim unit does not match sandbox limit: {claim.resource.uri}",
                    actor=actor,
                    resource=resource or claim.resource,
                    resource_claims=claim_tuple,
                    metadata={**dict(metadata), "resource_limit": "unit_mismatch"},
                )
            if limit.hard_limit and claim.amount > limit.amount:
                return SandboxDecision(
                    operation=SandboxOperation.RESOURCE_RESERVE,
                    outcome=CapabilityDecisionOutcome.DENY,
                    reason=f"resource claim exceeds sandbox hard limit: {claim.resource.uri}",
                    actor=actor,
                    resource=resource or claim.resource,
                    resource_claims=claim_tuple,
                    metadata={
                        **dict(metadata),
                        "resource_limit": "exceeded",
                        "limit": _claim_dict(limit),
                        "claim": _claim_dict(claim),
                    },
                )

        return SandboxDecision(
            operation=SandboxOperation.RESOURCE_RESERVE,
            outcome=CapabilityDecisionOutcome.ALLOW,
            reason="resource claims fit sandbox limits",
            actor=actor,
            resource=resource,
            resource_claims=claim_tuple,
            metadata=metadata,
        )

    def require_resources(
        self,
        claims: Sequence[ResourceClaim],
        *,
        actor: IdentityRef | None = None,
        resource: ResourceRef | None = None,
    ) -> SandboxDecision:
        """Return an allow decision or raise ``ResourceLimitDenied``."""
        decision = self.authorize_resources(claims, actor=actor, resource=resource)
        if not decision.allowed:
            raise ResourceLimitDenied(decision.reason)
        return decision

    def authorize_storage(self, request: StorageRequest) -> SandboxDecision:
        """Validate a storage operation against sandbox scopes and grants."""
        action = storage_operation_action(request.operation)
        resource = storage_ref_resource(request.ref)
        metadata = self._decision_metadata()

        matched_scope = self._matching_storage_scope(action, resource, request.operation)
        if self.policy.storage_scopes and matched_scope is None:
            return SandboxDecision(
                operation=SandboxOperation.STORAGE_ACCESS,
                outcome=CapabilityDecisionOutcome.DENY,
                reason=f"storage ref is outside sandbox scope: {resource.uri}",
                actor=request.actor,
                resource=resource,
                storage_ref=request.ref,
                metadata={**dict(metadata), "storage_scope": "missing"},
            )

        capabilities = self.policy.storage_capabilities or tuple(request.capabilities)
        if capabilities:
            capability_decision = authorize_capability(
                request.actor,
                action,
                resource,
                capabilities,
                operation=f"storage.{_storage_operation_value(request.operation)}",
                context={
                    "operation": f"storage.{_storage_operation_value(request.operation)}",
                    "sandbox_policy_id": self.policy.policy_id,
                },
                service_id=VIRTUAL_OS_SANDBOX_COMPONENT,
            )
            if not capability_decision.allowed:
                return SandboxDecision(
                    operation=SandboxOperation.STORAGE_ACCESS,
                    outcome=CapabilityDecisionOutcome.DENY,
                    reason=capability_decision.reason,
                    actor=request.actor,
                    resource=resource,
                    storage_ref=request.ref,
                    capability_decision=capability_decision,
                    metadata={**dict(metadata), "storage_scope": "capability_denied"},
                )

            return SandboxDecision(
                operation=SandboxOperation.STORAGE_ACCESS,
                outcome=CapabilityDecisionOutcome.ALLOW,
                reason="storage access authorized by scoped capability",
                actor=request.actor,
                resource=resource,
                storage_ref=request.ref,
                matched_grant=capability_decision.matched_grant,
                capability_decision=capability_decision,
                metadata={
                    **dict(metadata),
                    "storage_scope": matched_scope.scope_id if matched_scope else None,
                },
            )

        if matched_scope is not None:
            return SandboxDecision(
                operation=SandboxOperation.STORAGE_ACCESS,
                outcome=CapabilityDecisionOutcome.ALLOW,
                reason="storage access authorized by sandbox storage scope",
                actor=request.actor,
                resource=resource,
                storage_ref=request.ref,
                metadata={**dict(metadata), "storage_scope": matched_scope.scope_id},
            )

        return SandboxDecision(
            operation=SandboxOperation.STORAGE_ACCESS,
            outcome=CapabilityDecisionOutcome.DENY,
            reason="storage access requires a scoped sandbox capability",
            actor=request.actor,
            resource=resource,
            storage_ref=request.ref,
            metadata={**dict(metadata), "storage_scope": "missing"},
        )

    def require_storage(self, request: StorageRequest) -> SandboxDecision:
        """Return an allow decision or raise ``StorageScopeDenied``."""
        decision = self.authorize_storage(request)
        if not decision.allowed:
            raise StorageScopeDenied(decision.reason)
        return decision

    def authorize_safe_operation(
        self,
        operations: str | Sequence[str],
        *,
        actor: IdentityRef | None = None,
        resource: ResourceRef | None = None,
        operation: SandboxOperation | str = SandboxOperation.UNSAFE_OPERATION,
    ) -> SandboxDecision:
        """Validate that no requested operation is explicitly unsafe."""
        requested = (operations,) if isinstance(operations, str) else tuple(str(item) for item in operations)
        unsafe = set(self.policy.unsafe_operations)
        for requested_operation in requested:
            if requested_operation in unsafe:
                return SandboxDecision(
                    operation=operation,
                    outcome=CapabilityDecisionOutcome.DENY,
                    reason=f"unsafe operation denied by sandbox policy: {requested_operation}",
                    actor=actor,
                    resource=resource,
                    metadata={
                        **dict(self._decision_metadata()),
                        "unsafe_operation": requested_operation,
                    },
                )

        return SandboxDecision(
            operation=operation,
            outcome=CapabilityDecisionOutcome.ALLOW,
            reason="operation is not explicitly unsafe",
            actor=actor,
            resource=resource,
            metadata=self._decision_metadata(),
        )

    def deny_unsafe_operation(
        self,
        operation: str,
        *,
        actor: IdentityRef | None = None,
        resource: ResourceRef | None = None,
    ) -> SandboxDecision:
        """Return an explicit denial decision for an unsafe operation."""
        return SandboxDecision(
            operation=SandboxOperation.UNSAFE_OPERATION,
            outcome=CapabilityDecisionOutcome.DENY,
            reason=f"unsafe operation denied by sandbox policy: {operation}",
            actor=actor,
            resource=resource,
            metadata={
                **dict(self._decision_metadata()),
                "unsafe_operation": str(operation),
            },
        )

    def require_safe_operation(
        self,
        operations: str | Sequence[str],
        *,
        actor: IdentityRef | None = None,
        resource: ResourceRef | None = None,
    ) -> SandboxDecision:
        """Return an allow decision or raise ``UnsafeOperationDenied``."""
        decision = self.authorize_safe_operation(operations, actor=actor, resource=resource)
        if not decision.allowed:
            raise UnsafeOperationDenied(decision.reason)
        return decision

    def _command_allowed(self, argv: Sequence[str]) -> bool:
        if not self.policy.command_allowlist:
            return False
        executable = os.path.basename(argv[0])
        full = argv[0]
        return any(_command_pattern_matches(pattern, executable, full) for pattern in self.policy.command_allowlist)

    def _command_denied(self, executable: str) -> bool:
        return any(_command_pattern_matches(pattern, executable, executable) for pattern in self.policy.command_denylist)

    def _matching_limit(self, claim: ResourceClaim) -> ResourceClaim | None:
        for limit in self.policy.resource_limits:
            if _resource_limit_matches(limit, claim):
                return limit
        return None

    def _matching_storage_scope(
        self,
        action: CapabilityAction | str,
        resource: ResourceRef,
        operation: StorageOperation | str,
    ) -> StorageCapabilityScope | None:
        for scope in self.policy.storage_scopes:
            if scope.matches(action, resource, operation):
                return scope
        return None

    def _decision_metadata(self) -> dict[str, Any]:
        return {
            "sandbox_policy_id": self.policy.policy_id,
            "resource_limits": self.policy.limits_metadata(),
            **dict(self.policy.metadata),
        }


def _command_pattern_matches(pattern: str, executable: str, full: str) -> bool:
    target = full if "/" in pattern else executable
    return fnmatch.fnmatchcase(target, pattern)


def _resource_limit_matches(limit: ResourceClaim, claim: ResourceClaim) -> bool:
    if resource_matches(limit.resource, claim.resource):
        return True

    limit_kind = _resource_kind_value(limit.resource.kind)
    claim_kind = _resource_kind_value(claim.resource.kind)
    if limit_kind == ResourceKind.ANY.value or limit_kind != claim_kind:
        return False
    if limit.resource.component and limit.resource.component != claim.resource.component:
        return False
    if limit.resource.name and limit.resource.name != claim.resource.name:
        return False
    return True


__all__ = [
    "CommandDenied",
    "DEFAULT_COMMAND_DENYLIST",
    "DEFAULT_UNSAFE_OPERATIONS",
    "ResourceLimitDenied",
    "SandboxCommand",
    "SandboxDecision",
    "SandboxDenied",
    "SandboxError",
    "SandboxOperation",
    "SandboxPolicy",
    "StorageCapabilityScope",
    "StorageScopeDenied",
    "UnsafeOperationDenied",
    "VIRTUAL_OS_SANDBOX_COMPONENT",
    "VirtualOSSandbox",
    "command_name",
    "command_resource",
    "normalize_command",
    "resource_limits_metadata",
    "storage_operation_action",
    "storage_ref_resource",
]
