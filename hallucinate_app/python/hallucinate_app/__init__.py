"""
Hallucinate App Python Package

This package contains the Python modules for the hallucinate_app project,
which bridges IPFS and HuggingFace technologies for decentralized AI workloads.

Key features:
- IPFS integration for decentralized storage and retrieval
- HuggingFace model loading and serving
- Multi-process architecture for non-blocking operations
- Resource pooling for efficient module interdependencies
- Authentication and security layers
"""

__version__ = "0.1.0"

# Make key modules available at the top level
try:
    from hallucinate_app.ipfs_kit import IPFSKit
except ImportError:
    pass

try:
    from hallucinate_app.ipfs_kit_server import IPFSKitServer, IPFSKitClient
except ImportError:
    pass
