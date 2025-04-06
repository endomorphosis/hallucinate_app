"""
PyArrow Content Index Thread Pool Manager

Provides advanced thread pool management for PyArrow Content Index operations,
featuring dynamic worker scaling, priority-based task scheduling, and comprehensive
monitoring.
"""

import time
import logging
import threading
import queue
import psutil
import multiprocessing
from concurrent.futures import ThreadPoolExecutor, Future, as_completed
from typing import Dict, List, Any, Optional, Callable, Tuple, Set
from enum import IntEnum
from dataclasses import dataclass, field
from collections import deque

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("pyarrow_content_index_thread_pool")

class TaskPriority(IntEnum):
    """Task priority levels"""
    HIGH = 0
    NORMAL = 1
    LOW = 2

@dataclass
class Task:
    """Task data structure"""
    id: int
    func: Callable
    args: Tuple = field(default_factory=tuple)
    kwargs: Dict[str, Any] = field(default_factory=dict)
    priority: TaskPriority = TaskPriority.NORMAL
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    result: Any = None
    error: Optional[Exception] = None
    future: Optional[Future] = None
    category: str = "default"
    
    def duration(self) -> Optional[float]:
        """Calculate task execution duration if completed"""
        if self.started_at is not None and self.completed_at is not None:
            return self.completed_at - self.started_at
        return None
    
    def wait_time(self) -> float:
        """Calculate task wait time before starting execution"""
        if self.started_at is not None:
            return self.started_at - self.created_at
        return time.time() - self.created_at

class ThreadPoolStats:
    """Statistics and metrics for thread pool"""
    
    def __init__(self):
        self.start_time = time.time()
        self.tasks_submitted = 0
        self.tasks_completed = 0
        self.tasks_failed = 0
        self.total_execution_time = 0.0
        self.min_execution_time = float('inf')
        self.max_execution_time = 0.0
        
        # Stats by priority
        self.by_priority = {
            TaskPriority.HIGH: {'submitted': 0, 'completed': 0, 'failed': 0},
            TaskPriority.NORMAL: {'submitted': 0, 'completed': 0, 'failed': 0},
            TaskPriority.LOW: {'submitted': 0, 'completed': 0, 'failed': 0},
        }
        
        # Stats by category
        self.by_category = {}
        
        # Recent execution times (for moving averages)
        self.recent_execution_times = deque(maxlen=100)
        self.lock = threading.RLock()
    
    def task_submitted(self, task: Task):
        """Record task submission"""
        with self.lock:
            self.tasks_submitted += 1
            self.by_priority[task.priority]['submitted'] += 1
            
            # Initialize category if needed
            if task.category not in self.by_category:
                self.by_category[task.category] = {
                    'submitted': 0, 'completed': 0, 'failed': 0,
                    'total_time': 0.0, 'min_time': float('inf'), 'max_time': 0.0
                }
            
            self.by_category[task.category]['submitted'] += 1
    
    def task_completed(self, task: Task, success: bool = True):
        """Record task completion"""
        if task.duration() is None:
            return
            
        duration = task.duration()
        
        with self.lock:
            if success:
                self.tasks_completed += 1
                self.by_priority[task.priority]['completed'] += 1
                self.by_category[task.category]['completed'] += 1
            else:
                self.tasks_failed += 1
                self.by_priority[task.priority]['failed'] += 1
                self.by_category[task.category]['failed'] += 1
            
            # Update execution time stats
            self.total_execution_time += duration
            self.min_execution_time = min(self.min_execution_time, duration)
            self.max_execution_time = max(self.max_execution_time, duration)
            self.recent_execution_times.append(duration)
            
            # Update category stats
            cat_stats = self.by_category[task.category]
            cat_stats['total_time'] += duration
            cat_stats['min_time'] = min(cat_stats['min_time'], duration)
            cat_stats['max_time'] = max(cat_stats['max_time'], duration)
    
    def get_avg_execution_time(self) -> float:
        """Get average execution time"""
        with self.lock:
            if self.tasks_completed > 0:
                return self.total_execution_time / self.tasks_completed
            return 0.0
    
    def get_recent_avg_execution_time(self) -> float:
        """Get recent average execution time"""
        with self.lock:
            if len(self.recent_execution_times) > 0:
                return sum(self.recent_execution_times) / len(self.recent_execution_times)
            return 0.0
    
    def get_full_stats(self) -> Dict[str, Any]:
        """Get comprehensive statistics"""
        with self.lock:
            uptime = time.time() - self.start_time
            
            # Calculate category averages
            category_stats = {}
            for category, stats in self.by_category.items():
                category_stats[category] = {**stats}
                if stats['completed'] > 0:
                    category_stats[category]['avg_time'] = stats['total_time'] / stats['completed']
                else:
                    category_stats[category]['avg_time'] = 0.0
            
            return {
                'uptime': uptime,
                'tasks': {
                    'submitted': self.tasks_submitted,
                    'completed': self.tasks_completed,
                    'failed': self.tasks_failed,
                    'pending': self.tasks_submitted - (self.tasks_completed + self.tasks_failed),
                    'success_rate': (self.tasks_completed / self.tasks_submitted) if self.tasks_submitted > 0 else 0.0,
                },
                'execution_time': {
                    'total': self.total_execution_time,
                    'min': self.min_execution_time if self.min_execution_time != float('inf') else 0.0,
                    'max': self.max_execution_time,
                    'avg': self.get_avg_execution_time(),
                    'recent_avg': self.get_recent_avg_execution_time(),
                },
                'by_priority': self.by_priority,
                'by_category': category_stats,
            }

