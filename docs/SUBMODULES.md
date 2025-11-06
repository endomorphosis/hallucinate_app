# Submodule Integration Guide

## Overview

Hallucinate App integrates four major submodules as Git submodules. Each provides critical functionality and is developed and maintained in its own repository. This document provides comprehensive details about each submodule, their roles, and how they integrate with the main application.

## Submodule Architecture

```
hallucinate_app/ (Main Repository)
│
├── swissknife/                    (Submodule)
│   └── https://github.com/endomorphosis/swissknife.git
│
├── ipfs_kit_py/                   (Submodule)
│   └── https://github.com/endomorphosis/ipfs_kit_py.git
│
├── ipfs_datasets_py/              (Submodule)
│   └── https://github.com/endomorphosis/ipfs_datasets_py.git
│
└── ipfs_accelerate_py/            (Submodule)
    └── https://github.com/endomorphosis/ipfs_accelerate_py.git
```

## 1. SwissKnife Virtual Desktop

### Repository
- **URL:** https://github.com/endomorphosis/swissknife.git
- **Path:** `swissknife/`
- **Language:** TypeScript/JavaScript
- **Build System:** Vite

### Purpose

SwissKnife is the **primary user interface** for the Hallucinate App. It provides a revolutionary browser-based collaborative virtual desktop environment that serves as the main interaction layer for all platform features.

### Key Components

#### 27+ Professional Applications

1. **Development Tools**
   - **Terminal** - AI-powered command line interface with distributed execution
   - **VibeCode IDE** - Professional Streamlit development environment with Monaco editor
   - **Neural Network Designer** - Visual architecture building with real-time training
   - **Code Editor** - Full-featured text editor with syntax highlighting

2. **AI & ML Applications**
   - **AI Chat** - Multi-provider LLM interface with conversation management
   - **Hugging Face Hub** - Access to 100,000+ AI models and datasets
   - **OpenRouter Hub** - Universal access to 100+ premium language models
   - **Model Browser** - Browse and search AI models
   - **Training Manager** - Monitor and manage ML training jobs

3. **File & Data Management**
   - **File Manager** - Professional file browser with IPFS integration
   - **IPFS Explorer** - Navigate and manage IPFS content
   - **Image Viewer** - Advanced image viewing and manipulation
   - **Notes** - Collaborative note-taking application

4. **System & Configuration**
   - **Device Manager** - Hardware and device management
   - **Settings** - Application configuration and preferences
   - **System Monitor** - Real-time system resource monitoring
   - **MCP Control** - MCP server management interface
   - **API Keys Manager** - Secure credential storage

5. **Productivity Tools**
   - **Calculator** - Advanced scientific calculator
   - **World Clock** - Multiple timezone support with timers
   - **Task Manager** - P2P task distribution and coordination
   - **AI Cron Scheduler** - Automated workflow scheduling

6. **Creative Tools**
   - **Music Studio (Strudel)** - Collaborative music composition
   - **NAVI** - Navigation and exploration tool

7. **Additional Applications**
   - And 6+ more specialized tools

#### Collaboration Features

**Real-time Multi-user Collaboration:**
```
Collaboration Stack:
├── WebRTC/libp2p for P2P connections
├── CRDT for conflict-free data synchronization
├── Live cursor tracking
├── Shared application state
└── Distributed file synchronization
```

**Key Features:**
- Multiple users in shared workspaces
- Real-time collaborative editing in VibeCode
- Distributed task execution across peers
- IPFS-powered instant file sharing
- Live presence indicators
- Synchronized AI chat conversations

#### AI Integration

**Hugging Face Integration:**
- Access to 100,000+ AI models
- Model search and discovery
- Direct inference capabilities
- Dataset browsing and loading
- Model caching and optimization
- Edge deployment support

**OpenRouter Integration:**
- Universal access to GPT-4, Claude 3, Gemini Pro, Mistral AI
- 100+ premium language models
- Automatic provider selection
- Intelligent fallback mechanisms
- Multi-provider load balancing
- Cost optimization

#### P2P Network Features

