"""Offline-first boot mode for the Hallucinate Virtual AI OS.

Offline boot reuses the normal boot orchestrator for registry and baseline
validation, but forces daemon startup off. It then reports which local caches
are available, which network-dependent transports are disabled, and which
capabilities are degraded while the OS is running from local state only.
"""

from __future__ import annotations

import asyncio
import inspect
import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

from .boot import (
    BootConfig,
    BootSequenceResult,
    DEFAULT_DAEMON_CONFIG_PATH,
    boot_virtual_os,
    load_daemon_definitions,
)
from .contracts import (
    CapabilityAction,
    CapabilitySpec,
    EventEnvelope,
    EventSeverity,
    HealthState,
    Metadata,
    ResourceKind,
    ResourceRef,
    utc_now,
)
from .events import (
    EventCategory,
    EventPublishRequest,
    MetricKind,
    MetricPoint,
    MetricUnit,
    StructuredEvent,
    dashboard_safe,
    structured_event,
)
from .provenance import (
    ProvenanceLedger,
    ProvenanceLedgerReceipt,
    ProvenanceLedgerRecord,
    ProvenanceRecordKind,
)
from .registry import ComponentAdapterRegistry, find_project_root, normalize_component_id


VIRTUAL_OS_OFFLINE_COMPONENT = "virtual_os.offline"

LOCAL_TRANSPORT_PROTOCOLS: tuple[str, ...] = (
    "file",
    "in-process",
    "inprocess",
    "local",
    "memory",
    "pipe",
    "stdio",
    "unix",
)

NETWORK_TRANSPORT_TOKENS: tuple[str, ...] = (
    "http",
    "https",
    "libp2p",
    "mcp++",
    "p2p",
    "peer",
    "pubsub",
    "tcp",
    "udp",
    "websocket",
    "ws",
    "wss",
)


class OfflineCacheState(str, Enum):
    """Local cache readiness during offline boot."""

    AVAILABLE = "available"
    MISSING = "missing"
    UNREADABLE = "unreadable"


class OfflineTransportState(str, Enum):
    """Transport availability in offline mode."""

    ENABLED = "enabled"
    DISABLED = "disabled"


class OfflineCapabilityState(str, Enum):
    """Capability availability after offline degradations are applied."""

    AVAILABLE = "available"
    DEGRADED = "degraded"
    DISABLED = "disabled"


@dataclass(frozen=True)
class LocalCacheSpec:
    """Local cache required or preferred by one component in offline mode."""

    cache_id: str
    component_id: str
    path: str | Path
    title: str = ""
    required: bool = True
    capabilities: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "cache_id", str(self.cache_id).strip())
        object.__setattr__(self, "component_id", normalize_component_id(self.component_id))
        object.__setattr__(self, "path", Path(self.path))
        object.__setattr__(self, "capabilities", tuple(str(item) for item in self.capabilities))
        object.__setattr__(self, "metadata", dict(self.metadata))
        if not self.cache_id:
            raise ValueError("cache_id cannot be empty")
        if not self.component_id:
            raise ValueError("component_id cannot be empty")


@dataclass(frozen=True)
class LocalCacheStatus:
    """Observed local cache state for one cache spec."""

    cache_id: str
    component_id: str
    path: Path
    state: OfflineCacheState | str
    available: bool = False
    required: bool = True
    title: str = ""
    message: str = ""
    checked_at: datetime = field(default_factory=utc_now)
    capabilities: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    def dashboard_dict(self) -> dict[str, Any]:
        return {
            "cache_id": self.cache_id,
            "component_id": self.component_id,
            "path": str(self.path),
            "state": _enum_value(self.state),
            "available": self.available,
            "required": self.required,
            "title": self.title,
            "message": self.message,
            "checked_at": self.checked_at.isoformat(),
            "capabilities": list(self.capabilities),
            "metadata": dashboard_safe(self.metadata),
        }


