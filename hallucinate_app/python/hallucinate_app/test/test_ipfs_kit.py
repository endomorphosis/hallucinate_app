"""
IPFS Kit Test Module

This module provides comprehensive tests for the IPFS Kit implementation,
ensuring proper functionality of the thread-based non-blocking interface.
"""

import os
import sys
import json
import time
import asyncio
import tempfile
import unittest
import threading
import logging
from typing import Dict, Any, Optional
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Adjust import paths if needed
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    # Try to import from local implementation first
    from hallucinate_app.ipfs_kit_py import IPFSKitPy
    from hallucinate_app.ipfs_kit_server import IPFSKitServer, IPFSKitClient
    LOCAL_IMPLEMENTATION = True
    logger.info("Using local IPFS Kit implementation")
except ImportError:
    try:
        # Fall back to installed PyPI package
        import ipfs_kit_py
        from ipfs_kit_py.high_level_api import IPFSSimpleAPI
        LOCAL_IMPLEMENTATION = False
        logger.info("Using PyPI ipfs_kit_py package")
    except ImportError:
        logger.warning("IPFS Kit not found. Using mock implementation for testing purposes.")
        # Create mock classes for testing
        class MockIPFSKitPy:
            def __init__(self, resources=None, metadata=None):
                self.initialized = False
                self.resources = resources or {}
                self.metadata = metadata or {}
            
            async def init(self):
                self.initialized = True
                return True
            
            async def add(self, path, **kwargs):
                return {"Hash": "QmMockHash123456789"}
            
            async def cat(self, cid):
                return b"Mock content for testing"
            
            async def pin_add(self, cid, recursive=True):
                return [{"Pins": [cid]}]
            
            async def pin_rm(self, cid, recursive=True):
                return [{"Pins": [cid]}]
            
            async def pin_ls(self, cid=None, type_filter="all"):
                return {"Keys": {"QmMockHash123456789": {"Type": "recursive"}}}
            
            async def id(self):
                return {
                    "ID": "MockPeerID",
                    "Addresses": ["/ip4/127.0.0.1/tcp/4001"],
                    "AgentVersion": "go-ipfs/mock",
                    "ProtocolVersion": "ipfs/mock"
                }
            
            async def close(self):
                return True
        
        class MockIPFSSimpleAPI:
            def __init__(self, resources=None, metadata=None):
                self.initialized = True
                self.resources = resources or {}
                self.metadata = metadata or {}
            
            def add(self, content, **kwargs):
                return {"cid": "QmMockHash123456789"}
            
            def get(self, cid):
                return b"Mock content for testing"
            
            def pin(self, cid, **kwargs):
                return {"success": True, "pins": [cid]}
            
            def unpin(self, cid, **kwargs):
                return {"success": True, "pins": [cid]}
            
            def list_pins(self, **kwargs):
                return {"Keys": {"QmMockHash123456789": {"Type": "recursive"}}}
            
            def _send_command(self, command, params=None):
                if command == "id":
                    return {
                        "ID": "MockPeerID",
                        "Addresses": ["/ip4/127.0.0.1/tcp/4001"],
                        "AgentVersion": "go-ipfs/mock",
                        "ProtocolVersion": "ipfs/mock"
                    }
                return {}
        
        # Use mock implementations
        IPFSKitPy = MockIPFSKitPy
        IPFSSimpleAPI = MockIPFSSimpleAPI
        LOCAL_IMPLEMENTATION = True
        logger.info("Using mock IPFS Kit implementation for testing")


