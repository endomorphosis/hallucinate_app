# Visual Architecture Diagrams

This document provides visual representations of the Hallucinate App architecture to help understand how all components fit together.

## 1. Platform Wrapper Architecture

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                    HALLUCINATE APP (Electron Wrapper)                      ║
║                     Single Distributable Application                       ║
║                   (.exe, .dmg, .rpm, .deb, tar.gz)                        ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  ┌────────────────────────────────────────────────────────────────────┐  ║
║  │                  ELECTRON MAIN PROCESS                              │  ║
║  │  • Application Lifecycle                                            │  ║
║  │  • Window Management                                                │  ║
║  │  • MCP Daemon Orchestration                                         │  ║
║  │  • IPC Coordination                                                 │  ║
║  └────────────────────────────────────────────────────────────────────┘  ║
║                                 │                                          ║
║       ┌─────────────────────────┼──────────────────────────┐              ║
║       │                         │                          │              ║
║       ▼                         ▼                          ▼              ║
║  ┌─────────┐            ┌──────────────┐         ┌──────────────┐        ║
║  │SwissKnife            │ MCP DAEMON   │         │  ELECTRON    │        ║
║  │ Virtual │            │   MANAGER    │         │  RENDERER    │        ║
║  │ Desktop │            │              │         │  PROCESSES   │        ║
║  └─────────┘            └──────────────┘         └──────────────┘        ║
║       │                         │                                         ║
║       │                         ├─► IPFS Kit MCP (Port 3001)              ║
║       │                         ├─► IPFS Datasets MCP (Port 3002)         ║
║       │                         └─► IPFS Accelerate MCP (Port 3003)       ║
║       │                         │                                         ║
║       └─────────────────────────┴────────────►                            ║
║                                 │                                         ║
║                    HTTP/WebSocket/MCP Protocol                            ║
║                                 │                                         ║
║  ┌──────────────────────────────▼──────────────────────────────────────┐ ║
║  │              THREE PYTHON MCP SERVERS (Background)                   │ ║
║  │                                                                       │ ║
║  │  ┌──────────────┐  ┌───────────────┐  ┌─────────────────────────┐  │ ║
║  │  │  IPFS Kit    │  │ IPFS Datasets │  │  IPFS Accelerate        │  │ ║
║  │  │  MCP Server  │  │  MCP Server   │  │  MCP Server             │  │ ║
║  │  │  :3001       │  │  :3002        │  │  :3003                  │  │ ║
║  │  ├──────────────┤  ├───────────────┤  ├─────────────────────────┤  │ ║
║  │  │• IPFS Ops    │  │• GraphRAG     │  │• ML Inference           │  │ ║
║  │  │• Clusters    │  │• 200+ Tools   │  │• GPU Acceleration       │  │ ║
║  │  │• Storage     │  │• PDF Process  │  │• Distributed Computing  │  │ ║
║  │  │• Content     │  │• Multimedia   │  │• GitHub Integration     │  │ ║
║  │  └──────────────┘  └───────────────┘  └─────────────────────────┘  │ ║
║  └───────────────────────────────────────────────────────────────────────┘ ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

## 2. User Interaction Flow

```
┌─────────────┐
│   USER      │
│  Launches   │
│   App       │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│  Electron Window Opens                      │
│  (Main Application Interface)               │
└──────┬──────────────────────────────────────┘
       │
       ├──► Menu: Windows → SwissKnife Virtual Desktop
       │    ├─► Opens BrowserWindow
       │    └─► Loads http://localhost:3001 or built files
       │
       ├──► Menu: Daemons → Daemon Manager
       │    ├─► Opens daemon control dashboard
       │    └─► Shows status of all 3 MCP servers
       │
       └──► Automatic Background Startup
            └─► After 2 seconds, all 3 MCP servers auto-start
                 ├─► IPFS Kit MCP on port 3001
                 ├─► IPFS Datasets MCP on port 3002
                 └─► IPFS Accelerate MCP on port 3003
```

## 3. SwissKnife Application Structure

```
╔════════════════════════════════════════════════════════════════════╗
║          SWISSKNIFE VIRTUAL DESKTOP (In Electron Window)           ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║  ┌─────────────────────────────────────────────────────────────┐  ║
║  │                    WINDOW MANAGER                            │  ║
║  │  Multi-window interface with taskbar and window controls    │  ║
║  └─────────────────────────────────────────────────────────────┘  ║
║                                                                     ║
║  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐     ║
║  │   Terminal    │  │  VibeCode IDE │  │   AI Chat         │     ║
║  │  AI-powered   │  │  Monaco Editor│  │   Multi-provider  │     ║
║  └───────────────┘  └───────────────┘  └───────────────────┘     ║
║                                                                     ║
║  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐     ║
║  │ File Manager  │  │ Model Browser │  │ OpenRouter Hub    │     ║
║  │  + IPFS       │  │ 100K+ models  │  │ 100+ LLMs         │     ║
║  └───────────────┘  └───────────────┘  └───────────────────┘     ║
║                                                                     ║
║  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐     ║
║  │ Neural Net    │  │ Music Studio  │  │ Task Manager      │     ║
║  │ Designer      │  │ (Strudel)     │  │ P2P Tasks         │     ║
║  └───────────────┘  └───────────────┘  └───────────────────┘     ║
║                                                                     ║
║            ... and 18 more applications ...                        ║
║                                                                     ║
║  ┌─────────────────────────────────────────────────────────────┐  ║
║  │               P2P COLLABORATION ENGINE                       │  ║
║  │  • WebRTC/libp2p for peer connections                        │  ║
║  │  • CRDT for conflict-free sync                               │  ║
║  │  • Distributed computing coordination                        │  ║
║  └─────────────────────────────────────────────────────────────┘  ║
║                                                                     ║
╚════════════════════════════════════════════════════════════════════╝
```

