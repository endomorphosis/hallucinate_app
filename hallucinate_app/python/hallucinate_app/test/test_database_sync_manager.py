"""
Test module for Database Sync Manager

Tests bidirectional synchronization between OrbitDB, FireproofDB, and DuckDB-IPLD databases
"""

import os
import sys
import json
import asyncio
import unittest
import logging
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_database_sync_manager")

# Add parent directory to path to import local modules
parent_dir = str(Path(__file__).parent.parent)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

# Import the module to test
try:
    from database_sync_manager import DatabaseSyncManager, SYNC_CAPABILITIES
    has_module = True
except ImportError as e:
    logger.error(f"Failed to import DatabaseSyncManager: {e}")
    has_module = False


class MockEventEmitter:
    """Simple mock event emitter for testing"""
    
    def __init__(self):
        self.events = {}
        self.emitted_events = []
        
    def on(self, event_name, callback):
        if event_name not in self.events:
            self.events[event_name] = []
        self.events[event_name].append(callback)
        
    def emit(self, event_name, data=None):
        self.emitted_events.append((event_name, data))
        if event_name in self.events:
            for callback in self.events[event_name]:
                callback(data)
                
    def remove_listener(self, event_name, callback):
        if event_name in self.events:
            self.events[event_name] = [cb for cb in self.events[event_name] if cb != callback]


class MockOrbitDB(MockEventEmitter):
    """Mock OrbitDB for testing"""
    
    def __init__(self):
        super().__init__()
        self.collections = {
            "users": {},
            "posts": {},
            "comments": {}
        }
        
    async def get_collections(self):
        return list(self.collections.keys())
        
    async def get_all(self, collection):
        if collection not in self.collections:
            return []
        return [{"_id": id, **doc} for id, doc in self.collections[collection].items()]
        
    async def get(self, collection, doc_id):
        if collection not in self.collections or doc_id not in self.collections[collection]:
            return None
        return {"_id": doc_id, **self.collections[collection][doc_id]}
        
    async def put(self, collection, doc):
        if collection not in self.collections:
            self.collections[collection] = {}
            
        doc_id = doc.get("_id")
        if not doc_id:
            return {"error": "Document ID is required"}
            
        self.collections[collection][doc_id] = {k: v for k, v in doc.items() if k != "_id"}
        self.emit("update", {"collection": collection, "docId": doc_id, "operation": "put"})
        return {"success": True, "id": doc_id}
        
    async def delete(self, collection, doc_id):
        if collection in self.collections and doc_id in self.collections[collection]:
            del self.collections[collection][doc_id]
            self.emit("update", {"collection": collection, "docId": doc_id, "operation": "delete"})
            return {"success": True}
        return {"success": False, "error": "Document not found"}


class MockFireproofDB(MockEventEmitter):
    """Mock FireproofDB for testing"""
    
    def __init__(self):
        super().__init__()
        self.collections = {
            "users": {},
            "products": {},
            "orders": {}
        }
        
    async def get_collections(self):
        return list(self.collections.keys())
        
    async def get_all(self, collection):
        if collection not in self.collections:
            return []
        return [{"_id": id, **doc} for id, doc in self.collections[collection].items()]
        
    async def get(self, collection, doc_id):
        if collection not in self.collections or doc_id not in self.collections[collection]:
            return None
        return {"_id": doc_id, **self.collections[collection][doc_id]}
        
    async def put(self, collection, doc):
        if collection not in self.collections:
            self.collections[collection] = {}
            
        doc_id = doc.get("_id")
        if not doc_id:
            return {"error": "Document ID is required"}
            
        self.collections[collection][doc_id] = {k: v for k, v in doc.items() if k != "_id"}
        self.emit("update", {"collection": collection, "docId": doc_id, "operation": "put"})
        return {"success": True, "id": doc_id}
        
    async def delete(self, collection, doc_id):
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
        
    async def execute(self, query):
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
        mock_cid = f"bafybeiczsscdsbs7ffqz55qnhk{table_name}1234567890abcdef"
        self.exported_tables[table_name] = {
            "cid": mock_cid,
            "timestamp": datetime.now().isoformat()
        }
        return mock_cid
        
    async def export_table_differential_to_ipld(self, table_name, changed_rows):
        mock_cid = f"diff-{table_name}-{len(changed_rows)}"
        self.exported_tables[table_name] = {
            "cid": mock_cid,
            "differential": True,
            "timestamp": datetime.now().isoformat()
        }
        return mock_cid
        
    async def import_ipld_to_table(self, table_name, cid):
        if table_name not in self.tables:
            self.tables[table_name] = []
        return {"success": True, "table": table_name, "cid": cid}
        
    async def import_differential_ipld_to_table(self, table_name, cid):
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
        self.initialized = True
        
    async def init(self):
        self.initialized = True
        return True
        
    def get_self_signed_token(self, capability):
        token = f"self-signed-mock-{capability}-{int(datetime.now().timestamp())}"
        return token
        
    async def verify_capability(self, token, capability_string):
        # Allow all test tokens
        if token and (token.startswith("test-") or token.startswith("self-signed-mock-")):
            return True
        return False
        
    async def create_principal(self, id):
        if id not in self.principals:
            self.principals[id] = {"id": id}
        return self.principals[id]
        
    async def issue_capability(self, issuer, audience, capability):
        token = f"test-{issuer}-{audience}-{capability['can']}"
        self.capability_tokens[token] = {
            "issuer": issuer,
            "audience": audience,
            "capability": capability
        }
        return {"token": token}


