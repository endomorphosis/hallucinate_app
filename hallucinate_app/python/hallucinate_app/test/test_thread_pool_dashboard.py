"""
Thread Pool Dashboard Tests

This module contains tests for the Thread Pool Dashboard,
which provides visualization and monitoring of thread pools.
"""

import os
import sys
import time
import json
import asyncio
import unittest
import threading
from concurrent.futures import Future

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
from thread_pool_dashboard import ThreadPoolDashboard


class ThreadPoolDashboardTests(unittest.TestCase):
    """Test cases for the ThreadPoolDashboard class"""
    
    async def asyncSetUp(self):
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
        
        # Create a dashboard
        self.dashboard = ThreadPoolDashboard(
            thread_pool_manager=self.manager,
            thread_pool_monitor=self.monitor,
            metadata={
                "update_interval": 0.5,  # Short update interval for testing
                "max_history_points": 10
            }
        )
        
        # Start components
        self.monitor.start()
        self.dashboard.start()
        
        # Generate some test data
        await self._generate_test_data()
    
    async def _generate_test_data(self):
        """Generate test data by submitting tasks"""
        # Define test functions
        def cpu_task(iterations):
            """CPU-intensive task"""
            result = 0
            for i in range(iterations):
                result += i
            return result
        
        def io_task(sleep_time):
            """I/O-bound task"""
            time.sleep(sleep_time)
            return f"Slept for {sleep_time}s"
        
        # Submit tasks
        futures = []
        for i in range(3):
            task_id, future = self.manager.submit(
                function=cpu_task,
                iterations=10000,  # 10K iterations
                task_type=TaskType.CPU,
                priority=TaskPriority.NORMAL
            )
            futures.append(future)
        
        for i in range(3):
            task_id, future = self.manager.submit(
                function=io_task,
                sleep_time=0.1,
                task_type=TaskType.IO,
                priority=TaskPriority.HIGH
            )
            futures.append(future)
        
        # Wait for tasks to complete
        for future in futures:
            await asyncio.wrap_future(future)
        
        # Give the monitor and dashboard time to collect metrics
        await asyncio.sleep(1.0)
    
    async def asyncTearDown(self):
        """Clean up test environment"""
        if hasattr(self, 'dashboard') and self.dashboard:
            self.dashboard.stop()
        
        if hasattr(self, 'monitor') and self.monitor:
            self.monitor.stop()
        
        if hasattr(self, 'manager') and self.manager:
            self.manager.shutdown()
    
    async def test_dashboard_initialization(self):
        """Test that the dashboard initializes correctly"""
        self.assertTrue(self.dashboard.running)
        self.assertIsNotNone(self.dashboard.update_thread)
        self.assertTrue(self.dashboard.update_thread.is_alive())
        
        # Check status
        status = self.dashboard.get_dashboard_status()
        self.assertTrue(status["running"])
        self.assertTrue(status["monitor_running"])
    
    async def test_metrics_history(self):
        """Test metrics history collection"""
        # Check metrics history
        history = self.dashboard.get_metrics_history()
        self.assertGreater(len(history), 0)
        
        # Submit more tasks to generate additional metrics
        def test_function():
            time.sleep(0.1)
            return "test"
        
        futures = []
        for i in range(5):
            task_id, future = self.manager.submit(
                function=test_function,
                task_type=TaskType.GENERAL,
                priority=TaskPriority.NORMAL
            )
            futures.append(future)
        
        # Wait for tasks to complete
        for future in futures:
            await asyncio.wrap_future(future)
        
        # Give the dashboard time to collect metrics
        await asyncio.sleep(1.0)
        
        # Check that history was updated
        new_history = self.dashboard.get_metrics_history()
        self.assertGreaterEqual(len(new_history), len(history))
    
    async def test_dashboard_summary(self):
        """Test dashboard summary generation"""
        # Get summary
        summary = self.dashboard.get_dashboard_summary()
        
        # Check structure
        self.assertIn("timestamp", summary)
        self.assertIn("status", summary)
        self.assertIn("issues", summary)
        self.assertIn("utilization", summary)
        self.assertIn("queue_depth", summary)
        self.assertIn("pools", summary)
        self.assertIn("recommendations", summary)
        self.assertIn("dashboard_status", summary)
        
        # Check pools
        self.assertGreater(len(summary["pools"]), 0)
        
        # Check that status is consistent
        self.assertEqual(summary["status"], self.dashboard.get_current_health()["status"])
    
    async def test_html_generation(self):
        """Test HTML dashboard generation"""
        # Generate HTML
        html = self.dashboard.get_dashboard_html()
        
        # Check that it's a valid HTML document
        self.assertTrue(html.startswith("\n        <!DOCTYPE html>"))
        self.assertTrue("</html>" in html)
        
        # Check for key dashboard components
        self.assertTrue("Thread Pool Dashboard" in html)
        self.assertTrue("System Status" in html)
        self.assertTrue("Pools" in html)
    
    async def test_pool_details(self):
        """Test getting pool details"""
        # Get the default pools
        pools = self.dashboard.get_current_health()["pools_status"]
        
        # Check that we have some pools
        self.assertGreater(len(pools), 0)
        
        # Get details for each pool
        for pool_id in pools:
            details = self.dashboard.get_pool_details(pool_id)
            
            # Check details structure
            self.assertEqual(details["pool_id"], pool_id)
            self.assertIn("pool_type", details)
            self.assertIn("status", details)
            self.assertIn("issues", details)
            self.assertIn("metrics", details)
            self.assertIn("recommendations", details)
    
    async def test_dashboard_rendering(self):
        """Test console dashboard rendering"""
        try:
            # Call the render method
            await self.dashboard.render_dashboard()
            
            # We can't actually check the output, but this at least verifies
            # that the method doesn't crash
            success = True
        except Exception as e:
            success = False
            print(f"Error rendering dashboard: {e}")
        
        self.assertTrue(success)
    
    async def test_stopping(self):
        """Test stopping the dashboard"""
        self.assertTrue(self.dashboard.running)
        
        # Stop the dashboard
        self.dashboard.stop()
        
        # Check that it's stopped
        self.assertFalse(self.dashboard.running)
        
        # The monitor and manager should still be running
        self.assertTrue(self.monitor.running)
        
        # Try calling methods after stopping - they should still work
        # with the existing data
        summary = self.dashboard.get_dashboard_summary()
        self.assertIn("status", summary)
    
    async def test_module_test_method(self):
        """Test the test() method of the dashboard"""
        # Run the test method
        test_results = await self.dashboard.test()
        
        # Check the test results
        self.assertTrue(test_results["success"])
        self.assertEqual(test_results["module"], "thread_pool_dashboard")
        
        # Check the steps
        self.assertIn("steps", test_results)
        steps = test_results["steps"]
        
        self.assertIn("start_dashboard", steps)
        self.assertIn("metrics_history", steps)
        self.assertIn("dashboard_summary", steps)
        self.assertIn("html_generation", steps)
        self.assertIn("console_rendering", steps)
        self.assertIn("stop_dashboard", steps)
        
        # All steps should have succeeded
        for step_name, step in steps.items():
            self.assertTrue(step["success"], f"Step {step_name} failed")


