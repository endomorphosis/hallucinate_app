"""
Test script for PyArrow Content Index Integration

This test validates the integration layer for the ipfs_kit_py.PyArrowContentIndex package
Follows the enhanced testing framework described in CLAUDE.md
"""

import os
import sys
import json
import asyncio
import unittest
import logging
import time
from datetime import datetime
from typing import Dict, Any
import tempfile

# Add the parent directory to the path so we can import the modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("test_pyarrow_content_index_integration")

class TestPyArrowContentIndexIntegration(unittest.TestCase):
    """Test case for PyArrow Content Index Integration"""
    
    @classmethod
    def setUpClass(cls):
        """Set up the test class"""
        try:
            from hallucinate_app.pyarrow_content_index_integration import PyArrowContentIndexIntegration
            from hallucinate_app.pyarrow_content_index import PyArrowContentIndex
            
            # Create temporary directory for the index
            cls.temp_dir = tempfile.TemporaryDirectory()
            cls.index_path = os.path.join(cls.temp_dir.name, "test_content_index.arrow")
            
            # Create metadata for the integration
            cls.metadata = {
                "index_path": cls.index_path,
                "log_level": "DEBUG",
                "cache_results": True,
                "cache_ttl": 5  # Short TTL for testing
            }
            
            # Create resources for the integration
            cls.resources = {
                # Mock error monitor
                "error_monitor": type('MockErrorMonitor', (), {
                    "add_error": asyncio.coroutine(lambda self, error_data: None)
                })()
            }
            
            # Create the integration instance
            cls.integration = PyArrowContentIndexIntegration(
                resources=cls.resources,
                metadata=cls.metadata
            )
            
            # Initialize in the event loop
            loop = asyncio.get_event_loop()
            loop.run_until_complete(cls.integration.init())
            
            logger.info("Test class setup complete")
        except Exception as e:
            logger.error(f"Error in setUpClass: {e}")
            raise
    
    @classmethod
    def tearDownClass(cls):
        """Clean up after the test class"""
        try:
            # Clean up temporary directory
            if hasattr(cls, 'temp_dir'):
                cls.temp_dir.cleanup()
            
            logger.info("Test class teardown complete")
        except Exception as e:
            logger.error(f"Error in tearDownClass: {e}")
    
    def test_01_initialization(self):
        """Test initialization of the integration"""
        self.assertTrue(self.integration.initialized)
        self.assertIsNotNone(self.integration.content_index)
    
    def test_02_add_entry(self):
        """Test adding an entry to the content index"""
        # Create test entry
        test_entry = {
            "cid": "QmTestCID12345",
            "path": "/test/path/file.txt",
            "mimetype": "text/plain",
            "size": 1024,
            "tags": ["test", "integration"],
            "description": "Test entry for integration testing"
        }
        
        # Add entry
        result = asyncio.run(self.integration.add_entry(test_entry))
        
        # Verify result
        self.assertIsNotNone(result)
        if isinstance(result, dict):
            self.assertEqual(result.get("cid"), test_entry["cid"])
    
    def test_03_lookup_by_cid(self):
        """Test looking up an entry by CID"""
        # Look up the test entry
        result = asyncio.run(self.integration.lookup_by_cid("QmTestCID12345"))
        
        # Verify result
        self.assertIsNotNone(result)
        if isinstance(result, dict):
            self.assertEqual(result.get("cid"), "QmTestCID12345")
            self.assertEqual(result.get("path"), "/test/path/file.txt")
    
    def test_04_lookup_by_path(self):
        """Test looking up an entry by path"""
        # Look up the test entry
        result = asyncio.run(self.integration.lookup_by_path("/test/path/file.txt"))
        
        # Verify result
        self.assertIsNotNone(result)
        if isinstance(result, dict):
            self.assertEqual(result.get("cid"), "QmTestCID12345")
            self.assertEqual(result.get("path"), "/test/path/file.txt")
    
    def test_05_update_entry(self):
        """Test updating an entry"""
        # Update the test entry
        update_data = {
            "description": "Updated test description",
            "tags": ["test", "integration", "updated"]
        }
        result = asyncio.run(self.integration.update_entry("QmTestCID12345", update_data))
        
        # Verify result
        self.assertIsNotNone(result)
        if isinstance(result, dict):
            self.assertEqual(result.get("description"), update_data["description"])
            self.assertEqual(result.get("tags"), update_data["tags"])
    
    def test_06_query(self):
        """Test querying entries"""
        # Query entries
        query_params = {
            "tags": ["test"],
            "limit": 10
        }
        results = asyncio.run(self.integration.query(query_params))
        
        # Verify results
        self.assertIsNotNone(results)
        self.assertIsInstance(results, list)
        self.assertTrue(len(results) > 0)
        
        # Verify the test entry is in the results
        found = False
        for entry in results:
            if entry.get("cid") == "QmTestCID12345":
                found = True
                break
        self.assertTrue(found)
    
    def test_07_cache(self):
        """Test cache functionality"""
        # First lookup to populate cache
        asyncio.run(self.integration.lookup_by_cid("QmTestCID12345"))
        
        # Check cache
        cache_key = "cid:QmTestCID12345"
        self.assertIn(cache_key, self.integration.cache)
        
        # Modify directly in content_index to test cache vs. real data
        test_entry = asyncio.run(self.integration.lookup_by_cid("QmTestCID12345"))
        if isinstance(test_entry, dict):
            # Create modified entry
            modified_entry = test_entry.copy()
            modified_entry["description"] = "Modified without cache update"
            
            # Update in content_index directly to bypass cache
            self.integration.content_index.mock_store = [modified_entry]
            
            # Lookup should return cached version
            cached_lookup = asyncio.run(self.integration.lookup_by_cid("QmTestCID12345"))
            self.assertEqual(cached_lookup.get("description"), test_entry["description"])
            
            # Clear cache and lookup again
            self.integration._clear_cache()
            fresh_lookup = asyncio.run(self.integration.lookup_by_cid("QmTestCID12345"))
            self.assertEqual(fresh_lookup.get("description"), modified_entry["description"])
    
    def test_08_cache_expiration(self):
        """Test cache expiration"""
        # First lookup to populate cache
        asyncio.run(self.integration.lookup_by_cid("QmTestCID12345"))
        
        # Check cache
        cache_key = "cid:QmTestCID12345"
        self.assertIn(cache_key, self.integration.cache)
        
        # Wait for TTL to expire
        time.sleep(self.integration.cache_ttl + 1)
        
        # Cached item should now be automatically cleared on next check
        cache_result = self.integration._check_cache(cache_key)
        self.assertIsNone(cache_result)
        self.assertNotIn(cache_key, self.integration.cache)
    
    def test_09_stats(self):
        """Test get_stats"""
        # Get stats
        stats = asyncio.run(self.integration.get_stats())
        
        # Verify stats
        self.assertIsNotNone(stats)
        self.assertIsInstance(stats, dict)
    
    def test_10_save(self):
        """Test save"""
        # Save the index
        result = asyncio.run(self.integration.save())
        
        # Verify result
        self.assertTrue(result)
    
    def test_11_test_method(self):
        """Test the test method"""
        # Run the test method
        test_result = self.integration.test(verbose=True)
        
        # Verify test result structure
        self.assertIsInstance(test_result, dict)
        self.assertIn("success", test_result)
        self.assertIn("steps", test_result)
        self.assertIn("diagnostics", test_result)
        self.assertIn("logs", test_result)
        
        # Verify steps
        self.assertIn("initialization", test_result["steps"])
        self.assertIn("add_entry", test_result["steps"])
        self.assertIn("lookup_by_cid", test_result["steps"])
        
        # Verify logs with verbose mode
        self.assertIsInstance(test_result["logs"], list)
        self.assertTrue(len(test_result["logs"]) > 0)
    
    def test_12_delete_entry(self):
        """Test deleting an entry"""
        # Delete the test entry
        result = asyncio.run(self.integration.delete_entry("QmTestCID12345"))
        
        # Verify result
        self.assertTrue(result)
        
        # Verify entry is gone
        with self.assertRaises(Exception):
            asyncio.run(self.integration.lookup_by_cid("QmTestCID12345"))