**Peer Discovery:**
- Automatic nearby peer discovery
- Manual peer connection
- Peer reputation system
- Network health monitoring

**Distributed Computing:**
- Share computational resources
- Distribute AI inference tasks
- Collaborative model training
- Load balancing across peers

**Decentralized Storage:**
- IPFS integration for file systems
- Automatic content replication
- Version control and history
- Hybrid storage (IPFS + CloudFlare R2)

### Build & Run

```bash
# Development mode with hot reload
cd swissknife
npm install --legacy-peer-deps
npm run desktop:collaborative

# Access at http://localhost:3001

# Production build
npm run build
```

### Integration with Hallucinate App

**Embedding Method:** SwissKnife runs in an Electron BrowserWindow

**Connection Points:**
1. Electron loads SwissKnife from `http://localhost:3001` (dev) or built files
2. SwissKnife connects to MCP servers via HTTP/WebSocket
3. Real-time updates via IPC between SwissKnife and Electron

**Access:** `Windows → SwissKnife Virtual Desktop` from Electron menu

### Technology Stack

- **Frontend:** TypeScript, React, Vite
- **UI Framework:** Modern component library with glassmorphism design
- **Editor:** Monaco Editor (VS Code engine)
- **P2P:** libp2p, WebRTC
- **Storage:** IPFS, IndexedDB, LocalStorage
- **AI:** Hugging Face API, OpenRouter API

## 2. IPFS Kit Python

### Repository
- **URL:** https://github.com/endomorphosis/ipfs_kit_py.git
- **Path:** `ipfs_kit_py/`
- **Language:** Python 3.8+
- **Server:** FastAPI MCP Server

### Purpose

IPFS Kit provides the **foundational IPFS infrastructure** for the platform, including storage operations, cluster management, and content addressing.

### Key Features

#### IPFS Operations
- **Content Management:** Add, retrieve, pin, unpin content
- **CAR Files:** Complete CAR file support (import, export, manipulation)
- **Pinning:** Advanced pinning strategies with multiple backends
- **VFS Integration:** Virtual file system for unified storage access

#### Cluster Management

**Cluster Architecture:**
```
Cluster Topology:
├── Master Node (Leader)
│   ├── Coordinates operations
│   ├── Manages replication
│   └── Handles indexing
│
├── Worker Nodes
│   ├── Execute operations
│   ├── Store replicas
│   └── Process requests
│
└── Leecher Nodes
    ├── Read-only access
    ├── Cache content
    └── Offload queries
```

**Features:**
- Leader election for high availability
- Master/Worker/Leecher role hierarchy
- Automatic replication management
- Distributed indexing services
- Health monitoring and failover

#### Storage Backends

**Supported Backends:**
- **IPFS/Kubo:** Standard IPFS node
- **S3-Compatible:** Amazon S3, MinIO, DigitalOcean Spaces
- **CloudFlare R2:** Edge storage with zero egress fees
- **Local Filesystem:** Direct file storage
- **Custom Backends:** Extensible backend system

**Tiered Storage:**
```
Storage Hierarchy:
Hot Tier (Fast)    → Local SSD, Fast IPFS nodes
Warm Tier (Medium) → S3-compatible storage
Cold Tier (Cheap)  → CloudFlare R2, Archive storage
```

#### MCP Server

**Unified Dashboard:**
- Web-based management interface (Port 8004)
- Schema-driven tool organization
- Real-time status monitoring
- Comprehensive API

**MCP Tools:**
- IPFS operations (add, get, pin, unpin)
- Backend management (create, update, delete)
- Bucket operations (organize content)
- State management (configuration, persistence)
- File operations (upload, download, manage)
- CAR file operations
- Logging and monitoring

**Security Features:**
- Optional API token authentication
- Role-based access control
- Audit logging
- Secure credential storage

### CLI Commands

```bash
# Start MCP server
ipfs-kit mcp start --port 8004

# Stop MCP server
ipfs-kit mcp stop --port 8004

# Check status
ipfs-kit mcp status --port 8004

# List deprecated endpoints
ipfs-kit mcp deprecations
```