# Helper to run async tests
class AsyncTestCase(unittest.TestCase):
    """Base class for async tests"""
    
    def run_async(self, test_method, *args, **kwargs):
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(test_method(*args, **kwargs))


class ThreadPoolDashboardAsyncTests(AsyncTestCase):
    """Async test cases wrapper"""
    
    def setUp(self):
        self.test_case = ThreadPoolDashboardTests()
        self.run_async(self.test_case.asyncSetUp)
    
    def tearDown(self):
        self.run_async(self.test_case.asyncTearDown)
    
    def test_dashboard_initialization(self):
        self.run_async(self.test_case.test_dashboard_initialization)
    
    def test_metrics_history(self):
        self.run_async(self.test_case.test_metrics_history)
    
    def test_dashboard_summary(self):
        self.run_async(self.test_case.test_dashboard_summary)
    
    def test_html_generation(self):
        self.run_async(self.test_case.test_html_generation)
    
    def test_pool_details(self):
        self.run_async(self.test_case.test_pool_details)
    
    def test_dashboard_rendering(self):
        self.run_async(self.test_case.test_dashboard_rendering)
    
    def test_stopping(self):
        self.run_async(self.test_case.test_stopping)
    
    def test_module_test_method(self):
        self.run_async(self.test_case.test_module_test_method)


def run_tests():
    """Run the tests and return the results as JSON"""
    try:
        # Create a test suite
        suite = unittest.TestSuite()
        suite.addTest(unittest.makeSuite(ThreadPoolDashboardAsyncTests))
        
        # Run the tests
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)
        
        # Check for success
        success = result.wasSuccessful()
        
        # Format the results
        test_results = {
            "success": success,
            "module": "thread_pool_dashboard",
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
            "module": "thread_pool_dashboard",
            "error": str(e)
        }


if __name__ == "__main__":
    # Run the tests
    test_results = run_tests()
    
    # Print the results
    print(json.dumps(test_results, indent=2))
    
    # Exit with appropriate code
    sys.exit(0 if test_results["success"] else 1)