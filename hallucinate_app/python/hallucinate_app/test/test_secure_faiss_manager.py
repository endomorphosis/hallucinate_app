"""
Test module for Secure FAISS Manager

Tests capability-based access control for FAISS vector operations
"""

import unittest
import asyncio
import json
import os
import sys
import logging
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_secure_faiss_manager")

# Import project modules
try:
    from ..secure_faiss_manager import secure_faiss_manager, SecureFaissManager, FAISS_CAPABILITIES
    from ..auth import auth_manager
    has_imports = True
except ImportError:
    logger.error("Failed to import required modules")
    has_imports = False


class TestSecureFaissManager(unittest.TestCase):
    """Test class for the Secure FAISS Manager module"""
    
    def setUp(self):
        """Set up the test environment"""
        self.secure_faiss_manager = secure_faiss_manager
        self.test_capabilities = {
            "create": FAISS_CAPABILITIES['CREATE'],
            "add": FAISS_CAPABILITIES['ADD'],
            "search": FAISS_CAPABILITIES['SEARCH'],
            "save": FAISS_CAPABILITIES['SAVE'],
            "load": FAISS_CAPABILITIES['LOAD'],
            "list": FAISS_CAPABILITIES['LIST'],
            "admin": FAISS_CAPABILITIES['ADMIN']
        }
        
        # Create event loop for async tests
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Initialize components
        self.loop.run_until_complete(auth_manager.init())
        self.loop.run_until_complete(self.secure_faiss_manager.init())
        
        # Create test user and issue capabilities
        self.test_user = "test-user-" + datetime.now().strftime("%Y%m%d%H%M%S")
        self.loop.run_until_complete(auth_manager.create_principal(self.test_user))
        
        # Issue capabilities
        self.admin_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["admin"],
                "with": "*"
            })
        )["token"]
        
        self.create_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["create"],
                "with": "*"
            })
        )["token"]
        
        self.add_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["add"],
                "with": "*"
            })
        )["token"]
        
        self.search_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["search"],
                "with": "*"
            })
        )["token"]
        
        self.save_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["save"],
                "with": "*"
            })
        )["token"]
        
        self.load_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["load"],
                "with": "*"
            })
        )["token"]
        
        self.list_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["list"],
                "with": "*"
            })
        )["token"]
    
    def tearDown(self):
        """Clean up after tests"""
        # Close the event loop
        self.loop.close()
    
    def test_initialization(self):
        """Test initialization of the secure FAISS manager"""
        self.assertTrue(self.secure_faiss_manager.initialized)
    
    def test_capability_verification_create(self):
        """Test capability verification for index creation"""
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_faiss_manager.create_index(128, {
                "auth_token": self.create_token
            })
        )
        self.assertIn("index_id", result)
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_faiss_manager.create_index(128, {
                    "auth_token": "invalid-token"
                })
            )
    
    def test_capability_verification_add(self):
        """Test capability verification for vector addition"""
        # Create an index first
        create_result = self.loop.run_until_complete(
            self.secure_faiss_manager.create_index(128, {
                "auth_token": self.create_token
            })
        )
        self.assertIn("index_id", create_result)
        index_id = create_result["index_id"]
        
        # Test with valid token
        test_vectors = [[0.1, 0.2, 0.3, 0.4] * 32]  # 128 dimensions
        result = self.loop.run_until_complete(
            self.secure_faiss_manager.add_vectors(index_id, test_vectors, {
                "auth_token": self.add_token
            })
        )
        self.assertTrue(result.get("success", False))
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_faiss_manager.add_vectors(index_id, test_vectors, {
                    "auth_token": "invalid-token"
                })
            )
    
    def test_capability_verification_search(self):
        """Test capability verification for vector search"""
        # Create an index and add vectors first
        create_result = self.loop.run_until_complete(
            self.secure_faiss_manager.create_index(128, {
                "auth_token": self.create_token
            })
        )
        self.assertIn("index_id", create_result)
        index_id = create_result["index_id"]
        
        test_vectors = [[0.1, 0.2, 0.3, 0.4] * 32]  # 128 dimensions
        add_result = self.loop.run_until_complete(
            self.secure_faiss_manager.add_vectors(index_id, test_vectors, {
                "auth_token": self.add_token
            })
        )
        self.assertTrue(add_result.get("success", False))
        
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_faiss_manager.search(index_id, test_vectors[0], {
                "auth_token": self.search_token,
                "k": 3
            })
        )
        self.assertIn("results", result)
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_faiss_manager.search(index_id, test_vectors[0], {
                    "auth_token": "invalid-token",
                    "k": 3
                })
            )
    
    def test_capability_verification_save(self):
        """Test capability verification for index saving"""
        # Create an index first
        create_result = self.loop.run_until_complete(
            self.secure_faiss_manager.create_index(128, {
                "auth_token": self.create_token
            })
        )
        self.assertIn("index_id", create_result)
        index_id = create_result["index_id"]
        
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_faiss_manager.save_to_ipfs(index_id, {
                "auth_token": self.save_token
            })
        )
        self.assertIn("cid", result)
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_faiss_manager.save_to_ipfs(index_id, {
                    "auth_token": "invalid-token"
                })
            )
    
    def test_capability_verification_load(self):
        """Test capability verification for index loading"""
        # Create and save an index first
        create_result = self.loop.run_until_complete(
            self.secure_faiss_manager.create_index(128, {
                "auth_token": self.create_token
            })
        )
        self.assertIn("index_id", create_result)
        index_id = create_result["index_id"]
        
        save_result = self.loop.run_until_complete(
            self.secure_faiss_manager.save_to_ipfs(index_id, {
                "auth_token": self.save_token
            })
        )
        self.assertIn("cid", save_result)
        cid = save_result["cid"]
        
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_faiss_manager.load_from_ipfs(cid, {
                "auth_token": self.load_token
            })
        )
        self.assertIn("index_id", result)
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_faiss_manager.load_from_ipfs(cid, {
                    "auth_token": "invalid-token"
                })
            )
    
    def test_capability_verification_list(self):
        """Test capability verification for index listing"""
        # Create an index first to ensure there's something to list
        self.loop.run_until_complete(
            self.secure_faiss_manager.create_index(128, {
                "auth_token": self.create_token
            })
        )
        
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_faiss_manager.list_indexes({
                "auth_token": self.list_token
            })
        )
        self.assertIn("indexes", result)
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_faiss_manager.list_indexes({
                    "auth_token": "invalid-token"
                })
            )
    
    def test_stats_tracking(self):
        """Test statistics tracking"""
        # Perform some operations to generate stats
        create_result = self.loop.run_until_complete(
            self.secure_faiss_manager.create_index(128, {
                "auth_token": self.create_token,
                "user_id": self.test_user
            })
        )
        index_id = create_result["index_id"]
        
        test_vectors = [[0.1, 0.2, 0.3, 0.4] * 32]  # 128 dimensions
        self.loop.run_until_complete(
            self.secure_faiss_manager.add_vectors(index_id, test_vectors, {
                "auth_token": self.add_token,
                "user_id": self.test_user
            })
        )
        
        self.loop.run_until_complete(
            self.secure_faiss_manager.search(index_id, test_vectors[0], {
                "auth_token": self.search_token,
                "user_id": self.test_user,
                "k": 3
            })
        )
        
        # Get stats
        stats = self.loop.run_until_complete(
            self.secure_faiss_manager.get_stats({
                "auth_token": self.admin_token
            })
        )
        
        # Verify stats content
        self.assertIn("access_granted", stats)
        self.assertIn("indexes_created", stats)
        self.assertIn("vectors_added", stats)
        self.assertIn("searches_performed", stats)
        self.assertIn("resource_usage", stats)
        
        # Verify resource usage tracking
        self.assertIn("index_count", stats["resource_usage"])
        self.assertIn("top_indexes", stats["resource_usage"])
        
        # Verify user stats
        self.assertIn("by_user", stats["resource_usage"])
        if self.test_user in stats["resource_usage"]["by_user"]:
            user_stats = stats["resource_usage"]["by_user"][self.test_user]
            self.assertIn("creates", user_stats)
            self.assertIn("adds", user_stats)
            self.assertIn("searches", user_stats)
            self.assertIn("indexes", user_stats)
    
    def test_full_module(self):
        """Run the module's built-in test method"""
        test_result = self.secure_faiss_manager.test()
        self.assertTrue(test_result["success"])
        self.assertTrue(test_result["initialization"])


def run_tests():
    """Run the test suite and return results as JSON"""
    try:
        # Create test suite
        test_suite = unittest.TestSuite()
        test_suite.addTest(unittest.makeSuite(TestSecureFaissManager))
        
        # Run tests
        test_runner = unittest.TextTestRunner(verbosity=2)
        test_result = test_runner.run(test_suite)
        
        # Prepare result
        result = {
            "success": test_result.wasSuccessful(),
            "module": "secure_faiss_manager",
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
            "module": "secure_faiss_manager",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        }, indent=2)


if __name__ == "__main__":
    # Run tests and print results
    result = run_tests()
    print(result)