# Virtual AI OS Developer Architecture Guide

Generated: 2026-05-22

This guide is the developer entry point for the Virtual AI OS integration in
this repository. It explains the component roles, repository-owned adapter
boundaries, local test commands, daemon workflows, coding conventions, and
release gates that should be used before changing OS integration code.

Primary source files:

- `config/virtual_ai_os_components.json` - component inventory and integration
  contracts.
- `config/virtual_ai_os_daemons.json` - daemon launch, endpoint, restart, and
  health-check contracts.
- `config/mcp_plus_plus_profile.json` - repository-owned MCP++ service mesh
  profile.
- `config/submodule_integration_baseline.json` - top-level submodule release
  and rollback SHAs.
- `python/hallucinate_app/virtual_os/` - Hallucinate-owned Python contracts,
  adapters, boot orchestration, security, observability, offline mode, and
  scheduler boundaries.
- `hallucinate_app/node/virtual_os_daemon_manager.js` - desktop-side daemon
  manager for the same daemon config schema.
- `scripts/virtual_os.py` - JSON lifecycle CLI for status, boot, stop,
  restart, verify, test matrix, and rollback.
- `docs/adr/ADR-00*-*.md` - accepted architectural decisions for each OS
  boundary.
- `docs/VIRTUAL_AI_OS_RELEASE_PLAYBOOK.md` - promotion and rollback playbook.

## Architecture Model

Hallucinate App owns the contracts, config, test gates, and dashboard-safe data
shapes. The top-level submodules are treated as OS components, but they do not
own cross-component contracts in this repository.

All cross-component calls must flow through one of these repository-owned
surfaces:

- Python contract dataclasses and Protocols under
  `python/hallucinate_app/virtual_os/`.
- Daemon definitions from `config/virtual_ai_os_daemons.json`.
- MCP++ descriptors and envelopes normalized to
  `config/mcp_plus_plus_profile.json`.
- Dashboard-safe snapshots from `python/hallucinate_app/virtual_os/events.py`.

Do not add direct runtime imports from one component submodule into another.
Adapters may import a native submodule only at the edge they are responsible
for, convert native objects into Hallucinate-owned payloads, and return those
payloads to the rest of the OS.

## Component Roles

| Component | Path | Role | Primary owned boundary |
|---|---|---|---|
| `ipfs_kit_py` | `ipfs_kit_py` | Storage kernel and content-addressed IO substrate | VFS, metadata index, content-addressed storage, storage daemon health |
| `ipfs_datasets_py` | `ipfs_datasets_py` | Knowledge fabric, dataset runtime, GraphRAG, MCP tools, and autonomous todo daemon | Dataset loading, GraphRAG query shape, provenance, task-board workflows |
| `ipfs_accelerate_py` | `ipfs_accelerate_py` | Model compute runtime, hardware-aware inference, task queues, and MCP++ reference host | Model lifecycle, inference, hardware profile, compute queue, resource accounting |
| `swissknife` | `swissknife` | Agent shell, descriptor-driven UI, CLI, web runtime, and MCP++ UX layer | Descriptor pack ingestion, dashboard launch routing, agent shell, auth UX |
| `mcp_plus_plus` | `ipfs_accelerate_py/ipfs_accelerate_py/mcplusplus` | MCP++ protocol reference for service mesh semantics | IDL, descriptor, envelope, UCAN, event DAG, risk scheduler profile conformance |

The first four entries are top-level integration pins and must appear in
`config/submodule_integration_baseline.json`. `mcp_plus_plus` is a nested
reference exception owned by the parent `ipfs_accelerate_py` repository and is
tracked only through the component inventory and nested submodule policy.

## Repository-Owned Modules

`contracts.py` is the shallow kernel contract. It defines process, service,
capability, storage, event, identity, resource, and component registry payloads
without importing any submodule. Keep this module standard-library-only.

`registry.py` loads `config/virtual_ai_os_components.json`, normalizes component
ids, builds lightweight component adapters, and reports component health without
importing optional or heavy submodule code.

`boot.py` composes the registry, submodule baseline validation, daemon
definitions, event emission, metrics, health rollups, and dashboard snapshots.
The boot path accepts an injectable daemon supervisor so tests can validate
lifecycle behavior without starting real services.

`vfs.py`, `knowledge.py`, `compute.py`, `processes.py`, `security.py`,
`events.py`, `provenance.py`, `sandbox.py`, and `offline.py` define focused OS
contracts for their domains. These modules compose the kernel contract rather
than replacing it.

`scripts/virtual_os.py` is the operator and developer CLI. It wraps the boot
orchestrator and daemon config in JSON commands suitable for local checks,
desktop integration, release validation, and rollback planning.

The Node dashboard and daemon files consume the same architecture from the
desktop side. `hallucinate_app/node/virtual_os_daemon_manager.js` uses
`config/virtual_ai_os_daemons.json`; the health dashboard consumes
`DashboardSnapshot`-compatible data; the descriptor launcher treats SwissKnife
descriptor packs as untrusted input and routes validated registrations into the
Hallucinate dashboard runtime.

## Adapter Boundaries

