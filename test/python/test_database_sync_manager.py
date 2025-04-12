#!/usr/bin/env python3
"""
Test Database Sync Manager

This file contains comprehensive tests for the database_sync_manager module,
which provides bidirectional synchronization between OrbitDB, FireproofDB, and DuckDB-IPLD.
"""

import os
import sys
import json
import time
import unittest
import asyncio
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../hallucinate_app/python')))

# Import the module to test
try:
    from hallucinate_app.database_sync_manager import (
        DatabaseSyncManager, 
        SYNC_CAPABILITIES,
        EventEmitter
    )
    MODULE_AVAILABLE = True
except ImportError as e:
    print(f"Could not import database_sync_manager module: {e}")
    MODULE_AVAILABLE = False

# Mock classes for testing
class MockOrbitDB(EventEmitter):
    """Mock OrbitDB for testing"""
    
    def __init__(self):
        super().__init__()
        self.collections = {
            "users": {},
            "posts": {},
            "comments": {}
        }
        self.initialized = False
    
    async def init(self):
        """Initialize the OrbitDB instance"""
        self.initialized = True
        return True
        
    async def get_collections(self):
        """Get list of collections"""
        return list(self.collections.keys())
        
    async def get_all(self, collection):
        """Get all documents in a collection"""
        if collection not in self.collections:
            return []
        return [{"_id": id, **doc} for id, doc in self.collections[collection].items()]
        
    async def get(self, collection, doc_id):
        """Get a specific document"""
        if collection not in self.collections or doc_id not in self.collections[collection]:
            return None
        return {"_id": doc_id, **self.collections[collection][doc_id]}
        
    async def put(self, collection, doc):
        """Add or update a document"""
        if collection not in self.collections:
            self.collections[collection] = {}
            
        doc_id = doc.get("_id")
        if not doc_id:
            return {"error": "Document ID is required"}
            
        self.collections[collection][doc_id] = {k: v for k, v in doc.items() if k != "_id"}
        self.emit("update", {"collection": collection, "docId": doc_id, "operation": "put"})
        return {"success": True, "id": doc_id}
        
    async def delete(self, collection, doc_id):
        """Delete a document"""
        if collection in self.collections and doc_id in self.collections[collection]:
            del self.collections[collection][doc_id]
            self.emit("update", {"collection": collection, "docId": doc_id, "operation": "delete"})
            return {"success": True}
        return {"success": False, "error": "Document not found"}


class MockFireproofDB(EventEmitter):
    """Mock FireproofDB for testing"""
    
    def __init__(self):
        super().__init__()
        self.collections = {
            "users": {},
            "products": {},
            "orders": {}
        }
        self.initialized = False
    
    async def init(self):
        """Initialize the FireproofDB instance"""
        self.initialized = True
        return True
        
    async def get_collections(self):
        """Get list of collections"""
        return list(self.collections.keys())
        
    async def get_all(self, collection):
        """Get all documents in a collection"""
        if collection not in self.collections:
            return []
        return [{"_id": id, **doc} for id, doc in self.collections[collection].items()]
        
    async def get(self, collection, doc_id):
        """Get a specific document"""
        if collection not in self.collections or doc_id not in self.collections[collection]:
            return None
        return {"_id": doc_id, **self.collections[collection][doc_id]}
        
    async def put(self, collection, doc):
        """Add or update a document"""
        if collection not in self.collections:
            self.collections[collection] = {}
            
        doc_id = doc.get("_id")
        if not doc_id:
            return {"error": "Document ID is required"}
            
        self.collections[collection][doc_id] = {k: v for k, v in doc.items() if k != "_id"}
        self.emit("update", {"collection": collection, "docId": doc_id, "operation": "put"})
        return {"success": True, "id": doc_id}
        
    async def delete(self, collection, doc_id):
        """Delete a document"""
        if collection in self.collections and doc_id in self.collections[collection]:
            del self.collections[collection][doc_id]
            self.emit("update", {"collection": collection, "docId": doc_id, "operation": "delete"})
            return {"success": True}
        return {"success": False, "error": "Document not found"}


