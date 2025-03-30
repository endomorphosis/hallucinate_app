"""
Test module for DuckDB-IPLD Manager

Tests the integration between DuckDB-IPLD, thread pool system, and database sync manager
"""

import os
import sys
import json
import asyncio
import unittest
import tempfile
import logging
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_duckdb_ipld_manager")

# Add parent directory to path to import local modules
parent_dir = str(Path(__file__).parent.parent)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

# Import the module to test
try:
    from duckdb_ipld_manager import DuckDBIPLDManager, OperationType
    has_module = True
except ImportError as e:
    logger.error(f"Failed to import DuckDBIPLDManager: {e}")
    has_module = False

# Check thread pool components
try:
    from thread_pool_manager import ThreadPoolManager, TaskType, TaskPriority
    from thread_pool_monitor import ThreadPoolMonitor
    has_thread_pool = True
except ImportError:
    has_thread_pool = False
    logger.warning("Thread pool components not available, related tests will be skipped")

# Check database sync manager
try:
    from database_sync_manager import DatabaseSyncManager, SYNC_CAPABILITIES
    has_sync_manager = True
except ImportError:
    has_sync_manager = False
    logger.warning("Database sync manager not available, related tests will be skipped")

# Check DuckDB-IPLD kit
try:
    from duckdb_ipld_kit import DuckDBIPLDKit
    has_duckdb_ipld_kit = True
except ImportError:
    has_duckdb_ipld_kit = False
    logger.warning("DuckDB-IPLD kit not available, tests will use mock implementation")


