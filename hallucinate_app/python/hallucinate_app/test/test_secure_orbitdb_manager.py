"""
Test module for the Secure OrbitDB Manager

Tests the capability-based security wrapper for OrbitDB operations
Validates access control, resource tracking, and statistics
"""

import os
import sys
import json
import unittest
import asyncio
from typing import Dict, Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from secure_orbitdb_manager import SecureOrbitDBManager, ORBITDB_CAPABILITIES
from auth import AuthManager

class TestSecureOrbitDBManager(unittest.TestCase):
    """Test cases for SecureOrbitDBManager"""
    
    def setUp(self):
        """Set up test environment"""
        # Create auth manager for testing
        self.auth_manager = AuthManager()
        
        # Create secure OrbitDB manager
        self.secure_orbitdb = SecureOrbitDBManager({
            'auth': self.auth_manager
        })
        
        # Setup asyncio event loop
        self.loop = asyncio.get_event_loop()
        
        # Initialize both managers
        self.loop.run_until_complete(self.auth_manager.init())
        self.loop.run_until_complete(self.secure_orbitdb.init())
        
        # Create test principal
        self.loop.run_until_complete(self.auth_manager.create_principal('test-user'))
        
        # Issue capabilities
        self.admin_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': ORBITDB_CAPABILITIES['ADMIN'],
                'with': '*'
            }
        ))
        
        self.create_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': ORBITDB_CAPABILITIES['CREATE'],
                'with': '*'
            }
        ))
        
        self.open_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': ORBITDB_CAPABILITIES['OPEN'],
                'with': '*'
            }
        ))
        
        self.write_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': ORBITDB_CAPABILITIES['WRITE'],
                'with': '*'
            }
        ))
        
        self.read_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': ORBITDB_CAPABILITIES['READ'],
                'with': '*'
            }
        ))
        
        self.replicate_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': ORBITDB_CAPABILITIES['REPLICATE'],
                'with': '*'
            }
        ))
        
        self.close_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': ORBITDB_CAPABILITIES['CLOSE'],
                'with': '*'
            }
        ))
        
        # Create limited scope capabilities for testing
        self.specific_db_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': ORBITDB_CAPABILITIES['WRITE'],
                'with': 'specific-db'
            }
        ))
    
    def test_initialization(self):
        """Test manager initialization"""
        self.assertTrue(self.secure_orbitdb.initialized)
    
    def test_create_database_with_valid_token(self):
        """Test database creation with valid token"""
        create_result = self.loop.run_until_complete(self.secure_orbitdb.create_database(
            'test-db', 'keyvalue', {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertIn('address', create_result)
        self.assertTrue(create_result.get('success', False))
        self.assertIn('test-db', create_result.get('name', ''))
        
        # Verify stats updated
        self.assertEqual(self.secure_orbitdb.stats['databases_created'], 1)
        self.assertEqual(self.secure_orbitdb.stats['access_granted'], 1)
        
        # Store address for other tests
        self.db_address = create_result['address']
    
    def test_create_database_with_invalid_token(self):
        """Test database creation with invalid token"""
        with self.assertRaises(Exception):
            self.loop.run_until_complete(self.secure_orbitdb.create_database(
                'test-db-invalid', 'keyvalue', {
                    'auth_token': 'invalid-token',
                    'user_id': 'test-user'
                }
            ))
        
        # Verify stats updated
        self.assertTrue(self.secure_orbitdb.stats['access_denied'] > 0)
    
    def test_database_operations(self):
        """Test database operations with valid tokens"""
        # First create a database
        create_result = self.loop.run_until_complete(self.secure_orbitdb.create_database(
            'test-ops-db', 'keyvalue', {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(create_result.get('success', False))
        address = create_result['address']
        
        # Test open database
        open_result = self.loop.run_until_complete(self.secure_orbitdb.open_database(
            address, {
                'auth_token': self.open_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(open_result.get('success', False))
        
        # Test write operation
        write_result = self.loop.run_until_complete(self.secure_orbitdb.write(
            address, 'put', {
                'key': 'test-key',
                'value': 'test-value'
            }, {
                'auth_token': self.write_token['token'],
                'user_id': 'test-user',
                'key': 'test-key'
            }
        ))
        
        self.assertTrue(write_result.get('success', False))
        
        # Test read operation
        read_result = self.loop.run_until_complete(self.secure_orbitdb.read(
            address, 'get', 'test-key', {
                'auth_token': self.read_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(read_result.get('success', False))
        
        # Test replication
        replicate_result = self.loop.run_until_complete(self.secure_orbitdb.replicate_database(
            address, {
                'auth_token': self.replicate_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(replicate_result.get('success', False))
        
        # Test close database
        close_result = self.loop.run_until_complete(self.secure_orbitdb.close_database(
            address, {
                'auth_token': self.close_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(close_result.get('success', False))
        
        # Verify stats updated
        self.assertTrue(self.secure_orbitdb.stats['databases_created'] >= 1)
        self.assertTrue(self.secure_orbitdb.stats['databases_opened'] >= 1)
        self.assertTrue(self.secure_orbitdb.stats['write_operations'] >= 1)
        self.assertTrue(self.secure_orbitdb.stats['read_operations'] >= 1)
    
    def test_list_databases(self):
        """Test listing databases with admin token"""
        # First create some databases
        self.loop.run_until_complete(self.secure_orbitdb.create_database(
            'test-list-db-1', 'keyvalue', {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.loop.run_until_complete(self.secure_orbitdb.create_database(
            'test-list-db-2', 'docstore', {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        # List databases
        list_result = self.loop.run_until_complete(self.secure_orbitdb.list_databases({
            'auth_token': self.admin_token['token']
        }))
        
        self.assertTrue(list_result.get('success', False))
        self.assertIsInstance(list_result.get('databases', {}), dict)
        self.assertTrue(len(list_result.get('databases', {})) >= 2)
    
    def test_database_info(self):
        """Test getting database info with read token"""
        # First create a database
        create_result = self.loop.run_until_complete(self.secure_orbitdb.create_database(
            'test-info-db', 'keyvalue', {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        address = create_result['address']
        
        # Get database info
        info_result = self.loop.run_until_complete(self.secure_orbitdb.get_database_info(
            address, {
                'auth_token': self.read_token['token']
            }
        ))
        
        self.assertTrue(info_result.get('success', False))
        self.assertIsInstance(info_result.get('info', {}), dict)
        self.assertEqual(info_result['info']['address'], address)
    
    def test_stats_access(self):
        """Test stats access with admin token"""
        stats_result = self.loop.run_until_complete(self.secure_orbitdb.get_stats({
            'auth_token': self.admin_token['token']
        }))
        
        self.assertIn('database_count', stats_result)
        self.assertIn('resource_usage', stats_result)
        self.assertIn('access_granted', stats_result)
        self.assertIn('access_denied', stats_result)
        self.assertIn('databases_created', stats_result)
        self.assertIn('write_operations', stats_result)
        self.assertIn('read_operations', stats_result)
    
    def test_stats_access_denied(self):
        """Test stats access denied with non-admin token"""
        with self.assertRaises(Exception):
            self.loop.run_until_complete(self.secure_orbitdb.get_stats({
                'auth_token': self.read_token['token']
            }))
    
    def test_capability_scope(self):
        """Test capability scope restrictions"""
        # Should succeed for specific database
        create_result = self.loop.run_until_complete(self.secure_orbitdb.create_database(
            'specific-db', 'keyvalue', {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        address = create_result['address']
        
        # With specific token (should succeed)
        write_result = self.loop.run_until_complete(self.secure_orbitdb.write(
            address, 'put', {
                'key': 'specific-key',
                'value': 'specific-value'
            }, {
                'auth_token': self.specific_db_token['token'],
                'user_id': 'test-user',
                'key': 'specific-key'
            }
        ))
        
        self.assertTrue(write_result.get('success', False))
        
        # Create another database
        other_create_result = self.loop.run_until_complete(self.secure_orbitdb.create_database(
            'other-db', 'keyvalue', {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        other_address = other_create_result['address']
        
        # With specific token on wrong database (should fail)
        with self.assertRaises(Exception):
            self.loop.run_until_complete(self.secure_orbitdb.write(
                other_address, 'put', {
                    'key': 'specific-key',
                    'value': 'specific-value'
                }, {
                    'auth_token': self.specific_db_token['token'],
                    'user_id': 'test-user',
                    'key': 'specific-key'
                }
            ))
    
    def test_resource_tracking(self):
        """Test resource usage tracking"""
        # First create a database and perform operations
        create_result = self.loop.run_until_complete(self.secure_orbitdb.create_database(
            'test-resource-db', 'keyvalue', {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        address = create_result['address']
        
        # Perform some write operations
        for i in range(3):
            self.loop.run_until_complete(self.secure_orbitdb.write(
                address, 'put', {
                    'key': f'key-{i}',
                    'value': f'value-{i}'
                }, {
                    'auth_token': self.write_token['token'],
                    'user_id': 'test-user',
                    'key': f'key-{i}'
                }
            ))
        
        # Perform some read operations
        for i in range(5):
            self.loop.run_until_complete(self.secure_orbitdb.read(
                address, 'get', f'key-{i % 3}', {
                    'auth_token': self.read_token['token'],
                    'user_id': 'test-user'
                }
            ))
        
        # Get stats with admin token
        stats_result = self.loop.run_until_complete(self.secure_orbitdb.get_stats({
            'auth_token': self.admin_token['token']
        }))
        
        # Check resource usage tracking
        self.assertIn(address, stats_result['resource_usage']['by_database'])
        self.assertIn('test-user', stats_result['resource_usage']['by_user'])
        
        # Verify usage counts
        db_usage = stats_result['resource_usage']['by_database'][address]
        self.assertEqual(db_usage['creates'], 1)
        self.assertTrue(db_usage['writes'] >= 3)
        self.assertTrue(db_usage['reads'] >= 5)
        
        user_usage = stats_result['resource_usage']['by_user']['test-user']
        self.assertIn(address, user_usage['databases'])
        self.assertTrue(user_usage['writes'] >= 3)
        self.assertTrue(user_usage['reads'] >= 5)
    
    def test_module_test_method(self):
        """Test the module's test method"""
        test_result = self.loop.run_until_complete(self.secure_orbitdb.test())
        
        self.assertIsInstance(test_result, dict)
        self.assertIn('success', test_result)
        self.assertIn('module', test_result)
        self.assertEqual(test_result['module'], 'secure_orbitdb_manager')
        self.assertIn('database_operations', test_result)
        self.assertIn('stats_tracking', test_result)

def run_tests():
    """Run test cases"""
    unittest.main()

def get_test_results():
    """Get test results in a structured format"""
    test_runner = unittest.TextTestRunner(verbosity=2)
    test_suite = unittest.TestLoader().loadTestsFromTestCase(TestSecureOrbitDBManager)
    result = test_runner.run(test_suite)
    
    return {
        'success': result.wasSuccessful(),
        'total': result.testsRun,
        'failures': len(result.failures),
        'errors': len(result.errors),
        'module': 'secure_orbitdb_manager',
        'results': [
            {
                'test': f[0]._testMethodName,
                'message': f[1],
                'success': False
            } for f in result.failures + result.errors
        ]
    }

if __name__ == "__main__":
    """Execute test suite"""
    if len(sys.argv) > 1 and sys.argv[1] == '--json':
        # Output JSON test results
        results = get_test_results()
        print(json.dumps(results, indent=2))
    else:
        # Run tests normally
        run_tests()