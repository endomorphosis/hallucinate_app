"""
Thread Pool Monitor

This module provides monitoring and performance tracking for thread pools.
It collects metrics from the Thread Pool Manager and visualizes resource usage,
task throughput, and system health statistics.

Key features:
- Real-time monitoring of thread pool utilization
- Performance metrics collection and aggregation
- Resource usage tracking and visualization
- Automatic detection of bottlenecks and performance issues
- Integration with the logging and error monitoring system
"""

import os
import sys
import time
import json
import logging
import threading
import asyncio
from typing import Dict, List, Any, Optional, Union, Tuple, Callable
from datetime import datetime, timedelta
import concurrent.futures

from .thread_pool_manager import (
    ThreadPoolManager,
    TaskType,
    TaskPriority,
    TaskState
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PerformanceMetrics:
    """
    Class for tracking performance metrics of thread pools
    """
    def __init__(self, window_size: int = 60):
        """
        Initialize performance metrics
        
        Args:
            window_size: Number of data points to keep in the sliding window
        """
        self.window_size = window_size
        
        # Time series data for metrics
        self.timestamps: List[float] = []
        self.task_throughput: List[int] = []
        self.worker_utilization: List[float] = []
        self.queue_depth: List[int] = []
        self.response_times: List[float] = []
        self.error_rates: List[float] = []
        
        # Aggregate metrics
        self.total_tasks_completed = 0
        self.total_tasks_failed = 0
        self.avg_response_time = 0.0
        self.peak_worker_utilization = 0.0
        self.peak_queue_depth = 0
        
        # Lock for thread safety
        self.lock = threading.RLock()
    
    def add_data_point(
        self,
        timestamp: float,
        tasks_completed: int,
        tasks_failed: int,
        worker_utilization: float,
        queue_depth: int,
        response_time: float
    ):
        """
        Add a new data point to the metrics
        
        Args:
            timestamp: Unix timestamp of the data point
            tasks_completed: Number of tasks completed since last data point
            tasks_failed: Number of tasks failed since last data point
            worker_utilization: Percentage of workers actively processing tasks (0-1)
            queue_depth: Number of tasks waiting in queue
            response_time: Average response time in seconds for completed tasks
        """
        with self.lock:
            # Add to time series
            self.timestamps.append(timestamp)
            self.task_throughput.append(tasks_completed)
            self.worker_utilization.append(worker_utilization)
            self.queue_depth.append(queue_depth)
            self.response_times.append(response_time)
            
            # Calculate error rate
            total_tasks = tasks_completed + tasks_failed
            error_rate = tasks_failed / total_tasks if total_tasks > 0 else 0.0
            self.error_rates.append(error_rate)
            
            # Update aggregate metrics
            self.total_tasks_completed += tasks_completed
            self.total_tasks_failed += tasks_failed
            
            # Update moving averages
            if tasks_completed > 0:
                self.avg_response_time = (
                    (self.avg_response_time * self.total_tasks_completed + response_time * tasks_completed) /
                    (self.total_tasks_completed + tasks_completed)
                )
            
            # Update peak metrics
            self.peak_worker_utilization = max(self.peak_worker_utilization, worker_utilization)
            self.peak_queue_depth = max(self.peak_queue_depth, queue_depth)
            
            # Trim sliding window if needed
            if len(self.timestamps) > self.window_size:
                self.timestamps = self.timestamps[-self.window_size:]
                self.task_throughput = self.task_throughput[-self.window_size:]
                self.worker_utilization = self.worker_utilization[-self.window_size:]
                self.queue_depth = self.queue_depth[-self.window_size:]
                self.response_times = self.response_times[-self.window_size:]
                self.error_rates = self.error_rates[-self.window_size:]
    
    def calculate_moving_average(self, data: List[float], window: int = 5) -> List[float]:
        """
        Calculate moving average for a data series
        
        Args:
            data: List of data points
            window: Size of the moving average window
            
        Returns:
            List[float]: Moving average values
        """
        if not data or window <= 0:
            return []
        
        result = []
        for i in range(len(data)):
            window_start = max(0, i - window + 1)
            window_data = data[window_start:i+1]
            avg = sum(window_data) / len(window_data)
            result.append(avg)
        
        return result
    
    def detect_anomalies(self, sensitivity: float = 2.0) -> Dict[str, List[Tuple[int, float]]]:
        """
        Detect anomalies in the metrics
        
        Args:
            sensitivity: How sensitive the anomaly detection should be (standard deviations)
            
        Returns:
            Dict[str, List[Tuple[int, float]]]: Dictionary mapping metric names to list of (index, value) tuples
        """
        with self.lock:
            anomalies = {}
            
            for metric_name, data in [
                ("worker_utilization", self.worker_utilization),
                ("queue_depth", self.queue_depth),
                ("response_times", self.response_times),
                ("error_rates", self.error_rates)
            ]:
                if len(data) < 5:  # Need enough data points
                    continue
                
                # Calculate mean and standard deviation
                mean = sum(data) / len(data)
                variance = sum((x - mean) ** 2 for x in data) / len(data)
                std_dev = variance ** 0.5
                
                # Find values outside the expected range
                metric_anomalies = []
                for i, value in enumerate(data):
                    if abs(value - mean) > sensitivity * std_dev:
                        metric_anomalies.append((i, value))
                
                if metric_anomalies:
                    anomalies[metric_name] = metric_anomalies
            
            return anomalies
    
    def get_snapshot(self) -> Dict[str, Any]:
        """
        Get a snapshot of the current metrics
        
        Returns:
            Dict[str, Any]: Dictionary of current metrics
        """
        with self.lock:
            # Calculate moving averages
            utilization_ma = self.calculate_moving_average(self.worker_utilization)
            throughput_ma = self.calculate_moving_average(self.task_throughput)
            response_time_ma = self.calculate_moving_average(self.response_times)
            
            return {
                "timestamps": self.timestamps,
                "time_series": {
                    "task_throughput": self.task_throughput,
                    "worker_utilization": self.worker_utilization,
                    "queue_depth": self.queue_depth,
                    "response_times": self.response_times,
                    "error_rates": self.error_rates,
                    "moving_averages": {
                        "worker_utilization": utilization_ma,
                        "task_throughput": throughput_ma,
                        "response_times": response_time_ma
                    }
                },
                "aggregates": {
                    "total_tasks_completed": self.total_tasks_completed,
                    "total_tasks_failed": self.total_tasks_failed,
                    "avg_response_time": self.avg_response_time,
                    "peak_worker_utilization": self.peak_worker_utilization,
                    "peak_queue_depth": self.peak_queue_depth,
                    "error_rate": (
                        self.total_tasks_failed / 
                        (self.total_tasks_completed + self.total_tasks_failed)
                    ) if (self.total_tasks_completed + self.total_tasks_failed) > 0 else 0.0
                },
                "anomalies": self.detect_anomalies()
            }


class ThreadPoolMonitor:
    """
    Monitor for thread pools that tracks performance metrics and health statistics.
    
    This class provides real-time monitoring of thread pool performance,
    resource usage, and operational metrics to help identify bottlenecks
    and optimize thread pool configurations.
    """
    
    def __init__(
        self,
        thread_pool_manager: ThreadPoolManager,
        resources: Dict[str, Any] = None,
        metadata: Dict[str, Any] = None
    ):
        """
        Initialize the Thread Pool Monitor
        
        Args:
            thread_pool_manager: The thread pool manager to monitor
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.thread_pool_manager = thread_pool_manager
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Configuration
        self.config = {
            "poll_interval": self.metadata.get("poll_interval", 5.0),  # Seconds
            "metrics_window": self.metadata.get("metrics_window", 60),  # Number of data points
            "archive_metrics": self.metadata.get("archive_metrics", True),
            "metrics_archive_path": self.metadata.get("metrics_archive_path", "metrics_archive.json"),
            "alert_thresholds": self.metadata.get("alert_thresholds", {
                "high_queue_depth": 20,
                "high_worker_utilization": 0.9,
                "high_error_rate": 0.1,
                "slow_response_time": 1.0  # Seconds
            })
        }
        
        # Performance metrics for each pool
        self.pool_metrics: Dict[str, PerformanceMetrics] = {}
        
        # Overall metrics
        self.system_metrics = PerformanceMetrics(window_size=self.config["metrics_window"])
        
        # State tracking
        self.running = False
        self.monitor_thread = None
        self.prev_stats = None
        self.start_time = None
        
        # Lock for thread safety
        self.lock = threading.RLock()
        
        # Event for signaling
        self.stop_event = threading.Event()
        
        logger.info(f"ThreadPoolMonitor initialized with config: {self.config}")
    
    def start(self):
        """
        Start the monitoring thread
        """
        if self.running:
            logger.warning("Thread Pool Monitor already running")
            return
        
        with self.lock:
            self.running = True
            self.stop_event.clear()
            self.start_time = time.time()
            
            # Initialize metrics for each pool
            stats = self.thread_pool_manager.get_stats()
            self.prev_stats = stats
            
            # Create metrics for each pool
            for pool_id in stats["pools"]:
                self.pool_metrics[pool_id] = PerformanceMetrics(
                    window_size=self.config["metrics_window"]
                )
            
            # Start the monitoring thread
            self.monitor_thread = threading.Thread(
                target=self._monitor_loop,
                name="thread-pool-monitor",
                daemon=True
            )
            self.monitor_thread.start()
            
            logger.info("Thread Pool Monitor started")
    
    def stop(self):
        """
        Stop the monitoring thread
        """
        if not self.running:
            logger.warning("Thread Pool Monitor not running")
            return
        
        with self.lock:
            self.running = False
            self.stop_event.set()
            
            if self.monitor_thread:
                self.monitor_thread.join(timeout=10.0)
                self.monitor_thread = None
            
            logger.info("Thread Pool Monitor stopped")
            
            # Archive metrics if configured
            if self.config["archive_metrics"]:
                self._archive_metrics()
    
    def _monitor_loop(self):
        """
        Main monitoring loop
        """
        logger.info("Monitoring thread started")
        
        try:
            while not self.stop_event.is_set():
                try:
                    # Collect and process metrics
                    self._collect_metrics()
                    
                    # Check thresholds and raise alerts if needed
                    self._check_alert_thresholds()
                    
                except Exception as e:
                    logger.error(f"Error in monitoring loop: {e}")
                
                # Wait for the next collection interval
                self.stop_event.wait(self.config["poll_interval"])
        
        except Exception as e:
            logger.error(f"Fatal error in monitoring thread: {e}")
        
        finally:
            logger.info("Monitoring thread stopped")
    
    def _collect_metrics(self):
        """
        Collect metrics from the thread pool manager
        """
        # Get current stats
        current_stats = self.thread_pool_manager.get_stats()
        timestamp = time.time()
        
        # Calculate delta metrics since last collection
        if self.prev_stats:
            prev_pools = self.prev_stats["pools"]
            current_pools = current_stats["pools"]
            
            # System-wide metrics
            system_tasks_completed = (
                current_stats["tasks"]["completed"] - 
                self.prev_stats["tasks"]["completed"]
            )
            system_tasks_failed = (
                current_stats["tasks"]["failed"] - 
                self.prev_stats["tasks"]["failed"]
            )
            system_worker_utilization = (
                current_stats["workers"]["active"] / 
                current_stats["workers"]["total"]
            ) if current_stats["workers"]["total"] > 0 else 0.0
            system_queue_depth = current_stats["tasks"]["pending"]
            
            # Calculate average response time across all pools
            total_runtime = 0.0
            total_completed = 0
            
            # Process each pool
            for pool_id, pool_stats in current_pools.items():
                # Get previous stats for this pool
                prev_pool_stats = prev_pools.get(pool_id)
                
                if prev_pool_stats:
                    # Calculate metrics for this pool
                    tasks_completed = (
                        pool_stats["tasks"]["completed"] - 
                        prev_pool_stats["tasks"]["completed"]
                    )
                    tasks_failed = (
                        pool_stats["tasks"]["failed"] - 
                        prev_pool_stats["tasks"]["failed"]
                    )
                    worker_utilization = (
                        pool_stats["resources"]["active_workers"] / 
                        pool_stats["resources"]["worker_count"]
                    ) if pool_stats["resources"]["worker_count"] > 0 else 0.0
                    queue_depth = pool_stats["resources"]["queue_size"]
                    
                    # Response time - calculate from performance metrics
                    # If no tasks completed in this interval, use previous value or 0
                    if tasks_completed > 0:
                        response_time = (
                            (pool_stats["performance"]["total_runtime"] - 
                            prev_pool_stats["performance"]["total_runtime"]) / 
                            tasks_completed
                        )
                        
                        # Contribute to system average
                        total_runtime += response_time * tasks_completed
                        total_completed += tasks_completed
                    else:
                        # No tasks completed in this interval
                        response_time = 0.0
                    
                    # Add metrics to this pool
                    if pool_id in self.pool_metrics:
                        self.pool_metrics[pool_id].add_data_point(
                            timestamp=timestamp,
                            tasks_completed=tasks_completed,
                            tasks_failed=tasks_failed,
                            worker_utilization=worker_utilization,
                            queue_depth=queue_depth,
                            response_time=response_time
                        )
                else:
                    # New pool, initialize metrics
                    if pool_id not in self.pool_metrics:
                        self.pool_metrics[pool_id] = PerformanceMetrics(
                            window_size=self.config["metrics_window"]
                        )
            
            # Calculate system-wide average response time
            system_response_time = (
                total_runtime / total_completed
            ) if total_completed > 0 else 0.0
            
            # Add system-wide metrics
            self.system_metrics.add_data_point(
                timestamp=timestamp,
                tasks_completed=system_tasks_completed,
                tasks_failed=system_tasks_failed,
                worker_utilization=system_worker_utilization,
                queue_depth=system_queue_depth,
                response_time=system_response_time
            )
        
        # Save current stats for next iteration
        self.prev_stats = current_stats
    
    def _check_alert_thresholds(self):
        """
        Check if any metrics exceed alert thresholds
        """
        thresholds = self.config["alert_thresholds"]
        
        # Check system-wide metrics
        system_snapshot = self.system_metrics.get_snapshot()
        
        # Check queue depth
        if (system_snapshot["time_series"]["queue_depth"] and 
            system_snapshot["time_series"]["queue_depth"][-1] > thresholds["high_queue_depth"]):
            logger.warning(
                f"System queue depth {system_snapshot['time_series']['queue_depth'][-1]} "
                f"exceeds threshold {thresholds['high_queue_depth']}"
            )
        
        # Check worker utilization
        if (system_snapshot["time_series"]["worker_utilization"] and 
            system_snapshot["time_series"]["worker_utilization"][-1] > thresholds["high_worker_utilization"]):
            logger.warning(
                f"System worker utilization {system_snapshot['time_series']['worker_utilization'][-1]:.2f} "
                f"exceeds threshold {thresholds['high_worker_utilization']:.2f}"
            )
        
        # Check error rate
        if (system_snapshot["time_series"]["error_rates"] and 
            system_snapshot["time_series"]["error_rates"][-1] > thresholds["high_error_rate"]):
            logger.warning(
                f"System error rate {system_snapshot['time_series']['error_rates'][-1]:.2f} "
                f"exceeds threshold {thresholds['high_error_rate']:.2f}"
            )
        
        # Check response time
        if (system_snapshot["time_series"]["response_times"] and 
            system_snapshot["time_series"]["response_times"][-1] > thresholds["slow_response_time"]):
            logger.warning(
                f"System response time {system_snapshot['time_series']['response_times'][-1]:.2f}s "
                f"exceeds threshold {thresholds['slow_response_time']:.2f}s"
            )
        
        # Check for anomalies
        if system_snapshot["anomalies"]:
            for metric, anomalies in system_snapshot["anomalies"].items():
                if anomalies:
                    logger.warning(f"Detected anomalies in {metric}: {anomalies}")
        
        # Check individual pools
        for pool_id, metrics in self.pool_metrics.items():
            pool_snapshot = metrics.get_snapshot()
            
            # Check for anomalies in this pool
            if pool_snapshot["anomalies"]:
                for metric, anomalies in pool_snapshot["anomalies"].items():
                    if anomalies:
                        logger.warning(f"Pool {pool_id} detected anomalies in {metric}: {anomalies}")
    
    def _archive_metrics(self):
        """
        Archive metrics to a file
        """
        try:
            # Create archive data
            archive_data = {
                "timestamp": time.time(),
                "system_metrics": self.system_metrics.get_snapshot(),
                "pool_metrics": {
                    pool_id: metrics.get_snapshot()
                    for pool_id, metrics in self.pool_metrics.items()
                }
            }
            
            # Write to file
            with open(self.config["metrics_archive_path"], "w") as f:
                json.dump(archive_data, f, indent=2)
            
            logger.info(f"Metrics archived to {self.config['metrics_archive_path']}")
        
        except Exception as e:
            logger.error(f"Error archiving metrics: {e}")
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get current metrics
        
        Returns:
            Dict[str, Any]: Dictionary of current metrics
        """
        with self.lock:
            metrics = {
                "timestamp": time.time(),
                "uptime": time.time() - self.start_time if self.start_time else 0,
                "system": self.system_metrics.get_snapshot(),
                "pools": {
                    pool_id: metrics.get_snapshot()
                    for pool_id, metrics in self.pool_metrics.items()
                },
                "config": self.config
            }
            
            return metrics
    
    def get_health_report(self) -> Dict[str, Any]:
        """
        Get a health report for the thread pools
        
        Returns:
            Dict[str, Any]: Health report
        """
        metrics = self.get_metrics()
        
        # Calculate health status
        system_metrics = metrics["system"]
        
        # Determine system health based on metrics
        error_rate = system_metrics["aggregates"]["error_rate"]
        worker_utilization = (
            system_metrics["time_series"]["worker_utilization"][-1] 
            if system_metrics["time_series"]["worker_utilization"] else 0
        )
        queue_depth = (
            system_metrics["time_series"]["queue_depth"][-1]
            if system_metrics["time_series"]["queue_depth"] else 0
        )
        
        # Determine overall health status
        status = "healthy"
        issues = []
        
        # Check error rate
        if error_rate > self.config["alert_thresholds"]["high_error_rate"]:
            status = "degraded"
            issues.append(f"High error rate: {error_rate:.2f}")
        
        # Check worker utilization
        if worker_utilization > self.config["alert_thresholds"]["high_worker_utilization"]:
            status = "degraded"
            issues.append(f"High worker utilization: {worker_utilization:.2f}")
        
        # Check queue depth
        if queue_depth > self.config["alert_thresholds"]["high_queue_depth"]:
            status = "degraded"
            issues.append(f"High queue depth: {queue_depth}")
        
        # Check for anomalies
        if system_metrics["anomalies"]:
            status = "degraded"
            for metric, anomalies in system_metrics["anomalies"].items():
                if anomalies:
                    issues.append(f"Anomalies detected in {metric}")
        
        # Build the health report
        report = {
            "timestamp": metrics["timestamp"],
            "uptime": metrics["uptime"],
            "status": status,
            "issues": issues,
            "pools_status": {},
            "task_throughput": (
                sum(system_metrics["time_series"]["task_throughput"][-10:])
                if len(system_metrics["time_series"]["task_throughput"]) >= 10
                else sum(system_metrics["time_series"]["task_throughput"])
            ),
            "avg_response_time": system_metrics["aggregates"]["avg_response_time"],
            "error_rate": system_metrics["aggregates"]["error_rate"],
            "worker_utilization": worker_utilization,
            "queue_depth": queue_depth
        }
        
        # Add status for each pool
        for pool_id, pool_metrics in metrics["pools"].items():
            pool_status = "healthy"
            pool_issues = []
            
            # Check pool-specific metrics
            pool_error_rate = pool_metrics["aggregates"]["error_rate"]
            pool_worker_utilization = (
                pool_metrics["time_series"]["worker_utilization"][-1] 
                if pool_metrics["time_series"]["worker_utilization"] else 0
            )
            pool_queue_depth = (
                pool_metrics["time_series"]["queue_depth"][-1]
                if pool_metrics["time_series"]["queue_depth"] else 0
            )
            
            # Check for issues
            if pool_error_rate > self.config["alert_thresholds"]["high_error_rate"]:
                pool_status = "degraded"
                pool_issues.append(f"High error rate: {pool_error_rate:.2f}")
            
            if pool_worker_utilization > self.config["alert_thresholds"]["high_worker_utilization"]:
                pool_status = "degraded"
                pool_issues.append(f"High worker utilization: {pool_worker_utilization:.2f}")
            
            if pool_queue_depth > self.config["alert_thresholds"]["high_queue_depth"]:
                pool_status = "degraded"
                pool_issues.append(f"High queue depth: {pool_queue_depth}")
            
            # Add to report
            report["pools_status"][pool_id] = {
                "status": pool_status,
                "issues": pool_issues,
                "task_throughput": (
                    sum(pool_metrics["time_series"]["task_throughput"][-10:])
                    if len(pool_metrics["time_series"]["task_throughput"]) >= 10
                    else sum(pool_metrics["time_series"]["task_throughput"])
                ),
                "avg_response_time": pool_metrics["aggregates"]["avg_response_time"],
                "error_rate": pool_metrics["aggregates"]["error_rate"],
                "worker_utilization": pool_worker_utilization,
                "queue_depth": pool_queue_depth
            }
        
        return report
    
    def get_optimization_recommendations(self) -> Dict[str, Any]:
        """
        Get recommendations for optimizing thread pool configuration
        
        Returns:
            Dict[str, Any]: Recommendations
        """
        metrics = self.get_metrics()
        system_metrics = metrics["system"]
        
        recommendations = {
            "timestamp": metrics["timestamp"],
            "general": [],
            "pools": {}
        }
        
        # Check system-wide metrics for recommendations
        worker_utilization = (
            system_metrics["time_series"]["worker_utilization"][-1] 
            if system_metrics["time_series"]["worker_utilization"] else 0
        )
        queue_depth = (
            system_metrics["time_series"]["queue_depth"][-1]
            if system_metrics["time_series"]["queue_depth"] else 0
        )
        
        # Check for high worker utilization
        if worker_utilization > 0.85:
            recommendations["general"].append(
                "Consider increasing max_workers across pools due to high overall utilization"
            )
        
        # Check for low worker utilization
        if worker_utilization < 0.3 and metrics["uptime"] > 300:  # After 5 minutes of runtime
            recommendations["general"].append(
                "Consider decreasing max_workers across pools due to low overall utilization"
            )
        
        # Check for high queue depth
        if queue_depth > 10:
            recommendations["general"].append(
                "Consider increasing worker count to handle backlog in task queues"
            )
        
        # Check individual pools
        for pool_id, pool_metrics in metrics["pools"].items():
            pool_recommendations = []
            
            # Check pool-specific metrics
            pool_worker_utilization = (
                pool_metrics["time_series"]["worker_utilization"][-1] 
                if pool_metrics["time_series"]["worker_utilization"] else 0
            )
            pool_queue_depth = (
                pool_metrics["time_series"]["queue_depth"][-1]
                if pool_metrics["time_series"]["queue_depth"] else 0
            )
            
            # Check for high worker utilization
            if pool_worker_utilization > 0.85:
                pool_recommendations.append(
                    f"Increase max_workers for this pool (current utilization: {pool_worker_utilization:.2f})"
                )
            
            # Check for low worker utilization
            if pool_worker_utilization < 0.3 and metrics["uptime"] > 300:  # After 5 minutes of runtime
                pool_recommendations.append(
                    f"Decrease max_workers for this pool (current utilization: {pool_worker_utilization:.2f})"
                )
            
            # Check for high queue depth
            if pool_queue_depth > 10:
                pool_recommendations.append(
                    f"Increase worker count to handle backlog ({pool_queue_depth} tasks in queue)"
                )
            
            # Add to recommendations
            if pool_recommendations:
                recommendations["pools"][pool_id] = pool_recommendations
        
        return recommendations
    
    async def test(self) -> Dict[str, Any]:
        """
        Run module tests
        
        Returns:
            Dict[str, Any]: Test results
        """
        logger.info("Testing Thread Pool Monitor")
        
        test_results = {
            "success": False,
            "module": "thread_pool_monitor",
            "steps": {},
            "diagnostics": {
                "config": self.config
            }
        }
        
        try:
            # Test 1: Start the monitor
            if not self.running:
                self.start()
            
            test_results["steps"]["start_monitor"] = {
                "success": self.running,
                "message": "Monitor started successfully" if self.running else "Failed to start monitor"
            }
            
            if not self.running:
                test_results["success"] = False
                return test_results
            
            # Test 2: Generate some test metrics
            # We'll submit tasks to the thread pool manager to generate activity
            
            # Define some test tasks
            def cpu_task(n):
                """CPU-intensive task"""
                result = 0
                for i in range(n):
                    result += i
                return result
            
            def io_task(sleep_time):
                """I/O-bound task"""
                time.sleep(sleep_time)
                return f"Slept for {sleep_time}s"
            
            futures = []
            
            # Submit some tasks to generate metrics
            for i in range(5):
                task_id, future = self.thread_pool_manager.submit(
                    function=cpu_task,
                    n=100000,  # 100K iterations
                    task_type=TaskType.CPU,
                    priority=TaskPriority.NORMAL
                )
                futures.append(future)
            
            for i in range(5):
                task_id, future = self.thread_pool_manager.submit(
                    function=io_task,
                    sleep_time=0.1,
                    task_type=TaskType.IO,
                    priority=TaskPriority.HIGH
                )
                futures.append(future)
            
            # Wait for tasks to complete
            for future in concurrent.futures.as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    logger.error(f"Task failed: {e}")
            
            # Sleep to let the monitor collect metrics
            time.sleep(self.config["poll_interval"] * 2)
            
            # Test 3: Get metrics
            metrics = self.get_metrics()
            
            test_results["steps"]["collect_metrics"] = {
                "success": "system" in metrics and "pools" in metrics,
                "message": "Collected metrics successfully" if "system" in metrics else "Failed to collect metrics"
            }
            
            if not test_results["steps"]["collect_metrics"]["success"]:
                test_results["success"] = False
                return test_results
            
            # Add diagnostics
            test_results["diagnostics"]["metrics"] = metrics
            
            # Test 4: Get health report
            health_report = self.get_health_report()
            
            test_results["steps"]["get_health_report"] = {
                "success": "status" in health_report,
                "message": "Generated health report" if "status" in health_report else "Failed to generate health report"
            }
            
            if not test_results["steps"]["get_health_report"]["success"]:
                test_results["success"] = False
                return test_results
            
            # Add diagnostics
            test_results["diagnostics"]["health_report"] = health_report
            
            # Test 5: Get optimization recommendations
            recommendations = self.get_optimization_recommendations()
            
            test_results["steps"]["get_recommendations"] = {
                "success": "general" in recommendations and "pools" in recommendations,
                "message": "Generated recommendations" if "general" in recommendations else "Failed to generate recommendations"
            }
            
            # Add diagnostics
            test_results["diagnostics"]["recommendations"] = recommendations
            
            # Test 6: Stop the monitor
            self.stop()
            
            test_results["steps"]["stop_monitor"] = {
                "success": not self.running,
                "message": "Monitor stopped successfully" if not self.running else "Failed to stop monitor"
            }
            
            # Overall success
            test_results["success"] = all(step["success"] for step in test_results["steps"].values())
            
            return test_results
        
        except Exception as e:
            logger.error(f"Error in Thread Pool Monitor test: {e}")
            test_results["success"] = False
            test_results["error"] = str(e)
            return test_results


# Example usage
if __name__ == "__main__":
    import asyncio
    
    async def main():
        # Create a thread pool manager
        manager = ThreadPoolManager(metadata={"auto_create_pools": True})
        
        # Create a thread pool monitor
        monitor = ThreadPoolMonitor(
            thread_pool_manager=manager,
            metadata={
                "poll_interval": 2.0,  # Poll every 2 seconds
                "metrics_window": 30   # Keep 30 data points
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
            
            # Submit a mix of tasks to generate metrics
            print("Submitting tasks...")
            for _ in range(3):
                # Submit tasks in batches
                for i in range(10):
                    manager.submit(
                        function=cpu_task,
                        iterations=500000,  # 500K iterations
                        task_type=TaskType.CPU,
                        priority=TaskPriority.NORMAL
                    )
                
                for i in range(10):
                    manager.submit(
                        function=io_task,
                        sleep_time=0.2,
                        task_type=TaskType.IO,
                        priority=TaskPriority.HIGH
                    )
                
                # Let the monitor collect metrics
                await asyncio.sleep(5)
                
                # Get and print current metrics
                metrics = monitor.get_metrics()
                print(f"\nMetrics after batch {_ + 1}:")
                print(f"- System task throughput: {metrics['system']['time_series']['task_throughput']}")
                print(f"- System worker utilization: {metrics['system']['time_series']['worker_utilization']}")
                print(f"- System queue depth: {metrics['system']['time_series']['queue_depth']}")
                
                # Get and print health report
                health = monitor.get_health_report()
                print(f"\nHealth report:")
                print(f"- Status: {health['status']}")
                if health['issues']:
                    print(f"- Issues: {health['issues']}")
                
                # Get and print optimization recommendations
                recommendations = monitor.get_optimization_recommendations()
                print(f"\nOptimization recommendations:")
                if recommendations['general']:
                    print(f"- General: {recommendations['general']}")
                for pool_id, pool_recommendations in recommendations['pools'].items():
                    if pool_recommendations:
                        print(f"- Pool {pool_id}: {pool_recommendations}")
            
            # Run the test method
            test_results = await monitor.test()
            print(f"\nTest results: {test_results['success']}")
            print(f"Steps: {list(test_results['steps'].keys())}")
            
        finally:
            # Stop the monitor
            monitor.stop()
            
            # Shutdown the thread pool manager
            manager.shutdown()
    
    # Run the example
    asyncio.run(main())