@dataclass(frozen=True)
class OfflineTransportRecord:
    """Transport policy decision made for one daemon during offline boot."""

    daemon_id: str
    component_id: str
    transport: str
    state: OfflineTransportState | str
    enabled: bool = False
    network_dependent: bool = True
    endpoint: str | None = None
    reason: str = ""
    metadata: Metadata = field(default_factory=dict)

    def dashboard_dict(self) -> dict[str, Any]:
        return {
            "daemon_id": self.daemon_id,
            "component_id": self.component_id,
            "transport": self.transport,
            "state": _enum_value(self.state),
            "enabled": self.enabled,
            "network_dependent": self.network_dependent,
            "endpoint": self.endpoint,
            "reason": self.reason,
            "metadata": dashboard_safe(self.metadata),
        }


@dataclass(frozen=True)
class CapabilityDegradation:
    """Capability availability after local-cache and transport policy checks."""

    component_id: str
    capability_id: str
    action: CapabilityAction | str
    resource_kind: ResourceKind | str
    state: OfflineCapabilityState | str
    reason: str = ""
    requires_network: bool = False
    backed_by_cache: bool = False
    metadata: Metadata = field(default_factory=dict)

    @property
    def degraded(self) -> bool:
        return _enum_value(self.state) != OfflineCapabilityState.AVAILABLE.value

    def dashboard_dict(self) -> dict[str, Any]:
        return {
            "component_id": self.component_id,
            "capability_id": self.capability_id,
            "action": _enum_value(self.action),
            "resource_kind": _enum_value(self.resource_kind),
            "state": _enum_value(self.state),
            "degraded": self.degraded,
            "reason": self.reason,
            "requires_network": self.requires_network,
            "backed_by_cache": self.backed_by_cache,
            "metadata": dashboard_safe(self.metadata),
        }


@dataclass(frozen=True)
class OfflineBootConfig:
    """Configuration for one offline-first boot run."""

    project_root: str | Path | None = None
    boot_config: BootConfig | None = None
    daemon_config_path: str | Path | None = None
    component_ids: tuple[str, ...] = ()
    cache_specs: tuple[LocalCacheSpec, ...] = ()
    validate_baseline: bool = True
    correlation_id: str | None = None
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class OfflineBootResult:
    """Complete offline boot report."""

    ok: bool
    health: HealthState
    boot: BootSequenceResult
    caches: tuple[LocalCacheStatus, ...]
    transports: tuple[OfflineTransportRecord, ...]
    capabilities: tuple[CapabilityDegradation, ...]
    events: tuple[StructuredEvent | EventEnvelope, ...]
    metrics: tuple[MetricPoint, ...]
    provenance_ledger: Any | None = None
    provenance_receipt: ProvenanceLedgerReceipt | Any | None = None
    notices: tuple[str, ...] = ()
    errors: tuple[str, ...] = ()
    started_at: datetime = field(default_factory=utc_now)
    completed_at: datetime = field(default_factory=utc_now)
    metadata: Metadata = field(default_factory=dict)

    @property
    def boot_result(self) -> BootSequenceResult:
        """Alias for callers that distinguish normal boot from offline policy."""
        return self.boot

    def cache_by_id(self) -> dict[str, LocalCacheStatus]:
        return {cache.cache_id: cache for cache in self.caches}

    def transport_by_daemon(self) -> dict[str, OfflineTransportRecord]:
        return {transport.daemon_id: transport for transport in self.transports}

    def degraded_capabilities(self) -> tuple[CapabilityDegradation, ...]:
        return tuple(capability for capability in self.capabilities if capability.degraded)

    def disabled_transports(self) -> tuple[OfflineTransportRecord, ...]:
        return tuple(transport for transport in self.transports if not transport.enabled)

    def dashboard_dict(self) -> dict[str, Any]:
        payload = self.boot.dashboard_dict()
        payload["health"] = self.health.value
        payload["offline"] = {
            "ok": self.ok,
            "health": self.health.value,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat(),
            "duration_ms": (self.completed_at - self.started_at).total_seconds() * 1000,
            "errors": list(self.errors),
            "notices": list(self.notices),
            "metadata": dashboard_safe(self.metadata),
            "caches": [cache.dashboard_dict() for cache in self.caches],
            "transports": [transport.dashboard_dict() for transport in self.transports],
            "capabilities": [capability.dashboard_dict() for capability in self.capabilities],
            "degraded_capability_count": len(self.degraded_capabilities()),
            "disabled_transport_count": len(self.disabled_transports()),
            "provenance": (
                self.provenance_receipt.to_json_dict()
                if hasattr(self.provenance_receipt, "to_json_dict")
                else dashboard_safe(self.provenance_receipt)
            ),
        }
        payload["offline_metrics"] = [metric.dashboard_dict() for metric in self.metrics]
        payload["offline_events"] = [
            event.dashboard_dict() if hasattr(event, "dashboard_dict") else dashboard_safe(event)
            for event in self.events
        ]
        return payload


