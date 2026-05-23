# Virtual AI OS Integration Todo

This backlog is intentionally machine-readable by `ipfs_datasets_py.optimizers.todo_daemon.implementation_daemon`.
Run it with:

```bash
PYTHONPATH=ipfs_datasets_py python -m ipfs_datasets_py.optimizers.todo_daemon.implementation_daemon \
  --once \
  --todo-path docs/VIRTUAL_AI_OS_INTEGRATION_TODO.md \
  --task-prefix "## OS-" \
  --state-prefix virtual_ai_os
```

Use `--implement --no-ephemeral-worktree --implementation-command "python scripts/virtual_os_todo_worker.py"` for the deterministic bootstrap tasks below.

## OS-001 Review component capabilities and integration boundaries

- status: todo
- completion: artifact
- priority: P0
- track: ops
- depends on:
- outputs: docs/VIRTUAL_AI_OS_SUBMODULE_REVIEW.md, config/virtual_ai_os_components.json
- validation: python scripts/virtual_os_todo_worker.py --check component-map
- acceptance: Every top-level submodule plus the nested MCP++ implementation has an owner role, capability list, integration contract, test seam, and major gap recorded.

## OS-002 Build the Virtual AI OS integration test matrix

- status: todo
- completion: artifact
- priority: P0
- track: quality
- depends on: OS-001
- outputs: docs/VIRTUAL_AI_OS_TEST_STRATEGY.md, config/virtual_ai_os_test_matrix.json
- validation: python scripts/virtual_os_todo_worker.py --check test-matrix
- acceptance: Test matrix covers smoke, contract, daemon, MCP++, storage, GraphRAG, inference, UI, security, performance, and release gates across all component submodules.

## OS-003 Define the Virtual AI OS kernel contract

- status: todo
- completion: artifact
- priority: P0
- track: runtime
- depends on: OS-001, OS-002
- outputs: docs/adr/ADR-001-virtual-ai-os-kernel-contract.md, python/hallucinate_app/virtual_os/contracts.py
- validation: python -m py_compile python/hallucinate_app/virtual_os/contracts.py
- acceptance: Contract defines process, service, capability, storage, event, identity, and resource abstractions that each submodule can implement without direct cross-module imports.

## OS-004 Add component adapter registry

- status: todo
- completion: artifact
- priority: P0
- track: runtime
- depends on: OS-003
- outputs: python/hallucinate_app/virtual_os/registry.py, test/python/test_virtual_os_registry.py
- validation: python test/python/test_virtual_os_registry.py
- acceptance: Registry discovers adapters for ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py, swissknife, and MCP++ with explicit capability metadata and health states.

## OS-005 Add submodule contract smoke tests

- status: todo
- completion: artifact
- priority: P0
- track: quality
- depends on: OS-004
- outputs: test/python/test_virtual_os_submodule_contracts.py
- validation: python test/python/test_virtual_os_submodule_contracts.py
- acceptance: Tests verify importability, declared versions or SHAs, adapter registration, health status shape, and graceful degradation when optional dependencies are absent.

## OS-006 Normalize daemon launch contracts

- status: todo
- completion: artifact
- priority: P0
- track: ops
- depends on: OS-004
- outputs: config/virtual_ai_os_daemons.json, hallucinate_app/node/virtual_os_daemon_manager.js, test/js/test_virtual_os_daemon_manager.js
- validation: node test/js/test_virtual_os_daemon_manager.js
- acceptance: Daemon manager launches and health-checks IPFS Kit, IPFS Datasets, IPFS Accelerate, SwissKnife, and MCP++ endpoints using one config schema.

## OS-007 Define MCP++ service mesh profile

- status: todo
- completion: artifact
- priority: P0
- track: agent
- depends on: OS-003
- outputs: docs/adr/ADR-002-mcp-plus-plus-service-mesh.md, config/mcp_plus_plus_profile.json
- validation: python -m json.tool config/mcp_plus_plus_profile.json >/dev/null
- acceptance: Profile defines transport, IDL, envelope, UCAN delegation, event DAG, scheduler, and descriptor requirements for all services.

## OS-008 Add MCP++ conformance tests

- status: todo
- completion: artifact
- priority: P0
- track: quality
- depends on: OS-007
- outputs: test/mcp_plus_plus/test_virtual_os_mcp_conformance.py
- validation: python test/mcp_plus_plus/test_virtual_os_mcp_conformance.py
- acceptance: Tests validate descriptor schema, capability routing, envelope signing placeholders, event DAG ordering, and fallback behavior without live network dependencies.

## OS-009 Define virtual filesystem and content addressing contract

