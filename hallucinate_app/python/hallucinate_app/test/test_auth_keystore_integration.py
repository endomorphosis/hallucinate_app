"""
Test Auth-Keystore Integration Module

Tests functionality of the auth_keystore_integration.py module
"""

import os
import sys
import json
import asyncio
import unittest
from pathlib import Path

# Add parent directory to path to import hallucinate_app modules
sys.path.append(str(Path(__file__).parent.parent.parent))

from hallucinate_app.auth import auth_manager, AuthManager
from hallucinate_app.keystore import keystore, Keystore
from hallucinate_app.auth_keystore_integration import auth_keystore_integration, AuthKeystoreIntegration


class TestAuthKeystoreIntegration(unittest.TestCase):
    """
    Test case for the AuthKeystoreIntegration class
    """
    
    def setUp(self):
        """Set up test environment"""
        # Create unique test directories
        test_base_dir = Path(os.path.expanduser('~')) / '.hallucinate_app_test' / f'integration_{os.urandom(4).hex()}'
        auth_dir = test_base_dir / 'auth'
        keystore_dir = test_base_dir / 'keystore'
        
        auth_dir.mkdir(parents=True, exist_ok=True)
        keystore_dir.mkdir(parents=True, exist_ok=True)
        
        # Set test encryption key
        test_key = "test_encryption_key_" + os.urandom(8).hex()
        
        # Initialize test components
        self.auth = AuthManager(
            metadata={
                'storage_location': str(auth_dir),
                'use_mock_implementation': True
            }
        )
        asyncio.run(self.auth.init())
        
        self.keystore = Keystore({
            'encryption_key': test_key,
            'storage_location': str(keystore_dir),
            'use_platform_storage': False
        })
        asyncio.run(self.keystore.init())
        
        # Create integration with our test instances
        self.integration = AuthKeystoreIntegration(
            resources={
                'auth': self.auth,
                'keystore': self.keystore
            }
        )
        asyncio.run(self.integration.init())
    
    def tearDown(self):
        """Clean up after tests"""
        # Optional: Clean up test files
        pass
    
    def test_initialization(self):
        """Test if integration can be initialized"""
        self.assertTrue(self.integration.initialized)
        self.assertTrue(self.auth.initialized)
        self.assertTrue(self.keystore.initialized)
    
    def test_authorized_key_operations(self):
        """Test authorized key operations"""
        # Setup
        test_provider = "test_provider_auth"
        test_key = "test_api_key_" + os.urandom(8).hex()
        
        # Create principals
        asyncio.run(self.auth.create_principal("admin"))
        asyncio.run(self.auth.create_principal("user"))
        
        # Issue management capability to admin
        admin_token = asyncio.run(self.auth.issue_capability(
            "root", "admin", {
                "can": self.integration.CAPABILITIES["KEY_MANAGE"],
                "with": "*"
            }
        ))
        
        # Issue list capability to user
        list_token = asyncio.run(self.auth.issue_capability(
            "root", "user", {
                "can": self.integration.CAPABILITIES["KEY_LIST"],
                "with": "*"
            }
        ))
        
        # Issue access capability to user
        access_token = asyncio.run(self.auth.issue_capability(
            "root", "user", {
                "can": self.integration.CAPABILITIES["KEY_ACCESS"],
                "with": test_provider
            }
        ))
        
        # Test setting key with authorization
        set_result = asyncio.run(self.integration.set_authorized_key(
            test_provider, test_key, admin_token["token"]
        ))
        self.assertTrue(set_result)
        
        # Test listing providers with authorization
        providers = asyncio.run(self.integration.list_authorized_providers(
            list_token["token"]
        ))
        self.assertIsNotNone(providers)
        self.assertIn(test_provider, providers)
        
        # Test getting key info with authorization
        key_info = asyncio.run(self.integration.get_authorized_key_info(
            test_provider, list_token["token"]
        ))
        self.assertIsNotNone(key_info)
        self.assertEqual(key_info["provider"], test_provider)
        
        # Test getting key with authorization
        key = asyncio.run(self.integration.get_authorized_key(
            test_provider, access_token["token"]
        ))
        self.assertEqual(key, test_key)
        
        # Test unauthorized operations
        # Try to get a key without correct capability
        unauth_key = asyncio.run(self.integration.get_authorized_key(
            test_provider, list_token["token"]  # Using list token, not access token
        ))
        self.assertIsNone(unauth_key)

    def test_get_authorized_key_propagates_keystore_errors(self):
        """Unexpected keystore failures must not be reported as authorization denial."""
        test_provider = "test_provider_get_error"

        async def verify_capability(auth_token, capability_string):
            return True

        async def failing_get_key(provider):
            raise RuntimeError("keystore backend unavailable")

        self.integration.use_external_implementation = False
        self.auth.verify_capability = verify_capability
        self.keystore.get_key = failing_get_key

        with self.assertLogs("hallucinate_app.auth_keystore_integration", level="ERROR") as logs:
            with self.assertRaisesRegex(RuntimeError, "keystore backend unavailable"):
                asyncio.run(self.integration.get_authorized_key(test_provider, "valid_token"))

        self.assertTrue(any("Failed to get authorized key" in message for message in logs.output))
    
    def test_key_rotation_with_authorization(self):
        """Test key rotation with authorization"""
        # Setup
        test_provider = "test_provider_rotation"
        test_key = "test_api_key_" + os.urandom(8).hex()
        new_key = "new_api_key_" + os.urandom(8).hex()
        
        # Create principals and set up initial state
        asyncio.run(self.auth.create_principal("admin"))
        admin_token = asyncio.run(self.auth.issue_capability(
            "root", "admin", {
                "can": self.integration.CAPABILITIES["KEY_MANAGE"],
                "with": "*"
            }
        ))
        
        # Set initial key
        asyncio.run(self.integration.set_authorized_key(
            test_provider, test_key, admin_token["token"]
        ))
        
        # Issue rotation capability
        rotate_token = asyncio.run(self.auth.issue_capability(
            "root", "admin", {
                "can": self.integration.CAPABILITIES["KEY_ROTATE"],
                "with": test_provider
            }
        ))
        
        # Rotate key
        rotate_result = asyncio.run(self.integration.rotate_authorized_key(
            test_provider, new_key, rotate_token["token"]
        ))
        self.assertTrue(rotate_result)
        
        # Issue access capability
        access_token = asyncio.run(self.auth.issue_capability(
            "root", "admin", {
                "can": self.integration.CAPABILITIES["KEY_ACCESS"],
                "with": test_provider
            }
        ))
        
        # Verify rotated key
        rotated_key = asyncio.run(self.integration.get_authorized_key(
            test_provider, access_token["token"]
        ))
        self.assertEqual(rotated_key, new_key)
    
    def test_integration_module_test_method(self):
        """Test the integration module's test method"""
        test_results = asyncio.run(self.integration.test())
        self.assertTrue(test_results["success"])
        self.assertEqual(test_results["module"], "auth_keystore_integration")
        self.assertTrue(test_results["initialization"])
        self.assertTrue(test_results["capabilities"])
        self.assertTrue(all(test_results["authorized_operations"].values()))


if __name__ == '__main__':
    # Run tests
    unittest.main()
