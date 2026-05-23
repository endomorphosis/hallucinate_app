# Virtual AI OS Release and Rollback Playbook

Generated: 2026-05-22

This playbook covers promotion and rollback for the Virtual AI OS integration
tracked by `docs/VIRTUAL_AI_OS_INTEGRATION_TODO.md`. It assumes the OS boot
orchestrator, daemon config, submodule baseline manifest, and CI gates from
OS-021 and OS-031 are present.

Primary release controls:

- Baseline manifest: `config/submodule_integration_baseline.json`
- Daemon launch order source: `config/virtual_ai_os_daemons.json`
- Boot and lifecycle CLI: `python scripts/virtual_os.py`
- Baseline helper: `python scripts/manage_submodule_baseline.py`
- Fast local gate wrapper: `bash scripts/run_virtual_os_fast_checks.sh`
- CI gate: `.github/workflows/virtual-ai-os-integration.yml`

## Release Scope

The release unit is the monorepo plus the pinned top-level Virtual AI OS
submodules. Do not promote a release when local submodule SHAs differ from the
baseline manifest unless the manifest and baseline documentation were updated
as part of the same reviewed change.

Current release pins and rollback targets:

| Component | Release SHA | Rollback SHA |
|---|---|---|
| `ipfs_accelerate_py` | `ff61c14b4df44529ff6f73efa5e26fadeda649d5` | `7293488f8844e3c7af9fb7d4c6728d86a208f4da` |
| `ipfs_datasets_py` | `14755236c1831a028ac8dc2cfcbfaa0aa5870bf4` | `04363beba3e65f07afa81dadfb966d56d093ea3e` |
| `ipfs_kit_py` | `3133d4fdc85a885ba7d776465bdee48f7a867e01` | `a433540ea34e3808a7c92b6b80d88a32150f1d88` |
| `swissknife` | `5b4598e15709203c0fe2265fdab2f51ea822b0f2` | `f9dcf8e5b885f240904ff4c4cef7127c9535ea40` |

## Staged Rollout

### Stage 0: Intake Freeze

1. Confirm the release branch contains only intended Virtual AI OS changes.
2. Confirm rollback SHAs exist for every top-level submodule:

```bash
python scripts/manage_submodule_baseline.py status
python scripts/virtual_os.py rollback
```

3. Confirm daemon and component configs parse without starting services:

```bash
PYTHONPATH=python python scripts/virtual_os.py verify
PYTHONPATH=python python scripts/virtual_os.py boot --no-start
```

### Stage 1: Local Gate

Run the fast gate subset before pushing or tagging:

```bash
bash scripts/run_virtual_os_fast_checks.sh
```

At minimum, the local gate must include:

- `python scripts/manage_submodule_baseline.py verify-baseline`
- `python scripts/verify_submodule_imports.py`
- `python test/python/test_virtual_os_submodule_contracts.py`
- `python test/mcp_plus_plus/test_virtual_os_mcp_conformance.py`
- `python test/python/test_virtual_os_boot.py`
- `python scripts/check_virtual_os_dependency_drift.py`
- `python scripts/check_nested_submodules.py`
- `node test/js/test_virtual_os_daemon_manager.js`
- `npm test`

### Stage 2: CI Soak

Open the release candidate PR and wait for `Virtual AI OS Integration Gates`.
The workflow must pass on the release branch before promotion. Treat failures
in baseline drift, import smoke, contract tests, MCP++ conformance, boot smoke,
dependency drift, nested submodule policy, daemon manager tests, or selected JS
tests as release-blocking.

For changes that alter daemon startup, MCP++ transport, permissions, or
descriptor ingestion, keep the release candidate in CI soak until a second run
passes without code changes.

### Stage 3: Controlled Enablement

Start daemons in dependency order so lower-level services are available before
the shell and protocol-facing surfaces:

1. `ipfs_kit_py`
2. `ipfs_datasets_py`
3. `ipfs_accelerate_py`
4. `mcp_plus_plus`
5. `swissknife`

Use explicit starts when validating order-sensitive changes:

```bash
PYTHONPATH=python python scripts/virtual_os.py boot --daemon ipfs_kit_py --wait
PYTHONPATH=python python scripts/virtual_os.py boot --daemon ipfs_datasets_py --wait
PYTHONPATH=python python scripts/virtual_os.py boot --daemon ipfs_accelerate_py --wait
PYTHONPATH=python python scripts/virtual_os.py boot --daemon mcp_plus_plus --wait
PYTHONPATH=python python scripts/virtual_os.py boot --daemon swissknife --wait
PYTHONPATH=python python scripts/virtual_os.py status
```

If using `boot` without `--daemon`, the orchestrator follows
`config/virtual_ai_os_daemons.json`; reserve that for normal full-system boots
after ordered validation has passed.

### Stage 4: Watch Window

Hold the release in a watched state after merge or default-on enablement.
During the watch window, poll OS status and inspect integration telemetry for
critical paths:

```bash
PYTHONPATH=python python scripts/virtual_os.py status
curl -fsS http://127.0.0.1:3003/integration_metrics || true
```

Record the branch, commit SHA, submodule SHAs, gate run, watch start time, and
watch outcome in the release notes.

## Failure Thresholds

Pause promotion immediately when any release-blocking check fails, any required
daemon is unhealthy, or any top-level submodule SHA drifts from the manifest.

Rollback is required, not just pause, when one of these signals is observed in
CI soak or the watch window and cannot be fixed forward within the release
window:

| Signal | Threshold | Action |
|---|---|---|
| Baseline drift | Any `verify-baseline` failure | Block promotion; rollback if drift reached watched branch |
| Required daemon health | Any required daemon remains unhealthy after configured startup timeout | Stop rollout; rollback if caused by the release |
| Critical endpoint errors | `errors > 0` for `load_model` or `inference` | Stop rollout; inspect compute and MCP++ changes |
| Retry amplification | `retries / calls > 0.20` for any integration endpoint | Pause promotion; rollback if retries persist |
| Latency regression | Average latency increase greater than 50% against the previous successful soak | Require explicit approval or rollback |
| Method signature failures | `method_signature_failures > 0` in `ipfs_kit_bridge` counters | Block promotion until fixed |
| MCP++ auth or revocation | Any denied-valid request, accepted-revoked proof, or descriptor schema regression | Roll back unless a reviewed policy update explains it |
| Dashboard safety | Unredacted credential, proof, token, or host-secret field appears in status, logs, dashboard data, or issue output | Roll back and rotate affected credentials |

## Rollback Procedure

Rollback means returning top-level submodules to their `rollbackSha` values from
`config/submodule_integration_baseline.json`, stopping release daemons in reverse
dependency order, and validating the restored system before re-enabling traffic
or developer default-on usage.

### 1. Capture State

Before changing SHAs, capture the current state for release notes and incident
review:

```bash
git rev-parse HEAD
git submodule status ipfs_kit_py ipfs_datasets_py ipfs_accelerate_py swissknife
python scripts/manage_submodule_baseline.py status
PYTHONPATH=python python scripts/virtual_os.py status
```

### 2. Stop Daemons

Stop daemons in reverse dependency order so UI and protocol surfaces stop
accepting work before backing services disappear:

1. `swissknife`
2. `mcp_plus_plus`
3. `ipfs_accelerate_py`
4. `ipfs_datasets_py`
5. `ipfs_kit_py`

Use individual stop commands to preserve this order:

```bash
PYTHONPATH=python python scripts/virtual_os.py stop --daemon swissknife --reason rollback
PYTHONPATH=python python scripts/virtual_os.py stop --daemon mcp_plus_plus --reason rollback
PYTHONPATH=python python scripts/virtual_os.py stop --daemon ipfs_accelerate_py --reason rollback
PYTHONPATH=python python scripts/virtual_os.py stop --daemon ipfs_datasets_py --reason rollback
PYTHONPATH=python python scripts/virtual_os.py stop --daemon ipfs_kit_py --reason rollback
```

If a daemon does not stop within the default timeout, rerun the matching stop
command with a longer timeout before using out-of-band process termination:

```bash
PYTHONPATH=python python scripts/virtual_os.py stop --daemon <daemon_id> --reason rollback --timeout 15
```

### 3. Apply Rollback SHAs

Plan first, then apply:

```bash
PYTHONPATH=python python scripts/virtual_os.py rollback
PYTHONPATH=python python scripts/virtual_os.py rollback --apply
```

