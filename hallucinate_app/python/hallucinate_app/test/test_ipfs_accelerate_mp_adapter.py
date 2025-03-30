"""
IPFS Accelerate MP Adapter Tests

This module contains tests for the IPFS Accelerate MP Adapter,
which integrates the Thread Pool Manager with the multi-process
IPFS Accelerate Server for efficient parallel processing.
"""

import os
import sys
import time
import json
import asyncio
import unittest
import threading
import multiprocessing
from concurrent.futures import Future

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from thread_pool_manager import TaskType, TaskPriority, TaskState
from ipfs_accelerate_mp_adapter import IPFSAccelerateAdapter


class IPFSAccelerateAdapterTests(unittest.TestCase):
    """Test cases for the IPFSAccelerateAdapter class"""
    
    async def asyncSetUp(self):
        """Set up test environment"""
        self.adapter = IPFSAccelerateAdapter(metadata={
            "thread_pool_min_workers": 2,
            "thread_pool_max_workers": 8,
            "auto_create_pools": True,
            "use_mock": True,
            "use_mock_for_tests": True
        })
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
    
    async def test_ipfs_task_submission(self):
        """Test IPFS task submission"""
        # Define a test function
        def ipfs_test_function(value):
            time.sleep(0.1)  # Simulate work
            return f"IPFS task result: {value}"
        
        # Submit a task
        task_id, future = self.adapter.submit_ipfs_task(
            function=ipfs_test_function,
            value=42,
            priority=TaskPriority.NORMAL
        )
        
        # Check the task ID and future
        self.assertIsNotNone(task_id)
        self.assertIsNotNone(future)
        
        # Wait for the task to complete
        result = await future
        
        # Check the result
        self.assertEqual(result, "IPFS task result: 42")
        
        # Check that the task is tracked
        stats = self.adapter.get_stats()
        completed_tasks = [task for task in stats["tasks"]["tasks"] if task["id"] == task_id]
        
        # The task should either be completed or no longer tracked
        self.assertTrue(
            len(completed_tasks) == 0 or 
            (len(completed_tasks) == 1 and completed_tasks[0]["completed"])
        )
    
    async def test_cpu_task_submission(self):
        """Test CPU task submission"""
        # Define a test function
        def cpu_test_function(n):
            result = 0
            for i in range(n):
                result += i
            return result
        
        # Submit a task
        task_id, future = self.adapter.submit_cpu_task(
            function=cpu_test_function,
            n=100000,  # 100K iterations
            priority=TaskPriority.HIGH
        )
        
        # Check the task ID and future
        self.assertIsNotNone(task_id)
        self.assertIsNotNone(future)
        
        # Wait for the task to complete
        result = await future
        
        # Check the result (sum of 0 to 99999)
        expected_result = sum(range(100000))
        self.assertEqual(result, expected_result)
    
    async def test_io_task_submission(self):
        """Test I/O task submission"""
        # Define a test function
        def io_test_function(sleep_time):
            time.sleep(sleep_time)
            return f"Slept for {sleep_time}s"
        
        # Submit a task
        task_id, future = self.adapter.submit_io_task(
            function=io_test_function,
            sleep_time=0.2,
            priority=TaskPriority.NORMAL
        )
        
        # Wait for the task to complete
        result = await future
        
        # Check the result
        self.assertEqual(result, "Slept for 0.2s")
    
    async def test_task_cancellation(self):
        """Test task cancellation"""
        # Define a long-running task
        def long_task():
            time.sleep(10)
            return "Completed"
        
        # Submit the task
        task_id, future = self.adapter.submit_task(
            function=long_task,
            task_type=TaskType.GENERAL,
            priority=TaskPriority.NORMAL
        )
        
        # Cancel the task
        cancelled = self.adapter.cancel_task(task_id)
        
        # Check that the task was cancelled
        self.assertTrue(cancelled)
        
        # The future should be cancelled or error out
        with self.assertRaises(Exception):
            await future
    
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
        task_ids = []
        
        # IO tasks
        for i in range(3):
            task_id, future = self.adapter.submit_io_task(
                function=io_task,
                name=f"IO-{i}",
                sleep_time=0.2,
                priority=TaskPriority.NORMAL
            )
            futures.append(future)
            task_ids.append(task_id)
        
        # CPU tasks
        for i in range(3):
            task_id, future = self.adapter.submit_cpu_task(
                function=cpu_task,
                name=f"CPU-{i}",
                iterations=100000,  # 100K iterations
                priority=TaskPriority.HIGH
            )
            futures.append(future)
            task_ids.append(task_id)
        
        # Wait for all tasks to complete
        start_time = time.time()
        results = await asyncio.gather(*futures)
        end_time = time.time()
        
        # Check that all tasks completed
        self.assertEqual(len(results), 6)
        
        # Verify parallel execution by checking that the total time is less than
        # the sum of individual task times (which would be >1.8s if sequential)
        # With parallelism, it should be closer to the max task time (0.6s)
        execution_time = end_time - start_time
        
        # For parallel execution, the time should be significantly less than 
        # the sum of all task times
        self.assertLess(execution_time, 1.0)
        
        # Check the results
        io_results = [result for result in results if result.startswith("IO task")]
        cpu_results = [result for result in results if result.startswith("CPU task")]
        
        self.assertEqual(len(io_results), 3)
        self.assertEqual(len(cpu_results), 3)
    
    async def test_task_priority(self):
        """Test that tasks are executed in priority order"""
        results = []
        
        # Define a test function that records execution order
        def test_function(value):
            results.append(value)
            time.sleep(0.1)  # Ensure predictable execution timing
            return value
        
        # Submit tasks with different priorities in reverse order
        futures = []
        
        # Create enough tasks to ensure that queue ordering matters
        # (more tasks than worker threads)
        for i, priority in enumerate([
            TaskPriority.LOW,
            TaskPriority.LOW,
            TaskPriority.NORMAL,
            TaskPriority.NORMAL, 
            TaskPriority.HIGH,
            TaskPriority.HIGH,
            TaskPriority.CRITICAL,
            TaskPriority.CRITICAL
        ]):
            _, future = self.adapter.submit_task(
                function=test_function,
                value=i,
                task_type=TaskType.CPU,  # Use CPU type to ensure consistent pool
                priority=priority
            )
            futures.append(future)
        
        # Wait for all tasks to complete
        await asyncio.gather(*futures)
        
        # Higher priority tasks (6, 7 = CRITICAL; 4, 5 = HIGH; etc.) should run first
        # Note: Within the same priority, order is not guaranteed, so we don't check exact ordering
        
        # The first two results should be the CRITICAL priority tasks (indices 6, 7)
        self.assertTrue(
            results[0] in [6, 7] and results[1] in [6, 7] and results[0] != results[1],
            f"Expected CRITICAL priority tasks (6, 7) to run first, got: {results}"
        )
        
        # The next two results should be the HIGH priority tasks (indices 4, 5)
        self.assertTrue(
            results[2] in [4, 5] and results[3] in [4, 5] and results[2] != results[3],
            f"Expected HIGH priority tasks (4, 5) to run second, got: {results}"
        )
    
    async def test_mock_model_operations(self):
        """Test model operations using the mock mode"""
        # This test depends on use_mock=True in the adapter config
        
        # Load a mock model
        model_id = f"test_model_{int(time.time())}"
        load_result = await self.adapter.load_model_from_ipfs(model_id, "QmTestModelCID")
        
        # Check that the model was loaded
        self.assertEqual(load_result["status"], "success")
        self.assertEqual(load_result["model_id"], model_id)
        
        # Check that the model is tracked
        with self.adapter.lock:
            self.assertIn(model_id, self.adapter.models)
            self.assertEqual(self.adapter.models[model_id]["cid"], "QmTestModelCID")
        
        # Run inference
        inference_result = await self.adapter.run_inference(model_id, "Test input")
        
        # Check the inference result
        self.assertEqual(inference_result["status"], "success")
        self.assertEqual(inference_result["model_id"], model_id)
        self.assertIn("results", inference_result)
        
        # Unload the model
        unload_result = await self.adapter.unload_model(model_id)
        
        # Check the unload result
        self.assertEqual(unload_result["status"], "success")
        self.assertEqual(unload_result["model_id"], model_id)
        
        # Check that the model is no longer tracked
        with self.adapter.lock:
            self.assertNotIn(model_id, self.adapter.models)
    
    async def test_statistics(self):
        """Test statistics collection"""
        # Submit some tasks
        futures = []
        
        # Define test functions
        def test_function(task_type, value):
            time.sleep(0.1)
            return f"{task_type} task: {value}"
        
        # Submit tasks for each pool type
        for task_type in [TaskType.GENERAL, TaskType.IO, TaskType.CPU, TaskType.IPFS]:
            for i in range(2):
                _, future = self.adapter.submit_task(
                    function=test_function,
                    task_type=task_type,
                    task_type=task_type,
                    value=i,
                    priority=TaskPriority.NORMAL
                )
                futures.append(future)
        
        # Wait for tasks to start (not necessarily complete)
        await asyncio.sleep(0.05)
        
        # Get statistics
        stats = self.adapter.get_stats()
        
        # Check thread pool stats
        self.assertIn("thread_pools", stats)
        self.assertIn("pools", stats["thread_pools"])
        self.assertGreater(len(stats["thread_pools"]["pools"]), 0)
        
        # Check task tracking
        self.assertIn("tasks", stats)
        self.assertIn("active", stats["tasks"])
        self.assertIn("tasks", stats["tasks"])
        
        # There should be tasks tracked
        self.assertGreaterEqual(stats["tasks"]["active"], 1)
        
        # Wait for all tasks to complete
        await asyncio.gather(*futures)
        
        # Get final statistics
        final_stats = self.adapter.get_stats()
        
        # Check thread pool task completion
        self.assertGreaterEqual(
            final_stats["thread_pools"]["tasks"]["completed"],
            8  # We submitted at least 8 tasks
        )
    
    async def test_module_test_method(self):
        """Test the module's test method"""
        # Run the test method
        test_results = await self.adapter.test()
        
        # Check the results
        self.assertTrue(test_results["success"])
        self.assertEqual(test_results["module"], "ipfs_accelerate_mp_adapter")
        self.assertIn("steps", test_results)
        
        # Check individual test steps
        self.assertIn("thread_pool_test", test_results["steps"])
        self.assertIn("ipfs_tasks", test_results["steps"])
        self.assertIn("cpu_tasks", test_results["steps"])
        
        if self.adapter.config["use_mock"] or self.adapter.metadata.get("use_mock_for_tests", True):
            self.assertIn("load_model", test_results["steps"])
            self.assertIn("inference", test_results["steps"])
            self.assertIn("unload_model", test_results["steps"])
        
        # All steps should have succeeded
        for step_name, step_result in test_results["steps"].items():
            self.assertTrue(step_result["success"], f"Step {step_name} failed")


