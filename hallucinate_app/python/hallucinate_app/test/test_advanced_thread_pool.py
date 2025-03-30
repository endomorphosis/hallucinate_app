"""
Advanced Thread Pool System Tests

This module provides comprehensive tests for the advanced thread pool system,
including the thread pool manager, monitor, and integration components.

The tests cover:
- Basic thread pool functionality
- Advanced task routing and prioritization
- Capability-based pool selection
- Performance monitoring and metrics
- Workload pattern detection and prediction
- Resource optimization recommendations
- Thread pool integration with automatic task type detection
"""

import os
import sys
import time
import asyncio
import threading
import unittest
import json
import logging
from typing import Dict, List, Any, Optional, Union, Tuple
from concurrent.futures import Future

# Ensure the parent directory is in the path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import thread pool system
from hallucinate_app.thread_pool_manager import (
    ThreadPoolManager,
    TaskPriority,
    TaskType,
    TaskState
)

from hallucinate_app.thread_pool_monitor import ThreadPoolMonitor

# Try to import advanced components
try:
    from hallucinate_app.advanced_thread_pool_manager import (
        AdvancedThreadPoolManager,
        TaskAffinity,
        PoolCapability,
        TaskMetadata,
        ResourceProfile
    )
    
    from hallucinate_app.advanced_thread_pool_monitor import (
        AdvancedThreadPoolMonitor,
        WorkloadPattern,
        EnhancedPerformanceMetrics
    )
    
    ADVANCED_AVAILABLE = True
except ImportError:
    ADVANCED_AVAILABLE = False

# Try to import integration component
try:
    from hallucinate_app.thread_pool_integration import ThreadPoolIntegration
    INTEGRATION_AVAILABLE = True
except ImportError:
    INTEGRATION_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Test functions for different task types
def cpu_task(iterations):
    """CPU-bound computation task"""
    result = 0
    for i in range(iterations):
        result += i
    return result


def io_task(sleep_time):
    """I/O-bound task that simulates file/network operations"""
    time.sleep(sleep_time)
    return f"Completed I/O task after {sleep_time}s"


def database_query_task(rows=10, query_time=0.1):
    """Database query task"""
    time.sleep(query_time)  # Simulate query execution
    return {"rows": rows, "query_time": query_time}


def ml_inference_task(model_size=1000, inference_time=0.2):
    """Machine learning inference task"""
    time.sleep(inference_time)  # Simulate model inference
    return {"predictions": model_size, "inference_time": inference_time}


def ipfs_storage_task(data_size=1000, storage_time=0.3):
    """IPFS storage task"""
    time.sleep(storage_time)  # Simulate IPFS storage
    return {"stored_bytes": data_size, "storage_time": storage_time}


def security_task(token_size=128, processing_time=0.1):
    """Security/auth task"""
    time.sleep(processing_time)  # Simulate security processing
    return {"token_size": token_size, "processing_time": processing_time}


