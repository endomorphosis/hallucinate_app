"""
Thread Pool Integration Module

This module provides a unified interface for integrating the thread pool system
with other application components. It offers simplified task submission, automatic
task type detection, and seamless integration with the resource pool pattern.

Key features:
- Simplified interface for thread pool task submission
- Automatic task type detection based on function name or content
- Resource pool integration and dependency management
- Decoration-based thread pool integration for functions
- Support for both synchronous and asynchronous tasks
- Seamless switching between basic and advanced thread pool implementation
"""

import inspect
import functools
import asyncio
import threading
import logging
import time
import re
from concurrent.futures import Future
from typing import Dict, List, Any, Optional, Union, Tuple, Callable, Set, TypeVar, Generic, AsyncGenerator

from .thread_pool_manager import (
    ThreadPoolManager,
    TaskPriority,
    TaskType, 
    TaskState
)

from .thread_pool_monitor import ThreadPoolMonitor

# Advanced pool management (conditional import)
try:
    from .advanced_thread_pool_manager import (
        AdvancedThreadPoolManager,
        TaskAffinity,
        PoolCapability,
        TaskMetadata,
        ResourceProfile
    )
    
    from .advanced_thread_pool_monitor import (
        AdvancedThreadPoolMonitor,
        WorkloadPattern,
        EnhancedPerformanceMetrics
    )
    ADVANCED_AVAILABLE = True
except ImportError:
    ADVANCED_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Type definitions
T = TypeVar('T')  # Task type
R = TypeVar('R')  # Result type