- status: todo
- completion: artifact
- priority: P0
- track: data
- depends on: OS-003
- outputs: docs/adr/ADR-003-virtual-filesystem-and-content-addressing.md, python/hallucinate_app/virtual_os/vfs.py
- validation: python -m py_compile python/hallucinate_app/virtual_os/vfs.py
- acceptance: Contract maps POSIX-like paths, CIDs, IPLD blocks, metadata index rows, and dataset artifacts into one API backed by ipfs_kit_py.

## OS-010 Add VFS adapter tests

- status: todo
- completion: artifact
- priority: P1
- track: quality
- depends on: OS-009
- outputs: test/python/test_virtual_os_vfs_adapter.py
- validation: python test/python/test_virtual_os_vfs_adapter.py
- acceptance: Tests cover add, cat, stat, list, metadata lookup, missing backend fallback, and content-addressed idempotence using mocks.

## OS-011 Define knowledge fabric contract

- status: todo
- completion: artifact
- priority: P0
- track: graphrag
- depends on: OS-003
- outputs: docs/adr/ADR-004-knowledge-fabric-contract.md, python/hallucinate_app/virtual_os/knowledge.py
- validation: python -m py_compile python/hallucinate_app/virtual_os/knowledge.py
- acceptance: Contract exposes dataset loading, GraphRAG query, knowledge graph entity operations, vector search, provenance, and audit hooks.

## OS-012 Add knowledge fabric adapter tests

- status: todo
- completion: artifact
- priority: P1
- track: quality
- depends on: OS-011
- outputs: test/python/test_virtual_os_knowledge_adapter.py
- validation: python test/python/test_virtual_os_knowledge_adapter.py
- acceptance: Tests cover dataset load, query, graph entity CRUD, provenance, and fallback behavior when ipfs_datasets_py extras are unavailable.

## OS-013 Define model compute runtime contract

- status: todo
- completion: artifact
- priority: P0
- track: runtime
- depends on: OS-003
- outputs: docs/adr/ADR-005-model-compute-runtime.md, python/hallucinate_app/virtual_os/compute.py
- validation: python -m py_compile python/hallucinate_app/virtual_os/compute.py
- acceptance: Contract supports model load, inference, embedding, hardware profile, queue state, cancellation, and resource accounting via ipfs_accelerate_py.

## OS-014 Add model compute contract tests

- status: todo
- completion: artifact
- priority: P1
- track: quality
- depends on: OS-013
- outputs: test/python/test_virtual_os_compute_adapter.py
- validation: python test/python/test_virtual_os_compute_adapter.py
- acceptance: Tests cover sync and async inference, mocked hardware profiles, multimodal task metadata, timeout, cancellation, and error normalization.

## OS-015 Define agent process and scheduler model

- status: todo
- completion: artifact
- priority: P0
- track: agent
- depends on: OS-003, OS-007, OS-013
- outputs: docs/adr/ADR-006-agent-process-scheduler.md, python/hallucinate_app/virtual_os/processes.py
- validation: python -m py_compile python/hallucinate_app/virtual_os/processes.py
- acceptance: Model defines process lifecycle, task queues, workflow DAGs, resource claims, identity, capability grants, and restart policy.

## OS-016 Add agent scheduler tests

- status: todo
- completion: artifact
- priority: P1
- track: quality
- depends on: OS-015
- outputs: test/python/test_virtual_os_process_scheduler.py
- validation: python test/python/test_virtual_os_process_scheduler.py
- acceptance: Tests cover process creation, dependency ordering, MCP++ task queue delegation, retry, cancellation, and event DAG emission.

## OS-017 Define identity, auth, and capability model

- status: todo
- completion: artifact
- priority: P0
- track: privacy
- depends on: OS-003, OS-007
- outputs: docs/adr/ADR-007-identity-auth-capabilities.md, python/hallucinate_app/virtual_os/security.py
- validation: python -m py_compile python/hallucinate_app/virtual_os/security.py
- acceptance: Model aligns UCAN, DID/key storage, local capability grants, daemon permissions, submodule credentials, and audit events.

## OS-018 Add auth and capability tests

- status: todo
- completion: artifact
- priority: P1
- track: quality
- depends on: OS-017
- outputs: test/python/test_virtual_os_security_contracts.py
- validation: python test/python/test_virtual_os_security_contracts.py
- acceptance: Tests cover grant validation, revocation lookup, denied operations, redacted error logging, and offline operation.

## OS-019 Define event bus and observability model

- status: todo
- completion: artifact
- priority: P0
- track: ops
- depends on: OS-003
- outputs: docs/adr/ADR-008-event-bus-observability.md, python/hallucinate_app/virtual_os/events.py
- validation: python -m py_compile python/hallucinate_app/virtual_os/events.py
- acceptance: Model defines structured events, metrics, trace IDs, daemon heartbeat, MCP event DAG mapping, and dashboard consumption.