class TestBasicThreadPoolManager(unittest.TestCase):
    """Tests for the basic ThreadPoolManager"""
    
    def setUp(self):
        """Set up the test case"""
        self.manager = ThreadPoolManager(metadata={"auto_create_pools": True})
    
    def tearDown(self):
        """Clean up after the test case"""
        self.manager.shutdown()
    
    def test_pool_creation(self):
        """Test that pools are created correctly"""
        self.assertTrue(len(self.manager.pools) > 0)
        self.assertIn(TaskType.GENERAL, self.manager.pools)
        self.assertIn(TaskType.IO, self.manager.pools)
        self.assertIn(TaskType.CPU, self.manager.pools)
    
    def test_task_submission(self):
        """Test task submission and execution"""
        task_id, future = self.manager.submit(
            function=io_task,
            sleep_time=0.1,
            task_type=TaskType.IO,
            priority=TaskPriority.NORMAL
        )
        
        # Wait for result
        result = future.result(timeout=1.0)
        
        self.assertIsNotNone(task_id)
        self.assertIn("Completed I/O task", result)
    
    def test_task_priorities(self):
        """Test that tasks are executed in priority order"""
        result_list = []
        
        def priority_test_function(priority_name):
            # Add to result list
            result_list.append(priority_name)
            time.sleep(0.1)  # Ensure all tasks are submitted before any completes
            return priority_name
        
        # Submit tasks in reverse priority order (low priority first)
        priorities = [
            (TaskPriority.LOW, "LOW"),
            (TaskPriority.NORMAL, "NORMAL"),
            (TaskPriority.HIGH, "HIGH"),
            (TaskPriority.CRITICAL, "CRITICAL")
        ]
        
        futures = []
        for priority, name in reversed(priorities):
            _, future = self.manager.submit(
                function=priority_test_function,
                priority=priority,
                priority_name=name,
                task_type=TaskType.GENERAL
            )
            futures.append(future)
        
        # Wait for all tasks to complete
        for future in futures:
            future.result(timeout=1.0)
        
        # Check priorities - should be in order from CRITICAL to LOW
        expected_order = [p[1] for p in priorities]
        self.assertEqual(result_list, expected_order)
    
    def test_task_cancellation(self):
        """Test that tasks can be cancelled"""
        # Submit a long-running task
        task_id, future = self.manager.submit(
            function=io_task,
            sleep_time=10.0,  # 10 seconds
            task_type=TaskType.IO,
            priority=TaskPriority.NORMAL
        )
        
        # Cancel the task
        result = self.manager.cancel_task(task_id)
        
        self.assertTrue(result)
        self.assertTrue(future.cancelled() or future.done())
    
    def test_stats(self):
        """Test that statistics are correctly collected"""
        # Submit some tasks
        for _ in range(5):
            self.manager.submit(
                function=io_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.NORMAL
            )
        
        # Get stats
        stats = self.manager.get_stats()
        
        self.assertIn("pools", stats)
        self.assertIn("tasks", stats)
        self.assertIn("submitted", stats["tasks"])
        self.assertGreaterEqual(stats["tasks"]["submitted"], 5)
    
    async def test_async(self):
        """Test async functionality"""
        # Run the test method
        test_results = await self.manager.test()
        
        self.assertTrue(test_results["success"])
        self.assertEqual(test_results["module"], "thread_pool_manager")
        self.assertTrue(all(step["success"] for step in test_results["steps"].values()))