class ThreadPoolIntegration:
    """
    Thread Pool Integration with automatic task type detection and simplified interface
    
    This class provides a simplified interface for thread pool task submission
    with automatic task type detection based on function name or signature.
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the Thread Pool Integration
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Configuration
        self.config = {
            "use_advanced_pools": metadata.get("use_advanced_pools", ADVANCED_AVAILABLE),
            "automatic_task_type": metadata.get("automatic_task_type", True),
            "auto_start_monitor": metadata.get("auto_start_monitor", True),
            "default_priority": metadata.get("default_priority", TaskPriority.NORMAL),
            "default_timeout": metadata.get("default_timeout", None),
            "function_name_patterns": metadata.get("function_name_patterns", {
                TaskType.IO: [r'.*_io$', r'.*_file$', r'read_.*', r'write_.*', r'load_.*', r'save_.*', r'download_.*', r'upload_.*'],
                TaskType.CPU: [r'.*_compute$', r'.*_calculate$', r'process_.*', r'analyze_.*'],
                TaskType.ML: [r'.*_predict$', r'.*_train$', r'.*_inference$', r'.*_model$'],
                TaskType.IPFS: [r'.*_ipfs$', r'.*_dag$', r'ipfs_.*', r'p2p_.*'],
                TaskType.DATABASE: [r'.*_db$', r'.*_query$', r'db_.*', r'query_.*', r'.*_sql$'],
                TaskType.SECURITY: [r'.*_auth$', r'.*_encrypt$', r'.*_decrypt$', r'auth_.*', r'secure_.*', r'verify_.*']
            }),
            "docstring_patterns": metadata.get("docstring_patterns", {
                TaskType.IO: [r'i/o', r'file', r'network', r'socket', r'http'],
                TaskType.CPU: [r'computation', r'calculate', r'process', r'intensive'],
                TaskType.ML: [r'model', r'predict', r'inference', r'train', r'ml', r'machine learning'],
                TaskType.IPFS: [r'ipfs', r'p2p', r'peer', r'content address', r'dag'],
                TaskType.DATABASE: [r'database', r'db', r'query', r'sql', r'nosql'],
                TaskType.SECURITY: [r'security', r'auth', r'encrypt', r'decrypt', r'hash']
            })
        }
        
        # Create manager based on configuration
        if self.config["use_advanced_pools"] and ADVANCED_AVAILABLE:
            self.pool_manager = AdvancedThreadPoolManager(
                resources=self.resources,
                metadata=self.metadata
            )
            
            # Create advanced monitor
            self.pool_monitor = AdvancedThreadPoolMonitor(
                thread_pool_manager=self.pool_manager,
                resources=self.resources,
                metadata=self.metadata
            )
            
            logger.info("Using advanced thread pool management")
        else:
            self.pool_manager = ThreadPoolManager(
                resources=self.resources,
                metadata=self.metadata
            )
            
            # Create basic monitor
            self.pool_monitor = ThreadPoolMonitor(
                thread_pool_manager=self.pool_manager,
                resources=self.resources,
                metadata=self.metadata
            )
            
            logger.info("Using basic thread pool management")
        
        # Start monitor if configured
        if self.config["auto_start_monitor"]:
            self.pool_monitor.start()
            logger.info("Thread pool monitor started automatically")
        
        # Task history/cache
        self.task_history: List[Dict[str, Any]] = []
        self.function_task_type_cache: Dict[Callable, TaskType] = {}
        self.task_results_cache: Dict[str, Any] = {}
        
        # Cache size limit
        self.max_history_size = 1000
        self.max_cache_size = 100
        
        # Task type detection lock
        self.detection_lock = threading.RLock()
        
        logger.info(f"ThreadPoolIntegration initialized with config: {self.config}")
    
    def detect_task_type(self, func: Callable) -> TaskType:
        """
        Detect the appropriate task type for a function
        
        Args:
            func: The function to analyze
            
        Returns:
            TaskType: The detected task type
        """
        with self.detection_lock:
            # Check cache first
            if func in self.function_task_type_cache:
                return self.function_task_type_cache[func]
            
            # Get function name
            func_name = func.__name__
            
            # Check function name patterns
            for task_type, patterns in self.config["function_name_patterns"].items():
                for pattern in patterns:
                    if re.match(pattern, func_name, re.IGNORECASE):
                        # Cache and return
                        self.function_task_type_cache[func] = task_type
                        return task_type
            
            # Check docstring if available
            doc = inspect.getdoc(func)
            if doc:
                for task_type, patterns in self.config["docstring_patterns"].items():
                    for pattern in patterns:
                        if re.search(pattern, doc, re.IGNORECASE):
                            # Cache and return
                            self.function_task_type_cache[func] = task_type
                            return task_type
            
            # Check function source if available
            try:
                source = inspect.getsource(func)
                
                # Count potential indicators for different task types
                indicators = {task_type: 0 for task_type in TaskType}
                
                # IO indicators
                if re.search(r'open\(|read|write|file|socket|requests?\.', source):
                    indicators[TaskType.IO] += 1
                
                # CPU indicators
                if re.search(r'for\s+\w+\s+in\s+range|while\s+.*:|math\.|np\.|calculate|compute', source):
                    indicators[TaskType.CPU] += 1
                
                # ML indicators
                if re.search(r'model|predict|train|inference|torch\.|tensorflow\.|sklearn\.', source):
                    indicators[TaskType.ML] += 1
                
                # IPFS indicators
                if re.search(r'ipfs|cid|p2p|libp2p|multiaddr|content_id', source):
                    indicators[TaskType.IPFS] += 1
                
                # Database indicators
                if re.search(r'database|query|sql|cursor|execute|commit|db\.|duckdb|orbitdb|fireproofdb', source):
                    indicators[TaskType.DATABASE] += 1
                
                # Security indicators
                if re.search(r'security|auth|encrypt|decrypt|hash|sign|verify|ucan|capability', source):
                    indicators[TaskType.SECURITY] += 1
                
                # Choose the task type with the most indicators
                if any(indicators.values()):
                    best_type = max(indicators.items(), key=lambda x: x[1])[0]
                    # Cache and return
                    self.function_task_type_cache[func] = best_type
                    return best_type
            
            except (IOError, TypeError):
                # Can't get source for this function
                pass
            
            # Default to general task type
            self.function_task_type_cache[func] = TaskType.GENERAL
            return TaskType.GENERAL
    
    def create_task_metadata(self, func: Callable, args: Tuple, kwargs: Dict) -> Optional[TaskMetadata]:
        """
        Create task metadata for advanced thread pool management
        
        Args:
            func: The function to execute
            args: Arguments to pass to the function
            kwargs: Keyword arguments to pass to the function
            
        Returns:
            Optional[TaskMetadata]: Task metadata or None if advanced pools not available
        """
        if not ADVANCED_AVAILABLE:
            return None
        
        # Create basic metadata
        metadata = TaskMetadata()
        
        # Try to determine required capabilities
        task_type = self.detect_task_type(func)
        
        # Set capabilities based on task type
        if task_type == TaskType.IO:
            metadata.required_capabilities = {PoolCapability.HIGH_IO}
        elif task_type == TaskType.CPU:
            metadata.required_capabilities = {PoolCapability.HIGH_CPU}
        elif task_type == TaskType.ML:
            metadata.required_capabilities = {PoolCapability.ML}
            # Add GPU if available for ML tasks
            try:
                import torch
                if torch.cuda.is_available():
                    metadata.required_capabilities.add(PoolCapability.GPU)
            except ImportError:
                pass
        elif task_type == TaskType.IPFS:
            metadata.required_capabilities = {PoolCapability.IPFS}
        elif task_type == TaskType.DATABASE:
            metadata.required_capabilities = {PoolCapability.DATABASE}
        elif task_type == TaskType.SECURITY:
            metadata.required_capabilities = {PoolCapability.SECURITY}
        
        # Set affinity to preferred for the detected task type
        metadata.affinity = TaskAffinity.PREFERRED
        
        # Try to estimate duration based on past executions of this function
        func_executions = [
            task for task in self.task_history 
            if task.get("function_name") == func.__name__
        ]
        
        if func_executions:
            # Calculate average runtime
            runtimes = [
                task.get("end_time", 0) - task.get("start_time", 0) 
                for task in func_executions 
                if task.get("end_time") and task.get("start_time")
            ]
            
            if runtimes:
                metadata.estimated_duration = sum(runtimes) / len(runtimes)
        
        return metadata
    
    def submit(
        self,
        func: Callable[..., R],
        *args,
        task_type: Optional[TaskType] = None,
        priority: Optional[TaskPriority] = None,
        timeout: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
        pool_id: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Future]:
        """
        Submit a task to the thread pool
        
        Args:
            func: The function to execute
            *args: Arguments to pass to the function
            task_type: Type of task for pool selection (auto-detected if None)
            priority: Priority of the task (defaults to configured default)
            timeout: Timeout for the task in seconds (defaults to configured default)
            metadata: Additional task metadata for routing and prioritization
            pool_id: Optional ID of the specific pool to use
            **kwargs: Keyword arguments to pass to the function
            
        Returns:
            Tuple[str, Future]: Task ID and Future object for the task
        """
        # Auto-detect task type if not specified
        if task_type is None and self.config["automatic_task_type"]:
            task_type = self.detect_task_type(func)
        elif task_type is None:
            task_type = TaskType.GENERAL
        
        # Use default priority if not specified
        if priority is None:
            priority = self.config["default_priority"]
        
        # Use default timeout if not specified
        if timeout is None:
            timeout = self.config["default_timeout"]
        
        # Create task record
        task_record = {
            "function_name": func.__name__,
            "task_type": task_type.name,
            "priority": priority.name,
            "timeout": timeout,
            "start_time": time.time(),
            "end_time": None,
            "status": TaskState.PENDING.name,
            "result": None,
            "exception": None
        }
        
        # Create advanced metadata if available
        if ADVANCED_AVAILABLE and self.config["use_advanced_pools"]:
            task_metadata = self.create_task_metadata(func, args, kwargs)
            
            # Apply custom metadata if provided
            if metadata and task_metadata:
                for key, value in metadata.items():
                    if hasattr(task_metadata, key):
                        setattr(task_metadata, key, value)
            
            # Submit with advanced features
            task_id, future = self.pool_manager.submit(
                function=func,
                *args,
                task_type=task_type,
                priority=priority,
                timeout=timeout,
                metadata=task_metadata,
                pool_id=pool_id,
                **kwargs
            )
        else:
            # Submit with basic features
            task_id, future = self.pool_manager.submit(
                function=func,
                *args,
                task_type=task_type,
                priority=priority,
                timeout=timeout,
                **kwargs
            )
        
        # Store task ID in record
        task_record["task_id"] = task_id
        
        # Add callback to update record when task completes
        def on_task_complete(f):
            try:
                # Get result or exception
                result = f.result()
                task_record["result"] = str(result)[:100] + "..." if isinstance(result, str) and len(str(result)) > 100 else result
                task_record["status"] = TaskState.COMPLETED.name
                # Cache result
                self.task_results_cache[task_id] = result
            except Exception as e:
                task_record["exception"] = str(e)
                task_record["status"] = TaskState.FAILED.name
            
            # Record end time
            task_record["end_time"] = time.time()
            
            # Add to history
            self.task_history.append(task_record)
            
            # Trim history if needed
            if len(self.task_history) > self.max_history_size:
                self.task_history = self.task_history[-self.max_history_size:]
            
            # Trim cache if needed
            if len(self.task_results_cache) > self.max_cache_size:
                oldest_keys = list(self.task_results_cache.keys())[:len(self.task_results_cache) - self.max_cache_size]
                for key in oldest_keys:
                    if key in self.task_results_cache:
                        del self.task_results_cache[key]
        
        future.add_done_callback(on_task_complete)
        
        return task_id, future
    
    async def submit_async(
        self,
        func: Callable[..., R],
        *args,
        task_type: Optional[TaskType] = None,
        priority: Optional[TaskPriority] = None,
        timeout: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
        pool_id: Optional[str] = None,
        **kwargs
    ) -> R:
        """
        Submit a task to the thread pool and await the result
        
        Args:
            func: The function to execute
            *args: Arguments to pass to the function
            task_type: Type of task for pool selection (auto-detected if None)
            priority: Priority of the task (defaults to configured default)
            timeout: Timeout for the task in seconds (defaults to configured default)
            metadata: Additional task metadata for routing and prioritization
            pool_id: Optional ID of the specific pool to use
            **kwargs: Keyword arguments to pass to the function
            
        Returns:
            R: The result of the task
        """
        # Submit the task
        task_id, future = self.submit(
            func=func,
            *args,
            task_type=task_type,
            priority=priority,
            timeout=timeout,
            metadata=metadata,
            pool_id=pool_id,
            **kwargs
        )
        
        # Wait for result
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, future.result)
    
    def cancel_task(self, task_id: str) -> bool:
        """
        Cancel a task by ID
        
        Args:
            task_id: ID of the task to cancel
            
        Returns:
            bool: True if the task was cancelled, False if not found
        """
        result = self.pool_manager.cancel_task(task_id)
        
        # Update task record if found
        for task in self.task_history:
            if task.get("task_id") == task_id and task.get("status") != TaskState.COMPLETED.name:
                task["status"] = TaskState.CANCELLED.name
                task["end_time"] = time.time()
                break
        
        return result
    
    def get_task_result(self, task_id: str) -> Optional[Any]:
        """
        Get the result of a completed task
        
        Args:
            task_id: ID of the task
            
        Returns:
            Optional[Any]: The task result or None if not found/completed
        """
        return self.task_results_cache.get(task_id)
    
    def get_task_status(self, task_id: str) -> Optional[str]:
        """
        Get the status of a task
        
        Args:
            task_id: ID of the task
            
        Returns:
            Optional[str]: The task status or None if not found
        """
        for task in reversed(self.task_history):
            if task.get("task_id") == task_id:
                return task.get("status")
        
        return None
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get thread pool statistics
        
        Returns:
            Dict[str, Any]: Thread pool statistics
        """
        stats = self.pool_manager.get_stats()
        
        # Add task history statistics
        completed = sum(1 for task in self.task_history if task.get("status") == TaskState.COMPLETED.name)
        failed = sum(1 for task in self.task_history if task.get("status") == TaskState.FAILED.name)
        cancelled = sum(1 for task in self.task_history if task.get("status") == TaskState.CANCELLED.name)
        
        stats["task_history"] = {
            "total": len(self.task_history),
            "completed": completed,
            "failed": failed,
            "cancelled": cancelled,
            "success_rate": completed / max(1, len(self.task_history))
        }
        
        # Add task type distribution
        task_types = {}
        for task in self.task_history:
            task_type = task.get("task_type")
            if task_type:
                if task_type not in task_types:
                    task_types[task_type] = 0
                task_types[task_type] += 1
        
        stats["task_distribution"] = task_types
        
        return stats
    
    def get_health_report(self) -> Dict[str, Any]:
        """
        Get thread pool health report
        
        Returns:
            Dict[str, Any]: Thread pool health report
        """
        if hasattr(self.pool_monitor, "get_advanced_health_report"):
            return self.pool_monitor.get_advanced_health_report()
        else:
            return self.pool_monitor.get_health_report()
    
    def get_optimization_recommendations(self) -> Dict[str, Any]:
        """
        Get optimization recommendations
        
        Returns:
            Dict[str, Any]: Optimization recommendations
        """
        if hasattr(self.pool_monitor, "get_advanced_recommendations"):
            return self.pool_monitor.get_advanced_recommendations()
        else:
            return self.pool_monitor.get_optimization_recommendations()
    
    def shutdown(self, wait: bool = True):
        """
        Shutdown the thread pool manager and monitor
        
        Args:
            wait: If True, wait for tasks to complete before shutting down
        """
        # Stop monitor
        if self.pool_monitor:
            self.pool_monitor.stop()
        
        # Shutdown manager
        if self.pool_manager:
            self.pool_manager.shutdown(wait=wait)
        
        logger.info(f"Thread pool integration shut down" + 
                  (" gracefully" if wait else " without waiting for tasks"))
    
    def thread_pool(
        self,
        task_type: Optional[TaskType] = None,
        priority: Optional[TaskPriority] = None,
        timeout: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
        pool_id: Optional[str] = None
    ) -> Callable:
        """
        Decorator to run a function in the thread pool
        
        Args:
            task_type: Type of task for pool selection (auto-detected if None)
            priority: Priority of the task (defaults to configured default)
            timeout: Timeout for the task in seconds (defaults to configured default)
            metadata: Additional task metadata for routing and prioritization
            pool_id: Optional ID of the specific pool to use
            
        Returns:
            Callable: Decorator function
        """
        def decorator(func):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                # Submit to thread pool
                _, future = self.submit(
                    func=func,
                    *args,
                    task_type=task_type,
                    priority=priority,
                    timeout=timeout,
                    metadata=metadata,
                    pool_id=pool_id,
                    **kwargs
                )
                
                # Wait for result
                return future.result()
            
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                # Submit to thread pool with async wait
                return await self.submit_async(
                    func=func,
                    *args,
                    task_type=task_type,
                    priority=priority,
                    timeout=timeout,
                    metadata=metadata,
                    pool_id=pool_id,
                    **kwargs
                )
            
            # Attach both versions to the wrapper
            wrapper.sync = wrapper
            wrapper.async_def = async_wrapper
            
            return wrapper
        
        return decorator
    
    async def test(self) -> Dict[str, Any]:
        """
        Run module tests
        
        Returns:
            Dict[str, Any]: Test results
        """
        logger.info("Testing Thread Pool Integration")
        
        test_results = {
            "success": False,
            "module": "thread_pool_integration",
            "steps": {},
            "diagnostics": {
                "config": self.config
            }
        }
        
        try:
            # Test 1: Task type detection
            def io_task_function():
                """This is an I/O bound task that reads from a file."""
                pass
            
            def cpu_task_function():
                """This is a CPU-intensive computation task."""
                pass
            
            def ml_inference_function():
                """This function runs machine learning inference on a model."""
                pass
            
            def ipfs_store_function():
                """This function stores data on IPFS."""
                pass
            
            detection_results = {
                "io_task": self.detect_task_type(io_task_function),
                "cpu_task": self.detect_task_type(cpu_task_function),
                "ml_task": self.detect_task_type(ml_inference_function),
                "ipfs_task": self.detect_task_type(ipfs_store_function)
            }
            
            # Check if detection worked correctly
            detection_success = (
                detection_results["io_task"] == TaskType.IO and
                detection_results["cpu_task"] == TaskType.CPU and
                detection_results["ml_task"] == TaskType.ML and
                detection_results["ipfs_task"] == TaskType.IPFS
            )
            
            test_results["steps"]["task_type_detection"] = {
                "success": detection_success,
                "message": f"Task type detection {'correctly identified' if detection_success else 'failed to identify'} task types",
                "details": {k: v.name for k, v in detection_results.items()}
            }
            
            # Test 2: Basic task submission
            def test_function(sleep_time=0.1):
                time.sleep(sleep_time)
                return f"Test completed after {sleep_time}s"
            
            task_id, future = self.submit(
                func=test_function,
                sleep_time=0.1
            )
            
            # Wait for result
            try:
                result = future.result(timeout=1.0)
                submission_success = "Test completed" in result
            except Exception as e:
                result = f"Error: {e}"
                submission_success = False
            
            test_results["steps"]["task_submission"] = {
                "success": submission_success,
                "message": f"Task submission and execution {'successful' if submission_success else 'failed'}",
                "details": {
                    "task_id": task_id,
                    "result": result
                }
            }
            
            # Test 3: Async task submission
            try:
                async_result = await self.submit_async(
                    func=test_function,
                    sleep_time=0.1
                )
                
                async_success = "Test completed" in async_result
            except Exception as e:
                async_result = f"Error: {e}"
                async_success = False
            
            test_results["steps"]["async_submission"] = {
                "success": async_success,
                "message": f"Async task submission {'successful' if async_success else 'failed'}",
                "details": {
                    "result": async_result
                }
            }
            
            # Test 4: Task cancellation
            def long_running_task():
                time.sleep(10)
                return "This should be cancelled"
            
            cancel_task_id, cancel_future = self.submit(
                func=long_running_task
            )
            
            # Cancel the task
            cancel_success = self.cancel_task(cancel_task_id)
            
            test_results["steps"]["task_cancellation"] = {
                "success": cancel_success,
                "message": f"Task cancellation {'successful' if cancel_success else 'failed'}",
                "details": {
                    "task_id": cancel_task_id
                }
            }
            
            # Test 5: Decorator usage
            @self.thread_pool(priority=TaskPriority.HIGH)
            def decorated_task(value):
                time.sleep(0.1)
                return f"Decorated task with value {value}"
            
            # Execute the decorated function
            try:
                decorator_result = decorated_task(42)
                decorator_success = "Decorated task with value 42" in decorator_result
            except Exception as e:
                decorator_result = f"Error: {e}"
                decorator_success = False
            
            test_results["steps"]["decorator_usage"] = {
                "success": decorator_success,
                "message": f"Decorator usage {'successful' if decorator_success else 'failed'}",
                "details": {
                    "result": decorator_result
                }
            }
            
            # Test 6: Async decorator usage
            try:
                async_decorator_result = await decorated_task.async_def(84)
                async_decorator_success = "Decorated task with value 84" in async_decorator_result
            except Exception as e:
                async_decorator_result = f"Error: {e}"
                async_decorator_success = False
            
            test_results["steps"]["async_decorator_usage"] = {
                "success": async_decorator_success,
                "message": f"Async decorator usage {'successful' if async_decorator_success else 'failed'}",
                "details": {
                    "result": async_decorator_result
                }
            }
            
            # Test 7: Task history and status tracking
            history_task_id, history_future = self.submit(
                func=test_function,
                sleep_time=0.1
            )
            
            # Wait for result
            try:
                history_future.result(timeout=1.0)
            except Exception:
                pass
            
            # Check status and result
            status = self.get_task_status(history_task_id)
            result = self.get_task_result(history_task_id)
            
            history_success = (
                status == TaskState.COMPLETED.name and
                result is not None and
                "Test completed" in result
            )
            
            test_results["steps"]["task_history"] = {
                "success": history_success,
                "message": f"Task history tracking {'successful' if history_success else 'failed'}",
                "details": {
                    "task_id": history_task_id,
                    "status": status,
                    "has_result": result is not None
                }
            }
            
            # Test 8: Statistics and health reporting
            try:
                stats = self.get_stats()
                health_report = self.get_health_report()
                recommendations = self.get_optimization_recommendations()
                
                reporting_success = (
                    "task_history" in stats and
                    "status" in health_report
                )
            except Exception as e:
                stats = {"error": str(e)}
                health_report = {"error": str(e)}
                recommendations = {"error": str(e)}
                reporting_success = False
            
            test_results["steps"]["statistics"] = {
                "success": reporting_success,
                "message": f"Statistics and health reporting {'successful' if reporting_success else 'failed'}",
                "details": {
                    "has_stats": "task_history" in stats,
                    "has_health": "status" in health_report,
                    "has_recommendations": len(recommendations) > 0
                }
            }
            
            # Test 9: Run manager and monitor tests
            manager_test = await self.pool_manager.test()
            monitor_test = await self.pool_monitor.test()
            
            test_results["steps"]["manager_test"] = {
                "success": manager_test["success"],
                "message": f"Thread pool manager test {'successful' if manager_test['success'] else 'failed'}"
            }
            
            test_results["steps"]["monitor_test"] = {
                "success": monitor_test["success"],
                "message": f"Thread pool monitor test {'successful' if monitor_test['success'] else 'failed'}"
            }
            
            # Overall success
            test_results["success"] = all(step["success"] for step in test_results["steps"].values())
            
            # Add diagnostics
            test_results["diagnostics"]["stats"] = stats
            test_results["diagnostics"]["health_report"] = health_report
            test_results["diagnostics"]["recommendations"] = recommendations
            
            return test_results
        
        except Exception as e:
            logger.error(f"Error in Thread Pool Integration test: {e}")
            test_results["success"] = False
            test_results["error"] = str(e)
            return test_results


