#!/usr/bin/env python3
"""
Test Secure OrbitDB Manager

This file contains comprehensive tests for the secure_orbitdb_manager module, 
which provides capability-based secure access to OrbitDB operations.
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
    from hallucinate_app.secure_orbitdb_manager import (
        SecureOrbitDBManager, 
        ORBITDB_CAPABILITIES
    )
    from hallucinate_app.auth import AuthManager
    MODULE_AVAILABLE = True
except ImportError as e:
    print(f"Could not import secure_orbitdb_manager module: {e}")
    MODULE_AVAILABLE = False

# Create mock of OrbitDBKit for testing
class MockOrbitDBKit:
    """Mock of OrbitDB Kit for testing"""
    
    def __init__(self, resources=None, metadata=None):
        self.resources = resources or {}
        self.metadata = metadata or {}
        self.initialized = False
        self.databases = {}
        self.stats = {
            "databases_created": 0,
            "databases_opened": 0,
            "write_operations": 0,
            "read_operations": 0,
            "replication_events": 0,
            "last_operation": None,
            "last_operation_time": None
        }
    
    async def init(self):
        """Initialize the OrbitDB kit"""
        self.initialized = True
        return True
    
    async def create_database(self, name, db_type, options=None):
        """Create a database"""
        options = options or {}
        self.stats["databases_created"] += 1
        
        # Create mock address
        import hashlib
        import base64
        h = hashlib.sha256(f"{name}-{db_type}-{time.time()}".encode()).digest()
        mock_id = base64.b16encode(h[:10]).decode().lower()
        address = f"/orbitdb/{mock_id}/{name}"
        
        # Store in mock database tracking
        self.databases[address] = {
            "name": name,
            "type": db_type,
            "created_at": datetime.utcnow().isoformat(),
            "options": options,
            "data": {}
        }
        
        return {
            "success": True,
            "name": name,
            "type": db_type,
            "address": address,
            "mock": True
        }
    
    async def open_database(self, address, options=None):
        """Open a database"""
        options = options or {}
        self.stats["databases_opened"] += 1
        
        # Create database if it doesn't exist
        if address not in self.databases:
            db_name = address.split("/")[-1] if "/" in address else address
            self.databases[address] = {
                "name": db_name,
                "type": "unknown",
                "created_at": datetime.utcnow().isoformat(),
                "options": options,
                "data": {}
            }
        
        # Return mock database
        db_info = self.databases[address]
        return {
            "success": True,
            "address": address,
            "name": db_info["name"],
            "type": db_info["type"],
            "db_instance": {
                "address": address,
                "type": db_info["type"],
                "get": lambda key: db_info["data"].get(key),
                "put": lambda key, value: self._put_data(address, key, value),
                "add": lambda data: self._add_data(address, data)
            },
            "mock": True
        }
    
    async def write(self, address, operation, data, key=None, options=None):
        """Write to a database"""
        options = options or {}
        self.stats["write_operations"] += 1
        
        # Ensure database exists
        if address not in self.databases:
            db_name = address.split("/")[-1] if "/" in address else address
            self.databases[address] = {
                "name": db_name,
                "type": "unknown",
                "created_at": datetime.utcnow().isoformat(),
                "data": {}
            }
        
        # Perform write operation
        hash_value = None
        if operation == "put":
            hash_value = self._put_data(address, key, data)
        elif operation == "add":
            hash_value = self._add_data(address, data)
        else:
            hash_value = f"mock-hash-{int(time.time())}"
        
        return {
            "success": True,
            "hash": hash_value,
            "operation": operation,
            "address": address,
            "mock": True
        }
    
    async def read(self, address, operation, key=None, options=None):
        """Read from a database"""
        options = options or {}
        self.stats["read_operations"] += 1
        
        # Ensure database exists
        if address not in self.databases:
            return None
        
        # Perform read operation
        result = None
        if operation == "get":
            result = self.databases[address]["data"].get(key)
        elif operation == "query":
            # Simple mock query that returns all data
            result = [{"id": k, "value": v} for k, v in self.databases[address]["data"].items()]
        elif operation == "iterator":
            # Return list of items
            result = [{"id": k, "value": v} for k, v in self.databases[address]["data"].items()]
        
        return result
    
    async def close_database(self, address):
        """Close a database"""
        # Mark as closed in stats
        if address in self.databases:
            self.databases[address]["closed"] = True
        
        return {
            "success": True,
            "address": address,
            "mock": True
        }
    
    async def replicate_database(self, address, options=None):
        """Replicate a database"""
        options = options or {}
        self.stats["replication_events"] += 1
        
        return {
            "success": True,
            "address": address,
            "peers": ["QmMock1", "QmMock2"],
            "progress": 100,
            "mock": True
        }
    
    async def list_databases(self):
        """List all databases"""
        db_list = {}
        for address, db_info in self.databases.items():
            db_list[address] = {
                "address": address,
                "name": db_info["name"],
                "type": db_info["type"],
                "created_at": db_info["created_at"]
            }
        
        return {
            "success": True,
            "databases": db_list,
            "count": len(db_list)
        }
    
    async def get_database_info(self, address):
        """Get database information"""
        if address not in self.databases:
            return None
        
        db_info = self.databases[address]
        return {
            "address": address,
            "name": db_info["name"],
            "type": db_info["type"],
            "created_at": db_info["created_at"],
            "entry_count": len(db_info["data"])
        }
    
    def _put_data(self, address, key, value):
        """Internal method to put data in database"""
        self.databases[address]["data"][key] = value
        import hashlib
        h = hashlib.sha256(f"{address}-{key}-{json.dumps(value)}".encode()).digest()
        return "z" + h.hex()[:32]
    
    def _add_data(self, address, data):
        """Internal method to add data to database"""
        key = f"key-{len(self.databases[address]['data'])}"
        return self._put_data(address, key, data)

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
            f"{ORBITDB_CAPABILITIES['CREATE']}:*",
            f"{ORBITDB_CAPABILITIES['OPEN']}:*",
            f"{ORBITDB_CAPABILITIES['WRITE']}:*",
            f"{ORBITDB_CAPABILITIES['READ']}:*",
            f"{ORBITDB_CAPABILITIES['CLOSE']}:*",
            f"{ORBITDB_CAPABILITIES['REPLICATE']}:*",
            f"{ORBITDB_CAPABILITIES['ADMIN']}:*",
            f"{ORBITDB_CAPABILITIES['ADMIN']}:list",
            f"{ORBITDB_CAPABILITIES['ADMIN']}:stats",
            # Specific database capabilities for testing
            f"{ORBITDB_CAPABILITIES['WRITE']}:specific-db",
            f"{ORBITDB_CAPABILITIES['READ']}:specific-db"
        ]

@unittest.skipIf(not MODULE_AVAILABLE, "Secure OrbitDB Manager module not available")
class TestSecureOrbitDBManager(unittest.TestCase):
    """Test cases for the secure_orbitdb_manager module"""
    
    def setUp(self):
        """Set up the test case"""
        # Create mock resources
        self.mock_resources = {
            "auth": MockAuthManager(),
            "orbitdb": MockOrbitDBKit()
        }
        
        # Create the manager with mock resources
        self.manager = SecureOrbitDBManager(resources=self.mock_resources)
        
        # Initialize auth tokens
        self.admin_token = "admin-token"
        self.create_token = "create-token"
        self.open_token = "open-token"
        self.write_token = "write-token"
        self.read_token = "read-token"
        self.close_token = "close-token"
        self.replicate_token = "replicate-token"
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
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertTrue(result["success"], "Database creation should succeed")
            self.assertIn("address", result, "Should return an address")
            self.assertIn("test-db", result["name"], "Should return correct name")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["databases_created"], "Should track database creation")
            self.assertEqual(1, self.manager.stats["access_granted"], "Should track access grants")
    
    def test_create_database_without_token(self):
        """Test database creation without token"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Create database without token
        with self.assertRaises(Exception):
            self.loop.run_until_complete(
                self.manager.create_database("test-db", "keyvalue")
            )
    
    def test_create_database_with_invalid_token(self):
        """Test database creation with invalid token"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Patch verify_capability to return False for this test
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=False):
            # Create database with invalid token
            with self.assertRaises(Exception):
                self.loop.run_until_complete(
                    self.manager.create_database(
                        "test-db",
                        "keyvalue",
                        {"auth_token": "invalid-token"}
                    )
                )
            
            # Check stats
            self.assertEqual(1, self.manager.stats["access_denied"], "Should track access denials")
    
    def test_open_database(self):
        """Test opening a database"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create a database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-open-db",
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            address = create_result["address"]
            
            # Open the database
            open_result = self.loop.run_until_complete(
                self.manager.open_database(
                    address,
                    {"auth_token": self.open_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertTrue(open_result["success"], "Database opening should succeed")
            self.assertEqual(address, open_result["address"], "Should return correct address")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["databases_opened"], "Should track database opening")
    
    def test_open_database_without_token(self):
        """Test opening a database without token"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create a database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-open-no-token-db",
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            address = create_result["address"]
            
            # Try to open without token
            with self.assertRaises(Exception):
                self.loop.run_until_complete(
                    self.manager.open_database(address)
                )
    
    def test_write_operation(self):
        """Test write operation"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create and open a database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-write-db",
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            address = create_result["address"]
            
            # Write to the database
            write_result = self.loop.run_until_complete(
                self.manager.write(
                    address,
                    "put",
                    {"value": "test-value"},
                    {"auth_token": self.write_token, "user_id": "test-user", "key": "test-key"}
                )
            )
            
            # Check result
            self.assertTrue(write_result["success"], "Write operation should succeed")
            self.assertIn("hash", write_result, "Should return a hash")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["write_operations"], "Should track write operations")
    
    def test_read_operation(self):
        """Test read operation"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create, open, and write to a database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-read-db",
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            address = create_result["address"]
            
            # Write data
            self.loop.run_until_complete(
                self.manager.write(
                    address,
                    "put",
                    {"value": "test-value"},
                    {"auth_token": self.write_token, "user_id": "test-user", "key": "test-key"}
                )
            )
            
            # Read from the database
            read_result = self.loop.run_until_complete(
                self.manager.read(
                    address,
                    "get",
                    "test-key",
                    {"auth_token": self.read_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertTrue(read_result["success"], "Read operation should succeed")
            self.assertIn("result", read_result, "Should include result field")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["read_operations"], "Should track read operations")
    
    def test_close_database(self):
        """Test closing a database"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create and open a database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-close-db",
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            address = create_result["address"]
            
            # Close the database
            close_result = self.loop.run_until_complete(
                self.manager.close_database(
                    address,
                    {"auth_token": self.close_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertTrue(close_result["success"], "Database closing should succeed")
    
    def test_replicate_database(self):
        """Test database replication"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # First create a database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-replicate-db",
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            address = create_result["address"]
            
            # Replicate the database
            replicate_result = self.loop.run_until_complete(
                self.manager.replicate_database(
                    address,
                    {"auth_token": self.replicate_token, "user_id": "test-user"}
                )
            )
            
            # Check result
            self.assertTrue(replicate_result["success"], "Database replication should succeed")
            self.assertIn("peers", replicate_result, "Should include peers information")
            
            # Check stats
            self.assertEqual(1, self.manager.stats["replication_events"], "Should track replication events")
    
    def test_list_databases(self):
        """Test listing databases"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Create a few databases
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            self.loop.run_until_complete(
                self.manager.create_database(
                    "test-list-db1",
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            self.loop.run_until_complete(
                self.manager.create_database(
                    "test-list-db2",
                    "keyvalue",
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
            self.assertTrue(list_result["success"], "Database listing should succeed")
            self.assertIn("databases", list_result, "Should include databases dict")
            self.assertGreaterEqual(list_result["count"], 2, "Should list at least 2 databases")
    
    def test_get_database_info(self):
        """Test getting database info"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Create a database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-info-db",
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            address = create_result["address"]
            
            # Get database info
            info_result = self.loop.run_until_complete(
                self.manager.get_database_info(
                    address,
                    {"auth_token": self.read_token}
                )
            )
            
            # Check result
            self.assertTrue(info_result["success"], "Getting database info should succeed")
            self.assertIn("info", info_result, "Should include info field")
            self.assertEqual(address, info_result["info"]["address"], "Should return correct address")
    
    def test_get_stats(self):
        """Test getting module statistics"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Do some operations to generate stats
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Create a database
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "test-stats-db",
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            address = create_result["address"]
            
            # Write to database
            self.loop.run_until_complete(
                self.manager.write(
                    address,
                    "put",
                    {"value": "test-value"},
                    {"auth_token": self.write_token, "user_id": "test-user", "key": "test-key"}
                )
            )
            
            # Read from database
            self.loop.run_until_complete(
                self.manager.read(
                    address,
                    "get",
                    "test-key",
                    {"auth_token": self.read_token, "user_id": "test-user"}
                )
            )
            
            # Get stats
            stats_result = self.loop.run_until_complete(
                self.manager.get_stats(
                    {"auth_token": self.admin_token}
                )
            )
            
            # Check result
            self.assertIn("access_granted", stats_result, "Should include access_granted field")
            self.assertIn("databases_created", stats_result, "Should include databases_created field")
            self.assertIn("write_operations", stats_result, "Should include write_operations field")
            self.assertIn("read_operations", stats_result, "Should include read_operations field")
            self.assertIn("resource_usage", stats_result, "Should include resource_usage field")
            
            # Check counts
            self.assertGreaterEqual(stats_result["databases_created"], 1, "Should track database creation")
            self.assertGreaterEqual(stats_result["write_operations"], 1, "Should track write operations")
            self.assertGreaterEqual(stats_result["read_operations"], 1, "Should track read operations")
    
    def test_capability_scope(self):
        """Test capability scope restrictions"""
        # Initialize the manager
        self.loop.run_until_complete(self.manager.init())
        
        # Create specific database
        with patch.object(self.mock_resources["auth"], "verify_capability", return_value=True):
            # Create first database - will be allowed with specific capability
            create_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "specific-db",
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            specific_address = create_result["address"]
            
            # Create second database - will be denied with specific capability
            other_result = self.loop.run_until_complete(
                self.manager.create_database(
                    "other-db",
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            other_address = other_result["address"]
        
        # Test with specific database capability
        with patch.object(self.mock_resources["auth"], "verify_capability", side_effect=lambda token, capability_string: 
             capability_string == f"{ORBITDB_CAPABILITIES['WRITE']}:specific-db" or
             capability_string == f"{ORBITDB_CAPABILITIES['WRITE']}:{specific_address}"):
            
            # Should succeed for specific database
            write_result = self.loop.run_until_complete(
                self.manager.write(
                    specific_address,
                    "put",
                    {"value": "specific-value"},
                    {"auth_token": self.specific_db_token, "user_id": "test-user", "key": "specific-key"}
                )
            )
            
            self.assertTrue(write_result["success"], "Write to specific database should succeed")
            
            # Should fail for other database
            with self.assertRaises(PermissionError):
                self.loop.run_until_complete(
                    self.manager.write(
                        other_address,
                        "put",
                        {"value": "other-value"},
                        {"auth_token": self.specific_db_token, "user_id": "test-user", "key": "other-key"}
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
                    "keyvalue",
                    {"auth_token": self.create_token, "user_id": "test-user"}
                )
            )
            
            address = create_result["address"]
            
            # Write to database multiple times
            for i in range(3):
                self.loop.run_until_complete(
                    self.manager.write(
                        address,
                        "put",
                        {"value": f"value-{i}"},
                        {"auth_token": self.write_token, "user_id": "test-user", "key": f"key-{i}"}
                    )
                )
            
            # Read from database multiple times
            for i in range(2):
                self.loop.run_until_complete(
                    self.manager.read(
                        address,
                        "get",
                        f"key-{i}",
                        {"auth_token": self.read_token, "user_id": "test-user"}
                    )
                )
            
            # Call _update_resource_usage directly to test
            self.manager._update_resource_usage("create", address, {"user_id": "direct-user"})
            self.manager._update_resource_usage("write", address, {"user_id": "direct-user"})
            self.manager._update_resource_usage("read", address, {"user_id": "direct-user"})
            
            # Check by-database stats
            self.assertIn(address, self.manager.resource_usage["by_database"], "Should track database usage")
            db_usage = self.manager.resource_usage["by_database"][address]
            self.assertGreaterEqual(db_usage["creates"], 1, "Should track creates")
            self.assertGreaterEqual(db_usage["writes"], 3, "Should track writes")
            self.assertGreaterEqual(db_usage["reads"], 2, "Should track reads")
            
            # Check by-user stats
            self.assertIn("test-user", self.manager.resource_usage["by_user"], "Should track user usage")
            user_usage = self.manager.resource_usage["by_user"]["test-user"]
            self.assertGreaterEqual(user_usage["creates"], 1, "Should track user creates")
            self.assertGreaterEqual(user_usage["writes"], 3, "Should track user writes")
            self.assertGreaterEqual(user_usage["reads"], 2, "Should track user reads")
            self.assertIn(address, user_usage["databases"], "Should track user databases")
            
            # Check direct usage
            self.assertIn("direct-user", self.manager.resource_usage["by_user"], "Should track direct usage")
            direct_usage = self.manager.resource_usage["by_user"]["direct-user"]
            self.assertEqual(1, direct_usage["creates"], "Should track direct creates")
            self.assertEqual(1, direct_usage["writes"], "Should track direct writes")
            self.assertEqual(1, direct_usage["reads"], "Should track direct reads")
    
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
            self.assertEqual("secure_orbitdb_manager", test_result["module"], "Should identify correct module")
            self.assertIn("database_operations", test_result, "Should include database_operations field")


if __name__ == "__main__":
    # Run tests with detailed output
    unittest.main(verbosity=2)