@unittest.skipIf(not ADVANCED_AVAILABLE, "Advanced thread pool components not available")
class TestAdvancedThreadPoolManager(unittest.TestCase):
    """Tests for the AdvancedThreadPoolManager"""
    
    def setUp(self):
        """Set up the test case"""
        self.manager = AdvancedThreadPoolManager(
            metadata={
                "enable_adaptive_routing": True,
                "enable_task_migration": True,
                "enable_aging": True,
                "use_enhanced_pools": True
            }
        )
    
    def tearDown(self):
        """Clean up after the test case"""
        self.manager.shutdown()
    
    def test_advanced_pool_creation(self):
        """Test that enhanced pools are created correctly"""
        self.assertTrue(len(self.manager.pools) > 0)
        self.assertIn(TaskType.GENERAL, self.manager.pools)
        self.assertIn(TaskType.IO, self.manager.pools)
        self.assertIn(TaskType.CPU, self.manager.pools)
        
        # Check pool capabilities
        self.assertTrue(hasattr(self.manager.pools[TaskType.IO], "capabilities"))
        self.assertIn(PoolCapability.HIGH_IO, self.manager.pools[TaskType.IO].capabilities)
    
    def test_task_metadata(self):
        """Test that task metadata is correctly used"""
        # Create metadata with specific capabilities
        metadata = TaskMetadata(
            required_capabilities={PoolCapability.HIGH_IO},
            affinity=TaskAffinity.PREFERRED,
            estimated_duration=0.5
        )
        
        # Submit task with metadata
        task_id, future = self.manager.submit(
            function=io_task,
            sleep_time=0.1,
            task_type=TaskType.IO,
            priority=TaskPriority.NORMAL,
            metadata=metadata
        )
        
        # Wait for result
        result = future.result(timeout=1.0)
        
        self.assertIsNotNone(task_id)
        self.assertIn("Completed I/O task", result)
        
        # Verify routing - should be routed to a pool with HIGH_IO capability
        stats = self.manager.get_stats()
        io_routed = False
        
        if "routing" in stats:
            routing = stats["routing"].get(TaskType.IO.name, {})
            for pool_id, count in routing.items():
                if "io" in pool_id.lower() and count > 0:
                    io_routed = True
        
        self.assertTrue(io_routed)
    
    def test_capability_routing(self):
        """Test capability-based routing"""
        # Submit tasks with different capabilities
        tasks = [
            (TaskType.IO, {PoolCapability.HIGH_IO}, io_task, 0.1),
            (TaskType.CPU, {PoolCapability.HIGH_CPU}, cpu_task, 10000),
            (TaskType.ML, {PoolCapability.ML}, ml_inference_task, 1000),
            (TaskType.IPFS, {PoolCapability.IPFS}, ipfs_storage_task, 1000),
            (TaskType.DATABASE, {PoolCapability.DATABASE}, database_query_task, 10),
            (TaskType.SECURITY, {PoolCapability.SECURITY}, security_task, 128)
        ]
        
        futures = []
        for task_type, capabilities, func, arg in tasks:
            metadata = TaskMetadata(
                required_capabilities=capabilities,
                affinity=TaskAffinity.PREFERRED
            )
            
            _, future = self.manager.submit(
                function=func,
                task_type=task_type,
                priority=TaskPriority.NORMAL,
                metadata=metadata,
                **{func.__code__.co_varnames[0]: arg}  # Pass the argument by name
            )
            futures.append(future)
        
        # Wait for all tasks to complete
        for future in futures:
            future.result(timeout=5.0)
        
        # Check routing stats
        stats = self.manager.get_stats()
        self.assertIn("routing", stats)
        
        # Should have routed at least some tasks to type-specific pools
        routing_counts = {}
        for task_type, routing in stats["routing"].items():
            for pool_id, count in routing.items():
                if task_type.lower() in pool_id.lower():
                    routing_counts[task_type] = routing_counts.get(task_type, 0) + count
        
        # At least some tasks should be routed to their type-specific pools
        self.assertGreater(sum(routing_counts.values()), 0)
    
    def test_advanced_stats(self):
        """Test advanced statistics collection"""
        # Submit some tasks
        for _ in range(5):
            self.manager.submit(
                function=io_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.NORMAL
            )
        
        for _ in range(5):
            self.manager.submit(
                function=cpu_task,
                iterations=10000,
                task_type=TaskType.CPU,
                priority=TaskPriority.NORMAL
            )
        
        # Get enhanced stats
        stats = self.manager.get_stats()
        
        self.assertIn("enhanced_pools", stats)
        self.assertIn("routing", stats)
        self.assertIn("capabilities", stats)
    
    async def test_advanced_async(self):
        """Test advanced async functionality"""
        # Run the test method
        test_results = await self.manager.test()
        
        self.assertTrue(test_results["success"])
        self.assertEqual(test_results["module"], "advanced_thread_pool_manager")
        self.assertTrue(all(step["success"] for step in test_results["steps"].values()))


