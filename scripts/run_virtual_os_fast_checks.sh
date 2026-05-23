#!/usr/bin/env bash
# Run the local fast gate subset for Virtual AI OS integration changes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

DRY_RUN=false

usage() {
    cat <<'EOF'
Usage: bash scripts/run_virtual_os_fast_checks.sh [--dry-run]

Lists and runs the fast Virtual AI OS gate subset used before pushing
integration changes. This mirrors the commands in the CI workflow, and
dependencies should already be installed locally.

Options:
  --dry-run   List the checks without running them.
  -h, --help  Show this help text.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

CHECK_LABELS=(
    "Baseline verify"
    "Submodule import smoke"
    "Virtual OS contract tests"
    "MCP++ conformance tests"
    "Virtual OS integration smoke tests"
    "Dependency drift detector"
    "Nested submodule policy"
    "Selected JavaScript daemon manager test"
    "Selected JavaScript test runner"
)

CHECK_COMMANDS=(
    "python scripts/manage_submodule_baseline.py verify-baseline"
    "python scripts/verify_submodule_imports.py"
    "python test/python/test_virtual_os_submodule_contracts.py"
    "python test/mcp_plus_plus/test_virtual_os_mcp_conformance.py"
    "python test/python/test_virtual_os_boot.py"
    "python scripts/check_virtual_os_dependency_drift.py"
    "python scripts/check_nested_submodules.py"
    "node test/js/test_virtual_os_daemon_manager.js"
    "npm test"
)

export PYTHONPATH="$ROOT_DIR/python${PYTHONPATH:+:$PYTHONPATH}"

print_check_list() {
    echo "Virtual AI OS fast checks"
    echo "Repository: $ROOT_DIR"
    echo "PYTHONPATH: $PYTHONPATH"
    echo

    local count="${#CHECK_LABELS[@]}"
    local index
    for index in "${!CHECK_LABELS[@]}"; do
        printf '%2d/%d  %s\n' "$((index + 1))" "$count" "${CHECK_LABELS[$index]}"
        printf '      %s\n' "${CHECK_COMMANDS[$index]}"
    done
}

run_checks() {
    cd "$ROOT_DIR"

    local count="${#CHECK_LABELS[@]}"
    local index
    for index in "${!CHECK_LABELS[@]}"; do
        echo
        printf '[%d/%d] %s\n' "$((index + 1))" "$count" "${CHECK_LABELS[$index]}"
        printf '+ %s\n' "${CHECK_COMMANDS[$index]}"
        bash -c "${CHECK_COMMANDS[$index]}"
    done

    echo
    echo "Virtual AI OS fast checks passed."
}

if [[ "$DRY_RUN" == true ]]; then
    print_check_list
    exit 0
fi

run_checks
