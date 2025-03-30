"""
Test IPFS Transformers Dashboard

Tests for the IPFS Transformers Dashboard panel and bridge with ipfs_accelerate_py integration.
"""

import os
import json
import asyncio
import unittest
import logging
from pathlib import Path
from typing import Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("test_ipfs_transformers_dashboard")

# Try to import required modules
try:
    from hallucinate_app.ipfs_transformers import IPFSTransformers, ipfs_transformers
    from hallucinate_app.dashboard.ipfs_transformers_panel import IPFSTransformersPanel
    from hallucinate_app.js_bridge.ipfs_transformers_bridge import IPFSTransformersBridge
    HAVE_TRANSFORMERS = True
except ImportError:
    logger.warning("Could not import one or more required modules")
    HAVE_TRANSFORMERS = False

# Mock functions and classes if imports fail
if not HAVE_TRANSFORMERS:
    class IPFSTransformers:
        def __init__(self, resources=None, metadata=None):
            self.resources = resources or {}
            self.metadata = metadata or {}
            self.initialized = False
            self.model_registry = {}
            self.hardware_capabilities = {"cpu": True}
            self.active_model_id = None
            
        async def init(self):
            self.initialized = True
            return True
            
        async def load_model(self, model_id, task=None, options=None):
            return {"success": True, "model_id": model_id}
            
        async def run_inference(self, inputs, model_id=None, options=None):
            return {"success": True, "output": "Mock inference result"}
            
        def test(self):
            return {"success": True, "module": "transformers"}
            
    ipfs_transformers = IPFSTransformers()
    
    class IPFSTransformersPanel:
        def __init__(self, resources=None, config=None):
            self.resources = resources or {}
            self.config = config or {}
            self.transformers = ipfs_transformers
            self.initialized = False
            self.status = {
                "connected": False,
                "initialized": False,
                "loaded_models": {},
                "operations": []
            }
            self.update_callback = None
            
        async def init(self):
            self.initialized = True
            return True
            
        async def _refresh_data(self):
            self.status["connected"] = True
            self.status["initialized"] = True
            
        def get_status(self):
            return self.status
            
        def set_update_callback(self, callback):
            self.update_callback = callback
            
        async def execute_operation(self, operation, params):
            return {"success": True, "operation": operation}
            
        def get_html(self):
            return "<div>Mock HTML content</div>"
            
        def test(self):
            return {"success": True, "module": "ipfs_transformers_panel"}
            
    class IPFSTransformersBridge:
        def __init__(self, resources=None, config=None):
            self.resources = resources or {}
            self.config = config or {}
            self.panel = IPFSTransformersPanel()
            self.initialized = False
            self.event_callback = None
            
        async def init(self):
            self.initialized = True
            return True
            
        def set_event_callback(self, callback):
            self.event_callback = callback
            
        async def execute(self, method, params):
            return {"success": True, "method": method}
            
        def test(self):
            return {"success": True, "module": "ipfs_transformers_bridge"}