class TestThreadPoolMonitor(unittest.TestCase):
    """Tests for the ThreadPoolMonitor"""
    
    def setUp(self):
        """Set up the test case"""
        self.manager = ThreadPoolManager(metadata={"auto_create_pools": True})
        self.monitor = ThreadPoolMonitor(
            thread_pool_manager=self.manager,
            metadata={
                "poll_interval": 1.0,  # Poll every 1 second
                "metrics_window": 10    # Keep 10 data points
            }
        )
        self.monitor.start()
    
    def tearDown(self):
        """Clean up after the test case"""
        self.monitor.stop()
        self.manager.shutdown()
    
    def test_monitor_start_stop(self):
        """Test that the monitor can be started and stopped"""
        self.assertTrue(self.monitor.running)
        
        self.monitor.stop()
        self.assertFalse(self.monitor.running)
        
        self.monitor.start()
        self.assertTrue(self.monitor.running)
    
    def test_metrics_collection(self):
        """Test that metrics are correctly collected"""
        # Submit some tasks to generate metrics
        for _ in range(5):
            self.manager.submit(
                function=io_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.NORMAL
            )
        
        # Wait for metrics to be collected
        time.sleep(2.0)
        
        # Get metrics
        metrics = self.monitor.get_metrics()
        
        self.assertIn("system", metrics)
        self.assertIn("pools", metrics)
        self.assertIn("timestamp", metrics)
    
    def test_health_report(self):
        """Test that health report is correctly generated"""
        # Submit some tasks to generate metrics
        for _ in range(5):
            self.manager.submit(
                function=io_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.NORMAL
            )
        
        # Wait for metrics to be collected
        time.sleep(2.0)
        
        # Get health report
        health = self.monitor.get_health_report()
        
        self.assertIn("status", health)
        self.assertIn("issues", health)
        self.assertIn("pools_status", health)
    
    def test_optimization_recommendations(self):
        """Test that optimization recommendations are correctly generated"""
        # Submit some tasks to generate metrics
        for _ in range(5):
            self.manager.submit(
                function=io_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.NORMAL
            )
        
        # Wait for metrics to be collected
        time.sleep(2.0)
        
        # Get optimization recommendations
        recommendations = self.monitor.get_optimization_recommendations()
        
        self.assertIn("general", recommendations)
        self.assertIn("pools", recommendations)
    
    async def test_monitor_async(self):
        """Test monitor async functionality"""
        # Run the test method
        test_results = await self.monitor.test()
        
        self.assertTrue(test_results["success"])
        self.assertEqual(test_results["module"], "thread_pool_monitor")
        self.assertTrue(all(step["success"] for step in test_results["steps"].values()))