The lower-level helper is equivalent for applying all rollback SHAs:

```bash
python scripts/manage_submodule_baseline.py apply-rollback
```

After checkout, confirm the working tree submodule pointers match the expected
rollback targets from the manifest:

```bash
git submodule status ipfs_kit_py ipfs_datasets_py ipfs_accelerate_py swissknife
PYTHONPATH=python python scripts/virtual_os.py rollback
test "$(git -C ipfs_accelerate_py rev-parse HEAD)" = "7293488f8844e3c7af9fb7d4c6728d86a208f4da"
test "$(git -C ipfs_datasets_py rev-parse HEAD)" = "04363beba3e65f07afa81dadfb966d56d093ea3e"
test "$(git -C ipfs_kit_py rev-parse HEAD)" = "a433540ea34e3808a7c92b6b80d88a32150f1d88"
test "$(git -C swissknife rev-parse HEAD)" = "f9dcf8e5b885f240904ff4c4cef7127c9535ea40"
```

### 4. Restart Daemons

Until a follow-up change promotes the rollback SHAs into `currentSha`, service
checks must use `--no-baseline`; otherwise the baseline verifier correctly
reports that the release SHAs are no longer checked out.

Restart in dependency order:

```bash
PYTHONPATH=python python scripts/virtual_os.py boot --daemon ipfs_kit_py --wait --health-timeout 30 --no-baseline
PYTHONPATH=python python scripts/virtual_os.py boot --daemon ipfs_datasets_py --wait --health-timeout 30 --no-baseline
PYTHONPATH=python python scripts/virtual_os.py boot --daemon ipfs_accelerate_py --wait --health-timeout 30 --no-baseline
PYTHONPATH=python python scripts/virtual_os.py boot --daemon mcp_plus_plus --wait --health-timeout 30 --no-baseline
PYTHONPATH=python python scripts/virtual_os.py boot --daemon swissknife --wait --health-timeout 30 --no-baseline
```

Do not use a full `restart` command as the primary rollback path when order is
important; it is acceptable only after the ordered stop, rollback checkout, and
ordered boot procedure has succeeded once.

## Validation After Rollback

Rollback is complete only after both SHA validation and service validation pass.

1. Confirm the rollback targets are active:

```bash
git submodule status ipfs_kit_py ipfs_datasets_py ipfs_accelerate_py swissknife
PYTHONPATH=python python scripts/virtual_os.py rollback
test "$(git -C ipfs_accelerate_py rev-parse HEAD)" = "7293488f8844e3c7af9fb7d4c6728d86a208f4da"
test "$(git -C ipfs_datasets_py rev-parse HEAD)" = "04363beba3e65f07afa81dadfb966d56d093ea3e"
test "$(git -C ipfs_kit_py rev-parse HEAD)" = "a433540ea34e3808a7c92b6b80d88a32150f1d88"
test "$(git -C swissknife rev-parse HEAD)" = "f9dcf8e5b885f240904ff4c4cef7127c9535ea40"
```

2. Validate OS config, registry, and daemon health:

```bash
PYTHONPATH=python python scripts/virtual_os.py verify --no-baseline
PYTHONPATH=python python scripts/virtual_os.py status --no-baseline
```

3. Run the fast checks that do not depend on the release SHAs matching
`currentSha`:

```bash
python scripts/verify_submodule_imports.py
python test/python/test_virtual_os_submodule_contracts.py
python test/mcp_plus_plus/test_virtual_os_mcp_conformance.py
python test/python/test_virtual_os_boot.py
node test/js/test_virtual_os_daemon_manager.js
npm test
```

4. Confirm the original failure threshold has cleared. For compute-path
incidents, inspect `/integration_metrics` and verify there are no new
`load_model` or `inference` errors after rollback.

5. Record the rollback result with:

- Monorepo commit SHA before rollback
- Applied rollback SHAs
- Stop and start timestamps
- Validation commands and outcomes
- Remaining degraded services, if any
- Decision on whether the release branch is reverted, fixed forward, or held

Do not mark the release stable again until required daemons are healthy, the
post-rollback validation commands pass, and the triggering failure threshold has
remained clear through the watch interval.
