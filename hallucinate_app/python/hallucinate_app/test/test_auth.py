"""
Test UCAN Authentication Module

Tests functionality of the auth.py module
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


class TestAuth(unittest.TestCase):
    """
    Test case for the AuthManager class
    """
    
    def setUp(self):
        """Set up test environment"""
        # Create a unique test directory for auth data
        test_dir = Path(os.path.expanduser('~')) / '.hallucinate_app_test' / 'auth'
        test_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize test auth manager
        self.auth = AuthManager(
            metadata={
                'storage_location': str(test_dir),
                'use_mock_implementation': True
            }
        )
        
        # Initialize auth manager using asyncio
        asyncio.run(self.auth.init())
    
    def tearDown(self):
        """Clean up after tests"""
        # Optional: Clean up test files
        pass
    
    def test_initialization(self):
        """Test if auth manager can be initialized"""
        self.assertTrue(self.auth.initialized)
    
    def test_principal_creation(self):
        """Test if principals can be created"""
        principal = asyncio.run(self.auth.create_principal("test_principal"))
        self.assertIsNotNone(principal)
        self.assertTrue(hasattr(principal, 'did'))
        self.assertTrue(principal.did.startswith('did:key:'))
    
    def test_capability_issuance(self):
        """Test if capabilities can be issued"""
        # Create principals
        asyncio.run(self.auth.create_principal("issuer"))
        asyncio.run(self.auth.create_principal("audience"))
        
        # Issue capability
        capability = {
            "can": "test",
            "with": "resource"
        }
        
        token = asyncio.run(self.auth.issue_capability(
            "issuer", "audience", capability
        ))
        
        self.assertIsNotNone(token)
        self.assertIn("token", token)
        self.assertEqual(token["issuer"], "issuer")
        self.assertEqual(token["audience"], "audience")
        self.assertEqual(token["capability"]["can"], "test")
        self.assertEqual(token["capability"]["with"], "resource")
    
    def test_capability_verification(self):
        """Test if capabilities can be verified"""
        # Create principals
        asyncio.run(self.auth.create_principal("issuer"))
        asyncio.run(self.auth.create_principal("audience"))
        
        # Issue capability
        capability = {
            "can": "test",
            "with": "resource"
        }
        
        token = asyncio.run(self.auth.issue_capability(
            "issuer", "audience", capability
        ))
        
        # Verify capability
        verified = asyncio.run(self.auth.verify_capability(
            token["token"], "test:resource"
        ))
        
        self.assertTrue(verified)
        
        # Verify invalid capability
        invalid = asyncio.run(self.auth.verify_capability(
            token["token"], "invalid:resource"
        ))
        
        self.assertFalse(invalid)
    
    def test_capability_revocation(self):
        """Test if capabilities can be revoked"""
        # Create principals
        asyncio.run(self.auth.create_principal("issuer"))
        asyncio.run(self.auth.create_principal("audience"))
        
        # Issue capability
        capability = {
            "can": "test",
            "with": "resource"
        }
        
        token = asyncio.run(self.auth.issue_capability(
            "issuer", "audience", capability
        ))
        
        # Find token ID
        token_id = None
        for tid, t in self.auth.tokens.items():
            if t['token'] == token['token']:
                token_id = tid
                break
        
        # Revoke capability
        revoked = asyncio.run(self.auth.revoke_capability(token_id))
        self.assertTrue(revoked)
        
        # Verify capability is no longer valid
        verified = asyncio.run(self.auth.verify_capability(
            token["token"], "test:resource"
        ))
        
        self.assertFalse(verified)
    
    def test_auth_module_test_method(self):
        """Test the auth module's test method"""
        test_results = asyncio.run(self.auth.test())
        self.assertTrue(test_results["success"])
        self.assertEqual(test_results["module"], "auth")
        self.assertTrue(test_results["initialization"])
        self.assertTrue(test_results["principal_creation"])
        self.assertTrue(test_results["capability_issuance"])
        self.assertTrue(test_results["capability_verification"])
        self.assertTrue(test_results["capability_revocation"])


if __name__ == '__main__':
    # Run tests
    unittest.main()
