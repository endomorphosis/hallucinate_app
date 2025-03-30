"""
Test module for the Secure FireproofDB Manager

Tests the capability-based security wrapper for FireproofDB operations
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

from secure_fireproofdb_manager import SecureFireproofDBManager, FIREPROOFDB_CAPABILITIES
from auth import AuthManager

class TestSecureFireproofDBManager(unittest.TestCase):
    """Test cases for SecureFireproofDBManager"""
    
    def setUp(self):
        """Set up test environment"""
        # Create auth manager for testing
        self.auth_manager = AuthManager()
        
        # Create secure FireproofDB manager
        self.secure_fireproofdb = SecureFireproofDBManager({
            'auth': self.auth_manager
        })
        
        # Setup asyncio event loop
        self.loop = asyncio.get_event_loop()
        
        # Initialize both managers
        self.loop.run_until_complete(self.auth_manager.init())
        self.loop.run_until_complete(self.secure_fireproofdb.init())
        
        # Create test principal
        self.loop.run_until_complete(self.auth_manager.create_principal('test-user'))
        
        # Issue capabilities
        self.admin_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': FIREPROOFDB_CAPABILITIES['ADMIN'],
                'with': '*'
            }
        ))
        
        self.create_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': FIREPROOFDB_CAPABILITIES['CREATE'],
                'with': '*'
            }
        ))
        
        self.delete_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': FIREPROOFDB_CAPABILITIES['DELETE'],
                'with': '*'
            }
        ))
        
        self.write_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': FIREPROOFDB_CAPABILITIES['WRITE'],
                'with': '*'
            }
        ))
        
        self.read_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': FIREPROOFDB_CAPABILITIES['READ'],
                'with': '*'
            }
        ))
        
        self.query_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': FIREPROOFDB_CAPABILITIES['QUERY'],
                'with': '*'
            }
        ))
        
        self.export_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': FIREPROOFDB_CAPABILITIES['EXPORT'],
                'with': '*'
            }
        ))
        
        self.import_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': FIREPROOFDB_CAPABILITIES['IMPORT'],
                'with': '*'
            }
        ))
        
        self.sync_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': FIREPROOFDB_CAPABILITIES['SYNC'],
                'with': '*'
            }
        ))
        
        # Create limited scope capabilities for testing
        self.specific_db_token = self.loop.run_until_complete(self.auth_manager.issue_capability(
            'root', 'test-user', {
                'can': FIREPROOFDB_CAPABILITIES['WRITE'],
                'with': 'specific-db'
            }
        ))
    
    def test_initialization(self):
        """Test manager initialization"""
        self.assertTrue(self.secure_fireproofdb.initialized)
    
    def test_create_database_with_valid_token(self):
        """Test database creation with valid token"""
        import time
        test_db_name = f"test-db-{int(time.time() * 1000)}"
        
        create_result = self.loop.run_until_complete(self.secure_fireproofdb.create_database(
            test_db_name, {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(create_result.get('success', False) or create_result.get('created', False))
        
        # Verify stats updated
        self.assertEqual(self.secure_fireproofdb.stats['databases_created'], 1)
        self.assertEqual(self.secure_fireproofdb.stats['access_granted'], 1)
        
        # Store db name for other tests
        self.test_db_name = test_db_name
    
    def test_create_database_with_invalid_token(self):
        """Test database creation with invalid token"""
        with self.assertRaises(Exception):
            self.loop.run_until_complete(self.secure_fireproofdb.create_database(
                'test-db-invalid', {
                    'auth_token': 'invalid-token',
                    'user_id': 'test-user'
                }
            ))
        
        # Verify stats updated
        self.assertTrue(self.secure_fireproofdb.stats['access_denied'] > 0)
    
    def test_database_crud_operations(self):
        """Test database CRUD operations with valid tokens"""
        # First create a database
        import time
        test_db_name = f"test-ops-db-{int(time.time() * 1000)}"
        
        create_result = self.loop.run_until_complete(self.secure_fireproofdb.create_database(
            test_db_name, {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(create_result.get('success', False) or create_result.get('created', False))
        
        # Test write operation
        write_result = self.loop.run_until_complete(self.secure_fireproofdb.put_document(
            test_db_name, {
                '_id': 'test-doc',
                'value': 'test-value'
            }, {
                'auth_token': self.write_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(write_result.get('success', False))
        self.assertTrue('id' in write_result)
        
        # Test read operation
        read_result = self.loop.run_until_complete(self.secure_fireproofdb.get_document(
            test_db_name, 'test-doc', {
                'auth_token': self.read_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertEqual(read_result.get('_id'), 'test-doc')
        
        # Test query operation
        query_result = self.loop.run_until_complete(self.secure_fireproofdb.query_documents(
            test_db_name, 'value', {
                'prefix': 'test'
            }, {
                'auth_token': self.query_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue('rows' in query_result)
        
        # Test delete database
        delete_result = self.loop.run_until_complete(self.secure_fireproofdb.delete_database(
            test_db_name, {
                'auth_token': self.delete_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(delete_result.get('deleted', False))
        
        # Verify stats updated
        self.assertTrue(self.secure_fireproofdb.stats['document_writes'] >= 1)
        self.assertTrue(self.secure_fireproofdb.stats['document_reads'] >= 1)
        self.assertTrue(self.secure_fireproofdb.stats['queries_performed'] >= 1)
        self.assertTrue(self.secure_fireproofdb.stats['databases_deleted'] >= 1)
    
    def test_export_import_operations(self):
        """Test database export and import operations"""
        # First create a database
        import time
        test_db_name = f"test-export-db-{int(time.time() * 1000)}"
        
        create_result = self.loop.run_until_complete(self.secure_fireproofdb.create_database(
            test_db_name, {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(create_result.get('success', False) or create_result.get('created', False))
        
        # Add some documents
        for i in range(3):
            write_result = self.loop.run_until_complete(self.secure_fireproofdb.put_document(
                test_db_name, {
                    '_id': f'test-doc-{i}',
                    'value': f'test-value-{i}',
                    'index': i
                }, {
                    'auth_token': self.write_token['token'],
                    'user_id': 'test-user'
                }
            ))
            self.assertTrue(write_result.get('success', False))
        
        # Test export to IPFS
        export_result = self.loop.run_until_complete(self.secure_fireproofdb.export_to_ipfs(
            test_db_name, {
                'auth_token': self.export_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue('cid' in export_result)
        cid = export_result['cid']
        
        # Test import from IPFS
        import_db_name = f"imported-{test_db_name}"
        import_result = self.loop.run_until_complete(self.secure_fireproofdb.import_from_ipfs(
            cid, import_db_name, {
                'auth_token': self.import_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue('imported' in import_result)
        
        # Verify stats updated
        self.assertTrue(self.secure_fireproofdb.stats['exports_performed'] >= 1)
        self.assertTrue(self.secure_fireproofdb.stats['imports_performed'] >= 1)
        
        # Clean up
        self.loop.run_until_complete(self.secure_fireproofdb.delete_database(
            test_db_name, {
                'auth_token': self.delete_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.loop.run_until_complete(self.secure_fireproofdb.delete_database(
            import_db_name, {
                'auth_token': self.delete_token['token'],
                'user_id': 'test-user'
            }
        ))
    
    def test_sync_operation(self):
        """Test database sync operation"""
        # First create a database
        import time
        test_db_name = f"test-sync-db-{int(time.time() * 1000)}"
        
        create_result = self.loop.run_until_complete(self.secure_fireproofdb.create_database(
            test_db_name, {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(create_result.get('success', False) or create_result.get('created', False))
        
        # Test sync
        sync_result = self.loop.run_until_complete(self.secure_fireproofdb.sync_database(
            test_db_name, 'https://example.com/db', {}, {
                'auth_token': self.sync_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(sync_result.get('success', False))
        
        # Verify stats updated
        self.assertTrue(self.secure_fireproofdb.stats['syncs_performed'] >= 1)
        
        # Clean up
        self.loop.run_until_complete(self.secure_fireproofdb.delete_database(
            test_db_name, {
                'auth_token': self.delete_token['token'],
                'user_id': 'test-user'
            }
        ))
    
    def test_list_databases(self):
        """Test listing databases with admin token"""
        # First create some databases
        import time
        db_names = []
        
        for i in range(2):
            db_name = f"test-list-db-{i}-{int(time.time() * 1000)}"
            db_names.append(db_name)
            
            self.loop.run_until_complete(self.secure_fireproofdb.create_database(
                db_name, {
                    'auth_token': self.create_token['token'],
                    'user_id': 'test-user'
                }
            ))
        
        # List databases
        list_result = self.loop.run_until_complete(self.secure_fireproofdb.list_databases({
            'auth_token': self.admin_token['token']
        }))
        
        self.assertTrue('databases' in list_result)
        self.assertTrue(list_result.get('count', 0) >= 2)
        
        # Verify our created DBs are in the list
        db_listed = False
        for db in list_result['databases']:
            if db.get('name') == db_names[0]:
                db_listed = True
                break
        
        self.assertTrue(db_listed)
        
        # Clean up
        for db_name in db_names:
            self.loop.run_until_complete(self.secure_fireproofdb.delete_database(
                db_name, {
                    'auth_token': self.delete_token['token'],
                    'user_id': 'test-user'
                }
            ))
    
    def test_stats_access(self):
        """Test stats access with admin token"""
        stats_result = self.loop.run_until_complete(self.secure_fireproofdb.get_stats({
            'auth_token': self.admin_token['token']
        }))
        
        self.assertIn('database_count', stats_result)
        self.assertIn('resource_usage', stats_result)
        self.assertIn('access_granted', stats_result)
        self.assertIn('access_denied', stats_result)
        self.assertIn('databases_created', stats_result)
        self.assertIn('document_writes', stats_result)
        self.assertIn('document_reads', stats_result)
    
    def test_stats_access_denied(self):
        """Test stats access denied with non-admin token"""
        with self.assertRaises(Exception):
            self.loop.run_until_complete(self.secure_fireproofdb.get_stats({
                'auth_token': self.read_token['token']
            }))
    
    def test_capability_scope(self):
        """Test capability scope restrictions"""
        # Should succeed for specific database
        import time
        # Create specific database
        create_result = self.loop.run_until_complete(self.secure_fireproofdb.create_database(
            'specific-db', {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(create_result.get('success', False) or create_result.get('created', False))
        
        # With specific token (should succeed)
        write_result = self.loop.run_until_complete(self.secure_fireproofdb.put_document(
            'specific-db', {
                '_id': 'specific-doc',
                'value': 'specific-value'
            }, {
                'auth_token': self.specific_db_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(write_result.get('success', False))
        
        # Create another database
        other_db = f"other-db-{int(time.time() * 1000)}"
        other_create_result = self.loop.run_until_complete(self.secure_fireproofdb.create_database(
            other_db, {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(other_create_result.get('success', False) or other_create_result.get('created', False))
        
        # With specific token on wrong database (should fail)
        with self.assertRaises(Exception):
            self.loop.run_until_complete(self.secure_fireproofdb.put_document(
                other_db, {
                    '_id': 'specific-doc',
                    'value': 'specific-value'
                }, {
                    'auth_token': self.specific_db_token['token'],
                    'user_id': 'test-user'
                }
            ))
        
        # Clean up
        self.loop.run_until_complete(self.secure_fireproofdb.delete_database(
            'specific-db', {
                'auth_token': self.delete_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.loop.run_until_complete(self.secure_fireproofdb.delete_database(
            other_db, {
                'auth_token': self.delete_token['token'],
                'user_id': 'test-user'
            }
        ))
    
    def test_resource_tracking(self):
        """Test resource usage tracking"""
        # First create a database and perform operations
        import time
        test_db_name = f"test-resource-db-{int(time.time() * 1000)}"
        
        create_result = self.loop.run_until_complete(self.secure_fireproofdb.create_database(
            test_db_name, {
                'auth_token': self.create_token['token'],
                'user_id': 'test-user'
            }
        ))
        
        self.assertTrue(create_result.get('success', False) or create_result.get('created', False))
        
        # Perform some write operations
        for i in range(3):
            self.loop.run_until_complete(self.secure_fireproofdb.put_document(
                test_db_name, {
                    '_id': f'key-{i}',
                    'value': f'value-{i}'
                }, {
                    'auth_token': self.write_token['token'],
                    'user_id': 'test-user'
                }
            ))
        
        # Perform some read operations
        for i in range(5):
            self.loop.run_until_complete(self.secure_fireproofdb.get_document(
                test_db_name, f'key-{i % 3}', {
                    'auth_token': self.read_token['token'],
                    'user_id': 'test-user'
                }
            ))
        
        # Get stats with admin token
        stats_result = self.loop.run_until_complete(self.secure_fireproofdb.get_stats({
            'auth_token': self.admin_token['token']
        }))
        
        # Check resource usage tracking
        self.assertIn('resource_usage', stats_result)
        self.assertIn('by_database', stats_result['resource_usage'])
        self.assertIn('by_user', stats_result['resource_usage'])
        
        # Verify usage counts
        self.assertIn(test_db_name, stats_result['resource_usage']['by_database'])
        db_usage = stats_result['resource_usage']['by_database'][test_db_name]
        self.assertEqual(db_usage['creates'], 1)
        self.assertTrue(db_usage['writes'] >= 3)
        self.assertTrue(db_usage['reads'] >= 5)
        
        self.assertIn('test-user', stats_result['resource_usage']['by_user'])
        user_usage = stats_result['resource_usage']['by_user']['test-user']
        self.assertIn(test_db_name, user_usage['databases'])
        self.assertTrue(user_usage['writes'] >= 3)
        self.assertTrue(user_usage['reads'] >= 5)
        
        # Clean up
        self.loop.run_until_complete(self.secure_fireproofdb.delete_database(
            test_db_name, {
                'auth_token': self.delete_token['token'],
                'user_id': 'test-user'
            }
        ))
    
    def test_module_test_method(self):
        """Test the module's test method"""
        test_result = self.loop.run_until_complete(self.secure_fireproofdb.test())
        
        self.assertIsInstance(test_result, dict)
        self.assertIn('success', test_result)
        self.assertIn('module', test_result)
        self.assertEqual(test_result['module'], 'secure_fireproofdb_manager')
        self.assertIn('database_operations', test_result)
        self.assertIn('stats_tracking', test_result)

def run_tests():
    """Run test cases"""
    unittest.main()

def get_test_results():
    """Get test results in a structured format"""
    test_runner = unittest.TextTestRunner(verbosity=2)
    test_suite = unittest.TestLoader().loadTestsFromTestCase(TestSecureFireproofDBManager)
    result = test_runner.run(test_suite)
    
    return {
        'success': result.wasSuccessful(),
        'total': result.testsRun,
        'failures': len(result.failures),
        'errors': len(result.errors),
        'module': 'secure_fireproofdb_manager',
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