"""
Test Multi-Process IPFS Accelerate Server with Thread Pool Integration

Tests for the ipfs_accelerate_server_mp.py module and its integration with
the thread_pool_manager.py module to enable efficient parallel processing
across both processes and threads.
"""

import os
import sys
import json
import time
import asyncio
import unittest
from pathlib import Path

# Add parent directory to path to import hallucinate_app modules
sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.ipfs_accelerate_server_mp import IPFSAccelerateServer, PlasmaManager
from hallucinate_app.thread_pool_manager import ThreadPoolManager, TaskType, TaskPriority
from hallucinate_app.ipfs_accelerate_mp_adapter import IPFSAccelerateAdapter


class TestIPFSAccelerateMP(unittest.TestCase):
    """
    Tests for the IPFSAccelerateServer class with multi-process architecture
    """
    
    def setUp(self):
        """Set up test environment"""
        # Create a test server
        self.server = IPFSAccelerateServer(
            metadata={
                "use_mock": True,
                "plasma_socket": f"/tmp/plasma_test_{int(time.time())}",
                "plasma_size_gb": 0.1  # Small size for testing
            }
        )
        
        # Start the server
        self.server.start()
    
    def tearDown(self):
        """Clean up after tests"""
        # Stop the server
        self.server.stop()
    
    def test_server_startup(self):
        """Test server can start up"""
        self.assertTrue(self.server.running)
        
        # Check processes are running
        self.assertIsNotNone(self.server.ipfs_process)
        self.assertTrue(self.server.ipfs_process.is_alive())
        
        self.assertIsNotNone(self.server.ml_process)
        self.assertTrue(self.server.ml_process.is_alive())
    
    def test_model_loading(self):
        """Test model loading functionality"""
        # Use an async test (requires Python 3.8+)
        async def async_test():
            # Load a mock model
            model_id = f"test_model_{int(time.time())}"
            cid = "QmTestModelCID"
            
            # We can't actually fetch from IPFS in tests, so we'll use the test method
            # which uses a different path to load a model
            test_results = await self.server.test()
            
            # Check the test passed
            self.assertTrue(test_results["success"])
            self.assertTrue(test_results["steps"]["load_model"]["success"])
            
            # Check a model was actually loaded during the test
            self.assertTrue(len(self.server.models) > 0)
        
        # Run the async test
        asyncio.run(async_test())
    
    def test_inference(self):
        """Test inference functionality"""
        # Use an async test
        async def async_test():
            # Run the test method which includes inference
            test_results = await self.server.test()
            
            # Check the inference step passed
            self.assertTrue(test_results["steps"]["inference"]["success"])
        
        # Run the async test
        asyncio.run(async_test())
    
    def test_model_unloading(self):
        """Test model unloading functionality"""
        # Use an async test
        async def async_test():
            # Run the test method which includes model unloading
            test_results = await self.server.test()
            
            # Check the unload step passed
            self.assertTrue(test_results["steps"]["unload_model"]["success"])
            
            # Check all models were unloaded
            self.assertEqual(len(self.server.models), 0)
        
        # Run the async test
        asyncio.run(async_test())
    
    def test_full_test_method(self):
        """Test the test() method of the server"""
        # Use an async test
        async def async_test():
            # Run the test method
            test_results = await self.server.test()
            
            # Check overall success
            self.assertTrue(test_results["success"])
            
            # Check individual steps
            self.assertTrue(test_results["steps"]["start_server"]["success"])
            self.assertTrue(test_results["steps"]["load_model"]["success"])
            self.assertTrue(test_results["steps"]["inference"]["success"])
            self.assertTrue(test_results["steps"]["unload_model"]["success"])
            
            # Check diagnostics
            self.assertIn("dependencies", test_results["diagnostics"])
            self.assertIn("multi_process", test_results["diagnostics"])
            self.assertIn("config", test_results["diagnostics"])
        
        # Run the async test
        asyncio.run(async_test())
    
    def test_server_stop(self):
        """Test server can stop properly"""
        # First check it's running
        self.assertTrue(self.server.running)
        
        # Stop the server
        self.server.stop()
        
        # Check it's stopped
        self.assertFalse(self.server.running)

        # Check processes are stopped or None
        if self.server.ipfs_process:
            self.assertFalse(self.server.ipfs_process.is_alive())

        if self.server.ml_process:
            self.assertFalse(self.server.ml_process.is_alive())


class TestPlasmaManager(unittest.TestCase):
    """Focused tests for PlasmaManager error handling."""

    def test_put_requires_active_client_when_arrow_is_enabled(self):
        manager = PlasmaManager.__new__(PlasmaManager)
        manager.has_arrow = True
        manager.client = None
        manager.socket_path = "/tmp/missing_plasma_test"

        with self.assertRaisesRegex(RuntimeError, "Plasma store client is not available"):
            manager.put({"value": "not stored"})


