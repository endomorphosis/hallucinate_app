"""
IPFS Kit Dashboard Bridge

This module provides a bridge between the JavaScript dashboard and the Python IPFS Kit.
It enables the dashboard to monitor and control IPFS operations through a JSON-RPC interface.
"""

import os
import sys
import json
import time
import threading
import logging
from typing import Dict, List, Any, Optional, Callable, Union

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Adjust import paths if needed
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import dashboard panel
try:
    from hallucinate_app.dashboard.ipfs_kit_panel import IPFSKitPanel
except ImportError as e:
    logger.error(f"Failed to import IPFSKitPanel: {e}")
    sys.exit(1)


class IPFSKitDashboardBridge:
    """
    Bridge between JavaScript dashboard and Python IPFS Kit.
    
    This class provides methods to initialize, monitor, and control the IPFS Kit
    from the JavaScript dashboard through a JSON-RPC interface.
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the IPFS Kit dashboard bridge.
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Create the panel instance
        self.panel = IPFSKitPanel(resources=self.resources, metadata=self.metadata)
        
        # Status update queue
        self.update_queue = []
        self.queue_lock = threading.Lock()
        
        # Register callback for updates
        self.panel.register_update_callback(self._handle_update)
        
        logger.info("IPFS Kit dashboard bridge initialized")
    
    def init(self) -> Dict[str, Any]:
        """
        Initialize the IPFS Kit panel.
        
        Returns:
            Dictionary with initialization result
        """
        try:
            init_result = self.panel.init()
            
            return {
                "success": init_result,
                "message": "IPFS Kit panel initialized successfully" if init_result else "Failed to initialize IPFS Kit panel"
            }
        except Exception as e:
            logger.error(f"Error initializing IPFS Kit panel: {e}")
            
            return {
                "success": False,
                "error": str(e)
            }
    
    def _handle_update(self, status: Dict[str, Any]):
        """
        Handle status updates from the panel.
        
        Args:
            status: Current status information
        """
        with self.queue_lock:
            self.update_queue.append({
                "type": "status_update",
                "timestamp": time.time(),
                "status": status
            })
    
    def get_updates(self) -> List[Dict[str, Any]]:
        """
        Get pending status updates.
        
        Returns:
            List of status updates
        """
        with self.queue_lock:
            updates = self.update_queue.copy()
            self.update_queue = []
            
        return updates
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get current IPFS Kit status.
        
        Returns:
            Dictionary with status information
        """
        return self.panel.get_status()
    
    def execute_operation(self, operation: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute an IPFS operation.
        
        Args:
            operation: Operation to execute
            params: Operation parameters
            
        Returns:
            Dictionary with operation result
        """
        return self.panel.execute_operation(operation, params)
    
    def test(self) -> Dict[str, Any]:
        """
        Run a self-test.
        
        Returns:
            Dictionary with test results
        """
        return self.panel.test()
    
    def stop(self) -> Dict[str, Any]:
        """
        Stop the IPFS Kit panel.
        
        Returns:
            Dictionary with stop result
        """
        try:
            self.panel.stop()
            
            return {
                "success": True,
                "message": "IPFS Kit panel stopped successfully"
            }
        except Exception as e:
            logger.error(f"Error stopping IPFS Kit panel: {e}")
            
            return {
                "success": False,
                "error": str(e)
            }
    
    def handle_rpc(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle JSON-RPC requests from the dashboard.
        
        Args:
            method: Method to call
            params: Method parameters
            
        Returns:
            Dictionary with method result
        """
        try:
            # Map methods to functions
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
            
            if method not in method_map:
                return {
                    "success": False,
                    "error": f"Unknown method: {method}"
                }
            
            # Call the method
            if method == "execute_operation":
                return method_map[method]()
            else:
                return method_map[method]()
        except Exception as e:
            logger.error(f"Error handling RPC request: {e}")
            
            return {
                "success": False,
                "error": str(e)
            }


# Create a JSON-RPC handler function for external use
def handle_ipfs_kit_rpc(method: str, params: Union[Dict[str, Any], None] = None) -> str:
    """
    Handle JSON-RPC requests from JavaScript.
    
    Args:
        method: Method to call
        params: Method parameters
        
    Returns:
        JSON string with method result
    """
    # Create a singleton bridge instance
    if not hasattr(handle_ipfs_kit_rpc, "bridge"):
        handle_ipfs_kit_rpc.bridge = IPFSKitDashboardBridge()
    
    # Handle the request
    result = handle_ipfs_kit_rpc.bridge.handle_rpc(method, params or {})
    
    # Return JSON string
    return json.dumps(result)


# Example usage
if __name__ == "__main__":
    # Create bridge instance
    bridge = IPFSKitDashboardBridge(metadata={"use_mock": True})
    
    # Initialize
    init_result = bridge.init()
    print(json.dumps(init_result, indent=2))
    
    if init_result["success"]:
        # Get status
        status = bridge.get_status()
        print(json.dumps(status, indent=2))
        
        # Run test
        test_result = bridge.test()
        print(json.dumps(test_result, indent=2))
        
        # Stop
        bridge.stop()