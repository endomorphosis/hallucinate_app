"""
Advanced Thread Pool Manager for Parallel Processing

This module enhances the thread pool management system with advanced features for
task routing, load balancing, and resource allocation between multiple thread pools.
It extends the base ThreadPoolManager with sophisticated workload distribution algorithms,
adaptive resource allocation, and dynamic task prioritization.

Key enhancements:
- Intelligent task routing based on resource availability and pool specialization
- Workload balancing across pools with similar capabilities
- Dynamic resource allocation based on historical performance
- Advanced task prioritization with aging and starvation prevention
- Cross-pool task migration for optimal utilization
- Resource usage prediction and preemptive scaling
- Support for heterogeneous thread pools with specialized configurations
"""

import os
import time
import uuid
import logging
import threading
import multiprocessing
import heapq
import copy
import json
import math
from queue import Queue, PriorityQueue, Empty
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Union, Tuple, Callable, TypeVar, Generic, Set
from enum import Enum, auto
from concurrent.futures import ThreadPoolExecutor, Future, wait, FIRST_COMPLETED
from datetime import datetime, timedelta
import asyncio

from .thread_pool_manager import (
    ThreadPoolManager, 
    ManagedThreadPool,
    TaskPriority, 
    TaskType, 
    TaskState,
    PrioritizedTask,
    ThreadPoolStats
)

from .thread_pool_monitor import ThreadPoolMonitor, PerformanceMetrics

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Type definitions
T = TypeVar('T')  # Task type
R = TypeVar('R')  # Result type


class TaskAffinity(Enum):
    """Affinity levels for task assignment to specific pools"""
    EXCLUSIVE = auto()  # Task must run on the specified pool type
    PREFERRED = auto()  # Task prefers the specified pool type but can run elsewhere
    COMPATIBLE = auto()  # Task can run on pools with this capability
    NEUTRAL = auto()    # Task has no specific pool affinity


class PoolCapability(Enum):
    """Capabilities that pools can support"""
    GENERAL = auto()      # General-purpose processing
    HIGH_IO = auto()      # High I/O throughput
    HIGH_CPU = auto()     # High CPU computation
    GPU = auto()          # GPU acceleration
    ML = auto()           # Machine learning optimized
    LOW_LATENCY = auto()  # Low latency requirements
    HIGH_MEMORY = auto()  # High memory requirements
    DATABASE = auto()     # Database operations
    SECURITY = auto()     # Security operations
    IPFS = auto()         # IPFS operations


@dataclass
class TaskMetadata:
    """Metadata for advanced task routing and prioritization"""
    affinity: TaskAffinity = TaskAffinity.NEUTRAL
    required_capabilities: Set[PoolCapability] = field(default_factory=set)
    preferred_capabilities: Set[PoolCapability] = field(default_factory=set)
    estimated_duration: Optional[float] = None  # Estimated task duration in seconds
    estimated_memory: Optional[int] = None      # Estimated memory usage in MB
    deadline: Optional[float] = None            # Deadline timestamp
    weight: float = 1.0                         # Weight factor for prioritization
    max_retries: int = 0                        # Number of allowed retries
    retry_count: int = 0                        # Current retry count
    created_at: float = field(default_factory=time.time)
    starvation_factor: float = 0.0              # Increases priority for waiting tasks


class ResourceProfile:
    """Profile of resource usage and availability"""
    
    def __init__(self):
        """Initialize resource profile"""
        # Available resources
        self.cpu_cores = multiprocessing.cpu_count()
        self.total_memory = self._get_system_memory()
        self.gpu_count = self._get_gpu_count()
        
        # Current utilization
        self.cpu_utilization = 0.0
        self.memory_utilization = 0.0
        self.gpu_utilization = 0.0
        
        # Historical data for trending
        self.cpu_history = []
        self.memory_history = []
        self.gpu_history = []
        
        # History window
        self.history_window = 60  # Keep 60 data points
    
    def _get_system_memory(self) -> int:
        """Get system memory in MB"""
        try:
            # Try to get memory info from OS
            import psutil
            return psutil.virtual_memory().total // (1024 * 1024)  # Convert to MB
        except (ImportError, AttributeError):
            # Fallback estimate
            return 8192  # Assume 8GB
    
    def _get_gpu_count(self) -> int:
        """Get count of available GPUs"""
        try:
            # Try to detect GPUs with torch
            import torch
            return torch.cuda.device_count() if torch.cuda.is_available() else 0
        except (ImportError, AttributeError):
            # Fallback
            return 0
    
    def update(self, cpu_util: float, memory_util: float, gpu_util: float = 0.0):
        """
        Update resource utilization metrics
        
        Args:
            cpu_util: CPU utilization (0-1)
            memory_util: Memory utilization (0-1)
            gpu_util: GPU utilization (0-1)
        """
        self.cpu_utilization = cpu_util
        self.memory_utilization = memory_util
        self.gpu_utilization = gpu_util
        
        # Add to history
        timestamp = time.time()
        self.cpu_history.append((timestamp, cpu_util))
        self.memory_history.append((timestamp, memory_util))
        self.gpu_history.append((timestamp, gpu_util))
        
        # Trim history if needed
        if len(self.cpu_history) > self.history_window:
            self.cpu_history = self.cpu_history[-self.history_window:]
            self.memory_history = self.memory_history[-self.history_window:]
            self.gpu_history = self.gpu_history[-self.history_window:]
    
    def predict_utilization(self, future_seconds: float = 60.0) -> Tuple[float, float, float]:
        """
        Predict future resource utilization
        
        Args:
            future_seconds: Seconds into the future to predict
            
        Returns:
            Tuple[float, float, float]: Predicted (CPU, memory, GPU) utilization
        """
        # Simple linear regression for prediction
        def predict_metric(history):
            if len(history) < 2:
                return history[-1][1] if history else 0.0
            
            # Use the last few points for trend
            recent = history[-10:]
            
            # Calculate slope using least squares
            n = len(recent)
            sum_x = sum(point[0] for point in recent)
            sum_y = sum(point[1] for point in recent)
            sum_xx = sum(point[0] * point[0] for point in recent)
            sum_xy = sum(point[0] * point[1] for point in recent)
            
            # Avoid division by zero
            if n * sum_xx - sum_x * sum_x == 0:
                return recent[-1][1]
                
            slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x)
            intercept = (sum_y - slope * sum_x) / n
            
            # Predict future value
            future_time = time.time() + future_seconds
            predicted_value = slope * future_time + intercept
            
            # Clip to valid range
            return max(0.0, min(1.0, predicted_value))
        
        # Predict each resource
        cpu_pred = predict_metric(self.cpu_history)
        memory_pred = predict_metric(self.memory_history)
        gpu_pred = predict_metric(self.gpu_history)
        
        return (cpu_pred, memory_pred, gpu_pred)
    
    def get_snapshot(self) -> Dict[str, Any]:
        """Get a snapshot of the resource profile"""
        return {
            "resources": {
                "cpu_cores": self.cpu_cores,
                "total_memory_mb": self.total_memory,
                "gpu_count": self.gpu_count
            },
            "utilization": {
                "cpu": self.cpu_utilization,
                "memory": self.memory_utilization,
                "gpu": self.gpu_utilization
            },
            "prediction": {
                "cpu": self.predict_utilization()[0],
                "memory": self.predict_utilization()[1],
                "gpu": self.predict_utilization()[2]
            }
        }


