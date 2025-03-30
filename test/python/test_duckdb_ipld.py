"""
DuckDB-IPLD Integration Test

Tests the integration between DuckDB and IPLD for P2P database exchange
"""

import os
import sys
import json
import asyncio
import unittest
import tempfile
from pathlib import Path

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

# Test if required dependencies are available
DEPENDENCIES_AVAILABLE = True
try:
    import pyarrow as pa
    import duckdb
    from hallucinate_app.python.hallucinate_app.duckdb_ipld_kit import DuckDBIPLDKit
except ImportError as e:
    print(f"Dependencies not available: {e}")
    DEPENDENCIES_AVAILABLE = False


class TestDuckDBIPLDKit(unittest.TestCase):
    """Test the DuckDB-IPLD Kit implementation"""
    
    @classmethod
    def setUpClass(cls):
        """Set up test resources"""
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.db_path = os.path.join(cls.temp_dir.name, "test.db")
        
        if DEPENDENCIES_AVAILABLE:
            cls.resources = {
                "ipfs_kit": MockIPFSKit(),
                "libp2p_kit": MockLibp2pKit()
            }
            cls.metadata = {
                "db_path": cls.db_path,
                "instance_id": "test-instance"
            }
    
    @classmethod
    def tearDownClass(cls):
        """Clean up test resources"""
        cls.temp_dir.cleanup()
    
    async def _create_test_db(self, kit):
        """Create a test database with sample data"""
        # Create a table
        await kit.execute("""
            CREATE TABLE test_table (
                id INTEGER,
                name VARCHAR,
                value DOUBLE,
                timestamp TIMESTAMP
            )
        """)
        
        # Insert test data
        for i in range(10):
            await kit.execute(
                "INSERT INTO test_table VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                [i, f"Test {i}", i * 1.5]
            )
        
        return await kit.execute("SELECT COUNT(*) FROM test_table")
    
    async def test_initialization(self):
        """Test initialization of the DuckDB-IPLD Kit"""
        if not DEPENDENCIES_AVAILABLE:
            self.skipTest("Required dependencies not available")
        
        # Create instance
        kit = DuckDBIPLDKit(resources=self.resources, metadata=self.metadata)
        
        # Initialize
        result = await kit.init()
        
        # Check results
        self.assertTrue(result)
        self.assertTrue(kit.initialized)
        
        # Clean up
        await kit.close()
    
    async def test_sql_execution(self):
        """Test SQL query execution"""
        if not DEPENDENCIES_AVAILABLE:
            self.skipTest("Required dependencies not available")
        
        # Create instance
        kit = DuckDBIPLDKit(resources=self.resources, metadata=self.metadata)
        await kit.init()
        
        # Create test database
        count_result = await self._create_test_db(kit)
        
        # Verify row count
        self.assertTrue(count_result["success"])
        self.assertEqual(count_result["rows"][0]["count_star()"], 10)
        
        # Test a SELECT query
        result = await kit.execute("SELECT * FROM test_table")
        
        # Check results
        self.assertTrue(result["success"])
        self.assertEqual(len(result["rows"]), 10)
        
        # Clean up
        await kit.close()
    
    async def test_ipld_export_import(self):
        """Test exporting and importing tables to/from IPLD"""
        if not DEPENDENCIES_AVAILABLE:
            self.skipTest("Required dependencies not available")
        
        # Create instance
        kit = DuckDBIPLDKit(resources=self.resources, metadata=self.metadata)
        await kit.init()
        
        # Create test database
        await self._create_test_db(kit)
        
        # Export table to IPLD
        export_result = await kit.export_table_to_ipld("test_table")
        
        # Check export results
        self.assertTrue(export_result["success"])
        self.assertIsNotNone(export_result["cid"])
        self.assertEqual(export_result["ipld"]["name"], "test_table")
        self.assertEqual(len(export_result["ipld"]["data"]), 10)
        
        # Import as a new table
        ipld_data = export_result["ipld"]
        import_result = await kit.import_table_from_ipld(ipld_data, "imported_table")
        
        # Check import results
        self.assertTrue(import_result["success"])
        self.assertEqual(import_result["tableName"], "imported_table")
        self.assertEqual(import_result["rowsImported"], 10)
        
        # Verify imported data
        verify_result = await kit.execute("SELECT COUNT(*) FROM imported_table")
        self.assertTrue(verify_result["success"])
        self.assertEqual(verify_result["rows"][0]["count_star()"], 10)
        
        # Test exporting entire database
        db_export_result = await kit.export_database_to_ipld()
        
        # Check database export results
        self.assertTrue(db_export_result["success"])
        self.assertIsNotNone(db_export_result["cid"])
        
        # Clean up
        await kit.close()
    
    async def test_parquet_export_import(self):
        """Test exporting and importing tables to/from Parquet"""
        if not DEPENDENCIES_AVAILABLE:
            self.skipTest("Required dependencies not available")
        
        # Create instance
        kit = DuckDBIPLDKit(resources=self.resources, metadata=self.metadata)
        await kit.init()
        
        # Create test database
        await self._create_test_db(kit)
        
        # Export table to Parquet
        parquet_path = os.path.join(self.temp_dir.name, "test_table.parquet")
        export_result = await kit.export_table_to_parquet("test_table", parquet_path)
        
        # Check export results
        self.assertTrue(export_result["success"])
        self.assertEqual(export_result["tableName"], "test_table")
        self.assertEqual(export_result["rowsExported"], 10)
        self.assertTrue(os.path.exists(parquet_path))
        
        # Import as a new table
        import_result = await kit.import_table_from_parquet(parquet_path, "parquet_table")
        
        # Check import results
        self.assertTrue(import_result["success"])
        self.assertEqual(import_result["tableName"], "parquet_table")
        
        # Verify imported data
        verify_result = await kit.execute("SELECT COUNT(*) FROM parquet_table")
        self.assertTrue(verify_result["success"])
        self.assertEqual(verify_result["rows"][0]["count_star()"], 10)
        
        # Clean up
        await kit.close()
    
    async def test_arrow_export(self):
        """Test exporting tables to Arrow format"""
        if not DEPENDENCIES_AVAILABLE:
            self.skipTest("Required dependencies not available")
        
        # Create instance
        kit = DuckDBIPLDKit(resources=self.resources, metadata=self.metadata)
        await kit.init()
        
        # Create test database
        await self._create_test_db(kit)
        
        # Export table to Arrow
        export_result = await kit.export_table_to_arrow("test_table")
        
        # Check export results
        self.assertTrue(export_result["success"])
        self.assertEqual(export_result["tableName"], "test_table")
        self.assertEqual(export_result["recordCount"], 10)
        self.assertIsNotNone(export_result["buffer"])
        
        # Clean up
        await kit.close()


