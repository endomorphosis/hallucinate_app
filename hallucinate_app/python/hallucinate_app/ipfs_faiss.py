"""
IPFS FAISS Integration Layer

This module serves as an integration layer for the ipfs_faiss_py external module.
It does not implement any core functionality itself but provides standardized testing 
and access to the external module implementations. All principal work should be 
completed within the imported modules.

The module's responsibility is to:
1. Import and provide access to external modules
2. Run comprehensive tests to ensure external modules function correctly
3. Integrate the modules with the resource pool
4. Provide a unified interface for other components to use the FAISS capability
"""

import os
import json
import logging
import asyncio
from pathlib import Path
import importlib.util

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ipfs_faiss_integration")

# Try to import IPFS Kit (for resource pool access)
try:
    from .ipfs_kit import IPFSKit, ipfs_kit
    has_ipfs_kit = True
except ImportError:
    logger.warning("Could not import IPFSKit, some functionality will be limited")
    has_ipfs_kit = False

# Check for the external ipfs_faiss_py module
has_ipfs_faiss_py = False
ipfs_faiss_py_module = None

try:
    # Try dynamic import to avoid hard dependency
    spec = importlib.util.find_spec("ipfs_faiss_py")
    if spec is not None:
        ipfs_faiss_py = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ipfs_faiss_py)
        if hasattr(ipfs_faiss_py, 'IPFSFaissPy'):
            ipfs_faiss_py_module = ipfs_faiss_py
            has_ipfs_faiss_py = True
            logger.info("Successfully imported ipfs_faiss_py module")
        else:
            logger.warning("ipfs_faiss_py module found but does not contain IPFSFaissPy class")
    else:
        logger.warning("ipfs_faiss_py module not found")
except ImportError as e:
    logger.warning(f"Could not import ipfs_faiss_py: {e}")
except Exception as e:
    logger.warning(f"Error initializing ipfs_faiss_py: {e}")