class MockDuckDBIPLDKit:
    """Mock implementation of DuckDB-IPLD Kit for testing"""
    
    def __init__(self, resources=None, metadata=None):
        self.resources = resources or {}
        self.metadata = metadata or {}
        self.initialized = False
        self.tables = {}
        self.stats = {
            "queries_executed": 0,
            "tables_created": 0,
            "tables_exported": 0,
            "tables_imported": 0,
            "ipld_conversions": 0,
            "parquet_exports": 0,
            "arrow_buffers": 0,
            "last_operation": None
        }
    
    async def init(self):
        self.initialized = True
        return True
    
    async def execute(self, sql, params=None):
        self.stats["queries_executed"] += 1
        sql_upper = sql.strip().upper()
        
        # Handle CREATE TABLE
        if sql_upper.startswith("CREATE TABLE"):
            parts = sql_upper.split()
            table_name = parts[2].strip()
            if table_name.endswith("("):
                table_name = table_name[:-1]
                
            self.tables[table_name] = []
            self.stats["tables_created"] += 1
            return {
                "success": True,
                "sql": sql,
                "mock": True
            }
        
        # Handle INSERT
        elif sql_upper.startswith("INSERT INTO"):
            parts = sql_upper.split()
            table_name = parts[2].strip()
            
            if table_name not in self.tables:
                self.tables[table_name] = []
                
            # Mock insert
            self.tables[table_name].append({"id": len(self.tables[table_name]) + 1})
            
            return {
                "success": True,
                "rows_affected": 1,
                "sql": sql,
                "mock": True
            }
        
        # Handle SELECT
        elif sql_upper.startswith("SELECT"):
            # Look for information_schema queries
            if "INFORMATION_SCHEMA.TABLES" in sql_upper:
                return {
                    "success": True,
                    "rows": [{"table_name": name} for name in self.tables.keys()],
                    "row_count": len(self.tables),
                    "sql": sql,
                    "mock": True
                }
            elif "INFORMATION_SCHEMA.COLUMNS" in sql_upper:
                # Extract table name from WHERE clause
                parts = sql_upper.split("WHERE")
                if len(parts) > 1:
                    where_clause = parts[1]
                    if "TABLE_NAME" in where_clause:
                        table_name = where_clause.split("=")[1].strip().strip("'")
                        return {
                            "success": True,
                            "rows": [
                                {"column_name": "id", "data_type": "INTEGER", "column_default": None},
                                {"column_name": "value", "data_type": "VARCHAR", "column_default": None}
                            ],
                            "row_count": 2,
                            "sql": sql,
                            "mock": True
                        }
            
            # Default SELECT result
            return {
                "success": True,
                "rows": [{"id": 1, "value": "test_value"}],
                "row_count": 1,
                "sql": sql,
                "mock": True
            }
        
        # Default response
        return {
            "success": True,
            "sql": sql,
            "mock": True
        }
    
    async def export_table_to_ipld(self, table_name):
        self.stats["tables_exported"] += 1
        self.stats["ipld_conversions"] += 1
        
        # Generate mock CID
        import hashlib
        mock_cid = f"bafybeig{hashlib.md5(table_name.encode()).hexdigest()}"
        
        return {
            "success": True,
            "cid": mock_cid,
            "ipld": {
                "table": table_name,
                "data": [{"id": 1, "value": "test"}]
            },
            "mock": True
        }
    
    async def import_table_from_ipld(self, ipld_data, target_table_name=None):
        self.stats["tables_imported"] += 1
        self.stats["ipld_conversions"] += 1
        
        table_name = target_table_name or (
            ipld_data.get("table") if isinstance(ipld_data, dict) else "imported_table"
        )
        
        if table_name not in self.tables:
            self.tables[table_name] = []
        
        return {
            "success": True,
            "table_name": table_name,
            "rows_imported": 1,
            "mock": True
        }
    
    async def export_table_to_parquet(self, table_name, output_path):
        self.stats["tables_exported"] += 1
        self.stats["parquet_exports"] += 1
        
        # Create empty file
        with open(output_path, "w") as f:
            f.write("MOCK PARQUET DATA")
        
        return {
            "success": True,
            "table_name": table_name,
            "output_path": output_path,
            "rows_exported": 1,
            "mock": True
        }
    
    async def export_table_to_arrow(self, table_name):
        self.stats["tables_exported"] += 1
        self.stats["arrow_buffers"] += 1
        
        # Create mock buffer
        import io
        buffer = io.BytesIO(b"MOCK ARROW DATA")
        
        return {
            "success": True,
            "table_name": table_name,
            "buffer": buffer,
            "schema": {
                "fields": [
                    {"name": "id", "type": "int32"},
                    {"name": "value", "type": "utf8"}
                ]
            },
            "record_count": 1,
            "mock": True
        }
    
    async def export_database_to_ipld(self):
        self.stats["ipld_conversions"] += 1
        
        # Generate mock CID
        import hashlib
        mock_cid = f"bafybeig{hashlib.md5(b'database').hexdigest()}"
        
        return {
            "success": True,
            "cid": mock_cid,
            "table_count": len(self.tables),
            "mock": True
        }
    
    async def close(self):
        self.initialized = False
        return True
    
    def get_stats(self):
        return {
            **self.stats,
            "table_count": len(self.tables),
            "mock": True
        }


class MockThreadPool:
    """Mock thread pool for testing"""
    
    def __init__(self):
        self.tasks = []
        self.task_counter = 0
    
    def submit_task(self, func, task_type=None, priority=None):
        self.task_counter += 1
        task_id = f"task-{self.task_counter}"
        
        # Execute the function directly
        func()
        
        # Store task info
        self.tasks.append({
            "id": task_id,
            "type": task_type,
            "priority": priority
        })
        
        return task_id, None


class MockAuthManager:
    """Mock authentication manager for testing"""
    
    def __init__(self):
        self.tokens = {}
    
    def get_self_signed_token(self, capability):
        token = f"mock-token-{capability}"
        self.tokens[token] = capability
        return token