# Mock classes for testing
class MockIPFSKit:
    """Mock IPFS Kit for testing"""
    
    async def add_to_ipfs(self, data, options=None):
        """Mock adding data to IPFS"""
        import hashlib
        options = options or {}
        mock_cid = "bafybeig" + hashlib.sha256(data if isinstance(data, bytes) else str(data).encode()).hexdigest()[:40]
        return {
            "cid": mock_cid,
            "size": len(data) if isinstance(data, bytes) else len(str(data)),
            "success": True
        }
    
    async def get_from_ipfs(self, cid, options=None):
        """Mock getting data from IPFS"""
        options = options or {}
        return {
            "data": b"Mock IPFS data for " + cid.encode(),
            "cid": cid,
            "success": True
        }


class MockLibp2pKit:
    """Mock libp2p Kit for testing"""
    
    async def publish(self, topic, data):
        """Mock publishing data to a topic"""
        return {
            "topic": topic,
            "success": True
        }
    
    async def subscribe(self, topic, handler):
        """Mock subscribing to a topic"""
        return {
            "topic": topic,
            "success": True
        }


def run_async_test(test_case, test_coro):
    """Helper function to run async tests"""
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(test_coro)


def main():
    """Run tests"""
    # Add async test methods to TestCase
    for name in dir(TestDuckDBIPLDKit):
        if name.startswith('test_') and asyncio.iscoroutinefunction(getattr(TestDuckDBIPLDKit, name)):
            test_method = getattr(TestDuckDBIPLDKit, name)
            
            # Create a wrapper method that runs the coroutine
            def create_test_wrapper(test_coro):
                def test_wrapper(self):
                    return run_async_test(self, test_coro(self))
                return test_wrapper
            
            # Replace the coroutine method with the wrapper
            setattr(TestDuckDBIPLDKit, name, create_test_wrapper(test_method))
    
    unittest.main()


if __name__ == "__main__":
    main()