#!/usr/bin/env python3
"""
Manage pinned submodule baseline and rollback SHAs.
"""

import argparse
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASELINE_FILE = ROOT / "config" / "submodule_integration_baseline.json"


def load_baseline():
    with BASELINE_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)["baseline"]


def run(cmd, cwd=ROOT):
    cwd = Path(cwd).resolve()
    root_resolved = ROOT.resolve()
    try:
        cwd.relative_to(root_resolved)
    except ValueError:
        raise RuntimeError(f"Refusing to run command outside repository: {cwd}")
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{result.stderr.strip()}")
    return result.stdout.strip()


def get_submodule_sha(path):
    return run(["git", "rev-parse", "HEAD"], cwd=ROOT / path)


def checkout_submodule_sha(path, sha):
    run(["git", "submodule", "update", "--init", path], cwd=ROOT)
    run(["git", "checkout", sha], cwd=ROOT / path)


def print_status(baseline):
    print("Submodule baseline status:")
    for name, config in baseline.items():
        current = get_submodule_sha(name)
        target = config["currentSha"]
        rollback = config["rollbackSha"]
        marker = "OK" if current == target else "DIFF"
        print(f"- {name}: {current} [{marker}]")
        print(f"  target={target}")
        print(f"  rollback={rollback}")


def apply_mode(baseline, mode):
    key = "currentSha" if mode == "baseline" else "rollbackSha"
    for name, config in baseline.items():
        target_sha = config[key]
        print(f"Updating {name} -> {target_sha}")
        checkout_submodule_sha(name, target_sha)


def main():
    parser = argparse.ArgumentParser(description="Manage pinned submodule baseline and rollback SHAs.")
    parser.add_argument("action", choices=["status", "apply-baseline", "apply-rollback"])
    args = parser.parse_args()

    baseline = load_baseline()

    if args.action == "status":
        print_status(baseline)
        return
    if args.action == "apply-baseline":
        apply_mode(baseline, "baseline")
        return
    if args.action == "apply-rollback":
        apply_mode(baseline, "rollback")
        return


if __name__ == "__main__":
    main()
