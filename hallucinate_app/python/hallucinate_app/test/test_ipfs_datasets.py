"""
IPFS Datasets Tests

This module provides tests for the IPFS Datasets module.
"""

import os
import sys
import json
import asyncio
import unittest
from typing import Dict, Any, Optional
from pathlib import Path

# Adjust import paths if needed
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    from hallucinate_app.ipfs_datasets import IPFSDatasets
except ImportError as e:
    print(f"Error importing IPFSDatasets: {e}")
    sys.exit(1)

# Try to import ipfs_kit
try:
    from hallucinate_app.ipfs_kit_py import IPFSKitPy
    HAVE_IPFS_KIT = True
except ImportError:
    HAVE_IPFS_KIT = False
    print("IPFS Kit not available, some tests will be skipped")


class IPFSDatasetsTests(unittest.TestCase):
    """Test class for IPFS Datasets implementation."""
    
    def setUp(self):
        """Set up test environment."""
        # Create a temporary directory for dataset cache
        self.temp_dir = os.path.join(os.path.dirname(__file__), 'temp_datasets')
        os.makedirs(self.temp_dir, exist_ok=True)
        
        # Create resources dict
        self.resources = {}
        
        # Add IPFS Kit if available
        if HAVE_IPFS_KIT:
            self.ipfs_kit = IPFSKitPy(metadata={"use_mock": True})
            self.resources["ipfs_kit"] = self.ipfs_kit
        
        # Create IPFS Datasets instance
        self.datasets = IPFSDatasets(
            resources=self.resources,
            metadata={"dataset_cache_dir": self.temp_dir}
        )
    
    def tearDown(self):
        """Clean up test environment."""
        # Clean up temporary directory
        import shutil
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_initialization(self):
        """Test initialization of IPFS Datasets."""
        # Run initialization in asyncio event loop
        loop = asyncio.get_event_loop()
        init_result = loop.run_until_complete(self.datasets.init())
        
        # Check that initialization succeeded
        self.assertTrue(init_result)
        self.assertTrue(self.datasets.initialized)
        
        # Check that cache directory was created
        self.assertTrue(os.path.exists(self.temp_dir))
    
    def test_dataset_operations(self):
        """Test dataset operations."""
        # Only run this test if HuggingFace datasets is available
        if not hasattr(self.datasets, 'HAVE_HUGGINGFACE') or not self.datasets.HAVE_HUGGINGFACE:
            self.skipTest("HuggingFace datasets package not available")
        
        # Run in asyncio event loop
        loop = asyncio.get_event_loop()
        
        # Initialize
        loop.run_until_complete(self.datasets.init())
        
        # Test loading a dataset
        load_result = loop.run_until_complete(
            self.datasets.load_dataset("hf-internal-testing/dummy_dataset", "train")
        )
        self.assertTrue(load_result["success"])
        
        # Test listing datasets
        list_result = loop.run_until_complete(self.datasets.list_datasets())
        self.assertTrue(list_result["success"])
        self.assertIn("hf-internal-testing/dummy_dataset:train", list_result["datasets"])
        
        # Test getting dataset info
        info_result = loop.run_until_complete(
            self.datasets.dataset_info("hf-internal-testing/dummy_dataset", "train")
        )
        self.assertTrue(info_result["success"])
        self.assertEqual(info_result["info"]["name"], "hf-internal-testing/dummy_dataset")
    
    def test_integration_with_ipfs_kit(self):
        """Test integration with IPFS Kit."""
        # Skip if IPFS Kit is not available
        if not HAVE_IPFS_KIT:
            self.skipTest("IPFS Kit not available")
        
        # Run in asyncio event loop
        loop = asyncio.get_event_loop()
        
        # Initialize IPFS Kit
        loop.run_until_complete(self.ipfs_kit.init())
        
        # Initialize IPFS Datasets
        loop.run_until_complete(self.datasets.init())
        
        # Verify IPFS Kit is in resources
        self.assertIn("ipfs_kit", self.datasets.resources)
        
        # Test process_dataset functionality
        process_result = loop.run_until_complete(
            self.datasets.process_dataset("hf-internal-testing/dummy_dataset", "train")
        )
        
        # This might fail if ipfs_datasets_py is not available
        if hasattr(self.datasets, 'HAVE_DATASETS') and self.datasets.HAVE_DATASETS:
            self.assertTrue(process_result["success"])
        else:
            self.assertFalse(process_result["success"])
            self.assertIn("ipfs_datasets_py is required", process_result["error"])


async def run_tests() -> Dict[str, Any]:
    """
    Run all IPFS Datasets tests and return results.
    
    Returns:
        Dictionary with test results
    """
    test_results = {
        "success": True,
        "module": "ipfs_datasets",
        "tests": []
    }
    
    try:
        # Create datasets instance with mock IPFS Kit
        resources = {}
        if HAVE_IPFS_KIT:
            ipfs_kit = IPFSKitPy(metadata={"use_mock": True})
            await ipfs_kit.init()
            resources["ipfs_kit"] = ipfs_kit
        
        datasets = IPFSDatasets(
            resources=resources,
            metadata={"dataset_cache_dir": "./temp_datasets"}
        )
        
        # Test initialization
        init_result = await datasets.init()
        test_results["tests"].append({
            "name": "initialization",
            "success": init_result
        })
        
        if not init_result:
            test_results["success"] = False
            return test_results
        
        # Run self-test
        self_test_result = await datasets.test()
        test_results["tests"].append({
            "name": "self_test",
            "success": self_test_result["success"],
            "sub_tests": self_test_result.get("tests", [])
        })
        
        if not self_test_result["success"]:
            test_results["success"] = False
        
        # Test list datasets
        list_result = await datasets.list_datasets()
        test_results["tests"].append({
            "name": "list_datasets",
            "success": list_result["success"]
        })
        
        if not list_result["success"]:
            test_results["success"] = False
        
        # Test dataset processing if available
        if hasattr(datasets, 'HAVE_DATASETS') and datasets.HAVE_DATASETS:
            try:
                process_result = await datasets.process_dataset(
                    "hf-internal-testing/dummy_dataset", 
                    "train"
                )
                
                test_results["tests"].append({
                    "name": "process_dataset",
                    "success": process_result["success"]
                })
                
                if not process_result["success"]:
                    test_results["success"] = False
            except Exception as e:
                test_results["tests"].append({
                    "name": "process_dataset",
                    "success": False,
                    "error": str(e)
                })
                test_results["success"] = False
        
        return test_results
    except Exception as e:
        test_results["success"] = False
        test_results["error"] = str(e)
        return test_results


def test():
    """
    Run tests and return results in JSON format.
    
    Returns:
        JSON string with test results
    """
    # Run tests in asyncio loop
    loop = asyncio.new_event_loop()
    test_results = loop.run_until_complete(run_tests())
    loop.close()
    
    # Clean up temp directory
    import shutil
    temp_dir = "./temp_datasets"
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    
    return json.dumps(test_results, indent=2)


if __name__ == "__main__":
    # Use unittest runner for detailed test output if run directly
    unittest.main()
    
    # Or run async tests and print results
    # print(test())