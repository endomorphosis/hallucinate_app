# Submodule Integration Baseline (2026-05-20)

This document freezes the current integration baseline for:

- `ipfs_accelerate_py` → `ff61c14b4df44529ff6f73efa5e26fadeda649d5`
- `ipfs_datasets_py` → `04363beba3e65f07afa81dadfb966d56d093ea3e`
- `ipfs_kit_py` → `3133d4fdc85a885ba7d776465bdee48f7a867e01`

Rollback SHAs are tracked in:

- `config/submodule_integration_baseline.json`

Operational helper:

- `python scripts/manage_submodule_baseline.py status`
- `python scripts/manage_submodule_baseline.py apply-baseline`
- `python scripts/manage_submodule_baseline.py apply-rollback`

---

## 1) Change intake and impact mapping

### `ipfs_accelerate_py` (`7293488f` → `ff61c14b`)

| Area | Summary | Classification |
|---|---|---|
| Worker/task model handling | Added multimodal task type support and environment-variable-driven worker behavior. | Additive |
| MCP tool registration | Extended tool registration metadata/options in MCP path. | Additive |
| Deployment/runtime scaffolding | Additional deployment scripts and service-related updates. | Internal |
| Test/docs breadth | Significant expansion of MCP/server tests and docs. | Test-only / Internal |

### `ipfs_datasets_py` (`13be1de5` → `04363beb`)

| Area | Summary | Classification |
|---|---|---|
| Scraper pipeline | Refactors with improved timeout handling and resilience in data collection paths. | Additive |
| GraphRAG-related modules | Structural updates across GraphRAG and query workflows. | Internal / Additive |
| MCP/dashboard assets | Broader MCP and dashboard evolution. | Internal |
| Test/docs expansion | Increased test coverage and generated docs content. | Test-only / Internal |

### `ipfs_kit_py` (`a433540e` → `3133d4fd`)

| Area | Summary | Classification |
|---|---|---|
| API load behavior | Enhanced `IPFSSimpleAPI` loading with fallback behavior. | Additive |
| Dependency bootstrap | Additional dependency/bootstrap updates for runtime compatibility. | Internal |
| MCP/server surfaces | Broader MCP and CLI path churn. | Internal |
| Test/docs expansion | Additional docs/test content. | Test-only / Internal |

### Breaking-risk summary

No hard-breaking change was confirmed in this monorepo run, but **constructor signatures, endpoint payload conventions, and CLI launch semantics are at risk of drift** and are handled via compatibility shims in this PR.

---

## 2) Compatibility contract review (monorepo touchpoints)

| Submodule | Monorepo touchpoint(s) | Current call pattern | Updated behavior handling |
|---|---|---|---|
| `ipfs_datasets_py` | `hallucinate_app/python/hallucinate_app/ipfs_datasets.py` | Direct constructor `ipfs_datasets_py.ipfs_datasets_py(resources, metadata)` | Compatibility constructor fallback chain (`ipfs_datasets_py`, `IPFSDatasetsPy`, `ipfs_datasets`) |
| `ipfs_accelerate_py` | `hallucinate_app/python/hallucinate_app/ipfs_accelerate_server.py` | Direct import/class call + endpoint-specific calls | Compatibility constructor fallback chain + async/sync resolution + endpoint telemetry |
| `ipfs_kit_py` | `python/hallucinate_app/ipfs_kit_bridge.py` | Direct `IPFSSimpleAPI(config_path=..., role=...)` and direct `method(**params)` | Constructor fallback + signature fallback (`kwargs` → `dict` payload → no-arg) with retry accounting |

### High-risk seams flagged

1. **Auth/capability flow**: MCP tool registration evolution can alter permission and invocation expectations.
2. **IPC schemas**: Endpoint and method payload shape drift (`kwargs` vs dict payload) between versions.
3. **Metadata/index operations**: Any shape drift in `ArrowMetadataIndex` lookups/exports can break bridge assumptions.
4. **Model-serving endpoints**: Request/response schema and async behavior drift in accelerate server integrations.

---

## 3) Integration hardening implemented

- Added shared compatibility helper module:
  - `hallucinate_app/python/hallucinate_app/submodule_compat.py`
  - `python/hallucinate_app/submodule_compat.py`
- Updated integrations to use constructor and call-shape fallbacks:
  - `hallucinate_app/python/hallucinate_app/ipfs_datasets.py`
  - `hallucinate_app/python/hallucinate_app/ipfs_accelerate_server.py`
  - `python/hallucinate_app/ipfs_kit_bridge.py`
- Added baseline + rollback tracking:
  - `config/submodule_integration_baseline.json`
  - `scripts/manage_submodule_baseline.py`

---

## 4) Test strategy and rollout gates

### Submodule-native checks (recommended during CI branch soak)

- `ipfs_accelerate_py`: run MCP/server-focused test subsets for active integration paths.
- `ipfs_datasets_py`: run scraper timeout + GraphRAG integration subsets.
- `ipfs_kit_py`: run high-level API + metadata-index subsets.

### Monorepo checks (layered)

1. Unit/contract: compatibility helper tests + baseline manifest integrity.
2. Integration: Python bridge/model-serving and metadata/index flows.
3. Dashboard/UI: daemon manager and dashboard smoke checks.
4. E2E critical paths: model load + inference + dataset path checks.

### Merge gates

- No new failing tests in touched paths.
- No auth regression in MCP daemon startup paths.
- Build/package flow remains stable.
- Baseline SHAs remain synchronized with `config/submodule_integration_baseline.json`.

---

## 5) Observability and safety controls

- Temporary integration telemetry added on updated call paths:
  - `ipfs_accelerate_server.py`: per-endpoint calls/errors/retries/latency + `/integration_metrics`.
  - `ipfs_datasets.py`: dataset load call/error/latency aggregate metrics.
  - `ipfs_kit_bridge.py`: signature retry/failure counters for call-shape fallback.
- Rollback switch implemented via baseline management script and manifest.
- Rollout stages:
  - local/dev verification
  - CI branch soak
  - mainline merge
  - post-merge monitoring window using telemetry endpoint/log metrics

---

## 6) Operational playbook (contributors)

### Upgrade sync

1. `git submodule update --init ipfs_accelerate_py ipfs_datasets_py ipfs_kit_py`
2. `python scripts/manage_submodule_baseline.py status`
3. Install dependencies:
   - `npm install`
   - `npm run install:submodules`

### Validate

1. `npm run build:web`
2. `npm test`
3. `npm run test:python`
4. `python test/python/test_submodule_compatibility.py`

### Troubleshoot

- If constructor/signature errors appear:
  - confirm you are on baseline SHAs (`status` command above)
  - verify Python path resolves local package (`python` vs `hallucinate_app/python`)
- If regressions persist:
  - execute rollback:
    - `python scripts/manage_submodule_baseline.py apply-rollback`

---

## Unresolved upstream items

| Item | Owner | Follow-up |
|---|---|---|
| Baseline `npm test` currently fails due existing export mismatch in `test/test.js` import chain | Monorepo maintainers | Resolve separately; not introduced by submodule update |
| Baseline `npm run test:python` server startup failure in current environment | Monorepo maintainers | Stabilize test server startup and dependency prerequisites in CI |
| Full submodule-native suite selection for CI soak | Submodule maintainers + monorepo maintainers | Finalize minimal high-signal smoke subsets and lock them in workflow |
