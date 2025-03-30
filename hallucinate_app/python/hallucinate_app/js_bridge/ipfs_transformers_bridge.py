"""
IPFS Transformers Bridge

Bridge between JavaScript and Python for the IPFS Transformers dashboard.
"""

import json
import logging
import asyncio
import traceback
from typing import Dict, List, Any, Optional, Callable, Union

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_transformers_bridge")

# Try to import IPFS Transformers panel
try:
    from ..dashboard.ipfs_transformers_panel import IPFSTransformersPanel, ipfs_transformers_panel
    HAVE_PANEL = True
except ImportError:
    logger.warning("Could not import IPFSTransformersPanel, bridge functionality will be limited")
    HAVE_PANEL = False


class IPFSTransformersBridge:
    """
    Bridge between JavaScript and Python for IPFS Transformers dashboard
    
    Provides methods for JavaScript to communicate with the Python
    implementation of IPFS Transformers panel.
    """
    
    def __init__(self, resources=None, config=None):
        """
        Initialize the IPFS Transformers bridge
        
        Args:
            resources (dict): Resources required by the bridge
            config (dict): Bridge configuration
        """
        self.resources = resources or {}
        self.config = config or {}
        
        # Get panel from resources or use the default instance
        if "transformers_panel" in self.resources:
            self.panel = self.resources["transformers_panel"]
        elif HAVE_PANEL:
            self.panel = ipfs_transformers_panel
        else:
            # No panel available
            self.panel = None
            
        # Callback for bridge events
        self.event_callback = None
        
        # Bridge is initialized when panel is available
        self.initialized = HAVE_PANEL and self.panel is not None
        
    async def init(self):
        """Initialize the bridge"""
        if not self.initialized:
            if not HAVE_PANEL:
                logger.error("Cannot initialize bridge: IPFSTransformersPanel not available")
                return False
                
            if not self.panel:
                logger.error("Cannot initialize bridge: No panel provided")
                return False
        
        # Make sure panel is initialized
        if not self.panel.initialized:
            try:
                await self.panel.init()
            except Exception as e:
                logger.error(f"Failed to initialize panel: {e}")
                return False
        
        # Register callback for panel updates
        self.panel.set_update_callback(self._handle_panel_update)
        
        self.initialized = True
        return True
        
    def _handle_panel_update(self, status):
        """
        Handle status updates from the panel
        
        Args:
            status (dict): Panel status update
        """
        if self.event_callback:
            # Call the JavaScript callback with the status update
            try:
                self.event_callback({
                    "type": "status_update",
                    "data": status
                })
            except Exception as e:
                logger.error(f"Error in panel update callback: {e}")
        
    def set_event_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """
        Set callback for bridge events
        
        Args:
            callback (callable): Callback function to receive events
        """
        self.event_callback = callback
        
    async def execute(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a bridge method
        
        Args:
            method (str): Method to execute
            params (dict): Method parameters
                
        Returns:
            dict: Method result
        """
        if not self.initialized:
            try:
                initialized = await self.init()
                if not initialized:
                    return {
                        "success": False,
                        "error": "Bridge not initialized"
                    }
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Bridge initialization failed: {e}"
                }
        
        try:
            # Execute method
            if method == "get_status":
                return {
                    "success": True,
                    "status": self.panel.get_status() if self.panel else {}
                }
                
            elif method == "execute_operation":
                if "operation" not in params:
                    return {
                        "success": False,
                        "error": "Missing required parameter: operation"
                    }
                
                operation = params["operation"]
                operation_params = params.get("params", {})
                
                if not self.panel:
                    return {
                        "success": False,
                        "error": "Panel not available"
                    }
                
                result = await self.panel.execute_operation(operation, operation_params)
                return {
                    "success": True,
                    "result": result
                }
                
            elif method == "get_html":
                if not self.panel:
                    return {
                        "success": False,
                        "error": "Panel not available",
                        "html": "<div class='error'>IPFS Transformers panel not available</div>"
                    }
                
                html = self.panel.get_html()
                return {
                    "success": True,
                    "html": html
                }
                
            else:
                return {
                    "success": False,
                    "error": f"Unknown method: {method}"
                }
                
        except Exception as e:
            logger.error(f"Error executing bridge method {method}: {e}")
            logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": str(e)
            }
    
    def test(self):
        """Test the bridge"""
        try:
            # Run tests
            loop = asyncio.get_event_loop()
            
            # Test initialization
            init_result = loop.run_until_complete(self.init())
            
            # Test execute
            execute_test = False
            if init_result and self.panel:
                # Try a simple status request
                execute_result = loop.run_until_complete(
                    self.execute("get_status", {})
                )
                execute_test = execute_result.get("success", False)
                
            # Compile results
            results = {
                "success": init_result and execute_test,
                "module": "ipfs_transformers_bridge",
                "initialization": init_result,
                "execute_test": execute_test,
                "capability_check": {
                    "panel": self.panel is not None
                }
            }
            
            return results
        except Exception as e:
            logger.error(f"IPFSTransformersBridge test failed: {e}")
            return {
                "success": False,
                "module": "ipfs_transformers_bridge",
                "error": str(e)
            }


# Create default instance
ipfs_transformers_bridge = IPFSTransformersBridge()