DEFAULT_LOCAL_CACHE_SPECS: tuple[LocalCacheSpec, ...] = (
    LocalCacheSpec(
        cache_id="ipfs-kit-vfs-cache",
        component_id="ipfs_kit_py",
        path=Path("ipfs_kit_py/ipfs_kit_py/cache"),
        title="IPFS Kit VFS cache",
        capabilities=("storage.read", "storage.list", "storage.pin"),
    ),
    LocalCacheSpec(
        cache_id="datasets-query-cache",
        component_id="ipfs_datasets_py",
        path=Path("ipfs_datasets_py/ipfs_datasets_py/caching"),
        title="IPFS Datasets query cache",
        capabilities=("dataset.load", "knowledge.query", "provenance.emit"),
    ),
    LocalCacheSpec(
        cache_id="model-runtime-cache",
        component_id="ipfs_accelerate_py",
        path=Path("ipfs_accelerate_py/ipfs_accelerate_py/common"),
        title="IPFS Accelerate model cache",
        capabilities=("model.load", "inference.execute", "hardware.detect"),
    ),
    LocalCacheSpec(
        cache_id="swissknife-descriptor-cache",
        component_id="swissknife",
        path=Path("swissknife/src/utils/cache"),
        title="SwissKnife descriptor cache",
        capabilities=("descriptor.read", "descriptor.launch", "ui.generate"),
    ),
    LocalCacheSpec(
        cache_id="mcp-plus-plus-result-cache",
        component_id="mcp_plus_plus",
        path=Path("ipfs_accelerate_py/ipfs_accelerate_py/mcp_server/mcplusplus/result_cache.py"),
        title="MCP++ result cache",
        capabilities=("descriptor.validate", "event.emit", "workflow.schedule"),
    ),
)


