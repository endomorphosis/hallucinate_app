#!/usr/bin/env python3
"""
Test Secure DuckDB IPLD Manager

This file contains comprehensive tests for the secure_duckdb_ipld_manager module, 
which provides capability-based secure access to DuckDB-IPLD operations.
"""

import os
import sys
import json
import time
import unittest
import asyncio
from datetime import datetime
from unittest.mock import MagicMock, patch

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../hallucinate_app/python')))

# Import the module to test
try:
    from hallucinate_app.secure_duckdb_ipld_manager import (
        SecureDuckDBIPLDManager, 
        DUCKDB_IPLD_CAPABILITIES
    )
    from hallucinate_app.duckdb_ipld_kit import DuckDBIPLDKit
    from hallucinate_app.auth import AuthManager
    MODULE_AVAILABLE = True
except ImportError as e:
    print(f"Could not import secure_duckdb_ipld_manager module: {e}")
    MODULE_AVAILABLE = False

# Create mock of DuckDBIPLDKit for testing
class MockDuckDBIPLDKit:
    """Mock of DuckDBIPLDKit for testing"""
    
    def __init__(self, resources=None, metadata=None):
        self.resources = resources or {}
        self.metadata = metadata or {}
        self.initialized = False
        self.tables = set()
        self.statements = {}
        self.stats = {
            "queries_executed": 0,
            "tables_created": 0,
            "tables_exported": 0,
            "tables_imported": 0,
            "ipld_conversions": 0,
            "parquet_exports": 0,
            "arrow_buffers": 0,
            "last_operation": None,
            "last_operation_time": None
        }
    
    async def init(self):
        """Initialize the DuckDB-IPLD kit"""
        self.initialized = True
        return True
    
    async def execute(self, sql, params=None):
        """Execute a SQL query"""
        params = params or []
        self.stats["queries_executed"] += 1
        
        # Check for CREATE TABLE statement
        if sql.upper().startswith("CREATE TABLE"):
            table_name_match = sql.upper().split("CREATE TABLE ")[1].split(" ")[0]
            if table_name_match:
                self.tables.add(table_name_match)
                self.stats["tables_created"] += 1
        
        # Mock response based on query type
        if sql.upper().startswith("SELECT"):
            return {
                "success": True,
                "rows": [{"id": 1, "value": "test"}],
                "row_count": 1,
                "sql": sql,
                "mock": True
            }
        elif sql.upper().startswith("INSERT"):
            return {
                "success": True,
                "rows_affected": 1,
                "sql": sql,
                "mock": True
            }
        else:
            return {
                "success": True,
                "sql": sql,
                "mock": True
            }
    
    async def export_table_to_ipld(self, table_name):
        """Export a table to IPLD format"""
        self.stats["tables_exported"] += 1
        self.stats["ipld_conversions"] += 1
        
        # Generate a mock CID
        import random
        import string
        mock_cid = f"bafybeig{''.join(random.choices(string.ascii_lowercase + string.digits, k=40))}"
        
        return {
            "cid": mock_cid,
            "ipld": {
                "table": table_name,
                "schema": {
                    "fields": [
                        {"name": "id", "type": "INTEGER"},
                        {"name": "value", "type": "VARCHAR"}
                    ]
                },
                "data": [
                    {"id": 1, "value": "Sample 1"},
                    {"id": 2, "value": "Sample 2"}
                ]
            },
            "success": True,
            "mock": True
        }
    
    async def import_table_from_ipld(self, ipld_data, target_table_name=None):
        """Import a table from IPLD format"""
        table_name = target_table_name or (ipld_data.get("table") if isinstance(ipld_data, dict) else "imported_table")
        self.stats["tables_imported"] += 1
        self.stats["ipld_conversions"] += 1
        self.tables.add(table_name)
        
        return {
            "table_name": table_name,
            "rows_imported": 2,
            "success": True,
            "mock": True
        }
    
    async def export_table_to_parquet(self, table_name, output_path):
        """Export a table to Parquet format"""
        self.stats["tables_exported"] += 1
        self.stats["parquet_exports"] += 1
        
        return {
            "table_name": table_name,
            "output_path": output_path,
            "rows_exported": 10,
            "success": True,
            "mock": True
        }
    
    async def export_table_to_arrow(self, table_name):
        """Export a table to Arrow format"""
        self.stats["tables_exported"] += 1
        self.stats["arrow_buffers"] += 1
        
        # Mock Arrow buffer
        import io
        buffer = io.BytesIO(f"Mock Arrow Buffer for {table_name}".encode())
        
        return {
            "table_name": table_name,
            "schema": {
                "fields": [
                    {"name": "id", "type": "int32"},
                    {"name": "value", "type": "utf8"}
                ]
            },
            "record_count": 10,
            "buffer": buffer,
            "success": True,
            "mock": True
        }
    
    async def export_database_to_ipld(self):
        """Export the entire database to IPLD format"""
        self.stats["ipld_conversions"] += 1
        
        # Generate a mock CID
        import random
        import string
        mock_cid = f"bafybeig{''.join(random.choices(string.ascii_lowercase + string.digits, k=40))}"
        
        return {
            "cid": mock_cid,
            "table_count": len(self.tables),
            "success": True,
            "mock": True
        }
    
    async def close(self):
        """Close the database connection"""
        self.initialized = False
        return True
    
    def get_stats(self):
        """Get current statistics"""
        return {
            **self.stats,
            "table_count": len(self.tables),
            "statement_count": len(self.statements),
            "mock": True
        }

