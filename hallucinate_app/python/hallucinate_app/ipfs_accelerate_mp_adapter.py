"""
IPFS Accelerate MP Adapter with Thread Pool Integration

This module provides an adapter that connects the IPFS Accelerate Server MP
with the Thread Pool Manager, allowing for efficient parallel processing
across both processes and threads.

Key features:
- Coordination between multi-process and multi-threaded architectures
- Task routing based on workload characteristics
- Resource monitoring and optimization
- Unified interface for task submission and management
- Dynamic scaling based on performance metrics
- Adaptive error handling with automatic retries
- Integration with performance monitoring dashboard
"""

import os
import sys
import time
import json
import asyncio
import logging
import threading
import traceback
from typing import Dict, List, Any, Optional, Union, Tuple, Callable
from concurrent.futures import TimeoutError as FutureTimeoutError

from .thread_pool_manager import (
    ThreadPoolManager,
    TaskType,
    TaskPriority,
    TaskState
)

from .ipfs_accelerate_server_mp import IPFSAccelerateServer
from .thread_pool_monitor import ThreadPoolMonitor
from .thread_pool_dashboard import ThreadPoolDashboard


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class IPFSAccelerateAdapter:
    """
    Adapter class that integrates the IPFS Accelerate Server MP with Thread Pool Manager
    
    This class provides a unified interface for submitting tasks to either thread pools
    or dedicated processes based on the task characteristics and system resource availability.
    It includes advanced features for performance monitoring, dynamic scaling, and error handling.
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the IPFS Accelerate Adapter
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Configuration
        self.config = {
            # Thread Pool Manager configuration
            "thread_pool_min_workers": self.metadata.get("thread_pool_min_workers", 2),
            "thread_pool_max_workers": self.metadata.get("thread_pool_max_workers", 16),
            "auto_create_pools": self.metadata.get("auto_create_pools", True),
            
            # IPFS Accelerate Server configuration
            "plasma_socket": self.metadata.get("plasma_socket", "/tmp/plasma_accelerate"),
            "plasma_size_gb": self.metadata.get("plasma_size_gb", 1.0),
            "use_mock": self.metadata.get("use_mock", False),
            
            # Adapter configuration
            "prefer_threads_for_small_tasks": self.metadata.get("prefer_threads_for_small_tasks", True),
            "prefer_processes_for_ml": self.metadata.get("prefer_processes_for_ml", True),
            "timeout_default": self.metadata.get("timeout_default", 300),  # 5 minutes
            
            # Resource optimization
            "enable_adaptive_scaling": self.metadata.get("enable_adaptive_scaling", True),
            "performance_check_interval": self.metadata.get("performance_check_interval", 30),  # seconds
            "auto_optimize_thresholds": self.metadata.get("auto_optimize_thresholds", True),
            
            # Error handling and retries
            "max_retries": self.metadata.get("max_retries", 3),
            "retry_delay_base": self.metadata.get("retry_delay_base", 1.0),  # seconds
            "retry_delay_max": self.metadata.get("retry_delay_max", 30.0),  # seconds
            "retry_backoff_factor": self.metadata.get("retry_backoff_factor", 2.0),
            
            # Monitoring and Dashboard
            "enable_monitoring": self.metadata.get("enable_monitoring", True),
            "enable_dashboard": self.metadata.get("enable_dashboard", False),
            "dashboard_update_interval": self.metadata.get("dashboard_update_interval", 5.0),
            "monitor_poll_interval": self.metadata.get("monitor_poll_interval", 2.0),
        }
        
        # Initialize the Thread Pool Manager
        self.thread_pool_manager = ThreadPoolManager(
            resources=self.resources,
            metadata={
                "default_min_workers": self.config["thread_pool_min_workers"],
                "default_max_workers": self.config["thread_pool_max_workers"],
                "auto_create_pools": self.config["auto_create_pools"]
            }
        )
        
        # Initialize the IPFS Accelerate Server
        self.accelerate_server = IPFSAccelerateServer(
            resources=self.resources,
            metadata={
                "plasma_socket": self.config["plasma_socket"],
                "plasma_size_gb": self.config["plasma_size_gb"],
                "use_mock": self.config["use_mock"]
            }
        )
        
        # Initialize Thread Pool Monitor if enabled
        self.monitor = None
        self.dashboard = None
        if self.config["enable_monitoring"]:
            self.monitor = ThreadPoolMonitor(
                thread_pool_manager=self.thread_pool_manager,
                resources=self.resources,
                metadata={
                    "poll_interval": self.config["monitor_poll_interval"],
                    "metrics_window": 60,  # Keep 1 minute of history
                    "archive_metrics": True,
                    "metrics_archive_path": self.metadata.get(
                        "metrics_archive_path", 
                        os.path.join(os.path.dirname(__file__), "data", "thread_pool_metrics.json")
                    ),
                    "alert_thresholds": {
                        "high_queue_depth": self.metadata.get("alert_high_queue_depth", 20),
                        "high_worker_utilization": self.metadata.get("alert_high_utilization", 0.9),
                        "high_error_rate": self.metadata.get("alert_high_error_rate", 0.1),
                        "slow_response_time": self.metadata.get("alert_slow_response", 2.0)
                    }
                }
            )
            
            # Initialize Dashboard if enabled
            if self.config["enable_dashboard"]:
                self.dashboard = ThreadPoolDashboard(
                    thread_pool_manager=self.thread_pool_manager,
                    thread_pool_monitor=self.monitor,
                    resources=self.resources,
                    metadata={
                        "update_interval": self.config["dashboard_update_interval"],
                        "max_history_points": 100,  # Keep 100 data points in history
                        "enable_web_dashboard": self.metadata.get("enable_web_dashboard", False),
                        "dashboard_port": self.metadata.get("dashboard_port", 8080)
                    }
                )
        
        # State tracking
        self.running = False
        self.models = {}
        self.tasks = {}
        self.retry_counts = {}  # Track retry attempts
        self.performance_metrics = {
            "task_success_rate": 1.0,
            "avg_response_time": 0.0,
            "last_optimization_time": 0,
            "optimization_count": 0
        }
        
        # Lock for thread safety
        self.lock = threading.RLock()
        
        # Event for performance optimization
        if self.config["enable_adaptive_scaling"]:
            self.optimization_event = threading.Event()
            self.optimization_thread = threading.Thread(
                target=self._optimization_loop,
                name="adapter-optimizer",
                daemon=True
            )
        
        logger.info(f"IPFSAccelerateAdapter initialized with config: {self.config}")
    
    async def start(self):
        """
        Start the adapter and its components
        """
        if self.running:
            logger.warning("IPFS Accelerate Adapter already running")
            return
        
        # Start the IPFS Accelerate Server
        self.accelerate_server.start()
        
        # Start the monitoring components if enabled
        if self.monitor and not self.monitor.running:
            self.monitor.start()
            logger.info("Thread Pool Monitor started")
            
        if self.dashboard and not self.dashboard.running:
            self.dashboard.start()
            logger.info("Thread Pool Dashboard started")
        
        # Start the performance optimization thread if enabled
        if self.config["enable_adaptive_scaling"]:
            self.optimization_event.clear()
            if not self.optimization_thread.is_alive():
                self.optimization_thread.start()
                logger.info("Performance optimization thread started")
        
        # Set up directories if needed
        metrics_dir = os.path.join(os.path.dirname(__file__), "data")
        if not os.path.exists(metrics_dir):
            os.makedirs(metrics_dir, exist_ok=True)
        
        self.running = True
        logger.info("IPFS Accelerate Adapter started")
    
    async def stop(self):
        """
        Stop the adapter and its components
        """
        if not self.running:
            logger.warning("IPFS Accelerate Adapter not running")
            return
        
        # Stop the IPFS Accelerate Server
        self.accelerate_server.stop()
        
        # Stop the monitoring components if enabled
        if self.dashboard and self.dashboard.running:
            self.dashboard.stop()
            logger.info("Thread Pool Dashboard stopped")
            
        if self.monitor and self.monitor.running:
            self.monitor.stop()
            logger.info("Thread Pool Monitor stopped")
        
        # Stop the performance optimization thread if enabled
        if self.config["enable_adaptive_scaling"]:
            self.optimization_event.set()
            # No need to join since it's a daemon thread
        
        # Shutdown the Thread Pool Manager
        self.thread_pool_manager.shutdown(wait=True)
        
        self.running = False
        logger.info("IPFS Accelerate Adapter stopped")
    
    async def load_model_from_ipfs(self, model_id: str, cid: str) -> Dict[str, Any]:
        """
        Load a model from IPFS
        
        This delegates to the IPFS Accelerate Server's implementation, 
        as model loading is process-intensive and benefits from dedicated processes.
        
        Args:
            model_id: Identifier for the model
            cid: IPFS content ID of the model
            
        Returns:
            Dict[str, Any]: Result of the operation
        """
        if not self.running:
            await self.start()
        
        # Model loading is always handled by the dedicated process
        result = await self.accelerate_server.load_model_from_ipfs(model_id, cid)
        
        # Track the model
        if result.get("status") == "success":
            with self.lock:
                self.models[model_id] = {
                    "cid": cid,
                    "loaded_at": time.time()
                }
        
        return result
    
    async def run_inference(self, model_id: str, inputs: str) -> Dict[str, Any]:
        """
        Run inference with a loaded model
        
        This method determines whether to use the thread pool or dedicated process
        based on the model type and input size.
        
        Args:
            model_id: Identifier for the model
            inputs: Input text for the model
            
        Returns:
            Dict[str, Any]: Result of the inference operation
        """
        if not self.running:
            await self.start()
        
        # Check if the model is loaded
        with self.lock:
            if model_id not in self.models:
                raise ValueError(f"Model {model_id} not loaded")
        
        # For small inputs, we might prefer threads, but for ML models
        # we generally prefer the dedicated ML process
        if self.config["prefer_processes_for_ml"]:
            # Use the dedicated ML process
            return await self.accelerate_server.run_inference(model_id, inputs)
        else:
            # For future expansion: implement thread-based inference for small models
            # For now, always use the process-based implementation
            return await self.accelerate_server.run_inference(model_id, inputs)
    
    async def unload_model(self, model_id: str) -> Dict[str, Any]:
        """
        Unload a model
        
        Args:
            model_id: Identifier for the model
            
        Returns:
            Dict[str, Any]: Result of the operation
        """
        if not self.running:
            raise ValueError("IPFS Accelerate Adapter not running")
        
        # Unload from the accelerate server
        result = await self.accelerate_server.unload_model(model_id)
        
        # Update our tracking state
        if result.get("status") == "success":
            with self.lock:
                if model_id in self.models:
                    del self.models[model_id]
        
        return result
    
    def submit_ipfs_task(
        self, 
        function: Callable,
        *args,
        priority: TaskPriority = TaskPriority.NORMAL,
        timeout: Optional[float] = None,
        allow_retries: bool = True,
        max_retries: Optional[int] = None,
        **kwargs
    ) -> Tuple[str, asyncio.Future]:
        """
        Submit an IPFS-related task to the thread pool with automatic retries
        
        IPFS operations are particularly prone to transient network issues, so
        automatic retries are enabled by default. This method uses an adaptive
        retry strategy with exponential backoff.
        
        Args:
            function: The function to execute
            *args: Arguments to pass to the function
            priority: Priority of the task
            timeout: Timeout for the task in seconds
            allow_retries: Whether to allow automatic retries on failure
            max_retries: Maximum number of retry attempts (defaults to config value + 2 for IPFS)
            **kwargs: Keyword arguments to pass to the function
            
        Returns:
            Tuple[str, Future]: Task ID and Future object for the task
        """
        if not self.running:
            raise ValueError("IPFS Accelerate Adapter not running")
        
        # IPFS operations are especially prone to transient failures, so 
        # we use a higher retry count and longer delay by default
        ipfs_max_retries = (max_retries if max_retries is not None 
                          else self.config["max_retries"] + 2)  # More retries for IPFS
        
        # Use the generic submit_task with IPFS task type
        return self.submit_task(
            function=function,
            *args,
            task_type=TaskType.IPFS,
            priority=priority,
            timeout=timeout,
            allow_retries=allow_retries,
            max_retries=ipfs_max_retries,
            # Use a longer retry delay for IPFS (network-bound operations)
            retry_delay=1.5 * self.config["retry_delay_base"],
            retry_backoff=self.config["retry_backoff_factor"],
            **kwargs
        )
    
    async def _set_async_result(self, future, result):
        """Helper method to set result on an asyncio future"""
        future.set_result(result)
    
    async def _set_async_exception(self, future, exception):
        """Helper method to set exception on an asyncio future"""
        future.set_exception(exception)
    
    def submit_io_task(
        self, 
        function: Callable,
        *args,
        priority: TaskPriority = TaskPriority.NORMAL,
        timeout: Optional[float] = None,
        allow_retries: bool = True,
        max_retries: Optional[int] = None,
        **kwargs
    ) -> Tuple[str, asyncio.Future]:
        """
        Submit an I/O-related task to the thread pool
        
        I/O tasks typically involve network or disk operations, which can sometimes
        fail due to transient issues. This method provides automatic retries with
        exponential backoff.
        
        Args:
            function: The function to execute
            *args: Arguments to pass to the function
            priority: Priority of the task
            timeout: Timeout for the task in seconds
            allow_retries: Whether to allow automatic retries on failure
            max_retries: Maximum number of retry attempts (defaults to config value)
            **kwargs: Keyword arguments to pass to the function
            
        Returns:
            Tuple[str, Future]: Task ID and Future object for the task
        """
        if not self.running:
            raise ValueError("IPFS Accelerate Adapter not running")
        
        # Use the generic submit_task with IO task type
        return self.submit_task(
            function=function,
            *args,
            task_type=TaskType.IO,
            priority=priority,
            timeout=timeout,
            allow_retries=allow_retries,
            max_retries=max_retries,
            **kwargs
        )
    
    def submit_cpu_task(
        self, 
        function: Callable,
        *args,
        priority: TaskPriority = TaskPriority.NORMAL,
        timeout: Optional[float] = None,
        allow_retries: bool = False,  # CPU tasks typically don't benefit from retries
        max_retries: Optional[int] = None,
        **kwargs
    ) -> Tuple[str, asyncio.Future]:
        """
        Submit a CPU-intensive task to the thread pool
        
        CPU-intensive tasks are less prone to transient failures, so retries are
        disabled by default. However, you can enable retries if your specific 
        CPU task might benefit from them.
        
        Args:
            function: The function to execute
            *args: Arguments to pass to the function
            priority: Priority of the task
            timeout: Timeout for the task in seconds
            allow_retries: Whether to allow automatic retries on failure (default: False)
            max_retries: Maximum number of retry attempts (defaults to config value)
            **kwargs: Keyword arguments to pass to the function
            
        Returns:
            Tuple[str, Future]: Task ID and Future object for the task
        """
        if not self.running:
            raise ValueError("IPFS Accelerate Adapter not running")
        
        # Use the generic submit_task with CPU task type
        return self.submit_task(
            function=function,
            *args,
            task_type=TaskType.CPU,
            priority=priority,
            timeout=timeout,
            allow_retries=allow_retries,
            max_retries=max_retries,
            # Use a shorter retry delay for CPU tasks (less overhead)
            retry_delay=0.5 * self.config["retry_delay_base"] if allow_retries else None,
            **kwargs
        )
    
    def submit_task(
        self, 
        function: Callable,
        *args,
        task_type: TaskType = TaskType.GENERAL,
        priority: TaskPriority = TaskPriority.NORMAL,
        timeout: Optional[float] = None,
        allow_retries: bool = True,
        max_retries: Optional[int] = None,
        retry_delay: Optional[float] = None,
        retry_backoff: Optional[float] = None,
        **kwargs
    ) -> Tuple[str, asyncio.Future]:
        """
        Submit a general task to the thread pool with automatic retry capabilities
        
        Args:
            function: The function to execute
            *args: Arguments to pass to the function
            task_type: Type of task for pool selection
            priority: Priority of the task
            timeout: Timeout for the task in seconds
            allow_retries: Whether to allow automatic retries on failure
            max_retries: Maximum number of retry attempts (defaults to config value)
            retry_delay: Base delay between retries in seconds (defaults to config value)
            retry_backoff: Backoff factor for retries (defaults to config value)
            **kwargs: Keyword arguments to pass to the function
            
        Returns:
            Tuple[str, Future]: Task ID and Future object for the task
        """
        if not self.running:
            raise ValueError("IPFS Accelerate Adapter not running")
        
        # Create a unique task ID that will persist across retries
        retry_task_id = str(uuid.uuid4())
        
        # Generate a retryable wrapper function if retries are allowed
        if allow_retries:
            # Set retry parameters (use config defaults if not specified)
            _max_retries = max_retries if max_retries is not None else self.config["max_retries"]
            _retry_delay = retry_delay if retry_delay is not None else self.config["retry_delay_base"]
            _retry_backoff = retry_backoff if retry_backoff is not None else self.config["retry_backoff_factor"]
            
            # Create a wrapper to handle retries
            retryable_function = self._create_retryable_wrapper(
                function=function,
                args=args,
                kwargs=kwargs,
                task_id=retry_task_id,
                max_retries=_max_retries,
                retry_delay=_retry_delay,
                retry_backoff=_retry_backoff
            )
            
            # Use the retryable wrapper
            submit_function = retryable_function
            submit_args = ()  # Args are captured in the wrapper
            submit_kwargs = {}  # Kwargs are captured in the wrapper
        else:
            # Use the original function without retries
            submit_function = function
            submit_args = args
            submit_kwargs = kwargs
        
        # Submit to the appropriate pool based on task type
        task_id, future = self.thread_pool_manager.submit(
            function=submit_function,
            *submit_args,
            task_type=task_type,
            priority=priority,
            timeout=timeout or self.config["timeout_default"],
            **submit_kwargs
        )
        
        # Track the task
        with self.lock:
            self.tasks[task_id] = {
                "type": task_type.name.lower(),
                "submitted_at": time.time(),
                "future": future,
                "retry_task_id": retry_task_id,
                "allow_retries": allow_retries,
                "max_retries": _max_retries if allow_retries else 0,
                "current_retry": 0,
            }
        
        # Create an asyncio future to make this compatible with async code
        async_future = asyncio.Future()
        
        # Set up a callback to transfer the result to the asyncio future
        def future_callback(f):
            try:
                result = f.result()
                
                # Calculate response time for performance metrics
                with self.lock:
                    if task_id in self.tasks:
                        task_info = self.tasks[task_id]
                        response_time = time.time() - task_info["submitted_at"]
                        
                        # Update performance metrics (exponential moving average)
                        alpha = 0.3  # Smoothing factor
                        self.performance_metrics["avg_response_time"] = (
                            alpha * response_time + 
                            (1 - alpha) * self.performance_metrics["avg_response_time"]
                        )
                
                # Set the result on the asyncio future
                if not async_future.done():
                    asyncio.create_task(self._set_async_result(async_future, result))
            
            except Exception as e:
                logger.warning(f"Task {task_id} failed: {e}")
                
                # Update error rate in performance metrics
                with self.lock:
                    alpha = 0.2  # Smoothing factor
                    # Decrease success rate (increase error rate)
                    self.performance_metrics["task_success_rate"] = (
                        (1 - alpha) * self.performance_metrics["task_success_rate"]
                    )
                
                # Set the exception on the asyncio future
                if not async_future.done():
                    asyncio.create_task(self._set_async_exception(async_future, e))
                    
                # Log detailed error info for debugging
                logger.debug(f"Task {task_id} error details: {traceback.format_exc()}")
        
        future.add_done_callback(future_callback)
        
        return task_id, async_future
    
    def _create_retryable_wrapper(
        self,
        function: Callable,
        args: tuple,
        kwargs: dict,
        task_id: str,
        max_retries: int,
        retry_delay: float,
        retry_backoff: float
    ) -> Callable:
        """
        Create a wrapper function that implements retry logic
        
        Args:
            function: The original function to call
            args: Arguments to pass to the function
            kwargs: Keyword arguments to pass to the function
            task_id: Unique ID for tracking this task across retries
            max_retries: Maximum number of retry attempts
            retry_delay: Base delay between retries in seconds
            retry_backoff: Backoff factor for retries
            
        Returns:
            Callable: A wrapper function that implements retry logic
        """
        def retryable_wrapper():
            # Initialize retry counter if this is the first attempt
            if task_id not in self.retry_counts:
                self.retry_counts[task_id] = 0
                
            # Update task info with current retry count
            current_retry = self.retry_counts.get(task_id, 0)
            with self.lock:
                # Find the current task ID
                current_task_id = None
                for tid, info in self.tasks.items():
                    if info.get("retry_task_id") == task_id:
                        current_task_id = tid
                        break
                
                # Update retry counter in task info
                if current_task_id:
                    self.tasks[current_task_id]["current_retry"] = current_retry
            
            try:
                # Attempt to execute the function
                return function(*args, **kwargs)
                
            except Exception as e:
                # Check if we should retry
                if self.retry_counts[task_id] < max_retries:
                    # Increment retry counter
                    self.retry_counts[task_id] += 1
                    current_retry = self.retry_counts[task_id]
                    
                    # Calculate backoff delay
                    delay = retry_delay * (retry_backoff ** (current_retry - 1))
                    delay = min(delay, self.config["retry_delay_max"])  # Cap at max delay
                    
                    logger.warning(
                        f"Task {task_id} failed, retrying ({current_retry}/{max_retries}) "
                        f"after {delay:.2f}s delay: {str(e)}"
                    )
                    
                    # Sleep for the calculated delay
                    time.sleep(delay)
                    
                    # Retry the function
                    return function(*args, **kwargs)
                else:
                    # Max retries exceeded, re-raise the exception
                    logger.error(
                        f"Task {task_id} failed after {max_retries} retries: {str(e)}"
                    )
                    raise
        
        return retryable_wrapper
    
    def cancel_task(self, task_id: str) -> bool:
        """
        Cancel a task by ID
        
        Args:
            task_id: ID of the task to cancel
            
        Returns:
            bool: True if the task was cancelled, False if not found
        """
        if not self.running:
            raise ValueError("IPFS Accelerate Adapter not running")
        
        # Check if we're tracking this task
        with self.lock:
            if task_id not in self.tasks:
                return False
            
            task_info = self.tasks[task_id]
        
        # Cancel the task in the thread pool
        cancelled = self.thread_pool_manager.cancel_task(task_id)
        
        # If cancelled, update our tracking state
        if cancelled:
            with self.lock:
                if task_id in self.tasks:
                    del self.tasks[task_id]
        
        return cancelled
    
    def _optimization_loop(self):
        """
        Background thread for performance optimization and adaptive scaling
        """
        logger.info("Performance optimization thread started")
        
        try:
            while not self.optimization_event.is_set():
                try:
                    # Only run optimizations if we've been running for a while
                    current_time = time.time()
                    if (current_time - self.performance_metrics["last_optimization_time"] >= 
                            self.config["performance_check_interval"]):
                        
                        # Get current metrics from the monitor
                        if self.monitor and self.monitor.running:
                            health_report = self.monitor.get_health_report()
                            recommendations = self.monitor.get_optimization_recommendations()
                            
                            # Apply recommendations if auto-optimization is enabled
                            if self.config["auto_optimize_thresholds"]:
                                self._apply_optimization_recommendations(recommendations)
                            
                            # Update our performance metrics
                            self.performance_metrics["last_optimization_time"] = current_time
                            self.performance_metrics["optimization_count"] += 1
                            
                            # Log optimization status
                            if health_report["status"] != "healthy":
                                logger.warning(
                                    f"System health status: {health_report['status']} - "
                                    f"Issues: {health_report['issues']}"
                                )
                                
                                # Apply emergency optimizations if system is in a degraded state
                                if health_report["status"] == "degraded":
                                    self._apply_emergency_optimizations(health_report)
                            
                            logger.debug(
                                f"Optimization #{self.performance_metrics['optimization_count']}: "
                                f"Applied {len(recommendations['general'])} general recommendations"
                            )
                
                except Exception as e:
                    logger.error(f"Error in optimization loop: {e}")
                    logger.debug(traceback.format_exc())
                
                # Wait for the next check interval
                self.optimization_event.wait(self.config["performance_check_interval"])
        
        except Exception as e:
            logger.error(f"Fatal error in optimization thread: {e}")
            logger.debug(traceback.format_exc())
        
        finally:
            logger.info("Performance optimization thread stopped")
    
    def _apply_optimization_recommendations(self, recommendations: Dict[str, Any]):
        """
        Apply optimization recommendations from the monitor
        
        Args:
            recommendations: Optimization recommendations from the monitor
        """
        # Apply general recommendations
        for rec in recommendations["general"]:
            if "increasing max_workers" in rec:
                # Increase max workers
                current_max = self.config["thread_pool_max_workers"]
                new_max = min(current_max * 1.5, current_max + 8)  # Increase by 50% or +8, whichever is smaller
                
                logger.info(f"Increasing max workers from {current_max} to {int(new_max)}")
                self.config["thread_pool_max_workers"] = int(new_max)
                
                # Update thread pool manager
                for pool in self.thread_pool_manager.pools.values():
                    if pool.max_workers < new_max:
                        with pool.scaling_lock:
                            pool.max_workers = int(new_max)
            
            elif "decreasing max_workers" in rec:
                # Decrease max workers
                current_max = self.config["thread_pool_max_workers"]
                new_max = max(self.config["thread_pool_min_workers"] * 2, current_max * 0.7)  # Reduce by 30%
                
                logger.info(f"Decreasing max workers from {current_max} to {int(new_max)}")
                self.config["thread_pool_max_workers"] = int(new_max)
                
                # Update thread pool manager (scaling down happens automatically)
        
        # Apply pool-specific recommendations
        for pool_id, pool_recs in recommendations["pools"].items():
            pool = self.thread_pool_manager.get_pool_by_id(pool_id)
            if not pool:
                continue
                
            for rec in pool_recs:
                if "Increase max_workers" in rec:
                    # Increase max workers for this specific pool
                    current_max = pool.max_workers
                    new_max = min(current_max * 1.5, current_max + 4)  # Increase by 50% or +4, whichever is smaller
                    
                    logger.info(f"Increasing max workers for pool {pool_id} from {current_max} to {int(new_max)}")
                    with pool.scaling_lock:
                        pool.max_workers = int(new_max)
                
                elif "Decrease max_workers" in rec:
                    # Decrease max workers for this specific pool
                    current_max = pool.max_workers
                    new_max = max(pool.min_workers + 1, current_max * 0.7)  # Reduce by 30%
                    
                    logger.info(f"Decreasing max workers for pool {pool_id} from {current_max} to {int(new_max)}")
                    with pool.scaling_lock:
                        pool.max_workers = int(new_max)
    
    def _apply_emergency_optimizations(self, health_report: Dict[str, Any]):
        """
        Apply emergency optimizations when system health is degraded
        
        Args:
            health_report: Health report from the monitor
        """
        # Check for specific issues and apply targeted optimizations
        for issue in health_report["issues"]:
            if "High queue depth" in issue:
                # Emergency increase in worker count to handle backlog
                for pool_id, pool_status in health_report["pools_status"].items():
                    if pool_status["queue_depth"] > 5:  # Significant queue
                        pool = self.thread_pool_manager.get_pool_by_id(pool_id)
                        if pool:
                            current_max = pool.max_workers
                            new_max = min(current_max * 2, current_max + 8)  # More aggressive scaling
                            
                            logger.warning(
                                f"EMERGENCY: Increasing max workers for pool {pool_id} from "
                                f"{current_max} to {int(new_max)} due to high queue depth"
                            )
                            with pool.scaling_lock:
                                pool.max_workers = int(new_max)
            
            elif "High worker utilization" in issue:
                # System is at capacity, increase workers across the board
                current_max = self.config["thread_pool_max_workers"]
                new_max = min(current_max * 2, current_max + 16)  # Double or +16, whichever is smaller
                
                logger.warning(
                    f"EMERGENCY: Increasing max workers from {current_max} to {int(new_max)} "
                    f"due to high worker utilization"
                )
                self.config["thread_pool_max_workers"] = int(new_max)
                
                # Update all pools
                for pool in self.thread_pool_manager.pools.values():
                    with pool.scaling_lock:
                        pool.max_workers = int(new_max)
            
            elif "High error rate" in issue:
                # Errors might be due to system overload, reduce parallelism temporarily
                logger.warning("EMERGENCY: High error rate detected, reducing task submission rate")
                # Implement rate limiting or backpressure here if needed
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the adapter and its components
        
        Returns:
            Dict[str, Any]: Statistics
        """
        thread_pool_stats = self.thread_pool_manager.get_stats()
        
        # Get monitor stats if available
        monitor_stats = None
        if self.monitor and self.monitor.running:
            try:
                monitor_stats = self.monitor.get_metrics()
            except Exception as e:
                logger.error(f"Error getting monitor stats: {e}")
        
        # Combine with our own stats
        with self.lock:
            stats = {
                "thread_pools": thread_pool_stats,
                "models": {
                    "count": len(self.models),
                    "models": [
                        {
                            "id": model_id,
                            "cid": model_info["cid"],
                            "loaded_for": time.time() - model_info["loaded_at"]
                        }
                        for model_id, model_info in self.models.items()
                    ]
                },
                "tasks": {
                    "active": len(self.tasks),
                    "tasks": [
                        {
                            "id": task_id,
                            "type": task_info["type"],
                            "running_for": time.time() - task_info["submitted_at"],
                            "completed": task_info["future"].done()
                        }
                        for task_id, task_info in self.tasks.items()
                    ]
                },
                "performance": self.performance_metrics,
                "monitor": monitor_stats,
                "config": self.config
            }
            
            # Add retry statistics if we have any
            if self.retry_counts:
                stats["retries"] = {
                    "total": sum(self.retry_counts.values()),
                    "tasks_retried": len(self.retry_counts),
                    "max_retries": max(self.retry_counts.values()) if self.retry_counts else 0
                }
        
        return stats
    
    async def test(self) -> Dict[str, Any]:
        """
        Run module tests
        
        Returns:
            Dict[str, Any]: Test results
        """
        logger.info("Testing IPFS Accelerate Adapter")
        
        test_results = {
            "success": False,
            "module": "ipfs_accelerate_mp_adapter",
            "steps": {},
            "diagnostics": {
                "thread_pools": {},
                "accelerate_server": {},
                "config": self.config
            }
        }
        
        try:
            # Test 1: Start the adapter
            if not self.running:
                await self.start()
            
            test_results["steps"]["start_adapter"] = {
                "success": self.running,
                "message": "Adapter started successfully" if self.running else "Failed to start adapter"
            }
            
            if not self.running:
                test_results["success"] = False
                return test_results
            
            # Test 2: Thread pool test
            thread_pool_test = await self.thread_pool_manager.test()
            test_results["diagnostics"]["thread_pools"] = thread_pool_test
            
            test_results["steps"]["thread_pool_test"] = {
                "success": thread_pool_test["success"],
                "message": "Thread pool tests passed" if thread_pool_test["success"] else "Thread pool tests failed"
            }
            
            # Test 3: Submit IPFS tasks
            ipfs_tasks_completed = 0
            ipfs_futures = []
            
            # Define a test function for IPFS tasks
            def ipfs_test_function(value):
                time.sleep(0.1)  # Simulate work
                return f"IPFS task: {value}"
            
            # Submit some IPFS tasks
            for i in range(5):
                _, future = self.submit_ipfs_task(
                    function=ipfs_test_function,
                    value=i,
                    priority=TaskPriority.NORMAL
                )
                ipfs_futures.append(future)
            
            # Wait for tasks to complete
            for future in ipfs_futures:
                try:
                    result = await future
                    if result.startswith("IPFS task:"):
                        ipfs_tasks_completed += 1
                except Exception as e:
                    logger.error(f"Error in IPFS task: {e}")
            
            test_results["steps"]["ipfs_tasks"] = {
                "success": ipfs_tasks_completed == 5,
                "message": f"Completed {ipfs_tasks_completed}/5 IPFS tasks"
            }
            
            # Test 4: Submit CPU tasks
            cpu_tasks_completed = 0
            cpu_futures = []
            
            # Define a test function for CPU tasks
            def cpu_test_function(n):
                # Simple CPU-intensive task
                result = 0
                for i in range(n):
                    result += i
                return result
            
            # Submit some CPU tasks
            for i in range(5):
                _, future = self.submit_cpu_task(
                    function=cpu_test_function,
                    n=100000,  # 100K iterations
                    priority=TaskPriority.NORMAL
                )
                cpu_futures.append(future)
            
            # Wait for tasks to complete
            for future in cpu_futures:
                try:
                    result = await future
                    if result > 0:
                        cpu_tasks_completed += 1
                except Exception as e:
                    logger.error(f"Error in CPU task: {e}")
            
            test_results["steps"]["cpu_tasks"] = {
                "success": cpu_tasks_completed == 5,
                "message": f"Completed {cpu_tasks_completed}/5 CPU tasks"
            }
            
            # Test 5: Load a mock model and run inference
            # This test depends on the server using mock mode for tests
            if self.config["use_mock"] or self.metadata.get("use_mock_for_tests", True):
                try:
                    # Load a mock model
                    model_id = f"test_model_{int(time.time())}"
                    load_result = await self.load_model_from_ipfs(model_id, "QmTestModelCID")
                    
                    model_loaded = load_result.get("status") == "success"
                    
                    test_results["steps"]["load_model"] = {
                        "success": model_loaded,
                        "message": f"Model {model_id} loaded successfully" if model_loaded else "Failed to load model"
                    }
                    
                    if model_loaded:
                        # Run inference
                        inference_result = await self.run_inference(model_id, "Test input")
                        
                        inference_success = inference_result.get("status") == "success"
                        
                        test_results["steps"]["inference"] = {
                            "success": inference_success,
                            "message": "Inference successful" if inference_success else "Inference failed"
                        }
                        
                        # Unload the model
                        unload_result = await self.unload_model(model_id)
                        
                        unload_success = unload_result.get("status") == "success"
                        
                        test_results["steps"]["unload_model"] = {
                            "success": unload_success,
                            "message": f"Model {model_id} unloaded successfully" if unload_success else "Failed to unload model"
                        }
                except Exception as e:
                    logger.error(f"Error in model tests: {e}")
                    test_results["steps"]["model_tests"] = {
                        "success": False,
                        "message": f"Error in model tests: {e}"
                    }
            else:
                test_results["steps"]["model_tests"] = {
                    "success": True,
                    "message": "Model tests skipped (not in mock mode)"
                }
            
            # Test 6: Cancel a task
            try:
                # Define a long-running task
                def long_task():
                    time.sleep(10)
                    return "Completed"
                
                # Submit the task
                task_id, future = self.submit_task(
                    function=long_task,
                    task_type=TaskType.GENERAL,
                    priority=TaskPriority.NORMAL
                )
                
                # Cancel the task
                cancelled = self.cancel_task(task_id)
                
                test_results["steps"]["cancel_task"] = {
                    "success": cancelled,
                    "message": "Task cancelled successfully" if cancelled else "Failed to cancel task"
                }
            except Exception as e:
                logger.error(f"Error in cancel test: {e}")
                test_results["steps"]["cancel_task"] = {
                    "success": False,
                    "message": f"Error in cancel test: {e}"
                }
            
            # Test 7: Test retry mechanism
            try:
                # Define a function that fails on first attempt but succeeds on retry
                retry_count = [0]  # Use list for mutable state
                
                def retry_test_function():
                    retry_count[0] += 1
                    if retry_count[0] == 1:
                        # First attempt fails
                        raise ValueError("Simulated error for testing retry mechanism")
                    # Second attempt succeeds
                    return f"Success after {retry_count[0]} attempts"
                
                # Submit with retry enabled
                retry_task_id, retry_future = self.submit_task(
                    function=retry_test_function,
                    task_type=TaskType.GENERAL,
                    priority=TaskPriority.NORMAL,
                    allow_retries=True,
                    max_retries=2  # Allow up to 2 retries
                )
                
                # Wait for the result
                try:
                    retry_result = await retry_future
                    retry_success = retry_result.startswith("Success after")
                except Exception as e:
                    logger.error(f"Retry test failed: {e}")
                    retry_success = False
                
                test_results["steps"]["retry_mechanism"] = {
                    "success": retry_success,
                    "message": f"Retry mechanism {'worked correctly' if retry_success else 'failed'}"
                }
            except Exception as e:
                logger.error(f"Error in retry test: {e}")
                test_results["steps"]["retry_mechanism"] = {
                    "success": False,
                    "message": f"Error in retry test: {e}"
                }
            
            # Test 8: Test monitor and dashboard integration (if enabled)
            if self.config["enable_monitoring"]:
                try:
                    # Check if monitor is running
                    monitor_running = self.monitor and self.monitor.running
                    
                    # Get health report and recommendations
                    if monitor_running:
                        health_report = self.monitor.get_health_report()
                        recommendations = self.monitor.get_optimization_recommendations()
                        
                        test_results["steps"]["monitoring_integration"] = {
                            "success": True,
                            "message": f"Monitoring integration working, system status: {health_report['status']}"
                        }
                        
                        # Add to diagnostics
                        test_results["diagnostics"]["health_report"] = health_report
                        test_results["diagnostics"]["recommendations"] = recommendations
                    else:
                        test_results["steps"]["monitoring_integration"] = {
                            "success": False,
                            "message": "Monitor not running"
                        }
                    
                    # Check dashboard if enabled
                    if self.dashboard and self.dashboard.running:
                        dashboard_summary = self.dashboard.get_dashboard_summary()
                        
                        test_results["steps"]["dashboard_integration"] = {
                            "success": True,
                            "message": "Dashboard integration working"
                        }
                        
                        # Add to diagnostics
                        test_results["diagnostics"]["dashboard_summary"] = dashboard_summary
                    elif self.config["enable_dashboard"]:
                        test_results["steps"]["dashboard_integration"] = {
                            "success": False,
                            "message": "Dashboard not running but enabled in config"
                        }
                except Exception as e:
                    logger.error(f"Error in monitoring/dashboard test: {e}")
                    test_results["steps"]["monitoring_integration"] = {
                        "success": False,
                        "message": f"Error in monitoring/dashboard test: {e}"
                    }
            
            # Test 9: Get statistics
            try:
                stats = self.get_stats()
                
                test_results["steps"]["get_stats"] = {
                    "success": True,
                    "message": "Statistics retrieved successfully"
                }
                
                test_results["diagnostics"]["statistics"] = stats
            except Exception as e:
                logger.error(f"Error getting statistics: {e}")
                test_results["steps"]["get_stats"] = {
                    "success": False,
                    "message": f"Error getting statistics: {e}"
                }
            
            # Overall success
            test_results["success"] = all(step["success"] for step in test_results["steps"].values())
            
            return test_results
        
        except Exception as e:
            logger.error(f"Error in IPFS Accelerate Adapter test: {e}")
            test_results["success"] = False
            test_results["error"] = str(e)
            return test_results


