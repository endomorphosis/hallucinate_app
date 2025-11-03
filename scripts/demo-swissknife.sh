#!/bin/bash

# SwissKnife Virtual Desktop Demo Script
# This script demonstrates how to access the SwissKnife virtual desktop

echo "🚀 Starting Hallucinate App with SwissKnife Virtual Desktop Demo"
echo "============================================================="

echo ""
echo "📋 Demo Steps:"
echo "1. Starting the Electron application..."
echo "2. The app will auto-start 3 MCP daemons after 2 seconds"
echo "3. You can access SwissKnife via the Windows menu"
echo "4. The daemon manager shows real-time status"
echo ""

echo "🔧 Available Features:"
echo "- Menu → Windows → SwissKnife Virtual Desktop"
echo "- Menu → Windows → Daemon Manager" 
echo "- Menu → Daemons → [Individual daemon controls]"
echo ""

echo "📊 MCP Daemons that will start:"
echo "- IPFS Accelerate MCP (Port 3001) - Distributed AI/ML operations"
echo "- SwissKnife MCP (Port 3002) - CLI tools and vibecoding"
echo "- HuggingFace MCP (Port 3003) - Model and dataset management"
echo ""

echo "🎨 UI Features:"
echo "- Modern gradient dashboard (purple theme)"
echo "- Real-time daemon status cards"
echo "- Individual and bulk controls"
echo "- Event log with color-coded messages"
echo "- Auto-refresh every 10 seconds"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in hallucinate_app directory"
    echo "Please run: cd /home/barberb/hallucinate_app && ./scripts/demo-swissknife.sh"
    exit 1
fi

echo "🚀 Starting Electron app..."
echo "(Note: Some GPU warnings are normal in containerized/remote environments)"
echo ""

# Start the app with sandbox disabled for compatibility
npx electron . --no-sandbox --enable-logging --log-level=0

echo ""
echo "✅ Demo completed!"
echo ""
echo "🔗 Alternative Access Methods:"
echo "1. Direct SwissKnife: cd swissknife && npm run dev"
echo "2. Web interface: http://localhost:5173 (dev) or http://localhost:4173 (built)"
echo "3. MCP servers: Direct connection on ports 3001-3003"
echo ""
echo "📖 For more information, see:"
echo "- docs/SWISSKNIFE_VIRTUAL_DESKTOP_MOCKUP.md"
echo "- docs/DAEMON_MANAGER.md"
echo "- docs/QUICK_START.md"