class TestThreadPoolIntegration(unittest.TestCase):
    """Tests for the integration between Thread Pool Manager and IPFS Accelerate Server"""
    
    async def asyncSetUp(self):
        """Set up test environment"""
        # Initialize the adapter with mock mode for testing
        self.adapter = IPFSAccelerateAdapter(metadata={
            "thread_pool_min_workers": 2,
            "thread_pool_max_workers": 8,
            "auto_create_pools": True,
            "use_mock": True,
            
            # Enable monitoring and adaptive scaling
            "enable_monitoring": True,
            "enable_dashboard": False,  # Dashboard not needed for automated tests
            "enable_adaptive_scaling": True,
            
            # Configure retry mechanism
            "max_retries": 2,
            "retry_delay_base": 0.1,  # Shorter delays for tests
            "retry_backoff_factor": 1.5
        })
        
        # Start the adapter
        await self.adapter.start()
    
    async def asyncTearDown(self):
        """Clean up test environment"""
        if hasattr(self, 'adapter') and self.adapter:
            await self.adapter.stop()
    
    async def test_adapter_initialization(self):
        """Test that the adapter initializes correctly"""
        self.assertTrue(self.adapter.running)
        self.assertIsNotNone(self.adapter.thread_pool_manager)
        self.assertIsNotNone(self.adapter.accelerate_server)
        
        # Check that thread pools were created
        stats = self.adapter.get_stats()
        self.assertIn("thread_pools", stats)
        self.assertIn("pools", stats["thread_pools"])
        self.assertGreater(len(stats["thread_pools"]["pools"]), 0)
        
        # Check that the monitor was initialized
        self.assertIsNotNone(self.adapter.monitor)
        self.assertTrue(self.adapter.monitor.running)
    
    async def test_parallel_task_execution(self):
        """Test parallel task execution"""
        # Define test functions
        def io_task(name, sleep_time):
            time.sleep(sleep_time)
            return f"IO task {name} completed"
        
        def cpu_task(name, iterations):
            result = 0
            for i in range(iterations):
                result += i
            return f"CPU task {name} completed with result {result}"
        
        # Submit tasks with different types
        futures = []
        
        # IO tasks
        for i in range(3):
            _, future = self.adapter.submit_io_task(
                function=io_task,
                name=f"IO-{i}",
                sleep_time=0.2,
                priority=TaskPriority.NORMAL
            )
            futures.append(future)
        
        # CPU tasks
        for i in range(3):
            _, future = self.adapter.submit_cpu_task(
                function=cpu_task,
                name=f"CPU-{i}",
                iterations=100000,  # 100K iterations
                priority=TaskPriority.HIGH
            )
            futures.append(future)
        
        # Wait for all tasks to complete
        start_time = time.time()
        results = await asyncio.gather(*futures)
        end_time = time.time()
        
        # Check that all tasks completed
        self.assertEqual(len(results), 6)
        
        # Check parallel execution by checking that the total time is less than
        # the sum of individual task times (which would be >1.8s if sequential)
        execution_time = end_time - start_time
        self.assertLess(execution_time, 1.0)
    
    async def test_model_with_thread_pool(self):
        """Test model operations combined with thread pool tasks"""
        # 1. First load a model
        model_id = f"test_model_{int(time.time())}"
        cid = "QmTestModelCID"
        
        load_result = await self.adapter.load_model_from_ipfs(model_id, cid)
        self.assertEqual(load_result["status"], "success")
        
        # 2. Run thread pool tasks simultaneously with inference
        thread_futures = []
        
        # Create CPU-intensive tasks
        for i in range(5):
            _, future = self.adapter.submit_cpu_task(
                function=lambda n: sum(range(n)),
                n=100000,
                priority=TaskPriority.NORMAL
            )
            thread_futures.append(future)
        
        # 3. Run inference
        inference_future = asyncio.create_task(
            self.adapter.run_inference(model_id, "Test input")
        )
        
        # 4. Wait for all tasks to complete
        thread_results = await asyncio.gather(*thread_futures)
        inference_result = await inference_future
        
        # 5. Verify results
        self.assertEqual(len(thread_results), 5)
        self.assertEqual(inference_result["status"], "success")
        
        # 6. Unload the model
        unload_result = await self.adapter.unload_model(model_id)
        self.assertEqual(unload_result["status"], "success")
    
    async def test_automatic_retry_mechanism(self):
        """Test the automatic retry mechanism with a flaky function"""
        # Create a function that fails the first time but succeeds on retry
        failure_count = [0]  # Use a list for mutable state
        
        def flaky_function():
            failure_count[0] += 1
            if failure_count[0] == 1:
                # Fail on first attempt
                raise ValueError("Simulated first-attempt error")
            # Succeed on second attempt
            return f"Succeeded on attempt {failure_count[0]}"
        
        # Submit with retry enabled
        _, future = self.adapter.submit_task(
            function=flaky_function,
            task_type=TaskType.GENERAL,
            priority=TaskPriority.NORMAL,
            allow_retries=True,
            max_retries=2
        )
        
        # Wait for result - should succeed after automatic retry
        result = await future
        self.assertEqual(result, "Succeeded on attempt 2")
        self.assertEqual(failure_count[0], 2)
        
        # Check that retry was counted in stats
        self.assertIn(future._asyncio_future_blocking, self.adapter.retry_counts)
        self.assertEqual(self.adapter.retry_counts[future._asyncio_future_blocking], 1)
    
    async def test_retry_disabled(self):
        """Test that retry-disabled tasks fail immediately"""
        # Create a function that always fails
        def failing_function():
            raise ValueError("Simulated error")
        
        # Submit with retries disabled
        _, future = self.adapter.submit_task(
            function=failing_function,
            task_type=TaskType.GENERAL,
            priority=TaskPriority.NORMAL,
            allow_retries=False
        )
        
        # The task should fail without retrying
        with self.assertRaises(ValueError):
            await future
    
    async def test_monitoring_integration(self):
        """Test integration with the thread pool monitor"""
        # Skip if monitoring is disabled in the adapter config
        if not self.adapter.config["enable_monitoring"]:
            self.skipTest("Monitoring is disabled in adapter config")
        
        # Run some tasks to generate metrics
        futures = []
        
        # Submit CPU tasks
        for i in range(10):
            _, future = self.adapter.submit_cpu_task(
                function=lambda n: sum(range(n)),
                n=50000,
                priority=TaskPriority.NORMAL
            )
            futures.append(future)
        
        # Wait for tasks to complete
        await asyncio.gather(*futures)
        
        # Wait for metrics to be collected
        await asyncio.sleep(2 * self.adapter.config["monitor_poll_interval"])
        
        # Get health report
        health_report = self.adapter.monitor.get_health_report()
        
        # Check health report structure
        self.assertIn("status", health_report)
        self.assertIn("pools_status", health_report)
        self.assertIn("task_throughput", health_report)
        self.assertIn("worker_utilization", health_report)
        
        # Get optimization recommendations
        recommendations = self.adapter.monitor.get_optimization_recommendations()
        
        # Check recommendations structure
        self.assertIn("general", recommendations)
        self.assertIn("pools", recommendations)
    
    async def test_adapter_test_method(self):
        """Test the adapter's test method"""
        test_results = await self.adapter.test()
        
        # Verify overall success
        self.assertTrue(test_results["success"])
        
        # Check key components
        self.assertIn("thread_pool_test", test_results["steps"])
        self.assertTrue(test_results["steps"]["thread_pool_test"]["success"])
        
        # Check task tests
        self.assertIn("ipfs_tasks", test_results["steps"])
        self.assertIn("cpu_tasks", test_results["steps"])
        
        # Check retry mechanism test
        self.assertIn("retry_mechanism", test_results["steps"])
        self.assertTrue(test_results["steps"]["retry_mechanism"]["success"])
        
        # Check monitoring integration test (if enabled)
        if self.adapter.config["enable_monitoring"]:
            self.assertIn("monitoring_integration", test_results["steps"])
        
        # Check model tests (if mock mode is enabled)
        if self.adapter.config["use_mock"]:
            self.assertIn("load_model", test_results["steps"])
            self.assertIn("inference", test_results["steps"])
            self.assertIn("unload_model", test_results["steps"])


