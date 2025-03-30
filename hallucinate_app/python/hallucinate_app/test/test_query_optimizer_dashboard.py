"""
Query Optimizer Dashboard Tests

This module provides tests for the query optimizer dashboard components, including
the status panel and the dashboard container with web server capabilities.
"""

import os
import sys
import json
import unittest
import asyncio
import time
from unittest.mock import MagicMock, patch

# Ensure the parent directory is in the path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Try importing the dashboard components
try:
    from hallucinate_app.dashboard.query_optimizer_status_panel import QueryOptimizerStatusPanel
    from hallucinate_app.dashboard.query_optimizer_dashboard import QueryOptimizerDashboard
    
    # Also import the query components they depend on
    from hallucinate_app.advanced_query_optimizer import (
        AdvancedQueryOptimizer,
        OptimizationLevel,
        OptimizationStrategy
    )
    
    from hallucinate_app.database_query_system import (
        DatabaseQuerySystem,
        QueryPlan,
        QueryFragment,
        DatabaseType,
        QueryType
    )
    
    HAS_DEPENDENCIES = True
except ImportError:
    HAS_DEPENDENCIES = False


# Mock classes for testing
class MockQuerySystem:
    """Mock implementation of DatabaseQuerySystem for testing"""
    
    def __init__(self):
        self.queries = []
        self.plans = []
    
    def plan_query(self, query, params=None, target_db=None):
        """Create a mock query plan"""
        plan = MagicMock()
        plan.fragments = []
        self.plans.append(plan)
        return plan
    
    async def execute_plan(self, plan):
        """Execute a mock query plan"""
        return {"mock_result": True}
    
    def get_performance_metrics(self):
        """Get mock performance metrics"""
        return {
            "optimization": {
                "optimized_count": 10,
                "time_saved": 5.5,
                "average_speedup": 1.5,
                "failures": 2,
                "strategies": {
                    "push_filters_down": 8,
                    "merge_fragments": 6,
                    "optimize_joins": 3
                },
                "history": [
                    {
                        "query_id": "q1",
                        "query_text": "SELECT * FROM test",
                        "timestamp": time.time(),
                        "success": True,
                        "execution_time": 0.2,
                        "optimized_time": 0.1,
                        "speedup": 2.0,
                        "database_type": "DUCKDB",
                        "query_type": "SELECT",
                        "strategies": {
                            "push_filters_down": True,
                            "merge_fragments": False
                        }
                    },
                    {
                        "query_id": "q2",
                        "query_text": "SELECT * FROM users WHERE id > 100",
                        "timestamp": time.time() - 100,
                        "success": True,
                        "execution_time": 0.3,
                        "optimized_time": 0.2,
                        "speedup": 1.5,
                        "database_type": "DUCKDB",
                        "query_type": "SELECT",
                        "strategies": {
                            "push_filters_down": True,
                            "merge_fragments": True
                        }
                    }
                ]
            }
        }


class MockQueryOptimizer:
    """Mock implementation of AdvancedQueryOptimizer for testing"""
    
    def __init__(self):
        self.optimization_level = OptimizationLevel.STANDARD
        self.plans_optimized = []
    
    def optimize(self, plan):
        """Optimize a mock query plan"""
        self.plans_optimized.append(plan)
        
        # Return a new mock plan (optimization result)
        optimized_plan = MagicMock()
        optimized_plan.fragments = []
        return optimized_plan
    
    def get_recommendations(self):
        """Get mock optimization recommendations"""
        return {
            "general": [
                {
                    "title": "Use index for frequent queries",
                    "description": "Several queries on the users table could benefit from an index",
                    "solution": "Create an index on users.id and users.email",
                    "priority": "high"
                }
            ],
            "database_specific": {
                "DUCKDB": [
                    {
                        "title": "Optimize large joins",
                        "description": "Joins between orders and users are slow",
                        "solution": "Consider denormalizing or adding more indices",
                        "priority": "medium"
                    }
                ]
            },
            "query_patterns": []
        }
    
    async def test(self):
        """Mock test method"""
        return {
            "success": True,
            "steps": {
                "test1": {"success": True},
                "test2": {"success": True}
            }
        }


