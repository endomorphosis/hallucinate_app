"""
IPFS Model Manager Tests

Tests for the ipfs_model_manager.py module
"""

import os
import json
import asyncio
import unittest
import tempfile
from datetime import datetime
from pathlib import Path

import sys
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("test_ipfs_model_manager")

# Add parent directory to path to import modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import modules to test
from ipfs_model_manager import IPFSModelManager, ModelMetadata
from ipfs_kit import IPFSKit  # Import for mock implementation


class MockIPFSKit:
    """Mock IPFS Kit for testing without actual IPFS daemon"""
    
    async def init(self):
        """Initialize mock IPFS Kit"""
        self.initialized = True
        self.files = {}
        return {"success": True}
    
    async def add_to_ipfs(self, content):
        """Mock adding content to IPFS"""
        import hashlib
        # Create a deterministic CID-like hash based on content
        if isinstance(content, bytes):
            content_hash = hashlib.sha256(content).hexdigest()
        else:
            content_hash = hashlib.sha256(str(content).encode()).hexdigest()
            
        cid = f"mock-cid-{content_hash[:16]}"
        self.files[cid] = content
        return {"success": True, "cid": cid}
    
    async def fetch_from_ipfs(self, cid, output_path=None):
        """Mock fetching content from IPFS"""
        if cid not in self.files:
            return {"success": False, "error": "CID not found"}
            
        content = self.files[cid]
        
        if output_path:
            # Create directory if needed
            os.makedirs(output_path, exist_ok=True)
            
            # Write content to a file
            if isinstance(content, bytes):
                with open(os.path.join(output_path, "model.bin"), "wb") as f:
                    f.write(content)
            else:
                with open(os.path.join(output_path, "model.txt"), "w") as f:
                    f.write(str(content))
                    
        return {"success": True, "content": content, "path": output_path}


class MockHuggingFaceAPI:
    """Mock HuggingFace API for testing"""
    
    def model_info(self, model_id):
        """Mock getting model info"""
        class MockModelInfo:
            def __init__(self, model_id):
                self.model_id = model_id
                self.pipeline_tag = "text-generation"
                self.description = f"Mock model for {model_id}"
                self.author = "MockAuthor"
                self.tags = ["mock", "test"]
                
        return MockModelInfo(model_id)


def mock_snapshot_download(repo_id, local_dir, local_dir_use_symlinks=False):
    """Mock HuggingFace snapshot download"""
    # Create directory structure
    os.makedirs(local_dir, exist_ok=True)
    
    # Create mock model files
    with open(os.path.join(local_dir, "pytorch_model.bin"), "w") as f:
        f.write("mock model weights")
        
    with open(os.path.join(local_dir, "config.json"), "w") as f:
        json.dump({
            "model_type": "mock",
            "hidden_size": 256,
            "vocab_size": 1000
        }, f)
        
    with open(os.path.join(local_dir, "tokenizer.json"), "w") as f:
        json.dump({
            "type": "mock_tokenizer",
            "vocab": {"hello": 1, "world": 2}
        }, f)
        
    return local_dir


