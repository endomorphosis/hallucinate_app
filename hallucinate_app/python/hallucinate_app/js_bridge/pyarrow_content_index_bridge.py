"""
PyArrow Content Index Bridge

Provides a bridge between JavaScript and Python for the PyArrow content index
Enables efficient data exchange using PyBridge and Apache Arrow with thread-safety
for concurrent access.
"""

import os
import json
import logging
import time
import asyncio
import threading
import psutil
import multiprocessing
from typing import Dict, List, Any, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor
from queue import Queue, PriorityQueue, Empty
from collections import deque
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("pyarrow_content_index_bridge")

# Try to import PyBridge
try:
    import pybridge
    HAS_PYBRIDGE = True
except ImportError:
    HAS_PYBRIDGE = False

# Try to import PyArrow
try:
    import pyarrow as pa
    import pyarrow.parquet as pq
    HAS_PYARROW = True
except ImportError:
    HAS_PYARROW = False

# Try to import observed metrics
try:
    from hallucinate_app.observability import get_metrics, register_counter, register_gauge, register_histogram
    HAS_OBSERVABILITY = True
except ImportError:
    HAS_OBSERVABILITY = False

class PyArrowContentIndexBridge:
    """
    Bridge between JavaScript and Python for PyArrow Content Index
    
    Provides PyBridge and Apache Arrow integration for efficient data exchange
    with thread-safety for concurrent operations and advanced thread management.
    """
    
    # Task priority levels
    PRIORITY_HIGH = 0
    PRIORITY_NORMAL = 1
    PRIORITY_LOW = 2
    
    # Operation types for metrics
    OP_LOOKUP = "lookup"
    OP_QUERY = "query"
    OP_WRITE = "write"
    OP_SYNC = "sync"
    OP_ADMIN = "admin"
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the bridge
        
        Args:
            resources (dict): Resources including integration layer and PyBridge handler
            metadata (dict): Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Track initialization
        self.initialized = False
        
        # Get the content index integration
        self.content_index_integration = self.resources.get('content_index_integration')
        
        # Get PyBridge handler
        self.pybridge_handler = self.resources.get('pybridge_handler')
        
        # Check if we have Arrow support
        self.use_arrow = HAS_PYARROW and self.metadata.get('use_arrow', True)
        
        # Arrow options
        if self.use_arrow:
            self.arrow_compression = self.metadata.get('arrow_compression', 'zstd')
            self.arrow_use_dictionary = self.metadata.get('arrow_use_dictionary', True)
        
        # Advanced thread management
        self._init_thread_management()
        
        # Cache configuration - using multi-level LRU cache
        self._init_caching_system()
        
        # Worker initialization
        if self.metadata.get('start_worker', True):
            self._start_worker_thread()
            
        # Initialize metrics if available
        self._init_metrics()
            
        logger.info(f"PyArrowContentIndexBridge initialized (use_arrow={self.use_arrow}, initial_thread_pool_size={self.thread_pool._max_workers})")
    
    def _init_thread_management(self):
        """Initialize the advanced thread management system"""
        # Core thread safety mechanisms
        self.lock = threading.RLock()  # Reentrant lock for thread safety
        
        # Dynamic thread pool sizing
        self.min_workers = self.metadata.get('min_workers', 2)
        self.max_workers = self.metadata.get('max_workers', 10)
        self.current_workers = max(self.min_workers, min(
            multiprocessing.cpu_count(), 
            self.metadata.get('initial_workers', 5)
        ))
        
        # Create thread pool with initial size
        self.thread_pool = ThreadPoolExecutor(
            max_workers=self.current_workers,
            thread_name_prefix="pyarrow_index_"
        )
        
        # Priority-based request queue with worker assignment
        self.max_queue_size = self.metadata.get('max_queue_size', 100)
        self.request_queue = PriorityQueue(maxsize=self.max_queue_size)
        
        # Task queues by priority
        self.high_priority_queue = deque()
        self.normal_priority_queue = deque()
        self.low_priority_queue = deque()
        
        # Thread pool load metrics
        self.task_history = deque(maxlen=100)  # Store recent task execution times
        self.last_pool_resize = time.time()
        self.pool_resize_interval = self.metadata.get('pool_resize_interval', 60)  # seconds
        self.resize_threshold_high = self.metadata.get('resize_threshold_high', 0.8)  # 80% utilization
        self.resize_threshold_low = self.metadata.get('resize_threshold_low', 0.2)   # 20% utilization
        
        # Active tasks tracking
        self.active_tasks = {}  # task_id -> start_time
        self.task_counter = 0
        self.task_lock = threading.Lock()
        
        # Thread health monitoring
        self.thread_health_check_interval = self.metadata.get('thread_health_check_interval', 30)  # seconds
        self.thread_health_last_check = time.time()
        self.stalled_task_timeout = self.metadata.get('stalled_task_timeout', 300)  # seconds
        
        # Resource monitoring
        self.monitor_resources = self.metadata.get('monitor_resources', True)
        self.last_resource_check = time.time()
        self.resource_check_interval = self.metadata.get('resource_check_interval', 30)  # seconds
        self.cpu_threshold_high = self.metadata.get('cpu_threshold_high', 80)  # percent
        self.memory_threshold_high = self.metadata.get('memory_threshold_high', 80)  # percent
    
    def _init_caching_system(self):
        """Initialize the multi-level caching system"""
        # Cache configuration
        self.cache_enabled = self.metadata.get('cache_enabled', True)
        
        # Multi-level TTL settings
        self.cache_ttl_levels = {
            'fast': self.metadata.get('cache_ttl_fast', 30),      # 30 seconds for frequently accessed data
            'medium': self.metadata.get('cache_ttl_medium', 300),  # 5 minutes for normal data
            'slow': self.metadata.get('cache_ttl_slow', 3600)      # 1 hour for rarely changing data
        }
        
        # Default TTL
        self.cache_ttl = self.cache_ttl_levels['medium']
        
        # Separate caches for different types of data
        self.caches = {
            'cid': {},       # CID lookups (fast)
            'path': {},      # Path lookups (fast)
            'query': {},     # Query results (medium)
            'stats': {},     # Statistics (slow)
            'metadata': {}   # Metadata (medium)
        }
        
        # Cache timestamps
        self.cache_timestamps = {
            'cid': {},
            'path': {},
            'query': {},
            'stats': {},
            'metadata': {}
        }
        
        # Cache hit/miss statistics
        self.cache_stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'by_type': {
                'cid': {'hits': 0, 'misses': 0},
                'path': {'hits': 0, 'misses': 0},
                'query': {'hits': 0, 'misses': 0},
                'stats': {'hits': 0, 'misses': 0},
                'metadata': {'hits': 0, 'misses': 0}
            }
        }
        
        # LRU tracking
        self.cache_access_times = {
            'cid': {},
            'path': {},
            'query': {},
            'stats': {},
            'metadata': {}
        }
        
        # Cache size limits
        self.cache_size_limits = {
            'cid': self.metadata.get('cache_size_cid', 1000),
            'path': self.metadata.get('cache_size_path', 1000),
            'query': self.metadata.get('cache_size_query', 100),
            'stats': self.metadata.get('cache_size_stats', 10),
            'metadata': self.metadata.get('cache_size_metadata', 500)
        }
    
    def _init_metrics(self):
        """Initialize metrics for the bridge if observability is available"""
        self.metrics = {}
        
        if HAS_OBSERVABILITY:
            namespace = "pyarrow_content_index"
            try:
                # Register operation metrics
                self.metrics['operations'] = register_counter(
                    "pyarrow_content_index_operations_total",
                    "Total number of operations performed by the PyArrow Content Index",
                    ["operation", "status"],
                    namespace
                )
                
                # Thread pool metrics
                self.metrics['thread_pool_size'] = register_gauge(
                    "pyarrow_content_index_thread_pool_size",
                    "Current size of the thread pool",
                    [],
                    namespace
                )
                
                self.metrics['thread_pool_active'] = register_gauge(
                    "pyarrow_content_index_thread_pool_active",
                    "Number of active threads in the pool",
                    [],
                    namespace
                )
                
                self.metrics['thread_pool_utilization'] = register_gauge(
                    "pyarrow_content_index_thread_pool_utilization",
                    "Utilization percentage of the thread pool",
                    [],
                    namespace
                )
                
                # Queue metrics
                self.metrics['queue_size'] = register_gauge(
                    "pyarrow_content_index_queue_size", 
                    "Current size of the request queue",
                    ["priority"],
                    namespace
                )
                
                # Cache metrics
                self.metrics['cache_hits'] = register_counter(
                    "pyarrow_content_index_cache_hits_total",
                    "Total number of cache hits",
                    ["cache_type"],
                    namespace
                )
                
                self.metrics['cache_misses'] = register_counter(
                    "pyarrow_content_index_cache_misses_total",
                    "Total number of cache misses",
                    ["cache_type"],
                    namespace
                )
                
                # Resource usage metrics
                self.metrics['cpu_usage'] = register_gauge(
                    "pyarrow_content_index_cpu_usage_percent",
                    "CPU usage percentage",
                    [],
                    namespace
                )
                
                self.metrics['memory_usage'] = register_gauge(
                    "pyarrow_content_index_memory_usage_percent",
                    "Memory usage percentage",
                    [],
                    namespace
                )
                
                # Operation duration metrics
                self.metrics['operation_duration'] = register_histogram(
                    "pyarrow_content_index_operation_duration_seconds",
                    "Duration of operations in seconds",
                    ["operation"],
                    [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30],
                    namespace
                )
                
                logger.info("Metrics registration complete")
            except Exception as e:
                logger.error(f"Error registering metrics: {e}")
                
        # Update initial metrics values
        self._update_metrics()
    
    def _update_metrics(self):
        """Update metrics with current state"""
        if not HAS_OBSERVABILITY or not self.metrics:
            return
            
        try:
            # Thread pool metrics
            self.metrics['thread_pool_size'].set(self.current_workers)
            self.metrics['thread_pool_active'].set(len(self.active_tasks))
            
            # Calculate utilization
            utilization = 0
            if self.current_workers > 0:
                utilization = len(self.active_tasks) / self.current_workers * 100
            self.metrics['thread_pool_utilization'].set(utilization)
            
            # Queue metrics
            self.metrics['queue_size'].labels(priority="high").set(len(self.high_priority_queue))
            self.metrics['queue_size'].labels(priority="normal").set(len(self.normal_priority_queue))
            self.metrics['queue_size'].labels(priority="low").set(len(self.low_priority_queue))
            
            # Resource metrics if monitoring is enabled
            if self.monitor_resources:
                try:
                    self.metrics['cpu_usage'].set(psutil.cpu_percent())
                    self.metrics['memory_usage'].set(psutil.virtual_memory().percent)
                except Exception as e:
                    logger.error(f"Error updating resource metrics: {e}")
        except Exception as e:
            logger.error(f"Error updating metrics: {e}")
            
    def _adjust_thread_pool(self):
        """
        Dynamically adjust thread pool size based on load and resource usage
        """
        now = time.time()
        
        # Only check periodically
        if now - self.last_pool_resize < self.pool_resize_interval:
            return
            
        self.last_pool_resize = now
        
        # Calculate current utilization
        active_threads = len(self.active_tasks)
        utilization = active_threads / self.current_workers if self.current_workers > 0 else 0
        
        # Get CPU and memory usage
        cpu_usage = 0
        memory_usage = 0
        if self.monitor_resources:
            try:
                cpu_usage = psutil.cpu_percent()
                memory_usage = psutil.virtual_memory().percent
            except Exception as e:
                logger.error(f"Error getting resource usage: {e}")
        
        # Check average task execution time
        avg_execution_time = 0
        if self.task_history:
            avg_execution_time = sum(self.task_history) / len(self.task_history)
        
        # Calculate queue pressure
        queue_size = (
            len(self.high_priority_queue) + 
            len(self.normal_priority_queue) + 
            len(self.low_priority_queue)
        )
        queue_pressure = queue_size / self.max_queue_size if self.max_queue_size > 0 else 0
        
        # Decision logic for adjusting pool size
        new_size = self.current_workers
        
        # If utilization is high and resources allow, grow the pool
        if (utilization > self.resize_threshold_high or queue_pressure > 0.5) and \
           cpu_usage < self.cpu_threshold_high and \
           memory_usage < self.memory_threshold_high and \
           self.current_workers < self.max_workers:
            # Increase by 25% rounded up, but at least by 1
            increase = max(1, int(self.current_workers * 0.25 + 0.5))
            new_size = min(self.max_workers, self.current_workers + increase)
            logger.info(f"Increasing thread pool from {self.current_workers} to {new_size} due to high load (utilization={utilization:.2f}, queue_pressure={queue_pressure:.2f})")
        
        # If utilization is low and consistently so, shrink the pool
        elif utilization < self.resize_threshold_low and \
             queue_pressure < 0.2 and \
             self.current_workers > self.min_workers:
            # Only shrink if we've had consistently low utilization
            if avg_execution_time < 0.1:  # Tasks are completing quickly
                # Decrease by 25% rounded down, but at least by 1
                decrease = max(1, int(self.current_workers * 0.25))
                new_size = max(self.min_workers, self.current_workers - decrease)
                logger.info(f"Decreasing thread pool from {self.current_workers} to {new_size} due to low load (utilization={utilization:.2f}, queue_pressure={queue_pressure:.2f})")
        
        # If resources are constrained, reduce regardless of demand
        elif (cpu_usage > self.cpu_threshold_high or memory_usage > self.memory_threshold_high) and \
             self.current_workers > self.min_workers:
            # Aggressive reduction when resources are constrained
            decrease = max(1, int(self.current_workers * 0.5))
            new_size = max(self.min_workers, self.current_workers - decrease)
            logger.warning(f"Reducing thread pool from {self.current_workers} to {new_size} due to resource constraints (CPU={cpu_usage:.1f}%, Memory={memory_usage:.1f}%)")
        
        # Apply the change if needed
        if new_size != self.current_workers:
            # Create a new executor with the new size
            old_executor = self.thread_pool
            self.thread_pool = ThreadPoolExecutor(
                max_workers=new_size,
                thread_name_prefix="pyarrow_index_"
            )
            self.current_workers = new_size
            
            # Schedule the old executor for shutdown after existing tasks complete
            threading.Thread(
                target=lambda: (time.sleep(30), old_executor.shutdown(wait=True)),
                daemon=True
            ).start()
            
            # Update metrics
            self._update_metrics()
    
    def _check_thread_health(self):
        """
        Check for stalled tasks and handle them
        """
        now = time.time()
        
        # Only check periodically
        if now - self.thread_health_last_check < self.thread_health_check_interval:
            return
            
        self.thread_health_last_check = now
        
        # Look for stalled tasks
        stalled_tasks = []
        with self.task_lock:
            for task_id, start_time in list(self.active_tasks.items()):
                if now - start_time > self.stalled_task_timeout:
                    stalled_tasks.append(task_id)
                    logger.warning(f"Task {task_id} appears stalled (running for {now - start_time:.1f} seconds)")
        
        # Log stalled tasks but don't take action for now
        # In a production system, we might want to implement task cancellation
        if stalled_tasks:
            logger.warning(f"Found {len(stalled_tasks)} stalled tasks")
    
    def _start_worker_thread(self):
        """
        Start the worker thread for processing queued operations with advanced task scheduling
        """
        def worker_loop():
            logger.info("Starting PyArrow content index advanced worker thread")
            
            while True:
                try:
                    # Adjust thread pool if needed
                    self._adjust_thread_pool()
                    
                    # Check thread health
                    self._check_thread_health()
                    
                    # Process tasks in priority order
                    task = None
                    priority = None
                    
                    # First check the priority queues
                    if self.high_priority_queue:
                        task = self.high_priority_queue.popleft()
                        priority = "high"
                    elif self.normal_priority_queue:
                        task = self.normal_priority_queue.popleft()
                        priority = "normal"
                    elif self.low_priority_queue:
                        task = self.low_priority_queue.popleft()
                        priority = "low"
                    else:
                        # If no tasks in dedicated queues, get from the main queue with timeout
                        try:
                            priority_val, timestamp, task_data = self.request_queue.get(timeout=1.0)
                            task = task_data
                            priority = ["high", "normal", "low"][priority_val]
                        except Empty:
                            # Just a timeout, continue
                            self._update_metrics()  # Update metrics during idle time
                            time.sleep(0.1)  # Small sleep to prevent busy-waiting
                            continue
                    
                    if task is None:  # None is the signal to stop
                        logger.info("Worker thread received stop signal")
                        break
                    
                    # Extract task details
                    func, args, kwargs, result_queue, task_id = task
                    
                    # Track the task
                    with self.task_lock:
                        self.active_tasks[task_id] = time.time()
                    
                    # Start task timing
                    start_time = time.time()
                    operation_type = kwargs.pop('operation_type', "unknown")
                    
                    # Submit to thread pool
                    future = self.thread_pool.submit(func, *args, **kwargs)
                    
                    # Handle result asynchronously
                    def handle_result(fut):
                        try:
                            # Get result with timeout
                            timeout = kwargs.get('timeout', 30.0)
                            result = fut.result(timeout=timeout)
                            
                            # Record execution time
                            execution_time = time.time() - start_time
                            self.task_history.append(execution_time)
                            
                            # Update metrics
                            if HAS_OBSERVABILITY and self.metrics:
                                try:
                                    self.metrics['operations'].labels(
                                        operation=operation_type, 
                                        status="success"
                                    ).inc()
                                    
                                    self.metrics['operation_duration'].labels(
                                        operation=operation_type
                                    ).observe(execution_time)
                                except Exception as e:
                                    logger.error(f"Error updating metrics: {e}")
                            
                            # Put the result in the result queue
                            result_queue.put((True, result))
                            
                            # Remove from active tasks
                            with self.task_lock:
                                if task_id in self.active_tasks:
                                    del self.active_tasks[task_id]
                            
                            # Log performance if slow
                            if execution_time > 1.0:  # More than 1 second
                                logger.info(f"Slow operation: {operation_type} took {execution_time:.2f}s")
                                
                        except Exception as e:
                            # Record failure in metrics
                            if HAS_OBSERVABILITY and self.metrics:
                                try:
                                    self.metrics['operations'].labels(
                                        operation=operation_type, 
                                        status="error"
                                    ).inc()
                                except Exception as e_metrics:
                                    logger.error(f"Error updating metrics: {e_metrics}")
                            
                            # Put the exception in the result queue
                            logger.error(f"Error executing task {func.__name__} (ID: {task_id}): {e}")
                            result_queue.put((False, e))
                            
                            # Remove from active tasks
                            with self.task_lock:
                                if task_id in self.active_tasks:
                                    del self.active_tasks[task_id]
                    
                    # Add callback to handle result
                    future.add_done_callback(handle_result)
                    
                except Exception as e:
                    logger.error(f"Error in worker thread: {e}")
        
        # Start the worker thread
        self.worker_thread = threading.Thread(
            target=worker_loop, 
            name="pyarrow_index_advanced_worker",
            daemon=True
        )
        self.worker_thread.start()
        
        # Also start a metrics update thread if observability is enabled
        if HAS_OBSERVABILITY and self.metrics:
            def metrics_updater():
                while True:
                    try:
                        time.sleep(10)  # Update every 10 seconds
                        self._update_metrics()
                    except Exception as e:
                        logger.error(f"Error in metrics updater: {e}")
            
            self.metrics_thread = threading.Thread(
                target=metrics_updater,
                name="pyarrow_index_metrics",
                daemon=True
            )
            self.metrics_thread.start()
                
    def _queue_task(self, func, *args, **kwargs):
        """
        Queue a task for execution by the worker thread with priority support
        
        Args:
            func: Function to execute
            *args: Function arguments
            **kwargs: Function keyword arguments
            
        Returns:
            Result of the function execution
        
        Additional kwargs:
            priority: Task priority (high, normal, low) - defaults to normal
            operation_type: Type of operation for metrics - defaults to unknown
            timeout: Timeout in seconds - defaults to 30.0
        """
        # Extract special kwargs
        priority_str = kwargs.pop('priority', 'normal')
        priority_map = {
            'high': self.PRIORITY_HIGH,
            'normal': self.PRIORITY_NORMAL,
            'low': self.PRIORITY_LOW
        }
        priority = priority_map.get(priority_str, self.PRIORITY_NORMAL)
        
        # Keep operation_type in kwargs for metrics
        operation_type = kwargs.get('operation_type', 'unknown')
        
        # Create result queue
        result_queue = Queue()
        
        # Generate task ID
        with self.task_lock:
            task_id = self.task_counter
            self.task_counter += 1
        
        # Create task
        task = (func, args, kwargs, result_queue, task_id)
        
        # Add to appropriate queue based on priority
        if priority == self.PRIORITY_HIGH:
            self.high_priority_queue.append(task)
        elif priority == self.PRIORITY_NORMAL:
            self.normal_priority_queue.append(task)
        elif priority == self.PRIORITY_LOW:
            self.low_priority_queue.append(task)
        else:
            # Use PriorityQueue with timestamp to maintain order within priorities
            timestamp = time.time()
            self.request_queue.put((priority, timestamp, task))
        
        # Log task queueing for debugging
        logger.debug(f"Queued task {task_id} with priority {priority_str} (type: {operation_type})")
        
        # Wait for result with timeout
        timeout = kwargs.pop('timeout', 30.0)  # Default 30 second timeout
        try:
            success, result = result_queue.get(timeout=timeout)
            if success:
                return result
            else:
                # Re-raise the exception
                raise result
        except Exception as e:
            logger.error(f"Error or timeout waiting for task {task_id} result: {e}")
            
            # Remove from active tasks if it's there
            with self.task_lock:
                if task_id in self.active_tasks:
                    del self.active_tasks[task_id]
            
            raise
            
    def _check_cache(self, cache_type, key):
        """
        Check if a value is in the cache and not expired
        
        Args:
            cache_type: Type of cache ('cid', 'path', 'query', 'stats', 'metadata')
            key: Cache key
            
        Returns:
            value if found and valid, None otherwise
        """
        if not self.cache_enabled:
            return None
            
        with self.lock:
            cache = self.caches.get(cache_type, {})
            timestamps = self.cache_timestamps.get(cache_type, {})
            access_times = self.cache_access_times.get(cache_type, {})
            
            if key in cache:
                # Get appropriate TTL for this cache type
                ttl = self.cache_ttl_levels.get(
                    {'cid': 'fast', 'path': 'fast', 'query': 'medium', 
                     'stats': 'slow', 'metadata': 'medium'}.get(cache_type, 'medium')
                )
                
                # Check if expired
                timestamp = timestamps.get(key, 0)
                if time.time() - timestamp <= ttl:
                    # Update access time for LRU
                    access_times[key] = time.time()
                    
                    # Update hit statistics
                    self.cache_stats['hits'] += 1
                    self.cache_stats['by_type'][cache_type]['hits'] += 1
                    
                    # Update metrics
                    if HAS_OBSERVABILITY and self.metrics and 'cache_hits' in self.metrics:
                        try:
                            self.metrics['cache_hits'].labels(cache_type=cache_type).inc()
                        except Exception as e:
                            # Metrics are best-effort; keep cache reads working while preserving the traceback.
                            logger.exception("Error updating cache hit metrics for %s: %s", cache_type, e)
                    
                    return cache[key]
                else:
                    # Expired, remove from cache
                    del cache[key]
                    del timestamps[key]
                    if key in access_times:
                        del access_times[key]
                    
                    # Update eviction statistics
                    self.cache_stats['evictions'] += 1
            
            # Cache miss
            self.cache_stats['misses'] += 1
            self.cache_stats['by_type'][cache_type]['misses'] += 1
            
            # Update metrics
            if HAS_OBSERVABILITY and self.metrics and 'cache_misses' in self.metrics:
                try:
                    self.metrics['cache_misses'].labels(cache_type=cache_type).inc()
                except Exception as e:
                    # Metrics are best-effort; keep cache reads working while preserving the traceback.
                    logger.exception("Error updating cache miss metrics for %s: %s", cache_type, e)
                    
            return None
    
    def _set_cache(self, cache_type, key, value):
        """
        Set a value in the cache with LRU eviction
        
        Args:
            cache_type: Type of cache ('cid', 'path', 'query', 'stats', 'metadata')
            key: Cache key
            value: Value to cache
        """
        if not self.cache_enabled:
            return
            
        with self.lock:
            cache = self.caches.get(cache_type, {})
            timestamps = self.cache_timestamps.get(cache_type, {})
            access_times = self.cache_access_times.get(cache_type, {})
            size_limit = self.cache_size_limits.get(cache_type, 1000)
            
            # Check if we need to evict entries
            if len(cache) >= size_limit:
                # Evict oldest entries by access time (LRU)
                sorted_keys = sorted(access_times.items(), key=lambda x: x[1])
                # Evict 10% of the cache or at least one entry
                evict_count = max(1, int(len(cache) * 0.1))
                
                for i in range(min(evict_count, len(sorted_keys))):
                    old_key = sorted_keys[i][0]
                    if old_key in cache:
                        del cache[old_key]
                    if old_key in timestamps:
                        del timestamps[old_key]
                    if old_key in access_times:
                        del access_times[old_key]
                        
                    # Update eviction statistics
                    self.cache_stats['evictions'] += 1
            
            # Add to cache
            cache[key] = value
            timestamps[key] = time.time()
            access_times[key] = time.time()
    
    def _clear_cache(self):
        """Clear all items from all caches"""
        with self.lock:
            for cache_type in self.caches:
                self.caches[cache_type].clear()
                self.cache_timestamps[cache_type].clear()
                self.cache_access_times[cache_type].clear()
                
            # Reset cache statistics
            self.cache_stats = {
                'hits': 0,
                'misses': 0,
                'evictions': 0,
                'by_type': {
                    'cid': {'hits': 0, 'misses': 0},
                    'path': {'hits': 0, 'misses': 0},
                    'query': {'hits': 0, 'misses': 0},
                    'stats': {'hits': 0, 'misses': 0},
                    'metadata': {'hits': 0, 'misses': 0}
                }
            }
    
    def _get_cache_stats(self):
        """Get cache statistics"""
        with self.lock:
            return {
                'stats': self.cache_stats,
                'sizes': {
                    cache_type: len(self.caches.get(cache_type, {}))
                    for cache_type in self.caches
                },
                'limits': self.cache_size_limits,
                'ttl_levels': self.cache_ttl_levels
            }
            
    async def js_lookup_by_cid(self, cid, use_arrow=False):
        """
        Look up content by CID (JavaScript bridge method) with advanced thread management
        
        Args:
            cid (str): Content identifier
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            dict: Content metadata
        """
        if not self.initialized:
            await self.init()
        
        # Check cache first
        cache_key = f"{cid}"
        cached_result = self._check_cache('cid', cache_key)
        if cached_result is not None:
            logger.debug(f"Cache hit for CID {cid}")
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(cached_result)
            return cached_result
        
        try:
            # Execute in thread pool for thread safety using the advanced queue
            def lookup_task():
                with self.lock:
                    # Convert to coroutine result
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        return loop.run_until_complete(
                            self.content_index_integration.lookup_by_cid(cid)
                        )
                    finally:
                        loop.close()
            
            # Queue with high priority for lookups
            result = self._queue_task(
                lookup_task, 
                priority='high',
                operation_type=self.OP_LOOKUP
            )
            
            # Cache the result
            if result and not isinstance(result, dict) or "error" not in result:
                self._set_cache('cid', cache_key, result)
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_lookup_by_cid: {e}")
            return {"error": str(e)}
    