class MockLibp2p:
    """Mock libp2p for testing"""
    
    def __init__(self):
        self.pubsub_messages = []
        
    class PubSub:
        def __init__(self):
            self.subscriptions = {}
            self.published_messages = []
            
        async def subscribe(self, topic, callback):
            self.subscriptions[topic] = callback
            return {"success": True, "topic": topic}
            
        async def publish(self, topic, message):
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
            if topic in self.subscriptions:
                del self.subscriptions[topic]
            return {"success": True}
    
    def __init__(self):
        self.pubsub = self.PubSub()
        

class MockIPFSKit:
    """Mock IPFS Kit for testing"""
    
    def __init__(self):
        self.pins = {}
        
    async def init(self):
        return True
        
    async def add(self, data):
        mock_cid = f"bafybeiczsscdsbs7ffqz{len(str(data))}5ased"
        self.pins[mock_cid] = {
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        return {"cid": mock_cid}
        
    async def get(self, cid):
        if cid in self.pins:
            return self.pins[cid]["data"]
        return None


@unittest.skipIf(not has_module, "DatabaseSyncManager module not available")
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
            "autoSync": False  # Disable auto-sync for tests
        }
        
        # Create event loop for async tests
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Create database sync manager
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
        self.assertTrue(self.sync_manager.initialized)
        self.assertIsNotNone(self.sync_manager.resources.get("orbitDb"))
        self.assertIsNotNone(self.sync_manager.resources.get("fireproofDb"))
        self.assertIsNotNone(self.sync_manager.resources.get("duckDb"))
        self.assertIsNotNone(self.sync_manager.resources.get("authManager"))
    
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
    
    def test_duckdb_export_import(self):
        """Test DuckDB export and import to/from IPLD"""
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
        
        # Get test tokens
        export_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_DUCKDB_EXPORT_IPLD"])
        import_token = self.mock_auth_manager.get_self_signed_token(SYNC_CAPABILITIES["SYNC_DUCKDB_IMPORT_IPLD"])
        
        # Export to IPLD
        export_result = self.loop.run_until_complete(
            self.sync_manager.export_duckdb_to_ipld(
                auth_token=export_token,
                tables=["test_analytics"]
            )
        )
        
        # Check export success
        self.assertTrue(export_result["success"])
        self.assertIn("test_analytics", export_result["results"]["tables"])
        
        # Get CID
        cid = export_result["results"]["tables"]["test_analytics"]["cid"]
        
        # Import from IPLD
        import_result = self.loop.run_until_complete(
            self.sync_manager.import_ipld_to_duckdb(
                auth_token=import_token,
                table_data={"test_analytics": {"cid": cid}}
            )
        )
        
        # Check import success
        self.assertTrue(import_result["success"])
        self.assertIn("test_analytics", import_result["results"]["tables"])
    
    def test_conflict_resolution(self):
        """Test conflict resolution between databases"""
        # Create conflicting documents
        orbit_doc = {
            "_id": "doc1",
            "name": "Orbit Version",
            "updatedAt": int(datetime.now().timestamp() * 1000) - 1000,
            "_rev": "1"
        }
        
        fireproof_doc = {
            "_id": "doc1",
            "name": "Fireproof Version",
            "updatedAt": int(datetime.now().timestamp() * 1000),
            "_rev": "2"
        }
        
        # Add to both databases
        self.loop.run_until_complete(self.mock_orbit_db.put("users", orbit_doc))
        self.loop.run_until_complete(self.mock_fireproof_db.put("users", fireproof_doc))
        
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
            self.mock_fireproof_db.get("users", "doc1")
        )
        
        self.assertEqual(resolved_doc["name"], "Fireproof Version")
    
    def test_full_sync(self):
        """Test full sync across all databases"""
        # Add some test data
        orbit_doc = {"_id": "orbit1", "source": "orbit"}
        fireproof_doc = {"_id": "fireproof1", "source": "fireproof"}
        
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
        
        # Verify bidirectional sync
        orbit_has_fireproof = self.loop.run_until_complete(
            self.mock_orbit_db.get("test_sync", "fireproof1")
        )
        fireproof_has_orbit = self.loop.run_until_complete(
            self.mock_fireproof_db.get("test_sync", "orbit1")
        )
        
        self.assertIsNotNone(orbit_has_fireproof)
        self.assertEqual(orbit_has_fireproof["source"], "fireproof")
        self.assertIsNotNone(fireproof_has_orbit)
        self.assertEqual(fireproof_has_orbit["source"], "orbit")


def run_tests():
    """Run all tests"""
    unittest.main()


if __name__ == "__main__":
    run_tests()