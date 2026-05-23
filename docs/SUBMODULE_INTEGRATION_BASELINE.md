# Submodule Integration Baseline (2026-05-22)

This document freezes the current integration baseline for:

- `ipfs_accelerate_py` → `ff61c14b4df44529ff6f73efa5e26fadeda649d5`
- `ipfs_datasets_py` → `14755236c1831a028ac8dc2cfcbfaa0aa5870bf4`
- `ipfs_kit_py` → `3133d4fdc85a885ba7d776465bdee48f7a867e01`
- `swissknife` → `5b4598e15709203c0fe2265fdab2f51ea822b0f2`

MCP++ note:

- The exact URL `https://github.com/endomorphosis/mcp_plus_plus` returned `Repository not found`.
- The accessible MCP++ repository is `https://github.com/endomorphosis/Mcp-Plus-Plus.git` / `https://github.com/endomorphosis/mcp-plus-plus.git`.
- It is currently present as the nested submodule `ipfs_accelerate_py/ipfs_accelerate_py/mcplusplus` and is pinned to `29343be704da4e193ff143bac7daae9b0f98435d`, which matches its current `main` HEAD at the time of this update.

Rollback SHAs are tracked in:

- `config/submodule_integration_baseline.json`

Operational helper:

- `python scripts/manage_submodule_baseline.py status`
- `python scripts/manage_submodule_baseline.py apply-baseline`
- `python scripts/manage_submodule_baseline.py apply-rollback`

Virtual AI OS integration backlog:

- `docs/VIRTUAL_AI_OS_INTEGRATION_TODO.md`
- `docs/VIRTUAL_AI_OS_SUBMODULE_REVIEW.md`
- `docs/VIRTUAL_AI_OS_TEST_STRATEGY.md`

---

## 1) Change intake and impact mapping

### `ipfs_accelerate_py` (`7293488f` → `ff61c14b`)

| Area | Summary | Classification |
|---|---|---|
| Worker/task model handling | Added multimodal task type support and environment-variable-driven worker behavior. | Additive |
| MCP tool registration | Extended tool registration metadata/options in MCP path. | Additive |
| Deployment/runtime scaffolding | Additional deployment scripts and service-related updates. | Internal |
| Test/docs breadth | Significant expansion of MCP/server tests and docs. | Test-only / Internal |

### `ipfs_datasets_py` (`04363beb` → `14755236`)

| Area | Summary | Classification |
|---|---|---|
| Scraper pipeline | Additional checkpoint progress signals, timeout diagnostics, and state scraper logging. | Additive |
| Logic/theorem tooling | Updates to F-logic optimizer, modal compiler/decompiler paths, legal modal parsing, and bridge layers. | Additive / Internal |
| Daemon execution | Implementation daemon command/context handling changed for Codex-oriented execution. | Internal |
| Test/data expansion | Added unit coverage and generated autoencoder task-vector artifacts. | Test-only / Generated data |

### `ipfs_kit_py` (`a433540e` → `3133d4fd`)

| Area | Summary | Classification |
|---|---|---|
| API load behavior | Enhanced `IPFSSimpleAPI` loading with fallback behavior. | Additive |
| Dependency bootstrap | Additional dependency/bootstrap updates for runtime compatibility. | Internal |
| MCP/server surfaces | Broader MCP and CLI path churn. | Internal |
| Test/docs expansion | Additional docs/test content. | Test-only / Internal |

### `swissknife` (`f9dcf8e5` → `5b4598e1`)

| Area | Summary | Classification |
|---|---|---|
| MCP++ UI/UX support | Added descriptor runtime, schema-driven UI generation, ORB client/routing, descriptor inspector, and template policy support. | Additive |
| MCP++ transport/security | Added WebSocket/HTTPS/WebRTC transport work, UCAN auth/revocation behavior, policy/scheduler, envelope, IDL, and event DAG services. | Additive / Security-sensitive |
| IPFS descriptor packs | Added descriptor packs for `ipfs_accelerate_py` and `ipfs_datasets_py` UI integration. | Additive |
| Tests/docs expansion | Added MCP++ tests, implementation plan docs, conformance matrix, and automation docs refreshes. | Test-only / Docs |

### Breaking-risk summary

No hard-breaking change was confirmed in this monorepo run, but **constructor signatures, endpoint payload conventions, CLI launch semantics, generated UI descriptor contracts, and MCP++ auth/transport behavior are at risk of drift** and are handled via compatibility shims plus the staged rollout gates below.

---

## 2) Compatibility contract review (monorepo touchpoints)

