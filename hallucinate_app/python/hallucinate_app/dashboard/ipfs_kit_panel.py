"""
IPFS Kit Dashboard Panel

This module provides a dashboard panel for monitoring IPFS operations and status.
It integrates with the testing dashboard to display real-time information about
the IPFS Kit module, including node status, pin sets, and operations performance.
"""

import os
import sys
import json
import time
import asyncio
import threading
from typing import Dict, List, Any, Optional, Callable
from pathlib import Path

# Adjust import paths if needed
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    # Try to import from local implementation first
    from hallucinate_app.ipfs_kit_py import IPFSKitPy
    from hallucinate_app.ipfs_kit_server import IPFSKitServer, IPFSKitClient
    LOCAL_IMPLEMENTATION = True
except ImportError:
    try:
        # Fall back to installed PyPI package
        import ipfs_kit_py
        from ipfs_kit_py.high_level_api import IPFSSimpleAPI
        LOCAL_IMPLEMENTATION = False
    except ImportError:
        print("IPFS Kit not found. Install using: pip install ipfs_kit_py")
        sys.exit(1)


class IPFSKitPanel:
    """
    Dashboard panel for monitoring IPFS Kit operations and status.
    
    This class provides real-time monitoring and control of IPFS operations
    through a dashboard interface.
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the IPFS Kit panel.
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Configuration
        self.config = {
            "use_mock": self.metadata.get("use_mock", False),
            "ipfs_api_url": self.metadata.get("ipfs_api_url", "/ip4/127.0.0.1/tcp/5001"),
            "refresh_interval": self.metadata.get("refresh_interval", 5),  # seconds
            "display_pins": self.metadata.get("display_pins", True),
            "display_node_info": self.metadata.get("display_node_info", True),
            "display_peers": self.metadata.get("display_peers", True),
            "display_perf_metrics": self.metadata.get("display_perf_metrics", True),
        }
        
        # State
        self.ipfs = None
        self.initialized = False
        self.node_info = {}
        self.pin_set = {}
        self.peers = []
        self.perf_metrics = {
            "operations": {
                "add": {"count": 0, "avg_time": 0, "last_time": 0},
                "cat": {"count": 0, "avg_time": 0, "last_time": 0},
                "pin_add": {"count": 0, "avg_time": 0, "last_time": 0},
                "pin_rm": {"count": 0, "avg_time": 0, "last_time": 0},
            },
            "uptime": 0,
            "last_refresh": 0,
        }
        
        # Callbacks
        self.status_callback = None
        self.update_callback = None
        
        # Monitoring thread
        self.monitoring_thread = None
        self.stop_monitoring = threading.Event()
        
    def init(self) -> bool:
        """
        Initialize the IPFS Kit panel.
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Initialize IPFS Kit
            if LOCAL_IMPLEMENTATION:
                self.ipfs = IPFSKitPy(metadata={
                    "use_mock": self.config["use_mock"],
                    "ipfs_api_url": self.config["ipfs_api_url"]
                })
                
                # Initialize IPFS Kit asynchronously
                async def async_init():
                    return await self.ipfs.init()
                
                loop = asyncio.new_event_loop()
                init_result = loop.run_until_complete(async_init())
                loop.close()
                
                if not init_result:
                    return False
            else:
                # Use PyPI package with high-level API
                self.ipfs = IPFSSimpleAPI(metadata={
                    "use_mock": self.config["use_mock"],
                    "ipfs_api_url": self.config["ipfs_api_url"]
                })
            
            # Start monitoring
            self.start_monitoring()
            
            self.initialized = True
            return True
        except Exception as e:
            print(f"Error initializing IPFS Kit panel: {e}")
            return False
    
    def start_monitoring(self):
        """
        Start the monitoring thread for real-time updates.
        """
        self.stop_monitoring.clear()
        self.monitoring_thread = threading.Thread(target=self._monitor_thread, daemon=True)
        self.monitoring_thread.start()
    
    def stop(self):
        """
        Stop the monitoring thread.
        """
        if self.monitoring_thread and self.monitoring_thread.is_alive():
            self.stop_monitoring.set()
            self.monitoring_thread.join(timeout=2.0)
    
    def _monitor_thread(self):
        """
        Background thread for monitoring IPFS status.
        """
        while not self.stop_monitoring.is_set():
            try:
                # Refresh data
                self._refresh_data()
                
                # Update dashboard if callback is set
                if self.update_callback:
                    self.update_callback(self.get_status())
            except Exception as e:
                print(f"Error in IPFS monitoring thread: {e}")
            
            # Wait for next refresh interval
            time.sleep(self.config["refresh_interval"])
    
    def _refresh_data(self):
        """
        Refresh IPFS status data.
        """
        if not self.initialized:
            return
        
        # Record refresh time
        self.perf_metrics["last_refresh"] = time.time()
        
        # Update uptime
        if "start_time" not in self.perf_metrics:
            self.perf_metrics["start_time"] = time.time()
        self.perf_metrics["uptime"] = time.time() - self.perf_metrics["start_time"]
        
        try:
            # Get node info
            if self.config["display_node_info"]:
                self._refresh_node_info()
            
            # Get pins
            if self.config["display_pins"]:
                self._refresh_pins()
            
            # Get peers
            if self.config["display_peers"]:
                self._refresh_peers()
        except Exception as e:
            print(f"Error refreshing IPFS data: {e}")
    
    def _refresh_node_info(self):
        """
        Refresh IPFS node information.
        """
        try:
            # Get node info (different method for local vs PyPI implementation)
            if LOCAL_IMPLEMENTATION:
                # Run in asyncio loop
                async def get_id():
                    return await self.ipfs.id()
                
                loop = asyncio.new_event_loop()
                self.node_info = loop.run_until_complete(get_id())
                loop.close()
            else:
                # PyPI implementation
                self.node_info = self.ipfs._send_command("id", {})
        except Exception as e:
            print(f"Error getting node info: {e}")
    
    def _refresh_pins(self):
        """
        Refresh IPFS pin set.
        """
        try:
            # Get pins (different method for local vs PyPI implementation)
            if LOCAL_IMPLEMENTATION:
                # Run in asyncio loop
                async def get_pins():
                    return await self.ipfs.pin_ls()
                
                loop = asyncio.new_event_loop()
                self.pin_set = loop.run_until_complete(get_pins())
                loop.close()
            else:
                # PyPI implementation
                self.pin_set = self.ipfs.list_pins()
        except Exception as e:
            print(f"Error getting pins: {e}")
    
    def _refresh_peers(self):
        """
        Refresh IPFS peer list.
        """
        try:
            # Get peers (different method for local vs PyPI implementation)
            if LOCAL_IMPLEMENTATION:
                # Local implementation doesn't have built-in peer list method
                self.peers = []
            else:
                # PyPI implementation
                self.peers = self.ipfs.peers()
        except Exception as e:
            print(f"Error getting peers: {e}")
    
    def add_operation_metric(self, operation: str, execution_time: float):
        """
        Add a performance metric for an operation.
        
        Args:
            operation: The operation name
            execution_time: The execution time in seconds
        """
        if operation in self.perf_metrics["operations"]:
            op_metrics = self.perf_metrics["operations"][operation]
            op_metrics["count"] += 1
            op_metrics["last_time"] = execution_time
            
            # Update rolling average
            op_metrics["avg_time"] = (
                (op_metrics["avg_time"] * (op_metrics["count"] - 1) + execution_time) / 
                op_metrics["count"]
            )
        else:
            # Add new operation type
            self.perf_metrics["operations"][operation] = {
                "count": 1,
                "avg_time": execution_time,
                "last_time": execution_time
            }
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get the current status for dashboard display.
        
        Returns:
            Dictionary with status information
        """
        return {
            "initialized": self.initialized,
            "use_mock": self.config["use_mock"],
            "ipfs_api_url": self.config["ipfs_api_url"],
            "node_info": {
                "id": self.node_info.get("ID", "Unknown"),
                "version": self.node_info.get("AgentVersion", "Unknown"),
                "protocol_version": self.node_info.get("ProtocolVersion", "Unknown"),
                "addresses": self.node_info.get("Addresses", []),
            },
            "pin_set": {
                "count": len(self.pin_set.get("Keys", {})) if isinstance(self.pin_set, dict) else 0,
                "sample": list(self.pin_set.get("Keys", {}).keys())[:5] if isinstance(self.pin_set, dict) else [],
            },
            "peers": {
                "count": len(self.peers),
                "sample": self.peers[:5] if isinstance(self.peers, list) else [],
            },
            "performance": self.perf_metrics,
            "implementation": "Local" if LOCAL_IMPLEMENTATION else "PyPI Package",
        }
    
    def test(self) -> Dict[str, Any]:
        """
        Run a self-test.
        
        Returns:
            Dictionary with test results
        """
        test_results = {
            "success": True,
            "module": "ipfs_kit_panel",
            "tests": []
        }
        
        try:
            # Test initialization if not already initialized
            if not self.initialized:
                init_result = self.init()
                test_results["tests"].append({
                    "name": "initialization",
                    "success": init_result,
                    "result": init_result
                })
                
                if not init_result:
                    test_results["success"] = False
                    return test_results
            
            # Test data refresh
            try:
                self._refresh_data()
                test_results["tests"].append({
                    "name": "data_refresh",
                    "success": True,
                })
            except Exception as e:
                test_results["tests"].append({
                    "name": "data_refresh",
                    "success": False,
                    "error": str(e)
                })
                test_results["success"] = False
            
            # Test metrics recording
            try:
                self.add_operation_metric("test_operation", 0.1)
                
                metrics_ok = (
                    "test_operation" in self.perf_metrics["operations"] and
                    self.perf_metrics["operations"]["test_operation"]["count"] == 1
                )
                
                test_results["tests"].append({
                    "name": "metrics_recording",
                    "success": metrics_ok,
                })
                
                if not metrics_ok:
                    test_results["success"] = False
            except Exception as e:
                test_results["tests"].append({
                    "name": "metrics_recording",
                    "success": False,
                    "error": str(e)
                })
                test_results["success"] = False
            
            # Test status retrieval
            try:
                status = self.get_status()
                
                status_ok = (
                    status is not None and
                    isinstance(status, dict) and
                    "initialized" in status
                )
                
                test_results["tests"].append({
                    "name": "status_retrieval",
                    "success": status_ok,
                    "status_sample": {k: status[k] for k in ["initialized", "implementation"] if k in status}
                })
                
                if not status_ok:
                    test_results["success"] = False
            except Exception as e:
                test_results["tests"].append({
                    "name": "status_retrieval",
                    "success": False,
                    "error": str(e)
                })
                test_results["success"] = False
            
            return test_results
        except Exception as e:
            test_results["success"] = False
            test_results["error"] = str(e)
            return test_results
    
    def register_status_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """
        Register a callback for status updates.
        
        Args:
            callback: Function to call with status updates
        """
        self.status_callback = callback
    
    def register_update_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """
        Register a callback for dashboard updates.
        
        Args:
            callback: Function to call with dashboard updates
        """
        self.update_callback = callback
    
    def execute_operation(self, operation: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute an IPFS operation and record performance metrics.
        
        Args:
            operation: Operation to execute
            params: Operation parameters
            
        Returns:
            Dictionary with operation result
        """
        if not self.initialized:
            return {"success": False, "error": "IPFS Kit not initialized"}
        
        result = {"success": False}
        
        try:
            # Record start time
            start_time = time.time()
            
            # Execute operation
            if LOCAL_IMPLEMENTATION:
                # Run in asyncio loop
                async def run_operation():
                    # Map operations to methods
                    operation_map = {
                        "add": self.ipfs.add,
                        "cat": self.ipfs.cat,
                        "pin_add": self.ipfs.pin_add,
                        "pin_rm": self.ipfs.pin_rm,
                        "pin_ls": self.ipfs.pin_ls,
                        "id": self.ipfs.id,
                    }
                    
                    if operation not in operation_map:
                        return {"success": False, "error": f"Unknown operation: {operation}"}
                    
                    # Execute the operation
                    op_result = await operation_map[operation](**params)
                    return {"success": True, "result": op_result}
                
                loop = asyncio.new_event_loop()
                op_result = loop.run_until_complete(run_operation())
                loop.close()
                
                result = op_result
            else:
                # PyPI implementation
                # Map operations to methods
                operation_map = {
                    "add": self.ipfs.add,
                    "cat": self.ipfs.get,
                    "pin_add": self.ipfs.pin,
                    "pin_rm": self.ipfs.unpin,
                    "pin_ls": self.ipfs.list_pins,
                    "id": lambda: self.ipfs._send_command("id", {}),
                }
                
                if operation not in operation_map:
                    return {"success": False, "error": f"Unknown operation: {operation}"}
                
                # Execute the operation
                op_result = operation_map[operation](**params)
                result = {"success": True, "result": op_result}
            
            # Record performance metric
            execution_time = time.time() - start_time
            self.add_operation_metric(operation, execution_time)
            
            # Add execution time to result
            result["execution_time"] = execution_time
            
            # Refresh data after operation
            self._refresh_data()
            
            return result
        except Exception as e:
            return {"success": False, "error": str(e)}


# Example usage
if __name__ == "__main__":
    # Create panel instance
    panel = IPFSKitPanel(metadata={"use_mock": True})
    
    # Initialize
    if panel.init():
        print("IPFS Kit panel initialized successfully")
        
        # Run test
        test_results = panel.test()
        print(json.dumps(test_results, indent=2))
        
        # Get status
        status = panel.get_status()
        print(json.dumps(status, indent=2))
        
        # Stop monitoring
        panel.stop()
    else:
        print("Failed to initialize IPFS Kit panel")