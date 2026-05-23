# Hallucinate App Documentation Index

Welcome to the comprehensive documentation for Hallucinate App - a decentralized AI model serving platform built on IPFS and HuggingFace technologies.

## 🌟 Platform Understanding (Start Here!)

- **[Platform Overview](PLATFORM_OVERVIEW.md)** - 🆕 Complete explanation of the wrapper architecture and how everything works together
- **[Visual Architecture](VISUAL_ARCHITECTURE.md)** - 🆕 Diagrams and visual representations of the system
- **[Submodules Guide](SUBMODULES.md)** - 🆕 Comprehensive documentation for SwissKnife, IPFS Kit, IPFS Datasets, and IPFS Accelerate
- **[Containerization & Packaging](CONTAINERIZATION.md)** - 🆕 How the platform packages into .exe, .dmg, .rpm, .deb, tar.gz

## 📚 Getting Started

- [Quick Start Guide](QUICK_START.md) - Get up and running quickly
- [Installation Guide](INSTALLATION.md) - Detailed installation instructions
- [Quick Start with MCP](QUICK_START_MCP.md) - Model Context Protocol quick start

## 🏗️ Architecture & Design

- [Architecture Overview](ARCHITECTURE.md) - System architecture and design principles
- [Multi-Process Architecture](../hallucinate_app/python/hallucinate_app/README_MULTIPROCESS.md) - Process isolation and parallelization
- [MCP Daemon Architecture](MCP_DAEMON_ARCHITECTURE.md) - Model Context Protocol daemon system
- [Multimodal Control Surface Logic IDL Plan](MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md) - Canonical AI-OS plan for voice, gesture, mouse, and agent mediation
- [Multimodal Control Surface Logic IDL Todo Board](MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md) - Daemon-parseable Hallucinate App backlog for multimodal control work

## 🔐 Security & Authentication

- [Security Overview](../README_SECURITY.md) - Security features and best practices
- [SECURITY.md](../SECURITY.md) - Security policy
- [Authentication Guide](../hallucinate_app/node/README_AUTH.md) - UCAN-based authentication
- [Security Capabilities](ui_components/SECURITY_CAPABILITIES.md) - Capability-based security

## 🚀 Features & Components

### Core Components
- [Model Manager](../hallucinate_app/python/hallucinate_app/README_MODEL_MANAGER.md) - AI model management
- [Transformers Integration](../hallucinate_app/python/hallucinate_app/README_TRANSFORMERS.md) - HuggingFace transformers
- [IPFS Datasets](../hallucinate_app/python/hallucinate_app/README_IPFS_DATASETS.md) - Dataset management
- [GraphRAG](../README_GRAPHRAG.md) - Graph-based retrieval augmented generation

### Data & Storage
- [Multi-Database System](../hallucinate_app/python/hallucinate_app/README_MULTIDB.md) - OrbitDB, FireproofDB, DuckDB
- [PyArrow Content Index](PYARROW_CONTENT_INDEX_BRIDGE.md) - Content metadata management
- [Storage Visualization](ui_components/DASHBOARD_STORAGE_VISUALIZATION.md) - Storage monitoring

### MCP Daemons
- [Daemon Manager](DAEMON_MANAGER.md) - Daemon lifecycle management
- [Daemon Manager UI](DAEMON_MANAGER_UI.md) - Dashboard interface
- [MCP Implementation Summary](MCP_DAEMON_IMPLEMENTATION_SUMMARY.md)

### User Interface
- [Dashboard Components](ui_components/README.md) - UI component overview
- [Observability Dashboard](ui_components/DASHBOARD_OBSERVABILITY.md) - Monitoring interface
- [Enhanced Thumbnails](ui_components/ENHANCED_THUMBNAILS.md) - Visual content preview
- [Real-time Collaboration](ui_components/REALTIME_COLLABORATION.md) - Multi-user features