class TestIPFSModelManager(unittest.TestCase):
    """Test cases for the IPFSModelManager"""
    
    def setUp(self):
        """Set up test fixtures"""
        # Create temp directory for models
        self.test_dir = tempfile.TemporaryDirectory()
        
        # Create mock IPFS Kit
        self.mock_ipfs_kit = MockIPFSKit()
        loop = asyncio.get_event_loop()
        loop.run_until_complete(self.mock_ipfs_kit.init())
        
        # Initialize model manager with test resources
        self.model_manager = IPFSModelManager(
            resources={"ipfsKit": self.mock_ipfs_kit},
            metadata={"localPath": self.test_dir.name, "role": "master"}
        )
        
        # Initialize
        loop.run_until_complete(self.model_manager.init())
        
        # Test model
        self.test_model_id = "test/mock-model"
        
        # Mock huggingface_hub functions
        self.original_model_info = None
        self.original_snapshot_download = None
        
        if hasattr(self.model_manager, "hf_api") and self.model_manager.hf_api:
            # Save original and replace with mock
            self.original_model_info = self.model_manager.hf_api.model_info
            self.model_manager.hf_api.model_info = MockHuggingFaceAPI().model_info
            
            import huggingface_hub
            self.original_snapshot_download = huggingface_hub.snapshot_download
            huggingface_hub.snapshot_download = mock_snapshot_download
            
    def tearDown(self):
        """Tear down test fixtures"""
        # Restore original HuggingFace functions if we replaced them
        if self.original_model_info and hasattr(self.model_manager, "hf_api") and self.model_manager.hf_api:
            self.model_manager.hf_api.model_info = self.original_model_info
            
        if self.original_snapshot_download:
            import huggingface_hub
            huggingface_hub.snapshot_download = self.original_snapshot_download
            
        # Clean up temp directory
        self.test_dir.cleanup()
    
    def test_initialization(self):
        """Test model manager initialization"""
        self.assertTrue(self.model_manager.initialized)
        self.assertTrue(self.model_manager.registry_loaded)
    
    def test_registry_operations(self):
        """Test model registry operations"""
        loop = asyncio.get_event_loop()
        
        # Test saving empty registry
        save_result = loop.run_until_complete(self.model_manager.save_registry())
        self.assertTrue(save_result)
        
        # Check that file was created
        registry_path = os.path.join(self.test_dir.name, "model_registry.json")
        self.assertTrue(os.path.exists(registry_path))
        
        # Test loading registry
        load_result = loop.run_until_complete(self.model_manager.load_registry())
        self.assertTrue(load_result)
    
    def test_list_models(self):
        """Test listing models"""
        loop = asyncio.get_event_loop()
        
        # List models (empty initially)
        models = loop.run_until_complete(self.model_manager.list_models())
        self.assertIsInstance(models, dict)
        self.assertEqual(len(models), 0)
    
    def test_import_model_from_ipfs(self):
        """Test importing a model from IPFS"""
        if not self.model_manager.ipfs_kit:
            self.skipTest("IPFS Kit not available")
            
        loop = asyncio.get_event_loop()
        
        # Add test content to mock IPFS
        content = b"test model content"
        ipfs_result = loop.run_until_complete(self.mock_ipfs_kit.add_to_ipfs(content))
        cid = ipfs_result["cid"]
        
        # Import from IPFS
        model_metadata = loop.run_until_complete(
            self.model_manager.import_model_from_ipfs(self.test_model_id, cid)
        )
        
        # Verify result
        self.assertIsNotNone(model_metadata)
        self.assertEqual(model_metadata.model_id, self.test_model_id)
        self.assertIn(self.test_model_id, model_metadata.cids)
        self.assertEqual(model_metadata.cids[self.test_model_id], cid)
        
        # Verify added to registry
        self.assertIn(self.test_model_id, self.model_manager.model_registry)
    
    def test_import_model_from_huggingface(self):
        """Test importing a model from HuggingFace Hub"""
        if not hasattr(self.model_manager, "hf_api") or not self.model_manager.hf_api:
            self.skipTest("HuggingFace Hub not available")
            
        loop = asyncio.get_event_loop()
        
        # Import from HuggingFace
        model_metadata = loop.run_until_complete(
            self.model_manager.import_model_from_huggingface(self.test_model_id)
        )
        
        # Verify result
        self.assertIsNotNone(model_metadata)
        self.assertEqual(model_metadata.model_id, self.test_model_id)
        self.assertEqual(model_metadata.model_type, "text-generation")
        self.assertTrue(os.path.exists(model_metadata.local_path))
        
        # Verify added to registry
        self.assertIn(self.test_model_id, self.model_manager.model_registry)
        
        # Check that model files were created
        model_dir = os.path.join(self.test_dir.name, self.test_model_id)
        self.assertTrue(os.path.exists(os.path.join(model_dir, "pytorch_model.bin")))
        self.assertTrue(os.path.exists(os.path.join(model_dir, "config.json")))
    
    def test_get_model_info(self):
        """Test getting model info"""
        loop = asyncio.get_event_loop()
        
        # First import a model
        if self.model_manager.ipfs_kit:
            content = b"test model content"
            ipfs_result = loop.run_until_complete(self.mock_ipfs_kit.add_to_ipfs(content))
            cid = ipfs_result["cid"]
            
            loop.run_until_complete(
                self.model_manager.import_model_from_ipfs(self.test_model_id, cid)
            )
        elif hasattr(self.model_manager, "hf_api") and self.model_manager.hf_api:
            loop.run_until_complete(
                self.model_manager.import_model_from_huggingface(self.test_model_id)
            )
        else:
            self.skipTest("Neither IPFS Kit nor HuggingFace Hub available")
        
        # Get model info
        model_info = loop.run_until_complete(
            self.model_manager.get_model_info(self.test_model_id)
        )
        
        # Verify result
        self.assertIsNotNone(model_info)
        self.assertEqual(model_info.model_id, self.test_model_id)
    
    def test_remove_model(self):
        """Test removing a model"""
        loop = asyncio.get_event_loop()
        
        # First import a model
        if self.model_manager.ipfs_kit:
            content = b"test model content"
            ipfs_result = loop.run_until_complete(self.mock_ipfs_kit.add_to_ipfs(content))
            cid = ipfs_result["cid"]
            
            loop.run_until_complete(
                self.model_manager.import_model_from_ipfs(self.test_model_id, cid)
            )
        elif hasattr(self.model_manager, "hf_api") and self.model_manager.hf_api:
            loop.run_until_complete(
                self.model_manager.import_model_from_huggingface(self.test_model_id)
            )
        else:
            self.skipTest("Neither IPFS Kit nor HuggingFace Hub available")
        
        # Verify model is in registry
        self.assertIn(self.test_model_id, self.model_manager.model_registry)
        
        # Remove model
        remove_result = loop.run_until_complete(
            self.model_manager.remove_model(self.test_model_id)
        )
        
        # Verify result
        self.assertTrue(remove_result)
        self.assertNotIn(self.test_model_id, self.model_manager.model_registry)
    
    def test_module_test_method(self):
        """Test the module's test method"""
        # Run the test method
        test_results = self.model_manager.test()
        
        # Check structure
        self.assertIn("success", test_results)
        self.assertIn("module", test_results)
        self.assertEqual(test_results["module"], "model_manager")
        
        self.assertIn("initialization", test_results)
        self.assertIn("registry", test_results)
        self.assertIn("list_models", test_results)
        self.assertIn("imports", test_results)
        self.assertIn("capabilities", test_results)
        
        # Test should pass
        self.assertTrue(test_results["success"])


