#!/bin/bash

# SwissKnife Development Server Launcher
# This script starts SwissKnife in development mode for integration with the Electron app

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SWISSKNIFE_DIR="$PROJECT_ROOT/swissknife"

echo "🛠️  SwissKnife Development Server Launcher"
echo "=========================================="

# Check if swissknife directory exists
if [ ! -d "$SWISSKNIFE_DIR" ]; then
    echo "❌ Error: SwissKnife directory not found at $SWISSKNIFE_DIR"
    echo "Please ensure the swissknife submodule is initialized:"
    echo "  git submodule update --init --recursive"
    exit 1
fi

cd "$SWISSKNIFE_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing SwissKnife dependencies..."
    npm install
fi

echo ""
echo "🚀 Starting SwissKnife development server..."
echo "   URL: http://localhost:5173"
echo "   MCP Integration: Ports 3001-3003"
echo ""
echo "💡 The Electron app will automatically connect to this server"
echo "   Access via: Windows → SwissKnife Virtual Desktop"
echo ""

# Start the dev server
npm run dev