## OS-020 Add observability integration tests

- status: todo
- completion: artifact
- priority: P1
- track: quality
- depends on: OS-019
- outputs: test/python/test_virtual_os_observability.py
- validation: python test/python/test_virtual_os_observability.py
- acceptance: Tests verify metric shape, event emission, health rollup, degraded components, and dashboard-safe serialization.

## OS-021 Add OS boot sequence orchestrator

- status: todo
- completion: artifact
- priority: P0
- track: runtime
- depends on: OS-004, OS-006, OS-019
- outputs: python/hallucinate_app/virtual_os/boot.py, test/python/test_virtual_os_boot.py
- validation: python test/python/test_virtual_os_boot.py
- acceptance: Boot sequence initializes registry, validates baseline SHAs, starts required daemons, records health, and tolerates optional component failure.

## OS-022 Add OS service lifecycle CLI

- status: todo
- completion: artifact
- priority: P1
- track: ops
- depends on: OS-021
- outputs: scripts/virtual_os.py, test/python/test_virtual_os_cli.py
- validation: python test/python/test_virtual_os_cli.py
- acceptance: CLI exposes status, boot, stop, restart, verify, test-matrix, and rollback commands with JSON output.

## OS-023 Wire desktop dashboard to OS health

- status: todo
- completion: artifact
- priority: P1
- track: ui
- depends on: OS-006, OS-019
- outputs: hallucinate_app/node/dashboard/virtual_os_health_dashboard.js, test/js/test_virtual_os_health_dashboard.js
- validation: node test/js/test_virtual_os_health_dashboard.js
- acceptance: Dashboard renders component health, daemon status, MCP++ mesh status, and degraded mode reason without requiring live heavy dependencies.

## OS-024 Wire SwissKnife descriptor UI into Hallucinate shell

- status: todo
- completion: artifact
- priority: P1
- track: ui
- depends on: OS-007, OS-023
- outputs: hallucinate_app/node/dashboard/virtual_os_descriptor_launcher.js, test/js/test_virtual_os_descriptor_launcher.js
- validation: node test/js/test_virtual_os_descriptor_launcher.js
- acceptance: Launcher consumes SwissKnife descriptor packs, validates schema, and routes app descriptors to the Hallucinate dashboard runtime.

## OS-025 Add storage to dataset to compute workflow test

- status: todo
- completion: artifact
- priority: P0
- track: quality
- depends on: OS-010, OS-012, OS-014, OS-021
- outputs: test/integration/test_virtual_os_storage_dataset_compute.py
- validation: python test/integration/test_virtual_os_storage_dataset_compute.py
- acceptance: End-to-end mocked flow stores content, loads dataset metadata, runs embedding/inference, writes result artifact, and emits provenance.

## OS-026 Add GraphRAG to model toolchain workflow test

- status: todo
- completion: artifact
- priority: P1
- track: quality
- depends on: OS-012, OS-014, OS-016
- outputs: test/integration/test_virtual_os_graphrag_agent_workflow.py
- validation: python test/integration/test_virtual_os_graphrag_agent_workflow.py
- acceptance: Workflow retrieves graph context, schedules model inference, stores answer provenance, and validates scheduler events.

## OS-027 Add MCP++ mesh interoperability test

- status: todo
- completion: artifact
- priority: P0
- track: quality
- depends on: OS-008, OS-016, OS-018
- outputs: test/integration/test_virtual_os_mcp_mesh_interop.py
- validation: python test/integration/test_virtual_os_mcp_mesh_interop.py
- acceptance: Test verifies descriptor handshake, capability grant, task submission, result envelope, revocation path, and event DAG ordering with mocks.

## OS-028 Add daemon crash and recovery test

- status: todo
- completion: artifact
- priority: P1
- track: quality
- depends on: OS-006, OS-021
- outputs: test/integration/test_virtual_os_daemon_recovery.py
- validation: python test/integration/test_virtual_os_daemon_recovery.py
- acceptance: Test simulates daemon crash, stale heartbeat, restart, degraded status, and recovery event emission.

## OS-029 Add package dependency drift detector

- status: todo
- completion: artifact
- priority: P1
- track: ops
- depends on: OS-001
- outputs: scripts/check_virtual_os_dependency_drift.py, test/python/test_virtual_os_dependency_drift.py
- validation: python test/python/test_virtual_os_dependency_drift.py
- acceptance: Detector compares Python and Node dependency manifests across submodules, reports conflicts, and emits actionable JSON.

## OS-030 Add nested submodule policy and verifier