def test_pyarrow_content_index_integration():
    """Run tests for PyArrow Content Index Integration"""
    result = {
        "module": "pyarrow_content_index_integration",
        "success": False,
        "results": []
    }
    
    try:
        # Run the tests using unittest
        loader = unittest.TestLoader()
        suite = loader.loadTestsFromTestCase(TestPyArrowContentIndexIntegration)
        runner = unittest.TextTestRunner(verbosity=2)
        test_result = runner.run(suite)
        
        # Check if all tests passed
        success = test_result.wasSuccessful()
        
        for test in test_result.failures + test_result.errors:
            result["results"].append({
                "name": test[0].id().split('.')[-1],
                "success": False,
                "error": test[1]
            })
        
        # Add successful tests
        successful_tests = []
        for test in suite:
            test_name = test.id().split('.')[-1]
            if not any(r["name"] == test_name for r in result["results"]):
                successful_tests.append({
                    "name": test_name,
                    "success": True
                })
        
        result["results"].extend(successful_tests)
        result["success"] = success
        
    except Exception as e:
        logger.error(f"Error running PyArrow Content Index Integration tests: {e}")
        result["error"] = str(e)
    
    return result

def test():
    """Run tests"""
    return test_pyarrow_content_index_integration()

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Test PyArrow Content Index Integration")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose output")
    parser.add_argument("--json", "-j", action="store_true", help="Output results as JSON")
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    if args.json:
        print(json.dumps(test(), indent=2))
    else:
        # Run the unittest directly for more detailed output
        unittest.main()