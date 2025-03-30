"""
IPFS Datasets Dashboard Panel

This module provides a dashboard panel for monitoring and managing IPFS datasets.
It integrates with the testing dashboard to display real-time information about
available datasets, operations, and status.
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
    # Try to import IPFS Datasets
    from hallucinate_app.ipfs_datasets import IPFSDatasets
    HAVE_DATASETS = True
except ImportError:
    HAVE_DATASETS = False
    print("IPFS Datasets module not available. Some features will be limited.")


class IPFSDatasetsPanel:
    """
    Dashboard panel for monitoring IPFS Datasets operations and status.
    
    This class provides real-time monitoring and control of IPFS Datasets
    through a dashboard interface.
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the IPFS Datasets panel.
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Configuration
        self.config = {
            "refresh_interval": self.metadata.get("refresh_interval", 5),  # seconds
            "display_datasets": self.metadata.get("display_datasets", True),
            "display_metrics": self.metadata.get("display_metrics", True),
            "display_operations": self.metadata.get("display_operations", True),
            "max_samples": self.metadata.get("max_samples", 10),
        }
        
        # State
        self.datasets = None
        self.initialized = False
        self.dataset_info = {}
        self.operations = []
        self.metrics = {
            "load_count": 0,
            "query_count": 0,
            "process_count": 0,
            "last_operation_time": 0,
            "avg_load_time": 0,
            "avg_query_time": 0,
            "uptime": 0,
            "start_time": time.time()
        }
        
        # Callbacks
        self.status_callback = None
        self.update_callback = None
        
        # Monitoring thread
        self.monitoring_thread = None
        self.stop_monitoring = threading.Event()
        
    def init(self) -> bool:
        """
        Initialize the IPFS Datasets panel.
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Initialize IPFS Datasets if not already in resources
            if "ipfs_datasets" not in self.resources and HAVE_DATASETS:
                self.datasets = IPFSDatasets(resources=self.resources, metadata=self.metadata)
                
                # Initialize IPFS Datasets asynchronously
                async def async_init():
                    return await self.datasets.init()
                
                loop = asyncio.new_event_loop()
                init_result = loop.run_until_complete(async_init())
                loop.close()
                
                if not init_result:
                    return False
            else:
                # Use the existing instance from resources
                self.datasets = self.resources.get("ipfs_datasets")
            
            # Start monitoring
            self.start_monitoring()
            
            self.initialized = True
            return True
        except Exception as e:
            print(f"Error initializing IPFS Datasets panel: {e}")
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
        Background thread for monitoring IPFS Datasets status.
        """
        while not self.stop_monitoring.is_set():
            try:
                # Refresh data
                self._refresh_data()
                
                # Update dashboard if callback is set
                if self.update_callback:
                    self.update_callback(self.get_status())
            except Exception as e:
                print(f"Error in IPFS Datasets monitoring thread: {e}")
            
            # Wait for next refresh interval
            time.sleep(self.config["refresh_interval"])
    
    def _refresh_data(self):
        """
        Refresh IPFS Datasets status data.
        """
        if not self.initialized or not self.datasets:
            return
        
        # Update uptime
        self.metrics["uptime"] = time.time() - self.metrics["start_time"]
        
        try:
            # Refresh dataset info
            if self.config["display_datasets"]:
                async def get_datasets():
                    return await self.datasets.list_datasets()
                
                loop = asyncio.new_event_loop()
                datasets_info = loop.run_until_complete(get_datasets())
                loop.close()
                
                if datasets_info["success"]:
                    self.dataset_info = datasets_info["datasets"]
        except Exception as e:
            print(f"Error refreshing IPFS Datasets data: {e}")
    
    def add_operation_metric(self, operation: str, execution_time: float):
        """
        Add a performance metric for an operation.
        
        Args:
            operation: The operation name
            execution_time: The execution time in seconds
        """
        # Update metrics
        self.metrics["last_operation_time"] = execution_time
        
        if operation == "load":
            self.metrics["load_count"] += 1
            # Update rolling average
            self.metrics["avg_load_time"] = (
                (self.metrics["avg_load_time"] * (self.metrics["load_count"] - 1) + execution_time) / 
                self.metrics["load_count"]
            )
        elif operation == "query":
            self.metrics["query_count"] += 1
            # Update rolling average
            self.metrics["avg_query_time"] = (
                (self.metrics["avg_query_time"] * (self.metrics["query_count"] - 1) + execution_time) / 
                self.metrics["query_count"]
            )
        elif operation == "process":
            self.metrics["process_count"] += 1
        
        # Record the operation in history (limited to max_samples)
        self.operations.append({
            "operation": operation,
            "execution_time": execution_time,
            "timestamp": time.time()
        })
        
        # Trim operation history
        if len(self.operations) > self.config["max_samples"]:
            self.operations = self.operations[-self.config["max_samples"]:]
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get the current status for dashboard display.
        
        Returns:
            Dictionary with status information
        """
        return {
            "initialized": self.initialized,
            "have_datasets": HAVE_DATASETS,
            "datasets": {
                "count": len(self.dataset_info),
                "loaded": list(self.dataset_info.keys())[:self.config["max_samples"]],
                "details": {k: v for i, (k, v) in enumerate(self.dataset_info.items()) 
                           if i < self.config["max_samples"]}
            },
            "metrics": self.metrics,
            "operations": self.operations[-self.config["max_samples"]:] if self.operations else [],
            "configuration": self.config
        }
    
    async def execute_load_dataset(self, dataset_name: str, split: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute dataset loading operation.
        
        Args:
            dataset_name: Dataset name
            split: Dataset split
            
        Returns:
            Operation result
        """
        if not self.initialized or not self.datasets:
            return {"success": False, "error": "Panel not initialized"}
        
        try:
            # Record start time
            start_time = time.time()
            
            # Load the dataset
            result = await self.datasets.load_dataset(dataset_name, split)
            
            # Record metric
            execution_time = time.time() - start_time
            self.add_operation_metric("load", execution_time)
            
            # Add execution time to result
            result["execution_time"] = execution_time
            
            # Refresh data
            self._refresh_data()
            
            return result
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def execute_query_dataset(self, dataset_name: str, query: Dict[str, Any], 
                                  split: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute dataset query operation.
        
        Args:
            dataset_name: Dataset name
            query: Query parameters
            split: Dataset split
            
        Returns:
            Operation result
        """
        if not self.initialized or not self.datasets:
            return {"success": False, "error": "Panel not initialized"}
        
        try:
            # Record start time
            start_time = time.time()
            
            # Query the dataset
            result = await self.datasets.query_dataset(dataset_name, query, split)
            
            # Record metric
            execution_time = time.time() - start_time
            self.add_operation_metric("query", execution_time)
            
            # Add execution time to result
            result["execution_time"] = execution_time
            
            return result
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def execute_process_dataset(self, dataset_name: str, split: Optional[str] = None,
                                     output_dir: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute dataset processing operation.
        
        Args:
            dataset_name: Dataset name
            split: Dataset split
            output_dir: Output directory
            
        Returns:
            Operation result
        """
        if not self.initialized or not self.datasets:
            return {"success": False, "error": "Panel not initialized"}
        
        try:
            # Record start time
            start_time = time.time()
            
            # Process the dataset
            result = await self.datasets.process_dataset(dataset_name, split, output_dir)
            
            # Record metric
            execution_time = time.time() - start_time
            self.add_operation_metric("process", execution_time)
            
            # Add execution time to result
            result["execution_time"] = execution_time
            
            # Refresh data
            self._refresh_data()
            
            return result
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def test(self) -> Dict[str, Any]:
        """
        Run a self-test.
        
        Returns:
            Dictionary with test results
        """
        test_results = {
            "success": True,
            "module": "ipfs_datasets_panel",
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
                
                metrics_ok = "test_operation" in [op["operation"] for op in self.operations]
                
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
                    "status_sample": {k: status[k] for k in ["initialized", "have_datasets"] if k in status}
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
                
            # Test dataset operations - only if IPFS Datasets is available
            if HAVE_DATASETS and self.datasets:
                try:
                    # Use a test dataset
                    async def test_load():
                        return await self.execute_load_dataset("hf-internal-testing/dummy_dataset", "train")
                    
                    loop = asyncio.new_event_loop()
                    load_result = loop.run_until_complete(test_load())
                    loop.close()
                    
                    test_results["tests"].append({
                        "name": "load_dataset",
                        "success": load_result["success"],
                        "result": load_result["success"]
                    })
                    
                    if not load_result["success"]:
                        test_results["success"] = False
                except Exception as e:
                    test_results["tests"].append({
                        "name": "load_dataset",
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


# Example usage
if __name__ == "__main__":
    # Create panel instance
    panel = IPFSDatasetsPanel(metadata={"refresh_interval": 3})
    
    # Initialize
    if panel.init():
        print("IPFS Datasets panel initialized successfully")
        
        # Run test
        async def run_test():
            test_results = await panel.test()
            print(json.dumps(test_results, indent=2))
            
            # Stop monitoring
            panel.stop()
        
        asyncio.run(run_test())
    else:
        print("Failed to initialize IPFS Datasets panel")