Use these rules when adding or changing adapters:

- Keep contract modules importable with only the Python standard library unless
  an existing module clearly documents an exception.
- Convert native submodule objects at the boundary. Internal callers should see
  `DatasetRef`, `ModelRef`, `VFSPath`, `ServiceDescriptor`,
  `CapabilityGrant`, `EventEnvelope`, `DashboardSnapshot`, and related OS
  payloads, not backend-specific classes.
- Use `MaybeAwaitable[T]` Protocol methods when a boundary may be backed by a
  synchronous test double today and an async daemon or MCP++ transport later.
- Treat descriptors as service metadata, not authorization. Execution still
  requires capability grants, UCAN proof validation, or a local capability
  authority decision.
- Use stable resource URIs: `vfs://`, `ipfs://`, `dataset://`, `model://`,
  `compute://`, `virtual-os://services/{service_id}`,
  `virtual-os://daemons/{daemon_id}`, and
  `credential://{component}/{credential_id}`.
- Publish events and metrics through the OS observability shapes. Before data
  reaches dashboards, logs, or issue reports, pass through dashboard-safe or
  security redaction helpers.
- Do not let optional dependencies, model downloads, browser runtimes, live
  IPFS, or peer networking leak into fast contract tests.

Boundary ownership by domain:

| Domain | Contract module | Native component edge | Test focus |
|---|---|---|---|
| Storage and VFS | `vfs.py` | `ipfs_kit_py` | add, cat, stat, list, metadata fallback, deterministic CID fallback |
| Knowledge and GraphRAG | `knowledge.py`, `provenance.py` | `ipfs_datasets_py` | dataset load, GraphRAG query shape, provenance records, audit events |
| Compute and scheduling | `compute.py`, `processes.py` | `ipfs_accelerate_py` | model load, inference, hardware fallback, queues, resource accounting |
| MCP++ mesh | `config/mcp_plus_plus_profile.json`, `events.py`, `security.py` | `mcp_plus_plus`, `swissknife` | descriptors, envelopes, IDL, UCAN grants, revocation, event DAGs |
| Daemons | `boot.py`, `scripts/virtual_os.py`, `virtual_os_daemon_manager.js` | all service daemons | config parsing, launch plan, health, restart, degraded states |
| UI descriptors | `virtual_os_descriptor_launcher.js` | `swissknife` | descriptor validation, dashboard registration, routing without live services |

## Daemon Workflows

Daemon launch order is defined by `config/virtual_ai_os_daemons.json` and should
be kept in dependency order:

1. `ipfs_kit_py`
2. `ipfs_datasets_py`
3. `ipfs_accelerate_py`
4. `mcp_plus_plus`
5. `swissknife`

Validate configuration without starting daemons:

```bash
PYTHONPATH=python python scripts/virtual_os.py verify
PYTHONPATH=python python scripts/virtual_os.py boot --no-start
```

Start a full OS boot from the CLI:

```bash
PYTHONPATH=python python scripts/virtual_os.py boot --wait
PYTHONPATH=python python scripts/virtual_os.py status
```

Start one daemon when validating an order-sensitive change:

```bash
PYTHONPATH=python python scripts/virtual_os.py boot --daemon ipfs_kit_py --wait
```

Stop one daemon:

```bash
PYTHONPATH=python python scripts/virtual_os.py stop --daemon ipfs_kit_py --reason requested
```

Restart one daemon:

```bash
PYTHONPATH=python python scripts/virtual_os.py restart --daemon ipfs_kit_py --wait
```

Inspect the test matrix used by the lifecycle CLI:

```bash
PYTHONPATH=python python scripts/virtual_os.py test-matrix
PYTHONPATH=python python scripts/virtual_os.py test-matrix --required-only
```

Plan rollback targets without changing submodule SHAs:

```bash
PYTHONPATH=python python scripts/virtual_os.py rollback
```

During rollback, stop daemons in reverse dependency order:

1. `swissknife`
2. `mcp_plus_plus`
3. `ipfs_accelerate_py`
4. `ipfs_datasets_py`
5. `ipfs_kit_py`

Use the ordered stop and start commands from
`docs/VIRTUAL_AI_OS_RELEASE_PLAYBOOK.md` for release rollback. Avoid using a
single broad restart as the primary rollback path until the ordered procedure
has succeeded once.

## Test Commands

Run the required validation for this guide:

```bash
test -s docs/VIRTUAL_AI_OS_DEVELOPER_GUIDE.md
```

Run the local fast gate subset before pushing Virtual AI OS integration changes:

```bash
bash scripts/run_virtual_os_fast_checks.sh
```

List the same gate without running it:

```bash
bash scripts/run_virtual_os_fast_checks.sh --dry-run
```

Fast gate commands currently include:

```bash
python scripts/manage_submodule_baseline.py verify-baseline
python scripts/verify_submodule_imports.py
python test/python/test_virtual_os_submodule_contracts.py
python test/mcp_plus_plus/test_virtual_os_mcp_conformance.py
python test/python/test_virtual_os_boot.py
python scripts/check_virtual_os_dependency_drift.py
python scripts/check_nested_submodules.py
node test/js/test_virtual_os_daemon_manager.js
npm test
```

