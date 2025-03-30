"""
GraphRAG Integration Layer

This module serves as an integration layer for the GraphRAG functionality
provided by the ipfs_datasets_py package. It does not implement any core 
functionality itself but provides standardized testing and access to the 
external module implementation.

The module's responsibility is to:
1. Import and provide access to GraphRAG from ipfs_datasets_py
2. Run comprehensive tests to ensure the GraphRAG functionality works
3. Integrate with the resource pool of the application
4. Provide a unified interface for other components to use GraphRAG
"""

import os
import json
import logging
import asyncio
import time
from pathlib import Path
from typing import Dict, List, Optional, Union, Any, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("graphrag_integration")

# Try to import IPFS Kit
try:
    from .ipfs_kit import IPFSKit, ipfs_kit
    has_ipfs_kit = True
except ImportError:
    logger.warning("Could not import IPFSKit, some functionality will be limited")
    has_ipfs_kit = False

# Try to import IPFS FAISS
try:
    from .ipfs_faiss import IPFSFaiss, ipfs_faiss
    has_ipfs_faiss = True
except ImportError:
    logger.warning("Could not import IPFSFaiss, vector search functionality will be limited")
    has_ipfs_faiss = False

# Try to import ipfs_datasets_py
try:
    import ipfs_datasets_py
    from ipfs_datasets_py import IPFSDatasetsPy
    has_ipfs_datasets_py = True
    
    # Check if GraphRAG is available in ipfs_datasets_py
    has_graphrag = hasattr(ipfs_datasets_py, 'GraphRAG')
    if not has_graphrag:
        logger.warning("GraphRAG not found in ipfs_datasets_py, functionality will be unavailable")
except ImportError:
    logger.warning("Could not import ipfs_datasets_py, GraphRAG functionality will be unavailable")
    has_ipfs_datasets_py = False
    has_graphrag = False