class MockSyncManager:
    """Mock database sync manager for testing"""
    
    def __init__(self, resources=None, metadata=None):
        self.resources = resources or {}
        self.metadata = metadata or {}
        self.initialized = False
        self.events = []
    
    async def init(self):
        self.initialized = True
        return True
    
    async def sync_all(self, auth_token=None):
        self.events.append({
            "type": "sync_all",
            "auth_token": auth_token,
            "timestamp": "mock_timestamp"
        })
        
        return {
            "success": True,
            "results": {
                "orbitToFireproof": {"success": True},
                "fireproofToOrbit": {"success": True},
                "duckdbExport": {"success": True},
                "duckdbImport": {"success": True}
            }
        }
    
    async def sync_orbitdb_to_fireproofdb(self, auth_token=None, collections=None):
        self.events.append({
            "type": "sync_orbitdb_to_fireproofdb",
            "auth_token": auth_token,
            "collections": collections,
            "timestamp": "mock_timestamp"
        })
        
        return {
            "success": True,
            "stats": {
                "processed": 1,
                "updated": 1,
                "conflicts": 0,
                "errors": 0
            }
        }
    
    async def sync_fireproofdb_to_orbitdb(self, auth_token=None, collections=None):
        self.events.append({
            "type": "sync_fireproofdb_to_orbitdb",
            "auth_token": auth_token,
            "collections": collections,
            "timestamp": "mock_timestamp"
        })
        
        return {
            "success": True,
            "stats": {
                "processed": 1,
                "updated": 1,
                "conflicts": 0,
                "errors": 0
            }
        }
    
    async def export_duckdb_to_ipld(self, auth_token=None, tables=None, differential=True):
        self.events.append({
            "type": "export_duckdb_to_ipld",
            "auth_token": auth_token,
            "tables": tables,
            "differential": differential,
            "timestamp": "mock_timestamp"
        })
        
        return {
            "success": True,
            "stats": {
                "tables": 1,
                "rows": 1
            }
        }
    
    async def import_ipld_to_duckdb(self, auth_token=None, table_data=None):
        self.events.append({
            "type": "import_ipld_to_duckdb",
            "auth_token": auth_token,
            "table_data": table_data,
            "timestamp": "mock_timestamp"
        })
        
        return {
            "success": True,
            "stats": {
                "tables": 1,
                "rows": 1
            }
        }
    
    async def _handle_duckdb_change(self, event):
        self.events.append({
            "type": "duckdb_change",
            "event": event,
            "timestamp": "mock_timestamp"
        })