# Example usage
if __name__ == "__main__":
    import time
    import asyncio
    import argparse
    
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description="IPFS Accelerate MP Adapter Example")
    parser.add_argument("--dashboard", action="store_true", help="Enable thread pool dashboard")
    parser.add_argument("--monitor", action="store_true", help="Enable thread pool monitoring")
    parser.add_argument("--adaptive", action="store_true", help="Enable adaptive scaling")
    parser.add_argument("--duration", type=int, default=60, help="Duration to run the test in seconds")
    args = parser.parse_args()
    
    async def main():
        print(f"\n{'=' * 80}")
        print("IPFS Accelerate MP Adapter with Thread Pool Integration")
        print(f"{'=' * 80}")
        
        # Create the adapter with advanced features
        adapter = IPFSAccelerateAdapter(metadata={
            # Common configuration
            "use_mock": True,
            "use_mock_for_tests": True,
            "thread_pool_min_workers": 2,
            "thread_pool_max_workers": 16,
            
            # Enable monitoring and dashboard based on command-line args
            "enable_monitoring": args.monitor or args.dashboard,
            "enable_dashboard": args.dashboard,
            "dashboard_update_interval": 2.0,
            "monitor_poll_interval": 1.0,
            
            # Advanced features
            "enable_adaptive_scaling": args.adaptive,
            "max_retries": 3,
            "retry_delay_base": 0.5,
            "retry_backoff_factor": 2.0,
            
            # Dashboard configuration
            "enable_web_dashboard": False,  # Set to True to enable web UI
            "dashboard_port": 8080
        })
        
        try:
            print("\nStarting adapter...")
            await adapter.start()
            print("Adapter started successfully")
            
            # Show active features
            features = []
            if args.monitor:
                features.append("Thread Pool Monitoring")
            if args.dashboard:
                features.append("Thread Pool Dashboard")
            if args.adaptive:
                features.append("Adaptive Resource Scaling")
            
            if features:
                print(f"\nEnabled features: {', '.join(features)}")
            
            # Run tests to validate core functionality
            print("\nRunning core functionality tests...")
            test_results = await adapter.test()
            print(f"Test results: {'SUCCESS' if test_results['success'] else 'FAILED'}")
            print(f"Passed: {sum(1 for step in test_results['steps'].values() if step['success'])}/{len(test_results['steps'])}")
            
            # Demonstrate automatic retry mechanism
            print("\nDemonstrating automatic retry mechanism...")
            
            # Create a function that fails initially but succeeds on retry
            failure_counts = {}
            
            def flaky_function(task_name, fail_attempts=1):
                if task_name not in failure_counts:
                    failure_counts[task_name] = 0
                
                failure_counts[task_name] += 1
                current_attempt = failure_counts[task_name]
                
                if current_attempt <= fail_attempts:
                    print(f"  Task {task_name}: Attempt {current_attempt} - Simulating failure...")
                    raise ValueError(f"Simulated error for {task_name} (attempt {current_attempt})")
                
                print(f"  Task {task_name}: Attempt {current_attempt} - Success!")
                return f"Task {task_name} succeeded after {current_attempt} attempts"
            
            # Submit tasks with different retry configurations
            print("\nSubmitting tasks with different retry configurations...")
            retry_futures = []
            
            # Task with default retry (should succeed on 2nd attempt)
            _, future1 = adapter.submit_io_task(
                function=flaky_function,
                task_name="Default-Retry",
                fail_attempts=1,
                priority=TaskPriority.NORMAL
            )
            retry_futures.append(future1)
            
            # Task with custom retry count (should succeed on 3rd attempt)
            _, future2 = adapter.submit_io_task(
                function=flaky_function,
                task_name="Custom-Retry",
                fail_attempts=2,
                priority=TaskPriority.HIGH,
                max_retries=5
            )
            retry_futures.append(future2)
            
            # Task with retries disabled (should fail)
            _, future3 = adapter.submit_io_task(
                function=flaky_function,
                task_name="No-Retry",
                fail_attempts=1,
                priority=TaskPriority.LOW,
                allow_retries=False
            )
            retry_futures.append(future3)
            
            # Wait for all tasks and process results
            print("\nWaiting for retry tasks to complete...")
            for future in retry_futures:
                try:
                    result = await future
                    print(f"SUCCESS: {result}")
                except Exception as e:
                    print(f"FAILED: {e}")
            
            # Demonstrate parallel task execution with various task types
            print("\nDemonstrating parallel task execution...")
            
            # Define test functions
            def io_task(name, sleep_time):
                print(f"  Running IO task {name}...")
                time.sleep(sleep_time)
                return f"IO task {name} completed after {sleep_time}s"
            
            def cpu_task(name, iterations):
                print(f"  Running CPU task {name}...")
                result = 0
                for i in range(iterations):
                    result += i
                return f"CPU task {name} completed with result {result}"
            
            def ipfs_task(name, cid, sleep_time):
                print(f"  Running IPFS task {name} for CID {cid}...")
                time.sleep(sleep_time)  # Simulate IPFS operation
                return f"IPFS task {name} completed for CID {cid}"
            
            # Submit a mix of tasks with different priorities
            print("\nSubmitting mixed task types with different priorities...")
            task_futures = []
            
            # IO tasks
            for i in range(3):
                _, future = adapter.submit_io_task(
                    function=io_task,
                    name=f"IO-{i}",
                    sleep_time=0.5,
                    priority=TaskPriority.NORMAL
                )
                task_futures.append(future)
            
            # CPU tasks
            for i in range(3):
                _, future = adapter.submit_cpu_task(
                    function=cpu_task,
                    name=f"CPU-{i}",
                    iterations=1000000,  # 1M iterations
                    priority=TaskPriority.HIGH
                )
                task_futures.append(future)
            
            # IPFS tasks
            for i in range(3):
                _, future = adapter.submit_ipfs_task(
                    function=ipfs_task,
                    name=f"IPFS-{i}",
                    cid=f"QmExampleCid{i}",
                    sleep_time=0.7,
                    priority=TaskPriority.CRITICAL
                )
                task_futures.append(future)
            
            # Wait for all tasks to complete
            results = await asyncio.gather(*task_futures)
            
            print("\nTask results:")
            for result in results:
                print(f"- {result}")
            
            # Get and display statistics
            stats = adapter.get_stats()
            print(f"\nAdapter statistics summary:")
            print(f"- Total pools: {stats['thread_pools']['total_pools']}")
            print(f"- Total workers: {stats['thread_pools']['workers']['total']}")
            print(f"- Active workers: {stats['thread_pools']['workers']['active']}")
            print(f"- Tasks submitted: {stats['thread_pools']['tasks']['submitted']}")
            print(f"- Tasks completed: {stats['thread_pools']['tasks']['completed']}")
            print(f"- Tasks failed: {stats['thread_pools']['tasks']['failed']}")
            
            # If monitoring is enabled, show health report
            if adapter.monitor and adapter.monitor.running:
                health = adapter.monitor.get_health_report()
                print(f"\nSystem health: {health['status'].upper()}")
                if health["issues"]:
                    print("Issues detected:")
                    for issue in health["issues"]:
                        print(f"- {issue}")
                
                recommendations = adapter.monitor.get_optimization_recommendations()
                if recommendations["general"]:
                    print("\nOptimization recommendations:")
                    for rec in recommendations["general"]:
                        print(f"- {rec}")
            
            # If dashboard is enabled, run interactive session
            if adapter.dashboard and adapter.dashboard.running and args.dashboard:
                print(f"\nStarting interactive dashboard session for {args.duration} seconds...")
                print("Press Ctrl+C to exit early")
                
                # Run the dashboard for the specified duration
                try:
                    start_time = time.time()
                    while time.time() - start_time < args.duration:
                        # Submit some background tasks to generate activity
                        if int(time.time() - start_time) % 5 == 0:
                            # Submit IO task
                            adapter.submit_io_task(
                                function=io_task,
                                name=f"Background-IO-{int(time.time())}",
                                sleep_time=0.5,
                                priority=TaskPriority.NORMAL
                            )
                            
                            # Submit CPU task
                            adapter.submit_cpu_task(
                                function=cpu_task,
                                name=f"Background-CPU-{int(time.time())}",
                                iterations=500000,
                                priority=TaskPriority.NORMAL
                            )
                        
                        # Render dashboard
                        await adapter.dashboard.render_dashboard()
                        
                        # Wait before next update
                        await asyncio.sleep(1.0)
                
                except KeyboardInterrupt:
                    print("\nDashboard session interrupted by user")
            
        finally:
            # Stop the adapter
            print("\nStopping adapter...")
            await adapter.stop()
            print("Adapter stopped successfully")
    
    try:
        # Run the example
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nExample interrupted by user")
    finally:
        print("\nExample completed")