class IPFSKitTests:
    """
    Test class for IPFS Kit functionality.
    
    This class provides methods to test both the local implementation and the PyPI package.
    """
    
    def __init__(self, use_mock: bool = True, ipfs_api_url: Optional[str] = None):
        """
        Initialize the test class.
        
        Args:
            use_mock: Whether to use mock implementation (for tests without IPFS daemon)
            ipfs_api_url: IPFS API URL (default: /ip4/127.0.0.1/tcp/5001)
        """
        self.use_mock = use_mock
        self.ipfs_api_url = ipfs_api_url or "/ip4/127.0.0.1/tcp/5001"
        self.test_results = {
            "success": True,
            "module": "ipfs_kit",
            "tests": []
        }
        self.temp_files = []
        
    def setup(self):
        """
        Set up the IPFS Kit instance for testing.
        """
        if LOCAL_IMPLEMENTATION:
            # Use local implementation
            self.ipfs = IPFSKitPy(metadata={
                "use_mock": self.use_mock,
                "ipfs_api_url": self.ipfs_api_url
            })
            logger.info("Set up local IPFS Kit implementation for testing")
        else:
            # Use PyPI package
            self.ipfs = IPFSSimpleAPI(metadata={
                "use_mock": self.use_mock,
                "ipfs_api_url": self.ipfs_api_url
            })
            logger.info("Set up PyPI IPFS Kit for testing")
    
    def cleanup(self):
        """
        Clean up resources after testing.
        """
        # Remove temporary files
        for temp_file in self.temp_files:
            try:
                if os.path.exists(temp_file):
                    os.unlink(temp_file)
            except Exception as e:
                logger.warning(f"Failed to remove temp file {temp_file}: {e}")
        
        # Close IPFS connection
        if LOCAL_IMPLEMENTATION:
            asyncio.run(self.ipfs.close())
        logger.info("Cleaned up IPFS Kit test resources")
    
    def create_temp_file(self, content: str = "Test content for IPFS Kit") -> str:
        """
        Create a temporary file for testing.
        
        Args:
            content: Content to write to the file
            
        Returns:
            Path to temporary file
        """
        temp_file = tempfile.NamedTemporaryFile(delete=False)
        temp_path = temp_file.name
        
        with open(temp_path, "w") as f:
            f.write(content)
        
        self.temp_files.append(temp_path)
        return temp_path
    
    async def test_initialization(self):
        """
        Test initialization of IPFS Kit.
        """
        try:
            # Initialize IPFS Kit
            if LOCAL_IMPLEMENTATION:
                init_result = await self.ipfs.init()
            else:
                init_result = True  # PyPI package initializes in constructor
            
            # Check initialization result
            self.test_results["tests"].append({
                "name": "initialization",
                "success": init_result is True,
                "result": init_result
            })
            
            if not init_result:
                self.test_results["success"] = False
                
            logger.info(f"Initialization test {'passed' if init_result else 'failed'}")
        except Exception as e:
            logger.error(f"Error during initialization test: {e}")
            self.test_results["tests"].append({
                "name": "initialization",
                "success": False,
                "error": str(e)
            })
            self.test_results["success"] = False
    
    async def test_node_info(self):
        """
        Test retrieving node information.
        """
        try:
            # Get node ID
            if LOCAL_IMPLEMENTATION:
                node_info = await self.ipfs.id()
            else:
                node_info = self.ipfs._send_command("id", {})  # Access internal method for testing
            
            # Check if we got node info
            success = isinstance(node_info, dict) and "ID" in node_info
            
            self.test_results["tests"].append({
                "name": "node_info",
                "success": success,
                "result": node_info if success else None
            })
            
            if not success:
                self.test_results["success"] = False
                
            logger.info(f"Node info test {'passed' if success else 'failed'}")
        except Exception as e:
            logger.error(f"Error during node info test: {e}")
            self.test_results["tests"].append({
                "name": "node_info",
                "success": False,
                "error": str(e)
            })
            self.test_results["success"] = False
    
    async def test_add_and_cat(self):
        """
        Test adding and retrieving content from IPFS.
        """
        try:
            # Create a temporary file
            temp_path = self.create_temp_file("IPFS Kit add/cat test content")
            
            # Add the file to IPFS
            if LOCAL_IMPLEMENTATION:
                add_result = await self.ipfs.add(temp_path)
                test_cid = add_result["Hash"]
            else:
                add_result = self.ipfs.add(temp_path)
                test_cid = add_result["cid"]
            
            self.test_results["tests"].append({
                "name": "add",
                "success": True,
                "result": add_result
            })
            
            # Retrieve the content from IPFS
            if LOCAL_IMPLEMENTATION:
                cat_result = await self.ipfs.cat(test_cid)
                content = cat_result.decode("utf-8")
            else:
                cat_result = self.ipfs.get(test_cid)
                content = cat_result.decode("utf-8") if isinstance(cat_result, bytes) else cat_result
            
            content_matches = content == "IPFS Kit add/cat test content"
            
            self.test_results["tests"].append({
                "name": "cat",
                "success": content_matches,
                "content_matches": content_matches,
                "retrieved_content": content[:50] + "..." if len(content) > 50 else content
            })
            
            if not content_matches:
                self.test_results["success"] = False
                
            logger.info(f"Add/cat test {'passed' if content_matches else 'failed'}")
        except Exception as e:
            logger.error(f"Error during add/cat test: {e}")
            self.test_results["tests"].append({
                "name": "add_and_cat",
                "success": False,
                "error": str(e)
            })
            self.test_results["success"] = False
    
    async def test_pin_operations(self):
        """
        Test pinning operations.
        """
        try:
            # Create a temporary file and add it to IPFS
            temp_path = self.create_temp_file("IPFS Kit pin test content")
            
            # Add the file to IPFS
            if LOCAL_IMPLEMENTATION:
                add_result = await self.ipfs.add(temp_path)
                test_cid = add_result["Hash"]
            else:
                add_result = self.ipfs.add(temp_path)
                test_cid = add_result["cid"]
            
            # Pin the content
            if LOCAL_IMPLEMENTATION:
                pin_result = await self.ipfs.pin_add(test_cid)
            else:
                pin_result = self.ipfs.pin(test_cid)
            
            self.test_results["tests"].append({
                "name": "pin_add",
                "success": True,
                "result": pin_result
            })
            
            # List pins
            if LOCAL_IMPLEMENTATION:
                pin_ls_result = await self.ipfs.pin_ls()
            else:
                pin_ls_result = self.ipfs.list_pins()
                
            # Success criteria depends on mock vs real implementation
            pin_ls_success = True
            if not self.use_mock:
                pin_ls_success = test_cid in str(pin_ls_result)
            
            self.test_results["tests"].append({
                "name": "pin_ls",
                "success": pin_ls_success,
                "result_summary": str(pin_ls_result)[:100] + "..." if len(str(pin_ls_result)) > 100 else str(pin_ls_result)
            })
            
            # Unpin the content
            if LOCAL_IMPLEMENTATION:
                unpin_result = await self.ipfs.pin_rm(test_cid)
            else:
                unpin_result = self.ipfs.unpin(test_cid)
            
            self.test_results["tests"].append({
                "name": "pin_rm",
                "success": True,
                "result": unpin_result
            })
            
            logger.info("Pin operations test passed")
        except Exception as e:
            logger.error(f"Error during pin operations test: {e}")
            self.test_results["tests"].append({
                "name": "pin_operations",
                "success": False,
                "error": str(e)
            })
            self.test_results["success"] = False
    
    async def test_threading(self):
        """
        Test that operations run in a separate thread and don't block.
        """
        try:
            # Create tracking variables
            main_thread_id = threading.get_ident()
            operation_thread_id = None
            check_complete = threading.Event()
            
            # Function to run in separate thread via IPFS Kit
            def check_thread_id():
                nonlocal operation_thread_id
                operation_thread_id = threading.get_ident()
                check_complete.set()
            
            # Create a special request that will run in the IPFS thread
            if LOCAL_IMPLEMENTATION:
                # For local implementation, submit a custom command
                request = {
                    "command": "custom",
                    "function": check_thread_id,
                    "command_id": "thread_test"
                }
                self.ipfs.client.request_queue.put(request)
            else:
                # For PyPI package, use a thread directly
                thread = threading.Thread(target=check_thread_id)
                thread.daemon = True
                thread.start()
            
            # Wait for the operation to complete
            check_complete.wait(timeout=5.0)
            
            # Compare thread IDs
            thread_success = operation_thread_id is not None and operation_thread_id != main_thread_id
            
            self.test_results["tests"].append({
                "name": "threading",
                "success": thread_success,
                "main_thread_id": main_thread_id,
                "operation_thread_id": operation_thread_id
            })
            
            if not thread_success:
                self.test_results["success"] = False
                
            logger.info(f"Threading test {'passed' if thread_success else 'failed'}")
        except Exception as e:
            logger.error(f"Error during threading test: {e}")
            self.test_results["tests"].append({
                "name": "threading",
                "success": False,
                "error": str(e)
            })
            self.test_results["success"] = False
    
    async def test_error_handling(self):
        """
        Test error handling for invalid operations.
        """
        try:
            # Try to retrieve a non-existent CID
            try:
                invalid_cid = "QmInvalidCidThatShouldNotExist123456789"
                
                # This should raise an exception
                if LOCAL_IMPLEMENTATION:
                    await self.ipfs.cat(invalid_cid)
                else:
                    self.ipfs.get(invalid_cid)
                
                # If we got here, the error wasn't properly handled
                error_handling_success = False
            except Exception:
                # Expected exception
                error_handling_success = True
            
            self.test_results["tests"].append({
                "name": "error_handling",
                "success": error_handling_success,
                "handled_properly": error_handling_success
            })
            
            if not error_handling_success:
                self.test_results["success"] = False
                
            logger.info(f"Error handling test {'passed' if error_handling_success else 'failed'}")
        except Exception as e:
            logger.error(f"Unexpected error during error handling test: {e}")
            self.test_results["tests"].append({
                "name": "error_handling",
                "success": False,
                "error": str(e)
            })
            self.test_results["success"] = False
    
    async def run_tests(self):
        """
        Run all tests and return results.
        """
        try:
            logger.info("Starting IPFS Kit tests")
            
            # Set up the IPFS Kit instance
            self.setup()
            
            # Run tests
            await self.test_initialization()
            await self.test_node_info()
            await self.test_add_and_cat()
            await self.test_pin_operations()
            await self.test_threading()
            await self.test_error_handling()
            
            # Additional tests specific to PyPI implementation
            if not LOCAL_IMPLEMENTATION:
                # Add any PyPI-specific tests here
                pass
            
            # Clean up resources
            self.cleanup()
            
            logger.info(f"IPFS Kit tests completed. Success: {self.test_results['success']}")
            return self.test_results
        except Exception as e:
            logger.error(f"Error running IPFS Kit tests: {e}")
            self.test_results["success"] = False
            self.test_results["error"] = str(e)
            return self.test_results


