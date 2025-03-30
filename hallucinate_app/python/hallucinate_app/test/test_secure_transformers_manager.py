"""
Test module for Secure Transformers Manager

Tests capability-based access control for transformer models
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
logger = logging.getLogger("test_secure_transformers_manager")

# Import project modules
try:
    from ..secure_transformers_manager import secure_transformers_manager, SecureTransformersManager, TRANSFORMER_CAPABILITIES
    from ..auth import auth_manager
    has_imports = True
except ImportError:
    logger.error("Failed to import required modules")
    has_imports = False


class TestSecureTransformersManager(unittest.TestCase):
    """Test class for the Secure Transformers Manager module"""
    
    def setUp(self):
        """Set up the test environment"""
        self.secure_transformers_manager = secure_transformers_manager
        self.test_capabilities = {
            "load": TRANSFORMER_CAPABILITIES['LOAD'],
            "inference": TRANSFORMER_CAPABILITIES['INFERENCE'],
            "list": TRANSFORMER_CAPABILITIES['LIST'],
            "admin": TRANSFORMER_CAPABILITIES['ADMIN']
        }
        
        # Create event loop for async tests
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Initialize components
        self.loop.run_until_complete(auth_manager.init())
        self.loop.run_until_complete(self.secure_transformers_manager.init())
        
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
        
        self.inference_token = self.loop.run_until_complete(
            auth_manager.issue_capability("root", self.test_user, {
                "can": self.test_capabilities["inference"],
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
        """Test initialization of the secure transformers manager"""
        self.assertTrue(self.secure_transformers_manager.initialized)
    
    def test_capability_verification_load(self):
        """Test capability verification for model loading"""
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_transformers_manager.load_model("test-model", {
                "auth_token": self.load_token
            })
        )
        self.assertTrue(result.get("success", False))
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_transformers_manager.load_model("test-model", {
                    "auth_token": "invalid-token"
                })
            )
    
    def test_capability_verification_inference(self):
        """Test capability verification for model inference"""
        # Load a model first
        self.loop.run_until_complete(
            self.secure_transformers_manager.load_model("test-model", {
                "auth_token": self.load_token,
                "task": "text-generation"
            })
        )
        
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_transformers_manager.run_inference("Test input", {
                "auth_token": self.inference_token,
                "model_id": "test-model"
            })
        )
        self.assertIn("results", result)
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_transformers_manager.run_inference("Test input", {
                    "auth_token": "invalid-token",
                    "model_id": "test-model"
                })
            )
    
    def test_capability_verification_list(self):
        """Test capability verification for model listing"""
        # Load a model first
        self.loop.run_until_complete(
            self.secure_transformers_manager.load_model("test-model", {
                "auth_token": self.load_token
            })
        )
        
        # Test with valid token
        result = self.loop.run_until_complete(
            self.secure_transformers_manager.list_models({
                "auth_token": self.list_token
            })
        )
        self.assertTrue(result.get("success", False))
        self.assertIn("models", result)
        
        # Test with invalid token
        with self.assertRaises((PermissionError, ValueError)):
            self.loop.run_until_complete(
                self.secure_transformers_manager.list_models({
                    "auth_token": "invalid-token"
                })
            )
    
    def test_stats_tracking(self):
        """Test statistics tracking"""
        # Perform some operations to generate stats
        self.loop.run_until_complete(
            self.secure_transformers_manager.load_model("test-model-stats", {
                "auth_token": self.load_token,
                "user_id": self.test_user
            })
        )
        
        self.loop.run_until_complete(
            self.secure_transformers_manager.run_inference("Test input for stats", {
                "auth_token": self.inference_token,
                "model_id": "test-model-stats",
                "user_id": self.test_user
            })
        )
        
        # Get stats
        stats = self.loop.run_until_complete(
            self.secure_transformers_manager.get_stats({
                "auth_token": self.admin_token
            })
        )
        
        # Verify stats content
        self.assertIn("access_granted", stats)
        self.assertIn("models_loaded", stats)
        self.assertIn("inferences_run", stats)
        self.assertIn("resource_usage", stats)
        
        # Verify resource usage tracking
        self.assertIn("model_count", stats["resource_usage"])
        self.assertIn("top_models", stats["resource_usage"])
        
        # Verify user stats
        self.assertIn("by_user", stats["resource_usage"])
        if self.test_user in stats["resource_usage"]["by_user"]:
            user_stats = stats["resource_usage"]["by_user"][self.test_user]
            self.assertIn("loads", user_stats)
            self.assertIn("inferences", user_stats)
            self.assertIn("models", user_stats)
    
    def test_full_module(self):
        """Run the module's built-in test method"""
        test_result = self.secure_transformers_manager.test()
        self.assertTrue(test_result["success"])
        self.assertTrue(test_result["initialization"])
        self.assertTrue(all(test_result["model_operations"].values()))


def run_tests():
    """Run the test suite and return results as JSON"""
    try:
        # Create test suite
        test_suite = unittest.TestSuite()
        test_suite.addTest(unittest.makeSuite(TestSecureTransformersManager))
        
        # Run tests
        test_runner = unittest.TextTestRunner(verbosity=2)
        test_result = test_runner.run(test_suite)
        
        # Prepare result
        result = {
            "success": test_result.wasSuccessful(),
            "module": "secure_transformers_manager",
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
            "module": "secure_transformers_manager",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        }, indent=2)


if __name__ == "__main__":
    # Run tests and print results
    result = run_tests()
    print(result)