class OfflineBootOrchestrator:
    """Coordinate offline boot, cache readiness, and capability degradation."""

    def __init__(
        self,
        config: OfflineBootConfig | None = None,
        *,
        daemon_supervisor: Any | None = None,
        event_bus: Any | None = None,
        registry: ComponentAdapterRegistry | None = None,
        provenance_ledger: Any | None = None,
    ) -> None:
        self.config = config or OfflineBootConfig()
        self.project_root = (
            Path(self.config.project_root).resolve()
            if self.config.project_root
            else _project_root_from_boot_config(self.config.boot_config)
        )
        self.daemon_supervisor = daemon_supervisor
        self.event_bus = event_bus
        self.registry = registry
        self.provenance_ledger = provenance_ledger if provenance_ledger is not None else ProvenanceLedger()

    def boot(self) -> OfflineBootResult:
        started_at = utc_now()
        caches = discover_local_caches(
            self.config.cache_specs or DEFAULT_LOCAL_CACHE_SPECS,
            project_root=self.project_root,
        )
        transports = offline_transport_records(
            daemon_config_path=self._daemon_config_path(),
            project_root=self.project_root,
        )

        boot_config = self._offline_boot_config(caches, transports)
        boot_result = boot_virtual_os(
            boot_config,
            daemon_supervisor=self.daemon_supervisor,
            event_bus=self.event_bus,
            registry=self.registry,
        )

        capabilities = offline_capability_report(
            boot_result.registry,
            caches=caches,
            transports=transports,
        )
        errors = [*boot_result.errors, *_cache_errors(caches)]
        notices = [*boot_result.notices, *_cache_notices(caches), *_transport_notices(transports)]
        degraded_count = len(tuple(capability for capability in capabilities if capability.degraded))
        if degraded_count:
            notices.append(f"Offline capability report degraded {degraded_count} capability/capabilities.")

        health = _offline_health(
            boot_result.health,
            errors=errors,
            caches=caches,
            transports=transports,
            capabilities=capabilities,
        )
        ok = boot_result.ok and not errors
        completed_at = utc_now()
        metadata = {
            "offline_mode": True,
            "project_root": str(self.project_root),
            "cache_count": len(caches),
            "disabled_transport_ids": [transport.daemon_id for transport in transports if not transport.enabled],
            "degraded_capability_count": degraded_count,
            **dict(self.config.metadata),
        }
        metrics = _offline_metrics(
            caches,
            transports,
            capabilities,
            trace_id=_first_trace_id(boot_result.events),
            correlation_id=boot_config.correlation_id,
        )
        event = _offline_event(
            ok=ok,
            health=health,
            caches=caches,
            transports=transports,
            capabilities=capabilities,
            notices=notices,
            errors=errors,
            metadata=metadata,
            correlation_id=boot_config.correlation_id,
        )
        _publish_event(self.event_bus, event)

        provenance_receipt = _record_provenance(
            self.provenance_ledger,
            ok=ok,
            health=health,
            caches=caches,
            transports=transports,
            capabilities=capabilities,
            events=(*boot_result.events, event),
            notices=notices,
            errors=errors,
            metadata=metadata,
            correlation_id=boot_config.correlation_id,
            created_at=completed_at,
        )

        return OfflineBootResult(
            ok=ok,
            health=health,
            boot=boot_result,
            caches=caches,
            transports=transports,
            capabilities=capabilities,
            events=(*boot_result.events, event),
            metrics=metrics,
            provenance_ledger=self.provenance_ledger,
            provenance_receipt=provenance_receipt,
            notices=tuple(notices),
            errors=tuple(errors),
            started_at=started_at,
            completed_at=completed_at,
            metadata=metadata,
        )

    def _daemon_config_path(self) -> str | Path:
        if self.config.daemon_config_path is not None:
            return self.config.daemon_config_path
        if self.config.boot_config and self.config.boot_config.daemon_config_path is not None:
            return self.config.boot_config.daemon_config_path
        return DEFAULT_DAEMON_CONFIG_PATH

    def _offline_boot_config(
        self,
        caches: Sequence[LocalCacheStatus],
        transports: Sequence[OfflineTransportRecord],
    ) -> BootConfig:
        base = self.config.boot_config or BootConfig(
            project_root=self.project_root,
            daemon_config_path=self._daemon_config_path(),
            component_ids=tuple(self.config.component_ids),
            validate_baseline=self.config.validate_baseline,
            correlation_id=self.config.correlation_id,
            metadata=dict(self.config.metadata),
        )
        metadata = {
            **dict(base.metadata),
            **dict(self.config.metadata),
            "offline_mode": True,
            "local_cache_ids": [cache.cache_id for cache in caches],
            "disabled_transport_ids": [transport.daemon_id for transport in transports if not transport.enabled],
        }
        return replace(
            base,
            project_root=self.project_root,
            daemon_config_path=self._daemon_config_path(),
            component_ids=tuple(self.config.component_ids or base.component_ids),
            validate_baseline=self.config.validate_baseline if self.config.boot_config is None else base.validate_baseline,
            start_daemons=False,
            wait_for_daemon_health=False,
            correlation_id=self.config.correlation_id or base.correlation_id,
            metadata=metadata,
        )


def boot_virtual_os_offline(
    config: OfflineBootConfig | None = None,
    *,
    daemon_supervisor: Any | None = None,
    event_bus: Any | None = None,
    registry: ComponentAdapterRegistry | None = None,
    provenance_ledger: Any | None = None,
) -> OfflineBootResult:
    """Run the Virtual AI OS boot sequence in offline-first mode."""
    return OfflineBootOrchestrator(
        config,
        daemon_supervisor=daemon_supervisor,
        event_bus=event_bus,
        registry=registry,
        provenance_ledger=provenance_ledger,
    ).boot()