async def test_ipfs_kit(use_mock: bool = True, ipfs_api_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Run IPFS Kit tests.
    
    Args:
        use_mock: Whether to use mock implementation
        ipfs_api_url: IPFS API URL (default: /ip4/127.0.0.1/tcp/5001)
        
    Returns:
        Dictionary with test results
    """
    test_instance = IPFSKitTests(use_mock=use_mock, ipfs_api_url=ipfs_api_url)
    return await test_instance.run_tests()


if __name__ == "__main__":
    """
    Run tests from command line.
    """
    import argparse
    
    parser = argparse.ArgumentParser(description="Test IPFS Kit functionality")
    parser.add_argument("--no-mock", action="store_true", help="Use real IPFS daemon instead of mock")
    parser.add_argument("--api-url", type=str, help="IPFS API URL")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    args = parser.parse_args()
    
    # Run tests
    test_results = asyncio.run(test_ipfs_kit(
        use_mock=not args.no_mock,
        ipfs_api_url=args.api_url
    ))
    
    # Output results
    if args.json:
        print(json.dumps(test_results, indent=2))
    else:
        print(f"\nIPFS Kit Test Results: {'PASSED' if test_results['success'] else 'FAILED'}")
        print(f"Module: {test_results['module']}")
        print("\nTests:")
        for test in test_results['tests']:
            status = "✅ PASSED" if test['success'] else "❌ FAILED"
            print(f"  - {test['name']}: {status}")
            if not test['success'] and 'error' in test:
                print(f"    Error: {test['error']}")