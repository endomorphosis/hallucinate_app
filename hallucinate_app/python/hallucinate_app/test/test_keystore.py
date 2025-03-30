"""
Test Keystore Module

Tests functionality of the keystore.py module
"""

import os
import sys
import json
import asyncio
import unittest
from pathlib import Path
from datetime import datetime, timedelta

# Add parent directory to path to import hallucinate_app modules
sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.keystore import keystore, Keystore


class TestKeystore(unittest.TestCase):
    """
    Test case for the Keystore class
    """
    
    def setUp(self):
        """Set up test environment"""
        # Create a unique test directory for keystore data
        test_dir = Path(os.path.expanduser('~')) / '.hallucinate_app_test' / 'keystore'
        test_dir.mkdir(parents=True, exist_ok=True)
        
        # Set test encryption key
        test_key = "test_encryption_key_" + os.urandom(8).hex()
        
        # Initialize test keystore
        self.keystore = Keystore({
            'encryption_key': test_key,
            'storage_location': str(test_dir),
            'use_platform_storage': False
        })
        
        # Initialize keystore using asyncio
        asyncio.run(self.keystore.init())
    
    def tearDown(self):
        """Clean up after tests"""
        # Optional: Clean up test files
        pass
    
    def test_initialization(self):
        """Test if keystore can be initialized"""
        self.assertTrue(self.keystore.initialized)
    
    def test_key_storage_and_retrieval(self):
        """Test if keys can be stored and retrieved"""
        provider = "test_provider"
        api_key = "test_api_key_" + os.urandom(8).hex()
        
        # Store key
        result = asyncio.run(self.keystore.set_key(provider, api_key))
        self.assertTrue(result)
        
        # Retrieve key
        retrieved = asyncio.run(self.keystore.get_key(provider))
        self.assertEqual(retrieved, api_key)
    
    def test_key_info_retrieval(self):
        """Test if key info can be retrieved"""
        provider = "test_provider_info"
        api_key = "test_api_key_" + os.urandom(8).hex()
        
        # Store key
        options = {
            'name': 'Test Key',
        }
        result = asyncio.run(self.keystore.set_key(provider, api_key, options))
        self.assertTrue(result)
        
        # Retrieve key info
        info = asyncio.run(self.keystore.get_key_info(provider))
        self.assertIsNotNone(info)
        self.assertEqual(info['provider'], provider)
        self.assertEqual(info['name'], 'Test Key')
        self.assertFalse(info['is_expired'])
    
    def test_key_expiration(self):
        """Test if key expiration works"""
        provider = "test_provider_expiration"
        api_key = "test_api_key_" + os.urandom(8).hex()
        
        # Create expired key (1 day ago)
        expires_at = datetime.now() - timedelta(days=1)
        
        # Store key
        options = {
            'name': 'Expired Key',
            'expires_at': expires_at
        }
        result = asyncio.run(self.keystore.set_key(provider, api_key, options))
        self.assertTrue(result)
        
        # Retrieve key (should be None because it's expired)
        retrieved = asyncio.run(self.keystore.get_key(provider))
        self.assertIsNone(retrieved)
        
        # Check if key info shows as expired
        info = asyncio.run(self.keystore.get_key_info(provider))
        self.assertTrue(info['is_expired'])
    
    def test_key_rotation(self):
        """Test if keys can be rotated"""
        provider = "test_provider_rotation"
        api_key = "test_api_key_" + os.urandom(8).hex()
        new_key = "new_api_key_" + os.urandom(8).hex()
        
        # Store key
        result = asyncio.run(self.keystore.set_key(provider, api_key))
        self.assertTrue(result)
        
        # Rotate key
        rotated = asyncio.run(self.keystore.rotate_key(provider, new_key))
        self.assertTrue(rotated)
        
        # Retrieve rotated key
        retrieved = asyncio.run(self.keystore.get_key(provider))
        self.assertEqual(retrieved, new_key)
        
        # Verify rotation metadata
        info = asyncio.run(self.keystore.get_key_info(provider))
        self.assertIn('rotated_from', info)
        self.assertIn('rotated_at', info['rotated_from'])
    
    def test_key_deletion(self):
        """Test if keys can be deleted"""
        provider = "test_provider_deletion"
        api_key = "test_api_key_" + os.urandom(8).hex()
        
        # Store key
        result = asyncio.run(self.keystore.set_key(provider, api_key))
        self.assertTrue(result)
        
        # Delete key
        deleted = asyncio.run(self.keystore.delete_key(provider))
        self.assertTrue(deleted)
        
        # Verify key is gone
        retrieved = asyncio.run(self.keystore.get_key(provider))
        self.assertIsNone(retrieved)
        
        info = asyncio.run(self.keystore.get_key_info(provider))
        self.assertIsNone(info)
    
    def test_key_listing(self):
        """Test if keys can be listed"""
        # Store multiple keys
        providers = ["provider1", "provider2", "provider3"]
        for provider in providers:
            api_key = "test_api_key_" + os.urandom(8).hex()
            asyncio.run(self.keystore.set_key(provider, api_key))
        
        # List providers
        listed = asyncio.run(self.keystore.list_providers())
        
        # Verify all providers are listed
        for provider in providers:
            self.assertIn(provider, listed)
    
    def test_keystore_module_test_method(self):
        """Test the keystore module's test method"""
        test_results = asyncio.run(self.keystore.test())
        self.assertTrue(test_results["success"])
        self.assertEqual(test_results["module"], "keystore")
        self.assertTrue(test_results["initialization"])
        self.assertTrue(all(test_results["key_operations"].values()))
        self.assertTrue(test_results["persistence"])


if __name__ == '__main__':
    # Run tests
    unittest.main()