class MockDuckDB:
    """Mock DuckDB for testing"""
    
    def __init__(self):
        self.tables = {
            "users": [],
            "analytics": [],
            "metrics": []
        }
        self.exported_tables = {}
        self.initialized = False
    
    async def init(self):
        """Initialize the DuckDB instance"""
        self.initialized = True
        return True
        
    async def execute(self, query):
        """Execute a SQL query"""
        # Simple "parser" to handle basic test queries
        if query.strip().upper().startswith("CREATE TABLE"):
            parts = query.split()
            table_name = parts[2].strip()
            if table_name not in self.tables:
                self.tables[table_name] = []
            return {"success": True, "rowCount": 0}
            
        elif query.strip().upper().startswith("INSERT INTO"):
            parts = query.split()
            table_name = parts[2].strip()
            return {"success": True, "rowCount": 1}
            
        elif query.strip().upper().startswith("DELETE FROM"):
            parts = query.split()
            table_name = parts[2].strip()
            return {"success": True, "rowCount": 1}
            
        return {"success": True, "rowCount": 0}
        
    async def query(self, query):
        """Execute a query and return results"""
        # Handle specific test queries
        if "information_schema.tables" in query:
            return [{"table_name": name} for name in self.tables.keys()]
            
        if "COUNT(*)" in query:
            # Extract table name from query
            parts = query.split('"')
            if len(parts) > 1:
                table_name = parts[1]
                return [{"count": len(self.tables.get(table_name, []))}]
                
        return []
        
    async def export_table_to_ipld(self, table_name):
        """Export a table to IPLD format"""
        mock_cid = f"bafybeiczsscdsbs7ffqz55qnhk{table_name}1234567890abcdef"
        self.exported_tables[table_name] = {
            "cid": mock_cid,
            "timestamp": datetime.now().isoformat()
        }
        return mock_cid
        
    async def export_table_differential_to_ipld(self, table_name, changed_rows):
        """Export table changes to IPLD format"""
        mock_cid = f"diff-{table_name}-{len(changed_rows)}"
        self.exported_tables[table_name] = {
            "cid": mock_cid,
            "differential": True,
            "timestamp": datetime.now().isoformat()
        }
        return mock_cid
        
    async def import_ipld_to_table(self, table_name, cid):
        """Import IPLD data to a table"""
        if table_name not in self.tables:
            self.tables[table_name] = []
        return {"success": True, "table": table_name, "cid": cid}
        
    async def import_differential_ipld_to_table(self, table_name, cid):
        """Import differential IPLD data to a table"""
        if table_name not in self.tables:
            self.tables[table_name] = []
        return {"success": True, "table": table_name, "cid": cid, "differential": True}


class MockAuthManager:
    """Mock Auth Manager for testing"""
    
    def __init__(self):
        self.principals = {
            "root": {"id": "root"},
            "test-user": {"id": "test-user"}
        }
        self.capability_tokens = {}
        self.initialized = False
        
    async def init(self):
        """Initialize the auth manager"""
        self.initialized = True
        return True
        
    def get_self_signed_token(self, capability):
        """Get a self-signed token for a capability"""
        token = f"self-signed-{capability}-{int(datetime.now().timestamp())}"
        return token
        
    async def verify_capability(self, token, capability_string):
        """Verify a capability token"""
        # Allow all test tokens
        if token and (token.startswith("test-") or token.startswith("self-signed-")):
            return {"verified": True}
        return {"verified": False}
        
    async def create_principal(self, id):
        """Create a principal"""
        if id not in self.principals:
            self.principals[id] = {"id": id}
        return self.principals[id]
        
    async def issue_capability(self, issuer, audience, capability):
        """Issue a capability token"""
        token = f"test-{issuer}-{audience}-{capability['can']}"
        self.capability_tokens[token] = {
            "issuer": issuer,
            "audience": audience,
            "capability": capability
        }
        return {"token": token}


