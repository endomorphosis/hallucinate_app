#!/usr/bin/env python3
"""
Detect package dependency drift across Virtual AI OS component submodules.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python < 3.11 fallback.
    tomllib = None


ROOT = Path(__file__).resolve().parents[1]

NODE_DEPENDENCY_SECTIONS = (
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
)

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

NAME_RE = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\[[^\]]+\])?\s*(.*)$")
EGG_RE = re.compile(r"[#&]egg=([A-Za-z0-9_.-]+)")
VERSION_RE = re.compile(r"^\s*v?(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?")
PYTHON_OPERATOR_RE = re.compile(r"(===|==|~=|!=|<=|>=|<|>)\s*([^,\s]+)")
NODE_OPERATOR_RE = re.compile(r"(<=|>=|<|>|=)\s*([vV]?\d+(?:\.(?:\d+|x|X|\*)){0,2})")


Version = tuple[int, int, int]


@dataclass(frozen=True)
class Component:
    component_id: str
    path: str


@dataclass(frozen=True)
class Bound:
    version: Version
    inclusive: bool


@dataclass(frozen=True)
class Constraint:
    kind: str
    raw: str
    lower: Bound | None = None
    upper: Bound | None = None
    exact: Version | None = None
    direct_reference: str | None = None


@dataclass(frozen=True)
class Occurrence:
    ecosystem: str
    component_id: str
    manifest: Path
    source_type: str
    section: str
    name: str
    raw_name: str
    specifier: str
    raw: str
    line: int | None = None


def normalize_python_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def normalize_node_name(name: str) -> str:
    return name.lower()


def display_path(path: Path, root: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except ValueError:
        return str(path)


def load_components(root: Path, components_file: Path | None = None) -> list[Component]:
    components_path = components_file or root / "config" / "virtual_ai_os_components.json"
    if components_path.exists():
        with components_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        components = []
        for item in payload.get("components", []):
            component_id = str(item.get("id", "")).strip()
            component_path = str(item.get("path", "")).strip()
            if component_id and component_path:
                components.append(Component(component_id=component_id, path=component_path))
        if components:
            return components

    gitmodules = root / ".gitmodules"
    if gitmodules.exists():
        return load_gitmodule_components(gitmodules)

    return [
        Component(component_id=path.name, path=path.name)
        for path in sorted(root.iterdir())
        if path.is_dir() and any(is_manifest_file(child) for child in path.iterdir())
    ]


def load_gitmodule_components(gitmodules: Path) -> list[Component]:
    components = []
    current_path = None
    for raw_line in gitmodules.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if line.startswith("[submodule "):
            current_path = None
        elif line.startswith("path") and "=" in line:
            current_path = line.split("=", 1)[1].strip()
            if current_path:
                components.append(Component(component_id=Path(current_path).name, path=current_path))
    return components


def is_manifest_file(path: Path) -> bool:
    name = path.name
    return (
        name == "package.json"
        or name == "pyproject.toml"
        or (name.startswith("requirements") and name.endswith(".txt"))
        or (name.startswith("constraints") and name.endswith(".txt"))
    )


def manifest_kind(path: Path) -> str:
    if path.name == "package.json":
        return "node-package"
    if path.name == "pyproject.toml":
        return "python-pyproject"
    return "python-requirements"


def is_ignored_dir(path: Path) -> bool:
    name = path.name
    return name in IGNORED_DIR_NAMES or any(name.startswith(prefix) for prefix in IGNORED_DIR_PREFIXES)


def discover_manifests(root: Path, components: list[Component]) -> dict[str, list[Path]]:
    component_roots = {
        component.component_id: (root / component.path).resolve()
        for component in components
    }
    manifests: dict[str, list[Path]] = {}
    for component in components:
        component_root = component_roots[component.component_id]
        nested_roots = {
            other_root
            for other_id, other_root in component_roots.items()
            if other_id != component.component_id and is_relative_to(other_root, component_root)
        }
        component_manifests: list[Path] = []
        if component_root.exists():
            for current_dir, dirnames, filenames in os.walk(component_root):
                current_path = Path(current_dir)
                dirnames[:] = [
                    dirname
                    for dirname in sorted(dirnames)
                    if not is_ignored_dir(current_path / dirname)
                    and (current_path / dirname).resolve() not in nested_roots
                ]
                for filename in sorted(filenames):
                    path = current_path / filename
                    if is_manifest_file(path):
                        component_manifests.append(path.resolve())
        manifests[component.component_id] = sorted(component_manifests)
    return manifests


def is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return path != parent


def parse_manifest(component: Component, manifest: Path) -> tuple[list[Occurrence], list[dict[str, Any]]]:
    kind = manifest_kind(manifest)
    if kind == "node-package":
        return parse_package_json(component, manifest)
    if kind == "python-pyproject":
        return parse_pyproject(component, manifest)
    return parse_requirements(component, manifest, section="requirements")


def parse_package_json(component: Component, manifest: Path) -> tuple[list[Occurrence], list[dict[str, Any]]]:
    warnings: list[dict[str, Any]] = []
    try:
        with manifest.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        return [], [parse_warning(component, manifest, "node-package", str(error))]

    occurrences = []
    for section in NODE_DEPENDENCY_SECTIONS:
        dependencies = payload.get(section, {})
        if not isinstance(dependencies, dict):
            warnings.append(parse_warning(component, manifest, "node-package", f"{section} is not an object"))
            continue
        for raw_name, raw_specifier in sorted(dependencies.items()):
            name = normalize_node_name(str(raw_name))
            specifier = str(raw_specifier).strip()
            occurrences.append(
                Occurrence(
                    ecosystem="node",
                    component_id=component.component_id,
                    manifest=manifest,
                    source_type="package.json",
                    section=section,
                    name=name,
                    raw_name=str(raw_name),
                    specifier=specifier,
                    raw=f"{raw_name}: {specifier}",
                )
            )
    return occurrences, warnings


def parse_pyproject(component: Component, manifest: Path) -> tuple[list[Occurrence], list[dict[str, Any]]]:
    if tomllib is None:
        return [], [parse_warning(component, manifest, "python-pyproject", "tomllib is unavailable")]

    try:
        with manifest.open("rb") as handle:
            payload = tomllib.load(handle)
    except (OSError, tomllib.TOMLDecodeError) as error:
        return [], [parse_warning(component, manifest, "python-pyproject", str(error))]

    occurrences = []
    warnings = []
    project = payload.get("project", {})
    if isinstance(project, dict):
        dependencies = project.get("dependencies", [])
        occurrences.extend(
            parse_requirement_strings(
                component,
                manifest,
                "pyproject.toml",
                "project.dependencies",
                dependencies,
                warnings,
            )
        )

        optional_dependencies = project.get("optional-dependencies", {})
        if isinstance(optional_dependencies, dict):
            for extra, dependencies in sorted(optional_dependencies.items()):
                occurrences.extend(
                    parse_requirement_strings(
                        component,
                        manifest,
                        "pyproject.toml",
                        f"project.optional-dependencies.{extra}",
                        dependencies,
                        warnings,
                    )
                )
    return occurrences, warnings


def parse_requirement_strings(
    component: Component,
    manifest: Path,
    source_type: str,
    section: str,
    dependencies: Any,
    warnings: list[dict[str, Any]],
) -> list[Occurrence]:
    if not dependencies:
        return []
    if not isinstance(dependencies, list):
        warnings.append(parse_warning(component, manifest, source_type, f"{section} is not a list"))
        return []

    occurrences = []
    for raw_dependency in dependencies:
        parsed = parse_python_dependency(
            component,
            manifest,
            source_type,
            section,
            str(raw_dependency),
            line=None,
        )
        if parsed is None:
            warnings.append(parse_warning(component, manifest, source_type, f"could not parse dependency: {raw_dependency}"))
        else:
            occurrences.append(parsed)
    return occurrences


def parse_requirements(
    component: Component,
    manifest: Path,
    section: str,
) -> tuple[list[Occurrence], list[dict[str, Any]]]:
    occurrences = []
    warnings = []
    pending = ""
    try:
        lines = manifest.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError as error:
        return [], [parse_warning(component, manifest, "requirements.txt", str(error))]

    for line_number, raw_line in enumerate(lines, start=1):
        line = raw_line.rstrip()
        if line.endswith("\\"):
            pending += line[:-1] + " "
            continue
        if pending:
            line = pending + line
            pending = ""

        cleaned = strip_requirement_comment(line).strip()
        if not cleaned:
            continue
        if cleaned.startswith(("-r ", "--requirement", "-c ", "--constraint", "--index-url", "--extra-index-url")):
            continue
        if cleaned.startswith("-") and not cleaned.startswith("-e "):
            continue

        parsed = parse_python_dependency(
            component,
            manifest,
            "requirements.txt",
            section,
            cleaned,
            line=line_number,
        )
        if parsed is None:
            warnings.append(parse_warning(component, manifest, "requirements.txt", f"could not parse line {line_number}: {cleaned}"))
        else:
            occurrences.append(parsed)
    return occurrences, warnings


def strip_requirement_comment(line: str) -> str:
    if line.lstrip().startswith("#"):
        return ""
    for marker in (" #", "\t#"):
        if marker in line:
            return line.split(marker, 1)[0]
    return line


def parse_python_dependency(
    component: Component,
    manifest: Path,
    source_type: str,
    section: str,
    raw_dependency: str,
    line: int | None,
) -> Occurrence | None:
    dependency = raw_dependency.strip()
    if dependency.startswith("-e "):
        dependency = dependency[3:].strip()

    if dependency.startswith(("./", "../", "/")):
        path_part = dependency.split("[", 1)[0]
        raw_name = Path(path_part).name
        if not raw_name:
            return None
        return Occurrence(
            ecosystem="python",
            component_id=component.component_id,
            manifest=manifest,
            source_type=source_type,
            section=section,
            name=normalize_python_name(raw_name),
            raw_name=raw_name,
            specifier=f"@ file:{dependency}",
            raw=raw_dependency,
            line=line,
        )

    egg = EGG_RE.search(dependency)
    if egg:
        raw_name = egg.group(1)
        specifier = f"@ {dependency}"
        return Occurrence(
            ecosystem="python",
            component_id=component.component_id,
            manifest=manifest,
            source_type=source_type,
            section=section,
            name=normalize_python_name(raw_name),
            raw_name=raw_name,
            specifier=specifier,
            raw=raw_dependency,
            line=line,
        )

    markerless = dependency.split(";", 1)[0].strip()
    if " @ " in markerless:
        raw_name, direct_reference = markerless.split(" @ ", 1)
        raw_name = raw_name.strip()
        if not raw_name:
            return None
        return Occurrence(
            ecosystem="python",
            component_id=component.component_id,
            manifest=manifest,
            source_type=source_type,
            section=section,
            name=normalize_python_name(raw_name),
            raw_name=raw_name,
            specifier=f"@ {direct_reference.strip()}",
            raw=raw_dependency,
            line=line,
        )

    match = NAME_RE.match(markerless)
    if not match:
        return None

    raw_name = match.group(1)
    specifier = match.group(2).strip()
    return Occurrence(
        ecosystem="python",
        component_id=component.component_id,
        manifest=manifest,
        source_type=source_type,
        section=section,
        name=normalize_python_name(raw_name),
        raw_name=raw_name,
        specifier=specifier,
        raw=raw_dependency,
        line=line,
    )


def parse_warning(component: Component, manifest: Path, source_type: str, message: str) -> dict[str, Any]:
    return {
        "component": component.component_id,
        "manifest": str(manifest),
        "sourceType": source_type,
        "message": message,
        "action": "Review the manifest syntax or add an explicit parser exemption if this file is not a dependency manifest.",
    }


def analyze_occurrences(occurrences: list[Occurrence]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    groups: dict[tuple[str, str], list[Occurrence]] = {}
    for occurrence in occurrences:
        groups.setdefault((occurrence.ecosystem, occurrence.name), []).append(occurrence)

    conflicts = []
    drift_warnings = []
    for (ecosystem, name), group in sorted(groups.items()):
        if len(group) < 2:
            continue

        pairwise_conflicts = []
        analyses = {occurrence: analyze_constraint(ecosystem, occurrence.specifier) for occurrence in group}
        for index, left in enumerate(group):
            for right in group[index + 1 :]:
                reason = conflict_reason(analyses[left], analyses[right])
                if reason:
                    pairwise_conflicts.append(
                        {
                            "left": occurrence_ref(left),
                            "right": occurrence_ref(right),
                            "reason": reason,
                        }
                    )

        variants = summarize_variants(group)
        if pairwise_conflicts:
            conflicts.append(
                {
                    "ecosystem": ecosystem,
                    "dependency": name,
                    "severity": "error",
                    "reason": summarize_reasons(pairwise_conflicts),
                    "affectedComponents": sorted({occurrence.component_id for occurrence in group}),
                    "variants": variants,
                    "occurrences": [occurrence_to_json(occurrence) for occurrence in sorted(group, key=occurrence_sort_key)],
                    "conflictingPairs": pairwise_conflicts,
                    "action": action_for_conflict(ecosystem, name),
                }
            )
        elif len(variants) > 1 and len({occurrence.component_id for occurrence in group}) > 1:
            drift_warnings.append(
                {
                    "ecosystem": ecosystem,
                    "dependency": name,
                    "severity": "warning",
                    "reason": "Dependency is declared with different but overlapping constraints.",
                    "affectedComponents": sorted({occurrence.component_id for occurrence in group}),
                    "variants": variants,
                    "occurrences": [occurrence_to_json(occurrence) for occurrence in sorted(group, key=occurrence_sort_key)],
                    "action": f"Consider normalizing {name} constraints so submodule installs resolve predictably.",
                }
            )
    return conflicts, drift_warnings


def analyze_constraint(ecosystem: str, specifier: str) -> Constraint:
    specifier = (specifier or "").strip()
    if not specifier or specifier == "*":
        return Constraint(kind="any", raw=specifier)

    if is_direct_reference(ecosystem, specifier):
        return Constraint(kind="direct", raw=specifier, direct_reference=specifier)

    if ecosystem == "node":
        return analyze_node_constraint(specifier)
    return analyze_python_constraint(specifier)


def is_direct_reference(ecosystem: str, specifier: str) -> bool:
    lowered = specifier.lower()
    if ecosystem == "python":
        return specifier.startswith("@ ") or lowered.startswith(("git+", "http://", "https://", "file:"))
    return lowered.startswith(("file:", "link:", "workspace:", "git+", "github:", "http://", "https:", "npm:"))


def analyze_python_constraint(specifier: str) -> Constraint:
    lower = None
    upper = None
    exact = None
    matched = False
    cleaned = specifier.split(";", 1)[0].strip()

    for operator, value in PYTHON_OPERATOR_RE.findall(cleaned):
        matched = True
        parsed = parse_version(value)
        if parsed is None:
            return Constraint(kind="unknown", raw=specifier)
        version, part_count, wildcard = parsed
        if operator == "!=":
            continue
        if operator in ("==", "==="):
            if wildcard:
                range_lower, range_upper = wildcard_bounds(version, part_count)
                lower = merge_lower(lower, Bound(range_lower, True))
                upper = merge_upper(upper, Bound(range_upper, False))
            else:
                exact = version
                lower = merge_lower(lower, Bound(version, True))
                upper = merge_upper(upper, Bound(version, True))
        elif operator == "~=":
            range_upper = compatible_release_upper(version, part_count)
            lower = merge_lower(lower, Bound(version, True))
            upper = merge_upper(upper, Bound(range_upper, False))
        elif operator == ">=":
            lower = merge_lower(lower, Bound(version, True))
        elif operator == ">":
            lower = merge_lower(lower, Bound(version, False))
        elif operator == "<=":
            upper = merge_upper(upper, Bound(version, True))
        elif operator == "<":
            upper = merge_upper(upper, Bound(version, False))

    if not matched:
        return Constraint(kind="unknown", raw=specifier)
    if exact is not None:
        return Constraint(kind="exact", raw=specifier, lower=lower, upper=upper, exact=exact)
    return Constraint(kind="range", raw=specifier, lower=lower, upper=upper)


def analyze_node_constraint(specifier: str) -> Constraint:
    cleaned = specifier.strip()
    if "||" in cleaned or " - " in cleaned:
        return Constraint(kind="unknown", raw=specifier)

    lowered = cleaned.lower()
    if lowered in {"latest", "next"}:
        return Constraint(kind="unknown", raw=specifier)

    lower = None
    upper = None
    exact = None

    if cleaned.startswith("^"):
        parsed = parse_version(cleaned[1:].strip())
        if parsed is None:
            return Constraint(kind="unknown", raw=specifier)
        version, part_count, wildcard = parsed
        if wildcard:
            range_lower, range_upper = wildcard_bounds(version, part_count)
            return Constraint(kind="range", raw=specifier, lower=Bound(range_lower, True), upper=Bound(range_upper, False))
        return Constraint(kind="range", raw=specifier, lower=Bound(version, True), upper=Bound(caret_upper(version), False))

    if cleaned.startswith("~"):
        parsed = parse_version(cleaned[1:].strip())
        if parsed is None:
            return Constraint(kind="unknown", raw=specifier)
        version, part_count, wildcard = parsed
        if wildcard:
            range_lower, range_upper = wildcard_bounds(version, part_count)
            return Constraint(kind="range", raw=specifier, lower=Bound(range_lower, True), upper=Bound(range_upper, False))
        return Constraint(kind="range", raw=specifier, lower=Bound(version, True), upper=Bound(tilde_upper(version, part_count), False))

    operator_matches = NODE_OPERATOR_RE.findall(cleaned)
    if operator_matches:
        for operator, value in operator_matches:
            parsed = parse_version(value)
            if parsed is None:
                return Constraint(kind="unknown", raw=specifier)
            version, part_count, wildcard = parsed
            if operator == "=" and wildcard:
                range_lower, range_upper = wildcard_bounds(version, part_count)
                lower = merge_lower(lower, Bound(range_lower, True))
                upper = merge_upper(upper, Bound(range_upper, False))
            elif operator == "=":
                exact = version
                lower = merge_lower(lower, Bound(version, True))
                upper = merge_upper(upper, Bound(version, True))
            elif operator == ">=":
                lower = merge_lower(lower, Bound(version, True))
            elif operator == ">":
                lower = merge_lower(lower, Bound(version, False))
            elif operator == "<=":
                upper = merge_upper(upper, Bound(version, True))
            elif operator == "<":
                upper = merge_upper(upper, Bound(version, False))
        if exact is not None:
            return Constraint(kind="exact", raw=specifier, lower=lower, upper=upper, exact=exact)
        return Constraint(kind="range", raw=specifier, lower=lower, upper=upper)

    parsed = parse_version(cleaned)
    if parsed is None:
        return Constraint(kind="unknown", raw=specifier)
    version, part_count, wildcard = parsed
    if wildcard:
        range_lower, range_upper = wildcard_bounds(version, part_count)
        return Constraint(kind="range", raw=specifier, lower=Bound(range_lower, True), upper=Bound(range_upper, False))
    exact = version
    return Constraint(kind="exact", raw=specifier, lower=Bound(version, True), upper=Bound(version, True), exact=exact)


def parse_version(value: str) -> tuple[Version, int, bool] | None:
    match = VERSION_RE.match(value.strip())
    if not match:
        return None
    raw_parts = [part for part in match.groups() if part is not None]
    wildcard = any(part in {"x", "X", "*"} for part in raw_parts)
    part_count = len(raw_parts)
    parts = []
    for part in raw_parts:
        if part in {"x", "X", "*"}:
            parts.append(0)
        else:
            parts.append(int(part))
    while len(parts) < 3:
        parts.append(0)
    return (parts[0], parts[1], parts[2]), part_count, wildcard


def wildcard_bounds(version: Version, part_count: int) -> tuple[Version, Version]:
    if part_count <= 1:
        return (version[0], 0, 0), (version[0] + 1, 0, 0)
    if part_count == 2:
        return (version[0], version[1], 0), (version[0], version[1] + 1, 0)
    return version, (version[0], version[1] + 1, 0)


def compatible_release_upper(version: Version, part_count: int) -> Version:
    if part_count <= 2:
        return (version[0] + 1, 0, 0)
    return (version[0], version[1] + 1, 0)


def caret_upper(version: Version) -> Version:
    major, minor, patch = version
    if major > 0:
        return (major + 1, 0, 0)
    if minor > 0:
        return (0, minor + 1, 0)
    return (0, 0, patch + 1)


def tilde_upper(version: Version, part_count: int) -> Version:
    major, minor, _patch = version
    if part_count <= 1:
        return (major + 1, 0, 0)
    return (major, minor + 1, 0)


def merge_lower(existing: Bound | None, new: Bound) -> Bound:
    if existing is None:
        return new
    if new.version > existing.version:
        return new
    if new.version < existing.version:
        return existing
    return Bound(new.version, existing.inclusive and new.inclusive)


def merge_upper(existing: Bound | None, new: Bound) -> Bound:
    if existing is None:
        return new
    if new.version < existing.version:
        return new
    if new.version > existing.version:
        return existing
    return Bound(new.version, existing.inclusive and new.inclusive)


def conflict_reason(left: Constraint, right: Constraint) -> str | None:
    if left.kind == "direct" or right.kind == "direct":
        if left.kind == "direct" and right.kind == "direct" and left.direct_reference == right.direct_reference:
            return None
        if left.kind == "direct" and right.kind == "direct":
            return "direct references point at different sources"
        return "direct reference is mixed with a registry version constraint"

    if left.kind in {"any", "unknown"} or right.kind in {"any", "unknown"}:
        return None

    if intervals_overlap(left, right):
        return None
    if left.exact is not None and right.exact is not None:
        return "exact pins require different versions"
    if left.exact is not None or right.exact is not None:
        return "exact pin is outside the other declared range"
    return "version ranges have no overlapping release"


def intervals_overlap(left: Constraint, right: Constraint) -> bool:
    lower = merge_lower(left.lower, right.lower) if right.lower is not None else left.lower
    upper = merge_upper(left.upper, right.upper) if right.upper is not None else left.upper
    if lower is None or upper is None:
        return True
    if lower.version < upper.version:
        return True
    if lower.version > upper.version:
        return False
    return lower.inclusive and upper.inclusive


def summarize_reasons(pairwise_conflicts: list[dict[str, Any]]) -> str:
    reasons = sorted({conflict["reason"] for conflict in pairwise_conflicts})
    return "; ".join(reasons)


def summarize_variants(group: Iterable[Occurrence]) -> list[dict[str, Any]]:
    variants: dict[str, dict[str, Any]] = {}
    for occurrence in group:
        specifier = occurrence.specifier or "*"
        variant = variants.setdefault(
            specifier,
            {
                "specifier": specifier,
                "components": set(),
                "occurrenceCount": 0,
            },
        )
        variant["components"].add(occurrence.component_id)
        variant["occurrenceCount"] += 1
    return [
        {
            "specifier": specifier,
            "components": sorted(variant["components"]),
            "occurrenceCount": variant["occurrenceCount"],
        }
        for specifier, variant in sorted(variants.items())
    ]


def action_for_conflict(ecosystem: str, name: str) -> str:
    package_manager = "pip" if ecosystem == "python" else "npm/yarn/pnpm"
    return (
        f"Align {name} constraints in the listed {ecosystem} manifests before shared {package_manager} installation, "
        "or isolate the affected component behind a separate environment boundary."
    )


def occurrence_sort_key(occurrence: Occurrence) -> tuple[str, str, str, int]:
    return (
        occurrence.component_id,
        str(occurrence.manifest),
        occurrence.section,
        occurrence.line or 0,
    )


def occurrence_ref(occurrence: Occurrence) -> dict[str, Any]:
    return {
        "component": occurrence.component_id,
        "manifest": str(occurrence.manifest),
        "section": occurrence.section,
        "line": occurrence.line,
        "specifier": occurrence.specifier or "*",
    }


def occurrence_to_json(occurrence: Occurrence) -> dict[str, Any]:
    payload = occurrence_ref(occurrence)
    payload.update(
        {
            "sourceType": occurrence.source_type,
            "name": occurrence.raw_name,
            "raw": occurrence.raw,
        }
    )
    return payload


def build_report(root: Path, components_file: Path | None = None) -> dict[str, Any]:
    root = root.resolve()
    components = load_components(root, components_file)
    manifests_by_component = discover_manifests(root, components)

    all_occurrences = []
    parse_warnings = []
    component_reports = []
    for component in components:
        component_root = (root / component.path).resolve()
        component_manifests = manifests_by_component.get(component.component_id, [])
        component_occurrences = []
        component_warnings = []
        for manifest in component_manifests:
            occurrences, warnings = parse_manifest(component, manifest)
            component_occurrences.extend(occurrences)
            component_warnings.extend(warnings)
        all_occurrences.extend(component_occurrences)
        parse_warnings.extend(component_warnings)
        if not component_root.exists():
            parse_warnings.append(
                {
                    "component": component.component_id,
                    "manifest": display_path(component_root, root),
                    "sourceType": "component",
                    "message": "component path does not exist",
                    "action": "Initialize the submodule or remove it from the Virtual AI OS component inventory.",
                }
            )
        component_reports.append(
            {
                "id": component.component_id,
                "path": component.path,
                "exists": component_root.exists(),
                "manifestCount": len(component_manifests),
                "dependencyOccurrenceCount": len(component_occurrences),
                "manifests": [display_path(manifest, root) for manifest in component_manifests],
            }
        )

    conflicts, drift_warnings = analyze_occurrences(all_occurrences)
    report = {
        "schema_version": "virtual-ai-os-dependency-drift.v1",
        "ok": not conflicts,
        "root": str(root),
        "summary": {
            "componentCount": len(components),
            "manifestCount": sum(len(manifests) for manifests in manifests_by_component.values()),
            "dependencyOccurrenceCount": len(all_occurrences),
            "uniqueDependencyCount": len({(occurrence.ecosystem, occurrence.name) for occurrence in all_occurrences}),
            "conflictCount": len(conflicts),
            "driftWarningCount": len(drift_warnings),
            "parseWarningCount": len(parse_warnings),
        },
        "components": component_reports,
        "conflicts": rewrite_paths(conflicts, root),
        "driftWarnings": rewrite_paths(drift_warnings, root),
        "parseWarnings": rewrite_paths(parse_warnings, root),
    }
    return report


def rewrite_paths(payload: Any, root: Path) -> Any:
    if isinstance(payload, list):
        return [rewrite_paths(item, root) for item in payload]
    if isinstance(payload, dict):
        rewritten = {}
        for key, value in payload.items():
            if key == "manifest" and isinstance(value, str):
                path_value = Path(value)
                rewritten[key] = display_path(path_value, root) if path_value.is_absolute() else value
            else:
                rewritten[key] = rewrite_paths(value, root)
        return rewritten
    return payload


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare Python and Node dependency manifests across Virtual AI OS submodules."
    )
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root to inspect.")
    parser.add_argument(
        "--components-file",
        type=Path,
        default=None,
        help="Virtual AI OS components JSON file. Defaults to config/virtual_ai_os_components.json under --root.",
    )
    parser.add_argument("--output", type=Path, default=None, help="Write the JSON report to this path.")
    parser.add_argument(
        "--warn-only",
        action="store_true",
        help="Always exit zero after emitting JSON, even when dependency conflicts are found.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    components_file = args.components_file
    if components_file is None:
        components_file = args.root / "config" / "virtual_ai_os_components.json"
    elif not components_file.is_absolute():
        components_file = args.root / components_file

    report = build_report(args.root, components_file)
    rendered = json.dumps(report, indent=2, sort_keys=True)
    if args.output is not None:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)

    if report["ok"] or args.warn_only:
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
