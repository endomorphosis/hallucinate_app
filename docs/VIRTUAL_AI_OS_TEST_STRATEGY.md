# Virtual AI OS Test Strategy

Generated: 2026-05-22T15:26:06+00:00

## Gate Model

- P0 tests block every Virtual AI OS integration merge.
- P1 tests block promotion to default-on developer builds.
- P2 tests run in scheduled or release-candidate jobs until stable.

## Test Matrix

| ID | Category | Priority | Components | Description |
|---|---|---|---|---|
| T001 | baseline | P0 | all | Verify top-level submodule SHAs match baseline manifest |
| T002 | contract | P0 | all | Import and register every Virtual AI OS adapter |
| T003 | storage | P0 | ipfs_kit_py | Mock VFS add/cat/stat/list through ipfs_kit_py adapter |
| T004 | storage | P1 | ipfs_kit_py | Validate metadata index fallback and error normalization |
| T005 | knowledge | P0 | ipfs_datasets_py | Mock dataset load and GraphRAG query shape |
| T006 | knowledge | P1 | ipfs_datasets_py | Validate provenance emission for dataset operations |
| T007 | compute | P0 | ipfs_accelerate_py | Mock model load and inference through accelerate adapter |
| T008 | compute | P1 | ipfs_accelerate_py | Validate hardware profile fallback without GPU dependencies |
| T009 | mcp | P0 | mcp_plus_plus, swissknife | Validate MCP++ descriptor, envelope, and IDL schema |
| T010 | mcp | P0 | mcp_plus_plus, swissknife | Validate UCAN grant and revocation behavior with mocks |
| T011 | daemon | P0 | all | Launch daemon manager against mocked service commands |
| T012 | daemon | P1 | all | Simulate crash, stale heartbeat, restart, and degraded status |
| T013 | workflow | P0 | ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py | Storage to dataset to compute end-to-end mocked flow |
| T014 | workflow | P1 | ipfs_datasets_py, ipfs_accelerate_py | GraphRAG to model to provenance workflow |
| T015 | ui | P1 | swissknife | Validate SwissKnife descriptor pack ingestion in Hallucinate shell |
| T016 | ui | P1 | swissknife, all | Render OS health dashboard with degraded component states |
| T017 | security | P0 | all | Deny storage and command operations without capability grant |
| T018 | security | P0 | all | Verify secrets and credentials are redacted in events |
| T019 | performance | P2 | all | Smoke latency baseline for storage, query, inference, and scheduling |
| T020 | chaos | P2 | all | Missing submodule, corrupt descriptor, no network, denied capability |

## Required CI Phases

1. Baseline and dependency drift checks.
2. Pure Python adapter contract tests with mocks.
3. Node dashboard and descriptor contract tests.
4. MCP++ schema, envelope, and capability tests.
5. Mocked cross-component workflow tests.
6. Optional live daemon, browser, and heavy model suites outside the fast path.

## Work Remaining

- Add the Virtual AI OS adapter package and contract tests.
- Split live daemon tests from mocked daemon manager tests.
- Add descriptor fixture packs for SwissKnife UI integration.
- Define merge-blocking thresholds for latency, retry rate, and degraded services.
- Add scheduled chaos and performance jobs after the fast suite is stable.