### Integration & Development
- [IPFS Embeddings & FAISS](IPFS_EMBEDDINGS_FAISS_INTEGRATION.md) - Vector search integration
- [SwissKnife Virtual Desktop](SWISSKNIFE_VIRTUAL_DESKTOP_MOCKUP.md) - Collaborative environment
- [JavaScript Bridge](../hallucinate_app/python/hallucinate_app/js_bridge/README.md) - JS-Python communication

## 📊 Observability & Monitoring

- [Observability Guide](../python/hallucinate_app/docs/observability_guide.md) - Metrics and logging
- [Observability Summary](../OBSERVABILITY_SUMMARY.md) - System monitoring overview
- [Dashboard Optimizations](ui_components/DASHBOARD_OPTIMIZATIONS.md) - Performance tuning

## 🧪 Testing

- [Testing Guide](../hallucinate_app/python/hallucinate_app/test/README_TESTING.md) - Testing infrastructure
- [Playwright Test Harness](PLAYWRIGHT_TEST_HARNESS_SUMMARY.md) - E2E testing
- [UI Component Testing](ui_components/UI_COMPONENT_TESTING.md) - UI tests
- [Real-time Collaboration Testing](ui_components/REALTIME_COLLABORATION_TESTING.md)

## 🐛 Error Handling & Troubleshooting

- [Error Handling Guide](../hallucinate_app/python/hallucinate_app/README_ERROR_HANDLING.md) - Error management system
- [Error Monitoring](../hallucinate_app/python/hallucinate_app/README_ERROR_MONITORING.md) - Error tracking
- [Query Optimization](../hallucinate_app/python/hallucinate_app/README_QUERY_OPTIMIZATION.md) - Performance optimization
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues and solutions

## 📦 Deployment

- [Deployment Guide](DEPLOYMENT.md) - Production deployment instructions
- [Helm Charts](../helm/README.md) - Kubernetes deployment
- [Docker Setup](DOCKER.md) - Container deployment

## 🤝 Contributing

- [Contributing Guide](../CONTRIBUTING.md) - How to contribute
- [Code of Conduct](../CODE_OF_CONDUCT.md) - Community guidelines
- [Development Guide](DEVELOPMENT.md) - Development setup and practices

## 📋 Reference Documentation

- [API Reference](API.md) - API documentation
- [Configuration Reference](CONFIGURATION.md) - Configuration options
- [CLI Reference](CLI.md) - Command-line interface

## 📝 Implementation Details

- [Implementation Summary](IMPLEMENTATION_SUMMARY.md) - Overall implementation status
- [Implementation Complete](../IMPLEMENTATION_COMPLETE.md) - Completed features
- [Completion Summary](../COMPLETION_SUMMARY.md) - Project completion status
- [Submodule Dependencies](SUBMODULE_DEPS_SUMMARY.md) - External dependencies
- [Submodule Integration Baseline](SUBMODULE_INTEGRATION_BASELINE.md) - Pinned SHAs, compatibility matrix, rollout and rollback playbook

## 📸 Screenshots & Visuals

- [Screenshot Documentation](SCREENSHOT_DOCUMENTATION.md) - Visual documentation
- [Menu System](../MENU_SYSTEM.md) - Menu hierarchy and structure
- [Menu Visual](../MENU_VISUAL.md) - Menu visual guide
- [Visual Comparison](../VISUAL_COMPARISON.md) - Before/after comparisons

## 🔄 Change Log

- [CHANGELOG.md](../CHANGELOG.md) - Version history and changes

## 📄 Legal

- [License](../LICENSE) - AGPL-3.0 License
- [Funding](../FUNDING.json) - Project funding information

---

## Quick Links

- [GitHub Repository](https://github.com/endomorphosis/hallucinate_app)
- [Issue Tracker](https://github.com/endomorphosis/hallucinate_app/issues)
- [Discussions](https://github.com/endomorphosis/hallucinate_app/discussions)

---

*This documentation is automatically updated weekly via GitHub Actions based on code changes.*
