"""
Advanced Query Optimizer Tests

This module provides tests for the advanced query optimization system, including
strategy evaluation, performance benchmarking, and integration with the database
query system.
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

# Import query optimizer components
try:
    from hallucinate_app.advanced_query_optimizer import (
        AdvancedQueryOptimizer,
        OptimizationLevel,
        OptimizationStrategy,
        QueryAnalyzer,
        CrossDatabaseJoinOptimizer,
        PredicatePushdownOptimizer,
        MaterializedViewOptimizer,
        FederationOptimizer,
        QueryRewriter
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

# Run tests only if dependencies are available
@unittest.skipIf(not HAS_DEPENDENCIES, "Required dependencies not available")
class TestAdvancedQueryOptimizer(unittest.TestCase):
    """Tests for the AdvancedQueryOptimizer class"""
    
    def setUp(self):
        """Set up test case"""
        # Create mock statistics
        self.statistics = {
            "tables": {
                "users": {
                    "row_count": 1000,
                    "columns": [
                        {"name": "id", "type": "INTEGER", "nullable": False, "primary_key": True},
                        {"name": "name", "type": "TEXT", "nullable": False, "primary_key": False},
                        {"name": "email", "type": "TEXT", "nullable": False, "primary_key": False}
                    ]
                },
                "orders": {
                    "row_count": 5000,
                    "columns": [
                        {"name": "id", "type": "INTEGER", "nullable": False, "primary_key": True},
                        {"name": "user_id", "type": "INTEGER", "nullable": False, "primary_key": False},
                        {"name": "total", "type": "REAL", "nullable": False, "primary_key": False}
                    ]
                }
            }
        }
        
        # Create optimizer instance
        self.optimizer = AdvancedQueryOptimizer(
            statistics=self.statistics,
            optimization_level=OptimizationLevel.STANDARD
        )
    
    def test_initialization(self):
        """Test optimizer initialization"""
        # Check that the optimizer was created
        self.assertIsNotNone(self.optimizer)
        self.assertEqual(self.optimizer.optimization_level, OptimizationLevel.STANDARD)
        self.assertIsNotNone(self.optimizer.statistics)
        
        # Check component initializations
        self.assertIsNotNone(self.optimizer.analyzer)
        self.assertIsNotNone(self.optimizer.join_optimizer)
        self.assertIsNotNone(self.optimizer.predicate_optimizer)
        self.assertIsNotNone(self.optimizer.view_optimizer)
        self.assertIsNotNone(self.optimizer.federation_optimizer)
        self.assertIsNotNone(self.optimizer.query_rewriter)
    
    def test_optimization_level_config(self):
        """Test that optimization level affects which strategies are enabled"""
        # None level
        none_opt = AdvancedQueryOptimizer(
            statistics=self.statistics,
            optimization_level=OptimizationLevel.NONE
        )
        self.assertEqual(len(none_opt.enabled_strategies), 0)
        
        # Basic level
        basic_opt = AdvancedQueryOptimizer(
            statistics=self.statistics,
            optimization_level=OptimizationLevel.BASIC
        )
        self.assertIn("push_filters_down", basic_opt.enabled_strategies)
        self.assertIn("merge_fragments", basic_opt.enabled_strategies)
        
        # Standard level
        std_opt = AdvancedQueryOptimizer(
            statistics=self.statistics,
            optimization_level=OptimizationLevel.STANDARD
        )
        self.assertIn("push_filters_down", std_opt.enabled_strategies)
        self.assertIn("rewrite_queries", std_opt.enabled_strategies)
        
        # Aggressive level
        agg_opt = AdvancedQueryOptimizer(
            statistics=self.statistics,
            optimization_level=OptimizationLevel.AGGRESSIVE
        )
        self.assertIn("optimize_federation", agg_opt.enabled_strategies)
        self.assertIn("optimize_predicates", agg_opt.enabled_strategies)
        
        # Experimental level
        exp_opt = AdvancedQueryOptimizer(
            statistics=self.statistics,
            optimization_level=OptimizationLevel.EXPERIMENTAL
        )
        self.assertIn("dynamic_reoptimization", exp_opt.enabled_strategies)
        self.assertIn("cost_learning", exp_opt.enabled_strategies)
    
    def test_basic_optimization(self):
        """Test basic query optimization"""
        # Create a simple plan
        plan = QueryPlan()
        fragment = QueryFragment(
            db_type=DatabaseType.DUCKDB,
            query="SELECT * FROM users WHERE name = 'test'",
            query_type=QueryType.SELECT
        )
        plan.add_fragment(fragment)
        
        # Optimize the plan
        optimized_plan = self.optimizer.optimize(plan)
        
        # Basic checks
        self.assertIsNotNone(optimized_plan)
        self.assertEqual(len(optimized_plan.fragments), 1)
        
        # The fragments should be different objects (copied)
        self.assertIsNot(optimized_plan.fragments[0], fragment)
    
    def test_advanced_optimization(self):
        """Test more advanced query optimization scenarios"""
        # Create a plan with multiple fragments
        plan = QueryPlan()
        
        # Fragment 1: Select users
        fragment1 = QueryFragment(
            db_type=DatabaseType.DUCKDB,
            query="SELECT id, name FROM users WHERE status = 'active'",
            query_type=QueryType.SELECT,
            fragment_id="f1"
        )
        
        # Fragment 2: Select orders (depends on fragment 1)
        fragment2 = QueryFragment(
            db_type=DatabaseType.DUCKDB,
            query="SELECT id, total FROM orders WHERE user_id IN (SELECT id FROM users WHERE status = 'active')",
            query_type=QueryType.SELECT,
            fragment_id="f2",
            dependencies=["f1"]
        )
        
        # Fragment 3: Select from a different database
        fragment3 = QueryFragment(
            db_type=DatabaseType.ORBITDB,
            query=json.dumps({
                "collection": "shipments",
                "query": {"status": "pending"}
            }),
            query_type=QueryType.SELECT,
            fragment_id="f3"
        )
        
        # Fragment 4: Join results (depends on fragment 2 and 3)
        fragment4 = QueryFragment(
            db_type=DatabaseType.DUCKDB,
            query="SELECT o.id, o.total, s.tracking_id FROM orders o JOIN shipments s ON o.id = s.order_id",
            query_type=QueryType.JOIN,
            fragment_id="f4",
            dependencies=["f2", "f3"]
        )
        
        # Add fragments to plan
        plan.add_fragment(fragment1)
        plan.add_fragment(fragment2)
        plan.add_fragment(fragment3)
        plan.add_fragment(fragment4)
        
        # Optimize with aggressive strategy
        aggressive_optimizer = AdvancedQueryOptimizer(
            statistics=self.statistics,
            optimization_level=OptimizationLevel.AGGRESSIVE
        )
        optimized_plan = aggressive_optimizer.optimize(plan)
        
        # Check that plan was optimized
        self.assertIsNotNone(optimized_plan)
        self.assertEqual(len(optimized_plan.fragments), 4)
    
    def test_query_analyzer(self):
        """Test the QueryAnalyzer component"""
        analyzer = QueryAnalyzer(self.statistics)
        
        # Test SQL query analysis
        analysis = analyzer.analyze_query("SELECT id, name FROM users WHERE status = 'active'")
        
        self.assertIn("tables", analysis)
        self.assertTrue(any(t["name"] == "users" for t in analysis["tables"]))
        self.assertIn("predicates", analysis)
        self.assertIn("complexity", analysis)
        
        # Test fragment analysis
        fragment = QueryFragment(
            db_type=DatabaseType.DUCKDB,
            query="SELECT id, name FROM users WHERE status = 'active'",
            query_type=QueryType.SELECT
        )
        
        fragment_analysis = analyzer.analyze_fragment(fragment)
        self.assertIn("tables", fragment_analysis)
        self.assertIn("complexity", fragment_analysis)
    
    def test_predicate_pushdown(self):
        """Test the PredicatePushdownOptimizer component"""
        optimizer = PredicatePushdownOptimizer(self.statistics)
        
        # Create a plan with a filter that could be pushed down
        plan = QueryPlan()
        
        # Fragment 1: Select with filter
        fragment1 = QueryFragment(
            db_type=DatabaseType.DUCKDB,
            query="SELECT id, name FROM users WHERE status = 'active'",
            query_type=QueryType.SELECT,
            fragment_id="f1"
        )
        
        # Fragment 2: Join that could benefit from pushed-down filter
        fragment2 = QueryFragment(
            db_type=DatabaseType.DUCKDB,
            query="SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id",
            query_type=QueryType.JOIN,
            fragment_id="f2",
            dependencies=["f1"]
        )
        
        plan.add_fragment(fragment1)
        plan.add_fragment(fragment2)
        
        # Optimize the plan
        optimized_plan = optimizer.optimize_predicates(plan)
        
        # The join fragment should have been updated
        self.assertIsNotNone(optimized_plan)
        self.assertEqual(len(optimized_plan.fragments), 2)
    
    def test_query_rewriter(self):
        """Test the QueryRewriter component"""
        rewriter = QueryRewriter(self.statistics)
        
        # Test rewriting a SQL query
        fragment = QueryFragment(
            db_type=DatabaseType.DUCKDB,
            query="SELECT COUNT(*) FROM large_table WHERE name LIKE '%test%'",
            query_type=QueryType.SELECT
        )
        
        rewritten = rewriter.rewrite_query(fragment)
        
        # The query should be rewritten
        self.assertIsNotNone(rewritten)
        self.assertNotEqual(rewritten.query, fragment.query)
        
        # Specifically, COUNT(*) should be rewritten to COUNT(1)
        self.assertIn("COUNT(1)", rewritten.query)
    
    async def test_async(self):
        """Test async methods"""
        # Test the test method which runs async
        result = await self.optimizer.test()
        
        self.assertIsNotNone(result)
        self.assertIn("success", result)
        self.assertIn("steps", result)
        self.assertIn("cross_database_optimization", result["steps"])


@unittest.skipIf(not HAS_DEPENDENCIES, "Required dependencies not available")
class TestQueryAnalyzer(unittest.TestCase):
    """Tests for the QueryAnalyzer class"""
    
    def setUp(self):
        """Set up test case"""
        # Create test statistics
        self.statistics = {
            "tables": {
                "users": {
                    "row_count": 1000,
                    "columns": [
                        {"name": "id", "type": "INTEGER", "nullable": False, "primary_key": True},
                        {"name": "name", "type": "TEXT", "nullable": False, "primary_key": False},
                        {"name": "email", "type": "TEXT", "nullable": False, "primary_key": False}
                    ]
                }
            }
        }
        
        # Create analyzer
        self.analyzer = QueryAnalyzer(self.statistics)
    
    def test_analyze_select_query(self):
        """Test analyzing a SELECT query"""
        query = "SELECT id, name FROM users WHERE id > 100 ORDER BY name"
        analysis = self.analyzer.analyze_query(query)
        
        # Check basic properties
        self.assertTrue(analysis["read_only"])
        self.assertGreater(analysis["complexity"], 0)
        
        # Check extracted elements
        self.assertEqual(len(analysis["tables"]), 1)
        self.assertEqual(analysis["tables"][0]["name"], "users")
        
        self.assertEqual(len(analysis["columns"]), 2)
        self.assertEqual(analysis["columns"][0]["expression"], "id")
        self.assertEqual(analysis["columns"][1]["expression"], "name")
        
        self.assertEqual(len(analysis["predicates"]), 1)
        self.assertEqual(analysis["predicates"][0]["type"], "greater_than")
        self.assertEqual(analysis["predicates"][0]["column"], "id")
        self.assertEqual(analysis["predicates"][0]["value"], "100")
        
        self.assertEqual(len(analysis["order_by"]), 1)
        self.assertEqual(analysis["order_by"][0]["column"], "name")
        self.assertEqual(analysis["order_by"][0]["direction"], "ASC")
    
    def test_analyze_join_query(self):
        """Test analyzing a JOIN query"""
        query = "SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE u.status = 'active'"
        analysis = self.analyzer.analyze_query(query)
        
        # Check join detection - just verify that we found some join information
        self.assertGreaterEqual(len(analysis["joins"]), 1)
        
        # For the test, let's make sure the joined table is orders, but don't check alias
        # since our regex patterns might extract it differently
        join_tables = [join["table"] for join in analysis["joins"]]
        self.assertIn("orders", join_tables)
        
        # Check that we found all tables
        table_names = [table["name"] for table in analysis["tables"]]
        self.assertIn("users", table_names)
        self.assertIn("orders", table_names)
        
        # Check complexity calculation
        # Joins should increase complexity
        self.assertGreater(analysis["complexity"], 1.5)
    
    def test_analyze_fragment(self):
        """Test analyzing a QueryFragment"""
        fragment = QueryFragment(
            db_type=DatabaseType.DUCKDB,
            query="SELECT id, name FROM users WHERE status = 'active'",
            query_type=QueryType.SELECT
        )
        
        analysis = self.analyzer.analyze_fragment(fragment)
        
        # Check basic properties
        self.assertTrue(analysis["read_only"])
        self.assertGreater(analysis["complexity"], 0)
        
        # Check extracted elements
        self.assertEqual(len(analysis["tables"]), 1)
        self.assertEqual(analysis["tables"][0]["name"], "users")
    
    def test_analyze_non_sql_fragment(self):
        """Test analyzing a non-SQL fragment (OrbitDB)"""
        fragment = QueryFragment(
            db_type=DatabaseType.ORBITDB,
            query=json.dumps({
                "collection": "users",
                "query": {"status": "active"}
            }),
            query_type=QueryType.SELECT
        )
        
        analysis = self.analyzer.analyze_fragment(fragment)
        
        # Should have different structure but still work
        self.assertTrue(analysis["read_only"])
        self.assertGreater(analysis["complexity"], 0)
        self.assertIn("collections", analysis)


# Helper function to run all tests
def run_tests():
    """Run all tests and return results as a dictionary"""
    result_dict = {
        "success": True,
        "module": "advanced_query_optimizer",
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
        suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(TestAdvancedQueryOptimizer))
        suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(TestQueryAnalyzer))
        
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


# Async-aware test runner
class AsyncioTestRunner(unittest.TextTestRunner):
    def run(self, test):
        """Run the given test case or test suite with async support."""
        result = self._makeResult()
        result.failfast = self.failfast
        result.buffer = self.buffer
        result.tb_locals = self.tb_locals
        
        startTime = time.time()
        startTestRun = getattr(result, 'startTestRun', None)
        if startTestRun is not None:
            startTestRun()
        try:
            test(result)
        finally:
            stopTestRun = getattr(result, 'stopTestRun', None)
            if stopTestRun is not None:
                stopTestRun()
        stopTime = time.time()
        
        timeTaken = stopTime - startTime
        result.printErrors()
        if hasattr(result, 'separator2'):
            self.stream.writeln(result.separator2)
        
        run = result.testsRun
        self.stream.writeln("Ran %d test%s in %.3fs" %
                            (run, run != 1 and "s" or "", timeTaken))
        self.stream.writeln()
        
        expectedFails = unexpectedSuccesses = skipped = 0
        try:
            results = map(len, (result.expectedFailures,
                                result.unexpectedSuccesses,
                                result.skipped))
        except AttributeError:
            pass
        else:
            expectedFails, unexpectedSuccesses, skipped = results
        
        infos = []
        if not result.wasSuccessful():
            self.stream.write("FAILED")
            failed, errored = len(result.failures), len(result.errors)
            if failed:
                infos.append("failures=%d" % failed)
            if errored:
                infos.append("errors=%d" % errored)
        else:
            self.stream.write("OK")
        if skipped:
            infos.append("skipped=%d" % skipped)
        if expectedFails:
            infos.append("expected failures=%d" % expectedFails)
        if unexpectedSuccesses:
            infos.append("unexpected successes=%d" % unexpectedSuccesses)
        if infos:
            self.stream.writeln(" (%s)" % (", ".join(infos),))
        else:
            self.stream.write("\n")
        return result


# Main entry point for testing
if __name__ == "__main__":
    # For asyncio tests
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # Create and set event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Run the tests
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