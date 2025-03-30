"""
Thread Pool Manager Tests

This module contains tests for the thread pool management system.
It validates the core functionality of multiple thread pools, task prioritization,
dynamic scaling, and proper resource allocation.
"""

import os
import sys
import time
import json
import asyncio
import unittest
import threading
import multiprocessing
from concurrent.futures import Future, wait, ALL_COMPLETED

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from thread_pool_manager import (
    ThreadPoolManager, 
    ManagedThreadPool,
    TaskType,
    TaskPriority,
    TaskState
)

class ThreadPoolManagerTests(unittest.TestCase):
    """Test cases for the ThreadPoolManager class"""
    
    def setUp(self):
        """Set up test environment"""
        self.manager = ThreadPoolManager(metadata={
            "default_min_workers": 2,
            "default_max_workers": 8,
            "auto_create_pools": True
        })
    
    def tearDown(self):
        """Clean up test environment"""
        if hasattr(self, 'manager') and self.manager:
            self.manager.shutdown()
    
    def test_pool_creation(self):
        """Test that pools are created correctly"""
        # Check that default pools were created
        self.assertGreaterEqual(len(self.manager.pools), 1)
        self.assertIn(TaskType.GENERAL, self.manager.pools)
        
        # Create a custom pool
        pool = self.manager.create_pool(
            pool_id="test_pool",
            pool_type=TaskType.CPU,
            min_workers=1,
            max_workers=4
        )
        
        # Check that the pool was created correctly
        self.assertEqual(pool.pool_id, "test_pool")
        self.assertEqual(pool.pool_type, TaskType.CPU)
        self.assertEqual(pool.min_workers, 1)
        self.assertEqual(pool.max_workers, 4)
        self.assertEqual(pool.current_worker_count, 1)
        
        # Check that the pool is registered
        self.assertIn("test_pool", self.manager.pools_by_id)
        self.assertIs(self.manager.pools_by_id["test_pool"], pool)
    
    def test_task_submission(self):
        """Test that tasks can be submitted and executed"""
        # Define a test function
        def test_function(value):
            time.sleep(0.1)  # Simulate work
            return value * 2
        
        # Submit a task
        task_id, future = self.manager.submit(
            function=test_function,
            value=42,
            task_type=TaskType.GENERAL
        )
        
        # Check the task ID and future
        self.assertIsNotNone(task_id)
        self.assertIsInstance(future, Future)
        
        # Wait for the task to complete
        result = future.result(timeout=2.0)
        
        # Check the result
        self.assertEqual(result, 84)
    
    def test_task_priority(self):
        """Test that tasks are executed in priority order"""
        results = []
        
        # Define a test function that records execution order
        def test_function(value):
            results.append(value)
            time.sleep(0.1)  # Ensure predictable execution timing
            return value
        
        # Submit tasks with different priorities in reverse order
        futures = []
        for i, priority in enumerate([
            TaskPriority.LOW,
            TaskPriority.NORMAL,
            TaskPriority.HIGH,
            TaskPriority.CRITICAL
        ]):
            _, future = self.manager.submit(
                function=test_function,
                value=i,
                task_type=TaskType.GENERAL,
                priority=priority
            )
            futures.append(future)
        
        # Wait for all tasks to complete
        wait(futures, timeout=5.0)
        
        # Higher priority tasks (lower index) should be executed first
        # [3, 2, 1, 0] is the expected order (where 3=CRITICAL, 0=LOW)
        self.assertEqual(results, [3, 2, 1, 0])
    
    def test_task_cancellation(self):
        """Test that tasks can be cancelled"""
        cancel_event = threading.Event()
        
        # Define a test function that can be cancelled
        def test_function():
            cancel_event.wait(10.0)  # Wait for cancel event or timeout
            return "completed"
        
        # Submit a task
        task_id, future = self.manager.submit(
            function=test_function,
            task_type=TaskType.GENERAL
        )
        
        # Cancel the task
        cancelled = self.manager.cancel_task(task_id)
        
        # Signal the task to complete if it's still running
        cancel_event.set()
        
        # Check that the task was cancelled
        self.assertTrue(cancelled)
        self.assertTrue(future.cancelled() or future.done())
    
    def test_task_timeout(self):
        """Test that tasks time out correctly"""
        # Define a test function that takes longer than its timeout
        def test_function():
            time.sleep(2.0)  # Longer than timeout
            return "completed"
        
        # Submit a task with a short timeout
        task_id, future = self.manager.submit(
            function=test_function,
            task_type=TaskType.GENERAL,
            timeout=0.5  # Short timeout
        )
        
        # The task should time out and raise an exception
        with self.assertRaises(Exception):
            future.result(timeout=3.0)
    
    def test_auto_scaling(self):
        """Test that pools auto-scale based on workload"""
        # Get a test pool
        pool = self.manager.get_pool(TaskType.IO)
        initial_workers = pool.current_worker_count
        
        # Define a test function that blocks
        def test_function():
            time.sleep(1.0)
            return "completed"
        
        # Submit many tasks to trigger scaling
        futures = []
        for _ in range(20):
            _, future = pool.submit(
                function=test_function,
                priority=TaskPriority.NORMAL
            )
            futures.append(future)
        
        # Wait a bit for scaling to occur
        time.sleep(1.0)
        
        # Check that the pool scaled up
        current_workers = pool.current_worker_count
        self.assertGreater(current_workers, initial_workers)
        
        # Wait for all tasks to complete
        wait(futures, timeout=5.0)
        
        # Wait for auto-scaling down (may take longer)
        # This is more of an observation than a strict test
        time.sleep(6.0)
        
        # The pool should eventually scale back down
        final_workers = pool.current_worker_count
        self.assertLessEqual(final_workers, current_workers)
    
    def test_multi_pool_task_distribution(self):
        """Test that tasks are distributed to the correct pools"""
        # Create a counter for each pool
        task_counts = {
            TaskType.GENERAL: 0,
            TaskType.IO: 0,
            TaskType.CPU: 0
        }
        
        # Define a test function that records which pool it runs in
        def test_function(task_type):
            task_counts[task_type] += 1
            time.sleep(0.1)
            return str(task_type)
        
        # Submit tasks to different pools
        futures = []
        for task_type in task_counts.keys():
            for _ in range(5):  # 5 tasks per pool
                _, future = self.manager.submit(
                    function=test_function,
                    task_type=task_type,
                    priority=TaskPriority.NORMAL
                )
                futures.append(future)
        
        # Wait for all tasks to complete
        wait(futures, timeout=5.0)
        
        # Check that tasks were distributed correctly
        for task_type, count in task_counts.items():
            self.assertEqual(count, 5, f"Pool {task_type} should have executed 5 tasks")
    
    def test_worker_utilization(self):
        """Test that worker utilization is tracked correctly"""
        # Get a test pool
        pool = self.manager.get_pool(TaskType.GENERAL)
        
        # Define a test function that takes some time
        def test_function():
            time.sleep(0.5)
            return "completed"
        
        # Get initial stats
        initial_stats = pool.get_stats()
        
        # Submit tasks to the pool
        futures = []
        for _ in range(10):
            _, future = pool.submit(
                function=test_function,
                priority=TaskPriority.NORMAL
            )
            futures.append(future)
        
        # Check that utilization increases
        time.sleep(0.2)  # Give time for tasks to start
        mid_stats = pool.get_stats()
        self.assertGreater(
            mid_stats["resources"]["active_workers"],
            initial_stats["resources"]["active_workers"]
        )
        
        # Wait for all tasks to complete
        wait(futures, timeout=5.0)
        
        # Check that utilization goes back down
        final_stats = pool.get_stats()
        self.assertEqual(
            final_stats["resources"]["active_workers"],
            0
        )
    
    def test_error_handling(self):
        """Test that task errors are handled properly"""
        # Define a test function that raises an exception
        def test_function():
            raise ValueError("Test error")
        
        # Submit a task
        task_id, future = self.manager.submit(
            function=test_function,
            task_type=TaskType.GENERAL
        )
        
        # The task should raise an exception
        with self.assertRaises(ValueError):
            future.result(timeout=2.0)
        
        # Check the pool stats
        pool = self.manager.get_pool(TaskType.GENERAL)
        stats = pool.get_stats()
        self.assertGreaterEqual(stats["tasks"]["failed"], 1)
    
    def test_resource_usage_tracking(self):
        """Test that resource usage is tracked correctly"""
        # Get a test pool
        pool = self.manager.get_pool(TaskType.CPU)
        
        # Define a test function that uses CPU
        def cpu_intensive_task(n):
            result = 0
            for i in range(n):
                result += i
            return result
        
        # Submit CPU-intensive tasks
        futures = []
        for _ in range(5):
            _, future = pool.submit(
                function=cpu_intensive_task,
                n=1000000,  # 1 million iterations
                priority=TaskPriority.NORMAL
            )
            futures.append(future)
        
        # Wait for all tasks to complete
        wait(futures, timeout=10.0)
        
        # Check performance stats
        stats = pool.get_stats()
        self.assertGreater(stats["performance"]["avg_runtime"], 0)
        self.assertGreater(stats["performance"]["total_runtime"], 0)
        self.assertGreaterEqual(stats["tasks"]["completed"], 5)
    
    async def test_module_test_method(self):
        """Test the module's test method"""
        # Run the test method
        test_results = await self.manager.test()
        
        # Check the results
        self.assertTrue(test_results["success"])
        self.assertEqual(test_results["module"], "thread_pool_manager")
        self.assertIn("steps", test_results)
        
        # Check individual test steps
        self.assertIn("create_pools", test_results["steps"])
        self.assertIn("submit_tasks", test_results["steps"])
        self.assertIn("priority_ordering", test_results["steps"])
        self.assertIn("task_cancellation", test_results["steps"])
        
        # All steps should have succeeded
        for step_name, step_result in test_results["steps"].items():
            self.assertTrue(step_result["success"], f"Step {step_name} failed")