def discover_local_caches(
    specs: Sequence[LocalCacheSpec],
    *,
    project_root: str | Path | None = None,
) -> tuple[LocalCacheStatus, ...]:
    """Inspect local cache paths without importing submodule cache backends."""
    root = Path(project_root).resolve() if project_root else find_project_root()
    statuses: list[LocalCacheStatus] = []
    for spec in specs:
        path = spec.path if spec.path.is_absolute() else root / spec.path
        path = path.resolve()
        exists = path.exists()
        readable = exists and os.access(path, os.R_OK)
        if not exists:
            state = OfflineCacheState.MISSING
            message = f"Local cache is missing: {path}"
        elif not readable:
            state = OfflineCacheState.UNREADABLE
            message = f"Local cache is not readable: {path}"
        else:
            state = OfflineCacheState.AVAILABLE
            message = f"Local cache is available: {path}"
        metadata = {
            **dict(spec.metadata),
            "exists": exists,
            "is_dir": path.is_dir() if exists else False,
            "is_file": path.is_file() if exists else False,
            "mtime": path.stat().st_mtime if exists else None,
        }
        statuses.append(
            LocalCacheStatus(
                cache_id=spec.cache_id,
                component_id=spec.component_id,
                path=path,
                state=state,
                available=state == OfflineCacheState.AVAILABLE,
                required=spec.required,
                title=spec.title,
                message=message,
                capabilities=spec.capabilities,
                metadata=metadata,
            )
        )
    return tuple(statuses)


def offline_transport_records(
    config_path: str | Path | None = None,
    *,
    daemon_config_path: str | Path | None = None,
    project_root: str | Path | None = None,
) -> tuple[OfflineTransportRecord, ...]:
    """Return the transport policy decisions made for offline mode."""
    path = daemon_config_path if daemon_config_path is not None else config_path
    definitions = load_daemon_definitions(path or DEFAULT_DAEMON_CONFIG_PATH, project_root=project_root)
    records: list[OfflineTransportRecord] = []
    for daemon in definitions:
        network_dependent = is_network_dependent_transport(daemon.endpoint, daemon.metadata)
        transport = _transport_name(daemon.endpoint, daemon.metadata)
        if network_dependent:
            records.append(
                OfflineTransportRecord(
                    daemon_id=daemon.daemon_id,
                    component_id=daemon.component_id,
                    transport=transport,
                    state=OfflineTransportState.DISABLED,
                    enabled=False,
                    network_dependent=True,
                    endpoint=daemon.endpoint_url,
                    reason="Offline mode disables network-dependent transport.",
                    metadata={
                        "service_kind": daemon.metadata.get("serviceKind"),
                        "endpoint": dict(daemon.endpoint),
                    },
                )
            )
        else:
            records.append(
                OfflineTransportRecord(
                    daemon_id=daemon.daemon_id,
                    component_id=daemon.component_id,
                    transport=transport,
                    state=OfflineTransportState.ENABLED,
                    enabled=True,
                    network_dependent=False,
                    endpoint=daemon.endpoint_url,
                    reason="Transport is local-only and remains available in offline mode.",
                    metadata={
                        "service_kind": daemon.metadata.get("serviceKind"),
                        "endpoint": dict(daemon.endpoint),
                    },
                )
            )
    return tuple(records)