class GraphRAG:
    """
    Integration layer for GraphRAG functionality from ipfs_datasets_py
    """
    
    def __init__(self, resources=None, metadata=None):
        """
        Initialize GraphRAG integration layer
        
        Args:
            resources (dict): Resources required by GraphRAG
            metadata (dict): Metadata for operations
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Get storage directory from metadata or default
        self.storage_dir = self.metadata.get('storage_dir', os.path.join(
            os.path.expanduser('~'), '.cache', 'graphrag'
        ))
        os.makedirs(self.storage_dir, exist_ok=True)
        
        # Initialize modules
        if has_ipfs_kit:
            if 'ipfsKit' in self.resources:
                self.ipfs_kit = self.resources['ipfsKit']
            else:
                self.ipfs_kit = ipfs_kit
        else:
            self.ipfs_kit = None
        
        if has_ipfs_faiss:
            if 'ipfsFaiss' in self.resources:
                self.faiss = self.resources['ipfsFaiss']
            else:
                self.faiss = ipfs_faiss
        else:
            self.faiss = None
        
        # Initialize the GraphRAG implementation from ipfs_datasets_py
        self.graphrag_impl = None
        if has_graphrag:
            try:
                # Update resources for GraphRAG
                graphrag_resources = self.resources.copy()
                if self.ipfs_kit:
                    graphrag_resources['ipfsKit'] = self.ipfs_kit
                if self.faiss:
                    graphrag_resources['ipfsFaiss'] = self.faiss
                
                # Update metadata for GraphRAG
                graphrag_metadata = self.metadata.copy()
                graphrag_metadata['storage_dir'] = self.storage_dir
                
                # Create instance
                self.graphrag_impl = ipfs_datasets_py.GraphRAG(graphrag_resources, graphrag_metadata)
                logger.info("GraphRAG implementation initialized from ipfs_datasets_py")
            except Exception as e:
                logger.error(f"Failed to initialize GraphRAG from ipfs_datasets_py: {e}")
        else:
            logger.warning("GraphRAG implementation not available, using mock implementation")
        
        self.initialized = False
        self.version = "0.1"
        logger.info(f"GraphRAG integration layer initialized with storage={self.storage_dir}")
    
    async def init(self):
        """Initialize GraphRAG and its dependencies"""
        try:
            # Initialize modules
            if self.faiss:
                await self.faiss.init()
            
            # Initialize GraphRAG implementation
            if self.graphrag_impl:
                if hasattr(self.graphrag_impl, 'init'):
                    await self.graphrag_impl.init()
                    logger.info("GraphRAG implementation initialized")
                else:
                    logger.warning("GraphRAG implementation does not have init method")
            
            self.initialized = True
            return True
        except Exception as e:
            logger.error(f"GraphRAG initialization error: {e}")
            return False
    
    async def _forward_method(self, method_name, *args, **kwargs):
        """
        Forward method call to the GraphRAG implementation
        
        Args:
            method_name: Name of the method to call
            *args: Positional arguments to pass
            **kwargs: Keyword arguments to pass
            
        Returns:
            Result from the method or error dict
        """
        if not self.initialized:
            await self.init()
        
        try:
            if self.graphrag_impl:
                method = getattr(self.graphrag_impl, method_name, None)
                if method and callable(method):
                    return await method(*args, **kwargs)
                else:
                    logger.error(f"Method {method_name} not found in GraphRAG implementation")
                    return {"error": f"Method {method_name} not found in GraphRAG implementation"}
            else:
                logger.error("GraphRAG implementation not available")
                return {"error": "GraphRAG implementation not available"}
        except Exception as e:
            logger.error(f"Error calling {method_name}: {e}")
            return {"error": str(e)}
    
    # Forward standard operations to implementation
    
    async def add_document(self, document_id, text, metadata=None):
        """
        Add a document to the graph database
        
        Args:
            document_id: Unique ID for the document
            text: Document text content
            metadata: Optional metadata for the document
            
        Returns:
            Result from the add_document operation
        """
        return await self._forward_method("add_document", document_id, text, metadata)
    
    async def add_node(self, node_id, data, metadata=None, generate_embedding=True):
        """
        Add a node to the graph
        
        Args:
            node_id: Unique ID for the node
            data: Node data (text or other content)
            metadata: Optional metadata for the node
            generate_embedding: Whether to generate an embedding
            
        Returns:
            Result from the add_node operation
        """
        return await self._forward_method("add_node", node_id, data, metadata, generate_embedding)
    
    async def add_edge(self, source_id, target_id, weight=1.0, bidirectional=False):
        """
        Add an edge between nodes
        
        Args:
            source_id: Source node ID
            target_id: Target node ID
            weight: Edge weight
            bidirectional: Whether to add edges in both directions
            
        Returns:
            Result from the add_edge operation
        """
        return await self._forward_method("add_edge", source_id, target_id, weight, bidirectional)
    
    async def query(self, query_text, k=5, search_type="hybrid"):
        """
        Query the graph database
        
        Args:
            query_text: Query text
            k: Number of results to return
            search_type: Search type (vector, hybrid)
            
        Returns:
            Results from the query operation
        """
        return await self._forward_method("query", query_text, k, search_type)
    
    async def vector_search(self, query, k=5):
        """
        Perform vector similarity search
        
        Args:
            query: Query text or embedding
            k: Number of results to return
            
        Returns:
            Results from the vector search
        """
        return await self._forward_method("vector_search", query, k)
    
    async def hybrid_search(self, query, k=5, alpha=0.5):
        """
        Perform hybrid search combining vector similarity and graph traversal
        
        Args:
            query: Query text
            k: Number of results to return
            alpha: Balance between vector similarity and graph importance
            
        Returns:
            Results from the hybrid search
        """
        return await self._forward_method("hybrid_search", query, k, alpha)
    
    async def save_to_disk(self, path=None):
        """
        Save the graph database to disk
        
        Args:
            path: Path to save to or None for default
            
        Returns:
            Result from the save operation
        """
        return await self._forward_method("save_to_disk", path)
    
    async def load_from_disk(self, path):
        """
        Load the graph database from disk
        
        Args:
            path: Path to load from
            
        Returns:
            Result from the load operation
        """
        return await self._forward_method("load_from_disk", path)
    
    async def save_to_ipfs(self):
        """
        Save the graph database to IPFS
        
        Returns:
            Result from the IPFS save operation
        """
        return await self._forward_method("save_to_ipfs")
    
    async def load_from_ipfs(self, cid):
        """
        Load the graph database from IPFS
        
        Args:
            cid: IPFS CID for the database
            
        Returns:
            Result from the IPFS load operation
        """
        return await self._forward_method("load_from_ipfs", cid)
    
    async def get_stats(self):
        """
        Get statistics about the graph database
        
        Returns:
            Statistics dict
        """
        return await self._forward_method("get_stats")

    def test(self):
        """
        Run tests for the GraphRAG integration layer
        
        Returns:
            Dictionary with test results
        """
        try:
            # Run tests using asyncio
            import asyncio
            loop = asyncio.new_event_loop()
            
            results = {
                "success": False,
                "module": "graphrag_integration",
                "initialization": False,
                "implementation_found": self.graphrag_impl is not None,
                "document_operations": False,
                "node_operations": False,
                "vector_search": False,
                "hybrid_search": False,
                "persistence": False,
                "ipfs_integration": False,
                "capabilities": {
                    "graphrag_available": has_graphrag,
                    "ipfs_datasets_py_available": has_ipfs_datasets_py,
                    "faiss_available": self.faiss is not None,
                    "ipfs_available": self.ipfs_kit is not None
                }
            }
            
            # Test initialization
            init_result = loop.run_until_complete(self.init())
            results["initialization"] = init_result
            
            # If GraphRAG implementation is available, test its functionality
            if results["implementation_found"] and results["initialization"]:
                # Test GraphRAG's own test method if available
                if hasattr(self.graphrag_impl, 'test'):
                    impl_test_result = self.graphrag_impl.test()
                    results["implementation_test"] = impl_test_result
                    
                    # If implementation test succeeds, we can use those results
                    if impl_test_result.get("success", False):
                        for key in ["node_operations", "vector_search", "hybrid_search", "persistence", "ipfs_integration"]:
                            if key in impl_test_result:
                                results[key] = impl_test_result[key]
                        
                        results["success"] = True
                        return results
                
                # If no implementation test or it failed, run our own tests
                try:
                    # Test basic document operations
                    doc_id = f"test_doc_{int(time.time())}"
                    doc_result = loop.run_until_complete(
                        self.add_document(doc_id, "This is a test document for GraphRAG", {"test": True})
                    )
                    results["document_operations"] = doc_result is not None and not isinstance(doc_result, dict) and not "error" in str(doc_result)
                    
                    # Test node operations
                    if not results["document_operations"]:
                        # Try direct node operations
                        node_id = f"test_node_{int(time.time())}"
                        node_result = loop.run_until_complete(
                            self.add_node(node_id, "This is a test node", {"test": True})
                        )
                        results["node_operations"] = node_result is not None and not isinstance(node_result, dict) and not "error" in str(node_result)
                
                    # If we have nodes, test search
                    if results["node_operations"] or results["document_operations"]:
                        # Test vector search
                        vector_result = loop.run_until_complete(
                            self.vector_search("test document", 1)
                        )
                        results["vector_search"] = vector_result is not None and not isinstance(vector_result, dict) and not "error" in str(vector_result)
                        
                        # Test hybrid search
                        hybrid_result = loop.run_until_complete(
                            self.hybrid_search("test document", 1)
                        )
                        results["hybrid_search"] = hybrid_result is not None and not isinstance(hybrid_result, dict) and not "error" in str(hybrid_result)
                        
                        # Test persistence
                        save_result = loop.run_until_complete(
                            self.save_to_disk()
                        )
                        results["persistence"] = save_result is not None and not isinstance(save_result, dict) and not "error" in str(save_result)
                        
                        # Test IPFS if available
                        if self.ipfs_kit:
                            ipfs_result = loop.run_until_complete(
                                self.save_to_ipfs()
                            )
                            results["ipfs_integration"] = ipfs_result is not None and not isinstance(ipfs_result, dict) and not "error" in str(ipfs_result)
                except Exception as e:
                    logger.error(f"Error during GraphRAG testing: {e}")
            
            # Update overall success
            results["success"] = (
                results["initialization"] and 
                (results["node_operations"] or results["document_operations"]) and
                results["vector_search"]
            )
            
            return results
        except Exception as e:
            logger.error(f"GraphRAG test failed: {e}")
            return {
                "success": False,
                "module": "graphrag_integration",
                "error": str(e),
                "implementation_found": self.graphrag_impl is not None,
                "capabilities": {
                    "graphrag_available": has_graphrag,
                    "ipfs_datasets_py_available": has_ipfs_datasets_py,
                    "faiss_available": self.faiss is not None,
                    "ipfs_available": self.ipfs_kit is not None
                }
            }

# Create default instance
graphrag = GraphRAG()