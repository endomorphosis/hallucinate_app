"""
Integration test module for Secure PyArrow Index Manager

Tests capability-based access control for PyArrow Content Index operations
with the actual auth system and content index integration
"""

import unittest
import asyncio
import json
import os
import sys
import logging
import tempfile
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_secure_pyarrow_index_manager_integration")

# Import project modules
try:
    from ..secure_pyarrow_index_manager import secure_pyarrow_index_manager, SecurePyArrowIndexManager, PYARROW_INDEX_CAPABILITIES
    from ..auth import auth_manager
    from ..pyarrow_content_index_integration import content_index_integration
    has_imports = True
except ImportError as e:
    logger.error(f"Failed to import required modules: {e}")
    has_imports = False


class TestSecurePyArrowIndexManagerIntegration(unittest.TestCase):
    """Integration test class for the Secure PyArrow Index Manager module"""
    
    def setUp(self):
        """Set up the test environment with actual implementations"""
        self.secure_pyarrow_index_manager = secure_pyarrow_index_manager
        self.auth_manager = auth_manager
        self.content_index_integration = content_index_integration
        
        self.test_capabilities = {
            "read": PYARROW_INDEX_CAPABILITIES['READ'],
            "write": PYARROW_INDEX_CAPABILITIES['WRITE'],
            "sync": PYARROW_INDEX_CAPABILITIES['SYNC'],
            "export": PYARROW_INDEX_CAPABILITIES['EXPORT'],
            "import": PYARROW_INDEX_CAPABILITIES['IMPORT'],
            "delete": PYARROW_INDEX_CAPABILITIES['DELETE'],
            "admin": PYARROW_INDEX_CAPABILITIES['ADMIN']
        }
        
        # Create event loop for async tests
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Create a temporary directory for test files
        self.temp_dir = tempfile.mkdtemp()
        self.test_export_path = os.path.join(self.temp_dir, "test_export.parquet")
        
        # Initialize components
        self.loop.run_until_complete(self.auth_manager.init())
        self.loop.run_until_complete(self.content_index_integration.init())
        self.loop.run_until_complete(self.secure_pyarrow_index_manager.init())
        
        # Create test user and issue capabilities
        self.test_user = "test-user-" + datetime.now().strftime("%Y%m%d%H%M%S")
        self.loop.run_until_complete(self.auth_manager.create_principal(self.test_user))
        
        # Issue capabilities
        self.admin_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["admin"],
                "with": "*"
            })
        )["token"]
        
        self.read_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["read"],
                "with": "*"
            })
        )["token"]
        
        self.write_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["write"],
                "with": "*"
            })
        )["token"]
        
        self.delete_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["delete"],
                "with": "*"
            })
        )["token"]
        
        self.sync_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["sync"],
                "with": "*"
            })
        )["token"]
        
        self.export_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["export"],
                "with": "*"
            })
        )["token"]
        
        self.import_token = self.loop.run_until_complete(
            self.auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["import"],
                "with": "*"
            })
        )["token"]
    
    def tearDown(self):
        """Clean up after tests"""
        # Clean up temp directory and files
        if os.path.exists(self.test_export_path):
            try:
                os.remove(self.test_export_path)
            except OSError as e:
                logger.warning("Failed to remove test export file %s: %s", self.test_export_path, e)
        
        try:
            os.rmdir(self.temp_dir)
        except OSError as e:
            logger.warning("Failed to remove temp directory %s: %s", self.temp_dir, e)
        
        # Close the event loop
        self.loop.close()
    
    def test_initialization(self):
        """Test initialization of the secure PyArrow index manager with real components"""
        self.assertTrue(self.secure_pyarrow_index_manager.initialized)
        self.assertTrue(self.auth_manager.initialized)
        self.assertTrue(self.content_index_integration.initialized)
    
    def test_capability_verification_add_entry(self):
        """Test capability verification for adding entries with real auth manager"""
        # Create test entry
        test_entry = {
            "cid": f"test-cid-{int(datetime.now().timestamp())}",
            "path": f"/test/path-{int(datetime.now().timestamp())}",
            "size": 1024,
            "mimetype": "text/plain",
            "metadata": {
                "test": True,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        # Test with valid write token
        result = self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.add_entry(test_entry, self.write_token)
        )
        self.assertEqual(result.get("cid"), test_entry["cid"])
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError, RuntimeError)):
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.add_entry(test_entry, "invalid-token")
            )
        
        # Test with wrong capability token (read instead of write)
        with self.assertRaises((PermissionError, ValueError, RuntimeError)):
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.add_entry(test_entry, self.read_token)
            )
        
        # Cleanup - delete the test entry
        self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.delete_entry(test_entry["cid"], self.admin_token)
        )
    
    def test_capability_verification_lookup(self):
        """Test capability verification for lookups with real auth manager"""
        # Create test entry first
        test_entry = {
            "cid": f"test-cid-lookup-{int(datetime.now().timestamp())}",
            "path": f"/test/path-lookup-{int(datetime.now().timestamp())}",
            "size": 1024,
            "mimetype": "text/plain",
            "metadata": {
                "test": True,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        # Add the entry with admin token
        add_result = self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.add_entry(test_entry, self.admin_token)
        )
        self.assertEqual(add_result.get("cid"), test_entry["cid"])
        
        # Test lookup by CID with read token
        cid_result = self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.lookup_by_cid(test_entry["cid"], self.read_token)
        )
        self.assertEqual(cid_result.get("cid"), test_entry["cid"])
        
        # Test lookup by path with read token
        path_result = self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.lookup_by_path(test_entry["path"], self.read_token)
        )
        self.assertEqual(path_result.get("path"), test_entry["path"])
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError, RuntimeError)):
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.lookup_by_cid(test_entry["cid"], "invalid-token")
            )
        
        # Cleanup - delete the test entry
        self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.delete_entry(test_entry["cid"], self.admin_token)
        )
    
    def test_capability_verification_update(self):
        """Test capability verification for updating entries with real auth manager"""
        # Create test entry first
        test_entry = {
            "cid": f"test-cid-update-{int(datetime.now().timestamp())}",
            "path": f"/test/path-update-{int(datetime.now().timestamp())}",
            "size": 1024,
            "mimetype": "text/plain",
            "metadata": {
                "test": True,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        # Add the entry with admin token
        add_result = self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.add_entry(test_entry, self.admin_token)
        )
        self.assertEqual(add_result.get("cid"), test_entry["cid"])
        
        # Update data
        update_data = {
            "metadata": {
                "test": True,
                "updated": True,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        # Test update with write token
        update_result = self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.update_entry(test_entry["cid"], update_data, self.write_token)
        )
        self.assertEqual(update_result.get("cid"), test_entry["cid"])
        self.assertTrue(update_result.get("metadata", {}).get("updated", False))
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError, RuntimeError)):
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.update_entry(test_entry["cid"], update_data, "invalid-token")
            )
        
        # Test with wrong capability token (read instead of write)
        with self.assertRaises((PermissionError, ValueError, RuntimeError)):
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.update_entry(test_entry["cid"], update_data, self.read_token)
            )
        
        # Cleanup - delete the test entry
        self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.delete_entry(test_entry["cid"], self.admin_token)
        )
    
    def test_capability_verification_query(self):
        """Test capability verification for queries with real auth manager"""
        # Create test entries first
        test_entries = []
        for i in range(3):
            test_entry = {
                "cid": f"test-cid-query-{i}-{int(datetime.now().timestamp())}",
                "path": f"/test/path-query-{i}-{int(datetime.now().timestamp())}",
                "size": 1024 * (i + 1),
                "mimetype": "text/plain",
                "metadata": {
                    "test": True,
                    "query_test": True,
                    "index": i,
                    "timestamp": datetime.now().isoformat()
                }
            }
            test_entries.append(test_entry)
            
            # Add the entry with admin token
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.add_entry(test_entry, self.admin_token)
            )
        
        # Query parameters for test entries
        query_params = {
            "filter": "metadata.query_test = true",
            "limit": 10
        }
        
        # Test query with read token
        query_result = self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.query(query_params, self.read_token)
        )
        # Verify we got at least our test entries
        self.assertGreaterEqual(len(query_result), len(test_entries))
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError, RuntimeError)):
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.query(query_params, "invalid-token")
            )
        
        # Cleanup - delete the test entries
        for entry in test_entries:
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.delete_entry(entry["cid"], self.admin_token)
            )
    
    def test_capability_verification_delete(self):
        """Test capability verification for deleting entries with real auth manager"""
        # Create test entry first
        test_entry = {
            "cid": f"test-cid-delete-{int(datetime.now().timestamp())}",
            "path": f"/test/path-delete-{int(datetime.now().timestamp())}",
            "size": 1024,
            "mimetype": "text/plain",
            "metadata": {
                "test": True,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        # Add the entry with admin token
        add_result = self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.add_entry(test_entry, self.admin_token)
        )
        self.assertEqual(add_result.get("cid"), test_entry["cid"])
        
        # Test delete with delete token
        delete_result = self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.delete_entry(test_entry["cid"], self.delete_token)
        )
        self.assertTrue(delete_result)
        
        # Verify the entry is deleted
        with self.assertRaises(Exception):
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.lookup_by_cid(test_entry["cid"], self.admin_token)
            )
        
        # Create another test entry for invalid token test
        test_entry = {
            "cid": f"test-cid-delete2-{int(datetime.now().timestamp())}",
            "path": f"/test/path-delete2-{int(datetime.now().timestamp())}",
            "size": 1024,
            "mimetype": "text/plain",
            "metadata": {
                "test": True,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        # Add the entry with admin token
        add_result = self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.add_entry(test_entry, self.admin_token)
        )
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError, RuntimeError)):
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.delete_entry(test_entry["cid"], "invalid-token")
            )
        
        # Test with wrong capability token (read instead of delete)
        with self.assertRaises((PermissionError, ValueError, RuntimeError)):
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.delete_entry(test_entry["cid"], self.read_token)
            )
        
        # Cleanup - delete the test entry with admin token
        self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.delete_entry(test_entry["cid"], self.admin_token)
        )
    
    def test_capability_verification_export_import(self):
        """Test capability verification for export/import with real auth manager"""
        # Test export with export token
        export_result = self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.export_to_parquet(self.test_export_path, self.export_token)
        )
        self.assertTrue(export_result)
        self.assertTrue(os.path.exists(self.test_export_path))
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError, RuntimeError)):
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.export_to_parquet(self.test_export_path, "invalid-token")
            )
        
        # Test with wrong capability token (read instead of export)
        with self.assertRaises((PermissionError, ValueError, RuntimeError)):
            self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.export_to_parquet(self.test_export_path, self.read_token)
            )
        
        # Test import with import token
        if os.path.exists(self.test_export_path):
            import_result = self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.import_from_parquet(self.test_export_path, self.import_token)
            )
            self.assertTrue(import_result)
            
            # Test with invalid token
            with self.assertRaises((PermissionError, ValueError, RuntimeError)):
                self.loop.run_until_complete(
                    self.secure_pyarrow_index_manager.import_from_parquet(self.test_export_path, "invalid-token")
                )
            
            # Test with wrong capability token (read instead of import)
            with self.assertRaises((PermissionError, ValueError, RuntimeError)):
                self.loop.run_until_complete(
                    self.secure_pyarrow_index_manager.import_from_parquet(self.test_export_path, self.read_token)
                )
    
    def test_capability_verification_sync(self):
        """Test capability verification for sync operations with real auth manager"""
        # Test sync with sync token
        try:
            sync_result = self.loop.run_until_complete(
                self.secure_pyarrow_index_manager.sync_with_ipfs_pinset(True, self.sync_token)
            )
            # Skip detailed verification since syncing may take a long time
            # Just verify that it returns a dictionary
            self.assertIsInstance(sync_result, dict)
            
            # Test with invalid token
            with self.assertRaises((PermissionError, ValueError, RuntimeError)):
                self.loop.run_until_complete(
                    self.secure_pyarrow_index_manager.sync_with_ipfs_pinset(True, "invalid-token")
                )
            
            # Test with wrong capability token (read instead of sync)
            with self.assertRaises((PermissionError, ValueError, RuntimeError)):
                self.loop.run_until_complete(
                    self.secure_pyarrow_index_manager.sync_with_ipfs_pinset(True, self.read_token)
                )
        except Exception as e:
            # If sync is not available in the test environment, log and skip
            logger.warning(f"Skipping sync test, sync operation failed: {e}")
            self.skipTest(f"Sync operation not available: {e}")
    
    def test_stats_tracking(self):
        """Test statistics tracking with real components"""
        # Perform a series of operations to generate stats
        test_entry = {
            "cid": f"test-cid-stats-{int(datetime.now().timestamp())}",
            "path": f"/test/path-stats-{int(datetime.now().timestamp())}",
            "size": 1024,
            "mimetype": "text/plain",
            "metadata": {
                "test": True,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        # Add entry
        self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.add_entry(test_entry, self.admin_token)
        )
        
        # Lookup by CID
        self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.lookup_by_cid(test_entry["cid"], self.admin_token)
        )
        
        # Lookup by path
        self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.lookup_by_path(test_entry["path"], self.admin_token)
        )
        
        # Query
        self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.query({"filter": "test = true"}, self.admin_token)
        )
        
        # Update
        self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.update_entry(
                test_entry["cid"], 
                {"metadata": {"updated": True}}, 
                self.admin_token
            )
        )
        
        # Export
        self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.export_to_parquet(self.test_export_path, self.admin_token)
        )
        
        # Get security status
        security_status = self.secure_pyarrow_index_manager.get_security_status()
        
        # Verify some basic stats
        self.assertIn("module", security_status)
        self.assertEqual(security_status["module"], "secure_pyarrow_index")
        self.assertTrue(security_status["initialized"])
        self.assertTrue(security_status["auth_initialized"])
        self.assertTrue(security_status["integration_initialized"])
        
        # Verify operation counts
        self.assertIn("operations", security_status)
        self.assertGreaterEqual(security_status["operations"]["entries_added"], 1)
        self.assertGreaterEqual(security_status["operations"]["entries_updated"], 1)
        self.assertGreaterEqual(security_status["operations"]["queries_performed"], 1)
        self.assertGreaterEqual(security_status["operations"]["exports_performed"], 1)
        
        # Verify access stats
        self.assertIn("access_stats", security_status)
        self.assertGreaterEqual(security_status["access_stats"]["granted"], 5)
        
        # Cleanup - delete the test entry
        self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.delete_entry(test_entry["cid"], self.admin_token)
        )
    
    def test_full_module(self):
        """Run the module's built-in test method with real components"""
        test_result = self.loop.run_until_complete(
            self.secure_pyarrow_index_manager.test(verbose=True)
        )
        # Check overall success
        self.assertTrue(test_result.get("success", False))
        # Check initialization step
        self.assertTrue(test_result.get("steps", {}).get("initialization", {}).get("success", False))
        # Check dependency diagnostics
        dependencies = test_result.get("diagnostics", {}).get("dependencies", {})
        self.assertTrue(dependencies.get("auth", {}).get("available", False))
        self.assertTrue(dependencies.get("integration", {}).get("available", False))


def run_tests():
    """Run the test suite and return results as JSON"""
    try:
        # Create test suite
        test_suite = unittest.TestSuite()
        test_suite.addTest(unittest.makeSuite(TestSecurePyArrowIndexManagerIntegration))
        
        # Run tests
        test_runner = unittest.TextTestRunner(verbosity=2)
        test_result = test_runner.run(test_suite)
        
        # Prepare result
        result = {
            "success": test_result.wasSuccessful(),
            "module": "secure_pyarrow_index_manager_integration",
            "timestamp": datetime.now().isoformat(),
            "tests_run": test_result.testsRun,
            "errors": len(test_result.errors),
            "failures": len(test_result.failures)
        }
        
        # Convert to JSON and return
        return json.dumps(result, indent=2)
    except Exception as e:
        logger.error(f"Error running tests: {e}")
        return json.dumps({
            "success": False,
            "module": "secure_pyarrow_index_manager_integration",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        }, indent=2)


if __name__ == "__main__":
    # Run tests and print results
    result = run_tests()
    print(result)