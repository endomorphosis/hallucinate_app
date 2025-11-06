#!/bin/bash

# Test script for validating the release-electron.yml workflow
# This script checks that the workflow is properly configured

WORKFLOW_FILE=".github/workflows/release-electron.yml"
PASSED=0
FAILED=0

echo "════════════════════════════════════════════════════════════"
echo "  Testing Release Electron CI Workflow Configuration"
echo "════════════════════════════════════════════════════════════"
echo ""

# Helper functions
pass() {
    echo "✓ $1"
    ((PASSED++))
}

fail() {
    echo "✗ $1"
    ((FAILED++))
}

section() {
    echo ""
    echo "─────────────────────────────────────────────────────────"
    echo "  $1"
    echo "─────────────────────────────────────────────────────────"
}

# Check if workflow file exists
section "1. File Existence"
if [ -f "$WORKFLOW_FILE" ]; then
    pass "Workflow file exists"
else
    fail "Workflow file not found: $WORKFLOW_FILE"
    exit 1
fi

# Validate YAML syntax
section "2. YAML Syntax"
if python3 -c "import yaml; yaml.safe_load(open('$WORKFLOW_FILE'))" 2>/dev/null; then
    pass "YAML syntax is valid"
else
    fail "YAML syntax is invalid"
fi

# Check workflow name
section "3. Workflow Metadata"
if grep -q "^name: Release Electron Apps to GitHub" "$WORKFLOW_FILE"; then
    pass "Workflow name is set"
else
    fail "Workflow name is missing or incorrect"
fi

# Check triggers
section "4. Workflow Triggers"
if grep -q "tags:" "$WORKFLOW_FILE" && grep -q "'v\*\.\*\.\*'" "$WORKFLOW_FILE"; then
    pass "Tag trigger configured"
else
    fail "Tag trigger missing"
fi

if grep -q "workflow_dispatch:" "$WORKFLOW_FILE"; then
    pass "Manual trigger configured"
else
    fail "Manual trigger missing"
fi

# Check permissions
section "5. Permissions"
if grep -q "permissions:" "$WORKFLOW_FILE" && grep -q "contents: write" "$WORKFLOW_FILE"; then
    pass "Write permissions configured"
else
    fail "Write permissions missing"
fi

# Check matrix strategy
section "6. Build Matrix"
if grep -q "strategy:" "$WORKFLOW_FILE" && grep -q "matrix:" "$WORKFLOW_FILE"; then
    pass "Matrix strategy found"
else
    fail "Matrix strategy missing"
fi

# Count matrix entries
MATRIX_COUNT=$(grep -A 100 "include:" "$WORKFLOW_FILE" | grep "^ *- os:" | wc -l)
if [ "$MATRIX_COUNT" -eq 8 ]; then
    pass "Matrix has 8 entries (expected: 6 desktop + 2 RHEL)"
else
    fail "Matrix has $MATRIX_COUNT entries (expected 8)"
fi

# Check platforms
section "7. Platform Coverage"
for os in windows macos linux rhel; do
    if grep -q "os: $os" "$WORKFLOW_FILE"; then
        pass "$os platform configured"
    else
        fail "$os platform missing"
    fi
done

# Check architectures
section "8. Architecture Coverage"
X64_COUNT=$(grep "arch: x64" "$WORKFLOW_FILE" | wc -l)
ARM64_COUNT=$(grep "arch: arm64" "$WORKFLOW_FILE" | wc -l)

if [ "$X64_COUNT" -eq 4 ]; then
    pass "x64 architecture: 4 entries (Windows, macOS, Linux, RHEL)"
else
    fail "x64 architecture: $X64_COUNT entries (expected 4)"
fi

if [ "$ARM64_COUNT" -eq 4 ]; then
    pass "arm64 architecture: 4 entries (Windows, macOS, Linux, RHEL)"
else
    fail "arm64 architecture: $ARM64_COUNT entries (expected 4)"
fi

# Check runners
section "9. GitHub Runners"
if grep -q "runner: windows-latest" "$WORKFLOW_FILE"; then
    pass "Windows runner configured"
else
    fail "Windows runner missing"
fi

if grep -q "runner: macos-13" "$WORKFLOW_FILE"; then
    pass "macOS Intel runner (macos-13) configured"
else
    fail "macOS Intel runner missing"
fi

if grep -q "runner: macos-14" "$WORKFLOW_FILE"; then
    pass "macOS ARM64 runner (macos-14) configured"
else
    fail "macOS ARM64 runner missing"
fi

if grep -q "runner: ubuntu-latest" "$WORKFLOW_FILE"; then
    pass "Ubuntu runner configured"
else
    fail "Ubuntu runner missing"
fi