def offline_capability_report(
    registry: ComponentAdapterRegistry,
    *,
    caches: Sequence[LocalCacheStatus] = (),
    transports: Sequence[OfflineTransportRecord] = (),
) -> tuple[CapabilityDegradation, ...]:
    """Classify registry capabilities after offline transport restrictions."""
    cache_components = {cache.component_id for cache in caches if cache.available}
    disabled_components = {transport.component_id for transport in transports if not transport.enabled}
    cache_capabilities = {
        (cache.component_id, capability_id)
        for cache in caches
        if cache.available
        for capability_id in cache.capabilities
    }
    reports: list[CapabilityDegradation] = []
    for component_id, capabilities in registry.capabilities().items():
        normalized_component = normalize_component_id(component_id)
        for capability in capabilities:
            requires_network = capability_requires_network(capability)
            backed_by_cache = (
                normalized_component in cache_components
                or (normalized_component, capability.capability_id) in cache_capabilities
            )
            state = OfflineCapabilityState.AVAILABLE
            reason = "Capability remains available through local state."
            metadata: dict[str, Any] = {}
            if requires_network:
                state = OfflineCapabilityState.DISABLED
                reason = "Offline mode disables network capability."
                metadata["degradation_kind"] = "network-disabled"
            elif normalized_component in disabled_components and capability_requires_transport(capability):
                state = OfflineCapabilityState.DEGRADED
                reason = "Component transport is disabled; capability is limited to local cache behavior."
                metadata["degradation_kind"] = "transport-disabled"
            elif capability_uses_local_cache(capability) and not backed_by_cache:
                state = OfflineCapabilityState.DEGRADED
                reason = "Local cache is unavailable for this capability."
                metadata["degradation_kind"] = "missing-cache"

            reports.append(
                CapabilityDegradation(
                    component_id=normalized_component,
                    capability_id=capability.capability_id,
                    action=capability.action,
                    resource_kind=capability.resource_kind,
                    state=state,
                    reason=reason,
                    requires_network=requires_network,
                    backed_by_cache=backed_by_cache,
                    metadata=metadata,
                )
            )
    return tuple(reports)


def is_network_dependent_transport(endpoint: Mapping[str, Any], metadata: Mapping[str, Any] | None = None) -> bool:
    """Return whether a daemon transport requires network availability."""
    metadata = metadata or {}
    protocol = str(endpoint.get("protocol") or "").strip().lower()
    if protocol and protocol not in LOCAL_TRANSPORT_PROTOCOLS:
        return True
    transport = str(metadata.get("mcpTransport") or "").strip().lower()
    profiles = " ".join(str(item).lower() for item in metadata.get("mcpPlusPlusProfiles", ()))
    values = f"{protocol} {transport} {profiles}"
    return any(token in values for token in NETWORK_TRANSPORT_TOKENS)


def capability_requires_network(capability: CapabilitySpec) -> bool:
    """Return whether a capability is unavailable without network transport."""
    resource_kind = _enum_value(capability.resource_kind)
    capability_id = capability.capability_id.lower()
    if resource_kind == ResourceKind.NETWORK.value:
        return True
    return any(token in capability_id for token in ("network", "transport.", "p2p", "peer", "route"))


def capability_requires_transport(capability: CapabilitySpec) -> bool:
    """Return whether a capability depends on a component service transport."""
    capability_id = capability.capability_id.lower()
    resource_kind = _enum_value(capability.resource_kind)
    if resource_kind in {ResourceKind.SERVICE.value, ResourceKind.DAEMON.value}:
        return True
    return any(
        token in capability_id
        for token in (
            "capability.delegate",
            "event.subscribe",
            "mcp",
            "service.",
            "ucan.delegate",
            "workflow.schedule",
        )
    )


def capability_uses_local_cache(capability: CapabilitySpec) -> bool:
    """Return whether a capability should be backed by a local cache offline."""
    capability_id = capability.capability_id.lower()
    resource_kind = _enum_value(capability.resource_kind)
    if resource_kind in {
        ResourceKind.DATASET.value,
        ResourceKind.DESCRIPTOR.value,
        ResourceKind.MODEL.value,
        ResourceKind.STORAGE.value,
    }:
        return True
    return capability_id.startswith(
        (
            "dataset.",
            "descriptor.",
            "hardware.",
            "inference.",
            "knowledge.",
            "model.",
            "storage.",
            "ui.",
        )
    )


def _project_root_from_boot_config(config: BootConfig | None) -> Path:
    if config is not None and config.project_root is not None:
        return Path(config.project_root).resolve()
    return find_project_root()


def _cache_errors(caches: Sequence[LocalCacheStatus]) -> tuple[str, ...]:
    return tuple(
        f"Required local cache is unavailable: {cache.cache_id} ({_enum_value(cache.state)})"
        for cache in caches
        if cache.required and not cache.available
    )


