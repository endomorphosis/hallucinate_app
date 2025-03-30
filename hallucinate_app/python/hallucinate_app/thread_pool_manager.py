"""
Thread Pool Manager for Parallel Processing

This module implements a thread pool management system that allows for
creating and managing multiple thread pools for different types of workloads.
It provides features for task prioritization, dynamic scaling, and monitoring.

Key features:
- Multiple thread pools with different configurations
- Task assignment based on workload type
- Dynamic scaling of pool sizes based on load
- Task prioritization and cancellation
- Monitoring and statistics collection
- Resource usage tracking and limits
"""

import os
import time
import uuid
import logging
import threading
import multiprocessing
from queue import Queue, PriorityQueue, Empty
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Union, Tuple, Callable, TypeVar, Generic
from enum import Enum, auto
from concurrent.futures import ThreadPoolExecutor, Future, wait, FIRST_COMPLETED

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Type definitions
T = TypeVar('T')  # Task type
R = TypeVar('R')  # Result type


class TaskPriority(Enum):
    """Priority levels for tasks"""
    LOW = auto()
    NORMAL = auto()
    HIGH = auto()
    CRITICAL = auto()
    
    def to_numeric(self) -> int:
        """Convert priority to numeric value (lower is higher priority)"""
        priority_map = {
            TaskPriority.CRITICAL: 0,
            TaskPriority.HIGH: 1,
            TaskPriority.NORMAL: 2,
            TaskPriority.LOW: 3
        }
        return priority_map[self]


class TaskType(Enum):
    """Types of tasks for specialized thread pools"""
    GENERAL = auto()      # General-purpose tasks
    IO = auto()           # I/O-bound tasks (network, disk)
    CPU = auto()          # CPU-bound computation
    ML = auto()           # Machine learning operations
    IPFS = auto()         # IPFS operations
    DATABASE = auto()     # Database operations
    SECURITY = auto()     # Security/crypto operations


class TaskState(Enum):
    """States of a task in the system"""
    PENDING = auto()      # Task is in queue, not yet started
    RUNNING = auto()      # Task is currently running
    COMPLETED = auto()    # Task completed successfully
    FAILED = auto()       # Task failed with an exception
    CANCELLED = auto()    # Task was cancelled before completion
    TIMEOUT = auto()      # Task timed out


@dataclass(order=True)
class PrioritizedTask(Generic[T, R]):
    """A task with priority information"""
    priority: int  # Lower number means higher priority
    task_id: str = field(compare=False)
    task_type: TaskType = field(compare=False)
    function: Callable[..., R] = field(compare=False)
    args: tuple = field(default_factory=tuple, compare=False)
    kwargs: dict = field(default_factory=dict, compare=False)
    created_at: float = field(default_factory=time.time, compare=False)
    timeout: Optional[float] = field(default=None, compare=False)
    state: TaskState = field(default=TaskState.PENDING, compare=False)
    result: Optional[R] = field(default=None, compare=False)
    exception: Optional[Exception] = field(default=None, compare=False)
    future: Optional[Future] = field(default=None, compare=False)
    
    @property
    def runtime(self) -> Optional[float]:
        """Get the runtime of the task if completed"""
        if self.state in (TaskState.COMPLETED, TaskState.FAILED, TaskState.CANCELLED):
            return time.time() - self.created_at
        return None