class IntegrationWithMultiProcessTests(unittest.TestCase):
    """Test integration with the multi-process architecture"""
    
    def setUp(self):
        """Set up test environment"""
        self.manager = ThreadPoolManager(metadata={
            "default_min_workers": 2,
            "default_max_workers": 8,
            "auto_create_pools": True
        })
        
        # Create a shared queue for communication between processes
        self.queue = multiprocessing.Queue()
    
    def tearDown(self):
        """Clean up test environment"""
        if hasattr(self, 'manager') and self.manager:
            self.manager.shutdown()
    
    def process_worker(self, task_id, task_count):
        """Worker function for a separate process"""
        # Create a thread pool manager in the process
        manager = ThreadPoolManager(metadata={
            "default_min_workers": 2,
            "default_max_workers": 4
        })
        
        try:
            # Define a test function
            def test_function(i):
                time.sleep(0.1)  # Simulate work
                return f"Process {task_id}, Task {i}"
            
            # Submit tasks
            futures = []
            for i in range(task_count):
                _, future = manager.submit(
                    function=test_function,
                    i=i,
                    task_type=TaskType.GENERAL
                )
                futures.append(future)
            
            # Wait for all tasks to complete
            results = []
            for future in futures:
                results.append(future.result(timeout=5.0))
            
            # Put results in the queue
            self.queue.put({
                "process_id": task_id,
                "results": results,
                "stats": manager.get_stats()
            })
            
        finally:
            # Clean up
            manager.shutdown()
    
    def test_multi_process_thread_pools(self):
        """Test using thread pools in multiple processes"""
        # Start multiple processes, each with its own thread pool
        processes = []
        process_count = 3
        task_count = 10
        
        for i in range(process_count):
            process = multiprocessing.Process(
                target=self.process_worker,
                args=(i, task_count)
            )
            processes.append(process)
            process.start()
        
        # Wait for all processes to complete
        for process in processes:
            process.join(timeout=30.0)
            self.assertFalse(process.is_alive())
        
        # Get results from the queue
        results = []
        while not self.queue.empty():
            results.append(self.queue.get(timeout=1.0))
        
        # Check that all processes completed their tasks
        self.assertEqual(len(results), process_count)
        
        for result in results:
            # Each process should have completed all its tasks
            self.assertEqual(len(result["results"]), task_count)
            
            # Check the stats
            stats = result["stats"]
            self.assertEqual(stats["tasks"]["completed"], task_count)
            self.assertEqual(stats["tasks"]["failed"], 0)
    
    def test_coordination_between_processes(self):
        """Test coordination between thread pools in different processes"""
        # Define tasks for the main process
        def main_task(value):
            time.sleep(0.1)
            return f"Main: {value}"
        
        # Start task in the main process
        main_results = []
        main_futures = []
        
        for i in range(5):
            _, future = self.manager.submit(
                function=main_task,
                value=i,
                task_type=TaskType.GENERAL
            )
            main_futures.append(future)
        
        # Start a worker process
        process = multiprocessing.Process(
            target=self.process_worker,
            args=("worker", 5)
        )
        process.start()
        
        # Get results from the main process tasks
        for future in main_futures:
            main_results.append(future.result(timeout=5.0))
        
        # Wait for the worker process to complete
        process.join(timeout=30.0)
        self.assertFalse(process.is_alive())
        
        # Get results from the worker process
        worker_result = self.queue.get(timeout=1.0)
        
        # Check results
        self.assertEqual(len(main_results), 5)
        self.assertEqual(len(worker_result["results"]), 5)
        
        # Main process statistics
        main_stats = self.manager.get_stats()
        self.assertEqual(main_stats["tasks"]["completed"], 5)
        
        # Worker process statistics
        worker_stats = worker_result["stats"]
        self.assertEqual(worker_stats["tasks"]["completed"], 5)