@unittest.skipIf(not ADVANCED_AVAILABLE, "Advanced thread pool components not available")
class TestAdvancedThreadPoolMonitor(unittest.TestCase):
    """Tests for the AdvancedThreadPoolMonitor"""
    
    def setUp(self):
        """Set up the test case"""
        self.manager = AdvancedThreadPoolManager(
            metadata={
                "enable_adaptive_routing": True,
                "enable_task_migration": True,
                "enable_aging": True,
                "use_enhanced_pools": True
            }
        )
        self.monitor = AdvancedThreadPoolMonitor(
            thread_pool_manager=self.manager,
            metadata={
                "poll_interval": 1.0,  # Poll every 1 second
                "metrics_window": 10,   # Keep 10 data points
                "capability_monitoring": True,
                "pattern_detection": True,
                "adaptive_thresholds": True
            }
        )
        self.monitor.start()
    
    def tearDown(self):
        """Clean up after the test case"""
        self.monitor.stop()
        self.manager.shutdown()
    
    def test_enhanced_metrics_collection(self):
        """Test that enhanced metrics are correctly collected"""
        # Submit tasks with different capabilities
        for _ in range(3):
            metadata = TaskMetadata(
                required_capabilities={PoolCapability.HIGH_IO},
                affinity=TaskAffinity.PREFERRED
            )
            self.manager.submit(
                function=io_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.NORMAL,
                metadata=metadata
            )
        
        for _ in range(3):
            metadata = TaskMetadata(
                required_capabilities={PoolCapability.HIGH_CPU},
                affinity=TaskAffinity.PREFERRED
            )
            self.manager.submit(
                function=cpu_task,
                iterations=10000,
                task_type=TaskType.CPU,
                priority=TaskPriority.NORMAL,
                metadata=metadata
            )
        
        # Wait for metrics to be collected
        time.sleep(2.0)
        
        # Get enhanced metrics
        metrics = self.monitor.get_enhanced_metrics()
        
        self.assertIn("system", metrics)
        self.assertIn("pools", metrics)
        
        # Check for enhanced metrics components
        if "capabilities" in metrics["system"]:
            self.assertIn("system", metrics)
            # At least some capabilities should be tracked
            self.assertGreater(len(metrics["system"]["capabilities"]), 0)
    
    def test_capability_health(self):
        """Test capability health monitoring"""
        # Submit some tasks to generate metrics
        for _ in range(3):
            metadata = TaskMetadata(
                required_capabilities={PoolCapability.HIGH_IO},
                affinity=TaskAffinity.PREFERRED
            )
            self.manager.submit(
                function=io_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.NORMAL,
                metadata=metadata
            )
        
        # Wait for metrics to be collected
        time.sleep(2.0)
        
        # Get capability health for IO capability
        health = self.monitor.get_capability_health(PoolCapability.HIGH_IO)
        
        self.assertIn("capability", health)
        self.assertIn("status", health)
        self.assertIn("metrics", health)
        self.assertIn("pools", health)
        
        # The IO capability should have at least one pool
        self.assertGreater(len(health["pools"]), 0)
    
    def test_advanced_health_report(self):
        """Test that advanced health report is correctly generated"""
        # Submit some tasks to generate metrics
        for _ in range(5):
            self.manager.submit(
                function=io_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.NORMAL
            )
        
        # Wait for metrics to be collected
        time.sleep(2.0)
        
        # Get advanced health report
        health = self.monitor.get_advanced_health_report()
        
        self.assertIn("status", health)
        self.assertIn("issues", health)
        self.assertIn("pools_status", health)
        
        # Should have capabilities section
        if "capabilities" in health:
            # Capabilities section should have entries
            self.assertGreater(len(health["capabilities"]), 0)
    
    def test_advanced_recommendations(self):
        """Test that advanced optimization recommendations are correctly generated"""
        # Submit some tasks to generate metrics
        for _ in range(5):
            self.manager.submit(
                function=io_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.NORMAL
            )
        
        # Wait for metrics to be collected
        time.sleep(2.0)
        
        # Get advanced optimization recommendations
        recommendations = self.monitor.get_advanced_recommendations()
        
        self.assertIn("general", recommendations)
        self.assertIn("pools", recommendations)
        self.assertIn("capabilities", recommendations)
    
    def test_optimization_plan(self):
        """Test that optimization plan is correctly generated"""
        # Submit some tasks to generate metrics
        for _ in range(5):
            self.manager.submit(
                function=io_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.NORMAL
            )
        
        # Wait for metrics to be collected
        time.sleep(2.0)
        
        # Force optimization plan generation
        self.monitor._generate_optimization_plan()
        
        # Get optimization plan
        plan = self.monitor.get_optimization_plan()
        
        self.assertIn("timestamp", plan)
        self.assertIn("predictions", plan)
        self.assertIn("pool_recommendations", plan)
        self.assertIn("system_recommendations", plan)
    
    def test_workload_pattern_detection(self):
        """Test workload pattern detection"""
        # Skip if workload pattern detection is not enabled
        if not self.monitor.workload_pattern:
            self.skipTest("Workload pattern detection not enabled")
        
        # Add some test data points
        for i in range(24):
            # Simulate data for a day
            timestamp = time.time() - (24 - i) * 3600
            
            # More IO tasks during business hours, more CPU at night
            hour = time.localtime(timestamp).tm_hour
            business_hours = 9 <= hour <= 17
            
            task_counts_by_type = {task_type: 0 for task_type in TaskType}
            task_counts_by_type[TaskType.IO] = 10 if business_hours else 2
            task_counts_by_type[TaskType.CPU] = 2 if business_hours else 8
            
            task_counts_by_capability = {capability: 0 for capability in PoolCapability}
            task_counts_by_capability[PoolCapability.HIGH_IO] = 10 if business_hours else 2
            task_counts_by_capability[PoolCapability.HIGH_CPU] = 2 if business_hours else 8
            
            self.monitor.workload_pattern.add_data_point(
                timestamp=timestamp,
                task_counts_by_type=task_counts_by_type,
                task_counts_by_capability=task_counts_by_capability
            )
        
        # Force pattern update
        self.monitor.workload_pattern._update_patterns()
        
        # Get pattern snapshot
        snapshot = self.monitor.workload_pattern.get_snapshot()
        
        self.assertIn("hourly_patterns", snapshot)
        self.assertIn("peak_periods", snapshot)
        self.assertIn("current_loads", snapshot)
    
    async def test_advanced_monitor_async(self):
        """Test advanced monitor async functionality"""
        # Run the test method
        test_results = await self.monitor.test()
        
        self.assertTrue(test_results["success"])
        self.assertEqual(test_results["module"], "advanced_thread_pool_monitor")
        self.assertTrue(all(step["success"] for step in test_results["steps"].values()))