class TestIPFSTransformersDashboard(unittest.TestCase):
    """Test case for IPFS Transformers Dashboard"""
    
    @classmethod
    def setUpClass(cls):
        """Set up test fixtures"""
        # Create test resources
        cls.resources = {}
        
        # Initialize components
        cls.transformers = IPFSTransformers()
        cls.panel = IPFSTransformersPanel(resources={"transformers": cls.transformers})
        cls.bridge = IPFSTransformersBridge(resources={"transformers_panel": cls.panel})
        
    def setUp(self):
        """Set up test case"""
        self.loop = asyncio.get_event_loop()
        
    async def async_init_components(self):
        """Initialize components asynchronously"""
        # Initialize transformers
        transformers_init = await self.transformers.init()
        self.assertTrue(transformers_init, "Failed to initialize transformers")
        
        # Initialize panel
        panel_init = await self.panel.init()
        self.assertTrue(panel_init, "Failed to initialize panel")
        
        # Initialize bridge
        bridge_init = await self.bridge.init()
        self.assertTrue(bridge_init, "Failed to initialize bridge")
        
    def test_01_initialization(self):
        """Test initialization of components"""
        self.loop.run_until_complete(self.async_init_components())
        
        # Check components are initialized
        self.assertTrue(self.transformers.initialized, "Transformers not initialized")
        self.assertTrue(self.panel.initialized, "Panel not initialized")
        self.assertTrue(self.bridge.initialized, "Bridge not initialized")
        
    async def async_test_panel_operations(self):
        """Test panel operations"""
        # Test refresh operation
        refresh_result = await self.panel.execute_operation("refresh", {})
        self.assertTrue(refresh_result["success"], "Refresh operation failed")
        
        # Get status
        status = self.panel.get_status()
        self.assertTrue(status["connected"], "Panel not connected")
        self.assertTrue(status["initialized"], "Panel not initialized")
        
        # Test HTML generation
        html = self.panel.get_html()
        self.assertTrue(html and len(html) > 0, "Failed to generate HTML")
        self.assertTrue("<div" in html, "HTML does not contain divs")
        
    def test_02_panel_operations(self):
        """Test panel operations"""
        self.loop.run_until_complete(self.async_test_panel_operations())
        
    async def async_test_bridge_operations(self):
        """Test bridge operations"""
        # Test get_status
        status_result = await self.bridge.execute("get_status", {})
        self.assertTrue(status_result["success"], "Failed to get status via bridge")
        self.assertTrue("status" in status_result, "Status not returned")
        
        # Test execute_operation
        operation_result = await self.bridge.execute("execute_operation", {
            "operation": "refresh",
            "params": {}
        })
        self.assertTrue(operation_result["success"], "Failed to execute operation via bridge")
        self.assertTrue("result" in operation_result, "Result not returned")
        
        # Test get_html
        html_result = await self.bridge.execute("get_html", {})
        self.assertTrue(html_result["success"], "Failed to get HTML via bridge")
        self.assertTrue("html" in html_result, "HTML not returned")
        
    def test_03_bridge_operations(self):
        """Test bridge operations"""
        self.loop.run_until_complete(self.async_test_bridge_operations())
        
    async def async_test_callback(self):
        """Test callback functionality"""
        # Callback data store
        callback_data = {}
        
        # Define callback
        def update_callback(status):
            callback_data["status"] = status
            
        # Set callback
        self.panel.set_update_callback(update_callback)
        
        # Trigger update
        await self.panel._refresh_data()
        
        # Check callback executed
        self.assertTrue("status" in callback_data, "Callback not executed")
        
    def test_04_callback(self):
        """Test callback functionality"""
        self.loop.run_until_complete(self.async_test_callback())
        
    def test_05_component_tests(self):
        """Test component test methods"""
        # Test transformers
        transformers_test = self.transformers.test()
        self.assertTrue(transformers_test["success"], "Transformers test failed")
        
        # Test panel
        panel_test = self.panel.test()
        self.assertTrue(panel_test["success"], "Panel test failed")
        
        # Test bridge
        bridge_test = self.bridge.test()
        self.assertTrue(bridge_test["success"], "Bridge test failed")


async def run_tests(use_mock=True):
    """
    Run tests for IPFS Transformers Dashboard
    
    Args:
        use_mock (bool): Whether to use mock implementations
        
    Returns:
        dict: Test results
    """
    logger.info("Running IPFS Transformers Dashboard tests")
    
    try:
        # Mock implementations if requested
        if use_mock and not HAVE_TRANSFORMERS:
            logger.info("Using mock implementations")
            
        # Initialize test components
        transformers = IPFSTransformers()
        panel = IPFSTransformersPanel(resources={"transformers": transformers})
        bridge = IPFSTransformersBridge(resources={"transformers_panel": panel})
        
        # Initialize components
        transformers_init = await transformers.init()
        panel_init = await panel.init()
        bridge_init = await bridge.init()
        
        # Run basic tests
        results = {
            "transformers": transformers.test(),
            "panel": panel.test(),
            "bridge": bridge_test = bridge.test()
        }
        
        # Test panel operations
        refresh_result = await panel.execute_operation("refresh", {})
        
        # Test bridge operations
        status_result = await bridge.execute("get_status", {})
        operation_result = await bridge.execute("execute_operation", {
            "operation": "refresh",
            "params": {}
        })
        html_result = await bridge.execute("get_html", {})
        
        # Compile test results
        test_results = {
            "success": all([
                transformers_init,
                panel_init,
                bridge_init,
                results["transformers"]["success"],
                results["panel"]["success"],
                results["bridge"]["success"],
                refresh_result["success"],
                status_result["success"],
                operation_result["success"],
                html_result["success"]
            ]),
            "module": "ipfs_transformers_dashboard",
            "component_tests": results,
            "initialization": {
                "transformers": transformers_init,
                "panel": panel_init,
                "bridge": bridge_init
            },
            "operations": {
                "panel_refresh": refresh_result["success"],
                "bridge_status": status_result["success"],
                "bridge_operation": operation_result["success"],
                "bridge_html": html_result["success"]
            }
        }
        
        return test_results
    except Exception as e:
        logger.error(f"IPFS Transformers Dashboard tests failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        return {
            "success": False,
            "module": "ipfs_transformers_dashboard",
            "error": str(e)
        }


if __name__ == "__main__":
    # Run tests from command line
    loop = asyncio.get_event_loop()
    results = loop.run_until_complete(run_tests())
    
    # Print results
    print(json.dumps(results, indent=2))
    
    # Set exit code based on success
    import sys
    sys.exit(0 if results["success"] else 1)