class ContentIndexThreadPool:
    """
    Advanced thread pool manager for PyArrow Content Index operations
    
    Features:
    - Dynamic worker scaling based on load and resource usage
    - Priority-based task scheduling (high, normal, low)
    - Comprehensive statistics and monitoring
    - Task categorization for detailed metrics
    - Automatic stalled task detection
    """
    
    def __init__(self, min_workers: int = 2, max_workers: int = 10, 
                 initial_workers: int = 4, name: str = "content_index"):
        """
        Initialize the thread pool
        
        Args:
            min_workers: Minimum number of worker threads
            max_workers: Maximum number of worker threads
            initial_workers: Initial number of worker threads
            name: Name prefix for worker threads
        """
        self.min_workers = min_workers
        self.max_workers = max_workers
        self.name = name
        
        # Determine initial size between min and max
        self.current_workers = max(min_workers, 
                                   min(max_workers, 
                                       initial_workers, 
                                       multiprocessing.cpu_count()))
        
        # Create thread pool with initial size
        self.pool = ThreadPoolExecutor(
            max_workers=self.current_workers,
            thread_name_prefix=f"{name}_worker"
        )
        
        # Thread safety
        self.lock = threading.RLock()
        
        # Task queues by priority
        self.high_priority_queue = deque()
        self.normal_priority_queue = deque()
        self.low_priority_queue = deque()
        
        # Task tracking
        self.task_counter = 0
        self.active_tasks: Dict[int, Task] = {}
        self.completed_tasks: Dict[int, Task] = {}
        self.recent_tasks = deque(maxlen=1000)
        
        # Statistics
        self.stats = ThreadPoolStats()
        
        # Thread pool health monitoring
        self.last_health_check = time.time()
        self.health_check_interval = 10  # seconds
        self.stalled_task_timeout = 300  # seconds
        self.last_pool_resize = time.time()
        self.pool_resize_interval = 60  # seconds
        
        # Resource monitoring
        self.last_resource_check = time.time()
        self.resource_check_interval = 15  # seconds
        self.cpu_threshold_high = 85  # percentage
        self.memory_threshold_high = 85  # percentage
        
        # Worker thread
        self.worker_thread = None
        self.running = False
        self.shutdown_event = threading.Event()
        
        # Start worker thread
        self._start_worker_thread()
        
        logger.info(f"Initialized {name} thread pool with {self.current_workers} workers")
    
    def _start_worker_thread(self):
        """Start the worker thread for managing task queues"""
        def worker_loop():
            logger.info(f"Starting {self.name} worker thread")
            
            while not self.shutdown_event.is_set():
                try:
                    # Check pool health
                    self._check_pool_health()
                    
                    # Adjust thread pool if needed
                    self._adjust_thread_pool()
                    
                    # Process tasks from queues in priority order
                    task = None
                    
                    with self.lock:
                        if self.high_priority_queue:
                            task = self.high_priority_queue.popleft()
                        elif self.normal_priority_queue:
                            task = self.normal_priority_queue.popleft()
                        elif self.low_priority_queue:
                            task = self.low_priority_queue.popleft()
                    
                    if task:
                        self._execute_task(task)
                    else:
                        # No tasks, sleep briefly to prevent busy-waiting
                        time.sleep(0.01)
                
                except Exception as e:
                    logger.error(f"Error in {self.name} worker thread: {e}")
                    time.sleep(1)  # Sleep on error to avoid rapid retries
        
        self.worker_thread = threading.Thread(
            target=worker_loop,
            name=f"{self.name}_manager",
            daemon=True
        )
        self.running = True
        self.worker_thread.start()
    
    def _execute_task(self, task: Task):
        """Submit a task to the thread pool"""
        def task_wrapper():
            # Mark task as started
            task.started_at = time.time()
            
            try:
                # Execute the task
                result = task.func(*task.args, **task.kwargs)
                task.result = result
                task.error = None
                return result
            except Exception as e:
                task.error = e
                raise
            finally:
                # Mark task as completed
                task.completed_at = time.time()
                
                # Update statistics
                self.stats.task_completed(task, success=task.error is None)
                
                # Move to completed tasks
                with self.lock:
                    if task.id in self.active_tasks:
                        del self.active_tasks[task.id]
                    
                    # Only keep recent completed tasks
                    self.completed_tasks[task.id] = task
                    self.recent_tasks.append(task)
                    
                    # Limit size of completed tasks dictionary
                    if len(self.completed_tasks) > 10000:
                        oldest_id = min(self.completed_tasks.keys())
                        del self.completed_tasks[oldest_id]
        
        # Submit the task to the thread pool
        with self.lock:
            # Record in active tasks
            self.active_tasks[task.id] = task
            
            # Submit to thread pool
            future = self.pool.submit(task_wrapper)
            task.future = future
    
    def _check_pool_health(self):
        """Check the health of the thread pool and handle stalled tasks"""
        now = time.time()
        
        # Only check periodically
        if now - self.last_health_check < self.health_check_interval:
            return
            
        self.last_health_check = now
        
        # Look for stalled tasks
        stalled_tasks = []
        with self.lock:
            for task_id, task in list(self.active_tasks.items()):
                if task.started_at is not None and now - task.started_at > self.stalled_task_timeout:
                    stalled_tasks.append(task)
        
        # Log stalled tasks
        if stalled_tasks:
            stalled_ids = [task.id for task in stalled_tasks]
            logger.warning(f"Found {len(stalled_tasks)} stalled tasks: {stalled_ids}")
    
    def _adjust_thread_pool(self):
        """Dynamically adjust thread pool size based on load and resources"""
        now = time.time()
        
        # Only adjust periodically
        if now - self.last_pool_resize < self.pool_resize_interval:
            return
            
        self.last_pool_resize = now
        
        # Check if we should resize the pool based on load and resources
        with self.lock:
            active_count = len(self.active_tasks)
            queue_size = len(self.high_priority_queue) + len(self.normal_priority_queue) + len(self.low_priority_queue)
            
            # Calculate utilization
            utilization = active_count / self.current_workers if self.current_workers > 0 else 0
            
            # Check system resources
            try:
                if now - self.last_resource_check >= self.resource_check_interval:
                    self.last_resource_check = now
                    
                    cpu_percent = psutil.cpu_percent()
                    memory_percent = psutil.virtual_memory().percent
                    
                    # Resize based on utilization and resources
                    new_size = self.current_workers
                    
                    # If system under heavy load, reduce workers
                    if cpu_percent > self.cpu_threshold_high or memory_percent > self.memory_threshold_high:
                        # Reduce by 25% (at least by 1)
                        reduction = max(1, int(self.current_workers * 0.25))
                        new_size = max(self.min_workers, self.current_workers - reduction)
                        logger.info(f"Reducing thread pool size due to high system load: {self.current_workers} -> {new_size}")
                    
                    # If pool is heavily utilized and system resources allow, grow
                    elif utilization > 0.75 and queue_size > self.current_workers:
                        if cpu_percent < 70 and memory_percent < 70:
                            # Grow by 25% (at least by 1)
                            increase = max(1, int(self.current_workers * 0.25))
                            new_size = min(self.max_workers, self.current_workers + increase)
                            logger.info(f"Increasing thread pool size due to high utilization: {self.current_workers} -> {new_size}")
                    
                    # If pool is underutilized, shrink
                    elif utilization < 0.25 and self.current_workers > self.min_workers:
                        # Only shrink if queue is also small
                        if queue_size < self.current_workers / 2:
                            # Reduce by 1
                            new_size = max(self.min_workers, self.current_workers - 1)
                            logger.info(f"Reducing thread pool size due to low utilization: {self.current_workers} -> {new_size}")
                    
                    # Apply the resize if needed
                    if new_size != self.current_workers:
                        self._resize_pool(new_size)
            
            except Exception as e:
                logger.error(f"Error checking system resources: {e}")
    
    def _resize_pool(self, new_size):
        """Resize the thread pool"""
        # Create a new executor with the new size
        old_executor = self.pool
        
        self.pool = ThreadPoolExecutor(
            max_workers=new_size,
            thread_name_prefix=f"{self.name}_worker"
        )
        
        self.current_workers = new_size
        
        # Schedule shutdown of the old executor after existing tasks complete
        threading.Thread(
            target=lambda: (time.sleep(60), old_executor.shutdown(wait=True)),
            daemon=True
        ).start()
    
    def submit_task(self, func: Callable, *args, priority: TaskPriority = TaskPriority.NORMAL, 
                   category: str = "default", **kwargs) -> int:
        """
        Submit a task to the thread pool
        
        Args:
            func: Function to execute
            *args: Positional arguments for the function
            priority: Task priority (HIGH, NORMAL, LOW)
            category: Task category for statistics
            **kwargs: Keyword arguments for the function
            
        Returns:
            Task ID for tracking
        """
        with self.lock:
            task_id = self.task_counter
            self.task_counter += 1
            
            task = Task(
                id=task_id,
                func=func,
                args=args,
                kwargs=kwargs,
                priority=priority,
                category=category
            )
            
            # Record submission in stats
            self.stats.task_submitted(task)
            
            # Add to appropriate queue
            if priority == TaskPriority.HIGH:
                self.high_priority_queue.append(task)
            elif priority == TaskPriority.NORMAL:
                self.normal_priority_queue.append(task)
            elif priority == TaskPriority.LOW:
                self.low_priority_queue.append(task)
            
            return task_id
    
    def submit_and_wait(self, func: Callable, *args, priority: TaskPriority = TaskPriority.NORMAL,
                       category: str = "default", timeout: Optional[float] = None, **kwargs) -> Any:
        """
        Submit a task and wait for its completion
        
        Args:
            func: Function to execute
            *args: Positional arguments for the function
            priority: Task priority (HIGH, NORMAL, LOW)
            category: Task category for statistics
            timeout: Maximum time to wait for the result (seconds)
            **kwargs: Keyword arguments for the function
            
        Returns:
            Result of the function execution
            
        Raises:
            TimeoutError: If the task doesn't complete within the timeout
            Exception: Any exception raised by the task
        """
        # Create a result queue
        result_queue = queue.Queue()
        
        # Wrapper function to put result in queue
        def task_wrapper(*args, **kwargs):
            try:
                result = func(*args, **kwargs)
                result_queue.put((True, result))
                return result
            except Exception as e:
                result_queue.put((False, e))
                raise
        
        # Submit the task
        task_id = self.submit_task(task_wrapper, *args, priority=priority, category=category, **kwargs)
        
        # Wait for the result
        try:
            success, result = result_queue.get(timeout=timeout)
            if success:
                return result
            else:
                raise result
        except queue.Empty:
            # No result within timeout
            raise TimeoutError(f"Task {task_id} timed out after {timeout} seconds")
    
    def get_task_status(self, task_id: int) -> Optional[Dict[str, Any]]:
        """
        Get status of a task
        
        Args:
            task_id: Task ID to check
            
        Returns:
            Status information for the task or None if not found
        """
        with self.lock:
            if task_id in self.active_tasks:
                task = self.active_tasks[task_id]
                return {
                    'id': task.id,
                    'status': 'running',
                    'created_at': task.created_at,
                    'started_at': task.started_at,
                    'wait_time': task.wait_time(),
                    'duration': time.time() - (task.started_at or task.created_at),
                    'category': task.category,
                    'priority': task.priority.name
                }
            elif task_id in self.completed_tasks:
                task = self.completed_tasks[task_id]
                return {
                    'id': task.id,
                    'status': 'completed' if task.error is None else 'failed',
                    'created_at': task.created_at,
                    'started_at': task.started_at,
                    'completed_at': task.completed_at,
                    'wait_time': task.wait_time(),
                    'duration': task.duration(),
                    'category': task.category,
                    'priority': task.priority.name,
                    'error': str(task.error) if task.error else None
                }
            
            # Check queues
            for queue_name, queue_data in [
                ('high', self.high_priority_queue),
                ('normal', self.normal_priority_queue),
                ('low', self.low_priority_queue)
            ]:
                for i, task in enumerate(queue_data):
                    if task.id == task_id:
                        return {
                            'id': task.id,
                            'status': 'queued',
                            'queue': queue_name,
                            'position': i,
                            'created_at': task.created_at,
                            'wait_time': task.wait_time(),
                            'category': task.category,
                            'priority': task.priority.name
                        }
        
        return None
    
    def get_stats(self) -> Dict[str, Any]:
        """Get thread pool statistics"""
        with self.lock:
            # Core stats from stats object
            stats = self.stats.get_full_stats()
            
            # Add current state
            stats['pool'] = {
                'min_workers': self.min_workers,
                'max_workers': self.max_workers,
                'current_workers': self.current_workers,
                'active_tasks': len(self.active_tasks),
                'queue_sizes': {
                    'high': len(self.high_priority_queue),
                    'normal': len(self.normal_priority_queue),
                    'low': len(self.low_priority_queue),
                },
                'utilization': len(self.active_tasks) / self.current_workers if self.current_workers > 0 else 0,
            }
            
            # Resource usage
            try:
                stats['system'] = {
                    'cpu_percent': psutil.cpu_percent(),
                    'memory_percent': psutil.virtual_memory().percent,
                    'cpu_count': psutil.cpu_count(),
                    'thread_count': threading.active_count()
                }
            except Exception:
                stats['system'] = {'error': 'Unable to get system stats'}
            
            # Add recent task counts
            recent_window = time.time() - 60  # Last minute
            recent_tasks = [t for t in self.recent_tasks if t.created_at >= recent_window]
            
            stats['recent'] = {
                'tasks_submitted': len(recent_tasks),
                'tasks_completed': len([t for t in recent_tasks if t.completed_at is not None and t.error is None]),
                'tasks_failed': len([t for t in recent_tasks if t.completed_at is not None and t.error is not None]),
                'avg_wait_time': sum(t.wait_time() for t in recent_tasks) / len(recent_tasks) if recent_tasks else 0,
                'avg_duration': sum(t.duration() or 0 for t in recent_tasks if t.duration() is not None) / 
                             len([t for t in recent_tasks if t.duration() is not None]) if any(t.duration() is not None for t in recent_tasks) else 0
            }
            
            return stats
    
    def shutdown(self, wait: bool = True, timeout: Optional[float] = None):
        """
        Shutdown the thread pool
        
        Args:
            wait: Whether to wait for all tasks to complete
            timeout: Maximum time to wait for tasks to complete
        """
        logger.info(f"Shutting down {self.name} thread pool")
        
        # Signal worker thread to stop
        self.running = False
        self.shutdown_event.set()
        
        # Wait for worker thread to stop
        if self.worker_thread and self.worker_thread.is_alive():
            if wait:
                self.worker_thread.join(timeout=timeout)
            
        # Shutdown thread pool
        self.pool.shutdown(wait=wait, cancel_futures=not wait)
        
        logger.info(f"{self.name} thread pool shutdown complete")
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown(wait=True)

# Create singleton instance for import
content_index_thread_pool = ContentIndexThreadPool(
    min_workers=2,
    max_workers=10,
    initial_workers=4,
    name="pyarrow_index"
)

def get_thread_pool() -> ContentIndexThreadPool:
    """Get singleton thread pool instance"""
    return content_index_thread_pool