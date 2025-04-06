#!/usr/bin/env python3
"""
Test Secure FireproofDB Manager

This file contains comprehensive tests for the secure_fireproofdb_manager module, 
which provides capability-based secure access to FireproofDB operations.
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
    from hallucinate_app.secure_fireproofdb_manager import (
        SecureFireproofDBManager, 
        FIREPROOFDB_CAPABILITIES
    )
    from hallucinate_app.auth import AuthManager
    MODULE_AVAILABLE = True
except ImportError as e:
    print(f"Could not import secure_fireproofdb_manager module: {e}")
    MODULE_AVAILABLE = False

# Create mock of FireproofDBKit for testing
class MockFireproofDBKit:
    """Mock of FireproofDB Kit for testing"""
    
    def __init__(self, resources=None, metadata=None):
        self.resources = resources or {}
        self.metadata = metadata or {}
        self.initialized = False
        self.databases = {}
        self.documents = {}
        self.stats = {
            "databases_created": 0,
            "databases_deleted": 0,
            "document_writes": 0,
            "document_reads": 0,
            "queries_performed": 0,
            "syncs_performed": 0,
            "exports_performed": 0,
            "imports_performed": 0,
            "last_operation": None,
            "last_operation_time": None
        }
    
    async def init(self):
        """Initialize the FireproofDB kit"""
        self.initialized = True
        return True
    
    async def create_database(self, name, options=None):
        """Create a database"""
        options = options or {}
        self.stats["databases_created"] += 1
        
        # Store in mock database tracking
        self.databases[name] = {
            "name": name,
            "created_at": datetime.utcnow().isoformat(),
            "options": options,
            "doc_count": 0
        }
        
        # Initialize document storage for this database
        if name not in self.documents:
            self.documents[name] = {}
        
        return {
            "success": True,
            "name": name,
            "created": True,
            "mock": True
        }
    
    async def delete_database(self, name):
        """Delete a database"""
        self.stats["databases_deleted"] += 1
        
        # Remove from tracking
        if name in self.databases:
            del self.databases[name]
        
        # Remove documents
        if name in self.documents:
            del self.documents[name]
        
        return {
            "name": name,
            "deleted": True,
            "mock": True
        }
    
    async def list_databases(self):
        """List all databases"""
        db_list = []
        for name, info in self.databases.items():
            db_list.append({
                "name": name,
                "doc_count": len(self.documents.get(name, {})),
                "update_seq": int(time.time() * 1000),
                "created_at": info.get("created_at"),
                "mock": True
            })
        
        return {
            "databases": db_list,
            "count": len(db_list)
        }
    
    async def put_document(self, db_name, doc):
        """Put document into database"""
        self.stats["document_writes"] += 1
        
        # Ensure database exists
        if db_name not in self.databases:
            self.create_database(db_name)
        
        # Ensure document storage exists
        if db_name not in self.documents:
            self.documents[db_name] = {}
        
        # Get or generate ID
        doc_id = doc.get("_id") or f"doc_{int(time.time() * 1000)}"
        
        # Generate revision
        import random
        import string
        rev = f"1-{''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(9))}"
        
        # Store document
        doc["_id"] = doc_id
        doc["_rev"] = rev
        self.documents[db_name][doc_id] = doc
        
        # Update document count
        if db_name in self.databases:
            self.databases[db_name]["doc_count"] = len(self.documents[db_name])
        
        return {
            "id": doc_id,
            "rev": rev,
            "success": True,
            "mock": True
        }
    
    async def get_document(self, db_name, doc_id):
        """Get document from database"""
        self.stats["document_reads"] += 1
        
        # Check if database and document exist
        if db_name in self.documents and doc_id in self.documents[db_name]:
            return self.documents[db_name][doc_id]
        
        # Return mock document if not found
        import random
        import string
        rev = f"1-{''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(9))}"
        
        return {
            "_id": doc_id,
            "_rev": rev,
            "value": f"Mock document {doc_id}",
            "mock": True
        }
    
    async def delete_document(self, db_name, doc_or_id, rev=None):
        """Delete document from database"""
        self.stats["document_writes"] += 1
        
        # Get document ID
        doc_id = doc_or_id if isinstance(doc_or_id, str) else doc_or_id.get("_id")
        
        # Check if database and document exist
        if db_name in self.documents and doc_id in self.documents[db_name]:
            del self.documents[db_name][doc_id]
            
            # Update document count
            if db_name in self.databases:
                self.databases[db_name]["doc_count"] = len(self.documents[db_name])
        
        return {
            "id": doc_id,
            "success": True,
            "mock": True
        }
    
    async def query_documents(self, db_name, field, query_options=None):
        """Query documents in database"""
        query_options = query_options or {}
        self.stats["queries_performed"] += 1
        
        # Prepare results
        mock_rows = []
        
        # Check if database exists
        if db_name in self.documents:
            # Filter documents based on field match
            prefix = query_options.get("prefix", "")
            for doc_id, doc in self.documents[db_name].items():
                if field in doc and (not prefix or str(doc[field]).startswith(prefix)):
                    mock_rows.append({
                        "id": doc_id,
                        "key": doc.get(field),
                        "value": doc.get("value", ""),
                        "doc": doc
                    })
        
        # If no matches, return some mock data
        if not mock_rows:
            import random
            import string
            
            for i in range(5):
                doc_id = f"mock_{i}_{int(time.time() * 1000)}"
                rev = f"1-{''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(9))}"
                
                mock_doc = {
                    "_id": doc_id,
                    "_rev": rev,
                    field: f"mock_value_{i}",
                    "value": f"Mock value {i}",
                    "mock": True
                }
                
                mock_rows.append({
                    "id": doc_id,
                    "key": mock_doc[field],
                    "value": mock_doc["value"],
                    "doc": mock_doc
                })
        
        return {
            "rows": mock_rows,
            "total_rows": len(mock_rows),
            "mock": True
        }
    
    async def get_all_documents(self, db_name, query_options=None):
        """Get all documents from database"""
        query_options = query_options or {}
        self.stats["document_reads"] += 1
        
        include_docs = query_options.get("include_docs", False)
        mock_rows = []
        
        # Check if database exists
        if db_name in self.documents:
            for doc_id, doc in self.documents[db_name].items():
                row = {
                    "id": doc_id,
                    "key": doc_id,
                    "value": {"rev": doc.get("_rev")}
                }
                
                if include_docs:
                    row["doc"] = doc
                
                mock_rows.append(row)
        
        # If no documents, return some mock data
        if not mock_rows:
            import random
            import string
            
            for i in range(5):
                doc_id = f"mock_{i}_{int(time.time() * 1000)}"
                rev = f"1-{''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(9))}"
                
                row = {
                    "id": doc_id,
                    "key": doc_id,
                    "value": {"rev": rev}
                }
                
                if include_docs:
                    row["doc"] = {
                        "_id": doc_id,
                        "_rev": rev,
                        "value": f"Mock document {i}",
                        "mock": True
                    }
                
                mock_rows.append(row)
        
        return {
            "rows": mock_rows,
            "total_rows": len(mock_rows),
            "mock": True
        }
    
    async def export_to_ipfs(self, db_name):
        """Export database to IPFS"""
        self.stats["exports_performed"] += 1
        
        # Generate a mock IPFS CID
        import random
        import string
        mock_cid = f"bafybeig{''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(44))}"
        
        # Document count from tracked documents or random if not found
        doc_count = len(self.documents.get(db_name, {})) if db_name in self.documents else random.randint(10, 100)
        
        return {
            "name": db_name,
            "cid": mock_cid,
            "size": random.randint(1000, 10000),
            "timestamp": int(time.time() * 1000),
            "doc_count": doc_count,
            "mock": True
        }
    
    async def import_from_ipfs(self, cid, target_db_name=None):
        """Import database from IPFS"""
        self.stats["imports_performed"] += 1
        
        # Use provided target name or generate one
        db_name = target_db_name or f"imported_db_{int(time.time() * 1000)}"
        
        # Create the database if it doesn't exist
        if db_name not in self.databases:
            await self.create_database(db_name)
        
        # Generate mock import data
        import random
        doc_count = random.randint(10, 50)
        
        return {
            "name": db_name,
            "cid": cid,
            "timestamp": int(time.time() * 1000),
            "imported": doc_count,
            "failed": 0,
            "total": doc_count,
            "mock": True
        }
    
    async def sync_database(self, db_name, target_url, sync_options=None):
        """Sync database with another instance"""
        sync_options = sync_options or {}
        self.stats["syncs_performed"] += 1
        
        # Generate mock sync data
        import random
        docs_written = random.randint(0, 20)
        docs_read = random.randint(0, 30)
        
        return {
            "name": db_name,
            "target": target_url,
            "docs_written": docs_written,
            "docs_read": docs_read,
            "success": True,
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
        
        # Hard-coded verification for testing
        return capability_string in [
            f"{FIREPROOFDB_CAPABILITIES['CREATE']}:*",
            f"{FIREPROOFDB_CAPABILITIES['DELETE']}:*",
            f"{FIREPROOFDB_CAPABILITIES['READ']}:*",
            f"{FIREPROOFDB_CAPABILITIES['WRITE']}:*",
            f"{FIREPROOFDB_CAPABILITIES['QUERY']}:*",
            f"{FIREPROOFDB_CAPABILITIES['SYNC']}:*",
            f"{FIREPROOFDB_CAPABILITIES['EXPORT']}:*",
            f"{FIREPROOFDB_CAPABILITIES['IMPORT']}:*",
            f"{FIREPROOFDB_CAPABILITIES['ADMIN']}:*",
            f"{FIREPROOFDB_CAPABILITIES['ADMIN']}:list",
            f"{FIREPROOFDB_CAPABILITIES['ADMIN']}:stats",
            # Specific database capabilities for testing
            f"{FIREPROOFDB_CAPABILITIES['WRITE']}:specific-db",
            f"{FIREPROOFDB_CAPABILITIES['READ']}:specific-db"
        ]

@unittest.skipIf(not MODULE_AVAILABLE, "Secure FireproofDB Manager module not available")
class TestSecureFireproofDBManager(unittest.TestCase):
    """Test cases for the secure_fireproofdb_manager module"""
    
    def setUp(self):
        """Set up the test case"""
        # Create mock resources
        self.mock_resources = {
            "auth": MockAuthManager(),
            "fireproofdb": MockFireproofDBKit()
        }
        
        # Create the manager with mock resources
        self.manager = SecureFireproofDBManager(resources=self.mock_resources)
        
        # Initialize auth tokens
        self.admin_token = "admin-token"
        self.create_token = "create-token"
        self.delete_token = "delete-token"
        self.write_token = "write-token"
        self.read_token = "read-token"
        self.query_token = "query-token"
        self.export_token = "export-token"
        self.import_token = "import-token"
        self.sync_token = "sync-token"
        self.specific_db_token = "specific-db-token"
        
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
    
    def test_create_database_with_valid_token(self):
        """Test database creation with valid token"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Patch verify_capability to return True for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Create a database
            result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertTrue(result["success"], "Database creation should succeed")
            self.assertEqual("test-db", result["name"], "Should return correct name")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["databases_created"], "Should track database creation")
            self.assertEqual(1, self.manager.stats["access_granted"], "Should track access grants")
    
    def test_create_database_without_token(self):
        """Test database creation without token"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Create database without token
        with self.assertRaises(ValueError):
            self.loop.run_until_complete(
                self.manager.create_database("test-db")
            )
    
    def test_create_database_with_invalid_token(self):
        """Test database creation with invalid token"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Patch verify_capability to return False for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=False):
            # Create database with invalid token
            with self.assertRaises(PermissionError):
                self.loop.run_until_complete(
                    self.manager.create_database(
                        "test-db",
                        {"auth_token": "invalid-token"}
                    )
                )
            
            # Check stats
            self.assertEqual(1, self.manager.stats["access_denied"], "Should track access denials")
    
    def test_delete_database(self):
        """Test database deletion"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create a database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-delete-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # Delete the database
            delete_result = self.loop.run_until_complete(
                self.manager.delete_database(
                    "test-delete-db",
                    {"auth_token": self.delete_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertTrue(delete_result["deleted"], "Database deletion should succeed")
            self.assertEqual("test-delete-db", delete_result["name"], "Should return correct name")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["databases_deleted"], "Should track database deletion")
    
    def test_list_databases(self):
        """Test listing databases"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Create a few databases
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            self.loop.run_until_complete(
                self.manager.create_database(
                    "test-list-db1",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            self.loop.run_until_complete(
                self.manager.create_database(
                    "test-list-db2",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # List databases
            list_result = self.loop.run_until_complete(
                self.manager.list_databases(
                    {"auth_token": self.admin_token}
                )
            )
            
            # Check result
            self.assertIn("databases", list_result, "Should include databases list")
            self.assertIn("count", list_result, "Should include count field")
            self.assertGreaterEqual(list_result["count"], 2, "Should list at least 2 databases")
    
    def test_put_document(self):
        """Test putting a document"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create a database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-put-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # Put a document
            doc = {"_id": "test-doc", "value": "test value"}
            put_result = self.loop.run_until_complete(
                self.manager.put_document(
                    "test-put-db",
                    doc,
                    {"auth_token": self.write_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertTrue(put_result["success"], "Document put should succeed")
            self.assertEqual("test-doc", put_result["id"], "Should return correct ID")
            self.assertIn("rev", put_result, "Should include revision")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["document_writes"], "Should track document writes")
    
    def test_get_document(self):
        """Test getting a document"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create a database and put a document
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-get-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # Put a document
            doc = {"_id": "test-doc", "value": "test value"}
            put_result = self.loop.run_until_complete(
                self.manager.put_document(
                    "test-get-db",
                    doc,
                    {"auth_token": self.write_token, "user_id": "test-user"}
                )
            )
            
            # Get the document
            get_result = self.loop.run_until_complete(
                self.manager.get_document(
                    "test-get-db",
                    "test-doc",
                    {"auth_token": self.read_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertEqual("test-doc", get_result["_id"], "Should return correct ID")
            self.assertEqual("test value", get_result["value"], "Should return correct value")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["document_reads"], "Should track document reads")
    
    def test_delete_document(self):
        """Test deleting a document"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create a database and put a document
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-delete-doc-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # Put a document
            doc = {"_id": "test-delete-doc", "value": "test value"}
            put_result = self.loop.run_until_complete(
                self.manager.put_document(
                    "test-delete-doc-db",
                    doc,
                    {"auth_token": self.write_token, "user_id": "test-user"}
                )
            )
            
            # Delete the document
            delete_result = self.loop.run_until_complete(
                self.manager.delete_document(
                    "test-delete-doc-db",
                    "test-delete-doc",
                    None,
                    {"auth_token": self.write_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertTrue(delete_result["success"], "Document deletion should succeed")
            self.assertEqual("test-delete-doc", delete_result["id"], "Should return correct ID")
            
            # Check stats - writes count should increase (deletes count as writes)
            self.assertEqual(2, self.manager.stats["document_writes"], "Should track document writes (including deletes)")
    
    def test_query_documents(self):
        """Test querying documents"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create a database and put some documents
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-query-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # Put some documents
            for i in range(3):
                doc = {"_id": f"test-doc-{i}", "value": f"test value {i}", "index": i}
                self.loop.run_until_complete(
                    self.manager.put_document(
                        "test-query-db",
                        doc,
                        {"auth_token": self.write_token, "user_id": "test-user"}
                    )
                )
            
            # Query documents
            query_result = self.loop.run_until_complete(
                self.manager.query_documents(
                    "test-query-db",
                    "value",
                    {"prefix": "test"},
                    {"auth_token": self.query_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertIn("rows", query_result, "Should include rows field")
            self.assertGreaterEqual(len(query_result["rows"]), 3, "Should return at least 3 documents")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["queries_performed"], "Should track queries")
    
    def test_get_all_documents(self):
        """Test getting all documents"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create a database and put some documents
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-all-docs-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # Put some documents
            for i in range(3):
                doc = {"_id": f"test-doc-{i}", "value": f"test value {i}"}
                self.loop.run_until_complete(
                    self.manager.put_document(
                        "test-all-docs-db",
                        doc,
                        {"auth_token": self.write_token, "user_id": "test-user"}
                    )
                )
            
            # Get all documents
            all_docs_result = self.loop.run_until_complete(
                self.manager.get_all_documents(
                    "test-all-docs-db",
                    {"include_docs": True},
                    {"auth_token": self.read_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertIn("rows", all_docs_result, "Should include rows field")
            self.assertGreaterEqual(len(all_docs_result["rows"]), 3, "Should return at least 3 documents")
            self.assertIn("doc", all_docs_result["rows"][0], "Should include doc field when include_docs is true")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["queries_performed"], "Should track queries")
    
    def test_export_to_ipfs(self):
        """Test exporting to IPFS"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create a database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-export-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # Export to IPFS
            export_result = self.loop.run_until_complete(
                self.manager.export_to_ipfs(
                    "test-export-db",
                    {"auth_token": self.export_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertIn("cid", export_result, "Should include CID field")
            self.assertIn("name", export_result, "Should include name field")
            self.assertEqual("test-export-db", export_result["name"], "Should return correct database name")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["exports_performed"], "Should track exports")
    
    def test_import_from_ipfs(self):
        """Test importing from IPFS"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First export a database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-pre-import-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            export_result = self.loop.run_until_complete(
                self.manager.export_to_ipfs(
                    "test-pre-import-db",
                    {"auth_token": self.export_token, "user_id": "test-user"}
                )
            )
            
            # Import from IPFS
            mock_cid = export_result["cid"]
            import_result = self.loop.run_until_complete(
                self.manager.import_from_ipfs(
                    mock_cid,
                    "test-import-db",
                    {"auth_token": self.import_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertEqual(mock_cid, import_result["cid"], "Should return correct CID")
            self.assertEqual("test-import-db", import_result["name"], "Should return correct database name")
            self.assertIn("imported", import_result, "Should include imported field")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["imports_performed"], "Should track imports")
    
    def test_sync_database(self):
        """Test syncing database"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create a database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-sync-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # Sync database
            sync_result = self.loop.run_until_complete(
                self.manager.sync_database(
                    "test-sync-db",
                    "https://example.com/sync",
                    {},
                    {"auth_token": self.sync_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertTrue(sync_result["success"], "Sync should succeed")
            self.assertEqual("test-sync-db", sync_result["name"], "Should return correct database name")
            self.assertEqual("https://example.com/sync", sync_result["target"], "Should return correct target URL")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["syncs_performed"], "Should track syncs")
    
    def test_capability_scope(self):
        """Test capability scope restrictions"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Create specific database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Create test databases
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "specific-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            other_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "other-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
        
        # Test with specific database capability
        with patch.object(self.mock_resources["auth"], "verify_capability", side_effect=lambda token, capability_string: 
             capability_string == f"{FIREPROOFDB_CAPABILITIES['WRITE']}:specific-db"):
            
            # Should succeed for specific database
            doc = {"_id": "specific-doc", "value": "specific value"}
            write_result = self.loop.run_until_complete(
                self.manager.put_document(
                    "specific-db",
                    doc,
                    {"auth_token": self.specific_db_token, "user_id": "test-user"}
                )
            )
            
            self.assertTrue(write_result["success"], "Write to specific database should succeed")
            
            # Should fail for other database
            with self.assertRaises(PermissionError):
                other_doc = {"_id": "other-doc", "value": "other value"}
                self.loop.run_until_complete(
                    self.manager.put_document(
                        "other-db",
                        other_doc,
                        {"auth_token": self.specific_db_token, "user_id": "test-user"}
                    )
                )
    
    def test_resource_tracking(self):
        """Test resource usage tracking"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Create a database and perform operations
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Create database
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-resource-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # Write documents
            for i in range(3):
                doc = {"_id": f"doc-{i}", "value": f"value-{i}"}
                self.loop.run_until_complete(
                    self.manager.put_document(
                        "test-resource-db",
                        doc,
                        {"auth_token": self.write_token, "user_id": "test-user"}
                    )
                )
            
            # Read documents
            for i in range(2):
                self.loop.run_until_complete(
                    self.manager.get_document(
                        "test-resource-db",
                        f"doc-{i}",
                        {"auth_token": self.read_token, "user_id": "test-user"}
                    )
                )
            
            # Query documents
            self.loop.run_until_complete(
                self.manager.query_documents(
                    "test-resource-db",
                    "value",
                    {},
                    {"auth_token": self.query_token, "user_id": "test-user"}
                )
            )
            
            # Call _update_resource_usage directly
            self.manager._update_resource_usage("create", "direct-db", {"user_id": "direct-user"})
            self.manager._update_resource_usage("write", "direct-db", {"user_id": "direct-user"})
            self.manager._update_resource_usage("read", "direct-db", {"user_id": "direct-user"})
            
            # Check by-database stats
            self.assertIn("test-resource-db", self.manager.resource_usage["by_database"], "Should track database usage")
            db_usage = self.manager.resource_usage["by_database"]["test-resource-db"]
            self.assertEqual(1, db_usage["creates"], "Should track creates")
            self.assertGreaterEqual(db_usage["writes"], 3, "Should track writes")
            self.assertGreaterEqual(db_usage["reads"], 2, "Should track reads")
            self.assertGreaterEqual(db_usage["queries"], 1, "Should track queries")
            
            # Check by-user stats
            self.assertIn("test-user", self.manager.resource_usage["by_user"], "Should track user usage")
            user_usage = self.manager.resource_usage["by_user"]["test-user"]
            self.assertEqual(1, user_usage["creates"], "Should track user creates")
            self.assertGreaterEqual(user_usage["writes"], 3, "Should track user writes")
            self.assertGreaterEqual(user_usage["reads"], 2, "Should track user reads")
            self.assertGreaterEqual(user_usage["queries"], 1, "Should track user queries")
            self.assertIn("test-resource-db", user_usage["databases"], "Should track user databases")
            
            # Check direct usage
            self.assertIn("direct-user", self.manager.resource_usage["by_user"], "Should track direct usage")
            direct_usage = self.manager.resource_usage["by_user"]["direct-user"]
            self.assertEqual(1, direct_usage["creates"], "Should track direct creates")
            self.assertEqual(1, direct_usage["writes"], "Should track direct writes")
            self.assertEqual(1, direct_usage["reads"], "Should track direct reads")
    
    def test_get_stats(self):
        """Test getting module statistics"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Perform various operations to generate stats
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Create database
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-stats-db",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # Write document
            doc = {"_id": "stats-doc", "value": "stats value"}
            self.loop.run_until_complete(
                self.manager.put_document(
                    "test-stats-db",
                    doc,
                    {"auth_token": self.write_token, "user_id": "test-user"}
                )
            )
            
            # Read document
            self.loop.run_until_complete(
                self.manager.get_document(
                    "test-stats-db",
                    "stats-doc",
                    {"auth_token": self.read_token, "user_id": "test-user"}
                )
            )
            
            # Get stats
            stats = self.loop.run_until_complete(
                self.manager.get_stats(
                    {"auth_token": self.admin_token}
                )
            )
            
            # Check stats fields
            self.assertIn("access_granted", stats, "Should include access_granted field")
            self.assertIn("databases_created", stats, "Should include databases_created field")
            self.assertIn("document_writes", stats, "Should include document_writes field")
            self.assertIn("document_reads", stats, "Should include document_reads field")
            self.assertIn("resource_usage", stats, "Should include resource_usage field")
            
            # Check values
            self.assertGreaterEqual(stats["access_granted"], 3, "Should track access grants")
            self.assertEqual(1, stats["databases_created"], "Should track database creation")
            self.assertEqual(1, stats["document_writes"], "Should track document writes")
            self.assertEqual(1, stats["document_reads"], "Should track document reads")
    
    def test_extract_principal_from_token(self):
        """Test principal extraction from token"""
        # This is a simple test since the real implementation would be more complex
        principal = self.manager._extract_principal_from_token("test-token")
        self.assertEqual("principal:unknown", principal, "Should return placeholder value")
    
    def test_module_test_method(self):
        """Test the module's test method"""
        # Patch various verification methods to make internal test pass
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True), \
             patch.object(self.mock_resources["auth"], "create_principal", return_value={"success": True}), \
             patch.object(self.mock_resources["auth"], "issue_capability", return_value={"token": "test-token"}):
            
            # Run module's test method
            test_result = self.loop.run_until_complete(self.manager.test())
            
            # Check test result
            self.assertIsInstance(test_result, dict, "Should return a dictionary")
            self.assertIn("module", test_result, "Should include module field")
            self.assertEqual("secure_fireproofdb_manager", test_result["module"], "Should identify correct module")
            self.assertIn("database_operations", test_result, "Should include database_operations field")


if __name__ == "__main__":
    # Run tests with detailed output
    unittest.main(verbosity=2)