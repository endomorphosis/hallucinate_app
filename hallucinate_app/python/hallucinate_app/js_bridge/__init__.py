"""
JavaScript Bridge Modules for hallucinate_app

This package contains bridge modules for JavaScript-Python communication
using PyBridge and Apache Arrow for efficient data exchange.
"""

# Make bridges available at the package level
try:
    from hallucinate_app.js_bridge.pyarrow_content_index_bridge import content_index_bridge
except ImportError:
    pass

try:
    from hallucinate_app.js_bridge.ipfs_model_manager_bridge import ipfs_model_manager_bridge
except ImportError:
    pass

try:
    from hallucinate_app.js_bridge.ipfs_transformers_bridge import ipfs_transformers_bridge
except ImportError:
    pass