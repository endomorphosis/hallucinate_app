# hallucinate_app Menu Hierarchy

```
hallucinate_app
│
├─ File
│  ├─ Home (⌘H)
│  ├─ ─────────
│  ├─ Settings (⌘,)
│  ├─ ─────────
│  └─ Quit
│
├─ Dashboards
│  ├─ Main Dashboard (⌘D)
│  ├─ ─────────
│  ├─ IPFS MCP Servers ▶
│  │  ├─ IPFS Kit Dashboard
│  │  ├─ IPFS Datasets Dashboard ⭐NEW
│  │  └─ IPFS Accelerate Dashboard ⭐NEW
│  ├─ ─────────
│  ├─ Testing & Benchmarks ▶
│  │  ├─ Test Interface
│  │  ├─ Benchmark Dashboard
│  │  └─ Model Tester
│  ├─ ─────────
│  ├─ Security & Authentication ▶
│  │  ├─ Auth Dashboard
│  │  └─ Security Test Dashboard
│  ├─ ─────────
│  ├─ Database & Storage ▶
│  │  ├─ Database Backup Dashboard
│  │  └─ PyArrow Content Index
│  ├─ ─────────
│  └─ System Management ▶
│     ├─ Daemon Manager
│     └─ Usage Dashboard
│
├─ MCP Servers
│  ├─ Daemon Manager
│  ├─ ─────────
│  ├─ Start All MCP Servers
│  ├─ Stop All MCP Servers
│  ├─ ─────────
│  ├─ IPFS Kit MCP ▶
│  │  ├─ Start
│  │  ├─ Stop
│  │  ├─ Restart
│  │  ├─ ─────────
│  │  └─ Open Dashboard
│  ├─ IPFS Datasets MCP ▶
│  │  ├─ Start
│  │  ├─ Stop
│  │  ├─ Restart
│  │  ├─ ─────────
│  │  └─ Open Dashboard ⭐NEW
│  └─ IPFS Accelerate MCP ▶
│     ├─ Start
│     ├─ Stop
│     ├─ Restart
│     ├─ ─────────
│     └─ Open Dashboard ⭐NEW
│
├─ Tools
│  ├─ SwissKnife Virtual Desktop
│  ├─ ─────────
│  ├─ Model Tester
│  ├─ Test Interface
│  └─ Benchmark Dashboard
│
├─ View
│  ├─ Back (Alt+←)
│  ├─ Forward (Alt+→)
│  ├─ ─────────
│  ├─ Reload
│  ├─ Force Reload
│  ├─ Toggle DevTools
│  ├─ ─────────
│  ├─ Reset Zoom
│  ├─ Zoom In
│  ├─ Zoom Out
│  ├─ ─────────
│  └─ Toggle Fullscreen
│
└─ Help
   ├─ Documentation
   ├─ Report Issue
   ├─ ─────────
   └─ About

Legend:
▶ = Submenu
⭐NEW = Newly added
```

## Key Improvements

### 1. Logical Organization
- Dashboards grouped by function (MCP Servers, Testing, Security, Database, System)
- MCP Servers menu provides both control and access to dashboards
- Tools menu for quick access to commonly used utilities

### 2. Consistency
- All three MCP servers have identical submenu structure
- Each MCP server submenu includes:
  - Start/Stop/Restart controls
  - Direct link to dashboard

### 3. Single-Window Navigation
- All menu items navigate within main window
- No new windows created
- Browser-style back/forward navigation

### 4. Complete Coverage
- All existing dashboards accessible via menu
- All three MCP servers fully integrated
- No missing or orphaned views

## Navigation Flow Examples

### Example 1: Access IPFS Datasets Dashboard
```
Menu Bar → Dashboards → IPFS MCP Servers → IPFS Datasets Dashboard
```
or
```
Menu Bar → MCP Servers → IPFS Datasets MCP → Open Dashboard
```

### Example 2: Start IPFS Accelerate MCP
```
Menu Bar → MCP Servers → IPFS Accelerate MCP → Start
```

### Example 3: Run Security Tests
```
Menu Bar → Dashboards → Security & Authentication → Security Test Dashboard
```

### Example 4: Manage All Daemons
```
Menu Bar → MCP Servers → Daemon Manager
```
or
```
Menu Bar → Dashboards → System Management → Daemon Manager
```