| Submodule | Monorepo touchpoint(s) | Current call pattern | Updated behavior handling |
|---|---|---|---|
| `ipfs_datasets_py` | `hallucinate_app/python/hallucinate_app/ipfs_datasets.py` | Direct constructor `ipfs_datasets_py.ipfs_datasets_py(resources, metadata)` | Compatibility constructor fallback chain (`ipfs_datasets_py`, `IPFSDatasetsPy`, `ipfs_datasets`) |
| `ipfs_accelerate_py` | `hallucinate_app/python/hallucinate_app/ipfs_accelerate_server.py` | Direct import/class call + endpoint-specific calls | Compatibility constructor fallback chain + async/sync resolution + endpoint telemetry |
| `ipfs_kit_py` | `python/hallucinate_app/ipfs_kit_bridge.py` | Direct `IPFSSimpleAPI(config_path=..., role=...)` and direct `method(**params)` | Constructor fallback + signature fallback (`kwargs` → `dict` payload → no-arg) with retry accounting |
| `swissknife` | `hallucinate_app/node/mcp_daemon_manager.js`, dashboard/web descriptor runtime touchpoints | SwissKnife/MCP assets consumed as a submodule and daemon integration peer | Validate MCP++ descriptor packs, generated UI runtime, auth/transport behavior, and daemon compatibility before promotion |

### High-risk seams flagged

1. **Auth/capability flow**: MCP tool registration evolution can alter permission and invocation expectations.
2. **IPC schemas**: Endpoint and method payload shape drift (`kwargs` vs dict payload) between versions.
3. **Metadata/index operations**: Any shape drift in `ArrowMetadataIndex` lookups/exports can break bridge assumptions.
4. **Model-serving endpoints**: Request/response schema and async behavior drift in accelerate server integrations.
5. **MCP++ generated UI contracts**: SwissKnife descriptor contracts can drift from monorepo dashboard/runtime assumptions.
6. **MCP++ auth/transport behavior**: UCAN revocation, WebRTC/WebSocket/HTTPS transport, and ORB routing require explicit smoke coverage.

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
- Updated `swissknife` into the baseline manifest so postinstall drift detection covers all top-level submodules used by this repo.

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

### Staged rollout gate implementation

Stage 1 (local/dev):

1. `python scripts/manage_submodule_baseline.py verify-baseline`
2. `python test/python/test_submodule_compatibility.py`
3. `npm test`
4. `npm run test:python`

Stage 2 (CI soak):

- Required workflow: `.github/workflows/submodule-integration-gates.yml`
- Required checks:
  - Baseline drift block (`verify-baseline`)
  - Submodule-native compile smoke (`ipfs_accelerate_py`, `ipfs_datasets_py`, `ipfs_kit_py`)
  - Contract tests (`test/python/test_submodule_compatibility.py`)
  - Bridge/server smoke (`npm test`, `npm run test:python`, `npm run test:bridge`)

Stage 3 (controlled merge + watch window):

- Merge only after all Stage 2 checks pass.
- Monitor integration telemetry (`/integration_metrics`) during post-merge soak.

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

### Rollout thresholds (pause/rollback triggers)

During CI soak and post-merge watch window, use these guardrails:

| Signal | Threshold | Action |
|---|---|---|
| endpoint error rate | `errors > 0` for critical endpoints (`load_model`, `inference`) | pause rollout and investigate |
| retry amplification | retries/calls > 0.20 for any endpoint | pause promotion and inspect compatibility fallback path |
| latency regression | avg latency increase > 50% vs previous successful soak | require explicit approval before promotion |
| method signature failures (`ipfs_kit_bridge`) | `method_signature_failures > 0` | block promotion until fixed or approved exception |

Use `/integration_metrics` plus bridge compatibility counters to validate these thresholds.

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

### Rollback drill checklist (non-prod)

- Run `python scripts/manage_submodule_baseline.py status`.
- Run `python scripts/manage_submodule_baseline.py apply-rollback`.
- Re-run smoke checks (`npm test`, `npm run test:python`, `npm run test:bridge`).
- Confirm regressions clear and expected rollback SHAs are active.
- Record drill result and date in release checklist/release notes.

### Promotion checklist

- [ ] `verify-baseline` passes.
- [ ] Submodule-native compile smoke passes.
- [ ] Contract tests pass.
- [ ] Bridge/server smoke checks pass.
- [ ] Telemetry thresholds are within limits.
- [ ] Rollback readiness confirmed (drill completed or recently validated).
- [ ] Baseline doc + manifest updated together (when SHAs changed).

---

## Unresolved upstream items

| Item | Owner | Follow-up |
|---|---|---|
| Full submodule-native suite selection beyond compile-smoke gate | Submodule maintainers + monorepo maintainers | Expand from compile-smoke to curated per-submodule test subsets as dependencies stabilize |
