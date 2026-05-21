#!/usr/bin/env python3
"""
Minimal submodule-native smoke checks for CI rollout gates.
"""

import compileall
import pathlib


def main():
    root = pathlib.Path(__file__).resolve().parents[1]
    checks = {
        "ipfs_accelerate_py": root / "ipfs_accelerate_py",
        "ipfs_datasets_py": root / "ipfs_datasets_py",
        "ipfs_kit_py": root / "ipfs_kit_py",
    }
    for name, module_root in checks.items():
        if not module_root.exists():
            raise SystemExit(f"{name} submodule directory missing: {module_root}")
        success = compileall.compile_dir(str(module_root), quiet=1)
        if not success:
            raise SystemExit(f"{name} compile smoke failed in {module_root}")
        print(f"✅ {name} compile smoke passed")


if __name__ == "__main__":
    main()