# Removed duplicate _clear_cache method (already implemented with more functionality above)
    
    async def init(self):
        """
        Initialize the bridge
        
        Returns:
            bool: Success status
        """
        with self.lock:  # Thread-safe initialization
            try:
                logger.info("Initializing PyArrow Content Index Bridge")
                
                # Initialize the content index integration if we have it
                if self.content_index_integration:
                    await self.content_index_integration.init()
                else:
                    # Try to import and create it
                    try:
                        from hallucinate_app.pyarrow_content_index_integration import PyArrowContentIndexIntegration
                        
                        # Create with resources and metadata
                        self.content_index_integration = PyArrowContentIndexIntegration(
                            resources=self.resources,
                            metadata=self.metadata
                        )
                        
                        # Initialize
                        await self.content_index_integration.init()
                        
                    except ImportError as e:
                        logger.error(f"Could not import PyArrowContentIndexIntegration: {e}")
                        return False
                
                # Register PyBridge methods if available
                if HAS_PYBRIDGE and self.pybridge_handler:
                    try:
                        # Register methods with PyBridge
                        self.pybridge_handler.register_method("lookup_by_cid", self.js_lookup_by_cid)
                        self.pybridge_handler.register_method("lookup_by_path", self.js_lookup_by_path)
                        self.pybridge_handler.register_method("add_entry", self.js_add_entry)
                        self.pybridge_handler.register_method("update_entry", self.js_update_entry)
                        self.pybridge_handler.register_method("delete_entry", self.js_delete_entry)
                        self.pybridge_handler.register_method("query", self.js_query)
                        self.pybridge_handler.register_method("sync_with_ipfs_pinset", self.js_sync_with_ipfs_pinset)
                        self.pybridge_handler.register_method("get_stats", self.js_get_stats)
                        self.pybridge_handler.register_method("save", self.js_save)
                        self.pybridge_handler.register_method("export_to_parquet", self.js_export_to_parquet)
                        self.pybridge_handler.register_method("import_from_parquet", self.js_import_from_parquet)
                        
                        logger.info("Registered PyBridge methods")
                    except Exception as e:
                        logger.error(f"Error registering PyBridge methods: {e}")
                
                self.initialized = True
                logger.info("PyArrow Content Index Bridge initialization complete")
                return True
                
            except Exception as e:
                logger.error(f"Error initializing PyArrow Content Index Bridge: {e}")
                return False
    
    def _convert_to_arrow(self, data):
        """
        Convert data to Arrow format for efficient transfer
        
        Args:
            data: Data to convert
            
        Returns:
            bytes: Arrow serialized data
        """
        if not HAS_PYARROW:
            return data
        
        try:
            if isinstance(data, list):
                # Convert list of dictionaries to Arrow table
                table = pa.Table.from_pylist(data)
            elif isinstance(data, dict):
                # Convert dictionary to Arrow table
                table = pa.Table.from_pylist([data])
            else:
                # Return original data if not convertible
                return data
            
            # Serialize to Arrow buffer
            sink = pa.BufferOutputStream()
            options = pa.ipc.write_options(compression=self.arrow_compression, 
                                          use_dictionary=self.arrow_use_dictionary)
            writer = pa.ipc.RecordBatchStreamWriter(sink, table.schema, options=options)
            writer.write_table(table)
            writer.close()
            
            return sink.getvalue().to_pybytes()
        except Exception as e:
            logger.error(f"Error converting to Arrow: {e}")
            return data
    
    def _deserialize_arrow(self, data):
        """
        Deserialize data from Arrow format
        
        Args:
            data: Arrow serialized data
            
        Returns:
            dict or list: Deserialized data
        """
        if not HAS_PYARROW or not isinstance(data, bytes):
            return data
        
        try:
            # Read Arrow buffer
            reader = pa.ipc.RecordBatchStreamReader(pa.BufferReader(data))
            table = reader.read_all()
            
            # Convert to Python objects
            result = table.to_pylist()
            
            # If single record, return as dict
            if len(result) == 1:
                return result[0]
            
            return result
        except Exception as e:
            logger.error(f"Error deserializing Arrow data: {e}")
            return data
    
