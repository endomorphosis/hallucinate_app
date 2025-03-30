"""
IPFS Kit Dashboard Bridge Integration

This module integrates the IPFS Kit Bridge with the main dashboard system.
"""

import os
import sys
import json
import logging
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Adjust import paths if needed
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    # Import the IPFS Kit bridge
    from hallucinate_app.js_bridge.ipfs_kit_dashboard import handle_ipfs_kit_rpc
except ImportError as e:
    logger.warning(f"Failed to import IPFS Kit Dashboard Bridge: {e}")
    
    # Create a mock handler for testing purposes
    class MockIPFSKitPanel:
        def __init__(self):
            self.initialized = False
            self.status = {
                "node_info": {
                    "id": "MockPeerID",
                    "version": "go-ipfs/mock",
                    "protocol_version": "ipfs/mock",
                    "addresses": ["/ip4/127.0.0.1/tcp/4001"],
                },
                "pin_set": {
                    "count": 3,
                    "sample": ["QmMockHash1", "QmMockHash2", "QmMockHash3"],
                },
                "peers": {
                    "count": 2,
                    "sample": ["MockPeer1", "MockPeer2"],
                },
                "performance": {
                    "uptime": 3600,
                    "last_refresh": time.time(),
                    "operations": {
                        "add": {"count": 5, "avg_time": 0.1, "last_time": 0.08},
                        "cat": {"count": 3, "avg_time": 0.05, "last_time": 0.04},
                    },
                },
                "implementation": "Mock",
                "use_mock": True,
            }
        
        def init(self):
            self.initialized = True
            return {"success": True, "message": "Mock IPFS Kit initialized"}
        
        def get_status(self):
            return self.status
        
        def get_updates(self):
            return []
        
        def execute_operation(self, operation, params):
            return {"success": True, "result": "Mock operation executed"}
        
        def test(self):
            return {
                "success": True,
                "module": "ipfs_kit_mock",
                "tests": [
                    {"name": "mock_test", "success": True}
                ]
            }
        
        def stop(self):
            return {"success": True, "message": "Mock IPFS Kit stopped"}
        
        def handle_rpc(self, method, params):
            method_map = {
                "init": self.init,
                "get_status": self.get_status,
                "get_updates": self.get_updates,
                "execute_operation": lambda: self.execute_operation(
                    params.get("operation", ""),
                    params.get("params", {})
                ),
                "test": self.test,
                "stop": self.stop,
            }
            
            if method in method_map:
                result = method_map[method]()
                return result
            else:
                return {"success": False, "error": f"Unknown method: {method}"}
    
    # Create a singleton mock panel
    _mock_panel = MockIPFSKitPanel()
    
    # Create a mock handler
    def handle_ipfs_kit_rpc(method, params=None):
        """Mock handler when IPFS Kit Bridge is not available."""
        result = _mock_panel.handle_rpc(method, params or {})
        return json.dumps(result)


def register_dashboard_bridges(dashboard_bridge_registry):
    """
    Register IPFS Kit bridges with the main dashboard bridge registry.
    
    Args:
        dashboard_bridge_registry: Registry for dashboard bridges
    """
    # Register IPFS Kit RPC handler
    dashboard_bridge_registry.register('ipfs_kit_rpc', ipfs_kit_rpc_handler)
    
    logger.info("IPFS Kit dashboard bridges registered successfully")


def ipfs_kit_rpc_handler(method: str, params: Optional[Dict[str, Any]] = None) -> str:
    """
    Handle IPFS Kit RPC requests from the dashboard.
    
    Args:
        method: RPC method to call
        params: Method parameters
        
    Returns:
        JSON string with result
    """
    try:
        # Call the bridge handler
        return handle_ipfs_kit_rpc(method, params)
    except Exception as e:
        logger.error(f"Error handling IPFS Kit RPC request: {e}")
        
        # Return error response
        return json.dumps({
            "success": False,
            "error": str(e)
        })


# Test function
def test_ipfs_kit_bridge():
    """
    Test the IPFS Kit bridge integration.
    
    Returns:
        Dictionary with test results
    """
    test_results = {
        "success": True,
        "module": "ipfs_kit_bridge",
        "tests": []
    }
    
    try:
        # Test initialization
        init_result = json.loads(handle_ipfs_kit_rpc('init'))
        
        test_results["tests"].append({
            "name": "initialization",
            "success": init_result.get('success', False),
            "result": init_result
        })
        
        if not init_result.get('success', False):
            test_results["success"] = False
        
        # Test get_status
        status_result = json.loads(handle_ipfs_kit_rpc('get_status'))
        
        test_results["tests"].append({
            "name": "get_status",
            "success": isinstance(status_result, dict),
            "result": "OK" if isinstance(status_result, dict) else "Failed"
        })
        
        # Run self-test
        test_result = json.loads(handle_ipfs_kit_rpc('test'))
        
        test_results["tests"].append({
            "name": "self_test",
            "success": test_result.get('success', False),
            "result": "OK" if test_result.get('success', False) else "Failed"
        })
        
        if not test_result.get('success', False):
            test_results["success"] = False
        
        # Stop the bridge
        stop_result = json.loads(handle_ipfs_kit_rpc('stop'))
        
        test_results["tests"].append({
            "name": "stop",
            "success": stop_result.get('success', False),
            "result": stop_result
        })
        
        return test_results
    except Exception as e:
        logger.error(f"Error testing IPFS Kit bridge: {e}")
        
        test_results["success"] = False
        test_results["error"] = str(e)
        
        return test_results


# Example usage
if __name__ == "__main__":
    # Run test
    test_results = test_ipfs_kit_bridge()
    print(json.dumps(test_results, indent=2))