Focused commands for common changes:

| Change area | Command |
|---|---|
| Registry or component inventory | `PYTHONPATH=python python scripts/virtual_os.py verify` |
| Boot orchestration | `python test/python/test_virtual_os_boot.py` |
| Lifecycle CLI | `python test/python/test_virtual_os_cli.py` |
| VFS adapter | `python test/python/test_virtual_os_vfs_adapter.py` |
| Knowledge adapter | `python test/python/test_virtual_os_knowledge_adapter.py` |
| Compute adapter | `python test/python/test_virtual_os_compute_adapter.py` |
| Security model | `python test/python/test_virtual_os_security_contracts.py` |
| Observability model | `python test/python/test_virtual_os_observability.py` |
| Process scheduler | `python test/python/test_virtual_os_process_scheduler.py` |
| Offline mode | `python test/python/test_virtual_os_offline_mode.py` |
| MCP++ profile | `python test/mcp_plus_plus/test_virtual_os_mcp_conformance.py` |
| Node daemon manager | `node test/js/test_virtual_os_daemon_manager.js` |
| Health dashboard | `node test/js/test_virtual_os_health_dashboard.js` |
| Descriptor launcher | `node test/js/test_virtual_os_descriptor_launcher.js` |
| Integration workflows | `python test/integration/test_virtual_os_storage_dataset_compute.py` |
| Performance smoke | `python test/performance/test_virtual_os_baseline.py --smoke` |
| Chaos smoke | `python test/chaos/test_virtual_os_failure_modes.py --smoke` |

When a command imports `hallucinate_app.virtual_os`, set `PYTHONPATH=python` if
your environment does not already include the repository Python package.

## Coding Conventions

Follow these conventions for Virtual AI OS changes:

- Prefer existing contracts and helpers over new shapes. Add a new abstraction
  only when the existing domain module cannot represent the boundary clearly.
- Keep edits scoped to the domain being changed. Do not update submodule SHAs,
  generated artifacts, or shared dependency paths unless the task explicitly
  requires it.
- Keep contract payloads immutable dataclasses or enums where practical.
- Keep config files deterministic and reviewable. Do not move daemon launch
  commands out of `config/virtual_ai_os_daemons.json` without an ADR.
- Keep security-sensitive values out of status, logs, dashboard state, issue
  reports, descriptors, and test snapshots. Use redaction helpers for errors
  and payloads.
- Validate untrusted descriptor packs before routing them into dashboard
  runtime code.
- Use mocked adapters and injected supervisors for fast tests. Live daemon,
  browser, network, and heavy model checks belong outside the fast path unless
  the task explicitly promotes them.
- Preserve baseline ownership: top-level submodule pins belong in
  `config/submodule_integration_baseline.json`; nested reference pins belong to
  their parent repository unless an ADR grants an exception.
- If a change affects daemon startup, MCP++ transport, permissions, descriptor
  ingestion, or rollback behavior, update the matching docs and focused tests
  in the same change.

## Release Gates

The merge gate for Virtual AI OS work is the GitHub workflow named
`Virtual AI OS Integration Gates` in
`.github/workflows/virtual-ai-os-integration.yml`. It runs on PRs and pushes
that touch OS configs, ADRs, docs, daemon code, package metadata, virtual OS
Python modules, lifecycle scripts, and Virtual AI OS tests.

Required gate phases:

1. Baseline verify: top-level submodule SHAs must match
   `config/submodule_integration_baseline.json`.
2. Submodule import smoke: expected submodule packages must import.
3. Virtual OS contract tests: component adapters and contracts must register.
4. MCP++ conformance tests: descriptors, envelopes, IDL, grants, and
   revocation behavior must match the profile.
5. Boot smoke: registry initialization, baseline validation, daemon start
   records, health rollups, and optional failure tolerance must pass.
6. Dependency drift detector: integration dependencies must not drift
   silently.
7. Nested submodule policy: only approved nested references may appear in the
   top-level component policy.
8. Selected JavaScript tests: daemon manager and baseline Node test runner must
   pass.

Before promotion or default-on developer enablement, also follow
`docs/VIRTUAL_AI_OS_RELEASE_PLAYBOOK.md`:

- Confirm the release branch contains only intended OS changes.
- Run `PYTHONPATH=python python scripts/virtual_os.py verify` and
  `PYTHONPATH=python python scripts/virtual_os.py boot --no-start`.
- Run `bash scripts/run_virtual_os_fast_checks.sh`.
- Wait for the CI gate to pass.
- Validate ordered daemon start for startup, transport, permissions, or
  descriptor changes.
- Apply the failure thresholds in the release playbook. Baseline drift,
  unhealthy required daemons, MCP++ auth regressions, unredacted secrets, and
  critical endpoint errors are release-blocking.

Rollback uses the `rollbackSha` values from
`config/submodule_integration_baseline.json`, ordered daemon stops, ordered
daemon starts with `--no-baseline` until rollback SHAs are promoted, and the
post-rollback validation commands listed in the release playbook.
