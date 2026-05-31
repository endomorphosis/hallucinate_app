"""
Secure Model Manager Tests

Tests for the secure_model_manager.py module
"""

import os
import json
import asyncio
import unittest
from datetime import datetime
from pathlib import Path

import sys
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("test_secure_model_manager")

# Add parent directory to path to import modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import modules to test
from auth import AuthManager
from secure_model_manager import SecureModelManager, MODEL_CAPABILITIES


class TestSecureModelManager(unittest.TestCase):
    """Test cases for the SecureModelManager"""
    
    def setUp(self):
        """Set up test fixtures"""
        # Create auth manager with mock implementation
        self.auth_manager = AuthManager(metadata={
            "storage_location": os.path.join(os.path.dirname(__file__), "test_auth_storage"),
            "use_mock_implementation": True
        })
        
        # Create mock model manager
        self.model_manager = MockModelManager()
        
        # Create secure model manager with test resources
        self.secure_manager = SecureModelManager(resources={
            "auth": self.auth_manager,
            "model_manager": self.model_manager
        })
        
        # Initialize components
        loop = asyncio.get_event_loop()
        loop.run_until_complete(self.auth_manager.init())
        loop.run_until_complete(self.secure_manager.init())
        
        # Create test user and generate test tokens
        self.test_user = "test-user"
        loop.run_until_complete(self.auth_manager.create_principal(self.test_user))
        
        # Issue capabilities for testing
        admin_result = loop.run_until_complete(
            self.auth_manager.issue_capability("root", self.test_user, {
                "can": MODEL_CAPABILITIES["ADMIN"],
                "with": "*"
            })
        )
        self.admin_token = admin_result["token"]
        
        load_result = loop.run_until_complete(
            self.auth_manager.issue_capability("root", self.test_user, {
                "can": MODEL_CAPABILITIES["LOAD"],
                "with": "*"
            })
        )
        self.load_token = load_result["token"]
        
        inference_result = loop.run_until_complete(
            self.auth_manager.issue_capability("root", self.test_user, {
                "can": MODEL_CAPABILITIES["INFERENCE"],
                "with": "*"
            })
        )
        self.inference_token = inference_result["token"]
        
        list_result = loop.run_until_complete(
            self.auth_manager.issue_capability("root", self.test_user, {
                "can": MODEL_CAPABILITIES["LIST"],
                "with": "*"
            })
        )
        self.list_token = list_result["token"]
        
        cache_result = loop.run_until_complete(
            self.auth_manager.issue_capability("root", self.test_user, {
                "can": MODEL_CAPABILITIES["CACHE"],
                "with": "status"
            })
        )
        self.cache_token = cache_result["token"]
        
        # Test model ID
        self.test_model = "test-model"
    
    def tearDown(self):
        """Tear down test fixtures"""
        # Clean up test storage
        import shutil
        try:
            shutil.rmtree(os.path.join(os.path.dirname(__file__), "test_auth_storage"))
        except OSError:
            pass
    
    def test_initialization(self):
        """Test secure model manager initialization"""
        self.assertTrue(self.secure_manager.initialized)
    
    def test_load_model_with_auth(self):
        """Test loading a model with valid auth token"""
        loop = asyncio.get_event_loop()
        
        # Load a model
        result = loop.run_until_complete(
            self.secure_manager.load_model(self.test_model, {
                "auth_token": self.load_token,
                "user_id": self.test_user
            })
        )
        
        self.assertTrue(result["success"])
        self.assertEqual(result["model_id"], self.test_model)
        
        # Verify model is in cache
        self.assertIn(self.test_model, self.secure_manager.model_access_cache)
        
        # Verify stats were updated
        self.assertEqual(self.secure_manager.stats["models_loaded"], 1)
        self.assertEqual(self.secure_manager.stats["access_granted"], 1)
    
    def test_load_model_without_auth(self):
        """Test loading a model without auth token"""
        loop = asyncio.get_event_loop()
        
        with self.assertRaises(ValueError):
            # Should fail without auth token
            loop.run_until_complete(
                self.secure_manager.load_model(self.test_model, {})
            )
    
    def test_load_model_with_invalid_auth(self):
        """Test loading a model with invalid auth token"""
        loop = asyncio.get_event_loop()
        
        with self.assertRaises(PermissionError):
            # Should fail with invalid token
            loop.run_until_complete(
                self.secure_manager.load_model(self.test_model, {
                    "auth_token": "invalid-token"
                })
            )
    
    def test_run_inference(self):
        """Test running inference on a loaded model"""
        loop = asyncio.get_event_loop()
        
        # First load a model
        loop.run_until_complete(
            self.secure_manager.load_model(self.test_model, {
                "auth_token": self.load_token,
                "user_id": self.test_user
            })
        )
        
        # Run inference
        result = loop.run_until_complete(
            self.secure_manager.run_inference(self.test_model, "test input", {
                "auth_token": self.inference_token,
                "user_id": self.test_user
            })
        )
        
        self.assertTrue(result["success"])
        self.assertEqual(result["model_id"], self.test_model)
        self.assertIn("result", result)
        
        # Verify stats were updated
        self.assertEqual(self.secure_manager.stats["inferences_run"], 1)
        self.assertEqual(self.secure_manager.stats["access_granted"], 2)  # 1 for load, 1 for inference
    
    def test_run_inference_without_loading(self):
        """Test running inference on a model that isn't loaded"""
        loop = asyncio.get_event_loop()
        
        with self.assertRaises(ValueError):
            # Should fail without loading first
            loop.run_until_complete(
                self.secure_manager.run_inference("unloaded-model", "test input", {
                    "auth_token": self.inference_token
                })
            )
    
    def test_unload_model(self):
        """Test unloading a model"""
        loop = asyncio.get_event_loop()
        
        # First load a model
        loop.run_until_complete(
            self.secure_manager.load_model(self.test_model, {
                "auth_token": self.load_token,
                "user_id": self.test_user
            })
        )
        
        # Unload the model
        result = loop.run_until_complete(
            self.secure_manager.unload_model(self.test_model, {
                "auth_token": self.admin_token
            })
        )
        
        self.assertTrue(result["success"])
        self.assertEqual(result["model_id"], self.test_model)
        
        # Verify model is removed from cache
        self.assertNotIn(self.test_model, self.secure_manager.model_access_cache)
    
    def test_list_models(self):
        """Test listing models"""
        loop = asyncio.get_event_loop()
        
        # First load a model
        loop.run_until_complete(
            self.secure_manager.load_model(self.test_model, {
                "auth_token": self.load_token,
                "user_id": self.test_user
            })
        )
        
        # List models
        models = loop.run_until_complete(
            self.secure_manager.list_models({
                "auth_token": self.list_token
            })
        )
        
        self.assertIsInstance(models, list)
        self.assertTrue(len(models) > 0)
        
        # Check that our test model is in the results
        model_ids = [model["id"] for model in models]
        self.assertIn(self.test_model, model_ids)
    
    def test_get_cache_status(self):
        """Test getting cache status"""
        loop = asyncio.get_event_loop()
        
        # First load a model
        loop.run_until_complete(
            self.secure_manager.load_model(self.test_model, {
                "auth_token": self.load_token,
                "user_id": self.test_user
            })
        )
        
        # Get cache status
        status = loop.run_until_complete(
            self.secure_manager.get_cache_status({
                "auth_token": self.cache_token
            })
        )
        
        self.assertIn("cache_size", status)
        self.assertEqual(status["cache_size"], 1)
        self.assertIn("models", status)
        self.assertIn(self.test_model, status["models"])
    
    def test_get_stats(self):
        """Test getting module statistics"""
        loop = asyncio.get_event_loop()
        
        # First load a model and run inference
        loop.run_until_complete(
            self.secure_manager.load_model(self.test_model, {
                "auth_token": self.load_token,
                "user_id": self.test_user
            })
        )
        
        loop.run_until_complete(
            self.secure_manager.run_inference(self.test_model, "test input", {
                "auth_token": self.inference_token,
                "user_id": self.test_user
            })
        )
        
        # Get stats
        stats = loop.run_until_complete(
            self.secure_manager.get_stats({
                "auth_token": self.admin_token
            })
        )
        
        self.assertIn("access_granted", stats)
        self.assertIn("models_loaded", stats)
        self.assertIn("inferences_run", stats)
        self.assertIn("resource_usage", stats)
        
        # Verify counts
        self.assertEqual(stats["models_loaded"], 1)
        self.assertEqual(stats["inferences_run"], 1)
        
        # Verify resource usage tracking
        self.assertIn("by_user", stats["resource_usage"])
        self.assertIn(self.test_user, stats["resource_usage"]["by_user"])
        user_stats = stats["resource_usage"]["by_user"][self.test_user]
        self.assertEqual(user_stats["loads"], 1)
        self.assertEqual(user_stats["inferences"], 1)
    
    def test_module_test_method(self):
        """Test the module's test method"""
        # Run the test method
        test_results = self.secure_manager.test()
        
        # Check structure
        self.assertIn("success", test_results)
        self.assertIn("module", test_results)
        self.assertEqual(test_results["module"], "secure_model_manager")
        
        self.assertIn("initialization", test_results)
        self.assertIn("capability_verification", test_results)
        self.assertIn("model_operations", test_results)
        self.assertIn("stats_tracking", test_results)
        
        # Test should pass
        self.assertTrue(test_results["success"])


