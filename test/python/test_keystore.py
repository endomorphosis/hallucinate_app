import unittest
import json
import os
import sys
import asyncio
import tempfile
import shutil
from pathlib import Path
from datetime import datetime, timedelta

# Add project root to Python path to ensure imports work
project_root = Path(__file__).parents[2]
sys.path.append(str(project_root))

# Import the Keystore module
try:
    from hallucinate_app.python.hallucinate_app.keystore import Keystore
except ImportError:
    # Try alternative import path
    try:
        from hallucinate_app.hallucinate_app.keystore import Keystore
    except ImportError:
        print("Failed to import Keystore module. Make sure the module exists and paths are correct.")
        sys.exit(1)

class TestKeystore(unittest.TestCase):
    """Test the Keystore module for secure credential storage"""
    
    @classmethod
    def setUpClass(cls):
        # Create a temporary directory for testing
        cls.test_dir = tempfile.mkdtemp(prefix="hallucinate_app_keystore_test_")
        
        # Test encryption key
        cls.test_key = "test_master_key_do_not_use_in_production"
        
        # Initialize the keystore
        cls.keystore = Keystore(metadata={
            "encryption_key": cls.test_key,
            "storage_location": cls.test_dir
        })
        
        # Initialize event loop for async tests
        cls.loop = asyncio.get_event_loop()
        if cls.loop.is_closed():
            cls.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(cls.loop)
        
        # Initialize the keystore
        cls.loop.run_until_complete(cls.keystore.init())
    
    @classmethod
    def tearDownClass(cls):
        # Remove the temporary directory
        shutil.rmtree(cls.test_dir)
    
    def test_initialization(self):
        """Test that the keystore initialized correctly"""
        self.assertTrue(self.keystore.initialized)
        self.assertTrue(os.path.exists(self.test_dir))
    
    def test_key_storage_and_retrieval(self):
        """Test storing and retrieving keys"""
        test_provider = "test_provider"
        test_key = f"test_api_key_{int(datetime.now().timestamp())}"
        
        # Store the key
        result = self.loop.run_until_complete(
            self.keystore.set_key(test_provider, test_key)
        )
        self.assertTrue(result)
        
        # Retrieve the key
        retrieved_key = self.loop.run_until_complete(
            self.keystore.get_key(test_provider)
        )
        self.assertEqual(retrieved_key, test_key)
        
        # Clean up
        self.loop.run_until_complete(
            self.keystore.delete_key(test_provider)
        )
    
    def test_key_info(self):
        """Test getting key info without exposing the key"""
        test_provider = "info_provider"
        test_key = f"info_api_key_{int(datetime.now().timestamp())}"
        
        # Store the key
        self.loop.run_until_complete(
            self.keystore.set_key(test_provider, test_key, {
                "name": "test info key"
            })
        )
        
        # Get key info
        key_info = self.loop.run_until_complete(
            self.keystore.get_key_info(test_provider)
        )
        
        # Verify info
        self.assertIsNotNone(key_info)
        self.assertEqual(key_info["provider"], test_provider)
        self.assertEqual(key_info["name"], "test info key")
        self.assertNotIn("key", key_info)
        
        # Clean up
        self.loop.run_until_complete(
            self.keystore.delete_key(test_provider)
        )
    
    def test_key_rotation(self):
        """Test rotating a key to a new value"""
        test_provider = "rotation_provider"
        original_key = f"original_key_{int(datetime.now().timestamp())}"
        rotated_key = f"rotated_key_{int(datetime.now().timestamp())}"
        
        # Store the key
        self.loop.run_until_complete(
            self.keystore.set_key(test_provider, original_key)
        )
        
        # Rotate the key
        result = self.loop.run_until_complete(
            self.keystore.rotate_key(test_provider, rotated_key)
        )
        self.assertTrue(result)
        
        # Verify the key was rotated
        retrieved_key = self.loop.run_until_complete(
            self.keystore.get_key(test_provider)
        )
        self.assertEqual(retrieved_key, rotated_key)
        
        # Verify key info includes rotation data
        key_info = self.loop.run_until_complete(
            self.keystore.get_key_info(test_provider)
        )
        self.assertIn("rotated_from", key_info)
        
        # Clean up
        self.loop.run_until_complete(
            self.keystore.delete_key(test_provider)
        )
    
    def test_expired_keys(self):
        """Test behavior with expired keys"""
        test_provider = "expired_provider"
        test_key = f"expired_key_{int(datetime.now().timestamp())}"
        
        # Set a key that's already expired
        yesterday = datetime.now() - timedelta(days=1)
        self.loop.run_until_complete(
            self.keystore.set_key(test_provider, test_key, {
                "expires_at": yesterday.isoformat()
            })
        )
        
        # Try to get the expired key
        retrieved_key = self.loop.run_until_complete(
            self.keystore.get_key(test_provider)
        )
        self.assertIsNone(retrieved_key)
        
        # Verify key info shows as expired
        key_info = self.loop.run_until_complete(
            self.keystore.get_key_info(test_provider)
        )
        self.assertTrue(key_info["is_expired"])
        
        # Clean up
        self.loop.run_until_complete(
            self.keystore.delete_key(test_provider)
        )
    
    def test_listing_providers(self):
        """Test listing all providers"""
        # Add several test keys
        providers = ["list_test_1", "list_test_2", "list_test_3"]
        for provider in providers:
            self.loop.run_until_complete(
                self.keystore.set_key(provider, f"key_for_{provider}")
            )
        
        # List all providers
        listed_providers = self.loop.run_until_complete(
            self.keystore.list_providers()
        )
        
        # Verify all test providers are in the list
        for provider in providers:
            self.assertIn(provider, listed_providers)
        
        # Clean up
        for provider in providers:
            self.loop.run_until_complete(
                self.keystore.delete_key(provider)
            )
    
    def test_persistence(self):
        """Test that keys persist across instances"""
        test_provider = "persistence_test"
        test_key = f"persistence_key_{int(datetime.now().timestamp())}"
        
        # Store a key
        self.loop.run_until_complete(
            self.keystore.set_key(test_provider, test_key)
        )
        
        # Create a new keystore instance
        new_keystore = Keystore(metadata={
            "encryption_key": self.test_key,
            "storage_location": self.test_dir
        })
        self.loop.run_until_complete(new_keystore.init())
        
        # Retrieve the key from the new instance
        retrieved_key = self.loop.run_until_complete(
            new_keystore.get_key(test_provider)
        )
        
        # Verify it's the same key
        self.assertEqual(retrieved_key, test_key)
        
        # Clean up
        self.loop.run_until_complete(
            self.keystore.delete_key(test_provider)
        )
    
    def test_self_test_method(self):
        """Test the module's own test method"""
        test_result = self.keystore.test()
        
        # Verify test structure
        self.assertIsInstance(test_result, dict)
        self.assertIn("success", test_result)
        self.assertIn("module", test_result)
        self.assertEqual(test_result["module"], "keystore")
        
        # Check security info
        self.assertIn("security", test_result)
        self.assertIn("cryptography_available", test_result["security"])

if __name__ == "__main__":
    # Run unit tests and output results in JSON format
    test_loader = unittest.TestLoader()
    test_suite = test_loader.loadTestsFromTestCase(TestKeystore)
    test_runner = unittest.TextTestRunner(verbosity=2)
    test_result = test_runner.run(test_suite)
    
    # Output results in JSON format
    results = {
        "total": test_result.testsRun,
        "failures": len(test_result.failures),
        "errors": len(test_result.errors),
        "success": test_result.wasSuccessful()
    }
    
    print(f"\nTest Summary: {json.dumps(results)}")