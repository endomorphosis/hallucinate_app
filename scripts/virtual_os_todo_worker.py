#!/usr/bin/env python3
"""Deterministic implementation worker for the Virtual AI OS todo daemon.

The ipfs_datasets_py implementation daemon passes the selected task prompt on
stdin. This worker implements the bootstrap tasks that turn the high-level
Virtual AI OS backlog into checked-in review and test-planning artifacts.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
COMPONENTS_JSON = ROOT / "config" / "virtual_ai_os_components.json"
COMPONENT_REVIEW = ROOT / "docs" / "VIRTUAL_AI_OS_SUBMODULE_REVIEW.md"
TEST_MATRIX_JSON = ROOT / "config" / "virtual_ai_os_test_matrix.json"
TEST_STRATEGY = ROOT / "docs" / "VIRTUAL_AI_OS_TEST_STRATEGY.md"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def run_git(args: list[str], cwd: Path = ROOT) -> str:
    result = subprocess.run(["git", *args], cwd=cwd, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def submodule_sha(path: str) -> str:
    return run_git(["rev-parse", "HEAD"], ROOT / path)


def path_exists(path: str) -> bool:
    return (ROOT / path).exists()


def component_payload() -> dict[str, Any]:
    return {
        "generatedAt": utc_now(),
        "goal": "Virtualized AI operating system composed from repo submodules",
        "components": [
            {
                "id": "ipfs_kit_py",
                "path": "ipfs_kit_py",
                "sha": submodule_sha("ipfs_kit_py"),
                "role": "storage kernel and content-addressed IO substrate",
                "capabilities": [
                    "IPFS operations",
                    "IPLD and CAR-adjacent content handling",
                    "metadata and cache primitives",
                    "MCP server surfaces",
                    "libp2p and routing scaffolding",
                ],
                "integrationContracts": [
                    "Virtual filesystem adapter",
                    "content metadata index adapter",
                    "daemon health and lifecycle adapter",
                    "capability-scoped storage operations",
                ],
                "testSeams": [
                    "mocked add/cat/stat/list operations",
                    "metadata lookup contract tests",
                    "daemon launch smoke",
                    "offline cache behavior",
                ],
                "majorGaps": [
                    "single stable VFS facade for monorepo consumers",
                    "explicit capability checks around destructive storage operations",
                    "typed error normalization for dashboard and agent callers",
                ],
            },
            {
                "id": "ipfs_datasets_py",
                "path": "ipfs_datasets_py",
                "sha": submodule_sha("ipfs_datasets_py"),
                "role": "knowledge fabric, dataset runtime, GraphRAG, MCP tools, and autonomous todo daemon",
                "capabilities": [
                    "dataset loading and processing",
                    "knowledge graph and GraphRAG services",
                    "MCP server and tool registry",
                    "legal and web data processors",
                    "todo implementation supervisor and daemon",
                ],
                "integrationContracts": [
                    "knowledge fabric adapter",
                    "GraphRAG query adapter",
                    "MCP tool namespace contract",
                    "daemon task board contract",
                    "provenance and audit event contract",
                ],
                "testSeams": [
                    "dataset load with mocked backend",
                    "GraphRAG query shape",
                    "MCP tool import and registry tests",
                    "todo daemon selection and artifact completion",
                ],
                "majorGaps": [
                    "curated monorepo test subset for high-signal CI",
                    "stable GraphRAG service boundary independent of optional extras",
                    "documented daemon-safe task authoring rules for this repo",
                ],
            },
            {
                "id": "ipfs_accelerate_py",
                "path": "ipfs_accelerate_py",
                "sha": submodule_sha("ipfs_accelerate_py"),
                "role": "model compute runtime, hardware-aware inference, task queues, and MCP++ reference implementation host",
                "capabilities": [
                    "model server and inference APIs",
                    "hardware backend detection",
                    "worker/task scheduling",
                    "MCP server tools",
                    "MCP++ module and nested reference submodule",
                ],
                "integrationContracts": [
                    "compute adapter",
                    "model lifecycle and inference request contract",
                    "hardware profile contract",
                    "task queue and workflow scheduler contract",
                    "MCP++ service mesh contract",
                ],
                "testSeams": [
                    "mocked inference and embedding calls",
                    "hardware profile fallback",
                    "daemon launch smoke",
                    "MCP++ task queue and workflow adapter tests",
                ],
                "majorGaps": [
                    "stable lightweight contract tests that avoid heavy model downloads",
                    "consistent async/sync behavior across inference endpoints",
                    "resource accounting surfaced to the OS scheduler",
                ],
            },
            {
                "id": "swissknife",
                "path": "swissknife",
                "sha": submodule_sha("swissknife"),
                "role": "agent shell, descriptor-driven UI, CLI, web runtime, and MCP++ UX layer",
                "capabilities": [
                    "agent CLI and tools",
                    "MCP tool UI surfaces",
                    "descriptor runtime",
                    "schema-driven UI generation",
                    "UCAN auth and MCP++ transport services",
                ],
                "integrationContracts": [
                    "descriptor pack ingestion",
                    "dashboard launcher adapter",
                    "agent tool bridge",
                    "auth and revocation adapter",
                    "generated UI quality gates",
                ],
                "testSeams": [
                    "descriptor schema validation",
                    "generated UI runtime tests",
                    "transport and revocation unit tests",
                    "dashboard launcher smoke",
                ],
                "majorGaps": [
                    "monorepo-owned descriptor launcher in Hallucinate shell",
                    "contract tests between SwissKnife descriptors and Python MCP services",
                    "clear boundary between reference UI assets and production shell assets",
                ],
            },
            {
                "id": "mcp_plus_plus",
                "path": "ipfs_accelerate_py/ipfs_accelerate_py/mcplusplus",
                "sha": submodule_sha("ipfs_accelerate_py/ipfs_accelerate_py/mcplusplus")
                if path_exists("ipfs_accelerate_py/ipfs_accelerate_py/mcplusplus")
                else "",
                "role": "MCP++ protocol reference for service mesh semantics",
                "capabilities": [
                    "transport profiles",
                    "IDL and descriptor specifications",
                    "event DAG semantics",
                    "policy, scheduling, and UCAN delegation references",
                ],
                "integrationContracts": [
                    "service mesh profile",
                    "descriptor conformance matrix",
                    "event envelope contract",
                    "capability delegation contract",
                ],
                "testSeams": [
                    "schema conformance tests",
                    "event DAG ordering tests",
                    "transport fallback tests",
                    "UCAN grant and revocation tests",
                ],
                "majorGaps": [
                    "requested underscore repository URL is not accessible",
                    "top-level repo needs an explicit policy for nested MCP++ pin ownership",
                    "wire protocol tests should run without requiring live peer networking",
                ],
            },
        ],
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_component_review(payload: dict[str, Any]) -> None:
    lines = [
        "# Virtual AI OS Submodule Review",
        "",
        f"Generated: {payload['generatedAt']}",
        "",
        "## Architecture Target",
        "",
        "The monorepo should treat the submodules as components of a virtualized AI operating system:",
        "",
        "- `ipfs_kit_py`: storage kernel and content-addressed filesystem substrate.",
        "- `ipfs_datasets_py`: knowledge fabric, dataset runtime, GraphRAG, MCP tools, and autonomous todo daemon.",
        "- `ipfs_accelerate_py`: model compute runtime, hardware-aware inference, and task scheduling.",
        "- `swissknife`: user and agent shell with descriptor-driven UI and MCP++ UX.",
        "- `mcp_plus_plus`: protocol profile for service mesh, identity, transport, and workflow semantics.",
        "",
        "## Component Inventory",
        "",
    ]
    for component in payload["components"]:
        lines.extend(
            [
                f"### {component['id']}",
                "",
                f"- Path: `{component['path']}`",
                f"- SHA: `{component['sha']}`",
                f"- OS role: {component['role']}",
                f"- Capabilities: {', '.join(component['capabilities'])}",
                f"- Integration contracts: {', '.join(component['integrationContracts'])}",
                f"- Test seams: {', '.join(component['testSeams'])}",
                f"- Major gaps: {', '.join(component['majorGaps'])}",
                "",
            ]
        )
    lines.extend(
        [
            "## Integration Boundary Rules",
            "",
            "1. Hallucinate App owns the Virtual AI OS contracts and adapters.",
            "2. Submodules keep their native APIs; adapters absorb constructor, CLI, and optional dependency drift.",
            "3. All cross-component calls flow through typed contracts, daemon configs, or MCP++ descriptors.",
            "4. Heavy model, network, and browser dependencies stay out of fast contract tests.",
            "5. Every OS feature must have a mocked contract test before live daemon or e2e coverage is required.",
            "",
            "## Immediate Risks",
            "",
            "- Nested submodule recursion is noisy and needs an explicit policy.",
            "- MCP++ is accessible as `Mcp-Plus-Plus` or `mcp-plus-plus`, not the requested underscore URL.",
            "- The OS scheduler needs resource accounting before model workloads can be safely virtualized.",
            "- The dashboard needs descriptor contract tests before SwissKnife UI assets are promoted.",
            "- Security and capability boundaries need to be explicit before autonomous agents can mutate storage or run tools.",
            "",
        ]
    )
    COMPONENT_REVIEW.parent.mkdir(parents=True, exist_ok=True)
    COMPONENT_REVIEW.write_text("\n".join(lines), encoding="utf-8")


def test_matrix_payload() -> dict[str, Any]:
    cases = [
        ("T001", "baseline", "Verify top-level submodule SHAs match baseline manifest", ["all"], "P0"),
        ("T002", "contract", "Import and register every Virtual AI OS adapter", ["all"], "P0"),
        ("T003", "storage", "Mock VFS add/cat/stat/list through ipfs_kit_py adapter", ["ipfs_kit_py"], "P0"),
        ("T004", "storage", "Validate metadata index fallback and error normalization", ["ipfs_kit_py"], "P1"),
        ("T005", "knowledge", "Mock dataset load and GraphRAG query shape", ["ipfs_datasets_py"], "P0"),
        ("T006", "knowledge", "Validate provenance emission for dataset operations", ["ipfs_datasets_py"], "P1"),
        ("T007", "compute", "Mock model load and inference through accelerate adapter", ["ipfs_accelerate_py"], "P0"),
        ("T008", "compute", "Validate hardware profile fallback without GPU dependencies", ["ipfs_accelerate_py"], "P1"),
        ("T009", "mcp", "Validate MCP++ descriptor, envelope, and IDL schema", ["mcp_plus_plus", "swissknife"], "P0"),
        ("T010", "mcp", "Validate UCAN grant and revocation behavior with mocks", ["mcp_plus_plus", "swissknife"], "P0"),
        ("T011", "daemon", "Launch daemon manager against mocked service commands", ["all"], "P0"),
        ("T012", "daemon", "Simulate crash, stale heartbeat, restart, and degraded status", ["all"], "P1"),
        ("T013", "workflow", "Storage to dataset to compute end-to-end mocked flow", ["ipfs_kit_py", "ipfs_datasets_py", "ipfs_accelerate_py"], "P0"),
        ("T014", "workflow", "GraphRAG to model to provenance workflow", ["ipfs_datasets_py", "ipfs_accelerate_py"], "P1"),
        ("T015", "ui", "Validate SwissKnife descriptor pack ingestion in Hallucinate shell", ["swissknife"], "P1"),
        ("T016", "ui", "Render OS health dashboard with degraded component states", ["swissknife", "all"], "P1"),
        ("T017", "security", "Deny storage and command operations without capability grant", ["all"], "P0"),
        ("T018", "security", "Verify secrets and credentials are redacted in events", ["all"], "P0"),
        ("T019", "performance", "Smoke latency baseline for storage, query, inference, and scheduling", ["all"], "P2"),
        ("T020", "chaos", "Missing submodule, corrupt descriptor, no network, denied capability", ["all"], "P2"),
    ]
    return {
        "generatedAt": utc_now(),
        "testSuites": [
            {
                "id": case_id,
                "category": category,
                "description": description,
                "components": components,
                "priority": priority,
                "requiredBeforeMerge": priority == "P0",
            }
            for case_id, category, description, components, priority in cases
        ],
    }


def write_test_strategy(payload: dict[str, Any]) -> None:
    lines = [
        "# Virtual AI OS Test Strategy",
        "",
        f"Generated: {payload['generatedAt']}",
        "",
        "## Gate Model",
        "",
        "- P0 tests block every Virtual AI OS integration merge.",
        "- P1 tests block promotion to default-on developer builds.",
        "- P2 tests run in scheduled or release-candidate jobs until stable.",
        "",
        "## Test Matrix",
        "",
        "| ID | Category | Priority | Components | Description |",
        "|---|---|---|---|---|",
    ]
    for suite in payload["testSuites"]:
        lines.append(
            f"| {suite['id']} | {suite['category']} | {suite['priority']} | "
            f"{', '.join(suite['components'])} | {suite['description']} |"
        )
    lines.extend(
        [
            "",
            "## Required CI Phases",
            "",
            "1. Baseline and dependency drift checks.",
            "2. Pure Python adapter contract tests with mocks.",
            "3. Node dashboard and descriptor contract tests.",
            "4. MCP++ schema, envelope, and capability tests.",
            "5. Mocked cross-component workflow tests.",
            "6. Optional live daemon, browser, and heavy model suites outside the fast path.",
            "",
            "## Work Remaining",
            "",
            "- Add the Virtual AI OS adapter package and contract tests.",
            "- Split live daemon tests from mocked daemon manager tests.",
            "- Add descriptor fixture packs for SwissKnife UI integration.",
            "- Define merge-blocking thresholds for latency, retry rate, and degraded services.",
            "- Add scheduled chaos and performance jobs after the fast suite is stable.",
            "",
        ]
    )
    TEST_STRATEGY.parent.mkdir(parents=True, exist_ok=True)
    TEST_STRATEGY.write_text("\n".join(lines), encoding="utf-8")


def implement_component_map() -> None:
    payload = component_payload()
    write_json(COMPONENTS_JSON, payload)
    write_component_review(payload)


def implement_test_matrix() -> None:
    if not COMPONENTS_JSON.exists():
        implement_component_map()
    payload = test_matrix_payload()
    write_json(TEST_MATRIX_JSON, payload)
    write_test_strategy(payload)


def check_component_map() -> int:
    payload = json.loads(COMPONENTS_JSON.read_text(encoding="utf-8"))
    ids = {item["id"] for item in payload.get("components", [])}
    required = {"ipfs_kit_py", "ipfs_datasets_py", "ipfs_accelerate_py", "swissknife", "mcp_plus_plus"}
    if ids != required:
        print(f"component map ids mismatch: {sorted(ids)}", file=sys.stderr)
        return 1
    review = COMPONENT_REVIEW.read_text(encoding="utf-8")
    for marker in ("Architecture Target", "Component Inventory", "Integration Boundary Rules"):
        if marker not in review:
            print(f"missing review marker: {marker}", file=sys.stderr)
            return 1
    return 0


def check_test_matrix() -> int:
    payload = json.loads(TEST_MATRIX_JSON.read_text(encoding="utf-8"))
    suites = payload.get("testSuites", [])
    if len(suites) < 20:
        print("test matrix must contain at least 20 suites", file=sys.stderr)
        return 1
    categories = {suite.get("category") for suite in suites}
    required = {"baseline", "contract", "storage", "knowledge", "compute", "mcp", "daemon", "workflow", "ui", "security", "performance", "chaos"}
    if not required.issubset(categories):
        print(f"missing categories: {sorted(required - categories)}", file=sys.stderr)
        return 1
    strategy = TEST_STRATEGY.read_text(encoding="utf-8")
    for marker in ("Gate Model", "Test Matrix", "Required CI Phases"):
        if marker not in strategy:
            print(f"missing strategy marker: {marker}", file=sys.stderr)
            return 1
    return 0


def parse_task_id(prompt: str) -> str:
    match = re.search(r"^- ID:\s*(OS-\d+)", prompt, re.MULTILINE)
    return match.group(1) if match else ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", choices=["component-map", "test-matrix"])
    args = parser.parse_args()
    if args.check == "component-map":
        return check_component_map()
    if args.check == "test-matrix":
        return check_test_matrix()

    prompt = sys.stdin.read()
    task_id = parse_task_id(prompt)
    if task_id == "OS-001":
        implement_component_map()
        print(f"Implemented {task_id}: {COMPONENT_REVIEW} and {COMPONENTS_JSON}")
        return 0
    if task_id == "OS-002":
        implement_test_matrix()
        print(f"Implemented {task_id}: {TEST_STRATEGY} and {TEST_MATRIX_JSON}")
        return 0
    print(f"virtual_os_todo_worker does not implement task {task_id or '<unknown>'}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