- status: todo
- completion: artifact
- priority: P1
- track: ops
- depends on: OS-001
- outputs: docs/adr/ADR-009-nested-submodule-policy.md, scripts/check_nested_submodules.py, test/python/test_nested_submodule_policy.py
- validation: python test/python/test_nested_submodule_policy.py
- acceptance: Policy distinguishes top-level integration pins from nested reference pins and verifies MCP++ exception paths.

## OS-031 Add virtual OS CI workflow gates

- status: todo
- completion: artifact
- priority: P0
- track: quality
- depends on: OS-005, OS-008, OS-021
- outputs: .github/workflows/virtual-ai-os-integration.yml
- validation: python -m py_compile scripts/verify_submodule_imports.py
- acceptance: Workflow runs baseline verify, contract tests, integration smoke tests, dependency drift detector, nested submodule policy, and selected JS tests.

## OS-032 Add local fast test profile

- status: todo
- completion: artifact
- priority: P1
- track: quality
- depends on: OS-031
- outputs: scripts/run_virtual_os_fast_checks.sh
- validation: bash scripts/run_virtual_os_fast_checks.sh --dry-run
- acceptance: Script lists and optionally runs the fast gate subset needed before pushing Virtual AI OS integration changes.

## OS-033 Add release and rollback playbook

- status: todo
- completion: artifact
- priority: P1
- track: ops
- depends on: OS-021, OS-031
- outputs: docs/VIRTUAL_AI_OS_RELEASE_PLAYBOOK.md
- validation: test -s docs/VIRTUAL_AI_OS_RELEASE_PLAYBOOK.md
- acceptance: Playbook covers staged rollout, failure thresholds, rollback SHAs, daemon stop/start order, and validation after rollback.

## OS-034 Add security threat model

- status: todo
- completion: artifact
- priority: P0
- track: privacy
- depends on: OS-017
- outputs: docs/VIRTUAL_AI_OS_THREAT_MODEL.md
- validation: test -s docs/VIRTUAL_AI_OS_THREAT_MODEL.md
- acceptance: Threat model covers local code execution, model/plugin supply chain, IPFS content trust, UCAN/DID compromise, MCP++ transport, and dashboard surfaces.

## OS-035 Add sandbox and resource isolation prototype

- status: todo
- completion: artifact
- priority: P1
- track: runtime
- depends on: OS-015, OS-017
- outputs: python/hallucinate_app/virtual_os/sandbox.py, test/python/test_virtual_os_sandbox.py
- validation: python test/python/test_virtual_os_sandbox.py
- acceptance: Prototype enforces command allowlists, resource limits metadata, storage capability scopes, and explicit unsafe-operation denial.

## OS-036 Add model and data provenance ledger

- status: todo
- completion: artifact
- priority: P1
- track: data
- depends on: OS-009, OS-011, OS-019
- outputs: python/hallucinate_app/virtual_os/provenance.py, test/python/test_virtual_os_provenance.py
- validation: python test/python/test_virtual_os_provenance.py
- acceptance: Ledger records CID, dataset, model, prompt, output, agent process, policy decision, and event references with stable JSON serialization.

## OS-037 Add offline-first boot mode

- status: todo
- completion: artifact
- priority: P2
- track: runtime
- depends on: OS-021, OS-036
- outputs: python/hallucinate_app/virtual_os/offline.py, test/python/test_virtual_os_offline_mode.py
- validation: python test/python/test_virtual_os_offline_mode.py
- acceptance: Offline mode boots with local caches, disables network-dependent transports, and reports capability degradation.

## OS-038 Add performance baseline harness

- status: todo
- completion: artifact
- priority: P2
- track: quality
- depends on: OS-025, OS-026
- outputs: test/performance/test_virtual_os_baseline.py, docs/VIRTUAL_AI_OS_PERFORMANCE_BASELINE.md
- validation: python test/performance/test_virtual_os_baseline.py --smoke
- acceptance: Harness records storage, dataset, inference, and MCP++ scheduling latency with smoke thresholds suitable for CI.

## OS-039 Add chaos test harness

- status: todo
- completion: artifact
- priority: P2
- track: quality
- depends on: OS-028
- outputs: test/chaos/test_virtual_os_failure_modes.py
- validation: python test/chaos/test_virtual_os_failure_modes.py --smoke
- acceptance: Harness simulates daemon death, missing submodule, corrupt descriptor, denied capability, network unavailable, and stale cache conditions.

## OS-040 Add developer architecture guide

- status: todo
- completion: artifact
- priority: P2
- track: ops
- depends on: OS-003, OS-021, OS-033
- outputs: docs/VIRTUAL_AI_OS_DEVELOPER_GUIDE.md
- validation: test -s docs/VIRTUAL_AI_OS_DEVELOPER_GUIDE.md
- acceptance: Guide explains component roles, adapter boundaries, test commands, daemon workflows, coding conventions, and release gates.