### Integration with Hallucinate App

**Daemon Configuration:**
- **Port:** 3001
- **Command:** `python -m ipfs_kit_py.cli mcp start`
- **Auto-start:** Yes (2 seconds after app launch)

**Connection Methods:**
1. HTTP REST API for operations
2. WebSocket for real-time updates
3. MCP protocol for tool calling

**Access:** Automatically managed by MCP Daemon Manager

### Docker & Kubernetes

**Docker Support:**
```bash
# Build image
docker build -t ipfs-kit:latest .

# Run container
docker run -p 8004:8004 ipfs-kit:latest
```

**Kubernetes:**
- StatefulSet for cluster nodes
- Services for load balancing
- ConfigMaps for configuration
- PersistentVolumes for data

See `ipfs_kit_py/deployments/` for manifests

### Technology Stack

- **Server:** FastAPI with async/await
- **IPFS:** py-ipfs-http-client, kubo integration
- **Storage:** PyArrow for efficient data handling
- **Database:** JSON file storage (extensible)
- **MCP:** Model Context Protocol implementation

## 3. IPFS Datasets Python

### Repository
- **URL:** https://github.com/endomorphosis/ipfs_datasets_py.git
- **Path:** `ipfs_datasets_py/`
- **Language:** Python 3.10+
- **Server:** Production MCP Server

### Purpose

IPFS Datasets provides **comprehensive AI data processing** capabilities, including document analysis, knowledge graphs, multimedia processing, and 200+ specialized tools.

### Key Features

#### GraphRAG (Graph-based Retrieval Augmented Generation)

**What it does:** Combines vector embeddings with knowledge graphs for advanced document intelligence.

**Features:**
- Knowledge graph construction from documents
- Automatic entity extraction
- Relationship mapping
- Hybrid search (vector + graph traversal)
- Cross-document reasoning

**Production Testing:**
- 182+ comprehensive tests
- Validated with real-world documents
- Performance benchmarked
- Production-ready status

**Use Cases:**
- Legal document analysis
- Research paper organization
- Technical documentation navigation
- Knowledge base construction

#### Document Processing

**PDF Processing:**
- Text extraction with layout preservation
- Table and image extraction
- Multi-column document handling
- OCR integration for scanned documents

**Legal Document Formalization:**
- Website text extraction
- Natural language to formal logic conversion
- Theorem proving integration
- SAT/SMT solver support (Z3, CVC5, Lean 4, Coq)

**Supported Formats:**
- PDF, DOCX, HTML, Markdown
- Images (with OCR)
- Structured data (JSON, XML, CSV)

#### Multimedia Processing

**FFmpeg Integration:**
- Audio/video transcoding
- Format conversion
- Stream extraction
- Metadata editing

**Platform Support:**
- YouTube, Vimeo, Dailymotion
- 1000+ video platforms via yt-dlp
- Direct download and conversion
- Playlist and channel support

**Audio Processing:**
- Transcription with Whisper
- Audio format conversion
- Noise reduction
- Audio analysis

#### Vector Search & Embeddings

**Vector Store Support:**
- **FAISS:** Facebook AI Similarity Search
- **Qdrant:** Production-ready vector database
- **Elasticsearch:** Full-text + vector search
- **Custom stores:** Extensible architecture

**Embedding Models:**
- Sentence Transformers
- OpenAI embeddings
- HuggingFace models
- Custom embedding functions

**Features:**
- Similarity search
- Semantic clustering
- Nearest neighbor queries
- Batch processing

#### 200+ MCP Tools

**Tool Categories (49+):**
1. **Dataset Tools** - Load, process, transform datasets
2. **PDF Tools** - Extract, analyze, convert PDFs
3. **Vector Store Tools** - FAISS, Qdrant, Elasticsearch operations
4. **Web Archive Tools** - Common Crawl, Internet Archive
5. **Legal Dataset Tools** - Court opinions, regulations
6. **Multimedia Tools** - FFmpeg, yt-dlp, audio processing
7. **Theorem Proving Tools** - Z3, CVC5, Lean, Coq
8. **Knowledge Graph Tools** - GraphRAG, entity extraction
9. **Embedding Tools** - Generate and manage embeddings
10. **File Tools** - IPFS file operations
11. **Processing Tools** - Data transformation pipelines
12. **Analysis Tools** - Statistical analysis, visualization
13. **And 37+ more categories...**