class MockIPFSKit:
    """Mock IPFS Kit for testing"""
    
    def __init__(self):
        self.pins = {}
        self.initialized = False
        
    async def init(self):
        """Initialize IPFS Kit"""
        self.initialized = True
        return True
        
    async def add(self, data):
        """Add data to IPFS"""
        mock_cid = f"bafybeiczsscdsbs7ffqz{len(str(data))}5ased"
        self.pins[mock_cid] = {
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        return {"cid": mock_cid}
        
    async def get(self, cid):
        """Get data from IPFS"""
        if cid in self.pins:
            return self.pins[cid]["data"]
        return None


class MockLibp2p:
    """Mock libp2p for testing"""
    
    class PubSub:
        def __init__(self):
            self.subscriptions = {}
            self.published_messages = []
            
        async def subscribe(self, topic, callback):
            """Subscribe to a topic"""
            self.subscriptions[topic] = callback
            return {"success": True, "topic": topic}
            
        async def publish(self, topic, message):
            """Publish a message to a topic"""
            self.published_messages.append({
                "topic": topic,
                "message": message,
                "timestamp": datetime.now().isoformat()
            })
            
            # Call subscriber callbacks if any
            if topic in self.subscriptions:
                callback = self.subscriptions[topic]
                await callback({"data": message, "from_peer": "test-peer-id"})
                
            return {"success": True}
            
        async def unsubscribe(self, topic):
            """Unsubscribe from a topic"""
            if topic in self.subscriptions:
                del self.subscriptions[topic]
            return {"success": True}
    
    def __init__(self):
        self.pubsub = self.PubSub()
        self.initialized = False
        
    async def init(self):
        """Initialize libp2p"""
        self.initialized = True
        return True


@unittest.skipIf(not MODULE_AVAILABLE, "Database Sync Manager module not available")
class TestDatabaseSyncManager(unittest.TestCase):
    """Test cases for the Database Sync Manager"""
    
    def setUp(self):
        """Set up test resources"""
        # Create mocks
        self.mock_orbit_db = MockOrbitDB()
        self.mock_fireproof_db = MockFireproofDB()
        self.mock_duck_db = MockDuckDB()
        self.mock_auth_manager = MockAuthManager()
        self.mock_ipfs_kit = MockIPFSKit()
        self.mock_libp2p = MockLibp2p()
        
        # Create temporary sync directory
        self.temp_dir = os.path.join(os.path.dirname(__file__), "temp_sync")
        os.makedirs(self.temp_dir, exist_ok=True)
        
        # Create resources dict
        self.resources = {
            "orbitDb": self.mock_orbit_db,
            "fireproofDb": self.mock_fireproof_db,
            "duckDb": self.mock_duck_db,
            "authManager": self.mock_auth_manager,
            "ipfsKit": self.mock_ipfs_kit,
            "libp2pKit": self.mock_libp2p
        }
        
        # Create metadata
        self.metadata = {
            "syncDir": self.temp_dir,
            "autoSync": False,  # Disable auto-sync for tests
            "syncInterval": 1000,  # 1 second for faster testing
            "selectiveMirroringRules": {
                "orbitdb-to-fireproofdb": {
                    "include": ["users"],
                    "exclude": ["private_data"],
                    "includePatterns": ["^public_.*"],
                    "excludePatterns": ["^temp_.*"],
                    "defaultInclude": True
                }
            }
        }
        
        # Create event loop for async tests
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Create sync manager
        self.sync_manager = DatabaseSyncManager(resources=self.resources, metadata=self.metadata)
        
        # Initialize the sync manager
        self.loop.run_until_complete(self.sync_manager.init())
    
    def tearDown(self):
        """Clean up after tests"""
        # Close the sync manager
        if hasattr(self, "sync_manager"):
            self.loop.run_until_complete(self.sync_manager.close())
        
        # Close the event loop
        if hasattr(self, "loop"):
            self.loop.close()
        
        # Clean up temp directory
        import shutil
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_initialization(self):
        """Test initialization of the sync manager"""
        self.assertTrue(hasattr(self.sync_manager, "initialized"))
        self.assertIsNotNone(self.sync_manager.resources.get("orbitDb"))
        self.assertIsNotNone(self.sync_manager.resources.get("fireproofDb"))
        self.assertIsNotNone(self.sync_manager.resources.get("duckDb"))
        self.assertIsNotNone(self.sync_manager.resources.get("authManager"))
        self.assertIsNotNone(self.sync_manager.resources.get("ipfsKit"))
        self.assertIsNotNone(self.sync_manager.resources.get("libp2pKit"))
    
    def test_orbitdb_to_fireproofdb_sync(self):
        """Test synchronization from OrbitDB to FireproofDB"""
        # Add some documents to OrbitDB
        user_doc = {"_id": "user1", "name": "Test User", "email": "test@example.com"}
        post_doc = {"_id": "post1", "title": "Test Post", "content": "Test Content"}
        
        # Add documents to orbit db
        self.loop.run_until_complete(self.mock_orbit_db.put("users", user_doc))
        self.loop.run_until_complete(self.mock_orbit_db.put("posts", post_doc))
        
        # Get test token
        auth_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_ORBITDB_TO_FIREPROOFDB"])
        
        # Sync to FireproofDB
        result = self.loop.run_until_complete(
            self.sync_manager.sync_orbitdb_to_fireproofdb(auth_token=auth_token)
        )
        
        # Check if the documents were synced to FireproofDB
        self.assertTrue(result["success"])
        
        # Verify that documents were added to FireproofDB
        user_in_fireproof = self.loop.run_until_complete(
            self.mock_fireproof_db.get("users", "user1")
        )
        post_in_fireproof = self.loop.run_until_complete(
            self.mock_fireproof_db.get("posts", "post1")
        )
        
        self.assertIsNotNone(user_in_fireproof)
        self.assertEqual(user_in_fireproof["name"], "Test User")
        self.assertIsNotNone(post_in_fireproof)
        self.assertEqual(post_in_fireproof["title"], "Test Post")
        
        # Verify sync state was updated
        self.assertGreater(self.sync_manager.sync_state["lastOrbitDBSync"], 0)
    
    def test_fireproofdb_to_orbitdb_sync(self):
        """Test synchronization from FireproofDB to OrbitDB"""
        # Add some documents to FireproofDB
        product_doc = {"_id": "product1", "name": "Test Product", "price": 99.99}
        order_doc = {"_id": "order1", "product": "product1", "quantity": 2}
        
        # Add documents to fireproof db
        self.loop.run_until_complete(self.mock_fireproof_db.put("products", product_doc))
        self.loop.run_until_complete(self.mock_fireproof_db.put("orders", order_doc))
        
        # Get test token
        auth_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_FIREPROOFDB_TO_ORBITDB"])
        
        # Sync to OrbitDB
        result = self.loop.run_until_complete(
            self.sync_manager.sync_fireproofdb_to_orbitdb(auth_token=auth_token)
        )
        
        # Check if the documents were synced to OrbitDB
        self.assertTrue(result["success"])
        
        # Verify that documents were added to OrbitDB
        product_in_orbit = self.loop.run_until_complete(
            self.mock_orbit_db.get("products", "product1")
        )
        order_in_orbit = self.loop.run_until_complete(
            self.mock_orbit_db.get("orders", "order1")
        )
        
        self.assertIsNotNone(product_in_orbit)
        self.assertEqual(product_in_orbit["name"], "Test Product")
        self.assertIsNotNone(order_in_orbit)
        self.assertEqual(order_in_orbit["quantity"], 2)
        
        # Verify sync state was updated
        self.assertGreater(self.sync_manager.sync_state["lastFireproofDBSync"], 0)
    
    def test_duckdb_export_to_ipld(self):
        """Test exporting DuckDB tables to IPLD"""
        # Add some data to DuckDB
        self.loop.run_until_complete(
            self.mock_duck_db.execute("""
                CREATE TABLE test_analytics (
                    id VARCHAR,
                    value DOUBLE
                )
            """)
        )
        
        self.loop.run_until_complete(
            self.mock_duck_db.execute("""
                INSERT INTO test_analytics VALUES ('record1', 123.45)
            """)
        )
        
        # Get test token
        export_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_DUCKDB_EXPORT_IPLD"])
        
        # Export to IPLD
        export_result = self.loop.run_until_complete(
            self.sync_manager.export_duckdb_to_ipld(
                auth_token=export_token,
                tables=["test_analytics"],
                differential=False
            )
        )
        
        # Check export success
        self.assertTrue(export_result["success"])
        self.assertIn("test_analytics", export_result["results"]["tables"])
        
        # Verify CID format
        cid = export_result["results"]["tables"]["test_analytics"]["cid"]
        self.assertTrue(cid.startswith("bafybeiczsscdsbs7ffqz55qnhk"))
        
        # Verify stats
        self.assertEqual(export_result["stats"]["tables"], 1)
        self.assertEqual(export_result["stats"]["fullExport"], 1)
        
        # Verify sync state was updated
        self.assertGreater(self.sync_manager.sync_state["lastDuckDBExport"], 0)
    
    def test_duckdb_import_from_ipld(self):
        """Test importing IPLD data into DuckDB"""
        # Export a table first to get a CID
        self.loop.run_until_complete(
            self.mock_duck_db.execute("""
                CREATE TABLE test_import (
                    id VARCHAR,
                    value DOUBLE
                )
            """)
        )
        
        # Get test tokens
        export_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_DUCKDB_EXPORT_IPLD"])
        import_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_DUCKDB_IMPORT_IPLD"])
        
        # Export to IPLD
        export_result = self.loop.run_until_complete(
            self.sync_manager.export_duckdb_to_ipld(
                auth_token=export_token,
                tables=["test_import"]
            )
        )
        
        # Get CID
        cid = export_result["results"]["tables"]["test_import"]["cid"]
        
        # Import from IPLD
        import_result = self.loop.run_until_complete(
            self.sync_manager.import_ipld_to_duckdb(
                auth_token=import_token,
                table_data={"test_import": {"cid": cid}}
            )
        )
        
        # Check import success
        self.assertTrue(import_result["success"])
        self.assertIn("test_import", import_result["results"]["tables"])
        
        # Verify stats
        self.assertEqual(import_result["stats"]["tables"], 1)
        self.assertEqual(import_result["stats"]["fullImport"], 1)
        
        # Verify sync state was updated
        self.assertGreater(self.sync_manager.sync_state["lastDuckDBImport"], 0)
    
    def test_differential_updates(self):
        """Test differential updates for DuckDB export/import"""
        # Setup a table with change tracking
        self.loop.run_until_complete(
            self.mock_duck_db.execute("""
                CREATE TABLE diff_test (
                    id VARCHAR,
                    value DOUBLE
                )
            """)
        )
        
        # Manually add change tracking for this table
        self.sync_manager.sync_state["changeLog"] = {
            "diff_test": {
                "changes": 10,
                "total": 100,
                "changedRows": ["row1", "row2", "row3"],
                "lastExport": int(time.time() * 1000) - 60000
            }
        }
        
        # Get export token
        export_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_DUCKDB_EXPORT_IPLD"])
        
        # Export differentially (since changes/total < threshold)
        export_result = self.loop.run_until_complete(
            self.sync_manager.export_duckdb_to_ipld(
                auth_token=export_token,
                tables=["diff_test"],
                differential=True
            )
        )
        
        # Check export success and method
        self.assertTrue(export_result["success"])
        self.assertEqual(export_result["stats"]["differential"], 1)
        self.assertEqual(export_result["stats"]["fullExport"], 0)
    
    def test_selective_mirroring(self):
        """Test selective mirroring rules"""
        # Add documents to different collections
        self.loop.run_until_complete(self.mock_orbit_db.put("users", {"_id": "u1", "name": "User"}))
        self.loop.run_until_complete(self.mock_orbit_db.put("private_data", {"_id": "p1", "secret": "Secret"}))
        self.loop.run_until_complete(self.mock_orbit_db.put("public_posts", {"_id": "pp1", "title": "Public"}))
        self.loop.run_until_complete(self.mock_orbit_db.put("temp_data", {"_id": "t1", "value": "Temp"}))
        
        # Get sync token
        auth_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_ORBITDB_TO_FIREPROOFDB"])
        
        # Run sync with selective mirroring rules
        result = self.loop.run_until_complete(
            self.sync_manager.sync_orbitdb_to_fireproofdb(auth_token=auth_token)
        )
        
        # Verify mirroring rules were applied
        # "users" should be included (explicit include)
        user_in_fireproof = self.loop.run_until_complete(
            self.mock_fireproof_db.get("users", "u1")
        )
        self.assertIsNotNone(user_in_fireproof)
        
        # "private_data" should be excluded (explicit exclude)
        private_in_fireproof = self.loop.run_until_complete(
            self.mock_fireproof_db.get("private_data", "p1")
        )
        self.assertIsNone(private_in_fireproof)
        
        # "public_posts" should be included (pattern include)
        public_in_fireproof = self.loop.run_until_complete(
            self.mock_fireproof_db.get("public_posts", "pp1")
        )
        self.assertIsNotNone(public_in_fireproof)
        
        # "temp_data" should be excluded (pattern exclude)
        temp_in_fireproof = self.loop.run_until_complete(
            self.mock_fireproof_db.get("temp_data", "t1")
        )
        self.assertIsNone(temp_in_fireproof)
    
    def test_conflict_resolution(self):
        """Test conflict resolution between databases"""
        # Create conflicting documents
        orbit_doc = {
            "_id": "conflict1",
            "name": "Orbit Version",
            "updatedAt": int(time.time() * 1000) - 1000,
            "_rev": "1"
        }
        
        fireproof_doc = {
            "_id": "conflict1",
            "name": "Fireproof Version",
            "updatedAt": int(time.time() * 1000),
            "_rev": "2"
        }
        
        # Add to both databases
        self.loop.run_until_complete(self.mock_orbit_db.put("test_conflicts", orbit_doc))
        self.loop.run_until_complete(self.mock_fireproof_db.put("test_conflicts", fireproof_doc))
        
        # Get test token
        auth_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_ORBITDB_TO_FIREPROOFDB"])
        
        # Sync (this should cause conflict)
        result = self.loop.run_until_complete(
            self.sync_manager.sync_orbitdb_to_fireproofdb(auth_token=auth_token)
        )
        
        # Check that conflicts were handled
        self.assertTrue(result["success"])
        self.assertTrue(result["stats"]["conflicts"] > 0)
        
        # Check resolution (fireproof version should win as it's newer)
        resolved_doc = self.loop.run_until_complete(
            self.mock_fireproof_db.get("test_conflicts", "conflict1")
        )
        
        self.assertEqual(resolved_doc["name"], "Fireproof Version")
        
        # Verify conflict log was updated
        self.assertTrue(len(self.sync_manager.sync_state["conflictLog"]) > 0)
    
    def test_conflict_resolution_crdt(self):
        """Test CRDT-based conflict resolution"""
        # Set conflict strategy to CRDT
        self.sync_manager.config["conflictStrategy"] = "crdt"
        
        # Create documents with different fields
        orbit_doc = {
            "_id": "merge1",
            "name": "CRDT Test",
            "field1": "From Orbit",
            "updatedAt": int(time.time() * 1000) - 1000,
            "_rev": "1"
        }
        
        fireproof_doc = {
            "_id": "merge1",
            "name": "CRDT Test",
            "field2": "From Fireproof",
            "updatedAt": int(time.time() * 1000),
            "_rev": "2"
        }
        
        # Add to both databases
        self.loop.run_until_complete(self.mock_orbit_db.put("test_crdt", orbit_doc))
        self.loop.run_until_complete(self.mock_fireproof_db.put("test_crdt", fireproof_doc))
        
        # Get test token
        auth_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_ORBITDB_TO_FIREPROOFDB"])
        
        # Sync (this should merge fields)
        result = self.loop.run_until_complete(
            self.sync_manager.sync_orbitdb_to_fireproofdb(auth_token=auth_token)
        )
        
        # Check that conflicts were handled
        self.assertTrue(result["success"])
        self.assertTrue(result["stats"]["conflicts"] > 0)
        
        # Check resolution (should have fields from both)
        resolved_doc = self.loop.run_until_complete(
            self.mock_fireproof_db.get("test_crdt", "merge1")
        )
        
        self.assertEqual(resolved_doc["name"], "CRDT Test")
        self.assertEqual(resolved_doc["field1"], "From Orbit")
        self.assertEqual(resolved_doc["field2"], "From Fireproof")
    
    def test_conflict_resolution_newest(self):
        """Test newest-based conflict resolution"""
        # Set conflict strategy to newest
        self.sync_manager.config["conflictStrategy"] = "newest"
        
        # Create documents with different timestamps
        orbit_doc = {
            "_id": "newest1",
            "name": "Older Version",
            "content": "Old content",
            "updatedAt": int(time.time() * 1000) - 5000,
            "_rev": "1"
        }
        
        fireproof_doc = {
            "_id": "newest1",
            "name": "Newer Version",
            "content": "New content",
            "updatedAt": int(time.time() * 1000),
            "_rev": "2"
        }
        
        # Add to both databases
        self.loop.run_until_complete(self.mock_orbit_db.put("test_newest", orbit_doc))
        self.loop.run_until_complete(self.mock_fireproof_db.put("test_newest", fireproof_doc))
        
        # Get test token
        auth_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_ORBITDB_TO_FIREPROOFDB"])
        
        # Sync (this should use newest doc)
        result = self.loop.run_until_complete(
            self.sync_manager.sync_orbitdb_to_fireproofdb(auth_token=auth_token)
        )
        
        # Check that conflicts were handled
        self.assertTrue(result["success"])
        self.assertTrue(result["stats"]["conflicts"] > 0)
        
        # Check resolution (should be newer version)
        resolved_doc = self.loop.run_until_complete(
            self.mock_fireproof_db.get("test_newest", "newest1")
        )
        
        self.assertEqual(resolved_doc["name"], "Newer Version")
        self.assertEqual(resolved_doc["content"], "New content")
    
    def test_all_databases_sync(self):
        """Test syncing all databases together"""
        # Add test data to each database
        orbit_doc = {"_id": "from_orbit", "source": "OrbitDB"}
        fireproof_doc = {"_id": "from_fireproof", "source": "FireproofDB"}
        
        self.loop.run_until_complete(self.mock_orbit_db.put("test_sync", orbit_doc))
        self.loop.run_until_complete(self.mock_fireproof_db.put("test_sync", fireproof_doc))
        
        # Create test table in DuckDB
        self.loop.run_until_complete(
            self.mock_duck_db.execute("""
                CREATE TABLE test_sync (
                    id VARCHAR,
                    source VARCHAR
                )
            """)
        )
        
        # Get admin token
        admin_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_ADMIN"])
        
        # Run full sync
        result = self.loop.run_until_complete(
            self.sync_manager.sync_all(auth_token=admin_token)
        )
        
        # Check overall success
        self.assertTrue(result["success"])
        
        # Check component success
        self.assertTrue(result["results"]["orbitToFireproof"]["success"])
        self.assertTrue(result["results"]["fireproofToOrbit"]["success"])
        self.assertTrue(result["results"]["duckdbExport"]["success"])
        self.assertTrue(result["results"]["duckdbImport"]["success"])
        
        # Verify bidirectional sync
        orbit_has_fireproof = self.loop.run_until_complete(
            self.mock_orbit_db.get("test_sync", "from_fireproof")
        )
        fireproof_has_orbit = self.loop.run_until_complete(
            self.mock_fireproof_db.get("test_sync", "from_orbit")
        )
        
        self.assertIsNotNone(orbit_has_fireproof)
        self.assertEqual(orbit_has_fireproof["source"], "FireproofDB")
        self.assertIsNotNone(fireproof_has_orbit)
        self.assertEqual(fireproof_has_orbit["source"], "OrbitDB")
        
        # Verify timestamps updated
        self.assertGreater(self.sync_manager.sync_state["lastOrbitDBSync"], 0)
        self.assertGreater(self.sync_manager.sync_state["lastFireproofDBSync"], 0)
        self.assertGreater(self.sync_manager.sync_state["lastDuckDBExport"], 0)
        self.assertGreater(self.sync_manager.sync_state["lastDuckDBImport"], 0)
    
    def test_event_handling(self):
        """Test event handling for database changes"""
        # Track events
        received_events = []
        
        def on_change(event):
            received_events.append(event)
        
        # Register event listener
        self.sync_manager.on("change", on_change)
        
        # Trigger changes in both databases
        self.loop.run_until_complete(
            self.mock_orbit_db.put("test_events", {"_id": "orbit_event", "value": "test"})
        )
        
        self.loop.run_until_complete(
            self.mock_fireproof_db.put("test_events", {"_id": "fireproof_event", "value": "test"})
        )
        
        # Verify events were received
        self.assertGreaterEqual(len(received_events), 2)
        
        # Check event types
        event_types = [e.get("type") for e in received_events]
        self.assertIn("orbitdb", event_types)
        self.assertIn("fireproofdb", event_types)
    
    def test_libp2p_message_handling(self):
        """Test handling of libp2p messages"""
        # Create a test message
        test_message = {
            "type": "duckdb-export",
            "table": "shared_table",
            "cid": "bafybeiczsscdsbs7ffqz55qnhktest",
            "method": "full",
            "timestamp": int(time.time() * 1000)
        }
        
        # Track events
        received_events = []
        
        def on_peer_sync(event):
            received_events.append(event)
        
        # Register event listener
        self.sync_manager.on("peer-sync", on_peer_sync)
        
        # Publish a message to the topic
        self.loop.run_until_complete(
            self.mock_libp2p.pubsub.publish(
                self.sync_manager.config["pubsubTopic"],
                json.dumps(test_message).encode("utf-8")
            )
        )
        
        # Verify event was received
        self.assertGreaterEqual(len(received_events), 1)
        self.assertEqual(received_events[0]["type"], "duckdb-export")
        self.assertEqual(received_events[0]["table"], "shared_table")
    
    def test_auto_sync(self):
        """Test automatic synchronization"""
        # Enable auto-sync
        self.sync_manager.config["autoSync"] = True
        
        # Start auto-sync
        result = self.sync_manager.start_auto_sync()
        self.assertTrue(result["success"])
        
        # Verify timer is started
        self.assertIsNotNone(self.sync_manager.sync_timer)
        
        # Stop auto-sync
        stop_result = self.sync_manager.stop_auto_sync()
        self.assertTrue(stop_result["success"])
        
        # Verify timer is stopped
        self.assertIsNone(self.sync_manager.sync_timer)
    
    def test_database_sync_manager_test_method(self):
        """Test the module's test method"""
        # Run the built-in test method
        test_result = self.loop.run_until_complete(self.sync_manager.test())
        
        # Check test result
        self.assertTrue(test_result["success"])
        self.assertIn("results", test_result)
        self.assertIn("orbitDB", test_result["results"])
        self.assertIn("fireproofDB", test_result["results"])
        self.assertIn("duckDB", test_result["results"])
        self.assertIn("ipldExport", test_result["results"])


if __name__ == "__main__":
    unittest.main(verbosity=2)