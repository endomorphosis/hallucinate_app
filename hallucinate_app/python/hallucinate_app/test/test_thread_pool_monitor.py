"""
Thread Pool Monitor Tests

This module contains tests for the Thread Pool Monitor,
which monitors resource usage and performance of thread pools.
"""

import os
import sys
import time
import json
import asyncio
import unittest
import threading
import concurrent.futures
from concurrent.futures import Future, CancelledError

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from thread_pool_manager import (
    ThreadPoolManager, 
    TaskType,
    TaskPriority
)
from thread_pool_monitor import ThreadPoolMonitor


class ThreadPoolMonitorTests(unittest.TestCase):
    """Test cases for the ThreadPoolMonitor class"""
    
    def setUp(self):
        """Set up test environment"""
        # Create a thread pool manager
        self.manager = ThreadPoolManager(metadata={
            "default_min_workers": 2,
            "default_max_workers": 4,
            "auto_create_pools": True
        })
        
        # Create a thread pool monitor
        self.monitor = ThreadPoolMonitor(
            thread_pool_manager=self.manager,
            metadata={
                "poll_interval": 0.5,  # Short poll interval for testing
                "metrics_window": 10    # Small window for testing
            }
        )
        
        # Start the monitor
        self.monitor.start()
    
    def tearDown(self):
        """Clean up test environment"""
        if hasattr(self, 'monitor') and self.monitor:
            self.monitor.stop()
        
        if hasattr(self, 'manager') and self.manager:
            self.manager.shutdown()
    
    def test_monitor_initialization(self):
        """Test that the monitor initializes correctly"""
        self.assertTrue(self.monitor.running)
        self.assertIsNotNone(self.monitor.monitor_thread)
        self.assertTrue(self.monitor.monitor_thread.is_alive())
        
        # Check that system metrics are initialized
        self.assertIsNotNone(self.monitor.system_metrics)
        
        # Get metrics to check initialization
        metrics = self.monitor.get_metrics()
        self.assertIn("system", metrics)
        self.assertIn("pools", metrics)
        self.assertIn("timestamp", metrics)
        self.assertIn("uptime", metrics)
    
    def test_metrics_collection(self):
        """Test that metrics are collected correctly"""
        # Define a test function
        def test_function(iterations=10000):
            result = 0
            for i in range(iterations):
                result += i
            return result
        
        # Submit tasks to generate metrics
        futures = []
        for i in range(5):
            task_id, future = self.manager.submit(
                function=test_function,
                iterations=10000,
                task_type=TaskType.CPU,
                priority=TaskPriority.NORMAL
            )
            futures.append(future)
        
        # Wait for tasks to complete
        for future in futures:
            future.result()
        
        # Give the monitor time to collect metrics
        time.sleep(1.0)
        
        # Get metrics
        metrics = self.monitor.get_metrics()
        
        # Check system metrics
        self.assertIn("system", metrics)
        system_metrics = metrics["system"]
        
        # Check time series data
        self.assertIn("time_series", system_metrics)
        time_series = system_metrics["time_series"]
        
        self.assertIn("task_throughput", time_series)
        self.assertIn("worker_utilization", time_series)
        self.assertIn("queue_depth", time_series)
        self.assertIn("response_times", time_series)
        self.assertIn("error_rates", time_series)
        
        # Check that we have some data points
        self.assertGreater(len(metrics["pools"]), 0)
        
        # Check that task throughput is positive (tasks were completed)
        total_throughput = sum(time_series["task_throughput"])
        self.assertGreaterEqual(total_throughput, 5)  # We submitted 5 tasks
    
    def test_health_report(self):
        """Test health report generation"""
        # Get a health report
        report = self.monitor.get_health_report()
        
        # Check health report structure
        self.assertIn("status", report)
        self.assertIn("issues", report)
        self.assertIn("pools_status", report)
        self.assertIn("task_throughput", report)
        self.assertIn("avg_response_time", report)
        self.assertIn("error_rate", report)
        self.assertIn("worker_utilization", report)
        self.assertIn("queue_depth", report)
        
        # Initially, status should be healthy
        self.assertEqual(report["status"], "healthy")
        
        # Check pools status
        for pool_id, pool_status in report["pools_status"].items():
            self.assertIn("status", pool_status)
            self.assertIn("issues", pool_status)
    
    def test_optimization_recommendations(self):
        """Test optimization recommendations generation"""
        # Get recommendations
        recommendations = self.monitor.get_optimization_recommendations()
        
        # Check recommendations structure
        self.assertIn("timestamp", recommendations)
        self.assertIn("general", recommendations)
        self.assertIn("pools", recommendations)
        
        # Check that general recommendations is a list
        self.assertIsInstance(recommendations["general"], list)
        
        # Check that pools is a dictionary
        self.assertIsInstance(recommendations["pools"], dict)
    
    def test_anomaly_detection(self):
        """Test anomaly detection"""
        # Add some normal data points
        for i in range(5):
            self.monitor.system_metrics.add_data_point(
                timestamp=time.time(),
                tasks_completed=10,
                tasks_failed=0,
                worker_utilization=0.5,
                queue_depth=2,
                response_time=0.1
            )
        
        # No anomalies yet
        snapshot = self.monitor.system_metrics.get_snapshot()
        self.assertEqual(snapshot["anomalies"], {})
        
        # Add an anomalous data point
        self.monitor.system_metrics.add_data_point(
            timestamp=time.time(),
            tasks_completed=10,
            tasks_failed=5,  # High failure rate
            worker_utilization=0.95,  # High utilization
            queue_depth=30,  # High queue depth
            response_time=2.0  # Slow response time
        )
        
        # Check for anomalies
        snapshot = self.monitor.system_metrics.get_snapshot()
        self.assertGreater(len(snapshot["anomalies"]), 0)
    
    async def async_test_module_test(self):
        """Test the test() method of the monitor"""
        # Run the test method
        test_results = await self.monitor.test()
        
        # Check the test results
        self.assertTrue(test_results["success"])
        self.assertEqual(test_results["module"], "thread_pool_monitor")
        
        # Check the steps
        self.assertIn("steps", test_results)
        steps = test_results["steps"]
        
        self.assertIn("start_monitor", steps)
        self.assertIn("collect_metrics", steps)
        self.assertIn("get_health_report", steps)
        self.assertIn("get_recommendations", steps)
        self.assertIn("stop_monitor", steps)
        
        # All steps should have succeeded
        for step_name, step in steps.items():
            self.assertTrue(step["success"], f"Step {step_name} failed")
    
    def test_stopping(self):
        """Test stopping the monitor"""
        self.assertTrue(self.monitor.running)
        
        # Stop the monitor
        self.monitor.stop()
        
        # Check that it's stopped
        self.assertFalse(self.monitor.running)
        
        # Wait for the thread to finish
        if self.monitor.monitor_thread:
            self.monitor.monitor_thread.join(timeout=1.0)
        
        # Thread should no longer be alive
        self.assertTrue(
            self.monitor.monitor_thread is None or
            not self.monitor.monitor_thread.is_alive()
        )
    
    def test_high_load_scenario(self):
        """Test the monitor under high load"""
        # Define a CPU-intensive task
        def cpu_task(iterations):
            result = 0
            for i in range(iterations):
                result += i
            return result
        
        # Define an I/O-bound task
        def io_task(sleep_time):
            time.sleep(sleep_time)
            return f"Slept for {sleep_time}s"
        
        # Submit a large number of tasks
        futures = []
        
        # CPU tasks
        for i in range(10):
            task_id, future = self.manager.submit(
                function=cpu_task,
                iterations=100000,
                task_type=TaskType.CPU,
                priority=TaskPriority.NORMAL
            )
            futures.append(future)
        
        # I/O tasks
        for i in range(10):
            task_id, future = self.manager.submit(
                function=io_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.HIGH
            )
            futures.append(future)
        
        # Simulate high queue depth
        many_tasks = []
        for i in range(30):  # More tasks than worker threads
            task_id, future = self.manager.submit(
                function=io_task,
                sleep_time=0.05,
                task_type=TaskType.GENERAL,
                priority=TaskPriority.LOW  # Low priority to ensure queuing
            )
            many_tasks.append(future)
        
        # Wait a bit for the monitor to collect metrics
        time.sleep(1.0)
        
        # Get metrics under load
        metrics = self.monitor.get_metrics()
        
        # Check for high worker utilization
        if metrics["system"]["time_series"]["worker_utilization"]:
            utilization = metrics["system"]["time_series"]["worker_utilization"][-1]
            # Under high load, utilization should be high
            self.assertGreater(utilization, 0.5)
        
        # Check for non-zero queue depth
        if metrics["system"]["time_series"]["queue_depth"]:
            queue_depth = metrics["system"]["time_series"]["queue_depth"][-1]
            # Should have tasks in queue
            self.assertGreater(queue_depth, 0)
        
        # Get health report
        health = self.monitor.get_health_report()
        
        # Get recommendations
        recommendations = self.monitor.get_optimization_recommendations()
        
        # Should have some recommendations under high load
        self.assertTrue(
            len(recommendations["general"]) > 0 or
            len(recommendations["pools"]) > 0
        )
        
        # Wait for all tasks to complete (don't want to interfere with later tests)
        unexpected_exceptions = []
        for future in futures + many_tasks:
            try:
                future.result(timeout=2.0)
            except (concurrent.futures.TimeoutError, CancelledError):
                # Expected: tasks may still be running or were cancelled during cleanup
                pass
            except Exception as exc:
                unexpected_exceptions.append(f"{type(exc).__name__}: {exc}")

        if unexpected_exceptions:
            self.fail(
                "Unexpected task exceptions during cleanup: "
                + "; ".join(unexpected_exceptions)
            )