# Main test class
@unittest.skipIf(not has_module, "DuckDBIPLDManager module not available")
class TestDuckDBIPLDManager(unittest.TestCase):
    """Test cases for the DuckDB-IPLD Manager"""
    
    def setUp(self):
        """Set up test resources"""
        # Create temporary directory for test files
        self.temp_dir = tempfile.mkdtemp()
        
        # Create mocks
        self.mock_duckdb_kit = MockDuckDBIPLDKit()
        self.mock_thread_pool = MockThreadPool()
        self.mock_auth_manager = MockAuthManager()
        self.mock_sync_manager = MockSyncManager()
        
        # Create resources
        self.resources = {
            "duckdb_ipld_kit": self.mock_duckdb_kit,
            "thread_pool": self.mock_thread_pool,
            "auth": self.mock_auth_manager,
            "sync_manager": self.mock_sync_manager
        }
        
        # Create metadata
        self.metadata = {
            "syncInterval": 100,  # Fast interval for tests
            "autoSync": False,    # Disable auto sync for tests
            "taskPriorities": {
                OperationType.QUERY: TaskPriority.HIGH,
                OperationType.SYNC: TaskPriority.LOW
            }
        }
        
        # Create manager
        self.manager = DuckDBIPLDManager(resources=self.resources, metadata=self.metadata)
        
        # Initialize event loop for async tests
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
    
    def tearDown(self):
        """Clean up after tests"""
        # Close the manager
        if hasattr(self, "manager"):
            self.loop.run_until_complete(self.manager.close())
        
        # Close the event loop
        if hasattr(self, "loop"):
            self.loop.close()
        
        # Clean up temp directory
        import shutil
        if hasattr(self, "temp_dir") and os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_initialization(self):
        """Test manager initialization"""
        self.assertTrue(self.manager.initialized)
        self.assertIsNotNone(self.manager.duckdb_ipld_kit)
        self.assertIsNotNone(self.manager.thread_pool)
        self.assertIsNotNone(self.manager.sync_manager)
    
    def test_execute_query(self):
        """Test executing SQL queries"""
        # Create a test table
        create_result = self.loop.run_until_complete(
            self.manager.execute("CREATE TABLE test_table (id INTEGER, value VARCHAR)")
        )
        self.assertTrue(create_result["success"])
        
        # Insert data
        insert_result = self.loop.run_until_complete(
            self.manager.execute("INSERT INTO test_table VALUES (1, 'test')")
        )
        self.assertTrue(insert_result["success"])
        
        # Query data
        select_result = self.loop.run_until_complete(
            self.manager.query("SELECT * FROM test_table")
        )
        self.assertIsNotNone(select_result)
        self.assertTrue(len(select_result) > 0)
    
    def test_ipld_export_import(self):
        """Test IPLD export and import"""
        # Create a test table
        self.loop.run_until_complete(
            self.manager.execute("CREATE TABLE test_export (id INTEGER, value VARCHAR)")
        )
        
        # Export to IPLD
        export_result = self.loop.run_until_complete(
            self.manager.export_table_to_ipld("test_export")
        )
        self.assertTrue(export_result["success"])
        self.assertIsNotNone(export_result["cid"])
        
        # Import from IPLD
        import_result = self.loop.run_until_complete(
            self.manager.import_table_from_ipld(export_result["ipld"], "test_import")
        )
        self.assertTrue(import_result["success"])
        self.assertEqual(import_result["table_name"], "test_import")
    
    def test_parquet_export(self):
        """Test Parquet export"""
        # Create a test table
        self.loop.run_until_complete(
            self.manager.execute("CREATE TABLE test_parquet (id INTEGER, value VARCHAR)")
        )
        
        # Export to Parquet
        output_path = os.path.join(self.temp_dir, "test_export.parquet")
        export_result = self.loop.run_until_complete(
            self.manager.export_table_to_parquet("test_parquet", output_path)
        )
        self.assertTrue(export_result["success"])
        self.assertEqual(export_result["output_path"], output_path)
        self.assertTrue(os.path.exists(output_path))
    
    def test_arrow_export(self):
        """Test Arrow export"""
        # Create a test table
        self.loop.run_until_complete(
            self.manager.execute("CREATE TABLE test_arrow (id INTEGER, value VARCHAR)")
        )
        
        # Export to Arrow
        export_result = self.loop.run_until_complete(
            self.manager.export_table_to_arrow("test_arrow")
        )
        self.assertTrue(export_result["success"])
        self.assertIsNotNone(export_result["buffer"])
        self.assertIsNotNone(export_result["schema"])
    
    def test_database_export(self):
        """Test full database export"""
        # Create a test table
        self.loop.run_until_complete(
            self.manager.execute("CREATE TABLE test_db_export (id INTEGER, value VARCHAR)")
        )
        
        # Export database
        export_result = self.loop.run_until_complete(
            self.manager.export_database_to_ipld()
        )
        self.assertTrue(export_result["success"])
        self.assertIsNotNone(export_result["cid"])
    
    def test_sync_with_document_dbs(self):
        """Test synchronization with document databases"""
        # Sync with document DBs
        sync_result = self.loop.run_until_complete(
            self.manager.sync_with_document_dbs()
        )
        self.assertTrue(sync_result["success"])
        
        # Check if sync manager was called
        self.assertTrue(len(self.mock_sync_manager.events) > 0)
        self.assertTrue(any(event["type"] == "sync_all" for event in self.mock_sync_manager.events))
    
    def test_auto_sync(self):
        """Test auto sync functionality"""
        # Enable auto sync
        auto_sync_result = self.manager.start_auto_sync(interval=100)
        self.assertTrue(auto_sync_result["success"])
        self.assertIsNotNone(self.manager.sync_timer)
        
        # Give it a moment to run
        import time
        time.sleep(0.2)
        
        # Disable auto sync
        stop_result = self.manager.stop_auto_sync()
        self.assertTrue(stop_result["success"])
        self.assertIsNone(self.manager.sync_timer)
    
    def test_schema_management(self):
        """Test schema management"""
        # Create a test table
        self.loop.run_until_complete(
            self.manager.execute("CREATE TABLE test_schema (id INTEGER, value VARCHAR)")
        )
        
        # Get schema
        schema = self.loop.run_until_complete(
            self.manager.get_schema("test_schema", refresh=True)
        )
        self.assertIsNotNone(schema)
        self.assertEqual(schema["name"], "test_schema")
        
        # Get all schemas
        all_schemas = self.loop.run_until_complete(
            self.manager.get_schema(refresh=True)
        )
        self.assertIsNotNone(all_schemas)
        self.assertIn("test_schema", all_schemas)
    
    def test_statistics(self):
        """Test statistics tracking"""
        # Execute some operations
        self.loop.run_until_complete(
            self.manager.execute("CREATE TABLE test_stats (id INTEGER, value VARCHAR)")
        )
        self.loop.run_until_complete(
            self.manager.export_table_to_ipld("test_stats")
        )
        
        # Get stats
        stats = self.manager.get_stats()
        self.assertIsNotNone(stats)
        self.assertTrue(stats["queries"] > 0)
        self.assertTrue(stats["exports"] > 0)
        self.assertIn("kit", stats)
    
    def test_self_test(self):
        """Test the manager's self-test functionality"""
        test_results = self.loop.run_until_complete(
            self.manager.test()
        )
        self.assertTrue(test_results["success"])
        self.assertIn("tests", test_results)
        self.assertIn("sql_execution", test_results["tests"])
        self.assertIn("ipld_export", test_results["tests"])


