"""
Test module for Database Backup Manager

Tests backup and restore functionality with integration to PyArrow content index and IPFS
"""

import os
import sys
import json
import asyncio
import unittest
import logging
import tempfile
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch, AsyncMock
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_database_backup_manager")

# Add parent directory to path to import local modules
parent_dir = str(Path(__file__).parent.parent)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

# Import the module to test
try:
    from database_backup_manager import DatabaseBackupManager, BACKUP_CAPABILITIES
    from pyarrow_content_index_integration import PyArrowContentIndexIntegration
    has_module = True
except ImportError as e:
    logger.error(f"Failed to import DatabaseBackupManager: {e}")
    has_module = False


class MockAuthManager:
    """Mock Auth Manager for testing"""
    
    def __init__(self):
        self.initialized = True
        self.capabilities = {}
    
    async def init(self):
        return True
    
    async def verify_capability(self, token, capability_string):
        if token.startswith("admin"):
            return True
        
        if token.startswith("valid"):
            # All valid tokens are allowed for testing
            return True
            
        return False


class MockIPFSKit:
    """Mock IPFS Kit for testing"""
    
    def __init__(self):
        self.files = {}
        self.directories = {}
        self.initialized = False
    
    async def init(self):
        self.initialized = True
        return True
    
    async def add(self, path, recursive=False):
        """Mock add file/directory to IPFS"""
        if isinstance(path, str):
            if os.path.isdir(path) and recursive:
                # Create a mock CID for the directory
                dir_cid = f"dir-bafybeiczsscdsbs7ffqz{len(str(path))}55432abcdef"
                self.directories[dir_cid] = {
                    "path": path,
                    "files": {}
                }
                
                # Walk the directory
                file_cids = []
                for root, _, files in os.walk(path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        rel_path = os.path.relpath(file_path, path)
                        
                        # Create a mock CID for each file
                        file_cid = f"file-bafybeiczsscdsbs7ffqz{len(file_path)}55432{hash(file_path) % 1000000:06d}"
                        
                        # Read file content
                        try:
                            with open(file_path, 'rb') as f:
                                content = f.read()
                        except Exception:
                            content = b""
                        
                        # Store in our mock IPFS
                        self.files[file_cid] = {
                            "path": file_path,
                            "content": content,
                            "parent_dir": dir_cid
                        }
                        
                        self.directories[dir_cid]["files"][rel_path] = file_cid
                        
                        file_cids.append({
                            "cid": file_cid,
                            "path": rel_path,
                            "size": len(content)
                        })
                
                # Add the directory itself to the results
                file_cids.append({
                    "cid": dir_cid,
                    "path": os.path.basename(path),
                    "size": sum(len(f.get("content", b"")) for f in self.files.values() 
                               if f.get("parent_dir") == dir_cid)
                })
                
                return file_cids
            else:
                # Just a single file
                try:
                    with open(path, 'rb') as f:
                        content = f.read()
                except Exception:
                    content = b""
                
                file_cid = f"file-bafybeiczsscdsbs7ffqz{len(path)}55432{hash(path) % 1000000:06d}"
                self.files[file_cid] = {
                    "path": path,
                    "content": content
                }
                
                return [{
                    "cid": file_cid,
                    "path": os.path.basename(path),
                    "size": len(content)
                }]
        else:
            # Data is provided directly
            content = path if isinstance(path, bytes) else str(path).encode()
            file_cid = f"data-bafybeiczsscdsbs7ffqz{len(content)}55432{hash(content) % 1000000:06d}"
            
            self.files[file_cid] = {
                "content": content
            }
            
            return [{
                "cid": file_cid,
                "size": len(content)
            }]
    
    async def add_directory(self, dir_path):
        """Mock add directory to IPFS"""
        if not os.path.isdir(dir_path):
            raise ValueError(f"Not a directory: {dir_path}")
        
        # Get all files recursively
        files = await self.add(dir_path, recursive=True)
        
        # Get the directory CID (last entry)
        dir_cid = files[-1]["cid"]
        
        return {
            "cid": dir_cid,
            "size": files[-1]["size"],
            "file_count": len(files) - 1
        }
    
    async def get(self, cid, output_dir):
        """Mock get from IPFS to local directory"""
        if cid in self.directories:
            # Get directory content
            dir_info = self.directories[cid]
            
            # Create output directory
            os.makedirs(output_dir, exist_ok=True)
            
            # Extract all files
            for rel_path, file_cid in dir_info["files"].items():
                file_info = self.files.get(file_cid)
                if file_info:
                    file_path = os.path.join(output_dir, rel_path)
                    os.makedirs(os.path.dirname(file_path), exist_ok=True)
                    
                    with open(file_path, 'wb') as f:
                        f.write(file_info.get("content", b""))
            
            return True
        
        elif cid in self.files:
            # Get single file content
            file_info = self.files[cid]
            
            # Determine file path in output directory
            file_path = os.path.join(output_dir, os.path.basename(file_info.get("path", "file")))
            
            # Create output directory
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            
            # Write file
            with open(file_path, 'wb') as f:
                f.write(file_info.get("content", b""))
            
            return True
        
        else:
            raise ValueError(f"CID not found: {cid}")
    
    async def ls(self, cid):
        """Mock ls command for IPFS"""
        if cid in self.directories:
            dir_info = self.directories[cid]
            
            result = []
            for rel_path, file_cid in dir_info["files"].items():
                result.append({
                    "name": os.path.basename(rel_path),
                    "hash": file_cid,
                    "size": len(self.files.get(file_cid, {}).get("content", b""))
                })
            
            return result
        
        elif cid in self.files:
            file_info = self.files[cid]
            
            return [{
                "name": os.path.basename(file_info.get("path", "file")),
                "hash": cid,
                "size": len(file_info.get("content", b""))
            }]
        
        else:
            return []
    
    async def cat(self, cid):
        """Mock cat command for IPFS"""
        if cid in self.files:
            return self.files[cid].get("content", b"")
        else:
            raise ValueError(f"CID not found: {cid}")


class MockContentIndexIntegration:
    """Mock PyArrow Content Index Integration for testing"""
    
    def __init__(self):
        self.entries = {}
        self.initialized = False
    
    async def init(self):
        self.initialized = True
        return True
        
    async def add_entry(self, entry):
        """Add an entry to the mock content index"""
        cid = entry.get("cid")
        if not cid:
            raise ValueError("CID is required")
        
        self.entries[cid] = entry
        return entry
    
    async def lookup_by_cid(self, cid):
        """Look up an entry by CID"""
        if cid in self.entries:
            return self.entries[cid]
        
        return None
    
    async def lookup_by_path(self, path):
        """Look up an entry by path"""
        for entry in self.entries.values():
            if entry.get("path") == path:
                return entry
        
        return None
    
    async def query(self, query_params):
        """Query the mock content index"""
        # Simple mock query
        results = []
        
        # Filter by metadata.backup_type if specified
        backup_type = None
        if isinstance(query_params, dict) and "filter" in query_params:
            if "backup_type" in query_params["filter"]:
                # Very simple parsing
                parts = query_params["filter"].split("=")
                if len(parts) == 2 and "backup_type" in parts[0]:
                    backup_type = parts[1].strip().strip('"\'')
        
        for entry in self.entries.values():
            if backup_type:
                metadata = entry.get("metadata", {})
                if metadata.get("backup_type") == backup_type:
                    results.append(entry)
            else:
                results.append(entry)
        
        # Apply limit if specified
        if isinstance(query_params, dict) and "limit" in query_params:
            limit = int(query_params["limit"])
            results = results[:limit]
        
        return results


class MockDBManager:
    """Base class for mock database managers"""
    
    def __init__(self, db_type):
        self.collections = {}
        self.db_type = db_type
    
    async def get_collections(self):
        """Get available collections"""
        return list(self.collections.keys())
    
    async def get_all(self, collection):
        """Get all documents in a collection"""
        if collection not in self.collections:
            return []
        
        return [{"_id": doc_id, **doc_data} for doc_id, doc_data in self.collections[collection].items()]
    
    async def get(self, collection, doc_id):
        """Get a document by ID"""
        if collection not in self.collections or doc_id not in self.collections[collection]:
            return None
        
        return {"_id": doc_id, **self.collections[collection][doc_id]}
    
    async def put(self, collection, doc, options=None):
        """Add or update a document"""
        if collection not in self.collections:
            self.collections[collection] = {}
        
        doc_id = doc.get("_id")
        if not doc_id:
            doc_id = f"auto-id-{len(self.collections[collection]) + 1}"
        
        # Store document without _id field (will be added back when retrieved)
        self.collections[collection][doc_id] = {k: v for k, v in doc.items() if k != "_id"}
        
        return {"success": True, "id": doc_id}


class MockOrbitDB(MockDBManager):
    """Mock OrbitDB for testing"""
    
    def __init__(self):
        super().__init__("orbitdb")
        
        # Add some test data
        self.collections = {
            "users": {
                "user1": {"name": "Test User 1", "email": "user1@example.com"},
                "user2": {"name": "Test User 2", "email": "user2@example.com"}
            },
            "posts": {
                "post1": {"title": "Test Post 1", "content": "This is test post 1"},
                "post2": {"title": "Test Post 2", "content": "This is test post 2"}
            }
        }


class MockFireproofDB(MockDBManager):
    """Mock FireproofDB for testing"""
    
    def __init__(self):
        super().__init__("fireproofdb")
        
        # Add some test data
        self.collections = {
            "products": {
                "product1": {"name": "Test Product 1", "price": 9.99},
                "product2": {"name": "Test Product 2", "price": 19.99}
            },
            "orders": {
                "order1": {"product": "product1", "quantity": 2},
                "order2": {"product": "product2", "quantity": 1}
            }
        }


class MockDuckDB:
    """Mock DuckDB for testing"""
    
    def __init__(self):
        self.tables = {
            "users": [
                {"id": 1, "name": "Test User 1", "email": "user1@example.com"},
                {"id": 2, "name": "Test User 2", "email": "user2@example.com"}
            ],
            "logs": [
                {"id": 1, "event": "login", "user_id": 1, "timestamp": "2023-01-01T12:00:00"},
                {"id": 2, "event": "logout", "user_id": 1, "timestamp": "2023-01-01T13:00:00"},
                {"id": 3, "event": "login", "user_id": 2, "timestamp": "2023-01-01T14:00:00"}
            ]
        }
    
    async def query(self, query, options=None):
        """Execute a query and return results"""
        if "information_schema.tables" in query:
            # Return table list
            return [{"table_name": name} for name in self.tables.keys()]
        
        elif "SELECT * FROM" in query:
            # Extract table name
            table_name = query.split("FROM")[1].strip().strip('"').strip(';')
            
            if table_name in self.tables:
                return self.tables[table_name]
            else:
                return []
        
        elif "COUNT(*)" in query:
            # Extract table name
            table_name = query.split("FROM")[1].strip().strip('"').strip(';')
            
            if table_name in self.tables:
                return [{"count": len(self.tables[table_name])}]
            else:
                return [{"count": 0}]
        
        elif "DESCRIBE" in query:
            # Extract table name
            table_name = query.split("DESCRIBE")[1].strip().strip('"').strip(';')
            
            if table_name in self.tables and self.tables[table_name]:
                # Get schema from first row
                first_row = self.tables[table_name][0]
                return [
                    {
                        "column_name": key,
                        "column_type": "INTEGER" if isinstance(value, int) else
                                    "DOUBLE" if isinstance(value, float) else
                                    "BOOLEAN" if isinstance(value, bool) else
                                    "VARCHAR"
                    }
                    for key, value in first_row.items()
                ]
            else:
                return []
        
        # Default empty result
        return []
    
    async def execute(self, query, options=None):
        """Execute a query without returning results"""
        if "CREATE TABLE" in query:
            # Extract table name
            table_name = query.split("TABLE")[1].strip().split("(")[0].strip().strip('"')
            
            if table_name not in self.tables:
                self.tables[table_name] = []
            
            return {"success": True, "rowCount": 0}
        
        elif "INSERT INTO" in query:
            # Very simplified - just record that something was inserted
            return {"success": True, "rowCount": 1}
        
        elif "DELETE FROM" in query:
            # Very simplified - just record that something was deleted
            return {"success": True, "rowCount": 1}
        
        # Default success
        return {"success": True, "rowCount": 0}
    
    async def export_database_to_ipld(self, options=None):
        """Mock export database to IPLD"""
        tables = options.get("tables") if options and "tables" in options else list(self.tables.keys())
        
        # Create a mock CID
        cid = f"ipld-bafybeiczsscdsbs7ffqz{len(str(tables))}55432abcdefg"
        
        return {
            "success": True,
            "cid": cid,
            "tables": tables,
            "row_count": {table: len(self.tables.get(table, [])) for table in tables},
            "size": sum(len(str(rows)) for rows in self.tables.values())
        }
    
    async def import_ipld_to_database(self, cid, options=None):
        """Mock import database from IPLD"""
        tables = options.get("tables") if options and "tables" in options else []
        
        # Just return success and some metadata
        return {
            "success": True,
            "cid": cid,
            "tables": tables or list(self.tables.keys()),
            "row_count": {table: len(self.tables.get(table, [])) for table in (tables or self.tables.keys())},
            "timestamp": datetime.now().isoformat()
        }


@unittest.skipIf(not has_module, "DatabaseBackupManager module not available")
class TestDatabaseBackupManager(unittest.TestCase):
    """Test cases for the Database Backup Manager"""
    
    def setUp(self):
        """Set up the test environment"""
        # Create temporary directory
        self.temp_dir = tempfile.mkdtemp()
        
        # Create subdirectories
        self.backup_dir = os.path.join(self.temp_dir, "backups")
        self.temp_backup_dir = os.path.join(self.temp_dir, "temp")
        os.makedirs(self.backup_dir, exist_ok=True)
        os.makedirs(self.temp_backup_dir, exist_ok=True)
        
        # Create mock resources
        self.mock_auth_manager = MockAuthManager()
        self.mock_ipfs_kit = MockIPFSKit()
        self.mock_content_index = MockContentIndexIntegration()
        self.mock_orbitdb = MockOrbitDB()
        self.mock_fireproofdb = MockFireproofDB()
        self.mock_duckdb = MockDuckDB()
        
        # Create resources dict
        self.resources = {
            "authManager": self.mock_auth_manager,
            "ipfs_kit": self.mock_ipfs_kit,
            "content_index_integration": self.mock_content_index,
            "orbitDb": self.mock_orbitdb,
            "fireproofDb": self.mock_fireproofdb,
            "duckDb": self.mock_duckdb
        }
        
        # Create metadata
        self.metadata = {
            "backup_dir": self.backup_dir,
            "temp_dir": self.temp_backup_dir,
            "auto_scheduled_backups": False  # Disable auto-scheduler for tests
        }
        
        # Create database backup manager
        self.backup_manager = DatabaseBackupManager(resources=self.resources, metadata=self.metadata)
        
        # Set up event loop for async tests
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Initialize the backup manager
        self.loop.run_until_complete(self.backup_manager.init())
    
    def tearDown(self):
        """Clean up after tests"""
        # Close the backup manager
        self.loop.run_until_complete(self.backup_manager.close())
        
        # Close event loop
        self.loop.close()
        
        # Clean up temporary directory
        import shutil
        shutil.rmtree(self.temp_dir)
    
    def test_init(self):
        """Test initialization"""
        self.assertTrue(self.backup_manager.initialized)
        self.assertEqual(self.backup_manager.config["backup_dir"], self.backup_dir)
        self.assertEqual(self.backup_manager.config["temp_dir"], self.temp_backup_dir)
    
    def test_orbitdb_backup(self):
        """Test OrbitDB backup"""
        # Create a valid token for backup
        token = "valid_token"
        
        # Backup OrbitDB
        result = self.loop.run_until_complete(
            self.backup_manager.backup_orbitdb(auth_token=token)
        )
        
        # Verify result
        self.assertTrue(result["success"])
        self.assertIn("backup_id", result)
        self.assertIn("cid", result)
        self.assertIn("timestamp", result)
        self.assertIn("collections", result)
        self.assertEqual(len(result["collections"]), 2)  # users, posts
        
        # Check that collections were properly backed up
        self.assertIn("users", result["document_count"])
        self.assertIn("posts", result["document_count"])
        self.assertEqual(result["document_count"]["users"], 2)
        self.assertEqual(result["document_count"]["posts"], 2)
        
        # Verify backup is in tracker
        backup_info = self.backup_manager.backup_tracker.get_backup("orbitdb", result["backup_id"])
        self.assertIsNotNone(backup_info)
        self.assertEqual(backup_info["cid"], result["cid"])
        
        # Verify integration with content index
        content_entry = self.loop.run_until_complete(
            self.mock_content_index.lookup_by_cid(result["cid"])
        )
        self.assertIsNotNone(content_entry)
        self.assertEqual(content_entry["cid"], result["cid"])
        self.assertTrue(content_entry["path"].startswith("/backups/orbitdb/"))
        self.assertIn("metadata", content_entry)
        self.assertEqual(content_entry["metadata"]["backup_type"], "orbitdb")
    
    def test_fireproofdb_backup(self):
        """Test FireproofDB backup"""
        # Create a valid token for backup
        token = "valid_token"
        
        # Backup FireproofDB
        result = self.loop.run_until_complete(
            self.backup_manager.backup_fireproofdb(auth_token=token)
        )
        
        # Verify result
        self.assertTrue(result["success"])
        self.assertIn("backup_id", result)
        self.assertIn("cid", result)
        self.assertIn("timestamp", result)
        self.assertIn("collections", result)
        self.assertEqual(len(result["collections"]), 2)  # products, orders
        
        # Check that collections were properly backed up
        self.assertIn("products", result["document_count"])
        self.assertIn("orders", result["document_count"])
        self.assertEqual(result["document_count"]["products"], 2)
        self.assertEqual(result["document_count"]["orders"], 2)
        
        # Verify backup is in tracker
        backup_info = self.backup_manager.backup_tracker.get_backup("fireproofdb", result["backup_id"])
        self.assertIsNotNone(backup_info)
        self.assertEqual(backup_info["cid"], result["cid"])
        
        # Verify integration with content index
        content_entry = self.loop.run_until_complete(
            self.mock_content_index.lookup_by_cid(result["cid"])
        )
        self.assertIsNotNone(content_entry)
        self.assertEqual(content_entry["cid"], result["cid"])
        self.assertTrue(content_entry["path"].startswith("/backups/fireproofdb/"))
        self.assertIn("metadata", content_entry)
        self.assertEqual(content_entry["metadata"]["backup_type"], "fireproofdb")
    
    def test_duckdb_backup(self):
        """Test DuckDB backup"""
        # Create a valid token for backup
        token = "valid_token"
        
        # Backup DuckDB using the native export
        result = self.loop.run_until_complete(
            self.backup_manager.backup_duckdb(auth_token=token)
        )
        
        # Verify result
        self.assertTrue(result["success"])
        self.assertIn("backup_id", result)
        self.assertIn("cid", result)
        self.assertIn("timestamp", result)
        self.assertIn("tables", result)
        self.assertEqual(len(result["tables"]), 2)  # users, logs
        
        # Verify backup is in tracker
        backup_info = self.backup_manager.backup_tracker.get_backup("duckdb", result["backup_id"])
        self.assertIsNotNone(backup_info)
        self.assertEqual(backup_info["cid"], result["cid"])
        
        # Verify integration with content index
        content_entry = self.loop.run_until_complete(
            self.mock_content_index.lookup_by_cid(result["cid"])
        )
        self.assertIsNotNone(content_entry)
        self.assertEqual(content_entry["cid"], result["cid"])
        self.assertTrue(content_entry["path"].startswith("/backups/duckdb/"))
        self.assertIn("metadata", content_entry)
        self.assertEqual(content_entry["metadata"]["backup_type"], "duckdb")
    
    def test_orbitdb_restore(self):
        """Test OrbitDB restore"""
        # Create a valid token for backup and restore
        token = "valid_token"
        
        # First, perform a backup
        backup_result = self.loop.run_until_complete(
            self.backup_manager.backup_orbitdb(auth_token=token)
        )
        
        # Now clear the collections
        self.mock_orbitdb.collections = {
            "users": {},
            "posts": {}
        }
        
        # Restore from backup
        restore_result = self.loop.run_until_complete(
            self.backup_manager.restore_orbitdb(
                backup_id=backup_result["backup_id"],
                auth_token=token
            )
        )
        
        # Verify result
        self.assertTrue(restore_result["success"])
        self.assertEqual(restore_result["backup_id"], backup_result["backup_id"])
        self.assertEqual(restore_result["cid"], backup_result["cid"])
        self.assertIn("collections", restore_result)
        self.assertIn("document_count", restore_result)
        
        # Verify collections were restored
        self.assertEqual(len(self.mock_orbitdb.collections["users"]), 2)
        self.assertEqual(len(self.mock_orbitdb.collections["posts"]), 2)
        
        # Check a specific document was restored
        user = self.loop.run_until_complete(
            self.mock_orbitdb.get("users", "user1")
        )
        self.assertIsNotNone(user)
        self.assertEqual(user["name"], "Test User 1")
    
    def test_fireproofdb_restore(self):
        """Test FireproofDB restore"""
        # Create a valid token for backup and restore
        token = "valid_token"
        
        # First, perform a backup
        backup_result = self.loop.run_until_complete(
            self.backup_manager.backup_fireproofdb(auth_token=token)
        )
        
        # Now clear the collections
        self.mock_fireproofdb.collections = {
            "products": {},
            "orders": {}
        }
        
        # Restore from backup
        restore_result = self.loop.run_until_complete(
            self.backup_manager.restore_fireproofdb(
                backup_id=backup_result["backup_id"],
                auth_token=token
            )
        )
        
        # Verify result
        self.assertTrue(restore_result["success"])
        self.assertEqual(restore_result["backup_id"], backup_result["backup_id"])
        self.assertEqual(restore_result["cid"], backup_result["cid"])
        self.assertIn("collections", restore_result)
        self.assertIn("document_count", restore_result)
        
        # Verify collections were restored
        self.assertEqual(len(self.mock_fireproofdb.collections["products"]), 2)
        self.assertEqual(len(self.mock_fireproofdb.collections["orders"]), 2)
        
        # Check a specific document was restored
        product = self.loop.run_until_complete(
            self.mock_fireproofdb.get("products", "product1")
        )
        self.assertIsNotNone(product)
        self.assertEqual(product["name"], "Test Product 1")
    
    def test_duckdb_restore(self):
        """Test DuckDB restore"""
        # Create a valid token for backup and restore
        token = "valid_token"
        
        # First, perform a backup
        backup_result = self.loop.run_until_complete(
            self.backup_manager.backup_duckdb(auth_token=token)
        )
        
        # Restore from backup
        restore_result = self.loop.run_until_complete(
            self.backup_manager.restore_duckdb(
                backup_id=backup_result["backup_id"],
                auth_token=token
            )
        )
        
        # Verify result
        self.assertTrue(restore_result["success"])
        self.assertEqual(restore_result["backup_id"], backup_result["backup_id"])
        self.assertEqual(restore_result["cid"], backup_result["cid"])
    
    def test_capability_verification(self):
        """Test capability verification"""
        # Test with invalid token
        with self.assertRaises(ValueError):
            self.loop.run_until_complete(
                self.backup_manager.backup_orbitdb(auth_token="invalid_token")
            )
        
        # Test with valid token
        result = self.loop.run_until_complete(
            self.backup_manager.backup_orbitdb(auth_token="valid_token")
        )
        self.assertTrue(result["success"])
        
        # Test with admin token (should work for any operation)
        result = self.loop.run_until_complete(
            self.backup_manager.backup_duckdb(auth_token="admin_token")
        )
        self.assertTrue(result["success"])
    
    def test_scheduled_backups(self):
        """Test scheduled backup creation and listing"""
        # Create a scheduled backup
        schedule = {
            "db_type": "orbitdb",
            "collections": ["users"],
            "interval": 24,  # hours
            "description": "Daily backup of users collection"
        }
        
        schedule_result = self.loop.run_until_complete(
            self.backup_manager.schedule_backup(schedule, "valid_token")
        )
        
        # Verify schedule was created
        self.assertTrue(schedule_result["success"])
        self.assertIn("schedule_id", schedule_result)
        
        # List schedules
        list_result = self.loop.run_until_complete(
            self.backup_manager.list_schedules("valid_token")
        )
        
        # Verify list
        self.assertTrue(list_result["success"])
        self.assertIn("schedules", list_result)
        self.assertEqual(len(list_result["schedules"]), 1)
        self.assertEqual(list_result["schedules"][0]["db_type"], "orbitdb")
        self.assertEqual(list_result["schedules"][0]["interval"], 24)
        
        # Delete schedule
        delete_result = self.loop.run_until_complete(
            self.backup_manager.delete_schedule(schedule_result["schedule_id"], "valid_token")
        )
        
        # Verify deletion
        self.assertTrue(delete_result["success"])
        
        # List schedules again to confirm deletion
        list_result = self.loop.run_until_complete(
            self.backup_manager.list_schedules("valid_token")
        )
        self.assertEqual(len(list_result["schedules"]), 0)
    
    def test_list_backups(self):
        """Test listing backups"""
        # Create backups of each type
        self.loop.run_until_complete(
            self.backup_manager.backup_orbitdb(auth_token="valid_token")
        )
        self.loop.run_until_complete(
            self.backup_manager.backup_fireproofdb(auth_token="valid_token")
        )
        self.loop.run_until_complete(
            self.backup_manager.backup_duckdb(auth_token="valid_token")
        )
        
        # List OrbitDB backups
        orbitdb_list = self.loop.run_until_complete(
            self.backup_manager.list_backups("orbitdb", "valid_token")
        )
        
        # Verify list
        self.assertTrue(orbitdb_list["success"])
        self.assertEqual(orbitdb_list["db_type"], "orbitdb")
        self.assertEqual(len(orbitdb_list["backups"]), 1)
        
        # List FireproofDB backups
        fireproofdb_list = self.loop.run_until_complete(
            self.backup_manager.list_backups("fireproofdb", "valid_token")
        )
        
        # Verify list
        self.assertTrue(fireproofdb_list["success"])
        self.assertEqual(fireproofdb_list["db_type"], "fireproofdb")
        self.assertEqual(len(fireproofdb_list["backups"]), 1)
        
        # List DuckDB backups
        duckdb_list = self.loop.run_until_complete(
            self.backup_manager.list_backups("duckdb", "valid_token")
        )
        
        # Verify list
        self.assertTrue(duckdb_list["success"])
        self.assertEqual(duckdb_list["db_type"], "duckdb")
        self.assertEqual(len(duckdb_list["backups"]), 1)
    
    def test_retention_policy(self):
        """Test backup retention policy"""
        # Modify retention count for test
        self.backup_manager.config["retention_count"] = 2
        
        # Create 3 backups (should keep only 2)
        for i in range(3):
            self.loop.run_until_complete(
                self.backup_manager.backup_orbitdb(auth_token="valid_token")
            )
        
        # List backups
        list_result = self.loop.run_until_complete(
            self.backup_manager.list_backups("orbitdb", "valid_token")
        )
        
        # Verify only 2 backups are kept
        self.assertEqual(len(list_result["backups"]), 2)


def run_tests():
    """Run the test suite and return results as JSON"""
    try:
        # Create test suite
        test_suite = unittest.TestSuite()
        test_suite.addTest(unittest.makeSuite(TestDatabaseBackupManager))
        
        # Run tests
        test_runner = unittest.TextTestRunner(verbosity=2)
        test_result = test_runner.run(test_suite)
        
        # Prepare result
        result = {
            "success": test_result.wasSuccessful(),
            "module": "database_backup_manager",
            "timestamp": datetime.now().isoformat(),
            "tests_run": test_result.testsRun,
            "errors": len(test_result.errors),
            "failures": len(test_result.failures)
        }
        
        # Return JSON result
        return json.dumps(result, indent=2)
    except Exception as e:
        logger.error(f"Error running tests: {e}")
        return json.dumps({
            "success": False,
            "module": "database_backup_manager",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        }, indent=2)


if __name__ == "__main__":
    print(run_tests())