class IPFSFaiss:
    """
    IPFS FAISS Integration Layer
    
    This class serves as a bridge to the external ipfs_faiss_py module,
    forwarding all functionality requests to it after testing its availability.
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the IPFS FAISS integration layer
        
        Args:
            resources (dict): Resources required by the module
            metadata (dict): Metadata for operations
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Track module availability and instances
        self.modules = {
            "ipfs_faiss_py": None
        }
        
        # Initialize ipfs_faiss_py if available
        if has_ipfs_faiss_py:
            try:
                # Create instance of IPFSFaissPy from external module
                self.modules["ipfs_faiss_py"] = ipfs_faiss_py_module.IPFSFaissPy(resources, metadata)
                logger.info("Initialized ipfs_faiss_py module instance")
            except Exception as e:
                logger.error(f"Failed to initialize ipfs_faiss_py: {e}")
        
        # Get IPFS Kit from resources if available
        if has_ipfs_kit:
            if 'ipfsKit' in self.resources:
                self.ipfs_kit = self.resources['ipfsKit']
            else:
                self.ipfs_kit = ipfs_kit
        else:
            self.ipfs_kit = None
        
        # Log initialization status
        active_modules = sum(1 for m in self.modules.values() if m is not None)
        logger.info(f"IPFS FAISS integration initialized with {active_modules} active modules")
    
    async def init(self):
        """
        Initialize the module and its dependencies
        
        Returns:
            bool: True if successful, False otherwise
        """
        results = {
            "ipfs_faiss_py": False
        }
        
        # Initialize ipfs_faiss_py
        if self.modules["ipfs_faiss_py"]:
            try:
                if hasattr(self.modules["ipfs_faiss_py"], "init"):
                    result = await self.modules["ipfs_faiss_py"].init()
                    results["ipfs_faiss_py"] = result is True
                    logger.info(f"ipfs_faiss_py initialization {'successful' if results['ipfs_faiss_py'] else 'failed'}")
                else:
                    logger.warning("ipfs_faiss_py does not have init method")
            except Exception as e:
                logger.error(f"Error initializing ipfs_faiss_py: {e}")
        
        # Success if at least one module initialized
        return any(results.values())
    
    async def _forward_method(self, method_name, *args, **kwargs):
        """
        Forward method call to the appropriate implementation
        
        Args:
            method_name (str): Name of the method to call
            *args: Positional arguments
            **kwargs: Keyword arguments
            
        Returns:
            Any: Result from the called method or error dict
        """
        # Try ipfs_faiss_py first
        if self.modules["ipfs_faiss_py"]:
            try:
                method = getattr(self.modules["ipfs_faiss_py"], method_name, None)
                if method and callable(method):
                    return await method(*args, **kwargs)
                else:
                    logger.warning(f"Method {method_name} not found in ipfs_faiss_py")
            except Exception as e:
                logger.error(f"Error calling {method_name} in ipfs_faiss_py: {e}")
        
        # If we get here, method call failed
        return {"error": f"No working implementation found for {method_name}"}
    
    # Forward standard FAISS operations to external module
    
    async def create_index(self, dimensions, index_type='Flat', options=None):
        """
        Forward create_index call to implementation
        """
        return await self._forward_method("create_index", dimensions, index_type, options)
    
    async def add_vectors(self, index_id, vectors, ids=None):
        """
        Forward add_vectors call to implementation
        """
        return await self._forward_method("add_vectors", index_id, vectors, ids)
    
    async def search(self, index_id, query_vector, k=5, options=None):
        """
        Forward search call to implementation
        """
        return await self._forward_method("search", index_id, query_vector, k, options)
    
    async def save_to_ipfs(self, index_id, options=None):
        """
        Forward save_to_ipfs call to implementation
        """
        return await self._forward_method("save_to_ipfs", index_id, options)
    
    async def load_from_ipfs(self, cid, options=None):
        """
        Forward load_from_ipfs call to implementation
        """
        return await self._forward_method("load_from_ipfs", cid, options)
    
    async def get_index_info(self, index_id):
        """
        Forward get_index_info call to implementation
        
        Args:
            index_id (str): ID of the index to get information about
        
        Returns:
            dict: Index information or error
        """
        return await self._forward_method("get_index_info", index_id)
    
    async def list_indexes(self):
        """
        Forward list_indexes call to implementation
        
        Returns:
            dict: List of indexes and their basic information
        """
        return await self._forward_method("list_indexes")
    
    def test(self):
        """
        Run tests for the IPFS FAISS integration layer
        
        Returns:
            dict: Test results
        """
        try:
            # Create asyncio event loop for async tests
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            results = {
                "success": False,
                "module": "faiss_integration",
                "modules_tested": [],
                "module_results": {},
                "capabilities": {
                    "ipfs_faiss_py": self.modules["ipfs_faiss_py"] is not None,
                    "ipfs_available": self.ipfs_kit is not None
                }
            }
            
            # Test ipfs_faiss_py if available
            if self.modules["ipfs_faiss_py"]:
                try:
                    if hasattr(self.modules["ipfs_faiss_py"], "test"):
                        py_test_result = self.modules["ipfs_faiss_py"].test()
                        results["module_results"]["ipfs_faiss_py"] = py_test_result
                        results["modules_tested"].append("ipfs_faiss_py")
                        logger.info(f"ipfs_faiss_py test complete: {'PASSED' if py_test_result.get('success') else 'FAILED'}")
                    else:
                        logger.warning("ipfs_faiss_py does not have test method")
                        results["module_results"]["ipfs_faiss_py"] = {
                            "success": False,
                            "error": "No test method available"
                        }
                except Exception as e:
                    logger.error(f"Error testing ipfs_faiss_py: {e}")
                    results["module_results"]["ipfs_faiss_py"] = {
                        "success": False,
                        "error": str(e)
                    }
            
            # Overall success - true if at least one module passes tests
            results["success"] = (
                len(results["modules_tested"]) > 0 and
                any(results["module_results"].get(module, {}).get("success", False) 
                    for module in results["modules_tested"])
            )
            
            return results
        except Exception as e:
            logger.error(f"Error in IPFS FAISS integration test: {e}")
            return {
                "success": False,
                "module": "faiss_integration",
                "error": str(e)
            }

# Create default instance
ipfs_faiss = IPFSFaiss()