# Helper class to run async tests
class AsyncTestCase(unittest.TestCase):
    """Base class for async tests"""
    
    def run_async(self, test_method, *args, **kwargs):
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(test_method(*args, **kwargs))
    

class IPFSAccelerateAdapterAsyncTests(AsyncTestCase):
    """Async test cases wrapper"""
    
    def setUp(self):
        self.test_case = IPFSAccelerateAdapterTests()
        self.run_async(self.test_case.asyncSetUp)
    
    def tearDown(self):
        self.run_async(self.test_case.asyncTearDown)
    
    def test_adapter_initialization(self):
        self.run_async(self.test_case.test_adapter_initialization)
    
    def test_ipfs_task_submission(self):
        self.run_async(self.test_case.test_ipfs_task_submission)
    
    def test_cpu_task_submission(self):
        self.run_async(self.test_case.test_cpu_task_submission)
    
    def test_io_task_submission(self):
        self.run_async(self.test_case.test_io_task_submission)
    
    def test_task_cancellation(self):
        self.run_async(self.test_case.test_task_cancellation)
    
    def test_parallel_task_execution(self):
        self.run_async(self.test_case.test_parallel_task_execution)
    
    def test_task_priority(self):
        self.run_async(self.test_case.test_task_priority)
    
    def test_mock_model_operations(self):
        self.run_async(self.test_case.test_mock_model_operations)
    
    def test_statistics(self):
        self.run_async(self.test_case.test_statistics)
    
    def test_module_test_method(self):
        self.run_async(self.test_case.test_module_test_method)


def run_tests():
    """Run the tests and return the results as JSON"""
    try:
        # Create a test suite
        suite = unittest.TestSuite()
        suite.addTest(unittest.makeSuite(IPFSAccelerateAdapterAsyncTests))
        
        # Run the tests
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)
        
        # Check for success
        success = result.wasSuccessful()
        
        # Format the results
        test_results = {
            "success": success,
            "module": "ipfs_accelerate_mp_adapter",
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
            "module": "ipfs_accelerate_mp_adapter",
            "error": str(e)
        }


if __name__ == "__main__":
    # Run the tests
    test_results = run_tests()
    
    # Print the results
    print(json.dumps(test_results, indent=2))
    
    # Exit with appropriate code
    sys.exit(0 if test_results["success"] else 1)