# Helper to run async tests
class AsyncTestCase(unittest.TestCase):
    """Base class for async tests"""
    
    def run_async(self, test_method, *args, **kwargs):
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(test_method(*args, **kwargs))


class ThreadPoolMonitorAsyncTests(AsyncTestCase):
    """Async test cases wrapper"""
    
    def setUp(self):
        self.test_case = ThreadPoolMonitorTests()
        self.test_case.setUp()
    
    def tearDown(self):
        self.test_case.tearDown()
    
    def test_module_test(self):
        self.run_async(self.test_case.async_test_module_test)


def run_tests():
    """Run the tests and return the results as JSON"""
    try:
        # Create a test suite
        suite = unittest.TestSuite()
        suite.addTest(unittest.makeSuite(ThreadPoolMonitorTests))
        suite.addTest(unittest.makeSuite(ThreadPoolMonitorAsyncTests))
        
        # Run the tests
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)
        
        # Check for success
        success = result.wasSuccessful()
        
        # Format the results
        test_results = {
            "success": success,
            "module": "thread_pool_monitor",
            "tests_run": result.testsRun,
            "errors": len(result.errors),
            "failures": len(result.failures),
            "skipped": len(result.skipped),
            "failures_list": [
                {
                    "test": str(test),
                    "error": str(err)
                }
                for test, err in result.failures + result.errors
            ]
        }
        
        # Return the results as JSON
        return test_results
    
    except Exception as e:
        # Return any errors
        return {
            "success": False,
            "module": "thread_pool_monitor",
            "error": str(e)
        }


if __name__ == "__main__":
    # Run the tests
    test_results = run_tests()
    
    # Print the results
    print(json.dumps(test_results, indent=2))
    
    # Exit with appropriate code
    sys.exit(0 if test_results["success"] else 1)