## 4. Data Flow: User Request to Response

```
┌──────────────────────────────────────────────────────────────────────┐
│                         USER ACTION                                  │
│   Example: "Generate text using AI model"                           │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  SwissKnife UI  │
                    │  (AI Chat App)  │
                    └────────┬────────┘
                             │ HTTP POST
                             ▼
                    ┌─────────────────────┐
                    │ IPFS Accelerate MCP │
                    │   Server :3003      │
                    └────────┬────────────┘
                             │
                             ├──► Check UCAN Auth
                             ├──► Select Hardware (CPU/CUDA/MPS)
                             ├──► Load Model
                             │    (from IPFS via IPFS Kit)
                             ├──► Run Inference
                             └──► Return Results
                             │
                             ▼
                    ┌─────────────────┐
                    │  Response (JSON)│
                    └────────┬────────┘
                             │ HTTP Response
                             ▼
                    ┌─────────────────┐
                    │  SwissKnife UI  │
                    │  Displays Result│
                    └─────────────────┘
```

## 5. MCP Server Communication

```
┌────────────────────────────────────────────────────────────────┐
│                     MCP PROTOCOL FLOW                          │
└────────────────────────────────────────────────────────────────┘

SwissKnife Application
        │
        │ Tool Discovery
        ├──────────────────────►  MCP Server
        │                        (e.g., IPFS Kit :3001)
        │                                 │
        │                                 │ Returns tool list
        │  ◄──────────────────────────────┤
        │  {tools: [                      │
        │    {name: "ipfs_add", ...},     │
        │    {name: "ipfs_pin", ...}      │
        │  ]}                             │
        │                                 │
        │ Tool Invocation                 │
        ├──────────────────────►          │
        │ POST /mcp/tools/call            │
        │ {tool: "ipfs_add",              │
        │  args: {content: "..."}}        │
        │                                 │
        │                                 │ Executes operation
        │                                 ├──► IPFS Kubo
        │                                 ├──► Storage Backend
        │                                 └──► Returns result
        │                                 │
        │  ◄──────────────────────────────┤
        │  {success: true,                │
        │   result: {cid: "Qm..."}}       │
        │                                 │
```

## 6. Packaging and Distribution

```
┌──────────────────────────────────────────────────────────────────┐
│                    SOURCE CODE REPOSITORY                        │
│  • Electron app code                                             │
│  • Git submodules (SwissKnife, IPFS Kit, Datasets, Accelerate)  │
│  • Configuration files                                           │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  BUILD PROCESS  │
                    │ (Electron Forge)│
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐
│   Windows     │  │     macOS       │  │     Linux        │
│    Build      │  │     Build       │  │     Build        │
└───────┬───────┘  └────────┬────────┘  └────────┬─────────┘
        │                   │                     │
        ▼                   ▼                     ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐
│ .exe Installer│  │ .zip with .app  │  │ .deb and .rpm    │
│ 200-300 MB    │  │ 250-350 MB      │  │ 180-280 MB       │
└───────┬───────┘  └────────┬────────┘  └────────┬─────────┘
        │                   │                     │
        └───────────────────┴──────────┬──────────┘
                                       │
                                       ▼
                          ┌────────────────────┐
                          │ GitHub Releases    │
                          │ Users Download     │
                          │ Single File        │
                          └────────────────────┘
```

## 7. System Requirements by Component

