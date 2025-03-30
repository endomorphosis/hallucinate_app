"""
Test module for Secure Dataset Manager

Tests capability-based access control for datasets
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
logger = logging.getLogger("test_secure_datasets_manager")

# Import project modules
try:
    from ..secure_datasets_manager import secure_dataset_manager, SecureDatasetManager, DATASET_CAPABILITIES
    from ..auth import auth_manager
    has_imports = True
except ImportError:
    logger.error("Failed to import required modules")
    has_imports = False


class TestSecureDatasetManager(unittest.TestCase):
    """Test class for the Secure Dataset Manager module"""
    
    def setUp(self):
        """Set up the test environment"""
        self.secure_dataset_manager = secure_dataset_manager
        self.test_capabilities = {
            "load": DATASET_CAPABILITIES['LOAD'],
            "import": DATASET_CAPABILITIES['IMPORT'],
            "remove": DATASET_CAPABILITIES['REMOVE'],
            "list": DATASET_CAPABILITIES['LIST'],
            "sample": DATASET_CAPABILITIES['SAMPLE'],
            "admin": DATASET_CAPABILITIES['ADMIN']
        }
        
        # Create event loop for async tests
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Initialize components
        self.loop.run_until_complete(auth_manager.init())
        self.loop.run_until_complete(self.secure_dataset_manager.init())
        
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
        
        self.load_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["load"],
                "with": "*"
            })
        )["token"]
        
        self.import_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["import"],
                "with": "*"
            })
        )["token"]
        
        self.sample_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["sample"],
                "with": "*"
            })
        )["token"]
        
        self.list_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["list"],
                "with": "*"
            })
        )["token"]
        
        self.remove_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["remove"],
                "with": "*"
            })
        )["token"]
    
    def tearDown(self):
        """Clean up after tests"""
        # Close the event loop
        self.loop.close()
    
    def test_initialization(self):
        """Test initialization of the secure dataset manager"""
        self.assertTrue(self.secure_dataset_manager.initialized)
    
    def test_capability_verification_load(self):
        """Test capability verification for dataset loading"""
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_dataset_manager.load_dataset("test-dataset", {
                "auth_token": self.load_token
            })
        )
        self.assertIn("dataset_id", result)
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_dataset_manager.load_dataset("test-dataset", {
                    "auth_token": "invalid-token"
                })
            )
    
    def test_capability_verification_import(self):
        """Test capability verification for dataset importing"""
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_dataset_manager.import_dataset_from_ipfs("test-dataset", "test-cid", {
                "auth_token": self.import_token
            })
        )
        self.assertIn("dataset_id", result)
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_dataset_manager.import_dataset_from_ipfs("test-dataset", "test-cid", {
                    "auth_token": "invalid-token"
                })
            )
    
    def test_capability_verification_sample(self):
        """Test capability verification for dataset sampling"""
        # Load a dataset first
        self.loop.run_until_complete(
            self.secure_dataset_manager.load_dataset("test-dataset", {
                "auth_token": self.load_token
            })
        )
        
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_dataset_manager.get_sample("test-dataset", {
                "auth_token": self.sample_token,
                "num_samples": 2
            })
        )
        self.assertIn("dataset_id", result)
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_dataset_manager.get_sample("test-dataset", {
                    "auth_token": "invalid-token"
                })
            )
    
    def test_capability_verification_list(self):
        """Test capability verification for dataset listing"""
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_dataset_manager.list_datasets({
                "auth_token": self.list_token
            })
        )
        self.assertIsInstance(result, dict)
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_dataset_manager.list_datasets({
                    "auth_token": "invalid-token"
                })
            )
    
    def test_capability_verification_remove(self):
        """Test capability verification for dataset removal"""
        # Load a dataset first
        self.loop.run_until_complete(
            self.secure_dataset_manager.load_dataset("test-dataset-remove", {
                "auth_token": self.load_token
            })
        )
        
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_dataset_manager.remove_dataset("test-dataset-remove", {
                "auth_token": self.remove_token
            })
        )
        self.assertTrue(result)
        
        # Load dataset again for invalid token test
        self.loop.run_until_complete(
            self.secure_dataset_manager.load_dataset("test-dataset-remove", {
                "auth_token": self.load_token
            })
        )
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_dataset_manager.remove_dataset("test-dataset-remove", {
                    "auth_token": "invalid-token"
                })
            )
    
    def test_stats_tracking(self):
        """Test statistics tracking"""
        # Perform some operations to generate stats
        self.loop.run_until_complete(
            self.secure_dataset_manager.load_dataset("test-dataset-stats", {
                "auth_token": self.load_token,
                "user_id": self.test_user
            })
        )
        
        self.loop.run_until_complete(
            self.secure_dataset_manager.get_sample("test-dataset-stats", {
                "auth_token": self.sample_token,
                "user_id": self.test_user,
                "num_samples": 3
            })
        )
        
        # Get stats
        stats = self.loop.run_until_complete(
            self.secure_dataset_manager.get_stats({
                "auth_token": self.admin_token
            })
        )
        
        # Verify stats content
        self.assertIn("access_granted", stats)
        self.assertIn("datasets_loaded", stats)
        self.assertIn("samples_retrieved", stats)
        self.assertIn("resource_usage", stats)
        
        # Verify resource usage tracking
        self.assertIn("dataset_count", stats["resource_usage"])
        self.assertIn("top_datasets", stats["resource_usage"])
        
        # Verify user stats
        self.assertIn("by_user", stats["resource_usage"])
        if self.test_user in stats["resource_usage"]["by_user"]:
            user_stats = stats["resource_usage"]["by_user"][self.test_user]
            self.assertIn("loads", user_stats)
            self.assertIn("samples", user_stats)
            self.assertIn("datasets", user_stats)
    
    def test_full_module(self):
        """Run the module's built-in test method"""
        test_result = self.secure_dataset_manager.test()
        self.assertTrue(test_result["success"])
        self.assertTrue(test_result["initialization"])
        self.assertTrue(all(test_result["dataset_operations"].values()))


def run_tests():
    """Run the test suite and return results as JSON"""
    try:
        # Create test suite
        test_suite = unittest.TestSuite()
        test_suite.addTest(unittest.makeSuite(TestSecureDatasetManager))
        
        # Run tests
        test_runner = unittest.TextTestRunner(verbosity=2)
        test_result = test_runner.run(test_suite)
        
        # Prepare result
        result = {
            "success": test_result.wasSuccessful(),
            "module": "secure_datasets_manager",
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
            "module": "secure_datasets_manager",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        }, indent=2)


if __name__ == "__main__":
    # Run tests and print results
    result = run_tests()
    print(result)