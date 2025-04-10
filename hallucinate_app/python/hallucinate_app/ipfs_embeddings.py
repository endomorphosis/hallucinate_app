"""
IPFS Embeddings Integration Layer

This module serves as an integration layer for the ipfs_embeddings_py external module.
It does not implement any core functionality itself but provides standardized testing 
and access to the external module implementations. All principal work should be 
completed within the imported modules.

The module's responsibility is to:
1. Import and provide access to external modules
2. Run comprehensive tests to ensure external modules function correctly
3. Integrate the modules with the resource pool
4. Provide a unified interface for other components to use the embeddings capability
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
logger = logging.getLogger("ipfs_embeddings_integration")

# Try to import IPFS Kit (for resource pool access)
try:
    from .ipfs_kit import IPFSKit, ipfs_kit
    has_ipfs_kit = True
except ImportError:
    logger.warning("Could not import IPFSKit, some functionality will be limited")
    has_ipfs_kit = False

# Check for the external ipfs_embeddings_py module
has_ipfs_embeddings_py = False
ipfs_embeddings_py_module = None

try:
    # Try dynamic import to avoid hard dependency
    spec = importlib.util.find_spec("ipfs_embeddings_py")
    if spec is not None:
        ipfs_embeddings_py = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ipfs_embeddings_py)
        if hasattr(ipfs_embeddings_py, 'IPFSEmbeddingsPy'):
            ipfs_embeddings_py_module = ipfs_embeddings_py
            has_ipfs_embeddings_py = True
            logger.info("Successfully imported ipfs_embeddings_py module")
        else:
            logger.warning("ipfs_embeddings_py module found but does not contain IPFSEmbeddingsPy class")
    else:
        logger.warning("ipfs_embeddings_py module not found")
except ImportError as e:
    logger.warning(f"Could not import ipfs_embeddings_py: {e}")
except Exception as e:
    logger.warning(f"Error initializing ipfs_embeddings_py: {e}")


class IPFSEmbeddings:
    """
    IPFS Embeddings Integration Layer
    
    This class serves as a bridge to the external ipfs_embeddings_py module,
    forwarding all functionality requests to it after testing its availability.
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize the IPFS Embeddings integration layer
        
        Args:
            resources (dict): Resources required by the module
            metadata (dict): Metadata for operations
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Track module availability and instances
        self.modules = {
            "ipfs_embeddings_py": None
        }
        
        # Initialize ipfs_embeddings_py if available
        if has_ipfs_embeddings_py:
            try:
                # Create instance of IPFSEmbeddingsPy from external module
                self.modules["ipfs_embeddings_py"] = ipfs_embeddings_py_module.IPFSEmbeddingsPy(resources, metadata)
                logger.info("Initialized ipfs_embeddings_py module instance")
            except Exception as e:
                logger.error(f"Failed to initialize ipfs_embeddings_py: {e}")
        
        # Get IPFS Kit from resources if available
        if has_ipfs_kit:
            if 'ipfsKit' in self.resources:
                self.ipfs_kit = self.resources['ipfsKit']
            else:
                self.ipfs_kit = ipfs_kit
        else:
            self.ipfs_kit = None
        
        # Get cache directory from metadata (for logging)
        self.cache_dir = self.metadata.get('cache_dir', os.path.join(
            os.path.expanduser('~'), '.cache', 'embeddings'
        ))
        
        # Log initialization status
        active_modules = sum(1 for m in self.modules.values() if m is not None)
        logger.info(f"IPFS Embeddings integration initialized with {active_modules} active modules")
        logger.info(f"Cache directory: {self.cache_dir}")
    
    async def init(self):
        """
        Initialize the module and its dependencies
        
        Returns:
            bool: True if successful, False otherwise
        """
        results = {
            "ipfs_embeddings_py": False
        }
        
        # Initialize ipfs_embeddings_py
        if self.modules["ipfs_embeddings_py"]:
            try:
                if hasattr(self.modules["ipfs_embeddings_py"], "init"):
                    result = await self.modules["ipfs_embeddings_py"].init()
                    results["ipfs_embeddings_py"] = result is True
                    logger.info(f"ipfs_embeddings_py initialization {'successful' if results['ipfs_embeddings_py'] else 'failed'}")
                else:
                    logger.warning("ipfs_embeddings_py does not have init method")
            except Exception as e:
                logger.error(f"Error initializing ipfs_embeddings_py: {e}")
        
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
        # Try ipfs_embeddings_py first
        if self.modules["ipfs_embeddings_py"]:
            try:
                method = getattr(self.modules["ipfs_embeddings_py"], method_name, None)
                if method and callable(method):
                    return await method(*args, **kwargs)
                else:
                    logger.warning(f"Method {method_name} not found in ipfs_embeddings_py")
            except Exception as e:
                logger.error(f"Error calling {method_name} in ipfs_embeddings_py: {e}")
        
        # If we get here, method call failed
        return {"error": f"No working implementation found for {method_name}"}
    
    # Forward standard embedding operations to external module
    
    async def generate_embedding(self, text, options=None):
        """
        Forward generate_embedding call to implementation
        """
        options = options or {}
        return await self._forward_method("generate_embedding", text, options)
    
    async def compare_similarity(self, embedding1, embedding2, metric='cosine'):
        """
        Forward compare_similarity call to implementation
        """
        return await self._forward_method("compare_similarity", embedding1, embedding2, metric)
    
    async def search_similar(self, query, embeddings, options=None):
        """
        Forward search_similar call to implementation
        """
        options = options or {}
        return await self._forward_method("search_similar", query, embeddings, options)
    
    async def save_embeddings_to_ipfs(self, embeddings, options=None):
        """
        Forward save_embeddings_to_ipfs call to implementation
        
        Args:
            embeddings (list): List of embeddings to save
            options (dict): Options for the save operation
        
        Returns:
            dict: Result with IPFS CID or error
        """
        options = options or {}
        return await self._forward_method("save_embeddings_to_ipfs", embeddings, options)
    
    async def load_embeddings_from_ipfs(self, cid, options=None):
        """
        Forward load_embeddings_from_ipfs call to implementation
        
        Args:
            cid (str): IPFS CID to load embeddings from
            options (dict): Options for the load operation
        
        Returns:
            dict: Result with embeddings or error
        """
        options = options or {}
        return await self._forward_method("load_embeddings_from_ipfs", cid, options)
    
    def test(self):
        """
        Run tests for the IPFS Embeddings integration layer
        
        Returns:
            dict: Test results
        """
        try:
            # Create asyncio event loop for async tests
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            results = {
                "success": False,
                "module": "embeddings_integration",
                "modules_tested": [],
                "module_results": {},
                "capabilities": {
                    "ipfs_embeddings_py": self.modules["ipfs_embeddings_py"] is not None,
                    "ipfs_available": self.ipfs_kit is not None
                },
                "metadata": self.metadata
            }
            
            # Test ipfs_embeddings_py if available
            if self.modules["ipfs_embeddings_py"]:
                try:
                    if hasattr(self.modules["ipfs_embeddings_py"], "test"):
                        py_test_result = self.modules["ipfs_embeddings_py"].test()
                        results["module_results"]["ipfs_embeddings_py"] = py_test_result
                        results["modules_tested"].append("ipfs_embeddings_py")
                        logger.info(f"ipfs_embeddings_py test complete: {'PASSED' if py_test_result.get('success') else 'FAILED'}")
                    else:
                        logger.warning("ipfs_embeddings_py does not have test method")
                        results["module_results"]["ipfs_embeddings_py"] = {
                            "success": False,
                            "error": "No test method available"
                        }
                except Exception as e:
                    logger.error(f"Error testing ipfs_embeddings_py: {e}")
                    results["module_results"]["ipfs_embeddings_py"] = {
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
            logger.error(f"Error in IPFS Embeddings integration test: {e}")
            return {
                "success": False,
                "module": "embeddings_integration",
                "error": str(e),
                "capabilities": {
                    "ipfs_embeddings_py": self.modules["ipfs_embeddings_py"] is not None,
                    "ipfs_available": self.ipfs_kit is not None
                },
                "metadata": self.metadata
            }

# Create default instance
ipfs_embeddings = IPFSEmbeddings()