# Example usage
if __name__ == "__main__":
    import asyncio
    
    async def main():
        # Create thread pool integration
        pool_integration = ThreadPoolIntegration(
            metadata={
                "use_advanced_pools": True,
                "automatic_task_type": True,
                "auto_start_monitor": True
            }
        )
        
        try:
            # Define some test functions
            def cpu_intensive_task(iterations):
                """CPU-bound computation task"""
                result = 0
                for i in range(iterations):
                    result += i
                return result
            
            def io_bound_task(sleep_time):
                """I/O-bound task that simulates file/network operations"""
                time.sleep(sleep_time)
                return f"Completed I/O task after {sleep_time}s"
            
            def database_query_task(query_time):
                """Database query task"""
                time.sleep(query_time)  # Simulate query execution
                return {"rows": 10, "query_time": query_time}
            
            # Detect task types
            print("Detected task types:")
            print(f"- CPU task: {pool_integration.detect_task_type(cpu_intensive_task).name}")
            print(f"- IO task: {pool_integration.detect_task_type(io_bound_task).name}")
            print(f"- DB task: {pool_integration.detect_task_type(database_query_task).name}")
            
            # Submit tasks
            print("\nSubmitting tasks...")
            
            # CPU task with normal priority
            cpu_id, cpu_future = pool_integration.submit(
                func=cpu_intensive_task,
                iterations=10000000,  # 10M iterations
                priority=TaskPriority.NORMAL
            )
            
            # I/O task with high priority
            io_id, io_future = pool_integration.submit(
                func=io_bound_task,
                sleep_time=0.5,
                priority=TaskPriority.HIGH
            )
            
            # DB task with critical priority
            db_id, db_future = pool_integration.submit(
                func=database_query_task,
                query_time=0.3,
                priority=TaskPriority.CRITICAL
            )
            
            # Wait for results
            cpu_result = await asyncio.wrap_future(cpu_future)
            io_result = await asyncio.wrap_future(io_future)
            db_result = await asyncio.wrap_future(db_future)
            
            print("\nTask results:")
            print(f"- CPU task: {cpu_result}")
            print(f"- I/O task: {io_result}")
            print(f"- DB task: {db_result}")
            
            # Use async submission
            print("\nUsing async submission...")
            async_result = await pool_integration.submit_async(
                func=io_bound_task,
                sleep_time=0.2
            )
            print(f"Async result: {async_result}")
            
            # Use decorator
            print("\nUsing thread pool decorator...")
            
            @pool_integration.thread_pool(priority=TaskPriority.HIGH)
            def decorated_function(value):
                time.sleep(0.1)
                return f"Decorated result: {value}"
            
            # Call decorated function
            sync_result = decorated_function(42)
            print(f"Sync decorated result: {sync_result}")
            
            # Call async version
            async_dec_result = await decorated_function.async_def(84)
            print(f"Async decorated result: {async_dec_result}")
            
            # Get stats
            stats = pool_integration.get_stats()
            print("\nThread pool stats:")
            print(f"- Total tasks: {stats['tasks']['submitted']}")
            print(f"- Completed: {stats['tasks']['completed']}")
            print(f"- Task history: {stats['task_history']['total']} tasks with {stats['task_history']['success_rate']:.1%} success rate")
            
            # Get health report
            health = pool_integration.get_health_report()
            print("\nHealth report:")
            print(f"- Status: {health['status']}")
            if health['issues']:
                print(f"- Issues: {health['issues']}")
            
            # Run tests
            print("\nRunning integrated tests...")
            test_results = await pool_integration.test()
            print(f"Test success: {test_results['success']}")
            
            for step, result in test_results["steps"].items():
                print(f"- {step}: {result['success']} - {result['message']}")
        
        finally:
            # Shutdown
            pool_integration.shutdown()
    
    # Run the example
    asyncio.run(main())