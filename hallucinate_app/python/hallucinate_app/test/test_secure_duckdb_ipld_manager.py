"""
Test for Secure DuckDB-IPLD Manager Module

Tests capability-based security for DuckDB-IPLD operations.
"""

import os
import sys
import json
import unittest
import asyncio
from datetime import datetime
import tempfile

# Adjust path to include parent directory for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from hallucinate_app.auth import AuthManager
from hallucinate_app.secure_duckdb_ipld_manager import (
    SecureDuckDBIPLDManager, 
    DuckDBIPLDKit, 
    DUCKDB_IPLD_CAPABILITIES
)

class TestSecureDuckDBIPLDManager(unittest.TestCase):
    """Test case for SecureDuckDBIPLDManager"""

    def setUp(self):
        """Set up test fixtures"""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Create auth manager and secure DuckDB manager
        self.auth_manager = AuthManager()
        self.duckdb_kit = DuckDBIPLDKit()
        
        self.duckdb_manager = SecureDuckDBIPLDManager({
            "auth": self.auth_manager,
            "duckdb": self.duckdb_kit
        })
        
        # Initialize managers
        self.loop.run_until_complete(self.auth_manager.init())
        self.loop.run_until_complete(self.duckdb_manager.init())
        
        # Create test user and issue capabilities
        self.loop.run_until_complete(self.auth_manager.create_principal("test-user"))
        
        # Issue admin capability
        self.admin_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", "test-user", {
                "can": DUCKDB_IPLD_CAPABILITIES["ADMIN"],
                "with": "*"
            })
        )
        
        # Issue execute capability
        self.execute_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", "test-user", {
                "can": DUCKDB_IPLD_CAPABILITIES["EXECUTE"],
                "with": "*"
            })
        )
        
        # Issue read capability
        self.read_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", "test-user", {
                "can": DUCKDB_IPLD_CAPABILITIES["READ"],
                "with": "*"
            })
        )
        
        # Issue write capability
        self.write_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", "test-user", {
                "can": DUCKDB_IPLD_CAPABILITIES["WRITE"],
                "with": "*"
            })
        )
        
        # Issue create capability
        self.create_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", "test-user", {
                "can": DUCKDB_IPLD_CAPABILITIES["CREATE"],
                "with": "*"
            })
        )
        
        # Issue export capabilities
        self.export_ipld_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", "test-user", {
                "can": DUCKDB_IPLD_CAPABILITIES["EXPORT_IPLD"],
                "with": "*"
            })
        )
        
        self.export_parquet_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", "test-user", {
                "can": DUCKDB_IPLD_CAPABILITIES["EXPORT_PARQUET"],
                "with": "*"
            })
        )
        
        self.export_arrow_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", "test-user", {
                "can": DUCKDB_IPLD_CAPABILITIES["EXPORT_ARROW"],
                "with": "*"
            })
        )
        
        # Issue import capability
        self.import_ipld_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", "test-user", {
                "can": DUCKDB_IPLD_CAPABILITIES["IMPORT_IPLD"],
                "with": "*"
            })
        )
        
        # Test table name
        self.test_table_name = f"test_table_{int(datetime.now().timestamp())}"

    def tearDown(self):
        """Tear down test fixtures"""
        # Close the event loop
        self.loop.close()
    
    def test_001_initialization(self):
        """Test initialization of secure DuckDB manager"""
        self.assertTrue(self.duckdb_manager.initialized)
    
    def test_002_execute_without_auth(self):
        """Test executing SQL without auth token"""
        with self.assertRaises(Exception):
            self.loop.run_until_complete(
                self.duckdb_manager.execute("SELECT 1", [])
            )
    
    def test_003_execute_with_invalid_auth(self):
        """Test executing SQL with invalid auth token"""
        with self.assertRaises(Exception):
            self.loop.run_until_complete(
                self.duckdb_manager.execute("SELECT 1", [], {"auth_token": "invalid-token"})
            )
    
    def test_004_create_table(self):
        """Test creating a table with valid auth token"""
        result = self.loop.run_until_complete(
            self.duckdb_manager.execute(
                f"CREATE TABLE {self.test_table_name} (id INTEGER, value VARCHAR)",
                [],
                {"auth_token": self.create_token["token"]}
            )
        )
        self.assertTrue(result["success"])
        
        # Check stats
        self.assertEqual(self.duckdb_manager.stats["tables_created"], 1)
        self.assertEqual(self.duckdb_manager.stats["queries_executed"], 1)
    
    def test_005_insert_data(self):
        """Test inserting data with valid auth token"""
        # First create the table
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                f"CREATE TABLE test_insert (id INTEGER, value VARCHAR)",
                [],
                {"auth_token": self.create_token["token"]}
            )
        )
        
        # Then insert data
        result = self.loop.run_until_complete(
            self.duckdb_manager.execute(
                "INSERT INTO test_insert VALUES (1, 'test value')",
                [],
                {"auth_token": self.write_token["token"]}
            )
        )
        self.assertTrue(result["success"])
        
        # Check stats
        self.assertTrue(self.duckdb_manager.stats["table_writes"] > 0)
    
    def test_006_select_data(self):
        """Test selecting data with valid auth token"""
        # First create the table and insert data
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                f"CREATE TABLE test_select (id INTEGER, value VARCHAR)",
                [],
                {"auth_token": self.create_token["token"]}
            )
        )
        
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                "INSERT INTO test_select VALUES (1, 'test value')",
                [],
                {"auth_token": self.write_token["token"]}
            )
        )
        
        # Then select data
        result = self.loop.run_until_complete(
            self.duckdb_manager.execute(
                "SELECT * FROM test_select",
                [],
                {"auth_token": self.read_token["token"]}
            )
        )
        self.assertTrue(result["success"])
        self.assertTrue(len(result["rows"]) > 0)
        
        # Check stats
        self.assertTrue(self.duckdb_manager.stats["table_reads"] > 0)
    
    def test_007_ipld_export(self):
        """Test exporting table to IPLD with valid auth token"""
        # First create the table and insert data
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                f"CREATE TABLE test_ipld_export (id INTEGER, value VARCHAR)",
                [],
                {"auth_token": self.create_token["token"]}
            )
        )
        
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                "INSERT INTO test_ipld_export VALUES (1, 'test value')",
                [],
                {"auth_token": self.write_token["token"]}
            )
        )
        
        # Export to IPLD
        result = self.loop.run_until_complete(
            self.duckdb_manager.export_table_to_ipld(
                "test_ipld_export",
                {"auth_token": self.export_ipld_token["token"]}
            )
        )
        self.assertTrue(result["success"])
        self.assertIsNotNone(result["cid"])
        
        # Check stats
        self.assertEqual(self.duckdb_manager.stats["ipld_exports"], 1)
    
    def test_008_ipld_import(self):
        """Test importing table from IPLD with valid auth token"""
        # First export a table to IPLD
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                f"CREATE TABLE test_ipld_export_import (id INTEGER, value VARCHAR)",
                [],
                {"auth_token": self.create_token["token"]}
            )
        )
        
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                "INSERT INTO test_ipld_export_import VALUES (1, 'test value')",
                [],
                {"auth_token": self.write_token["token"]}
            )
        )
        
        ipld_result = self.loop.run_until_complete(
            self.duckdb_manager.export_table_to_ipld(
                "test_ipld_export_import",
                {"auth_token": self.export_ipld_token["token"]}
            )
        )
        
        # Import from IPLD
        import_result = self.loop.run_until_complete(
            self.duckdb_manager.import_table_from_ipld(
                ipld_result["ipld"],
                "test_ipld_imported",
                {"auth_token": self.import_ipld_token["token"]}
            )
        )
        self.assertTrue(import_result["success"])
        
        # Check stats
        self.assertEqual(self.duckdb_manager.stats["ipld_imports"], 1)
    
    def test_009_parquet_export(self):
        """Test exporting table to Parquet with valid auth token"""
        # First create the table and insert data
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                f"CREATE TABLE test_parquet_export (id INTEGER, value VARCHAR)",
                [],
                {"auth_token": self.create_token["token"]}
            )
        )
        
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                "INSERT INTO test_parquet_export VALUES (1, 'test value')",
                [],
                {"auth_token": self.write_token["token"]}
            )
        )
        
        # Create a temporary file for export
        with tempfile.NamedTemporaryFile(suffix=".parquet") as temp_file:
            # Export to Parquet
            result = self.loop.run_until_complete(
                self.duckdb_manager.export_table_to_parquet(
                    "test_parquet_export",
                    temp_file.name,
                    {"auth_token": self.export_parquet_token["token"]}
                )
            )
            self.assertTrue(result["success"])
        
        # Check stats
        self.assertEqual(self.duckdb_manager.stats["parquet_exports"], 1)
    
    def test_010_arrow_export(self):
        """Test exporting table to Arrow with valid auth token"""
        # First create the table and insert data
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                f"CREATE TABLE test_arrow_export (id INTEGER, value VARCHAR)",
                [],
                {"auth_token": self.create_token["token"]}
            )
        )
        
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                "INSERT INTO test_arrow_export VALUES (1, 'test value')",
                [],
                {"auth_token": self.write_token["token"]}
            )
        )
        
        # Export to Arrow
        result = self.loop.run_until_complete(
            self.duckdb_manager.export_table_to_arrow(
                "test_arrow_export",
                {"auth_token": self.export_arrow_token["token"]}
            )
        )
        self.assertTrue(result["success"])
        self.assertIsNotNone(result["buffer"])
        
        # Check stats
        self.assertEqual(self.duckdb_manager.stats["arrow_exports"], 1)
    
    def test_011_database_export(self):
        """Test exporting entire database to IPLD with valid auth token"""
        # Export database to IPLD
        result = self.loop.run_until_complete(
            self.duckdb_manager.export_database_to_ipld(
                {"auth_token": self.export_ipld_token["token"]}
            )
        )
        self.assertTrue(result["success"])
        self.assertIsNotNone(result["cid"])
    
    def test_012_get_stats(self):
        """Test getting module statistics with admin token"""
        stats = self.loop.run_until_complete(
            self.duckdb_manager.get_stats(
                {"auth_token": self.admin_token["token"]}
            )
        )
        
        # Check basic stats
        self.assertIn("queries_executed", stats)
        self.assertIn("tables_created", stats)
        self.assertIn("table_reads", stats)
        self.assertIn("table_writes", stats)
        self.assertIn("ipld_exports", stats)
        self.assertIn("resource_usage", stats)
    
    def test_013_capability_restrictions(self):
        """Test that capabilities properly restrict operations"""
        # Create a specific table capability
        specific_read_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", "test-user", {
                "can": DUCKDB_IPLD_CAPABILITIES["READ"],
                "with": "specific_table"
            })
        )
        
        # Create the specific table
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                "CREATE TABLE specific_table (id INTEGER, value VARCHAR)",
                [],
                {"auth_token": self.create_token["token"]}
            )
        )
        
        # Create another table
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                "CREATE TABLE other_table (id INTEGER, value VARCHAR)",
                [],
                {"auth_token": self.create_token["token"]}
            )
        )
        
        # Should be able to read specific_table
        result = self.loop.run_until_complete(
            self.duckdb_manager.execute(
                "SELECT * FROM specific_table",
                [],
                {"auth_token": specific_read_token["token"]}
            )
        )
        self.assertTrue(result["success"])
        
        # Should NOT be able to read other_table
        with self.assertRaises(Exception):
            self.loop.run_until_complete(
                self.duckdb_manager.execute(
                    "SELECT * FROM other_table",
                    [],
                    {"auth_token": specific_read_token["token"]}
                )
            )
    
    def test_014_resource_usage_tracking(self):
        """Test resource usage tracking"""
        # Create a table and perform operations
        table_name = "resource_tracking_table"
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                f"CREATE TABLE {table_name} (id INTEGER, value VARCHAR)",
                [],
                {"auth_token": self.create_token["token"], "user_id": "test-user"}
            )
        )
        
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                f"INSERT INTO {table_name} VALUES (1, 'test value')",
                [],
                {"auth_token": self.write_token["token"], "user_id": "test-user"}
            )
        )
        
        self.loop.run_until_complete(
            self.duckdb_manager.execute(
                f"SELECT * FROM {table_name}",
                [],
                {"auth_token": self.read_token["token"], "user_id": "test-user"}
            )
        )
        
        # Check resource usage tracking
        self.assertIn(table_name, self.duckdb_manager.resource_usage["by_table"])
        self.assertIn("test-user", self.duckdb_manager.resource_usage["by_user"])
        
        # Check operations are tracked
        table_stats = self.duckdb_manager.resource_usage["by_table"][table_name]
        self.assertEqual(table_stats["creates"], 1)
        self.assertGreaterEqual(table_stats["writes"], 1)
        self.assertGreaterEqual(table_stats["reads"], 1)
        
        # Check user tracking
        user_stats = self.duckdb_manager.resource_usage["by_user"]["test-user"]
        self.assertIn(table_name, user_stats["tables"])
        self.assertGreaterEqual(user_stats["creates"], 1)
        self.assertGreaterEqual(user_stats["writes"], 1)
        self.assertGreaterEqual(user_stats["reads"], 1)
    
    def test_015_self_test_method(self):
        """Test the built-in test method"""
        test_results = self.loop.run_until_complete(self.duckdb_manager.test())
        self.assertTrue(test_results["initialization"])
        self.assertTrue(test_results["capability_verification"])
        self.assertTrue(test_results["sql_operations"]["execute"])
        
        # Check that all data operations pass
        for op_name, op_result in test_results["data_operations"].items():
            self.assertTrue(op_result, f"Data operation {op_name} failed")
        
        # Check overall success
        self.assertTrue(test_results["success"])


def run_tests():
    """Run the tests and return results as JSON"""
    # Create a test suite
    suite = unittest.TestLoader().loadTestsFromTestCase(TestSecureDuckDBIPLDManager)
    
    # Run the tests
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    
    # Format results as JSON
    test_results = {
        "success": result.wasSuccessful(),
        "total": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "module": "secure_duckdb_ipld_manager"
    }
    
    # Add failure details if any
    if not result.wasSuccessful():
        test_results["failure_details"] = []
        for failure in result.failures:
            test_results["failure_details"].append({
                "test": str(failure[0]),
                "message": str(failure[1])
            })
        for error in result.errors:
            test_results["failure_details"].append({
                "test": str(error[0]),
                "message": str(error[1])
            })
    
    # Return results
    return json.dumps(test_results, indent=2)


if __name__ == "__main__":
    """Main entry point for testing"""
    result_json = run_tests()
    print(result_json)
    
    # For CI/CD, return exit code
    if json.loads(result_json)["success"]:
        sys.exit(0)
    else:
        sys.exit(1)