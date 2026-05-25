#!/bin/bash

# Playwright Test Runner for MCP Daemon Manager
# Provides easy test execution with screenshot capture

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🎭 Playwright Test Runner - MCP Daemon Manager"
echo "=============================================="

cd "$PROJECT_ROOT"
PLAYWRIGHT_RUNNER="node scripts/run_playwright_test.mjs"

# Parse arguments
MODE="${1:-all}"
HEADED="${2:-headless}"

echo "Test mode: $MODE"
echo "Display mode: $HEADED"
echo ""

# Clean previous results
if [ -d "test-results" ]; then
    echo "🧹 Cleaning previous test results..."
    rm -rf test-results
fi

# Ensure directories exist
mkdir -p test-results/screenshots

# Run tests based on mode
case "$MODE" in
  all)
    echo "🧪 Running all tests..."
    if [ "$HEADED" = "headed" ]; then
      $PLAYWRIGHT_RUNNER test --headed
    else
      $PLAYWRIGHT_RUNNER test
    fi
    ;;
    
  electron)
    echo "🧪 Running Electron tests..."
    if [ "$HEADED" = "headed" ]; then
      $PLAYWRIGHT_RUNNER test test/e2e/mcp-daemon-manager.spec.ts --headed
    else
      $PLAYWRIGHT_RUNNER test test/e2e/mcp-daemon-manager.spec.ts
    fi
    ;;
    
  screenshot)
    echo "📸 Running tests with screenshot capture..."
    $PLAYWRIGHT_RUNNER test --reporter=list
    ;;
    
  ci)
    echo "🤖 Running CI/CD tests..."
    CI=true $PLAYWRIGHT_RUNNER test --reporter=list,junit,html
    ;;
    
  debug)
    echo "🐛 Running tests in debug mode..."
    $PLAYWRIGHT_RUNNER test --debug
    ;;
    
  ui)
    echo "🎨 Running tests in UI mode..."
    $PLAYWRIGHT_RUNNER test --ui
    ;;
    
  *)
    echo "❌ Unknown mode: $MODE"
    echo ""
    echo "Usage: $0 [MODE] [HEADED]"
    echo ""
    echo "Modes:"
    echo "  all        - Run all tests (default)"
    echo "  electron   - Run Electron tests only"
    echo "  screenshot - Run tests and capture screenshots"
    echo "  ci         - Run in CI/CD mode"
    echo "  debug      - Run in debug mode"
    echo "  ui         - Run in UI mode"
    echo ""
    echo "Display:"
    echo "  headless   - Run without display (default)"
    echo "  headed     - Run with visible windows"
    exit 1
    ;;
esac

# Show results
echo ""
echo "✅ Tests complete!"
echo ""

if [ -d "test-results/screenshots" ]; then
    SCREENSHOT_COUNT=$(ls -1 test-results/screenshots/*.png 2>/dev/null | wc -l)
    echo "📸 Screenshots captured: $SCREENSHOT_COUNT"
    echo "   Location: test-results/screenshots/"
fi

if [ -f "test-results/summary.json" ]; then
    echo ""
    echo "📊 Test Summary:"
    cat test-results/summary.json | grep -E '"(total|passed|failed|screenshots_captured)"' | sed 's/^/   /'
fi

echo ""
echo "📁 Full results available in:"
echo "   - test-results/html-report/ (HTML report)"
echo "   - test-results/junit.xml (JUnit format)"
echo "   - test-results/test-results.json (JSON format)"
