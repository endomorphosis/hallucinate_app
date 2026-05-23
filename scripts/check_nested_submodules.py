#!/usr/bin/env python3
"""
Verify top-level and nested submodule pin ownership for the Virtual AI OS.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BASELINE_FILE = ROOT / "config" / "submodule_integration_baseline.json"
COMPONENTS_FILE = ROOT / "config" / "virtual_ai_os_components.json"
SCHEMA_VERSION = "nested-submodule-policy.v1"

MCP_PLUS_PLUS_COMPONENT_ID = "mcp_plus_plus"
MCP_PLUS_PLUS_EXCEPTION_PATHS = {
    "ipfs_accelerate_py/ipfs_accelerate_py/mcplusplus",
}
MCP_PLUS_PLUS_ALLOWED_URLS = {
    "https://github.com/endomorphosis/mcp-plus-plus",
    "https://github.com/endomorphosis/mcp-plus-plus.git",
}

IGNORED_DIR_NAMES = {
    ".git",
    ".hg",
    ".mypy_cache",
    ".next",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "htmlcov",
    "node_modules",
    "site-packages",
    "venv",
}
IGNORED_DIR_PREFIXES = ("archive", "backup", "reorganization_backup")

SUBMODULE_HEADER_RE = re.compile(r'^\[submodule\s+"(?P<name>.+)"\]$')
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


@dataclass(frozen=True)
class SubmoduleEntry:
    name: str
    path: str
    declared_path: str
    url: str
    branch: str | None
    source_gitmodules: str
    owner_path: str

    @property
    def is_top_level(self) -> bool:
        return self.owner_path == "."

    @property
    def classification(self) -> str:
        if self.is_top_level:
            return "top-level-integration-pin"
        return "nested-reference-pin"


def display_path(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(path)


def is_ignored_dir(path: Path) -> bool:
    name = path.name
    return name in IGNORED_DIR_NAMES or any(name.startswith(prefix) for prefix in IGNORED_DIR_PREFIXES)


def normalize_url(url: str) -> str:
    normalized = url.strip().rstrip("/").lower()
    normalized = normalized.replace("git@github.com:", "https://github.com/")
    return normalized


def root_relative_submodule_path(root: Path, owner: Path, declared_path: str) -> str:
    absolute = (owner / declared_path).resolve()
    try:
        return absolute.relative_to(root.resolve()).as_posix()
    except ValueError:
        return declared_path


def parse_gitmodules_file(gitmodules: Path, root: Path) -> list[SubmoduleEntry]:
    entries: list[SubmoduleEntry] = []
    current: dict[str, str] | None = None
    owner = gitmodules.parent.resolve()
    owner_path = "." if owner == root.resolve() else display_path(owner, root)

    def flush_current() -> None:
        if current is None:
            return
        declared_path = current.get("path", "").strip()
        if not declared_path:
            return
        entries.append(
            SubmoduleEntry(
                name=current.get("name", declared_path).strip(),
                path=root_relative_submodule_path(root, owner, declared_path),
                declared_path=declared_path,
                url=current.get("url", "").strip(),
                branch=current.get("branch"),
                source_gitmodules=display_path(gitmodules, root),
                owner_path=owner_path,
            )
        )

    for raw_line in gitmodules.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        header = SUBMODULE_HEADER_RE.match(line)
        if header:
            flush_current()
            current = {"name": header.group("name")}
            continue
        if current is not None and "=" in line:
            key, value = line.split("=", 1)
            current[key.strip()] = value.strip()
    flush_current()
    return entries


def discover_gitmodules(root: Path) -> tuple[list[SubmoduleEntry], list[dict[str, Any]]]:
    root = root.resolve()
    entries: list[SubmoduleEntry] = []
    issues: list[dict[str, Any]] = []
    root_gitmodules = root / ".gitmodules"
    if root_gitmodules.exists():
        entries.extend(parse_gitmodules_file(root_gitmodules, root))
    else:
        issues.append(
            make_issue(
                "root_gitmodules_missing",
                "Root .gitmodules file is missing.",
                path=".gitmodules",
                action="Restore root .gitmodules or disable the nested submodule policy gate for this checkout.",
            )
        )

    for current_dir, dirnames, filenames in os.walk(root):
        current_path = Path(current_dir)
        dirnames[:] = [
            dirname
            for dirname in sorted(dirnames)
            if not is_ignored_dir(current_path / dirname)
        ]
        if current_path == root:
            continue
        if ".gitmodules" in filenames:
            entries.extend(parse_gitmodules_file(current_path / ".gitmodules", root))
    return entries, issues


def load_json_file(path: Path) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if not path.exists():
        return None, make_issue(
            "json_file_missing",
            f"Required JSON file is missing: {path.name}.",
            path=str(path),
            action="Restore the policy input file before running the verifier.",
        )
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        return None, make_issue(
            "json_file_unreadable",
            f"Could not read {path.name}: {error}",
            path=str(path),
            action="Fix the JSON syntax or file permissions.",
        )
    if not isinstance(payload, dict):
        return None, make_issue(
            "json_file_not_object",
            f"{path.name} must contain a JSON object.",
            path=str(path),
            action="Rewrite the file as an object with the expected policy keys.",
        )
    return payload, None


def load_baseline(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    payload, issue = load_json_file(path)
    if issue is not None:
        return {}, [issue]
    baseline = payload.get("baseline", {})
    if not isinstance(baseline, dict):
        return {}, [
            make_issue(
                "baseline_not_object",
                "submodule_integration_baseline.json must contain an object at baseline.",
                path=str(path),
                action="Set baseline to an object keyed by top-level submodule path.",
            )
        ]
    return baseline, []


def load_components(path: Path) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    payload, issue = load_json_file(path)
    if issue is not None:
        return {}, [issue]
    raw_components = payload.get("components", [])
    if not isinstance(raw_components, list):
        return {}, [
            make_issue(
                "components_not_list",
                "virtual_ai_os_components.json must contain a list at components.",
                path=str(path),
                action="Set components to a list of component objects.",
            )
        ]
    components: dict[str, dict[str, Any]] = {}
    issues: list[dict[str, Any]] = []
    for index, item in enumerate(raw_components):
        if not isinstance(item, dict):
            issues.append(
                make_issue(
                    "component_not_object",
                    f"Component entry {index} is not an object.",
                    path=str(path),
                    action="Replace the entry with an object containing id and path.",
                )
            )
            continue
        component_id = str(item.get("id", "")).strip()
        if not component_id:
            issues.append(
                make_issue(
                    "component_missing_id",
                    f"Component entry {index} is missing id.",
                    path=str(path),
                    action="Add a stable component id.",
                )
            )
            continue
        components[component_id] = item
    return components, issues


def valid_sha(value: Any) -> bool:
    return isinstance(value, str) and SHA_RE.match(value) is not None


def make_issue(
    code: str,
    message: str,
    *,
    path: str | None = None,
    source: str | None = None,
    action: str,
) -> dict[str, Any]:
    issue = {
        "code": code,
        "message": message,
        "action": action,
    }
    if path is not None:
        issue["path"] = path
    if source is not None:
        issue["source"] = source
    return issue


def entry_to_json(entry: SubmoduleEntry) -> dict[str, Any]:
    return {
        "name": entry.name,
        "path": entry.path,
        "declaredPath": entry.declared_path,
        "url": entry.url,
        "branch": entry.branch,
        "sourceGitmodules": entry.source_gitmodules,
        "ownerPath": entry.owner_path,
        "classification": entry.classification,
    }


def verify_top_level_baseline(
    top_level_entries: list[SubmoduleEntry],
    baseline: dict[str, Any],
) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for entry in top_level_entries:
        baseline_entry = baseline.get(entry.path)
        if baseline_entry is None:
            issues.append(
                make_issue(
                    "top_level_missing_baseline",
                    f"Top-level submodule {entry.path} is missing from the integration baseline.",
                    path=entry.path,
                    source=entry.source_gitmodules,
                    action="Add currentSha and rollbackSha for this top-level submodule to config/submodule_integration_baseline.json.",
                )
            )
            continue
        if not isinstance(baseline_entry, dict):
            issues.append(
                make_issue(
                    "top_level_baseline_not_object",
                    f"Baseline entry for {entry.path} must be an object.",
                    path=entry.path,
                    action="Replace the baseline entry with currentSha and rollbackSha fields.",
                )
            )
            continue
        for key in ("currentSha", "rollbackSha"):
            if not valid_sha(baseline_entry.get(key)):
                issues.append(
                    make_issue(
                        "top_level_baseline_invalid_sha",
                        f"Baseline entry for {entry.path} has an invalid {key}.",
                        path=entry.path,
                        action=f"Set {key} to a 40-character lowercase Git SHA.",
                    )
                )
    return issues


def verify_baseline_scope(
    baseline: dict[str, Any],
    top_level_entries: list[SubmoduleEntry],
    nested_entries: list[SubmoduleEntry],
) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    top_level_paths = {entry.path for entry in top_level_entries}
    nested_by_path = {entry.path: entry for entry in nested_entries}
    for baseline_path in sorted(baseline):
        if baseline_path in top_level_paths:
            continue
        nested_entry = nested_by_path.get(baseline_path)
        if nested_entry is not None:
            issues.append(
                make_issue(
                    "nested_reference_in_baseline",
                    f"Nested reference pin {baseline_path} is listed in the top-level integration baseline.",
                    path=baseline_path,
                    source=nested_entry.source_gitmodules,
                    action="Remove this nested reference from config/submodule_integration_baseline.json; the parent submodule owns that pin.",
                )
            )
        else:
            issues.append(
                make_issue(
                    "baseline_unknown_submodule",
                    f"Baseline entry {baseline_path} is not declared in root or nested .gitmodules files.",
                    path=baseline_path,
                    action="Remove the stale baseline entry or add the corresponding top-level root .gitmodules entry.",
                )
            )
    return issues


def verify_nested_component_scope(
    components: dict[str, dict[str, Any]],
    nested_entries: list[SubmoduleEntry],
) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    nested_paths = {entry.path for entry in nested_entries}
    allowed_paths = MCP_PLUS_PLUS_EXCEPTION_PATHS
    for component_id, component in sorted(components.items()):
        component_path = str(component.get("path", "")).strip()
        if component_path in nested_paths and component_path not in allowed_paths:
            issues.append(
                make_issue(
                    "unapproved_nested_component",
                    f"Nested reference pin {component_path} is exposed as component {component_id} without an approved exception.",
                    path=component_path,
                    action="Keep nested references parent-owned or add an ADR-backed exception before listing them as Virtual AI OS components.",
                )
            )
    return issues


def verify_mcp_plus_plus_exception(
    baseline: dict[str, Any],
    components: dict[str, dict[str, Any]],
    nested_entries: list[SubmoduleEntry],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    matching_entries = [
        entry
        for entry in nested_entries
        if entry.path in MCP_PLUS_PLUS_EXCEPTION_PATHS
    ]
    component = components.get(MCP_PLUS_PLUS_COMPONENT_ID)
    component_path = str(component.get("path", "")).strip() if isinstance(component, dict) else None
    component_sha = component.get("sha") if isinstance(component, dict) else None

    if not matching_entries:
        issues.append(
            make_issue(
                "mcp_exception_missing_nested_submodule",
                "MCP++ exception path is not declared by a nested .gitmodules file.",
                path=sorted(MCP_PLUS_PLUS_EXCEPTION_PATHS)[0],
                action="Ensure ipfs_accelerate_py/.gitmodules declares ipfs_accelerate_py/mcplusplus.",
            )
        )
    else:
        for entry in matching_entries:
            if normalize_url(entry.url) not in MCP_PLUS_PLUS_ALLOWED_URLS:
                issues.append(
                    make_issue(
                        "mcp_exception_unexpected_url",
                        f"MCP++ exception path {entry.path} points at an unexpected URL.",
                        path=entry.path,
                        source=entry.source_gitmodules,
                        action="Use the accessible endomorphosis/Mcp-Plus-Plus repository URL for the nested reference.",
                    )
                )

    if not isinstance(component, dict):
        issues.append(
            make_issue(
                "mcp_exception_missing_component",
                "MCP++ exception is missing from the Virtual AI OS component inventory.",
                path=sorted(MCP_PLUS_PLUS_EXCEPTION_PATHS)[0],
                action="Add a mcp_plus_plus component with path and sha to config/virtual_ai_os_components.json.",
            )
        )
    else:
        if component_path not in MCP_PLUS_PLUS_EXCEPTION_PATHS:
            issues.append(
                make_issue(
                    "mcp_exception_component_path",
                    f"MCP++ component path must be one of {sorted(MCP_PLUS_PLUS_EXCEPTION_PATHS)}.",
                    path=component_path or MCP_PLUS_PLUS_COMPONENT_ID,
                    action="Set the mcp_plus_plus component path to the approved nested exception path.",
                )
            )
        if not valid_sha(component_sha):
            issues.append(
                make_issue(
                    "mcp_exception_component_sha",
                    "MCP++ component must carry a 40-character SHA in the component inventory.",
                    path=component_path or MCP_PLUS_PLUS_COMPONENT_ID,
                    action="Set mcp_plus_plus.sha to the nested reference commit expected by this integration.",
                )
            )

    for path in MCP_PLUS_PLUS_EXCEPTION_PATHS:
        if path in baseline:
            issues.append(
                make_issue(
                    "mcp_exception_in_baseline",
                    "MCP++ is a nested reference exception and must not be listed in the top-level baseline.",
                    path=path,
                    action="Remove the MCP++ nested path from config/submodule_integration_baseline.json.",
                )
            )

    exception_report = {
        "componentId": MCP_PLUS_PLUS_COMPONENT_ID,
        "allowedPaths": sorted(MCP_PLUS_PLUS_EXCEPTION_PATHS),
        "declaredPaths": [entry.path for entry in matching_entries],
        "componentPath": component_path,
        "componentSha": component_sha,
        "declaredUrls": [entry.url for entry in matching_entries],
    }
    return exception_report, issues


def build_report(
    root: Path,
    baseline_file: Path | None = None,
    components_file: Path | None = None,
) -> dict[str, Any]:
    root = root.resolve()
    baseline_path = (baseline_file or root / "config" / "submodule_integration_baseline.json").resolve()
    components_path = (components_file or root / "config" / "virtual_ai_os_components.json").resolve()

    entries, discovery_issues = discover_gitmodules(root)
    baseline, baseline_issues = load_baseline(baseline_path)
    components, component_issues = load_components(components_path)

    top_level_entries = sorted(
        [entry for entry in entries if entry.is_top_level],
        key=lambda entry: entry.path,
    )
    nested_entries = sorted(
        [entry for entry in entries if not entry.is_top_level],
        key=lambda entry: (entry.path, entry.source_gitmodules),
    )

    issues: list[dict[str, Any]] = []
    issues.extend(discovery_issues)
    issues.extend(baseline_issues)
    issues.extend(component_issues)
    if not baseline_issues:
        issues.extend(verify_top_level_baseline(top_level_entries, baseline))
        issues.extend(verify_baseline_scope(baseline, top_level_entries, nested_entries))
    if not component_issues:
        issues.extend(verify_nested_component_scope(components, nested_entries))
    exception_report, exception_issues = verify_mcp_plus_plus_exception(
        baseline,
        components,
        nested_entries,
    )
    issues.extend(exception_issues)

    return {
        "schema_version": SCHEMA_VERSION,
        "ok": not issues,
        "root": str(root),
        "policy": {
            "topLevelClassification": "top-level-integration-pin",
            "nestedClassification": "nested-reference-pin",
            "baselineOwnership": "root .gitmodules entries only",
            "mcpPlusPlusException": exception_report,
        },
        "summary": {
            "topLevelSubmoduleCount": len(top_level_entries),
            "nestedSubmoduleCount": len(nested_entries),
            "baselineEntryCount": len(baseline),
            "componentCount": len(components),
            "issueCount": len(issues),
        },
        "topLevelSubmodules": [entry_to_json(entry) for entry in top_level_entries],
        "nestedSubmodules": [entry_to_json(entry) for entry in nested_entries],
        "issues": issues,
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify Virtual AI OS top-level and nested submodule pin policy."
    )
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root to inspect.")
    parser.add_argument(
        "--baseline-file",
        type=Path,
        default=None,
        help="Submodule integration baseline JSON. Defaults to config/submodule_integration_baseline.json under --root.",
    )
    parser.add_argument(
        "--components-file",
        type=Path,
        default=None,
        help="Virtual AI OS components JSON. Defaults to config/virtual_ai_os_components.json under --root.",
    )
    parser.add_argument("--output", type=Path, default=None, help="Write the JSON report to this path.")
    parser.add_argument(
        "--warn-only",
        action="store_true",
        help="Always exit zero after emitting JSON, even when policy issues are found.",
    )
    return parser.parse_args(argv)


def resolve_input_path(root: Path, path: Path | None, default_name: str) -> Path:
    if path is None:
        return root / default_name
    if path.is_absolute():
        return path
    return root / path


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    root = args.root.resolve()
    baseline_file = resolve_input_path(root, args.baseline_file, "config/submodule_integration_baseline.json")
    components_file = resolve_input_path(root, args.components_file, "config/virtual_ai_os_components.json")

    report = build_report(root, baseline_file=baseline_file, components_file=components_file)
    rendered = json.dumps(report, indent=2, sort_keys=True)
    if args.output is not None:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)

    if report["ok"] or args.warn_only:
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