def _cache_notices(caches: Sequence[LocalCacheStatus]) -> tuple[str, ...]:
    notices = [
        f"Offline mode local cache ready: {cache.cache_id}"
        for cache in caches
        if cache.available
    ]
    notices.extend(
        f"Optional local cache is unavailable: {cache.cache_id} ({_enum_value(cache.state)})"
        for cache in caches
        if not cache.required and not cache.available
    )
    return tuple(notices)


def _transport_notices(transports: Sequence[OfflineTransportRecord]) -> tuple[str, ...]:
    disabled = tuple(transport for transport in transports if not transport.enabled)
    if not disabled:
        return ()
    return (f"Offline mode disabled {len(disabled)} network-dependent transport(s).",)


def _offline_health(
    boot_health: HealthState,
    *,
    errors: Sequence[str],
    caches: Sequence[LocalCacheStatus],
    transports: Sequence[OfflineTransportRecord],
    capabilities: Sequence[CapabilityDegradation],
) -> HealthState:
    if errors or boot_health == HealthState.UNHEALTHY:
        return HealthState.UNHEALTHY
    if (
        boot_health != HealthState.HEALTHY
        or any(not transport.enabled for transport in transports)
        or any(not cache.available for cache in caches)
        or any(capability.degraded for capability in capabilities)
    ):
        return HealthState.DEGRADED
    return HealthState.HEALTHY


def _offline_metrics(
    caches: Sequence[LocalCacheStatus],
    transports: Sequence[OfflineTransportRecord],
    capabilities: Sequence[CapabilityDegradation],
    *,
    trace_id: str | None,
    correlation_id: str | None,
) -> tuple[MetricPoint, ...]:
    disabled = tuple(transport for transport in transports if not transport.enabled)
    degraded = tuple(capability for capability in capabilities if capability.degraded)
    return (
        MetricPoint(
            name="virtual_os.offline.caches.available",
            value=float(sum(1 for cache in caches if cache.available)),
            kind=MetricKind.GAUGE,
            unit=MetricUnit.COUNT,
            component=VIRTUAL_OS_OFFLINE_COMPONENT,
            trace_id=trace_id,
            correlation_id=correlation_id,
        ),
        MetricPoint(
            name="virtual_os.offline.transports.disabled",
            value=float(len(disabled)),
            kind=MetricKind.GAUGE,
            unit=MetricUnit.COUNT,
            component=VIRTUAL_OS_OFFLINE_COMPONENT,
            trace_id=trace_id,
            correlation_id=correlation_id,
        ),
        MetricPoint(
            name="virtual_os.offline.capabilities.degraded",
            value=float(len(degraded)),
            kind=MetricKind.GAUGE,
            unit=MetricUnit.COUNT,
            component=VIRTUAL_OS_OFFLINE_COMPONENT,
            trace_id=trace_id,
            correlation_id=correlation_id,
        ),
    )


def _offline_event(
    *,
    ok: bool,
    health: HealthState,
    caches: Sequence[LocalCacheStatus],
    transports: Sequence[OfflineTransportRecord],
    capabilities: Sequence[CapabilityDegradation],
    notices: Sequence[str],
    errors: Sequence[str],
    metadata: Metadata,
    correlation_id: str | None,
) -> StructuredEvent:
    severity = EventSeverity.INFO
    if errors:
        severity = EventSeverity.ERROR
    elif health == HealthState.DEGRADED:
        severity = EventSeverity.WARNING
    return structured_event(
        "virtual_os.offline.boot.completed",
        source=VIRTUAL_OS_OFFLINE_COMPONENT,
        category=EventCategory.SYSTEM,
        severity=severity,
        correlation_id=correlation_id,
        subject=ResourceRef(
            uri="virtual-os://boot/offline",
            kind=ResourceKind.PROCESS,
            component=VIRTUAL_OS_OFFLINE_COMPONENT,
            name="offline-boot",
        ),
        payload={
            "ok": ok,
            "health": health.value,
            "cache_count": len(caches),
            "available_cache_count": sum(1 for cache in caches if cache.available),
            "disabled_transport_ids": [transport.daemon_id for transport in transports if not transport.enabled],
            "degraded_capability_ids": [
                f"{capability.component_id}.{capability.capability_id}"
                for capability in capabilities
                if capability.degraded
            ],
            "errors": list(errors),
            "notices": list(notices),
        },
        metadata=metadata,
    )