@unittest.skipIf(not HAS_DEPENDENCIES, "Required dependencies not available")
class TestQueryOptimizerStatusPanel(unittest.TestCase):
    """Tests for the QueryOptimizerStatusPanel class"""
    
    def setUp(self):
        """Set up test case"""
        # Create mock resources
        self.resources = {
            "database_query_system": MockQuerySystem(),
            "advanced_query_optimizer": MockQueryOptimizer()
        }
        
        # Create panel
        self.panel = QueryOptimizerStatusPanel(
            resources=self.resources,
            metadata={
                "auto_refresh": False,  # Disable auto-refresh for testing
                "panel_id": "test-panel"
            }
        )
    
    async def _init_panel(self):
        """Helper method to initialize the panel asynchronously"""
        await self.panel.init()
    
    def test_initialization(self):
        """Test panel initialization"""
        # Check basic properties
        self.assertEqual(self.panel.config["panel_id"], "test-panel")
        self.assertFalse(self.panel.config["auto_refresh"])
        self.assertEqual(self.panel.resources, self.resources)
        self.assertEqual(self.panel.active_tab, self.panel.config["default_tab"])
        
        # Check resource access
        self.assertEqual(self.panel.query_system, self.resources["database_query_system"])
        self.assertEqual(self.panel.query_optimizer, self.resources["advanced_query_optimizer"])
    
    def test_set_active_tab(self):
        """Test changing the active tab"""
        # Check default tab
        original_tab = self.panel.active_tab
        
        # Set a new tab
        self.panel.set_active_tab("queries")
        self.assertEqual(self.panel.active_tab, "queries")
        
        # Set an invalid tab (should not change)
        self.panel.set_active_tab("invalid_tab")
        self.assertEqual(self.panel.active_tab, "queries")
        
        # Reset to original
        self.panel.set_active_tab(original_tab)
    
    def test_set_filter(self):
        """Test setting filters"""
        # Check default filters
        self.assertIsNone(self.panel.filters["database_type"])
        self.assertEqual(self.panel.filters["time_period"], "24h")
        
        # Set some filters
        self.panel.set_filter("database_type", "DUCKDB")
        self.panel.set_filter("time_period", "7d")
        
        # Check that filters were set
        self.assertEqual(self.panel.filters["database_type"], "DUCKDB")
        self.assertEqual(self.panel.filters["time_period"], "7d")
        
        # Set an invalid filter (should be ignored)
        self.panel.set_filter("invalid_filter", "value")
        self.assertNotIn("invalid_filter", self.panel.filters)
    
    def test_get_current_view_data(self):
        """Test getting current view data"""
        # Get view data
        view_data = self.panel.get_current_view_data()
        
        # Check basic properties
        self.assertEqual(view_data["active_tab"], self.panel.active_tab)
        self.assertEqual(view_data["filters"], self.panel.filters)
        self.assertTrue(view_data["has_query_system"])
        
        # Check that view data depends on active tab
        self.panel.set_active_tab("overview")
        overview_data = self.panel.get_current_view_data()
        self.assertIn("metrics", overview_data)
        
        self.panel.set_active_tab("queries")
        queries_data = self.panel.get_current_view_data()
        self.assertIn("queries", queries_data)
    
    def test_get_panel_html(self):
        """Test generating panel HTML"""
        # Get HTML
        html = self.panel.get_panel_html()
        
        # Basic checks
        self.assertIn('id="test-panel"', html)
        self.assertIn('query-optimizer-panel', html)
        self.assertIn('panel-tabs', html)
        
        # Check that all tabs are included
        for tab in ["overview", "queries", "strategies", "plans", "recommendations"]:
            self.assertIn(f'onclick="setQueryOptimizerTab(\'{tab}\')"', html)
    
    def test_filter_history_by_time(self):
        """Test filtering history by time period"""
        # Create test history
        now = time.time()
        history = [
            {"timestamp": now},                    # Now
            {"timestamp": now - 1800},             # 30 minutes ago
            {"timestamp": now - 7200},             # 2 hours ago
            {"timestamp": now - 86400},            # 1 day ago
            {"timestamp": now - 86400 * 3},        # 3 days ago
            {"timestamp": now - 86400 * 10},       # 10 days ago
            {"timestamp": now - 86400 * 40}        # 40 days ago
        ]
        
        # Test different time periods
        self.assertEqual(len(self.panel.filter_history_by_time(history, "1h")), 2)
        self.assertEqual(len(self.panel.filter_history_by_time(history, "24h")), 4)
        self.assertEqual(len(self.panel.filter_history_by_time(history, "7d")), 6)
        self.assertEqual(len(self.panel.filter_history_by_time(history, "30d")), 6)
        self.assertEqual(len(self.panel.filter_history_by_time(history, "all")), 7)
    
    async def test_async_methods(self):
        """Test async methods of the panel"""
        # Initialize the panel
        await self._init_panel()
        self.assertTrue(self.panel.is_initialized)
        
        # Test refresh_data
        await self.panel.refresh_data()
        self.assertGreater(self.panel.last_update_time, 0)
        
        # Test auto-refresh control
        self.assertIsNone(self.panel.refresh_task)
        self.panel.start_auto_refresh()
        self.assertIsNotNone(self.panel.refresh_task)
        self.panel.stop_auto_refresh()
        self.assertIsNone(self.panel.refresh_task)
        
        # Test the test method
        test_result = await self.panel.test()
        self.assertIn("success", test_result)
        self.assertIn("tests", test_result)


