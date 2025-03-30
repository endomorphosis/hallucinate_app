"""
IPFS Model Manager Dashboard Panel

Provides a dashboard panel for the IPFS Model Manager module.
"""

import os
import json
import time
import asyncio
import logging
import threading
from datetime import datetime
from typing import Dict, List, Optional, Any, Callable

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_model_manager_panel")

# Try to import required modules
try:
    from ..ipfs_model_manager import IPFSModelManager, ModelMetadata, ipfs_model_manager
    HAVE_MODEL_MANAGER = True
except ImportError:
    logger.warning("Could not import IPFSModelManager, using mock implementation")
    HAVE_MODEL_MANAGER = False


class IPFSModelManagerPanel:
    """Dashboard panel for IPFS Model Manager"""
    
    def __init__(self, resources=None, config=None):
        """
        Initialize the IPFS Model Manager dashboard panel
        
        Args:
            resources (dict): Resources required by the panel
            config (dict): Panel configuration
        """
        self.resources = resources or {}
        self.config = config or {
            "refresh_interval": 5,  # seconds
            "max_history": 50,      # operations to keep in history
            "show_models": True,    # display model list
            "auto_refresh": True    # automatically refresh status
        }
        
        # Get model manager from resources or use the default instance
        if "model_manager" in self.resources:
            self.model_manager = self.resources["model_manager"]
        elif HAVE_MODEL_MANAGER:
            self.model_manager = ipfs_model_manager
        else:
            # Mock implementation
            self.model_manager = None
            
        # Panel status
        self.status = {
            "connected": False,
            "models_count": 0,
            "models": {},
            "last_updated": None,
            "operations": [],
            "stats": {
                "models_imported": 0,
                "total_size_bytes": 0,
                "ipfs_models": 0,
                "huggingface_models": 0
            }
        }
        
        # Callback for dashboard updates
        self.update_callback = None
        
        # Threading controls
        self.stop_monitoring = threading.Event()
        self._monitor_thread = None
        
        # Panel is initialized when the model manager is available
        self.initialized = HAVE_MODEL_MANAGER and self.model_manager is not None
        
    async def init(self):
        """Initialize the dashboard panel"""
        if not self.initialized:
            if not HAVE_MODEL_MANAGER:
                logger.error("Cannot initialize panel: IPFSModelManager not available")
                return False
                
            if not self.model_manager:
                logger.error("Cannot initialize panel: No model manager provided")
                return False
        
        # Make sure model manager is initialized
        if not self.model_manager.initialized:
            try:
                await self.model_manager.init()
            except Exception as e:
                logger.error(f"Failed to initialize model manager: {e}")
                return False
        
        # Initial data refresh
        await self._refresh_data()
        
        # Start monitoring in a background thread if auto-refresh is enabled
        if self.config["auto_refresh"]:
            self._start_monitoring()
        
        self.initialized = True
        return True
        
    def _start_monitoring(self):
        """Start background monitoring thread"""
        if self._monitor_thread and self._monitor_thread.is_alive():
            # Already running
            return
            
        # Clear stop event
        self.stop_monitoring.clear()
        
        # Start thread
        self._monitor_thread = threading.Thread(
            target=self._monitor_thread_func,
            daemon=True
        )
        self._monitor_thread.start()
        logger.info("Model manager monitoring thread started")
        
    def _stop_monitoring(self):
        """Stop background monitoring thread"""
        if not self._monitor_thread or not self._monitor_thread.is_alive():
            # Not running
            return
            
        # Set stop event
        self.stop_monitoring.set()
        
        # Wait for thread to end with timeout
        self._monitor_thread.join(timeout=2.0)
        
        logger.info("Model manager monitoring thread stopped")
        
    def _monitor_thread_func(self):
        """Background thread for monitoring model manager status"""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        while not self.stop_monitoring.is_set():
            try:
                # Refresh data
                loop.run_until_complete(self._refresh_data())
                
                # Update dashboard if callback is set
                if self.update_callback:
                    self.update_callback(self.get_status())
            except Exception as e:
                logger.error(f"Error in model manager monitoring thread: {e}")
            
            # Wait for next refresh interval or until stopped
            self.stop_monitoring.wait(timeout=self.config["refresh_interval"])
            
        loop.close()
            
    async def _refresh_data(self):
        """Refresh dashboard data from model manager"""
        if not self.model_manager or not self.model_manager.initialized:
            self.status["connected"] = False
            return
            
        try:
            # Get model registry
            models = await self.model_manager.list_models()
            
            # Update status
            self.status["connected"] = True
            self.status["models_count"] = len(models)
            
            # Detailed model list if enabled
            if self.config["show_models"]:
                self.status["models"] = {}
                for model_id, metadata in models.items():
                    self.status["models"][model_id] = {
                        "id": model_id,
                        "type": metadata.model_type,
                        "task": metadata.task,
                        "size": metadata.size_bytes,
                        "local_path": metadata.local_path,
                        "cids": metadata.cids
                    }
            
            # Compute stats
            total_size = 0
            ipfs_models = 0
            hf_models = 0
            
            for model_id, metadata in models.items():
                total_size += metadata.size_bytes
                
                # Determine source (heuristic)
                if metadata.cids and len(metadata.cids) > 0:
                    ipfs_models += 1
                else:
                    hf_models += 1
            
            self.status["stats"] = {
                "models_imported": len(models),
                "total_size_bytes": total_size,
                "ipfs_models": ipfs_models,
                "huggingface_models": hf_models
            }
            
            self.status["last_updated"] = datetime.now().isoformat()
            
        except Exception as e:
            logger.error(f"Error refreshing model manager data: {e}")
            self.status["connected"] = False
            
    def get_status(self) -> Dict[str, Any]:
        """Get current panel status"""
        return self.status
        
    def set_update_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """Set callback for dashboard updates"""
        self.update_callback = callback
        
    async def execute_operation(self, operation: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a model manager operation
        
        Args:
            operation (str): Operation to execute
                - import_from_huggingface: Import model from HuggingFace
                - import_from_ipfs: Import model from IPFS
                - remove_model: Remove a model
                - refresh: Refresh status
            params (dict): Operation parameters
                
        Returns:
            dict: Operation result
        """
        if not self.model_manager or not self.model_manager.initialized:
            return {
                "success": False,
                "operation": operation,
                "error": "Model manager not initialized"
            }
            
        try:
            start_time = datetime.now()
            result = None
            
            if operation == "import_from_huggingface":
                if "model_id" not in params:
                    return {
                        "success": False,
                        "operation": operation,
                        "error": "Missing required parameter: model_id"
                    }
                    
                model_id = params["model_id"]
                result = await self.model_manager.import_model_from_huggingface(model_id)
                success = result is not None
                
            elif operation == "import_from_ipfs":
                if "model_id" not in params or "cid" not in params:
                    return {
                        "success": False,
                        "operation": operation,
                        "error": "Missing required parameters: model_id and cid"
                    }
                    
                model_id = params["model_id"]
                cid = params["cid"]
                result = await self.model_manager.import_model_from_ipfs(model_id, cid)
                success = result is not None
                
            elif operation == "remove_model":
                if "model_id" not in params:
                    return {
                        "success": False,
                        "operation": operation,
                        "error": "Missing required parameter: model_id"
                    }
                    
                model_id = params["model_id"]
                success = await self.model_manager.remove_model(model_id)
                
            elif operation == "refresh":
                await self._refresh_data()
                success = True
                
            else:
                return {
                    "success": False,
                    "operation": operation,
                    "error": f"Unknown operation: {operation}"
                }
                
            # Calculate duration
            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()
            
            # Format result
            operation_result = {
                "success": success,
                "operation": operation,
                "params": params,
                "timestamp": end_time.isoformat(),
                "duration": duration
            }
            
            # Add result details if available
            if isinstance(result, ModelMetadata):
                operation_result["model"] = {
                    "id": result.model_id,
                    "type": result.model_type,
                    "task": result.task,
                    "size": result.size_bytes
                }
                
            # Add to operation history
            self.status["operations"].append(operation_result)
            
            # Trim history if needed
            if len(self.status["operations"]) > self.config["max_history"]:
                self.status["operations"] = self.status["operations"][-self.config["max_history"]:]
                
            # Refresh data
            await self._refresh_data()
            
            # Update dashboard if callback is set
            if self.update_callback:
                self.update_callback(self.get_status())
                
            return operation_result
            
        except Exception as e:
            logger.error(f"Error executing operation {operation}: {e}")
            return {
                "success": False,
                "operation": operation,
                "error": str(e)
            }
            
    def test(self):
        """Test the dashboard panel"""
        try:
            # Run tests
            loop = asyncio.get_event_loop()
            
            # Test initialization
            init_result = loop.run_until_complete(self.init())
            
            # Test data refresh
            if init_result:
                loop.run_until_complete(self._refresh_data())
                
            # Test operation execution with mock
            operations_test = False
            if init_result and self.model_manager:
                # Try a simple refresh operation
                refresh_result = loop.run_until_complete(
                    self.execute_operation("refresh", {})
                )
                operations_test = refresh_result["success"]
                
            # Compile results
            results = {
                "success": init_result,
                "module": "ipfs_model_manager_panel",
                "initialization": init_result,
                "data_refresh": init_result,
                "operations_test": operations_test,
                "capability_check": {
                    "model_manager": self.model_manager is not None
                },
                "config": self.config
            }
            
            return results
        except Exception as e:
            logger.error(f"IPFSModelManagerPanel test failed: {e}")
            return {
                "success": False,
                "module": "ipfs_model_manager_panel",
                "error": str(e)
            }


# Create default instance
ipfs_model_manager_panel = IPFSModelManagerPanel()