def _record_provenance(
    ledger: Any | None,
    *,
    ok: bool,
    health: HealthState,
    caches: Sequence[LocalCacheStatus],
    transports: Sequence[OfflineTransportRecord],
    capabilities: Sequence[CapabilityDegradation],
    events: Sequence[StructuredEvent | EventEnvelope | Any],
    notices: Sequence[str],
    errors: Sequence[str],
    metadata: Metadata,
    correlation_id: str | None,
    created_at: datetime,
) -> Any | None:
    if ledger is None or not hasattr(ledger, "record"):
        return None
    payload = {
        "ok": ok,
        "health": health.value,
        "caches": [cache.dashboard_dict() for cache in caches],
        "transports": [transport.dashboard_dict() for transport in transports],
        "capabilities": [capability.dashboard_dict() for capability in capabilities],
        "notices": list(notices),
        "errors": list(errors),
    }
    envelopes = tuple(
        event.envelope if hasattr(event, "envelope") else event
        for event in events
        if isinstance(event, EventEnvelope) or hasattr(event, "envelope")
    )
    record = ProvenanceLedgerRecord(
        kind=ProvenanceRecordKind.CUSTOM,
        operation="offline.boot",
        output={
            "output_id": "offline-boot-report",
            "data": payload,
        },
        events=envelopes,
        subject=ResourceRef(
            uri="virtual-os://boot/offline",
            kind=ResourceKind.PROCESS,
            component=VIRTUAL_OS_OFFLINE_COMPONENT,
            name="offline-boot",
        ),
        trace_id=_first_trace_id(events),
        labels={"mode": "offline"},
        created_at=created_at,
        metadata={
            **dict(metadata),
            "correlation_id": correlation_id,
            "disabled_transport_count": sum(1 for transport in transports if not transport.enabled),
            "degraded_capability_count": sum(1 for capability in capabilities if capability.degraded),
        },
    )
    return _resolve_maybe_awaitable(ledger.record(record))


def _publish_event(event_bus: Any | None, event: StructuredEvent) -> None:
    if event_bus is None:
        return
    if hasattr(event_bus, "publish_event"):
        _resolve_maybe_awaitable(event_bus.publish_event(EventPublishRequest(event=event)))
        return
    if hasattr(event_bus, "publish"):
        _resolve_maybe_awaitable(event_bus.publish(event.envelope))


def _resolve_maybe_awaitable(value: Any) -> Any:
    if inspect.isawaitable(value):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(value)
        raise RuntimeError("Offline boot cannot synchronously wait while an event loop is running.")
    return value


def _first_trace_id(events: Sequence[Any]) -> str | None:
    for event in events:
        envelope = event.envelope if hasattr(event, "envelope") else event
        trace_id = getattr(envelope, "trace_id", None)
        if trace_id:
            return str(trace_id)
    return None


def _transport_name(endpoint: Mapping[str, Any], metadata: Mapping[str, Any]) -> str:
    return str(metadata.get("mcpTransport") or endpoint.get("protocol") or "unknown")


def _enum_value(value: Any) -> Any:
    return value.value if isinstance(value, Enum) else value


OfflineModeBootOrchestrator = OfflineBootOrchestrator


__all__ = [
    "CapabilityDegradation",
    "DEFAULT_LOCAL_CACHE_SPECS",
    "LOCAL_TRANSPORT_PROTOCOLS",
    "LocalCacheSpec",
    "LocalCacheStatus",
    "NETWORK_TRANSPORT_TOKENS",
    "OfflineBootConfig",
    "OfflineBootOrchestrator",
    "OfflineBootResult",
    "OfflineCacheState",
    "OfflineCapabilityState",
    "OfflineModeBootOrchestrator",
    "OfflineTransportRecord",
    "OfflineTransportState",
    "VIRTUAL_OS_OFFLINE_COMPONENT",
    "boot_virtual_os_offline",
    "capability_requires_network",
    "capability_requires_transport",
    "capability_uses_local_cache",
    "discover_local_caches",
    "is_network_dependent_transport",
    "offline_capability_report",
    "offline_transport_records",
]
