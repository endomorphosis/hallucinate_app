# Virtual AI OS Performance Baseline

Task: OS-038

## Purpose

`test/performance/test_virtual_os_baseline.py` is the fast performance smoke
harness for the Virtual AI OS integration track. It records latency for the
mocked storage, dataset, inference, and MCP++ scheduler paths introduced by
OS-025 and OS-026 without starting IPFS, GraphRAG, model, daemon, browser, or
network services.

The harness is a CI smoke gate, not a production benchmark. It is designed to
catch accidental blocking work, heavy imports, sleeps, or live-service calls in
the contract path.

## Command

```bash
python test/performance/test_virtual_os_baseline.py --smoke
```

Useful options:

```bash
python test/performance/test_virtual_os_baseline.py --smoke --quiet
python test/performance/test_virtual_os_baseline.py --smoke --iterations 10 --output /tmp/virtual_os_baseline.json
```

Without `--smoke`, the file runs its unittest coverage for the same harness.

## Smoke Metrics

All smoke thresholds are evaluated against `p95_ms`. The default smoke run uses
one warmup sample and five measured samples per metric.

| Metric | Component | Operation | Smoke threshold |
|---|---|---|---|
| `storage_latency` | `ipfs_kit_py` | VFS add, stat, and cat round trip through mocked IPFS and metadata index adapters | 500 ms p95 |
| `dataset_latency` | `ipfs_datasets_py` | Metadata-only dataset load with provenance and audit event emission | 500 ms p95 |
| `inference_latency` | `ipfs_accelerate_py` | Mock text-generation inference result, task status, resource usage, and completion event | 500 ms p95 |
| `mcp_plus_plus_scheduling_latency` | `mcp_plus_plus` | MCP++ task enqueue, start, complete event sequence with risk-adjusted priority metadata | 500 ms p95 |

The 500 ms thresholds are intentionally generous for CI. The mocked paths should
normally complete in well under a millisecond on a developer workstation, but
the gate should only fail on material regressions or accidental live work.

## JSON Report

`--smoke` prints a JSON report with this structure:

```json
{
  "harness": "virtual_os_performance_baseline",
  "task_id": "OS-038",
  "mode": "smoke",
  "summary": {
    "ok": true,
    "failed_metrics": []
  },
  "metrics": [
    {
      "name": "storage_latency",
      "component": "ipfs_kit_py",
      "operation": "vfs.add_stat_cat",
      "threshold_stat": "p95_ms",
      "threshold_ms": 500.0,
      "median_ms": 0.05,
      "p95_ms": 0.06,
      "max_ms": 0.06,
      "samples_ms": [0.06, 0.05, 0.04],
      "details": {}
    }
  ]
}
```

The `details` object is metric-specific and records the last sampled artifact,
dataset, inference task, or scheduler task. This keeps the report small while
still proving that each latency sample completed the expected contract work.

## Failure Policy

The harness exits with status `1` when any metric exceeds its p95 threshold.
Failures should be treated as a contract-path regression first:

1. Confirm the path is still mocked and does not import or start live services.
2. Check for newly added sleeps, retries, filesystem scans, or network calls.
3. If a legitimate contract change makes the mocked path more expensive, update
   this document and the threshold in `SMOKE_THRESHOLDS_MS` in the same review.

Do not compare smoke values across machines as release performance numbers. Use
the JSON report for drift detection within the same CI environment.