@unittest.skipIf(not INTEGRATION_AVAILABLE, "Thread pool integration not available")
class TestThreadPoolIntegration(unittest.TestCase):
    """Tests for the ThreadPoolIntegration"""
    
    def setUp(self):
        """Set up the test case"""
        self.pool_integration = ThreadPoolIntegration(
            metadata={
                "use_advanced_pools": ADVANCED_AVAILABLE,
                "automatic_task_type": True,
                "auto_start_monitor": True
            }
        )
    
    def tearDown(self):
        """Clean up after the test case"""
        self.pool_integration.shutdown()
    
    def test_task_type_detection(self):
        """Test automatic task type detection"""
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
        
        # Detect task types
        io_type = self.pool_integration.detect_task_type(io_task_function)
        cpu_type = self.pool_integration.detect_task_type(cpu_task_function)
        ml_type = self.pool_integration.detect_task_type(ml_inference_function)
        ipfs_type = self.pool_integration.detect_task_type(ipfs_store_function)
        
        # Check detection results
        self.assertEqual(io_type, TaskType.IO)
        self.assertEqual(cpu_type, TaskType.CPU)
        self.assertEqual(ml_type, TaskType.ML)
        self.assertEqual(ipfs_type, TaskType.IPFS)
    
    def test_task_submission(self):
        """Test task submission and execution"""
        # Submit a task
        task_id, future = self.pool_integration.submit(
            func=io_task,
            sleep_time=0.1
        )
        
        # Wait for result
        result = future.result(timeout=1.0)
        
        self.assertIsNotNone(task_id)
        self.assertIn("Completed I/O task", result)
        
        # Check task result and status
        stored_result = self.pool_integration.get_task_result(task_id)
        status = self.pool_integration.get_task_status(task_id)
        
        self.assertIsNotNone(stored_result)
        self.assertEqual(status, TaskState.COMPLETED.name)
    
    def test_async_submission(self):
        """Test async task submission"""
        # Define an async function to test submission
        async def test_async_submission():
            # Submit task async
            result = await self.pool_integration.submit_async(
                func=io_task,
                sleep_time=0.1
            )
            
            return result
        
        # Run the async function
        loop = asyncio.get_event_loop()
        result = loop.run_until_complete(test_async_submission())
        
        self.assertIn("Completed I/O task", result)
    
    def test_task_cancellation(self):
        """Test task cancellation"""
        # Submit a long-running task
        task_id, future = self.pool_integration.submit(
            func=io_task,
            sleep_time=10.0  # 10 seconds
        )
        
        # Cancel the task
        result = self.pool_integration.cancel_task(task_id)
        
        self.assertTrue(result)
        self.assertTrue(future.cancelled() or future.done())
        
        # Check status
        status = self.pool_integration.get_task_status(task_id)
        self.assertEqual(status, TaskState.CANCELLED.name)
    
    def test_decorator(self):
        """Test thread pool decorator"""
        # Define a decorated function
        @self.pool_integration.thread_pool(priority=TaskPriority.HIGH)
        def decorated_task(value):
            time.sleep(0.1)
            return f"Decorated task with value {value}"
        
        # Call the decorated function
        result = decorated_task(42)
        
        self.assertIn("Decorated task with value 42", result)
        
        # Define an async function to test async decorator
        async def test_async_decorator():
            # Call the async version of the decorated function
            result = await decorated_task.async_def(84)
            return result
        
        # Run the async function
        loop = asyncio.get_event_loop()
        async_result = loop.run_until_complete(test_async_decorator())
        
        self.assertIn("Decorated task with value 84", async_result)
    
    def test_stats_and_health(self):
        """Test statistics and health reporting"""
        # Submit some tasks to generate metrics
        for _ in range(5):
            self.pool_integration.submit(
                func=io_task,
                sleep_time=0.1
            )
        
        # Wait for metrics to be collected
        time.sleep(2.0)
        
        # Get stats
        stats = self.pool_integration.get_stats()
        
        self.assertIn("task_history", stats)
        self.assertGreaterEqual(stats["task_history"]["total"], 5)
        
        # Get health report
        health = self.pool_integration.get_health_report()
        
        self.assertIn("status", health)
        self.assertIn("issues", health)
        
        # Get optimization recommendations
        recommendations = self.pool_integration.get_optimization_recommendations()
        
        self.assertIn("general", recommendations)
        self.assertIn("pools", recommendations)
    
    async def test_integration_async(self):
        """Test integration async functionality"""
        # Run the test method
        test_results = await self.pool_integration.test()
        
        self.assertTrue(test_results["success"])
        self.assertEqual(test_results["module"], "thread_pool_integration")
        self.assertTrue(all(step["success"] for step in test_results["steps"].values()))