```
┌────────────────────────────────────────────────────────────────┐
│              MINIMUM SYSTEM REQUIREMENTS                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Operating System:                                              │
│  ├─ Windows 10+                                                │
│  ├─ macOS 12+ (Monterey)                                       │
│  └─ Linux: Ubuntu 20.04+, Rocky 8+                            │
│                                                                 │
│  Hardware:                                                      │
│  ├─ CPU: 64-bit Intel/AMD or Apple Silicon                    │
│  ├─ RAM: 4GB minimum, 8GB recommended                          │
│  └─ Disk: 2GB free (minimum), 5GB recommended                  │
│                                                                 │
│  For AI Workloads:                                             │
│  ├─ RAM: 16GB+ recommended                                     │
│  ├─ GPU: CUDA or Apple Silicon for acceleration               │
│  └─ Disk: 10GB+ for models and datasets                       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

## 8. Component Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                   DEPENDENCY HIERARCHY                          │
└─────────────────────────────────────────────────────────────────┘

Electron App (Main Wrapper)
│
├─► Node.js 18+ (Runtime)
│   ├─► Electron 32.x
│   ├─► IPC modules
│   └─► File system access
│
├─► Python 3.8+ (Runtime)
│   ├─► FastAPI (MCP servers)
│   ├─► PyTorch (ML operations)
│   ├─► Transformers (AI models)
│   ├─► IPFS libraries
│   └─► Hundreds of Python packages
│
├─► SwissKnife (Submodule)
│   ├─► TypeScript/React
│   ├─► Vite build system
│   ├─► WebRTC/libp2p
│   └─► Monaco Editor
│
├─► IPFS Kit (Submodule)
│   ├─► py-ipfs-http-client
│   ├─► PyArrow
│   └─► Storage backends
│
├─► IPFS Datasets (Submodule)
│   ├─► PyTorch
│   ├─► Transformers
│   ├─► FAISS, Qdrant
│   └─► FFmpeg, yt-dlp
│
└─► IPFS Accelerate (Submodule)
    ├─► PyTorch, TensorFlow
    ├─► CUDA, MPS, ROCm
    ├─► GitHub CLI
    └─► Ray (distributed)
```

## 9. Installation Flow

```
┌──────────────────────────────────────────────────────────────┐
│ 1. USER DOWNLOADS INSTALLER                                  │
│    (.exe, .dmg, .deb, .rpm)                                  │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. USER RUNS INSTALLER                                       │
│    • Windows: Double-click .exe                              │
│    • macOS: Extract .zip, drag .app to Applications         │
│    • Linux: sudo dpkg -i / sudo rpm -i                      │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. INSTALLER EXTRACTS FILES                                  │
│    • Electron application                                    │
│    • Python runtime + packages                               │
│    • SwissKnife built files                                  │
│    • MCP server code                                         │
│    • Configuration files                                     │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. CREATE SHORTCUTS & INTEGRATION                            │
│    • Desktop shortcut                                        │
│    • Start menu / Applications folder                        │
│    • File associations                                       │
│    • System path updates                                     │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. USER LAUNCHES APPLICATION                                 │
│    • Electron starts                                         │
│    • Main window opens                                       │
│    • After 2 seconds: All 3 MCP servers auto-start          │
│    • User can access SwissKnife and all features            │
└──────────────────────────────────────────────────────────────┘
```

## 10. Development vs Production Modes

```
┌────────────────────────────────────────────────────────────────┐
│                      DEVELOPMENT MODE                          │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  npm start                                                      │
│    ├─► Electron starts in dev mode                            │
│    ├─► DevTools open automatically                            │
│    ├─► Hot reload enabled                                      │
│    └─► Verbose logging                                         │
│                                                                 │
│  SwissKnife:                                                    │
│    ├─► npm run desktop:collaborative (separate terminal)      │
│    ├─► Runs on http://localhost:3001                          │
│    ├─► Hot module replacement                                  │
│    └─► Electron connects to dev server                        │
│                                                                 │
│  MCP Servers:                                                   │
│    ├─► Auto-start from Electron                               │
│    ├─► Can restart individually for testing                    │
│    └─► Logs visible in Daemon Manager                         │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                      PRODUCTION MODE                           │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Launch installed application:                                  │
│    ├─► ./hallucinate_app (or click icon)                      │
│    ├─► Electron starts in production mode                      │
│    └─► All features bundled                                    │
│                                                                 │
│  SwissKnife:                                                    │
│    ├─► Built files included in package                        │
│    ├─► Served from file:// protocol                           │
│    ├─► Optimized and minified                                 │
│    └─► Fast startup                                            │
│                                                                 │
│  MCP Servers:                                                   │
│    ├─► Auto-start on app launch                               │
│    ├─► Bundled Python environment                             │
│    ├─► All dependencies included                               │
│    └─► Production-ready configuration                         │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Summary

These visual diagrams illustrate the key concepts of Hallucinate App's architecture:

1. **Wrapper Architecture** - How Electron wraps all components
2. **User Interaction** - How users access functionality
3. **SwissKnife Structure** - The 27+ applications in the virtual desktop
4. **Data Flow** - How requests are processed
5. **MCP Communication** - Protocol between SwissKnife and servers
6. **Packaging** - How everything is bundled
7. **System Requirements** - Hardware and software needs
8. **Dependencies** - Component dependency tree
9. **Installation** - User installation process
10. **Development vs Production** - Different operational modes

The key takeaway is that **Hallucinate App is a wrapper** that packages SwissKnife Virtual Desktop and three IPFS MCP servers into a single, distributable desktop application for all major platforms.
