import unittest
import json
import os
import sys
import asyncio
from pathlib import Path
import numpy as np

# Add project root to Python path to ensure imports work
project_root = Path(__file__).parents[2]
sys.path.append(str(project_root))

# Import the IPFS FAISS integration module
try:
    from hallucinate_app.python.hallucinate_app.ipfs_faiss import IPFSFaiss, ipfs_faiss
except ImportError:
    # Try alternative import path
    try:
        from hallucinate_app.hallucinate_app.ipfs_faiss import IPFSFaiss, ipfs_faiss
    except ImportError:
        print("Failed to import IPFS FAISS module. Make sure the module exists and paths are correct.")
        sys.exit(1)

class TestIPFSFaissIntegration(unittest.TestCase):
    """
    Test the IPFS FAISS integration layer.
    
    These tests verify that the integration layer properly forwards calls to the 
    external modules and reports their availability correctly. The tests DO NOT
    test the actual functionality of the external modules, which should be 
    tested within those modules themselves.
    """
    
    @classmethod
    def setUpClass(cls):
        # Initialize the IPFS FAISS integration module with test resources
        cls.resources = {}
        cls.metadata = {'test': True, 'cache_dir': os.path.join(os.path.expanduser('~'), '.cache', 'faiss_test')}
        cls.ipfs_faiss = IPFSFaiss(cls.resources, cls.metadata)
        
        # Initialize event loop for async tests
        cls.loop = asyncio.get_event_loop()
        if cls.loop.is_closed():
            cls.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(cls.loop)
        
        # Initialize the module
        cls.loop.run_until_complete(cls.ipfs_faiss.init())
        
        # Store module availability for test decisions
        cls.has_external_module = (
            cls.ipfs_faiss.modules.get("ipfs_faiss_py") is not None
        )
        
        print(f"External module availability: {cls.has_external_module}")
    
    def test_initialization(self):
        """Test that the integration module initializes correctly"""
        result = self.loop.run_until_complete(self.ipfs_faiss.init())
        
        # The integration layer should initialize even if no external modules are available
        # It should handle the absence gracefully
        self.assertIsNotNone(result, "Integration module initialization result should not be None")
    
    def test_module_detection(self):
        """Test that the integration layer properly detects external modules"""
        # Check if the integration layer can detect if the external module is available
        self.assertIsInstance(self.ipfs_faiss.modules, dict, "Integration module should track external modules in a dict")
        self.assertIn("ipfs_faiss_py", self.ipfs_faiss.modules, "Integration module should track ipfs_faiss_py")
    
    def test_method_forwarding(self):
        """Test that method calls are forwarded to external modules or return appropriate errors"""
        # If no external modules are available, method calls should return error objects
        if not self.has_external_module:
            # Test with create_index call
            dimensions = 128
            result = self.loop.run_until_complete(self.ipfs_faiss.create_index(dimensions))
            self.assertIsInstance(result, dict, "Method should return dict when external modules unavailable")
            self.assertIn("error", result, "Method should return error when external modules unavailable")
            return
            
        # If we have an external module, calls should be forwarded
        # This only tests the forwarding mechanism, not the actual functionality
        try:
            dimensions = 128
            result = self.loop.run_until_complete(self.ipfs_faiss.create_index(dimensions))
            # Either success or an error from the external module is acceptable
            self.assertIsInstance(result, dict, "Method forwarding should return a dict")
        except Exception as e:
            self.fail(f"Method forwarding should not raise exceptions: {e}")
    
    def test_module_test_method(self):
        """Test the module's own test method that tests external modules"""
        test_result = self.ipfs_faiss.test()
        self.assertIsInstance(test_result, dict, "Test method didn't return a dict")
        self.assertIn('success', test_result, "Test result missing success field")
        self.assertIn('modules_tested', test_result, "Test result missing modules_tested field")
        self.assertIn('capabilities', test_result, "Test result missing capabilities info")
        
        # Print test details for debugging
        print(f"Integration test results: {test_result}")
        print(f"Modules tested: {test_result.get('modules_tested', [])}")
        print(f"Capabilities: {test_result.get('capabilities', {})}")
        
        # Verify that the capabilities accurately reflect external module availability
        self.assertEqual(
            test_result.get('capabilities', {}).get('ipfs_faiss_py', False),
            self.has_external_module,
            "Test capabilities should accurately reflect module availability"
        )
    
    def test_index_management(self):
        """Test that index management operations are properly forwarded"""
        # If no external modules are available, method calls should return error objects
        if not self.has_external_module:
            # Test with list_indexes call
            result = self.loop.run_until_complete(self.ipfs_faiss.list_indexes())
            self.assertIsInstance(result, dict, "Method should return dict when external modules unavailable")
            self.assertIn("error", result, "Method should return error when external modules unavailable")
            
            # Test with get_index_info call
            result = self.loop.run_until_complete(self.ipfs_faiss.get_index_info("test-index-id"))
            self.assertIsInstance(result, dict, "Method should return dict when external modules unavailable")
            self.assertIn("error", result, "Method should return error when external modules unavailable")
            return
            
        # If we have an external module, calls should be forwarded
        # This only tests the forwarding mechanism, not the actual functionality
        try:
            # Test list_indexes
            list_result = self.loop.run_until_complete(self.ipfs_faiss.list_indexes())
            # Either success or an error from the external module is acceptable
            self.assertIsInstance(list_result, dict, "Method forwarding should return a dict")
            
            # Try to create an index first to test get_index_info
            dimensions = 128
            create_result = self.loop.run_until_complete(self.ipfs_faiss.create_index(dimensions))
            
            # Test get_index_info (even if creation fails, we just test forwarding)
            index_id = create_result.get("index_id", "test-index-id")
            info_result = self.loop.run_until_complete(self.ipfs_faiss.get_index_info(index_id))
            self.assertIsInstance(info_result, dict, "Method forwarding should return a dict")
        except Exception as e:
            self.fail(f"Method forwarding should not raise exceptions: {e}")

if __name__ == "__main__":
    # Run unit tests and output results in JSON format
    test_loader = unittest.TestLoader()
    test_suite = test_loader.loadTestsFromTestCase(TestIPFSFaissIntegration)
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