# Create mock auth manager for testing
class MockAuthManager:
    """Mock auth manager for testing"""
    
    def __init__(self, *args, **kwargs):
        self.initialized = False
        self.principals = {}
        self.capabilities = {}
        self.tokens = {}
    
    async def init(self):
        """Initialize the auth manager"""
        self.initialized = True
        self.principals["root"] = {"id": "root", "type": "admin"}
        self.principals["test-user"] = {"id": "test-user", "type": "user"}
        return True
    
    async def create_principal(self, principal_id, metadata=None):
        """Create a new principal"""
        metadata = metadata or {}
        self.principals[principal_id] = {"id": principal_id, **metadata}
        return {"success": True, "principal_id": principal_id}
    
    async def issue_capability(self, issuer, subject, capability_claim):
        """Issue a capability"""
        cap_id = f"cap-{int(time.time())}-{hash(json.dumps(capability_claim))}"
        self.capabilities[cap_id] = {
            "id": cap_id,
            "issuer": issuer,
            "subject": subject,
            "claim": capability_claim,
            "issued": datetime.now().isoformat(),
            "expires": datetime.now().timestamp() + 3600  # 1 hour
        }
        
        # Create token
        token_id = f"token-{int(time.time())}"
        self.tokens[token_id] = {
            "id": token_id,
            "issuer": issuer,
            "subject": subject,
            "capabilities": [cap_id],
            "issued": datetime.now().isoformat()
        }
        
        return {"success": True, "capability": self.capabilities[cap_id], "token": token_id}
    
    async def verify_capability(self, token, capability_string):
        """Verify a capability"""
        
        # Extract capability string components
        parts = capability_string.split(":")
        if len(parts) < 2:
            return False
        
        cap_type = parts[0]
        resource = ":".join(parts[1:])
        
        # Check for admin capability
        if capability_string == f"{DUCKDB_IPLD_CAPABILITIES['ADMIN']}:*":
            return True
            
        # Hard-coded verification for testing
        return capability_string in [
            f"{DUCKDB_IPLD_CAPABILITIES['EXECUTE']}:*",
            f"{DUCKDB_IPLD_CAPABILITIES['CREATE']}:*",
            f"{DUCKDB_IPLD_CAPABILITIES['READ']}:*",
            f"{DUCKDB_IPLD_CAPABILITIES['WRITE']}:*",
            f"{DUCKDB_IPLD_CAPABILITIES['EXPORT_IPLD']}:*",
            f"{DUCKDB_IPLD_CAPABILITIES['IMPORT_IPLD']}:*",
            f"{DUCKDB_IPLD_CAPABILITIES['EXPORT_PARQUET']}:*",
            f"{DUCKDB_IPLD_CAPABILITIES['EXPORT_ARROW']}:*",
            f"{DUCKDB_IPLD_CAPABILITIES['ADMIN']}:stats"
        ]