# Additional test class for integration testing with real components if available
@unittest.skipIf(not (has_module and has_duckdb_ipld_kit and has_thread_pool and has_sync_manager),
                "Not all required components available for integration tests")
class TestDuckDBIPLDManagerIntegration(unittest.TestCase):
    """Integration tests for DuckDB-IPLD Manager with real components"""
    
    def setUp(self):
        """Set up integration test resources"""
        # Create temporary directory for test files
        self.temp_dir = tempfile.mkdtemp()
        
        # Create real thread pool
        self.thread_pool = ThreadPoolManager(num_threads=2)
        self.thread_pool_monitor = ThreadPoolMonitor(self.thread_pool)
        
        # Create resources without mocks
        self.resources = {
            "thread_pool": self.thread_pool,
            # Note: We don't include sync_manager or auth to avoid 
            # integration complexity, but we're still testing the
            # real thread pool and DuckDB-IPLD kit integration
        }
        
        # Create metadata
        self.metadata = {
            "db_path": os.path.join(self.temp_dir, "test.db"),
            "autoSync": False    # Disable auto sync for tests
        }
        
        # Create manager with real components
        self.manager = DuckDBIPLDManager(resources=self.resources, metadata=self.metadata)
        
        # Initialize event loop for async tests
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Start the thread pool
        self.thread_pool.start()
    
    def tearDown(self):
        """Clean up integration test resources"""
        # Close the manager
        if hasattr(self, "manager"):
            self.loop.run_until_complete(self.manager.close())
        
        # Stop the thread pool
        if hasattr(self, "thread_pool"):
            self.thread_pool.stop()
        
        # Close the event loop
        if hasattr(self, "loop"):
            self.loop.close()
        
        # Clean up temp directory
        import shutil
        if hasattr(self, "temp_dir") and os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_thread_pool_integration(self):
        """Test integration with real thread pool"""
        # Create a test table using the thread pool
        create_result = self.loop.run_until_complete(
            self.manager.execute("CREATE TABLE thread_test (id INTEGER, value VARCHAR)")
        )
        self.assertTrue(create_result["success"])
        
        # Insert data
        for i in range(5):
            insert_result = self.loop.run_until_complete(
                self.manager.execute(f"INSERT INTO thread_test VALUES ({i}, 'value{i}')")
            )
            self.assertTrue(insert_result["success"])
        
        # Query data
        select_result = self.loop.run_until_complete(
            self.manager.query("SELECT * FROM thread_test")
        )
        
        # Verify thread pool was used
        self.assertGreaterEqual(len(select_result), 5)
        
        # Check thread pool metrics
        metrics = self.thread_pool_monitor.get_metrics()
        self.assertGreater(metrics["total_tasks_executed"], 0)


def run_tests():
    """Run all tests"""
    unittest.main()


if __name__ == "__main__":
    run_tests()