class MockModelManager:
    """Mock model manager for testing"""
    
    async def init(self):
        """Initialize mock model manager"""
        return True
    
    async def import_model_from_huggingface(self, model_id):
        """Mock import from HuggingFace"""
        return MockModelMetadata(model_id)
    
    async def import_model_from_ipfs(self, model_id, cid):
        """Mock import from IPFS"""
        return MockModelMetadata(model_id, cid=cid)
    
    async def remove_model(self, model_id):
        """Mock model removal"""
        return True
    
    async def list_models(self):
        """Mock model listing"""
        return {"test-model": MockModelMetadata("test-model")}


class MockModelMetadata:
    """Mock model metadata for testing"""
    
    def __init__(self, model_id, cid=None):
        self.model_id = model_id
        self.cid = cid
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            "model_id": self.model_id,
            "cid": self.cid,
            "mock": True
        }


def run_tests():
    """Run the unit tests and return results as JSON"""
    try:
        # Create a test suite
        test_suite = unittest.TestLoader().loadTestsFromTestCase(TestSecureModelManager)
        
        # Create a text test runner that captures output
        from io import StringIO
        test_output = StringIO()
        test_runner = unittest.TextTestRunner(stream=test_output, verbosity=2)
        
        # Run the tests
        test_result = test_runner.run(test_suite)
        
        # Prepare results
        results = {
            "success": test_result.wasSuccessful(),
            "module": "secure_model_manager",
            "tests_run": test_result.testsRun,
            "errors": len(test_result.errors),
            "failures": len(test_result.failures),
            "skipped": len(test_result.skipped),
            "output": test_output.getvalue()
        }
        
        # Add details for failures and errors
        if test_result.failures:
            results["failure_details"] = [{"test": test[0].id(), "message": test[1]} for test in test_result.failures]
        
        if test_result.errors:
            results["error_details"] = [{"test": test[0].id(), "message": test[1]} for test in test_result.errors]
        
        # Save results to a file for easier retrieval
        with open(os.path.join(os.path.dirname(__file__), "test_secure_model_manager_results.json"), "w") as f:
            json.dump(results, f, indent=2)
        
        return results
    except Exception as e:
        logger.error(f"Failed to run secure model manager tests: {e}")
        return {
            "success": False,
            "module": "secure_model_manager",
            "error": str(e)
        }


if __name__ == "__main__":
    # Run tests and print results
    results = run_tests()
    print(json.dumps(results, indent=2))