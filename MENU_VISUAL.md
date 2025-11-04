# Menu Structure Visual Guide

```
┌─────────────────────────────────────────────────────────────────────┐
│  hallucinate_app - Electron Application Menu                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┬────────────┬─────────────┬───────┬──────────┬────────┐│
│  │   File   │ Dashboards │ MCP Servers │ Tools │   View   │  Help  ││
│  └──────────┴────────────┴─────────────┴───────┴──────────┴────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════════

📁 FILE MENU
├─ 🏠 Home                            (⌘H)
├─ ─────────
├─ ⚙️  Settings                       (⌘,)
├─ ─────────
└─ 🚪 Quit                            (⌘Q)

════════════════════════════════════════════════════════════════════════

📊 DASHBOARDS MENU
├─ 📈 Main Dashboard                  (⌘D)
├─ ─────────
├─ 📦 IPFS MCP Servers
│  ├─ IPFS Kit Dashboard
│  ├─ IPFS Datasets Dashboard
│  └─ IPFS Accelerate Dashboard
├─ ─────────
├─ 🧪 Testing & Benchmarks
│  ├─ Test Interface
│  ├─ Benchmark Dashboard
│  └─ Model Tester
├─ ─────────
├─ 🔐 Security & Authentication
│  ├─ Auth Dashboard
│  └─ Security Test Dashboard
├─ ─────────
├─ 💾 Database & Storage
│  ├─ Database Backup Dashboard
│  └─ PyArrow Content Index
├─ ─────────
└─ 🖥️  System Management
   ├─ Daemon Manager
   └─ Usage Dashboard

════════════════════════════════════════════════════════════════════════

🎛️  MCP SERVERS MENU
├─ 🎛️  MCP Control Panel              (⌘M)
├─ ─────────
├─ 🚀 Start All MCP Servers           (⌘⇧S)
├─ 🛑 Stop All MCP Servers            (⌘⇧X)
├─ 🔄 Restart All MCP Servers         (⌘⇧R)
├─ ─────────
├─ 📦 IPFS Kit MCP (Port 3001)
│  ├─ ▶️  Start Server
│  ├─ ⏹️  Stop Server
│  ├─ 🔄 Restart Server
│  ├─ ─────────
│  ├─ 📊 Open Web Dashboard           (⌘⌥1)
│  ├─ 🌐 Open in Browser
│  ├─ ─────────
│  ├─ 🔧 IPFS Kit Tools
│  │  ├─ Add to IPFS
│  │  ├─ Get from IPFS
│  │  ├─ Pin Content
│  │  ├─ IPFS Status
│  │  ├─ ─────────
│  │  └─ Configure IPFS Node
│  └─ 📋 View Logs
│
├─ 📚 IPFS Datasets MCP (Port 3002)
│  ├─ ▶️  Start Server
│  ├─ ⏹️  Stop Server
│  ├─ 🔄 Restart Server
│  ├─ ─────────
│  ├─ 📊 Open Web Dashboard           (⌘⌥2)
│  ├─ 🌐 Open in Browser
│  ├─ ─────────
│  ├─ 🔧 Dataset Tools
│  │  ├─ Load HuggingFace Dataset
│  │  ├─ Create Custom Dataset
│  │  ├─ Transform Dataset
│  │  ├─ Export Dataset
│  │  ├─ ─────────
│  │  ├─ GraphRAG PDF Processing
│  │  └─ Legal Dataset Scraper
│  └─ 📋 View Logs
│
├─ ⚡ IPFS Accelerate MCP (Port 3003)
│  ├─ ▶️  Start Server
│  ├─ ⏹️  Stop Server
│  ├─ 🔄 Restart Server
│  ├─ ─────────
│  ├─ 📊 Open Web Dashboard           (⌘⌥3)
│  ├─ 🌐 Open in Browser
│  ├─ ─────────
│  ├─ 🔧 Accelerate Tools
│  │  ├─ Model Inference
│  │  ├─ Batch Processing
│  │  ├─ Distributed Training
│  │  ├─ ─────────
│  │  ├─ GPU Monitor
│  │  └─ Performance Metrics
│  └─ 📋 View Logs
│
└─ 🔪 SwissKnife MCP (Port 3004)
   ├─ ▶️  Start Server
   ├─ ⏹️  Stop Server
   ├─ 🔄 Restart Server
   ├─ ─────────
   ├─ 📊 Open Web Dashboard           (⌘⌥4)
   ├─ 🌐 Open in Browser
   ├─ ─────────
   ├─ 🔧 SwissKnife Apps
   │  ├─ Terminal
   │  ├─ Code Editor
   │  ├─ File Manager
   │  ├─ AI Chat
   │  ├─ ─────────
   │  ├─ Music Studio
   │  └─ Video Player
   └─ 📋 View Logs

════════════════════════════════════════════════════════════════════════

🔧 TOOLS MENU
├─ 📦 IPFS Kit Tools
│  ├─ Add to IPFS
│  ├─ Get from IPFS
│  ├─ Pin Content
│  ├─ IPFS Status
│  ├─ ─────────
│  ├─ Configure IPFS Node
│  ├─ ─────────
│  └─ 📊 Open Dashboard
│
├─ 📚 Dataset Tools
│  ├─ Load HuggingFace Dataset
│  ├─ Create Custom Dataset
│  ├─ Transform Dataset
│  ├─ Export Dataset
│  ├─ ─────────
│  ├─ GraphRAG PDF Processing
│  ├─ Legal Dataset Scraper
│  ├─ ─────────
│  └─ 📊 Open Dashboard
│
├─ ⚡ Accelerate Tools
│  ├─ Model Inference
│  ├─ Batch Processing
│  ├─ Distributed Training
│  ├─ ─────────
│  ├─ GPU Monitor
│  ├─ Performance Metrics
│  ├─ ─────────
│  └─ 📊 Open Dashboard
│
└─ 🔪 SwissKnife Apps
   ├─ Terminal
   ├─ Code Editor
   ├─ File Manager
   ├─ AI Chat
   ├─ ─────────
   ├─ Music Studio
   ├─ Video Player
   ├─ ─────────
   └─ 📊 Open MCP Dashboard

════════════════════════════════════════════════════════════════════════

⚙️  CONFIGURATION MENU
├─ ⚙️  MCP Server Settings
│  ├─ IPFS Kit Configuration
│  ├─ IPFS Datasets Configuration
│  ├─ IPFS Accelerate Configuration
│  └─ SwissKnife Configuration
├─ ─────────
├─ 🌐 Network Settings
│  ├─ Port Configuration
│  ├─ Proxy Settings
│  └─ IPFS Gateway
├─ 🔐 Security Settings
│  ├─ API Keys
│  ├─ Authentication
│  └─ Permissions
├─ ─────────
└─ 🔄 Reset to Defaults

════════════════════════════════════════════════════════════════════════

👁️  VIEW MENU
├─ ← Back                            (Alt+←)
├─ → Forward                         (Alt+→)
├─ ─────────
├─ 🔄 Reload                          (⌘R)
├─ 🔄 Force Reload                    (⌘⇧R)
├─ 🛠️  Toggle Developer Tools         (⌘⇧I)
├─ ─────────
├─ 🔍 Actual Size                     (⌘0)
├─ 🔍 Zoom In                         (⌘+)
├─ 🔍 Zoom Out                        (⌘-)
├─ ─────────
└─ ⛶ Toggle Full Screen              (F11)

════════════════════════════════════════════════════════════════════════

❓ HELP MENU
├─ 📖 Documentation
│  ├─ IPFS Kit Documentation
│  ├─ IPFS Datasets Documentation
│  ├─ IPFS Accelerate Documentation
│  └─ SwissKnife Documentation
├─ ─────────
├─ 🔍 Check for Updates
├─ 🐛 Report Issue
├─ ─────────
└─ ℹ️  About

════════════════════════════════════════════════════════════════════════

KEYBOARD SHORTCUTS REFERENCE
════════════════════════════════════════════════════════════════════════

Global Navigation:
  ⌘H          - Home
  ⌘D          - Main Dashboard
  ⌘M          - MCP Control Panel
  ⌘,          - Settings
  ⌘Q          - Quit

MCP Server Controls:
  ⌘⇧S         - Start All MCP Servers
  ⌘⇧X         - Stop All MCP Servers
  ⌘⇧R         - Restart All MCP Servers
  
MCP Dashboards:
  ⌘⌥1         - IPFS Kit Dashboard
  ⌘⌥2         - IPFS Datasets Dashboard
  ⌘⌥3         - IPFS Accelerate Dashboard
  ⌘⌥4         - SwissKnife Dashboard

Navigation:
  Alt+←       - Back
  Alt+→       - Forward

View Controls:
  ⌘R          - Reload
  ⌘⇧R         - Force Reload
  ⌘⇧I         - Toggle DevTools
  ⌘0          - Reset Zoom
  ⌘+          - Zoom In
  ⌘-          - Zoom Out
  F11         - Toggle Fullscreen

════════════════════════════════════════════════════════════════════════

TESTING STATUS
════════════════════════════════════════════════════════════════════════

Total Tests:      25
Passed:          25  ✅
Failed:           0  
Success Rate:   100%

Test Categories:
  ✅ Menu Structure        (7 tests)
  ✅ MCP Server Controls   (4 tests)
  ✅ Dashboard Sections    (5 tests)
  ✅ Keyboard Shortcuts    (3 tests)
  ✅ Navigation Items      (2 tests)
  ✅ Path Validation       (2 tests)
  ✅ Configuration Tests   (2 tests)

Run tests: npm run test:menu

════════════════════════════════════════════════════════════════════════

ARCHITECTURE OVERVIEW
════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│                     Menu Configuration                           │
│              (menu_config.js - 354 lines)                        │
│                                                                   │
│  ┌──────────────┐  ┌────────────┐  ┌────────────┐              │
│  │ MCP Servers  │  │ Dashboards │  │   Tools    │              │
│  │              │  │            │  │            │              │
│  │ • IPFS Kit   │  │ • Main     │  │ • IPFS Kit │              │
│  │ • Datasets   │  │ • MCP      │  │ • Datasets │              │
│  │ • Accelerate │  │ • Testing  │  │ • Accel    │              │
│  │ • SwissKnife │  │ • Security │  │ • Swiss    │              │
│  │              │  │ • Database │  │            │              │
│  │              │  │ • System   │  │            │              │
│  └──────────────┘  └────────────┘  └────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Menu Generator                               │
│              (menu_generator.js - 422 lines)                     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Generates Electron Menu Template                       │    │
│  │  • Reads configuration                                  │    │
│  │  • Creates menu structure                               │    │
│  │  • Attaches action handlers                             │    │
│  │  │  Sets keyboard accelerators                           │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Electron Application                            │
│                    (index.js)                                    │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  1. Create Main Window                                  │    │
│  │  2. Initialize Menu Generator                           │    │
│  │  3. Generate Menu                                       │    │
│  │  4. Start MCP Daemons                                   │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Testing Framework                              │
│       (menu_test_framework.js + test_programmatic_menu.js)      │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Validates:                                             │    │
│  │  ✅ All menu categories exist                           │    │
│  │  ✅ All MCP servers have controls                       │    │
│  │  ✅ All dashboard sections present                      │    │
│  │  ✅ Keyboard shortcuts valid                            │    │
│  │  ✅ Navigation paths correct                            │    │
│  │  ✅ Tool items accessible                               │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                   │
│              Run: npm run test:menu                              │
└─────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════════

STATISTICS
════════════════════════════════════════════════════════════════════════

Menu Items:          50+
Keyboard Shortcuts:  20+
MCP Servers:         4
Dashboard Sections:  8
Test Cases:          25
Code Reduction:      ~700 lines (from index.js)
New Code:            1,512 lines (organized, tested)
Documentation:       600+ lines
Success Rate:        100%

════════════════════════════════════════════════════════════════════════
```
