"""
Advanced Thread Pool Monitor

This module extends the basic thread pool monitor with capabilities for monitoring
the advanced thread pool manager. It provides enhanced visualization, 
predictive analytics, and resource optimization recommendations.

Key features:
- Capability-aware monitoring of specialized thread pools
- Resource allocation optimization for heterogeneous workloads
- Workload pattern recognition and prediction
- Cross-pool performance comparison and benchmarking
- Task routing optimization recommendations
- Automated threshold adjustments based on historical performance
"""

import os
import time
import json
import logging
import threading
import asyncio
from typing import Dict, List, Any, Optional, Union, Tuple, Callable, Set
from datetime import datetime, timedelta
import concurrent.futures
import math

from .thread_pool_manager import (
    ThreadPoolManager,
    TaskType,
    TaskPriority,
    TaskState
)

from .thread_pool_monitor import (
    ThreadPoolMonitor,
    PerformanceMetrics
)

from .advanced_thread_pool_manager import (
    AdvancedThreadPoolManager,
    EnhancedManagedThreadPool,
    TaskAffinity,
    PoolCapability,
    TaskMetadata,
    ResourceProfile
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class WorkloadPattern:
    """Class for detecting and storing workload patterns"""
    
    def __init__(self, window_size: int = 60):
        """
        Initialize workload pattern detector
        
        Args:
            window_size: Number of data points to keep in the sliding window
        """
        self.window_size = window_size
        
        # Time series data for different metrics
        self.timestamps: List[float] = []
        self.task_counts_by_type: Dict[TaskType, List[int]] = {
            task_type: [] for task_type in TaskType
        }
        self.task_counts_by_capability: Dict[PoolCapability, List[int]] = {
            capability: [] for capability in PoolCapability
        }
        
        # Detected patterns
        self.daily_patterns: Dict[str, Any] = {}
        self.hourly_patterns: Dict[str, Any] = {}
        self.peak_periods: List[Tuple[float, float, str]] = []  # (start, end, type)
        
        # Pattern detection state
        self.last_pattern_update = time.time()
        self.pattern_update_interval = 3600  # Update patterns hourly
    
    def add_data_point(
        self,
        timestamp: float,
        task_counts_by_type: Dict[TaskType, int],
        task_counts_by_capability: Dict[PoolCapability, int]
    ):
        """
        Add a new data point to the pattern detector
        
        Args:
            timestamp: Unix timestamp of the data point
            task_counts_by_type: Count of tasks by type
            task_counts_by_capability: Count of tasks by capability
        """
        self.timestamps.append(timestamp)
        
        for task_type, count in task_counts_by_type.items():
            if task_type in self.task_counts_by_type:
                self.task_counts_by_type[task_type].append(count)
                # Trim if needed
                if len(self.task_counts_by_type[task_type]) > self.window_size:
                    self.task_counts_by_type[task_type] = self.task_counts_by_type[task_type][-self.window_size:]
        
        for capability, count in task_counts_by_capability.items():
            if capability in self.task_counts_by_capability:
                self.task_counts_by_capability[capability].append(count)
                # Trim if needed
                if len(self.task_counts_by_capability[capability]) > self.window_size:
                    self.task_counts_by_capability[capability] = self.task_counts_by_capability[capability][-self.window_size:]
        
        # Trim timestamps if needed
        if len(self.timestamps) > self.window_size:
            self.timestamps = self.timestamps[-self.window_size:]
        
        # Update patterns periodically
        current_time = time.time()
        if current_time - self.last_pattern_update > self.pattern_update_interval:
            self._update_patterns()
            self.last_pattern_update = current_time
    
    def _update_patterns(self):
        """Update pattern detection based on collected data"""
        try:
            # We need significant data to detect patterns
            if len(self.timestamps) < 24:  # At least a day's worth of data
                return
            
            # Convert timestamps to datetime for easier time-of-day analysis
            datetimes = [datetime.fromtimestamp(ts) for ts in self.timestamps]
            
            # Group by hour of day
            hourly_data = {}
            for i, dt in enumerate(datetimes):
                hour = dt.hour
                if hour not in hourly_data:
                    hourly_data[hour] = {
                        "counts": {},
                        "samples": 0
                    }
                
                hourly_data[hour]["samples"] += 1
                
                # Accumulate counts by task type
                for task_type in TaskType:
                    if task_type not in hourly_data[hour]["counts"]:
                        hourly_data[hour]["counts"][task_type] = 0
                    
                    if i < len(self.task_counts_by_type.get(task_type, [])):
                        hourly_data[hour]["counts"][task_type] += self.task_counts_by_type[task_type][i]
            
            # Calculate averages
            hourly_averages = {}
            for hour, data in hourly_data.items():
                if data["samples"] > 0:
                    hourly_averages[hour] = {
                        task_type: count / data["samples"]
                        for task_type, count in data["counts"].items()
                    }
            
            # Detect peak periods
            self.peak_periods = []
            for task_type in TaskType:
                # Find the peak hour for this task type
                peak_hour = max(
                    hourly_averages.keys(),
                    key=lambda h: hourly_averages[h].get(task_type, 0),
                    default=None
                )
                
                if peak_hour is not None:
                    peak_value = hourly_averages[peak_hour].get(task_type, 0)
                    if peak_value > 0:
                        # Find continuous peak period
                        start_hour = peak_hour
                        end_hour = peak_hour
                        
                        # Look backwards
                        h = (peak_hour - 1) % 24
                        while h != peak_hour:
                            if h in hourly_averages and hourly_averages[h].get(task_type, 0) >= peak_value * 0.7:
                                start_hour = h
                            else:
                                break
                            h = (h - 1) % 24
                        
                        # Look forwards
                        h = (peak_hour + 1) % 24
                        while h != peak_hour:
                            if h in hourly_averages and hourly_averages[h].get(task_type, 0) >= peak_value * 0.7:
                                end_hour = h
                            else:
                                break
                            h = (h + 1) % 24
                        
                        # Convert to timestamp range (for today)
                        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                        start_time = today.replace(hour=start_hour).timestamp()
                        end_time = today.replace(hour=end_hour).timestamp()
                        
                        # Add to peak periods
                        self.peak_periods.append((start_time, end_time, task_type.name))
            
            # Store hourly patterns
            self.hourly_patterns = hourly_averages
            
            # Build daily patterns
            # (For simplicity, we're not implementing full daily pattern detection)
            # In a full implementation, we would look at patterns across days of the week
            
            logger.info(f"Updated workload patterns with {len(self.timestamps)} data points")
        
        except Exception as e:
            logger.error(f"Error updating workload patterns: {e}")
    
    def predict_workload(self, future_timestamp: float) -> Dict[TaskType, float]:
        """
        Predict workload at a future timestamp
        
        Args:
            future_timestamp: Future timestamp to predict for
            
        Returns:
            Dict[TaskType, float]: Predicted task counts by type
        """
        future_dt = datetime.fromtimestamp(future_timestamp)
        hour = future_dt.hour
        
        # Use hourly patterns if available
        if hour in self.hourly_patterns:
            return {
                task_type: count
                for task_type, count in self.hourly_patterns[hour].items()
            }
        
        # Fallback to average of recent data
        result = {}
        for task_type in TaskType:
            counts = self.task_counts_by_type.get(task_type, [])
            result[task_type] = sum(counts) / len(counts) if counts else 0
        
        return result
    
    def is_peak_period(self, timestamp: float, task_type: Optional[TaskType] = None) -> bool:
        """
        Check if a timestamp is in a peak period
        
        Args:
            timestamp: Timestamp to check
            task_type: Optional task type to check for (if None, check all)
            
        Returns:
            bool: True if the timestamp is in a peak period
        """
        dt = datetime.fromtimestamp(timestamp)
        
        # Convert to time-of-day for comparison
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        time_of_day = today.replace(hour=dt.hour, minute=dt.minute, second=dt.second).timestamp()
        
        for start, end, peak_type in self.peak_periods:
            # Skip if not relevant to the requested task type
            if task_type is not None and peak_type != task_type.name:
                continue
            
            # Check if time_of_day is within this peak period
            if start <= time_of_day <= end:
                return True
            
            # Handle overnight periods
            if start > end and (time_of_day >= start or time_of_day <= end):
                return True
        
        return False
    
    def get_snapshot(self) -> Dict[str, Any]:
        """Get a snapshot of pattern data"""
        return {
            "hourly_patterns": {
                str(hour): {
                    task_type.name: count
                    for task_type, count in patterns.items()
                }
                for hour, patterns in self.hourly_patterns.items()
            },
            "peak_periods": [
                {
                    "start": start,
                    "end": end,
                    "task_type": task_type,
                    "start_formatted": datetime.fromtimestamp(start).strftime('%H:%M'),
                    "end_formatted": datetime.fromtimestamp(end).strftime('%H:%M')
                }
                for start, end, task_type in self.peak_periods
            ],
            "current_loads": {
                task_type.name: self.task_counts_by_type.get(task_type, [])[-1] if self.task_counts_by_type.get(task_type, []) else 0
                for task_type in TaskType
            },
            "capability_loads": {
                capability.name: self.task_counts_by_capability.get(capability, [])[-1] if self.task_counts_by_capability.get(capability, []) else 0
                for capability in PoolCapability
            }
        }


class EnhancedPerformanceMetrics(PerformanceMetrics):
    """Enhanced performance metrics with capability and resource tracking"""
    
    def __init__(self, window_size: int = 60):
        """Initialize enhanced performance metrics"""
        super().__init__(window_size)
        
        # Additional metrics for capabilities
        self.capability_utilization: Dict[PoolCapability, List[float]] = {}
        
        # Resource utilization
        self.cpu_utilization: List[float] = []
        self.memory_utilization: List[float] = []
        self.gpu_utilization: List[float] = []
        
        # Task routing efficiency
        self.routing_efficiency: List[float] = []
        self.task_migration_counts: List[int] = []
        
        # Task waiting times by priority
        self.waiting_times_by_priority: Dict[TaskPriority, List[float]] = {
            priority: [] for priority in TaskPriority
        }
    
    def add_capability_utilization(self, timestamp: float, capabilities: Dict[PoolCapability, float]):
        """
        Add capability utilization data
        
        Args:
            timestamp: Unix timestamp of the data point
            capabilities: Dictionary mapping capabilities to utilization (0-1)
        """
        for capability, utilization in capabilities.items():
            if capability not in self.capability_utilization:
                self.capability_utilization[capability] = []
            
            self.capability_utilization[capability].append(utilization)
            
            # Trim if needed
            if len(self.capability_utilization[capability]) > self.window_size:
                self.capability_utilization[capability] = self.capability_utilization[capability][-self.window_size:]
    
    def add_resource_utilization(self, timestamp: float, cpu: float, memory: float, gpu: float = 0.0):
        """
        Add resource utilization data
        
        Args:
            timestamp: Unix timestamp of the data point
            cpu: CPU utilization (0-1)
            memory: Memory utilization (0-1)
            gpu: GPU utilization (0-1)
        """
        self.cpu_utilization.append(cpu)
        self.memory_utilization.append(memory)
        self.gpu_utilization.append(gpu)
        
        # Trim if needed
        if len(self.cpu_utilization) > self.window_size:
            self.cpu_utilization = self.cpu_utilization[-self.window_size:]
            self.memory_utilization = self.memory_utilization[-self.window_size:]
            self.gpu_utilization = self.gpu_utilization[-self.window_size:]
    
    def add_routing_metrics(self, timestamp: float, efficiency: float, migrations: int = 0):
        """
        Add routing efficiency metrics
        
        Args:
            timestamp: Unix timestamp of the data point
            efficiency: Routing efficiency score (0-1)
            migrations: Number of task migrations in this period
        """
        self.routing_efficiency.append(efficiency)
        self.task_migration_counts.append(migrations)
        
        # Trim if needed
        if len(self.routing_efficiency) > self.window_size:
            self.routing_efficiency = self.routing_efficiency[-self.window_size:]
            self.task_migration_counts = self.task_migration_counts[-self.window_size:]
    
    def add_waiting_time(self, timestamp: float, priority: TaskPriority, waiting_time: float):
        """
        Add task waiting time data
        
        Args:
            timestamp: Unix timestamp of the data point
            priority: Task priority
            waiting_time: Time the task waited in queue (seconds)
        """
        if priority not in self.waiting_times_by_priority:
            self.waiting_times_by_priority[priority] = []
        
        self.waiting_times_by_priority[priority].append(waiting_time)
        
        # Trim if needed
        if len(self.waiting_times_by_priority[priority]) > self.window_size:
            self.waiting_times_by_priority[priority] = self.waiting_times_by_priority[priority][-self.window_size:]
    
    def get_snapshot(self) -> Dict[str, Any]:
        """Get a snapshot of the enhanced metrics"""
        # Get base snapshot
        snapshot = super().get_snapshot()
        
        # Add enhanced metrics
        snapshot["capabilities"] = {
            capability.name: {
                "utilization": data[-self.window_size:],
                "average": sum(data) / len(data) if data else 0
            }
            for capability, data in self.capability_utilization.items()
        }
        
        snapshot["resources"] = {
            "cpu": {
                "utilization": self.cpu_utilization[-self.window_size:],
                "average": sum(self.cpu_utilization) / len(self.cpu_utilization) if self.cpu_utilization else 0
            },
            "memory": {
                "utilization": self.memory_utilization[-self.window_size:],
                "average": sum(self.memory_utilization) / len(self.memory_utilization) if self.memory_utilization else 0
            },
            "gpu": {
                "utilization": self.gpu_utilization[-self.window_size:],
                "average": sum(self.gpu_utilization) / len(self.gpu_utilization) if self.gpu_utilization else 0
            }
        }
        
        snapshot["routing"] = {
            "efficiency": {
                "data": self.routing_efficiency[-self.window_size:],
                "average": sum(self.routing_efficiency) / len(self.routing_efficiency) if self.routing_efficiency else 0
            },
            "migrations": {
                "data": self.task_migration_counts[-self.window_size:],
                "total": sum(self.task_migration_counts)
            }
        }
        
        snapshot["waiting_times"] = {
            priority.name: {
                "data": times[-self.window_size:],
                "average": sum(times) / len(times) if times else 0
            }
            for priority, times in self.waiting_times_by_priority.items()
        }
        
        return snapshot


class AdvancedThreadPoolMonitor(ThreadPoolMonitor):
    """
    Advanced monitor for thread pools that provides enhanced metrics and optimization
    
    This class extends ThreadPoolMonitor with capabilities for monitoring and
    optimizing the advanced thread pool manager, including capability-aware
    resource allocation and workload prediction.
    """
    
    def __init__(
        self,
        thread_pool_manager: Union[ThreadPoolManager, AdvancedThreadPoolManager],
        resources: Dict[str, Any] = None,
        metadata: Dict[str, Any] = None
    ):
        """
        Initialize the Advanced Thread Pool Monitor
        
        Args:
            thread_pool_manager: The thread pool manager to monitor
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        # Call parent constructor for basic initialization
        super().__init__(thread_pool_manager, resources, metadata)
        
        # Store manager for type-specific operations
        self.is_advanced_manager = isinstance(thread_pool_manager, AdvancedThreadPoolManager)
        
        # Enhanced configuration
        self.config.update({
            "capability_monitoring": metadata.get("capability_monitoring", True),
            "pattern_detection": metadata.get("pattern_detection", True),
            "adaptive_thresholds": metadata.get("adaptive_thresholds", True),
            "prediction_horizon": metadata.get("prediction_horizon", 3600),  # 1 hour
            "detailed_metrics": metadata.get("detailed_metrics", True),
            "metrics_dashboard_url": metadata.get("metrics_dashboard_url", ""),
            "visualization_enabled": metadata.get("visualization_enabled", False),
        })
        
        # Override system metrics with enhanced version
        self.system_metrics = EnhancedPerformanceMetrics(window_size=self.config["metrics_window"])
        
        # Enhanced pool metrics
        self.pool_metrics: Dict[str, EnhancedPerformanceMetrics] = {}
        
        # Workload pattern detection
        if self.config["pattern_detection"]:
            self.workload_pattern = WorkloadPattern(window_size=self.config["metrics_window"] * 24)  # Full day
        else:
            self.workload_pattern = None
        
        # Adaptive thresholds
        self.adaptive_thresholds = {
            "high_queue_depth": self.config["alert_thresholds"]["high_queue_depth"],
            "high_worker_utilization": self.config["alert_thresholds"]["high_worker_utilization"],
            "high_error_rate": self.config["alert_thresholds"]["high_error_rate"],
            "slow_response_time": self.config["alert_thresholds"]["slow_response_time"],
            "last_update": time.time(),
            "update_interval": 3600  # 1 hour
        }
        
        # Capability-specific thresholds
        self.capability_thresholds = {
            capability: {
                "utilization": 0.85,
                "queue_depth": 20,
                "response_time": 1.0
            }
            for capability in PoolCapability
        }
        
        # Task migration tracking
        self.migration_counts = {
            "total": 0,
            "successful": 0,
            "by_task_type": {task_type: 0 for task_type in TaskType},
            "by_priority": {priority: 0 for priority in TaskPriority}
        }
        
        # Resource optimization state
        self.last_optimization = time.time()
        self.optimization_interval = 300  # 5 minutes
        self.optimization_history = []
        self.current_optimization_plan = None
        
        logger.info(f"AdvancedThreadPoolMonitor initialized with config: {self.config}")
    
    def _collect_metrics(self):
        """Collect enhanced metrics from the thread pool manager"""
        # Get current stats
        current_stats = self.thread_pool_manager.get_stats()
        timestamp = time.time()
        
        # Calculate delta metrics since last collection
        if self.prev_stats:
            # Process as in parent class
            super()._collect_metrics()
            
            # Collect advanced metrics if we have an advanced manager
            if self.is_advanced_manager:
                self._collect_advanced_metrics(current_stats, timestamp)
        
        # Save current stats for next iteration
        self.prev_stats = current_stats
    
    def _collect_advanced_metrics(self, current_stats: Dict[str, Any], timestamp: float):
        """
        Collect advanced metrics from the thread pool manager
        
        Args:
            current_stats: Current statistics from the thread pool manager
            timestamp: Current timestamp
        """
        try:
            # Initialize counters for workload patterns
            task_counts_by_type = {task_type: 0 for task_type in TaskType}
            task_counts_by_capability = {capability: 0 for capability in PoolCapability}
            
            # Collect capability utilization data
            capability_utilization = {capability: 0.0 for capability in PoolCapability}
            capability_counts = {capability: 0 for capability in PoolCapability}
            
            # Process enhanced pool stats if available
            if "enhanced_pools" in current_stats:
                for pool_id, pool_stats in current_stats["enhanced_pools"].items():
                    # Get or create enhanced metrics for this pool
                    if pool_id not in self.pool_metrics:
                        self.pool_metrics[pool_id] = EnhancedPerformanceMetrics(
                            window_size=self.config["metrics_window"]
                        )
                    
                    # Extract capability data
                    if "capabilities" in pool_stats:
                        pool_capabilities = [
                            getattr(PoolCapability, cap) 
                            for cap in pool_stats["capabilities"] 
                            if hasattr(PoolCapability, cap)
                        ]
                        
                        # Update utilization for each capability
                        pool_utilization = (
                            pool_stats["resources"]["active_workers"] / 
                            pool_stats["resources"]["worker_count"]
                        ) if pool_stats["resources"]["worker_count"] > 0 else 0.0
                        
                        for capability in pool_capabilities:
                            capability_utilization[capability] += pool_utilization
                            capability_counts[capability] += 1
                            
                            # Count tasks by capability
                            task_counts_by_capability[capability] += pool_stats["tasks"]["submitted"]
                    
                    # Extract resource utilization if available
                    if "resource_profile" in pool_stats:
                        resource_profile = pool_stats["resource_profile"]
                        if "utilization" in resource_profile:
                            self.pool_metrics[pool_id].add_resource_utilization(
                                timestamp=timestamp,
                                cpu=resource_profile["utilization"].get("cpu", 0.0),
                                memory=resource_profile["utilization"].get("memory", 0.0),
                                gpu=resource_profile["utilization"].get("gpu", 0.0)
                            )
                    
                    # Count tasks by type
                    pool_type = getattr(TaskType, pool_stats["pool_type"]) if hasattr(TaskType, pool_stats["pool_type"]) else None
                    if pool_type:
                        task_counts_by_type[pool_type] += pool_stats["tasks"]["submitted"]
            
            # Calculate average utilization for each capability
            for capability in capability_utilization:
                if capability_counts[capability] > 0:
                    capability_utilization[capability] /= capability_counts[capability]
            
            # Update system-wide capability utilization
            if hasattr(self.system_metrics, "add_capability_utilization"):
                self.system_metrics.add_capability_utilization(
                    timestamp=timestamp,
                    capabilities=capability_utilization
                )
            
            # Update pool-specific capability utilization
            for pool_id, metrics in self.pool_metrics.items():
                if hasattr(metrics, "add_capability_utilization"):
                    # Filter to just the capabilities of this pool
                    if "enhanced_pools" in current_stats and pool_id in current_stats["enhanced_pools"]:
                        pool_stats = current_stats["enhanced_pools"][pool_id]
                        
                        if "capabilities" in pool_stats:
                            pool_capabilities = {
                                getattr(PoolCapability, cap): capability_utilization[getattr(PoolCapability, cap)]
                                for cap in pool_stats["capabilities"]
                                if hasattr(PoolCapability, cap)
                            }
                            
                            metrics.add_capability_utilization(
                                timestamp=timestamp,
                                capabilities=pool_capabilities
                            )
            
            # Update system-wide resource utilization
            if hasattr(self.system_metrics, "add_resource_utilization"):
                # Calculate overall resource utilization
                active_workers = current_stats["workers"]["active"]
                total_workers = current_stats["workers"]["total"]
                cpu_util = active_workers / max(1, total_workers)
                
                # We don't have direct memory metrics, so estimate based on active tasks
                memory_util = min(1.0, active_workers / max(1, multiprocessing.cpu_count() * 2))
                
                # GPU utilization (if available)
                gpu_util = 0.0
                gpu_capability_util = capability_utilization.get(PoolCapability.GPU, 0.0)
                if gpu_capability_util > 0:
                    gpu_util = gpu_capability_util
                
                self.system_metrics.add_resource_utilization(
                    timestamp=timestamp,
                    cpu=cpu_util,
                    memory=memory_util,
                    gpu=gpu_util
                )
            
            # Update routing metrics if routing stats are available
            if "routing" in current_stats and hasattr(self.system_metrics, "add_routing_metrics"):
                # Calculate routing efficiency
                # A simple metric: 1.0 means all tasks go to their preferred pool
                if current_stats["routing"]:
                    total_tasks = 0
                    well_routed_tasks = 0
                    
                    for task_type, routes in current_stats["routing"].items():
                        type_tasks = sum(routes.values())
                        total_tasks += type_tasks
                        
                        # Consider tasks well-routed if they went to a pool with matching type in the name
                        for pool_id, count in routes.items():
                            if task_type.lower() in pool_id.lower():
                                well_routed_tasks += count
                    
                    routing_efficiency = (well_routed_tasks / total_tasks) if total_tasks > 0 else 1.0
                else:
                    routing_efficiency = 1.0
                
                # Get migration count - we don't have direct access to this
                # In a real implementation, we'd track this directly
                migrations = 0  # Placeholder
                
                self.system_metrics.add_routing_metrics(
                    timestamp=timestamp,
                    efficiency=routing_efficiency,
                    migrations=migrations
                )
            
            # Update waiting times by priority
            # In a real implementation, we'd have direct access to task waiting times
            # This is a placeholder implementation
            if hasattr(self.system_metrics, "add_waiting_time"):
                # We'll use queue depth as a proxy for waiting time
                for priority in TaskPriority:
                    # Estimate waiting time based on queue depth and task completion rate
                    queue_depth = current_stats["tasks"]["pending"]  # Overall queue depth
                    completion_rate = current_stats["tasks"]["completed"] / max(1, self.prev_stats["tasks"]["completed"])
                    
                    # Adjust by priority - lower priority tasks wait longer
                    priority_factor = 1.0
                    if priority == TaskPriority.LOW:
                        priority_factor = 2.0
                    elif priority == TaskPriority.NORMAL:
                        priority_factor = 1.5
                    elif priority == TaskPriority.HIGH:
                        priority_factor = 0.8
                    elif priority == TaskPriority.CRITICAL:
                        priority_factor = 0.5
                    
                    # Calculate estimated waiting time
                    estimated_waiting_time = queue_depth * priority_factor / max(0.1, completion_rate)
                    
                    # Cap at reasonable value
                    estimated_waiting_time = min(60.0, estimated_waiting_time)
                    
                    self.system_metrics.add_waiting_time(
                        timestamp=timestamp,
                        priority=priority,
                        waiting_time=estimated_waiting_time
                    )
            
            # Update workload patterns
            if self.config["pattern_detection"] and self.workload_pattern:
                self.workload_pattern.add_data_point(
                    timestamp=timestamp,
                    task_counts_by_type=task_counts_by_type,
                    task_counts_by_capability=task_counts_by_capability
                )
            
            # Update adaptive thresholds if enabled
            if self.config["adaptive_thresholds"]:
                self._update_adaptive_thresholds()
            
            # Check if it's time to run optimization
            if time.time() - self.last_optimization > self.optimization_interval:
                self._generate_optimization_plan()
                self.last_optimization = time.time()
        
        except Exception as e:
            logger.error(f"Error collecting advanced metrics: {e}")
    
    def _update_adaptive_thresholds(self):
        """Update alert thresholds based on historical performance"""
        current_time = time.time()
        
        # Check if it's time to update
        if current_time - self.adaptive_thresholds["last_update"] < self.adaptive_thresholds["update_interval"]:
            return
        
        try:
            # Get system metrics
            metrics_snapshot = self.system_metrics.get_snapshot()
            
            # Adjust queue depth threshold based on historical data
            if metrics_snapshot["time_series"]["queue_depth"]:
                # Use 90th percentile of historical queue depth
                sorted_depths = sorted(metrics_snapshot["time_series"]["queue_depth"])
                percentile_90 = sorted_depths[int(len(sorted_depths) * 0.9)]
                
                # Set threshold to slightly above the 90th percentile
                new_threshold = max(10, int(percentile_90 * 1.2))
                
                # Don't change too drastically
                old_threshold = self.adaptive_thresholds["high_queue_depth"]
                self.adaptive_thresholds["high_queue_depth"] = int((old_threshold + new_threshold) / 2)
            
            # Adjust worker utilization threshold
            if metrics_snapshot["time_series"]["worker_utilization"]:
                # Use 75th percentile of historical utilization
                sorted_utils = sorted(metrics_snapshot["time_series"]["worker_utilization"])
                percentile_75 = sorted_utils[int(len(sorted_utils) * 0.75)]
                
                # Set threshold to slightly above the 75th percentile
                new_threshold = min(0.95, percentile_75 * 1.2)
                
                # Don't change too drastically
                old_threshold = self.adaptive_thresholds["high_worker_utilization"]
                self.adaptive_thresholds["high_worker_utilization"] = (old_threshold + new_threshold) / 2
            
            # Adjust error rate threshold
            if metrics_snapshot["time_series"]["error_rates"]:
                # Use 90th percentile of error rates
                sorted_errors = sorted(metrics_snapshot["time_series"]["error_rates"])
                percentile_90 = sorted_errors[int(len(sorted_errors) * 0.9)]
                
                # Set threshold to slightly above the 90th percentile
                new_threshold = min(0.5, max(0.05, percentile_90 * 1.5))
                
                # Don't change too drastically
                old_threshold = self.adaptive_thresholds["high_error_rate"]
                self.adaptive_thresholds["high_error_rate"] = (old_threshold + new_threshold) / 2
            
            # Adjust response time threshold
            if metrics_snapshot["time_series"]["response_times"]:
                # Use 90th percentile of response times
                sorted_times = sorted(metrics_snapshot["time_series"]["response_times"])
                percentile_90 = sorted_times[int(len(sorted_times) * 0.9)]
                
                # Set threshold to slightly above the 90th percentile
                new_threshold = max(0.5, percentile_90 * 1.2)
                
                # Don't change too drastically
                old_threshold = self.adaptive_thresholds["slow_response_time"]
                self.adaptive_thresholds["slow_response_time"] = (old_threshold + new_threshold) / 2
            
            # Update the configured thresholds
            self.config["alert_thresholds"].update({
                "high_queue_depth": self.adaptive_thresholds["high_queue_depth"],
                "high_worker_utilization": self.adaptive_thresholds["high_worker_utilization"],
                "high_error_rate": self.adaptive_thresholds["high_error_rate"],
                "slow_response_time": self.adaptive_thresholds["slow_response_time"]
            })
            
            # Update timestamp
            self.adaptive_thresholds["last_update"] = current_time
            
            logger.info(f"Updated adaptive thresholds: {self.adaptive_thresholds}")
        
        except Exception as e:
            logger.error(f"Error updating adaptive thresholds: {e}")
    
    def _generate_optimization_plan(self):
        """Generate a resource optimization plan based on current and predicted workload"""
        try:
            # Get current stats
            current_stats = self.thread_pool_manager.get_stats()
            
            # Get workload predictions if available
            future_timestamp = time.time() + self.config["prediction_horizon"]
            if self.workload_pattern:
                predicted_workload = self.workload_pattern.predict_workload(future_timestamp)
                is_peak_period = any(self.workload_pattern.is_peak_period(future_timestamp, task_type) 
                                    for task_type in TaskType)
            else:
                predicted_workload = {}
                is_peak_period = False
            
            # Build optimization plan
            optimization_plan = {
                "timestamp": time.time(),
                "predictions": {
                    "is_peak_period": is_peak_period,
                    "predicted_workload": {
                        task_type.name: count
                        for task_type, count in predicted_workload.items()
                    } if predicted_workload else {}
                },
                "pool_recommendations": {},
                "system_recommendations": []
            }
            
            # Generate pool-specific recommendations
            for pool_id, pool_stats in current_stats.get("enhanced_pools", {}).items():
                pool_type = pool_stats.get("pool_type")
                if not pool_type:
                    continue
                
                # Get metrics for this pool
                pool_metrics = self.pool_metrics.get(pool_id)
                if not pool_metrics:
                    continue
                
                # Current stats
                worker_count = pool_stats["resources"]["worker_count"]
                active_workers = pool_stats["resources"]["active_workers"]
                utilization = active_workers / max(1, worker_count)
                queue_size = pool_stats["resources"]["queue_size"]
                
                # Predicted workload for this pool type
                task_type_obj = getattr(TaskType, pool_type) if hasattr(TaskType, pool_type) else None
                predicted_load = predicted_workload.get(task_type_obj, 0) if task_type_obj else 0
                
                # Calculate recommended worker count
                recommended_workers = worker_count
                
                # Scale up for high queue size
                if queue_size > 5:
                    recommended_workers = max(recommended_workers, worker_count + queue_size // 2)
                
                # Scale up for predicted workload increase
                if predicted_load > 0:
                    # Estimate needed workers based on prediction
                    predicted_to_current_ratio = predicted_load / max(1, current_stats["tasks"]["submitted"])
                    if predicted_to_current_ratio > 1.2:  # 20% increase
                        load_based_workers = int(worker_count * predicted_to_current_ratio)
                        recommended_workers = max(recommended_workers, load_based_workers)
                
                # Scale down for low utilization if not in peak period
                if utilization < 0.3 and not is_peak_period:
                    # Don't scale below active workers + buffer
                    min_recommended = max(1, active_workers + 2)
                    recommended_workers = min(recommended_workers, min_recommended)
                
                # Special handling for peak periods - ensure capacity
                if is_peak_period and self.workload_pattern.is_peak_period(future_timestamp, task_type_obj):
                    # In peak period for this task type, add extra capacity
                    recommended_workers = max(recommended_workers, int(worker_count * 1.5))
                
                # Generate recommendation if different from current
                if recommended_workers != worker_count:
                    optimization_plan["pool_recommendations"][pool_id] = {
                        "current_workers": worker_count,
                        "recommended_workers": recommended_workers,
                        "reason": (
                            "Scale up for queue size and predicted load" if recommended_workers > worker_count
                            else "Scale down due to low utilization"
                        )
                    }
            
            # Generate system-wide recommendations
            
            # Check for imbalanced workload
            workload_by_type = {
                task_type: current_stats.get("routing", {}).get(task_type.name, {})
                for task_type in TaskType
            }
            
            # Find dominant task types
            total_tasks = sum(sum(pools.values()) for pools in workload_by_type.values() if pools)
            dominant_types = []
            
            for task_type, pools in workload_by_type.items():
                type_tasks = sum(pools.values()) if pools else 0
                if type_tasks > 0 and type_tasks / max(1, total_tasks) > 0.3:  # More than 30% of tasks
                    dominant_types.append(task_type)
            
            # Recommend specialized pool configuration for dominant types
            if dominant_types:
                for task_type in dominant_types:
                    # Check if there's already a dedicated pool
                    has_dedicated_pool = False
                    for pool_id in current_stats.get("enhanced_pools", {}):
                        if task_type.name.lower() in pool_id.lower():
                            has_dedicated_pool = True
                            break
                    
                    if not has_dedicated_pool:
                        optimization_plan["system_recommendations"].append({
                            "type": "new_pool",
                            "task_type": task_type.name,
                            "reason": f"Create dedicated pool for {task_type.name} tasks (dominant workload)"
                        })
            
            # Check for capability gaps
            if "capabilities" in current_stats:
                available_capabilities = set()
                for capability_name, pools in current_stats["capabilities"].items():
                    if pools:  # Non-empty list of pools
                        cap = getattr(PoolCapability, capability_name) if hasattr(PoolCapability, capability_name) else None
                        if cap:
                            available_capabilities.add(cap)
                
                # Identify missing capabilities that might be useful
                missing_capabilities = []
                for capability in PoolCapability:
                    if capability not in available_capabilities:
                        missing_capabilities.append(capability)
                
                # Recommend adding key missing capabilities
                for capability in missing_capabilities:
                    if capability in (PoolCapability.GPU, PoolCapability.HIGH_MEMORY, PoolCapability.LOW_LATENCY):
                        optimization_plan["system_recommendations"].append({
                            "type": "new_capability",
                            "capability": capability.name,
                            "reason": f"Add pool with {capability.name} capability for specialized workloads"
                        })
            
            # Store the plan
            self.current_optimization_plan = optimization_plan
            self.optimization_history.append(optimization_plan)
            
            # Trim history if needed
            if len(self.optimization_history) > 24:  # Keep last day's worth
                self.optimization_history = self.optimization_history[-24:]
            
            logger.info(f"Generated optimization plan with {len(optimization_plan['pool_recommendations'])} pool recommendations "
                       f"and {len(optimization_plan['system_recommendations'])} system recommendations")
        
        except Exception as e:
            logger.error(f"Error generating optimization plan: {e}")
    
    def get_optimization_plan(self) -> Dict[str, Any]:
        """
        Get the current optimization plan
        
        Returns:
            Dict[str, Any]: Current optimization plan
        """
        return self.current_optimization_plan or {
            "timestamp": time.time(),
            "predictions": {"is_peak_period": False, "predicted_workload": {}},
            "pool_recommendations": {},
            "system_recommendations": []
        }
    
    def get_enhanced_metrics(self) -> Dict[str, Any]:
        """
        Get enhanced metrics including capability and workload patterns
        
        Returns:
            Dict[str, Any]: Enhanced metrics
        """
        # Get basic metrics
        metrics = self.get_metrics()
        
        # Add workload patterns if available
        if self.workload_pattern:
            metrics["workload_patterns"] = self.workload_pattern.get_snapshot()
        
        # Add optimization plan
        metrics["optimization"] = {
            "current_plan": self.current_optimization_plan,
            "last_optimization": self.last_optimization
        }
        
        # Add adaptive thresholds
        metrics["adaptive_thresholds"] = self.adaptive_thresholds
        
        # Add enhanced metrics if available
        if isinstance(self.system_metrics, EnhancedPerformanceMetrics):
            system_snapshot = self.system_metrics.get_snapshot()
            
            # Add capability metrics from enhanced snapshot
            for key in ["capabilities", "resources", "routing", "waiting_times"]:
                if key in system_snapshot:
                    metrics["system"][key] = system_snapshot[key]
        
        return metrics
    
    def get_advanced_health_report(self) -> Dict[str, Any]:
        """
        Get an advanced health report with capability-aware assessment
        
        Returns:
            Dict[str, Any]: Advanced health report
        """
        # Get basic health report
        report = self.get_health_report()
        
        # Enhance with capability assessment
        if self.config["capability_monitoring"]:
            capability_status = {}
            system_metrics = self.get_enhanced_metrics()["system"]
            
            # Check capability utilization
            if "capabilities" in system_metrics:
                for capability_name, data in system_metrics["capabilities"].items():
                    avg_utilization = data.get("average", 0)
                    status = "healthy"
                    issues = []
                    
                    # Check for high utilization
                    if avg_utilization > 0.85:
                        status = "degraded"
                        issues.append(f"High utilization: {avg_utilization:.2f}")
                    
                    # Include in report
                    capability_status[capability_name] = {
                        "status": status,
                        "issues": issues,
                        "utilization": avg_utilization
                    }
            
            # Add to report
            report["capabilities"] = capability_status
        
        # Check if we're in a peak period
        if self.workload_pattern:
            current_time = time.time()
            is_peak = self.workload_pattern.is_peak_period(current_time)
            peak_types = [
                task_type.name for task_type in TaskType
                if self.workload_pattern.is_peak_period(current_time, task_type)
            ]
            
            report["workload"] = {
                "is_peak_period": is_peak,
                "peak_types": peak_types,
                "predicted_load": (
                    self.get_optimization_plan()
                    .get("predictions", {})
                    .get("predicted_workload", {})
                )
            }
        
        return report
    
    def get_capability_health(self, capability: PoolCapability) -> Dict[str, Any]:
        """
        Get health report for a specific capability
        
        Args:
            capability: The capability to check
            
        Returns:
            Dict[str, Any]: Health report for the capability
        """
        # Get metrics
        metrics = self.get_enhanced_metrics()
        
        # Get pools with this capability
        pools_with_capability = []
        for pool_id, pool_stats in metrics.get("pools", {}).items():
            if "capabilities" in pool_stats and capability.name in pool_stats["capabilities"]:
                pools_with_capability.append(pool_id)
        
        # Calculate capability metrics
        utilization = 0.0
        error_rate = 0.0
        task_count = 0
        pool_count = len(pools_with_capability)
        
        if "capabilities" in metrics.get("system", {}):
            cap_metrics = metrics["system"]["capabilities"].get(capability.name, {})
            utilization = cap_metrics.get("average", 0.0)
        
        # Determine health status
        status = "healthy"
        issues = []
        
        # Check for high utilization
        if utilization > 0.85:
            status = "degraded"
            issues.append(f"High utilization: {utilization:.2f}")
        
        # Check if no pools provide this capability
        if pool_count == 0:
            status = "unavailable"
            issues.append("No pools provide this capability")
        
        return {
            "capability": capability.name,
            "status": status,
            "issues": issues,
            "metrics": {
                "utilization": utilization,
                "error_rate": error_rate,
                "pool_count": pool_count,
                "task_count": task_count
            },
            "pools": pools_with_capability
        }
    
    def get_advanced_recommendations(self) -> Dict[str, Any]:
        """
        Get advanced optimization recommendations
        
        Returns:
            Dict[str, Any]: Advanced recommendations
        """
        # Start with base recommendations
        recommendations = super().get_optimization_recommendations()
        
        # Add optimization plan
        if self.current_optimization_plan:
            recommendations["optimization_plan"] = self.current_optimization_plan
        
        # Add workload prediction recommendations
        if self.workload_pattern:
            current_time = time.time()
            is_peak = self.workload_pattern.is_peak_period(current_time)
            
            if is_peak:
                recommendations["peak_period"] = {
                    "message": "Currently in peak period, consider delaying non-critical tasks",
                    "peak_types": [
                        task_type.name for task_type in TaskType
                        if self.workload_pattern.is_peak_period(current_time, task_type)
                    ]
                }
            
            # Check for upcoming peak periods
            for hours in [1, 4, 24]:
                future_time = current_time + hours * 3600
                will_be_peak = self.workload_pattern.is_peak_period(future_time)
                
                if will_be_peak:
                    peak_types = [
                        task_type.name for task_type in TaskType
                        if self.workload_pattern.is_peak_period(future_time, task_type)
                    ]
                    
                    recommendations[f"upcoming_peak_{hours}h"] = {
                        "message": f"Peak period in {hours} hours, prepare additional capacity",
                        "peak_types": peak_types
                    }
        
        # Add capability-specific recommendations
        metrics = self.get_enhanced_metrics()
        capability_recommendations = {}
        
        if "capabilities" in metrics.get("system", {}):
            for capability_name, data in metrics["system"]["capabilities"].items():
                avg_utilization = data.get("average", 0)
                
                if avg_utilization > 0.85:
                    capability_recommendations[capability_name] = {
                        "message": f"High {capability_name} utilization, consider adding more capacity",
                        "current_utilization": avg_utilization
                    }
                elif avg_utilization < 0.2:
                    capability_recommendations[capability_name] = {
                        "message": f"Low {capability_name} utilization, consider consolidating resources",
                        "current_utilization": avg_utilization
                    }
        
        recommendations["capabilities"] = capability_recommendations
        
        return recommendations
    
    async def test(self) -> Dict[str, Any]:
        """
        Run module tests with enhanced capabilities
        
        Returns:
            Dict[str, Any]: Test results
        """
        logger.info("Testing Advanced Thread Pool Monitor")
        
        test_results = {
            "success": False,
            "module": "advanced_thread_pool_monitor",
            "steps": {},
            "diagnostics": {
                "config": self.config
            }
        }
        
        try:
            # Test base functionality first
            base_results = await super().test()
            
            # Add base results to our results
            for step, result in base_results["steps"].items():
                test_results["steps"][f"base_{step}"] = result
            
            # Test enhanced metrics
            if self.running:
                metrics = self.get_enhanced_metrics()
                
                test_results["steps"]["enhanced_metrics"] = {
                    "success": "system" in metrics,
                    "message": "Collected enhanced metrics successfully" if "system" in metrics else "Failed to collect enhanced metrics"
                }
                
                # Add diagnostics
                test_results["diagnostics"]["enhanced_metrics"] = metrics
                
                # Test capability health
                capability_health = {}
                for capability in PoolCapability:
                    capability_health[capability.name] = self.get_capability_health(capability)
                
                test_results["steps"]["capability_health"] = {
                    "success": len(capability_health) > 0,
                    "message": f"Collected health for {len(capability_health)} capabilities"
                }
                
                # Add diagnostics
                test_results["diagnostics"]["capability_health"] = capability_health
                
                # Test advanced recommendations
                recommendations = self.get_advanced_recommendations()
                
                test_results["steps"]["advanced_recommendations"] = {
                    "success": "capabilities" in recommendations,
                    "message": "Generated advanced recommendations" if "capabilities" in recommendations else "Failed to generate advanced recommendations"
                }
                
                # Add diagnostics
                test_results["diagnostics"]["advanced_recommendations"] = recommendations
                
                # Test workload pattern detection if enabled
                if self.config["pattern_detection"] and self.workload_pattern:
                    # Add some test data points
                    for i in range(24):
                        # Simulate data for a day
                        timestamp = time.time() - (24 - i) * 3600
                        
                        # More IO tasks during business hours, more CPU at night
                        hour = datetime.fromtimestamp(timestamp).hour
                        business_hours = 9 <= hour <= 17
                        
                        task_counts_by_type = {task_type: 0 for task_type in TaskType}
                        task_counts_by_type[TaskType.IO] = 10 if business_hours else 2
                        task_counts_by_type[TaskType.CPU] = 2 if business_hours else 8
                        
                        task_counts_by_capability = {capability: 0 for capability in PoolCapability}
                        task_counts_by_capability[PoolCapability.HIGH_IO] = 10 if business_hours else 2
                        task_counts_by_capability[PoolCapability.HIGH_CPU] = 2 if business_hours else 8
                        
                        self.workload_pattern.add_data_point(
                            timestamp=timestamp,
                            task_counts_by_type=task_counts_by_type,
                            task_counts_by_capability=task_counts_by_capability
                        )
                    
                    # Force pattern update
                    self.workload_pattern._update_patterns()
                    
                    # Get pattern snapshot
                    pattern_snapshot = self.workload_pattern.get_snapshot()
                    
                    test_results["steps"]["workload_pattern"] = {
                        "success": "hourly_patterns" in pattern_snapshot and pattern_snapshot["hourly_patterns"],
                        "message": "Detected workload patterns" if pattern_snapshot.get("hourly_patterns") else "Failed to detect workload patterns"
                    }
                    
                    # Add diagnostics
                    test_results["diagnostics"]["workload_pattern"] = pattern_snapshot
                    
                    # Test workload prediction
                    current_time = time.time()
                    prediction = self.workload_pattern.predict_workload(current_time)
                    
                    test_results["steps"]["workload_prediction"] = {
                        "success": len(prediction) > 0,
                        "message": f"Generated workload prediction for {len(prediction)} task types"
                    }
                else:
                    test_results["steps"]["workload_pattern"] = {
                        "success": True,
                        "message": "Pattern detection not enabled, skipping test"
                    }
                    
                    test_results["steps"]["workload_prediction"] = {
                        "success": True,
                        "message": "Pattern detection not enabled, skipping test"
                    }
                
                # Test optimization plan generation
                self._generate_optimization_plan()
                
                test_results["steps"]["optimization_plan"] = {
                    "success": self.current_optimization_plan is not None,
                    "message": "Generated optimization plan" if self.current_optimization_plan else "Failed to generate optimization plan"
                }
                
                # Add diagnostics
                test_results["diagnostics"]["optimization_plan"] = self.current_optimization_plan
            
            # Overall success
            test_results["success"] = all(step["success"] for step in test_results["steps"].values())
            
            return test_results
        
        except Exception as e:
            logger.error(f"Error in Advanced Thread Pool Monitor test: {e}")
            test_results["success"] = False
            test_results["error"] = str(e)
            return test_results


# Example usage
if __name__ == "__main__":
    import asyncio
    from advanced_thread_pool_manager import AdvancedThreadPoolManager
    
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
        
        # Create an advanced thread pool monitor
        monitor = AdvancedThreadPoolMonitor(
            thread_pool_manager=manager,
            metadata={
                "poll_interval": 2.0,  # Poll every 2 seconds
                "metrics_window": 30,   # Keep 30 data points
                "capability_monitoring": True,
                "pattern_detection": True,
                "adaptive_thresholds": True
            }
        )
        
        try:
            # Start the monitor
            monitor.start()
            
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
                    iterations=1000000,  # 1M iterations
                    task_type=TaskType.CPU,
                    priority=TaskPriority.NORMAL,
                    metadata=cpu_metadata
                )
            
            # Wait for tasks to process
            await asyncio.sleep(3)
            
            # Get enhanced metrics
            enhanced_metrics = monitor.get_enhanced_metrics()
            print("\nEnhanced metrics summary:")
            
            if "workload_patterns" in enhanced_metrics:
                print("Workload patterns detected:")
                patterns = enhanced_metrics["workload_patterns"]
                for task_type, load in patterns.get("current_loads", {}).items():
                    print(f"  - {task_type}: {load}")
            
            # Get capability health
            print("\nCapability health:")
            for capability in [PoolCapability.GENERAL, PoolCapability.HIGH_IO, PoolCapability.HIGH_CPU]:
                health = monitor.get_capability_health(capability)
                print(f"  - {capability.name}: {health['status']} (Utilization: {health['metrics']['utilization']:.2f})")
            
            # Get advanced recommendations
            recommendations = monitor.get_advanced_recommendations()
            print("\nAdvanced recommendations:")
            
            if "general" in recommendations:
                for recommendation in recommendations["general"]:
                    print(f"  - General: {recommendation}")
            
            if "capabilities" in recommendations:
                for capability, data in recommendations["capabilities"].items():
                    print(f"  - {capability}: {data['message']}")
            
            # Get optimization plan
            plan = monitor.get_optimization_plan()
            print("\nOptimization plan:")
            
            if "pool_recommendations" in plan:
                for pool_id, recommendation in plan["pool_recommendations"].items():
                    print(f"  - {pool_id}: {recommendation['recommended_workers']} workers ({recommendation['reason']})")
            
            if "system_recommendations" in plan:
                for recommendation in plan["system_recommendations"]:
                    print(f"  - {recommendation['type']}: {recommendation['reason']}")
            
            # Run the test method
            print("\nRunning integrated tests...")
            test_results = await monitor.test()
            print(f"Test success: {test_results['success']}")
            
            for step, result in test_results["steps"].items():
                print(f"  - {step}: {result['success']} - {result['message']}")
        
        finally:
            # Stop the monitor
            monitor.stop()
            
            # Shutdown the manager
            manager.shutdown()
    
    # Run the example
    asyncio.run(main())