### CLI Usage

```bash
# Basic CLI - common functions
ipfs-datasets info status
ipfs-datasets dataset load squad
ipfs-datasets ipfs pin "data"
ipfs-datasets vector search "query"

# Enhanced CLI - all 200+ tools
python enhanced_cli.py --list-categories
python enhanced_cli.py dataset_tools load_dataset --source squad
python enhanced_cli.py pdf_tools pdf_analyze_relationships --input doc.pdf
python enhanced_cli.py media_tools ffmpeg_info --input video.mp4
```

### MCP Server

```bash
# Start MCP server
python -m ipfs_datasets_py.mcp_server --http --port 3002

# Access web interface
# http://localhost:3002
```

### Integration with Hallucinate App

**Daemon Configuration:**
- **Port:** 3002
- **Command:** `python -m ipfs_datasets_py.mcp_server --http --port 3002`
- **Auto-start:** Yes (2 seconds after app launch)

**Access Methods:**
1. MCP protocol via HTTP
2. Direct CLI tool invocation
3. Python package imports

### Technology Stack

- **Core:** Python 3.10+ with asyncio
- **Server:** Production MCP server
- **ML:** PyTorch, Transformers, sentence-transformers
- **Vector:** FAISS, Qdrant, Elasticsearch
- **Document:** PyPDF2, pdfplumber, python-docx
- **Multimedia:** FFmpeg, yt-dlp
- **Theorem Proving:** Z3, CVC5, Lean 4, Coq
- **Graph:** NetworkX for knowledge graphs

## 4. IPFS Accelerate Python

### Repository
- **URL:** https://github.com/endomorphosis/ipfs_accelerate_py.git
- **Path:** `ipfs_accelerate_py/`
- **Language:** Python 3.8+
- **Server:** Enterprise MCP Server

### Purpose

IPFS Accelerate provides **hardware-accelerated ML inference** with distributed computing capabilities and comprehensive performance optimization.

### Key Features

#### Hardware Acceleration

**Supported Platforms:**
- **CPU** - Intel, AMD processors
- **CUDA** - NVIDIA GPUs with CUDA
- **MPS** - Apple Silicon (M1, M2, M3)
- **ROCm** - AMD GPUs
- **WebGPU** - Browser-based GPU acceleration
- **WebNN** - Web Neural Network API
- **OpenVINO** - Intel optimization
- **Qualcomm** - Mobile/edge devices

**Features:**
- Automatic platform detection
- Optimal model placement
- Dynamic resource allocation
- Multi-GPU support

#### ML Model Support

**Text Processing:**
- Text generation (GPT, LLaMA models)
- Text classification (BERT, RoBERTa)
- Named entity recognition
- Sentiment analysis
- Text summarization

**Audio Processing:**
- Speech transcription (Whisper)
- Audio classification
- Speaker diarization
- Text-to-speech

**Vision Processing:**
- Image classification (ResNet, ViT)
- Object detection (YOLO, Faster R-CNN)
- Image segmentation
- Image generation (Stable Diffusion)

**Multimodal:**
- Image captioning (CLIP-based)
- Visual question answering
- Cross-modal retrieval

**Code Generation:**
- Code completion
- Code translation
- Bug detection
- Documentation generation

#### Performance Optimization

**Performance Modeling:**
```python
# Realistic hardware simulation
modeling = EnhancedPerformanceModeling()
results = modeling.compare_hardware_performance("bert-base", 
    ["cpu", "cuda", "mps"])

# Results show realistic metrics:
# cuda: 1.7ms, 588.8 samples/sec
# mps: 3.3ms, 300.8 samples/sec
# cpu: 27.6ms, 36.2 samples/sec
```