# Check setup steps
section "10. Setup Steps"
if grep -q "actions/checkout@v4" "$WORKFLOW_FILE"; then
    pass "Checkout action configured"
else
    fail "Checkout action missing"
fi

if grep -q "actions/setup-node@v4" "$WORKFLOW_FILE"; then
    pass "Node.js setup configured"
else
    fail "Node.js setup missing"
fi

if grep -q "actions/setup-python@v5" "$WORKFLOW_FILE"; then
    pass "Python setup configured"
else
    fail "Python setup missing"
fi

# Check build commands
section "11. Build Commands"
if grep -q "npm run package" "$WORKFLOW_FILE"; then
    pass "Package command found"
else
    fail "Package command missing"
fi

if grep -q "npm run make" "$WORKFLOW_FILE"; then
    pass "Make command found"
else
    fail "Make command missing"
fi

# Check artifact uploads
section "12. Artifact Uploads"
UPLOAD_COUNT=$(grep -c "uses: actions/upload-artifact@v4" "$WORKFLOW_FILE")
if [ "$UPLOAD_COUNT" -ge 12 ]; then
    pass "Found $UPLOAD_COUNT artifact upload actions"
else
    fail "Only found $UPLOAD_COUNT artifact upload actions (expected at least 12)"
fi

# Check Windows artifacts
if grep -q "name: windows-x64" "$WORKFLOW_FILE" && grep -q "name: windows-arm64" "$WORKFLOW_FILE"; then
    pass "Windows artifacts (x64 and arm64) configured"
else
    fail "Windows artifacts incomplete"
fi

# Check macOS artifacts
if grep -q "name: macos-x64" "$WORKFLOW_FILE" && grep -q "name: macos-arm64" "$WORKFLOW_FILE"; then
    pass "macOS artifacts (x64 and arm64) configured"
else
    fail "macOS artifacts incomplete"
fi

# Check Linux artifacts
if grep -q "name: linux-x64-deb" "$WORKFLOW_FILE" && grep -q "name: linux-arm64-deb" "$WORKFLOW_FILE"; then
    pass "Linux DEB artifacts (x64 and arm64) configured"
else
    fail "Linux DEB artifacts incomplete"
fi

if grep -q "name: linux-x64-rpm" "$WORKFLOW_FILE" && grep -q "name: linux-arm64-rpm" "$WORKFLOW_FILE"; then
    pass "Linux RPM artifacts (x64 and arm64) configured"
else
    fail "Linux RPM artifacts incomplete"
fi

# Check RHEL artifacts
if grep -q "name: rhel-x64-rpm" "$WORKFLOW_FILE" && grep -q "name: rhel-arm64-rpm" "$WORKFLOW_FILE"; then
    pass "RHEL RPM artifacts (x64 and arm64) configured"
else
    fail "RHEL RPM artifacts incomplete"
fi

# Check release creation
section "13. Release Creation"
if grep -q "create-release:" "$WORKFLOW_FILE"; then
    pass "Release job exists"
else
    fail "Release job missing"
fi

if grep -q "needs: build-release" "$WORKFLOW_FILE"; then
    pass "Release depends on build-release"
else
    fail "Release dependency missing"
fi

if grep -q "actions/download-artifact@v4" "$WORKFLOW_FILE"; then
    pass "Artifact download configured"
else
    fail "Artifact download missing"
fi

if grep -q "softprops/action-gh-release@v1" "$WORKFLOW_FILE"; then
    pass "GitHub release action configured"
else
    fail "GitHub release action missing"
fi

# Check artifact paths
section "14. Artifact Paths"
if grep -q "out/make/squirrel.windows/x64/\*\.exe" "$WORKFLOW_FILE"; then
    pass "Windows x64 EXE path configured"
else
    fail "Windows x64 EXE path missing"
fi

if grep -q "out/make/zip/darwin/x64/\*\.zip" "$WORKFLOW_FILE"; then
    pass "macOS x64 ZIP path configured"
else
    fail "macOS x64 ZIP path missing"
fi

if grep -q "out/make/deb/x64/\*\.deb" "$WORKFLOW_FILE"; then
    pass "Linux x64 DEB path configured"
else
    fail "Linux x64 DEB path missing"
fi

# Summary
section "Test Summary"
TOTAL=$((PASSED + FAILED))
echo ""
echo "Total tests: $TOTAL"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo "════════════════════════════════════════════════════════════"
    echo "  ✓ ALL TESTS PASSED"
    echo "════════════════════════════════════════════════════════════"
    exit 0
else
    echo "════════════════════════════════════════════════════════════"
    echo "  ✗ SOME TESTS FAILED"
    echo "════════════════════════════════════════════════════════════"
    exit 1
fi
