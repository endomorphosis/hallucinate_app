#!/usr/bin/env python3
"""Virtual AI OS service lifecycle CLI."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shlex
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PYTHON_ROOT = ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from hallucinate_app.virtual_os.boot import (  # noqa: E402
    DEFAULT_BASELINE_PATH,
    DEFAULT_DAEMON_CONFIG_PATH,
    BootConfig,
    BootConfigError,
    DaemonBootRecord,
    DaemonDefinition,
    boot_virtual_os,
    load_daemon_definitions,
)
from hallucinate_app.virtual_os.contracts import HealthState, utc_now  # noqa: E402
from hallucinate_app.virtual_os.events import dashboard_safe  # noqa: E402
from hallucinate_app.virtual_os.registry import DEFAULT_CONFIG_PATH as DEFAULT_COMPONENT_CONFIG_PATH  # noqa: E402


SCHEMA_VERSION = "virtual-ai-os-cli.v1"
STATE_SCHEMA_VERSION = "virtual-ai-os-cli-state.v1"
DEFAULT_TEST_MATRIX_PATH = Path("config/virtual_ai_os_test_matrix.json")


class CLIError(Exception):
    """Raised for expected command-line failures."""


class DaemonStateStore:
    """Small JSON state file for CLI-started daemon processes."""

    def __init__(self, path: str | Path, *, project_root: str | Path) -> None:
        self.path = Path(path)
        self.project_root = Path(project_root).resolve()

    def load(self) -> dict[str, Any]:
        if not self.path.exists():
            return self._empty()
        with self.path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, Mapping):
            raise CLIError(f"Daemon state file must contain a JSON object: {self.path}")
        payload = dict(payload)
        payload.setdefault("schemaVersion", STATE_SCHEMA_VERSION)
        payload.setdefault("projectRoot", str(self.project_root))
        payload.setdefault("daemons", {})
        return payload

    def save(self, payload: Mapping[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "schemaVersion": STATE_SCHEMA_VERSION,
            "projectRoot": str(self.project_root),
            "updatedAt": utc_now().isoformat(),
            "daemons": dict(payload.get("daemons") or {}),
        }
        temp_path = self.path.with_suffix(self.path.suffix + ".tmp")
        with temp_path.open("w", encoding="utf-8") as handle:
            json.dump(dashboard_safe(data), handle, indent=2, sort_keys=True)
            handle.write("\n")
        temp_path.replace(self.path)

    def daemon(self, daemon_id: str) -> dict[str, Any] | None:
        entry = self.load().get("daemons", {}).get(daemon_id)
        return dict(entry) if isinstance(entry, Mapping) else None

    def update_daemon(self, daemon_id: str, entry: Mapping[str, Any]) -> None:
        payload = self.load()
        daemons = dict(payload.get("daemons") or {})
        daemons[daemon_id] = dict(entry)
        payload["daemons"] = daemons
        self.save(payload)

    def _empty(self) -> dict[str, Any]:
        return {
            "schemaVersion": STATE_SCHEMA_VERSION,
            "projectRoot": str(self.project_root),
            "updatedAt": None,
            "daemons": {},
        }


class LifecycleDaemonSupervisor:
    """Persistent process supervisor used by the CLI boot/restart commands."""

    def __init__(
        self,
        *,
        project_root: str | Path,
        state_store: DaemonStateStore,
        log_dir: str | Path | None = None,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.state_store = state_store
        self.log_dir = Path(log_dir) if log_dir else state_store.path.parent / "logs"

    def start_daemon(self, daemon: DaemonDefinition) -> Mapping[str, Any]:
        existing = self.state_store.daemon(daemon.daemon_id)
        existing_pid = _entry_pid(existing)
        if existing_pid is not None and _process_running(existing_pid, existing):
            status = self._status_mapping(daemon, existing)
            return {
                **status,
                "status": "running",
                "ok": True,
                "message": f"Daemon already running: {daemon.daemon_id}",
            }

        launch = dict(daemon.launch)
        command = str(launch.get("command") or "")
        if not command:
            raise BootConfigError(f"Daemon launch command is missing: {daemon.daemon_id}")

        args = [str(arg) for arg in launch.get("args") or ()]
        cwd = Path(str(launch.get("cwd") or self.project_root))
        if not cwd.is_absolute():
            cwd = self.project_root / cwd
        if not cwd.exists():
            raise CLIError(f"Daemon working directory does not exist: {daemon.daemon_id}: {cwd}")

        env = {**os.environ, **{str(key): str(value) for key, value in dict(launch.get("env") or {}).items()}}
        self.log_dir.mkdir(parents=True, exist_ok=True)
        log_path = self.log_dir / f"{daemon.daemon_id}.log"
        stdout = log_path.open("ab")
        try:
            process = subprocess.Popen(
                _popen_args(command, args, shell=bool(launch.get("shell", False))),
                cwd=str(cwd),
                env=env,
                shell=bool(launch.get("shell", False)),
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        finally:
            stdout.close()

        entry = {
            "daemon_id": daemon.daemon_id,
            "component_id": daemon.component_id,
            "status": "running",
            "pid": process.pid,
            "endpoint": daemon.endpoint_url,
            "started_at": utc_now().isoformat(),
            "stopped_at": None,
            "command": command,
            "args": args,
            "cwd": str(cwd),
            "log_path": str(log_path),
            "last_error": "",
        }
        self.state_store.update_daemon(daemon.daemon_id, entry)
        return {
            "id": daemon.daemon_id,
            "componentId": daemon.component_id,
            "status": "running",
            "ok": True,
            "pid": process.pid,
            "endpoint": daemon.endpoint,
            "message": f"Daemon process started: {daemon.daemon_id}",
            "startedAt": entry["started_at"],
            "logPath": str(log_path),
        }

    def health_daemon(self, daemon: DaemonDefinition, prior: DaemonBootRecord | None = None) -> Mapping[str, Any]:
        return self.inspect_daemon(daemon, prior=prior)

    def inspect_daemon(
        self,
        daemon: DaemonDefinition,
        *,
        prior: DaemonBootRecord | None = None,
    ) -> dict[str, Any]:
        entry = self.state_store.daemon(daemon.daemon_id)
        pid = _entry_pid(entry)
        running = pid is not None and _process_running(pid, entry)
        base = self._status_mapping(daemon, entry)
        base["pid"] = pid if running else None
        base["running"] = running
        if not running:
            return {
                **base,
                "status": "stopped",
                "state": HealthState.STOPPED.value,
                "ok": False,
                "message": "Daemon is not running.",
            }

        health_check = dict(daemon.health_check)
        if health_check.get("enabled", True) is False or health_check.get("type") == "process":
            return {
                **base,
                "status": "running",
                "state": HealthState.HEALTHY.value,
                "ok": True,
                "message": "Daemon process is running.",
            }
        if health_check.get("type") == "tcp":
            return {**base, **_tcp_health(daemon, health_check)}
        return {**base, **_http_health(daemon, health_check)}

    def stop_daemon(self, daemon: DaemonDefinition, *, reason: str = "requested", timeout_seconds: float = 5.0) -> dict[str, Any]:
        entry = self.state_store.daemon(daemon.daemon_id) or {}
        pid = _entry_pid(entry)
        running = pid is not None and _process_running(pid, entry)
        if running:
            _terminate_process(pid, entry=entry, timeout_seconds=timeout_seconds)
            running = _process_running(pid, entry)

        status = "failed" if running else "stopped"
        last_error = f"Process did not stop before timeout: {pid}" if running else ""
        updated = {
            **entry,
            "daemon_id": daemon.daemon_id,
            "component_id": daemon.component_id,
            "status": status,
            "pid": pid if running else None,
            "endpoint": daemon.endpoint_url,
            "stopped_at": utc_now().isoformat(),
            "stop_reason": reason,
            "last_error": last_error,
        }
        self.state_store.update_daemon(daemon.daemon_id, updated)
        return {
            "id": daemon.daemon_id,
            "componentId": daemon.component_id,
            "status": status,
            "state": HealthState.UNHEALTHY.value if running else HealthState.STOPPED.value,
            "ok": not running,
            "pid": pid if running else None,
            "endpoint": daemon.endpoint_url,
            "message": last_error or "Daemon stopped.",
            "reason": reason,
        }

    def _status_mapping(self, daemon: DaemonDefinition, entry: Mapping[str, Any] | None) -> dict[str, Any]:
        entry = dict(entry or {})
        return {
            "id": daemon.daemon_id,
            "componentId": daemon.component_id,
            "title": daemon.title,
            "required": daemon.required,
            "endpoint": daemon.endpoint_url,
            "stateFile": str(self.state_store.path),
            "startedAt": entry.get("started_at"),
            "stoppedAt": entry.get("stopped_at"),
            "logPath": entry.get("log_path"),
            "lastError": entry.get("last_error") or "",
        }


def command_status(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    context = _context(args)
    result = _verify_boot_context(args, start_daemons=False)
    definitions = _load_definitions(context, args)
    supervisor = LifecycleDaemonSupervisor(project_root=context["project_root"], state_store=context["state_store"])
    daemons = [supervisor.inspect_daemon(daemon) for daemon in _select_daemons(definitions, args.daemon)]
    payload = _base_payload("status", context)
    payload.update(
        {
            "ok": bool(result.ok),
            "health": _daemon_rollup_state(daemons),
            "boot": _boot_summary(result),
            "daemons": daemons,
        }
    )
    return 0, payload


def command_boot(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    context = _context(args)
    supervisor = LifecycleDaemonSupervisor(project_root=context["project_root"], state_store=context["state_store"])
    result = _run_boot(args, start_daemons=not args.no_start, supervisor=supervisor)
    payload = _base_payload("boot", context)
    payload.update(
        {
            "ok": bool(result.ok),
            "health": _enum_value(result.health),
            "dry_run": bool(args.no_start),
            "state_file": str(context["state_store"].path),
            "boot": result.dashboard_dict(),
        }
    )
    return (0 if result.ok else 1), payload


def command_stop(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    context = _context(args)
    definitions = _load_definitions(context, args)
    supervisor = LifecycleDaemonSupervisor(project_root=context["project_root"], state_store=context["state_store"])
    selected = _select_daemons(definitions, args.daemon)
    stopped = [
        supervisor.stop_daemon(daemon, reason=args.reason, timeout_seconds=args.timeout)
        for daemon in selected
    ]
    ok = all(item.get("ok") for item in stopped)
    payload = _base_payload("stop", context)
    payload.update({"ok": ok, "health": _daemon_rollup_state(stopped), "daemons": stopped})
    return (0 if ok else 1), payload


def command_restart(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    context = _context(args)
    definitions = _load_definitions(context, args)
    supervisor = LifecycleDaemonSupervisor(project_root=context["project_root"], state_store=context["state_store"])
    selected = _select_daemons(definitions, args.daemon)
    stopped = [
        supervisor.stop_daemon(daemon, reason=args.reason, timeout_seconds=args.timeout)
        for daemon in selected
    ]
    result = _run_boot(args, start_daemons=True, supervisor=supervisor)
    ok = all(item.get("ok") for item in stopped) and bool(result.ok)
    payload = _base_payload("restart", context)
    payload.update(
        {
            "ok": ok,
            "health": _enum_value(result.health),
            "stopped": stopped,
            "boot": result.dashboard_dict(),
        }
    )
    return (0 if ok else 1), payload


def command_verify(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    context = _context(args)
    result = _verify_boot_context(args, start_daemons=False)
    definitions = _select_daemons(_load_definitions(context, args), args.daemon)
    payload = _base_payload("verify", context)
    payload.update(
        {
            "ok": bool(result.ok),
            "health": _enum_value(result.health),
            "boot": _boot_summary(result),
            "daemon_config": {
                "path": str(_resolve_path(context["project_root"], args.daemon_config or DEFAULT_DAEMON_CONFIG_PATH)),
                "daemon_count": len(definitions),
                "daemons": [daemon.dashboard_dict() for daemon in definitions],
            },
        }
    )
    return (0 if result.ok else 1), payload


def command_test_matrix(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    project_root = _project_root(args.project_root)
    matrix_path = _resolve_path(project_root, args.matrix)
    with matrix_path.open("r", encoding="utf-8") as handle:
        matrix = json.load(handle)
    suites = [dict(suite) for suite in matrix.get("testSuites", [])]
    if args.required_only:
        suites = [suite for suite in suites if suite.get("requiredBeforeMerge")]
    if args.priority:
        priorities = set(args.priority)
        suites = [suite for suite in suites if suite.get("priority") in priorities]
    if args.category:
        categories = set(args.category)
        suites = [suite for suite in suites if suite.get("category") in categories]

    payload = _base_payload("test-matrix", {"project_root": project_root, "state_store": None})
    payload.update(
        {
            "ok": True,
            "matrix_path": str(matrix_path),
            "summary": _matrix_summary(suites),
            "testSuites": suites,
        }
    )
    return 0, payload


def command_rollback(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    project_root = _project_root(args.project_root)
    baseline_path = _resolve_path(project_root, args.baseline or DEFAULT_BASELINE_PATH)
    baseline = _load_baseline(baseline_path)
    selected = set(args.component or ())
    targets = []
    for component_id, entry in sorted(baseline.items()):
        if selected and component_id not in selected:
            continue
        target = str(entry.get("rollbackSha") or "")
        current = str(entry.get("currentSha") or "")
        if not target:
            raise CLIError(f"Rollback SHA missing for component: {component_id}")
        targets.append(
            {
                "component_id": component_id,
                "path": component_id,
                "current_sha": current,
                "rollback_sha": target,
                "applied": False,
            }
        )

    if args.apply:
        for target in targets:
            _checkout_submodule(project_root, target["path"], target["rollback_sha"])
            target["applied"] = True

    payload = _base_payload("rollback", {"project_root": project_root, "state_store": None})
    payload.update(
        {
            "ok": True,
            "dry_run": not args.apply,
            "baseline_path": str(baseline_path),
            "targets": targets,
        }
    )
    return 0, payload


def _context(args: argparse.Namespace) -> dict[str, Any]:
    project_root = _project_root(args.project_root)
    state_path = Path(args.state_file) if args.state_file else _default_state_path(project_root)
    if not state_path.is_absolute():
        state_path = project_root / state_path
    return {
        "project_root": project_root,
        "state_store": DaemonStateStore(state_path, project_root=project_root),
    }


def _project_root(value: str | None) -> Path:
    return Path(value).resolve() if value else ROOT


def _default_state_path(project_root: Path) -> Path:
    digest = hashlib.sha256(str(project_root).encode("utf-8")).hexdigest()[:12]
    return Path(tempfile.gettempdir()) / f"hallucinate-virtual-os-{digest}" / "state.json"


def _run_boot(
    args: argparse.Namespace,
    *,
    start_daemons: bool,
    supervisor: LifecycleDaemonSupervisor,
) -> Any:
    context = _context(args)
    return boot_virtual_os(
        BootConfig(
            project_root=context["project_root"],
            component_config_path=args.component_config,
            baseline_path=args.baseline,
            daemon_config_path=args.daemon_config,
            component_ids=tuple(args.component or ()),
            daemon_ids=tuple(args.daemon or ()),
            validate_baseline=not args.no_baseline,
            start_daemons=start_daemons,
            wait_for_daemon_health=bool(getattr(args, "wait", False)),
            health_timeout_seconds=float(getattr(args, "health_timeout", 15.0)),
            health_poll_interval_seconds=float(getattr(args, "poll_interval", 0.1)),
            correlation_id=getattr(args, "correlation_id", None),
            metadata={"cli_command": getattr(args, "command", "")},
        ),
        daemon_supervisor=supervisor,
    )


def _verify_boot_context(args: argparse.Namespace, *, start_daemons: bool) -> Any:
    context = _context(args)
    supervisor = LifecycleDaemonSupervisor(project_root=context["project_root"], state_store=context["state_store"])
    return _run_boot(args, start_daemons=start_daemons, supervisor=supervisor)


def _load_definitions(context: Mapping[str, Any], args: argparse.Namespace) -> tuple[DaemonDefinition, ...]:
    return load_daemon_definitions(args.daemon_config or DEFAULT_DAEMON_CONFIG_PATH, project_root=context["project_root"])


def _select_daemons(definitions: Sequence[DaemonDefinition], daemon_ids: Sequence[str] | None) -> tuple[DaemonDefinition, ...]:
    if not daemon_ids:
        return tuple(definitions)
    wanted = set(daemon_ids)
    selected = tuple(daemon for daemon in definitions if daemon.daemon_id in wanted)
    missing = sorted(wanted - {daemon.daemon_id for daemon in selected})
    if missing:
        raise CLIError(f"Unknown daemon id(s): {', '.join(missing)}")
    return selected


def _base_payload(command: str, context: Mapping[str, Any]) -> dict[str, Any]:
    state_store = context.get("state_store")
    payload = {
        "schema_version": SCHEMA_VERSION,
        "command": command,
        "generated_at": utc_now().isoformat(),
        "project_root": str(context["project_root"]),
    }
    if state_store is not None:
        payload["state_file"] = str(state_store.path)
    return payload


def _boot_summary(result: Any) -> dict[str, Any]:
    return {
        "ok": bool(result.ok),
        "health": _enum_value(result.health),
        "errors": list(result.errors),
        "notices": list(result.notices),
        "components": [component.dashboard_dict() for component in result.components],
        "baseline": [check.dashboard_dict() for check in result.baseline],
    }


def _matrix_summary(suites: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    by_priority: dict[str, int] = {}
    by_category: dict[str, int] = {}
    required = 0
    for suite in suites:
        priority = str(suite.get("priority") or "unknown")
        category = str(suite.get("category") or "unknown")
        by_priority[priority] = by_priority.get(priority, 0) + 1
        by_category[category] = by_category.get(category, 0) + 1
        if suite.get("requiredBeforeMerge"):
            required += 1
    return {
        "suite_count": len(suites),
        "required_before_merge": required,
        "by_priority": by_priority,
        "by_category": by_category,
    }


def _daemon_rollup_state(daemons: Sequence[Mapping[str, Any]]) -> str:
    if not daemons:
        return HealthState.UNKNOWN.value
    states = {str(daemon.get("state") or daemon.get("status") or HealthState.UNKNOWN.value) for daemon in daemons}
    if HealthState.UNHEALTHY.value in states:
        return HealthState.UNHEALTHY.value
    if HealthState.DEGRADED.value in states:
        return HealthState.DEGRADED.value
    if any(daemon.get("ok") for daemon in daemons):
        return HealthState.HEALTHY.value
    if states == {HealthState.STOPPED.value} or states == {"stopped"}:
        return HealthState.STOPPED.value
    return HealthState.UNKNOWN.value


def _load_baseline(path: Path) -> dict[str, Mapping[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    baseline = payload.get("baseline") if isinstance(payload, Mapping) else None
    if not isinstance(baseline, Mapping):
        raise CLIError(f"Baseline file must contain a baseline object: {path}")
    return {
        str(component_id): dict(entry)
        for component_id, entry in baseline.items()
        if isinstance(entry, Mapping)
    }


def _checkout_submodule(project_root: Path, submodule_path: str, sha: str) -> None:
    cwd = (project_root / submodule_path).resolve()
    try:
        cwd.relative_to(project_root)
    except ValueError as error:
        raise CLIError(f"Refusing to checkout outside repository: {cwd}") from error
    _run_checked(["git", "submodule", "update", "--init", submodule_path], cwd=project_root)
    _run_checked(["git", "checkout", sha], cwd=cwd)


def _run_checked(cmd: Sequence[str], *, cwd: Path) -> str:
    result = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, check=False)
    if result.returncode != 0:
        stderr = result.stderr.strip()
        raise CLIError(f"Command failed: {' '.join(cmd)}{': ' + stderr if stderr else ''}")
    return result.stdout.strip()


def _http_health(daemon: DaemonDefinition, health_check: Mapping[str, Any]) -> dict[str, Any]:
    started = time.monotonic()
    url = _health_url(daemon.endpoint, health_check)
    expected = {int(status) for status in health_check.get("expectedStatuses", (200,))}
    request = urllib.request.Request(url, method=str(health_check.get("method") or "GET").upper())
    try:
        with urllib.request.urlopen(request, timeout=float(health_check.get("timeoutMs", 2500)) / 1000) as response:
            status_code = int(response.status)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return {
            "status": "running",
            "state": HealthState.UNHEALTHY.value,
            "ok": False,
            "message": f"Health check failed: {error}",
            "error": str(error),
            "health": {
                "ok": False,
                "state": HealthState.UNHEALTHY.value,
                "endpoint": url,
                "latencyMs": round((time.monotonic() - started) * 1000, 3),
                "error": str(error),
            },
        }
    ok = status_code in expected
    return {
        "status": "running",
        "state": HealthState.HEALTHY.value if ok else HealthState.UNHEALTHY.value,
        "ok": ok,
        "message": f"Health check returned HTTP {status_code}.",
        "health": {
            "ok": ok,
            "state": HealthState.HEALTHY.value if ok else HealthState.UNHEALTHY.value,
            "endpoint": url,
            "latencyMs": round((time.monotonic() - started) * 1000, 3),
            "statusCode": status_code,
        },
    }


def _tcp_health(daemon: DaemonDefinition, health_check: Mapping[str, Any]) -> dict[str, Any]:
    started = time.monotonic()
    endpoint = dict(daemon.endpoint)
    try:
        with socket.create_connection(
            (str(endpoint["host"]), int(endpoint["port"])),
            timeout=float(health_check.get("timeoutMs", 2500)) / 1000,
        ):
            return {
                "status": "running",
                "state": HealthState.HEALTHY.value,
                "ok": True,
                "message": "TCP health check connected.",
                "health": {
                    "ok": True,
                    "state": HealthState.HEALTHY.value,
                    "endpoint": daemon.endpoint_url,
                    "latencyMs": round((time.monotonic() - started) * 1000, 3),
                },
            }
    except OSError as error:
        return {
            "status": "running",
            "state": HealthState.UNHEALTHY.value,
            "ok": False,
            "message": f"TCP health check failed: {error}",
            "error": str(error),
            "health": {
                "ok": False,
                "state": HealthState.UNHEALTHY.value,
                "endpoint": daemon.endpoint_url,
                "latencyMs": round((time.monotonic() - started) * 1000, 3),
                "error": str(error),
            },
        }


def _health_url(endpoint: Mapping[str, Any], health_check: Mapping[str, Any]) -> str:
    if health_check.get("url"):
        return str(health_check["url"])
    protocol = str(endpoint.get("protocol") or "http")
    host = str(endpoint.get("host") or "127.0.0.1")
    port = int(endpoint.get("port"))
    path = str(health_check.get("path") or endpoint.get("path") or "/")
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{protocol}://{host}:{port}{path}"


def _entry_pid(entry: Mapping[str, Any] | None) -> int | None:
    if not entry:
        return None
    pid = entry.get("pid")
    if pid in {None, ""}:
        return None
    try:
        return int(pid)
    except (TypeError, ValueError):
        return None


def _process_running(pid: int, entry: Mapping[str, Any] | None = None) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    if _process_is_zombie(pid):
        return False
    return _process_matches_entry(pid, entry)


def _terminate_process(pid: int, *, entry: Mapping[str, Any] | None = None, timeout_seconds: float) -> None:
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return

    deadline = time.monotonic() + max(0.0, timeout_seconds)
    while time.monotonic() < deadline:
        if not _process_running(pid, entry):
            return
        time.sleep(0.05)
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        return


def _process_matches_entry(pid: int, entry: Mapping[str, Any] | None) -> bool:
    if not entry or os.name != "posix":
        return True
    cmdline_path = Path("/proc") / str(pid) / "cmdline"
    if not cmdline_path.exists():
        return True
    try:
        raw = cmdline_path.read_bytes()
    except OSError:
        return True
    observed = [part.decode("utf-8", errors="replace") for part in raw.split(b"\0") if part]
    if not observed:
        return True
    expected_command = str(entry.get("command") or "")
    expected_args = [str(arg) for arg in entry.get("args") or ()]
    if expected_command and Path(observed[0]).name != Path(expected_command).name:
        return False
    return observed[1 : 1 + len(expected_args)] == expected_args


def _process_is_zombie(pid: int) -> bool:
    if os.name != "posix":
        return False
    stat_path = Path("/proc") / str(pid) / "stat"
    try:
        stat = stat_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False
    fields = stat.split()
    return len(fields) > 2 and fields[2] == "Z"


def _popen_args(command: str, args: Sequence[str], *, shell: bool) -> str | list[str]:
    if shell:
        return " ".join(shlex.quote(item) for item in (command, *args))
    return [command, *args]


def _resolve_path(root: Path, value: str | Path | None) -> Path:
    path = Path(value or ".")
    return path if path.is_absolute() else root / path


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    lifecycle = argparse.ArgumentParser(add_help=False)
    lifecycle.add_argument("--project-root")
    lifecycle.add_argument("--state-file")
    lifecycle.add_argument("--component-config", default=str(DEFAULT_COMPONENT_CONFIG_PATH))
    lifecycle.add_argument("--baseline", default=str(DEFAULT_BASELINE_PATH))
    lifecycle.add_argument("--daemon-config", default=str(DEFAULT_DAEMON_CONFIG_PATH))
    lifecycle.add_argument("--component", action="append", default=[])
    lifecycle.add_argument("--daemon", action="append", default=[])
    lifecycle.add_argument("--no-baseline", action="store_true")
    lifecycle.add_argument("--correlation-id")

    status = subparsers.add_parser("status", parents=[lifecycle], help="Report OS and daemon lifecycle status as JSON.")
    status.set_defaults(func=command_status)

    boot = subparsers.add_parser("boot", parents=[lifecycle], help="Boot Virtual AI OS services and emit JSON.")
    boot.add_argument("--no-start", action="store_true", help="Validate boot inputs without starting daemon processes.")
    boot.add_argument("--wait", action="store_true", help="Wait for daemon health checks to pass.")
    boot.add_argument("--health-timeout", type=float, default=15.0)
    boot.add_argument("--poll-interval", type=float, default=0.1)
    boot.set_defaults(func=command_boot)

    stop = subparsers.add_parser("stop", parents=[lifecycle], help="Stop CLI-managed Virtual AI OS daemons.")
    stop.add_argument("--reason", default="requested")
    stop.add_argument("--timeout", type=float, default=5.0)
    stop.set_defaults(func=command_stop)

    restart = subparsers.add_parser("restart", parents=[lifecycle], help="Restart CLI-managed Virtual AI OS daemons.")
    restart.add_argument("--reason", default="requested")
    restart.add_argument("--timeout", type=float, default=5.0)
    restart.add_argument("--wait", action="store_true", help="Wait for daemon health checks to pass after restart.")
    restart.add_argument("--health-timeout", type=float, default=15.0)
    restart.add_argument("--poll-interval", type=float, default=0.1)
    restart.set_defaults(func=command_restart)

    verify = subparsers.add_parser("verify", parents=[lifecycle], help="Validate registry, baseline, and daemon configuration.")
    verify.set_defaults(func=command_verify)

    matrix = subparsers.add_parser("test-matrix", help="Print Virtual AI OS test matrix JSON.")
    matrix.add_argument("--project-root")
    matrix.add_argument("--matrix", default=str(DEFAULT_TEST_MATRIX_PATH))
    matrix.add_argument("--required-only", action="store_true")
    matrix.add_argument("--priority", action="append", default=[])
    matrix.add_argument("--category", action="append", default=[])
    matrix.set_defaults(func=command_test_matrix)

    rollback = subparsers.add_parser("rollback", help="Plan or apply submodule rollback SHAs as JSON.")
    rollback.add_argument("--project-root")
    rollback.add_argument("--baseline", default=str(DEFAULT_BASELINE_PATH))
    rollback.add_argument("--component", action="append", default=[])
    rollback.add_argument("--apply", action="store_true", help="Apply rollback SHAs with git checkout.")
    rollback.set_defaults(func=command_rollback)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        code, payload = args.func(args)
    except Exception as error:
        payload = {
            "schema_version": SCHEMA_VERSION,
            "command": getattr(args, "command", ""),
            "generated_at": utc_now().isoformat(),
            "ok": False,
            "error": str(error),
            "error_type": error.__class__.__name__,
        }
        code = 1
    print(json.dumps(dashboard_safe(payload), indent=2, sort_keys=True))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