# Helper to run async tests
class AsyncTestCase(unittest.TestCase):
    """Base class for async tests"""
    
    def run_async(self, test_method, *args, **kwargs):
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(test_method(*args, **kwargs))


class ThreadPoolIntegrationAsyncTests(AsyncTestCase):
    """Wrapper for async tests of thread pool integration"""
    
    def setUp(self):
        self.test_case = TestThreadPoolIntegration()
        self.run_async(self.test_case.asyncSetUp)
    
    def tearDown(self):
        self.run_async(self.test_case.asyncTearDown)
    
    def test_adapter_initialization(self):
        self.run_async(self.test_case.test_adapter_initialization)
    
    def test_parallel_task_execution(self):
        self.run_async(self.test_case.test_parallel_task_execution)
    
    def test_model_with_thread_pool(self):
        self.run_async(self.test_case.test_model_with_thread_pool)
    
    def test_automatic_retry_mechanism(self):
        self.run_async(self.test_case.test_automatic_retry_mechanism)
    
    def test_retry_disabled(self):
        self.run_async(self.test_case.test_retry_disabled)
    
    def test_monitoring_integration(self):
        self.run_async(self.test_case.test_monitoring_integration)
    
    def test_adapter_test_method(self):
        self.run_async(self.test_case.test_adapter_test_method)


def run_tests():
    """Run all tests and return the results as JSON"""
    try:
        # Create a test suite with both test classes
        suite = unittest.TestSuite()
        suite.addTest(unittest.makeSuite(TestIPFSAccelerateMP))
        suite.addTest(unittest.makeSuite(TestPlasmaManager))
        suite.addTest(unittest.makeSuite(ThreadPoolIntegrationAsyncTests))
        
        # Run the tests
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)
        
        # Check for success
        success = result.wasSuccessful()
        
        # Format the results
        test_results = {
            "success": success,
            "module": "ipfs_accelerate_mp",
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
            "module": "ipfs_accelerate_mp",
            "error": str(e)
        }


if __name__ == '__main__':
    # Run the tests
    test_results = run_tests()
    print(json.dumps(test_results, indent=2))
    sys.exit(0 if test_results["success"] else 1)