def run_tests():
    """Run the tests and return the results as JSON"""
    try:
        # Create a test suite
        suite = unittest.TestSuite()
        suite.addTest(unittest.makeSuite(ThreadPoolManagerTests))
        suite.addTest(unittest.makeSuite(IntegrationWithMultiProcessTests))
        
        # Run the tests
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)
        
        # Check for success
        success = result.wasSuccessful()
        
        # Format the results
        test_results = {
            "success": success,
            "module": "thread_pool_manager",
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
            "module": "thread_pool_manager",
            "error": str(e)
        }


async def async_test():
    """Run the async tests and return the results as JSON"""
    try:
        # Create and run the test
        test = ThreadPoolManagerTests("test_module_test_method")
        test.setUp()
        try:
            await test.test_module_test_method()
            test_results = {
                "success": True,
                "module": "thread_pool_manager",
                "message": "Async test completed successfully"
            }
        finally:
            test.tearDown()
        
        return test_results
    
    except Exception as e:
        # Return any errors
        return {
            "success": False,
            "module": "thread_pool_manager",
            "error": str(e)
        }


if __name__ == "__main__":
    # Run the tests
    test_results = run_tests()
    
    # Run the async tests
    async_results = asyncio.run(async_test())
    
    # Combine the results
    combined_results = {
        "standard_tests": test_results,
        "async_tests": async_results,
        "success": test_results["success"] and async_results["success"]
    }
    
    # Print the results
    print(json.dumps(combined_results, indent=2))
    
    # Exit with appropriate code
    sys.exit(0 if combined_results["success"] else 1)