**Advanced Benchmarking:**
- Multi-configuration testing
- Parallel execution
- Statistical analysis
- Optimization recommendations
- Performance variability assessment

**Model-Hardware Compatibility:**
- Compatibility assessment (OPTIMAL/COMPATIBLE/LIMITED/UNSUPPORTED)
- Performance score predictions
- Memory utilization analysis
- Detailed optimization guidance

#### GitHub Integration

**GitHub CLI Integration:**
```bash
# Authentication and repo management
ipfs-accelerate github auth
ipfs-accelerate github repos --owner myorg
ipfs-accelerate github workflows owner/repo
ipfs-accelerate github queues --since-days 1

# Auto-scaling runner service
ipfs-accelerate github autoscaler
ipfs-accelerate github autoscaler --owner myorg --interval 30
```

**GitHub Copilot CLI:**
```bash
# AI-powered CLI assistance
ipfs-accelerate copilot suggest "list text files"
ipfs-accelerate copilot explain "ls -la"
ipfs-accelerate copilot git "commit all changes"
```

**Features:**
- Automatic runner scaling
- Workflow queue management
- Token management from gh CLI
- Dashboard integration
- Self-hosted runner provisioning

#### Distributed Computing

**Queue Management:**
- Async task processing
- Priority queues
- Task dependencies
- Result caching

**Load Balancing:**
- Intelligent task distribution
- Resource-aware scheduling
- Failover handling
- Performance monitoring

### CLI Usage

```bash
# Text generation
ipfs_accelerate text generate --prompt "Hello world" --max-length 50

# Text classification
ipfs_accelerate text classify --text "Great product" --model-id "bert-base"

# Audio transcription
ipfs_accelerate audio transcribe --audio-file "speech.wav"

# Image classification
ipfs_accelerate vision classify --image-file "cat.jpg"

# Multimodal captioning
ipfs_accelerate multimodal caption --image-file "scene.jpg"

# Code generation
ipfs_accelerate specialized code --prompt "Sort a list in Python"

# System information
ipfs_accelerate system list-models
ipfs_accelerate system available-types
```

### MCP Server

```bash
# Start MCP server
python -m ipfs_accelerate_py.cli mcp start --port 3003

# Access dashboard
# http://localhost:3003
```

### Integration with Hallucinate App

**Daemon Configuration:**
- **Port:** 3003
- **Command:** `python -m ipfs_accelerate_py.cli mcp start --port 3003`
- **Auto-start:** Yes (2 seconds after app launch)

**Access Methods:**
1. MCP protocol for tool calling
2. Direct CLI invocation
3. Python package imports
4. REST API endpoints

### Technology Stack

- **Core:** Python 3.8+ with FastAPI
- **ML Frameworks:** PyTorch, TensorFlow, JAX
- **Acceleration:** CUDA, MPS, ROCm, OpenVINO
- **HuggingFace:** Transformers, Datasets, Hub
- **Distributed:** Ray, Celery (optional)
- **GitHub:** gh CLI, PyGithub

## Dependency Installation

### Automatic Installation

When you run `npm install` in the main repository, a post-install script automatically:

1. Initializes git submodules
2. Installs Python dependencies for each submodule
3. Handles platform-specific dependencies (Apple, CUDA)
4. Installs packages in editable mode for development

```bash
# Automatic (recommended)
npm install

# This runs automatically:
# - git submodule update --init --recursive
# - pip install for each submodule
# - Platform-specific package installation
```

### Manual Installation

```bash
# Initialize submodules
git submodule update --init --recursive

# Install dependencies for specific submodule
cd ipfs_kit_py && pip install -e .
cd ipfs_datasets_py && pip install -e .
cd ipfs_accelerate_py && pip install -e .
cd swissknife && npm install --legacy-peer-deps

# Or use the installation script
bash scripts/install_submodule_deps.sh
# or
python scripts/install_submodule_deps.py
```

### Platform-Specific Dependencies

**macOS (Apple Silicon):**
```bash
# Automatically installs MPS-optimized packages
pip install -r ipfs_accelerate_py/requirements_apple.txt
```