def run_tests(use_mock=True):
    """
    Run the IPFS Model Manager tests
    
    Args:
        use_mock (bool): Whether to use mock implementations for dependencies
        
    Returns:
        dict: Test results in JSON-serializable format
    """
    try:
        # Create a test suite
        test_suite = unittest.TestLoader().loadTestsFromTestCase(TestIPFSModelManager)
        
        # Create a text test runner that captures output
        from io import StringIO
        test_output = StringIO()
        test_runner = unittest.TextTestRunner(stream=test_output, verbosity=2)
        
        # Run the tests
        start_time = datetime.now()
        test_result = test_runner.run(test_suite)
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        # Prepare results
        results = {
            "success": test_result.wasSuccessful(),
            "module": "ipfs_model_manager",
            "timestamp": datetime.now().isoformat(),
            "duration": duration,
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
        with open(os.path.join(os.path.dirname(__file__), "test_ipfs_model_manager_results.json"), "w") as f:
            json.dump(results, f, indent=2)
        
        return results
    except Exception as e:
        logger.error(f"Failed to run IPFS Model Manager tests: {e}")
        return {
            "success": False,
            "module": "ipfs_model_manager",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


async def async_run_tests(use_mock=True):
    """Async wrapper for running tests"""
    return run_tests(use_mock)


if __name__ == "__main__":
    # Run tests and print results
    results = run_tests()
    print(json.dumps(results, indent=2))