#!/bin/bash

# SwissKnife Development Server Launcher
# This script starts the SwissKnife development server for use with the Electron app

echo "🏔️  Starting SwissKnife Development Server..."
echo ""

# Check if swissknife directory exists
if [ ! -d "swissknife" ]; then
    echo "❌ Error: swissknife directory not found"
    echo "   Please initialize submodules first: git submodule update --init --recursive"
    exit 1
fi

# Navigate to swissknife directory
cd swissknife

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing SwissKnife dependencies..."
    npm install --legacy-peer-deps
    if [ $? -ne 0 ]; then
        echo "❌ Error: Failed to install dependencies"
        exit 1
    fi
    echo ""
fi

# Start the development server
echo "🚀 Launching SwissKnife Virtual Desktop..."
echo "   Server will be available at: http://localhost:3001"
echo "   Press Ctrl+C to stop"
echo ""

npm run desktop:collaborative

# Handle exit
echo ""
echo "👋 SwissKnife server stopped"
