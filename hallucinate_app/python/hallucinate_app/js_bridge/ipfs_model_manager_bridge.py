"""
IPFS Model Manager JavaScript Bridge

Provides a bridge between JavaScript and Python for the IPFS Model Manager module.
"""

import os
import sys
import json
import logging
import asyncio
from typing import Dict, Any, Optional, Callable

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_model_manager_bridge")

# Try to import dashboard panel
try:
    from ..dashboard.ipfs_model_manager_panel import IPFSModelManagerPanel, ipfs_model_manager_panel
    HAVE_PANEL = True
except ImportError:
    logger.warning("Could not import IPFSModelManagerPanel, bridge functionality will be limited")
    HAVE_PANEL = False


class IPFSModelManagerBridge:
    """
    Bridge between JavaScript and Python for IPFS Model Manager
    """
    
    def __init__(self, resources=None, config=None):
        """
        Initialize the IPFS Model Manager bridge
        
        Args:
            resources (dict): Shared resources
            config (dict): Bridge configuration
        """
        self.resources = resources or {}
        self.config = config or {}
        
        # Get panel from resources or use default
        if "model_manager_panel" in self.resources:
            self.panel = self.resources["model_manager_panel"]
        elif HAVE_PANEL:
            self.panel = ipfs_model_manager_panel
        else:
            self.panel = None
            
        # Event handlers
        self.event_handlers = {}
        
        # Pending operations and results
        self.pending_operations = {}
        self.operation_results = {}
        
        # Track initialization
        self.initialized = False
        
    async def init(self) -> bool:
        """Initialize the bridge and panel"""
        if not self.panel:
            logger.error("Cannot initialize bridge: No panel available")
            return False
            
        # Initialize panel
        if not self.panel.initialized:
            await self.panel.init()
            
        # Set up panel callback
        self.panel.set_update_callback(self.handle_panel_update)
            
        self.initialized = True
        return True
    
    def handle_panel_update(self, data: Dict[str, Any]):
        """
        Handle updates from the panel
        
        Args:
            data (dict): Panel status data
        """
        # Trigger registered event handlers
        handlers = self.event_handlers.get("panel_update", [])
        for handler in handlers:
            try:
                handler(data)
            except Exception as e:
                logger.error(f"Error in panel update handler: {e}")
                
    async def execute_operation(self, operation: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute an operation on the model manager
        
        Args:
            operation (str): Operation to execute
            params (dict): Operation parameters
            
        Returns:
            dict: Operation result
        """
        if not self.initialized:
            await self.init()
            
        if not self.panel:
            return {
                "success": False,
                "operation": operation,
                "error": "Panel not available"
            }
            
        try:
            # Execute the operation
            result = await self.panel.execute_operation(operation, params)
            return result
        except Exception as e:
            logger.error(f"Error executing operation {operation}: {e}")
            return {
                "success": False,
                "operation": operation,
                "error": str(e)
            }
    
    def register_event_handler(self, event_type: str, handler: Callable[[Dict[str, Any]], None]) -> str:
        """
        Register an event handler
        
        Args:
            event_type (str): Type of event to handle
            handler (callable): Event handler function
            
        Returns:
            str: Handler ID
        """
        # Generate handler ID
        import uuid
        handler_id = str(uuid.uuid4())
        
        # Add to handlers
        if event_type not in self.event_handlers:
            self.event_handlers[event_type] = []
            
        self.event_handlers[event_type].append(handler)
        
        return handler_id
        
    def unregister_event_handler(self, event_type: str, handler_id: str) -> bool:
        """
        Unregister an event handler
        
        Args:
            event_type (str): Type of event
            handler_id (str): Handler ID to remove
            
        Returns:
            bool: True if removed, False otherwise
        """
        if event_type not in self.event_handlers:
            return False
            
        # Find and remove the handler
        for i, handler in enumerate(self.event_handlers[event_type]):
            if getattr(handler, 'id', None) == handler_id:
                self.event_handlers[event_type].pop(i)
                return True
                
        return False
    
    def get_panel_status(self) -> Dict[str, Any]:
        """
        Get current panel status
        
        Returns:
            dict: Panel status
        """
        if not self.panel:
            return {
                "connected": False,
                "error": "Panel not available"
            }
            
        return self.panel.get_status()
    
    async def test(self) -> Dict[str, Any]:
        """
        Test the bridge and panel
        
        Returns:
            dict: Test results
        """
        try:
            if not self.initialized:
                await self.init()
                
            # Test panel if available
            panel_test = None
            if self.panel:
                panel_test = self.panel.test()
                
            # Test operation execution
            operation_test = False
            if self.panel:
                try:
                    result = await self.execute_operation("refresh", {})
                    operation_test = result.get("success", False)
                except Exception as e:
                    logger.error(f"Operation test failed: {e}")
                    
            # Compile results
            return {
                "success": self.initialized and (panel_test["success"] if panel_test else False) and operation_test,
                "module": "ipfs_model_manager_bridge",
                "initialization": self.initialized,
                "panel_test": panel_test,
                "operation_test": operation_test
            }
        except Exception as e:
            logger.error(f"Bridge test failed: {e}")
            return {
                "success": False,
                "module": "ipfs_model_manager_bridge",
                "error": str(e)
            }


# Create default instance
ipfs_model_manager_bridge = IPFSModelManagerBridge()