@unittest.skipIf(not HAS_DEPENDENCIES, "Required dependencies not available")
class TestQueryOptimizerDashboard(unittest.TestCase):
    """Tests for the QueryOptimizerDashboard class"""
    
    def setUp(self):
        """Set up test case"""
        # Create mock resources
        self.resources = {
            "database_query_system": MockQuerySystem(),
            "advanced_query_optimizer": MockQueryOptimizer()
        }
        
        # Create dashboard with server disabled
        self.dashboard = QueryOptimizerDashboard(
            resources=self.resources,
            metadata={
                "enable_server": False,
                "server_port": 9999,  # Use high port to avoid conflicts
                "state_file": ":memory:"  # In-memory state for testing
            }
        )
    
    async def _init_dashboard(self):
        """Helper method to initialize the dashboard asynchronously"""
        await self.dashboard.init()
    
    def test_initialization(self):
        """Test dashboard initialization"""
        # Check basic properties
        self.assertEqual(self.dashboard.config["server_port"], 9999)
        self.assertFalse(self.dashboard.config["enable_server"])
        self.assertEqual(self.dashboard.resources, self.resources)
        
        # Check resource access
        self.assertEqual(self.dashboard.query_system, self.resources["database_query_system"])
        self.assertEqual(self.dashboard.query_optimizer, self.resources["advanced_query_optimizer"])
        
        # Check panel initialization
        self.assertIsNotNone(self.dashboard.status_panel)
    
    def test_get_dashboard_html(self):
        """Test generating dashboard HTML"""
        # Get HTML
        html = self.dashboard.get_dashboard_html()
        
        # Basic checks
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn(self.dashboard.config["dashboard_title"], html)
        self.assertIn("Query Optimizer", html)
        
        # Check for key dashboard elements
        self.assertIn("dashboard-container", html)
        self.assertIn("dashboard-header", html)
        self.assertIn("dashboard-footer", html)
        
        # Check for embedded panel
        self.assertIn("query-optimizer-panel", html)
    
    def test_get_dashboard_state(self):
        """Test getting dashboard state"""
        # Get state
        state = self.dashboard.get_dashboard_state()
        
        # Check basic structure
        self.assertIn("last_update", state)
        self.assertIn("panels", state)
        self.assertIn("queries", state)
        self.assertIn("system_status", state)
        
        # Check system status
        self.assertIn("server_running", state["system_status"])
        self.assertIn("components", state["system_status"])
    
    def test_find_available_port(self):
        """Test finding an available port"""
        # Find a port
        port = self.dashboard.find_available_port(start_port=8900, end_port=9000)
        
        # Should return a port in the specified range
        self.assertGreaterEqual(port, 8900)
        self.assertLessEqual(port, 9000)
    
    def test_serialize_plan(self):
        """Test serializing a query plan"""
        # Create a mock plan
        plan = MagicMock()
        plan.__dict__ = {
            "fragments": [MagicMock()],
            "plan_id": "test_plan"
        }
        
        # Serialize
        serialized = self.dashboard._serialize_plan(plan)
        
        # Check result
        self.assertIn("fragments", serialized)
        self.assertEqual(serialized["plan_id"], "test_plan")
    
    async def test_optimize_query(self):
        """Test the _optimize_query method"""
        # Initialize dashboard
        await self._init_dashboard()
        
        # Test optimizing a query
        result = await self.dashboard._optimize_query(
            query="SELECT * FROM test",
            params={"param1": 1},
            target_db="DUCKDB"
        )
        
        # Check result
        self.assertIn("query", result)
        self.assertIn("original_plan", result)
        self.assertIn("optimized_plan", result)
        self.assertIn("speedup", result)
        self.assertTrue(result["success"])
    
    async def test_server_lifecycle(self):
        """Test server start/stop"""
        # Create dashboard with server enabled and high port
        dashboard = QueryOptimizerDashboard(
            resources=self.resources,
            metadata={
                "enable_server": True,
                "server_port": 9876,  # Use high port to avoid conflicts
                "state_file": ":memory:"  # In-memory state for testing
            }
        )
        
        try:
            # Start server
            await dashboard.start_server()
            self.assertTrue(dashboard.running)
            
            # Stop server
            await dashboard.stop_server()
            self.assertFalse(dashboard.running)
        
        except Exception as e:
            self.fail(f"Server lifecycle test failed: {e}")
    
    async def test_async_methods(self):
        """Test async methods of the dashboard"""
        # Initialize the dashboard
        await self._init_dashboard()
        
        # Test the test method
        test_result = await self.dashboard.test()
        self.assertIn("success", test_result)
        self.assertIn("tests", test_result)


# Helper function to run all tests
def run_tests():
    """Run all tests and return results as a dictionary"""
    result_dict = {
        "success": True,
        "module": "query_optimizer_dashboard",
        "tests": {},
        "summary": {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "errors": 0
        }
    }
    
    # Check if dependencies are available
    if not HAS_DEPENDENCIES:
        result_dict["success"] = False
        result_dict["error"] = "Required dependencies not available"
        return result_dict
    
    # For asyncio tests on Windows
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # Set up asyncio event loop for tests
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Create test suite
        suite = unittest.TestSuite()
        
        # Add test cases
        suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(TestQueryOptimizerStatusPanel))
        suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(TestQueryOptimizerDashboard))
        
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
    
    finally:
        # Clean up
        loop.close()
    
    return result_dict


# Main entry point for testing
if __name__ == "__main__":
    # For asyncio tests
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # Create and set event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Run tests
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
    
    finally:
        # Clean up
        loop.close()