@unittest.skipIf(not MODULE_AVAILABLE, "Secure DuckDB IPLD Manager module not available")
class TestSecureDuckDBIPLDManager(unittest.TestCase):
    """Test cases for the secure_duckdb_ipld_manager module"""
    
    def setUp(self):
        """Set up the test case"""
        # Create mock resources
        self.mock_resources = {
            "auth": MockAuthManager(),
            "duckdb": MockDuckDBIPLDKit()
        }
        
        # Create the manager with mock resources
        self.manager = SecureDuckDBIPLDManager(resources=self.mock_resources)
        
        # Initialize auth tokens
        self.admin_token = "admin-token"
        self.execute_token = "execute-token"
        self.read_token = "read-token"
        self.write_token = "write-token"
        self.export_ipld_token = "export-ipld-token"
        self.import_ipld_token = "import-ipld-token"
        self.export_parquet_token = "export-parquet-token"
        self.export_arrow_token = "export-arrow-token"
        
        # Set up event loop for async tests
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
    
    def tearDown(self):
        """Clean up after the test case"""
        self.loop.close()
    
    def test_initialization(self):
        """Test module initialization"""
        # Initialize the manager
        result = self.loop.run_until_complete(self.manager.init())
        
        # Check initialization
        self.assertTrue(result, "Manager should initialize successfully")
        self.assertTrue(self.manager.initialized, "Manager should be marked as initialized")
    
    def test_execute_with_valid_token(self):
        """Test SQL execution with valid token"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Patch verify_capability to return True for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Execute a query
            result = self.loop.run_until_complete(
                self.manager.execute(
                    "SELECT * FROM test_table",
                    [],
                    {"auth_token": self.read_token}
                )
            )
            
            # Check result
            self.assertTrue(result["success"], "Query should execute successfully")
            self.assertEqual(1, result["row_count"], "Should return correct row count")
            self.assertEqual("test", result["rows"][0]["value"], "Should return correct value")
    
    def test_execute_without_token(self):
        """Test SQL execution without token"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Execute a query without token
        with self.assertRaises(Exception):
            self.loop.run_until_complete(
                self.manager.execute("SELECT * FROM test_table")
            )
    
    def test_execute_with_invalid_token(self):
        """Test SQL execution with invalid token"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Patch verify_capability to return False for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=False):
            # Execute a query with invalid token
            with self.assertRaises(Exception):
                self.loop.run_until_complete(
                    self.manager.execute(
                        "SELECT * FROM test_table",
                        [],
                        {"auth_token": "invalid-token"}
                    )
                )
    
    def test_create_table(self):
        """Test creating a table"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Patch verify_capability to return True for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Create a table
            result = self.loop.run_until_complete(
                self.manager.execute(
                    "CREATE TABLE test_create (id INTEGER, value VARCHAR)",
                    [],
                    {"auth_token": self.execute_token}
                )
            )
            
            # Check result
            self.assertTrue(result["success"], "Table creation should succeed")
            
            # Check stats
            stats = self.loop.run_until_complete(
                self.manager.get_stats({"auth_token": self.admin_token})
            )
            self.assertGreater(stats["queries_executed"], 0, "Should track query execution")
    
    def test_export_table_to_ipld(self):
        """Test exporting a table to IPLD"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Patch verify_capability to return True for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Export a table
            result = self.loop.run_until_complete(
                self.manager.export_table_to_ipld(
                    "test_table",
                    {"auth_token": self.export_ipld_token}
                )
            )
            
            # Check result
            self.assertTrue(result["success"], "Table export should succeed")
            self.assertIn("cid", result, "Should return a CID")
            
            # Check stats
            stats = self.loop.run_until_complete(
                self.manager.get_stats({"auth_token": self.admin_token})
            )
            self.assertGreater(stats["ipld_exports"], 0, "Should track IPLD exports")
    
    def test_import_table_from_ipld(self):
        """Test importing a table from IPLD"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Create mock IPLD data
        ipld_data = {
            "table": "test_table",
            "schema": {
                "fields": [
                    {"name": "id", "type": "INTEGER"},
                    {"name": "value", "type": "VARCHAR"}
                ]
            },
            "data": [
                {"id": 1, "value": "Sample 1"},
                {"id": 2, "value": "Sample 2"}
            ]
        }
        
        # Patch verify_capability to return True for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Import a table
            result = self.loop.run_until_complete(
                self.manager.import_table_from_ipld(
                    ipld_data,
                    "test_import",
                    {"auth_token": self.import_ipld_token}
                )
            )
            
            # Check result
            self.assertTrue(result["success"], "Table import should succeed")
            self.assertEqual("test_import", result["table_name"], "Should use provided table name")
            
            # Check stats
            stats = self.loop.run_until_complete(
                self.manager.get_stats({"auth_token": self.admin_token})
            )
            self.assertGreater(stats["ipld_imports"], 0, "Should track IPLD imports")
    
    def test_export_table_to_parquet(self):
        """Test exporting a table to Parquet"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Patch verify_capability to return True for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Export a table
            result = self.loop.run_until_complete(
                self.manager.export_table_to_parquet(
                    "test_table",
                    "/tmp/test_export.parquet",
                    {"auth_token": self.export_parquet_token}
                )
            )
            
            # Check result
            self.assertTrue(result["success"], "Table export should succeed")
            self.assertEqual("/tmp/test_export.parquet", result["output_path"], "Should use provided path")
            
            # Check stats
            stats = self.loop.run_until_complete(
                self.manager.get_stats({"auth_token": self.admin_token})
            )
            self.assertGreater(stats["parquet_exports"], 0, "Should track Parquet exports")
    
    def test_export_table_to_arrow(self):
        """Test exporting a table to Arrow"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Patch verify_capability to return True for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Export a table
            result = self.loop.run_until_complete(
                self.manager.export_table_to_arrow(
                    "test_table",
                    {"auth_token": self.export_arrow_token}
                )
            )
            
            # Check result
            self.assertTrue(result["success"], "Table export should succeed")
            self.assertIn("buffer", result, "Should return an Arrow buffer")
            
            # Check stats
            stats = self.loop.run_until_complete(
                self.manager.get_stats({"auth_token": self.admin_token})
            )
            self.assertGreater(stats["arrow_exports"], 0, "Should track Arrow exports")
    
    def test_export_database_to_ipld(self):
        """Test exporting the entire database to IPLD"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Patch verify_capability to return True for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Export database
            result = self.loop.run_until_complete(
                self.manager.export_database_to_ipld(
                    {"auth_token": self.admin_token}
                )
            )
            
            # Check result
            self.assertTrue(result["success"], "Database export should succeed")
            self.assertIn("cid", result, "Should return a CID")
            
            # Check stats
            stats = self.loop.run_until_complete(
                self.manager.get_stats({"auth_token": self.admin_token})
            )
            self.assertGreater(stats["ipld_exports"], 0, "Should track IPLD exports")
    
    def test_get_stats(self):
        """Test getting module statistics"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Patch verify_capability to return True for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Get stats
            stats = self.loop.run_until_complete(
                self.manager.get_stats({"auth_token": self.admin_token})
            )
            
            # Check stats fields
            self.assertIn("queries_executed", stats, "Should include queries_executed field")
            self.assertIn("access_granted", stats, "Should include access_granted field")
            self.assertIn("access_denied", stats, "Should include access_denied field")
            self.assertIn("ipld_exports", stats, "Should include ipld_exports field")
            self.assertIn("ipld_imports", stats, "Should include ipld_imports field")
            self.assertIn("resource_usage", stats, "Should include resource_usage field")
    
    def test_close(self):
        """Test closing the database connection"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Patch verify_capability to return True for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Close the connection
            result = self.loop.run_until_complete(
                self.manager.close({"auth_token": self.admin_token})
            )
            
            # Check result
            self.assertTrue(result, "Database closure should succeed")
            self.assertFalse(self.manager.initialized, "Manager should be marked as not initialized")
    
    def test_sql_type_detection(self):
        """Test SQL type detection"""
        # Test SELECT detection
        self.assertEqual("SELECT", self.manager._get_sql_type("SELECT * FROM test"), "Should detect SELECT")
        
        # Test INSERT detection
        self.assertEqual("INSERT", self.manager._get_sql_type("INSERT INTO test VALUES (1)"), "Should detect INSERT")
        
        # Test UPDATE detection
        self.assertEqual("UPDATE", self.manager._get_sql_type("UPDATE test SET x = 1"), "Should detect UPDATE")
        
        # Test DELETE detection
        self.assertEqual("DELETE", self.manager._get_sql_type("DELETE FROM test"), "Should detect DELETE")
        
        # Test CREATE detection
        self.assertEqual("CREATE", self.manager._get_sql_type("CREATE TABLE test (id INT)"), "Should detect CREATE")
        
        # Test DROP detection
        self.assertEqual("DROP", self.manager._get_sql_type("DROP TABLE test"), "Should detect DROP")
        
        # Test ALTER detection
        self.assertEqual("ALTER", self.manager._get_sql_type("ALTER TABLE test ADD COLUMN x INT"), "Should detect ALTER")
        
        # Test TRUNCATE detection
        self.assertEqual("TRUNCATE", self.manager._get_sql_type("TRUNCATE TABLE test"), "Should detect TRUNCATE")
        
        # Test OTHER detection
        self.assertEqual("OTHER", self.manager._get_sql_type("EXPLAIN test"), "Should detect OTHER")
    
    def test_table_name_extraction(self):
        """Test table name extraction from SQL"""
        # Test SELECT
        self.assertEqual(
            "test_table",
            self.manager._extract_table_name("SELECT * FROM test_table", "SELECT"),
            "Should extract table from SELECT"
        )
        
        # Test INSERT
        self.assertEqual(
            "test_table",
            self.manager._extract_table_name("INSERT INTO test_table VALUES (1)", "INSERT"),
            "Should extract table from INSERT"
        )
        
        # Test UPDATE
        self.assertEqual(
            "test_table",
            self.manager._extract_table_name("UPDATE test_table SET x = 1", "UPDATE"),
            "Should extract table from UPDATE"
        )
        
        # Test DELETE
        self.assertEqual(
            "test_table",
            self.manager._extract_table_name("DELETE FROM test_table", "DELETE"),
            "Should extract table from DELETE"
        )
        
        # Test CREATE
        self.assertEqual(
            "test_table",
            self.manager._extract_table_name("CREATE TABLE test_table (id INT)", "CREATE"),
            "Should extract table from CREATE"
        )
        
        # Test DROP
        self.assertEqual(
            "test_table",
            self.manager._extract_table_name("DROP TABLE test_table", "DROP"),
            "Should extract table from DROP"
        )
        
        # Test ALTER
        self.assertEqual(
            "test_table",
            self.manager._extract_table_name("ALTER TABLE test_table ADD COLUMN x INT", "ALTER"),
            "Should extract table from ALTER"
        )
        
        # Test TRUNCATE
        self.assertEqual(
            "test_table",
            self.manager._extract_table_name("TRUNCATE TABLE test_table", "TRUNCATE"),
            "Should extract table from TRUNCATE"
        )
    
    def test_resource_usage_tracking(self):
        """Test resource usage tracking"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Call _update_resource_usage directly
        self.manager._update_resource_usage("read", "test_table", {"user_id": "test-user"})
        self.manager._update_resource_usage("write", "test_table", {"user_id": "test-user"})
        self.manager._update_resource_usage("export_ipld", "test_table", {"user_id": "test-user"})
        
        # Check by-table stats
        self.assertIn("test_table", self.manager.resource_usage["by_table"], "Should track table usage")
        self.assertEqual(1, self.manager.resource_usage["by_table"]["test_table"]["reads"], "Should track reads")
        self.assertEqual(1, self.manager.resource_usage["by_table"]["test_table"]["writes"], "Should track writes")
        self.assertEqual(1, self.manager.resource_usage["by_table"]["test_table"]["export_ipld"], "Should track exports")
        
        # Check by-user stats
        self.assertIn("test-user", self.manager.resource_usage["by_user"], "Should track user usage")
        self.assertEqual(1, self.manager.resource_usage["by_user"]["test-user"]["reads"], "Should track user reads")
        self.assertEqual(1, self.manager.resource_usage["by_user"]["test-user"]["writes"], "Should track user writes")
        self.assertEqual(1, self.manager.resource_usage["by_user"]["test-user"]["export_ipld"], "Should track user exports")
        self.assertIn("test_table", self.manager.resource_usage["by_user"]["test-user"]["tables"], "Should track user tables")


if __name__ == "__main__":
    # Run tests with detailed output
    unittest.main(verbosity=2)