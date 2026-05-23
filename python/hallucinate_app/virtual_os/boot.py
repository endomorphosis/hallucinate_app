"""Boot orchestration for the Hallucinate Virtual AI OS.

The boot layer composes the existing component registry, daemon launch
configuration, and observability contracts. It stays stdlib-only and keeps
daemon execution behind an injectable supervisor so tests can validate the boot
sequence without starting the real submodule services.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import os
import re
import socket
import subprocess
import time
import urllib.error
import urllib.request
from collections.abc import Mapping, MutableMapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from .contracts import (
    EventEnvelope,
    EventSeverity,
    HealthState,
    Metadata,
    ServiceStatus,
    utc_now,
)
from .events import (
    DashboardComponentHealth,
    DaemonHeartbeat,
    DashboardSnapshot,
    EventCategory,
    EventPublishRequest,
    MetricKind,
    MetricPoint,
    MetricUnit,
    TraceContext,
    dashboard_safe,
    dashboard_snapshot,
    heartbeat_event,
    structured_event,
)
from .registry import (
    ComponentAdapterRegistry,
    DEFAULT_COMPONENT_IDS,
    DEFAULT_CONFIG_PATH as DEFAULT_COMPONENT_CONFIG_PATH,
    discover_component_adapters,
    find_project_root,
    normalize_component_id,
)


DEFAULT_BASELINE_PATH = Path("config/submodule_integration_baseline.json")
DEFAULT_DAEMON_CONFIG_PATH = Path("config/virtual_ai_os_daemons.json")
VIRTUAL_OS_BOOT_COMPONENT = "virtual_os.boot"

_TEMPLATE_PATTERN = re.compile(r"\$\{([A-Za-z0-9_.-]+)\}")
_SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")


class BootError(Exception):
    """Base error raised by boot orchestration helpers."""


class BootConfigError(BootError):
    """Raised when boot configuration files are malformed."""


@dataclass(frozen=True)
class BaselineValidation:
    """One component SHA validation result."""

    component_id: str
    expected_sha: str | None
    current_sha: str | None
    rollback_sha: str | None = None
    source: str = "manifest"
    required: bool = True
    ok: bool = False
    message: str = ""
    metadata: Metadata = field(default_factory=dict)

    def dashboard_dict(self) -> dict[str, Any]:
        return {
            "component_id": self.component_id,
            "expected_sha": self.expected_sha,
            "current_sha": self.current_sha,
            "rollback_sha": self.rollback_sha,
            "source": self.source,
            "required": self.required,
            "ok": self.ok,
            "message": self.message,
            "metadata": dashboard_safe(self.metadata),
        }


@dataclass(frozen=True)
class DaemonDefinition:
    """Normalized daemon launch and health-check configuration."""

    daemon_id: str
    component_id: str
    title: str
    role: str = ""
    endpoint: Mapping[str, Any] = field(default_factory=dict)
    launch: Mapping[str, Any] = field(default_factory=dict)
    health_check: Mapping[str, Any] = field(default_factory=dict)
    restart_policy: Mapping[str, Any] = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)
    required: bool = True

    @property
    def endpoint_url(self) -> str | None:
        return self.endpoint.get("url")

    def dashboard_dict(self) -> dict[str, Any]:
        return {
            "daemon_id": self.daemon_id,
            "component_id": self.component_id,
            "title": self.title,
            "role": self.role,
            "endpoint": dashboard_safe(self.endpoint),
            "launch": {
                key: value
                for key, value in dashboard_safe(self.launch).items()
                if key != "env"
            },
            "health_check": dashboard_safe(self.health_check),
            "restart_policy": dashboard_safe(self.restart_policy),
            "metadata": dashboard_safe(self.metadata),
            "required": self.required,
        }


@dataclass(frozen=True)
class DaemonBootRecord:
    """Observed start and health state for one daemon during boot."""

    daemon_id: str
    component_id: str
    state: HealthState = HealthState.UNKNOWN
    status: str = "unknown"
    ok: bool = False
    required: bool = True
    pid: int | None = None
    endpoint: str | None = None
    message: str = ""
    error: str = ""
    started_at: datetime | None = None
    checked_at: datetime = field(default_factory=utc_now)
    metadata: Metadata = field(default_factory=dict)

    def service_status(self) -> ServiceStatus:
        return ServiceStatus(
            service_id=f"{self.daemon_id}.daemon",
            state=self.state,
            message=self.message or self.error,
            checked_at=self.checked_at,
            details={
                "daemon_id": self.daemon_id,
                "component_id": self.component_id,
                "status": self.status,
                "ok": self.ok,
                "required": self.required,
                "pid": self.pid,
                "endpoint": self.endpoint,
                "error": self.error,
                **dict(self.metadata),
            },
        )

    def dashboard_dict(self) -> dict[str, Any]:
        return {
            "daemon_id": self.daemon_id,
            "component_id": self.component_id,
            "state": _enum_value(self.state),
            "status": self.status,
            "ok": self.ok,
            "required": self.required,
            "pid": self.pid,
            "endpoint": self.endpoint,
            "message": self.message,
            "error": self.error,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "checked_at": self.checked_at.isoformat(),
            "metadata": dashboard_safe(self.metadata),
        }


@dataclass(frozen=True)
class BootConfig:
    """Configuration for a Virtual AI OS boot run."""

    project_root: str | Path | None = None
    component_config_path: str | Path | None = None
    baseline_path: str | Path | None = None
    daemon_config_path: str | Path | None = None
    component_ids: tuple[str, ...] = ()
    daemon_ids: tuple[str, ...] = ()
    required_daemon_ids: tuple[str, ...] = ()
    optional_daemon_ids: tuple[str, ...] = ()
    optional_component_ids: tuple[str, ...] = ()
    validate_baseline: bool = True
    start_daemons: bool = True
    wait_for_daemon_health: bool = False
    health_timeout_seconds: float = 15.0
    health_poll_interval_seconds: float = 0.1
    correlation_id: str | None = None
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True)
class BootSequenceResult:
    """Complete result of one OS boot sequence."""

    ok: bool
    health: HealthState
    registry: ComponentAdapterRegistry
    baseline: tuple[BaselineValidation, ...]
    components: tuple[DashboardComponentHealth, ...]
    daemons: tuple[DaemonBootRecord, ...]
    heartbeats: tuple[DaemonHeartbeat, ...]
    metrics: tuple[MetricPoint, ...]
    events: tuple[Any, ...]
    dashboard: DashboardSnapshot
    notices: tuple[str, ...]
    errors: tuple[str, ...]
    started_at: datetime
    completed_at: datetime
    metadata: Metadata = field(default_factory=dict)

    @property
    def dashboard_snapshot(self) -> DashboardSnapshot:
        """Alias used by callers that want the observability snapshot."""
        return self.dashboard

    def baseline_by_component(self) -> dict[str, BaselineValidation]:
        return {check.component_id: check for check in self.baseline}

    def daemon_by_id(self) -> dict[str, DaemonBootRecord]:
        return {daemon.daemon_id: daemon for daemon in self.daemons}

    def dashboard_dict(self) -> dict[str, Any]:
        payload = self.dashboard.dashboard_dict()
        payload["boot"] = {
            "ok": self.ok,
            "health": _enum_value(self.health),
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat(),
            "duration_ms": (self.completed_at - self.started_at).total_seconds() * 1000,
            "errors": list(self.errors),
            "notices": list(self.notices),
            "metadata": dashboard_safe(self.metadata),
        }
        payload["baseline"] = [check.dashboard_dict() for check in self.baseline]
        payload["daemon_boot"] = [daemon.dashboard_dict() for daemon in self.daemons]
        return payload


@runtime_checkable
class DaemonSupervisor(Protocol):
    """Daemon lifecycle surface consumed by the boot orchestrator."""

    def start_daemon(self, daemon: DaemonDefinition) -> Any:
        """Start one daemon and return a mapping, status, or ``DaemonBootRecord``."""


class LocalProcessDaemonSupervisor:
    """Small stdlib subprocess daemon supervisor used by default."""

    def __init__(self, *, project_root: str | Path | None = None) -> None:
        self.project_root = Path(project_root).resolve() if project_root else find_project_root()
        self.processes: dict[str, subprocess.Popen[Any]] = {}

    def start_daemon(self, daemon: DaemonDefinition) -> DaemonBootRecord:
        launch = dict(daemon.launch)
        command = str(launch.get("command") or "")
        if not command:
            raise BootConfigError(f"Daemon launch command is missing: {daemon.daemon_id}")

        args = [str(arg) for arg in launch.get("args", ())]
        cwd = Path(str(launch.get("cwd") or self.project_root))
        env = {
            **os.environ,
            **dict(launch.get("env") or {}),
        }
        process = subprocess.Popen(
            [command, *args],
            cwd=str(cwd),
            env=env,
            shell=bool(launch.get("shell", False)),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self.processes[daemon.daemon_id] = process
        return DaemonBootRecord(
            daemon_id=daemon.daemon_id,
            component_id=daemon.component_id,
            state=HealthState.STARTING,
            status="running",
            ok=True,
            required=daemon.required,
            pid=process.pid,
            endpoint=daemon.endpoint_url,
            message=f"Daemon process started: {daemon.daemon_id}",
            started_at=utc_now(),
            metadata={"supervisor": self.__class__.__name__},
        )

    def health_daemon(self, daemon: DaemonDefinition) -> DaemonBootRecord:
        process = self.processes.get(daemon.daemon_id)
        if process is None:
            return _daemon_error_record(daemon, "Daemon process was not started.")
        if process.poll() is not None:
            return _daemon_error_record(daemon, f"Daemon process exited with code {process.returncode}.")

        health_check = dict(daemon.health_check)
        if health_check.get("enabled", True) is False:
            return _daemon_health_record(daemon, HealthState.HEALTHY, ok=True, message="Health check disabled.")

        check_type = str(health_check.get("type") or "http")
        if check_type == "process":
            return _daemon_health_record(daemon, HealthState.HEALTHY, ok=True, message="Daemon process is running.")
        if check_type == "tcp":
            return self._tcp_health(daemon, health_check)
        return self._http_health(daemon, health_check)

    def stop_all(self, *, timeout_seconds: float = 5.0) -> None:
        for process in tuple(self.processes.values()):
            if process.poll() is None:
                process.terminate()
        deadline = time.monotonic() + timeout_seconds
        for process in tuple(self.processes.values()):
            remaining = max(0.0, deadline - time.monotonic())
            try:
                process.wait(timeout=remaining)
            except subprocess.TimeoutExpired:
                process.kill()
        self.processes.clear()

    def _http_health(self, daemon: DaemonDefinition, health_check: Mapping[str, Any]) -> DaemonBootRecord:
        url = _health_url(daemon.endpoint, health_check)
        timeout = float(health_check.get("timeoutMs", 2500)) / 1000
        expected = {int(status) for status in health_check.get("expectedStatuses", (200,))}
        request = urllib.request.Request(url, method=str(health_check.get("method") or "GET").upper())
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                status = int(response.status)
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            return _daemon_health_record(
                daemon,
                HealthState.UNHEALTHY,
                ok=False,
                message=f"Health check failed: {error}",
                error=str(error),
                metadata={"health_url": url},
            )
        ok = status in expected
        return _daemon_health_record(
            daemon,
            HealthState.HEALTHY if ok else HealthState.UNHEALTHY,
            ok=ok,
            message=f"Health check returned HTTP {status}.",
            metadata={"health_url": url, "status_code": status},
        )

    def _tcp_health(self, daemon: DaemonDefinition, health_check: Mapping[str, Any]) -> DaemonBootRecord:
        endpoint = dict(daemon.endpoint)
        timeout = float(health_check.get("timeoutMs", 2500)) / 1000
        try:
            with socket.create_connection((str(endpoint["host"]), int(endpoint["port"])), timeout=timeout):
                return _daemon_health_record(
                    daemon,
                    HealthState.HEALTHY,
                    ok=True,
                    message="TCP health check connected.",
                )
        except OSError as error:
            return _daemon_health_record(
                daemon,
                HealthState.UNHEALTHY,
                ok=False,
                message=f"TCP health check failed: {error}",
                error=str(error),
            )


class VirtualOSBootOrchestrator:
    """Coordinate registry discovery, baseline validation, daemon start, and health recording."""

    def __init__(
        self,
        config: BootConfig | None = None,
        *,
        daemon_supervisor: Any | None = None,
        event_bus: Any | None = None,
        registry: ComponentAdapterRegistry | None = None,
    ) -> None:
        self.config = config or BootConfig()
        self.project_root = Path(self.config.project_root).resolve() if self.config.project_root else find_project_root()
        self.daemon_supervisor = daemon_supervisor or LocalProcessDaemonSupervisor(project_root=self.project_root)
        self.event_bus = event_bus
        self.registry = registry

    def boot(self) -> BootSequenceResult:
        started_at = utc_now()
        trace = TraceContext(correlation_id=self.config.correlation_id)
        events: list[Any] = []
        metrics: list[MetricPoint] = []
        notices: list[str] = []
        errors: list[str] = []

        self._record_event(
            events,
            structured_event(
                "virtual_os.boot.started",
                source=VIRTUAL_OS_BOOT_COMPONENT,
                category=EventCategory.SYSTEM,
                trace=trace,
                payload={"project_root": str(self.project_root)},
                metadata=dict(self.config.metadata),
            ),
        )

        registry = self._initialize_registry()
        registry_health = registry.health()
        self._record_event(
            events,
            structured_event(
                "virtual_os.boot.registry_initialized",
                source=VIRTUAL_OS_BOOT_COMPONENT,
                category=EventCategory.SYSTEM,
                trace=trace,
                payload={
                    "component_ids": list(registry.component_ids()),
                    "component_count": len(registry),
                },
            ),
        )

        baseline = self._validate_baseline(registry_health) if self.config.validate_baseline else ()
        baseline_by_component = {check.component_id: check for check in baseline}
        self._record_event(
            events,
            structured_event(
                "virtual_os.boot.baseline_validated",
                source=VIRTUAL_OS_BOOT_COMPONENT,
                category=EventCategory.SYSTEM,
                trace=trace,
                payload={
                    "ok": all(check.ok or not check.required for check in baseline),
                    "checks": [check.dashboard_dict() for check in baseline],
                },
            ),
        )

        component_rows = self._component_health_rows(registry_health, baseline_by_component)
        for row in component_rows:
            if row.metadata.get("required", True) and row.state in {
                HealthState.UNHEALTHY,
                HealthState.DEGRADED,
                HealthState.UNKNOWN,
            }:
                errors.append(f"Required component is not healthy: {row.component} ({_enum_value(row.state)})")
            elif row.state in {HealthState.UNHEALTHY, HealthState.DEGRADED, HealthState.UNKNOWN}:
                notices.append(f"Optional component is degraded: {row.component} ({_enum_value(row.state)})")

        daemon_records: tuple[DaemonBootRecord, ...] = ()
        heartbeats: tuple[DaemonHeartbeat, ...] = ()
        if self.config.start_daemons:
            daemon_records, heartbeats = self._start_daemons(trace, events, notices, errors)

        metrics.extend(
            (
                MetricPoint(
                    name="virtual_os.boot.components",
                    value=float(len(component_rows)),
                    kind=MetricKind.GAUGE,
                    unit=MetricUnit.COUNT,
                    component=VIRTUAL_OS_BOOT_COMPONENT,
                    trace_id=trace.trace_id,
                    correlation_id=trace.correlation_id,
                ),
                MetricPoint(
                    name="virtual_os.boot.daemons",
                    value=float(len(daemon_records)),
                    kind=MetricKind.GAUGE,
                    unit=MetricUnit.COUNT,
                    component=VIRTUAL_OS_BOOT_COMPONENT,
                    trace_id=trace.trace_id,
                    correlation_id=trace.correlation_id,
                ),
            )
        )

        completed_at = utc_now()
        metrics.append(
            MetricPoint(
                name="virtual_os.boot.duration_ms",
                value=(completed_at - started_at).total_seconds() * 1000,
                kind=MetricKind.TIMER,
                unit=MetricUnit.MILLISECONDS,
                component=VIRTUAL_OS_BOOT_COMPONENT,
                trace_id=trace.trace_id,
                correlation_id=trace.correlation_id,
            )
        )

        snapshot = dashboard_snapshot(
            components=component_rows,
            daemons=heartbeats,
            metrics=metrics,
            events=events,
            notices=notices,
            metadata={
                "boot_started_at": started_at.isoformat(),
                "boot_completed_at": completed_at.isoformat(),
                "project_root": str(self.project_root),
                **dict(self.config.metadata),
            },
            generated_at=completed_at,
        )
        ok = not errors

        completion_event = structured_event(
            "virtual_os.boot.completed",
            source=VIRTUAL_OS_BOOT_COMPONENT,
            category=EventCategory.SYSTEM,
            severity=EventSeverity.INFO if ok else EventSeverity.ERROR,
            trace=trace,
            payload={
                "ok": ok,
                "health": _enum_value(snapshot.health),
                "errors": errors,
                "notices": notices,
            },
        )
        self._record_event(events, completion_event)

        snapshot = dashboard_snapshot(
            components=component_rows,
            daemons=heartbeats,
            metrics=metrics,
            events=events,
            notices=notices,
            metadata={
                "boot_started_at": started_at.isoformat(),
                "boot_completed_at": completed_at.isoformat(),
                "project_root": str(self.project_root),
                **dict(self.config.metadata),
            },
            generated_at=completed_at,
        )

        return BootSequenceResult(
            ok=ok,
            health=snapshot.health,
            registry=registry,
            baseline=baseline,
            components=component_rows,
            daemons=daemon_records,
            heartbeats=heartbeats,
            metrics=tuple(metrics),
            events=tuple(events),
            dashboard=snapshot,
            notices=tuple(notices),
            errors=tuple(errors),
            started_at=started_at,
            completed_at=completed_at,
            metadata=dict(self.config.metadata),
        )

    def _initialize_registry(self) -> ComponentAdapterRegistry:
        if self.registry is not None:
            return self.registry
        component_config_path = _resolve_path(
            self.project_root,
            self.config.component_config_path or DEFAULT_COMPONENT_CONFIG_PATH,
        )
        component_ids = self.config.component_ids or DEFAULT_COMPONENT_IDS
        self.registry = discover_component_adapters(
            project_root=self.project_root,
            config_path=component_config_path,
            component_ids=component_ids,
        )
        return self.registry

    def _validate_baseline(
        self,
        registry_health: Mapping[str, ServiceStatus],
    ) -> tuple[BaselineValidation, ...]:
        baseline_path = _resolve_path(self.project_root, self.config.baseline_path or DEFAULT_BASELINE_PATH)
        manifest = _load_baseline_manifest(baseline_path)
        optional_components = {normalize_component_id(component_id) for component_id in self.config.optional_component_ids}
        checks: list[BaselineValidation] = []

        for component_id, status in sorted(registry_health.items()):
            details = dict(status.details)
            manifest_entry = manifest.get(component_id)
            source = "manifest" if manifest_entry is not None else "registry"
            expected_sha = None
            rollback_sha = None
            if manifest_entry is not None:
                expected_sha = _optional_string(manifest_entry.get("currentSha"))
                rollback_sha = _optional_string(manifest_entry.get("rollbackSha"))
            else:
                expected_sha = _optional_string(details.get("expected_sha"))

            current_sha = _optional_string(details.get("current_sha"))
            required = component_id not in optional_components

            if not expected_sha:
                ok = not required
                message = "No expected SHA is available for optional component." if ok else "No expected SHA is available."
            elif not _SHA_PATTERN.match(expected_sha):
                ok = False
                message = f"Expected SHA is not a 40-character hex digest: {expected_sha}"
            elif current_sha != expected_sha:
                ok = False
                message = f"Current SHA {current_sha or '<missing>'} does not match expected {expected_sha}."
            else:
                ok = True
                message = f"Component SHA matches {source} baseline."

            checks.append(
                BaselineValidation(
                    component_id=component_id,
                    expected_sha=expected_sha,
                    current_sha=current_sha,
                    rollback_sha=rollback_sha,
                    source=source,
                    required=required,
                    ok=ok,
                    message=message,
                    metadata={
                        "baseline_path": str(baseline_path),
                        "health_state": _enum_value(status.state),
                    },
                )
            )
        return tuple(checks)

    def _component_health_rows(
        self,
        registry_health: Mapping[str, ServiceStatus],
        baseline: Mapping[str, BaselineValidation],
    ) -> tuple[DashboardComponentHealth, ...]:
        optional_components = {normalize_component_id(component_id) for component_id in self.config.optional_component_ids}
        rows: list[DashboardComponentHealth] = []
        for component_id, status in sorted(registry_health.items()):
            check = baseline.get(component_id)
            required = component_id not in optional_components
            state = _coerce_health_state(status.state)
            message = status.message
            if check is not None and not check.ok:
                state = HealthState.UNHEALTHY if required else HealthState.DEGRADED
                message = check.message
            elif not required and state in {HealthState.UNHEALTHY, HealthState.STOPPED, HealthState.UNKNOWN}:
                state = HealthState.DEGRADED
            rows.append(
                DashboardComponentHealth(
                    component=component_id,
                    state=state,
                    message=message,
                    metadata={
                        "required": required,
                        "service_id": status.service_id,
                        "details": dict(status.details),
                        "baseline": check.dashboard_dict() if check else None,
                    },
                )
            )
        return tuple(rows)

    def _start_daemons(
        self,
        trace: TraceContext,
        events: list[Any],
        notices: list[str],
        errors: list[str],
    ) -> tuple[tuple[DaemonBootRecord, ...], tuple[DaemonHeartbeat, ...]]:
        definitions = load_daemon_definitions(
            _resolve_path(self.project_root, self.config.daemon_config_path or DEFAULT_DAEMON_CONFIG_PATH),
            project_root=self.project_root,
        )
        selected_ids = {_normalize_daemon_id(daemon_id) for daemon_id in self.config.daemon_ids} or {
            daemon.daemon_id for daemon in definitions
        }
        optional_daemons = {_normalize_daemon_id(daemon_id) for daemon_id in self.config.optional_daemon_ids}
        optional_components = {normalize_component_id(component_id) for component_id in self.config.optional_component_ids}
        if self.config.required_daemon_ids:
            required_ids = {_normalize_daemon_id(daemon_id) for daemon_id in self.config.required_daemon_ids}
        else:
            required_ids = {daemon.daemon_id for daemon in definitions if daemon.daemon_id not in optional_daemons}

        selected = tuple(daemon for daemon in definitions if daemon.daemon_id in selected_ids)
        records: list[DaemonBootRecord] = []
        heartbeats: list[DaemonHeartbeat] = []

        for sequence, daemon in enumerate(selected, start=1):
            required = (
                daemon.daemon_id in required_ids
                and daemon.daemon_id not in optional_daemons
                and daemon.component_id not in optional_components
            )
            daemon = replace(daemon, required=required)
            record = self._start_one_daemon(daemon)
            if record.ok and self._has_daemon_health_method():
                record = self._check_daemon_health(daemon, record)

            if self.config.wait_for_daemon_health and record.ok:
                record = self._wait_for_daemon_health(daemon, record)
            if not required and not record.ok and record.state == HealthState.UNHEALTHY:
                record = replace(record, state=HealthState.DEGRADED)

            records.append(record)
            heartbeat = self._heartbeat_from_record(record, sequence=sequence, trace=trace)
            heartbeats.append(heartbeat)
            self._record_heartbeat(heartbeat, events)

            self._record_event(
                events,
                structured_event(
                    "virtual_os.boot.daemon_started",
                    source=VIRTUAL_OS_BOOT_COMPONENT,
                    category=EventCategory.DAEMON,
                    severity=EventSeverity.INFO if record.ok else EventSeverity.ERROR,
                    trace=trace,
                    subject=heartbeat.resource(),
                    payload=record.dashboard_dict(),
                ),
            )

            if required and not record.ok:
                errors.append(f"Required daemon failed during boot: {record.daemon_id} ({record.error or record.message})")
            elif not required and not record.ok:
                notices.append(f"Optional daemon failed during boot: {record.daemon_id} ({record.error or record.message})")

        return tuple(records), tuple(heartbeats)

    def _start_one_daemon(self, daemon: DaemonDefinition) -> DaemonBootRecord:
        try:
            start = _call_supervisor(self.daemon_supervisor, ("start_daemon", "start"), daemon)
            return _coerce_daemon_record(start, daemon, default_status="running")
        except Exception as error:
            return _daemon_error_record(daemon, str(error))

    def _check_daemon_health(self, daemon: DaemonDefinition, prior: DaemonBootRecord) -> DaemonBootRecord:
        try:
            health = _call_supervisor(
                self.daemon_supervisor,
                ("health_daemon", "check_daemon_health", "health", "status"),
                daemon,
                prior,
            )
        except TypeError:
            health = _call_supervisor(
                self.daemon_supervisor,
                ("health_daemon", "check_daemon_health", "health", "status"),
                daemon,
            )
        except Exception as error:
            return replace(
                prior,
                state=HealthState.UNHEALTHY,
                ok=False,
                error=str(error),
                message=f"Daemon health check failed: {error}",
                checked_at=utc_now(),
            )
        if health is None:
            return prior
        return _merge_daemon_records(
            prior,
            _coerce_daemon_record(health, daemon, default_status=prior.status),
        )

    def _wait_for_daemon_health(self, daemon: DaemonDefinition, prior: DaemonBootRecord) -> DaemonBootRecord:
        if not self._has_daemon_health_method():
            return prior
        deadline = time.monotonic() + max(0.0, self.config.health_timeout_seconds)
        record = prior
        while True:
            record = self._check_daemon_health(daemon, record)
            if record.ok and record.state == HealthState.HEALTHY:
                return record
            if time.monotonic() >= deadline:
                return record
            time.sleep(max(0.01, self.config.health_poll_interval_seconds))

    def _has_daemon_health_method(self) -> bool:
        return any(
            hasattr(self.daemon_supervisor, method_name)
            for method_name in ("health_daemon", "check_daemon_health", "health", "status")
        )

    def _heartbeat_from_record(
        self,
        record: DaemonBootRecord,
        *,
        sequence: int,
        trace: TraceContext,
    ) -> DaemonHeartbeat:
        return DaemonHeartbeat(
            daemon_id=record.daemon_id,
            component=record.component_id,
            state=record.state,
            sequence=sequence,
            pid=record.pid,
            endpoint=record.endpoint,
            service_status=record.service_status(),
            last_error=record.error,
            trace_id=trace.trace_id,
            correlation_id=trace.correlation_id,
            metadata={
                "boot_status": record.status,
                "boot_ok": record.ok,
                "required": record.required,
                **dict(record.metadata),
            },
        )

    def _record_heartbeat(self, heartbeat: DaemonHeartbeat, events: list[Any]) -> None:
        event = heartbeat_event(heartbeat, source=VIRTUAL_OS_BOOT_COMPONENT)
        events.append(event)
        if self.event_bus is not None and hasattr(self.event_bus, "emit_heartbeat"):
            _resolve_maybe_awaitable(self.event_bus.emit_heartbeat(heartbeat))
        self._publish_event(event.envelope)

    def _record_event(self, events: list[Any], event: Any) -> None:
        events.append(event)
        envelope = event.envelope if hasattr(event, "envelope") else event
        if isinstance(envelope, EventEnvelope):
            self._publish_event(envelope)

    def _publish_event(self, envelope: EventEnvelope) -> None:
        if self.event_bus is None:
            return
        if hasattr(self.event_bus, "publish_event"):
            request = EventPublishRequest(event=envelope)
            _resolve_maybe_awaitable(self.event_bus.publish_event(request))
            return
        if hasattr(self.event_bus, "publish"):
            _resolve_maybe_awaitable(self.event_bus.publish(envelope))


def boot_virtual_os(
    config: BootConfig | None = None,
    *,
    daemon_supervisor: Any | None = None,
    event_bus: Any | None = None,
    registry: ComponentAdapterRegistry | None = None,
) -> BootSequenceResult:
    """Run the Virtual AI OS boot sequence and return its health snapshot."""
    return VirtualOSBootOrchestrator(
        config,
        daemon_supervisor=daemon_supervisor,
        event_bus=event_bus,
        registry=registry,
    ).boot()


def load_daemon_definitions(
    config_path: str | Path | None = None,
    *,
    project_root: str | Path | None = None,
) -> tuple[DaemonDefinition, ...]:
    """Load and normalize daemon definitions from the OS daemon config."""
    root = Path(project_root).resolve() if project_root else find_project_root()
    path = _resolve_path(root, config_path or DEFAULT_DAEMON_CONFIG_PATH)
    if not path.exists():
        raise BootConfigError(f"Daemon config does not exist: {path}")
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, Mapping):
        raise BootConfigError("Daemon config must be a JSON object.")
    daemons = payload.get("daemons")
    if not isinstance(daemons, Sequence) or isinstance(daemons, (str, bytes)) or not daemons:
        raise BootConfigError("Daemon config must define a non-empty daemons array.")

    defaults = dict(payload.get("defaults") or {})
    definitions = []
    for index, daemon in enumerate(daemons):
        if not isinstance(daemon, Mapping):
            raise BootConfigError(f"Daemon entry at index {index} must be an object.")
        definitions.append(_normalize_daemon_definition(daemon, defaults, root, index))
    return tuple(definitions)


def _normalize_daemon_definition(
    daemon: Mapping[str, Any],
    defaults: Mapping[str, Any],
    project_root: Path,
    index: int,
) -> DaemonDefinition:
    daemon_id = _required_string(daemon.get("id"), f"daemons[{index}].id")
    component_id = normalize_component_id(_required_string(daemon.get("componentId"), f"daemons[{index}].componentId"))
    title = _required_string(daemon.get("title"), f"daemons[{index}].title")
    metadata = dict(daemon.get("metadata") or {})

    endpoint = {
        "protocol": "http",
        "host": defaults.get("host", "127.0.0.1"),
        **dict(daemon.get("endpoint") or {}),
    }
    if not endpoint.get("port"):
        raise BootConfigError(f"Daemon endpoint port is required: {daemon_id}")
    endpoint["port"] = int(endpoint["port"])
    endpoint["path"] = endpoint.get("path") or "/"
    endpoint["url"] = endpoint.get("url") or _endpoint_url(endpoint)

    context = {
        "id": daemon_id,
        "componentId": component_id,
        "title": title,
        "projectRoot": str(project_root),
        "host": endpoint["host"],
        "port": endpoint["port"],
        "protocol": endpoint["protocol"],
        "endpoint": endpoint,
        "metadata": metadata,
    }
    launch_defaults = dict(defaults.get("launch") or {})
    launch_raw = {**launch_defaults, **dict(daemon.get("launch") or {})}
    launch_env = {
        **dict(defaults.get("env") or {}),
        **dict(launch_raw.get("env") or {}),
    }
    launch_raw["env"] = launch_env
    launch = _render_templates(launch_raw, context)
    if not launch.get("command"):
        raise BootConfigError(f"Daemon launch command is required: {daemon_id}")
    cwd = Path(str(launch.get("cwd") or "."))
    launch["cwd"] = str(cwd if cwd.is_absolute() else project_root / cwd)
    launch["args"] = list(launch.get("args") or ())
    launch["shell"] = bool(launch.get("shell", False))
    launch["stdio"] = launch.get("stdio", "pipe")

    health_defaults = dict(defaults.get("healthCheck") or {})
    health_check = _render_templates({**health_defaults, **dict(daemon.get("healthCheck") or {})}, context)
    health_check["enabled"] = health_check.get("enabled", True) is not False
    health_check["type"] = str(health_check.get("type") or _infer_health_check_type(str(endpoint["protocol"])))
    health_check["method"] = str(health_check.get("method") or "GET").upper()
    health_check["path"] = health_check.get("path") or "/health"
    health_check["timeoutMs"] = int(health_check.get("timeoutMs", 2500))
    health_check["intervalMs"] = int(health_check.get("intervalMs", 30000))
    health_check["expectedStatuses"] = [int(status) for status in health_check.get("expectedStatuses", (200,))]

    restart_defaults = dict(defaults.get("restartPolicy") or {})
    restart_policy = {**restart_defaults, **dict(daemon.get("restartPolicy") or {})}

    return DaemonDefinition(
        daemon_id=daemon_id,
        component_id=component_id,
        title=title,
        role=str(daemon.get("role") or ""),
        endpoint=endpoint,
        launch=launch,
        health_check=health_check,
        restart_policy=restart_policy,
        metadata=metadata,
        required=bool(daemon.get("required", metadata.get("required", True))),
    )


def _load_baseline_manifest(path: Path) -> dict[str, Mapping[str, Any]]:
    if not path.exists():
        raise BootConfigError(f"Baseline manifest does not exist: {path}")
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    baseline = payload.get("baseline") if isinstance(payload, Mapping) else None
    if not isinstance(baseline, Mapping):
        raise BootConfigError("Baseline manifest must contain a baseline object.")
    return {
        normalize_component_id(str(component_id)): entry
        for component_id, entry in baseline.items()
        if isinstance(entry, Mapping)
    }


def _call_supervisor(supervisor: Any, method_names: Sequence[str], *args: Any) -> Any:
    for method_name in method_names:
        method = getattr(supervisor, method_name, None)
        if method is not None:
            return _resolve_maybe_awaitable(method(*args))
    raise BootError(f"Daemon supervisor does not implement any of: {', '.join(method_names)}")


def _coerce_daemon_record(value: Any, daemon: DaemonDefinition, *, default_status: str) -> DaemonBootRecord:
    if isinstance(value, DaemonBootRecord):
        return replace(
            value,
            daemon_id=value.daemon_id or daemon.daemon_id,
            component_id=value.component_id or daemon.component_id,
            required=daemon.required,
            endpoint=value.endpoint or daemon.endpoint_url,
        )
    if isinstance(value, ServiceStatus):
        state = _coerce_health_state(value.state)
        return DaemonBootRecord(
            daemon_id=daemon.daemon_id,
            component_id=daemon.component_id,
            state=state,
            status=state.value,
            ok=state in {HealthState.HEALTHY, HealthState.DEGRADED, HealthState.STARTING},
            required=daemon.required,
            endpoint=daemon.endpoint_url,
            message=value.message,
            checked_at=value.checked_at,
            metadata=dict(value.details),
        )
    if not isinstance(value, Mapping):
        return _daemon_health_record(
            daemon,
            HealthState.UNKNOWN,
            ok=False,
            message=f"Unsupported daemon supervisor result: {type(value).__name__}",
        )

    data = dict(value)
    health = data.get("health") if isinstance(data.get("health"), Mapping) else {}
    state = _coerce_health_state(
        data.get("state")
        or data.get("health_state")
        or health.get("state")
        or _state_from_status(str(data.get("status") or default_status), bool(data.get("ok", True)))
    )
    explicit_ok = data.get("ok", health.get("ok") if isinstance(health, Mapping) else None)
    ok = bool(explicit_ok) if explicit_ok is not None else state in {
        HealthState.HEALTHY,
        HealthState.DEGRADED,
        HealthState.STARTING,
    }
    error = str(data.get("error") or health.get("error") or "")
    if error and explicit_ok is None:
        ok = False
    status = str(data.get("status") or state.value)
    started_at = data.get("started_at") or data.get("startedAt")
    checked_at = data.get("checked_at") or data.get("checkedAt")
    return DaemonBootRecord(
        daemon_id=str(data.get("id") or data.get("daemon_id") or daemon.daemon_id),
        component_id=normalize_component_id(str(data.get("componentId") or data.get("component_id") or daemon.component_id)),
        state=state,
        status=status,
        ok=ok,
        required=daemon.required,
        pid=_optional_int(data.get("pid")),
        endpoint=_coerce_endpoint(data.get("endpoint") or health.get("endpoint") or daemon.endpoint_url),
        message=str(data.get("message") or health.get("message") or ""),
        error=error,
        started_at=_coerce_datetime(started_at),
        checked_at=_coerce_datetime(checked_at) or utc_now(),
        metadata={
            key: dashboard_safe(item)
            for key, item in data.items()
            if key
            not in {
                "id",
                "daemon_id",
                "componentId",
                "component_id",
                "state",
                "health_state",
                "status",
                "ok",
                "pid",
                "endpoint",
                "message",
                "error",
                "started_at",
                "startedAt",
                "checked_at",
                "checkedAt",
                "health",
            }
        },
    )


def _merge_daemon_records(prior: DaemonBootRecord, observed: DaemonBootRecord) -> DaemonBootRecord:
    return replace(
        observed,
        pid=observed.pid if observed.pid is not None else prior.pid,
        endpoint=observed.endpoint or prior.endpoint,
        started_at=observed.started_at or prior.started_at,
        required=prior.required,
        metadata={**dict(prior.metadata), **dict(observed.metadata)},
    )


def _daemon_error_record(daemon: DaemonDefinition, message: str) -> DaemonBootRecord:
    return DaemonBootRecord(
        daemon_id=daemon.daemon_id,
        component_id=daemon.component_id,
        state=HealthState.UNHEALTHY,
        status="failed",
        ok=False,
        required=daemon.required,
        endpoint=daemon.endpoint_url,
        message=message,
        error=message,
    )


def _daemon_health_record(
    daemon: DaemonDefinition,
    state: HealthState,
    *,
    ok: bool,
    message: str,
    error: str = "",
    metadata: Metadata | None = None,
) -> DaemonBootRecord:
    return DaemonBootRecord(
        daemon_id=daemon.daemon_id,
        component_id=daemon.component_id,
        state=state,
        status=state.value,
        ok=ok,
        required=daemon.required,
        endpoint=daemon.endpoint_url,
        message=message,
        error=error,
        metadata=dict(metadata or {}),
    )


def _resolve_maybe_awaitable(value: Any) -> Any:
    if inspect.isawaitable(value):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(value)
        raise BootError("Boot orchestration cannot synchronously wait while an event loop is running.")
    return value


def _resolve_path(root: Path, value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else root / path


def _required_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BootConfigError(f"Required string field is missing: {field}")
    return value.strip()


def _optional_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _coerce_datetime(value: Any) -> datetime | None:
    if value is None or isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _coerce_health_state(value: Any) -> HealthState:
    if isinstance(value, HealthState):
        return value
    normalized = str(value or "").strip().lower()
    aliases = {
        "ok": HealthState.HEALTHY,
        "running": HealthState.STARTING,
        "started": HealthState.STARTING,
        "failed": HealthState.UNHEALTHY,
        "crashed": HealthState.UNHEALTHY,
        "stopped": HealthState.STOPPED,
    }
    if normalized in aliases:
        return aliases[normalized]
    try:
        return HealthState(normalized)
    except ValueError:
        return HealthState.UNKNOWN


def _normalize_daemon_id(value: str) -> str:
    return normalize_component_id(str(value))


def _enum_value(value: Any) -> Any:
    return value.value if isinstance(value, Enum) else value


def _coerce_endpoint(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, Mapping):
        if value.get("url"):
            return str(value["url"])
        try:
            return _endpoint_url(value)
        except (KeyError, TypeError, ValueError):
            return str(dashboard_safe(value))
    return str(value)


def _state_from_status(status: str, ok: bool) -> HealthState:
    normalized = status.strip().lower()
    if normalized in {"healthy", "degraded", "starting", "unhealthy", "stopped", "unknown"}:
        return _coerce_health_state(normalized)
    if normalized in {"running", "started"}:
        return HealthState.STARTING if ok else HealthState.UNHEALTHY
    if normalized in {"failed", "crashed", "error"}:
        return HealthState.UNHEALTHY
    return HealthState.UNKNOWN


def _endpoint_url(endpoint: Mapping[str, Any]) -> str:
    protocol = str(endpoint.get("protocol") or "http")
    host = str(endpoint.get("host") or "127.0.0.1")
    port = int(endpoint.get("port"))
    path = _url_path(str(endpoint.get("path") or "/"))
    if protocol in {"http", "https"}:
        return f"{protocol}://{host}:{port}{path}"
    return f"{protocol}://{host}:{port}"


def _health_url(endpoint: Mapping[str, Any], health_check: Mapping[str, Any]) -> str:
    if health_check.get("url"):
        return str(health_check["url"])
    protocol = str(endpoint.get("protocol") or "http")
    host = str(endpoint.get("host") or "127.0.0.1")
    port = int(endpoint.get("port"))
    path = _url_path(str(health_check.get("path") or endpoint.get("path") or "/"))
    return f"{protocol}://{host}:{port}{path}"


def _url_path(value: str) -> str:
    return value if value.startswith("/") else f"/{value}"


def _infer_health_check_type(protocol: str) -> str:
    return "http" if protocol in {"http", "https"} else "tcp"


def _render_templates(value: Any, context: Mapping[str, Any]) -> Any:
    if isinstance(value, str):
        return _TEMPLATE_PATTERN.sub(lambda match: str(_read_context(context, match.group(1))), value)
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_render_templates(item, context) for item in value]
    if isinstance(value, MutableMapping) or isinstance(value, Mapping):
        return {key: _render_templates(item, context) for key, item in value.items()}
    return value


def _read_context(context: Mapping[str, Any], key: str) -> Any:
    cursor: Any = context
    for part in key.split("."):
        if isinstance(cursor, Mapping):
            cursor = cursor.get(part)
        else:
            cursor = getattr(cursor, part, None)
        if cursor is None:
            raise BootConfigError(f"Unknown daemon config template variable: {key}")
    return cursor


BootSequenceOrchestrator = VirtualOSBootOrchestrator


__all__ = [
    "BaselineValidation",
    "BootConfig",
    "BootConfigError",
    "BootError",
    "BootSequenceOrchestrator",
    "BootSequenceResult",
    "DEFAULT_BASELINE_PATH",
    "DEFAULT_DAEMON_CONFIG_PATH",
    "DaemonBootRecord",
    "DaemonDefinition",
    "DaemonSupervisor",
    "LocalProcessDaemonSupervisor",
    "VIRTUAL_OS_BOOT_COMPONENT",
    "VirtualOSBootOrchestrator",
    "boot_virtual_os",
    "load_daemon_definitions",
]