class EnhancedManagedThreadPool(ManagedThreadPool):
    """
    Enhanced version of the ManagedThreadPool with additional capabilities and metrics
    """
    
    def __init__(
        self, 
        pool_id: str,
        pool_type: TaskType,
        capabilities: Set[PoolCapability] = None,
        min_workers: int = 1,
        max_workers: int = None,
        worker_timeout: int = 60,
        task_timeout: int = None,
        manager = None
    ):
        """
        Initialize an enhanced managed thread pool
        
        Args:
            pool_id: Unique identifier for the pool
            pool_type: Type of tasks this pool handles
            capabilities: Set of capabilities this pool supports
            min_workers: Minimum number of worker threads
            max_workers: Maximum number of worker threads (None = no limit)
            worker_timeout: Seconds a worker can be idle before termination
            task_timeout: Default timeout for tasks in seconds (None = no timeout)
            manager: Reference to the parent ThreadPoolManager
        """
        # Call the parent constructor
        super().__init__(
            pool_id=pool_id,
            pool_type=pool_type,
            min_workers=min_workers,
            max_workers=max_workers,
            worker_timeout=worker_timeout,
            task_timeout=task_timeout,
            manager=manager
        )
        
        # Pool capabilities
        self.capabilities = capabilities or {PoolCapability.GENERAL}
        
        # Additional metrics
        self.task_latency_history = []
        self.task_success_rate = 1.0
        self.last_scale_time = time.time()
        self.scale_cooldown = 30  # Seconds between scaling operations
        
        # Task metadata store
        self.task_metadata: Dict[str, TaskMetadata] = {}
        
        # Resource tracking
        self.resource_profile = ResourceProfile()
        
        logger.info(f"Enhanced thread pool {pool_id} created with capabilities: "
                   f"{[cap.name for cap in self.capabilities]}")
    
    def submit(
        self, 
        function: Callable[..., R],
        *args,
        priority: TaskPriority = TaskPriority.NORMAL,
        timeout: Optional[float] = None,
        metadata: TaskMetadata = None,
        **kwargs
    ) -> Tuple[str, Future]:
        """
        Submit a task to the thread pool with enhanced metadata
        
        Args:
            function: The function to execute
            *args: Arguments to pass to the function
            priority: Priority of the task
            timeout: Timeout for the task in seconds (overrides pool default if set)
            metadata: Additional task metadata for routing and prioritization
            **kwargs: Keyword arguments to pass to the function
            
        Returns:
            Tuple[str, Future]: Task ID and Future object for the task
        """
        # Call the parent method to submit the task
        task_id, future = super().submit(
            function=function,
            *args,
            priority=priority,
            timeout=timeout,
            **kwargs
        )
        
        # Store the task metadata if provided
        if metadata:
            self.task_metadata[task_id] = metadata
        else:
            # Create default metadata
            self.task_metadata[task_id] = TaskMetadata()
        
        return task_id, future
    
    def update_task_metadata(self, task_id: str, metadata: TaskMetadata) -> bool:
        """
        Update the metadata for a task
        
        Args:
            task_id: ID of the task to update
            metadata: New task metadata
            
        Returns:
            bool: True if the task was found and updated
        """
        if task_id in self.active_tasks:
            self.task_metadata[task_id] = metadata
            return True
        return False
    
    def get_task_metadata(self, task_id: str) -> Optional[TaskMetadata]:
        """
        Get metadata for a task
        
        Args:
            task_id: ID of the task
            
        Returns:
            Optional[TaskMetadata]: The task metadata or None if not found
        """
        return self.task_metadata.get(task_id)
    
    def can_handle_task(self, metadata: TaskMetadata) -> bool:
        """
        Check if this pool can handle a task based on its metadata
        
        Args:
            metadata: Task metadata
            
        Returns:
            bool: True if this pool can handle the task
        """
        # Check if the task requires capabilities we don't have
        for required_cap in metadata.required_capabilities:
            if required_cap not in self.capabilities:
                return False
        
        # Check if the task has exclusive affinity to another task type
        if (metadata.affinity == TaskAffinity.EXCLUSIVE and 
            self.pool_type != metadata.required_task_type):
            return False
        
        return True
    
    def calculate_fitness_score(self, metadata: TaskMetadata) -> float:
        """
        Calculate a fitness score for handling this task
        Higher score means better fit
        
        Args:
            metadata: Task metadata
            
        Returns:
            float: Fitness score (0-1)
        """
        # Base score
        score = 0.5
        
        # Check capabilities
        required_caps = len(metadata.required_capabilities)
        supported_required = sum(1 for cap in metadata.required_capabilities if cap in self.capabilities)
        
        # If we can't satisfy all required capabilities, return 0
        if required_caps > 0 and supported_required < required_caps:
            return 0.0
        
        # Preferred capabilities boost
        preferred_caps = len(metadata.preferred_capabilities)
        if preferred_caps > 0:
            supported_preferred = sum(1 for cap in metadata.preferred_capabilities if cap in self.capabilities)
            score += (supported_preferred / preferred_caps) * 0.3
        
        # Affinity check
        if metadata.affinity == TaskAffinity.EXCLUSIVE:
            score = 1.0 if self.pool_type == metadata.required_task_type else 0.0
        elif metadata.affinity == TaskAffinity.PREFERRED:
            score += 0.3 if self.pool_type == metadata.required_task_type else 0.0
        
        # Current load reduces score - we want to balance across pools
        utilization = self.stats.active_workers / max(1, self.current_worker_count)
        score -= utilization * 0.2  # Reduce score by up to 0.2 based on utilization
        
        # Queue depth reduces score - we want to avoid overloaded pools
        norm_queue_depth = min(1.0, self.stats.queue_size / 10)  # Normalize queue depth
        score -= norm_queue_depth * 0.1  # Reduce score by up to 0.1 based on queue depth
        
        # Ensure the score is in the valid range
        return max(0.0, min(1.0, score))
    
    def update_resource_profile(self):
        """Update the resource profile with current utilization"""
        # Calculate CPU utilization (active workers / total workers)
        cpu_util = self.stats.active_workers / max(1, self.current_worker_count)
        
        # We don't have direct memory metrics, so estimate based on active tasks
        memory_util = min(1.0, self.stats.active_workers / max(1, self.resource_profile.cpu_cores))
        
        # GPU utilization (if applicable)
        gpu_util = 0.0
        if PoolCapability.GPU in self.capabilities and self.resource_profile.gpu_count > 0:
            # Estimate GPU utilization based on active workers with GPU tasks
            gpu_tasks = sum(1 for task_id in self.active_tasks 
                           if PoolCapability.GPU in self.task_metadata.get(task_id, TaskMetadata()).required_capabilities)
            gpu_util = min(1.0, gpu_tasks / max(1, self.resource_profile.gpu_count))
        
        # Update the profile
        self.resource_profile.update(cpu_util, memory_util, gpu_util)
    
    def _auto_scale(self):
        """Enhanced auto-scaling with cooldown and resource prediction"""
        while self.running:
            try:
                # Check every 5 seconds
                time.sleep(5)
                
                # Update resource profile
                self.update_resource_profile()
                
                with self.scaling_lock:
                    # Check if cooldown period has elapsed
                    current_time = time.time()
                    if current_time - self.last_scale_time < self.scale_cooldown:
                        continue
                    
                    # Get current stats
                    pending_tasks = self.stats.tasks_pending
                    active_workers = self.stats.active_workers
                    current_workers = self.current_worker_count
                    
                    # Get resource predictions
                    cpu_pred, _, _ = self.resource_profile.predict_utilization(future_seconds=15)
                    
                    # Calculate desired worker count based on current load and predicted trend
                    utilization = active_workers / max(1, current_workers)
                    utilization_trend = cpu_pred - utilization  # Positive means increasing utilization
                    
                    # Scale up if there are pending tasks or we predict increasing utilization
                    if (pending_tasks > 0 or utilization_trend > 0.1) and current_workers < self.max_workers:
                        # Scale up to handle pending tasks, but don't exceed max_workers
                        workers_for_pending = min(current_workers + pending_tasks, self.max_workers)
                        
                        # Scale up for predicted load increase if significant
                        trend_factor = max(0, utilization_trend * 5)  # Convert trend to worker count adjustment
                        workers_for_trend = min(current_workers + int(trend_factor * current_workers), self.max_workers)
                        
                        # Take the maximum of the two scaling strategies
                        new_workers = max(workers_for_pending, workers_for_trend)
                        
                        if new_workers > current_workers:
                            logger.info(f"Scaling up pool {self.pool_id} from {current_workers} "
                                       f"to {new_workers} workers (pending: {pending_tasks}, trend: {utilization_trend:.2f})")
                            
                            # Create a new executor with the increased worker count
                            new_executor = ThreadPoolExecutor(
                                max_workers=new_workers,
                                thread_name_prefix=f"pool-{self.pool_id}"
                            )
                            
                            # Replace the existing executor (old tasks continue in the old executor)
                            self.executor = new_executor
                            self.current_worker_count = new_workers
                            self.stats.update_worker_count(new_workers)
                            self.last_scale_time = current_time
                    
                    # Scale down if we have idle workers, low predicted utilization, and we're above min_workers
                    elif current_workers > self.min_workers:
                        # Calculate idle workers
                        idle_workers = current_workers - active_workers
                        
                        # Only scale down if we have significant idle capacity and predict stable/decreasing utilization
                        if idle_workers > max(2, current_workers // 4) and utilization_trend <= 0:
                            # Scale down but maintain min_workers and some buffer
                            new_workers = max(self.min_workers, active_workers + 2)
                            
                            if new_workers < current_workers:
                                logger.info(f"Scaling down pool {self.pool_id} from {current_workers} "
                                           f"to {new_workers} workers (idle: {idle_workers}, trend: {utilization_trend:.2f})")
                                
                                # Create a new executor with the decreased worker count
                                new_executor = ThreadPoolExecutor(
                                    max_workers=new_workers,
                                    thread_name_prefix=f"pool-{self.pool_id}"
                                )
                                
                                # Replace the existing executor
                                self.executor = new_executor
                                self.current_worker_count = new_workers
                                self.stats.update_worker_count(new_workers)
                                self.last_scale_time = current_time
            
            except Exception as e:
                logger.error(f"Error in enhanced auto-scaling for pool {self.pool_id}: {e}")
    
    def get_enhanced_stats(self) -> Dict[str, Any]:
        """Get enhanced statistics for the pool"""
        # Get base stats
        stats = self.get_stats()
        
        # Add enhanced stats
        stats["capabilities"] = [cap.name for cap in self.capabilities]
        stats["resource_profile"] = self.resource_profile.get_snapshot()
        stats["task_success_rate"] = self.task_success_rate
        stats["last_scale_time"] = self.last_scale_time
        
        return stats


class AdvancedThreadPoolManager(ThreadPoolManager):
    """
    Advanced manager for multiple thread pools with sophisticated task routing and load balancing
    
    This class extends the base ThreadPoolManager with:
    - Task routing based on pool capabilities and current load
    - Load balancing across pools with similar capabilities
    - Dynamic task prioritization with aging to prevent starvation
    - Cross-pool task migration for optimal resource utilization
    - Resource usage prediction for proactive scaling
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the Advanced Thread Pool Manager
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        # Call parent constructor for basic initialization
        super().__init__(resources, metadata)
        
        # Override config with advanced settings
        self.config.update({
            "enable_adaptive_routing": self.metadata.get("enable_adaptive_routing", True),
            "enable_task_migration": self.metadata.get("enable_task_migration", True),
            "enable_aging": self.metadata.get("enable_aging", True),
            "aging_factor": self.metadata.get("aging_factor", 0.05),  # Priority boost per second of waiting
            "migration_interval": self.metadata.get("migration_interval", 30),  # Seconds between migration checks
            "starvation_threshold": self.metadata.get("starvation_threshold", 60),  # Seconds before considering starvation
            "pool_overload_threshold": self.metadata.get("pool_overload_threshold", 0.85),  # Utilization threshold for overload
            "specialization_factor": self.metadata.get("specialization_factor", 0.7),  # How strongly to favor specialized pools
            "use_enhanced_pools": self.metadata.get("use_enhanced_pools", True)
        })
        
        # Pool organization
        self.pools_by_capability: Dict[PoolCapability, List[EnhancedManagedThreadPool]] = {}
        
        # Task routing history for adaptive routing
        self.routing_history: Dict[TaskType, Dict[str, int]] = {}
        for task_type in TaskType:
            self.routing_history[task_type] = {}
        
        # Task metadata store
        self.task_metadata: Dict[str, TaskMetadata] = {}
        
        # System resource profile
        self.system_resource_profile = ResourceProfile()
        
        # Migration thread
        self.migration_thread = None
        self.migration_stop_event = threading.Event()
        
        # Aging thread
        self.aging_thread = None
        self.aging_stop_event = threading.Event()
        
        # Override pool storage for enhanced pools
        if self.config["use_enhanced_pools"]:
            self.pools: Dict[TaskType, EnhancedManagedThreadPool] = {}
            self.pools_by_id: Dict[str, EnhancedManagedThreadPool] = {}
        
        # Create default pools if configured
        if self.config["auto_create_pools"]:
            self._create_enhanced_default_pools()
        
        # Start management threads
        self._start_management_threads()
        
        logger.info(f"AdvancedThreadPoolManager initialized with config: {self.config}")
    
    def _create_enhanced_default_pools(self):
        """Create default enhanced pools for each task type with appropriate capabilities"""
        with self.lock:
            # Clear existing pools
            self.pools.clear()
            self.pools_by_id.clear()
            self.pools_by_capability.clear()
            
            # Create general-purpose pool with balanced configuration
            general_pool = self.create_pool(
                pool_id="general",
                pool_type=TaskType.GENERAL,
                min_workers=self.config["default_min_workers"],
                max_workers=self.config["default_max_workers"],
                capabilities={PoolCapability.GENERAL}
            )
            
            # Create I/O-bound pool with more workers
            io_max_workers = self.config["default_max_workers"] * 2  # More workers for I/O
            io_pool = self.create_pool(
                pool_id="io",
                pool_type=TaskType.IO,
                min_workers=self.config["default_min_workers"],
                max_workers=io_max_workers,
                capabilities={PoolCapability.GENERAL, PoolCapability.HIGH_IO}
            )
            
            # Create CPU-bound pool with worker count based on CPU cores
            cpu_max_workers = max(1, multiprocessing.cpu_count())  # One per CPU core
            cpu_pool = self.create_pool(
                pool_id="cpu",
                pool_type=TaskType.CPU,
                min_workers=min(self.config["default_min_workers"], cpu_max_workers),
                max_workers=cpu_max_workers,
                capabilities={PoolCapability.GENERAL, PoolCapability.HIGH_CPU}
            )
            
            # Create ML pool with GPU capabilities if available
            gpu_caps = {PoolCapability.GENERAL, PoolCapability.ML}
            try:
                # Try to detect GPUs with torch
                import torch
                gpu_count = torch.cuda.device_count() if torch.cuda.is_available() else 0
                if gpu_count > 0:
                    gpu_caps.add(PoolCapability.GPU)
            except (ImportError, AttributeError):
                gpu_count = 0
            
            ml_max_workers = max(1, gpu_count if gpu_count > 0 else cpu_max_workers // 2)
            ml_pool = self.create_pool(
                pool_id="ml",
                pool_type=TaskType.ML,
                min_workers=min(self.config["default_min_workers"], ml_max_workers),
                max_workers=ml_max_workers,
                capabilities=gpu_caps
            )
            
            # Create IPFS pool (network I/O intensive)
            ipfs_pool = self.create_pool(
                pool_id="ipfs",
                pool_type=TaskType.IPFS,
                min_workers=self.config["default_min_workers"],
                max_workers=io_max_workers,  # Same as regular I/O pool
                capabilities={PoolCapability.GENERAL, PoolCapability.HIGH_IO, PoolCapability.IPFS}
            )
            
            # Create database pool (mixed I/O and CPU)
            db_max_workers = max(1, multiprocessing.cpu_count() + 2)  # Slightly more than CPU count
            db_pool = self.create_pool(
                pool_id="database",
                pool_type=TaskType.DATABASE,
                min_workers=self.config["default_min_workers"],
                max_workers=db_max_workers,
                capabilities={PoolCapability.GENERAL, PoolCapability.HIGH_IO, PoolCapability.DATABASE}
            )
            
            # Create security pool (CPU-intensive but potentially blocking)
            security_pool = self.create_pool(
                pool_id="security",
                pool_type=TaskType.SECURITY,
                min_workers=self.config["default_min_workers"],
                max_workers=cpu_max_workers,
                capabilities={PoolCapability.GENERAL, PoolCapability.SECURITY}
            )
            
            logger.info(f"Created enhanced default thread pools for all task types")
    
    def create_pool(
        self,
        pool_id: str,
        pool_type: TaskType,
        min_workers: int = None,
        max_workers: int = None,
        worker_timeout: int = None,
        task_timeout: int = None,
        capabilities: Set[PoolCapability] = None
    ) -> EnhancedManagedThreadPool:
        """
        Create a new enhanced thread pool
        
        Args:
            pool_id: Unique identifier for the pool
            pool_type: Type of tasks this pool handles
            min_workers: Minimum number of worker threads
            max_workers: Maximum number of worker threads
            worker_timeout: Seconds a worker can be idle before termination
            task_timeout: Default timeout for tasks in seconds
            capabilities: Set of capabilities this pool provides
            
        Returns:
            EnhancedManagedThreadPool: The created thread pool
        """
        with self.lock:
            # Use default values if not specified
            min_workers = min_workers if min_workers is not None else self.config["default_min_workers"]
            max_workers = max_workers if max_workers is not None else self.config["default_max_workers"]
            worker_timeout = worker_timeout if worker_timeout is not None else self.config["worker_timeout"]
            task_timeout = task_timeout if task_timeout is not None else self.config["task_timeout"]
            
            # Add default capabilities if none specified
            if capabilities is None:
                capabilities = {PoolCapability.GENERAL}
                
                # Add type-specific capability
                if pool_type == TaskType.IO:
                    capabilities.add(PoolCapability.HIGH_IO)
                elif pool_type == TaskType.CPU:
                    capabilities.add(PoolCapability.HIGH_CPU)
                elif pool_type == TaskType.ML:
                    capabilities.add(PoolCapability.ML)
                elif pool_type == TaskType.IPFS:
                    capabilities.add(PoolCapability.IPFS)
                elif pool_type == TaskType.DATABASE:
                    capabilities.add(PoolCapability.DATABASE)
                elif pool_type == TaskType.SECURITY:
                    capabilities.add(PoolCapability.SECURITY)
            
            # Create the enhanced pool
            pool = EnhancedManagedThreadPool(
                pool_id=pool_id,
                pool_type=pool_type,
                capabilities=capabilities,
                min_workers=min_workers,
                max_workers=max_workers,
                worker_timeout=worker_timeout,
                task_timeout=task_timeout,
                manager=self
            )
            
            # Store the pool
            self.pools_by_id[pool_id] = pool
            self.pools[pool_type] = pool
            
            # Index by capability
            for capability in capabilities:
                if capability not in self.pools_by_capability:
                    self.pools_by_capability[capability] = []
                self.pools_by_capability[capability].append(pool)
            
            return pool
    
    def _start_management_threads(self):
        """Start management threads for task migration and aging"""
        if self.config["enable_task_migration"]:
            self.migration_stop_event.clear()
            self.migration_thread = threading.Thread(
                target=self._task_migration_loop,
                name="task-migration",
                daemon=True
            )
            self.migration_thread.start()
        
        if self.config["enable_aging"]:
            self.aging_stop_event.clear()
            self.aging_thread = threading.Thread(
                target=self._task_aging_loop,
                name="task-aging",
                daemon=True
            )
            self.aging_thread.start()
    
    def shutdown(self, wait: bool = True):
        """
        Shutdown all thread pools and management threads
        
        Args:
            wait: If True, wait for tasks to complete before shutting down
        """
        # Stop management threads
        self.migration_stop_event.set()
        self.aging_stop_event.set()
        
        if self.migration_thread:
            self.migration_thread.join(timeout=10.0)
        
        if self.aging_thread:
            self.aging_thread.join(timeout=10.0)
        
        # Call parent shutdown
        super().shutdown(wait=wait)
    
    def submit(
        self,
        function: Callable[..., R],
        *args,
        task_type: TaskType = TaskType.GENERAL,
        priority: TaskPriority = TaskPriority.NORMAL,
        timeout: Optional[float] = None,
        metadata: TaskMetadata = None,
        pool_id: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Future]:
        """
        Submit a task to the appropriate thread pool with enhanced routing
        
        Args:
            function: The function to execute
            *args: Arguments to pass to the function
            task_type: Type of task for pool selection
            priority: Priority of the task
            timeout: Timeout for the task in seconds
            metadata: Additional task metadata for routing and prioritization
            pool_id: Optional ID of the specific pool to use
            **kwargs: Keyword arguments to pass to the function
            
        Returns:
            Tuple[str, Future]: Task ID and Future object for the task
        """
        # Create default metadata if not provided
        if metadata is None:
            metadata = TaskMetadata()
        
        # Store task ID as we'll need it before actually creating the task
        task_id = str(uuid.uuid4())
        
        with self.lock:
            # If a specific pool is requested, use it
            if pool_id and pool_id in self.pools_by_id:
                pool = self.pools_by_id[pool_id]
            else:
                # Perform intelligent routing
                pool = self._route_task(task_type, metadata)
            
            # Store metadata centrally
            self.task_metadata[task_id] = metadata
            
            # Submit to the selected pool
            task_id, future = pool.submit(
                function=function,
                *args,
                priority=priority,
                timeout=timeout,
                metadata=metadata,
                **kwargs
            )
            
            # Update routing history for this task type
            if pool.pool_id not in self.routing_history[task_type]:
                self.routing_history[task_type][pool.pool_id] = 0
            self.routing_history[task_type][pool.pool_id] += 1
            
            return task_id, future
    
    def _route_task(self, task_type: TaskType, metadata: TaskMetadata) -> EnhancedManagedThreadPool:
        """
        Route a task to the appropriate pool based on type, metadata, and load
        
        Args:
            task_type: Type of task for pool selection
            metadata: Task metadata for routing decisions
            
        Returns:
            EnhancedManagedThreadPool: The selected pool
        """
        # First, handle exclusive affinity
        if metadata.affinity == TaskAffinity.EXCLUSIVE:
            # Must use the specific pool type
            if task_type in self.pools:
                return self.pools[task_type]
            # Fall back to creating the pool if needed
            if self.config["auto_create_pools"]:
                pool_id = task_type.name.lower()
                return self.create_pool(
                    pool_id=pool_id,
                    pool_type=task_type
                )
            # Fall back to general pool if we can't create a specific one
            return self.pools.get(TaskType.GENERAL, next(iter(self.pools.values())))
        
        # For adaptive routing, find the best pool based on capabilities and load
        if self.config["enable_adaptive_routing"]:
            candidate_pools = []
            
            # Start with pools of the matching type
            if task_type in self.pools:
                candidate_pools.append(self.pools[task_type])
            
            # Add pools with required capabilities
            for capability in metadata.required_capabilities:
                if capability in self.pools_by_capability:
                    for pool in self.pools_by_capability[capability]:
                        if pool not in candidate_pools:
                            candidate_pools.append(pool)
            
            # If no candidates yet, add pools with preferred capabilities
            if not candidate_pools and metadata.preferred_capabilities:
                for capability in metadata.preferred_capabilities:
                    if capability in self.pools_by_capability:
                        for pool in self.pools_by_capability[capability]:
                            if pool not in candidate_pools:
                                candidate_pools.append(pool)
            
            # If still no candidates, fall back to all pools
            if not candidate_pools:
                candidate_pools = list(self.pools_by_id.values())
            
            # Calculate fitness scores for each candidate
            scores = []
            for pool in candidate_pools:
                if isinstance(pool, EnhancedManagedThreadPool):
                    score = pool.calculate_fitness_score(metadata)
                else:
                    # Basic score for non-enhanced pools
                    score = 0.5 if pool.pool_type == task_type else 0.3
                    # Reduce score based on utilization
                    utilization = pool.stats.active_workers / max(1, pool.current_worker_count)
                    score -= utilization * 0.2
                
                scores.append((pool, score))
            
            # Sort by fitness score (highest first)
            scores.sort(key=lambda x: x[1], reverse=True)
            
            # Return the best pool if it has a non-zero score
            if scores and scores[0][1] > 0:
                return scores[0][0]
        
        # Fallback to default routing
        if task_type in self.pools:
            return self.pools[task_type]
        
        # Fall back to general pool or create a new one
        if TaskType.GENERAL in self.pools:
            return self.pools[TaskType.GENERAL]
        
        # Last resort: use any pool
        if self.pools:
            return next(iter(self.pools.values()))
        
        # Create a general pool if none exist
        return self.create_pool(
            pool_id="general",
            pool_type=TaskType.GENERAL
        )
    
    def _task_migration_loop(self):
        """Background thread for task migration between pools"""
        logger.info("Task migration thread started")
        
        try:
            while not self.migration_stop_event.is_set():
                try:
                    # Run migration check at configured interval
                    self.migration_stop_event.wait(self.config["migration_interval"])
                    if self.migration_stop_event.is_set():
                        break
                    
                    # Perform migration check
                    self._check_for_migration_opportunities()
                    
                except Exception as e:
                    logger.error(f"Error in task migration loop: {e}")
        finally:
            logger.info("Task migration thread stopped")
    
    def _check_for_migration_opportunities(self):
        """Check for opportunities to migrate tasks between pools"""
        with self.lock:
            # Skip if not enough pools
            if len(self.pools_by_id) < 2:
                return
            
            # Find overloaded and underloaded pools
            overloaded_pools = []
            underloaded_pools = []
            
            for pool in self.pools_by_id.values():
                # Calculate utilization
                utilization = pool.stats.active_workers / max(1, pool.current_worker_count)
                
                if utilization > self.config["pool_overload_threshold"]:
                    overloaded_pools.append(pool)
                elif utilization < 0.5 and pool.current_worker_count > pool.min_workers:
                    underloaded_pools.append(pool)
            
            # No migration opportunities if no overloaded or underloaded pools
            if not overloaded_pools or not underloaded_pools:
                return
            
            # Check each overloaded pool for tasks that could be migrated
            for source_pool in overloaded_pools:
                # Skip if no underloaded pools left
                if not underloaded_pools:
                    break
                
                # Find pending tasks in the overloaded pool
                pending_tasks = []
                
                for task_id, task in source_pool.active_tasks.items():
                    if task.state == TaskState.PENDING:
                        metadata = source_pool.get_task_metadata(task_id) or self.task_metadata.get(task_id)
                        if metadata:
                            pending_tasks.append((task_id, task, metadata))
                
                # Sort tasks by priority (lower number = higher priority)
                pending_tasks.sort(key=lambda t: t[1].priority)
                
                # Start with low priority tasks for migration
                for task_id, task, metadata in reversed(pending_tasks):
                    # Find the best target pool
                    best_target = None
                    best_score = 0
                    
                    for target_pool in underloaded_pools:
                        if isinstance(target_pool, EnhancedManagedThreadPool):
                            score = target_pool.calculate_fitness_score(metadata)
                            if score > best_score:
                                best_score = score
                                best_target = target_pool
                        else:
                            # Basic score for non-enhanced pools
                            score = 0.5 if target_pool.pool_type == task.task_type else 0.3
                            if score > best_score:
                                best_score = score
                                best_target = target_pool
                    
                    # Migrate if we found a suitable target with reasonable score
                    if best_target and best_score > 0.3:
                        # Create a new task wrapper
                        def migrate_task_wrapper():
                            return task.function(*task.args, **task.kwargs)
                        
                        # Cancel the task in the source pool
                        source_pool.cancel_task(task_id)
                        
                        # Submit to the target pool
                        new_task_id, new_future = best_target.submit(
                            function=migrate_task_wrapper,
                            priority=TaskPriority(task.priority),
                            timeout=task.timeout,
                            metadata=metadata
                        )
                        
                        # Link the futures to maintain the contract with the client
                        def on_complete(f):
                            try:
                                result = f.result()
                                task.future.set_result(result)
                            except Exception as e:
                                task.future.set_exception(e)
                        
                        new_future.add_done_callback(on_complete)
                        
                        logger.info(f"Migrated task {task_id} from pool {source_pool.pool_id} to pool {best_target.pool_id}")
                        
                        # Update pool utilization estimates
                        source_utilization = source_pool.stats.active_workers / max(1, source_pool.current_worker_count)
                        target_utilization = best_target.stats.active_workers / max(1, best_target.current_worker_count)
                        
                        # Remove source pool from overloaded if it's no longer overloaded
                        if source_utilization - (1 / max(1, source_pool.current_worker_count)) <= self.config["pool_overload_threshold"]:
                            overloaded_pools.remove(source_pool)
                            break
                        
                        # Remove target pool from underloaded if it's no longer underloaded
                        if target_utilization + (1 / max(1, best_target.current_worker_count)) >= 0.5:
                            underloaded_pools.remove(best_target)
                            if not underloaded_pools:
                                break
    
    def _task_aging_loop(self):
        """Background thread for task aging to prevent starvation"""
        logger.info("Task aging thread started")
        
        try:
            while not self.aging_stop_event.is_set():
                try:
                    # Run aging check every second
                    self.aging_stop_event.wait(1.0)
                    if self.aging_stop_event.is_set():
                        break
                    
                    # Apply aging to waiting tasks
                    self._apply_task_aging()
                    
                except Exception as e:
                    logger.error(f"Error in task aging loop: {e}")
        finally:
            logger.info("Task aging thread stopped")
    
    def _apply_task_aging(self):
        """Apply aging to waiting tasks to prevent starvation"""
        current_time = time.time()
        aging_factor = self.config["aging_factor"]
        
        with self.lock:
            for pool in self.pools_by_id.values():
                # Check for tasks that are waiting and apply aging
                pending_tasks = [
                    (task_id, task)
                    for task_id, task in list(pool.active_tasks.items())
                    if task.state == TaskState.PENDING
                ]

                for task_id, task in pending_tasks:
                    if task.state == TaskState.PENDING:
                        # Calculate waiting time
                        waiting_time = current_time - task.created_at
                        
                        # Apply aging if task has been waiting long enough
                        if waiting_time > self.config["starvation_threshold"]:
                            # Get metadata
                            metadata = pool.get_task_metadata(task_id) or self.task_metadata.get(task_id)
                            
                            if metadata:
                                # Calculate starvation factor
                                starvation_boost = waiting_time * aging_factor
                                
                                # Limit boost to avoid excessive priority inversion
                                starvation_boost = min(starvation_boost, 3.0)
                                
                                # Update metadata
                                metadata.starvation_factor = starvation_boost
                                
                                # Check if we need to boost task priority.
                                # Compute boosted_priority using the same formula used when
                                # constructing PrioritizedTask so that the guard condition and
                                # the actual new value are always consistent.  Previously the
                                # condition used int(priority - boost) while the constructor
                                # used max(0, priority - int(boost)); for boost < 1.0 the
                                # condition evaluated True but the new priority was unchanged,
                                # causing the task to be re-enqueued with an identical priority
                                # every aging tick.
                                # PriorityQueue does not support in-place re-prioritization,
                                # so we add a new copy with the higher priority and mark
                                # the old entry as CANCELLED so the worker skips it.
                                # We only requeue when the integer priority level actually
                                # improves to avoid churning the queue with no-op requeues.
                                boosted_priority = max(0, task.priority - int(starvation_boost))
                                if boosted_priority < task.priority:
                                    # New priority is higher (lower numeric value); resubmit.
                                    # PriorityQueue ordering is stable by insertion for equal
                                    # priorities, so cancelling the old entry and inserting a
                                    # new one is the only way to move a task forward.
                                    
                                    # Create a new prioritized task with boosted priority
                                    current_queue = getattr(pool, "task_queue", None)
                                    if isinstance(current_queue, PriorityQueue):
                                        current_task = pool.active_tasks.get(task_id)
                                        if current_task is not task or task.state != TaskState.PENDING:
                                            continue

                                        # Create a new task wrapper with the same ID
                                        boosted_task = PrioritizedTask(
                                            priority=boosted_priority,
                                            task_id=task.task_id,
                                            task_type=task.task_type,
                                            function=task.function,
                                            args=task.args,
                                            kwargs=task.kwargs,
                                            created_at=task.created_at,
                                            timeout=task.timeout,
                                            state=TaskState.PENDING,
                                            future=task.future
                                        )
                                        
                                        # Invalidate the original task so the worker skips it when
                                        # dequeued.  The worker checks for CANCELLED state and
                                        # calls task_done() without executing the function, which
                                        # prevents the same logical task from running twice.
                                        task.state = TaskState.CANCELLED
                                        current_queue.put(boosted_task)
                                        
                                        # Update the active tasks record
                                        pool.active_tasks[task_id] = boosted_task
                                        
                                        logger.debug(f"Boosted priority of waiting task {task_id} in pool {pool.pool_id} "
                                                   f"from {task.priority} to {boosted_task.priority} due to waiting {waiting_time:.1f}s")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get comprehensive statistics for all pools"""
        with self.lock:
            # Get basic stats from parent
            stats = super().get_stats()
            
            # Add enhanced stats
            stats["config"].update({
                "enable_adaptive_routing": self.config["enable_adaptive_routing"],
                "enable_task_migration": self.config["enable_task_migration"],
                "enable_aging": self.config["enable_aging"],
                "aging_factor": self.config["aging_factor"],
                "use_enhanced_pools": self.config["use_enhanced_pools"]
            })
            
            # Add routing statistics
            stats["routing"] = {
                task_type.name: self.routing_history[task_type]
                for task_type in TaskType
                if self.routing_history[task_type]
            }
            
            # Add enhanced pool stats if available
            if self.config["use_enhanced_pools"]:
                stats["enhanced_pools"] = {
                    pool_id: pool.get_enhanced_stats() if hasattr(pool, "get_enhanced_stats") else pool.get_stats()
                    for pool_id, pool in self.pools_by_id.items()
                }
            
            # Add capability-based organization
            stats["capabilities"] = {
                capability.name: [pool.pool_id for pool in pools]
                for capability, pools in self.pools_by_capability.items()
            }
            
            return stats
    
    async def test(self) -> Dict[str, Any]:
        """
        Run module tests
        
        Returns:
            Dict[str, Any]: Test results
        """
        logger.info("Testing Advanced Thread Pool Manager")
        
        test_results = {
            "success": False,
            "module": "advanced_thread_pool_manager",
            "steps": {},
            "diagnostics": {
                "config": self.config,
                "capabilities": {
                    capability.name: [pool.pool_id for pool in pools]
                    for capability, pools in self.pools_by_capability.items()
                }
            }
        }
        
        try:
            # Test 1: Create enhanced pools
            test_results["steps"]["create_enhanced_pools"] = {
                "success": len(self.pools) > 0,
                "message": f"Created {len(self.pools)} enhanced pools"
            }
            
            if len(self.pools) == 0:
                test_results["success"] = False
                return test_results
            
            # Test 2: Task routing with capabilities
            io_metadata = TaskMetadata(
                required_capabilities={PoolCapability.HIGH_IO},
                affinity=TaskAffinity.PREFERRED
            )
            
            cpu_metadata = TaskMetadata(
                required_capabilities={PoolCapability.HIGH_CPU},
                affinity=TaskAffinity.PREFERRED
            )
            
            # Define test functions
            def io_test_task(sleep_time):
                time.sleep(sleep_time)
                return f"IO task completed after {sleep_time}s"
            
            def cpu_test_task(iterations):
                result = 0
                for i in range(iterations):
                    result += i
                return result
            
            # Submit tasks with specific capabilities
            io_task_id, io_future = self.submit(
                function=io_test_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.NORMAL,
                metadata=io_metadata
            )
            
            cpu_task_id, cpu_future = self.submit(
                function=cpu_test_task,
                iterations=100000,
                task_type=TaskType.CPU,
                priority=TaskPriority.NORMAL,
                metadata=cpu_metadata
            )
            
            # Wait for tasks to complete
            import concurrent.futures
            results = list(concurrent.futures.as_completed([io_future, cpu_future]))
            
            # Check routing
            io_task_pool = None
            cpu_task_pool = None
            
            for pool_id, pool in self.pools_by_id.items():
                # Skip non-enhanced pools
                if not hasattr(pool, "task_metadata"):
                    continue
                    
                if io_task_id in pool.task_metadata:
                    io_task_pool = pool_id
                if cpu_task_id in pool.task_metadata:
                    cpu_task_pool = pool_id
            
            io_routing_correct = io_task_pool and "io" in io_task_pool.lower()
            cpu_routing_correct = cpu_task_pool and "cpu" in cpu_task_pool.lower()
            
            test_results["steps"]["capability_routing"] = {
                "success": io_routing_correct and cpu_routing_correct,
                "message": f"Capability-based routing {'successful' if (io_routing_correct and cpu_routing_correct) else 'failed'}",
                "details": {
                    "io_task_routed_to": io_task_pool,
                    "cpu_task_routed_to": cpu_task_pool
                }
            }
            
            # Test 3: Priority ordering with aging
            if self.config["enable_aging"]:
                # Create tasks with different priorities
                priorities = [
                    (TaskPriority.LOW, "low"),
                    (TaskPriority.NORMAL, "normal"),
                    (TaskPriority.HIGH, "high"),
                    (TaskPriority.CRITICAL, "critical")
                ]
                
                # Use a shared result list to verify execution order
                result_list = []
                
                def priority_test_function(priority_name):
                    # Add to result list
                    result_list.append(priority_name)
                    time.sleep(0.1)  # Ensure all tasks are submitted before any completes
                    return priority_name
                
                # Submit tasks in reverse priority order (low priority first)
                futures = []
                
                for priority, name in reversed(priorities):
                    _, future = self.submit(
                        function=priority_test_function,
                        priority=priority,
                        priority_name=name
                    )
                    futures.append(future)
                
                # Wait for all tasks to complete
                for future in concurrent.futures.as_completed(futures):
                    try:
                        future.result()
                    except Exception as e:
                        logger.error(f"Task failed: {e}")
                
                # Check if results were in priority order
                expected_order = [p[1] for p in priorities]
                priority_test_success = result_list == expected_order
                
                test_results["steps"]["priority_with_aging"] = {
                    "success": priority_test_success,
                    "message": f"Priority ordering with aging {'correct' if priority_test_success else 'incorrect'}",
                    "details": {
                        "expected_order": expected_order,
                        "actual_order": result_list
                    }
                }
            else:
                test_results["steps"]["priority_with_aging"] = {
                    "success": True,
                    "message": "Aging disabled, skipping test"
                }
            
            # Test 4: Test with different task types
            task_types = [TaskType.GENERAL, TaskType.IO, TaskType.CPU, TaskType.ML, 
                         TaskType.IPFS, TaskType.DATABASE, TaskType.SECURITY]
            
            futures_by_type = {}
            
            for task_type in task_types:
                task_id, future = self.submit(
                    function=lambda t=task_type: f"Task for {t.name}",
                    task_type=task_type
                )
                futures_by_type[task_type] = future
            
            # Wait for all tasks
            for task_type, future in futures_by_type.items():
                try:
                    result = future.result(timeout=5.0)
                    futures_by_type[task_type] = result
                except Exception as e:
                    futures_by_type[task_type] = f"Error: {e}"
            
            # Check if all tasks ran
            all_tasks_ran = all(isinstance(result, str) and "Error" not in result 
                               for result in futures_by_type.values())
            
            test_results["steps"]["multiple_task_types"] = {
                "success": all_tasks_ran,
                "message": f"Tasks for different types {'all completed successfully' if all_tasks_ran else 'had errors'}",
                "details": {
                    task_type.name: result for task_type, result in futures_by_type.items()
                }
            }
            
            # Test 5: Load test with many concurrent tasks
            load_test_count = 50
            load_futures = []
            
            test_start = time.time()
            
            for i in range(load_test_count):
                # Alternate between CPU and IO tasks
                if i % 2 == 0:
                    _, future = self.submit(
                        function=cpu_test_task,
                        iterations=10000,
                        task_type=TaskType.CPU
                    )
                else:
                    _, future = self.submit(
                        function=io_test_task,
                        sleep_time=0.05,
                        task_type=TaskType.IO
                    )
                load_futures.append(future)
            
            # Wait for all to complete
            load_results = []
            for future in concurrent.futures.as_completed(load_futures):
                try:
                    result = future.result()
                    load_results.append(True)
                except Exception as e:
                    logger.error(f"Load test task failed: {e}")
                    load_results.append(False)
            
            test_end = time.time()
            test_duration = test_end - test_start
            
            # Check load test results
            load_success_rate = sum(load_results) / len(load_results)
            load_test_success = load_success_rate >= 0.95  # At least 95% success
            
            test_results["steps"]["load_test"] = {
                "success": load_test_success,
                "message": f"Load test with {load_test_count} tasks completed with {load_success_rate:.1%} success rate in {test_duration:.2f}s",
                "details": {
                    "tasks": load_test_count,
                    "success_rate": load_success_rate,
                    "duration": test_duration
                }
            }
            
            # Get final stats
            stats = self.get_stats()
            test_results["diagnostics"]["final_stats"] = stats
            
            # Overall success
            test_results["success"] = all(step["success"] for step in test_results["steps"].values())
            
            return test_results
        
        except Exception as e:
            logger.error(f"Error in Advanced Thread Pool Manager test: {e}")
            test_results["success"] = False
            test_results["error"] = str(e)
            return test_results


# Example usage
if __name__ == "__main__":
    import asyncio
    
    async def main():
        # Create an advanced thread pool manager
        manager = AdvancedThreadPoolManager(
            metadata={
                "enable_adaptive_routing": True,
                "enable_task_migration": True,
                "enable_aging": True,
                "use_enhanced_pools": True
            }
        )
        
        try:
            # Define some test functions
            def cpu_task(iterations):
                """CPU-bound task"""
                result = 0
                for i in range(iterations):
                    result += i
                return result
            
            def io_task(sleep_time):
                """I/O-bound task"""
                time.sleep(sleep_time)
                return f"Slept for {sleep_time}s"
            
            # Submit tasks with specific metadata
            print("Submitting tasks with specific capabilities...")
            
            # IO tasks with HIGH_IO capability requirement
            io_metadata = TaskMetadata(
                required_capabilities={PoolCapability.HIGH_IO},
                affinity=TaskAffinity.PREFERRED,
                estimated_duration=0.5
            )
            
            for i in range(5):
                manager.submit(
                    function=io_task,
                    sleep_time=0.5,
                    task_type=TaskType.IO,
                    priority=TaskPriority.NORMAL,
                    metadata=io_metadata
                )
            
            # CPU tasks with HIGH_CPU capability requirement
            cpu_metadata = TaskMetadata(
                required_capabilities={PoolCapability.HIGH_CPU},
                affinity=TaskAffinity.PREFERRED,
                estimated_duration=1.0
            )
            
            for i in range(5):
                manager.submit(
                    function=cpu_task,
                    iterations=10000000,  # 10M iterations
                    task_type=TaskType.CPU,
                    priority=TaskPriority.NORMAL,
                    metadata=cpu_metadata
                )
            
            # Wait for tasks to process
            await asyncio.sleep(2)
            
            # Check task routing
            stats = manager.get_stats()
            print("\nTask routing:")
            for task_type, routing in stats["routing"].items():
                print(f"- {task_type}: {routing}")
            
            # Get pool statistics
            print("\nPool statistics:")
            for pool_id, pool_stats in stats["enhanced_pools"].items():
                if "active_workers" in pool_stats["resources"]:
                    active = pool_stats["resources"]["active_workers"]
                    workers = pool_stats["resources"]["worker_count"]
                    utilization = (active / workers) if workers > 0 else 0
                    
                    print(f"- {pool_id}: {active}/{workers} workers active ({utilization:.1%} utilization)")
                    if "capabilities" in pool_stats:
                        print(f"  Capabilities: {pool_stats['capabilities']}")
            
            # Run load test with mix of tasks
            print("\nRunning load test...")
            
            load_futures = []
            for i in range(50):
                if i % 3 == 0:
                    # CPU task
                    _, future = manager.submit(
                        function=cpu_task,
                        iterations=5000000,  # 5M iterations
                        task_type=TaskType.CPU,
                        priority=TaskPriority.NORMAL
                    )
                elif i % 3 == 1:
                    # IO task
                    _, future = manager.submit(
                        function=io_task,
                        sleep_time=0.2,
                        task_type=TaskType.IO,
                        priority=TaskPriority.HIGH
                    )
                else:
                    # Mixed task (DB)
                    _, future = manager.submit(
                        function=lambda: (time.sleep(0.1), cpu_task(1000000))[1],
                        task_type=TaskType.DATABASE,
                        priority=TaskPriority.NORMAL
                    )
                
                load_futures.append(future)
            
            # Wait for all tasks to complete
            import concurrent.futures
            for future in concurrent.futures.as_completed(load_futures):
                try:
                    future.result()
                except Exception as e:
                    print(f"Task error: {e}")
            
            # Check final statistics
            stats = manager.get_stats()
            print("\nFinal statistics:")
            print(f"- Total tasks: {stats['tasks']['submitted']}")
            print(f"- Completed: {stats['tasks']['completed']}")
            print(f"- Failed: {stats['tasks']['failed']}")
            print(f"- Total worker threads: {stats['workers']['total']}")
            
            # Run the test method
            print("\nRunning integrated tests...")
            test_results = await manager.test()
            print(f"Test success: {test_results['success']}")
            for step, result in test_results["steps"].items():
                print(f"- {step}: {result['success']} - {result['message']}")
        
        finally:
            # Shutdown the manager
            manager.shutdown()
    
    # Run the example
    asyncio.run(main())