# Main test runner
def run_tests():
    """Run all tests and return results as a dictionary"""
    result_dict = {
        "success": True,
        "module": "advanced_thread_pool",
        "tests": {},
        "summary": {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "errors": 0
        }
    }
    
    # Create test suite
    suite = unittest.TestSuite()
    
    # Add test cases
    suite.addTest(unittest.makeSuite(TestBasicThreadPoolManager))
    if ADVANCED_AVAILABLE:
        suite.addTest(unittest.makeSuite(TestAdvancedThreadPoolManager))
    suite.addTest(unittest.makeSuite(TestThreadPoolMonitor))
    if ADVANCED_AVAILABLE:
        suite.addTest(unittest.makeSuite(TestAdvancedThreadPoolMonitor))
    if INTEGRATION_AVAILABLE:
        suite.addTest(unittest.makeSuite(TestThreadPoolIntegration))
    
    # Create test runner
    runner = unittest.TextTestRunner(verbosity=2)
    
    # Run tests
    test_result = runner.run(suite)
    
    # Process test results
    result_dict["summary"]["total"] = test_result.testsRun
    result_dict["summary"]["passed"] = test_result.testsRun - len(test_result.failures) - len(test_result.errors) - len(test_result.skipped)
    result_dict["summary"]["failed"] = len(test_result.failures)
    result_dict["summary"]["errors"] = len(test_result.errors)
    result_dict["summary"]["skipped"] = len(test_result.skipped)
    
    # Update overall success
    result_dict["success"] = len(test_result.failures) == 0 and len(test_result.errors) == 0
    
    # Add failures and errors
    failures = []
    for test, trace in test_result.failures:
        failures.append({
            "test": str(test),
            "trace": trace
        })
    
    errors = []
    for test, trace in test_result.errors:
        errors.append({
            "test": str(test),
            "trace": trace
        })
    
    result_dict["tests"]["failures"] = failures
    result_dict["tests"]["errors"] = errors
    
    return result_dict


# Run tests if executed directly
if __name__ == "__main__":
    # Run tests and get results
    results = run_tests()
    
    # Print summary
    print("\nTest Summary:")
    print(f"Total: {results['summary']['total']}")
    print(f"Passed: {results['summary']['passed']}")
    print(f"Failed: {results['summary']['failed']}")
    print(f"Errors: {results['summary']['errors']}")
    print(f"Skipped: {results['summary']['skipped']}")
    print(f"Overall success: {results['success']}")
    
    # Save results to file
    with open("test_results.json", "w") as f:
        json.dump(results, f, indent=2)
    
    # Exit with appropriate code
    sys.exit(0 if results["success"] else 1)