"""
Integration Test for Database Sync Manager

Tests bidirectional synchronization between OrbitDB, FireproofDB, and DuckDB-IPLD
with real secure manager implementations and capability-based security.
"""

import os
import sys
import json
import asyncio
import unittest
import tempfile
import logging
from datetime import datetime
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_database_sync_manager_integration")

# Ensure parent directory is in path
parent_dir = str(Path(__file__).parent.parent)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

# Import the modules to test
try:
    from database_sync_manager import DatabaseSyncManager, SYNC_CAPABILITIES
    from secure_orbitdb_manager import secure_orbitdb_manager, ORBITDB_CAPABILITIES
    from secure_fireproofdb_manager import secure_fireproofdb_manager, FIREPROOFDB_CAPABILITIES
    from secure_duckdb_ipld_manager import secure_duckdb_ipld_manager, DUCKDB_IPLD_CAPABILITIES
    from auth import auth_manager
    has_modules = True
except ImportError as e:
    logger.error(f"Failed to import required modules: {e}")
    has_modules = False


@unittest.skipIf(not has_modules, "Required modules are not available")
class TestDatabaseSyncManagerIntegration(unittest.TestCase):
    """
    Integration test for Database Sync Manager with real secure manager implementations
    """
    
    def setUp(self):
        """Set up test environment with real implementations"""
        # Create event loop for async tests
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Create temporary directory for test files
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, 'test.db')
        self.sync_dir = os.path.join(self.temp_dir, 'sync')
        os.makedirs(self.sync_dir, exist_ok=True)
        
        # Initialize the auth manager
        self.loop.run_until_complete(auth_manager.init())
        
        # Initialize secure managers
        self.loop.run_until_complete(secure_orbitdb_manager.init())
        self.loop.run_until_complete(secure_fireproofdb_manager.init())
        self.loop.run_until_complete(secure_duckdb_ipld_manager.init())
        
        # Create test user
        self.test_user = f"test-user-{int(datetime.now().timestamp())}"
        self.loop.run_until_complete(auth_manager.create_principal(self.test_user))
        
        # Grant capabilities to test user
        self.capabilities = {
            # OrbitDB capabilities
            "orbitdb_create": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": ORBITDB_CAPABILITIES["CREATE_DATABASE"],
                    "with": "*"
                })
            )["token"],
            "orbitdb_write": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": ORBITDB_CAPABILITIES["WRITE"],
                    "with": "*"
                })
            )["token"],
            "orbitdb_read": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": ORBITDB_CAPABILITIES["READ"],
                    "with": "*"
                })
            )["token"],
            
            # FireproofDB capabilities
            "fireproofdb_create": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": FIREPROOFDB_CAPABILITIES["CREATE_DATABASE"],
                    "with": "*"
                })
            )["token"],
            "fireproofdb_write": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": FIREPROOFDB_CAPABILITIES["WRITE"],
                    "with": "*"
                })
            )["token"],
            "fireproofdb_read": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": FIREPROOFDB_CAPABILITIES["READ"],
                    "with": "*"
                })
            )["token"],
            
            # DuckDB-IPLD capabilities
            "duckdb_execute": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": DUCKDB_IPLD_CAPABILITIES["EXECUTE"],
                    "with": "*"
                })
            )["token"],
            "duckdb_query": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": DUCKDB_IPLD_CAPABILITIES["QUERY"],
                    "with": "*"
                })
            )["token"],
            "duckdb_ipld_export": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": DUCKDB_IPLD_CAPABILITIES["EXPORT_IPLD"],
                    "with": "*"
                })
            )["token"],
            "duckdb_ipld_import": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": DUCKDB_IPLD_CAPABILITIES["IMPORT_IPLD"],
                    "with": "*"
                })
            )["token"],
            
            # Sync capabilities
            "sync_orbit_to_fireproof": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": SYNC_CAPABILITIES["SYNC_ORBITDB_TO_FIREPROOFDB"],
                    "with": "*"
                })
            )["token"],
            "sync_fireproof_to_orbit": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": SYNC_CAPABILITIES["SYNC_FIREPROOFDB_TO_ORBITDB"],
                    "with": "*"
                })
            )["token"],
            "sync_duckdb_export": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": SYNC_CAPABILITIES["SYNC_DUCKDB_EXPORT_IPLD"],
                    "with": "*"
                })
            )["token"],
            "sync_duckdb_import": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": SYNC_CAPABILITIES["SYNC_DUCKDB_IMPORT_IPLD"],
                    "with": "*"
                })
            )["token"],
            "sync_admin": self.loop.run_until_complete(
                auth_manager.issue_capability("root", self.test_user, {
                    "can": SYNC_CAPABILITIES["SYNC_ADMIN"],
                    "with": "*"
                })
            )["token"],
        }
        
        # Create resources dictionary using the secure managers
        self.resources = {
            "orbitDb": secure_orbitdb_manager,
            "fireproofDb": secure_fireproofdb_manager,
            "duckDb": secure_duckdb_ipld_manager,
            "authManager": auth_manager,
            "ipfsKit": None,  # Will be mocked by the secure managers
            "libp2pKit": None  # Will be mocked by the secure managers
        }
        
        # Create and initialize the database sync manager
        self.metadata = {
            "syncDir": self.sync_dir,
            "autoSync": False  # Disable auto-sync for tests
        }
        
        self.db_sync_manager = DatabaseSyncManager(resources=self.resources, metadata=self.metadata)
        self.loop.run_until_complete(self.db_sync_manager.init())
        
        # Create some test data
        self.test_collection = "integration_test"
        
        # Create collection in OrbitDB
        self.loop.run_until_complete(
            secure_orbitdb_manager.create_database(
                self.test_collection,
                {"auth_token": self.capabilities["orbitdb_create"]}
            )
        )
        
        # Create collection in FireproofDB
        self.loop.run_until_complete(
            secure_fireproofdb_manager.create_database(
                self.test_collection,
                {"auth_token": self.capabilities["fireproofdb_create"]}
            )
        )
        
        # Create table in DuckDB
        self.loop.run_until_complete(
            secure_duckdb_ipld_manager.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {self.test_collection} (
                    id VARCHAR,
                    value VARCHAR,
                    source VARCHAR,
                    timestamp BIGINT
                )
                """,
                {"auth_token": self.capabilities["duckdb_execute"]}
            )
        )
    
    def tearDown(self):
        """Clean up after tests"""
        # Close the database sync manager
        try:
            self.loop.run_until_complete(self.db_sync_manager.close())
        except Exception as e:
            logger.warning("Error closing db_sync_manager during tearDown: %s", e)
        
        # Clean up temporary directory
        import shutil
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
        
        # Close the event loop
        self.loop.close()
    
    def test_connection_to_secure_managers(self):
        """Test connection to secure database managers"""
        self.assertTrue(self.db_sync_manager.initialized)
        self.assertIsNotNone(self.db_sync_manager.resources.get("orbitDb"))
        self.assertIsNotNone(self.db_sync_manager.resources.get("fireproofDb"))
        self.assertIsNotNone(self.db_sync_manager.resources.get("duckDb"))
        self.assertIsNotNone(self.db_sync_manager.resources.get("authManager"))
    
    def test_bidirectional_sync_with_security(self):
        """Test bidirectional sync between OrbitDB and FireproofDB with capability-based security"""
        # Create unique test documents
        orbit_doc = {
            "_id": f"orbit-doc-{int(datetime.now().timestamp())}",
            "source": "orbit",
            "value": "test value from orbit",
            "timestamp": int(datetime.now().timestamp())
        }
        
        fireproof_doc = {
            "_id": f"fireproof-doc-{int(datetime.now().timestamp())}",
            "source": "fireproof",
            "value": "test value from fireproof",
            "timestamp": int(datetime.now().timestamp())
        }
        
        # Add documents to their respective databases
        orbit_result = self.loop.run_until_complete(
            secure_orbitdb_manager.put(
                self.test_collection,
                orbit_doc,
                {"auth_token": self.capabilities["orbitdb_write"]}
            )
        )
        self.assertTrue(orbit_result.get("success", False))
        
        fireproof_result = self.loop.run_until_complete(
            secure_fireproofdb_manager.put(
                self.test_collection,
                fireproof_doc,
                {"auth_token": self.capabilities["fireproofdb_write"]}
            )
        )
        self.assertTrue(fireproof_result.get("success", False))
        
        # 1. Sync OrbitDB to FireproofDB with proper token
        orbit_to_fireproof_result = self.loop.run_until_complete(
            self.db_sync_manager.sync_orbitdb_to_fireproofdb(
                auth_token=self.capabilities["sync_orbit_to_fireproof"],
                collections=[self.test_collection]
            )
        )
        self.assertTrue(orbit_to_fireproof_result.get("success", False))
        
        # Verify orbit document synced to fireproof
        fireproof_has_orbit_doc = self.loop.run_until_complete(
            secure_fireproofdb_manager.get(
                self.test_collection,
                orbit_doc["_id"],
                {"auth_token": self.capabilities["fireproofdb_read"]}
            )
        )
        self.assertIsNotNone(fireproof_has_orbit_doc)
        self.assertEqual(fireproof_has_orbit_doc.get("source"), "orbit")
        
        # 2. Sync FireproofDB to OrbitDB with proper token
        fireproof_to_orbit_result = self.loop.run_until_complete(
            self.db_sync_manager.sync_fireproofdb_to_orbitdb(
                auth_token=self.capabilities["sync_fireproof_to_orbit"],
                collections=[self.test_collection]
            )
        )
        self.assertTrue(fireproof_to_orbit_result.get("success", False))
        
        # Verify fireproof document synced to orbit
        orbit_has_fireproof_doc = self.loop.run_until_complete(
            secure_orbitdb_manager.get(
                self.test_collection,
                fireproof_doc["_id"],
                {"auth_token": self.capabilities["orbitdb_read"]}
            )
        )
        self.assertIsNotNone(orbit_has_fireproof_doc)
        self.assertEqual(orbit_has_fireproof_doc.get("source"), "fireproof")
        
        # 3. Test security enforcement - sync with invalid token should fail
        invalid_token = "invalid-token-1234"
        with self.assertRaises(Exception):
            self.loop.run_until_complete(
                self.db_sync_manager.sync_orbitdb_to_fireproofdb(
                    auth_token=invalid_token,
                    collections=[self.test_collection]
                )
            )
    
    def test_duckdb_ipld_sync_with_security(self):
        """Test DuckDB-IPLD integration with capability-based security"""
        # Insert test data into DuckDB
        timestamp = int(datetime.now().timestamp())
        duckdb_insert_result = self.loop.run_until_complete(
            secure_duckdb_ipld_manager.execute(
                f"""
                INSERT INTO {self.test_collection} VALUES 
                ('duckdb-doc-{timestamp}', 'test value', 'duckdb', {timestamp})
                """,
                {"auth_token": self.capabilities["duckdb_execute"]}
            )
        )
        self.assertTrue(duckdb_insert_result.get("success", False))
        
        # 1. Export DuckDB table to IPLD with proper token
        export_result = self.loop.run_until_complete(
            self.db_sync_manager.export_duckdb_to_ipld(
                auth_token=self.capabilities["sync_duckdb_export"],
                tables=[self.test_collection]
            )
        )
        self.assertTrue(export_result.get("success", False))
        self.assertIn(self.test_collection, export_result.get("results", {}).get("tables", {}))
        
        # Get exported CID
        cid = export_result.get("results", {}).get("tables", {}).get(self.test_collection, {}).get("cid")
        self.assertIsNotNone(cid)
        
        # 2. Import from IPLD to DuckDB with proper token
        # Create a new table name for import
        import_table = f"{self.test_collection}_imported"
        
        # Create the target table
        self.loop.run_until_complete(
            secure_duckdb_ipld_manager.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {import_table} (
                    id VARCHAR,
                    value VARCHAR,
                    source VARCHAR,
                    timestamp BIGINT
                )
                """,
                {"auth_token": self.capabilities["duckdb_execute"]}
            )
        )
        
        # Import the data
        import_result = self.loop.run_until_complete(
            self.db_sync_manager.import_ipld_to_duckdb(
                auth_token=self.capabilities["sync_duckdb_import"],
                table_data={import_table: {"cid": cid}}
            )
        )
        self.assertTrue(import_result.get("success", False))
        self.assertIn(import_table, import_result.get("results", {}).get("tables", {}))
        
        # 3. Test security enforcement - export with invalid token should fail
        invalid_token = "invalid-token-5678"
        with self.assertRaises(Exception):
            self.loop.run_until_complete(
                self.db_sync_manager.export_duckdb_to_ipld(
                    auth_token=invalid_token,
                    tables=[self.test_collection]
                )
            )
    
    def test_sync_all_with_admin_capability(self):
        """Test sync_all operation with admin capability"""
        # Create test documents
        timestamp = int(datetime.now().timestamp())
        orbit_doc = {
            "_id": f"orbit-sync-all-{timestamp}",
            "source": "orbit-sync-all",
            "value": "test sync all from orbit",
            "timestamp": timestamp
        }
        
        fireproof_doc = {
            "_id": f"fireproof-sync-all-{timestamp}",
            "source": "fireproof-sync-all",
            "value": "test sync all from fireproof",
            "timestamp": timestamp
        }
        
        # Add documents to databases
        self.loop.run_until_complete(
            secure_orbitdb_manager.put(
                self.test_collection,
                orbit_doc,
                {"auth_token": self.capabilities["orbitdb_write"]}
            )
        )
        
        self.loop.run_until_complete(
            secure_fireproofdb_manager.put(
                self.test_collection,
                fireproof_doc,
                {"auth_token": self.capabilities["fireproofdb_write"]}
            )
        )
        
        # Insert data into DuckDB
        self.loop.run_until_complete(
            secure_duckdb_ipld_manager.execute(
                f"""
                INSERT INTO {self.test_collection} VALUES 
                ('duckdb-sync-all-{timestamp}', 'test sync all', 'duckdb-sync-all', {timestamp})
                """,
                {"auth_token": self.capabilities["duckdb_execute"]}
            )
        )
        
        # Run sync_all with admin capability
        sync_all_result = self.loop.run_until_complete(
            self.db_sync_manager.sync_all(
                auth_token=self.capabilities["sync_admin"]
            )
        )
        
        # Verify sync was successful
        self.assertTrue(sync_all_result.get("success", False))
        self.assertTrue(sync_all_result.get("results", {}).get("orbitToFireproof", {}).get("success", False))
        self.assertTrue(sync_all_result.get("results", {}).get("fireproofToOrbit", {}).get("success", False))
        self.assertTrue(sync_all_result.get("results", {}).get("duckdbExport", {}).get("success", False))
        
        # Verify bidirectional sync worked
        orbit_has_fireproof = self.loop.run_until_complete(
            secure_orbitdb_manager.get(
                self.test_collection,
                fireproof_doc["_id"],
                {"auth_token": self.capabilities["orbitdb_read"]}
            )
        )
        self.assertIsNotNone(orbit_has_fireproof)
        self.assertEqual(orbit_has_fireproof.get("source"), "fireproof-sync-all")
        
        fireproof_has_orbit = self.loop.run_until_complete(
            secure_fireproofdb_manager.get(
                self.test_collection,
                orbit_doc["_id"],
                {"auth_token": self.capabilities["fireproofdb_read"]}
            )
        )
        self.assertIsNotNone(fireproof_has_orbit)
        self.assertEqual(fireproof_has_orbit.get("source"), "orbit-sync-all")
        
        # Test security enforcement - sync_all with invalid token should fail
        invalid_token = "invalid-token-9012"
        with self.assertRaises(Exception):
            self.loop.run_until_complete(
                self.db_sync_manager.sync_all(
                    auth_token=invalid_token
                )
            )
    
    def test_selective_mirroring(self):
        """Test selective mirroring with filter rules"""
        # Configure selective mirroring rules
        self.db_sync_manager.config["selectiveMirroringRules"] = {
            "orbitdb-to-fireproofdb": {
                "include": [self.test_collection],  # Only sync this collection
                "exclude": []
            },
            "fireproofdb-to-orbitdb": {
                "include": [],
                "exclude": [self.test_collection]  # Don't sync this collection in reverse
            }
        }
        
        # Create test documents
        timestamp = int(datetime.now().timestamp())
        orbit_doc = {
            "_id": f"orbit-selective-{timestamp}",
            "source": "orbit-selective",
            "value": "test selective mirroring from orbit",
            "timestamp": timestamp
        }
        
        fireproof_doc = {
            "_id": f"fireproof-selective-{timestamp}",
            "source": "fireproof-selective",
            "value": "test selective mirroring from fireproof",
            "timestamp": timestamp
        }
        
        # Add documents to databases
        self.loop.run_until_complete(
            secure_orbitdb_manager.put(
                self.test_collection,
                orbit_doc,
                {"auth_token": self.capabilities["orbitdb_write"]}
            )
        )
        
        self.loop.run_until_complete(
            secure_fireproofdb_manager.put(
                self.test_collection,
                fireproof_doc,
                {"auth_token": self.capabilities["fireproofdb_write"]}
            )
        )
        
        # Sync OrbitDB to FireproofDB (should be included by rules)
        orbit_to_fireproof_result = self.loop.run_until_complete(
            self.db_sync_manager.sync_orbitdb_to_fireproofdb(
                auth_token=self.capabilities["sync_orbit_to_fireproof"]
            )
        )
        self.assertTrue(orbit_to_fireproof_result.get("success", False))
        
        # Sync FireproofDB to OrbitDB (should be excluded by rules)
        fireproof_to_orbit_result = self.loop.run_until_complete(
            self.db_sync_manager.sync_fireproofdb_to_orbitdb(
                auth_token=self.capabilities["sync_fireproof_to_orbit"]
            )
        )
        self.assertTrue(fireproof_to_orbit_result.get("success", False))
        
        # Verify OrbitDB doc was synced to FireproofDB (included)
        fireproof_has_orbit = self.loop.run_until_complete(
            secure_fireproofdb_manager.get(
                self.test_collection,
                orbit_doc["_id"],
                {"auth_token": self.capabilities["fireproofdb_read"]}
            )
        )
        self.assertIsNotNone(fireproof_has_orbit)
        self.assertEqual(fireproof_has_orbit.get("source"), "orbit-selective")
        
        # Verify FireproofDB doc was NOT synced to OrbitDB (excluded)
        orbit_has_fireproof = self.loop.run_until_complete(
            secure_orbitdb_manager.get(
                self.test_collection,
                fireproof_doc["_id"],
                {"auth_token": self.capabilities["orbitdb_read"]}
            )
        )
        self.assertIsNone(orbit_has_fireproof)
    
    def test_conflict_resolution_with_crdt_strategy(self):
        """Test conflict resolution with CRDT strategy"""
        # Set conflict resolution strategy to CRDT
        self.db_sync_manager.config["conflictStrategy"] = "crdt"
        
        # Create documents with conflicting IDs
        base_id = f"conflict-{int(datetime.now().timestamp())}"
        
        # Create older document in OrbitDB
        older_timestamp = int(datetime.now().timestamp()) - 100
        orbit_doc = {
            "_id": base_id,
            "source": "orbit-conflict",
            "value": "orbit version",
            "timestamp": older_timestamp,
            "_rev": "1-a"
        }
        
        # Create newer document in FireproofDB (with higher timestamp and rev)
        newer_timestamp = int(datetime.now().timestamp())
        fireproof_doc = {
            "_id": base_id,
            "source": "fireproof-conflict",
            "value": "fireproof version",
            "timestamp": newer_timestamp,
            "_rev": "2-b"
        }
        
        # Add documents to databases
        self.loop.run_until_complete(
            secure_orbitdb_manager.put(
                self.test_collection,
                orbit_doc,
                {"auth_token": self.capabilities["orbitdb_write"]}
            )
        )
        
        self.loop.run_until_complete(
            secure_fireproofdb_manager.put(
                self.test_collection,
                fireproof_doc,
                {"auth_token": self.capabilities["fireproofdb_write"]}
            )
        )
        
        # Sync OrbitDB to FireproofDB (should detect and resolve conflict)
        sync_result = self.loop.run_until_complete(
            self.db_sync_manager.sync_orbitdb_to_fireproofdb(
                auth_token=self.capabilities["sync_orbit_to_fireproof"],
                collections=[self.test_collection]
            )
        )
        
        self.assertTrue(sync_result.get("success", False))
        self.assertTrue(sync_result.get("stats", {}).get("conflicts", 0) > 0)
        
        # Verify the newer FireproofDB version was kept (CRDT strategy)
        resolved_doc = self.loop.run_until_complete(
            secure_fireproofdb_manager.get(
                self.test_collection,
                base_id,
                {"auth_token": self.capabilities["fireproofdb_read"]}
            )
        )
        
        self.assertIsNotNone(resolved_doc)
        self.assertEqual(resolved_doc.get("source"), "fireproof-conflict")
        self.assertEqual(resolved_doc.get("value"), "fireproof version")


def run_tests():
    """Run all tests"""
    test_loader = unittest.TestLoader()
    test_suite = test_loader.loadTestsFromTestCase(TestDatabaseSyncManagerIntegration)
    test_runner = unittest.TextTestRunner(verbosity=2)
    result = test_runner.run(test_suite)
    
    # Return JSON result summary
    return json.dumps({
        "success": result.wasSuccessful(),
        "total": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "timestamp": datetime.now().isoformat()
    }, indent=2)


if __name__ == "__main__":
    print(run_tests())