**CUDA Systems:**
```bash
# Automatically installs CUDA-enabled packages when nvcc detected
pip install -r ipfs_accelerate_py/requirements_cuda.txt
```

## Submodule Development

### Updating Submodules

```bash
# Update all submodules to latest commits
git submodule update --remote

# Update specific submodule
cd swissknife
git pull origin main
cd ..
git add swissknife
git commit -m "Update swissknife to latest"
```

### Making Changes to Submodules

```bash
# Navigate to submodule
cd ipfs_kit_py

# Create branch
git checkout -b feature/new-feature

# Make changes, commit
git add .
git commit -m "Add new feature"

# Push to submodule repository
git push origin feature/new-feature

# Update main repository reference
cd ..
git add ipfs_kit_py
git commit -m "Update ipfs_kit_py reference"
```

### Testing Changes

```bash
# Test individual submodule
cd ipfs_kit_py
pytest tests/

# Test integration with main app
cd ..
npm test

# Run specific integration tests
npm run test:bridge
npm run test:daemon-manager
```

## Troubleshooting

### Submodules Not Initialized

```bash
# Error: submodule directories are empty
git submodule update --init --recursive
```

### Dependency Installation Fails

```bash
# Reinstall with verbose output
pip install -e ipfs_kit_py -v

# Check Python version
python --version  # Should be 3.8+

# Update pip
pip install --upgrade pip setuptools wheel
```

### Submodule Out of Sync

```bash
# Reset submodule to tracked commit
git submodule update --force ipfs_kit_py

# Or update to latest
cd ipfs_kit_py
git checkout main
git pull
cd ..
```

### MCP Server Won't Start

```bash
# Check if port is in use
lsof -i :3001  # IPFS Kit
lsof -i :3002  # IPFS Datasets
lsof -i :3003  # IPFS Accelerate

# Check Python dependencies
pip list | grep ipfs

# Check daemon manager logs
# Open Electron → Daemons → Daemon Manager
# Review event log for errors
```

## Best Practices

### For Users

1. **Don't modify submodules directly** in the installation directory
2. **Use the provided interfaces** (MCP servers, CLI tools)
3. **Keep submodules updated** via `git submodule update --remote`
4. **Report issues** to the specific submodule repository

### For Developers

1. **Develop in submodule repositories** directly
2. **Test changes** before updating main repository reference
3. **Document integration points** when adding new features
4. **Maintain backward compatibility** in public APIs
5. **Use semantic versioning** for submodule releases

### For Contributors

1. **Fork submodule repositories** for contributions
2. **Submit pull requests** to submodule repos first
3. **Update main repo** only after submodule PR is merged
4. **Test integration** thoroughly before proposing changes
5. **Update documentation** for any interface changes

## Additional Resources

### Submodule Repositories
- [SwissKnife](https://github.com/endomorphosis/swissknife)
- [IPFS Kit Python](https://github.com/endomorphosis/ipfs_kit_py)
- [IPFS Datasets Python](https://github.com/endomorphosis/ipfs_datasets_py)
- [IPFS Accelerate Python](https://github.com/endomorphosis/ipfs_accelerate_py)

### Related Documentation
- [Platform Overview](PLATFORM_OVERVIEW.md)
- [Architecture Guide](ARCHITECTURE.md)
- [Installation Guide](INSTALLATION.md)
- [MCP Daemon Architecture](MCP_DAEMON_ARCHITECTURE.md)

### Support
- [Main Repository Issues](https://github.com/endomorphosis/hallucinate_app/issues)
- [SwissKnife Issues](https://github.com/endomorphosis/swissknife/issues)
- [IPFS Kit Issues](https://github.com/endomorphosis/ipfs_kit_py/issues)
- [IPFS Datasets Issues](https://github.com/endomorphosis/ipfs_datasets_py/issues)
- [IPFS Accelerate Issues](https://github.com/endomorphosis/ipfs_accelerate_py/issues)

---

*This documentation covers all four submodules integrated into Hallucinate App. Each submodule is actively developed and maintained in its own repository.*