class ThreadPoolStats:
    """Statistics for a thread pool"""
    
    def __init__(self, pool_id: str, pool_type: TaskType):
        self.pool_id = pool_id
        self.pool_type = pool_type
        self.created_at = time.time()
        
        # Task counters
        self.tasks_submitted = 0
        self.tasks_completed = 0
        self.tasks_failed = 0
        self.tasks_cancelled = 0
        self.tasks_pending = 0
        self.tasks_running = 0
        
        # Performance metrics
        self.total_runtime = 0.0
        self.min_runtime = float('inf')
        self.max_runtime = 0.0
        self.avg_runtime = 0.0
        
        # Resource usage
        self.worker_count = 0
        self.active_workers = 0
        self.queue_size = 0
        self.peak_queue_size = 0
        self.peak_active_workers = 0
        
        # Locks for thread safety
        self._lock = threading.RLock()
    
    def update_task_submitted(self):
        """Update stats when a task is submitted"""
        with self._lock:
            self.tasks_submitted += 1
            self.tasks_pending += 1
            self.queue_size += 1
            self.peak_queue_size = max(self.peak_queue_size, self.queue_size)
    
    def update_task_started(self):
        """Update stats when a task starts running"""
        with self._lock:
            self.tasks_pending -= 1
            self.tasks_running += 1
            self.queue_size -= 1
            self.active_workers += 1
            self.peak_active_workers = max(self.peak_active_workers, self.active_workers)
    
    def update_task_completed(self, runtime: float, success: bool = True):
        """Update stats when a task completes"""
        with self._lock:
            self.tasks_running -= 1
            self.active_workers -= 1
            
            if success:
                self.tasks_completed += 1
                self.total_runtime += runtime
                self.min_runtime = min(self.min_runtime, runtime)
                self.max_runtime = max(self.max_runtime, runtime)
                self.avg_runtime = self.total_runtime / self.tasks_completed
            else:
                self.tasks_failed += 1
    
    def update_task_cancelled(self):
        """Update stats when a task is cancelled"""
        with self._lock:
            self.tasks_cancelled += 1
            self.tasks_pending -= 1
            self.queue_size -= 1
    
    def update_worker_count(self, count: int):
        """Update the worker count"""
        with self._lock:
            self.worker_count = count
    
    def get_snapshot(self) -> Dict[str, Any]:
        """Get a snapshot of the stats"""
        with self._lock:
            return {
                "pool_id": self.pool_id,
                "pool_type": self.pool_type.name,
                "uptime": time.time() - self.created_at,
                "tasks": {
                    "submitted": self.tasks_submitted,
                    "completed": self.tasks_completed,
                    "failed": self.tasks_failed,
                    "cancelled": self.tasks_cancelled,
                    "pending": self.tasks_pending,
                    "running": self.tasks_running,
                },
                "performance": {
                    "avg_runtime": self.avg_runtime,
                    "min_runtime": self.min_runtime if self.min_runtime != float('inf') else None,
                    "max_runtime": self.max_runtime,
                    "total_runtime": self.total_runtime,
                },
                "resources": {
                    "worker_count": self.worker_count,
                    "active_workers": self.active_workers,
                    "queue_size": self.queue_size,
                    "peak_queue_size": self.peak_queue_size,
                    "peak_active_workers": self.peak_active_workers,
                    "utilization": self.active_workers / self.worker_count if self.worker_count > 0 else 0,
                }
            }