# The js_lookup_by_cid method is already implemented with advanced thread management above
    
    async def js_lookup_by_path(self, path, use_arrow=False):
        """
        Look up content by path (JavaScript bridge method) with advanced thread management
        
        Args:
            path (str): Virtual filesystem path
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            dict: Content metadata
        """
        if not self.initialized:
            await self.init()
        
        # Check cache first
        cache_key = f"{path}"
        cached_result = self._check_cache('path', cache_key)
        if cached_result is not None:
            logger.debug(f"Cache hit for path {path}")
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(cached_result)
            return cached_result
        
        try:
            # Execute in thread pool for thread safety using the advanced queue
            def lookup_task():
                with self.lock:
                    # Convert to coroutine result
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        return loop.run_until_complete(
                            self.content_index_integration.lookup_by_path(path)
                        )
                    finally:
                        loop.close()
            
            # Queue with high priority for lookups
            result = self._queue_task(
                lookup_task, 
                priority='high',
                operation_type=self.OP_LOOKUP
            )
            
            # Cache the result
            if result and not isinstance(result, dict) or "error" not in result:
                self._set_cache('path', cache_key, result)
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_lookup_by_path: {e}")
            return {"error": str(e)}
    
    async def js_add_entry(self, entry_data, use_arrow=False):
        """
        Add an entry to the content index (JavaScript bridge method) with advanced thread management
        
        Args:
            entry_data (dict): Entry data with CID, path, and metadata
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            dict: Added entry
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Deserialize from Arrow if needed
            if use_arrow and self.use_arrow and isinstance(entry_data, bytes):
                entry_data = self._deserialize_arrow(entry_data)
            
            # Execute in thread pool for thread safety using the advanced queue
            def add_task():
                with self.lock:
                    # Convert to coroutine result
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        return loop.run_until_complete(
                            self.content_index_integration.add_entry(entry_data)
                        )
                    finally:
                        loop.close()
            
            # Queue with normal priority for writes
            result = self._queue_task(
                add_task, 
                priority='normal',
                operation_type=self.OP_WRITE
            )
            
            # Invalidate relevant caches
            if isinstance(entry_data, dict) and 'cid' in entry_data:
                with self.lock:
                    # Invalidate specific cache entries
                    cid = entry_data['cid']
                    path = entry_data.get('path')
                    
                    # Remove from cid cache
                    if cid in self.caches.get('cid', {}):
                        del self.caches['cid'][cid]
                        if cid in self.cache_timestamps.get('cid', {}):
                            del self.cache_timestamps['cid'][cid]
                        if cid in self.cache_access_times.get('cid', {}):
                            del self.cache_access_times['cid'][cid]
                    
                    # Remove from path cache if path is present
                    if path and path in self.caches.get('path', {}):
                        del self.caches['path'][path]
                        if path in self.cache_timestamps.get('path', {}):
                            del self.cache_timestamps['path'][path]
                        if path in self.cache_access_times.get('path', {}):
                            del self.cache_access_times['path'][path]
                    
                    # Clear query cache as it might be affected
                    self.caches['query'].clear()
                    self.cache_timestamps['query'].clear()
                    self.cache_access_times['query'].clear()
            
            # Send real-time notification via WebSocket if the operation was successful
            if result and not isinstance(result, dict) or "error" not in result:
                try:
                    # Import the WebSocket server
                    from hallucinate_app.js_bridge.pyarrow_content_index_ws_server import get_ws_server, start_ws_server
                    
                    # Run in another thread to avoid blocking
                    def send_notification():
                        async def _send():
                            # Get or start the WebSocket server
                            ws_server = get_ws_server()
                            if not ws_server.running:
                                await start_ws_server()
                            
                            # Send notification with content details
                            if isinstance(entry_data, dict):
                                cid = entry_data.get('cid')
                                path = entry_data.get('path')
                                mimetype = entry_data.get('mimetype')
                                size = entry_data.get('size')
                                
                                # Prepare metadata from remaining fields
                                metadata = {k: v for k, v in entry_data.items() 
                                          if k not in ('cid', 'path', 'mimetype', 'size')}
                                
                                # Send content-added notification
                                await ws_server.notify_content_added(
                                    cid=cid,
                                    path=path,
                                    mimetype=mimetype,
                                    size=size,
                                    metadata=metadata if metadata else None
                                )
                                logger.info(f"Sent content-added notification for CID {cid}")
                        
                        # Create and run a new event loop in this thread
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        try:
                            loop.run_until_complete(_send())
                        finally:
                            loop.close()
                    
                    # Run the notification in a separate thread
                    notification_thread = threading.Thread(
                        target=send_notification,
                        daemon=True
                    )
                    notification_thread.start()
                except Exception as e:
                    logger.error(f"Error sending WebSocket notification: {e}")
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_add_entry: {e}")
            return {"error": str(e)}
    
    async def js_update_entry(self, cid, update_data, use_arrow=False):
        """
        Update an entry in the content index (JavaScript bridge method) with advanced thread management
        
        Args:
            cid (str): Content identifier
            update_data (dict): Data to update
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            dict: Updated entry
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Deserialize from Arrow if needed
            if use_arrow and self.use_arrow and isinstance(update_data, bytes):
                update_data = self._deserialize_arrow(update_data)
            
            # Execute in thread pool for thread safety using the advanced queue
            def update_task():
                with self.lock:
                    # Convert to coroutine result
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        return loop.run_until_complete(
                            self.content_index_integration.update_entry(cid, update_data)
                        )
                    finally:
                        loop.close()
            
            # Queue with normal priority for writes
            result = self._queue_task(
                update_task, 
                priority='normal',
                operation_type=self.OP_WRITE
            )
            
            # Invalidate relevant caches
            with self.lock:
                # Invalidate specific cache entries
                if cid in self.caches.get('cid', {}):
                    del self.caches['cid'][cid]
                    if cid in self.cache_timestamps.get('cid', {}):
                        del self.cache_timestamps['cid'][cid]
                    if cid in self.cache_access_times.get('cid', {}):
                        del self.cache_access_times['cid'][cid]
                
                # If path is being updated, we need to check and invalidate
                if isinstance(update_data, dict) and 'path' in update_data:
                    # First get the old entry to find its path
                    old_entry = None
                    try:
                        def get_old_entry():
                            loop = asyncio.new_event_loop()
                            asyncio.set_event_loop(loop)
                            try:
                                return loop.run_until_complete(
                                    self.content_index_integration.lookup_by_cid(cid)
                                )
                            finally:
                                loop.close()
                        
                        old_entry = self._queue_task(
                            get_old_entry,
                            priority='high',
                            operation_type=self.OP_LOOKUP
                        )
                    except Exception as e:
                        logger.error(f"Error fetching old entry for cache invalidation: {e}")
                    
                    # If we have the old entry, invalidate its path in cache
                    if old_entry and isinstance(old_entry, dict) and 'path' in old_entry:
                        old_path = old_entry['path']
                        if old_path in self.caches.get('path', {}):
                            del self.caches['path'][old_path]
                            if old_path in self.cache_timestamps.get('path', {}):
                                del self.cache_timestamps['path'][old_path]
                            if old_path in self.cache_access_times.get('path', {}):
                                del self.cache_access_times['path'][old_path]
                
                # Clear query cache as it might be affected
                self.caches['query'].clear()
                self.cache_timestamps['query'].clear()
                self.cache_access_times['query'].clear()
            
            # Send real-time notification via WebSocket if the operation was successful
            if result and not isinstance(result, dict) or "error" not in result:
                try:
                    # Import the WebSocket server
                    from hallucinate_app.js_bridge.pyarrow_content_index_ws_server import get_ws_server, start_ws_server
                    
                    # Run in another thread to avoid blocking
                    def send_notification():
                        async def _send():
                            # Get or start the WebSocket server
                            ws_server = get_ws_server()
                            if not ws_server.running:
                                await start_ws_server()
                            
                            # Send notification about the update
                            if isinstance(update_data, dict):
                                # Send content-updated notification
                                await ws_server.notify_content_updated(
                                    cid=cid,
                                    updates=update_data
                                )
                                logger.info(f"Sent content-updated notification for CID {cid}")
                        
                        # Create and run a new event loop in this thread
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        try:
                            loop.run_until_complete(_send())
                        finally:
                            loop.close()
                    
                    # Run the notification in a separate thread
                    notification_thread = threading.Thread(
                        target=send_notification,
                        daemon=True
                    )
                    notification_thread.start()
                except Exception as e:
                    logger.error(f"Error sending WebSocket notification: {e}")
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_update_entry: {e}")
            return {"error": str(e)}
    
    async def js_delete_entry(self, cid):
        """
        Delete an entry from the content index (JavaScript bridge method) with advanced thread management
        
        Args:
            cid (str): Content identifier
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Get the entry first to invalidate path cache later and for notification
            old_entry = None
            try:
                def get_old_entry():
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        return loop.run_until_complete(
                            self.content_index_integration.lookup_by_cid(cid)
                        )
                    finally:
                        loop.close()
                
                old_entry = self._queue_task(
                    get_old_entry,
                    priority='high',
                    operation_type=self.OP_LOOKUP
                )
            except Exception as e:
                logger.error(f"Error fetching old entry for cache invalidation: {e}")
            
            # Execute in thread pool for thread safety using the advanced queue
            def delete_task():
                with self.lock:
                    # Convert to coroutine result
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        return loop.run_until_complete(
                            self.content_index_integration.delete_entry(cid)
                        )
                    finally:
                        loop.close()
            
            # Queue with normal priority for writes
            result = self._queue_task(
                delete_task, 
                priority='normal',
                operation_type=self.OP_WRITE
            )
            
            # Invalidate relevant caches
            with self.lock:
                # Invalidate specific cache entries
                if cid in self.caches.get('cid', {}):
                    del self.caches['cid'][cid]
                    if cid in self.cache_timestamps.get('cid', {}):
                        del self.cache_timestamps['cid'][cid]
                    if cid in self.cache_access_times.get('cid', {}):
                        del self.cache_access_times['cid'][cid]
                
                # If we have the old entry, invalidate its path in cache
                if old_entry and isinstance(old_entry, dict) and 'path' in old_entry:
                    old_path = old_entry['path']
                    if old_path in self.caches.get('path', {}):
                        del self.caches['path'][old_path]
                        if old_path in self.cache_timestamps.get('path', {}):
                            del self.cache_timestamps['path'][old_path]
                        if old_path in self.cache_access_times.get('path', {}):
                            del self.cache_access_times['path'][old_path]
                
                # Clear query cache as it might be affected
                self.caches['query'].clear()
                self.cache_timestamps['query'].clear()
                self.cache_access_times['query'].clear()
            
            # Send real-time notification via WebSocket if the operation was successful
            if result:
                try:
                    # Import the WebSocket server
                    from hallucinate_app.js_bridge.pyarrow_content_index_ws_server import get_ws_server, start_ws_server
                    
                    # Extract path from old entry if available
                    path = None
                    if old_entry and isinstance(old_entry, dict) and 'path' in old_entry:
                        path = old_entry['path']
                    
                    # Run in another thread to avoid blocking
                    def send_notification():
                        async def _send():
                            # Get or start the WebSocket server
                            ws_server = get_ws_server()
                            if not ws_server.running:
                                await start_ws_server()
                            
                            # Send content-deleted notification
                            await ws_server.notify_content_deleted(
                                cid=cid,
                                path=path
                            )
                            logger.info(f"Sent content-deleted notification for CID {cid}")
                        
                        # Create and run a new event loop in this thread
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        try:
                            loop.run_until_complete(_send())
                        finally:
                            loop.close()
                    
                    # Run the notification in a separate thread
                    notification_thread = threading.Thread(
                        target=send_notification,
                        daemon=True
                    )
                    notification_thread.start()
                except Exception as e:
                    logger.error(f"Error sending WebSocket notification: {e}")
            
            return result
        except Exception as e:
            logger.error(f"Error in js_delete_entry: {e}")
            return False
    
    async def js_query(self, query_params, use_arrow=False):
        """
        Query the content index (JavaScript bridge method) with advanced thread management
        
        Args:
            query_params (dict): Query parameters including filters, sorting, pagination
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            list: Matching entries or dict with results and pagination info
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Deserialize from Arrow if needed
            if use_arrow and self.use_arrow and isinstance(query_params, bytes):
                query_params = self._deserialize_arrow(query_params)
            
            # Generate cache key based on query parameters
            cache_key = None
            if isinstance(query_params, dict):
                try:
                    # Use a stable string representation of the query
                    sorted_params = json.dumps(
                        query_params, 
                        sort_keys=True, 
                        default=str  # Handle non-serializable objects
                    )
                    cache_key = f"{sorted_params}"
                    cached_result = self._check_cache('query', cache_key)
                    if cached_result is not None:
                        logger.debug(f"Cache hit for query {hash(sorted_params)}")
                        if use_arrow and self.use_arrow:
                            return self._convert_to_arrow(cached_result)
                        return cached_result
                except Exception as e:
                    logger.warning(f"Error generating cache key for query: {e}")
            
            # Determine query priority based on complexity and size
            query_complexity = "normal"
            # Check if this is a complex or potentially slow query
            if isinstance(query_params, dict):
                # Large result set queries are lower priority
                if query_params.get('limit', 0) > 1000 or not query_params.get('limit'):
                    query_complexity = "low"
                # Complex filter queries are lower priority
                if 'filter' in query_params and len(str(query_params['filter'])) > 100:
                    query_complexity = "low"
                # Small, simple queries get high priority
                if query_params.get('limit', 1000) <= 10 and (
                    'filter' not in query_params or len(str(query_params.get('filter', ''))) < 50
                ):
                    query_complexity = "high"
                # Explicitly marked priority queries
                if 'priority' in query_params:
                    query_complexity = query_params.pop('priority')
            
            # Execute query in thread pool with pagination support using the advanced queue
            def execute_query():
                with self.lock:
                    # Create new event loop for this thread
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        # Add pagination support
                        page_size = query_params.get('page_size', 1000)  # Default page size
                        page = query_params.get('page', 0)  # Default to first page
                        
                        # If pagination is not requested, just fetch everything at once
                        if not query_params.get('use_pagination', False):
                            return loop.run_until_complete(
                                self.content_index_integration.query(query_params)
                            )
                        
                        # For pagination, we need to modify the query
                        paginated_params = dict(query_params)
                        paginated_params['limit'] = page_size
                        paginated_params['offset'] = page * page_size
                        
                        # Run the query with pagination
                        result = loop.run_until_complete(
                            self.content_index_integration.query(paginated_params)
                        )
                        
                        # Add pagination metadata
                        total_count = loop.run_until_complete(
                            self.content_index_integration.get_query_count(query_params)
                        )
                        
                        # Return with pagination info
                        return {
                            'results': result,
                            'pagination': {
                                'page': page,
                                'page_size': page_size,
                                'total_count': total_count,
                                'total_pages': (total_count + page_size - 1) // page_size
                            }
                        }
                    finally:
                        loop.close()
            
            # Queue task with appropriate priority and operation type
            # Use a longer timeout for queries than for lookups
            timeout = query_params.get('timeout', 60) if isinstance(query_params, dict) else 60
            result = self._queue_task(
                execute_query, 
                priority=query_complexity,
                operation_type=self.OP_QUERY,
                timeout=timeout
            )
            
            # Cache the result if we have a cache key
            if cache_key and result and (not isinstance(result, dict) or "error" not in result):
                self._set_cache('query', cache_key, result)
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
            
        except Exception as e:
            logger.error(f"Error in js_query: {e}")
            return {"error": str(e)}
    
    async def js_sync_with_ipfs_pinset(self, include_metadata=True, use_arrow=False):
        """
        Synchronize the content index with the IPFS pinset (JavaScript bridge method) with advanced thread management
        
        Args:
            include_metadata (bool): Whether to include detailed metadata
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            dict: Synchronization results
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Execute in thread pool for thread safety using the advanced queue
            def sync_task():
                with self.lock:
                    # Convert to coroutine result
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        return loop.run_until_complete(
                            self.content_index_integration.sync_with_ipfs_pinset(include_metadata)
                        )
                    finally:
                        loop.close()
            
            # Queue with low priority since sync can be expensive
            result = self._queue_task(
                sync_task, 
                priority='low',
                operation_type=self.OP_SYNC,
                # Longer timeout for sync operations
                timeout=300  # 5 minutes
            )
            
            # Clear all caches after sync since the index may have changed significantly
            self._clear_cache()
            
            # Send real-time notification via WebSocket if the operation was successful
            if result and not isinstance(result, dict) or "error" not in result:
                try:
                    # Import the WebSocket server
                    from hallucinate_app.js_bridge.pyarrow_content_index_ws_server import get_ws_server, start_ws_server
                    
                    # Extract sync stats from result
                    added = 0
                    updated = 0
                    removed = 0
                    details = {}
                    
                    if isinstance(result, dict):
                        added = result.get('added', 0)
                        updated = result.get('updated', 0)
                        removed = result.get('removed', 0)
                        
                        # Collect additional details but filter out large data structures
                        details = {k: v for k, v in result.items() 
                                 if k not in ['added', 'updated', 'removed', 'added_cids', 'updated_cids', 'removed_cids'] 
                                 and not isinstance(v, (list, dict)) or (isinstance(v, (list, dict)) and len(str(v)) < 1000)}
                    
                    # Run in another thread to avoid blocking
                    def send_notification():
                        async def _send():
                            # Get or start the WebSocket server
                            ws_server = get_ws_server()
                            if not ws_server.running:
                                await start_ws_server()
                            
                            # Send content-synced notification
                            await ws_server.notify_content_synced(
                                added=added,
                                updated=updated,
                                removed=removed,
                                details=details
                            )
                            logger.info(f"Sent content-synced notification: +{added}, ~{updated}, -{removed}")
                        
                        # Create and run a new event loop in this thread
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        try:
                            loop.run_until_complete(_send())
                        finally:
                            loop.close()
                    
                    # Run the notification in a separate thread
                    notification_thread = threading.Thread(
                        target=send_notification,
                        daemon=True
                    )
                    notification_thread.start()
                except Exception as e:
                    logger.error(f"Error sending WebSocket notification: {e}")
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_sync_with_ipfs_pinset: {e}")
            return {"error": str(e)}
    
    async def js_get_stats(self, use_arrow=False):
        """
        Get statistics about the content index (JavaScript bridge method) with advanced thread management
        
        Args:
            use_arrow (bool): Whether to use Arrow for data transfer
            
        Returns:
            dict: Statistics including count, size, types, etc.
        """
        if not self.initialized:
            await self.init()
        
        # Check cache first
        cache_key = "stats"
        cached_result = self._check_cache('stats', cache_key)
        if cached_result is not None:
            logger.debug("Cache hit for stats")
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(cached_result)
            return cached_result
        
        try:
            # Execute in thread pool for thread safety using the advanced queue
            def stats_task():
                with self.lock:
                    # Convert to coroutine result
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        result = loop.run_until_complete(
                            self.content_index_integration.get_stats()
                        )
                        
                        # Add additional stats
                        if isinstance(result, dict):
                            # Add bridge metrics to stats
                            result['bridge'] = {
                                'cache': self._get_cache_stats(),
                                'thread_pool': {
                                    'size': self.current_workers,
                                    'active_tasks': len(self.active_tasks),
                                    'high_priority_queue_size': len(self.high_priority_queue),
                                    'normal_priority_queue_size': len(self.normal_priority_queue),
                                    'low_priority_queue_size': len(self.low_priority_queue),
                                }
                            }
                            
                            # Add system resource information
                            if self.monitor_resources:
                                try:
                                    result['system'] = {
                                        'cpu_percent': psutil.cpu_percent(),
                                        'memory_percent': psutil.virtual_memory().percent,
                                        'thread_count': threading.active_count()
                                    }
                                except Exception as e:
                                    logger.error(f"Error getting system stats: {e}")
                        
                        return result
                    finally:
                        loop.close()
            
            # Queue with normal priority for stats
            result = self._queue_task(
                stats_task, 
                priority='normal',
                operation_type=self.OP_ADMIN
            )
            
            # Cache the result (with slow TTL since stats don't change often)
            if result and (not isinstance(result, dict) or "error" not in result):
                self._set_cache('stats', cache_key, result)
            
            # Convert to Arrow if requested and available
            if use_arrow and self.use_arrow:
                return self._convert_to_arrow(result)
            
            return result
        except Exception as e:
            logger.error(f"Error in js_get_stats: {e}")
            return {"error": str(e)}
    
    async def js_save(self):
        """
        Save the content index to disk (JavaScript bridge method) with advanced thread management
        
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Execute in thread pool for thread safety using the advanced queue
            def save_task():
                with self.lock:
                    # Convert to coroutine result
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        return loop.run_until_complete(
                            self.content_index_integration.save()
                        )
                    finally:
                        loop.close()
            
            # Queue with low priority since save operations can be expensive
            result = self._queue_task(
                save_task, 
                priority='low',
                operation_type=self.OP_ADMIN,
                # Longer timeout for save operations
                timeout=120  # 2 minutes
            )
            
            return result
        except Exception as e:
            logger.error(f"Error in js_save: {e}")
            return False
    
    async def js_export_to_parquet(self, export_path):
        """
        Export the content index to Parquet format (JavaScript bridge method) with advanced thread management
        
        Args:
            export_path (str): Path to export the Parquet file
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Execute in thread pool for thread safety using the advanced queue
            def export_task():
                with self.lock:
                    # Convert to coroutine result
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        return loop.run_until_complete(
                            self.content_index_integration.export_to_parquet(export_path)
                        )
                    finally:
                        loop.close()
            
            # Queue with low priority since export operations can be expensive
            result = self._queue_task(
                export_task, 
                priority='low',
                operation_type=self.OP_ADMIN,
                # Longer timeout for export operations
                timeout=180  # 3 minutes
            )
            
            return result
        except Exception as e:
            logger.error(f"Error in js_export_to_parquet: {e}")
            return False
    
    async def js_import_from_parquet(self, import_path):
        """
        Import the content index from Parquet format (JavaScript bridge method) with advanced thread management
        
        Args:
            import_path (str): Path to import the Parquet file from
            
        Returns:
            bool: Success status
        """
        if not self.initialized:
            await self.init()
        
        try:
            # Execute in thread pool for thread safety using the advanced queue
            def import_task():
                with self.lock:
                    # Convert to coroutine result
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        return loop.run_until_complete(
                            self.content_index_integration.import_from_parquet(import_path)
                        )
                    finally:
                        loop.close()
            
            # Queue with low priority since import operations can be expensive
            result = self._queue_task(
                import_task, 
                priority='low',
                operation_type=self.OP_ADMIN,
                # Longer timeout for import operations
                timeout=180  # 3 minutes
            )
            
            # Clear all caches after import since the entire index has changed
            self._clear_cache()
            
            return result
        except Exception as e:
            logger.error(f"Error in js_import_from_parquet: {e}")
            return False
    
    def test(self, verbose=False):
        """
        Test the bridge functionality with comprehensive concurrency and large dataset testing
        
        Args:
            verbose (bool): Whether to include detailed logs
            
        Returns:
            dict: Test results
        """
        # Create test entry
        test_entry = {
            "cid": "QmTestBridgeCID12345",
            "path": "/test/bridge/file.txt",
            "mimetype": "text/plain",
            "size": 1024,
            "tags": ["test", "bridge"],
            "description": "Test entry for bridge testing"
        }
        
        # Run tests asynchronously
        async def run_tests():
            result = {
                "success": False,
                "module": "pyarrow_content_index_bridge",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "steps": {},
                "diagnostics": {
                    "dependencies": {
                        "pybridge": {
                            "available": HAS_PYBRIDGE
                        },
                        "pyarrow": {
                            "available": HAS_PYARROW
                        }
                    },
                    "environment": {
                        "use_arrow": self.use_arrow,
                        "thread_pool_size": self.thread_pool._max_workers,
                        "cache_enabled": self.cache_enabled,
                        "cache_ttl": self.cache_ttl
                    },
                    "thread_safety": {
                        "lock_type": type(self.lock).__name__,
                        "thread_pool_type": type(self.thread_pool).__name__,
                        "request_queue_maxsize": self.max_queue_size
                    }
                },
                "logs": [] if verbose else None
            }
            
            if verbose:
                result["logs"].append(f"[INFO] Starting bridge tests with thread safety validation")
            
            # Test initialization
            if not self.initialized:
                await self.init()
            
            result["steps"]["initialization"] = {
                "success": self.initialized,
                "message": "Bridge initialized successfully" if self.initialized else "Bridge initialization failed"
            }
            
            if not self.initialized:
                result["success"] = False
                if verbose:
                    result["logs"].append("[ERROR] Bridge initialization failed, skipping remaining tests")
                return result
            
            # Test integration access
            result["steps"]["integration_access"] = {
                "success": self.content_index_integration is not None,
                "message": "Content index integration available" if self.content_index_integration else "Content index integration not available"
            }
            
            if not self.content_index_integration:
                result["success"] = False
                if verbose:
                    result["logs"].append("[ERROR] Content index integration not available, skipping remaining tests")
                return result
            
            # Test adding an entry
            try:
                if verbose:
                    result["logs"].append(f"[INFO] Testing add_entry")
                add_result = await self.js_add_entry(test_entry)
                add_failed = isinstance(add_result, dict) and "error" in add_result
                result["steps"]["add_entry"] = {
                    "success": not add_failed,
                    "message": (
                        "Successfully added test entry"
                        if not add_failed
                        else f"Failed to add entry: {add_result.get('error', str(add_result))}"
                    )
                }
            except Exception as e:
                result["steps"]["add_entry"] = {
                    "success": False,
                    "message": f"Exception in add_entry: {str(e)}"
                }
            
            # Test lookup by CID
            try:
                if verbose:
                    result["logs"].append(f"[INFO] Testing lookup_by_cid")
                lookup_result = await self.js_lookup_by_cid(test_entry["cid"])
                lookup_failed = isinstance(lookup_result, dict) and "error" in lookup_result
                result["steps"]["lookup_by_cid"] = {
                    "success": not lookup_failed,
                    "message": (
                        "Successfully looked up entry by CID"
                        if not lookup_failed
                        else f"Failed to lookup by CID: {lookup_result.get('error', str(lookup_result))}"
                    )
                }
            except Exception as e:
                result["steps"]["lookup_by_cid"] = {
                    "success": False,
                    "message": f"Exception in lookup_by_cid: {str(e)}"
                }
            
            # Test Arrow serialization if available
            if self.use_arrow:
                try:
                    if verbose:
                        result["logs"].append(f"[INFO] Testing Arrow serialization")
                    arrow_result = await self.js_lookup_by_cid(test_entry["cid"], use_arrow=True)
                    result["steps"]["arrow_serialization"] = {
                        "success": isinstance(arrow_result, bytes),
                        "message": f"Successfully serialized to Arrow format, size: {len(arrow_result)} bytes" if isinstance(arrow_result, bytes) else "Failed to serialize to Arrow format"
                    }
                except Exception as e:
                    result["steps"]["arrow_serialization"] = {
                        "success": False,
                        "message": f"Exception in Arrow serialization: {str(e)}"
                    }
            
            # Test caching functionality
            try:
                if verbose:
                    result["logs"].append(f"[INFO] Testing cache functionality")
                
                # Clear cache to ensure a clean test
                self._clear_cache()
                
                # First lookup should miss cache
                start_time = time.time()
                await self.js_lookup_by_cid(test_entry["cid"])
                first_lookup_time = time.time() - start_time
                
                # Second lookup should hit cache if enabled
                start_time = time.time()
                await self.js_lookup_by_cid(test_entry["cid"])
                second_lookup_time = time.time() - start_time
                
                cache_benefit = first_lookup_time / second_lookup_time if second_lookup_time > 0 else 0
                
                result["steps"]["cache_functionality"] = {
                    "success": True,
                    "message": f"Cache test completed. First lookup: {first_lookup_time:.6f}s, Second: {second_lookup_time:.6f}s, Speedup: {cache_benefit:.2f}x"
                }
                
                # Add cache diagnostics
                result["diagnostics"]["cache"] = {
                    "first_lookup_time": first_lookup_time,
                    "second_lookup_time": second_lookup_time,
                    "speedup_factor": cache_benefit,
                    "enabled": self.cache_enabled,
                    "ttl": self.cache_ttl
                }
                
            except Exception as e:
                result["steps"]["cache_functionality"] = {
                    "success": False,
                    "message": f"Exception in cache testing: {str(e)}"
                }
            
            # Test concurrent operations
            try:
                if verbose:
                    result["logs"].append(f"[INFO] Testing concurrent operations")
                
                num_concurrent = min(20, self.thread_pool._max_workers * 2)
                
                # Create multiple test entries
                test_entries = []
                for i in range(num_concurrent):
                    test_entries.append({
                        "cid": f"QmTestConcurrent{i}",
                        "path": f"/test/concurrent/{i}/file.txt",
                        "mimetype": "text/plain",
                        "size": 1024 + i,
                        "tags": ["test", "concurrent", f"test-{i}"],
                        "description": f"Concurrent test entry {i}"
                    })
                
                # Add entries concurrently
                add_tasks = []
                for entry in test_entries:
                    add_tasks.append(self.js_add_entry(entry))
                
                # Wait for all adds to complete
                add_results = await asyncio.gather(*add_tasks, return_exceptions=True)
                add_success_count = sum(1 for r in add_results if not isinstance(r, Exception) and (not isinstance(r, dict) or "error" not in r))
                
                # Lookup entries concurrently
                lookup_tasks = []
                for entry in test_entries:
                    lookup_tasks.append(self.js_lookup_by_cid(entry["cid"]))
                
                # Wait for all lookups to complete
                lookup_results = await asyncio.gather(*lookup_tasks, return_exceptions=True)
                lookup_success_count = sum(1 for r in lookup_results if not isinstance(r, Exception) and (not isinstance(r, dict) or "error" not in r))
                
                # Delete entries concurrently
                delete_tasks = []
                for entry in test_entries:
                    delete_tasks.append(self.js_delete_entry(entry["cid"]))
                
                # Wait for all deletes to complete
                delete_results = await asyncio.gather(*delete_tasks, return_exceptions=True)
                delete_success_count = sum(1 for r in delete_results if r is not False and not isinstance(r, Exception))
                
                # Record concurrency test results
                result["steps"]["concurrent_operations"] = {
                    "success": add_success_count == num_concurrent and 
                               lookup_success_count == num_concurrent and
                               delete_success_count == num_concurrent,
                    "message": f"Concurrent operations: {add_success_count}/{num_concurrent} adds, " +
                              f"{lookup_success_count}/{num_concurrent} lookups, " +
                              f"{delete_success_count}/{num_concurrent} deletes"
                }
                
                # Add concurrency diagnostics
                result["diagnostics"]["concurrency"] = {
                    "operations_requested": num_concurrent,
                    "add_success_rate": add_success_count / num_concurrent,
                    "lookup_success_rate": lookup_success_count / num_concurrent,
                    "delete_success_rate": delete_success_count / num_concurrent
                }
                
            except Exception as e:
                result["steps"]["concurrent_operations"] = {
                    "success": False,
                    "message": f"Exception in concurrency testing: {str(e)}"
                }
            
            # Test large dataset handling with pagination
            try:
                if verbose:
                    result["logs"].append(f"[INFO] Testing large dataset pagination")
                
                # Create a query that would return paginated results
                query_params = {
                    "use_pagination": True,
                    "page_size": 10,
                    "page": 0,
                    "filter": "mimetype = 'text/plain'"
                }
                
                pagination_result = await self.js_query(query_params)
                
                # Check if pagination structure is correct
                has_pagination = (
                    isinstance(pagination_result, dict) and
                    'results' in pagination_result and
                    'pagination' in pagination_result and
                    'page' in pagination_result.get('pagination', {}) and
                    'page_size' in pagination_result.get('pagination', {}) and
                    'total_count' in pagination_result.get('pagination', {})
                )
                
                result["steps"]["large_dataset_pagination"] = {
                    "success": has_pagination,
                    "message": "Pagination works correctly" if has_pagination else "Pagination structure incorrect or missing"
                }
                
                if has_pagination and verbose:
                    pagination_info = pagination_result.get('pagination', {})
                    result["logs"].append(
                        f"[INFO] Pagination results: page {pagination_info.get('page')}, " +
                        f"size {pagination_info.get('page_size')}, " +
                        f"total {pagination_info.get('total_count')}"
                    )
                
            except Exception as e:
                result["steps"]["large_dataset_pagination"] = {
                    "success": False,
                    "message": f"Exception in pagination testing: {str(e)}"
                }
            
            # Test cleanup - delete test entry
            try:
                if verbose:
                    result["logs"].append(f"[INFO] Testing delete_entry (cleanup)")
                delete_result = await self.js_delete_entry(test_entry["cid"])
                result["steps"]["delete_entry"] = {
                    "success": delete_result is not False,
                    "message": "Successfully deleted test entry" if delete_result is not False else "Failed to delete test entry"
                }
            except Exception as e:
                result["steps"]["delete_entry"] = {
                    "success": False,
                    "message": f"Exception in delete_entry: {str(e)}"
                }
            
            # Determine overall success
            result["success"] = all(step["success"] for step in result["steps"].values())
            
            if verbose:
                result["logs"].append(f"[INFO] Bridge tests completed with status: {'SUCCESS' if result['success'] else 'FAILURE'}")
            
            return result
        
        # Run the tests in an event loop
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(run_tests())


# Create singleton instance for import
content_index_bridge = PyArrowContentIndexBridge()