class ManagedThreadPool:
    """
    A managed thread pool with priority queue and statistics
    """
    
    def __init__(
        self, 
        pool_id: str,
        pool_type: TaskType,
        min_workers: int = 1,
        max_workers: int = None,
        worker_timeout: int = 60,
        task_timeout: int = None,
        manager = None
    ):
        """
        Initialize a managed thread pool
        
        Args:
            pool_id: Unique identifier for the pool
            pool_type: Type of tasks this pool handles
            min_workers: Minimum number of worker threads
            max_workers: Maximum number of worker threads (None = no limit)
            worker_timeout: Seconds a worker can be idle before termination
            task_timeout: Default timeout for tasks in seconds (None = no timeout)
            manager: Reference to the parent ThreadPoolManager
        """
        self.pool_id = pool_id
        self.pool_type = pool_type
        self.min_workers = min_workers
        self.max_workers = max_workers or (multiprocessing.cpu_count() * 2)
        self.worker_timeout = worker_timeout
        self.task_timeout = task_timeout
        self.manager = manager
        
        # Task queues
        self.task_queue = PriorityQueue()
        self.active_tasks: Dict[str, PrioritizedTask] = {}
        
        # Thread pool
        self.executor = ThreadPoolExecutor(
            max_workers=self.min_workers,
            thread_name_prefix=f"pool-{pool_id}"
        )
        self.current_worker_count = self.min_workers
        
        # Statistics
        self.stats = ThreadPoolStats(pool_id, pool_type)
        self.stats.update_worker_count(self.current_worker_count)
        
        # Control flags
        self.running = True
        self.scaling_lock = threading.RLock()
        
        # Start the scheduler thread
        self.scheduler_thread = threading.Thread(
            target=self._task_scheduler,
            name=f"scheduler-{pool_id}",
            daemon=True
        )
        self.scheduler_thread.start()
        
        # Start the scaling thread
        self.scaling_thread = threading.Thread(
            target=self._auto_scale,
            name=f"scaler-{pool_id}",
            daemon=True
        )
        self.scaling_thread.start()
        
        logger.info(f"Created managed thread pool {pool_id} for {pool_type.name} tasks " 
                   f"with {min_workers}-{max_workers} workers")
    
    def submit(
        self, 
        function: Callable[..., R],
        *args,
        priority: TaskPriority = TaskPriority.NORMAL,
        timeout: Optional[float] = None,
        **kwargs
    ) -> Tuple[str, Future]:
        """
        Submit a task to the thread pool
        
        Args:
            function: The function to execute
            *args: Arguments to pass to the function
            priority: Priority of the task
            timeout: Timeout for the task in seconds (overrides pool default if set)
            **kwargs: Keyword arguments to pass to the function
            
        Returns:
            Tuple[str, Future]: Task ID and Future object for the task
        """
        if not self.running:
            raise RuntimeError(f"Thread pool {self.pool_id} is shutting down")
        
        task_id = str(uuid.uuid4())
        task_timeout = timeout if timeout is not None else self.task_timeout
        
        task = PrioritizedTask(
            priority=priority.to_numeric(),
            task_id=task_id,
            task_type=self.pool_type,
            function=function,
            args=args,
            kwargs=kwargs,
            timeout=task_timeout
        )
        
        # Update stats
        self.stats.update_task_submitted()
        
        # Add to queue
        self.task_queue.put(task)
        
        # Create a future to track the task
        future = Future()
        task.future = future
        
        # Store in active tasks
        self.active_tasks[task_id] = task
        
        return task_id, future
    
    def _task_scheduler(self):
        """Task scheduler thread function"""
        while self.running:
            try:
                # Get the next task
                try:
                    task = self.task_queue.get(timeout=1.0)
                except Empty:
                    continue
                
                # Skip cancelled tasks
                if task.state == TaskState.CANCELLED:
                    self.task_queue.task_done()
                    continue
                
                # Update stats
                self.stats.update_task_started()
                
                # Update task state
                task.state = TaskState.RUNNING
                start_time = time.time()
                
                # Define the wrapper function that handles task execution
                def task_wrapper():
                    try:
                        # Execute the task
                        result = task.function(*task.args, **task.kwargs)
                        
                        # Store the result
                        task.result = result
                        task.state = TaskState.COMPLETED
                        
                        # Set the future result
                        if not task.future.done():
                            task.future.set_result(result)
                        
                        # Update stats
                        runtime = time.time() - start_time
                        self.stats.update_task_completed(runtime, success=True)
                        
                        # Log completion
                        logger.debug(f"Task {task.task_id} completed in {runtime:.3f}s")
                    except Exception as e:
                        # Store the exception
                        task.exception = e
                        task.state = TaskState.FAILED
                        
                        # Set the future exception
                        if not task.future.done():
                            task.future.set_exception(e)
                        
                        # Update stats
                        runtime = time.time() - start_time
                        self.stats.update_task_completed(runtime, success=False)
                        
                        # Log error
                        logger.error(f"Task {task.task_id} failed: {e}")
                    finally:
                        # Clean up
                        self.task_queue.task_done()
                        if task.task_id in self.active_tasks:
                            del self.active_tasks[task.task_id]
                
                # Submit the task to the executor
                future = self.executor.submit(task_wrapper)
                
                # Set up timeout if specified
                if task.timeout:
                    def timeout_callback():
                        if task.state == TaskState.RUNNING and not future.done():
                            if task.task_id in self.active_tasks:
                                # Cancel the future if possible
                                future.cancel()
                                # Update task state
                                task.state = TaskState.TIMEOUT
                                # Set future exception
                                if not task.future.done():
                                    task.future.set_exception(TimeoutError(f"Task timed out after {task.timeout}s"))
                                # Update stats
                                runtime = time.time() - start_time
                                self.stats.update_task_completed(runtime, success=False)
                                # Log timeout
                                logger.warning(f"Task {task.task_id} timed out after {task.timeout}s")
                    
                    # Schedule the timeout callback
                    timeout_thread = threading.Timer(task.timeout, timeout_callback)
                    timeout_thread.daemon = True
                    timeout_thread.start()
            
            except Exception as e:
                logger.error(f"Error in task scheduler for pool {self.pool_id}: {e}")
    
    def _auto_scale(self):
        """Auto-scaling thread function"""
        while self.running:
            try:
                # Check every 5 seconds
                time.sleep(5)
                
                with self.scaling_lock:
                    # Get current stats
                    pending_tasks = self.stats.tasks_pending
                    active_workers = self.stats.active_workers
                    current_workers = self.current_worker_count
                    
                    # Scale up if there are pending tasks and we're below max_workers
                    if pending_tasks > 0 and current_workers < self.max_workers:
                        # Scale up to handle pending tasks, but don't exceed max_workers
                        new_workers = min(current_workers + pending_tasks, self.max_workers)
                        workers_to_add = new_workers - current_workers
                        
                        if workers_to_add > 0:
                            logger.info(f"Scaling up pool {self.pool_id} from {current_workers} "
                                      f"to {new_workers} workers due to {pending_tasks} pending tasks")
                            
                            # Create a new executor with the increased worker count
                            new_executor = ThreadPoolExecutor(
                                max_workers=new_workers,
                                thread_name_prefix=f"pool-{self.pool_id}"
                            )
                            
                            # Replace the existing executor (old tasks continue in the old executor)
                            self.executor = new_executor
                            self.current_worker_count = new_workers
                            self.stats.update_worker_count(new_workers)
                    
                    # Scale down if we have idle workers and we're above min_workers
                    elif current_workers > self.min_workers:
                        # Calculate idle workers
                        idle_workers = current_workers - active_workers
                        
                        # Only scale down if we have significant idle capacity
                        if idle_workers > max(2, current_workers // 4):
                            # Scale down but maintain min_workers and some buffer
                            new_workers = max(self.min_workers, active_workers + 2)
                            
                            if new_workers < current_workers:
                                logger.info(f"Scaling down pool {self.pool_id} from {current_workers} "
                                          f"to {new_workers} workers due to {idle_workers} idle workers")
                                
                                # Create a new executor with the decreased worker count
                                new_executor = ThreadPoolExecutor(
                                    max_workers=new_workers,
                                    thread_name_prefix=f"pool-{self.pool_id}"
                                )
                                
                                # Replace the existing executor
                                self.executor = new_executor
                                self.current_worker_count = new_workers
                                self.stats.update_worker_count(new_workers)
            
            except Exception as e:
                logger.error(f"Error in auto-scaling for pool {self.pool_id}: {e}")
    
    def shutdown(self, wait: bool = True):
        """
        Shutdown the thread pool
        
        Args:
            wait: If True, wait for tasks to complete before shutting down
        """
        self.running = False
        self.executor.shutdown(wait=wait)
        
        if wait:
            logger.info(f"Thread pool {self.pool_id} shut down gracefully")
        else:
            logger.info(f"Thread pool {self.pool_id} shut down without waiting for tasks")
    
    def cancel_task(self, task_id: str) -> bool:
        """
        Cancel a task by ID
        
        Args:
            task_id: ID of the task to cancel
            
        Returns:
            bool: True if the task was cancelled, False if not found
        """
        if task_id in self.active_tasks:
            task = self.active_tasks[task_id]
            
            # Cancel the future if it exists
            if task.future and not task.future.done():
                task.future.cancel()
            
            # Update task state
            old_state = task.state
            task.state = TaskState.CANCELLED
            
            # Update stats if the task was pending
            if old_state == TaskState.PENDING:
                self.stats.update_task_cancelled()
            
            # Remove from active tasks
            del self.active_tasks[task_id]
            
            logger.info(f"Cancelled task {task_id} in pool {self.pool_id}")
            return True
        
        return False
    
    def get_stats(self) -> Dict[str, Any]:
        """Get pool statistics"""
        return self.stats.get_snapshot()


class ThreadPoolManager:
    """
    Manager for multiple thread pools with different configurations
    
    This class manages multiple thread pools, each configured for different
    types of workloads. It routes tasks to the appropriate pool based on
    task type and provides a unified interface for task submission and
    monitoring.
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the Thread Pool Manager
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Configuration
        self.config = {
            "default_min_workers": self.metadata.get("default_min_workers", 1),
            "default_max_workers": self.metadata.get("default_max_workers", multiprocessing.cpu_count() * 2),
            "worker_timeout": self.metadata.get("worker_timeout", 60),
            "task_timeout": self.metadata.get("task_timeout", None),
            "auto_create_pools": self.metadata.get("auto_create_pools", True)
        }
        
        # Thread pools by type
        self.pools: Dict[TaskType, ManagedThreadPool] = {}
        
        # Thread pools by ID
        self.pools_by_id: Dict[str, ManagedThreadPool] = {}
        
        # Lock for thread safety
        self.lock = threading.RLock()
        
        # Create default pools for each task type if configured
        if self.config["auto_create_pools"]:
            self._create_default_pools()
        
        logger.info(f"ThreadPoolManager initialized with config: {self.config}")
    
    def _create_default_pools(self):
        """Create default pools for each task type"""
        with self.lock:
            # Create general-purpose pool with balanced configuration
            self.create_pool(
                pool_id="general",
                pool_type=TaskType.GENERAL,
                min_workers=self.config["default_min_workers"],
                max_workers=self.config["default_max_workers"]
            )
            
            # Create I/O-bound pool with more workers (I/O operations block, but are not CPU intensive)
            io_max_workers = self.config["default_max_workers"] * 2  # More workers for I/O
            self.create_pool(
                pool_id="io",
                pool_type=TaskType.IO,
                min_workers=self.config["default_min_workers"],
                max_workers=io_max_workers
            )
            
            # Create CPU-bound pool with worker count based on CPU cores
            cpu_max_workers = max(1, multiprocessing.cpu_count())  # One per CPU core
            self.create_pool(
                pool_id="cpu",
                pool_type=TaskType.CPU,
                min_workers=min(self.config["default_min_workers"], cpu_max_workers),
                max_workers=cpu_max_workers
            )
            
            # Create ML pool with worker count based on GPU availability or CPU cores
            try:
                # Try to detect GPUs with torch
                import torch
                gpu_count = torch.cuda.device_count() if torch.cuda.is_available() else 0
            except (ImportError, AttributeError):
                gpu_count = 0
            
            ml_max_workers = max(1, gpu_count if gpu_count > 0 else cpu_max_workers // 2)
            self.create_pool(
                pool_id="ml",
                pool_type=TaskType.ML,
                min_workers=min(self.config["default_min_workers"], ml_max_workers),
                max_workers=ml_max_workers
            )
            
            # Create IPFS pool (network I/O intensive)
            self.create_pool(
                pool_id="ipfs",
                pool_type=TaskType.IPFS,
                min_workers=self.config["default_min_workers"],
                max_workers=io_max_workers  # Same as regular I/O pool
            )
            
            # Create database pool (mixed I/O and CPU)
            db_max_workers = max(1, multiprocessing.cpu_count() + 2)  # Slightly more than CPU count
            self.create_pool(
                pool_id="database",
                pool_type=TaskType.DATABASE,
                min_workers=self.config["default_min_workers"],
                max_workers=db_max_workers
            )
            
            # Create security pool (CPU-intensive but potentially blocking)
            self.create_pool(
                pool_id="security",
                pool_type=TaskType.SECURITY,
                min_workers=self.config["default_min_workers"],
                max_workers=cpu_max_workers
            )
            
            logger.info(f"Created default thread pools for all task types")
    
    def create_pool(
        self,
        pool_id: str,
        pool_type: TaskType,
        min_workers: int = None,
        max_workers: int = None,
        worker_timeout: int = None,
        task_timeout: int = None
    ) -> ManagedThreadPool:
        """
        Create a new thread pool
        
        Args:
            pool_id: Unique identifier for the pool
            pool_type: Type of tasks this pool handles
            min_workers: Minimum number of worker threads
            max_workers: Maximum number of worker threads
            worker_timeout: Seconds a worker can be idle before termination
            task_timeout: Default timeout for tasks in seconds
            
        Returns:
            ManagedThreadPool: The created thread pool
        """
        with self.lock:
            # Use default values if not specified
            min_workers = min_workers if min_workers is not None else self.config["default_min_workers"]
            max_workers = max_workers if max_workers is not None else self.config["default_max_workers"]
            worker_timeout = worker_timeout if worker_timeout is not None else self.config["worker_timeout"]
            task_timeout = task_timeout if task_timeout is not None else self.config["task_timeout"]
            
            # Create the pool
            pool = ManagedThreadPool(
                pool_id=pool_id,
                pool_type=pool_type,
                min_workers=min_workers,
                max_workers=max_workers,
                worker_timeout=worker_timeout,
                task_timeout=task_timeout,
                manager=self
            )
            
            # Store the pool
            self.pools_by_id[pool_id] = pool
            self.pools[pool_type] = pool
            
            return pool
    
    def get_pool(self, pool_type: TaskType) -> ManagedThreadPool:
        """
        Get a thread pool for the specified task type
        
        Args:
            pool_type: Type of tasks to handle
            
        Returns:
            ManagedThreadPool: The thread pool for the specified type
        """
        with self.lock:
            if pool_type not in self.pools:
                if self.config["auto_create_pools"]:
                    # Auto-create a pool for this type
                    pool_id = pool_type.name.lower()
                    return self.create_pool(
                        pool_id=pool_id,
                        pool_type=pool_type
                    )
                else:
                    # Fall back to the general pool
                    if TaskType.GENERAL not in self.pools:
                        self.create_pool(
                            pool_id="general",
                            pool_type=TaskType.GENERAL
                        )
                    return self.pools[TaskType.GENERAL]
            
            return self.pools[pool_type]
    
    def get_pool_by_id(self, pool_id: str) -> Optional[ManagedThreadPool]:
        """
        Get a thread pool by ID
        
        Args:
            pool_id: ID of the pool to get
            
        Returns:
            Optional[ManagedThreadPool]: The thread pool with the specified ID
        """
        with self.lock:
            return self.pools_by_id.get(pool_id)
    
    def submit(
        self,
        function: Callable[..., R],
        *args,
        task_type: TaskType = TaskType.GENERAL,
        priority: TaskPriority = TaskPriority.NORMAL,
        timeout: Optional[float] = None,
        **kwargs
    ) -> Tuple[str, Future]:
        """
        Submit a task to the appropriate thread pool
        
        Args:
            function: The function to execute
            *args: Arguments to pass to the function
            task_type: Type of task for pool selection
            priority: Priority of the task
            timeout: Timeout for the task in seconds
            **kwargs: Keyword arguments to pass to the function
            
        Returns:
            Tuple[str, Future]: Task ID and Future object for the task
        """
        pool = self.get_pool(task_type)
        return pool.submit(
            function=function,
            *args,
            priority=priority,
            timeout=timeout,
            **kwargs
        )
    
    def cancel_task(self, task_id: str, pool_id: Optional[str] = None) -> bool:
        """
        Cancel a task by ID
        
        Args:
            task_id: ID of the task to cancel
            pool_id: Optional ID of the pool containing the task
            
        Returns:
            bool: True if the task was cancelled, False if not found
        """
        with self.lock:
            if pool_id and pool_id in self.pools_by_id:
                # Cancel in the specified pool
                return self.pools_by_id[pool_id].cancel_task(task_id)
            else:
                # Try all pools
                for pool in self.pools_by_id.values():
                    if pool.cancel_task(task_id):
                        return True
                
                return False
    
    def shutdown(self, wait: bool = True):
        """
        Shutdown all thread pools
        
        Args:
            wait: If True, wait for tasks to complete before shutting down
        """
        with self.lock:
            for pool in self.pools_by_id.values():
                pool.shutdown(wait=wait)
            
            self.pools.clear()
            self.pools_by_id.clear()
            
            logger.info(f"Thread Pool Manager shut down" + 
                       (" gracefully" if wait else " without waiting for tasks"))
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics for all pools"""
        with self.lock:
            return {
                "pools": {pool_id: pool.get_stats() for pool_id, pool in self.pools_by_id.items()},
                "total_pools": len(self.pools_by_id),
                "tasks": {
                    "submitted": sum(pool.stats.tasks_submitted for pool in self.pools_by_id.values()),
                    "completed": sum(pool.stats.tasks_completed for pool in self.pools_by_id.values()),
                    "failed": sum(pool.stats.tasks_failed for pool in self.pools_by_id.values()),
                    "cancelled": sum(pool.stats.tasks_cancelled for pool in self.pools_by_id.values()),
                    "pending": sum(pool.stats.tasks_pending for pool in self.pools_by_id.values()),
                    "running": sum(pool.stats.tasks_running for pool in self.pools_by_id.values()),
                },
                "workers": {
                    "total": sum(pool.current_worker_count for pool in self.pools_by_id.values()),
                    "active": sum(pool.stats.active_workers for pool in self.pools_by_id.values()),
                }
            }
    
    async def test(self) -> Dict[str, Any]:
        """
        Run module tests
        
        Returns:
            Dict[str, Any]: Test results
        """
        logger.info("Testing Thread Pool Manager")
        
        test_results = {
            "success": False,
            "module": "thread_pool_manager",
            "steps": {},
            "diagnostics": {
                "config": self.config,
                "pools": {pool_id: pool.get_stats() for pool_id, pool in self.pools_by_id.items()},
            }
        }
        
        try:
            # Test 1: Submit a simple task to each pool type
            test_results["steps"]["create_pools"] = {
                "success": len(self.pools) > 0,
                "message": f"Created {len(self.pools)} pools"
            }
            
            if len(self.pools) == 0:
                test_results["success"] = False
                return test_results
            
            # Define a test function
            def test_function(pool_type, sleep_time=0.1):
                time.sleep(sleep_time)  # Simulate some work
                return f"Test result from {pool_type.name}"
            
            # Submit tasks to each pool
            futures = []
            task_ids = []
            
            for pool_type in self.pools.keys():
                task_id, future = self.submit(
                    function=test_function,
                    pool_type=pool_type,
                    sleep_time=0.1,
                    task_type=pool_type,
                    priority=TaskPriority.NORMAL
                )
                futures.append(future)
                task_ids.append(task_id)
            
            # Wait for all tasks to complete
            import concurrent.futures
            results = list(concurrent.futures.as_completed(futures))
            
            # Check results
            all_completed = all(future.done() for future in futures)
            
            test_results["steps"]["submit_tasks"] = {
                "success": all_completed,
                "message": f"Submitted and completed {len(futures)} tasks"
            }
            
            if not all_completed:
                test_results["success"] = False
                return test_results
            
            # Test 2: Priority ordering
            # Submit multiple tasks with different priorities to one pool
            test_pool = self.get_pool(TaskType.GENERAL)
            
            priorities = [
                TaskPriority.LOW,
                TaskPriority.NORMAL,
                TaskPriority.HIGH,
                TaskPriority.CRITICAL
            ]
            
            # Use a shared result list to verify execution order
            result_list = []
            
            def priority_test_function(priority_name):
                # Add to result list
                result_list.append(priority_name)
                time.sleep(0.1)  # Ensure all tasks are submitted before any completes
                return priority_name
            
            # Submit tasks in reverse priority order (low priority first)
            priority_futures = []
            
            for priority in reversed(priorities):
                _, future = test_pool.submit(
                    function=priority_test_function,
                    priority=priority,
                    priority_name=priority.name
                )
                priority_futures.append(future)
            
            # Wait for all priority tasks to complete
            priority_results = list(concurrent.futures.as_completed(priority_futures))
            
            # Check if results were in priority order
            expected_order = [p.name for p in priorities]
            actual_order = result_list
            
            priority_test_success = actual_order == expected_order
            
            test_results["steps"]["priority_ordering"] = {
                "success": priority_test_success,
                "message": f"Priority ordering {'correct' if priority_test_success else 'incorrect'}",
                "details": {
                    "expected_order": expected_order,
                    "actual_order": actual_order
                }
            }
            
            # Test 3: Cancellation
            cancel_task_id, cancel_future = self.submit(
                function=lambda: time.sleep(10),  # Long-running task
                task_type=TaskType.GENERAL
            )
            
            # Cancel the task
            cancel_success = self.cancel_task(cancel_task_id)
            
            test_results["steps"]["task_cancellation"] = {
                "success": cancel_success,
                "message": f"Task cancellation {'successful' if cancel_success else 'failed'}"
            }
            
            # Test 4: Task timeout
            try:
                timeout_task_id, timeout_future = self.submit(
                    function=lambda: time.sleep(5),  # Long-running task
                    task_type=TaskType.GENERAL,
                    timeout=0.1  # Short timeout
                )
                
                # Wait for the timeout
                try:
                    timeout_future.result(timeout=1.0)  # Should timeout and raise an exception
                    timeout_success = False
                except (TimeoutError, concurrent.futures.TimeoutError):
                    timeout_success = True
            except Exception as e:
                logger.error(f"Error in timeout test: {e}")
                timeout_success = False
            
            test_results["steps"]["task_timeout"] = {
                "success": timeout_success,
                "message": f"Task timeout {'worked correctly' if timeout_success else 'failed'}"
            }
            
            # Test 5: Auto-scaling
            # Submit many tasks to trigger scaling up
            scale_pool = self.get_pool(TaskType.IO)
            initial_workers = scale_pool.current_worker_count
            
            # Submit 20 tasks that each sleep for 0.5 seconds
            scale_futures = []
            for i in range(20):
                _, future = scale_pool.submit(
                    function=lambda: time.sleep(0.5),
                    priority=TaskPriority.NORMAL
                )
                scale_futures.append(future)
            
            # Wait a bit for scaling to occur
            time.sleep(0.5)
            
            # Check if the pool scaled up
            scaled_workers = scale_pool.current_worker_count
            scaled_up = scaled_workers > initial_workers
            
            test_results["steps"]["auto_scaling"] = {
                "success": scaled_up,
                "message": f"Pool scaled from {initial_workers} to {scaled_workers} workers",
                "details": {
                    "initial_workers": initial_workers,
                    "scaled_workers": scaled_workers
                }
            }
            
            # Wait for all tasks to complete
            for future in scale_futures:
                try:
                    future.result(timeout=2.0)
                except Exception:
                    pass
            
            # Overall success
            test_results["success"] = all(step["success"] for step in test_results["steps"].values())
            
            return test_results
        except Exception as e:
            logger.error(f"Error in Thread Pool Manager test: {e}")
            test_results["success"] = False
            test_results["error"] = str(e)
            return test_results


# Example usage
if __name__ == "__main__":
    import time
    import asyncio
    
    # Create a thread pool manager
    manager = ThreadPoolManager(metadata={"auto_create_pools": True})
    
    # Define some test functions
    def cpu_task(n):
        """CPU-bound task"""
        result = 0
        for i in range(n):
            result += i
        return result
    
    def io_task(sleep_time):
        """I/O-bound task"""
        time.sleep(sleep_time)
        return f"Slept for {sleep_time}s"
    
    async def test_manager():
        try:
            # Submit some tasks
            task_ids_futures = []
            
            # CPU tasks
            for i in range(5):
                task_id, future = manager.submit(
                    function=cpu_task,
                    n=10000000,  # 10 million iterations
                    task_type=TaskType.CPU,
                    priority=TaskPriority.NORMAL
                )
                task_ids_futures.append((task_id, future))
            
            # I/O tasks
            for i in range(5):
                task_id, future = manager.submit(
                    function=io_task,
                    sleep_time=0.5,
                    task_type=TaskType.IO,
                    priority=TaskPriority.HIGH
                )
                task_ids_futures.append((task_id, future))
            
            # Wait for tasks to complete and get results
            results = []
            for task_id, future in task_ids_futures:
                try:
                    result = future.result(timeout=10.0)
                    results.append((task_id, result))
                except Exception as e:
                    results.append((task_id, f"Error: {e}"))
            
            # Print results
            for task_id, result in results:
                print(f"Task {task_id}: {result}")
            
            # Get statistics
            stats = manager.get_stats()
            print(f"Statistics: {stats}")
            
            # Run tests
            test_results = await manager.test()
            print(f"Test results: {test_results}")
            
            # Shutdown the manager
            manager.shutdown()
        except Exception as e:
            print(f"Error: {e}")
    
    # Run the test
    asyncio.run(test_manager())